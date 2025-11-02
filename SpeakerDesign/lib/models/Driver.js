// Driver model - immutable representation of T-S parameters
// Uses Foundation library for all calculations (189 tested functions)
import * as Small1972 from '../foundation/small-1972.js';

export class Driver {
    constructor(params) {
        // Required T-S parameters
        this.fs = params.fs;   // Resonance frequency (Hz)
        this.qts = params.qts; // Total Q
        this.vas = params.vas; // Equivalent volume (L)

        // Optional but common parameters
        this.qes = params.qes || null;  // Electrical Q
        this.qms = params.qms || null;  // Mechanical Q
        this.re = params.re || null;    // DC resistance (Ω)
        this.le = params.le || null;    // Voice coil inductance (mH)
        this.bl = params.bl || null;    // Force factor (T·m)
        this.mms = params.mms || null;  // Moving mass (g)
        this.cms = params.cms || null;  // Compliance (m/N)
        this.rms = params.rms || null;  // Mechanical resistance (kg/s)
        this.xmax = params.xmax || null; // Linear excursion (mm)
        this.sd = params.sd || null;     // Effective piston area (cm²)
        this.pe = params.pe || null;     // Power handling (W)

        // Store SI conversions for Foundation calls
        this.vasSI = this.vas / 1000;  // Convert liters to m³

        // Derived parameters (calculated on construction)
        this.derived = this._calculateDerived();
    }

    _calculateDerived() {
        const derived = {};

        // VD (displacement volume) = Sd × Xmax
        if (this.sd && this.xmax) {
            derived.vd = Math.round(this.sd * this.xmax);
        }

        // EBP (efficiency bandwidth product) = Fs / Qes
        if (this.fs && this.qes) {
            derived.ebp = parseFloat((this.fs / this.qes).toFixed(1));

            // Enclosure hint based on EBP
            if (derived.ebp < 50) {
                derived.enclosureHint = 'sealed';
            } else if (derived.ebp < 100) {
                derived.enclosureHint = 'versatile';
            } else {
                derived.enclosureHint = 'ported';
            }
        }

        // Reference efficiency (η₀) and sensitivity - Small 1972, Equation 22
        // Delegated to Foundation library (tested, correct)
        if (this.fs && this.vasSI && this.qes) {
            // Use Foundation library (Small 1972, Eq. 22)
            const eta0 = Small1972.calculateEta0(this.fs, this.vasSI, this.qes);
            const spl0 = Small1972.calculateSpl0(eta0);

            derived.referenceEfficiency = eta0;
            derived.referenceSPL = spl0;
            derived.sensitivity = parseFloat(spl0.toFixed(1));
        } else if (this.fs && this.vasSI) {
            // Fallback: rough approximation without Qes
            const fs3 = Math.pow(this.fs, 3);
            const product = fs3 * this.vas;
            derived.sensitivityEst = Math.round(112 + 10 * Math.log10(product));
        }

        return derived;
    }

    // Validation
    isValid() {
        return this.fs > 0 && this.qts > 0 && this.vas > 0;
    }

    // Check if driver has sufficient parameters for specific calculations
    canCalculateSealed() {
        return this.fs && this.qts && this.vas;
    }

    canCalculatePorted() {
        return this.fs && this.qts && this.vas;
    }

    canCalculateExcursion() {
        return this.sd && this.xmax;
    }

    canCalculateThermalLimit() {
        return this.pe;
    }
}
