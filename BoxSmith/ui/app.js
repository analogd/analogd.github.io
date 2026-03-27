/**
 * BoxSmith v2 - Main Application
 *
 * Widget-based architecture with composable graphs.
 * Default: Ultimax II in 140L sealed box.
 *
 * Structure:
 * - GRAPH REGISTRY: graphRegistry.js has all 32 graph definitions
 * - INITIALIZATION: init(), setupGraphs() creates instances from registry
 * - GRAPH UPDATES: updateAllGraphs() renders all graphs via registry
 * - METRICS: updateMetrics(), setMetric()
 * - CONTROLS: setupControls(), setupModifierControls(), etc.
 */

import { state, initializeDefaultState, DEFAULTS, ModifierCategory, ModifierType, ModifierPresets, POPULAR_DRIVERS, getAllAvailableDrivers, setActiveDriver } from './state.js';
import { Graph, setFrequencyRangeGetter } from './graph.js';
import { SealedBox, VentedBox, Port } from '../lib/models/index.js';
import { blFromXmax, kmsFromXmax } from '../lib/foundation/klippel/index.js';
import { calculateEta0, calculateSensitivity2v83 } from '../lib/foundation/small-1972.js';
import { VELOCITY_LIMITS, MACH_THRESHOLDS, REYNOLDS_THRESHOLDS } from '../lib/foundation/vented/port.js';
import { initDriverLibrary, openDriverLibrary, openDriverLibraryWithDriver } from './driver-library.js';
import {
    GRAPH_REGISTRY,
    Domain,
    deriveGraphInputs,
    deriveDspAdjustments,
    deriveSettingAffects,
    getDomainRange,
    getGraphKeys,
    createRenderContext,
    createGraphRenderer
} from './graphRegistry.js';

// ============================================================================
// GRAPH DEPENDENCY MAP (derived from graphRegistry.js)
// ============================================================================
// Auto-derived from GRAPH_REGISTRY - single source of truth.
// Used for: (1) hover highlighting, (2) sanity-checking dependencies

const GRAPH_INPUTS = deriveGraphInputs();
const SETTING_AFFECTS = deriveSettingAffects(GRAPH_INPUTS);

/**
 * Highlight graphs affected by a setting
 */
function highlightAffectedGraphs(setting) {
    const charts = SETTING_AFFECTS[setting] || [];
    for (const chartId of charts) {
        const container = document.getElementById(chartId)?.closest('.chart-container');
        if (container) container.classList.add('will-update');
    }
}

/**
 * Clear all graph highlights
 */
function clearGraphHighlights() {
    document.querySelectorAll('.chart-container.will-update').forEach(el => {
        el.classList.remove('will-update');
    });
}

// ============================================================================
// DSP ADJUSTMENT SYSTEM (derived from graphRegistry.js)
// ============================================================================
// Auto-derived from GRAPH_REGISTRY - single source of truth.
// See graphRegistry.js for adjustment type documentation.

const DSP_ADJUSTMENTS = deriveDspAdjustments();

// 'adjusted' setting affects all graphs that have DSP adjustments
SETTING_AFFECTS['adjusted'] = Object.keys(DSP_ADJUSTMENTS);

/**
 * Apply DSP adjustment to a data curve.
 *
 * THIS IS THE SINGLE FUNCTION that handles all DSP adjustments.
 * All graph update functions should call this to ensure uniform behavior.
 *
 * @param {string} chartId - The chart's canvas ID (e.g., 'phaseChart')
 * @param {Array} curve - Data points [{frequency, ...values}, ...]
 * @returns {Array} - Adjusted curve (or original if no adjustment configured/enabled)
 */
function applyDspAdjustment(chartId, curve) {
    const config = DSP_ADJUSTMENTS[chartId];
    if (!config) return curve;

    const modifierStack = state.get('modifierStack');
    const includeDsp = state.get('includeDsp');
    const includeEnv = state.get('includeEnvironment');

    // Show adjusted if either toggle is on
    const showAdjusted = includeDsp || includeEnv;
    if (!showAdjusted || !modifierStack) return curve;

    return curve.map(point => {
        const f = point.frequency ?? point.x;
        if (f === undefined) return point;

        const adjusted = { ...point };

        for (const yKey of config.yKeys) {
            if (adjusted[yKey] === undefined) continue;
            adjusted[yKey] = adjustValueForDsp(adjusted[yKey], f, config.type, modifierStack);
        }

        return adjusted;
    });
}

/**
 * Adjust a single value based on DSP at a frequency.
 * Internal helper for applyDspAdjustment.
 *
 * Respects signal chain toggles:
 * - includeDsp: Whether DSP effects (filters, EQ) are applied
 * - includeEnvironment: Whether room gain is applied
 */
function adjustValueForDsp(value, frequency, type, modifierStack) {
    const includeDsp = state.get('includeDsp');
    const includeEnv = state.get('includeEnvironment');

    switch (type) {
        case 'acoustic':
            // SPL/acoustic output: add full acoustic adjustment (DSP + room gain)
            // Both DSP and environment can be toggled independently
            // activeDspAt = eqDemandAt + signalCutAt (don't double-count signalCut!)
            let acoustic = 0;
            if (includeDsp) acoustic += modifierStack.activeDspAt(frequency);
            if (includeEnv) acoustic += modifierStack.roomGainAt(frequency);
            return value + acoustic;

        case 'room-only':
            // Max SPL: physical capability + room acoustics only
            // Signal cuts don't limit what driver CAN do (could overcome with more input)
            return value + (includeEnv ? modifierStack.roomGainAt(frequency) : 0);

        case 'headroom':
            // Headroom = maxSPL - target, where maxSPL gets room gain
            // EQ demand consumes headroom (driving harder to hit boosted target)
            // Signal cuts (HPF/LPF) are excluded - they just mean you're not driving there
            let headroom = 0;
            if (includeEnv) headroom += modifierStack.roomGainAt(frequency);
            if (includeDsp) headroom -= modifierStack.eqDemandAt(frequency);
            return value + headroom;

        case 'phase':
            // Phase: add DSP phase shift
            return value + (includeDsp ? modifierStack.activeDspPhaseAt(frequency) : 0);

        case 'group-delay':
            // Group delay: add DSP group delay
            return value + (includeDsp ? modifierStack.activeDspGroupDelayAt(frequency) : 0);

        case 'scale-amplitude':
            // Amplitude-proportional: scale by linear factor
            // activeDspAt is in dB; amplitude scales as 10^(dB/20)
            if (!includeDsp) return value;
            return value * Math.pow(10, modifierStack.activeDspAt(frequency) / 20);

        case 'scale-power':
            // Power-proportional: scale by power factor
            // Power scales as 10^(dB/10)
            if (!includeDsp) return value;
            return value * Math.pow(10, modifierStack.activeDspAt(frequency) / 10);

        default:
            return value;
    }
}

// ============================================================================
// GRAPH INSTANCES (created from registry)
// ============================================================================
// Single object holds all Graph instances, keyed by registry key
const graphs = {};
// Renderers wrap error handling and capability checks
const renderers = {};

/**
 * Get frequency range from state
 */
function getFreqMin() { return 10; }
function getFreqMax() { return state.require('frequencyMax'); }

// Wire up Graph class to use our frequency range
setFrequencyRangeGetter(() => ({ min: getFreqMin(), max: getFreqMax() }));

/** Get headroom curve using current UI frequency range */
function getHeadroomCurve(box, targetSpl) {
    return box.headroomCurve(targetSpl, getFreqMin(), getFreqMax(), DEFAULTS.curvePoints);
}

// ============================================================================
// GRAPH UPDATE UTILITIES
// ============================================================================
// Centralized error handling and N/A state management for all graph updates.
// See CLAUDE.md "Maintainability for AI-Assisted Development" for why this matters.

/**
 * Safe wrapper for graph update functions.
 * Handles: null graph check, try/catch with consistent logging.
 *
 * Usage:
 *   safeUpdateGraph(fooGraph, 'foo', () => {
 *       if (!box.someCapability) {
 *           fooGraph.setLayers([naPlaceholder('reason')]);
 *           return;
 *       }
 *       // ... normal update logic
 *   });
 */
function safeUpdateGraph(graph, name, updateFn) {
    if (!graph) return;
    try {
        updateFn();
    } catch (e) {
        console.warn(`Could not generate ${name} graph:`, e.message);
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application
 */
function init() {
    // Initialize state with Ultimax II in 140L
    initializeDefaultState();

    // Setup graphs
    setupGraphs();

    // Setup UI controls
    setupControls();

    // Setup driver selection controls
    setupDriverControls();

    // Setup include toggles for DSP and Environment
    setupIncludeToggles();

    // Setup driver library
    initDriverLibrary({
        onSelect: (driver) => {
            setActiveDriver(driver);
            updateDriverInfoDisplay(driver);
            updateSubtitle();
            populateDriverDropdown();
            const select = document.getElementById('driverSelect');
            if (select) select.value = driver.id;
        }
    });

    // Setup graph highlight on setting hover
    setupSettingHighlights();

    // Setup click-to-enlarge for graphs
    setupGraphModal();

    // Setup DSP playground modal
    setupDspPlaygroundModal();

    // Setup layout controls (driver, box type, sliders, graphs)
    initLayoutControls();

    // Initial render
    updateAllGraphs();

    // Subscribe to state changes
    state.subscribe('box', updateAllGraphs);
    state.subscribe('power', updateAllGraphs);
    state.subscribe('targetSpl', updateAllGraphs);
    state.subscribe('modifierStack', updateAllGraphs);
    state.subscribe('realWorldDerating', updateAllGraphs);

    // Frequency range change triggers re-render of all graphs
    state.subscribe('frequencyMax', updateAllGraphs);

    // Signal chain toggles trigger re-render (affects DSP adjustments)
    state.subscribe('includeDsp', updateAllGraphs);
    state.subscribe('includeEnvironment', updateAllGraphs);
}

/**
 * Get Graph options for a domain type
 */
function getGraphOptionsForDomain(domain, config) {
    const freqMin = getFreqMin();
    const freqMax = getFreqMax();
    // For displacement domain graphs (Bl(x), Kms(x)), xmax sets the axis range.
    // If xmax is unknown, use a reasonable axis default. The graphs themselves
    // will show N/A via Requires.ENGINEERING check - this is just chart infrastructure.
    const xmax = state.get('box')?.driver?.xmax ?? DEFAULTS.displacementAxisDefault;
    const range = getDomainRange(domain, { freqMin, freqMax, timeMax: DEFAULTS.timeDomainMax, xmax });

    const xLabels = {
        [Domain.FREQUENCY]: 'Frequency (Hz)',
        [Domain.FREQUENCY_EXTENDED]: 'Frequency (Hz)',
        [Domain.TIME]: 'Time (ms)',
        [Domain.DISPLACEMENT]: 'Displacement (mm)',
        [Domain.POWER]: 'Power (W)'
    };

    const opts = {
        yLabel: config.label,
        yMin: config.yRange.min,
        yMax: config.yRange.max,
        ySuggestedMin: config.yRange.suggestedMin ?? null,
        ySuggestedMax: config.yRange.suggestedMax ?? null,
        xLabel: xLabels[domain] || 'Frequency (Hz)',
        xLog: range.logScale
    };

    // Use explicit xRange from config if provided (for time/displacement domain graphs)
    if (config.xRange) {
        opts.xMin = config.xRange.min;
        opts.xMax = config.xRange.max;
    } else if (domain === Domain.FREQUENCY_EXTENDED) {
        // For extended frequency, we set explicit xMax
        opts.xMax = () => Math.round(getFreqMax() * 2.5);
    } else if (domain !== Domain.FREQUENCY) {
        // For other non-frequency domains, use calculated range
        opts.xMin = range.min;
        opts.xMax = range.max;
    }
    // For FREQUENCY domain, let Graph class use shared range (via setFrequencyRangeGetter)

    return opts;
}

/**
 * Setup graph instances from registry
 *
 * Creates all Graph instances and their renderers from GRAPH_REGISTRY.
 * Each graph is stored in graphs[key] and its renderer in renderers[key].
 */
function setupGraphs() {
    for (const key of getGraphKeys()) {
        const config = GRAPH_REGISTRY[key];

        // Create Graph instance with domain-appropriate options
        const opts = getGraphOptionsForDomain(config.domain, config);
        graphs[key] = new Graph(config.id, opts);

        // Create renderer with error handling and capability checks
        renderers[key] = createGraphRenderer(key, graphs[key], safeUpdateGraph);
    }
}

// ============================================================================
// MODIFIER COLORS & HELPERS (used by render context)
// ============================================================================

// Colors for individual filters
const FILTER_COLORS = [
    '#58a6ff',  // Blue
    '#f0883e',  // Orange
    '#a371f7',  // Purple
    '#3fb950',  // Green
    '#f85149',  // Red
    '#db61a2',  // Pink
];

// Category colors
const CATEGORY_COLORS = {
    room_gain: '#3fb950',   // Green - room gain helps
    eq_demand: '#f0883e',   // Orange - EQ demand costs
    signal: '#58a6ff',      // Blue - signal processing
    target: '#8b949e'       // Gray - reference only
};

// Helper: Is this an active (DSP) modifier?
const isActiveModifier = (category) =>
    category === ModifierCategory.EQ_DEMAND || category === ModifierCategory.SIGNAL;

// Helper: Is this a passive (environment) modifier?
const isPassiveModifier = (category) =>
    category === ModifierCategory.ROOM_GAIN;

// ============================================================================
// GRAPH UPDATE
// ============================================================================

/**
 * Update all graphs from current state
 *
 * Creates render context with all dependencies and calls each renderer.
 */
function updateAllGraphs() {
    const box = state.get('box');
    if (!box) return;

    const power = state.require('power');
    const targetSpl = state.require('targetSpl');

    // Derive showAdjusted from toggle states
    const includeDsp = state.get('includeDsp');
    const includeEnv = state.get('includeEnvironment');
    const showAdjusted = includeDsp || includeEnv;

    // Create render context with all dependencies graphs might need
    const ctx = createRenderContext({
        // State values
        power,
        targetSpl,
        showAdjusted,
        includeDsp,
        includeEnv,
        modifierStack: state.get('modifierStack'),
        derating: state.get('realWorldDerating'),
        frequencyMin: getFreqMin(),
        frequencyMax: getFreqMax(),
        timeMax: DEFAULTS.timeDomainMax,
        // Helpers
        applyDsp: (chartId, curve) => applyDspAdjustment(chartId, curve),
        getHeadroomCurve: (box, targetSpl) => getHeadroomCurve(box, targetSpl),
        // Model constructors (for comparison graphs)
        SealedBox,
        VentedBox,
        // Klippel functions
        blFromXmax,
        kmsFromXmax,
        // Modifier category helpers
        isActiveModifier,
        isPassiveModifier,
        CATEGORY_COLORS,
        FILTER_COLORS,
        // Constants
        VELOCITY_LIMITS,
        MACH_THRESHOLDS,
        REYNOLDS_THRESHOLDS,
        // Point counts
        points: DEFAULTS.curvePoints,
        pointsHigh: DEFAULTS.curvePointsHigh
    });

    // Call all renderers
    for (const key of getGraphKeys()) {
        renderers[key](box, ctx);
    }

    // Update metrics (not a graph)
    updateMetrics(box, power);
}

// ============================================================================
// METRICS DISPLAY
// ============================================================================

/**
 * Update metrics display
 */
function updateMetrics(box, _power) {
    const driver = state.get('driver');
    const modifierStack = state.get('modifierStack');
    const includeDsp = state.get('includeDsp');
    const includeEnv = state.get('includeEnvironment');
    const showAdjusted = includeDsp || includeEnv;

    // Basic metrics - adapt to box type
    setMetric('f3Value', `${box.f3.toFixed(1)} Hz`);
    setMetric('volumeValue', `${box.volumeLiters.toFixed(0)} L`);

    // Fc/Fb and Qtc/h depend on box type
    if (box.fc !== undefined) {
        // Sealed box: show Fc and Qtc
        setMetric('fcValue', `${box.fc.toFixed(1)} Hz`);
        setMetric('qtcValue', box.qtc.toFixed(3));
    } else if (box.fb !== undefined) {
        // Ported box: show Fb and tuning ratio
        setMetric('fcValue', `Fb: ${box.fb.toFixed(1)} Hz`);
        setMetric('qtcValue', `h=${box.tuningRatio.toFixed(2)}`);
    } else {
        setMetric('fcValue', 'N/A');
        setMetric('qtcValue', 'N/A');
    }

    // Sensitivity
    if (driver?.sensitivity) {
        setMetric('sensitivityValue', `${driver.sensitivity.toFixed(1)} dB`);
    }

    // Usable F3 at target SPL
    const targetSpl = state.require('targetSpl');
    if (box.canCalculateLimits) {
        try {
            const usable = box.usableF3At(targetSpl);
            setMetric('usableF3Value', `${usable.usableF3} Hz @ ${targetSpl}dB`);
        } catch {
            setMetric('usableF3Value', 'N/A');
        }
    }

    // Max SPL at key frequencies
    if (box.canCalculateSpl && box.canCalculateLimits) {
        try {
            const spl20 = box.maxSplAt(20);
            const spl30 = box.maxSplAt(30);

            if (showAdjusted && modifierStack) {
                // Respect individual toggles
                const roomGain20 = includeEnv ? modifierStack.roomGainAt(20) : 0;
                const roomGain30 = includeEnv ? modifierStack.roomGainAt(30) : 0;
                const dspEffect20 = includeDsp ? modifierStack.activeDspAt(20) : 0;
                const dspEffect30 = includeDsp ? modifierStack.activeDspAt(30) : 0;

                const adj20 = spl20.maxSpl + roomGain20 + dspEffect20;
                const adj30 = spl30.maxSpl + roomGain30 + dspEffect30;

                setMetric('maxSpl20Value', `${adj20.toFixed(1)} dB (adjusted)`);
                setMetric('maxSpl30Value', `${adj30.toFixed(1)} dB (adjusted)`);
            } else {
                setMetric('maxSpl20Value', `${spl20.maxSpl.toFixed(1)} dB (${spl20.limitingFactor})`);
                setMetric('maxSpl30Value', `${spl30.maxSpl.toFixed(1)} dB (${spl30.limitingFactor})`);
            }
        } catch {
            setMetric('maxSpl20Value', 'N/A');
            setMetric('maxSpl30Value', 'N/A');
        }
    }

    // Update modifier summary
    updateModifierSummary();

    // Update warnings panel
    updateWarningsPanel(box);
}

/**
 * Update warnings panel from box.warnings
 */
function updateWarningsPanel(box) {
    const panel = document.getElementById('warningsPanel');
    const list = document.getElementById('warningsList');

    if (!panel || !list) return;

    const warnings = box.warnings || [];

    if (warnings.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    list.innerHTML = warnings
        .map(w => `<div class="warning-item">${w.message}</div>`)
        .join('');
}

/**
 * Update modifier stack summary display
 */
function updateModifierSummary() {
    const modifierStack = state.get('modifierStack');
    const summaryEl = document.getElementById('modifierSummary');

    if (!summaryEl || !modifierStack) return;

    const summary = modifierStack.getSummary();
    const lines = [];

    if (summary.at20Hz !== 0) lines.push(`20Hz: ${summary.at20Hz > 0 ? '+' : ''}${summary.at20Hz.toFixed(1)}dB`);
    if (summary.at30Hz !== 0) lines.push(`30Hz: ${summary.at30Hz > 0 ? '+' : ''}${summary.at30Hz.toFixed(1)}dB`);
    if (summary.at50Hz !== 0) lines.push(`50Hz: ${summary.at50Hz > 0 ? '+' : ''}${summary.at50Hz.toFixed(1)}dB`);

    summaryEl.textContent = lines.length > 0 ? lines.join(' | ') : 'No modifiers active';
}

/**
 * Helper: Set metric value in DOM
 */
function setMetric(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ============================================================================
// UI CONTROLS
// Sliders, toggles, modifier panel, reference sub panel, import modal
// ============================================================================

/**
 * Setup a slider control with two-way binding to state
 * @param {string} stateKey - Key in state to bind to
 * @param {string} sliderId - DOM id of slider element
 * @param {string} displayId - DOM id of display element (optional)
 * @param {*} defaultValue - Default value if state is undefined
 * @param {Function} parser - Value parser (parseInt, parseFloat)
 * @param {Function} onUpdate - Optional extra callback after state update
 */
function setupSlider(stateKey, sliderId, displayId, defaultValue, parser = parseFloat, onUpdate = null) {
    const slider = document.getElementById(sliderId);
    const display = displayId ? document.getElementById(displayId) : null;

    if (!slider) return;

    const initialValue = state.get(stateKey) ?? defaultValue;
    slider.value = initialValue;
    if (display) display.textContent = initialValue;

    // Slider input -> state
    slider.addEventListener('input', (e) => {
        const value = parser(e.target.value);
        if (display) display.textContent = value;
        state.set(stateKey, value);
        if (onUpdate) onUpdate(value);
    });

    // State change -> slider (keeps multiple sliders sharing same state key in sync)
    state.subscribe(stateKey, (value) => {
        slider.value = value;
        if (display) display.textContent = value;
        if (onUpdate) onUpdate(value);
    });
}

/**
 * Setup frequency range slider in graph toolbar
 * Slider positions map to: 0=80Hz, 1=200Hz, 2=500Hz, 3=1kHz
 */
function setupFrequencyRangeSlider() {
    const slider = document.getElementById('freqRangeSlider');
    const display = document.getElementById('freqRangeValue');
    if (!slider) return;

    const freqStops = [80, 200, 500, 1000];
    const labels = ['80 Hz', '200 Hz', '500 Hz', '1 kHz'];

    // Set initial position based on current frequencyMax
    const currentMax = state.get('frequencyMax') ?? DEFAULTS.frequencyMax;
    const initialIndex = freqStops.indexOf(currentMax);
    if (initialIndex >= 0) {
        slider.value = initialIndex;
        if (display) display.textContent = labels[initialIndex];
    }

    slider.addEventListener('input', (e) => {
        const index = parseInt(e.target.value);
        const freq = freqStops[index];
        if (display) display.textContent = labels[index];
        state.set('frequencyMax', freq);
    });
}

/**
 * Setup expand/collapse all buttons in graph toolbar
 */
function setupExpandCollapseButtons() {
    const expandBtn = document.getElementById('expandAllBtn');
    const collapseBtn = document.getElementById('collapseAllBtn');
    const sections = document.querySelectorAll('.chart-section');

    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            sections.forEach(section => section.classList.remove('collapsed'));
        });
    }

    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            sections.forEach(section => section.classList.add('collapsed'));
        });
    }
}

/**
 * Setup UI controls
 */
function setupControls() {
    // Main sliders
    setupSlider('volumeLiters', 'volumeSlider', 'volumeDisplay', DEFAULTS.volumeLiters, parseInt);
    setupSlider('power', 'powerSlider', 'powerDisplay', DEFAULTS.power, parseInt);
    setupSlider('targetSpl', 'targetSplSlider', 'targetSplDisplay', DEFAULTS.targetSpl, parseInt);

    // Derating slider (real-world adjustment)
    setupSlider('realWorldDerating', 'deratingSlider', 'deratingValue', 0, parseInt, (value) => {
        const display = document.getElementById('deratingValue');
        if (display) display.textContent = `${value} dB`;
    });

    // Graph toolbar controls
    setupFrequencyRangeSlider();
    setupExpandCollapseButtons();

    // Box type buttons
    const sealedBtn = document.getElementById('sealedBtn');
    const portedBtn = document.getElementById('portedBtn');
    const tuningGroup = document.getElementById('tuningGroup');

    // Vent type controls
    const ventTypeGroup = document.getElementById('ventTypeGroup');
    const portBtn = document.getElementById('portBtn');
    const prBtn = document.getElementById('prBtn');
    const portConfigGroup = document.getElementById('portConfigGroup');
    const prConfigGroup = document.getElementById('prConfigGroup');

    // Sealed box options
    const sealedOptionsGroup = document.getElementById('sealedOptionsGroup');

    function updateChartApplicability(boxType, ventType) {
        const isPorted = boxType === 'ported';
        const isPort = ventType === 'port';

        // Ported-only charts (work for both port and PR vents)
        document.querySelectorAll('[data-ported-only]').forEach(el => {
            el.classList.toggle('not-applicable', !isPorted);
        });

        // Port-only charts (ported box with port vent, not PR)
        document.querySelectorAll('[data-port-only]').forEach(el => {
            el.classList.toggle('not-applicable', !(isPorted && isPort));
        });
    }

    function updateBoxTypeUI(boxType) {
        const ventType = state.require('ventType');
        const isPorted = boxType === 'ported';

        if (sealedBtn && portedBtn) {
            sealedBtn.classList.toggle('active', boxType === 'sealed');
            portedBtn.classList.toggle('active', isPorted);
        }
        if (tuningGroup) {
            tuningGroup.style.display = isPorted ? 'block' : 'none';
        }
        if (sealedOptionsGroup) {
            sealedOptionsGroup.style.display = isPorted ? 'none' : 'block';
        }
        if (ventTypeGroup) {
            ventTypeGroup.style.display = isPorted ? 'block' : 'none';
        }
        if (portConfigGroup) {
            portConfigGroup.style.display = (isPorted && ventType === 'port') ? 'block' : 'none';
        }
        if (prConfigGroup) {
            prConfigGroup.style.display = (isPorted && ventType === 'pr') ? 'block' : 'none';
        }

        // Grey out non-applicable charts
        updateChartApplicability(boxType, ventType);

        // Update subtitle
        const subtitle = document.querySelector('.subtitle');
        if (subtitle) {
            const vol = state.require('volumeLiters');
            const fb = state.require('tuningFrequency');
            const isobaric = state.get('isobaric');
            const isobaricSuffix = isobaric ? ' (isobaric)' : '';
            if (boxType === 'sealed') {
                subtitle.textContent = `Ultimax II 18" in ${vol}L sealed enclosure${isobaricSuffix}`;
            } else if (ventType === 'pr') {
                subtitle.textContent = `Ultimax II 18" in ${vol}L with PR @ ${fb}Hz${isobaricSuffix}`;
            } else {
                subtitle.textContent = `Ultimax II 18" in ${vol}L ported @ ${fb}Hz${isobaricSuffix}`;
            }
        }
    }

    function updateVentTypeUI(ventType) {
        if (portBtn && prBtn) {
            portBtn.classList.toggle('active', ventType === 'port');
            prBtn.classList.toggle('active', ventType === 'pr');
        }
        const boxType = state.get('boxType');
        // Show/hide appropriate config groups
        if (boxType === 'ported') {
            if (portConfigGroup) {
                portConfigGroup.style.display = ventType === 'port' ? 'block' : 'none';
            }
            if (prConfigGroup) {
                prConfigGroup.style.display = ventType === 'pr' ? 'block' : 'none';
            }
        }
        // Update chart applicability for port-only charts
        updateChartApplicability(boxType, ventType);
        // Update subtitle
        updateBoxTypeUI(boxType);
        // Update vent comparison hint
        updateVentCompareHint();
    }

    /**
     * Update the vent type comparison hint
     * Shows port length, volume displacement, and guidance on port vs PR choice
     */
    function updateVentCompareHint() {
        const hintEl = document.getElementById('ventCompareHint');
        if (!hintEl) return;

        const boxType = state.get('boxType');
        const ventType = state.require('ventType');

        if (boxType !== 'ported') {
            hintEl.textContent = '';
            return;
        }

        // PR mode - no port volume to calculate
        if (ventType === 'pr') {
            hintEl.textContent = '';
            return;
        }

        const volumeLiters = state.require('volumeLiters');
        const fb = state.require('tuningFrequency');
        const portShape = state.require('portShape');
        const flared = state.get('portFlared') !== false;

        try {
            let port;
            let portAreaCm2;

            if (portShape === 'rectangular') {
                const width = state.require('portWidth');
                const height = state.require('portHeight');
                port = new Port({ width, height, flared });
                portAreaCm2 = width * height;
            } else {
                const diameter = state.require('portDiameter');
                port = new Port({ diameter, flared });
                portAreaCm2 = Math.PI * (diameter / 2) ** 2;
            }

            const volumeSI = volumeLiters / 1000;
            const lengthCm = port.lengthForCm(fb, volumeSI);

            if (lengthCm <= 0) {
                hintEl.textContent = 'Port too small for this tuning.';
                hintEl.style.color = '#f0883e';
                return;
            }

            // Calculate port volume displacement
            const portVolumeLiters = (portAreaCm2 * lengthCm) / 1000;
            const portVolumePercent = (portVolumeLiters / volumeLiters) * 100;

            // Build hint message
            let message = `Port: ${lengthCm.toFixed(0)}cm × ${portAreaCm2.toFixed(0)}cm² = ${portVolumeLiters.toFixed(1)}L (${portVolumePercent.toFixed(0)}%)`;

            if (portVolumePercent > 20) {
                message = `⚠️ ${message} - port consuming too much volume! Use PR or larger box.`;
                hintEl.style.color = '#f0883e';
            } else if (portVolumePercent > 15) {
                message = `${message} - significant volume loss`;
                hintEl.style.color = '#d29922';
            } else if (lengthCm > 60) {
                message = `⚠️ ${message} - very long port! Consider PR.`;
                hintEl.style.color = '#f0883e';
            } else if (lengthCm > 40) {
                message = `${message} - getting long`;
                hintEl.style.color = '#d29922';
            } else {
                hintEl.style.color = '#8b949e';
            }

            hintEl.textContent = message;
        } catch {
            hintEl.textContent = '';
        }
    }

    // Subscribe to changes that affect vent comparison
    state.subscribe('volumeLiters', updateVentCompareHint);
    state.subscribe('tuningFrequency', updateVentCompareHint);
    state.subscribe('portDiameter', updateVentCompareHint);
    state.subscribe('portWidth', updateVentCompareHint);
    state.subscribe('portHeight', updateVentCompareHint);
    state.subscribe('portShape', updateVentCompareHint);
    state.subscribe('portFlared', updateVentCompareHint);
    state.subscribe('boxType', updateVentCompareHint);
    state.subscribe('ventType', updateVentCompareHint);

    if (sealedBtn) {
        sealedBtn.addEventListener('click', () => {
            state.set('boxType', 'sealed');
        });
    }

    if (portedBtn) {
        portedBtn.addEventListener('click', () => {
            state.set('boxType', 'ported');
        });
    }

    // Vent type buttons
    if (portBtn) {
        portBtn.addEventListener('click', () => {
            state.set('ventType', 'port');
        });
    }

    if (prBtn) {
        prBtn.addEventListener('click', () => {
            state.set('ventType', 'pr');
        });
    }

    // Stuffing buttons (sealed box)
    document.querySelectorAll('.stuffing-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stuffing-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.set('sealedStuffing', btn.dataset.stuffing);
        });
    });

    // Tuning and QL sliders
    setupSlider('tuningFrequency', 'tuningSlider', 'tuningDisplay', DEFAULTS.tuningFrequency, parseInt);
    setupSlider('ql', 'qlSlider', 'qlDisplay', DEFAULTS.ql, parseFloat);

    // Isobaric (compound driver) toggle
    const isobaricToggle = document.getElementById('isobaricToggle');
    const isobaricToggleLabel = document.getElementById('isobaricToggleLabel');
    const isobaricWiringGroup = document.getElementById('isobaricWiringGroup');
    const isobaricSeriesBtn = document.getElementById('isobaricSeriesBtn');
    const isobaricParallelBtn = document.getElementById('isobaricParallelBtn');
    const isobaricInfo = document.getElementById('isobaricInfo');

    function updateIsobaricUI(enabled) {
        // Show/hide wiring options and info
        if (isobaricWiringGroup) {
            isobaricWiringGroup.classList.toggle('hidden', !enabled);
        }
        if (isobaricInfo) {
            isobaricInfo.classList.toggle('hidden', !enabled);
        }
        // Update toggle-btn active state
        if (isobaricToggleLabel) {
            isobaricToggleLabel.classList.toggle('active', enabled);
        }
    }

    if (isobaricToggle) {
        isobaricToggle.checked = state.get('isobaric');
        updateIsobaricUI(isobaricToggle.checked);

        isobaricToggle.addEventListener('change', (e) => {
            state.set('isobaric', e.target.checked);
            updateIsobaricUI(e.target.checked);
        });
    }

    if (isobaricSeriesBtn) {
        isobaricSeriesBtn.addEventListener('click', () => {
            state.set('isobaricWiring', 'series');
            isobaricSeriesBtn.classList.add('active');
            if (isobaricParallelBtn) isobaricParallelBtn.classList.remove('active');
        });
    }

    if (isobaricParallelBtn) {
        isobaricParallelBtn.addEventListener('click', () => {
            state.set('isobaricWiring', 'parallel');
            isobaricParallelBtn.classList.add('active');
            if (isobaricSeriesBtn) isobaricSeriesBtn.classList.remove('active');
        });
    }

    // Port shape selector
    const circularPortBtn = document.getElementById('circularPortBtn');
    const rectPortBtn = document.getElementById('rectPortBtn');
    const circularPortConfig = document.getElementById('circularPortConfig');
    const rectPortConfig = document.getElementById('rectPortConfig');

    function updatePortShapeUI(shape) {
        if (circularPortBtn) circularPortBtn.classList.toggle('active', shape === 'circular');
        if (rectPortBtn) rectPortBtn.classList.toggle('active', shape === 'rectangular');
        if (circularPortConfig) circularPortConfig.style.display = shape === 'circular' ? 'block' : 'none';
        if (rectPortConfig) rectPortConfig.style.display = shape === 'rectangular' ? 'block' : 'none';
    }

    if (circularPortBtn) {
        circularPortBtn.addEventListener('click', () => {
            state.set('portShape', 'circular');
            updatePortShapeUI('circular');
        });
    }
    if (rectPortBtn) {
        rectPortBtn.addEventListener('click', () => {
            state.set('portShape', 'rectangular');
            updatePortShapeUI('rectangular');
        });
    }

    // Initialize port shape UI
    updatePortShapeUI(state.require('portShape'));

    // Port type indicator helper (rectangular vs slot)
    const portTypeDisplay = document.getElementById('portTypeDisplay');
    function updatePortTypeIndicator() {
        if (!portTypeDisplay) return;
        const width = state.require('portWidth');
        const height = state.require('portHeight');
        const aspectRatio = Math.max(width / height, height / width);
        portTypeDisplay.textContent = aspectRatio > 4 ? 'slot' : 'rectangular';
    }

    // Port sliders
    setupSlider('portDiameter', 'portDiameterSlider', 'portDiameterDisplay', DEFAULTS.portDiameter, parseFloat);
    setupSlider('portWidth', 'portWidthSlider', 'portWidthDisplay', DEFAULTS.portWidth, parseFloat, updatePortTypeIndicator);
    setupSlider('portHeight', 'portHeightSlider', 'portHeightDisplay', DEFAULTS.portHeight, parseFloat, updatePortTypeIndicator);
    updatePortTypeIndicator();

    // Port flared toggle
    const portFlaredToggle = document.getElementById('portFlaredToggle');
    if (portFlaredToggle) {
        portFlaredToggle.checked = state.get('portFlared') !== false;
        portFlaredToggle.addEventListener('change', (e) => {
            state.set('portFlared', e.target.checked);
        });
    }

    // PR sliders (HTML uses 'prSd' not 'prArea' for slider IDs)
    // PR tuning shares state with ported tuning - both stay in sync via state subscription
    setupSlider('tuningFrequency', 'prTuningSlider', 'prTuningDisplay', DEFAULTS.tuningFrequency, parseInt);
    setupSlider('prMass', 'prMassSlider', 'prMassDisplay', DEFAULTS.prMass, parseInt);
    setupSlider('prArea', 'prSdSlider', 'prSdDisplay', DEFAULTS.prArea, parseInt);
    setupSlider('prXmax', 'prXmaxSlider', 'prXmaxDisplay', DEFAULTS.prXmax, parseInt);

    // Subscribe to boxType changes
    state.subscribe('boxType', (boxType) => {
        updateBoxTypeUI(boxType);
    });

    // Subscribe to ventType changes
    state.subscribe('ventType', (ventType) => {
        updateVentTypeUI(ventType);
    });

    // Also update subtitle when volume, tuning, or isobaric changes
    state.subscribe('volumeLiters', () => {
        updateBoxTypeUI(state.get('boxType'));
    });
    state.subscribe('tuningFrequency', () => {
        updateBoxTypeUI(state.get('boxType'));
    });
    state.subscribe('isobaric', () => {
        updateBoxTypeUI(state.get('boxType'));
    });

    // Initialize UI
    updateBoxTypeUI(state.get('boxType'));
    updateVentTypeUI(state.require('ventType'));

    // Modifier controls
    setupModifierControls();

    // Render initial modifier list
    renderModifierList();

    // Environment controls
    setupEnvironmentControls();
}

/**
 * Setup modifier controls (DSP filters)
 *
 * New design: Filter type buttons (HPF, LPF, PEQ, Shelf) create custom filters
 * with sensible defaults. Quick preset buttons for common configurations.
 */
function setupModifierControls() {
    const filterTypeBtns = document.querySelectorAll('.filter-type-btn');
    const filterPresetBtns = document.querySelectorAll('.filter-preset-btn');

    // Default configs for each filter type
    const FILTER_DEFAULTS = {
        hpf: {
            type: ModifierType.HPF,
            category: ModifierCategory.SIGNAL,
            name: 'High-Pass',
            cornerFreq: 20,
            order: 4
        },
        lpf: {
            type: ModifierType.LPF,
            category: ModifierCategory.SIGNAL,
            name: 'Low-Pass',
            cornerFreq: 120,
            order: 4
        },
        peak: {
            type: ModifierType.PEAK,
            category: ModifierCategory.EQ_DEMAND,
            name: 'PEQ',
            centerFreq: 40,
            gainDb: 3,
            q: 2
        },
        shelf: {
            type: ModifierType.SHELF,
            category: ModifierCategory.EQ_DEMAND,
            name: 'Low Shelf',
            cornerFreq: 80,
            gainDb: 3,
            slope: 1
        }
    };

    // Filter type buttons - create new custom filter
    filterTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.dataset.type;
            const defaults = FILTER_DEFAULTS[filterType];
            if (!defaults) return;

            const modifierStack = state.get('modifierStack');
            modifierStack.add({ ...defaults });
            state.set('modifierStack', modifierStack);  // triggers updateAllGraphs via subscription
            renderModifierList();
        });
    });

    // Quick preset buttons - add from ModifierPresets
    filterPresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const presetKey = btn.dataset.preset;
            const preset = ModifierPresets[presetKey];
            if (!preset) return;

            const modifierStack = state.get('modifierStack');
            modifierStack.add({ ...preset });
            state.set('modifierStack', modifierStack);  // triggers updateAllGraphs via subscription
            renderModifierList();
        });
    });
}

/**
 * Setup environment controls (room presets)
 *
 * Environment presets add room gain modifiers.
 * Only one room preset can be active at a time (they replace each other).
 */
function setupEnvironmentControls() {
    const presetBtns = document.querySelectorAll('.env-preset-btn');

    // Environment preset definitions
    const ENV_PRESETS = {
        anechoic: { gain: 0, corner: 80, label: 'Anechoic / 1m reference' },
        freestanding: { gain: 3, corner: 100, label: 'Freestanding (+3dB)' },
        wall: { gain: 6, corner: 120, label: 'Near wall (+6dB)' },
        corner: { gain: 9, corner: 150, label: 'Corner (+9dB)' }
    };

    // Track current environment modifier ID so we can replace it
    let currentEnvModifierId = null;

    function applyEnvironmentPreset(presetKey) {
        const preset = ENV_PRESETS[presetKey];
        if (!preset) return;

        const modifierStack = state.get('modifierStack');

        // Remove previous environment modifier if exists
        if (currentEnvModifierId) {
            modifierStack.remove(currentEnvModifierId);
        }

        // Add new environment modifier (unless anechoic which is 0dB)
        if (preset.gain > 0) {
            const newModifier = modifierStack.add({
                name: preset.label,
                type: ModifierType.SHELF,
                category: ModifierCategory.ROOM_GAIN,
                cornerFreq: preset.corner,
                gainDb: preset.gain,
                slope: 12
            });
            currentEnvModifierId = newModifier.id;
        } else {
            currentEnvModifierId = null;
        }

        // Update UI
        presetBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.env === presetKey);
        });

        // Update state (triggers updateAllGraphs via subscription)
        state.set('environmentPreset', presetKey);
        state.set('modifierStack', modifierStack);
        renderModifierList();
    }

    // Attach click handlers
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            applyEnvironmentPreset(btn.dataset.env);
        });
    });

    // Initialize with anechoic (no room gain) by default
    state.set('environmentPreset', 'anechoic');
}

/**
 * Setup driver selection controls
 */
function setupDriverControls() {
    const driverSelect = document.getElementById('driverSelect');
    const importDriverBtn = document.getElementById('importDriverBtn');

    // Populate dropdown
    populateDriverDropdown();

    // Driver selection
    if (driverSelect) {
        driverSelect.addEventListener('change', (e) => {
            const driverId = e.target.value;
            if (!driverId) return;

            const allDrivers = getAllAvailableDrivers();
            const driverData = allDrivers.find(d => d.id === driverId);
            if (driverData) {
                setActiveDriver(driverData);
                updateDriverInfoDisplay(driverData);
                updateSubtitle();
            }
        });
    }

    // Open driver library
    if (importDriverBtn) {
        importDriverBtn.addEventListener('click', () => {
            openDriverLibrary();
        });
    }

    // Update driver info when box changes
    state.subscribe('box', (box) => {
        if (box?.driver) {
            const driverData = state.get('driverData');
            if (driverData) {
                updateDriverInfoDisplay(driverData);
            }
        }
    });

    // Initial driver info update
    const initialDriverData = state.get('driverData');
    if (initialDriverData) {
        updateDriverInfoDisplay(initialDriverData);
        // Set dropdown to initial driver
        if (driverSelect) {
            driverSelect.value = initialDriverData.id || '';
        }
    }
}

/**
 * Populate driver dropdown with available drivers
 */
function populateDriverDropdown() {
    const select = document.getElementById('driverSelect');
    if (!select) return;

    // Clear existing options (keep placeholder)
    select.innerHTML = '<option value="">Select driver...</option>';

    const customDrivers = state.get('customDrivers');

    // Built-in drivers
    if (POPULAR_DRIVERS.length > 0) {
        const builtinGroup = document.createElement('optgroup');
        builtinGroup.label = 'Popular Drivers';
        POPULAR_DRIVERS.forEach(driver => {
            const option = document.createElement('option');
            option.value = driver.id;
            option.textContent = `${driver.name} (${driver.size})`;
            builtinGroup.appendChild(option);
        });
        select.appendChild(builtinGroup);
    }

    // Custom drivers
    if (customDrivers.length > 0) {
        const customGroup = document.createElement('optgroup');
        customGroup.label = 'Custom Drivers';
        customDrivers.forEach(driver => {
            const option = document.createElement('option');
            option.value = driver.id;
            option.textContent = driver.name || 'Custom Driver';
            customGroup.appendChild(option);
        });
        select.appendChild(customGroup);
    }

    // Set current driver if any
    const currentDriverData = state.get('driverData');
    if (currentDriverData?.id) {
        select.value = currentDriverData.id;
    }
}

/**
 * Update driver info display
 */
function updateDriverInfoDisplay(driverData) {
    const fsEl = document.getElementById('driverFs');
    const qtsEl = document.getElementById('driverQts');
    const vasEl = document.getElementById('driverVas');
    const xmaxEl = document.getElementById('driverXmax');
    const peEl = document.getElementById('driverPe');

    if (fsEl) fsEl.textContent = driverData.fs ? `${driverData.fs} Hz` : '--';
    if (qtsEl) qtsEl.textContent = driverData.qts ? driverData.qts.toFixed(2) : '--';
    if (vasEl) vasEl.textContent = driverData.vas ? `${driverData.vas.toFixed(0)} L` : '--';
    if (xmaxEl) xmaxEl.textContent = driverData.xmax ? `${driverData.xmax} mm` : '--';
    if (peEl) peEl.textContent = driverData.pe ? `${driverData.pe} W` : '--';
}

/**
 * Update subtitle with current driver/box info
 */
function updateSubtitle() {
    const subtitle = document.querySelector('.subtitle');
    const driverData = state.get('driverData');
    const boxType = state.require('boxType');
    const ventType = state.require('ventType');
    const vol = state.require('volumeLiters');
    const fb = state.require('tuningFrequency');
    const isobaric = state.get('isobaric');

    if (!subtitle || !driverData) return;

    const driverName = driverData.name || 'Custom Driver';
    const shortName = driverName.length > 30 ? driverName.substring(0, 27) + '...' : driverName;
    const isobaricSuffix = isobaric ? ' (isobaric)' : '';

    if (boxType === 'sealed') {
        subtitle.textContent = `${shortName} in ${vol}L sealed enclosure${isobaricSuffix}`;
    } else if (ventType === 'pr') {
        subtitle.textContent = `${shortName} in ${vol}L with PR @ ${fb}Hz${isobaricSuffix}`;
    } else {
        subtitle.textContent = `${shortName} in ${vol}L ported @ ${fb}Hz${isobaricSuffix}`;
    }
}

/**
 * Render the modifier list UI
 * Each filter shows: mini curve preview + enable + name + params + remove
 */
function renderModifierList() {
    const listEl = document.getElementById('modifierList');
    if (!listEl) return;

    const modifierStack = state.get('modifierStack');
    if (!modifierStack || modifierStack.modifiers.length === 0) {
        listEl.innerHTML = '<div class="modifier-empty">No filters · Click a type above to add</div>';
        return;
    }

    listEl.innerHTML = modifierStack.modifiers.map(modifier => `
        <div class="modifier-item ${modifier.enabled ? '' : 'disabled'}" data-id="${modifier.id}" data-type="${modifier.type}" data-category="${modifier.category}">
            <canvas class="modifier-mini-curve" width="60" height="40" data-id="${modifier.id}"></canvas>
            <div class="modifier-content">
                <div class="modifier-header">
                    <input type="checkbox" class="modifier-enable" ${modifier.enabled ? 'checked' : ''}>
                    <span class="modifier-name">${modifier.name}</span>
                    <span class="modifier-response">${modifier.toString()}</span>
                    <button class="modifier-remove" title="Remove">&times;</button>
                </div>
                <div class="modifier-params">
                    ${renderModifierParams(modifier)}
                </div>
            </div>
        </div>
    `).join('');

    // Attach event listeners
    listEl.querySelectorAll('.modifier-item').forEach(item => {
        const id = item.dataset.id;
        const modifier = modifierStack.modifiers.find(m => m.id === id);
        if (!modifier) return;

        // Draw mini curve for this modifier
        const miniCanvas = item.querySelector('.modifier-mini-curve');
        drawModifierMiniCurve(modifier, miniCanvas);

        // Enable/disable toggle
        item.querySelector('.modifier-enable')?.addEventListener('change', (e) => {
            modifier.enabled = e.target.checked;
            item.classList.toggle('disabled', !modifier.enabled);
            state.set('modifierStack', modifierStack);  // triggers updateAllGraphs
            drawModifierMiniCurve(modifier, miniCanvas);
        });

        // Remove button
        item.querySelector('.modifier-remove')?.addEventListener('click', () => {
            modifierStack.remove(id);
            state.set('modifierStack', modifierStack);  // triggers updateAllGraphs
            renderModifierList();
        });

        // Parameter inputs
        item.querySelectorAll('.modifier-param').forEach(input => {
            input.addEventListener('input', (e) => {
                const param = e.target.dataset.param;
                const value = parseFloat(e.target.value);
                modifier[param] = value;

                // Update display
                const display = item.querySelector(`.param-display[data-param="${param}"]`);
                if (display) display.textContent = value;

                // Update response text
                const responseEl = item.querySelector('.modifier-response');
                if (responseEl) responseEl.textContent = modifier.toString();

                // Update mini curve
                drawModifierMiniCurve(modifier, miniCanvas);

                state.set('modifierStack', modifierStack);  // triggers updateAllGraphs
            });
        });
    });
}

/**
 * Render parameter controls for a modifier
 */
function renderModifierParams(modifier) {
    switch (modifier.type) {
        case ModifierType.SHELF:
            return `
                <label>Corner: <input type="range" class="modifier-param" data-param="cornerFreq" min="20" max="120" value="${modifier.cornerFreq}"> <span class="param-display" data-param="cornerFreq">${modifier.cornerFreq}</span>Hz</label>
                <label>Gain: <input type="range" class="modifier-param" data-param="gainDb" min="0" max="12" step="0.5" value="${modifier.gainDb}"> <span class="param-display" data-param="gainDb">${modifier.gainDb}</span>dB</label>
            `;
        case ModifierType.PEAK:
            return `
                <label>Freq: <input type="range" class="modifier-param" data-param="centerFreq" min="20" max="150" value="${modifier.centerFreq}"> <span class="param-display" data-param="centerFreq">${modifier.centerFreq}</span>Hz</label>
                <label>Gain: <input type="range" class="modifier-param" data-param="gainDb" min="0" max="12" step="0.5" value="${modifier.gainDb}"> <span class="param-display" data-param="gainDb">${modifier.gainDb}</span>dB</label>
                <label>Q: <input type="range" class="modifier-param" data-param="q" min="0.5" max="5" step="0.1" value="${modifier.q}"> <span class="param-display" data-param="q">${modifier.q}</span></label>
            `;
        case ModifierType.HPF:
            return `
                <label>Freq: <input type="range" class="modifier-param" data-param="cornerFreq" min="10" max="40" value="${modifier.cornerFreq}"> <span class="param-display" data-param="cornerFreq">${modifier.cornerFreq}</span>Hz</label>
                <label>Slope: <select class="modifier-param" data-param="order">
                    <option value="2" ${modifier.order === 2 ? 'selected' : ''}>12dB/oct</option>
                    <option value="4" ${modifier.order === 4 ? 'selected' : ''}>24dB/oct</option>
                    <option value="6" ${modifier.order === 6 ? 'selected' : ''}>36dB/oct</option>
                </select></label>
            `;
        case ModifierType.LPF:
            return `
                <label>Freq: <input type="range" class="modifier-param" data-param="cornerFreq" min="60" max="200" value="${modifier.cornerFreq}"> <span class="param-display" data-param="cornerFreq">${modifier.cornerFreq}</span>Hz</label>
                <label>Slope: <select class="modifier-param" data-param="order">
                    <option value="2" ${modifier.order === 2 ? 'selected' : ''}>12dB/oct</option>
                    <option value="4" ${modifier.order === 4 ? 'selected' : ''}>24dB/oct</option>
                    <option value="6" ${modifier.order === 6 ? 'selected' : ''}>36dB/oct</option>
                </select></label>
            `;
        default:
            return '';
    }
}

/**
 * Draw mini curve preview for a single modifier
 * Shows the filter's shape in a tiny canvas
 */
function drawModifierMiniCurve(modifier, canvas) {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, width, height);

    // Get curve data from modifier (uses its responseCurve method)
    const fMin = 10, fMax = 200;
    const dbMin = -24, dbMax = 12;
    const curve = modifier.responseCurve(fMin, fMax, 30);

    // Draw 0dB reference line
    const yZero = height * (dbMax / (dbMax - dbMin));
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yZero);
    ctx.lineTo(width, yZero);
    ctx.stroke();

    // Color by filter type
    const colors = {
        [ModifierType.HPF]: '#58a6ff',
        [ModifierType.LPF]: '#a371f7',
        [ModifierType.PEAK]: '#f0883e',
        [ModifierType.SHELF]: '#3fb950'
    };
    const color = colors[modifier.type] || '#8b949e';

    // Draw curve
    ctx.strokeStyle = modifier.enabled ? color : '#6e7681';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    curve.forEach((point, i) => {
        const clampedDb = Math.max(dbMin, Math.min(dbMax, point.db));
        const x = (Math.log(point.frequency / fMin) / Math.log(fMax / fMin)) * width;
        const y = height * ((dbMax - clampedDb) / (dbMax - dbMin));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

/**
 * Setup hover highlighting for settings -> graphs
 *
 * When hovering over a control with data-setting attribute,
 * all graphs affected by that setting will glow.
 */
function setupSettingHighlights() {
    document.querySelectorAll('[data-setting]').forEach(el => {
        el.addEventListener('mouseenter', () => {
            highlightAffectedGraphs(el.dataset.setting);
        });
        el.addEventListener('mouseleave', clearGraphHighlights);
    });
}

// ============================================================================
// SIGNAL CHAIN HEADER
// ============================================================================

/**
 * Setup include/exclude toggles for DSP and Environment in sidebar
 */
function setupIncludeToggles() {
    const dspToggle = document.getElementById('includeDspToggle');
    const envToggle = document.getElementById('includeEnvironmentToggle');

    // Initialize state - both off by default (show raw curves)
    state.set('includeDsp', false);
    state.set('includeEnvironment', false);

    if (dspToggle) {
        dspToggle.addEventListener('change', (e) => {
            state.set('includeDsp', e.target.checked);
        });
    }

    if (envToggle) {
        envToggle.addEventListener('change', (e) => {
            state.set('includeEnvironment', e.target.checked);
        });
    }
}

// ============================================================================
// LAYOUT CONTROLS - Driver, Box Type, Sliders, Graphs
// ============================================================================

function initLayoutControls() {
    // ========================================================================
    // DRIVER SECTION
    // ========================================================================

    const driverSelect = document.getElementById('driverSelect');
    const oldDriverSelect = document.getElementById('driverSelect');

    // Helper: Calculate EBP (Efficiency Bandwidth Product)
    // EBP = Fs / Qes. Rule of thumb: < 50 favors sealed, > 90 favors ported
    function calculateEbp(driverData) {
        if (!driverData?.fs || !driverData?.qes) return null;
        return driverData.fs / driverData.qes;
    }

    // Helper: Format EBP with guidance
    function formatEbp(ebp) {
        if (ebp === null) return '--';
        const hint = ebp < 50 ? '→ sealed' : ebp > 90 ? '→ ported' : '';
        return `${ebp.toFixed(0)} ${hint}`.trim();
    }

    // Helper: Update driver specs display in new panel
    function updateDriverSpecsNew(driverData) {
        const ebp = calculateEbp(driverData);
        const specs = {
            'driverFs': driverData?.fs ? `${driverData.fs} Hz` : '--',
            'driverQts': driverData?.qts ? driverData.qts.toFixed(2) : '--',
            'driverVas': driverData?.vas ? `${driverData.vas.toFixed(0)} L` : '--',
            'driverXmax': driverData?.xmax ? `${driverData.xmax} mm` : '--',
            'driverPe': driverData?.pe ? `${driverData.pe} W` : '--',
            'driverSd': driverData?.sd ? `${driverData.sd.toFixed(0)} cm²` : '--',
            'driverEbp': formatEbp(ebp)
        };
        for (const [id, value] of Object.entries(specs)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }
    }

    // Sync driver dropdowns
    if (driverSelect && oldDriverSelect) {
        // Copy options from old select
        driverSelect.innerHTML = oldDriverSelect.innerHTML;
        driverSelect.value = oldDriverSelect.value;

        driverSelect.addEventListener('change', () => {
            oldDriverSelect.value = driverSelect.value;
            oldDriverSelect.dispatchEvent(new Event('change'));
        });

        // Keep new dropdown in sync when old one changes
        oldDriverSelect.addEventListener('change', () => {
            driverSelect.value = oldDriverSelect.value;
        });
    }

    // Wire up library button - call openDriverLibrary directly
    const importDriverBtn = document.getElementById('importDriverBtn');
    if (importDriverBtn) {
        importDriverBtn.addEventListener('click', () => openDriverLibrary());
    }

    // Update specs when driver changes
    state.subscribe('driverData', (driverData) => {
        updateDriverSpecsNew(driverData);
    });

    // Initial driver specs update
    updateDriverSpecsNew(state.get('driverData'));

    // ========================================================================
    // DRIVER INFO MODAL
    // ========================================================================

    const driverInfoModal = document.getElementById('driverInfoModal');
    const driverInfoBtn = document.getElementById('driverInfoBtn');
    const driverInfoClose = document.getElementById('driverInfoClose');
    const driverInfoCloseBtn = document.getElementById('driverInfoCloseBtn');
    const driverInfoEdit = document.getElementById('driverInfoEdit');

    // Helper: Calculate derived values
    function calculateDerivedValues(d) {
        const derived = {};

        // EBP = Fs / Qes (always derived)
        if (d?.fs && d?.qes) {
            derived.ebp = d.fs / d.qes;
            derived.ebpHint = derived.ebp < 50 ? 'favors sealed' : derived.ebp > 90 ? 'favors ported' : 'either';
        }

        // Effective diameter from Sd (always derived)
        if (d?.sd) {
            derived.effectiveDiameter = 2 * Math.sqrt(d.sd / Math.PI);  // cm
        }

        // Vd = Sd × Xmax (stored in cm³ to match spec sheets and Driver model)
        // Sd in cm², Xmax in mm → Xmax/10 gives cm → Sd × Xmax/10 = cm³
        if (d?.sd && d?.xmax) {
            derived.vdCalculated = (d.sd * d.xmax) / 10;  // cm³
        }

        // Qts from Qes and Qms (for consistency check)
        if (d?.qes && d?.qms) {
            derived.qtsCalculated = (d.qes * d.qms) / (d.qes + d.qms);
        }

        // Sensitivity from eta0 (Small 1972) - use foundation function
        if (d?.fs && d?.vas && d?.qes && d?.re) {
            const vasSI = d.vas / 1000;  // liters to m³
            const eta0 = calculateEta0(d.fs, vasSI, d.qes);
            derived.sensitivityCalculated = calculateSensitivity2v83(eta0, d.re);
        }

        return derived;
    }

    // Helper: Check for discrepancies
    function checkDiscrepancies(d, derived) {
        const warnings = [];
        const threshold = 0.03;  // 3% tolerance

        // Qts vs calculated Qts
        if (d?.qts && derived.qtsCalculated) {
            const diff = Math.abs(d.qts - derived.qtsCalculated) / d.qts;
            if (diff > threshold) {
                warnings.push(`Qts (${d.qts.toFixed(2)}) differs from Qes/Qms calculation (${derived.qtsCalculated.toFixed(2)}) by ${(diff * 100).toFixed(0)}%`);
            }
        }

        // Vd vs calculated Vd (if user entered Vd) - both in cm³
        if (d?.vd && derived.vdCalculated) {
            const diff = Math.abs(d.vd - derived.vdCalculated) / d.vd;
            if (diff > threshold) {
                const enteredL = (d.vd / 1000).toFixed(1);
                const calcL = (derived.vdCalculated / 1000).toFixed(1);
                warnings.push(`Vd (${enteredL} L) differs from Sd×Xmax (${calcL} L) by ${(diff * 100).toFixed(0)}%`);
            }
        }

        // Sensitivity vs calculated (if user entered sensitivity)
        if (d?.sensitivity && derived.sensitivityCalculated) {
            const diff = Math.abs(d.sensitivity - derived.sensitivityCalculated);
            if (diff > 1) {  // 1dB tolerance for sensitivity
                warnings.push(`Sensitivity (${d.sensitivity.toFixed(1)} dB) differs from calculated (${derived.sensitivityCalculated.toFixed(1)} dB) by ${diff.toFixed(1)} dB`);
            }
        }

        return warnings;
    }

    // Helper: Format param row
    function formatParam(name, value, unit, source = null, warning = null) {
        const valueClass = value === null || value === undefined ? 'missing' : (source === 'derived' ? 'derived' : '');
        const displayValue = value === null || value === undefined ? '—' :
            (typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(value < 10 ? 2 : 1)) : value);

        let html = `<div class="driver-info-param">
            <span class="driver-info-param-name">${name}</span>
            <span>
                <span class="driver-info-param-value ${valueClass}">${displayValue}${unit ? ' ' + unit : ''}</span>`;
        if (source) {
            html += `<span class="driver-info-param-source">${source}</span>`;
        }
        if (warning) {
            html += `<span class="driver-info-param-warning">⚠ ${warning}</span>`;
        }
        html += `</span></div>`;
        return html;
    }

    // Populate driver info modal
    function populateDriverInfoModal(driverData) {
        const d = driverData;
        const derived = calculateDerivedValues(d);
        const warnings = checkDiscrepancies(d, derived);

        // Update title
        document.getElementById('driverInfoTitle').textContent = d?.name || 'Driver Parameters';

        // Thiele-Small section
        const tsHtml = [
            formatParam('Fs', d?.fs, 'Hz', 'entered'),
            formatParam('Qts', d?.qts, '', 'entered',
                derived.qtsCalculated && Math.abs(d?.qts - derived.qtsCalculated) / d?.qts > 0.03
                    ? `calc: ${derived.qtsCalculated.toFixed(2)}` : null),
            formatParam('Qes', d?.qes, '', 'entered'),
            formatParam('Qms', d?.qms, '', d?.qms ? 'entered' : null),
            formatParam('Vas', d?.vas, 'L', 'entered'),
        ].join('');
        document.getElementById('driverInfoTS').innerHTML = tsHtml;

        // Electro-Mechanical section
        const emHtml = [
            formatParam('Re', d?.re, 'Ω', 'entered'),
            formatParam('Le', d?.le, 'mH', d?.le ? 'entered' : null),
            formatParam('Bl', d?.bl, 'Tm', d?.bl ? 'entered' : null),
            formatParam('Mms', d?.mms, 'g', d?.mms ? 'entered' : null),
            formatParam('Sd', d?.sd, 'cm²', d?.sd ? 'entered' : null),
        ].join('');
        document.getElementById('driverInfoEM').innerHTML = emHtml;

        // Limits section
        // Vd stored in cm³, display in liters
        const vdLiters = d?.vd ? d.vd / 1000 : (derived.vdCalculated ? derived.vdCalculated / 1000 : null);
        const limitsHtml = [
            formatParam('Xmax', d?.xmax, 'mm', d?.xmax ? 'entered' : null),
            formatParam('Pe', d?.pe, 'W', d?.pe ? 'entered' : null),
            formatParam('Vd', vdLiters, 'L', d?.vd ? 'entered' : 'Sd×Xmax'),
            formatParam('Sensitivity', d?.sensitivity || derived.sensitivityCalculated, 'dB/W/m',
                d?.sensitivity ? 'entered' : (derived.sensitivityCalculated ? 'calculated' : null)),
        ].join('');
        document.getElementById('driverInfoLimits').innerHTML = limitsHtml;

        // Derived section (always calculated)
        const derivedHtml = [
            formatParam('EBP', derived.ebp, '', derived.ebpHint ? `→ ${derived.ebpHint}` : null),
            formatParam('Eff. Ø', derived.effectiveDiameter, 'cm', 'from Sd'),
        ].join('');
        document.getElementById('driverInfoDerived').innerHTML = derivedHtml;

        // Warnings
        document.getElementById('driverInfoWarnings').innerHTML = warnings.length
            ? warnings.map(w => `⚠ ${w}`).join('<br>')
            : '';

        // Capabilities
        const hasBasic = d?.fs && d?.qts && d?.vas;
        const hasElectrical = d?.qes && d?.re;
        const hasEngineering = d?.xmax && d?.sd && d?.bl && d?.mms;
        const hasThermal = d?.pe;

        const caps = [
            `<span class="${hasBasic ? 'capability-available' : 'capability-unavailable'}">${hasBasic ? '✓' : '✗'} Response curves</span>`,
            `<span class="${hasElectrical ? 'capability-available' : 'capability-unavailable'}">${hasElectrical ? '✓' : '✗'} Impedance</span>`,
            `<span class="${hasElectrical ? 'capability-available' : 'capability-unavailable'}">${hasElectrical ? '✓' : '✗'} SPL (needs Qes)</span>`,
            `<span class="${hasEngineering ? 'capability-available' : 'capability-unavailable'}">${hasEngineering ? '✓' : '✗'} Excursion limits</span>`,
            `<span class="${hasThermal ? 'capability-available' : 'capability-unavailable'}">${hasThermal ? '✓' : '✗'} Thermal limits</span>`,
        ].join(' &nbsp;•&nbsp; ');
        document.getElementById('driverInfoCapabilities').innerHTML = caps;
    }

    // Open driver info modal
    function openDriverInfoModal() {
        const driverData = state.get('driverData');
        if (!driverData) return;
        populateDriverInfoModal(driverData);
        driverInfoModal?.classList.add('visible');
    }

    // Close driver info modal
    function closeDriverInfoModal() {
        driverInfoModal?.classList.remove('visible');
    }

    // Wire up driver info modal
    driverInfoBtn?.addEventListener('click', openDriverInfoModal);
    driverInfoClose?.addEventListener('click', closeDriverInfoModal);
    driverInfoCloseBtn?.addEventListener('click', closeDriverInfoModal);
    driverInfoModal?.addEventListener('click', (e) => {
        if (e.target === driverInfoModal) closeDriverInfoModal();
    });

    // Edit button opens driver library with current driver
    driverInfoEdit?.addEventListener('click', () => {
        closeDriverInfoModal();
        const driverData = state.get('driverData');
        if (driverData) {
            openDriverLibraryWithDriver(driverData);
        } else {
            openDriverLibrary();
        }
    });

    // ========================================================================
    // ENCLOSURE SECTION - Dense inline controls
    // ========================================================================

    const sealedBtn = document.getElementById('sealedBtn');
    const portedBtn = document.getElementById('portedBtn');
    const prBtn = document.getElementById('prBtn');
    const portInfoDisplay = document.getElementById('portInfoDisplay');

    // Ported-only controls
    const tuningGroup = document.getElementById('tuningGroup');
    const portGroup = document.getElementById('portGroup');

    // PR-only controls
    const prTuningGroup = document.getElementById('prTuningGroup');
    const prSdGroup = document.getElementById('prSdGroup');
    const prXmaxGroup = document.getElementById('prXmaxGroup');
    const prMassInline = document.getElementById('prMassInline');

    // Port options popover
    const portOptionsBtn = document.getElementById('portOptionsBtn');
    const portOptionsPopover = document.getElementById('portOptionsPopover');
    const portShapeCircular = document.getElementById('portShapeCircular');
    const portShapeRect = document.getElementById('portShapeRect');
    const portQtyButtons = document.querySelectorAll('.popover-buttons [data-qty]');
    const portFlareNone = document.getElementById('portFlareNone');
    const portFlareOne = document.getElementById('portFlareOne');
    const portFlareBoth = document.getElementById('portFlareBoth');

    function updateBoxTypeUI(boxType) {
        const isSealed = boxType === 'sealed';
        const isPorted = boxType === 'ported';
        const isPR = boxType === 'pr';

        // Button states
        sealedBtn?.classList.toggle('active', isSealed);
        portedBtn?.classList.toggle('active', isPorted);
        prBtn?.classList.toggle('active', isPR);

        // Show/hide ported controls
        tuningGroup?.classList.toggle('hidden', !isPorted);
        portGroup?.classList.toggle('hidden', !isPorted);

        // Show/hide PR controls
        prTuningGroup?.classList.toggle('hidden', !isPR);
        prSdGroup?.classList.toggle('hidden', !isPR);
        prXmaxGroup?.classList.toggle('hidden', !isPR);

        // Update PR mass calculation when PR is selected
        if (isPR) {
            updatePRMassDisplay();
        }

        // Results bar port info
        if (portInfoDisplay) portInfoDisplay.classList.toggle('hidden', !isPorted);
    }

    sealedBtn?.addEventListener('click', () => {
        state.set('boxType', 'sealed');
    });

    portedBtn?.addEventListener('click', () => {
        state.set('boxType', 'ported');
    });

    prBtn?.addEventListener('click', () => {
        state.set('boxType', 'pr');
    });

    // Port options popover toggle
    portOptionsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        portOptionsPopover?.classList.toggle('hidden');
        // Position near the button
        if (portOptionsPopover && !portOptionsPopover.classList.contains('hidden')) {
            const rect = portOptionsBtn.getBoundingClientRect();
            portOptionsPopover.style.top = (rect.bottom + 8) + 'px';
            portOptionsPopover.style.left = rect.left + 'px';
        }
    });

    // Close popover when clicking outside
    document.addEventListener('click', (e) => {
        if (!portOptionsPopover?.contains(e.target) && e.target !== portOptionsBtn) {
            portOptionsPopover?.classList.add('hidden');
        }
    });

    // Port shape toggle
    portShapeCircular?.addEventListener('click', () => {
        state.set('portShape', 'circular');
        portShapeCircular.classList.add('active');
        portShapeRect?.classList.remove('active');
    });
    portShapeRect?.addEventListener('click', () => {
        state.set('portShape', 'rectangular');
        portShapeRect.classList.add('active');
        portShapeCircular?.classList.remove('active');
    });

    // Port quantity buttons
    portQtyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const qty = parseInt(btn.dataset.qty);
            state.set('portQuantity', qty);
            portQtyButtons.forEach(b => b.classList.toggle('active', b === btn));
        });
    });

    // Port flare buttons
    portFlareNone?.addEventListener('click', () => {
        state.set('portFlare', 'none');
        portFlareNone.classList.add('active');
        portFlareOne?.classList.remove('active');
        portFlareBoth?.classList.remove('active');
    });
    portFlareOne?.addEventListener('click', () => {
        state.set('portFlare', 'one');
        portFlareOne.classList.add('active');
        portFlareNone?.classList.remove('active');
        portFlareBoth?.classList.remove('active');
    });
    portFlareBoth?.addEventListener('click', () => {
        state.set('portFlare', 'both');
        portFlareBoth.classList.add('active');
        portFlareNone?.classList.remove('active');
        portFlareOne?.classList.remove('active');
    });

    // Subscribe to boxType changes
    state.subscribe('boxType', updateBoxTypeUI);
    updateBoxTypeUI(state.require('boxType'));

    // PR mass calculation display
    // Formula: Mmp = ρc² / (4π²fb²Vb) where ρc² ≈ 141000 Pa (at 20°C)
    // This gives required mass in kg for target tuning
    function updatePRMassDisplay() {
        if (!prMassInline) return;

        const boxType = state.get('boxType');
        if (boxType !== 'pr') return;

        const fb = state.require('tuningFrequency');
        const volumeLiters = state.require('volumeLiters');
        const prSd = state.require('prArea');

        // Convert to SI units
        const vbSI = volumeLiters / 1000;  // m³
        const sdSI = prSd / 10000;         // m² (from cm²)

        // Calculate required mass using simplified formula (ignoring PR compliance)
        // Full formula would use foundation/vented/passive-radiator.js calculateRequiredMass
        // but we can approximate: Mmp = (ρc² × Sd²) / (4π²fb²Vb)
        const RHO_C_SQUARED = 141000;  // Pa (ρc² at 20°C)
        const requiredMassKg = (RHO_C_SQUARED * sdSI * sdSI) / (4 * Math.PI * Math.PI * fb * fb * vbSI);
        const requiredMassGrams = requiredMassKg * 1000;

        // Update display
        if (requiredMassGrams > 10 && requiredMassGrams < 2000) {
            prMassInline.textContent = requiredMassGrams.toFixed(0);
            // Store calculated mass for box-builder to use
            state.set('prMassCalculated', requiredMassGrams);
        } else {
            prMassInline.textContent = '--';
            state.set('prMassCalculated', null);
        }
    }

    // Update mass display when relevant inputs change
    state.subscribe('tuningFrequency', updatePRMassDisplay);
    state.subscribe('volumeLiters', updatePRMassDisplay);
    state.subscribe('prArea', updatePRMassDisplay);
    state.subscribe('boxType', updatePRMassDisplay);

    // Initial calculation
    updatePRMassDisplay();

    // ========================================================================
    // SIGNAL CHAIN TOGGLES - HPF, EQ to Flat, Room, Target
    // ========================================================================

    function setupSignalToggle(toggleId, onActivate, onDeactivate) {
        const toggle = document.getElementById(toggleId);
        if (!toggle) return;

        const checkbox = toggle.querySelector('input[type="checkbox"]');
        if (!checkbox) return;

        // Only listen to checkbox change - clicking the label automatically toggles the checkbox
        checkbox.addEventListener('change', () => {
            toggle.classList.toggle('active', checkbox.checked);
            if (checkbox.checked) {
                onActivate();
            } else {
                onDeactivate();
            }
        });
    }

    // Track signal chain modifier IDs so we can remove them
    let hpfModifierId = null;
    let lpfModifierId = null;
    let roomGainModifierId = null;

    // HPF frequency slider and value display
    const hpfFreqSlider = document.getElementById('hpfFreqSlider');
    const hpfFreqValue = document.getElementById('hpfFreqValue');
    let currentHpfFreq = 20;

    function updateHpfModifier() {
        if (!hpfModifierId) return;
        const modifierStack = state.get('modifierStack');
        const modifier = modifierStack.modifiers.find(m => m.id === hpfModifierId);
        if (modifier) {
            modifier.cornerFreq = currentHpfFreq;
            modifier.name = `HPF ${currentHpfFreq}Hz`;
            state.set('modifierStack', modifierStack);
        }
    }

    if (hpfFreqSlider) {
        hpfFreqSlider.addEventListener('input', (e) => {
            currentHpfFreq = parseInt(e.target.value);
            if (hpfFreqValue) hpfFreqValue.textContent = `${currentHpfFreq} Hz`;
            updateHpfModifier();
        });
    }

    // HPF Toggle
    setupSignalToggle('hpfToggle',
        () => {
            const modifierStack = state.get('modifierStack');
            if (!hpfModifierId) {
                const mod = modifierStack.add({
                    type: ModifierType.HPF,
                    category: ModifierCategory.SIGNAL,
                    name: `HPF ${currentHpfFreq}Hz`,
                    cornerFreq: currentHpfFreq,
                    order: 4
                });
                hpfModifierId = mod.id;
            }
            state.set('includeDsp', true);
            document.getElementById('includeDspToggle').checked = true;
            state.set('modifierStack', modifierStack);
            renderModifierList();
        },
        () => {
            if (hpfModifierId) {
                const modifierStack = state.get('modifierStack');
                modifierStack.remove(hpfModifierId);
                hpfModifierId = null;
                state.set('modifierStack', modifierStack);
                renderModifierList();
            }
        }
    );

    // LPF frequency slider and value display
    const lpfFreqSlider = document.getElementById('lpfFreqSlider');
    const lpfFreqValue = document.getElementById('lpfFreqValue');
    let currentLpfFreq = 80;

    function updateLpfModifier() {
        if (!lpfModifierId) return;
        const modifierStack = state.get('modifierStack');
        const modifier = modifierStack.modifiers.find(m => m.id === lpfModifierId);
        if (modifier) {
            modifier.cornerFreq = currentLpfFreq;
            modifier.name = `LPF ${currentLpfFreq}Hz`;
            state.set('modifierStack', modifierStack);
        }
    }

    if (lpfFreqSlider) {
        lpfFreqSlider.addEventListener('input', (e) => {
            currentLpfFreq = parseInt(e.target.value);
            if (lpfFreqValue) lpfFreqValue.textContent = `${currentLpfFreq} Hz`;
            updateLpfModifier();
        });
    }

    // LPF Toggle (crossover)
    setupSignalToggle('lpfToggle',
        () => {
            const modifierStack = state.get('modifierStack');
            if (!lpfModifierId) {
                const mod = modifierStack.add({
                    type: ModifierType.LPF,
                    category: ModifierCategory.SIGNAL,
                    name: `LPF ${currentLpfFreq}Hz`,
                    cornerFreq: currentLpfFreq,
                    order: 4
                });
                lpfModifierId = mod.id;
            }
            state.set('includeDsp', true);
            document.getElementById('includeDspToggle').checked = true;
            state.set('modifierStack', modifierStack);
            renderModifierList();
        },
        () => {
            if (lpfModifierId) {
                const modifierStack = state.get('modifierStack');
                modifierStack.remove(lpfModifierId);
                lpfModifierId = null;
                state.set('modifierStack', modifierStack);
                renderModifierList();
            }
        }
    );

    // EQ Flat - generates PEQ bands to flatten response down to a target frequency
    const eqFlatHint = document.getElementById('eqFlatHint');
    const eqFlatToggle = document.getElementById('eqFlatToggle');
    const eqFlatToggleCheckbox = eqFlatToggle?.querySelector('input[type="checkbox"]');
    const eqFlatToggleText = document.getElementById('eqFlatToggleText');
    const eqFlatFreqSlider = document.getElementById('eqFlatFreqSlider');
    const eqFlatFreqValue = document.getElementById('eqFlatFreqValue');
    const eqFlatGenerateBtn = document.getElementById('eqFlatGenerateBtn');
    const eqFlatClearBtn = document.getElementById('eqFlatClearBtn');
    const eqFlatSourceSelect = document.getElementById('eqFlatSourceSelect');
    let eqFlatTargetFreq = 25;
    let eqFlatSource = 'box+room';
    let eqFlatModifierIds = [];  // May need multiple PEQ bands
    let eqFlatEnabled = true;    // Whether PEQ bands are currently enabled

    if (eqFlatFreqSlider) {
        eqFlatFreqSlider.addEventListener('input', (e) => {
            eqFlatTargetFreq = parseInt(e.target.value);
            if (eqFlatFreqValue) eqFlatFreqValue.textContent = `${eqFlatTargetFreq} Hz`;
        });
    }

    if (eqFlatSourceSelect) {
        eqFlatSourceSelect.addEventListener('change', (e) => {
            eqFlatSource = e.target.value;
        });
    }

    /**
     * Get combined response at frequency (box + optional room gain)
     */
    function getCombinedResponseAt(box, frequency, includeRoom) {
        let response = box.responseAt(frequency);
        if (includeRoom && roomGainModifierId) {
            const modifierStack = state.get('modifierStack');
            const roomMod = modifierStack.modifiers.find(m => m.id === roomGainModifierId);
            if (roomMod && roomMod.enabled) {
                response += roomMod.magnitudeAt(frequency);
            }
        }
        return response;
    }

    /**
     * Calculate PEQ bands needed to flatten response down to targetFreq
     * Simple approach: sample response, generate inverse PEQ at key frequencies
     */
    function calculateFlatteningEQ(box, targetFreq, includeRoom) {
        if (!box) return { bands: [], summary: '--' };

        const getResponse = (f) => getCombinedResponseAt(box, f, includeRoom);

        // Reference: response at 100Hz (passband)
        const passbandRef = getResponse(100);

        // Fixed frequencies that cover the bass range well (denser around typical hump region)
        const freqs = [16, 20, 25, 32, 40, 50, 63, 80];

        // Get deviation at each frequency
        const bands = [];
        for (const freq of freqs) {
            if (freq < targetFreq) continue;

            const deviation = getResponse(freq) - passbandRef;

            // Only create band if deviation is significant (>1.5dB)
            if (Math.abs(deviation) > 1.5) {
                // Use higher Q (narrower) for boosts to prevent bleeding into midrange
                // Use lower Q (wider) for cuts
                const isBoost = deviation < 0;
                const q = isBoost ? 2.0 : 0.7;

                bands.push({
                    type: 'peak',
                    centerFreq: freq,
                    gainDb: Math.round(-deviation * 2) / 2,  // Invert and round to 0.5dB
                    q
                });
            }
        }

        const summary = bands.length === 0 ? 'Already flat' : `${bands.length} PEQ bands`;
        return { bands, summary };
    }

    function updateEqFlatHint() {
        const box = state.get('box');
        const includeRoom = eqFlatSource === 'box+room';
        const { summary } = calculateFlatteningEQ(box, eqFlatTargetFreq, includeRoom);
        const hasActiveBands = eqFlatModifierIds.length > 0;

        // Show toggle when bands exist, hide hint; show hint when no bands
        if (eqFlatToggle) {
            eqFlatToggle.classList.toggle('hidden', !hasActiveBands);
            if (hasActiveBands && eqFlatToggleText) {
                eqFlatToggleText.textContent = summary;
            }
        }
        if (eqFlatHint) {
            eqFlatHint.classList.toggle('hidden', hasActiveBands);
            if (!hasActiveBands) {
                eqFlatHint.textContent = `Would generate: ${summary}`;
            }
        }
    }

    function generateEqFlat() {
        const modifierStack = state.get('modifierStack');

        // Remove ALL existing EQ_DEMAND modifiers (not just ones we created)
        const toRemove = modifierStack.modifiers
            .filter(m => m.category === ModifierCategory.EQ_DEMAND)
            .map(m => m.id);
        toRemove.forEach(id => modifierStack.remove(id));
        eqFlatModifierIds = [];

        // Calculate new bands
        const box = state.get('box');
        const includeRoom = eqFlatSource === 'box+room';
        const { bands } = calculateFlatteningEQ(box, eqFlatTargetFreq, includeRoom);

        if (bands.length === 0) {
            if (eqFlatHint) eqFlatHint.textContent = 'Already flat - no EQ needed';
            state.set('modifierStack', modifierStack);
            renderModifierList();
            return;
        }

        // Add new modifiers
        bands.forEach((band, i) => {
            const mod = modifierStack.add({
                type: band.type === 'shelf' ? ModifierType.SHELF : ModifierType.PEAK,
                category: ModifierCategory.EQ_DEMAND,
                name: `Auto EQ ${i + 1}`,
                ...(band.type === 'shelf'
                    ? { cornerFreq: band.cornerFreq, gainDb: band.gainDb, slope: band.slope }
                    : { centerFreq: band.centerFreq, gainDb: band.gainDb, q: band.q })
            });
            eqFlatModifierIds.push(mod.id);
        });

        state.set('includeDsp', true);
        const dspToggle = document.getElementById('includeDspToggle');
        if (dspToggle) dspToggle.checked = true;

        // Ensure toggle is checked when generating new EQ
        eqFlatEnabled = true;
        if (eqFlatToggleCheckbox) eqFlatToggleCheckbox.checked = true;

        state.set('modifierStack', modifierStack);
        renderModifierList();
        updateEqFlatHint();

        // Store to localStorage so playground can load it
        const playgroundFilters = bands.map((band) => ({
            type: 'PEQ',
            enabled: true,
            freq: band.centerFreq,
            gain: band.gainDb,
            q: band.q
        }));
        localStorage.setItem('boxsmith_autoEQ', JSON.stringify(playgroundFilters));
    }

    function clearEqFlat() {
        if (eqFlatModifierIds.length === 0) return;

        const modifierStack = state.get('modifierStack');
        eqFlatModifierIds.forEach(id => modifierStack.remove(id));
        eqFlatModifierIds = [];
        state.set('modifierStack', modifierStack);
        renderModifierList();
        updateEqFlatHint();
    }

    if (eqFlatGenerateBtn) {
        eqFlatGenerateBtn.addEventListener('click', generateEqFlat);
    }

    if (eqFlatClearBtn) {
        eqFlatClearBtn.addEventListener('click', clearEqFlat);
    }

    // Toggle to enable/disable PEQ bands without removing them
    if (eqFlatToggleCheckbox) {
        eqFlatToggleCheckbox.addEventListener('change', (e) => {
            eqFlatEnabled = e.target.checked;
            const modifierStack = state.get('modifierStack');
            eqFlatModifierIds.forEach(id => {
                const mod = modifierStack.modifiers.find(m => m.id === id);
                if (mod) mod.enabled = eqFlatEnabled;
            });
            state.set('modifierStack', modifierStack);
            renderModifierList();
        });
    }

    // Update hint when box or room changes
    state.subscribe('box', updateEqFlatHint);
    state.subscribe('modifierStack', updateEqFlatHint);
    updateEqFlatHint();

    // Room Gain - gain, corner frequency, and shape controls
    const roomGainSlider = document.getElementById('roomGainSlider');
    const roomGainValue = document.getElementById('roomGainValue');
    const roomFreqSlider = document.getElementById('roomFreqSlider');
    const roomFreqValue = document.getElementById('roomFreqValue');
    const roomShapeSelect = document.getElementById('roomShapeSelect');
    let currentRoomGain = 6;
    let currentRoomFreq = 30;
    let currentRoomShape = '2nd';

    function updateRoomGainModifier() {
        if (!roomGainModifierId) return;
        const modifierStack = state.get('modifierStack');
        const modifier = modifierStack.modifiers.find(m => m.id === roomGainModifierId);
        if (modifier) {
            modifier.gainDb = currentRoomGain;
            modifier.cornerFreq = currentRoomFreq;
            modifier.shape = currentRoomShape;
            const shapeLabel = currentRoomShape === 'shelf' ? 'shelf' : `${currentRoomShape} order`;
            modifier.name = `Room +${currentRoomGain}dB @ ${currentRoomFreq}Hz (${shapeLabel})`;
            state.set('modifierStack', modifierStack);
        }
    }

    if (roomGainSlider) {
        roomGainSlider.addEventListener('input', (e) => {
            currentRoomGain = parseInt(e.target.value);
            if (roomGainValue) roomGainValue.textContent = `+${currentRoomGain} dB`;
            updateRoomGainModifier();
        });
    }

    if (roomFreqSlider) {
        roomFreqSlider.addEventListener('input', (e) => {
            currentRoomFreq = parseInt(e.target.value);
            if (roomFreqValue) roomFreqValue.textContent = `${currentRoomFreq} Hz`;
            updateRoomGainModifier();
        });
    }

    if (roomShapeSelect) {
        roomShapeSelect.addEventListener('change', (e) => {
            currentRoomShape = e.target.value;
            updateRoomGainModifier();
        });
    }

    setupSignalToggle('roomGainToggle',
        () => {
            const modifierStack = state.get('modifierStack');
            if (!roomGainModifierId) {
                const shapeLabel = currentRoomShape === 'shelf' ? 'shelf' : `${currentRoomShape} order`;
                const mod = modifierStack.add({
                    type: ModifierType.ROOM_GAIN,
                    category: ModifierCategory.ROOM_GAIN,
                    name: `Room +${currentRoomGain}dB @ ${currentRoomFreq}Hz (${shapeLabel})`,
                    cornerFreq: currentRoomFreq,
                    gainDb: currentRoomGain,
                    shape: currentRoomShape
                });
                roomGainModifierId = mod.id;
            }
            state.set('includeEnvironment', true);
            document.getElementById('includeEnvironmentToggle').checked = true;
            state.set('modifierStack', modifierStack);
            renderModifierList();
        },
        () => {
            if (roomGainModifierId) {
                const modifierStack = state.get('modifierStack');
                modifierStack.remove(roomGainModifierId);
                roomGainModifierId = null;
                state.set('modifierStack', modifierStack);
                renderModifierList();
            }
        }
    );

    // Target SPL slider and toggle
    const targetSplSlider = document.getElementById('targetSplSlider');
    const targetSplValue = document.getElementById('targetSplValue');

    if (targetSplSlider) {
        targetSplSlider.addEventListener('input', (e) => {
            const spl = parseInt(e.target.value);
            if (targetSplValue) targetSplValue.textContent = `${spl} dB`;
            state.set('targetSpl', spl);
        });
    }

    setupSignalToggle('targetSplToggle',
        () => {
            // Enable target line on headroom graph
            // The headroom graph already uses targetSpl from state
        },
        () => {
            // Target toggle off - could hide target line
        }
    );

    // ========================================================================
    // RESULTS BAR - Live Metrics
    // ========================================================================

    function updateResultsBar() {
        const box = state.get('box');
        if (!box) return;

        const driver = state.get('driverData');
        const power = state.require('power');
        const modifierStack = state.get('modifierStack');
        const includeEnv = state.get('includeEnvironment');

        // F3
        const f3El = document.getElementById('f3Value');
        if (f3El) {
            f3El.textContent = box.f3 ? `${box.f3.toFixed(1)} Hz` : '--';
        }

        // Qtc (sealed) or Fb (ported)
        const qtcLabel = document.getElementById('qtcLabel');
        const qtcEl = document.getElementById('qtcValue');
        if (qtcEl && qtcLabel) {
            if (box.qtc !== undefined) {
                qtcLabel.textContent = 'Qtc';
                qtcEl.textContent = box.qtc.toFixed(2);
                // Warn if Qtc is high (peaky) or low (overdamped)
                qtcEl.classList.toggle('warning', box.qtc > 1.1 || box.qtc < 0.5);
            } else if (box.fb !== undefined) {
                qtcLabel.textContent = 'Fb';
                qtcEl.textContent = `${box.fb.toFixed(0)} Hz`;
                qtcEl.classList.remove('warning');
            } else {
                qtcLabel.textContent = 'Qtc';
                qtcEl.textContent = '--';
                qtcEl.classList.remove('warning');
            }
        }

        // Sensitivity
        const sensEl = document.getElementById('sensitivityValue');
        if (sensEl) {
            sensEl.textContent = driver?.sensitivity ? `${driver.sensitivity.toFixed(1)} dB` : '--';
        }

        // Max SPL @ 30Hz
        const maxSplEl = document.getElementById('maxSplValue');
        if (maxSplEl && box.canCalculateSpl && box.canCalculateLimits) {
            try {
                const result = box.maxSplAt(30);
                let maxSpl = result.maxSpl;

                // Apply room gain if enabled
                if (includeEnv && modifierStack) {
                    maxSpl += modifierStack.roomGainAt(30);
                }

                maxSplEl.textContent = `${maxSpl.toFixed(0)} dB`;
            } catch {
                maxSplEl.textContent = '--';
            }
        } else if (maxSplEl) {
            maxSplEl.textContent = '--';
        }

        // Warnings
        const warningEl = document.getElementById('resultWarning');
        const warningTextEl = document.getElementById('resultWarningText');
        if (warningEl && warningTextEl) {
            const warnings = box.warnings || [];
            if (warnings.length > 0) {
                warningEl.style.display = 'flex';
                warningTextEl.textContent = warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`;
            } else {
                warningEl.style.display = 'none';
            }
        }

        // Port info row (ported only) - in results bar
        updatePortInfoRow(box, power);
        // Port config summary - in vent config panel
        updatePortConfigSummary(box, power);
    }

    /**
     * Calculate port velocity status at tuning frequency (worst case).
     * Returns { velocity, status } or null if calculation fails.
     * Status is 'ok', 'warn', or 'bad' based on VELOCITY_LIMITS thresholds.
     */
    function getPortVelocityStatus(box, power) {
        if (!box.isVented || !box.portVelocityAt) return null;

        try {
            const result = box.portVelocityAt(box.fb, power);
            const velocity = result?.velocity ?? result;
            if (velocity == null) return null;

            const quietLimit = VELOCITY_LIMITS.quiet;
            const maxLimit = VELOCITY_LIMITS.acceptable;
            let status;
            if (velocity < quietLimit) {
                status = 'ok';
            } else if (velocity < maxLimit) {
                status = 'warn';
            } else {
                status = 'bad';
            }
            return { velocity, status };
        } catch {
            return null;
        }
    }

    function updatePortInfoRow(box, power) {
        const dimensionsEl = document.getElementById('portDimensionsDisplay');
        const velocityEl = document.getElementById('portVelocityDisplay');

        if (!dimensionsEl || !velocityEl) return;
        if (!box.isVented || !box.portLengthCm) return;

        // Port dimensions
        const diameter = state.require('portDiameter');
        dimensionsEl.textContent = `${diameter}cm ø × ${box.portLengthCm.toFixed(0)}cm`;

        // Port velocity status
        const velocityStatus = getPortVelocityStatus(box, power);
        velocityEl.classList.remove('port-velocity-ok', 'port-velocity-warn', 'port-velocity-bad');

        if (velocityStatus) {
            const { velocity, status } = velocityStatus;
            const symbols = { ok: ' ✓', warn: ' ⚠', bad: ' ✗' };
            velocityEl.textContent = `${velocity.toFixed(0)} m/s${symbols[status]}`;
            velocityEl.classList.add(`port-velocity-${status}`);
        } else {
            velocityEl.textContent = '--';
        }
    }

    function updatePortConfigSummary(box, power) {
        const lengthInline = document.getElementById('portLengthInline');
        const velocityInline = document.getElementById('portVelocityInline');
        const statusInline = document.getElementById('portStatusInline');

        if (!lengthInline || !velocityInline || !statusInline) return;

        if (!box.isVented || !box.portLengthCm) {
            lengthInline.textContent = '--';
            velocityInline.textContent = '--';
            statusInline.textContent = '';
            statusInline.className = '';
            return;
        }

        lengthInline.textContent = box.portLengthCm.toFixed(0);

        const velocityStatus = getPortVelocityStatus(box, power);
        if (velocityStatus) {
            const { velocity, status } = velocityStatus;
            const symbols = { ok: '✓', warn: '⚠', bad: '✗' };
            velocityInline.textContent = velocity.toFixed(0);
            statusInline.textContent = symbols[status];
            statusInline.className = status === 'ok' ? 'good' : status;
        } else {
            velocityInline.textContent = '--';
            statusInline.textContent = '';
            statusInline.className = '';
        }
    }

    // Subscribe to state changes that affect results
    state.subscribe('box', updateResultsBar);
    state.subscribe('power', updateResultsBar);
    state.subscribe('modifierStack', updateResultsBar);
    state.subscribe('includeDsp', updateResultsBar);
    state.subscribe('includeEnvironment', updateResultsBar);

    // Initial update
    updateResultsBar();

    // ========================================================================
    // DESIGN SUMMARY CARD
    // ========================================================================

    const summaryCard = document.getElementById('designSummary');
    const summaryTitle = document.getElementById('summaryTitle');
    const summaryF3 = document.getElementById('summaryF3');
    const summaryMaxSpl = document.getElementById('summaryMaxSpl');
    const summaryLimiting = document.getElementById('summaryLimiting');
    const summaryPort = document.getElementById('summaryPort');
    const summaryInsights = document.getElementById('summaryInsights');

    function updateDesignSummary() {
        const box = state.get('box');
        const driver = state.get('driver');
        const power = state.require('power');
        const boxType = state.get('boxType');

        // No driver selected
        if (!driver || !box) {
            summaryCard.classList.add('no-driver');
            summaryTitle.textContent = 'Select a driver to begin';
            return;
        }

        summaryCard.classList.remove('no-driver');

        // Update box type class for CSS (ported-only visibility)
        summaryCard.classList.remove('sealed', 'ported', 'pr');
        summaryCard.classList.add(boxType);

        // Build title
        const driverName = driver.displayName || 'Driver';
        const volumeL = box.volumeLiters.toFixed(0);
        let titleText;

        if (boxType === 'sealed') {
            const qtcStr = box.qtc.toFixed(2);
            const alignmentHint = box.alignmentName ? ` (${box.alignmentName})` : '';
            titleText = `${driverName} in ${volumeL}L Sealed, Qtc ${qtcStr}${alignmentHint}`;
        } else {
            const fbStr = box.fb.toFixed(0);
            const alignmentHint = box.alignmentName ? ` (${box.alignmentName})` : '';
            const ventLabel = boxType === 'pr' ? 'PR' : 'Ported';
            titleText = `${driverName} in ${volumeL}L ${ventLabel} @${fbStr}Hz${alignmentHint}`;
        }
        summaryTitle.textContent = titleText;

        // F3
        summaryF3.textContent = box.f3 ? `${box.f3.toFixed(0)} Hz` : '--';

        // Reference frequency: 30Hz default
        const refFreq = 30;

        // Max SPL at reference frequency
        if (box.canCalculateLimits && box.canCalculateSpl) {
            try {
                const maxSplResult = box.maxSplAt(refFreq);
                summaryMaxSpl.textContent = `${maxSplResult.maxSpl.toFixed(0)} dB @${refFreq}Hz`;
                summaryLimiting.textContent = maxSplResult.limitingFactor === 'excursion' ? 'Excursion' : 'Thermal';
            } catch {
                summaryMaxSpl.textContent = '--';
                summaryLimiting.textContent = '--';
            }
        } else {
            summaryMaxSpl.textContent = '--';
            summaryLimiting.textContent = '--';
        }

        // Port info (ported/PR only)
        if ((boxType === 'ported' || boxType === 'pr') && box.isVented) {
            if (boxType === 'ported' && box.portLengthCm) {
                const diameter = state.require('portDiameter');
                const velocityStatus = getPortVelocityStatus(box, power);
                const velocityStr = velocityStatus ? `${velocityStatus.velocity.toFixed(0)} m/s` : '';
                summaryPort.textContent = `${diameter}cm × ${box.portLengthCm.toFixed(0)}cm, ${velocityStr}`;
            } else if (boxType === 'pr') {
                const prMass = state.get('prMassCalculated');
                summaryPort.textContent = prMass ? `${prMass.toFixed(0)}g mass` : '--';
            }
        }

        // Insights
        const insights = [];

        // Excursion insight
        if (box.canCalculateLimits) {
            try {
                const excursionMm = box.excursionAt(refFreq, power);
                const xmax = driver.xmax;
                if (xmax) {
                    const pct = (excursionMm / xmax) * 100;
                    if (pct > 100) {
                        insights.push({ icon: 'error', text: `Over Xmax at ${refFreq}Hz (${pct.toFixed(0)}%)` });
                    } else if (pct > 85) {
                        insights.push({ icon: 'warn', text: `Near Xmax at ${refFreq}Hz (${pct.toFixed(0)}%)` });
                    } else {
                        insights.push({ icon: 'ok', text: `Excursion OK (${pct.toFixed(0)}% Xmax @${refFreq}Hz)` });
                    }
                }
            } catch { /* ignore */ }
        }

        // Port velocity insight (ported only)
        if (boxType === 'ported' && box.isVented && box.isPort) {
            const velocityStatus = getPortVelocityStatus(box, power);
            if (velocityStatus) {
                const { velocity, status } = velocityStatus;
                if (status === 'bad') {
                    insights.push({ icon: 'error', text: `Port velocity severe (${velocity.toFixed(0)} m/s) - will compress/chuff` });
                } else if (status === 'warn') {
                    insights.push({ icon: 'warn', text: `Port velocity moderate (${velocity.toFixed(0)} m/s) - OK for music` });
                } else {
                    insights.push({ icon: 'ok', text: `Port velocity OK (${velocity.toFixed(0)} m/s)` });
                }
            }
        }

        // Headroom insight (only when target SPL enabled)
        const targetSplEnabled = document.getElementById('targetSplToggle')?.querySelector('input')?.checked;
        if (targetSplEnabled && box.canCalculateLimits && box.canCalculateSpl) {
            try {
                const targetSpl = state.require('targetSpl');
                const maxSplResult = box.maxSplAt(refFreq);
                const headroom = maxSplResult.maxSpl - targetSpl;
                if (headroom < 0) {
                    insights.push({ icon: 'error', text: `Cannot hit ${targetSpl}dB target at ${refFreq}Hz (${headroom.toFixed(0)}dB short)` });
                } else if (headroom < 3) {
                    insights.push({ icon: 'warn', text: `Tight headroom to ${targetSpl}dB target (+${headroom.toFixed(0)}dB)` });
                } else {
                    insights.push({ icon: 'ok', text: `Headroom to ${targetSpl}dB target: +${headroom.toFixed(0)}dB` });
                }
            } catch { /* ignore */ }
        }

        // Render insights
        summaryInsights.innerHTML = insights.map(i => `
            <div class="insight">
                <span class="insight-icon ${i.icon}">${i.icon === 'ok' ? '✓' : i.icon === 'warn' ? '⚠' : '⛔'}</span>
                <span class="insight-text">${i.text}</span>
            </div>
        `).join('');
    }

    // Subscribe to relevant state changes
    state.subscribe('box', updateDesignSummary);
    state.subscribe('driver', updateDesignSummary);
    state.subscribe('power', updateDesignSummary);
    state.subscribe('boxType', updateDesignSummary);
    state.subscribe('targetSpl', updateDesignSummary);

    // Also update when target SPL toggle changes
    const targetSplToggleInput = document.getElementById('targetSplToggle')?.querySelector('input');
    if (targetSplToggleInput) {
        targetSplToggleInput.addEventListener('change', updateDesignSummary);
    }

    // Initial update
    updateDesignSummary();

    // ========================================================================
    // ADVANCED TOGGLE
    // ========================================================================

    const advancedToggle = document.getElementById('advancedToggle');
    const advancedPanel = document.getElementById('advancedPanel');

    if (advancedToggle && advancedPanel) {
        advancedToggle.addEventListener('click', () => {
            advancedToggle.classList.toggle('open');
            advancedPanel.classList.toggle('open');
        });
    }

    // ========================================================================
    // COLLAPSIBLE CHART SECTIONS
    // ========================================================================

    const scenarioSection = document.getElementById('scenarioSection');
    const portSection = document.getElementById('portSection');
    const prSection = document.getElementById('prSection');
    const scenarioHint = document.getElementById('scenarioHint');
    const portHint = document.getElementById('portHint');
    const prHint = document.getElementById('prHint');

    function updateCollapsibleSections() {
        const boxType = state.get('boxType');
        const includeDsp = state.get('includeDsp');
        const includeEnvironment = state.get('includeEnvironment');

        // Scenario section: expand if any DSP or room gain is configured
        const hasScenarioConfig = includeDsp || includeEnvironment;
        if (scenarioSection) {
            const wasCollapsed = scenarioSection.classList.contains('collapsed');
            scenarioSection.classList.toggle('collapsed', !hasScenarioConfig);

            // Resize charts when section expands
            if (wasCollapsed && hasScenarioConfig) {
                requestAnimationFrame(() => {
                    ['dspResponse', 'dspPhase', 'environment'].forEach(key => {
                        if (graphs[key]?.chart) {
                            graphs[key].chart.resize();
                        }
                    });
                });
            }
        }
        if (scenarioHint) {
            scenarioHint.textContent = hasScenarioConfig ? '' : '— no DSP or room gain configured';
        }

        // Port section: expand only for ported box type
        const isPort = boxType === 'ported';
        if (portSection) {
            const wasCollapsed = portSection.classList.contains('collapsed');
            portSection.classList.toggle('collapsed', !isPort);

            // Resize charts when section expands
            if (wasCollapsed && isPort) {
                requestAnimationFrame(() => {
                    ['portVelocity', 'portContribution', 'ventMach', 'ventReynolds'].forEach(key => {
                        if (graphs[key]?.chart) {
                            graphs[key].chart.resize();
                        }
                    });
                });
            }
        }
        if (portHint) {
            portHint.textContent = isPort ? '' : '— select Ported box type';
        }

        // PR section: expand only for PR box type
        const isPR = boxType === 'pr';
        if (prSection) {
            const wasCollapsed = prSection.classList.contains('collapsed');
            prSection.classList.toggle('collapsed', !isPR);

            // Resize charts when section expands (Chart.js needs this for hidden canvases)
            if (wasCollapsed && isPR) {
                requestAnimationFrame(() => {
                    ['prExcursion', 'excursionComparison', 'prPowerLimit', 'prContribution'].forEach(key => {
                        if (graphs[key]?.chart) {
                            graphs[key].chart.resize();
                        }
                    });
                });
            }
        }
        if (prHint) {
            prHint.textContent = isPR ? '' : '— select PR box type';
        }
    }

    // Subscribe to relevant state changes
    state.subscribe('boxType', updateCollapsibleSections);
    state.subscribe('includeDsp', updateCollapsibleSections);
    state.subscribe('includeEnvironment', updateCollapsibleSections);

    // Initial update
    updateCollapsibleSections();

    // ========================================================================
    // MANUAL SECTION TOGGLE (click header to expand/collapse)
    // ========================================================================

    // Map section IDs to their chart keys (for resize on expand)
    const sectionChartKeys = {
        scenarioSection: ['dspResponse', 'dspPhase', 'environment'],
        portSection: ['portVelocity', 'portContribution', 'ventMach', 'ventReynolds'],
        prSection: ['prExcursion', 'excursionComparison', 'prPowerLimit', 'prContribution'],
        electricalSection: ['impedance', 'impedancePhase', 'epdr', 'currentDraw', 'ampLoad', 'thermalDissipation'],
        mechanicalSection: ['coneVelocity', 'coneAccel'],
        timeDomainSection: ['phase', 'groupDelay', 'stepResponse', 'impulseResponse'],
        designToolsSection: ['volumeCompare', 'alignmentCompare', 'powerRequired', 'maxPower', 'splVsPower'],
        klippelSection: ['compression', 'distortion', 'blCurve', 'kmsCurve']
    };

    // Add click handlers to all section headers
    document.querySelectorAll('.chart-section .chart-section-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.parentElement;
            const wasCollapsed = section.classList.contains('collapsed');
            section.classList.toggle('collapsed');

            // Resize charts when section expands
            if (wasCollapsed) {
                const chartKeys = sectionChartKeys[section.id] || [];
                requestAnimationFrame(() => {
                    chartKeys.forEach(key => {
                        if (graphs[key]?.chart) {
                            graphs[key].chart.resize();
                        }
                    });
                });
            }
        });
    });
}

// ============================================================================
// GRAPH MODAL - Click to enlarge
// ============================================================================

let modalGraph = null;

function setupGraphModal() {
    const modal = document.getElementById('graphModal');
    const modalTitle = document.getElementById('graphModalTitle');
    const modalClose = document.getElementById('graphModalClose');
    const modalCanvas = document.getElementById('graphModalCanvas');

    if (!modal || !modalCanvas) return;

    // Close handlers
    const closeModal = () => {
        modal.classList.remove('visible');
        if (modalGraph) {
            modalGraph.destroy();
            modalGraph = null;
        }
    };

    modalClose?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            closeModal();
        }
    });

    // Click handler for all chart containers
    document.querySelectorAll('.chart-container').forEach(container => {
        container.addEventListener('click', (e) => {
            // Don't trigger on info tooltip clicks
            if (e.target.closest('.chart-info')) return;

            // Find which graph this container holds
            const canvas = container.querySelector('canvas');
            if (!canvas) return;

            const canvasId = canvas.id;

            // Find the graph key from the canvas ID
            let graphKey = null;
            for (const key of getGraphKeys()) {
                if (GRAPH_REGISTRY[key].id === canvasId) {
                    graphKey = key;
                    break;
                }
            }

            if (!graphKey || !graphs[graphKey]) return;

            // Get the title from the container's h3
            const titleEl = container.querySelector('h3');
            const title = titleEl?.childNodes[0]?.textContent?.trim() || 'Graph';
            modalTitle.textContent = title;

            // Get the config and create modal graph with same options
            const config = GRAPH_REGISTRY[graphKey];
            const opts = getGraphOptionsForDomain(config.domain, config);

            // Create new Graph instance for modal canvas
            if (modalGraph) {
                modalGraph.destroy();
            }
            modalGraph = new Graph('graphModalCanvas', opts);

            // Copy layers from the existing graph
            const sourceGraph = graphs[graphKey];
            modalGraph.setLayers(sourceGraph.layers);

            // Show modal
            modal.classList.add('visible');
        });
    });
}

// ========================================================================
// DSP PLAYGROUND MODAL
// ========================================================================

function setupDspPlaygroundModal() {
    const modal = document.getElementById('dspPlaygroundModal');
    const iframe = document.getElementById('dspPlaygroundFrame');
    const openBtn = document.getElementById('dspPlaygroundBtn');

    if (!modal || !openBtn || !iframe) return;

    // Convert modifierStack to playground filter format
    function saveModifierStackToStorage() {
        const modifierStack = state.get('modifierStack');
        if (!modifierStack) return;

        // Build filters array in playground format
        const playgroundFilters = [
            { type: 'hpf', enabled: false, freq: 20, order: 4 },
            { type: 'peq', enabled: false, freq: 40, gain: 0, q: 2 },
            { type: 'peq', enabled: false, freq: 60, gain: 0, q: 2 },
            { type: 'peq', enabled: false, freq: 80, gain: 0, q: 2 },
            { type: 'lpf', enabled: false, freq: 80, order: 4 },
            { type: 'apf', enabled: false, freq: 80, order: 2, q: 0.707 }
        ];

        let slotIndex = 0;
        modifierStack.modifiers.forEach(mod => {
            if (!mod.enabled) return;
            if (mod.category !== ModifierCategory.EQ_DEMAND && mod.category !== ModifierCategory.SIGNAL) return;
            if (slotIndex >= playgroundFilters.length) return;

            if (mod.type === ModifierType.HPF) {
                playgroundFilters[slotIndex] = { type: 'hpf', enabled: true, freq: mod.cornerFreq, order: mod.order || 4 };
                slotIndex++;
            } else if (mod.type === ModifierType.LPF) {
                playgroundFilters[slotIndex] = { type: 'lpf', enabled: true, freq: mod.cornerFreq, order: mod.order || 4 };
                slotIndex++;
            } else if (mod.type === ModifierType.PEAK) {
                playgroundFilters[slotIndex] = { type: 'peq', enabled: true, freq: mod.centerFreq, gain: mod.gainDb, q: mod.q || 1 };
                slotIndex++;
            } else if (mod.type === ModifierType.SHELF) {
                playgroundFilters[slotIndex] = { type: 'shelf', enabled: true, freq: mod.cornerFreq, gain: mod.gainDb, slope: mod.slope || 1 };
                slotIndex++;
            }
        });

        localStorage.setItem('boxsmith_dspFilters', JSON.stringify(playgroundFilters));
    }

    // Load playground filters back into modifierStack
    function loadStorageToModifierStack() {
        const stored = localStorage.getItem('boxsmith_dspFilters');
        if (!stored) return;

        const modifierStack = state.get('modifierStack');
        if (!modifierStack) return;

        try {
            const playgroundFilters = JSON.parse(stored);

            // Remove existing EQ_DEMAND and SIGNAL modifiers
            const toRemove = modifierStack.modifiers.filter(m =>
                m.category === ModifierCategory.EQ_DEMAND || m.category === ModifierCategory.SIGNAL
            ).map(m => m.id);
            toRemove.forEach(id => modifierStack.remove(id));

            // Add filters from playground
            playgroundFilters.forEach((filter, i) => {
                if (!filter.enabled || filter.type === 'off') return;

                let modConfig = { category: ModifierCategory.EQ_DEMAND, name: `DSP ${i + 1}` };

                if (filter.type === 'hpf') {
                    modConfig.type = ModifierType.HPF;
                    modConfig.cornerFreq = filter.freq;
                    modConfig.order = filter.order;
                    modConfig.category = ModifierCategory.SIGNAL;
                } else if (filter.type === 'lpf') {
                    modConfig.type = ModifierType.LPF;
                    modConfig.cornerFreq = filter.freq;
                    modConfig.order = filter.order;
                    modConfig.category = ModifierCategory.SIGNAL;
                } else if (filter.type === 'peq') {
                    modConfig.type = ModifierType.PEAK;
                    modConfig.centerFreq = filter.freq;
                    modConfig.gainDb = filter.gain;
                    modConfig.q = filter.q;
                } else if (filter.type === 'shelf') {
                    modConfig.type = ModifierType.SHELF;
                    modConfig.cornerFreq = filter.freq;
                    modConfig.gainDb = filter.gain;
                    modConfig.slope = filter.slope || 1;
                } else if (filter.type === 'apf') {
                    // APF not in modifierStack yet - skip for now
                    return;
                }

                modifierStack.add(modConfig);
            });

            // Enable DSP if we have filters
            const hasFilters = playgroundFilters.some(f => f.enabled && f.type !== 'off');
            if (hasFilters) {
                state.set('includeDsp', true);
                const toggle = document.getElementById('includeDspToggle');
                if (toggle) toggle.checked = true;
            }

            state.set('modifierStack', modifierStack);
            renderModifierList();

        } catch (e) {
            console.error('Failed to load playground filters:', e);
        }
    }

    function openModal() {
        saveModifierStackToStorage();
        iframe.src = 'dsp-playground.html?modal=1';
        modal.classList.add('visible');
    }

    function closeModal() {
        modal.classList.remove('visible');
        loadStorageToModifierStack();
        iframe.src = 'about:blank';
    }

    // Event handlers
    openBtn.addEventListener('click', openModal);

    // Listen for close message from iframe
    window.addEventListener('message', (e) => {
        if (e.data?.type === 'closePlayground') {
            closeModal();
        }
    });

    // ESC key closes modal (backup, iframe handles its own ESC)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            closeModal();
        }
    });

    // Click on overlay (outside iframe) closes it
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { state };

// ============================================================================
// DEBUG: Graph data export for development feedback loop
// ============================================================================
// Usage from browser console:
//   debugGraphs()          — summary of all graphs (name, layer count, point counts)
//   debugGraphs('response') — full data dump for a specific graph (by key or partial match)
//   debugGraphs('all')     — full data dump for every graph (large output)
//   copy(debugGraphs('response')) — copy to clipboard for pasting
//
window.debugGraphs = function(filter) {
    const result = {};

    for (const [key, graph] of Object.entries(graphs)) {
        if (!graph.chart) continue;

        const config = GRAPH_REGISTRY[key];
        if (!config) continue;

        // If filter is a specific graph key or partial match, dump full data
        if (filter && filter !== 'all') {
            const match = key.toLowerCase().includes(filter.toLowerCase()) ||
                          config.label?.toLowerCase().includes(filter.toLowerCase());
            if (!match) continue;
        }

        const datasets = graph.chart.data.datasets;
        const entry = {
            label: config.label,
            id: config.id,
            layers: datasets.map(ds => {
                const info = {
                    label: ds.label || '(unlabeled)',
                    points: ds.data.length,
                    hidden: ds.hidden || false
                };
                // Full data only when filtering to specific graph(s) or 'all'
                if (filter) {
                    info.data = ds.data.map(p => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(4) }));
                    // Quick shape summary: min, max, value at a few key frequencies
                    const ys = ds.data.map(p => p.y).filter(y => isFinite(y));
                    if (ys.length > 0) {
                        info.yMin = +Math.min(...ys).toFixed(4);
                        info.yMax = +Math.max(...ys).toFixed(4);
                        info.yRange = +(info.yMax - info.yMin).toFixed(4);
                    }
                }
                return info;
            })
        };

        result[key] = entry;
    }

    // Pretty-print for console readability
    const json = JSON.stringify(result, null, 2);
    console.log(json);
    return result;
};
