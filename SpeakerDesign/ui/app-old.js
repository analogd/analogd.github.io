// app.js - Main application logic
import { Driver } from '../lib/models/Driver.js';
import { SealedBox } from '../lib/models/SealedBox.js';
import { PortedBox } from '../lib/models/PortedBox.js';
import { Project } from '../lib/models/Project.js';
import { AlignmentCalculator } from '../lib/calculators/AlignmentCalculator.js';
import { SPLCalculator } from '../lib/calculators/SPLCalculator.js';
import { MaxPowerCalculator } from '../lib/calculators/MaxPowerCalculator.js';
import { GraphManager } from './graphs.js';

// Debug mode - set to true to enable console logging
const DEBUG = localStorage.getItem('debug') === 'true' || false;

// Add debug panel if enabled
if (DEBUG) {
    window.addEventListener('DOMContentLoaded', () => {
        const debugPanel = document.createElement('div');
        debugPanel.id = 'debugPanel';
        debugPanel.style.cssText = 'position:fixed;bottom:0;right:0;width:400px;height:300px;background:#000;color:#0f0;font-family:monospace;font-size:11px;padding:10px;overflow-y:auto;z-index:9999;border:2px solid #0f0;';
        debugPanel.innerHTML = '<div style="color:#ff0;font-weight:bold;">DEBUG MODE <button id="copyDebugInfo" style="float:right;background:#0f0;color:#000;border:none;padding:2px 8px;cursor:pointer;font-weight:bold;">Copy Debug Info</button></div>';
        document.body.appendChild(debugPanel);

        window.debug = (msg) => {
            const line = document.createElement('div');
            line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            debugPanel.appendChild(line);
            debugPanel.scrollTop = debugPanel.scrollHeight;
        };

        window.debug('Debug mode enabled. localStorage.setItem("debug", "false") to disable.');

        // Copy debug info button
        document.getElementById('copyDebugInfo').addEventListener('click', () => {
            const debugInfo = {
                timestamp: new Date().toISOString(),
                debugLog: debugPanel.innerText,
                appState: {
                    hasCurrentBox: !!App.currentBox,
                    hasCurrentDriver: !!App.currentDriver,
                    currentBoxType: App.currentBox?.constructor.name,
                    projectDesignsCount: App.project?.designs?.length || 0,
                    visibleDesignsCount: App.project?.getVisibleDesigns()?.length || 0,
                    driversLoaded: App.drivers?.length || 0
                },
                currentDesign: App.currentBox ? {
                    type: App.currentBox.constructor.name,
                    qtc: App.currentBox.qtc,
                    fc: App.currentBox.fc,
                    f3: App.currentBox.f3
                } : null,
                localStorage: {
                    hasProject: !!localStorage.getItem('currentProject'),
                    debug: localStorage.getItem('debug')
                },
                consoleErrors: 'Check browser console for errors'
            };

            const text = JSON.stringify(debugInfo, null, 2);
            navigator.clipboard.writeText(text).then(() => {
                window.debug('✓ Debug info copied to clipboard!');
            }).catch(err => {
                window.debug('✗ Failed to copy: ' + err);
                console.log('DEBUG INFO:', text);
            });
        });

        // Catch global errors
        window.onerror = (msg, url, line, col, error) => {
            window.debug(`ERROR: ${msg} at ${url}:${line}:${col}`);
            console.error('Global error:', error);
            return false;
        };

        // Catch unhandled promise rejections
        window.onunhandledrejection = (event) => {
            window.debug(`UNHANDLED REJECTION: ${event.reason}`);
            console.error('Unhandled rejection:', event.reason);
        };
    });
} else {
    window.debug = () => {}; // No-op if debug disabled
}

// User preferences
const Preferences = {
    get maxPowerCheckFreq() {
        return parseFloat(localStorage.getItem('maxPowerCheckFreq') || '20');
    },
    set maxPowerCheckFreq(value) {
        localStorage.setItem('maxPowerCheckFreq', value);
    }
};

const App = {
    drivers: [],
    currentDriver: null,
    currentBox: null,
    project: null,  // NEW: Project containing multiple designs

    async init() {
        if (DEBUG) console.log('Initializing Speaker Design Calculator...');
        window.debug?.('App.init() starting');

        // Initialize graph manager
        GraphManager.init();
        window.debug?.('GraphManager initialized');

        // Initialize project (load from localStorage or create default)
        this.initializeProject();
        window.debug?.(`Project initialized: ${this.project.designs.length} designs`);

        // Load drivers
        await this.loadDrivers();
        window.debug?.(`Loaded ${this.drivers.length} drivers`);

        // Setup event listeners
        this.setupEventListeners();

        // Load default design
        this.loadDefaultDesign();
        window.debug?.('Default design loaded, calculate() called');

        if (DEBUG) console.log('App initialized');
    },

    initializeProject() {
        // Try to load from localStorage
        const saved = localStorage.getItem('currentProject');
        if (saved) {
            try {
                this.project = Project.fromJSON(JSON.parse(saved));
                if (DEBUG) console.log('Loaded project from localStorage', this.project);
            } catch (e) {
                console.error('Failed to load project from localStorage:', e);
                this.project = Project.createDefault();
            }
        } else {
            // Create default project for development
            this.project = Project.createDefault();
            if (DEBUG) console.log('Created default project', this.project);
        }

        // Render initial UI
        this.renderDesignsList();
        this.renderComparisonTable();
    },

    async loadDrivers() {
        try {
            const response = await fetch('../data/drivers.json');
            const data = await response.json();
            this.drivers = data.drivers;

            // Populate driver selector
            const select = document.getElementById('driverSelect');
            select.innerHTML = this.drivers.map(driver =>
                `<option value="${driver.id}">${driver.manufacturer} ${driver.model}</option>`
            ).join('');

            if (DEBUG) console.log(`Loaded ${this.drivers.length} drivers`);
        } catch (error) {
            console.error('Failed to load drivers:', error);
            document.getElementById('driverSelect').innerHTML =
                '<option value="">Error loading drivers</option>';
        }
    },

    setupEventListeners() {
        // Calculate button
        document.getElementById('calculate').addEventListener('click', () => this.calculate());

        // Pin current design
        document.getElementById('pinCurrentDesign').addEventListener('click', () => this.pinCurrentDesign());

        // Enclosure type change
        document.getElementById('enclosureType').addEventListener('change', (e) => {
            const isPorted = e.target.value === 'ported';
            document.querySelectorAll('.ported-only').forEach(el => {
                el.style.display = isPorted ? 'block' : 'none';
            });
            document.querySelectorAll('.sealed-only').forEach(el => {
                el.style.display = isPorted ? 'none' : 'block';
            });
        });

        // Secondary axis toggle
        document.getElementById('secondaryAxisToggle')?.addEventListener('change', () => {
            if (this.currentBox) {
                const ampPower = parseFloat(document.getElementById('ampPower').value);
                this.generateGraphs(ampPower);
            }
        });

        // Alignments button
        document.getElementById('findAlignments').addEventListener('click', () => this.showAlignments());

        // Browse drivers button
        document.getElementById('browseDrivers').addEventListener('click', () => {
            window.location.href = 'driver-browser.html';
        });

        // Share design
        document.getElementById('shareDesign').addEventListener('click', () => this.shareDesign());
    },

    loadDefaultDesign() {
        // Check URL parameters first (for driver browser and share links)
        const urlParams = new URLSearchParams(window.location.search);
        const driverIdFromUrl = urlParams.get('driver');
        const boxVolumeFromUrl = urlParams.get('boxVolume');
        const ampPowerFromUrl = urlParams.get('ampPower');
        const enclosureTypeFromUrl = urlParams.get('enclosureType');

        // Load from URL if available
        if (driverIdFromUrl) {
            const urlDriver = this.drivers.find(d => d.id === driverIdFromUrl);
            if (urlDriver) {
                document.getElementById('driverSelect').value = urlDriver.id;
            }
        } else {
            // Fallback: Select UMII18-22 by default
            const umii18 = this.drivers.find(d => d.id === 'dayton-umii18-22');
            if (umii18) {
                document.getElementById('driverSelect').value = umii18.id;
            }
        }

        // Set box volume
        if (boxVolumeFromUrl) {
            document.getElementById('boxVolume').value = boxVolumeFromUrl;
        } else {
            document.getElementById('boxVolume').value = 330;
        }

        // Set amp power
        if (ampPowerFromUrl) {
            document.getElementById('ampPower').value = ampPowerFromUrl;
        } else {
            document.getElementById('ampPower').value = 500;
        }

        // Set enclosure type
        if (enclosureTypeFromUrl) {
            document.getElementById('enclosureType').value = enclosureTypeFromUrl;
            // Trigger change event to show/hide ported controls
            const event = new Event('change');
            document.getElementById('enclosureType').dispatchEvent(event);
        }

        // Calculate automatically
        this.calculate();
    },

    calculate() {
        try {
            if (DEBUG) console.log('Calculating...');
            window.debug?.('calculate() called');

            // Get inputs
            const driverId = document.getElementById('driverSelect').value;
            const enclosureType = document.getElementById('enclosureType').value;
            const boxVolume = parseFloat(document.getElementById('boxVolume').value);
            const ampPower = parseFloat(document.getElementById('ampPower').value);
            const portTuning = parseFloat(document.getElementById('portTuning').value);

            window.debug?.(`Inputs: driver=${driverId}, type=${enclosureType}, vol=${boxVolume}L, power=${ampPower}W`);

            // Find driver
            const driverData = this.drivers.find(d => d.id === driverId);
            if (!driverData) {
                window.debug?.('ERROR: Driver not found');
                alert('Please select a driver');
                return;
            }

            window.debug?.(`Found driver: ${driverData.manufacturer} ${driverData.model}`);

            // Create driver model
            this.currentDriver = new Driver(driverData.ts);
            window.debug?.('Driver model created');

            // Create box model
            if (enclosureType === 'sealed') {
                this.currentBox = new SealedBox(this.currentDriver, boxVolume);
                window.debug?.(`SealedBox created: Qtc=${this.currentBox.qtc.toFixed(3)}, F3=${this.currentBox.f3.toFixed(1)}Hz`);
            } else {
                this.currentBox = new PortedBox(this.currentDriver, boxVolume, portTuning, { portDiameter: 10 });
                window.debug?.(`PortedBox created: Qtc=${this.currentBox.qtc.toFixed(3)}, F3=${this.currentBox.f3.toFixed(1)}Hz`);
            }

            // Update parameters display
            this.updateParametersDisplay();
            window.debug?.('Parameters display updated');

            // Render graphs
            this.renderGraphs();
            window.debug?.('Graphs rendered');

            // Check for warnings
            this.checkWarnings(ampPower);
            window.debug?.('Warnings checked');

            if (DEBUG) console.log('Calculation complete');
            window.debug?.('calculate() complete');
        } catch (error) {
            console.error('Calculate failed:', error);
            window.debug?.(`ERROR in calculate(): ${error.message}`);
            alert('Calculation failed: ' + error.message);
        }
    },

    updateParametersDisplay() {
        const box = this.currentBox;

        document.getElementById('qtcValue').textContent = box.qtc.toFixed(3);
        document.getElementById('fcValue').textContent = box.fc.toFixed(1) + ' Hz';
        document.getElementById('f3Value').textContent = box.f3.toFixed(1) + ' Hz';

        if (box instanceof SealedBox) {
            document.getElementById('alphaValue').textContent = box.alpha.toFixed(3);
        } else if (box instanceof PortedBox) {
            document.getElementById('portLengthValue').textContent = box.portLength.toFixed(1) + ' cm';
            const portVel = box.calculatePortVelocity();
            document.getElementById('portVelocityValue').textContent = portVel.toFixed(1) + ' m/s';
        }
    },

    generateGraphs(ampPower) {
        const box = this.currentBox;

        // Get secondary axis preference from UI (default to 'none')
        const secondaryAxisMode = document.getElementById('secondaryAxisToggle')?.value || 'none';

        // 1. Frequency Response with 1W reference + user's amp power + Limit Lines + Optional Secondary Axis
        const frCurves = SPLCalculator.generateMultiPowerCurves(box, [1, ampPower]);
        window.debug?.(`FR curves: 1W reference + ${ampPower}W`);

        // Calculate limit lines for FR graph
        const limits = {
            thermal: SPLCalculator.calculateThermalLimit(box),
            thermalFlat: SPLCalculator.calculateFlatEQThermalLimit(box),
            excursion: SPLCalculator.calculateExcursionLimit(box)
        };
        window.debug?.(`Limits: thermal=${limits.thermal.spl.length}pts, thermalFlat=${limits.thermalFlat.spl.length}pts, excursion=${limits.excursion.spl.length}pts`);

        // Prepare secondary axis data if requested
        let secondaryData = null;
        if (secondaryAxisMode === 'power') {
            const maxPowerData = MaxPowerCalculator.generateCurve(box);
            secondaryData = {
                type: 'power',
                frequencies: maxPowerData.map(p => p.frequency),
                values: maxPowerData.map(p => p.maxPower)
            };
            window.debug?.(`Secondary axis: power (${secondaryData.frequencies.length} points)`);
        } else if (secondaryAxisMode === 'excursion') {
            const excursionFreqs = [];
            const excursionValues = [];
            for (let i = 0; i < 100; i++) {
                const freq = Math.pow(10, 1 + i * 0.02); // 10Hz to 200Hz
                excursionFreqs.push(freq);
                const excursion = MaxPowerCalculator.calculateExcursion(box, freq, ampPower);
                excursionValues.push(excursion);
            }
            secondaryData = {
                type: 'excursion',
                power: ampPower,
                frequencies: excursionFreqs,
                values: excursionValues
            };
            window.debug?.(`Secondary axis: excursion @ ${ampPower}W (${secondaryData.frequencies.length} points)`);
        }

        GraphManager.createFrequencyResponse('frequencyResponseChart', frCurves, limits, secondaryData);

        // 2. Maximum Power Curve
        const maxPowerData = MaxPowerCalculator.generateCurve(box);
        window.debug?.(`Max power data: ${maxPowerData.length} points, first: ${maxPowerData[0]?.frequency}Hz @ ${maxPowerData[0]?.maxPower}W (${maxPowerData[0]?.limitingFactor})`);
        GraphManager.createMaxPowerCurve('maxPowerChart', maxPowerData);

        // 3. Cone Excursion at specified power
        const excursionFreqs = [];
        const excursionValues = [];
        for (let i = 0; i < 50; i++) {
            const freq = Math.pow(10, 1 + i * 0.04); // 10Hz to 200Hz log scale
            excursionFreqs.push(freq);
            const excursion = MaxPowerCalculator.calculateExcursion(box, freq, ampPower);
            excursionValues.push(excursion);
        }
        window.debug?.(`Excursion: ${excursionValues.length} points, max=${Math.max(...excursionValues).toFixed(1)}mm`);
        GraphManager.createExcursionCurve('excursionChart', excursionFreqs, excursionValues, this.currentDriver.xmax);

        // 4. SPL Ceiling
        const ceilingData = SPLCalculator.calculateSPLCeiling(box);
        window.debug?.(`SPL ceiling: ${ceilingData.frequencies.length} points, range ${Math.min(...ceilingData.spl).toFixed(1)}-${Math.max(...ceilingData.spl).toFixed(1)} dB`);
        GraphManager.createSPLCeiling('splCeilingChart', ceilingData.frequencies, ceilingData.spl);
    },

    checkWarnings(ampPower) {
        const warnings = MaxPowerCalculator.getWarnings(this.currentBox, ampPower);

        const warningsPanel = document.getElementById('warningsPanel');
        const warningsList = document.getElementById('warningsList');

        if (warnings.length === 0) {
            warningsPanel.style.display = 'none';
            return;
        }

        // Only show critical warnings (not every frequency)
        const criticalWarnings = warnings.filter(w => w.severity === 'critical' || warnings.indexOf(w) < 2);

        if (criticalWarnings.length === 0 && warnings.length > 0) {
            // If all warnings are low-severity, show summary
            warningsPanel.style.display = 'block';
            warningsList.innerHTML = `<li>⚠️ ${warnings.length} excursion warnings at low frequencies. See Max Power graph for details.</li>`;
        } else {
            warningsPanel.style.display = 'block';
            warningsList.innerHTML = criticalWarnings.map(w =>
                `<li>${w.message}</li>`
            ).join('');
            if (warnings.length > criticalWarnings.length) {
                warningsList.innerHTML += `<li><em>...and ${warnings.length - criticalWarnings.length} more. See Max Power graph.</em></li>`;
            }
        }
    },

    renderGraphs() {
        const visibleDesigns = this.project.getVisibleDesigns();
        const ampPower = parseFloat(document.getElementById('ampPower').value);

        // Filter to only designs with calculated results
        const designsWithResults = visibleDesigns.filter(d => d.results && d.results.frequencyResponse);
        window.debug?.(`renderGraphs: ${visibleDesigns.length} visible, ${designsWithResults.length} with results`);

        if (designsWithResults.length > 0) {
            // Multi-design mode: overlay designs with calculated results
            window.debug?.(`Using multi-design mode with ${designsWithResults.length} designs`);
            GraphManager.createFrequencyResponse('frequencyResponseChart', designsWithResults);
            GraphManager.createMaxPowerCurve('maxPowerChart', designsWithResults);

            // For excursion and SPL ceiling, show only the first design with results
            const firstDesign = designsWithResults[0];
            if (firstDesign.results && firstDesign.results.excursion) {
                GraphManager.createExcursionCurve(
                    'excursionChart',
                    firstDesign.results.excursion.frequencies,
                    firstDesign.results.excursion.displacement,
                    firstDesign.driver.xmax
                );
            }
            if (firstDesign.results && firstDesign.results.splCeiling) {
                GraphManager.createSPLCeiling(
                    'splCeilingChart',
                    firstDesign.results.splCeiling.frequencies,
                    firstDesign.results.splCeiling.maxSpl
                );
            }
        } else if (this.currentBox) {
            // Single-design mode: show working design (currentBox)
            window.debug?.('Using single-design mode with currentBox');
            this.generateGraphs(ampPower);
        } else {
            window.debug?.('No designs to render');
        }
    },

    calculateDesignResults(box, ampPower) {
        try {
            if (DEBUG) console.log('Calculating design results for:', box, ampPower);

            // Generate all curves and metrics for a design
            const powerLevels = [1, 100, ampPower].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
            const frequencyResponse = SPLCalculator.generateMultiPowerCurves(box, powerLevels);
            const maxPower = MaxPowerCalculator.generateCurve(box);

            // Excursion curve
            const excursionFreqs = [];
            const excursionValues = [];
            for (let i = 0; i < 50; i++) {
                const freq = Math.pow(10, 1 + i * 0.04); // 10Hz to 200Hz log scale
                excursionFreqs.push(freq);
                const excursion = MaxPowerCalculator.calculateExcursion(box, freq, ampPower);
                excursionValues.push(excursion);
            }

            // SPL ceiling
            const splCeiling = SPLCalculator.calculateSPLCeiling(box);

            // Key metrics for comparison table
            const f3 = box.f3;
            const maxSpl20Hz = SPLCalculator.calculateSPL(box, 20, ampPower);
            const excursion20Hz = MaxPowerCalculator.calculateExcursion(box, 20, ampPower);
            const portVelocity = box instanceof PortedBox ? box.calculatePortVelocity(ampPower) : null;

            const results = {
                frequencyResponse,
                maxPower,
                excursion: {
                    frequencies: excursionFreqs,
                    displacement: excursionValues
                },
                splCeiling: {
                    frequencies: splCeiling.frequencies,
                    maxSpl: splCeiling.spl
                },
                // Metrics for comparison table
                f3,
                maxSpl20Hz,
                excursion20Hz,
                portVelocity
            };

            if (DEBUG) console.log('Design results calculated:', results);
            return results;
        } catch (error) {
            console.error('Failed to calculate design results:', error);
            throw error;
        }
    },

    pinCurrentDesign() {
        if (!this.currentBox || !this.currentDriver) {
            alert('Please calculate a design first');
            return;
        }

        // Check design limit
        if (this.project.designs.length >= 10) {
            alert('Maximum 10 designs per project. Delete a design to add more.');
            return;
        }

        try {
            // Get current parameters
            const driverId = document.getElementById('driverSelect').value;
            const enclosureType = document.getElementById('enclosureType').value;
            const boxVolume = parseFloat(document.getElementById('boxVolume').value);
            const portTuning = enclosureType === 'ported' ? parseFloat(document.getElementById('portTuning').value) : null;
            const ampPower = parseFloat(document.getElementById('ampPower').value);

            const designParams = {
                driverId,
                type: enclosureType,
                volume: boxVolume,
                tuning: portTuning,
                power: ampPower,
                portDiameter: 10,  // Phase 2: make configurable
                portCount: 1,      // Phase 2: make configurable
            };

            // Add to project
            const design = this.project.addDesign(designParams);

            // Calculate and store results
            design.results = this.calculateDesignResults(this.currentBox, ampPower);
            design.driver = this.currentDriver;  // Store driver for xmax in graphs

            // Save and re-render
            this.saveProject();
            this.renderDesignsList();
            this.renderComparisonTable();
            this.renderGraphs();

            if (DEBUG) console.log('Pinned design:', design);
        } catch (error) {
            console.error('Failed to pin design:', error);
            alert('Failed to pin design: ' + error.message);
        }
    },

    showAlignments() {
        const driver = this.currentDriver;
        if (!driver) {
            alert('Please select a driver first');
            return;
        }

        const enclosureType = document.getElementById('enclosureType').value;
        const ampPower = parseFloat(document.getElementById('ampPower').value) || 500;
        const checkFreq = Preferences.maxPowerCheckFreq;

        let alignments;
        if (enclosureType === 'sealed') {
            alignments = AlignmentCalculator.calculateSealedAlignments(driver);
        } else {
            alignments = AlignmentCalculator.calculatePortedAlignments(driver, { portDiameter: 10 });
        }

        // Calculate detailed metrics for each alignment
        const enrichedAlignments = alignments.map(a => {
            const box = a.box;

            // Calculate max safe power at check frequency
            const maxPowerData = MaxPowerCalculator.calculateAtFrequency(box, checkFreq);
            const maxPower = maxPowerData.maxPower;
            const limitingFactor = maxPowerData.limitingFactor;

            // Determine warnings
            const warnings = [];
            if (ampPower > maxPower * 1.1) {
                warnings.push(`⚠️ ${ampPower}W exceeds ${limitingFactor} limit (${Math.round(maxPower)}W) @ ${checkFreq}Hz`);
            }

            // Response characteristic
            let characteristic = '';
            if (a.qtc < 0.6) characteristic = 'Underdamped (lean)';
            else if (a.qtc < 0.68) characteristic = 'Tight/accurate';
            else if (a.qtc < 0.75) characteristic = 'Flat response';
            else if (a.qtc < 0.9) characteristic = 'Slight emphasis';
            else characteristic = 'Emphasized bass';

            // Recommendation
            let recommendation = '';
            if (a.name.includes('Butterworth')) recommendation = '✅ Recommended';
            else if (a.name.includes('Bessel')) recommendation = '✅ Most accurate';
            else if (a.name.includes('QB3')) recommendation = '✅ Deep bass';

            return {
                ...a,
                maxPower,
                limitingFactor,
                warnings,
                characteristic,
                recommendation,
                isSafe: ampPower <= maxPower
            };
        });

        const modal = document.getElementById('alignmentModal');
        const list = document.getElementById('alignmentsList');

        // Header with preferences
        const header = `
            <div style="margin-bottom: 20px; padding: 15px; background: #21262d; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0 0 5px 0;">Standard Alignments Comparison</h3>
                        <p style="margin: 0; color: #8b949e; font-size: 13px;">
                            Your amp: ${ampPower}W | Checking power limits at:
                            <input type="number" id="maxPowerFreqInput" value="${checkFreq}"
                                   min="10" max="200" step="5"
                                   style="width: 60px; background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 2px 5px; border-radius: 3px;"
                                   onchange="Preferences.maxPowerCheckFreq = this.value; App.showAlignments();"> Hz
                        </p>
                    </div>
                </div>
            </div>
        `;

        // Build comparison cards
        const cards = enrichedAlignments.map(a => {
            const warningBadge = !a.isSafe ?
                `<div style="background: #f85149; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold;">POWER LIMIT</div>` :
                `<div style="background: #238636; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold;">SAFE</div>`;

            return `
                <div class="alignment-card ${a.recommendation ? 'recommended' : ''}"
                     onclick="App.selectAlignment(${a.vb}, ${a.fb || 0})"
                     style="cursor: pointer; transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <h4 style="margin: 0; color: #58a6ff;">${a.name}</h4>
                        ${warningBadge}
                    </div>

                    ${a.recommendation ? `<div style="color: #3fb950; font-size: 12px; margin-bottom: 8px;">${a.recommendation}</div>` : ''}

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; font-size: 13px;">
                        <div>
                            <div style="color: #8b949e;">F3 (Low Extension)</div>
                            <div style="color: #c9d1d9; font-weight: bold;">${a.box.f3.toFixed(1)} Hz</div>
                        </div>
                        <div>
                            <div style="color: #8b949e;">Box Volume</div>
                            <div style="color: #c9d1d9; font-weight: bold;">${a.vb.toFixed(1)} L</div>
                        </div>
                        <div>
                            <div style="color: #8b949e;">Max Power @ ${checkFreq}Hz</div>
                            <div style="color: ${a.isSafe ? '#3fb950' : '#f85149'}; font-weight: bold;">
                                ${Math.round(a.maxPower)}W (${a.limitingFactor})
                            </div>
                        </div>
                        <div>
                            <div style="color: #8b949e;">Response</div>
                            <div style="color: #c9d1d9; font-size: 12px;">${a.characteristic}</div>
                        </div>
                    </div>

                    ${a.fb ? `
                        <div style="padding-top: 8px; border-top: 1px solid #30363d; font-size: 12px; color: #8b949e;">
                            Port: ${a.fb.toFixed(1)}Hz tuning, ${a.portLength.toFixed(0)}cm length
                        </div>
                    ` : ''}

                    ${a.warnings.length > 0 ? `
                        <div style="margin-top: 10px; padding: 8px; background: #f85149; border-radius: 3px; font-size: 12px;">
                            ${a.warnings.join('<br>')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        list.innerHTML = header + `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px;">${cards}</div>`;

        modal.style.display = 'flex';

        document.getElementById('closeAlignments').onclick = () => {
            modal.style.display = 'none';
        };
    },

    selectAlignment(vb, fb) {
        document.getElementById('boxVolume').value = vb.toFixed(0);
        if (fb > 0) {
            document.getElementById('portTuning').value = fb.toFixed(0);
        }
        document.getElementById('alignmentModal').style.display = 'none';
        this.calculate();
    },

    shareDesign() {
        if (!this.currentBox) {
            alert('Please calculate a design first');
            return;
        }

        const params = new URLSearchParams({
            driver: document.getElementById('driverSelect').value,
            enclosureType: document.getElementById('enclosureType').value,
            boxVolume: document.getElementById('boxVolume').value,
            ampPower: document.getElementById('ampPower').value
        });

        // Add ported-specific parameters
        if (document.getElementById('enclosureType').value === 'ported') {
            params.append('portTuning', document.getElementById('portTuning').value);
        }

        const url = window.location.origin + window.location.pathname + '?' + params.toString();

        navigator.clipboard.writeText(url).then(() => {
            alert('Shareable link copied to clipboard!');
        }).catch(() => {
            alert('Failed to copy link. URL: ' + url);
        });
    },

    // NEW: Render designs list
    renderDesignsList() {
        const container = document.getElementById('designsList');

        if (this.project.designs.length === 0) {
            container.innerHTML = '<p class="empty-state">No designs yet. Click "Pin Current Design" to add your first design.</p>';
            return;
        }

        container.innerHTML = this.project.designs.map(design => `
            <div class="design-item">
                <span class="design-color-dot" style="background-color: ${design.color}"></span>
                <input type="checkbox" class="design-checkbox"
                       data-design-id="${design.id}"
                       ${design.shownInGraph ? 'checked' : ''}>
                <div class="design-info">
                    <span class="design-name">${design.name}</span>
                    <span class="design-params">
                        ${design.volume}L ${design.type}
                        ${design.type === 'ported' ? `@ ${design.tuning}Hz` : ''}
                        ${design.portCount > 1 ? `(${design.portCount} ports)` : ''}
                    </span>
                </div>
                <div class="design-actions">
                    <button class="btn-secondary btn-small" data-action="fork" data-design-id="${design.id}">Fork</button>
                    <button class="btn-secondary btn-small" data-action="delete" data-design-id="${design.id}">×</button>
                </div>
            </div>
        `).join('');

        // Add event listeners
        container.querySelectorAll('.design-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const success = this.project.toggleDesignVisibility(e.target.dataset.designId);
                if (!success) {
                    // Max visible reached, revert checkbox
                    e.target.checked = false;
                    alert('Maximum 5 designs visible at once. Uncheck another design first.');
                    return;
                }
                this.saveProject();
                this.renderGraphs();
                this.renderComparisonTable();
            });
        });

        container.querySelectorAll('[data-action="fork"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.forkDesign(e.target.dataset.designId);
            });
        });

        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm('Delete this design?')) {
                    this.project.removeDesign(e.target.dataset.designId);
                    this.saveProject();
                    this.renderDesignsList();
                    this.renderComparisonTable();
                    this.renderGraphs();
                }
            });
        });
    },

    // NEW: Render comparison table
    renderComparisonTable() {
        const container = document.getElementById('comparisonTable');
        const tbody = document.getElementById('comparisonTableBody');

        const visibleDesigns = this.project.getVisibleDesigns();
        window.debug?.(`renderComparisonTable: ${visibleDesigns.length} visible designs`);

        if (visibleDesigns.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        tbody.innerHTML = visibleDesigns.map(design => {
            const results = design.results || {};
            window.debug?.(`Design "${design.name}": results=${!!results}, f3=${results.f3}, maxSpl=${results.maxSpl20Hz}`);

            return `
                <tr>
                    <td>
                        <div class="table-design-name">
                            <span class="design-color-dot" style="background-color: ${design.color}"></span>
                            ${design.name}
                        </div>
                    </td>
                    <td>${results.f3 ? results.f3.toFixed(1) + ' Hz' : '-'}</td>
                    <td>${results.maxSpl20Hz ? results.maxSpl20Hz.toFixed(1) + ' dB' : '-'}</td>
                    <td>${results.excursion20Hz ? results.excursion20Hz.toFixed(1) + ' mm' : '-'}</td>
                    <td>${results.portVelocity != null ? results.portVelocity.toFixed(1) + ' m/s' : 'n/a'}</td>
                    <td>
                        <span class="status-indicator ${this.getStatusClass(results)}">
                            ${this.getStatusIcon(results)}
                        </span>
                    </td>
                    <td>
                        <button class="btn-secondary btn-small" onclick="alert('Edit feature coming soon')">Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // Helper: Get status class for design
    getStatusClass(results) {
        if (!results) return 'status-warning';

        const hasWarning =
            (results.portVelocity && results.portVelocity > 15) ||
            (results.excursion20Hz && results.excursion20Hz > 18);  // Assuming 20mm Xmax

        const hasError =
            (results.portVelocity && results.portVelocity > 20) ||
            (results.excursion20Hz && results.excursion20Hz > 20);

        if (hasError) return 'status-error';
        if (hasWarning) return 'status-warning';
        return 'status-good';
    },

    // Helper: Get status icon
    getStatusIcon(results) {
        const statusClass = this.getStatusClass(results);
        if (statusClass === 'status-good') return '✓';
        if (statusClass === 'status-warning') return '⚠️';
        return '❌';
    },

    // NEW: Save project to localStorage
    saveProject() {
        localStorage.setItem('currentProject', JSON.stringify(this.project.toJSON()));
        if (DEBUG) console.log('Project saved to localStorage');
    },

    // NEW: Fork design
    forkDesign(designId) {
        const forked = this.project.forkDesign(designId);
        this.saveProject();
        this.renderDesignsList();
        this.renderComparisonTable();
        this.renderGraphs();
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Make App available globally for debugging and inline event handlers
window.App = App;

// Add alignment card styling
const style = document.createElement('style');
style.textContent = `
.alignment-card {
    background: #1c2128;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.2s;
}

.alignment-card:hover {
    border-color: #58a6ff;
    background: #161b22;
    transform: translateY(-2px);
}

.alignment-card.recommended {
    border-color: #3fb950;
}

.alignment-card h4 {
    color: #58a6ff;
    margin: 0;
}
`;
document.head.appendChild(style);
