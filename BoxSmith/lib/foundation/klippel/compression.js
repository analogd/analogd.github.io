/**
 * Nonlinear Compression Prediction
 *
 * 📄 PAPER-CLOSE LAYER
 * Reference: Klippel 2006 "Loudspeaker Nonlinearities – Causes, Parameters, Symptoms"
 *
 * At high excursions, real drivers produce LESS output than small-signal
 * models predict. This "compression" has three main causes:
 *
 * 1. BL COMPRESSION (dominant)
 *    - Bl decreases as coil leaves gap
 *    - Less driving force = less SPL
 *    - Can cause 3-6 dB loss at Xmax
 *
 * 2. THERMAL COMPRESSION
 *    - Voice coil heats up
 *    - Re increases with temperature
 *    - Less current = less SPL
 *    - Can cause 1-3 dB loss at high power
 *
 * 3. SUSPENSION STIFFENING (minor for SPL)
 *    - Mainly causes distortion
 *    - Slight resonance shift
 *    - Usually < 1 dB effect on SPL
 *
 * This module provides functions to estimate total compression
 * for planning purposes when full Klippel data is not available.
 */

import { blCompressionDb } from './motor-geometry.js';

/**
 * Calculate total SPL compression from nonlinear effects
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Rated Xmax (mm)
 * @param {Object} [options] - Modeling options
 * @param {number} [options.plateauFraction=0.6] - Bl plateau as fraction of Xmax
 * @param {number} [options.blAtXmax=0.7] - Bl/Bl0 ratio at Xmax
 * @returns {Object} {total, bl, thermal, notes}
 */
export function estimateCompression(xPeak, xmax, options = {}) {
    const {
        plateauFraction = 0.6,
        blAtXmax = 0.7
    } = options;

    // Bl compression (dominant effect)
    const blCompression = blCompressionDb(xPeak, xmax, { plateauFraction, blAtXmax });

    // Thermal compression not included here (needs power/time info)
    // Could add later with thermal model

    const total = blCompression;

    const notes = [];
    if (xPeak > xmax * 0.8) {
        notes.push('Approaching Xmax - significant nonlinearity expected');
    }
    if (xPeak > xmax) {
        notes.push('Exceeding Xmax - heavy compression, high distortion');
    }

    return {
        total,
        bl: blCompression,
        thermal: 0,  // Not modeled yet
        notes
    };
}

/**
 * Calculate thermal compression from voice coil heating
 *
 * Voice coil resistance increases with temperature:
 * Re(T) = Re(25°C) × [1 + α × (T - 25)]
 *
 * Where α ≈ 0.004 for copper (0.4% per °C)
 *
 * Higher Re = less current for same voltage = less SPL
 * SPL_loss = 20 × log10(Re_cold / Re_hot)
 *
 * @param {number} tempRise - Voice coil temperature rise above ambient (°C)
 * @returns {number} SPL compression in dB (negative)
 */
export function thermalCompressionDb(tempRise) {
    if (tempRise <= 0) return 0;

    const alpha = 0.004;  // Copper temperature coefficient
    const resistanceRatio = 1 + alpha * tempRise;

    // Current ratio = 1/resistanceRatio (for constant voltage)
    // SPL ∝ current, so SPL ratio = 1/resistanceRatio
    return 20 * Math.log10(1 / resistanceRatio);
}

/**
 * Estimate voice coil temperature rise from power and thermal resistance
 *
 * Simple steady-state thermal model:
 * T_rise = P × R_th
 *
 * Typical R_th for subwoofers: 1-3 °C/W
 *
 * @param {number} power - Input power (W)
 * @param {number} thermalResistance - Voice coil to ambient (°C/W)
 * @returns {number} Temperature rise (°C)
 */
export function estimateTempRise(power, thermalResistance = 1.5) {
    return power * thermalResistance;
}

/**
 * Combined compression estimate with thermal effects
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Rated Xmax (mm)
 * @param {number} power - Input power (W)
 * @param {Object} [options] - Options
 * @param {number} [options.thermalResistance=1.5] - R_th in °C/W
 * @returns {Object} {total, bl, thermal, tempRise}
 */
export function totalCompression(xPeak, xmax, power, options = {}) {
    const { thermalResistance = 1.5, ...blOptions } = options;

    const blResult = estimateCompression(xPeak, xmax, blOptions);

    const tempRise = estimateTempRise(power, thermalResistance);
    const thermal = thermalCompressionDb(tempRise);

    return {
        total: blResult.bl + thermal,
        bl: blResult.bl,
        thermal,
        tempRise,
        notes: blResult.notes
    };
}

/**
 * Apply compression correction to linear SPL prediction
 *
 * @param {number} splLinear - SPL from small-signal model (dB)
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Rated Xmax (mm)
 * @param {Object} [options] - Compression model options
 * @returns {number} Corrected SPL (dB)
 */
export function applySplCompression(splLinear, xPeak, xmax, options = {}) {
    const { total } = estimateCompression(xPeak, xmax, options);
    return splLinear + total;  // total is negative (compression)
}

/**
 * Generate compression curve for plotting
 *
 * Shows how much SPL is lost as excursion increases.
 *
 * @param {number} xmax - Rated Xmax (mm)
 * @param {Object} [options] - Model options
 * @returns {Array<Object>} [{xRatio, compressionDb}] where xRatio = x/Xmax
 */
export function compressionCurve(xmax, options = {}) {
    const points = [];
    const steps = 20;

    for (let i = 0; i <= steps; i++) {
        const xRatio = i / steps * 1.2;  // 0 to 120% of Xmax
        const xPeak = xRatio * xmax;
        const { total } = estimateCompression(xPeak, xmax, options);

        points.push({
            xRatio,
            xPeak,
            compressionDb: total
        });
    }

    return points;
}

/**
 * Estimate how much extra power is needed to overcome compression
 *
 * If compression costs X dB, you need 10^(X/10) times more power
 * to achieve the same SPL as the linear model predicts.
 *
 * @param {number} compressionDb - Compression in dB (negative)
 * @returns {number} Power multiplier needed
 */
export function powerMultiplierForCompression(compressionDb) {
    if (compressionDb >= 0) return 1;
    return Math.pow(10, -compressionDb / 10);
}

/**
 * Summary: What users need to know about compression
 *
 * @param {number} xmax - Rated Xmax (mm)
 * @returns {Object} Human-readable summary
 */
export function compressionSummary(xmax) {
    const at50pct = estimateCompression(xmax * 0.5, xmax).total;
    const at80pct = estimateCompression(xmax * 0.8, xmax).total;
    const at100pct = estimateCompression(xmax * 1.0, xmax).total;
    const at120pct = estimateCompression(xmax * 1.2, xmax).total;

    return {
        xmax,
        compression: {
            at50pct: Math.round(at50pct * 10) / 10,
            at80pct: Math.round(at80pct * 10) / 10,
            at100pct: Math.round(at100pct * 10) / 10,
            at120pct: Math.round(at120pct * 10) / 10
        },
        interpretation: {
            at50pct: 'Minimal compression - linear model accurate',
            at80pct: 'Moderate compression - expect some SPL loss',
            at100pct: 'Significant compression - plan for reduced output',
            at120pct: 'Heavy compression - hard limiting, high distortion'
        }
    };
}
