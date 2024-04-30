/**
 * DSP Playground
 *
 * Interactive filter design tool for subwoofer DSP.
 * Shows magnitude and phase/group delay response.
 * PEQ nodes are draggable on the magnitude graph.
 */

import {
    highpassComplex,
    lowpassComplex,
    peakComplex,
    shelfComplex,
    allpassComplex
} from './filters.js';
import { generateLogFrequencies } from '../lib/foundation/utils.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const FREQ_MIN = 10;
const FREQ_MAX = 200;
const FREQ_POINTS = 100;

// Slot colors (fixed per slot, regardless of filter type)
const SLOT_COLORS = [
    '#58a6ff',  // Slot 1 - blue
    '#f0883e',  // Slot 2 - orange
    '#a371f7',  // Slot 3 - purple
    '#f778ba',  // Slot 4 - pink
    '#bc8cff',  // Slot 5 - lavender
    '#3fb950'   // Slot 6 - green
];

// Filter types
const FilterType = {
    OFF: 'off',
    HPF: 'hpf',
    LPF: 'lpf',
    PEQ: 'peq',
    SHELF: 'shelf',
    APF: 'apf'
};

// Default parameters for each filter type
const TYPE_DEFAULTS = {
    [FilterType.OFF]: {},
    [FilterType.HPF]: { freq: 20, order: 4 },
    [FilterType.LPF]: { freq: 80, order: 4 },
    [FilterType.PEQ]: { freq: 60, gain: 0, q: 2 },
    [FilterType.SHELF]: { freq: 80, gain: 0, slope: 1 },
    [FilterType.APF]: { freq: 80, order: 2, q: 0.707 }
};

// Initial filter configuration (all disabled by default)
const FILTER_DEFAULTS = [
    { type: FilterType.HPF, enabled: false, freq: 20, order: 4 },
    { type: FilterType.PEQ, enabled: false, freq: 40, gain: 0, q: 2 },
    { type: FilterType.PEQ, enabled: false, freq: 60, gain: 0, q: 2 },
    { type: FilterType.PEQ, enabled: false, freq: 80, gain: 0, q: 2 },
    { type: FilterType.LPF, enabled: false, freq: 80, order: 4 },
    { type: FilterType.APF, enabled: false, freq: 80, order: 2, q: 0.707 }
];

// ============================================================================
// STATE
// ============================================================================

let filters = JSON.parse(JSON.stringify(FILTER_DEFAULTS));
let selectedSlot = 0;  // Now an index (0-5)
let phaseMode = 'phase'; // 'phase' or 'delay'

let magnitudeChart = null;
let phaseChart = null;

// For dragging
let isDragging = false;
let dragSlot = null;

// ============================================================================
// FILTER RESPONSE CALCULATIONS
// ============================================================================

/**
 * Get complex response for a single filter at frequency
 * @param {number} slotIndex - Filter slot index (0-5)
 * @param {number} frequency - Frequency in Hz
 */
function getFilterResponse(slotIndex, frequency) {
    const f = filters[slotIndex];
    if (!f.enabled || f.type === FilterType.OFF) {
        return { magnitude: 0, phase: 0 };
    }

    switch (f.type) {
        case FilterType.HPF:
            return highpassComplex(frequency, f.freq, f.order);
        case FilterType.LPF:
            return lowpassComplex(frequency, f.freq, f.order);
        case FilterType.PEQ:
            return peakComplex(frequency, f.freq, f.gain, f.q);
        case FilterType.SHELF:
            return shelfComplex(frequency, f.freq, f.gain, f.slope);
        case FilterType.APF:
            return allpassComplex(frequency, f.freq, f.order, f.q);
        default:
            return { magnitude: 0, phase: 0 };
    }
}

/**
 * Get total response (sum of all filters)
 */
function getTotalResponse(frequency) {
    let magnitude = 0;
    let phase = 0;
    for (let i = 0; i < filters.length; i++) {
        const r = getFilterResponse(i, frequency);
        magnitude += r.magnitude;
        phase += r.phase;
    }
    return { magnitude, phase };
}

/**
 * Calculate group delay from phase (numerical derivative)
 */
function getGroupDelay(frequency) {
    const df = frequency * 0.01;
    const f1 = Math.max(1, frequency - df / 2);
    const f2 = frequency + df / 2;
    const p1 = getTotalResponse(f1).phase * Math.PI / 180;
    const p2 = getTotalResponse(f2).phase * Math.PI / 180;
    const dPhase = p2 - p1;
    return -dPhase / (2 * Math.PI * (f2 - f1)) * 1000; // ms
}

/**
 * Generate curve data for a filter
 * @param {number} slotIndex - Filter slot index
 */
function generateFilterCurve(slotIndex) {
    const frequencies = generateLogFrequencies(FREQ_MIN, FREQ_MAX, FREQ_POINTS);
    return frequencies.map(f => ({
        x: f,
        y: getFilterResponse(slotIndex, f).magnitude
    }));
}

/**
 * Generate total magnitude curve
 */
function generateTotalMagnitudeCurve() {
    const frequencies = generateLogFrequencies(FREQ_MIN, FREQ_MAX, FREQ_POINTS);
    return frequencies.map(f => ({
        x: f,
        y: getTotalResponse(f).magnitude
    }));
}

/**
 * Generate phase curve
 */
function generatePhaseCurve() {
    const frequencies = generateLogFrequencies(FREQ_MIN, FREQ_MAX, FREQ_POINTS);
    return frequencies.map(f => ({
        x: f,
        y: getTotalResponse(f).phase
    }));
}

/**
 * Generate group delay curve
 */
function generateGroupDelayCurve() {
    const frequencies = generateLogFrequencies(FREQ_MIN, FREQ_MAX, FREQ_POINTS);
    return frequencies.map(f => ({
        x: f,
        y: getGroupDelay(f)
    }));
}

// ============================================================================
// CHART SETUP
// ============================================================================

function createMagnitudeChart() {
    const canvas = document.getElementById('magnitudeChart');
    const ctx = canvas.getContext('2d');

    magnitudeChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    type: 'logarithmic',
                    title: { display: true, text: 'Frequency (Hz)', color: '#8b949e' },
                    min: FREQ_MIN,
                    max: FREQ_MAX,
                    grid: { color: '#30363d' },
                    ticks: {
                        color: '#8b949e',
                        callback: function(value) {
                            const labeled = [10, 20, 50, 100, 200];
                            if (labeled.includes(value)) return value;
                            return '';
                        }
                    }
                },
                y: {
                    title: { display: true, text: 'Magnitude (dB)', color: '#8b949e' },
                    min: -24,
                    max: 15,
                    grid: { color: '#30363d' },
                    ticks: { color: '#8b949e' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => `${items[0].parsed.x.toFixed(1)} Hz`,
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} dB`
                    }
                }
            }
        }
    });

    // Add drag interaction
    setupDragInteraction(canvas);
}

function createPhaseChart() {
    const canvas = document.getElementById('phaseChart');
    const ctx = canvas.getContext('2d');

    phaseChart = new Chart(ctx, {
        type: 'line',
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    type: 'logarithmic',
                    title: { display: true, text: 'Frequency (Hz)', color: '#8b949e' },
                    min: FREQ_MIN,
                    max: FREQ_MAX,
                    grid: { color: '#30363d' },
                    ticks: {
                        color: '#8b949e',
                        callback: function(value) {
                            const labeled = [10, 20, 50, 100, 200];
                            if (labeled.includes(value)) return value;
                            return '';
                        }
                    }
                },
                y: {
                    title: { display: true, text: 'Phase (°)', color: '#8b949e' },
                    min: -180,
                    max: 180,
                    grid: { color: '#30363d' },
                    ticks: { color: '#8b949e' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => `${items[0].parsed.x.toFixed(1)} Hz`,
                        label: (ctx) => {
                            const unit = phaseMode === 'phase' ? '°' : ' ms';
                            return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}${unit}`;
                        }
                    }
                }
            }
        }
    });
}

// ============================================================================
// DRAG INTERACTION FOR PEQ NODES
// ============================================================================

function setupDragInteraction(canvas) {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
}

function onMouseDown(e) {
    const { slotIndex } = getPointUnderMouse(e);
    if (slotIndex !== null) {
        isDragging = true;
        dragSlot = slotIndex;
        selectSlot(slotIndex);
        e.target.style.cursor = 'grabbing';
    }
}

function onMouseMove(e) {
    const canvas = e.target;

    if (isDragging && dragSlot !== null) {
        // Update filter parameters based on mouse position
        const { freq, gain } = getMousePosition(e);

        const f = filters[dragSlot];
        f.freq = Math.max(FREQ_MIN, Math.min(FREQ_MAX, freq));
        if (f.gain !== undefined) {
            f.gain = Math.max(-15, Math.min(15, gain));
        }

        updateUI();
        updateCharts();
    } else {
        // Check if hovering over a draggable point
        const { slotIndex } = getPointUnderMouse(e);
        canvas.style.cursor = slotIndex !== null ? 'grab' : 'default';
    }
}

function onMouseUp(e) {
    isDragging = false;
    dragSlot = null;
    e.target.style.cursor = 'default';
}

/**
 * Check if mouse is over a draggable node (PEQ or SHELF)
 * Returns slot index or null
 */
function getPointUnderMouse(e) {
    const threshold = 15; // pixels

    for (let i = 0; i < filters.length; i++) {
        const f = filters[i];
        if (!f.enabled) continue;
        // Only PEQ and SHELF have draggable nodes
        if (f.type !== FilterType.PEQ && f.type !== FilterType.SHELF) continue;

        // Convert filter params to pixel position
        const xScale = magnitudeChart.scales.x;
        const yScale = magnitudeChart.scales.y;
        const px = xScale.getPixelForValue(f.freq);
        const py = yScale.getPixelForValue(f.gain);

        // Get mouse pixel position
        const rect = e.target.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
        if (dist < threshold) {
            return { slotIndex: i, freq: f.freq, gain: f.gain };
        }
    }

    return { slotIndex: null };
}

/**
 * Convert mouse position to frequency/gain
 */
function getMousePosition(e) {
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xScale = magnitudeChart.scales.x;
    const yScale = magnitudeChart.scales.y;

    const freq = xScale.getValueForPixel(x);
    const gain = yScale.getValueForPixel(y);

    return { freq, gain };
}

// ============================================================================
// CHART UPDATES
// ============================================================================

function updateCharts() {
    updateMagnitudeChart();
    updatePhaseChart();
}

function updateMagnitudeChart() {
    const datasets = [];

    // 0 dB reference line
    datasets.push({
        label: '0 dB',
        data: [{ x: FREQ_MIN, y: 0 }, { x: FREQ_MAX, y: 0 }],
        borderColor: '#6e7681',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0
    });

    // Individual filter curves (thin, colored)
    for (let i = 0; i < filters.length; i++) {
        const f = filters[i];
        if (!f.enabled || f.type === FilterType.OFF) continue;

        datasets.push({
            label: `Filter ${i + 1}`,
            data: generateFilterCurve(i),
            borderColor: SLOT_COLORS[i],
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.2
        });
    }

    // Draggable nodes for PEQ and SHELF filters (types with gain)
    for (let i = 0; i < filters.length; i++) {
        const f = filters[i];
        if (!f.enabled) continue;
        if (f.type !== FilterType.PEQ && f.type !== FilterType.SHELF) continue;

        datasets.push({
            label: `F${i + 1} node`,
            data: [{ x: f.freq, y: f.gain }],
            borderColor: SLOT_COLORS[i],
            backgroundColor: SLOT_COLORS[i],
            pointRadius: 8,
            pointHoverRadius: 10,
            showLine: false
        });
    }

    // Total curve (thick, white)
    const hasAnyEnabled = filters.some(f => f.enabled && f.type !== FilterType.OFF);
    if (hasAnyEnabled) {
        datasets.push({
            label: 'Total',
            data: generateTotalMagnitudeCurve(),
            borderColor: '#f0f6fc',
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.2
        });
    }

    magnitudeChart.data.datasets = datasets;
    magnitudeChart.update('none');
}

function updatePhaseChart() {
    const datasets = [];

    // 0 reference line
    datasets.push({
        label: '0',
        data: [{ x: FREQ_MIN, y: 0 }, { x: FREQ_MAX, y: 0 }],
        borderColor: '#6e7681',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0
    });

    // Phase or group delay curve
    const hasAnyEnabled = filters.some(f => f.enabled && f.type !== FilterType.OFF);
    if (hasAnyEnabled) {
        if (phaseMode === 'phase') {
            datasets.push({
                label: 'Phase',
                data: generatePhaseCurve(),
                borderColor: '#58a6ff',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.2
            });
        } else {
            datasets.push({
                label: 'Group Delay',
                data: generateGroupDelayCurve(),
                borderColor: '#3fb950',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.2
            });
        }
    }

    // Update Y axis for mode - auto-scale to fit data
    if (phaseMode === 'phase') {
        const phaseData = generatePhaseCurve();
        const minPhase = Math.min(...phaseData.map(d => d.y));
        const maxPhase = Math.max(...phaseData.map(d => d.y));
        // Round to nearest 90° for clean grid
        const yMin = Math.floor(minPhase / 90) * 90;
        const yMax = Math.ceil(maxPhase / 90) * 90;
        // Ensure at least ±180° range for readability
        phaseChart.options.scales.y.min = Math.min(yMin, -180);
        phaseChart.options.scales.y.max = Math.max(yMax, 180);
        phaseChart.options.scales.y.title.text = 'Phase (°)';
    } else {
        // Auto-scale for group delay
        const delayData = generateGroupDelayCurve();
        const maxDelay = Math.max(...delayData.map(d => Math.abs(d.y)), 10);
        phaseChart.options.scales.y.min = -Math.ceil(maxDelay / 5) * 5;
        phaseChart.options.scales.y.max = Math.ceil(maxDelay / 5) * 5;
        phaseChart.options.scales.y.title.text = 'Group Delay (ms)';
    }

    phaseChart.data.datasets = datasets;
    phaseChart.update('none');
}

// ============================================================================
// UI UPDATES
// ============================================================================

const TYPE_LABELS = {
    [FilterType.OFF]: 'OFF',
    [FilterType.HPF]: 'HPF',
    [FilterType.LPF]: 'LPF',
    [FilterType.PEQ]: 'PEQ',
    [FilterType.SHELF]: 'Shelf',
    [FilterType.APF]: 'APF'
};

const TYPE_DESCRIPTIONS = {
    [FilterType.OFF]: ['Off', 'Filter disabled'],
    [FilterType.HPF]: ['High-Pass', 'Subsonic protection'],
    [FilterType.LPF]: ['Low-Pass', 'Crossover to mains'],
    [FilterType.PEQ]: ['Parametric EQ', 'Room mode correction'],
    [FilterType.SHELF]: ['Low Shelf', 'Bass boost/cut'],
    [FilterType.APF]: ['Allpass', 'Phase alignment']
};

function updateUI() {
    updateSlotDisplay();
    updateControls();
}

/**
 * Render filter slots dynamically
 */
function renderSlots() {
    const container = document.getElementById('filterSlots');
    container.innerHTML = '';

    filters.forEach((f, i) => {
        const slot = document.createElement('div');
        slot.className = 'dsp-filter-slot' + (i === selectedSlot ? ' selected' : '');
        slot.dataset.slot = i;
        if (!f.enabled) slot.classList.add('disabled');

        slot.innerHTML = `
            <div class="dsp-filter-slot-color" style="background: ${SLOT_COLORS[i]}"></div>
            <select data-slot="${i}">
                ${Object.entries(TYPE_LABELS).map(([type, label]) =>
                    `<option value="${type}" ${f.type === type ? 'selected' : ''}>${label}</option>`
                ).join('')}
            </select>
            <div class="dsp-filter-slot-value">${getSlotValueText(f)}</div>
            <div class="dsp-filter-slot-toggle">
                <input type="checkbox" ${f.enabled ? 'checked' : ''} data-enable="${i}">
            </div>
        `;

        // Slot click -> select (but not on select/checkbox)
        slot.addEventListener('click', (e) => {
            if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
            selectSlot(i);
        });

        // Type dropdown change
        slot.querySelector('select').addEventListener('change', (e) => {
            changeFilterType(i, e.target.value);
        });

        // Enable checkbox
        slot.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
            filters[i].enabled = e.target.checked;
            updateUI();
            updateCharts();
        });

        container.appendChild(slot);
    });
}

function getSlotValueText(f) {
    if (!f.enabled || f.type === FilterType.OFF) return '--';

    switch (f.type) {
        case FilterType.HPF:
        case FilterType.LPF:
            return `${Math.round(f.freq)} Hz`;
        case FilterType.PEQ:
        case FilterType.SHELF:
            const sign = f.gain >= 0 ? '+' : '';
            return `${sign}${f.gain.toFixed(1)} dB`;
        case FilterType.APF:
            return `${Math.round(f.freq)} Hz`;
        default:
            return '--';
    }
}

function updateSlotDisplay() {
    document.querySelectorAll('.dsp-filter-slot').forEach((el, i) => {
        const f = filters[i];

        el.classList.toggle('selected', i === selectedSlot);
        el.classList.toggle('disabled', !f.enabled);

        // Update value text
        const valueEl = el.querySelector('.dsp-filter-slot-value');
        valueEl.textContent = getSlotValueText(f);

        // Update select
        const select = el.querySelector('select');
        select.value = f.type;

        // Update checkbox
        const checkbox = el.querySelector('input[type="checkbox"]');
        checkbox.checked = f.enabled;
    });
}

function updateControls() {
    const f = filters[selectedSlot];
    const type = f.type;
    const desc = TYPE_DESCRIPTIONS[type] || ['Filter', ''];

    document.getElementById('selectedFilterTitle').textContent = `Filter ${selectedSlot + 1}: ${desc[0]}`;
    document.getElementById('selectedFilterSubtitle').textContent = desc[1];

    // Show/hide controls based on filter type
    const isOff = type === FilterType.OFF;
    const isHpfLpf = type === FilterType.HPF || type === FilterType.LPF;
    const isPeq = type === FilterType.PEQ;
    const isShelf = type === FilterType.SHELF;
    const isApf = type === FilterType.APF;
    const hasGain = isPeq || isShelf;
    const hasQ = isPeq || (isApf && f.order === 2);
    const hasOrder = isHpfLpf || isApf;

    document.getElementById('freqControl').classList.toggle('hidden', isOff);
    document.getElementById('gainControl').classList.toggle('hidden', !hasGain);
    document.getElementById('qControl').classList.toggle('hidden', !hasQ);
    document.getElementById('orderControl').classList.toggle('hidden', !hasOrder);

    if (isOff) return;

    // Update slider values
    document.getElementById('freqSlider').value = f.freq || 80;
    document.getElementById('freqValue').textContent = Math.round(f.freq || 80);

    if (hasGain) {
        document.getElementById('gainSlider').value = f.gain || 0;
        const gain = f.gain || 0;
        document.getElementById('gainValue').textContent = gain >= 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1);
    }

    if (hasQ) {
        document.getElementById('qSlider').value = f.q || 1;
        document.getElementById('qValue').textContent = (f.q || 1).toFixed(2);
    }

    // Update order buttons
    if (hasOrder) {
        document.querySelectorAll('.dsp-order-btn').forEach(btn => {
            const order = parseInt(btn.dataset.order);
            btn.classList.toggle('active', order === f.order);

            if (isApf) {
                btn.style.display = order <= 2 ? '' : 'none';
                btn.textContent = order === 1 ? '1st order' : '2nd order';
            } else {
                btn.style.display = '';
                btn.textContent = `${order * 6} dB/oct`;
            }
        });
    }
}

function selectSlot(slotIndex) {
    selectedSlot = slotIndex;
    updateUI();
}

/**
 * Change filter type for a slot, preserving freq if possible
 */
function changeFilterType(slotIndex, newType) {
    const oldFilter = filters[slotIndex];
    const freq = oldFilter.freq || 80;

    // Create new filter with type defaults, preserving frequency
    filters[slotIndex] = {
        type: newType,
        enabled: oldFilter.enabled,
        freq,
        ...TYPE_DEFAULTS[newType]
    };
    // Restore freq after spreading defaults
    filters[slotIndex].freq = freq;

    updateUI();
    updateCharts();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventHandlers() {
    // Slot event handlers are set up in renderSlots()

    // Control sliders - Frequency
    document.getElementById('freqSlider').addEventListener('input', (e) => {
        filters[selectedSlot].freq = parseFloat(e.target.value);
        updateUI();
        updateCharts();
    });

    // Control sliders - Gain
    document.getElementById('gainSlider').addEventListener('input', (e) => {
        filters[selectedSlot].gain = parseFloat(e.target.value);
        updateUI();
        updateCharts();
    });

    // Control sliders - Q
    document.getElementById('qSlider').addEventListener('input', (e) => {
        filters[selectedSlot].q = parseFloat(e.target.value);
        updateUI();
        updateCharts();
    });

    // Order buttons
    document.querySelectorAll('.dsp-order-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const order = parseInt(btn.dataset.order);
            filters[selectedSlot].order = order;

            // For APF, show/hide Q control based on order
            if (filters[selectedSlot].type === FilterType.APF) {
                document.getElementById('qControl').classList.toggle('hidden', order !== 2);
            }

            updateUI();
            updateCharts();
        });
    });

    // Phase/Delay toggle
    document.querySelectorAll('.dsp-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            phaseMode = btn.dataset.mode;
            document.querySelectorAll('.dsp-toggle-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === phaseMode);
            });
            updatePhaseChart();
        });
    });

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', () => {
        filters = JSON.parse(JSON.stringify(FILTER_DEFAULTS));
        selectedSlot = 0;
        renderSlots();
        updateUI();
        updateCharts();
    });

    // Load Auto-EQ from main app
    document.getElementById('loadAutoEqBtn')?.addEventListener('click', () => {
        const stored = localStorage.getItem('boxsmith_autoEQ');
        if (!stored) {
            alert('No Auto-EQ generated. Use "Generate EQ" on the main page first.');
            return;
        }

        try {
            const autoEqBands = JSON.parse(stored);
            if (!Array.isArray(autoEqBands) || autoEqBands.length === 0) {
                alert('No Auto-EQ bands found.');
                return;
            }

            // Reset filters first
            filters = JSON.parse(JSON.stringify(FILTER_DEFAULTS));

            // Load Auto-EQ bands into PEQ slots
            autoEqBands.forEach((band, i) => {
                if (i < filters.length) {
                    filters[i] = {
                        type: FilterType.PEQ,
                        enabled: true,
                        freq: Math.round(band.freq),
                        gain: Math.round(band.gain * 10) / 10,
                        q: band.q || 1.0
                    };
                }
            });

            selectedSlot = 0;
            renderSlots();
            updateUI();
            updateCharts();
        } catch (e) {
            console.error('Failed to load Auto-EQ:', e);
            alert('Failed to load Auto-EQ.');
        }
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let isModalMode = false;

function init() {
    // Check if opened as modal (via query param)
    isModalMode = new URLSearchParams(window.location.search).get('modal') === '1';

    if (isModalMode) {
        // Hide back link and Load Auto-EQ button (filters already loaded)
        const backLink = document.querySelector('.dsp-back-link');
        if (backLink) backLink.style.display = 'none';
        const loadAutoEqBtn = document.getElementById('loadAutoEqBtn');
        if (loadAutoEqBtn) loadAutoEqBtn.style.display = 'none';

        // Add close button to header
        const headerActions = document.querySelector('.dsp-header-actions');
        if (headerActions) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'dsp-btn';
            closeBtn.textContent = 'Close (ESC)';
            closeBtn.addEventListener('click', closeModal);
            headerActions.appendChild(closeBtn);
        }

        // ESC key in iframe tells parent to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Load filters from localStorage
        loadFiltersFromStorage();
    }

    createMagnitudeChart();
    createPhaseChart();
    renderSlots();
    setupEventHandlers();
    updateUI();
    updateCharts();
}

function closeModal() {
    saveFiltersToStorage();
    // Tell parent to close modal
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'closePlayground' }, '*');
    }
}

function loadFiltersFromStorage() {
    const stored = localStorage.getItem('boxsmith_dspFilters');
    if (stored) {
        try {
            const loadedFilters = JSON.parse(stored);
            if (Array.isArray(loadedFilters) && loadedFilters.length > 0) {
                filters = loadedFilters;
            }
        } catch (e) {
            console.error('Failed to load filters:', e);
        }
    }
}

function saveFiltersToStorage() {
    localStorage.setItem('boxsmith_dspFilters', JSON.stringify(filters));
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
