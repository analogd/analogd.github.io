/**
 * Foundation Utilities - Shared Math Helpers
 *
 * Pure utility functions with no domain knowledge.
 * Used by models and UI for common operations.
 */

/**
 * Generate logarithmically-spaced frequency array
 *
 * Used throughout the codebase for generating smooth curves
 * on log-frequency axes (standard for audio).
 *
 * @param {number} fMin - Minimum frequency (Hz)
 * @param {number} fMax - Maximum frequency (Hz)
 * @param {number} points - Number of points to generate
 * @returns {number[]} Array of frequencies
 *
 * @example
 * generateLogFrequencies(20, 200, 50)
 * // Returns 50 frequencies from 20Hz to 200Hz, log-spaced
 */
export function generateLogFrequencies(fMin = 10, fMax = 200, points = 50) {
    if (fMin <= 0) throw new Error('fMin must be positive');
    if (points < 1) throw new Error('points must be at least 1');

    // Single point case - just return that frequency
    if (points === 1) {
        return [fMin];
    }

    if (fMax <= fMin) throw new Error('fMax must be greater than fMin');

    const frequencies = [];
    const logMin = Math.log10(fMin);
    const logMax = Math.log10(fMax);
    const logStep = (logMax - logMin) / (points - 1);

    for (let i = 0; i < points; i++) {
        frequencies.push(Math.pow(10, logMin + i * logStep));
    }

    return frequencies;
}

/**
 * Generate logarithmically-spaced value array (generic version)
 *
 * Same as generateLogFrequencies but for any log-scale values
 * (e.g., volumes, impedances).
 *
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} points - Number of points to generate
 * @returns {number[]} Array of values
 */
export function generateLogScale(min, max, points) {
    if (min <= 0) throw new Error('min must be positive');
    if (points < 1) throw new Error('points must be at least 1');

    // Single point case - just return that value
    if (points === 1) {
        return [min];
    }

    if (max <= min) throw new Error('max must be greater than min');

    const values = [];
    const logMin = Math.log10(min);
    const logMax = Math.log10(max);
    const logStep = (logMax - logMin) / (points - 1);

    for (let i = 0; i < points; i++) {
        values.push(Math.pow(10, logMin + i * logStep));
    }

    return values;
}

/**
 * Generate time-domain response curve from a point evaluation function
 *
 * Common pattern for step/impulse response curve generation.
 * Takes a function that evaluates amplitude at a given time.
 *
 * @param {Function} responseAt - Function (time) => amplitude
 * @param {number} [tMax=0.1] - Maximum time in seconds
 * @param {number} [points=100] - Number of points
 * @returns {Array<{time: number, amplitude: number}>} Response data
 */
export function generateTimeCurve(responseAt, tMax = 0.1, points = 100) {
    if (typeof responseAt !== 'function') {
        throw new Error('responseAt must be a function');
    }
    if (tMax <= 0) throw new Error('tMax must be positive');
    if (points < 2) throw new Error('points must be at least 2');

    const data = [];
    const dt = tMax / (points - 1);

    for (let i = 0; i < points; i++) {
        const time = i * dt;
        data.push({ time, amplitude: responseAt(time) });
    }

    return data;
}
