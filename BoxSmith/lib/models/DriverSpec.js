/**
 * DriverSpec - Driver specification with derivation and provenance tracking
 *
 * This is the "params-containing-thingimajig" that the driver library stores.
 * It handles incomplete spec sheet data by deriving missing values from
 * known T/S relationships, while tracking what was entered vs derived.
 *
 * Usage:
 *   const spec = new DriverSpec({ fs: 22, qts: 0.53, qes: 0.67, vas: 248, ... });
 *   spec.qms;              // 2.54 (derived from qts/qes)
 *   spec.isDerived('qms'); // true
 *   spec.isDerived('fs');  // false
 *
 *   const driver = spec.toDriver();  // Clean Driver for calculations
 *   const json = spec.toObject();    // For storage (includes provenance)
 *
 * Derivation relationships (T/S parameter interdependencies):
 *   - Qms = (Qts × Qes) / (Qes - Qts)     when Qts, Qes provided
 *   - Cms = Vas / (ρ₀ × c² × Sd²)         when Vas, Sd provided (SI: m/N)
 *   - Rms = (2π × Fs × Mms) / Qms         when Fs, Mms, Qms provided
 *   - Vd = Sd × Xmax / 10                 when Sd, Xmax provided (cm³)
 */

import { Driver } from './Driver.js';
import { SPEED_OF_SOUND, AIR_DENSITY } from '../foundation/constants.js';

// Parameters that can be derived from others
const DERIVABLE_PARAMS = ['qms', 'cms', 'rms', 'vd'];

export class DriverSpec {
    // All parameter values (entered or derived)
    #params = {};

    // Track which params were derived vs entered
    #derived = new Set();

    // Metadata
    #id;

    /**
     * Create a DriverSpec from raw parameters
     *
     * @param {Object} params - Driver parameters (partial is OK)
     * @param {string} [params.id] - Unique identifier
     * @param {string} [params.name] - Display name
     * @param {number} params.fs - Free-air resonance (Hz)
     * @param {number} params.qts - Total Q
     * @param {number} params.vas - Equivalent volume (L)
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
     * @param {number} [params.vd] - Volume displacement (cm³)
     * @param {number} [params.sensitivity] - Sensitivity (dB @ 2.83V/1m)
     * @param {string[]} [params._derived] - Previously derived params (for reload)
     */
    constructor(params) {
        this.#id = params.id || null;

        // Copy all provided params except metadata
        const paramKeys = [
            'fs', 'qts', 'vas', 'qes', 'qms', 're', 'le', 'bl', 'mms',
            'cms', 'rms', 'sd', 'xmax', 'pe', 'vd', 'sensitivity',
            'name', 'manufacturer', 'model', 'size'
        ];

        for (const key of paramKeys) {
            if (params[key] != null) {
                this.#params[key] = params[key];
            }
        }

        // Restore derivation tracking if reloading from storage
        if (Array.isArray(params._derived)) {
            for (const key of params._derived) {
                this.#derived.add(key);
            }
        }

        // Derive what we can
        this.#deriveAll();
    }

    // ========================================================================
    // DERIVATION LOGIC
    // ========================================================================

    /**
     * Derive all possible missing parameters
     */
    #deriveAll() {
        // Order matters: Qms must be derived before Rms (which depends on it)
        this.#deriveQms();
        this.#deriveCms();
        this.#deriveRms();
        this.#deriveVd();
    }

    /**
     * Derive Qms from Qts and Qes
     * Formula: 1/Qts = 1/Qes + 1/Qms → Qms = (Qts × Qes) / (Qes - Qts)
     */
    #deriveQms() {
        if (this.#params.qms != null) return; // Already have it

        const { qts, qes } = this.#params;
        if (qts == null || qes == null) return;
        if (qes <= qts) return; // Would give negative/infinite Qms

        const qms = (qts * qes) / (qes - qts);
        if (qms > 0 && isFinite(qms)) {
            this.#params.qms = qms;
            this.#derived.add('qms');
        }
    }

    /**
     * Derive Cms from Vas and Sd
     * Formula: Vas = ρ₀ × c² × Cms × Sd² → Cms = Vas / (ρ₀ × c² × Sd²)
     *
     * Units:
     *   Vas: liters → m³ (÷1000)
     *   Sd: cm² → m² (÷10000)
     *   Cms: m/N (SI)
     */
    #deriveCms() {
        if (this.#params.cms != null) return; // Already have it

        const { vas, sd } = this.#params;
        if (vas == null || sd == null) return;

        const vasSI = vas / 1000;       // L → m³
        const sdSI = sd / 10000;        // cm² → m²
        const rho = AIR_DENSITY;
        const c = SPEED_OF_SOUND;

        const cms = vasSI / (rho * c * c * sdSI * sdSI);
        if (cms > 0 && isFinite(cms)) {
            this.#params.cms = cms;
            this.#derived.add('cms');
        }
    }

    /**
     * Derive Rms from Fs, Mms, and Qms
     * Formula: Qms = 1 / (2π × Fs × Cms × Rms) ... but easier:
     *          Rms = (2π × Fs × Mms) / Qms
     *
     * Units:
     *   Fs: Hz
     *   Mms: g → kg (÷1000)
     *   Rms: kg/s
     */
    #deriveRms() {
        if (this.#params.rms != null) return; // Already have it

        const { fs, mms, qms } = this.#params;
        if (fs == null || mms == null || qms == null) return;

        const mmsSI = mms / 1000;       // g → kg
        const rms = (2 * Math.PI * fs * mmsSI) / qms;
        if (rms >= 0 && isFinite(rms)) {
            this.#params.rms = rms;
            this.#derived.add('rms');
        }
    }

    /**
     * Derive Vd from Sd and Xmax
     * Formula: Vd = Sd × Xmax
     *
     * Units:
     *   Sd: cm²
     *   Xmax: mm
     *   Vd: cm³ (so we divide by 10: cm² × mm ÷ 10 = cm³)
     */
    #deriveVd() {
        if (this.#params.vd != null) return; // Already have it

        const { sd, xmax } = this.#params;
        if (sd == null || xmax == null) return;

        const vd = (sd * xmax) / 10;
        if (vd > 0 && isFinite(vd)) {
            this.#params.vd = vd;
            this.#derived.add('vd');
        }
    }

    // ========================================================================
    // GETTERS
    // ========================================================================

    get id() { return this.#id; }
    get fs() { return this.#params.fs; }
    get qts() { return this.#params.qts; }
    get vas() { return this.#params.vas; }
    get qes() { return this.#params.qes; }
    get qms() { return this.#params.qms; }
    get re() { return this.#params.re; }
    get le() { return this.#params.le; }
    get bl() { return this.#params.bl; }
    get mms() { return this.#params.mms; }
    get cms() { return this.#params.cms; }
    get rms() { return this.#params.rms; }
    get sd() { return this.#params.sd; }
    get xmax() { return this.#params.xmax; }
    get pe() { return this.#params.pe; }
    get vd() { return this.#params.vd; }
    get sensitivity() { return this.#params.sensitivity; }
    get name() { return this.#params.name; }
    get manufacturer() { return this.#params.manufacturer; }
    get model() { return this.#params.model; }
    get size() { return this.#params.size; }

    // ========================================================================
    // PROVENANCE
    // ========================================================================

    /**
     * Check if a parameter was derived (vs entered)
     * @param {string} param - Parameter name
     * @returns {boolean}
     */
    isDerived(param) {
        return this.#derived.has(param);
    }

    /**
     * Check if a parameter was entered (vs derived)
     * @param {string} param - Parameter name
     * @returns {boolean}
     */
    isEntered(param) {
        return this.#params[param] != null && !this.#derived.has(param);
    }

    /**
     * Get list of all derived parameter names
     * @returns {string[]}
     */
    get derivedParams() {
        return [...this.#derived];
    }

    /**
     * Get the source of a parameter value
     * @param {string} param - Parameter name
     * @returns {'entered' | 'derived' | 'missing'}
     */
    getSource(param) {
        if (this.#params[param] == null) return 'missing';
        return this.#derived.has(param) ? 'derived' : 'entered';
    }

    /**
     * Get derivation info for a derived parameter
     * @param {string} param - Parameter name
     * @returns {Object|null} { from: string[], formula: string } or null
     */
    getDerivationInfo(param) {
        if (!this.#derived.has(param)) return null;

        const info = {
            qms: { from: ['qts', 'qes'], formula: '(Qts × Qes) / (Qes - Qts)' },
            cms: { from: ['vas', 'sd'], formula: 'Vas / (ρ₀ × c² × Sd²)' },
            rms: { from: ['fs', 'mms', 'qms'], formula: '(2π × Fs × Mms) / Qms' },
            vd: { from: ['sd', 'xmax'], formula: 'Sd × Xmax / 10' },
        };

        return info[param] || null;
    }

    // ========================================================================
    // CROSS-CHECKS
    // ========================================================================

    /**
     * Calculate what a parameter would be if derived (for cross-checking)
     * @param {string} param - Parameter name
     * @returns {number|null} Calculated value or null if can't derive
     */
    calculateDerived(param) {
        const { fs, qts, qes, vas, sd, mms, qms, xmax } = this.#params;

        switch (param) {
            case 'qms':
                if (qts && qes && qes > qts) {
                    return (qts * qes) / (qes - qts);
                }
                break;
            case 'cms':
                if (vas && sd) {
                    const vasSI = vas / 1000;
                    const sdSI = sd / 10000;
                    return vasSI / (AIR_DENSITY * SPEED_OF_SOUND * SPEED_OF_SOUND * sdSI * sdSI);
                }
                break;
            case 'rms':
                if (fs && mms && qms) {
                    const mmsSI = mms / 1000;
                    return (2 * Math.PI * fs * mmsSI) / qms;
                }
                break;
            case 'vd':
                if (sd && xmax) {
                    return (sd * xmax) / 10;
                }
                break;
        }
        return null;
    }

    /**
     * Check for discrepancies between entered and derivable values
     * @returns {Array<{param: string, entered: number, derived: number, errorPct: number}>}
     */
    getDiscrepancies() {
        const discrepancies = [];

        for (const param of DERIVABLE_PARAMS) {
            if (!this.isEntered(param)) continue;

            const entered = this.#params[param];
            const derived = this.calculateDerived(param);

            if (derived != null && entered != null) {
                const errorPct = Math.abs(derived - entered) / entered * 100;
                if (errorPct > 3) { // >3% discrepancy
                    discrepancies.push({ param, entered, derived, errorPct });
                }
            }
        }

        return discrepancies;
    }

    // ========================================================================
    // CONVERSION
    // ========================================================================

    /**
     * Create a Driver object for use in calculations
     * @returns {Driver}
     * @throws {Error} If required parameters are missing
     */
    toDriver() {
        return new Driver(this.#params);
    }

    /**
     * Check if this spec can produce a valid Driver
     * @returns {boolean}
     */
    canCreateDriver() {
        try {
            this.toDriver();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get validation errors that would prevent Driver creation
     * @returns {string[]} Error messages
     */
    getValidationErrors() {
        const errors = [];

        if (this.#params.fs == null) errors.push('Missing Fs (resonant frequency)');
        if (this.#params.qts == null) errors.push('Missing Qts (total Q)');
        if (this.#params.vas == null) errors.push('Missing Vas (equivalent volume)');

        // Range checks
        if (this.#params.fs != null && (this.#params.fs < 10 || this.#params.fs > 500)) {
            errors.push(`Fs=${this.#params.fs}Hz outside valid range (10-500Hz)`);
        }
        if (this.#params.qts != null && (this.#params.qts < 0.1 || this.#params.qts > 2.0)) {
            errors.push(`Qts=${this.#params.qts} outside valid range (0.1-2.0)`);
        }

        return errors;
    }

    // ========================================================================
    // SERIALIZATION
    // ========================================================================

    /**
     * Export as plain object for storage/JSON
     * Includes _derived array for provenance tracking
     */
    toObject() {
        const obj = { ...this.#params };

        if (this.#id) {
            obj.id = this.#id;
        }

        // Include derivation tracking if any params were derived
        if (this.#derived.size > 0) {
            obj._derived = [...this.#derived];
        }

        return obj;
    }

    /**
     * Create DriverSpec from plain object (e.g., from storage)
     */
    static fromObject(obj) {
        return new DriverSpec(obj);
    }

    /**
     * Human-readable display name
     */
    get displayName() {
        if (this.#params.manufacturer && this.#params.model) {
            return `${this.#params.manufacturer} ${this.#params.model}`;
        }
        if (this.#params.name) {
            return this.#params.name;
        }
        if (this.#params.fs && this.#params.qts) {
            return `Driver (Fs=${this.#params.fs}Hz, Qts=${this.#params.qts})`;
        }
        return 'Unnamed Driver';
    }
}
