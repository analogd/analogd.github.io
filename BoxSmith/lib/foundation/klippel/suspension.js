/**
 * Suspension Nonlinearity - Kms(x) Estimation
 *
 * 📄 PAPER-CLOSE LAYER
 * Reference: Klippel 2006 "Loudspeaker Nonlinearities – Causes, Parameters, Symptoms"
 *
 * Suspension stiffness (Kms = 1/Cms) varies with displacement:
 * - At rest: Kms(0) = nominal stiffness (from T/S)
 * - With displacement: stiffness typically increases (progressive)
 * - This is BY DESIGN to prevent over-excursion
 *
 * Effects on response:
 * - Shifts resonance frequency at high excursion
 * - Causes harmonic distortion (mainly odd harmonics for symmetric curves)
 * - Less dominant than Bl(x) for SPL compression
 */

/**
 * Calculate Kms(x) using polynomial model
 *
 * Standard model: Kms(x) = Kms0 × [1 + c2×x² + c4×x⁴]
 *
 * Where:
 * - Kms0 = stiffness at rest = 1/Cms
 * - c2 = quadratic coefficient (progressive characteristic)
 * - c4 = quartic coefficient (hard limiting at extremes)
 *
 * @param {number} x - Displacement from rest (mm)
 * @param {number} kms0 - Stiffness at rest (N/m)
 * @param {number} c2 - Quadratic coefficient (1/mm²), default based on Xmax
 * @param {number} c4 - Quartic coefficient (1/mm⁴), default 0
 * @returns {number} Stiffness at position x (N/m)
 */
export function kmsPolynomial(x, kms0, c2 = 0, c4 = 0) {
    const x2 = x * x;
    const multiplier = 1 + c2 * x2 + c4 * x2 * x2;
    return kms0 * Math.max(1, multiplier);  // Never softer than rest
}

/**
 * Estimate Kms(x) from Xmax with typical progressive characteristic
 *
 * Empirical model assuming:
 * - Stiffness doubles at Xmax (typical for well-designed suspensions)
 * - Symmetric behavior (same push/pull)
 *
 * @param {number} x - Displacement from rest (mm)
 * @param {number} kms0 - Stiffness at rest (N/m)
 * @param {number} xmax - Rated Xmax (mm)
 * @param {Object} [options] - Tuning parameters
 * @param {number} [options.stiffnessRatioAtXmax=2.0] - Kms(Xmax)/Kms(0)
 * @returns {number} Stiffness at position x (N/m)
 */
export function kmsFromXmax(x, kms0, xmax, options = {}) {
    const { stiffnessRatioAtXmax = 2.0 } = options;

    // Derive c2 so that Kms(xmax)/Kms(0) = stiffnessRatioAtXmax
    // 1 + c2 × xmax² = stiffnessRatioAtXmax
    // c2 = (stiffnessRatioAtXmax - 1) / xmax²
    const c2 = (stiffnessRatioAtXmax - 1) / (xmax * xmax);

    return kmsPolynomial(x, kms0, c2, 0);
}

/**
 * Calculate Cms(x) - compliance varies inversely with stiffness
 *
 * @param {number} x - Displacement (mm)
 * @param {number} cms0 - Compliance at rest (m/N)
 * @param {number} xmax - Rated Xmax (mm)
 * @param {Object} [options] - Options for kmsFromXmax
 * @returns {number} Compliance at position x (m/N)
 */
export function cmsFromXmax(x, cms0, xmax, options = {}) {
    const kms0 = 1 / cms0;
    const kms = kmsFromXmax(x, kms0, xmax, options);
    return 1 / kms;
}

/**
 * Calculate effective resonance shift from suspension stiffening
 *
 * When Kms increases, resonance frequency shifts up:
 * fs(x) = fs(0) × sqrt(Kms(x) / Kms(0))
 *
 * @param {number} fs0 - Resonance at rest (Hz)
 * @param {number} x - Current excursion (mm)
 * @param {number} xmax - Rated Xmax (mm)
 * @param {Object} [options] - Options for kmsFromXmax
 * @returns {number} Shifted resonance frequency (Hz)
 */
export function shiftedResonance(fs0, x, xmax, options = {}) {
    const kms0 = 1;  // Normalized
    const kms = kmsFromXmax(x, kms0, xmax, options);
    return fs0 * Math.sqrt(kms / kms0);
}

/**
 * Estimate suspension coefficients from Xmax and design philosophy
 *
 * @param {number} xmax - Rated Xmax (mm)
 * @param {string} type - 'soft', 'medium', 'hard' suspension
 * @returns {Object} {c2, c4} coefficients
 */
export function estimateCoefficients(xmax, type = 'medium') {
    // Stiffness ratio at Xmax for different designs
    const ratios = {
        soft: 1.5,    // Linear-ish, higher distortion at limit
        medium: 2.0,  // Balanced, typical
        hard: 3.0     // Very progressive, protective but higher THD
    };

    const ratio = ratios[type];
    if (ratio === undefined) {
        throw new Error(`Unknown suspension type '${type}'. Valid: ${Object.keys(ratios).join(', ')}`);
    }
    const c2 = (ratio - 1) / (xmax * xmax);

    return { c2, c4: 0 };
}
