// graphs.js - Chart.js wrapper functions

const GraphManager = {
    charts: {},

    // Initialize all charts
    init() {
        Chart.defaults.color = '#8b949e';
        Chart.defaults.borderColor = '#30363d';
        Chart.defaults.backgroundColor = '#1c2128';
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        Chart.defaults.font.size = 12;
    },

    // Unified Frequency Response Graph (single graph shows everything)
    // This is the NEW simplified approach - shows FR with toggleable limit lines
    createUnifiedFrequencyResponse(canvasId, graphData) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');

        // Build scales config
        const scalesConfig = {
            x: {
                type: 'logarithmic',
                title: { display: true, text: 'Frequency (Hz)' },
                grid: { color: '#30363d' },
                min: 10,
                max: 200
            },
            y: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'SPL (dB @ 1m)' },
                grid: { color: '#30363d' }
            }
        };

        // Add secondary Y-axis if mode is power or excursion
        if (graphData.secondaryMode === 'power') {
            scalesConfig.y2 = {
                type: 'linear',
                position: 'right',
                title: { display: true, text: 'Max Power (W)' },
                grid: { drawOnChartArea: false },
                ticks: { color: '#d29922' }
            };
        } else if (graphData.secondaryMode === 'excursion') {
            scalesConfig.y2 = {
                type: 'linear',
                position: 'right',
                title: { display: true, text: 'Excursion (mm)' },
                grid: { drawOnChartArea: false },
                ticks: { color: '#bc8cff' }
            };
        }

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: { datasets: graphData.datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: scalesConfig,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            boxWidth: 6,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const yAxisID = context.dataset.yAxisID || 'y';
                                let suffix = 'dB';
                                if (yAxisID === 'y2') {
                                    suffix = graphData.secondaryMode === 'power' ? 'W' : 'mm';
                                }
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)} ${suffix}`;
                            },
                            title: (items) => {
                                return `${items[0].parsed.x.toFixed(1)} Hz`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Helper: Check if input is array of designs (new format) or legacy format
    _isMultiDesignFormat(data) {
        return Array.isArray(data) && data.length > 0 && data[0].hasOwnProperty('name');
    },

    // Helper: Convert multi-design format to Chart.js datasets for frequency response
    _prepareFrequencyResponseDatasets(designs) {
        const allDatasets = [];

        designs.forEach(design => {
            if (!design.results || !design.results.frequencyResponse) return;

            // For each power level in this design
            design.results.frequencyResponse.forEach((powerCurve, idx) => {
                const isMainPower = idx === design.results.frequencyResponse.length - 1;
                allDatasets.push({
                    label: `${design.name} - ${powerCurve.power}W`,
                    data: powerCurve.frequencies.map((freq, i) => ({
                        x: freq,
                        y: powerCurve.spl[i]
                    })),
                    borderColor: design.color,
                    backgroundColor: 'transparent',
                    borderWidth: isMainPower ? 2.5 : 1.5,  // Main power thicker
                    borderDash: isMainPower ? [] : [5, 5],  // Lower powers dashed
                    pointRadius: 0,
                    tension: 0.1,
                    opacity: isMainPower ? 1 : 0.6
                });
            });
        });

        return allDatasets;
    },

    // Helper: Convert multi-design format to Chart.js datasets for max power
    _prepareMaxPowerDatasets(designs) {
        const allDatasets = [];

        designs.forEach(design => {
            if (!design.results || !design.results.maxPower) return;

            const data = design.results.maxPower;
            const excursionData = [];
            const thermalData = [];

            data.forEach(point => {
                const dataPoint = { x: point.frequency, y: point.maxPower };
                if (point.limitingFactor === 'excursion') {
                    excursionData.push(dataPoint);
                    thermalData.push({ x: point.frequency, y: null });
                } else {
                    thermalData.push(dataPoint);
                    excursionData.push({ x: point.frequency, y: null });
                }
            });

            // Add excursion limit curve
            allDatasets.push({
                label: `${design.name} - Excursion`,
                data: excursionData,
                borderColor: design.color,
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 5],  // Dashed for excursion
                pointRadius: 0,
                tension: 0.1,
                spanGaps: true
            });

            // Add thermal limit curve (lighter shade)
            const lighterColor = design.color + '80';  // Add alpha
            allDatasets.push({
                label: `${design.name} - Thermal`,
                data: thermalData,
                borderColor: lighterColor,
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.1,
                spanGaps: true
            });
        });

        return allDatasets;
    },

    // Frequency Response Graph (supports both single and multi-design)
    createFrequencyResponse(canvasId, datasets, limits = null, secondaryData = null) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');

        // Check if this is multi-design format
        const chartDatasets = this._isMultiDesignFormat(datasets)
            ? this._prepareFrequencyResponseDatasets(datasets)
            : datasets.map((dataset, idx) => {
                const colors = ['#58a6ff', '#39d353', '#f0883e'];
                return {
                    label: `${dataset.power}W`,
                    data: dataset.frequencies.map((freq, i) => ({
                        x: freq,
                        y: dataset.spl[i]
                    })),
                    borderColor: colors[idx % colors.length],
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y'
                };
            });

        // Add limit lines if provided
        if (limits) {
            if (limits.thermal) {
                chartDatasets.push({
                    label: 'Thermal Limit (Pe, no EQ)',
                    data: limits.thermal.frequencies.map((freq, i) => ({
                        x: freq,
                        y: limits.thermal.spl[i]
                    })),
                    borderColor: '#f0883e',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y'
                });
            }

            if (limits.thermalFlat) {
                chartDatasets.push({
                    label: 'Thermal Limit (with EQ boost)',
                    data: limits.thermalFlat.frequencies.map((freq, i) => ({
                        x: freq,
                        y: limits.thermalFlat.spl[i]
                    })),
                    borderColor: '#d29922',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y'
                });
            }

            if (limits.excursion) {
                chartDatasets.push({
                    label: 'Excursion Limit (Xmax)',
                    data: limits.excursion.frequencies.map((freq, i) => ({
                        x: freq,
                        y: limits.excursion.spl[i]
                    })),
                    borderColor: '#f85149',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [3, 3],
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y'
                });
            }
        }

        // Add secondary Y-axis data if provided (power or excursion)
        if (secondaryData) {
            if (secondaryData.type === 'power') {
                chartDatasets.push({
                    label: 'Max Safe Power',
                    data: secondaryData.frequencies.map((freq, i) => ({
                        x: freq,
                        y: secondaryData.values[i]
                    })),
                    borderColor: '#a371f7',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y2'
                });
            } else if (secondaryData.type === 'excursion') {
                chartDatasets.push({
                    label: `Excursion @ ${secondaryData.power}W`,
                    data: secondaryData.frequencies.map((freq, i) => ({
                        x: freq,
                        y: secondaryData.values[i]
                    })),
                    borderColor: '#bc8cff',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    pointRadius: 0,
                    tension: 0.1,
                    yAxisID: 'y2'
                });
            }
        }

        window.debug?.(`GraphManager.createFrequencyResponse: Created ${chartDatasets.length} datasets`);

        const scalesConfig = {
            x: {
                type: 'logarithmic',
                title: { display: true, text: 'Frequency (Hz)' },
                grid: { color: '#30363d' }
            },
            y: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'SPL (dB)' },
                grid: { color: '#30363d' }
            }
        };

        // Add secondary Y-axis if needed
        if (secondaryData) {
            scalesConfig.y2 = {
                type: 'linear',
                position: 'right',
                title: {
                    display: true,
                    text: secondaryData.type === 'power' ? 'Power (W)' : 'Excursion (mm)'
                },
                grid: { drawOnChartArea: false },
                ticks: { color: '#a371f7' }
            };
        }

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: { datasets: chartDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: scalesConfig,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const suffix = context.dataset.yAxisID === 'y2'
                                    ? (secondaryData.type === 'power' ? 'W' : 'mm')
                                    : 'dB';
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)} ${suffix}`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Maximum Power Graph (supports both single and multi-design)
    createMaxPowerCurve(canvasId, data) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');

        // Check if this is multi-design format
        const isMultiDesign = this._isMultiDesignFormat(data);
        const chartDatasets = isMultiDesign
            ? this._prepareMaxPowerDatasets(data)
            : (() => {
                // Legacy format - single design
                const excursionData = [];
                const thermalData = [];

                data.forEach(point => {
                    const dataPoint = { x: point.frequency, y: point.maxPower };
                    if (point.limitingFactor === 'excursion') {
                        excursionData.push(dataPoint);
                        thermalData.push({ x: point.frequency, y: null });
                    } else {
                        thermalData.push(dataPoint);
                        excursionData.push({ x: point.frequency, y: null });
                    }
                });

                return [
                    {
                        label: 'Excursion Limited',
                        data: excursionData,
                        borderColor: '#f85149',
                        backgroundColor: 'rgba(248, 81, 73, 0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#f85149',
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'Thermal Limited',
                        data: thermalData,
                        borderColor: '#58a6ff',
                        backgroundColor: 'rgba(88, 166, 255, 0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#58a6ff',
                        tension: 0.1,
                        fill: false
                    }
                ];
            })();

        window.debug?.(`GraphManager.createMaxPowerCurve: Created ${chartDatasets.length} datasets (mode: ${isMultiDesign ? 'multi' : 'single'})`);

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'logarithmic',
                        title: { display: true, text: 'Frequency (Hz)' },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        title: { display: true, text: 'Maximum Power (W)' },
                        grid: { color: '#30363d' },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(0)}W`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Cone Excursion Graph
    createExcursionCurve(canvasId, frequencies, excursions, xmax) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Cone Excursion',
                        data: frequencies.map((freq, i) => ({
                            x: freq,
                            y: excursions[i]
                        })),
                        borderColor: '#58a6ff',
                        backgroundColor: 'rgba(88, 166, 255, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.1,
                        fill: true
                    },
                    {
                        label: 'Xmax Limit',
                        data: frequencies.map(freq => ({
                            x: freq,
                            y: xmax
                        })),
                        borderColor: '#f85149',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'logarithmic',
                        title: { display: true, text: 'Frequency (Hz)' },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        title: { display: true, text: 'Excursion (mm)' },
                        grid: { color: '#30363d' },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}mm`;
                            }
                        }
                    }
                }
            }
        });
    },

    // SPL Ceiling Graph
    createSPLCeiling(canvasId, frequencies, ceiling) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const ctx = document.getElementById(canvasId).getContext('2d');
        window.debug?.(`GraphManager.createSPLCeiling: ${frequencies.length} points`);

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Maximum SPL',
                        data: frequencies.map((freq, i) => ({
                            x: freq,
                            y: ceiling[i]
                        })),
                        borderColor: '#39d353',
                        backgroundColor: 'rgba(57, 211, 83, 0.1)',
                        borderWidth: 3,
                        pointRadius: 0,
                        tension: 0.1,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'logarithmic',
                        title: { display: true, text: 'Frequency (Hz)' },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        title: { display: true, text: 'Max SPL (dB)' },
                        grid: { color: '#30363d' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `Max SPL: ${context.parsed.y.toFixed(1)} dB`;
                            }
                        }
                    }
                }
            }
        });
    },

    // Destroy all charts
    destroyAll() {
        Object.values(this.charts).forEach(chart => chart.destroy());
        this.charts = {};
    }
};

export { GraphManager };
