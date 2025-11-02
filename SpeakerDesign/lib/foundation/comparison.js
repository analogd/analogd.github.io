// Configuration Comparison for Sealed vs Ported Systems
// Derived from Small 1972 (sealed) + Small 1973 (ported)
//
// This module helps users decide between sealed and ported designs
// by calculating side-by-side performance metrics.
//
// NOT in the original papers - derived comparison tool.

import { SPEED_OF_SOUND } from './constants.js';
import { calculatePortedF3 } from './small-1973.js';

/**
 * Analyze sealed box performance metrics
 *
 * Returns complete analysis for sealed box configuration.
 * Uses Small 1972 equations.
 *
 * @param {object} driver - Driver parameters {fs, qts, vas, qes}
 * @param {number} vb - Box volume (m³)
 * @returns {object} Sealed metrics {fc, qtc, f3, efficiency, rolloff}
 */
export function analyzeSealed(driver, vb) {
    const { fs, qts, vas, qes } = driver;

    // Small 1972 equations
    const alpha = vas / vb;
    const fc = fs * Math.sqrt(1 + alpha);
    const qtc = qts * Math.sqrt(1 + alpha);

    // F3 calculation
    const term = 1 - 1 / (2 * qtc * qtc);
    const sqrt = Math.sqrt(term * term + 1);
    const f3 = fc / Math.sqrt(term + sqrt);

    // Efficiency (simplified)
    const c = SPEED_OF_SOUND;
    const eta0 = qes ? (4 * Math.PI * Math.PI / (c * c * c)) * (fs * fs * fs * vas / qes) : null;

    return {
        type: 'sealed',
        fc,
        qtc,
        f3,
        eta0,
        rolloff: '12 dB/octave'
    };
}

/**
 * Analyze ported box performance metrics
 *
 * Returns complete analysis for ported box configuration.
 * Uses Small 1973 equations.
 *
 * @param {object} driver - Driver parameters {fs, qts, vas, qes}
 * @param {number} vb - Box volume (m³)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} ql - Enclosure Q (default: Infinity)
 * @returns {object} Ported metrics {fb, alpha, h, f3, efficiency, rolloff}
 */
export function analyzeVented(driver, vb, fb, ql = Infinity) {
    const { fs, qts, vas, qes } = driver;

    const alpha = vas / vb;
    const h = fb / fs;
    const f3 = calculatePortedF3(fs, fb, alpha, qts, ql);

    // Efficiency (simplified - ported can be higher than sealed)
    const c = SPEED_OF_SOUND;
    const eta0 = qes ? (4 * Math.PI * Math.PI / (c * c * c)) * (fs * fs * fs * vas / qes) * Math.sqrt(alpha) : null;

    return {
        type: 'ported',
        fb,
        alpha,
        h,
        f3,
        eta0,
        rolloff: '24 dB/octave'
    };
}

/**
 * Compare sealed vs ported configurations side-by-side
 *
 * Analyzes both configurations and highlights key differences.
 * Helps users make informed design decisions.
 *
 * @param {object} driver - Driver parameters {fs, qts, vas, qes}
 * @param {number} sealedVb - Sealed box volume (m³)
 * @param {number} portedVb - Ported box volume (m³)
 * @param {number} portedFb - Ported box tuning (Hz)
 * @param {number} ql - Enclosure Q for ported (default: Infinity)
 * @returns {object} Comparison {sealed, ported, differences}
 */
export function compareConfigurations(driver, sealedVb, portedVb, portedFb, ql = Infinity) {
    const sealed = analyzeSealed(driver, sealedVb);
    const ported = analyzeVented(driver, portedVb, portedFb, ql);

    const f3Delta = ported.f3 - sealed.f3;
    const efficiencyDelta = (sealed.eta0 && ported.eta0) ?
        10 * Math.log10(ported.eta0 / sealed.eta0) : null;

    return {
        sealed,
        ported,
        differences: {
            f3Delta,              // Hz (negative = ported goes lower)
            f3DeltaPercent: (f3Delta / sealed.f3) * 100,
            efficiencyDeltaDb: efficiencyDelta,  // dB (ported usually higher)
            volumeDelta: portedVb - sealedVb,    // m³
            rolloffDelta: '12 dB/oct steeper for ported'
        }
    };
}
