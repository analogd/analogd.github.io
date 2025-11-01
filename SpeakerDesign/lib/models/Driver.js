// Driver model - immutable representation of T-S parameters
class Driver {
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
        this.xmax = params.xmax || null; // Linear excursion (mm)
        this.sd = params.sd || null;     // Effective piston area (cm²)
        this.pe = params.pe || null;     // Power handling (W)

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
        // η₀ = (4π²/c³) × (Fs³ × Vas / Qes)
        // SPL₀ = 112 + 10 × log₁₀(η₀)
        //
        // ⚠️ CONFIDENCE: MEDIUM
        // - Formula is from literature but simplified
        // - Typically within ±3dB of measured values
        // - Full formula requires Bl, Mms, Sd which aren't always available
        if (this.fs && this.vas && this.qes) {
            const c = 343;  // Speed of sound (m/s) at 20°C
            const vas_m3 = this.vas / 1000;  // Convert liters to m³

            // Calculate reference efficiency
            const fourPiSquared = 4 * Math.PI * Math.PI;
            const cCubed = c * c * c;
            const fsCubed = this.fs * this.fs * this.fs;

            const eta0 = (fourPiSquared / cCubed) * (fsCubed * vas_m3 / this.qes);

            // Convert to SPL @ 2.83V/1m
            derived.referenceEfficiency = eta0;
            derived.referenceSPL = 112 + 10 * Math.log10(eta0);

            // Also store as sensitivity (more common term)
            derived.sensitivity = parseFloat(derived.referenceSPL.toFixed(1));
        } else if (this.fs && this.vas) {
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
