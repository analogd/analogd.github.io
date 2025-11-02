// Small, Richard H. "Direct-Radiator Loudspeaker System Analysis"
// Journal of the Audio Engineering Society (JAES)
// Vol. 20, No. 5, June 1972, pp. 383-395
//
// Sealed (closed-box) loudspeaker system calculations

import { SPEED_OF_SOUND } from './constants.js';

// ============================================================================
// PARAMETER VALIDATION
// ============================================================================

/**
 * Validate driver Thiele-Small parameters
 *
 * Thiele-Small theory assumes:
 * - Pistonic driver behavior (no cone breakup)
 * - Linear suspension (small signal)
 * - Direct radiator (not horn-loaded)
 *
 * Valid ranges based on Small 1972 and practical experience:
 * - Fs: 15-500 Hz (below 15Hz: not pistonic, above 500Hz: breakup modes)
 * - Qts: 0.2-1.5 (below 0.2: overdamped/unstable, above 1.5: underdamped/ringing)
 * - Vas: Must be positive (physical constraint)
 * - Qes: Must be positive and typically > Qts (electrical losses)
 *
 * Source: Small 1972 applies to direct radiators only
 *         Dickason 2006, Chapter 3 for practical ranges
 *
 * @param {number} fs - Free-air resonance (Hz)
 * @param {number} qts - Total Q factor
 * @param {number} vas - Equivalent compliance volume (m³)
 * @param {number} qes - Electrical Q factor (optional)
 * @throws {Error} If parameters are outside valid ranges
 */
export function validateDriverParameters(fs, qts, vas, qes = null) {
    if (fs < 15 || fs > 500) {
        throw new Error(
            `Fs=${fs}Hz outside valid range (15-500Hz). ` +
            `Thiele-Small parameters assume pistonic behavior without cone breakup. ` +
            `Below 15Hz or above 500Hz, the model may not be accurate. ` +
            `Source: Small 1972 applies to direct radiators.`
        );
    }

    if (qts < 0.2 || qts > 1.5) {
        throw new Error(
            `Qts=${qts.toFixed(2)} outside practical range (0.2-1.5). ` +
            `Very low Qts (<0.2) indicates overdamping or measurement error. ` +
            `Very high Qts (>1.5) indicates severe underdamping with excessive ringing. ` +
            `Source: Dickason 2006, Chapter 3.`
        );
    }

    if (vas <= 0) {
        throw new Error(
            `Vas=${vas} must be positive. ` +
            `Vas represents equivalent air compliance volume and must be > 0.`
        );
    }

    if (qes !== null) {
        if (qes <= 0) {
            throw new Error(
                `Qes=${qes} must be positive. ` +
                `Qes represents electrical damping and must be > 0.`
            );
        }
        if (qes < qts) {
            throw new Error(
                `Qes=${qes.toFixed(2)} cannot be less than Qts=${qts.toFixed(2)}. ` +
                `By definition: 1/Qts = 1/Qes + 1/Qms, so Qes ≥ Qts. ` +
                `Check your T/S parameters.`
            );
        }
    }
}

/**
 * Validate box volume
 *
 * @param {number} vb - Box volume (m³)
 * @throws {Error} If volume is invalid
 */
export function validateBoxVolume(vb) {
    if (vb <= 0) {
        throw new Error(`Box volume Vb=${vb} must be positive.`);
    }
    if (vb > 10) {
        throw new Error(
            `Box volume Vb=${vb}m³ (${vb * 1000}L) is unusually large. ` +
            `Are you sure this is correct? Typical subwoofers are < 1000L.`
        );
    }
}

/**
 * Calculate compliance ratio (alpha) for sealed enclosure
 *
 * Formula: α = Vas / Vb
 *
 * This ratio determines how much the enclosure compliance affects
 * the driver's free-air compliance.
 *
 * Source: Small 1972, Equation 5
 *
 * @param {number} vas - Driver equivalent compliance volume (m³)
 * @param {number} vb - Box internal volume (m³)
 * @returns {number} Compliance ratio (dimensionless)
 */
export function calculateAlpha(vas, vb) {
    return vas / vb;
}

/**
 * Calculate system resonance frequency for sealed enclosure
 *
 * Formula: Fc = Fs × √(1 + α)
 * Where: α = Vas / Vb
 *
 * The box increases the system resonance relative to the driver's
 * free-air resonance by stiffening the suspension.
 *
 * Source: Small 1972, Equation 6
 *
 * @param {number} fs - Driver free-air resonance frequency (Hz)
 * @param {number} alpha - Compliance ratio (dimensionless)
 * @returns {number} System resonance frequency Fc (Hz)
 */
export function calculateFc(fs, alpha) {
    return fs * Math.sqrt(1 + alpha);
}

/**
 * Calculate total system quality factor for sealed enclosure
 *
 * Formula: Qtc = Qts × √(α + 1)
 * Where: α = Vas / Vb
 *
 * The box increases damping (Q) proportionally to the resonance shift.
 *
 * Source: Small 1972, Equation 7
 *
 * @param {number} qts - Driver total quality factor (dimensionless)
 * @param {number} alpha - Compliance ratio (dimensionless)
 * @returns {number} System total quality factor Qtc (dimensionless)
 */
export function calculateQtc(qts, alpha) {
    return qts * Math.sqrt(1 + alpha);
}

/**
 * Calculate -3dB frequency (F3) for sealed enclosure
 *
 * Derived from the 2nd-order highpass transfer function by finding
 * the frequency where |H(f)| = 1/√2 (-3dB).
 *
 * Formula: F3 = Fc / √[(1 - 1/(2Qtc²)) + √((1 - 1/(2Qtc²))² + 1)]
 *
 * Special case: For Butterworth alignment (Qtc = 0.707), F3 = Fc exactly.
 *
 * Source: Derived from Small 1972, Equation 10 (transfer function)
 *
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor (dimensionless)
 * @returns {number} -3dB frequency F3 (Hz)
 */
export function calculateF3(fc, qtc) {
    const term = 1 - 1 / (2 * qtc * qtc);
    const sqrt = Math.sqrt(term * term + 1);
    return fc / Math.sqrt(term + sqrt);
}

/**
 * Calculate normalized frequency response magnitude for sealed enclosure
 *
 * Formula: |H(f)| = (f/Fc)² / √[(1 - (f/Fc)²)² + (f/Fc)² / Qtc²]
 *
 * This is the 2nd-order highpass transfer function magnitude.
 * Returns normalized magnitude (1.0 = 0dB in passband).
 *
 * Source: Small 1972, Equation 10
 *
 * @param {number} frequency - Frequency to evaluate (Hz)
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor (dimensionless)
 * @returns {number} Normalized magnitude (dimensionless, 0 to ~1+)
 */
export function calculateResponseMagnitude(frequency, fc, qtc) {
    const ratio = frequency / fc;
    const ratio2 = ratio * ratio;

    const numerator = ratio2;
    const denominator = Math.sqrt(
        Math.pow(1 - ratio2, 2) + ratio2 / (qtc * qtc)
    );

    return numerator / denominator;
}

/**
 * Calculate response in dB for sealed enclosure
 *
 * Converts normalized magnitude to decibels relative to passband.
 *
 * Formula: Response(dB) = 20 × log₁₀(|H(f)|)
 *
 * Source: Standard dB conversion applied to Small 1972, Eq. 10
 *
 * @param {number} frequency - Frequency to evaluate (Hz)
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor (dimensionless)
 * @returns {number} Response in dB (negative below passband, 0 at passband)
 */
export function calculateResponseDb(frequency, fc, qtc) {
    const magnitude = calculateResponseMagnitude(frequency, fc, qtc);
    return 20 * Math.log10(magnitude);
}

/**
 * Calculate reference efficiency (η₀) for direct-radiator loudspeaker
 *
 * Formula: η₀ = (4π²/c³) × (Fs³ × Vas / Qes)
 *
 * This is the half-space reference efficiency, the fraction of electrical
 * input power converted to acoustic power at the reference frequency.
 *
 * Typically 0.001 to 0.05 (0.1% to 5%) for direct radiators.
 *
 * Source: Small 1972, Equation 22
 *
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} vas - Driver equivalent volume (m³)
 * @param {number} qes - Driver electrical quality factor (dimensionless)
 * @returns {number} Reference efficiency η₀ (dimensionless, 0 to 1)
 */
export function calculateEta0(fs, vas, qes) {
    const c = SPEED_OF_SOUND;
    const fourPiSquared = 4 * Math.PI * Math.PI;
    const cCubed = c * c * c;
    const fsCubed = fs * fs * fs;

    return (fourPiSquared / cCubed) * (fsCubed * vas / qes);
}

/**
 * Calculate reference SPL (SPL₀) from reference efficiency
 *
 * Formula: SPL₀ = 112 + 10 × log₁₀(η₀)
 *
 * This gives the on-axis SPL at 1 meter with 2.83V input (1W into 8Ω)
 * in half-space (driver mounted in infinite baffle).
 *
 * The constant 112 dB comes from:
 * - 2.83V into 8Ω = 1W
 * - Reference distance 1m
 * - Half-space radiation (2π steradians)
 *
 * Source: Standard conversion from efficiency to sensitivity
 *         (Derived from Small 1972, using standard acoustic formulas)
 *
 * @param {number} eta0 - Reference efficiency η₀ (dimensionless)
 * @returns {number} Reference SPL at 2.83V/1m (dB)
 */
export function calculateSpl0(eta0) {
    return 112 + 10 * Math.log10(eta0);
}
