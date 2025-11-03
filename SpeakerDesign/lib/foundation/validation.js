/**
 * Parameter Validation - Cross-check T/S Parameters
 *
 * Validates that Thiele-Small parameters are:
 * 1. Within physically reasonable bounds
 * 2. Internally consistent (derived relationships hold)
 *
 * Prevents:
 * - Data entry errors
 * - Unit conversion mistakes
 * - Using parameters from different drivers
 * - Unrealistic values that break calculations
 */

/**
 * Validate T/S parameters with cross-checks
 *
 * Checks:
 * - Absolute bounds (Fs, Qts, Vas, etc.)
 * - Derived relationships: 1/Qts = 1/Qes + 1/Qms
 * - Physical consistency: Vas from Cms, Sd
 * - Electrical consistency: BL, Re, sensitivity
 *
 * @param {Object} params - T/S parameters
 * @param {number} params.fs - Resonance frequency (Hz)
 * @param {number} params.qts - Total Q
 * @param {number} params.qes - Electrical Q
 * @param {number} params.qms - Mechanical Q
 * @param {number} params.vas - Equivalent volume (m³)
 * @param {number} [params.sd] - Piston area (m²)
 * @param {number} [params.cms] - Compliance (m/N)
 * @param {number} [params.mms] - Moving mass (kg)
 * @param {number} [params.re] - DC resistance (Ω)
 * @param {number} [params.bl] - Force factor (N/A)
 * @param {Object} [options] - Validation options
 * @param {number} [options.qTolerance=0.05] - Tolerance for Q relationship
 * @param {number} [options.vasTolerance=0.15] - Tolerance for Vas calculation
 * @param {boolean} [options.warnOnly=false] - Only warn on derived checks
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateTSParameters(params, options = {}) {
    const {
        qTolerance = 0.05,
        vasTolerance = 0.15,
        warnOnly = false
    } = options;

    const errors = [];
    const warnings = [];

    // Absolute bounds
    if (params.fs < 10 || params.fs > 500) {
        errors.push(`Fs=${params.fs}Hz outside valid range (10-500Hz). Check units or driver type.`);
    }

    if (params.qts < 0.2 || params.qts > 1.5) {
        warnings.push(`Qts=${params.qts.toFixed(3)} outside typical range (0.2-1.5). Verify measurement.`);
    }

    if (params.vas <= 0 || params.vas > 2) {
        errors.push(`Vas=${params.vas}m³ is unrealistic. Check units (should be m³, not liters).`);
    }

    // Derived relationship: 1/Qts = 1/Qes + 1/Qms
    if (params.qes && params.qms) {
        const qts_calculated = (params.qes * params.qms) / (params.qes + params.qms);
        const qts_error = Math.abs(qts_calculated - params.qts) / params.qts;

        if (qts_error > qTolerance) {
            const msg = `Qts mismatch: Given ${params.qts.toFixed(3)}, calculated ${qts_calculated.toFixed(3)} from Qes/Qms (error: ${(qts_error * 100).toFixed(1)}%)`;
            if (warnOnly) {
                warnings.push(msg);
            } else {
                errors.push(msg + '. Verify: 1/Qts = 1/Qes + 1/Qms');
            }
        }

        // Qes should be > Qts
        if (params.qes < params.qts) {
            errors.push(`Qes=${params.qes.toFixed(3)} cannot be less than Qts=${params.qts.toFixed(3)}`);
        }

        // Qms should be > Qts
        if (params.qms < params.qts) {
            errors.push(`Qms=${params.qms.toFixed(3)} cannot be less than Qts=${params.qts.toFixed(3)}`);
        }
    }

    // Vas consistency check: Vas = ρ₀ × c² × Cms × Sd²
    if (params.cms && params.sd) {
        const RHO_0 = 1.184; // kg/m³ at 25°C
        const C = 345; // m/s at 25°C

        // cms might be in mm/N, need to convert to m/N
        const cms_m = params.cms < 1 ? params.cms : params.cms / 1000;

        const vas_calculated = RHO_0 * C * C * cms_m * params.sd * params.sd;
        const vas_error = Math.abs(vas_calculated - params.vas) / params.vas;

        if (vas_error > vasTolerance) {
            const msg = `Vas mismatch: Given ${params.vas.toFixed(3)}m³, calculated ${vas_calculated.toFixed(3)}m³ from Cms/Sd (error: ${(vas_error * 100).toFixed(1)}%)`;
            warnings.push(msg + '. This is common - Vas measurement varies by method.');
        }
    }

    // Resonance check: fs = 1/(2π√(Mms×Cms))
    if (params.mms && params.cms) {
        const cms_m = params.cms < 1 ? params.cms : params.cms / 1000;
        const mms_kg = params.mms < 5 ? params.mms : params.mms / 1000;

        const fs_calculated = 1 / (2 * Math.PI * Math.sqrt(mms_kg * cms_m));
        const fs_error = Math.abs(fs_calculated - params.fs) / params.fs;

        if (fs_error > 0.10) {
            warnings.push(`Fs mismatch: Given ${params.fs}Hz, calculated ${fs_calculated.toFixed(1)}Hz from Mms/Cms (error: ${(fs_error * 100).toFixed(1)}%). Verify mechanical parameters.`);
        }
    }

    // Electrical sanity
    if (params.re) {
        if (params.re < 1 || params.re > 50) {
            warnings.push(`Re=${params.re}Ω outside typical range (1-50Ω). Verify measurement.`);
        }
    }

    if (params.bl) {
        if (params.bl < 5 || params.bl > 50) {
            warnings.push(`BL=${params.bl}N/A outside typical range (5-50). Verify units and measurement.`);
        }
    }

    // Xmax sanity
    if (params.xmax) {
        const xmax_m = params.xmax < 1 ? params.xmax : params.xmax / 1000;
        if (xmax_m < 0.001 || xmax_m > 0.050) {
            warnings.push(`Xmax=${xmax_m * 1000}mm outside typical range (1-50mm). Verify units.`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validate and auto-convert units for common mistakes
 *
 * Common issues:
 * - Vas in liters instead of m³
 * - Mms in grams instead of kg
 * - Cms in mm/N instead of m/N
 * - Xmax in mm instead of m
 *
 * @param {Object} params - Raw parameters
 * @returns {Object} Normalized parameters in SI units
 */
export function normalizeUnits(params) {
    const normalized = { ...params };

    // Vas: if > 5, probably liters
    if (normalized.vas > 5) {
        normalized.vas = normalized.vas / 1000;
        normalized._vasConverted = true;
    }

    // Mms: if > 5, probably grams
    if (normalized.mms && normalized.mms > 5) {
        normalized.mms = normalized.mms / 1000;
        normalized._mmsConverted = true;
    }

    // Cms: if > 1, probably mm/N
    if (normalized.cms && normalized.cms > 1) {
        normalized.cms = normalized.cms / 1000;
        normalized._cmsConverted = true;
    }

    // Xmax: if > 1, probably mm
    if (normalized.xmax && normalized.xmax > 1) {
        normalized.xmax = normalized.xmax / 1000;
        normalized._xmaxConverted = true;
    }

    // Sd: if > 100, probably cm²
    if (normalized.sd && normalized.sd > 100) {
        normalized.sd = normalized.sd / 10000;
        normalized._sdConverted = true;
    }

    return normalized;
}
