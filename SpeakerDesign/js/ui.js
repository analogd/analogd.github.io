// UI handling and event listeners

let chart;
let driverLibrary = [];
let currentDriver = null;
let currentAlignments = [];

document.addEventListener('DOMContentLoaded', async () => {
    chart = new ResponseChart('response-chart');
    chart.init();

    // Load driver library and help content
    await loadDriverLibrary();
    await loadCustomDrivers();
    await loadHelpContent();

    // Event listeners
    document.getElementById('calculate-btn').addEventListener('click', handleCalculate);
    document.getElementById('driver-select').addEventListener('change', handleDriverSelect);
    document.getElementById('power').addEventListener('input', handlePowerChange);
    document.querySelectorAll('input[name="enclosure"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (currentDriver) updateAlignmentGraph();
        });
    });
    document.getElementById('save-project-btn').addEventListener('click', saveProject);
    document.getElementById('load-project-btn').addEventListener('click', loadProject);
    document.getElementById('export-driver-btn').addEventListener('click', exportDriver);
    document.getElementById('import-driver-btn').addEventListener('click', importDriver);

    // Listen for alignment selection
    document.addEventListener('alignmentSelected', handleAlignmentSelected);

    // Attach real-time validation to input fields
    Validator.attachFieldValidation('fs', 'fs');
    Validator.attachFieldValidation('qts', 'qts');
    Validator.attachFieldValidation('vas', 'vas');
    Validator.attachFieldValidation('re', 're');
    Validator.attachFieldValidation('le', 'le');
    Validator.attachFieldValidation('xmax', 'xmax');
    Validator.attachFieldValidation('sd', 'sd');
    Validator.attachFieldValidation('pe', 'pe');
    Validator.attachFieldValidation('power', 'power');

    // Event delegation for dynamically created buttons
    setupEventDelegation();

    // Help modal - use event delegation since content loads async
    document.getElementById('help-btn').addEventListener('click', openHelpModal);
    document.getElementById('help-modal').addEventListener('click', (e) => {
        // Close button
        if (e.target.classList.contains('modal-close')) {
            closeHelpModal();
        }
        // Tab switching
        if (e.target.classList.contains('help-tab')) {
            switchHelpTab(e.target.dataset.tab);
        }
        // Click outside
        if (e.target.id === 'help-modal') {
            closeHelpModal();
        }
    });

    // Filter panel
    document.getElementById('filter-toggle-btn').addEventListener('click', toggleFilterPanel);
    document.getElementById('apply-filters-btn').addEventListener('click', applyFilters);
    document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);

    // Driver editor
    document.getElementById('create-driver-btn').addEventListener('click', () => openDriverEditor());
    document.getElementById('edit-driver-btn').addEventListener('click', () => openDriverEditor(currentDriver));
    document.querySelectorAll('.driver-editor-close').forEach(el => {
        el.addEventListener('click', closeDriverEditor);
    });
    document.getElementById('save-driver-btn').addEventListener('click', saveCustomDriver);

    // Real-time derived parameter calculation in editor
    const editorInputs = ['edit-fs', 'edit-qts', 'edit-qes', 'edit-qms', 'edit-vas', 'edit-sd', 'edit-xmax'];
    editorInputs.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.addEventListener('input', updateDerivedPreview);
        }
    });

    // Load saved project if exists, otherwise default to UM18-22
    const lastProject = Utils.storage.get('lastProject');
    if (lastProject) {
        loadLastProject();
    } else {
        // Auto-select UM18-22 for development
        setTimeout(() => {
            const driverSelect = document.getElementById('driver-select');
            const um18Option = Array.from(driverSelect.options).find(opt =>
                opt.value === 'dayton-um18-22'
            );
            if (um18Option) {
                driverSelect.value = um18Option.value;
                handleDriverSelect({ target: { value: um18Option.value } });
            }
        }, 100);
    }
});

// Event delegation for dynamically created content
function setupEventDelegation() {
    // Handle all data-action buttons
    document.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (!action) return;

        switch (action) {
            case 'toggle-box-design':
                toggleBoxDesign();
                break;
            case 'export-box-plan':
                exportBoxPlan();
                break;
        }
    });

    // Handle quick select driver buttons
    document.addEventListener('click', (e) => {
        const quickBtn = e.target.closest('.quick-select-btn');
        if (!quickBtn) return;

        const driverId = quickBtn.dataset.driver;
        if (!driverId) return;

        const driverSelect = document.getElementById('driver-select');
        driverSelect.value = driverId;
        handleDriverSelect({ target: { value: driverId } });
    });

    // Handle alignment button clicks
    document.addEventListener('click', (e) => {
        const button = e.target.closest('.alignment-button');
        if (!button) return;

        const alignmentIndex = parseInt(button.dataset.alignmentIndex);
        if (isNaN(alignmentIndex)) return;

        handleAlignmentButtonClick(alignmentIndex);
    });

    // Handle port diameter calculator
    document.addEventListener('input', (e) => {
        if (e.target.id === 'port-diameter-calc') {
            const fb = e.target.dataset.fb;
            const vb = e.target.dataset.vb;
            if (fb && vb) {
                recalculatePort(fb, vb);
            }
        }
    });
}

async function loadDriverLibrary() {
    try {
        const response = await fetch('data/drivers.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        driverLibrary = data.drivers;

        populateDriverDropdown(driverLibrary);
    } catch (error) {
        console.error('Failed to load driver library:', error);
        const isFileProtocol = window.location.protocol === 'file:';
        const errorMsg = isFileProtocol
            ? 'Cannot load driver library from file:// protocol. Start a local server: <code>python3 -m http.server 8000</code>'
            : 'Failed to load driver library. Please check console for details.';
        displayResults(`<p style="color: red;">${errorMsg}</p>`);
    }
}

function populateDriverDropdown(drivers) {
    const select = document.getElementById('driver-select');

    // Clear existing options except first
    while (select.options.length > 1) {
        select.remove(1);
    }

    // Group by manufacturer
    const groupedDrivers = {};
    for (const driver of drivers) {
        if (!groupedDrivers[driver.manufacturer]) {
            groupedDrivers[driver.manufacturer] = [];
        }
        groupedDrivers[driver.manufacturer].push(driver);
    }

    // Add options grouped by manufacturer
    for (const [manufacturer, driverList] of Object.entries(groupedDrivers).sort()) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = manufacturer;

        for (const driver of driverList.sort((a, b) => a.model.localeCompare(b.model))) {
            const option = document.createElement('option');
            option.value = driver.id;
            const vdText = driver.derived?.vd ? ` [VD: ${driver.derived.vd}]` : '';
            option.textContent = `${driver.model} (${driver.size}")${vdText}`;
            optgroup.appendChild(option);
        }

        select.appendChild(optgroup);
    }
}

function handleDriverSelect(event) {
    const driverId = event.target.value;

    if (!driverId) {
        currentDriver = null;
        document.getElementById('driver-info').classList.remove('visible');
        clearForm();
        chart.clear();
        return;
    }

    const driver = driverLibrary.find(d => d.id === driverId);
    if (!driver) return;

    currentDriver = driver;

    // Display driver info
    const infoDiv = document.getElementById('driver-info');
    let derivedHtml = '';
    if (driver.derived) {
        const parts = [];
        if (driver.derived.vd) parts.push(`VD: ${driver.derived.vd} cm³`);
        if (driver.derived.ebp) parts.push(`EBP: ${driver.derived.ebp}`);
        if (driver.derived.enclosureHint) parts.push(`Best for: ${driver.derived.enclosureHint}`);
        if (driver.derived.sensitivityEst) parts.push(`Est. Sens: ${driver.derived.sensitivityEst} dB`);
        if (parts.length > 0) {
            derivedHtml = `<br><em>${parts.join(' | ')}</em>`;
        }
    }

    infoDiv.innerHTML = `
        <strong>${driver.manufacturer} ${driver.model}</strong><br>
        ${driver.notes}<br>
        Tags: ${driver.tags.join(', ')}${derivedHtml}
    `;
    infoDiv.classList.add('visible');

    // Load driver parameters into form
    document.getElementById('fs').value = driver.ts.fs;
    document.getElementById('qts').value = driver.ts.qts;
    document.getElementById('vas').value = driver.ts.vas;
    document.getElementById('re').value = driver.ts.re;
    document.getElementById('le').value = driver.ts.le;
    document.getElementById('xmax').value = driver.ts.xmax;
    document.getElementById('sd').value = driver.ts.sd;
    document.getElementById('pe').value = driver.ts.pe;

    // Auto-select enclosure type based on driver characteristics
    if (driver.derived && driver.derived.enclosureHint) {
        const hint = driver.derived.enclosureHint;
        if (hint === 'sealed') {
            document.querySelector('input[name="enclosure"][value="sealed"]').checked = true;
        } else if (hint === 'ported') {
            document.querySelector('input[name="enclosure"][value="ported"]').checked = true;
        } else {
            // versatile - default to sealed
            document.querySelector('input[name="enclosure"][value="sealed"]').checked = true;
        }
    }

    // Auto-calculate and display alignments
    updateAlignmentGraph();

    // Auto-select best alignment after a short delay
    setTimeout(() => {
        if (currentAlignments.length > 0) {
            // For sealed: prefer Butterworth (Q=0.707)
            // For ported: prefer QB3
            const enclosureType = document.querySelector('input[name="enclosure"]:checked').value;
            let bestIndex = 0;

            if (enclosureType === 'sealed') {
                // Find Butterworth
                bestIndex = currentAlignments.findIndex(a => a.alignment.includes('0.707'));
                if (bestIndex === -1) bestIndex = 0;
            } else if (enclosureType === 'ported') {
                // Find QB3
                bestIndex = currentAlignments.findIndex(a => a.alignment.includes('QB3'));
                if (bestIndex === -1) bestIndex = 0;
            }

            handleAlignmentButtonClick(bestIndex);
        }
    }, 200);
}

function clearForm() {
    document.getElementById('fs').value = '';
    document.getElementById('qts').value = '';
    document.getElementById('vas').value = '';
    document.getElementById('re').value = '';
    document.getElementById('le').value = '';
    document.getElementById('xmax').value = '';
    document.getElementById('sd').value = '';
    document.getElementById('pe').value = '';
    document.getElementById('alignment-buttons').innerHTML = '';
    currentAlignments = [];
}

function updateAlignmentGraph() {
    const params = {
        fs: document.getElementById('fs').value,
        qts: document.getElementById('qts').value,
        vas: document.getElementById('vas').value,
        re: document.getElementById('re').value,
        le: document.getElementById('le').value,
        xmax: document.getElementById('xmax').value,
        sd: document.getElementById('sd').value,
        pe: document.getElementById('pe').value
    };

    // Validate driver parameters
    const validation = Validator.validateDriverParameters(params);

    if (!validation.valid) {
        displayResults(Validator.displayValidationErrors(validation.errors, validation.warnings));
        chart.clear();
        document.getElementById('alignment-buttons').innerHTML = '';
        currentAlignments = [];
        return;
    }

    // Show warnings if any, but continue
    if (validation.warnings.length > 0) {
        console.warn('Parameter warnings:', validation.warnings);
    }

    // Validate power
    const powerInput = document.getElementById('power').value;
    const powerValidation = Validator.validatePower(powerInput);

    if (!powerValidation.valid) {
        displayResults(Validator.displayValidationErrors([powerValidation.error], []));
        chart.clear();
        document.getElementById('alignment-buttons').innerHTML = '';
        currentAlignments = [];
        return;
    }

    const power = powerValidation.value;

    const enclosureType = document.querySelector('input[name="enclosure"]:checked').value;

    if (enclosureType === 'sealed' || enclosureType === 'ported') {
        const alignments = SpeakerCalculations.calculateAllAlignments(validation.validated, enclosureType);

        // If power specified, recalculate with thermal/excursion limits
        if (power) {
            alignments.forEach(alignment => {
                const response = SpeakerCalculations.calculateFrequencyResponse(
                    validation.validated,
                    enclosureType,
                    parseFloat(alignment.vb),
                    alignment.fb ? parseFloat(alignment.fb) : null,
                    power
                );
                alignment.thermalLimit = response.thermalLimit;
                alignment.excursionLimit = response.excursionLimit;
            });
        }

        currentAlignments = alignments;

        // Calculate limits for each alignment at 25Hz
        alignments.forEach(alignment => {
            alignment.limits = SpeakerCalculations.calculateLimitingFactors(
                validation.validated,
                enclosureType,
                parseFloat(alignment.vb),
                alignment.fb ? parseFloat(alignment.fb) : null,
                power,
                25 // Test frequency
            );
        });

        chart.updateMultiTrace(alignments, power);
        renderAlignmentButtons(alignments, power);

        // Display warnings if any
        let resultsHtml = '';
        if (validation.warnings.length > 0) {
            resultsHtml += Validator.displayValidationErrors([], validation.warnings);
        }
        resultsHtml += '<h3>Common Alignments</h3>';
        resultsHtml += '<p style="color: #666; font-size: 0.9em; margin-bottom: 10px;">Use the buttons below to select an alignment and see detailed box design</p>';
        displayResults(resultsHtml);
    }
}

function handlePowerChange() {
    if (currentDriver) {
        updateAlignmentGraph();
    }
}

function handleAlignmentSelected(event) {
    const alignment = event.detail;

    // Update button visual state to match chart selection
    const selectedIndex = currentAlignments.findIndex(a => a.alignment === alignment.alignment);
    if (selectedIndex !== -1) {
        document.querySelectorAll('.alignment-button').forEach((btn, idx) => {
            if (idx === selectedIndex) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }

    // Calculate box dimensions
    const boxDesign = calculateBoxDimensions(parseFloat(alignment.vb));

    // Port velocity warning
    let portVelocityHtml = '';
    if (alignment.portVelocity) {
        const velocity = parseFloat(alignment.portVelocity);
        const color = Utils.getPortVelocityColor(velocity);
        portVelocityHtml = `<strong>Port Velocity:</strong> <span style="color: ${color};">${alignment.portVelocity} m/s</span>`;
        if (alignment.portVelocityWarning) {
            portVelocityHtml += ` <em style="color: ${color};">(${alignment.portVelocityWarning})</em>`;
        }
        portVelocityHtml += '<br>';
    }

    // Display selected alignment info with expandable design section
    let html = `
        <h3>Selected Alignment: ${alignment.alignment}</h3>
        <div class="result-item">
            <strong>Box Volume:</strong> ${alignment.vb} L (${boxDesign.volumeCuFt} cu.ft)<br>
            ${alignment.fb ? `<strong>Tuning Frequency:</strong> ${alignment.fb} Hz<br>` : ''}
            ${alignment.fc ? `<strong>System Fc:</strong> ${alignment.fc} Hz<br>` : ''}
            <strong>F3 (-3dB):</strong> ${alignment.f3} Hz<br>
            ${alignment.portDiameter ? `<strong>Port Diameter:</strong> ${alignment.portDiameter} cm (${(parseFloat(alignment.portDiameter) / 2.54).toFixed(1)} in)<br>` : ''}
            ${alignment.portLength ? `<strong>Port Length:</strong> ${alignment.portLength} cm (${(parseFloat(alignment.portLength) / 2.54).toFixed(1)} in)<br>` : ''}
            ${portVelocityHtml}
        </div>

        <div class="box-design-section">
            <button class="expand-btn" data-action="toggle-box-design">▶ Box Design Details</button>
            <div id="box-design-details" class="box-design-details" style="display: none;">
                <h4>Internal Dimensions</h4>
                <div class="dimension-options">
                    ${boxDesign.dimensions.map((dim, idx) => `
                        <div class="dimension-option">
                            <strong>Option ${idx + 1}:</strong> ${dim.metric}<br>
                            <span style="color: #666;">${dim.imperial}</span>
                        </div>
                    `).join('')}
                </div>

                <h4>Construction</h4>
                <div class="construction-info">
                    <strong>Material:</strong> 3/4" (19mm) MDF or plywood recommended<br>
                    <strong>Bracing:</strong> ${boxDesign.bracingNote}<br>
                    <strong>Stuffing:</strong> ${boxDesign.stuffingNote}
                </div>

                ${alignment.type === 'ported' ? `
                    <h4>Port Options</h4>
                    <div class="port-calculator">
                        <p style="font-size: 0.9em; color: #666; margin-bottom: 8px;">
                            <em>Calculations assume straight cylindrical port. For other types:</em><br>
                            • <strong>Flared port:</strong> Use ~0.85× calculated length<br>
                            • <strong>Slot port:</strong> Use hydraulic diameter (2×W×H)/(W+H)<br>
                            • <strong>Aeroport/precision port:</strong> Follow manufacturer's tuning guide
                        </p>
                        <label>Port Diameter (cm): <input type="number" id="port-diameter-calc" value="${alignment.portDiameter}" step="0.5" data-fb="${alignment.fb}" data-vb="${alignment.vb}"></label><br>
                        <div id="port-length-result" style="margin-top: 8px;">
                            Port Length: ${alignment.portLength} cm (${(parseFloat(alignment.portLength) / 2.54).toFixed(1)} in)
                        </div>
                    </div>
                ` : ''}

                <div class="design-actions" style="margin-top: 15px;">
                    <button class="secondary-btn" data-action="export-box-plan">📋 Export Build Plan</button>
                </div>
            </div>
        </div>
    `;

    displayResults(html);
}

function calculateBoxDimensions(volumeLiters) {
    return {
        volumeCuFt: Utils.formatNumber(Utils.litersToCuFt(volumeLiters), 2),
        dimensions: Utils.getDimensionOptions(volumeLiters),
        bracingNote: Utils.getBracingNote(volumeLiters),
        stuffingNote: Utils.getStuffingNote()
    };
}

function toggleBoxDesign() {
    const details = document.getElementById('box-design-details');
    const btn = document.querySelector('.expand-btn');
    if (details.style.display === 'none') {
        details.style.display = 'block';
        btn.innerHTML = '▼ Box Design Details';
    } else {
        details.style.display = 'none';
        btn.innerHTML = '▶ Box Design Details';
    }
}

function recalculatePort(fb, vb) {
    const diameter = document.getElementById('port-diameter-calc').value;

    // Validate port diameter
    const validation = Validator.validatePortDiameter(diameter);

    if (!validation.valid) {
        document.getElementById('port-length-result').innerHTML =
            `<span style="color: #e74c3c;">${validation.error}</span>`;
        return;
    }

    const diam = validation.value;
    const portArea = Math.PI * (diam / 2) ** 2;
    const portLength = (23562.5 * portArea) / (parseFloat(vb) * parseFloat(fb) ** 2) - 0.732 * diam;
    const lengthCm = Math.max(1, portLength).toFixed(1);
    const lengthIn = (lengthCm / 2.54).toFixed(1);

    // Warning if port length is too short or too long
    let warning = '';
    if (portLength < 5) {
        warning = '<br><span style="color: #f39c12;">⚠️ Very short - may have turbulence</span>';
    } else if (portLength > 50) {
        warning = '<br><span style="color: #f39c12;">⚠️ Very long - consider larger diameter</span>';
    }

    // Calculate port velocity if we have driver parameters
    let velocityHtml = '';
    if (currentDriver && currentDriver.ts.sd && currentDriver.ts.xmax) {
        const velocity = SpeakerCalculations.calculatePortVelocity(
            currentDriver.ts.sd,
            currentDriver.ts.xmax,
            parseFloat(fb),
            diam
        );

        if (velocity) {
            const color = Utils.getPortVelocityColor(velocity);
            const warning = Utils.getPortVelocityWarning(velocity) || 'Good - low chuffing risk';
            const icon = velocity > Constants.PORT.VELOCITY_WARNING_HIGH ? '⚠️' : '✓';
            velocityHtml = `<br>Port Velocity: <span style="color: ${color}; font-weight: bold;">${velocity.toFixed(1)} m/s</span>`;
            velocityHtml += ` <span style="color: ${color};">${icon} ${warning}</span>`;
        }
    }

    document.getElementById('port-length-result').innerHTML =
        `Port Length: ${lengthCm} cm (${lengthIn} in)${warning}${velocityHtml}`;
}

function exportBoxPlan() {
    const resultsDiv = document.getElementById('results');
    const planText = resultsDiv.innerText;

    const blob = new Blob([planText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'speaker-box-plan.txt';
    link.click();
    URL.revokeObjectURL(url);

    alert('Build plan exported!');
}

function displayAlignmentResults(alignments) {
    let html = `<h3>Common Alignments (Click to select)</h3>`;
    html += `<p style="color: #666; font-size: 0.9em; margin-bottom: 10px;">Click on any trace in the graph to select an alignment</p>`;
    displayResults(html);
}

function handleCalculate() {
    // Just delegate to updateAlignmentGraph which now has validation
    updateAlignmentGraph();
}

function displaySealedResults(results) {
    let html = '<h3>Sealed Box Designs</h3>';

    for (const result of results) {
        html += `
            <div class="result-item">
                <strong>${result.alignment}</strong><br>
                Qtc: ${result.qtc}<br>
                Box Volume: ${result.vb} L<br>
                System Fc: ${result.fc} Hz<br>
                F3 (-3dB): ${result.f3} Hz
            </div>
        `;
    }

    displayResults(html);
}

function displayPortedResults(results) {
    let html = '<h3>Ported Box Designs</h3>';

    for (const result of results) {
        html += `
            <div class="result-item">
                <strong>${result.alignment}</strong><br>
                Box Volume: ${result.vb} L<br>
                Tuning Freq: ${result.fb} Hz<br>
                Port Diameter: ${result.portDiameter} cm<br>
                Port Length: ${result.portLength} cm
            </div>
        `;
    }

    displayResults(html);
}

function displayResults(html) {
    document.getElementById('results').innerHTML = html;
}

function renderAlignmentButtons(alignments, power) {
    const container = document.getElementById('alignment-buttons');
    container.innerHTML = '';

    // Use same colors as chart
    const colors = [
        '#3498db',
        '#2ecc71',
        '#e74c3c',
        '#f39c12',
        '#9b59b6',
        '#1abc9c'
    ];

    const driverSize = currentDriver ? currentDriver.size : 15;

    alignments.forEach((alignment, idx) => {
        const button = document.createElement('div');
        button.className = 'alignment-button';
        button.dataset.alignmentIndex = idx;
        button.style.borderLeftColor = colors[idx % colors.length];

        // Calculate external dimensions
        const boxCalc = Utils.calculateNetVolumeAndDimensions(parseFloat(alignment.vb), driverSize);

        // Main content container
        const mainContent = document.createElement('div');
        mainContent.style.display = 'flex';
        mainContent.style.flexDirection = 'column';
        mainContent.style.gap = '4px';
        mainContent.style.flex = '1';

        // Top row: name and specs
        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.justifyContent = 'space-between';
        topRow.style.alignItems = 'center';

        const name = document.createElement('span');
        name.className = 'alignment-button-name';
        name.textContent = alignment.alignment;

        const specs = document.createElement('div');
        specs.className = 'alignment-button-specs';

        const vbSpec = document.createElement('span');
        vbSpec.className = 'alignment-button-spec';
        vbSpec.textContent = `Box: ${alignment.vb}L`;

        const f3Spec = document.createElement('span');
        f3Spec.className = 'alignment-button-spec';
        f3Spec.textContent = `F3: ${alignment.f3}Hz`;

        specs.appendChild(vbSpec);
        specs.appendChild(f3Spec);

        if (alignment.fb) {
            const fbSpec = document.createElement('span');
            fbSpec.className = 'alignment-button-spec';
            fbSpec.textContent = `Tuning: ${alignment.fb}Hz`;
            specs.appendChild(fbSpec);
        }

        topRow.appendChild(name);
        topRow.appendChild(specs);

        // Bottom row: external dimensions and construction info
        const dimRow = document.createElement('div');
        dimRow.style.fontSize = '11px';
        dimRow.style.color = '#666';
        dimRow.style.lineHeight = '1.4';

        const parts = [];
        parts.push(`<strong>Build:</strong> ${boxCalc.externalDimensions.metric} (external)`);
        parts.push(`<span style="color: #888;">Internal: ${boxCalc.netInternalVolume}L → ${alignment.vb}L working after driver/bracing</span>`);

        // Add limit info if available
        if (power && alignment.limits) {
            const limits = alignment.limits;
            let limitText = `@ ${power}W, 25Hz: ${limits.systemSPL ? limits.systemSPL.toFixed(1) : '?'}dB`;

            if (limits.limitingFactor !== 'none') {
                const icon = limits.limitingFactor === 'excursion' ? '⚠️' :
                            limits.limitingFactor === 'thermal' ? '🔥' : '💨';
                const color = limits.limitingMargin < -2 ? '#e74c3c' : '#f39c12';
                limitText += ` <span style="color: ${color};">${icon} ${limits.limitingFactor}</span>`;
            } else {
                limitText += ` <span style="color: #27ae60;">✓</span>`;
            }

            parts.push(limitText);
        }

        dimRow.innerHTML = parts.join('<br>');

        mainContent.appendChild(topRow);
        mainContent.appendChild(dimRow);
        button.appendChild(mainContent);
        container.appendChild(button);
    });
}

function handleAlignmentButtonClick(alignmentIndex) {
    // Update button visual state
    document.querySelectorAll('.alignment-button').forEach((btn, idx) => {
        if (idx === alignmentIndex) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // Trigger chart selection
    chart.handleAlignmentClick(alignmentIndex);
}

// Project Management Functions

function saveProject() {
    const projectName = prompt('Enter project name:', 'My Speaker Project');
    if (!projectName) return;

    const project = {
        name: projectName,
        timestamp: new Date().toISOString(),
        driver: currentDriver ? currentDriver.id : null,
        parameters: {
            fs: document.getElementById('fs').value,
            qts: document.getElementById('qts').value,
            vas: document.getElementById('vas').value,
            re: document.getElementById('re').value,
            le: document.getElementById('le').value,
            xmax: document.getElementById('xmax').value,
            sd: document.getElementById('sd').value,
            pe: document.getElementById('pe').value
        },
        enclosure: document.querySelector('input[name="enclosure"]:checked').value
    };

    // Save to localStorage
    const projects = getProjects();
    projects.push(project);
    Utils.storage.set('speakerDesignProjects', projects);
    Utils.storage.set('lastProject', project);

    alert(`Project "${projectName}" saved successfully!`);
}

function loadProject() {
    const projects = getProjects();

    if (projects.length === 0) {
        alert('No saved projects found.');
        return;
    }

    // Create project list
    let projectList = 'Select a project to load:\n\n';
    projects.forEach((proj, idx) => {
        projectList += `${idx + 1}. ${proj.name} (${new Date(proj.timestamp).toLocaleDateString()})\n`;
    });

    const selection = prompt(projectList + '\nEnter project number:');
    if (!selection) return;

    const index = parseInt(selection) - 1;
    if (index < 0 || index >= projects.length) {
        alert('Invalid project number.');
        return;
    }

    const project = projects[index];

    // Load driver if available
    if (project.driver) {
        document.getElementById('driver-select').value = project.driver;
        handleDriverSelect({ target: { value: project.driver } });
    }

    // Load parameters
    document.getElementById('fs').value = project.parameters.fs;
    document.getElementById('qts').value = project.parameters.qts;
    document.getElementById('vas').value = project.parameters.vas;
    document.getElementById('re').value = project.parameters.re;
    document.getElementById('le').value = project.parameters.le;
    document.getElementById('xmax').value = project.parameters.xmax;
    document.getElementById('sd').value = project.parameters.sd;
    document.getElementById('pe').value = project.parameters.pe;

    // Load enclosure type
    document.querySelector(`input[name="enclosure"][value="${project.enclosure}"]`).checked = true;

    alert(`Project "${project.name}" loaded successfully!`);
}

function loadLastProject() {
    const project = Utils.storage.get('lastProject');
    if (!project) return;

    try {

        // Silently load last project
        if (project.driver) {
            document.getElementById('driver-select').value = project.driver;
            handleDriverSelect({ target: { value: project.driver } });
        } else {
            // Load custom parameters
            document.getElementById('fs').value = project.parameters.fs;
            document.getElementById('qts').value = project.parameters.qts;
            document.getElementById('vas').value = project.parameters.vas;
            document.getElementById('re').value = project.parameters.re;
            document.getElementById('le').value = project.parameters.le;
            document.getElementById('xmax').value = project.parameters.xmax;
            document.getElementById('sd').value = project.parameters.sd;
            document.getElementById('pe').value = project.parameters.pe;
        }

        document.querySelector(`input[name="enclosure"][value="${project.enclosure}"]`).checked = true;
    } catch (error) {
        console.error('Failed to load last project:', error);
    }
}

function getProjects() {
    return Utils.storage.get('speakerDesignProjects') || [];
}

function exportDriver() {
    if (!currentDriver) {
        alert('Please select a driver first.');
        return;
    }

    const dataStr = JSON.stringify(currentDriver, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentDriver.id}.json`;
    link.click();

    URL.revokeObjectURL(url);
}

function importDriver() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const driver = JSON.parse(text);

            // Validate driver structure
            if (!driver.manufacturer || !driver.model || !driver.ts) {
                alert('Invalid driver file format.');
                return;
            }

            // Add to library (in memory only)
            driverLibrary.push(driver);

            // Add to dropdown
            const select = document.getElementById('driver-select');
            const option = document.createElement('option');
            option.value = driver.id;
            option.textContent = `${driver.manufacturer} ${driver.model} (${driver.size}") [Custom]`;
            select.appendChild(option);

            // Select the imported driver
            select.value = driver.id;
            handleDriverSelect({ target: { value: driver.id } });

            alert(`Driver "${driver.manufacturer} ${driver.model}" imported successfully!`);
        } catch (error) {
            alert('Failed to import driver: ' + error.message);
        }
    };

    input.click();
}

// Help Modal Functions

function openHelpModal() {
    document.getElementById('help-modal').classList.add('active');
}

function closeHelpModal() {
    document.getElementById('help-modal').classList.remove('active');
}

function switchHelpTab(tabName) {
    // Remove active from all tabs and panels
    document.querySelectorAll('.help-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.help-panel').forEach(panel => panel.classList.remove('active'));

    // Add active to selected tab and panel
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`help-${tabName}`).classList.add('active');
}

// Filter Functions

function toggleFilterPanel() {
    document.getElementById('filter-panel').classList.toggle('visible');
}

function applyFilters() {
    const filters = {
        size: document.getElementById('filter-size').value,
        enclosureHint: document.getElementById('filter-enclosure-hint').value,
        vdMin: parseFloat(document.getElementById('filter-vd-min').value) || null,
        vdMax: parseFloat(document.getElementById('filter-vd-max').value) || null,
        powerMin: parseFloat(document.getElementById('filter-power-min').value) || null,
        powerMax: parseFloat(document.getElementById('filter-power-max').value) || null
    };

    const filtered = driverLibrary.filter(driver => {
        // Size filter
        if (filters.size && driver.size !== parseInt(filters.size)) return false;

        // Enclosure hint filter
        if (filters.enclosureHint && driver.derived?.enclosureHint !== filters.enclosureHint) return false;

        // VD filter
        if (filters.vdMin && (!driver.derived?.vd || driver.derived.vd < filters.vdMin)) return false;
        if (filters.vdMax && (!driver.derived?.vd || driver.derived.vd > filters.vdMax)) return false;

        // Power filter
        if (filters.powerMin && (!driver.ts.pe || driver.ts.pe < filters.powerMin)) return false;
        if (filters.powerMax && (!driver.ts.pe || driver.ts.pe > filters.powerMax)) return false;

        return true;
    });

    populateDriverDropdown(filtered);

    const btn = document.getElementById('filter-toggle-btn');
    btn.textContent = `🔍 Filter Drivers (${filtered.length} of ${driverLibrary.length})`;
}

function clearFilters() {
    document.getElementById('filter-size').value = '';
    document.getElementById('filter-enclosure-hint').value = '';
    document.getElementById('filter-vd-min').value = '';
    document.getElementById('filter-vd-max').value = '';
    document.getElementById('filter-power-min').value = '';
    document.getElementById('filter-power-max').value = '';

    populateDriverDropdown(driverLibrary);

    const btn = document.getElementById('filter-toggle-btn');
    btn.textContent = '🔍 Filter Drivers';
}

// Driver Editor Functions

function openDriverEditor(driver = null) {
    const modal = document.getElementById('driver-editor-modal');

    if (driver) {
        // Edit existing driver
        document.getElementById('edit-manufacturer').value = driver.manufacturer || '';
        document.getElementById('edit-model').value = driver.model || '';
        document.getElementById('edit-size').value = driver.size || '';
        document.getElementById('edit-notes').value = driver.notes || '';
        document.getElementById('edit-fs').value = driver.ts.fs || '';
        document.getElementById('edit-qts').value = driver.ts.qts || '';
        document.getElementById('edit-qes').value = driver.ts.qes || '';
        document.getElementById('edit-qms').value = driver.ts.qms || '';
        document.getElementById('edit-vas').value = driver.ts.vas || '';
        document.getElementById('edit-re').value = driver.ts.re || '';
        document.getElementById('edit-le').value = driver.ts.le || '';
        document.getElementById('edit-xmax').value = driver.ts.xmax || '';
        document.getElementById('edit-sd').value = driver.ts.sd || '';
        document.getElementById('edit-pe').value = driver.ts.pe || '';
    } else {
        // Clear form for new driver
        document.getElementById('edit-manufacturer').value = '';
        document.getElementById('edit-model').value = '';
        document.getElementById('edit-size').value = '';
        document.getElementById('edit-notes').value = '';
        document.getElementById('edit-fs').value = '';
        document.getElementById('edit-qts').value = '';
        document.getElementById('edit-qes').value = '';
        document.getElementById('edit-qms').value = '';
        document.getElementById('edit-vas').value = '';
        document.getElementById('edit-re').value = '';
        document.getElementById('edit-le').value = '';
        document.getElementById('edit-xmax').value = '';
        document.getElementById('edit-sd').value = '';
        document.getElementById('edit-pe').value = '';
    }

    updateDerivedPreview();
    modal.classList.add('active');
}

function closeDriverEditor() {
    document.getElementById('driver-editor-modal').classList.remove('active');
}

function updateDerivedPreview() {
    const fs = parseFloat(document.getElementById('edit-fs').value);
    const qts = parseFloat(document.getElementById('edit-qts').value);
    const qes = parseFloat(document.getElementById('edit-qes').value);
    const qms = parseFloat(document.getElementById('edit-qms').value);
    const vas = parseFloat(document.getElementById('edit-vas').value);
    const sd = parseFloat(document.getElementById('edit-sd').value);
    const xmax = parseFloat(document.getElementById('edit-xmax').value);

    const preview = document.getElementById('derived-preview');
    const derived = [];

    // Calculate Qts from Qes/Qms if not provided
    let calculatedQts = qts;
    if (!qts && qes && qms) {
        calculatedQts = (qes * qms) / (qes + qms);
        derived.push(`<p><strong>Qts (calculated):</strong> ${calculatedQts.toFixed(3)}</p>`);
    }

    // VD
    if (sd && xmax) {
        const vd = Math.round(sd * xmax);
        derived.push(`<p><strong>VD:</strong> ${vd} cm³</p>`);
    }

    // EBP
    if (fs && qes) {
        const ebp = (fs / qes).toFixed(1);
        derived.push(`<p><strong>EBP:</strong> ${ebp}</p>`);

        let hint = '';
        if (ebp < 50) hint = 'sealed';
        else if (ebp < 100) hint = 'versatile';
        else hint = 'ported';
        derived.push(`<p><strong>Enclosure Hint:</strong> ${hint}</p>`);
    }

    // Sensitivity estimate
    if (fs && vas) {
        const fs3 = Math.pow(fs, 3);
        const product = fs3 * vas;
        const sens = Math.round(112 + 10 * Math.log10(product));
        derived.push(`<p><strong>Est. Sensitivity:</strong> ${sens} dB @ 1W/1m</p>`);
    }

    if (derived.length > 0) {
        preview.innerHTML = derived.join('');
    } else {
        preview.innerHTML = '<em>Enter parameters to see calculated values</em>';
    }
}

function saveCustomDriver() {
    const driver = {
        id: `custom-${Date.now()}`,
        manufacturer: document.getElementById('edit-manufacturer').value || 'Custom',
        model: document.getElementById('edit-model').value || 'Unknown',
        size: parseInt(document.getElementById('edit-size').value) || 0,
        type: 'subwoofer',
        ts: {},
        notes: document.getElementById('edit-notes').value || 'Custom driver',
        tags: ['custom']
    };

    // Add T-S parameters (only if provided)
    const tsFields = ['fs', 'qts', 'qes', 'qms', 'vas', 're', 'le', 'xmax', 'sd', 'pe'];
    tsFields.forEach(field => {
        const value = parseFloat(document.getElementById(`edit-${field}`).value);
        if (!isNaN(value) && value > 0) {
            driver.ts[field] = value;
        }
    });

    // Calculate derived parameters
    driver.derived = {};

    // VD
    if (driver.ts.sd && driver.ts.xmax) {
        driver.derived.vd = Math.round(driver.ts.sd * driver.ts.xmax);
    }

    // EBP and enclosure hint
    if (driver.ts.fs && driver.ts.qes) {
        driver.derived.ebp = parseFloat((driver.ts.fs / driver.ts.qes).toFixed(1));
        if (driver.derived.ebp < 50) {
            driver.derived.enclosureHint = 'sealed';
        } else if (driver.derived.ebp < 100) {
            driver.derived.enclosureHint = 'versatile';
        } else {
            driver.derived.enclosureHint = 'ported';
        }
    }

    // Sensitivity
    if (driver.ts.fs && driver.ts.vas) {
        const fs3 = Math.pow(driver.ts.fs, 3);
        const product = fs3 * driver.ts.vas;
        driver.derived.sensitivityEst = Math.round(112 + 10 * Math.log10(product));
    }

    // Calculate Qts if missing
    if (!driver.ts.qts && driver.ts.qes && driver.ts.qms) {
        driver.ts.qts = parseFloat(((driver.ts.qes * driver.ts.qms) / (driver.ts.qes + driver.ts.qms)).toFixed(3));
    }

    // Add to library
    driverLibrary.push(driver);

    // Save custom drivers to LocalStorage
    const customDrivers = getCustomDrivers();
    customDrivers.push(driver);
    Utils.storage.set('customDrivers', customDrivers);

    // Refresh dropdown
    populateDriverDropdown(driverLibrary);

    // Select the new driver
    document.getElementById('driver-select').value = driver.id;
    handleDriverSelect({ target: { value: driver.id } });

    closeDriverEditor();
    alert(`Driver "${driver.manufacturer} ${driver.model}" saved successfully!`);
}

function getCustomDrivers() {
    return Utils.storage.get('customDrivers') || [];
}

// Load custom drivers from LocalStorage on startup
async function loadCustomDrivers() {
    const customDrivers = getCustomDrivers();
    driverLibrary.push(...customDrivers);
}
