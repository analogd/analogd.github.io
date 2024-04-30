/**
 * Composable Graph Component
 *
 * Thin wrapper around Chart.js that takes data layers and renders them.
 * Each layer is just {data: [{x, y}], ...options}
 *
 * Usage:
 *   const graph = new Graph('canvasId', { yLabel: 'SPL (dB)', yMin: 80, yMax: 130 });
 *   graph.setLayers([
 *     { data: thermalCurve, label: 'Thermal', color: '#f85149', dashed: true },
 *     { data: excursionCurve, label: 'Excursion', color: '#f0883e', dashed: true },
 *     { data: maxSplCurve, label: 'Max SPL', color: '#58a6ff' }
 *   ]);
 *
 * Frequency Range:
 *   Frequency-domain graphs (xLog: true) automatically use the shared frequency range.
 *   Set Graph.getFrequencyRange = () => ({ min, max }) to configure.
 *   Override with explicit xMin/xMax in constructor options if needed.
 */

// Shared frequency range accessor - set by app.js
// Returns { min: number, max: number }
let frequencyRangeGetter = () => ({ min: 10, max: 200 });

/**
 * Set the shared frequency range getter
 * Call this once from app.js to wire up state access
 */
export function setFrequencyRangeGetter(getter) {
    frequencyRangeGetter = getter;
}

// ============================================================================
// SYNCHRONIZED CROSSHAIR - Datadog-style linked hover across graphs
// ============================================================================

// Registry of all Graph instances, grouped by x-axis type
const graphRegistry = {
    frequency: new Set(),    // xLog: true (default)
    linear: new Set(),       // xLog: false (time domain, displacement)
    power: new Set()         // SPL vs Power graph
};

// Current crosshair state
let crosshairState = {
    x: null,           // X value in data units (Hz, ms, W, etc.)
    axisType: null,    // 'frequency' | 'linear' | 'power'
    sourceId: null     // Canvas ID of the graph being hovered
};

/**
 * Get axis type for a graph based on its options
 */
function getAxisType(options) {
    if (options.xLabel?.includes('Power')) return 'power';
    if (options.xLog === false) return 'linear';
    return 'frequency';
}

/**
 * Update crosshair position - called on mousemove
 */
function updateCrosshair(x, axisType, sourceId) {
    crosshairState = { x, axisType, sourceId };
    // Trigger redraw on all graphs of same axis type (except source)
    const registry = graphRegistry[axisType];
    if (registry) {
        registry.forEach(graph => {
            if (graph.canvasId !== sourceId && graph.chart) {
                graph.chart.draw();
            }
        });
    }
}

/**
 * Clear crosshair - called on mouseleave
 */
function clearCrosshair() {
    const prevType = crosshairState.axisType;
    crosshairState = { x: null, axisType: null, sourceId: null };
    // Trigger redraw to remove lines
    if (prevType && graphRegistry[prevType]) {
        graphRegistry[prevType].forEach(graph => {
            if (graph.chart) graph.chart.draw();
        });
    }
}

/**
 * Chart.js plugin for drawing synchronized crosshair
 */
const crosshairPlugin = {
    id: 'syncedCrosshair',
    afterDraw(chart) {
        const graph = chart._graphInstance;
        if (!graph || !crosshairState.x) return;

        const axisType = getAxisType(graph.options);
        // Only draw if same axis type and not the source graph
        if (axisType !== crosshairState.axisType) return;
        if (graph.canvasId === crosshairState.sourceId) return;

        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        if (!xScale || !yScale) return;

        // Convert data value to pixel position
        const xPixel = xScale.getPixelForValue(crosshairState.x);

        // Check if x is within visible range
        if (xPixel < xScale.left || xPixel > xScale.right) return;

        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#6e7681';
        ctx.lineWidth = 1;
        ctx.moveTo(xPixel, yScale.top);
        ctx.lineTo(xPixel, yScale.bottom);
        ctx.stroke();
        ctx.restore();
    }
};

// Register the plugin globally
Chart.register(crosshairPlugin);

// Color palette
export const COLORS = {
    primary: '#58a6ff',      // Blue - main curves
    thermal: '#f85149',      // Red - thermal limits
    excursion: '#f0883e',    // Orange - excursion limits
    actual: '#39d353',       // Green - actual/achievable
    secondary: '#bc8cff',    // Purple - secondary data
    reference: '#6e7681',    // Gray - reference lines
    xmax: '#ff6b6b'          // Red - Xmax line
};

export class Graph {
    constructor(canvasId, options = {}) {
        this.canvasId = canvasId;
        // Track if xMin/xMax were explicitly provided
        this._explicitXMin = 'xMin' in options;
        this._explicitXMax = 'xMax' in options;
        this.options = {
            xLabel: 'Frequency (Hz)',
            yLabel: 'dB',
            xMin: 10,
            xMax: 200,
            yMin: null,       // Auto if null (hard limit)
            yMax: null,       // Auto if null (hard limit)
            ySuggestedMin: null,  // Soft limit - expands if data needs it
            ySuggestedMax: null,  // Soft limit - expands if data needs it
            xLog: true,       // Logarithmic X axis (standard for audio)
            ...options
        };
        this.chart = null;
        this.layers = [];
        this.hiddenLabels = new Set();  // Track which datasets are hidden by label
        this._crosshairHandlers = null;  // Store event handlers for cleanup

        // Register for synchronized crosshair
        const axisType = getAxisType(this.options);
        graphRegistry[axisType].add(this);
    }

    /**
     * Resolve option value - supports functions for dynamic values
     * For frequency-domain graphs (xLog: true), xMin/xMax default to shared range
     */
    _resolve(key) {
        // For frequency graphs without explicit x range, use shared frequency range
        if (this.options.xLog && (key === 'xMin' || key === 'xMax')) {
            const explicit = key === 'xMin' ? this._explicitXMin : this._explicitXMax;
            if (!explicit) {
                const range = frequencyRangeGetter();
                return key === 'xMin' ? range.min : range.max;
            }
        }
        const val = this.options[key];
        return typeof val === 'function' ? val() : val;
    }

    /**
     * Set all layers and render
     * @param {Array} layers - Array of layer objects
     */
    setLayers(layers) {
        this.layers = layers;

        // Empty graph detection - warn if graph should have data but doesn't
        // Skip N/A placeholders (those are intentionally sparse)
        const dataLayers = layers.filter(l => !l.label?.startsWith('N/A'));
        if (dataLayers.length > 0) {
            const hasData = dataLayers.some(l => l.data?.length > 2);
            if (!hasData && !this._warnedEmpty) {
                console.warn(`Graph '${this.canvasId}' rendered with no data (${dataLayers.length} layers, all empty or <3 points)`);
                this._warnedEmpty = true;
            } else if (hasData) {
                this._warnedEmpty = false;  // Reset if data appears
            }
        }

        this._render();
    }

    /**
     * Add a single layer
     */
    addLayer(layer) {
        this.layers.push(layer);
        this._render();
    }

    /**
     * Clear all layers
     */
    clear() {
        this.layers = [];
        this._render();
    }

    /**
     * Update options and re-render
     */
    setOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        this._render();
    }

    /**
     * Destroy the chart
     */
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    /**
     * Internal: Convert layer to Chart.js dataset
     *
     * Fill options:
     * - false: no fill
     * - true: fill to x-axis
     * - 'origin': fill to y=0
     * - {target: 'origin', above: '#color', below: '#color'}: split fill at y=0
     * - {target: number, above: '#color', below: '#color'}: split fill at y=number
     */
    _layerToDataset(layer, index) {
        const {
            data,
            label = `Layer ${index}`,
            color = COLORS.primary,
            dashed = false,
            width = 2,
            fill = false,
            fillTarget = null,      // 'origin', number, or dataset index
            fillAbove = null,       // Color for area above target
            fillBelow = null,       // Color for area below target
            yKey = 'y',             // Which property to use for Y value
            hidden = false,
            showInLegend = true,
            order = index
        } = layer;

        // Normalize data to {x, y} format
        const normalizedData = data.map(point => ({
            x: point.frequency || point.x,
            y: point[yKey] !== undefined ? point[yKey] : point.y
        }));

        // Preserve hidden state from legend clicks
        const isHidden = hidden || this.hiddenLabels.has(label);

        // Build fill configuration
        let fillConfig = fill;
        if (fillTarget !== null && (fillAbove || fillBelow)) {
            // Use Chart.js segment styling for split fills
            fillConfig = {
                target: fillTarget,
                above: fillAbove || 'transparent',
                below: fillBelow || 'transparent'
            };
        } else if (fill && typeof fill === 'boolean') {
            fillConfig = fill ? 'origin' : false;
        }

        return {
            label,
            data: normalizedData,
            borderColor: color,
            backgroundColor: fill && !fillAbove && !fillBelow ? color + '20' : 'transparent',
            borderWidth: width,
            borderDash: dashed ? [5, 5] : [],
            pointRadius: 0,
            tension: 0.2,
            fill: fillConfig,
            hidden: isHidden,
            order,
            // Hide from legend if specified
            ...(showInLegend === false && { label: '' })
        };
    }

    /**
     * Internal: Render the chart
     */
    _render() {
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) {
            console.warn(`Graph: Canvas '${this.canvasId}' not found`);
            return;
        }

        // Destroy existing chart
        if (this.chart) {
            this.chart.destroy();
        }

        const ctx = canvas.getContext('2d');
        const datasets = this.layers.map((layer, i) => this._layerToDataset(layer, i));

        // Calculate Y bounds
        // Hard limits (yMin/yMax) override everything - data will be clipped
        // Suggested limits (ySuggestedMin/ySuggestedMax) set a floor - scale expands if data needs more
        // When using suggested limits, reference lines (dashed) are excluded from auto-scaling
        const yMin = this.options.yMin;
        const yMax = this.options.yMax;
        const ySuggestedMin = this.options.ySuggestedMin;
        const ySuggestedMax = this.options.ySuggestedMax;

        let computedYMin = yMin;
        let computedYMax = yMax;

        if (computedYMin === null || computedYMax === null) {
            // When using suggested limits, exclude dashed (reference) lines from scaling
            const usingSuggested = ySuggestedMin !== null || ySuggestedMax !== null;
            const datasetsForScale = usingSuggested
                ? datasets.filter((ds, i) => !this.layers[i]?.dashed)
                : datasets;

            const allY = datasetsForScale.flatMap(ds => ds.data.map(p => p.y)).filter(y => isFinite(y));
            if (allY.length > 0) {
                const dataMin = Math.min(...allY);
                const dataMax = Math.max(...allY);
                const padding = (dataMax - dataMin) * 0.1;
                const dataYMin = Math.floor(dataMin - padding);
                const dataYMax = Math.ceil(dataMax + padding);

                // Apply suggested limits as floor/ceiling that data can expand beyond
                // suggestedMax: use max(dataNeeds, suggested) - data can push higher
                // suggestedMin: use min(dataNeeds, suggested) - data can push lower
                computedYMin = computedYMin ?? (ySuggestedMin !== null ? Math.min(dataYMin, ySuggestedMin) : dataYMin);
                computedYMax = computedYMax ?? (ySuggestedMax !== null ? Math.max(dataYMax, ySuggestedMax) : dataYMax);
            } else {
                // No data - use suggested limits if available
                computedYMin = computedYMin ?? ySuggestedMin;
                computedYMax = computedYMax ?? ySuggestedMax;
            }
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,  // Disable for real-time updates
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    x: {
                        type: this._resolve('xLog') ? 'logarithmic' : 'linear',
                        title: { display: true, text: this._resolve('xLabel') },
                        min: this._resolve('xMin'),
                        max: this._resolve('xMax'),
                        grid: { color: '#30363d' },
                        // For logarithmic frequency graphs: grid lines at all decade subdivisions (like REW)
                        // Grid at: 10, 20, 30, 40... 100, 200, 300... Labels only at key frequencies
                        ...(this._resolve('xLog') && {
                            afterBuildTicks: (axis) => {
                                const min = axis.min;
                                const max = axis.max;
                                const ticks = [];
                                for (let decade = 1; decade <= 10000; decade *= 10) {
                                    for (let i = 1; i <= 9; i++) {
                                        const v = decade * i;
                                        if (v >= min && v <= max) {
                                            ticks.push({ value: v });
                                        }
                                    }
                                }
                                if (max >= 10000 && 10000 >= min) ticks.push({ value: 10000 });
                                if (max >= 20000 && 20000 >= min) ticks.push({ value: 20000 });
                                axis.ticks = ticks;
                            },
                            ticks: {
                                callback: function(value) {
                                    // Labels only at key frequencies: 10, 20, 50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k
                                    const labeled = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
                                    if (labeled.includes(value)) {
                                        return value >= 1000 ? (value/1000) + 'k' : value;
                                    }
                                    return '';  // Grid line but no label
                                }
                            }
                        })
                    },
                    y: {
                        title: { display: true, text: this.options.yLabel },
                        min: yMin ?? computedYMin,
                        max: yMax ?? computedYMax,
                        grid: { color: '#30363d' }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            boxWidth: 8,
                            font: { size: 11 },
                            color: '#c9d1d9'
                        },
                        // Track hidden state so it persists across re-renders
                        onClick: (e, legendItem, legend) => {
                            const label = legendItem.text;
                            const index = legendItem.datasetIndex;
                            const meta = legend.chart.getDatasetMeta(index);

                            // Toggle visibility
                            meta.hidden = !meta.hidden;

                            // Track in our Set so it persists across re-renders
                            if (meta.hidden) {
                                this.hiddenLabels.add(label);
                            } else {
                                this.hiddenLabels.delete(label);
                            }

                            legend.chart.update();
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                // Extract unit from xLabel (e.g., "Frequency (Hz)" → "Hz", "Time (ms)" → "ms")
                                const xLabel = this._resolve('xLabel');
                                const match = xLabel.match(/\(([^)]+)\)/);
                                const unit = match ? match[1] : '';
                                return `${items[0].parsed.x.toFixed(1)} ${unit}`;
                            },
                            label: (context) => {
                                const val = context.parsed.y;
                                return `${context.dataset.label}: ${val.toFixed(1)}`;
                            }
                        }
                    }
                }
            }
        });

        // Store reference for crosshair plugin
        this.chart._graphInstance = this;

        // Setup crosshair sync events (only once per canvas)
        if (!this._crosshairHandlers) {
            const axisType = getAxisType(this.options);
            const onMouseMove = (e) => {
                if (!this.chart) return;
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const xScale = this.chart.scales.x;
                if (xScale && x >= xScale.left && x <= xScale.right) {
                    const xValue = xScale.getValueForPixel(x);
                    updateCrosshair(xValue, axisType, this.canvasId);
                }
            };
            const onMouseLeave = () => clearCrosshair();

            canvas.addEventListener('mousemove', onMouseMove);
            canvas.addEventListener('mouseleave', onMouseLeave);
            this._crosshairHandlers = { onMouseMove, onMouseLeave };
        }
    }
}

// ============================================================================
// REFERENCE LINE HELPERS - Reduce boilerplate in graph update functions
// ============================================================================

/**
 * Create a horizontal reference line layer
 * @param {number} y - Y value for the line
 * @param {string} label - Label text
 * @param {number} xMin - Start X (uses shared frequency range if not specified)
 * @param {number} xMax - End X (uses shared frequency range if not specified)
 */
export function refLine(y, label, xMin, xMax) {
    // Use shared frequency range by default
    const range = frequencyRangeGetter();
    const x1 = xMin ?? range.min;
    const x2 = xMax ?? range.max;
    return {
        data: [{ x: x1, y }, { x: x2, y }],
        label,
        color: COLORS.reference,
        dashed: true,
        width: 1
    };
}

/** 0 dB reference line - uses shared frequency range by default */
export function zeroDbLine(xMin, xMax) {
    const range = frequencyRangeGetter();
    return refLine(0, '0 dB', xMin ?? range.min, xMax ?? range.max);
}

/** Zero line (for time domain, etc.) */
export function zeroLine(xMin = 0, xMax = 100) {
    return {
        data: [{ x: xMin, y: 0 }, { x: xMax, y: 0 }],
        label: 'Zero',
        color: COLORS.reference,
        dashed: true,
        width: 1
    };
}

/**
 * Create an "N/A" placeholder layer for unsupported features
 * @param {string} reason - Why it's not available (e.g., "ported box")
 * @param {number} xMax - X range end
 */
export function naPlaceholder(reason, xMax = 100) {
    return {
        data: [{ x: 0, y: 0 }, { x: xMax, y: 0 }],
        label: `N/A (${reason})`,
        color: COLORS.reference,
        dashed: true
    };
}

export default Graph;
