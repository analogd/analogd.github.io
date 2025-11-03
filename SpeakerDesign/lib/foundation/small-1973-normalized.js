/**
 * Small 1973 - Normalized Transfer Function (ChatGPT/WinISD form)
 *
 * This is the "textbook" normalized form that WinISD uses.
 * Normalized to unity midband gain (0 dB in passband).
 *
 * Source: Small 1973 + ChatGPT normalization
 */

/**
 * Calculate ported box frequency response magnitude (normalized form)
 *
 * Normalized to unity midband gain, using frequency ratio u = f/Fb.
 *
 * Formula from ChatGPT:
 * |H(u)| = u⁴ / √[(u⁴ - u²(Fb/Fs)²(1+α) + (Fb/Fs)⁴·α/(α+1))² + (u³(Fb/Fs)³·1/(Qts'(α+1)))²]
 *
 * where:
 * - u = f/Fb (frequency normalized to tuning)
 * - Qts' = Qts·(Re + Rs)/Re (with series resistance, or just Qts if Rs=0)
 *
 * @param {number} f - Frequency (Hz)
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @param {number} qts - Total driver Q
 * @returns {number} Linear magnitude (normalized, 1.0 = 0dB in passband)
 */
export function calculatePortedResponseMagnitudeNormalized(f, fs, fb, alpha, qts) {
    // Frequency ratio u = f/Fb
    const u = f / fb;
    const u2 = u * u;
    const u3 = u2 * u;
    const u4 = u2 * u2;

    // Tuning ratio
    const h = fb / fs;  // Fb/Fs
    const h2 = h * h;
    const h3 = h2 * h;
    const h4 = h2 * h2;

    // Real part of denominator: u⁴ - u²(Fb/Fs)²(1+α) + (Fb/Fs)⁴·α/(α+1)
    const real_denom = u4 - u2 * h2 * (1 + alpha) + h4 * alpha / (alpha + 1);

    // Imaginary part of denominator: u³(Fb/Fs)³·1/(Qts'(α+1))
    // Assuming no series resistance, Qts' = Qts
    const imag_denom = u3 * h3 * (1 / (qts * (alpha + 1)));

    // Numerator: u⁴
    const numerator = u4;

    // Magnitude: |H| = u⁴ / √(real² + imag²)
    const denom_mag = Math.sqrt(real_denom * real_denom + imag_denom * imag_denom);

    // Guard against division by zero
    if (denom_mag === 0) {
        return 0;
    }

    return numerator / denom_mag;
}

/**
 * Calculate ported box frequency response in dB (normalized form)
 *
 * @param {number} f - Frequency (Hz)
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @param {number} qts - Total driver Q
 * @returns {number} Response in dB
 */
export function calculatePortedResponseDbNormalized(f, fs, fb, alpha, qts) {
    const magnitude = calculatePortedResponseMagnitudeNormalized(f, fs, fb, alpha, qts);

    if (magnitude === 0) {
        return -Infinity;
    }

    return 20 * Math.log10(magnitude);
}
