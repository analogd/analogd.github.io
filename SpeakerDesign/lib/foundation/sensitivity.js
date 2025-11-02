// Sensitivity Analysis for Thiele-Small Systems
// Derived from Small 1972/1973 equations using numerical differentiation
//
// This module calculates parameter sensitivities ("what-if" analysis):
// - How much does F3 change if I change box volume?
// - How much does F3 change if I change tuning?
// - How much does F3 change if I change enclosure losses?
//
// These are NOT in the original papers but are derived using calculus
// (numerical derivatives) on the paper equations.

import { calculatePortedF3 } from './small-1973.js';

/**
 * Calculate sensitivity of F3 to box volume change
 *
 * Formula: ∂f3/∂Vb (numerical derivative using central difference)
 *
 * This tells you how much F3 changes per m³ of box volume change.
 * Useful for optimization and understanding volume tradeoffs.
 *
 * Example: If sensitivity = -50 Hz/m³, then increasing box by 0.01m³ (10L) lowers F3 by 0.5Hz.
 *
 * Source: Derived from Small 1973 response equations (numerical derivative)
 *
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} vas - Driver equivalent volume (m³)
 * @param {number} vb - Box volume (m³)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} qt - Total driver Q
 * @param {number} ql - Enclosure Q (default: Infinity)
 * @returns {number} Sensitivity ∂f3/∂Vb (Hz/m³)
 */
export function calculateF3SensitivityToVolume(fs, vas, vb, fb, qt, ql = Infinity) {
    // Use 1% volume change for numerical derivative
    const deltaVb = vb * 0.01;

    const alpha1 = vas / (vb - deltaVb);
    const f3_minus = calculatePortedF3(fs, fb, alpha1, qt, ql);

    const alpha2 = vas / (vb + deltaVb);
    const f3_plus = calculatePortedF3(fs, fb, alpha2, qt, ql);

    // Central difference: df/dx ≈ (f(x+h) - f(x-h)) / (2h)
    return (f3_plus - f3_minus) / (2 * deltaVb);
}

/**
 * Calculate sensitivity of F3 to tuning frequency change
 *
 * Formula: ∂f3/∂fb (numerical derivative)
 *
 * This tells you how much F3 changes per Hz of tuning change.
 * Useful for port length optimization.
 *
 * Source: Derived from Small 1973 response equations (numerical derivative)
 *
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @param {number} qt - Total driver Q
 * @param {number} ql - Enclosure Q (default: Infinity)
 * @returns {number} Sensitivity ∂f3/∂fb (Hz/Hz, dimensionless)
 */
export function calculateF3SensitivityToTuning(fs, fb, alpha, qt, ql = Infinity) {
    const deltaFb = fb * 0.01;

    const f3_minus = calculatePortedF3(fs, fb - deltaFb, alpha, qt, ql);
    const f3_plus = calculatePortedF3(fs, fb + deltaFb, alpha, qt, ql);

    return (f3_plus - f3_minus) / (2 * deltaFb);
}

/**
 * Calculate sensitivity of F3 to enclosure loss change
 *
 * Formula: ∂f3/∂QL (numerical derivative)
 *
 * This tells you how much F3 changes with enclosure loss factor.
 * Useful for damping material optimization.
 *
 * Negative sensitivity means: lower QL (more loss) → higher F3
 *
 * Source: Derived from Small 1973 response equations (numerical derivative)
 *
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @param {number} qt - Total driver Q
 * @param {number} ql - Enclosure Q
 * @returns {number} Sensitivity ∂f3/∂QL (Hz per Q unit)
 */
export function calculateF3SensitivityToLoss(fs, fb, alpha, qt, ql) {
    // Use 10% QL change for numerical derivative
    const deltaQL = ql * 0.1;

    const f3_minus = calculatePortedF3(fs, fb, alpha, qt, ql - deltaQL);
    const f3_plus = calculatePortedF3(fs, fb, alpha, qt, ql + deltaQL);

    return (f3_plus - f3_minus) / (2 * deltaQL);
}

/**
 * Calculate all sensitivities for a ported box design
 *
 * Returns sensitivity of F3 to all major parameters.
 * Useful for understanding which parameters matter most for optimization.
 *
 * Source: Derived from Small 1973 response equations (numerical derivatives)
 *
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} vas - Driver equivalent volume (m³)
 * @param {number} vb - Box volume (m³)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} qt - Total driver Q
 * @param {number} ql - Enclosure Q (default: Infinity)
 * @returns {object} Sensitivities {toVolume, toTuning, toLoss} (all in Hz per unit)
 */
export function calculateAllSensitivities(fs, vas, vb, fb, qt, ql = Infinity) {
    const alpha = vas / vb;

    return {
        toVolume: calculateF3SensitivityToVolume(fs, vas, vb, fb, qt, ql),
        toTuning: calculateF3SensitivityToTuning(fs, fb, alpha, qt, ql),
        toLoss: ql === Infinity ? 0 : calculateF3SensitivityToLoss(fs, fb, alpha, qt, ql)
    };
}
