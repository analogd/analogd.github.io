/**
 * T/S Parameter Validation
 *
 * Validate Thiele-Small parameters before creating Driver objects.
 * Catches inconsistencies and provides hints about parameter quality.
 *
 * Use this to validate spec sheet data before committing to a design.
 */

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate T/S parameter consistency
 *
 * Checks relationships between parameters that should hold mathematically.
 * Returns issues array with severity levels.
 *
 * @param {Object} params - T/S parameters to validate
 * @param {number} [params.fs] - Resonant frequency (Hz)
 * @param {number} [params.qts] - Total Q
 * @param {number} [params.qes] - Electrical Q
 * @param {number} [params.qms] - Mechanical Q
 * @param {number} [params.vas] - Equivalent compliance volume (L)
 * @param {number} [params.mms] - Moving mass (g)
 * @param {number} [params.cms] - Compliance (m/N or mm/N)
 * @param {number} [params.sd] - Cone area (cm²)
 * @param {number} [params.xmax] - Maximum excursion (mm)
 * @param {number} [params.pe] - Power handling (W)
 * @param {number} [params.re] - DC resistance (ohms)
 * @param {number} [params.bl] - Force factor (N/A or T·m)
 * @returns {Object} {isValid: boolean, issues: Array<{code, message, severity, ...}>}
 */
export function validateTSParams(params) {
    const issues = [];

    // ========================================================================
    // Q PARAMETER CONSISTENCY
    // Qts = (Qes × Qms) / (Qes + Qms)
    // ========================================================================
    if (params.qts != null && params.qes != null && params.qms != null) {
        const expected = (params.qes * params.qms) / (params.qes + params.qms);
        const error = Math.abs(expected - params.qts) / params.qts;

        if (error > 0.10) {
            issues.push({
                code: 'Q_MISMATCH',
                message: `Qts=${params.qts} inconsistent with Qes=${params.qes}, Qms=${params.qms}. ` +
                    `Expected Qts=${expected.toFixed(3)} (${(error * 100).toFixed(1)}% error)`,
                severity: 'error',
                expected,
                actual: params.qts,
                error
            });
        } else if (error > 0.05) {
            issues.push({
                code: 'Q_MISMATCH',
                message: `Qts slightly inconsistent: expected ${expected.toFixed(3)}, got ${params.qts} ` +
                    `(${(error * 100).toFixed(1)}% error - may be measurement tolerance)`,
                severity: 'warning',
                expected,
                actual: params.qts,
                error
            });
        }
    }

    // ========================================================================
    // RESONANT FREQUENCY SANITY
    // ========================================================================
    if (params.fs != null) {
        if (params.fs < 15) {
            issues.push({
                code: 'FS_LOW',
                message: `Fs=${params.fs}Hz is very low - verify this is correct`,
                severity: 'warning'
            });
        } else if (params.fs > 100) {
            issues.push({
                code: 'FS_HIGH',
                message: `Fs=${params.fs}Hz is high for a subwoofer driver`,
                severity: 'info'
            });
        }
    }

    // ========================================================================
    // Fs / Mms / Cms CONSISTENCY
    // fs = 1 / (2π√(Mms × Cms))
    // ========================================================================
    if (params.fs != null && params.mms != null && params.cms != null) {
        const mms_kg = params.mms / 1000;
        const expected_fs = 1 / (2 * Math.PI * Math.sqrt(mms_kg * params.cms));
        const error = Math.abs(expected_fs - params.fs) / params.fs;

        if (error > 0.15) {
            issues.push({
                code: 'FS_MISMATCH',
                message: `Fs=${params.fs}Hz inconsistent with Mms=${params.mms}g, Cms=${params.cms}. ` +
                    `Expected Fs=${expected_fs.toFixed(1)}Hz`,
                severity: 'error',
                expected: expected_fs,
                actual: params.fs,
                error
            });
        } else if (error > 0.08) {
            issues.push({
                code: 'FS_MISMATCH',
                message: `Fs slightly inconsistent with Mms/Cms (${(error * 100).toFixed(0)}% error)`,
                severity: 'warning',
                expected: expected_fs,
                actual: params.fs,
                error
            });
        }
    }

    // ========================================================================
    // EBP (Efficiency Bandwidth Product) HINT
    // EBP = Fs / Qes
    // ========================================================================
    if (params.fs != null && params.qes != null) {
        const ebp = params.fs / params.qes;

        if (ebp < 50) {
            issues.push({
                code: 'EBP_SEALED',
                message: `EBP=${ebp.toFixed(0)} suggests sealed enclosure preferred`,
                severity: 'info',
                ebp,
                recommendation: 'sealed'
            });
        } else if (ebp > 90) {
            issues.push({
                code: 'EBP_VENTED',
                message: `EBP=${ebp.toFixed(0)} suggests vented/ported enclosure preferred`,
                severity: 'info',
                ebp,
                recommendation: 'vented'
            });
        } else {
            issues.push({
                code: 'EBP_FLEXIBLE',
                message: `EBP=${ebp.toFixed(0)} - driver works well in either sealed or vented`,
                severity: 'info',
                ebp,
                recommendation: 'either'
            });
        }
    }

    // ========================================================================
    // XMAX / SD SANITY (Volume Displacement)
    // ========================================================================
    if (params.xmax != null && params.sd != null) {
        const vd = params.sd * params.xmax / 10;  // cm² × mm → cm³

        if (vd < 100) {
            issues.push({
                code: 'VD_LOW',
                message: `Vd=${vd.toFixed(0)}cm³ is low - limited output capability`,
                severity: 'info',
                vd
            });
        } else if (vd > 2000) {
            issues.push({
                code: 'VD_HIGH',
                message: `Vd=${vd.toFixed(0)}cm³ is very high - serious output capability`,
                severity: 'info',
                vd
            });
        }
    }

    // ========================================================================
    // RE SANITY
    // ========================================================================
    if (params.re != null) {
        if (params.re < 2) {
            issues.push({
                code: 'RE_LOW',
                message: `Re=${params.re}Ω is very low - verify amp compatibility`,
                severity: 'warning'
            });
        } else if (params.re > 16) {
            issues.push({
                code: 'RE_HIGH',
                message: `Re=${params.re}Ω is high - unusual for subwoofer`,
                severity: 'info'
            });
        }
    }

    // ========================================================================
    // MISSING CRITICAL PARAMS
    // ========================================================================
    const critical = ['fs', 'qts', 'vas'];
    const missing = critical.filter(p => params[p] == null);

    if (missing.length > 0) {
        issues.push({
            code: 'MISSING_PARAMS',
            message: `Missing critical parameters: ${missing.join(', ')}`,
            severity: 'error',
            missing
        });
    }

    // ========================================================================
    // RESULT
    // ========================================================================
    return {
        isValid: !issues.some(i => i.severity === 'error'),
        hasWarnings: issues.some(i => i.severity === 'warning'),
        issues
    };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick check if params are valid (no errors)
 */
export function isValid(params) {
    return validateTSParams(params).isValid;
}

/**
 * Get only errors (severity === 'error')
 */
export function getErrors(params) {
    return validateTSParams(params).issues.filter(i => i.severity === 'error');
}

/**
 * Get only warnings (severity === 'warning')
 */
export function getWarnings(params) {
    return validateTSParams(params).issues.filter(i => i.severity === 'warning');
}

/**
 * Get EBP recommendation
 */
export function getEBPRecommendation(params) {
    if (params.fs == null || params.qes == null) return null;
    const ebp = params.fs / params.qes;
    if (ebp < 50) return 'sealed';
    if (ebp > 90) return 'vented';
    return 'either';
}
