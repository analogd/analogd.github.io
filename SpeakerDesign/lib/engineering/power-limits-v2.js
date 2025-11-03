/**
 * Power Limiting Calculations - Function-First API
 *
 * 📐 FORMULA-FIRST ARCHITECTURE
 *
 * Returns FUNCTIONS not ARRAYS:
 * - Backend thinks: f → maxPower(f)
 * - Tests validate: maxPower(20) === 450
 * - UI samples: frequencies.map(maxPower)
 * - WinISD verifies at THEIR frequencies (no interpolation)
 *
 * Design Philosophy:
 * Small 1972/1973 describe continuous functions. Our API should reflect this.
 * Arrays are sampling artifacts, not mathematical truth.
 *
 * See: DESIGN_PHILOSOPHY.md
 */

import * as Displacement from './displacement.js';
import * as Small1972 from '../foundation/small-1972.js';
import * as Small1973 from '../foundation/small-1973.js';

/**
 * Create displacement function for driver+box configuration
 *
 * Returns: (frequency, power) => displacement (meters)
 *
 * This is the FORWARD calculation: Given f and P, what's the cone displacement?
 *
 * @param {Object} params - Driver and box parameters
 * @param {string} params.boxType - 'sealed' or 'ported'
 * @param {number} params.re - Voice coil resistance (Ω)
 * @param {number} params.bl - Force factor (N/A)
 * @param {number} params.mms - Moving mass (kg)
 * @param {number} params.cms - Compliance (m/N)
 * @param {number} params.rms - Mechanical resistance (kg/s)
 * @param {number} params.alpha - Compliance ratio Vas/Vb
 * @param {number} [params.fb] - Port tuning (Hz) - required for ported
 * @param {number} [params.fs] - Driver resonance (Hz) - required for ported
 * @param {number} [params.qts] - Total Q - required for ported
 * @param {number} [params.ql] - Port losses - optional for ported
 * @returns {Function} (frequency, power) => displacement
 *
 * @example
 * const displacementFn = createDisplacementFunction(params);
 * const x20Hz_100W = displacementFn(20, 100);  // meters
 * const x50Hz_500W = displacementFn(50, 500);  // meters
 */
export function createDisplacementFunction(params) {
    const { boxType } = params;

    // Validate box type
    if (boxType !== 'sealed' && boxType !== 'ported') {
        throw new Error(`Invalid box type: ${boxType}. Must be 'sealed' or 'ported'.`);
    }

    // Validate required parameters
    const required = ['re', 'bl', 'mms', 'cms', 'rms', 'alpha'];
    for (const key of required) {
        if (!params[key] || params[key] <= 0) {
            throw new Error(`Missing or invalid required parameter: ${key}`);
        }
    }

    if (boxType === 'ported') {
        const portedRequired = ['fb', 'fs', 'qts'];
        for (const key of portedRequired) {
            if (!params[key]) {
                throw new Error(`Ported box requires parameter: ${key}`);
            }
        }
    }

    // Return closure over params
    return (frequency, power) => {
        // Guard against invalid inputs
        if (frequency <= 0) throw new Error('Frequency must be positive');
        if (power < 0) throw new Error('Power cannot be negative');
        if (power === 0) return 0;

        // Delegate to appropriate calculation
        if (boxType === 'sealed') {
            return Displacement.calculateSealedDisplacementFromPower({
                ...params,
                frequency,
                power
            });
        } else {
            return Displacement.calculatePortedDisplacementFromPower({
                ...params,
                frequency,
                power
            });
        }
    };
}

/**
 * Solve for power that produces target displacement (INVERSE problem)
 *
 * Given: target displacement X, frequency f
 * Find: power P such that displacement(f, P) = X
 *
 * For sealed: Analytical solution (exact, fast)
 * For ported: Binary search (approximate, slower)
 *
 * @param {number} frequency - Frequency (Hz)
 * @param {number} targetDisplacement - Target displacement (meters)
 * @param {Function} displacementFn - Forward displacement function
 * @param {Object} params - Parameters (for bounds)
 * @returns {number} Power (W) that produces target displacement
 */
function solvePowerForDisplacement(frequency, targetDisplacement, displacementFn, params) {
    const { boxType, pe = 1000, re, bl, mms, cms, rms, alpha } = params;

    // For sealed: Use analytical solution (exact)
    if (boxType === 'sealed') {
        const omega = 2 * Math.PI * frequency;

        // Mechanical impedance with box loading
        const zmech_real = rms;
        const zmech_imag = omega * mms - 1 / (omega * cms * (1 + alpha));
        const zmech_mag = Math.sqrt(zmech_real * zmech_real + zmech_imag * zmech_imag);

        // Reflected impedance
        const z_reflected = (bl * bl) / zmech_mag;
        const ztotal = re + z_reflected;

        // From X = F / (ω × |Zmech|) and F = Bl × I, solve for power
        const force = targetDisplacement * omega * zmech_mag;
        const current = force / bl;
        const voltage = current * ztotal;
        const power = (voltage * voltage) / re;

        return power;
    }

    // For ported: Binary search (approximate)
    // TODO: Derive analytical solution from Small 1973 network equations
    let low = 0.1;
    let high = pe * 2;  // Allow searching beyond thermal limit
    const tolerance = 0.01;  // 0.01W tolerance
    const maxIterations = 50;

    for (let i = 0; i < maxIterations; i++) {
        if (high - low < tolerance) {
            return (low + high) / 2;
        }

        const mid = (low + high) / 2;
        const displacement = displacementFn(frequency, mid);

        if (Math.abs(displacement - targetDisplacement) < 0.00001) {  // 0.01mm
            return mid;
        }

        if (displacement > targetDisplacement) {
            high = mid;
        } else {
            low = mid;
        }
    }

    return (low + high) / 2;
}

/**
 * Create maximum power function for driver+box configuration
 *
 * Returns: (frequency) => {power, limiting, displacement}
 *
 * This is the PRIMARY API for power calculations.
 *
 * The function evaluates maximum safe power at ANY frequency:
 * - If displacement at Pe < Xmax → thermal limited → return Pe
 * - If displacement at Pe > Xmax → excursion limited → solve for power at Xmax
 *
 * @param {Object} params - Driver and box parameters
 * @param {string} params.boxType - 'sealed' or 'ported'
 * @param {number} params.xmax - Maximum linear excursion (meters)
 * @param {number} params.pe - Thermal power limit (W)
 * @param {...} params.* - Other parameters (see createDisplacementFunction)
 * @returns {Function} (frequency) => {power, limiting, displacement}
 *
 * @example
 * const maxPowerFn = createMaxPowerFunction(params);
 *
 * // Evaluate at specific frequencies
 * const at10Hz = maxPowerFn(10);  // {power: 400, limiting: 'excursion', displacement: 0.028}
 * const at50Hz = maxPowerFn(50);  // {power: 1200, limiting: 'thermal', displacement: 0.012}
 *
 * // Tests validate exact formulas
 * assert.closeTo(maxPowerFn(20).power, 450, 50);
 *
 * // UI samples at chosen resolution
 * const curve = logspace(10, 200, 100).map(maxPowerFn);
 *
 * // WinISD comparison uses THEIR frequencies (no interpolation)
 * const comparison = winisdFreqs.map(f => ({
 *     frequency: f,
 *     ours: maxPowerFn(f).power,
 *     winisd: winisdData[f]
 * }));
 */
export function createMaxPowerFunction(params) {
    const { xmax, pe, boxType } = params;

    // Validate
    if (!xmax || xmax <= 0) {
        throw new Error('xmax (maximum excursion) required and must be positive');
    }
    if (!pe || pe <= 0) {
        throw new Error('pe (thermal power limit) required and must be positive');
    }

    // Create displacement function (closure over params)
    const displacementFn = createDisplacementFunction(params);

    // Return max power function (closure over params + displacementFn)
    return (frequency) => {
        // Guard against invalid frequencies
        if (frequency <= 0) {
            throw new Error('Frequency must be positive');
        }
        if (frequency < 5) {
            // Warn but allow - model accuracy degrades below 5Hz
            console.warn(`Displacement model may be inaccurate below 5Hz (requested: ${frequency}Hz)`);
        }

        // Check displacement at thermal power limit
        let displacementAtPe;
        try {
            displacementAtPe = displacementFn(frequency, pe);
        } catch (err) {
            // If displacement calculation fails, assume thermal limited
            console.warn(`Displacement calculation failed at ${frequency}Hz: ${err.message}`);
            return {
                power: pe,
                limiting: 'thermal',
                displacement: null,
                error: err.message
            };
        }

        // Thermal limited: can run full power without exceeding Xmax
        if (displacementAtPe <= xmax) {
            return {
                power: pe,
                limiting: 'thermal',
                displacement: displacementAtPe
            };
        }

        // Excursion limited: find power that produces Xmax
        const excursionLimitedPower = solvePowerForDisplacement(
            frequency,
            xmax,
            displacementFn,
            params
        );

        return {
            power: excursionLimitedPower,
            limiting: 'excursion',
            displacement: xmax
        };
    };
}

/**
 * Sample a function at given frequencies
 *
 * Convenience wrapper for batch evaluation.
 *
 * @param {Function} fn - Function to sample (frequency) => result
 * @param {Array<number>} frequencies - Frequencies to evaluate
 * @returns {Array<Object>} [{frequency, ...result}]
 *
 * @example
 * const maxPowerFn = createMaxPowerFunction(params);
 * const curve = sampleFunction(maxPowerFn, [10, 20, 30, 40, 50]);
 * // [{frequency: 10, power: 400, limiting: 'excursion'}, ...]
 */
export function sampleFunction(fn, frequencies) {
    return frequencies.map(frequency => ({
        frequency,
        ...fn(frequency)
    }));
}

/**
 * Create logarithmically-spaced frequency array
 *
 * @param {number} start - Start frequency (Hz)
 * @param {number} end - End frequency (Hz)
 * @param {number} count - Number of points
 * @returns {Array<number>} Frequency array
 *
 * @example
 * const freqs = logspace(10, 200, 50);  // 50 points from 10-200Hz, log spacing
 */
export function logspace(start, end, count) {
    const logStart = Math.log10(start);
    const logEnd = Math.log10(end);
    const step = (logEnd - logStart) / (count - 1);

    return Array.from({ length: count }, (_, i) => {
        return Math.pow(10, logStart + i * step);
    });
}

/**
 * Create linearly-spaced frequency array
 *
 * @param {number} start - Start frequency (Hz)
 * @param {number} end - End frequency (Hz)
 * @param {number} count - Number of points
 * @returns {Array<number>} Frequency array
 */
export function linspace(start, end, count) {
    const step = (end - start) / (count - 1);
    return Array.from({ length: count }, (_, i) => start + i * step);
}

/**
 * Evaluate function at WinISD's frequencies for direct comparison
 *
 * @param {Function} fn - Max power function
 * @param {Array<number>} winisdFreqs - WinISD's frequency grid
 * @param {Object} winisdData - WinISD's measured values {freq: power}
 * @returns {Array<Object>} Comparison data
 *
 * @example
 * const maxPowerFn = createMaxPowerFunction(params);
 * const comparison = compareWithWinISD(
 *     maxPowerFn,
 *     [10, 15, 20, 25, 30, 35, 40, 45, 50],
 *     {10: 400, 15: 420, 20: 450, ...}
 * );
 * // [{freq: 10, ours: 531, winisd: 400, error: 131, errorPct: 33}, ...]
 */
export function compareWithWinISD(fn, winisdFreqs, winisdData) {
    return winisdFreqs.map(f => {
        const result = fn(f);
        const winisd = winisdData[f];
        const error = result.power - winisd;
        const errorPct = (error / winisd) * 100;

        return {
            frequency: f,
            ours: result.power,
            winisd: winisd,
            error: error,
            errorPct: errorPct,
            limiting: result.limiting,
            withinTolerance: Math.abs(errorPct) < 30  // 30% tolerance
        };
    });
}
