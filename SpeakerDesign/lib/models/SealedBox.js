// Sealed box model - represents a sealed enclosure design
//
// ✅ CONFIDENCE: HIGH
// - Based on Small 1972 equations (validated with tests)
// - See FORMULA_STATUS.md for details
class SealedBox {
    constructor(driver, vb, options = {}) {
        this.driver = driver;
        this.vb = vb;  // Box volume (L)

        // Calculate derived parameters
        this.alpha = driver.vas / vb;
        this.qtc = driver.qts * Math.sqrt(this.alpha + 1);
        this.fc = driver.fs * Math.sqrt(this.alpha + 1);

        // Calculate F3 (-3dB frequency)
        this.f3 = this._calculateF3();

        // Alignment classification
        this.alignment = this._classifyAlignment();
    }

    _calculateF3() {
        const qtc = this.qtc;
        const fc = this.fc;

        const term = 1 - 1 / (2 * qtc * qtc);
        const sqrt = Math.sqrt(term * term + 1);
        return fc / Math.sqrt(term + sqrt);
    }

    _classifyAlignment() {
        const qtc = this.qtc;

        if (Math.abs(qtc - 0.707) < 0.05) return 'Butterworth';
        if (Math.abs(qtc - 0.577) < 0.05) return 'Bessel';
        if (Math.abs(qtc - 1.0) < 0.1) return 'Chebychev';

        if (qtc < 0.5) return 'Underdamped';
        if (qtc < 0.7) return 'Quasi-Butterworth';
        if (qtc < 0.9) return 'Near-Critical';
        return 'Overdamped';
    }

    // Calculate frequency response at a single frequency
    responseAt(frequency) {
        const ratio = frequency / this.fc;
        const ratio2 = ratio * ratio;

        // 2nd order high-pass transfer function
        const numerator = ratio2;
        const denominator = Math.sqrt((1 - ratio2) ** 2 + ratio2 / (this.qtc * this.qtc));

        return numerator / denominator;
    }

    // Calculate frequency response in dB relative to passband
    responseDbAt(frequency) {
        return 20 * Math.log10(this.responseAt(frequency));
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
