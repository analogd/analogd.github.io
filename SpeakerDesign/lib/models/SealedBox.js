// Sealed box model - represents a sealed enclosure design
// Uses Foundation library for all calculations (189 tested functions)
import * as Small1972 from '../foundation/small-1972.js';

export class SealedBox {
    constructor(driver, vb, options = {}) {
        this.driver = driver;
        this.vb = vb;  // Box volume (L)

        // Convert to SI for Foundation calls
        const vbSI = vb / 1000;  // Liters to m³

        // ALL calculations delegated to Foundation (Small 1972)
        this.alpha = Small1972.calculateAlpha(driver.vasSI, vbSI);
        this.qtc = Small1972.calculateQtc(driver.qts, this.alpha);
        this.fc = Small1972.calculateFc(driver.fs, this.alpha);
        this.f3 = Small1972.calculateF3(this.fc, this.qtc);

        // Alignment classification
        this.alignment = this._classifyAlignment();
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
    // Delegated to Foundation (Small 1972, Eq. 10)
    responseAt(frequency) {
        return Small1972.calculateResponseMagnitude(frequency, this.fc, this.qtc);
    }

    // Calculate frequency response in dB relative to passband
    // Delegated to Foundation (Small 1972, Eq. 10)
    responseDbAt(frequency) {
        return Small1972.calculateResponseDb(frequency, this.fc, this.qtc);
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
