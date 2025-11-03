// app.js - Main application logic (Cookbook-powered)
import * as Cookbook from '../lib/cookbook/index.js';
import { calculateSealedTransferFunction } from '../lib/cookbook/sealed-box-designer.js';
import * as Engineering from '../lib/engineering/index.js';
import { GraphManager } from './graphs.js';
import { optimizeForDSP, optimizeForRoomGain, optimizeForMaxOutput, optimizeForCompact } from '../lib/cookbook/optimization.js';

// Debug mode
const DEBUG = localStorage.getItem('debug') === 'true' || false;
window.debug = DEBUG ? (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`) : () => {};

const App = {
    drivers: [],
    currentDesign: null,  // Now holds cookbook design object
    savedDesigns: [],  // Array of saved design contenders

    async init() {
        window.debug('App initializing...');

        // Load drivers database
        await this.loadDrivers();

        // Load saved designs from localStorage
        this.loadSavedDesigns();

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
        // Driver selection change - auto-recalculate with optimal alignment
        document.getElementById('driverSelect').addEventListener('change', () => {
            this.calculateOptimalForDriver();
        });

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

        // Calculate button (manual recalc with current settings)
        document.getElementById('calculate').addEventListener('click', () => this.calculate());

        // Alignments button
        document.getElementById('findAlignments').addEventListener('click', () => this.showAlignments());

        // Quick Start preset buttons
        document.getElementById('presetDSP').addEventListener('click', () => this.applyPreset('dsp'));
        document.getElementById('presetRoomGain').addEventListener('click', () => this.applyPreset('roomGain'));
        document.getElementById('presetMaxOutput').addEventListener('click', () => this.applyPreset('maxOutput'));
        document.getElementById('presetCompact').addEventListener('click', () => this.applyPreset('compact'));

        // Pin design button (matches HTML id)
        document.getElementById('pinCurrentDesign')?.addEventListener('click', () => this.saveCurrentDesign());

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

    // Apply a smart preset optimization
    applyPreset(presetType) {
        const driverId = document.getElementById('driverSelect').value;
        const driverData = this.drivers.find(d => d.id === driverId);
        if (!driverData) {
            alert('Please select a driver first');
            return;
        }

        window.debug(`Applying preset: ${presetType} for ${driverData.manufacturer} ${driverData.model}`);

        const ampPower = parseFloat(document.getElementById('ampPower').value);
        const sensitivity = driverData.derived?.sensitivityEst || 89; // Use driver's sensitivity or default
        let design;

        try {
            switch (presetType) {
                case 'dsp':
                    design = optimizeForDSP(driverData.ts, {
                        targetFreq: 25,
                        eqBoostDb: 8,
                        ampPower,
                        maxVolume: 500,
                        sensitivity,
                        unit: 'liters'
                    });
                    break;

                case 'roomGain':
                    design = optimizeForRoomGain(driverData.ts, {
                        maxVolume: 500,
                        unit: 'liters'
                    });
                    break;

                case 'maxOutput':
                    design = optimizeForMaxOutput(driverData.ts, {
                        targetFreq: 30,
                        ampPower,
                        maxVolume: 500,
                        sensitivity,
                        unit: 'liters',
                        enclosureType: 'sealed'
                    });
                    break;

                case 'compact':
                    design = optimizeForCompact(driverData.ts, {
                        maxF3Penalty: 1.1,
                        unit: 'liters'
                    });
                    break;

                default:
                    alert('Unknown preset type');
                    return;
            }

            // Update UI with optimized volume
            const optimalVolume = Math.round(design.box.volume.liters);
            document.getElementById('boxVolumeSlider').value = optimalVolume;
            document.getElementById('boxVolumeDisplay').textContent = optimalVolume;

            // Store design and render
            this.currentDesign = design;
            this.currentDesign.ampPower = ampPower;
            this.currentDesign.driverName = `${driverData.manufacturer} ${driverData.model}`;
            this.currentDesign.driverTS = driverData.ts;

            this.updateParametersDisplay();
            this.renderGraphs();

            // Show optimization info
            if (design.optimization) {
                const opt = design.optimization;
                let message = `Optimized for ${opt.type}:\n`;
                if (opt.achievableSPL) message += `SPL: ${opt.achievableSPL.toFixed(1)} dB\n`;
                if (opt.volumeSavings) message += `Space savings: ${opt.volumeSavings}\n`;
                if (opt.description) message += opt.description;
                window.debug(message);
            }

            window.debug(`Preset ${presetType}: ${optimalVolume}L, Qtc=${design.box.qtc?.toFixed(3)}, F3=${design.box.f3.toFixed(1)}Hz`);

        } catch (error) {
            console.error('Preset calculation failed:', error);
            alert('Preset calculation failed: ' + error.message);
        }
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
        const showAll = document.getElementById('showAllAlignments')?.checked || false;

        try {
            let alignments;
            if (enclosureType === 'sealed') {
                alignments = Cookbook.compareSealedAlignments(driverData.ts,
                    ['butterworth', 'bessel', 'chebyshev'],
                    { unit: 'liters', responsePoints: 200 }
                );
            } else {
                alignments = Cookbook.comparePortedAlignments(driverData.ts, ['QB3']);
            }

            // Filter unreasonable volumes unless "show all" is checked
            const maxReasonableVolume = 500; // liters
            const totalCount = alignments.length;
            if (!showAll) {
                alignments = alignments.filter(design =>
                    design.box.volume.liters <= maxReasonableVolume
                );
            }
            const filteredCount = totalCount - alignments.length;

            if (alignments.length === 0) {
                alert('All standard alignments require very large enclosures (>500L). Enable "Include large enclosures" to see them.');
                return;
            }

            // Build modal content with rich metrics
            const modal = document.getElementById('alignmentModal');
            const list = document.getElementById('alignmentsList');

            // Add info message if some alignments are hidden
            let filterMessage = '';
            if (filteredCount > 0 && !showAll) {
                filterMessage = `<div style="padding: 12px; margin-bottom: 12px; background: var(--bg-tertiary); border-radius: 6px; font-size: 13px; color: var(--text-secondary);">
                    ℹ️ Hiding ${filteredCount} alignment${filteredCount > 1 ? 's' : ''} with very large enclosure${filteredCount > 1 ? 's' : ''} (>500L). Check "Include large enclosures" to see all options.
                </div>`;
            }

            list.innerHTML = filterMessage + alignments.map(design => {
                // Extract metrics
                const powerAt30Hz = this.getMaxPowerAtFreq(design, 30);
                const maxSPLat1m = this.getMaxSPLAtFreq(design, 30, 500); // 500W reference
                const tagline = this.getAlignmentTagline(design.alignment.name);
                const alignmentName = design.alignment.name;
                const volume = design.box.volume.liters;
                const tuning = design.tuning?.fb || 0;

                return `
                    <div class="alignment-card"
                         style="border: 1px solid #30363d; padding: 16px; margin: 12px 0; border-radius: 6px; cursor: pointer; transition: border-color 0.2s;"
                         onmouseover="this.style.borderColor='#58a6ff'"
                         onmouseout="this.style.borderColor='#30363d'"
                         data-alignment="${alignmentName}"
                         data-volume="${volume}"
                         data-tuning="${tuning}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div>
                                <h4 style="margin: 0; color: #58a6ff; font-size: 18px;">${alignmentName}</h4>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #8b949e; font-style: italic;">
                                    ${tagline}
                                </p>
                            </div>
                            <span style="font-size: 12px; color: #8b949e; white-space: nowrap; margin-left: 12px;">Qtc: ${design.box.qtc.toFixed(3)}</span>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 12px 0;">
                            <div>
                                <div style="font-size: 11px; color: #6e7681;">Volume</div>
                                <div style="font-size: 14px; font-weight: 500;">${volume.toFixed(0)}L</div>
                            </div>
                            <div>
                                <div style="font-size: 11px; color: #6e7681;">F3 (-3dB)</div>
                                <div style="font-size: 14px; font-weight: 500;">${design.box.f3.toFixed(1)}Hz</div>
                            </div>
                            <div>
                                <div style="font-size: 11px; color: #6e7681;">Max Power @30Hz</div>
                                <div style="font-size: 14px; font-weight: 500;">${powerAt30Hz ? powerAt30Hz.toFixed(0) + 'W' : 'N/A'}</div>
                            </div>
                            <div>
                                <div style="font-size: 11px; color: #6e7681;">Max SPL @1m (500W)</div>
                                <div style="font-size: 14px; font-weight: 500;">${maxSPLat1m ? maxSPLat1m.toFixed(1) + 'dB' : 'N/A'}</div>
                            </div>
                        </div>

                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #21262d; text-align: center; color: #58a6ff; font-size: 13px;">
                            Click to select →
                        </div>
                    </div>
                `;
            }).join('');

            // Attach click handlers after rendering
            modal.querySelectorAll('.alignment-card').forEach(card => {
                card.addEventListener('click', () => {
                    const alignmentName = card.dataset.alignment;
                    const volume = parseFloat(card.dataset.volume);
                    const tuning = parseFloat(card.dataset.tuning);
                    this.selectAlignment(alignmentName, volume, tuning);
                });
            });

            modal.style.display = 'flex';

            // Close button
            document.getElementById('closeAlignments').onclick = () => {
                modal.style.display = 'none';
            };

            // Checkbox toggle - re-render alignments when changed
            document.getElementById('showAllAlignments').onchange = () => {
                this.showAlignments();
            };

        } catch (error) {
            console.error('Failed to calculate alignments:', error);
            alert('Failed to calculate alignments: ' + error.message);
        }
    },

    getAlignmentTagline(name) {
        const taglines = {
            'Butterworth': 'Maximally flat frequency response',
            'Bessel': 'Maximally flat transient response',
            'Chebyshev': 'Smallest box with 0.5dB ripple'
        };
        return taglines[name] || '';
    },

    getMaxPowerAtFreq(design, targetFreq) {
        if (!design.powerLimits?.fullCurve) return null;

        // Find closest frequency in power curve
        const curve = design.powerLimits.fullCurve;
        let closest = curve[0];
        let minDiff = Math.abs(curve[0].frequency - targetFreq);

        for (const point of curve) {
            const diff = Math.abs(point.frequency - targetFreq);
            if (diff < minDiff) {
                minDiff = diff;
                closest = point;
            }
        }

        return closest.maxPower;
    },

    getMaxSPLAtFreq(design, targetFreq, power) {
        if (!design.efficiency?.spl0 || !design.response?.frequencies) return null;

        // Find response at target frequency
        const freqs = design.response.frequencies;
        const responseDb = design.response.magnitudesDb;

        let closestIdx = 0;
        let minDiff = Math.abs(freqs[0] - targetFreq);

        for (let i = 0; i < freqs.length; i++) {
            const diff = Math.abs(freqs[i] - targetFreq);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }

        // SPL = SPL0 + 10*log10(power) + response(f)
        const spl0 = design.efficiency.spl0;
        const powerDb = 10 * Math.log10(power);
        const responseAtFreq = responseDb[closestIdx];

        return spl0 + powerDb + responseAtFreq;
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
    },

    loadSavedDesigns() {
        try {
            const saved = localStorage.getItem('boxsmith_designs');
            this.savedDesigns = saved ? JSON.parse(saved) : [];
            this.renderSavedDesignsList();
        } catch (error) {
            console.error('Failed to load saved designs:', error);
            this.savedDesigns = [];
        }
    },

    saveCurrentDesign() {
        if (!this.currentDesign) {
            alert('No design to save. Calculate a design first.');
            return;
        }

        const designName = prompt('Name this design:',
            `${this.currentDesign.driverName} - ${this.currentDesign.alignment?.name || 'Custom'} - ${this.currentDesign.box.volume.liters.toFixed(0)}L`);

        if (!designName) return;

        const savedDesign = {
            id: Date.now(),
            name: designName,
            timestamp: new Date().toISOString(),
            driverId: document.getElementById('driverSelect').value,
            enclosureType: document.getElementById('enclosureType').value,
            boxVolume: this.currentDesign.box.volume.liters,
            ampPower: this.currentDesign.ampPower,
            portTuning: document.getElementById('portTuning').value,
            design: this.currentDesign
        };

        this.savedDesigns.push(savedDesign);

        try {
            localStorage.setItem('boxsmith_designs', JSON.stringify(this.savedDesigns));
            window.debug(`Saved design: ${designName}`);
            this.renderSavedDesignsList();
        } catch (error) {
            console.error('Failed to save design:', error);
            alert('Failed to save design: ' + error.message);
        }
    },

    loadSavedDesign(designId) {
        const saved = this.savedDesigns.find(d => d.id === designId);
        if (!saved) return;

        document.getElementById('driverSelect').value = saved.driverId;
        document.getElementById('enclosureType').value = saved.enclosureType;
        document.getElementById('enclosureType').dispatchEvent(new Event('change'));
        document.getElementById('boxVolumeSlider').value = saved.boxVolume;
        document.getElementById('boxVolumeDisplay').textContent = saved.boxVolume.toFixed(0);
        document.getElementById('ampPower').value = saved.ampPower;

        if (saved.portTuning) {
            document.getElementById('portTuning').value = saved.portTuning;
        }

        this.calculate();
        window.debug(`Loaded design: ${saved.name}`);
    },

    deleteSavedDesign(designId) {
        if (!confirm('Delete this design?')) return;

        this.savedDesigns = this.savedDesigns.filter(d => d.id !== designId);

        try {
            localStorage.setItem('boxsmith_designs', JSON.stringify(this.savedDesigns));
            this.renderSavedDesignsList();
            window.debug(`Deleted design ID: ${designId}`);
        } catch (error) {
            console.error('Failed to delete design:', error);
        }
    },

    renderSavedDesignsList() {
        const container = document.getElementById('designsList');

        if (this.savedDesigns.length === 0) {
            container.innerHTML = '<p class="empty-state">No designs yet. Click "Pin Current Design" to add your first design.</p>';
            document.getElementById('comparisonTable').style.display = 'none';
            return;
        }

        const colors = ['#58a6ff', '#39d353', '#f0883e', '#bc8cff'];

        container.innerHTML = this.savedDesigns.map((saved, idx) => {
            const design = saved.design;
            const enclosureIcon = saved.enclosureType === 'sealed' ? '📦' : '🔊';
            const color = colors[idx % colors.length];

            return `
                <div class="design-item">
                    <input type="checkbox" class="design-checkbox" data-design-id="${saved.id}" onchange="App.updateComparison()">
                    <div class="design-color-dot" style="background-color: ${color};"></div>
                    <span style="font-size: 20px;">${enclosureIcon}</span>
                    <div class="design-info">
                        <div class="design-name">${saved.name}</div>
                        <div class="design-params">
                            ${saved.boxVolume.toFixed(0)}L •
                            F3: ${design.box.f3.toFixed(1)}Hz •
                            Qtc: ${design.box.qtc?.toFixed(3) || 'N/A'} •
                            ${saved.ampPower}W
                        </div>
                    </div>
                    <div class="design-actions">
                        <button class="btn-secondary btn-small" onclick="App.loadSavedDesign(${saved.id})">Load</button>
                        <button class="btn-secondary btn-small" onclick="App.deleteSavedDesign(${saved.id})">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    updateComparison() {
        const checkboxes = document.querySelectorAll('.design-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.designId));

        if (selectedIds.length < 2) {
            document.getElementById('comparisonTable').style.display = 'none';
            document.getElementById('comparisonGraph').style.display = 'none';
            return;
        }

        if (selectedIds.length > 4) {
            alert('Maximum 4 designs can be compared at once');
            checkboxes[checkboxes.length - 1].checked = false;
            return;
        }

        const selectedDesigns = this.savedDesigns.filter(d => selectedIds.includes(d.id));
        this.renderComparisonTable(selectedDesigns);
        this.renderComparisonGraph(selectedDesigns);
    },

    renderComparisonGraph(designs) {
        document.getElementById('comparisonGraph').style.display = 'block';
        GraphManager.createComparisonTransferFunction('comparisonChart', designs);
        window.debug?.(`Rendered comparison graph with ${designs.length} designs`);
    },

    renderComparisonTable(designs) {
        const tbody = document.getElementById('comparisonTableBody');
        const colors = ['#58a6ff', '#39d353', '#f0883e', '#bc8cff'];

        tbody.innerHTML = designs.map((saved, idx) => {
            const design = saved.design;
            const color = colors[idx % colors.length];

            // Get max SPL @20Hz
            const maxSPL20Hz = this.getMaxSPLAtFreq(design, 20, saved.ampPower);

            // Get excursion @20Hz
            const excursion20Hz = this.getExcursionAtFreq(design, 20, saved.ampPower);

            // Status indicator
            let status = '✓';
            let statusClass = 'status-good';

            if (excursion20Hz && excursion20Hz > design.driverTS.xmax) {
                status = '⚠';
                statusClass = 'status-warning';
            }

            if (design.port?.velocity?.value > 20) {
                status = '⚠';
                statusClass = 'status-warning';
            }

            return `
                <tr>
                    <td>
                        <div class="table-design-name">
                            <div class="design-color-dot" style="background-color: ${color};"></div>
                            ${saved.name}
                        </div>
                    </td>
                    <td>${design.box.f3.toFixed(1)} Hz</td>
                    <td>${maxSPL20Hz ? maxSPL20Hz.toFixed(1) + ' dB' : 'N/A'}</td>
                    <td>${excursion20Hz ? excursion20Hz.toFixed(1) + ' mm' : 'N/A'}</td>
                    <td>${design.port?.velocity?.value ? design.port.velocity.value.toFixed(1) + ' m/s' : 'N/A'}</td>
                    <td><span class="status-indicator ${statusClass}">${status}</span></td>
                    <td>
                        <button class="btn-secondary btn-small" onclick="App.loadSavedDesign(${saved.id})">Load</button>
                    </td>
                </tr>
            `;
        }).join('');

        document.getElementById('comparisonTable').style.display = 'block';
    },

    getExcursionAtFreq(design, targetFreq, power) {
        if (!design.driverTS) return null;

        // Use engineering layer formulas (should be in foundation layer ideally)
        // X = sqrt(2 * P * Re) / (2π * f * Bl * Sd)
        const ts = design.driverTS;
        const f = targetFreq;

        // Calculate voltage from power
        const voltage = Math.sqrt(power * ts.re);

        // Calculate excursion (simplified - doesn't account for box loading)
        const excursion = voltage / (2 * Math.PI * f * ts.bl * ts.sd);

        return excursion * 1000; // m to mm
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
