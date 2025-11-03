// app.js - Main application logic (Cookbook-powered)
import * as Cookbook from '../lib/cookbook/index.js';
import { calculateSealedTransferFunction } from '../lib/cookbook/sealed-box-designer.js';
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

        // Volume slider - REAL-TIME updates
        document.getElementById('boxVolumeSlider').addEventListener('input', (e) => {
            const volume = parseInt(e.target.value);
            document.getElementById('boxVolumeDisplay').textContent = volume;

            // Update graph in real-time if we have a design
            if (this.currentDesign) {
                this.updateGraphWithVolume(volume);
            }
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
        const defaultVolume = boxVolumeFromUrl || 330;
        document.getElementById('boxVolumeSlider').value = defaultVolume;
        document.getElementById('boxVolumeDisplay').textContent = defaultVolume;

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
            const boxVolume = parseFloat(document.getElementById('boxVolumeSlider').value);
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
        if (!design) return;

        window.debug('Rendering graphs...');

        // Transfer Function (η₀ normalized) - only for sealed box
        const enclosureType = document.getElementById('enclosureType').value;
        if (enclosureType === 'sealed' && design.box && design.driverTS) {
            const vbM3 = design.box.volume.m3;
            GraphManager.createTransferFunction('transferFunctionChart', design.driverTS, vbM3);
        }

        window.debug('Graphs rendered');
    },

    // Real-time graph update when slider moves
    // UI layer: NO physics, just calls cookbook and updates display
    updateGraphWithVolume(volumeLiters) {
        const design = this.currentDesign;
        if (!design || !design.driverTS) return;

        const enclosureType = document.getElementById('enclosureType').value;
        if (enclosureType !== 'sealed') return;

        // Call cookbook layer for calculations (maintains layer separation)
        const vbM3 = volumeLiters / 1000;
        GraphManager.updateTransferFunction('transferFunctionChart', design.driverTS, vbM3);

        // Also update box parameters display
        this.updateBoxParamsForVolume(volumeLiters);
    },

    updateBoxParamsForVolume(volumeLiters) {
        const design = this.currentDesign;
        if (!design) return;

        // Use cookbook layer to calculate system parameters
        const vbM3 = volumeLiters / 1000;
        const result = calculateSealedTransferFunction(
            { fs: design.driverTS.fs, qts: design.driverTS.qts, vas: design.driverTS.vas / 1000 },
            vbM3
        );

        // Update UI with new parameters
        document.getElementById('qtcValue').textContent = result.systemParams.qtc;
        document.getElementById('fcValue').textContent = result.systemParams.fc + ' Hz';
        document.getElementById('f3Value').textContent = result.systemParams.f3 + ' Hz';
        document.getElementById('alphaValue').textContent = result.systemParams.alpha;
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
        document.getElementById('boxVolumeSlider').value = volume.toFixed(0);
        document.getElementById('boxVolumeDisplay').textContent = volume.toFixed(0);
        if (tuning) {
            document.getElementById('portTuning').value = tuning.toFixed(1);
        }
        document.getElementById('alignmentModal').style.display = 'none';
        this.calculate();
    },

    shareDesign() {
        const driverId = document.getElementById('driverSelect').value;
        const enclosureType = document.getElementById('enclosureType').value;
        const boxVolume = document.getElementById('boxVolumeSlider').value;
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
