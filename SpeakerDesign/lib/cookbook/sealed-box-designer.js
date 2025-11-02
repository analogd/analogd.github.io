/**
 * Sealed Box Designer - High-Level Workflow
 *
 * 🍳 COOKBOOK LAYER
 *
 * One function call → complete sealed box design
 * User-friendly inputs (liters, cm) → comprehensive results
 * Delegates all calculations to foundation + engineering layers
 *
 * Example:
 * ```javascript
 * const design = designSealedBox(driver, 'butterworth', {
 *     unit: 'liters',
 *     responseRange: [10, 200]
 * });
 * // Returns: { box, response, efficiency, powerLimits, citations }
 * ```
 */

import * as Small1972 from '../foundation/small-1972.js';
import * as Thiele1971 from '../foundation/thiele-1971.js';
import * as Engineering from '../engineering/index.js';
import * as Units from './units.js';

/**
 * Design complete sealed box system
 *
 * @param {Object} driver - Driver parameters
 * @param {number} driver.fs - Resonance frequency (Hz)
 * @param {number} driver.qts - Total Q
 * @param {number} driver.vas - Equivalent volume (liters or m³, specify in options)
 * @param {number} [driver.qes] - Electrical Q (for sensitivity)
 * @param {number} [driver.xmax] - Linear excursion (mm)
 * @param {number} [driver.sd] - Piston area (cm²)
 * @param {number} [driver.pe] - Thermal power (W)
 * @param {string|number} alignment - 'butterworth', 'bessel', 'chebyshev', or target Qtc
 * @param {Object} options - Configuration
 * @param {string} [options.unit='liters'] - Output volume unit
 * @param {string} [options.vasUnit='liters'] - Input Vas unit
 * @param {Array<number>} [options.responseRange=[10,200]] - Frequency range for response
 * @param {number} [options.responsePoints=100] - Number of response points
 * @param {number} [options.volume] - Fixed volume (overrides alignment calculation)
 * @returns {Object} Complete design with all calculated parameters
 */
export function designSealedBox(driver, alignment, options = {}) {
    // Parse options with defaults
    const {
        unit = 'liters',
        vasUnit = 'liters',
        responseRange = [10, 200],
        responsePoints = 100,
        volume = null
    } = options;

    // Validate required driver parameters
    if (!driver.fs || !driver.qts || !driver.vas) {
        throw new Error('Driver missing required T/S parameters: fs, qts, vas');
    }

    // Validate Qts range
    if (driver.qts < 0.2 || driver.qts > 1.5) {
        console.warn(`Warning: Qts=${driver.qts} outside typical range (0.2-1.5) for loudspeaker drivers`);
    }

    // Convert driver Vas to SI
    const vasSI = Units.volumeToM3(driver.vas, vasUnit);

    // Determine target box volume
    let vbSI;
    let targetQtc;

    if (volume !== null) {
        // User specified fixed volume
        vbSI = Units.volumeToM3(volume, unit);
        // Calculate resulting Qtc
        const alpha = Small1972.calculateAlpha(vasSI, vbSI);
        targetQtc = Small1972.calculateQtc(driver.qts, alpha);
    } else if (typeof alignment === 'number') {
        // User specified target Qtc
        targetQtc = alignment;
        vbSI = Thiele1971.calculateVolumeForQtc(driver.qts, targetQtc, vasSI);
    } else {
        // Named alignment
        switch (alignment.toLowerCase()) {
            case 'butterworth':
                targetQtc = 0.707;
                vbSI = Thiele1971.calculateButterworthVolume(driver.qts, vasSI);
                break;
            case 'bessel':
                targetQtc = 0.577;
                vbSI = Thiele1971.calculateBesselVolume(driver.qts, vasSI);
                break;
            case 'chebyshev':
            case 'chebychev':
                targetQtc = 1.0;
                vbSI = Thiele1971.calculateChebyshevVolume(driver.qts, vasSI);
                break;
            default:
                throw new Error(`Unknown alignment: ${alignment}. Use 'butterworth', 'bessel', 'chebyshev', or numeric Qtc`);
        }
    }

    // Calculate system parameters (Small 1972)
    const alpha = Small1972.calculateAlpha(vasSI, vbSI);
    const fc = Small1972.calculateFc(driver.fs, alpha);
    const qtc = Small1972.calculateQtc(driver.qts, alpha);
    const f3 = Small1972.calculateF3(fc, qtc);

    // Build response curve with log spacing for better resolution at low frequencies
    const frequencies = [];
    const response = [];

    // Logarithmic frequency spacing
    const logStart = Math.log10(responseRange[0]);
    const logEnd = Math.log10(responseRange[1]);
    const logStep = (logEnd - logStart) / (responsePoints - 1);

    for (let i = 0; i < responsePoints; i++) {
        const freq = Math.pow(10, logStart + i * logStep);
        frequencies.push(freq);
        response.push(Small1972.calculateResponseDb(freq, fc, qtc));
    }

    // Calculate efficiency and sensitivity (if Qes available)
    let efficiency = null;
    if (driver.qes) {
        const eta0 = Small1972.calculateEta0(driver.fs, vasSI, driver.qes);
        const spl0 = Small1972.calculateSpl0(eta0);
        efficiency = {
            eta0: Number((eta0 * 100).toFixed(3)),  // Convert to percentage
            spl0: Number(spl0.toFixed(1)),
            method: 'Small 1972, Equation 22'
        };
    }

    // Calculate power limits (if mechanical parameters available)
    let powerLimits = null;
    if (driver.xmax && driver.pe) {
        try {
            const params = _buildEngineeringParams(driver, vbSI, vasSI, 'sealed');
            // Use same frequency grid as response for smooth curves
            const curve = Engineering.generateMaxPowerCurve(params, frequencies);

            // Extract key points
            const at20Hz = curve.find(p => Math.abs(p.frequency - 20) < 1);
            const at30Hz = curve.find(p => Math.abs(p.frequency - 30) < 1);
            const at50Hz = curve.find(p => Math.abs(p.frequency - 50) < 1);

            powerLimits = {
                thermal: driver.pe,
                excursionLimited: {
                    at20Hz: at20Hz ? Math.round(at20Hz.maxPower) : null,
                    at30Hz: at30Hz ? Math.round(at30Hz.maxPower) : null,
                    at50Hz: at50Hz ? Math.round(at50Hz.maxPower) : null,
                },
                fullCurve: curve,
                method: 'Engineering layer displacement model'
            };
        } catch (err) {
            // If mechanical parameters incomplete, skip power limits
            powerLimits = { error: 'Insufficient mechanical parameters for power calculation' };
        }
    }

    // Build complete design object
    return {
        driver: {
            fs: driver.fs,
            qts: driver.qts,
            vas: Units.formatVolume(vasSI),
            qes: driver.qes || null,
            xmax: driver.xmax || null,
            sd: driver.sd || null,
            pe: driver.pe || null
        },

        alignment: {
            name: typeof alignment === 'string' ? alignment : Units.detectAlignment(qtc),
            targetQtc: targetQtc,
            actualQtc: Number(qtc.toFixed(3)),
            description: _getAlignmentDescription(qtc)
        },

        box: {
            volume: Units.formatVolume(vbSI),
            alpha: Number(alpha.toFixed(3)),
            fc: Number(fc.toFixed(1)),
            qtc: Number(qtc.toFixed(3)),
            f3: Number(f3.toFixed(1)),
            method: 'Small 1972'
        },

        response: {
            frequencies,
            magnitudesDb: response,
            range: responseRange,
            points: responsePoints,
            method: 'Small 1972, Equation 13'
        },

        efficiency,
        powerLimits,

        citations: [
            'Small, Richard H. "Direct-Radiator Loudspeaker System Analysis" JAES Vol. 20, No. 5 (June 1972)',
            'Thiele, A.N. "Loudspeakers in Vented Boxes" JAES Vol. 19 (1971)'
        ]
    };
}

/**
 * Compare multiple alignments for a driver
 *
 * @param {Object} driver - Driver parameters
 * @param {Array<string>} alignments - Array of alignment names
 * @param {Object} options - Configuration
 * @returns {Array<Object>} Array of designs for comparison
 */
export function compareAlignments(driver, alignments = ['bessel', 'butterworth', 'chebyshev'], options = {}) {
    return alignments.map(alignment => {
        try {
            return designSealedBox(driver, alignment, options);
        } catch (err) {
            return {
                alignment,
                error: err.message
            };
        }
    });
}

/**
 * Design for specific F3 target
 *
 * @param {Object} driver - Driver parameters
 * @param {number} targetF3 - Target -3dB frequency (Hz)
 * @param {Object} options - Configuration
 * @returns {Object} Design achieving target F3 (if possible)
 */
export function designForF3(driver, targetF3, options = {}) {
    const vasUnit = options.vasUnit || 'liters';
    const vasSI = Units.volumeToM3(driver.vas, vasUnit);

    // Iterate to find Qtc that gives target F3
    // F3 = Fc × sqrt((1 - 1/(2Q²)) + sqrt((1 - 1/(2Q²))² + 1))
    // This is complex to invert, so we binary search

    let lowQtc = 0.4;
    let highQtc = 2.0;
    const tolerance = 0.5; // 0.5 Hz tolerance

    for (let i = 0; i < 30; i++) {
        const testQtc = (lowQtc + highQtc) / 2;
        const design = designSealedBox(driver, testQtc, options);

        if (Math.abs(design.box.f3 - targetF3) < tolerance) {
            return design;
        }

        if (design.box.f3 > targetF3) {
            lowQtc = testQtc;
        } else {
            highQtc = testQtc;
        }
    }

    throw new Error(`Could not achieve F3=${targetF3}Hz. Driver Fs=${driver.fs}Hz may be too high.`);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function _getAlignmentDescription(qtc) {
    if (Math.abs(qtc - 0.707) < 0.05) return 'Maximally flat frequency response';
    if (Math.abs(qtc - 0.577) < 0.05) return 'Maximally flat transient response';
    if (Math.abs(qtc - 1.0) < 0.1) return '0.5dB ripple, extended bass';
    if (qtc < 0.5) return 'Underdamped - low bass extension';
    if (qtc < 0.65) return 'Quasi-Butterworth - good compromise';
    if (qtc > 1.2) return 'Overdamped - reduced output';
    return 'Custom alignment';
}

function _buildEngineeringParams(driver, vbSI, vasSI, boxType) {
    const alpha = Small1972.calculateAlpha(vasSI, vbSI);

    return {
        boxType,
        fs: driver.fs,
        qts: driver.qts,
        alpha,
        re: driver.re || 6.4,
        bl: driver.bl || 10,
        mms: driver.mms ? driver.mms / 1000 : 0.050,  // g to kg
        cms: driver.cms || _estimateCms(driver, vasSI),
        rms: driver.rms || 1.0,
        xmax: driver.xmax / 1000,  // mm to m
        pe: driver.pe
    };
}

function _estimateCms(driver, vasSI) {
    if (!driver.sd) return 0.001;
    const rho = 1.204;
    const c = 343;
    const sd_m2 = driver.sd / 10000;
    return vasSI / (rho * c * c * sd_m2 * sd_m2);
}
