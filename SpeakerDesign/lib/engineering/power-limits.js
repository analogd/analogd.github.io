/**
 * Power Limiting Calculations - Paper-Close Approximations
 *
 * 📄 PAPER-CLOSE LAYER
 *
 * Calculates maximum safe power handling considering:
 * - Excursion limits (X ≤ Xmax)
 * - Thermal limits (P ≤ Pe)
 *
 * Uses displacement functions from engineering/displacement.js
 * which are paper-close approximations of Small 1972/1973 networks.
 */

import * as Displacement from './displacement.js';
import * as Small1972 from '../foundation/small-1972.js';
import * as Small1973 from '../foundation/small-1973.js';

/**
 * Calculate power required to achieve target displacement
 *
 * ANALYTICAL SOLUTION - no binary search needed
 *
 * From displacement formula: X = (Bl × I) / (ω × |Zmech|)
 * Where I = Vin / Ztotal, Vin = sqrt(P × Re), Ztotal ≈ Re + Bl²/|Zmech|
 *
 * Solving for P:
 * X × ω × |Zmech| = Bl × sqrt(P × Re) / (Re + Bl²/|Zmech|)
 *
 * Let Z_refl = Bl²/|Zmech|
 * X × ω × |Zmech| × (Re + Z_refl) = Bl × sqrt(P × Re)
 *
 * Square both sides and solve for P:
 * P = [X × ω × |Zmech| × (Re + Z_refl)]² / (Bl² × Re)
 */
function calculatePowerForDisplacement(params) {
    const { xmax, frequency, re, bl, mms, cms, rms, alpha, boxType, fb, ql, fs, qts } = params;

    const omega = 2 * Math.PI * frequency;

    // Calculate sealed box power first
    const zmech_real = rms || 0.1;
    const zmech_imag = omega * mms - 1 / (omega * cms * (1 + alpha));
    const zmech_mag = Math.sqrt(zmech_real * zmech_real + zmech_imag * zmech_imag);
    const z_reflected = (bl * bl) / zmech_mag;
    const ztotal = re + z_reflected;

    // Target force for Xmax
    const force = xmax * omega * zmech_mag;
    const current = force / bl;
    const voltage = current * ztotal;
    const power_sealed = (voltage * voltage) / re;

    if (boxType === 'sealed') {
        return power_sealed;
    }

    // For ported: The displacement relationship is X_ported = X_sealed × correction
    // where correction = (h_sealed / h_ported)^0.8
    //
    // To find power for target Xmax:
    // 1. Calculate what sealed displacement would give Xmax after correction
    // 2. Find power for that sealed displacement
    // 3. That's the ported power
    //
    // X_sealed_target = Xmax / correction
    // Since P ∝ X², we have: P_ported = P_sealed / correction²

    const h_ported = Small1973.calculatePortedResponseMagnitude(
        frequency, fs, fb, alpha, qts, ql || Infinity
    );
    const fc_sealed = Small1972.calculateFc(fs, alpha);
    const qtc_sealed = Small1972.calculateQtc(qts, alpha);
    const h_sealed = Small1972.calculateResponseMagnitude(frequency, fc_sealed, qtc_sealed);

    const h_ported_safe = Math.max(h_ported, 0.001);
    const correction = Math.pow(h_sealed / h_ported_safe, 0.8);
    const power_factor = correction * correction;  // P ∝ X²

    return power_sealed / power_factor;
}

/**
 * Find excursion-limited power at given frequency
 *
 * DEPRECATED - use calculatePowerForDisplacement() for analytical solution
 * Kept for backward compatibility
 *
 * @param {Object} params - Driver and box parameters
 * @param {string} params.boxType - 'sealed' or 'ported'
 * @param {number} params.xmax - Maximum linear excursion (m)
 * @param {number} params.frequency - Frequency (Hz)
 * @param {number} params.thermalLimit - Maximum thermal power (W) for search bound
 * @param {...} params.* - Other parameters needed by displacement functions
 * @returns {number} Maximum power before exceeding Xmax (W)
 */
export function findExcursionLimitedPower(params) {
    const { boxType } = params;

    if (boxType === 'sealed') {
        // Use analytical solution for sealed - perfect, no search needed
        return calculatePowerForDisplacement(params);
    }

    // TODO: DOING STUPID SHIT HERE - binary search for ported instead of analytical solution
    //
    // The RIGHT way: Derive closed-form inverse of Small 1973 coupled resonator equations
    // The WRONG way (current): Binary search with tight tolerance to fake smoothness
    //
    // Why stupid: We have analytical displacement→power for sealed, should derive same for ported
    // Problem: Ported displacement involves coupled cone+port system, no simple inverse exists
    //
    // To fix properly:
    // 1. Study Small 1973 Part I Section 2 equivalent circuit (Figure 2)
    // 2. Derive analytical relationship between electrical power and cone displacement
    // 3. Invert it algebraically for P(X, f)
    //
    // For now: Using binary search with 0.01W tolerance, 100 iterations
    // This works but is slow and philosophically wrong
    return findExcursionLimitedPowerBinarySearch(params);
}

function findExcursionLimitedPowerBinarySearch(params) {
    const { xmax, pe = 1000 } = params;

    let lowPower = 0.1;
    let highPower = pe;

    // Tighter convergence for smooth curves
    const toleranceMeters = 0.00005;  // 0.05mm
    const maxIterations = 100;

    for (let i = 0; i < maxIterations; i++) {
        const testPower = (lowPower + highPower) / 2;

        // Converge when power range is tight
        if (highPower - lowPower < 0.01) {
            return testPower;
        }

        const displacement = Displacement.calculateDisplacementFromPower({
            ...params,
            power: testPower
        });

        const error = Math.abs(displacement - xmax);

        if (error < toleranceMeters) {
            return testPower;
        }

        if (displacement > xmax) {
            highPower = testPower;
        } else {
            lowPower = testPower;
        }
    }

    return (lowPower + highPower) / 2;
}

/**
 * Calculate maximum power at specific frequency
 *
 * Returns limiting factor (excursion or thermal) and safe power.
 *
 * @param {Object} params - Driver and box parameters
 * @param {string} params.boxType - 'sealed' or 'ported'
 * @param {number} params.xmax - Maximum linear excursion (m)
 * @param {number} params.pe - Thermal power limit (W)
 * @param {number} params.frequency - Frequency (Hz)
 * @param {...} params.* - Other parameters for displacement calculation
 * @returns {Object} {maxPower, limitingFactor, excursion, thermal}
 */
export function calculateMaxPowerAtFrequency(params) {
    const { xmax, pe, frequency } = params;

    // Check excursion at thermal power
    const excursionAtThermal = Displacement.calculateDisplacementFromPower({
        ...params,
        power: pe
    });

    if (excursionAtThermal <= xmax) {
        // Thermal limited - can run full power
        return {
            maxPower: pe,
            limitingFactor: 'thermal',
            excursion: excursionAtThermal,
            thermal: pe
        };
    }

    // Excursion limited - find safe power
    const maxPower = findExcursionLimitedPower(params);

    return {
        maxPower: maxPower,
        limitingFactor: 'excursion',
        excursion: xmax,
        thermal: pe
    };
}

/**
 * Generate maximum power curve across frequency range
 *
 * @param {Object} params - Driver and box parameters
 * @param {Array<number>} frequencies - Frequencies to evaluate (Hz)
 * @returns {Array<Object>} [{frequency, maxPower, limitingFactor, excursion}]
 */
export function generateMaxPowerCurve(params, frequencies = null) {
    if (!frequencies) {
        // Default: log-spaced from 10Hz to 200Hz
        frequencies = [10, 12, 15, 18, 20, 25, 30, 35, 40, 50, 60, 80, 100, 120, 150, 200];
    }

    return frequencies.map(frequency => {
        const result = calculateMaxPowerAtFrequency({
            ...params,
            frequency
        });

        return {
            frequency,
            maxPower: result.maxPower,
            limitingFactor: result.limitingFactor,
            excursion: Displacement.displacementToMm(result.excursion)  // Convert to mm
        };
    });
}

/**
 * Check if given power is safe at frequency
 *
 * @param {Object} params - Driver and box parameters
 * @param {number} power - Power to check (W)
 * @returns {boolean} True if safe
 */
export function isPowerSafe(params, power) {
    const result = calculateMaxPowerAtFrequency(params);
    return power <= result.maxPower;
}

/**
 * Get warnings for power level across frequency range
 *
 * @param {Object} params - Driver and box parameters
 * @param {number} power - Power to check (W)
 * @param {Array<number>} testFrequencies - Frequencies to check
 * @returns {Array<Object>} Warning objects
 */
export function getPowerWarnings(params, power, testFrequencies = null) {
    if (!testFrequencies) {
        testFrequencies = [10, 15, 20, 25, 30, 40, 50, 80];
    }

    const warnings = [];

    for (const frequency of testFrequencies) {
        const result = calculateMaxPowerAtFrequency({
            ...params,
            frequency
        });

        const margin = 1.1;  // 10% safety margin
        if (power > result.maxPower * margin) {
            warnings.push({
                frequency,
                maxSafe: result.maxPower,
                requested: power,
                limitingFactor: result.limitingFactor,
                severity: power > result.maxPower * 1.5 ? 'critical' : 'warning',
                message: `${power}W exceeds ${result.limitingFactor} limit (${Math.round(result.maxPower)}W) at ${frequency}Hz`
            });
        }
    }

    return warnings;
}
