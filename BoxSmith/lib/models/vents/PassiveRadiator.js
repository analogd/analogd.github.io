/**
 * PassiveRadiator Model - Validated PR Configuration
 *
 * Represents a validated passive radiator configuration.
 * Can be created from manual specs or loaded from database.
 * Immutable after construction.
 *
 * Usage:
 *   // Manual specs
 *   const pr = new PassiveRadiator({
 *       mmp: 150,    // grams
 *       sd: 500,     // cm^2
 *       xmax: 22     // mm
 *   });
 *
 *   // Multiple PRs
 *   const pr = new PassiveRadiator({
 *       mmp: 150, sd: 500, xmax: 22,
 *       quantity: 2
 *   });
 *
 *   // From database
 *   const pr = PassiveRadiator.fromDatabase('dayton-sd315-pr');
 *
 * All units: mmp in grams, sd in cm^2, xmax in mm, cmp in mm/N
 */

import * as PRCalc from '../../foundation/vented/passive-radiator.js';

// ============================================================================
// PR DATABASE
// ============================================================================

/**
 * Built-in PR specifications
 *
 * Sources: Manufacturer datasheets
 * Format: mmp (g), sd (cm^2), xmax (mm), cmp (mm/N), qmp
 */
const PR_DATABASE = {
    // Dayton Audio
    'dayton-sd315-pr': {
        model: 'Dayton Audio SD315-PR',
        manufacturer: 'Dayton Audio',
        mmp: 156,
        sd: 507,
        xmax: 22,
        cmp: 0.5,
        qmp: 4
    },
    'dayton-sd270-pr': {
        model: 'Dayton Audio SD270-PR',
        manufacturer: 'Dayton Audio',
        mmp: 92,
        sd: 352,
        xmax: 18,
        cmp: 0.6,
        qmp: 5
    },
    'dayton-sd215-pr': {
        model: 'Dayton Audio SD215-PR',
        manufacturer: 'Dayton Audio',
        mmp: 58,
        sd: 220,
        xmax: 14,
        cmp: 0.7,
        qmp: 5
    },

    // TODO: Add more PRs from Parts Express, SB Acoustics, etc.
};

export class PassiveRadiator {
    #quantity;      // 1-4
    #mmp;           // kg - moving mass per unit
    #cmp;           // m/N - compliance per unit
    #sd;            // m^2 - effective area per unit
    #xmax;          // m - excursion limit per unit
    #qmp;           // mechanical Q
    #model;         // optional model name
    #manufacturer;  // optional manufacturer

    /**
     * Create a passive radiator configuration
     *
     * @param {Object} config
     * @param {number} config.mmp - Moving mass in grams (per unit)
     * @param {number} config.sd - Effective area in cm^2 (per unit)
     * @param {number} config.xmax - Excursion limit in mm (per unit)
     * @param {number} [config.cmp=0] - Compliance in mm/N (per unit)
     * @param {number} [config.qmp=5] - Mechanical Q
     * @param {number} [config.quantity=1] - Number of PRs (1-4)
     * @param {string} [config.model] - Model name for display
     * @param {string} [config.manufacturer] - Manufacturer name
     */
    constructor(config) {
        const {
            mmp,
            sd,
            xmax,
            cmp = 0,
            qmp = PRCalc.TYPICAL_QMP,
            quantity = 1,
            model = null,
            manufacturer = null
        } = config;

        // Validate quantity
        if (quantity < 1 || quantity > 4 || !Number.isInteger(quantity)) {
            throw new Error(
                `PR quantity must be 1, 2, 3, or 4 (got ${quantity})`
            );
        }
        this.#quantity = quantity;

        // Validate mass (grams -> kg)
        if (mmp == null || mmp <= 0) {
            throw new Error('PR moving mass (mmp) must be positive');
        }
        if (mmp > 5000) {
            throw new Error(
                `PR mass ${mmp}g is unusually large (>5kg). Check units.`
            );
        }
        this.#mmp = mmp / 1000;  // g to kg

        // Validate area (cm^2 -> m^2)
        if (sd == null || sd <= 0) {
            throw new Error('PR effective area (sd) must be positive');
        }
        if (sd > 5000) {
            throw new Error(
                `PR area ${sd}cm^2 is unusually large. Check units.`
            );
        }
        this.#sd = sd / 10000;  // cm^2 to m^2

        // Validate Xmax (mm -> m)
        if (xmax == null || xmax <= 0) {
            throw new Error('PR excursion limit (xmax) must be positive');
        }
        if (xmax > 100) {
            throw new Error(
                `PR Xmax ${xmax}mm is unusually large (>100mm). Check units.`
            );
        }
        this.#xmax = xmax / 1000;  // mm to m

        // Compliance (mm/N -> m/N), can be 0 for very stiff PR
        if (cmp < 0) {
            throw new Error('PR compliance (cmp) cannot be negative');
        }
        this.#cmp = cmp / 1000;  // mm/N to m/N

        // Qmp
        if (qmp <= 0) {
            throw new Error('PR mechanical Q (qmp) must be positive');
        }
        this.#qmp = qmp;

        // Model info
        this.#model = model;
        this.#manufacturer = manufacturer;

        Object.freeze(this);
    }

    // ========================================================================
    // GETTERS - Basic Properties
    // ========================================================================

    /** Number of PRs (1-4) */
    get quantity() { return this.#quantity; }

    /** Model name (or null) */
    get model() { return this.#model; }

    /** Manufacturer name (or null) */
    get manufacturer() { return this.#manufacturer; }

    /** Mechanical Q */
    get qmp() { return this.#qmp; }

    // ========================================================================
    // GETTERS - Per-Unit Parameters (SI)
    // ========================================================================

    /** Moving mass per PR (kg) */
    get mmpKg() { return this.#mmp; }

    /** Compliance per PR (m/N) */
    get cmpSI() { return this.#cmp; }

    /** Effective area per PR (m^2) */
    get sdSI() { return this.#sd; }

    /** Excursion limit per PR (m) */
    get xmaxSI() { return this.#xmax; }

    // ========================================================================
    // GETTERS - Per-Unit Parameters (User Units)
    // ========================================================================

    /** Moving mass per PR (grams) */
    get mmpGrams() { return this.#mmp * 1000; }

    /** Compliance per PR (mm/N) */
    get cmpMmPerN() { return this.#cmp * 1000; }

    /** Effective area per PR (cm^2) */
    get sdCm2() { return this.#sd * 10000; }

    /** Excursion limit per PR (mm) */
    get xmaxMm() { return this.#xmax * 1000; }

    // ========================================================================
    // GETTERS - Total (All PRs Combined)
    // ========================================================================

    /**
     * Total moving mass all PRs (kg)
     * Used for tuning calculation - masses add in parallel
     */
    get totalMassKg() { return this.#mmp * this.#quantity; }

    /** Total moving mass all PRs (grams) */
    get totalMassGrams() { return this.totalMassKg * 1000; }

    /**
     * Total effective area all PRs (m^2)
     * Used for excursion calculations
     */
    get totalAreaSI() { return this.#sd * this.#quantity; }

    /** Total effective area all PRs (cm^2) */
    get totalAreaCm2() { return this.totalAreaSI * 10000; }

    /**
     * Effective Xmax for multiple PRs
     * With N identical PRs, total volume displacement = N * Sd * Xmax
     * Effective Xmax stays same per unit, but total capacity increases
     */
    get effectiveXmaxMm() { return this.xmaxMm; }

    // ========================================================================
    // CALCULATIONS - Tuning
    // ========================================================================

    /**
     * Calculate resulting tuning frequency for given box volume
     *
     * @param {number} vb - Box volume (m^3)
     * @returns {number} Tuning frequency (Hz)
     */
    tuningFor(vb) {
        return PRCalc.calculateTuningFrequency({
            mmp: this.totalMassKg,
            cmp: this.#cmp,
            sd: this.totalAreaSI,
            vb
        });
    }

    /**
     * Calculate required mass per PR for target tuning
     *
     * @param {number} fb - Target tuning (Hz)
     * @param {number} vb - Box volume (m^3)
     * @returns {number} Required mass per PR (grams)
     */
    requiredMassFor(fb, vb) {
        const totalMass = PRCalc.calculateRequiredMass({
            fb,
            cmp: this.#cmp,
            sd: this.totalAreaSI,
            vb
        });
        return (totalMass / this.#quantity) * 1000;  // kg to g, per unit
    }

    /**
     * Calculate mass adjustment needed to change tuning
     *
     * Note: currentFb is accepted for API clarity but not used mathematically.
     * We use actual mass (this.mmpGrams) rather than theoretical mass for currentFb,
     * which is correct - the user cares about what to add/remove from their actual PR.
     *
     * @param {number} _currentFb - Current tuning (Hz) - for API context only
     * @param {number} targetFb - Desired tuning (Hz)
     * @param {number} vb - Box volume (m^3)
     * @returns {number} Mass adjustment per PR (grams, + = add, - = remove)
     */
    massAdjustmentFor(_currentFb, targetFb, vb) {
        const targetRequired = this.requiredMassFor(targetFb, vb);
        return targetRequired - this.mmpGrams;
    }

    /**
     * Calculate compliance ratio delta
     *
     * @param {number} vb - Box volume (m^3)
     * @returns {number} Compliance ratio (dimensionless)
     */
    deltaFor(vb) {
        return PRCalc.calculateDelta(this.#cmp, this.totalAreaSI, vb);
    }

    /**
     * Check if this PR can reasonably tune to target frequency
     *
     * Returns false if required mass is negative or unreasonably high
     *
     * @param {number} fb - Target tuning (Hz)
     * @param {number} vb - Box volume (m^3)
     * @returns {boolean}
     */
    canTuneTo(fb, vb) {
        try {
            const required = this.requiredMassFor(fb, vb);
            // Reasonable range: 10g to 2000g per PR
            return required > 10 && required < 2000;
        } catch {
            return false;
        }
    }

    // ========================================================================
    // CALCULATIONS - Excursion
    // ========================================================================

    /**
     * Check if excursion is within limits
     *
     * @param {number} excursion - Peak excursion (m)
     * @returns {boolean}
     */
    isExcursionSafe(excursion) {
        return excursion <= this.#xmax;
    }

    /**
     * Calculate excursion margin
     *
     * @param {number} excursion - Peak excursion (m)
     * @returns {number} Margin in dB (positive = safe, negative = over)
     */
    excursionMarginDb(excursion) {
        if (excursion <= 0) return Infinity;
        return 20 * Math.log10(this.#xmax / excursion);
    }

    /**
     * Full excursion assessment
     *
     * @param {number} excursion - Peak excursion (m)
     * @returns {Object} Assessment with severity and margin
     */
    assessExcursion(excursion) {
        return PRCalc.assessExcursion(excursion, this.#xmax);
    }

    // ========================================================================
    // SERIALIZATION
    // ========================================================================

    /**
     * Convert to plain object for storage
     */
    toObject() {
        return {
            mmpGrams: this.mmpGrams,
            sdCm2: this.sdCm2,
            xmaxMm: this.xmaxMm,
            cmpMmPerN: this.cmpMmPerN,
            qmp: this.#qmp,
            quantity: this.#quantity,
            model: this.#model,
            manufacturer: this.#manufacturer
        };
    }

    /**
     * Create from plain object
     */
    static fromObject(obj) {
        return new PassiveRadiator({
            mmp: obj.mmpGrams,
            sd: obj.sdCm2,
            xmax: obj.xmaxMm,
            cmp: obj.cmpMmPerN || 0,
            qmp: obj.qmp || PRCalc.TYPICAL_QMP,
            quantity: obj.quantity || 1,
            model: obj.model || null,
            manufacturer: obj.manufacturer || null
        });
    }

    // ========================================================================
    // DATABASE
    // ========================================================================

    /**
     * Get list of available PR models in database
     *
     * @returns {Array<{id: string, model: string, manufacturer: string}>}
     */
    static getAvailableModels() {
        return Object.entries(PR_DATABASE).map(([id, spec]) => ({
            id,
            model: spec.model,
            manufacturer: spec.manufacturer
        }));
    }

    /**
     * Create PR from database by ID
     *
     * @param {string} modelId - Database key (e.g., 'dayton-sd315-pr')
     * @param {Object} [options] - Override options
     * @param {number} [options.quantity=1] - Number of PRs
     * @returns {PassiveRadiator}
     * @throws {Error} If model not found
     */
    static fromDatabase(modelId, options = {}) {
        const spec = PR_DATABASE[modelId];
        if (!spec) {
            const available = Object.keys(PR_DATABASE).join(', ');
            throw new Error(
                `Unknown PR model: ${modelId}. Available: ${available}`
            );
        }

        return new PassiveRadiator({
            ...spec,
            quantity: options.quantity || 1
        });
    }

    /**
     * Check if model exists in database
     *
     * @param {string} modelId - Database key
     * @returns {boolean}
     */
    static hasModel(modelId) {
        return modelId in PR_DATABASE;
    }

    // ========================================================================
    // DISPLAY
    // ========================================================================

    /**
     * Human-readable description
     */
    get description() {
        const qtyStr = this.#quantity > 1 ? `${this.#quantity}x ` : '';

        if (this.#model) {
            return `${qtyStr}${this.#model}`;
        }

        return `${qtyStr}${this.mmpGrams.toFixed(0)}g PR (${this.sdCm2.toFixed(0)}cm^2)`;
    }

    /**
     * Short description for UI
     */
    get shortDescription() {
        const qtyStr = this.#quantity > 1 ? `${this.#quantity}x ` : '';

        if (this.#model) {
            // Extract just model number if possible
            const match = this.#model.match(/[A-Z]{2,}\d+/);
            return `${qtyStr}${match ? match[0] : this.#model}`;
        }

        return `${qtyStr}${this.mmpGrams.toFixed(0)}g PR`;
    }
}
