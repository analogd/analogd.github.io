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

/**
 * Find excursion-limited power at given frequency
 *
 * Uses binary search to find power where displacement equals Xmax.
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
    const { xmax, frequency, thermalLimit = 1000, boxType } = params;

    // Binary search bounds
    let lowPower = 0.1;  // Start at 0.1W
    let highPower = thermalLimit;

    // Check if thermal limit already exceeds excursion
    const displacementAtThermal = Displacement.calculateDisplacementFromPower({
        ...params,
        power: thermalLimit
    });

    if (displacementAtThermal <= xmax) {
        // Thermal limited - excursion is fine even at max power
        return thermalLimit;
    }

    // Binary search for power where displacement = Xmax
    const tolerance = 0.1;  // 0.1mm tolerance
    const maxIterations = 30;

    for (let i = 0; i < maxIterations; i++) {
        const testPower = (lowPower + highPower) / 2;

        const displacement = Displacement.calculateDisplacementFromPower({
            ...params,
            power: testPower
        });

        const error = Math.abs(displacement - xmax);

        if (error < tolerance / 1000) {  // Convert mm to m
            return testPower;
        }

        if (displacement > xmax) {
            highPower = testPower;
        } else {
            lowPower = testPower;
        }
    }

    // Return conservative estimate if didn't converge
    return lowPower;
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
