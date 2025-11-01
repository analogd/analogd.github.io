// Ported box model - represents a vented enclosure design
class PortedBox {
    constructor(driver, vb, fb, options = {}) {
        this.driver = driver;
        this.vb = vb;  // Box volume (L)
        this.fb = fb;  // Tuning frequency (Hz)

        // Port configuration
        this.portDiameter = options.portDiameter || 10;  // cm
        this.portLength = this._calculatePortLength();

        // Calculate F3 (-3dB frequency)
        this.f3 = this._estimateF3();

        // Alignment classification
        this.alignment = this._classifyAlignment();
    }

    _calculatePortLength() {
        const portArea = Math.PI * (this.portDiameter / 2) ** 2;

        // Helmholtz resonator formula with end correction
        // L = (23562.5 × Sp) / (Vb × Fb²) - 0.732 × D
        const length = (23562.5 * portArea) / (this.vb * this.fb * this.fb)
                     - 0.732 * this.portDiameter;

        return Math.max(1, length);  // Minimum 1cm
    }

    _estimateF3() {
        // Simplified: F3 ≈ Fb for most alignments
        // More accurate would require full transfer function analysis
        return this.fb * 0.8;
    }

    _classifyAlignment() {
        const ratio = this.fb / this.driver.fs;
        const vbRatio = this.vb / this.driver.vas;

        if (Math.abs(ratio - 1.0) < 0.1) return 'QB3';
        if (Math.abs(ratio - 0.7) < 0.1) return 'SC4';
        if (Math.abs(ratio - 0.8) < 0.1) return 'C4';

        if (ratio > 1.2) return 'High tuning';
        if (ratio < 0.6) return 'Low tuning';
        return 'Custom';
    }

    // Calculate frequency response at a single frequency (simplified)
    responseAt(frequency) {
        if (frequency < this.fb) {
            // Below tuning: steep 24dB/octave rolloff
            const octaves = Math.log2(this.fb / frequency);
            return Math.pow(10, -octaves * 24 / 20);  // Convert dB to amplitude
        } else {
            // Above tuning: essentially flat in subwoofer range
            return 1.0;
        }
    }

    responseDbAt(frequency) {
        if (frequency < this.fb) {
            const rolloff = -40 * Math.log10(this.fb / frequency);
            return Math.max(rolloff, -40);  // Cap at -40dB
        }
        return 0;  // Flat above tuning
    }

    // Port velocity calculation
    calculatePortVelocity() {
        if (!this.driver.sd || !this.driver.xmax) return null;

        // V = (Sd × Xpeak × Fb) / Sp
        const sdM2 = this.driver.sd / 10000;  // cm² to m²
        const xmaxM = this.driver.xmax / 1000;  // mm to m
        const portArea = Math.PI * (this.portDiameter / 2) ** 2;
        const spM2 = portArea / 10000;  // cm² to m²

        return (sdM2 * xmaxM * this.fb) / spM2;
    }

    portVelocityStatus() {
        const velocity = this.calculatePortVelocity();
        if (!velocity) return null;

        if (velocity > 30) return { level: 'critical', warning: 'Very high - expect significant chuffing' };
        if (velocity > 20) return { level: 'high', warning: 'High - may have audible chuffing' };
        if (velocity > 15) return { level: 'moderate', warning: 'Moderate - acceptable for most uses' };
        return { level: 'good', warning: 'Good - low chuffing risk' };
    }

    // Generate frequency response sweep
    sweep(startFreq, endFreq, points) {
        const step = (endFreq - startFreq) / (points - 1);
        const frequencies = [];
        const response = [];

        for (let i = 0; i < points; i++) {
            const f = startFreq + i * step;
            frequencies.push(f);
            response.push(this.responseDbAt(f));
        }

        return { frequencies, response };
    }
}
