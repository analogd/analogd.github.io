/**
 * MaxPowerCalculator - Compatibility wrapper for engineering layer
 *
 * ⚠️  DEPRECATED - Use lib/engineering/power-limits.js directly
 *
 * This class maintained for backward compatibility with existing UI code.
 * New code should import from engineering layer.
 *
 * Migration:
 * - Old: MaxPowerCalculator.calculateAtFrequency(box, freq)
 * - New: PowerLimits.calculateMaxPowerAtFrequency(params)
 */

import * as Engineering from '../engineering/index.js';

export class MaxPowerCalculator {
    /**
     * Generate complete max power curve across frequency range
     *
     * @param {SealedBox|PortedBox} box - Box model
     * @param {Array<number>} frequencies - Optional frequency array
     * @returns {Array<Object>} [{frequency, maxPower, limitingFactor, excursion}]
     */
    static generateCurve(box, frequencies = null) {
        const params = this._boxToParams(box);
        return Engineering.generateMaxPowerCurve(params, frequencies);
    }

    /**
     * Calculate max power at specific frequency
     *
     * @param {SealedBox|PortedBox} box - Box model
     * @param {number} frequency - Frequency in Hz
     * @returns {Object} {maxPower, limitingFactor, excursion}
     */
    static calculateAtFrequency(box, frequency) {
        const params = this._boxToParams(box);
        const result = Engineering.calculateMaxPowerAtFrequency({
            ...params,
            frequency
        });

        return {
            maxPower: result.maxPower,
            limitingFactor: result.limitingFactor,
            excursion: result.excursion
        };
    }

    /**
     * Calculate cone excursion at given power and frequency
     *
     * Now uses engineering layer displacement calculations.
     *
     * @param {SealedBox|PortedBox} box - Box model
     * @param {number} frequency - Frequency (Hz)
     * @param {number} power - Power (W)
     * @returns {number} Excursion in mm
     */
    static calculateExcursion(box, frequency, power) {
        const params = this._boxToParams(box);

        const displacement_m = Engineering.calculateDisplacementFromPower({
            ...params,
            frequency,
            power
        });

        return Engineering.displacementToMm(displacement_m);
    }

    /**
     * Check if given power is safe at a frequency
     *
     * @param {SealedBox|PortedBox} box - Box model
     * @param {number} frequency - Frequency (Hz)
     * @param {number} power - Power (W)
     * @returns {boolean} True if safe
     */
    static isSafe(box, frequency, power) {
        const result = this.calculateAtFrequency(box, frequency);
        return power <= result.maxPower;
    }

    /**
     * Get warnings for given power across frequency range
     *
     * @param {SealedBox|PortedBox} box - Box model
     * @param {number} power - Power (W)
     * @returns {Array<Object>} Warning objects
     */
    static getWarnings(box, power) {
        const params = this._boxToParams(box);
        return Engineering.getPowerWarnings(params, power);
    }

    /**
     * Convert box model to engineering layer parameters
     *
     * @private
     * @param {SealedBox|PortedBox} box - Box model
     * @returns {Object} Parameters for engineering functions
     */
    static _boxToParams(box) {
        const driver = box.driver;

        // Determine box type
        const boxType = box.constructor.name === 'PortedBox' ? 'ported' : 'sealed';

        // Calculate alpha (compliance ratio)
        const vbSI = box.vb / 1000;  // Liters to m³
        const alpha = driver.vasSI / vbSI;

        // Base parameters needed by all calculations
        const params = {
            boxType,

            // Driver T/S parameters
            fs: driver.fs,
            qts: driver.qts,
            alpha,

            // Mechanical parameters (SI units)
            re: driver.re || this._estimateRe(driver),
            bl: driver.bl || this._estimateBl(driver),
            mms: driver.mms ? driver.mms / 1000 : this._estimateMms(driver),  // g to kg
            cms: driver.cms || this._estimateCms(driver),
            rms: driver.rms || this._estimateRms(driver),

            // Limits
            xmax: driver.xmax ? driver.xmax / 1000 : 0.010,  // mm to m, default 10mm
            pe: driver.pe || 100  // Default 100W if not specified
        };

        // Add ported-specific parameters
        if (boxType === 'ported') {
            params.fb = box.fb;
            params.ql = box.ql || Infinity;  // Default lossless
        }

        return params;
    }

    /**
     * Estimate missing mechanical parameters from T/S parameters
     *
     * These are rough estimates when driver doesn't provide full data.
     * Prefer actual measured values when available.
     *
     * @private
     */
    static _estimateRe(driver) {
        // Typical Re ≈ 0.8 × nominal impedance for most drivers
        return 6.4;  // Assume 8Ω nominal → ~6.4Ω DC resistance
    }

    static _estimateBl(driver) {
        // Rough estimate from Qes and Re
        // Bl ≈ sqrt(Re × Mms × ω / Qes)
        // This is very approximate - prefer actual Bl measurement
        if (driver.qes && driver.mms && driver.fs) {
            const omega = 2 * Math.PI * driver.fs;
            const mms_kg = driver.mms / 1000;
            const re = driver.re || 6.4;
            return Math.sqrt(re * mms_kg * omega / driver.qes);
        }
        return 10;  // Very rough fallback
    }

    static _estimateMms(driver) {
        // Mms can be estimated from Vas, Fs, and physical constants
        // Vas = ρ₀×c²×Cms×Sd²
        // At resonance: ω² = 1/(Mms×Cms)
        // Therefore: Mms = 1/(ω²×Cms) = 1/(ω²×Vas/(ρ₀×c²×Sd²))
        if (driver.vas && driver.fs && driver.sd) {
            const rho = 1.204;  // kg/m³
            const c = 343;      // m/s
            const omega = 2 * Math.PI * driver.fs;
            const vas_m3 = driver.vas / 1000;
            const sd_m2 = driver.sd / 10000;

            const cms = vas_m3 / (rho * c * c * sd_m2 * sd_m2);
            const mms = 1 / (omega * omega * cms);
            return mms * 1000;  // kg to g
        }
        return 50;  // Very rough fallback (50g typical for midwoofer)
    }

    static _estimateCms(driver) {
        // Cms = Vas / (ρ₀×c²×Sd²)
        if (driver.vas && driver.sd) {
            const rho = 1.204;
            const c = 343;
            const vas_m3 = driver.vas / 1000;
            const sd_m2 = driver.sd / 10000;
            return vas_m3 / (rho * c * c * sd_m2 * sd_m2);
        }
        return 0.001;  // Rough fallback
    }

    static _estimateRms(driver) {
        // Rms = sqrt(Mms×Cms) / (Qms × ω)
        // Or from Qts, Qes relationship
        if (driver.qts && driver.qes) {
            const qms = (driver.qts * driver.qes) / (driver.qes - driver.qts);
            const mms_kg = (driver.mms || this._estimateMms(driver)) / 1000;
            const cms = driver.cms || this._estimateCms(driver);
            const omega = 2 * Math.PI * driver.fs;

            return Math.sqrt(mms_kg * cms) / (qms * omega);
        }
        return 1.0;  // Rough fallback
    }
}
