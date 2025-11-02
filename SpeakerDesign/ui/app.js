// app.js - Main application logic (Cookbook-powered)
import * as Cookbook from '../lib/cookbook/index.js';
import * as Engineering from '../lib/engineering/index.js';
import { GraphManager } from './graphs.js';

// Debug mode
const DEBUG = localStorage.getItem('debug') === 'true' || false;
window.debug = DEBUG ? (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`) : () => {};

const App = {
    drivers: [],
    currentDesign: null,  // Now holds cookbook design object

    async init() {
        window.debug('App initializing...');

        // Load drivers database
        await this.loadDrivers();

        // Initialize graph manager
        GraphManager.init();

        // Setup event listeners
        this.setupEventListeners();

        // Load default design
        this.loadDefaultDesign();

        window.debug('App initialized');
    },

    async loadDrivers() {
        try {
            const response = await fetch('../data/drivers.json');
            const data = await response.json();
            this.drivers = data.drivers;

            // Populate driver select
            const select = document.getElementById('driverSelect');
            select.innerHTML = this.drivers.map(d =>
                `<option value="${d.id}">${d.manufacturer} ${d.model}</option>`
            ).join('');

            window.debug(`Loaded ${this.drivers.length} drivers`);
        } catch (error) {
            console.error('Failed to load drivers:', error);
            alert('Failed to load driver database');
        }
    },

    setupEventListeners() {
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

        // Calculate button
        document.getElementById('calculate').addEventListener('click', () => this.calculate());

        // Alignments button
        document.getElementById('findAlignments').addEventListener('click', () => this.showAlignments());

        // Share button
        document.getElementById('shareDesign').addEventListener('click', () => this.shareDesign());

        // Secondary axis toggle for FR graph
        document.getElementById('secondaryAxisToggle')?.addEventListener('change', () => {
            if (this.currentDesign) {
                this.renderGraphs();
            }
        });
    },

    loadDefaultDesign() {
        // Check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const driverIdFromUrl = urlParams.get('driver');
        const boxVolumeFromUrl = urlParams.get('boxVolume');
        const ampPowerFromUrl = urlParams.get('ampPower');
        const enclosureTypeFromUrl = urlParams.get('enclosureType');

        // Set driver (default to UM18-22)
        if (driverIdFromUrl) {
            document.getElementById('driverSelect').value = driverIdFromUrl;
        } else {
            const um18 = this.drivers.find(d => d.id === 'dayton-um18-22');
            if (um18) document.getElementById('driverSelect').value = um18.id;
        }

        // Set box volume
        document.getElementById('boxVolume').value = boxVolumeFromUrl || 200;

        // Set amp power
        document.getElementById('ampPower').value = ampPowerFromUrl || 500;

        // Set enclosure type
        if (enclosureTypeFromUrl) {
            document.getElementById('enclosureType').value = enclosureTypeFromUrl;
            document.getElementById('enclosureType').dispatchEvent(new Event('change'));
        }

        // Auto-calculate
        this.calculate();
    },

    calculate() {
        try {
            window.debug('Calculating design...');

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

            window.debug(`Driver: ${driverData.manufacturer} ${driverData.model}`);
            window.debug(`Design: ${enclosureType}, ${boxVolume}L, ${ampPower}W`);

            // Use Cookbook to design box
            if (enclosureType === 'sealed') {
                // Custom volume sealed design
                this.currentDesign = Cookbook.designSealedBox(driverData.ts, 'butterworth', {
                    unit: 'liters',
                    volume: boxVolume,
                    responsePoints: 200  // More points for smoother curves
                });
            } else {
                // Custom volume/tuning ported design
                this.currentDesign = Cookbook.designPortedBox(driverData.ts, {
                    vb: boxVolume,
                    fb: portTuning
                }, {
                    unit: 'liters',
                    portDiameter: 10,
                    responsePoints: 200  // More points for smoother curves
                });
            }

            // Attach metadata for UI
            this.currentDesign.ampPower = ampPower;
            this.currentDesign.driverName = `${driverData.manufacturer} ${driverData.model}`;
            // Store full driver T/S for excursion calculations
            this.currentDesign.driverTS = driverData.ts;

            window.debug(`Design complete: F3=${this.currentDesign.box.f3.toFixed(1)}Hz`);

            // Update UI
            this.updateParametersDisplay();
            this.renderGraphs();
            this.checkWarnings();

        } catch (error) {
            console.error('Calculate failed:', error);
            window.debug(`ERROR: ${error.message}`);
            alert('Calculation failed: ' + error.message);
        }
    },

    updateParametersDisplay() {
        const design = this.currentDesign;

        document.getElementById('qtcValue').textContent = design.box.qtc?.toFixed(3) || '-';
        document.getElementById('fcValue').textContent = design.box.fc ?
            design.box.fc.toFixed(1) + ' Hz' : '-';
        document.getElementById('f3Value').textContent = design.box.f3.toFixed(1) + ' Hz';

        if (design.alignment.type === 'sealed') {
            document.getElementById('alphaValue').textContent = design.box.alpha.toFixed(3);
        } else if (design.port) {
            document.getElementById('portLengthValue').textContent =
                design.port.length.cm.toFixed(1) + ' cm';
            if (design.port.velocity) {
                document.getElementById('portVelocityValue').textContent =
                    design.port.velocity.value.toFixed(1) + ' m/s';
            }
        }
    },

    renderGraphs() {
        const design = this.currentDesign;
        const ampPower = design.ampPower;

        window.debug('Rendering unified FR graph...');

        // Get secondary axis mode from UI
        const secondaryMode = document.getElementById('secondaryAxisToggle')?.value || 'none';

        // Build unified FR graph data
        const graphData = this.buildUnifiedFRData(design, ampPower, secondaryMode);

        GraphManager.createUnifiedFrequencyResponse('frequencyResponseChart', graphData);

        window.debug('Graphs rendered');
    },

    buildUnifiedFRData(design, ampPower, secondaryMode) {
        // Frequency range for all curves
        const frequencies = design.response.frequencies;

        // Base response curves at 1W and amp power
        const response1W = design.response.magnitudesDb;
        const spl0 = design.efficiency?.spl0 || 88;  // Reference sensitivity

        // Convert to SPL: SPL(f) = SPL0 + 10*log10(power) + response(f)
        const spl1W = frequencies.map((_, i) => spl0 + response1W[i]);
        const splAmpPower = frequencies.map((_, i) =>
            spl0 + 10 * Math.log10(ampPower) + response1W[i]
        );

        // Calculate limit lines
        const thermalLimitSPL = this.calculateThermalLimitLine(design, frequencies);
        const excursionLimitSPL = this.calculateExcursionLimitLine(design, frequencies, ampPower);

        // Build datasets
        const datasets = [
            {
                label: '1W Reference',
                data: frequencies.map((f, i) => ({ x: f, y: spl1W[i] })),
                borderColor: '#58a6ff',
                borderWidth: 1.5,
                borderDash: [3, 3],
                pointRadius: 0,
                yAxisID: 'y'
            },
            {
                label: `${ampPower}W`,
                data: frequencies.map((f, i) => ({ x: f, y: splAmpPower[i] })),
                borderColor: '#39d353',
                borderWidth: 2.5,
                pointRadius: 0,
                yAxisID: 'y'
            },
            {
                label: 'Thermal Limit (Pe)',
                data: thermalLimitSPL.map((spl, i) => ({ x: frequencies[i], y: spl })),
                borderColor: '#f0883e',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                yAxisID: 'y'
            },
            {
                label: 'Excursion Limit (Xmax)',
                data: excursionLimitSPL.map((spl, i) => ({ x: frequencies[i], y: spl })),
                borderColor: '#ff7b72',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                yAxisID: 'y'
            }
        ];

        // Add secondary axis data if requested
        let secondaryDatasets = [];
        if (secondaryMode === 'power' && design.powerLimits?.fullCurve) {
            const curve = design.powerLimits.fullCurve;
            // Just use the curve data directly - don't interpolate
            const powerData = curve.map(p => ({ x: p.frequency, y: p.maxPower }));

            secondaryDatasets.push({
                label: 'Max Power',
                data: powerData,
                borderColor: '#d29922',
                borderWidth: 2,
                pointRadius: 0,
                yAxisID: 'y2',
                fill: false,
                cubicInterpolationMode: 'monotone'  // Monotone cubic spline - smooth but no overshoot
            });
        } else if (secondaryMode === 'excursion') {
            const excursionData = this.calculateExcursionCurve(design, frequencies, ampPower);
            secondaryDatasets.push({
                label: `Excursion @ ${ampPower}W`,
                data: excursionData.map((exc, i) => ({ x: frequencies[i], y: exc })),
                borderColor: '#bc8cff',
                borderWidth: 2,
                pointRadius: 0,
                yAxisID: 'y2',
                fill: false
            });
        }

        return {
            datasets: [...datasets, ...secondaryDatasets],
            secondaryMode: secondaryMode
        };
    },

    calculateThermalLimitLine(design, frequencies) {
        // Thermal limit SPL = SPL0 + 10*log10(Pe) + response(f)
        const spl0 = design.efficiency?.spl0 || 88;
        const pe = design.powerLimits?.thermal || 500;
        const response = design.response.magnitudesDb;

        return frequencies.map((_, i) =>
            spl0 + 10 * Math.log10(pe) + response[i]
        );
    },

    calculateExcursionLimitLine(design, frequencies, ampPower) {
        // For each frequency, calculate max SPL limited by Xmax

        const spl0 = design.efficiency?.spl0 || 88;
        const response = design.response.magnitudesDb;

        // Use powerLimits.fullCurve from cookbook if available
        if (design.powerLimits?.fullCurve) {
            const curve = design.powerLimits.fullCurve;

            return frequencies.map((freq, i) => {
                // Interpolate power limit at this frequency
                const power = this.interpolatePowerLimit(curve, freq);
                return spl0 + 10 * Math.log10(power) + response[i];
            });
        }

        // Fallback: assume flat power limit (shouldn't happen with cookbook)
        return frequencies.map((_, i) => spl0 + 10 * Math.log10(ampPower) + response[i]);
    },

    interpolatePowerLimit(curve, targetFreq) {
        // Find bracketing points
        let lower = curve[0];
        let upper = curve[curve.length - 1];

        for (let i = 0; i < curve.length - 1; i++) {
            if (curve[i].frequency <= targetFreq && curve[i + 1].frequency >= targetFreq) {
                lower = curve[i];
                upper = curve[i + 1];
                break;
            }
        }

        // Linear interpolation
        if (lower.frequency === upper.frequency) {
            return lower.maxPower;
        }

        const ratio = (targetFreq - lower.frequency) / (upper.frequency - lower.frequency);
        return lower.maxPower + ratio * (upper.maxPower - lower.maxPower);
    },

    buildEngineeringParams(design, freq) {
        // Build engineering layer params from cookbook design
        const driver = design.driverTS || design.driver;
        const params = {
            boxType: design.alignment.type,
            re: driver.re || 6.4,
            bl: driver.bl || 10,
            mms: driver.mms ? driver.mms / 1000 : 0.050,  // g to kg
            cms: driver.cms || 0.001,
            rms: driver.rms || 1.0,
            alpha: design.box.alpha,
            fs: driver.fs,
            qts: driver.qts,
            xmax: driver.xmax ? driver.xmax / 1000 : 0.010,  // mm to m
            pe: driver.pe || 1000
        };

        // Add ported-specific params
        if (design.tuning) {
            params.fb = design.tuning.fb;
            params.ql = design.box.ql || Infinity;
        }

        return params;
    },

    calculateExcursionCurve(design, frequencies, power) {
        // Calculate excursion at each frequency for given power
        const params = this.buildEngineeringParams(design);

        // Calculate excursion at each frequency
        return frequencies.map(freq => {
            try {
                const displacement_m = Engineering.calculateDisplacementFromPower({
                    ...params,
                    frequency: freq,
                    power: power
                });
                return Engineering.displacementToMm(displacement_m);
            } catch (error) {
                console.warn(`Failed to calculate excursion at ${freq}Hz:`, error.message);
                return 0;
            }
        });
    },

    checkWarnings() {
        // Check if design is safe at current power
        const design = this.currentDesign;
        const ampPower = design.ampPower;

        const warnings = [];

        // Check if amp power exceeds thermal limit
        if (ampPower > (design.powerLimits?.thermal || Infinity)) {
            warnings.push(`⚠️ Amplifier power (${ampPower}W) exceeds driver thermal limit (${design.powerLimits.thermal}W)`);
        }

        // Check port velocity if ported
        if (design.port?.velocity) {
            const vel = design.port.velocity.value;
            if (vel > 20) {
                warnings.push(`⚠️ Port velocity (${vel.toFixed(1)} m/s) exceeds 20 m/s - expect port noise`);
            } else if (vel > 17) {
                warnings.push(`⚠️ Port velocity (${vel.toFixed(1)} m/s) approaching limit (20 m/s)`);
            }
        }

        // Update warnings panel
        const panel = document.getElementById('warningsPanel');
        const list = document.getElementById('warningsList');

        if (warnings.length === 0) {
            panel.style.display = 'none';
        } else {
            panel.style.display = 'block';
            list.innerHTML = warnings.map(w => `<li>${w}</li>`).join('');
        }
    },

    showAlignments() {
        // Show modal with all standard alignments for this driver
        const driverId = document.getElementById('driverSelect').value;
        const driverData = this.drivers.find(d => d.id === driverId);
        if (!driverData) return;

        const enclosureType = document.getElementById('enclosureType').value;

        try {
            let alignments;
            if (enclosureType === 'sealed') {
                alignments = Cookbook.compareSealedAlignments(driverData.ts,
                    ['butterworth', 'bessel', 'chebyshev']
                );
            } else {
                alignments = Cookbook.comparePortedAlignments(driverData.ts, ['QB3']);
            }

            // Build modal content
            const modal = document.getElementById('alignmentModal');
            const list = document.getElementById('alignmentsList');

            list.innerHTML = alignments.map(design => `
                <div class="alignment-card" style="border: 1px solid #30363d; padding: 12px; margin: 8px 0; border-radius: 6px; cursor: pointer;"
                     onclick="App.selectAlignment('${design.alignment.name}', ${design.box.volume.liters}, ${design.tuning?.fb || 0})">
                    <h4 style="margin: 0 0 8px 0;">${design.alignment.name}</h4>
                    <p style="margin: 4px 0; font-size: 13px; color: #8b949e;">
                        Volume: ${design.box.volume.liters.toFixed(1)}L
                        (${design.box.volume.cubicFeet.toFixed(2)} ft³)
                    </p>
                    <p style="margin: 4px 0; font-size: 13px; color: #8b949e;">
                        F3: ${design.box.f3.toFixed(1)} Hz
                        ${design.tuning ? `• Fb: ${design.tuning.fb.toFixed(1)} Hz` : ''}
                    </p>
                </div>
            `).join('');

            modal.style.display = 'flex';

            // Close button
            document.getElementById('closeAlignments').onclick = () => {
                modal.style.display = 'none';
            };

        } catch (error) {
            console.error('Failed to calculate alignments:', error);
            alert('Failed to calculate alignments: ' + error.message);
        }
    },

    selectAlignment(alignmentName, volume, tuning) {
        document.getElementById('boxVolume').value = volume.toFixed(0);
        if (tuning) {
            document.getElementById('portTuning').value = tuning.toFixed(1);
        }
        document.getElementById('alignmentModal').style.display = 'none';
        this.calculate();
    },

    shareDesign() {
        const driverId = document.getElementById('driverSelect').value;
        const enclosureType = document.getElementById('enclosureType').value;
        const boxVolume = document.getElementById('boxVolume').value;
        const ampPower = document.getElementById('ampPower').value;

        const url = new URL(window.location.href);
        url.searchParams.set('driver', driverId);
        url.searchParams.set('enclosureType', enclosureType);
        url.searchParams.set('boxVolume', boxVolume);
        url.searchParams.set('ampPower', ampPower);

        navigator.clipboard.writeText(url.toString()).then(() => {
            alert('Share link copied to clipboard!');
        }).catch(() => {
            prompt('Share this URL:', url.toString());
        });
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

// Export for modal callbacks
window.App = App;

export { App };
