/**
 * Harmonic Distortion Estimation
 *
 * 📄 PAPER-CLOSE LAYER
 * Reference: Klippel 2006 "Loudspeaker Nonlinearities – Causes, Parameters, Symptoms"
 *
 * Predicts harmonic distortion from Bl(x) and Kms(x) nonlinearity.
 *
 * Physics:
 * - Symmetric Bl(x) rolloff → odd harmonics (HD3, HD5)
 * - Symmetric Kms(x) stiffening → odd harmonics
 * - Asymmetry in either → even harmonics (HD2, HD4)
 *
 * Our models assume symmetric nonlinearity, so we primarily estimate HD3.
 * Real drivers have some asymmetry; HD2 is typically 30-70% of HD3.
 *
 * WARNING: These are planning approximations based on empirical models.
 * Real distortion depends on motor geometry, suspension design, and other
 * factors not captured here. Use measured Klippel data for precision.
 */

import { blFromXmax } from './motor-geometry.js';
import { kmsFromXmax } from './suspension.js';

/**
 * Estimate HD3 contribution from Bl(x) nonlinearity
 *
 * Klippel's approximation for symmetric Bl rolloff:
 * HD3_Bl ≈ (Bl₀ - Bl(x_peak)) / (4 × Bl₀)
 *
 * This arises because Bl drop at peaks reduces force during the voltage peaks
 * of a sinusoidal drive, creating odd-order harmonics.
 *
 * Source: Klippel 2006, derived from perturbation analysis
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Driver Xmax (mm)
 * @param {Object} [options] - Options for Bl model
 * @returns {number} HD3 contribution as ratio (0-1)
 */
export function estimateHD3FromBl(xPeak, xmax, options = {}) {
    if (xPeak <= 0 || xmax <= 0) return 0;

    const bl0 = 1;  // Normalized
    const blAtPeak = blFromXmax(xPeak, bl0, xmax, options);
    const blDrop = (bl0 - blAtPeak) / bl0;

    // HD3 ≈ Bl_drop / 4 (Klippel approximation for symmetric rolloff)
    return blDrop / 4;
}

/**
 * Estimate HD3 contribution from Kms(x) nonlinearity
 *
 * Klippel's approximation for symmetric suspension stiffening:
 * HD3_Kms ≈ (Kms(x_peak) - Kms₀) / (4 × Kms₀)
 *
 * Progressive stiffening creates restoring force that's stronger at peaks,
 * generating odd-order harmonics.
 *
 * Source: Klippel 2006, derived from perturbation analysis
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Driver Xmax (mm)
 * @param {Object} [options] - Options for Kms model
 * @returns {number} HD3 contribution as ratio (0-1)
 */
export function estimateHD3FromKms(xPeak, xmax, options = {}) {
    if (xPeak <= 0 || xmax <= 0) return 0;

    const kms0 = 1;  // Normalized
    const kmsAtPeak = kmsFromXmax(xPeak, kms0, xmax, options);
    const kmsIncrease = (kmsAtPeak - kms0) / kms0;

    // HD3 ≈ Kms_increase / 4 (Klippel approximation)
    return kmsIncrease / 4;
}

/**
 * Estimate total HD3 from combined Bl(x) and Kms(x) effects
 *
 * The two sources are combined using RMS (assumes uncorrelated phases).
 * In reality they can partially cancel or reinforce depending on frequency.
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Driver Xmax (mm)
 * @param {Object} [options] - Options for models
 * @returns {number} Total HD3 as ratio (0-1)
 */
export function estimateHD3(xPeak, xmax, options = {}) {
    const hd3Bl = estimateHD3FromBl(xPeak, xmax, options);
    const hd3Kms = estimateHD3FromKms(xPeak, xmax, options);

    // RMS combination (geometric mean of powers)
    return Math.sqrt(hd3Bl * hd3Bl + hd3Kms * hd3Kms);
}

/**
 * Estimate HD2 from asymmetry
 *
 * Our models assume symmetric Bl(x) and Kms(x), so HD2 would be ~0.
 * Real drivers have asymmetry from:
 * - Voice coil offset (not centered at rest)
 * - Asymmetric suspension (different push/pull stiffness)
 * - Magnetic field asymmetry
 *
 * For planning, we use a typical ratio: HD2 ≈ 0.5 × HD3
 * This is a rough empirical average from published Klippel measurements.
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Driver Xmax (mm)
 * @param {Object} [options] - Options
 * @param {number} [options.asymmetryFactor=0.5] - HD2/HD3 ratio (0 = perfect symmetry)
 * @returns {number} HD2 estimate as ratio (0-1)
 */
export function estimateHD2(xPeak, xmax, options = {}) {
    const { asymmetryFactor = 0.5 } = options;

    const hd3 = estimateHD3(xPeak, xmax, options);
    return hd3 * asymmetryFactor;
}

/**
 * Estimate total harmonic distortion (THD)
 *
 * THD = sqrt(HD2² + HD3² + HD4² + HD5² + ...)
 *
 * For most drivers, HD2 and HD3 dominate. Higher orders are typically
 * much smaller (HD5 < 0.2 × HD3, etc.).
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Driver Xmax (mm)
 * @param {Object} [options] - Options
 * @returns {number} THD as ratio (0-1)
 */
export function estimateTHD(xPeak, xmax, options = {}) {
    const hd2 = estimateHD2(xPeak, xmax, options);
    const hd3 = estimateHD3(xPeak, xmax, options);
    // HD4, HD5 are typically much smaller - ignore for planning

    return Math.sqrt(hd2 * hd2 + hd3 * hd3);
}

/**
 * Get distortion breakdown at a given excursion
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Driver Xmax (mm)
 * @param {Object} [options] - Options
 * @returns {Object} {hd2, hd3, thd} as percentages (0-100)
 */
export function distortionAtExcursion(xPeak, xmax, options = {}) {
    const hd2 = estimateHD2(xPeak, xmax, options);
    const hd3 = estimateHD3(xPeak, xmax, options);
    const thd = Math.sqrt(hd2 * hd2 + hd3 * hd3);

    return {
        hd2: hd2 * 100,
        hd3: hd3 * 100,
        thd: thd * 100,
        hd3_bl: estimateHD3FromBl(xPeak, xmax, options) * 100,
        hd3_kms: estimateHD3FromKms(xPeak, xmax, options) * 100
    };
}

/**
 * Distortion severity classification
 *
 * Based on typical audibility thresholds for low frequency content:
 * - < 1%: Inaudible to most listeners
 * - 1-3%: Audible to trained listeners, acceptable for most use
 * - 3-10%: Clearly audible, "working hard" sound
 * - > 10%: Objectionable, mechanical stress sound
 *
 * Note: LF distortion is less audible than HF distortion due to
 * psychoacoustic masking. These thresholds are conservative.
 *
 * @param {number} thdPercent - THD in percent
 * @returns {string} 'low' | 'moderate' | 'high' | 'severe'
 */
export function classifyDistortion(thdPercent) {
    if (thdPercent < 1) return 'low';
    if (thdPercent < 3) return 'moderate';
    if (thdPercent < 10) return 'high';
    return 'severe';
}

/**
 * Reference thresholds for graphing
 */
export const DISTORTION_THRESHOLDS = {
    low: 1,       // Below this: generally inaudible
    moderate: 3,  // Below this: acceptable for most applications
    high: 10,     // Below this: audible but tolerable
    severe: 10    // Above this: objectionable
};
