// Thiele, A. Neville. "Loudspeakers in Vented Boxes: Parts I & II"
// Journal of the Audio Engineering Society (JAES)
// Vol. 19, No. 5, May 1971, pp. 382-392
// Vol. 19, No. 6, June 1971, pp. 471-483
//
// Alignment theory for sealed and vented loudspeaker systems
//
// ⚠️  IMPORTANT: When adding/removing functions, update lib/foundation/metadata.js
//
// Table II (Thiele 1971, Part I) defines canonical alignments
// based on maximally flat passband (Butterworth), linear phase
// (Bessel), and passband ripple (Chebyshev) responses.

/**
 * Butterworth (B2) alignment quality factor
 *
 * Maximally flat amplitude response with no passband ripple.
 * -3dB at system resonance (F3 = Fc).
 * Best all-around response, most commonly used.
 *
 * Source: Thiele 1971, Table II
 *
 * @constant {number}
 */
export const BUTTERWORTH_QTC = 0.707;

/**
 * Bessel (Br2) alignment quality factor
 *
 * Maximally flat group delay (linear phase).
 * No transient overshoot, best impulse response.
 * More gradual rolloff than Butterworth.
 *
 * Source: Thiele 1971, Table II
 *
 * @constant {number}
 */
export const BESSEL_QTC = 0.577;

/**
 * Chebyshev (C2) alignment quality factor (0.5dB ripple)
 *
 * Allows passband ripple for extended low frequency response.
 * +2dB peak near resonance, trades flatness for extension.
 * Can sound "boomy" compared to Butterworth.
 *
 * Source: Thiele 1971, Table II
 *
 * @constant {number}
 */
export const CHEBYSHEV_QTC = 1.0;

/**
 * Calculate required box volume for target Qtc (sealed enclosure)
 *
 * Inverts the Qtc formula to solve for box volume:
 *
 * From: Qtc = Qts × √(1 + Vas/Vb)
 * Solve: Vb = Vas / ((Qtc/Qts)² - 1)
 *
 * Source: Derived from Small 1972, Equation 7
 *
 * @param {number} qts - Driver total quality factor (dimensionless)
 * @param {number} vas - Driver equivalent volume (m³)
 * @param {number} targetQtc - Desired system quality factor (dimensionless)
 * @returns {number} Required box volume (m³)
 * @throws {Error} If targetQtc ≤ qts (impossible - box always increases Q)
 */
export function calculateVolumeForQtc(qts, vas, targetQtc) {
    if (targetQtc <= qts) {
        throw new Error(
            `Target Qtc (${targetQtc}) must be greater than driver Qts (${qts}). ` +
            `Sealed enclosure always increases Q.`
        );
    }

    const ratio = targetQtc / qts;
    const ratioSquared = ratio * ratio;

    return vas / (ratioSquared - 1);
}

/**
 * Calculate required box volume for Butterworth alignment
 *
 * Convenience function for most common alignment.
 *
 * Source: Thiele 1971, Table II (Qtc = 0.707)
 *
 * @param {number} qts - Driver total quality factor (dimensionless)
 * @param {number} vas - Driver equivalent volume (m³)
 * @returns {number} Required box volume for Butterworth (m³)
 */
export function calculateButterworthVolume(qts, vas) {
    return calculateVolumeForQtc(qts, vas, BUTTERWORTH_QTC);
}

/**
 * Calculate required box volume for Bessel alignment
 *
 * Source: Thiele 1971, Table II (Qtc = 0.577)
 *
 * @param {number} qts - Driver total quality factor (dimensionless)
 * @param {number} vas - Driver equivalent volume (m³)
 * @returns {number} Required box volume for Bessel (m³)
 */
export function calculateBesselVolume(qts, vas) {
    return calculateVolumeForQtc(qts, vas, BESSEL_QTC);
}

/**
 * Calculate required box volume for Chebyshev alignment
 *
 * Source: Thiele 1971, Table II (Qtc = 1.0)
 *
 * @param {number} qts - Driver total quality factor (dimensionless)
 * @param {number} vas - Driver equivalent volume (m³)
 * @returns {number} Required box volume for Chebyshev (m³)
 */
export function calculateChebyshevVolume(qts, vas) {
    return calculateVolumeForQtc(qts, vas, CHEBYSHEV_QTC);
}

/**
 * QB3 (Quasi-Butterworth 3rd order) ported alignment
 *
 * Vented box alignment that combines sealed-box Butterworth characteristic
 * with port loading for extended low frequency response.
 *
 * Tuning: Fb = Fs (port tuned to driver resonance)
 * Volume: Vb = 15 × Qts^3.3 × Vas (empirical formula)
 *
 * This produces a 3rd-order Butterworth rolloff (18dB/octave).
 *
 * Source: Thiele 1971, Table II
 *
 * @constant {object}
 */
export const QB3_ALIGNMENT = {
    name: 'QB3',
    description: 'Quasi-Butterworth 3rd order',

    /**
     * Calculate QB3 box volume
     *
     * Formula: Vb = 15 × Qts^3.3 × Vas
     *
     * @param {number} qts - Driver total quality factor (dimensionless)
     * @param {number} vas - Driver equivalent volume (m³)
     * @returns {number} Box volume (m³)
     */
    calculateVolume(qts, vas) {
        return 15 * Math.pow(qts, 3.3) * vas;
    },

    /**
     * Calculate QB3 port tuning frequency
     *
     * Formula: Fb = Fs
     *
     * @param {number} fs - Driver free-air resonance (Hz)
     * @returns {number} Port tuning frequency (Hz)
     */
    calculateTuning(fs) {
        return fs;
    }
};

/**
 * SC4 (Sub-Chebyshev 4th order) ported alignment
 *
 * Extended bass alignment with moderate group delay ripple.
 * More extended than QB3, but with some transient ringing.
 *
 * Source: Thiele 1971, Table II
 *
 * Status: NOT YET IMPLEMENTED (formula needs verification)
 *
 * @constant {object}
 */
export const SC4_ALIGNMENT = {
    name: 'SC4',
    description: 'Sub-Chebyshev 4th order',
    calculateVolume() {
        throw new Error('SC4 alignment not yet implemented');
    },
    calculateTuning() {
        throw new Error('SC4 alignment not yet implemented');
    }
};

/**
 * C4 (Chebyshev 4th order) ported alignment
 *
 * Maximum bass extension with controlled ripple.
 * Most extended response but with transient ringing.
 *
 * Source: Thiele 1971, Table II
 *
 * Status: NOT YET IMPLEMENTED (formula needs verification)
 *
 * @constant {object}
 */
export const C4_ALIGNMENT = {
    name: 'C4',
    description: 'Chebyshev 4th order',
    calculateVolume() {
        throw new Error('C4 alignment not yet implemented');
    },
    calculateTuning() {
        throw new Error('C4 alignment not yet implemented');
    }
};
