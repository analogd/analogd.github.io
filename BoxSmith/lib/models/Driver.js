/**
 * Driver Model - Validated Thiele-Small Parameters
 *
 * Once constructed, a Driver is guaranteed valid. Downstream code
 * never needs to re-validate. Invalid parameters throw at construction.
 *
 * Usage:
 *   const driver = new Driver({ fs: 22, qts: 0.53, vas: 248, ... });
 *   // If we get here, driver is valid
 *   const design = designSealedBox(driver, 'butterworth');
 */

import { SPEED_OF_SOUND } from '../foundation/constants.js';

/**
 * Immutable, validated driver model
 */
export class Driver {
    // Required T/S parameters
    #fs;    // Free-air resonance (Hz)
    #qts;   // Total Q
    #vas;   // Equivalent volume (liters)

    // Optional but common
    #qes;   // Electrical Q
    #qms;   // Mechanical Q
    #re;    // Voice coil DC resistance (Ω)
    #le;    // Voice coil inductance (mH)

    // Mechanical parameters (for power/excursion calculations)
    #bl;    // Force factor (T·m)
    #mms;   // Moving mass (g)
    #cms;   // Compliance (m/N) - SI units, can be derived from Vas/Sd
    #rms;   // Mechanical resistance (kg/s) - can be derived from Qms

    // Physical
    #sd;    // Diaphragm area (cm²)
    #xmax;  // Linear excursion one-way (mm)
    #pe;    // Thermal power rating (W)
    #vd;    // Volume displacement (cm³) - can also be derived from Sd×Xmax
    #sensitivity;  // Sensitivity (dB @ 2.83V/1m) - can also be derived from eta0

    // Metadata (not validated, just stored)
    #name;
    #manufacturer;
    #model;

    /**
     * Construct a validated Driver
     *
     * @param {Object} params - Driver parameters
     * @param {number} params.fs - Free-air resonance (Hz) [required]
     * @param {number} params.qts - Total Q [required]
     * @param {number} params.vas - Equivalent volume in liters [required]
     * @param {number} [params.qes] - Electrical Q
     * @param {number} [params.qms] - Mechanical Q
     * @param {number} [params.re] - DC resistance (Ω)
     * @param {number} [params.le] - Inductance (mH)
     * @param {number} [params.bl] - Force factor (T·m)
     * @param {number} [params.mms] - Moving mass (g)
     * @param {number} [params.cms] - Compliance (m/N) - SI units
     * @param {number} [params.rms] - Mechanical resistance (kg/s)
     * @param {number} [params.sd] - Diaphragm area (cm²)
     * @param {number} [params.xmax] - Linear excursion (mm)
     * @param {number} [params.pe] - Thermal power (W)
     * @throws {Error} If required parameters missing or values invalid
     */
    constructor(params) {
        // ================================================================
        // REQUIRED PARAMETERS
        // ================================================================

        if (params.fs == null) {
            throw new Error('Driver requires fs (free-air resonance)');
        }
        if (params.qts == null) {
            throw new Error('Driver requires qts (total Q)');
        }
        if (params.vas == null) {
            throw new Error('Driver requires vas (equivalent volume in liters)');
        }

        // Validate fs range
        if (params.fs < 10 || params.fs > 500) {
            throw new Error(
                `fs=${params.fs}Hz outside valid range (10-500Hz). ` +
                `Below 10Hz suggests measurement error. Above 500Hz is not a subwoofer/woofer.`
            );
        }
        this.#fs = params.fs;

        // Validate Qts range
        if (params.qts < 0.1 || params.qts > 2.0) {
            throw new Error(
                `Qts=${params.qts} outside valid range (0.1-2.0). ` +
                `Check your T/S parameters.`
            );
        }
        this.#qts = params.qts;

        // Validate Vas
        if (params.vas <= 0) {
            throw new Error('Vas must be positive');
        }
        if (params.vas > 2000) {
            throw new Error(
                `Vas=${params.vas}L is unusually large (>2000L). ` +
                `Check units - Vas should be in liters.`
            );
        }
        this.#vas = params.vas;

        // ================================================================
        // Q PARAMETERS - validate relationships
        // ================================================================

        if (params.qes != null) {
            if (params.qes <= 0) {
                throw new Error('Qes must be positive');
            }
            if (params.qes < params.qts) {
                throw new Error(
                    `Qes=${params.qes} cannot be less than Qts=${params.qts}. ` +
                    `By definition: 1/Qts = 1/Qes + 1/Qms, so Qes ≥ Qts.`
                );
            }
            this.#qes = params.qes;
        }

        if (params.qms != null) {
            if (params.qms <= 0) {
                throw new Error('Qms must be positive');
            }
            if (params.qms < params.qts) {
                throw new Error(
                    `Qms=${params.qms} cannot be less than Qts=${params.qts}. ` +
                    `By definition: 1/Qts = 1/Qes + 1/Qms, so Qms ≥ Qts.`
                );
            }
            this.#qms = params.qms;
        }

        // Cross-validate Q relationships if all three provided
        if (params.qes != null && params.qms != null) {
            const calculatedQts = (params.qes * params.qms) / (params.qes + params.qms);
            const tolerance = 0.05; // 5% tolerance for measurement error
            if (Math.abs(calculatedQts - params.qts) / params.qts > tolerance) {
                throw new Error(
                    `Q parameters inconsistent: Qes=${params.qes}, Qms=${params.qms} ` +
                    `implies Qts=${calculatedQts.toFixed(3)}, but Qts=${params.qts} was provided. ` +
                    `Difference exceeds 5% tolerance.`
                );
            }
        }

        // ================================================================
        // ELECTRICAL PARAMETERS
        // ================================================================

        if (params.re != null) {
            if (params.re <= 0 || params.re > 32) {
                throw new Error(`Re=${params.re}Ω outside valid range (0-32Ω)`);
            }
            this.#re = params.re;
        }

        if (params.le != null) {
            if (params.le < 0) {
                throw new Error('Le cannot be negative');
            }
            this.#le = params.le;
        }

        // ================================================================
        // MECHANICAL PARAMETERS
        // ================================================================

        if (params.bl != null) {
            if (params.bl <= 0) {
                throw new Error('Bl must be positive');
            }
            this.#bl = params.bl;
        }

        if (params.mms != null) {
            if (params.mms <= 0) {
                throw new Error('Mms must be positive');
            }
            this.#mms = params.mms;
        }

        if (params.cms != null) {
            if (params.cms <= 0) {
                throw new Error('Cms must be positive');
            }
            this.#cms = params.cms;
        }

        if (params.rms != null) {
            if (params.rms < 0) {
                throw new Error('Rms cannot be negative');
            }
            this.#rms = params.rms;
        }

        // ================================================================
        // PHYSICAL PARAMETERS
        // ================================================================

        if (params.sd != null) {
            if (params.sd <= 0) {
                throw new Error('Sd must be positive');
            }
            this.#sd = params.sd;
        }

        if (params.xmax != null) {
            if (params.xmax <= 0) {
                throw new Error('Xmax must be positive');
            }
            if (params.xmax > 100) {
                throw new Error(
                    `Xmax=${params.xmax}mm is unusually large (>100mm). ` +
                    `Check units - Xmax should be in mm (one-way).`
                );
            }
            this.#xmax = params.xmax;
        }

        if (params.pe != null) {
            if (params.pe <= 0) {
                throw new Error('Pe must be positive');
            }
            this.#pe = params.pe;
        }

        if (params.vd != null) {
            if (params.vd <= 0) {
                throw new Error('Vd must be positive');
            }
            this.#vd = params.vd;
        }

        if (params.sensitivity != null) {
            if (params.sensitivity < 50 || params.sensitivity > 120) {
                throw new Error(`Sensitivity=${params.sensitivity}dB outside valid range (50-120dB)`);
            }
            this.#sensitivity = params.sensitivity;
        }

        // ================================================================
        // METADATA
        // ================================================================

        this.#name = params.name || null;
        this.#manufacturer = params.manufacturer || null;
        this.#model = params.model || null;

        // Freeze to prevent mutation
        Object.freeze(this);
    }

    // ====================================================================
    // GETTERS - All parameters accessible but immutable
    // ====================================================================

    get fs() { return this.#fs; }
    get qts() { return this.#qts; }
    get vas() { return this.#vas; }
    get qes() { return this.#qes; }
    get qms() { return this.#qms; }
    get re() { return this.#re; }
    get le() { return this.#le; }
    get bl() { return this.#bl; }
    get mms() { return this.#mms; }
    get cms() { return this.#cms; }
    get rms() { return this.#rms; }
    get sd() { return this.#sd; }
    get xmax() { return this.#xmax; }
    get pe() { return this.#pe; }
    get name() { return this.#name; }
    get manufacturer() { return this.#manufacturer; }
    get model() { return this.#model; }

    // ====================================================================
    // DERIVED PROPERTIES - Computed on access
    // ====================================================================

    /**
     * Vas in SI units (m³)
     */
    get vasSI() {
        return this.#vas / 1000;
    }

    /**
     * Sd in SI units (m²)
     */
    get sdSI() {
        return this.#sd ? this.#sd / 10000 : null;
    }

    /**
     * Xmax in SI units (m)
     */
    get xmaxSI() {
        return this.#xmax ? this.#xmax / 1000 : null;
    }

    /**
     * Mms in SI units (kg)
     */
    get mmsSI() {
        return this.#mms ? this.#mms / 1000 : null;
    }

    /**
     * Le in SI units (H).
     * Defaults to 0 (ideal, no inductance) when not specified.
     * This is a simplifying assumption - real drivers have inductance
     * that affects impedance rise at high frequencies.
     */
    get leSI() {
        return (this.#le ?? 0) / 1000;
    }

    /**
     * Efficiency Bandwidth Product (EBP)
     *
     * Rule of thumb:
     * - EBP < 50: Better suited for sealed
     * - EBP 50-90: Either works
     * - EBP > 90: Better suited for ported
     */
    get ebp() {
        if (!this.#qes) return null;
        return this.#fs / this.#qes;
    }

    /**
     * Enclosure hint based on EBP
     */
    get enclosureHint() {
        const ebp = this.ebp;
        if (ebp == null) return null;
        if (ebp < 50) return 'sealed';
        if (ebp > 90) return 'ported';
        return 'either';
    }

    /**
     * Volume displacement (Vd) in cm³
     */
    get vd() {
        return this.#vd;
    }

    /**
     * Reference efficiency (η₀)
     * Small 1972, Equation 22
     */
    get eta0() {
        if (!this.#qes) return null;
        const c = SPEED_OF_SOUND;
        const k = (4 * Math.PI * Math.PI) / (c * c * c);
        return k * Math.pow(this.#fs, 3) * this.vasSI / this.#qes;
    }

    /**
     * Sensitivity (dB @ 2.83V/1m)
     */
    get sensitivity() {
        return this.#sensitivity;
    }


    // ====================================================================
    // CAPABILITY CHECKS
    // ====================================================================

    /**
     * Does this driver suit a ported alignment?
     * Based on typical Qts range for ported (0.3-0.5)
     */
    get suitsPorted() {
        return this.#qts >= 0.25 && this.#qts <= 0.55;
    }

    /**
     * Does this driver suit a sealed alignment?
     * Almost any driver can work sealed, but very low Qts needs huge boxes
     */
    get suitsSealed() {
        return this.#qts >= 0.2;
    }

    // ====================================================================
    // PARAM AVAILABILITY CHECKS
    // ====================================================================

    /**
     * Check if driver has all specified parameters
     * Each method/graph should declare exactly what params it needs.
     *
     * @param {...string} params - Parameter names to check
     * @returns {boolean} True if all specified params are non-null
     *
     * @example
     * driver.hasParams('bl', 'mms', 'cms', 'rms')  // motor params
     * driver.hasParams('xmax', 'pe')               // limit params
     */
    hasParams(...params) {
        return params.every(p => this[p] != null);
    }

    /**
     * Get list of missing parameters from a required set
     *
     * @param {...string} params - Parameter names to check
     * @returns {string[]} Names of params that are null/undefined
     */
    missingParams(...params) {
        return params.filter(p => this[p] == null);
    }

    // ====================================================================
    // SERIALIZATION
    // ====================================================================

    /**
     * Export as plain object (for JSON, storage, etc.)
     */
    toObject() {
        const obj = {
            fs: this.#fs,
            qts: this.#qts,
            vas: this.#vas
        };

        // Only include non-null optional params
        if (this.#qes != null) obj.qes = this.#qes;
        if (this.#qms != null) obj.qms = this.#qms;
        if (this.#re != null) obj.re = this.#re;
        if (this.#le != null) obj.le = this.#le;
        if (this.#bl != null) obj.bl = this.#bl;
        if (this.#mms != null) obj.mms = this.#mms;
        if (this.#cms != null) obj.cms = this.#cms;
        if (this.#rms != null) obj.rms = this.#rms;
        if (this.#sd != null) obj.sd = this.#sd;
        if (this.#xmax != null) obj.xmax = this.#xmax;
        if (this.#pe != null) obj.pe = this.#pe;
        if (this.#vd != null) obj.vd = this.#vd;
        if (this.#sensitivity != null) obj.sensitivity = this.#sensitivity;
        if (this.#name != null) obj.name = this.#name;
        if (this.#manufacturer != null) obj.manufacturer = this.#manufacturer;
        if (this.#model != null) obj.model = this.#model;

        return obj;
    }

    /**
     * Create Driver from plain object
     */
    static fromObject(obj) {
        return new Driver(obj);
    }

    /**
     * Human-readable display name
     */
    get displayName() {
        if (this.#manufacturer && this.#model) {
            return `${this.#manufacturer} ${this.#model}`;
        }
        if (this.#name) {
            return this.#name;
        }
        return `Driver (Fs=${this.#fs}Hz, Qts=${this.#qts})`;
    }
}
