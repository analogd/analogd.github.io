// app.js - Main application logic

// Debug mode - set to true to enable console logging
const DEBUG = localStorage.getItem('debug') === 'true' || false;

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

    async init() {
        if (DEBUG) console.log('Initializing Speaker Design Calculator...');

        // Initialize graph manager
        GraphManager.init();

        // Load drivers
        await this.loadDrivers();

        // Setup event listeners
        this.setupEventListeners();

        // Load default design
        this.loadDefaultDesign();

        if (DEBUG) console.log('App initialized');
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

        // Alignments button
        document.getElementById('findAlignments').addEventListener('click', () => this.showAlignments());

        // Browse drivers button
        document.getElementById('browseDrivers').addEventListener('click', () => {
            window.location.href = 'driver-browser.html';
        });

        // Add to compare
        document.getElementById('addToCompare').addEventListener('click', () => this.addToCompare());

        // Save design
        document.getElementById('saveDesign').addEventListener('click', () => this.saveDesign());

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
        if (DEBUG) console.log('Calculating...');

        // Get inputs
        const driverId = document.getElementById('driverSelect').value;
        const enclosureType = document.getElementById('enclosureType').value;
        const boxVolume = parseFloat(document.getElementById('boxVolume').value);
        const ampPower = parseFloat(document.getElementById('ampPower').value);
        const portTuning = parseFloat(document.getElementById('portTuning').value);

        // Find driver
        const driverData = this.drivers.find(d => d.id === driverId);
        if (!driverData) {
            alert('Please select a driver');
            return;
        }

        // Create driver model
        this.currentDriver = new Driver(driverData.ts);

        // Create box model
        if (enclosureType === 'sealed') {
            this.currentBox = new SealedBox(this.currentDriver, boxVolume);
        } else {
            this.currentBox = new PortedBox(this.currentDriver, boxVolume, portTuning, { portDiameter: 10 });
        }

        // Update parameters display
        this.updateParametersDisplay();

        // Generate graphs
        this.generateGraphs(ampPower);

        // Check for warnings
        this.checkWarnings(ampPower);

        if (DEBUG) console.log('Calculation complete');
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

        // 1. Frequency Response (at 1W, 100W, and specified power)
        const powerLevels = [1, 100, ampPower].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
        const frCurves = SPLCalculator.generateMultiPowerCurves(box, powerLevels);
        GraphManager.createFrequencyResponse('frequencyResponseChart', frCurves);

        // 2. Maximum Power Curve
        const maxPowerData = MaxPowerCalculator.generateCurve(box);
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
        GraphManager.createExcursionCurve('excursionChart', excursionFreqs, excursionValues, this.currentDriver.xmax);

        // 4. SPL Ceiling
        const ceilingData = SPLCalculator.calculateSPLCeiling(box);
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

        warningsPanel.style.display = 'block';
        warningsList.innerHTML = warnings.map(w =>
            `<li>${w.message}</li>`
        ).join('');
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

    addToCompare() {
        // Save current design to localStorage for comparison
        const design = {
            driver: document.getElementById('driverSelect').value,
            enclosureType: document.getElementById('enclosureType').value,
            boxVolume: parseFloat(document.getElementById('boxVolume').value),
            ampPower: parseFloat(document.getElementById('ampPower').value),
            timestamp: Date.now()
        };

        let designs = JSON.parse(localStorage.getItem('compareDesigns') || '[]');
        designs.push(design);
        if (designs.length > 4) designs.shift(); // Keep max 4
        localStorage.setItem('compareDesigns', JSON.stringify(designs));

        alert(`Added to compare (${designs.length}/4). Open Compare view to see side-by-side.`);
    },

    saveDesign() {
        // Validate that we have a calculated design
        if (!this.currentBox || !this.currentDriver) {
            alert('Please calculate a design first');
            return;
        }

        // Get driver name for display
        const driverId = document.getElementById('driverSelect').value;
        const driverData = this.drivers.find(d => d.id === driverId);
        const driverName = driverData ? `${driverData.manufacturer} ${driverData.model}` : driverId;

        // Create saved design object
        const design = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            name: `${driverName} - ${this.currentBox.vb}L`,
            driver: driverId,
            enclosureType: this.currentBox instanceof SealedBox ? 'sealed' : 'ported',
            boxVolume: this.currentBox.vb,
            ampPower: parseFloat(document.getElementById('ampPower').value),
            // Save calculated parameters for reference
            qtc: this.currentBox.qtc ? this.currentBox.qtc.toFixed(3) : null,
            fc: this.currentBox.fc ? this.currentBox.fc.toFixed(1) : null,
            f3: this.currentBox.f3 ? this.currentBox.f3.toFixed(1) : null
        };

        // Save to localStorage
        const saved = JSON.parse(localStorage.getItem('savedDesigns') || '[]');
        saved.unshift(design); // Add to beginning
        if (saved.length > 20) saved.pop(); // Keep max 20
        localStorage.setItem('savedDesigns', JSON.stringify(saved));

        alert(`Design saved!\n\n${design.name}\nQtc: ${design.qtc}, F3: ${design.f3} Hz\n\n(${saved.length} designs saved)`);
    },

    shareDesign() {
        // Generate shareable URL
        const params = new URLSearchParams({
            driver: document.getElementById('driverSelect').value,
            type: document.getElementById('enclosureType').value,
            volume: document.getElementById('boxVolume').value,
            power: document.getElementById('ampPower').value
        });

        const url = window.location.origin + window.location.pathname + '?' + params.toString();

        // Copy to clipboard
        navigator.clipboard.writeText(url).then(() => {
            alert('Shareable link copied to clipboard!');
        });
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

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
