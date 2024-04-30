/**
 * Driver Library - Browse, view, edit, and manage drivers
 *
 * Features:
 * - Browse built-in and custom drivers
 * - View detailed driver specifications
 * - Copy built-in drivers to make editable versions
 * - Edit custom drivers
 * - Delete custom drivers
 * - Import drivers from JSON
 * - Export drivers as JSON
 */

import { POPULAR_DRIVERS } from './defaults.js';
import { loadCustomDrivers, saveCustomDrivers, validateDriverJson } from './persistence.js';
import { Driver } from '../lib/models/index.js';
import { calculateEta0, calculateSensitivity2v83 } from '../lib/foundation/small-1972.js';
import { SPEED_OF_SOUND, AIR_DENSITY } from '../lib/foundation/constants.js';

// ============================================================================
// STATE
// ============================================================================

let customDrivers = [];
let currentView = 'list';  // 'list' | 'edit' | 'import'
let selectedDriver = null;
let isNewDriver = false;
let onDriverSelected = null;  // Callback when driver is selected for use

// Threshold for flagging calculated vs entered value discrepancy
const DISCREPANCY_THRESHOLD_PERCENT = 3;

// Escape HTML for safe insertion (including for title attributes)
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the driver library
 * @param {Object} options
 * @param {Function} options.onSelect - Callback when a driver is selected for use
 */
export function initDriverLibrary(options = {}) {
    onDriverSelected = options.onSelect;
    customDrivers = loadCustomDrivers();
    setupEventListeners();
}

/**
 * Open the driver library modal
 */
export function openDriverLibrary() {
    const modal = document.getElementById('driverLibraryModal');
    if (modal) {
        modal.classList.add('visible');
        showListView();
        renderDriverList();
    }
}

/**
 * Close the driver library modal
 */
export function closeDriverLibrary() {
    const modal = document.getElementById('driverLibraryModal');
    if (modal) {
        modal.classList.remove('visible');
    }
}

/**
 * Open the driver library with a specific driver selected for viewing/editing
 * @param {Object} driver - Driver data object
 */
export function openDriverLibraryWithDriver(driver) {
    const modal = document.getElementById('driverLibraryModal');
    if (!modal || !driver) return;

    modal.classList.add('visible');

    // Check if this is a custom driver
    const isCustom = customDrivers.some(d => d.id === driver.id);

    // Show detail view for this driver
    showDetailView({ ...driver, isCustom });
}

// ============================================================================
// VIEW MANAGEMENT
// ============================================================================

function showListView() {
    currentView = 'list';
    document.getElementById('driverListView')?.classList.add('active');
    document.getElementById('driverDetailView')?.classList.remove('active');
    document.getElementById('driverEditView')?.classList.remove('active');
    document.getElementById('driverImportView')?.classList.remove('active');

    // Fix: list view doesn't use .active class, it's default visible
    const listView = document.getElementById('driverListView');
    if (listView) listView.style.display = 'flex';
}

// Unified form view - handles new, view built-in, edit custom
function showDriverForm(driver, mode = 'new') {
    // mode: 'new' | 'builtin' | 'custom'
    currentView = 'edit';
    selectedDriver = driver;
    isNewDriver = mode === 'new';

    document.getElementById('driverListView').style.display = 'none';
    document.getElementById('driverDetailView')?.classList.remove('active');
    document.getElementById('driverEditView')?.classList.add('active');
    document.getElementById('driverImportView')?.classList.remove('active');

    // Title
    const title = mode === 'new' ? 'New Driver' : (driver?.name || 'Driver');
    document.getElementById('driverEditTitle').textContent = title;

    // Badge
    const badge = document.getElementById('driverEditBadge');
    if (badge) {
        if (mode === 'new') {
            badge.style.display = 'none';
        } else {
            badge.style.display = '';
            badge.textContent = mode === 'builtin' ? 'Built-in' : 'Custom';
            badge.className = 'driver-card-badge' + (mode === 'custom' ? ' custom' : '');
        }
    }

    // Save button text and visibility
    const saveBtn = document.getElementById('driverSaveBtn');
    const copyBtn = document.getElementById('driverCopyBtn');
    if (saveBtn) {
        if (mode === 'builtin') {
            saveBtn.style.display = 'none';  // Hide save for built-in
        } else {
            saveBtn.style.display = '';
            saveBtn.textContent = mode === 'new' ? 'Create Driver' : 'Save Changes';
        }
    }
    if (copyBtn) {
        copyBtn.style.display = mode === 'builtin' ? '' : 'none';  // Show copy only for built-in
    }

    // Delete button - only for custom
    const deleteBtn = document.getElementById('driverFormDeleteBtn');
    if (deleteBtn) {
        deleteBtn.style.display = mode === 'custom' ? '' : 'none';
    }

    // Notice banner for built-in drivers
    let notice = document.getElementById('driverFormNotice');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'driverFormNotice';
        notice.className = 'driver-form-notice';
        const editContent = document.querySelector('.driver-edit-content');
        if (editContent) editContent.insertBefore(notice, editContent.firstChild);
    }
    notice.style.display = 'none';  // Not using notice anymore, using read-only styling instead

    // Store mode for save handler
    document.getElementById('driverEditView').dataset.mode = mode;

    populateEditForm(driver || {}, mode === 'builtin');
}

// Legacy wrappers for compatibility
function showDetailView(driver) {
    const mode = driver?.isCustom ? 'custom' : 'builtin';
    showDriverForm(driver, mode);
}

function showEditView(driver, isNew = false) {
    if (isNew) {
        showDriverForm(null, 'new');
    } else {
        const mode = driver?.isCustom ? 'custom' : 'builtin';
        showDriverForm(driver, mode);
    }
}

function showImportView() {
    currentView = 'import';

    document.getElementById('driverListView').style.display = 'none';
    document.getElementById('driverDetailView')?.classList.remove('active');
    document.getElementById('driverEditView')?.classList.remove('active');
    document.getElementById('driverImportView')?.classList.add('active');

    // Reset import form
    const textarea = document.getElementById('driverJsonInput');
    const preview = document.getElementById('driverImportPreview');
    const error = document.getElementById('driverImportError');
    const confirmBtn = document.getElementById('driverImportConfirmBtn');

    if (textarea) textarea.value = '';
    if (preview) preview.style.display = 'none';
    if (error) error.style.display = 'none';
    if (confirmBtn) confirmBtn.disabled = true;
}

// ============================================================================
// RENDERING
// ============================================================================

function renderDriverList() {
    const container = document.getElementById('driverList');
    if (!container) return;

    const searchTerm = document.getElementById('driverSearch')?.value.toLowerCase() || '';
    const filter = document.getElementById('driverFilter')?.value || 'all';

    // Get drivers based on filter
    let builtinDrivers = POPULAR_DRIVERS;
    let myDrivers = customDrivers;

    // Apply search filter
    if (searchTerm) {
        builtinDrivers = builtinDrivers.filter(d =>
            d.name.toLowerCase().includes(searchTerm) ||
            d.manufacturer?.toLowerCase().includes(searchTerm)
        );
        myDrivers = myDrivers.filter(d =>
            d.name.toLowerCase().includes(searchTerm) ||
            d.manufacturer?.toLowerCase().includes(searchTerm)
        );
    }

    let html = '';

    // Built-in drivers
    if (filter === 'all' || filter === 'builtin') {
        if (builtinDrivers.length > 0) {
            html += '<div class="library-section-label">Built-in Drivers</div>';
            for (const driver of builtinDrivers) {
                html += renderDriverCard(driver, false);
            }
        }
    }

    // Custom drivers
    if (filter === 'all' || filter === 'custom') {
        if (myDrivers.length > 0) {
            html += '<div class="library-section-label">My Drivers</div>';
            for (const driver of myDrivers) {
                html += renderDriverCard(driver, true);
            }
        } else if (filter === 'custom') {
            html += `
                <div class="library-empty">
                    <div class="library-empty-icon">📦</div>
                    <div>No custom drivers yet</div>
                    <div style="margin-top: 8px; font-size: 0.75rem;">
                        Import a driver or copy one from built-in
                    </div>
                </div>
            `;
        }
    }

    if (!html) {
        html = `
            <div class="library-empty">
                <div class="library-empty-icon">🔍</div>
                <div>No drivers found</div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Add click handlers to cards
    container.querySelectorAll('.driver-card').forEach(card => {
        const driverId = card.dataset.driverId;
        const isCustom = card.dataset.isCustom === 'true';

        card.addEventListener('click', (e) => {
            // Don't trigger if clicking a button
            if (e.target.closest('.driver-card-btn')) return;

            const driver = findDriver(driverId, isCustom);
            if (driver) showDetailView({ ...driver, isCustom });
        });

        // View button
        card.querySelector('.view-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const driver = findDriver(driverId, isCustom);
            if (driver) showDetailView({ ...driver, isCustom });
        });

        // Select button
        card.querySelector('.select-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const driver = findDriver(driverId, isCustom);
            if (driver && onDriverSelected) {
                onDriverSelected(driver);
                closeDriverLibrary();
            }
        });

        // Delete button (custom only)
        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const driver = findDriver(driverId, isCustom);
            if (driver && confirm(`Delete "${driver.name}"?`)) {
                deleteDriver({ ...driver, isCustom: true });
                renderDriverList();
            }
        });
    });
}

function renderDriverCard(driver, isCustom) {
    const specs = `${driver.size || ''} | Fs ${driver.fs}Hz | Qts ${driver.qts} | Vas ${driver.vas}L`;
    const deleteBtn = isCustom ? '<button class="driver-card-btn delete-btn" title="Delete">×</button>' : '';

    return `
        <div class="driver-card" data-driver-id="${driver.id}" data-is-custom="${isCustom}">
            <div class="driver-card-info">
                <div class="driver-card-name">${driver.name}</div>
                <div class="driver-card-specs">${specs}</div>
            </div>
            <div class="driver-card-actions">
                <button class="driver-card-btn view-btn">View</button>
                <button class="driver-card-btn primary select-btn">Select</button>
                ${deleteBtn}
            </div>
        </div>
    `;
}

// ============================================================================
// EDIT FORM - Dynamic form with calculated hints
// ============================================================================

// Field definitions organized by parameter groups
// Each group has an info tooltip explaining what the params enable
const PARAM_GROUPS = [
    {
        name: 'info',
        label: 'Driver Info',
        fields: [
            { id: 'name', label: 'Name', type: 'text', fullWidth: true, placeholder: 'Driver name' },
            { id: 'manufacturer', label: 'Manufacturer', type: 'text' },
            { id: 'size', label: 'Size', type: 'text', placeholder: 'e.g., 18"' }
        ]
    },
    {
        name: 'core',
        label: 'Core T/S Parameters',
        info: 'Required for all simulations. These define box size, tuning, and response shape.',
        fields: [
            { id: 'fs', label: 'Fs (Hz)', type: 'number', step: '0.1', required: true },
            {
                id: 'vas', label: 'Vas (L)', type: 'number', step: '0.1', required: true,
                unitHelp: '1 ft³ = 28.3 L'
            },
            { id: 'qts', label: 'Qts', type: 'number', step: '0.01', required: true },
            { id: 'qes', label: 'Qes', type: 'number', step: '0.01' },
            {
                id: 'qms', label: 'Qms', type: 'number', step: '0.01',
                derivation: {
                    requires: ['qts', 'qes'],
                    calc: (v) => v.qts && v.qes && v.qes > v.qts ? (v.qts * v.qes) / (v.qes - v.qts) : null,
                    desc: 'from Qts/Qes'
                }
            }
        ]
    },
    {
        name: 'motor',
        label: 'Motor Parameters',
        info: 'Enable excursion graphs, power limits, and impedance curves.',
        fields: [
            { id: 're', label: 'Re (Ω)', type: 'number', step: '0.1' },
            {
                id: 'le', label: 'Le (mH)', type: 'number', step: '0.01',
                unitHelp: '1 H = 1000 mH'
            },
            { id: 'bl', label: 'Bl (T·m)', type: 'number', step: '0.1' },
            {
                id: 'mms', label: 'Mms (g)', type: 'number', step: '1',
                unitHelp: '1 kg = 1000 g'
            },
            {
                id: 'cms', label: 'Cms (m/N)', type: 'number', step: '0.000001',
                unitHelp: '1 mm/N = 0.001 m/N',
                derivation: {
                    requires: ['vas', 'sd'],
                    calc: (v) => {
                        if (!v.vas || !v.sd) return null;
                        const vasSI = v.vas / 1000;       // L → m³
                        const sdSI = v.sd / 10000;        // cm² → m²
                        return vasSI / (AIR_DENSITY * SPEED_OF_SOUND * SPEED_OF_SOUND * sdSI * sdSI);
                    },
                    desc: 'from Vas/Sd',
                    format: 6
                }
            },
            {
                id: 'rms', label: 'Rms (kg/s)', type: 'number', step: '0.01',
                derivation: {
                    requires: ['fs', 'mms', 'qms'],
                    calc: (v) => {
                        if (!v.fs || !v.mms || !v.qms) return null;
                        const mmsSI = v.mms / 1000;       // g → kg
                        return (2 * Math.PI * v.fs * mmsSI) / v.qms;
                    },
                    desc: 'from Fs/Mms/Qms',
                    format: 2
                }
            }
        ]
    },
    {
        name: 'limits',
        label: 'Limits & Output',
        info: 'Enable max SPL graphs, thermal limits, and excursion limits.',
        fields: [
            {
                id: 'sd', label: 'Sd (cm²)', type: 'number', step: '1',
                unitHelp: '1 m² = 10000 cm², 1 in² = 6.45 cm²'
            },
            {
                id: 'xmax', label: 'Xmax (mm)', type: 'number', step: '0.1',
                unitHelp: 'One-way linear. 1 in = 25.4 mm'
            },
            {
                id: 'vd', label: 'Vd (cm³)', type: 'number', step: '1',
                derivation: {
                    requires: ['sd', 'xmax'],
                    calc: (v) => v.sd && v.xmax ? (v.sd * v.xmax) / 10 : null,
                    desc: 'from Sd×Xmax'
                }
            },
            { id: 'pe', label: 'Pe (W)', type: 'number', step: '1' },
            {
                id: 'sensitivity', label: 'Sensitivity (dB)', type: 'number', step: '0.1',
                unitHelp: '2.83V/1m standard',
                derivation: {
                    requires: ['fs', 'vas', 'qes', 're'],
                    calc: (v) => {
                        if (!v.fs || !v.vas || !v.qes || !v.re) return null;
                        const vasSI = v.vas / 1000;
                        const eta0 = calculateEta0(v.fs, vasSI, v.qes);
                        return calculateSensitivity2v83(eta0, v.re);
                    },
                    desc: 'from Fs/Vas/Qes/Re (2.83V/1m)'
                }
            }
        ]
    }
];

// Flatten for backwards compat
const EDIT_FIELDS = PARAM_GROUPS.flatMap(g => g.fields);

function populateEditForm(driver, readonly = false) {
    const grid = document.getElementById('driverEditGrid');
    if (!grid) return;

    // Build form HTML with grouped sections
    let html = '';
    for (const group of PARAM_GROUPS) {
        // Section header with optional info icon (only in edit mode)
        const infoIcon = (!readonly && group.info)
            ? `<span class="param-group-info-btn" title="${escapeHtml(group.info)}">ⓘ</span>`
            : '';
        html += `<div class="param-group-header">${group.label} ${infoIcon}</div>`;

        // Fields in this group
        for (const field of group.fields) {
            const value = driver?.[field.id] ?? '';
            const hasValue = value !== '' && value !== null && value !== undefined;
            const fullWidthClass = field.fullWidth ? ' full-width' : '';

            if (readonly) {
                // READ-ONLY: compact inline display
                const emptyClass = hasValue ? '' : ' empty';
                const displayValue = hasValue ? value : '—';
                html += `
                    <div class="driver-readonly-field${fullWidthClass}">
                        <span class="driver-readonly-label">${field.label}</span>
                        <span class="driver-readonly-value${emptyClass}">${displayValue}</span>
                    </div>
                `;
            } else {
                // EDITABLE: input fields with hints
                const requiredMark = field.required ? '<span style="color: #f85149;">*</span>' : '';
                const unitHelpSpan = field.unitHelp ? `<span class="unit-help" title="${escapeHtml(field.unitHelp)}">?</span>` : '';
                const placeholder = field.placeholder || '';

                html += `
                    <div class="driver-edit-field${fullWidthClass}">
                        <label for="editDriver_${field.id}">${field.label} ${requiredMark} ${unitHelpSpan}</label>
                        <div class="driver-edit-input-row">
                            <input type="${field.type}" id="editDriver_${field.id}"
                                   value="${hasValue ? value : ''}"
                                   step="${field.step || 'any'}"
                                   placeholder="${placeholder}"
                                   class="driver-edit-input">
                            ${field.derivation ? `<button type="button" class="driver-edit-use-btn" data-field="${field.id}" title="Use calculated value" disabled>Use</button>` : ''}
                        </div>
                        ${field.derivation ? `<div class="driver-edit-hint" id="hint_${field.id}"></div>` : ''}
                    </div>
                `;
            }
        }
    }
    grid.innerHTML = html;

    // Wire up input change handlers to update hints
    for (const field of EDIT_FIELDS) {
        const input = document.getElementById(`editDriver_${field.id}`);
        if (input) {
            input.addEventListener('input', () => updateEditFormHints());
        }
    }

    // Wire up [Use] buttons
    grid.querySelectorAll('.driver-edit-use-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const fieldId = btn.dataset.field;
            const hintEl = document.getElementById(`hint_${fieldId}`);
            const input = document.getElementById(`editDriver_${fieldId}`);
            const calcValue = hintEl?.dataset.calcValue;
            if (input && calcValue) {
                input.value = calcValue;
                input.classList.remove('derived');  // User explicitly chose this value
                updateEditFormHints();
            }
        });
    });

    // Initial hint calculation
    updateEditFormHints();

    // Clear any previous errors
    const errorEl = document.getElementById('driverEditError');
    if (errorEl) errorEl.style.display = 'none';
}

// Helper to show/hide Use button
function setUseButtonVisibility(useBtn, visible, enabled = true) {
    if (!useBtn) return;
    useBtn.style.display = visible ? '' : 'none';
    useBtn.disabled = !enabled;
}

function updateEditFormHints() {
    // Get current form values
    const values = {};
    for (const field of EDIT_FIELDS) {
        const input = document.getElementById(`editDriver_${field.id}`);
        const val = input?.value ? parseFloat(input.value) : null;
        values[field.id] = isNaN(val) ? null : val;
    }

    // Update each derivable field's hint
    for (const field of EDIT_FIELDS) {
        if (!field.derivation) continue;

        const hintEl = document.getElementById(`hint_${field.id}`);
        const useBtn = document.querySelector(`.driver-edit-use-btn[data-field="${field.id}"]`);
        if (!hintEl) continue;

        const calculated = field.derivation.calc(values);
        const enteredValue = values[field.id];

        if (calculated != null && isFinite(calculated)) {
            const decimals = field.derivation.format ?? (field.id === 'sensitivity' ? 1 : 2);
            const calcStr = calculated.toFixed(decimals);

            // Check for discrepancy with entered value
            if (enteredValue != null) {
                const diff = Math.abs(calculated - enteredValue) / enteredValue;
                if (diff > DISCREPANCY_THRESHOLD_PERCENT / 100) {
                    hintEl.innerHTML = `<span class="hint-warning">would be ${calcStr} ${field.derivation.desc} (${(diff * 100).toFixed(0)}% off)</span>`;
                    hintEl.className = 'driver-edit-hint warning';
                } else {
                    hintEl.innerHTML = `<span class="hint-ok">matches ${field.derivation.desc}</span>`;
                    hintEl.className = 'driver-edit-hint ok';
                }
                hintEl.dataset.calcValue = calcStr;
                setUseButtonVisibility(useBtn, false);  // Already has a value
            } else {
                hintEl.innerHTML = `<span class="hint-available">${calcStr} ${field.derivation.desc}</span>`;
                hintEl.className = 'driver-edit-hint available';
                hintEl.dataset.calcValue = calcStr;
                setUseButtonVisibility(useBtn, true, true);
            }
        } else {
            // Can't calculate - show which fields are needed
            const missing = field.derivation.requires.filter(r => values[r] == null);
            if (missing.length > 0) {
                hintEl.innerHTML = `<span class="hint-na">needs ${missing.join(', ')}</span>`;
                hintEl.className = 'driver-edit-hint na';
            } else {
                hintEl.innerHTML = '';
                hintEl.className = 'driver-edit-hint';
            }
            hintEl.dataset.calcValue = '';
            setUseButtonVisibility(useBtn, false);
        }
    }
}

function getEditFormData() {
    const data = {};
    for (const field of EDIT_FIELDS) {
        const input = document.getElementById(`editDriver_${field.id}`);
        if (!input) continue;

        if (field.type === 'text') {
            const val = input.value.trim();
            if (val) data[field.id] = val;
            else if (field.id === 'name') data.name = 'Custom Driver';  // Default name
        } else {
            const val = parseFloat(input.value);
            if (!isNaN(val)) data[field.id] = val;
        }
    }
    return data;
}

// ============================================================================
// DRIVER OPERATIONS
// ============================================================================

function findDriver(id, isCustom) {
    if (isCustom) {
        return customDrivers.find(d => d.id === id);
    }
    return POPULAR_DRIVERS.find(d => d.id === id);
}

function saveDriver(driverData, createNew = isNewDriver) {
    const error = document.getElementById('driverEditError');

    // Validate required fields
    if (!driverData.fs || !driverData.qts || !driverData.vas) {
        if (error) {
            error.textContent = 'Required fields: Fs, Qts, Vas';
            error.style.display = 'block';
        }
        return false;
    }

    // Try to construct a Driver to validate
    try {
        new Driver(driverData);
    } catch (e) {
        if (error) {
            error.textContent = e.message;
            error.style.display = 'block';
        }
        return false;
    }

    // Clean up null values
    const cleanData = {};
    for (const [key, value] of Object.entries(driverData)) {
        if (value !== null && value !== '') {
            cleanData[key] = value;
        }
    }

    if (createNew) {
        // Creating new driver
        cleanData.id = `custom-${Date.now()}`;
        customDrivers.push(cleanData);
    } else {
        // Updating existing driver
        const index = customDrivers.findIndex(d => d.id === selectedDriver?.id);
        if (index >= 0) {
            cleanData.id = selectedDriver.id;
            customDrivers[index] = cleanData;
        } else {
            // Fallback: create new if not found
            cleanData.id = `custom-${Date.now()}`;
            customDrivers.push(cleanData);
        }
    }

    saveCustomDrivers(customDrivers);
    return true;
}

function deleteDriver(driver) {
    if (!driver.isCustom) return;

    const index = customDrivers.findIndex(d => d.id === driver.id);
    if (index >= 0) {
        customDrivers.splice(index, 1);
        saveCustomDrivers(customDrivers);
    }
}

function exportDriver(driver) {
    // Create clean export without internal flags
    const exportData = { ...driver };
    delete exportData.isCustom;

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${driver.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventListeners() {
    // Close button
    document.getElementById('driverLibraryClose')?.addEventListener('click', closeDriverLibrary);

    // Click outside to close
    document.getElementById('driverLibraryModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'driverLibraryModal') closeDriverLibrary();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('driverLibraryModal');
            if (modal?.classList.contains('visible')) {
                if (currentView === 'list') {
                    closeDriverLibrary();
                } else {
                    showListView();
                    renderDriverList();
                }
            }
        }
    });

    // Search and filter
    document.getElementById('driverSearch')?.addEventListener('input', renderDriverList);
    document.getElementById('driverFilter')?.addEventListener('change', renderDriverList);

    // New and Import buttons
    document.getElementById('driverNewBtn')?.addEventListener('click', () => {
        showEditView({}, true);
    });
    document.getElementById('driverImportBtn')?.addEventListener('click', showImportView);

    // Form view back button - always returns to list
    document.getElementById('driverEditBack')?.addEventListener('click', () => {
        showListView();
        renderDriverList();
    });

    document.getElementById('driverSaveBtn')?.addEventListener('click', () => {
        const editView = document.getElementById('driverEditView');
        const mode = editView?.dataset?.mode || 'new';
        const data = getEditFormData();

        const isCreatingNew = mode === 'new';
        if (saveDriver(data, isCreatingNew)) {
            customDrivers = loadCustomDrivers();
            const savedDriver = customDrivers.find(d =>
                isCreatingNew ? d.name === data.name : d.id === selectedDriver?.id
            );
            if (savedDriver) {
                showDriverForm({ ...savedDriver, isCustom: true }, 'custom');
            } else {
                showListView();
                renderDriverList();
            }
        }
    });

    // Copy built-in driver to custom
    document.getElementById('driverCopyBtn')?.addEventListener('click', () => {
        if (!selectedDriver) return;
        const copy = {
            ...selectedDriver,
            id: `custom-${Date.now()}`,
            name: `${selectedDriver.name} (Copy)`
        };
        delete copy.isCustom;
        customDrivers.push(copy);
        saveCustomDrivers(customDrivers);
        // Switch to editing the new copy
        showDriverForm({ ...copy, isCustom: true }, 'custom');
    });

    // Select driver from form
    document.getElementById('driverSelectFromFormBtn')?.addEventListener('click', () => {
        if (onDriverSelected) {
            // For readonly mode, use selectedDriver; for edit mode, use form data
            const mode = document.getElementById('driverEditView')?.dataset?.mode;
            const data = mode === 'builtin' ? selectedDriver : getEditFormData();
            onDriverSelected(data);
            closeDriverLibrary();
        }
    });

    // Export from form
    document.getElementById('driverExportFromFormBtn')?.addEventListener('click', () => {
        const mode = document.getElementById('driverEditView')?.dataset?.mode;
        const data = mode === 'builtin' ? selectedDriver : getEditFormData();
        exportDriver(data);
    });

    // Delete from form
    document.getElementById('driverFormDeleteBtn')?.addEventListener('click', () => {
        if (selectedDriver?.isCustom || selectedDriver?.id) {
            if (confirm(`Delete "${selectedDriver.name}"?`)) {
                deleteDriver(selectedDriver);
                showListView();
                renderDriverList();
            }
        }
    });

    // Import view
    document.getElementById('driverImportBack')?.addEventListener('click', () => {
        showListView();
        renderDriverList();
    });

    document.getElementById('driverImportCancelBtn')?.addEventListener('click', () => {
        showListView();
        renderDriverList();
    });

    const importTextarea = document.getElementById('driverJsonInput');
    importTextarea?.addEventListener('input', () => {
        const text = importTextarea.value.trim();
        const preview = document.getElementById('driverImportPreview');
        const error = document.getElementById('driverImportError');
        const confirmBtn = document.getElementById('driverImportConfirmBtn');

        if (!text) {
            if (confirmBtn) confirmBtn.disabled = true;
            if (preview) preview.style.display = 'none';
            if (error) error.style.display = 'none';
            return;
        }

        const result = validateDriverJson(text);
        if (result.valid) {
            if (confirmBtn) confirmBtn.disabled = false;
            if (error) error.style.display = 'none';
            if (preview) {
                const data = result.data;
                preview.innerHTML = `
                    <strong>${data.name || 'Custom Driver'}</strong><br>
                    Fs: ${data.fs} Hz | Qts: ${data.qts} | Vas: ${data.vas} L<br>
                    ${data.xmax ? `Xmax: ${data.xmax} mm | ` : ''}${data.pe ? `Pe: ${data.pe} W` : ''}
                `;
                preview.style.display = 'block';
            }
        } else {
            if (confirmBtn) confirmBtn.disabled = true;
            if (preview) preview.style.display = 'none';
            if (error) {
                error.textContent = result.error;
                error.style.display = 'block';
            }
        }
    });

    document.getElementById('driverImportConfirmBtn')?.addEventListener('click', () => {
        const text = importTextarea?.value.trim();
        if (!text) return;

        const result = validateDriverJson(text);
        if (!result.valid) return;

        const data = result.data;
        data.id = data.id || `custom-${Date.now()}`;
        data.name = data.name || 'Custom Driver';

        customDrivers.push(data);
        saveCustomDrivers(customDrivers);

        // Show the imported driver
        showDetailView({ ...data, isCustom: true });
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { customDrivers };
