// app.js - Main application logic

const App = {
    drivers: [],
    currentDriver: null,
    currentBox: null,

    async init() {
        console.log('Initializing Speaker Design Calculator...');

        // Initialize graph manager
        GraphManager.init();

        // Load drivers
        await this.loadDrivers();

        // Setup event listeners
        this.setupEventListeners();

        // Load default design
        this.loadDefaultDesign();

        console.log('App initialized');
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

            console.log(`Loaded ${this.drivers.length} drivers`);
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

        // Share design
        document.getElementById('shareDesign').addEventListener('click', () => this.shareDesign());
    },

    loadDefaultDesign() {
        // Select UMII18-22 by default
        const umii18 = this.drivers.find(d => d.id === 'dayton-umii18-22');
        if (umii18) {
            document.getElementById('driverSelect').value = umii18.id;
        }

        // Set default values
        document.getElementById('boxVolume').value = 330;
        document.getElementById('ampPower').value = 500;

        // Calculate automatically
        this.calculate();
    },

    calculate() {
        console.log('Calculating...');

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

        console.log('Calculation complete');
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

        let alignments;
        if (enclosureType === 'sealed') {
            alignments = AlignmentCalculator.calculateSealedAlignments(driver);
        } else {
            alignments = AlignmentCalculator.calculatePortedAlignments(driver, { portDiameter: 10 });
        }

        const modal = document.getElementById('alignmentModal');
        const list = document.getElementById('alignmentsList');

        list.innerHTML = alignments.map(a => `
            <div class="alignment-option" onclick="App.selectAlignment(${a.vb}, ${a.fb || 0})">
                <h4>${a.name}</h4>
                <p>Volume: ${a.vb.toFixed(1)}L | Qtc: ${a.qtc.toFixed(3)} | F3: ${a.box.f3.toFixed(1)}Hz</p>
                ${a.fb ? `<p>Tuning: ${a.fb.toFixed(1)}Hz | Port: ${a.portLength.toFixed(1)}cm</p>` : ''}
            </div>
        `).join('');

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

// Add alignment option styling
const style = document.createElement('style');
style.textContent = `
.alignment-option {
    background: #1c2128;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 15px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: all 0.2s;
}

.alignment-option:hover {
    border-color: #58a6ff;
    background: #161b22;
}

.alignment-option h4 {
    color: #58a6ff;
    margin-bottom: 8px;
}

.alignment-option p {
    color: #8b949e;
    font-size: 13px;
    margin: 4px 0;
}
`;
document.head.appendChild(style);
