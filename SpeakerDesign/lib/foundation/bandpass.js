// Bandpass Enclosure Design
// Derived from ported box theory (4th and 6th order bandpass systems)
//
// Bandpass boxes use TWO chambers (sealed rear + ported front, or dual-ported)
// to create narrow-bandwidth high-efficiency systems. Common for subwoofers
// in car audio and PA applications.
//
// NOT in Small 1973 - derived design type using ported box principles.

/**
 * Design 4th-order bandpass enclosure (single ported chamber)
 *
 * Configuration:
 * - Sealed rear chamber (Vbr)
 * - Ported front chamber (Vbf, tuned to Fbf)
 * - Driver couples both chambers
 *
 * @param {object} driver - Driver parameters {fs, qts, vas}
 * @param {string} target - 'efficiency' or 'bandwidth'
 * @returns {object} Design {vbr, vbf, fbf, bandwidth, centerFreq}
 */
export function designBandpass4(driver, target = 'efficiency') {
    const { fs, qts, vas } = driver;

    let vbr, vbf, fbf;

    if (target === 'efficiency') {
        vbr = 0.5 * vas;
        vbf = 2.0 * vas;
        fbf = 1.1 * fs;
    } else {
        vbr = 0.8 * vas;
        vbf = 2.5 * vas;
        fbf = 1.0 * fs;
    }

    const qSystem = qts * Math.sqrt(vas / vbr);
    const centerFreq = fbf;
    const bandwidth = centerFreq / qSystem;

    return {
        type: '4th-order bandpass',
        vbr, vbf, fbf,
        centerFreq,
        bandwidth,
        qSystem
    };
}

/**
 * Design 6th-order bandpass enclosure (dual ported chambers)
 *
 * Configuration:
 * - Ported rear chamber (Vbr, tuned to Fbr)
 * - Ported front chamber (Vbf, tuned to Fbf)
 * - Driver couples both chambers
 *
 * @param {object} driver - Driver parameters {fs, qts, vas}
 * @param {string} target - 'max-efficiency' or 'moderate'
 * @returns {object} Design {vbr, fbr, vbf, fbf, bandwidth, centerFreq}
 */
export function designBandpass6(driver, target = 'max-efficiency') {
    const { fs, qts, vas } = driver;

    let vbr, fbr, vbf, fbf;

    if (target === 'max-efficiency') {
        vbr = 0.5 * vas;
        fbr = 0.85 * fs;
        vbf = 3.0 * vas;
        fbf = 1.2 * fs;
    } else {
        vbr = 0.8 * vas;
        fbr = 0.9 * fs;
        vbf = 2.5 * vas;
        fbf = 1.1 * fs;
    }

    const centerFreq = Math.sqrt(fbr * fbf);
    const qSystem = qts * 2.5;
    const bandwidth = centerFreq / qSystem;

    return {
        type: '6th-order bandpass',
        vbr, fbr,
        vbf, fbf,
        centerFreq,
        bandwidth,
        qSystem
    };
}

/**
 * Calculate bandpass frequency response (simplified)
 *
 * @param {number} f - Frequency (Hz)
 * @param {object} design - Bandpass design from designBandpass4/6
 * @returns {number} Response magnitude (dB)
 */
export function calculateBandpassResponse(f, design) {
    const { centerFreq, bandwidth } = design;
    const q = centerFreq / bandwidth;
    const ratio = f / centerFreq;
    const logRatio = Math.log(ratio);
    const response = Math.exp(-q * logRatio * logRatio);

    return 20 * Math.log10(response);
}
