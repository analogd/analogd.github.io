/**
 * Ported Box Designer - High-Level Workflow
 *
 * 🍳 COOKBOOK LAYER
 *
 * One function call → complete ported box design with port dimensions
 * Supports QB3, B4, C4, SBB4 alignments
 * Includes loss modeling (QL) and power limits
 *
 * Example:
 * ```javascript
 * const design = designPortedBox(driver, 'QB3', {
 *     unit: 'liters',
 *     portDiameter: 10  // cm
 * });
 * // Returns: { box, port, tuning, response, efficiency, powerLimits, citations }
 * ```
 */

import * as Small1973 from '../foundation/small-1973.js';
import * as Thiele1971 from '../foundation/thiele-1971.js';
import * as Small1972 from '../foundation/small-1972.js';
import * as Engineering from '../engineering/index.js';
import * as Units from './units.js';

/**
 * Design complete ported box system
 *
 * @param {Object} driver - Driver parameters
 * @param {string|Object} alignment - 'QB3', 'B4', 'C4', 'SBB4', or {vb, fb}
 * @param {Object} options - Configuration
 * @param {string} [options.unit='liters'] - Output volume unit
 * @param {string} [options.vasUnit='liters'] - Input Vas unit
 * @param {number} [options.portDiameter=10] - Port diameter (cm)
 * @param {number} [options.ql=7.0] - Enclosure loss Q
 * @param {Array<number>} [options.responseRange=[10,200]] - Frequency range
 * @param {number} [options.responsePoints=100] - Number of points
 * @returns {Object} Complete ported box design
 */
export function designPortedBox(driver, alignment, options = {}) {
    // Parse options
    const {
        unit = 'liters',
        vasUnit = 'liters',
        portDiameter = 10,  // cm
        portDiameterUnit = 'cm',
        ql = 7.0,
        responseRange = [10, 200],
        responsePoints = 100
    } = options;

    // Validate required driver parameters
    if (!driver.fs || !driver.qts || !driver.vas) {
        throw new Error('Driver missing required T/S parameters: fs, qts, vas');
    }

    // Validate Qts range for ported designs
    if (driver.qts < 0.2 || driver.qts > 1.5) {
        console.warn(`Warning: Qts=${driver.qts} outside typical range (0.2-1.5) for loudspeaker drivers`);
    }

    // Warn about edge cases for ported designs (unless custom alignment)
    if (typeof alignment === 'string') {
        if (driver.qts < 0.3) {
            console.warn(`Warning: Qts=${driver.qts} is low for ported design. Typical range: 0.3-0.5. Consider sealed box.`);
        }
        if (driver.qts > 0.55) {
            console.warn(`Warning: Qts=${driver.qts} is high for ported design. Typical range: 0.3-0.5. Consider sealed box (Butterworth).`);
        }
    }

    // Convert driver Vas to SI
    const vasSI = Units.volumeToM3(driver.vas, vasUnit);
    const portDiameterSI = Units.lengthToM(portDiameter, portDiameterUnit);

    // Determine vb and fb
    let vbSI, fb, alignmentName;

    if (typeof alignment === 'object') {
        // User specified custom vb and fb
        vbSI = Units.volumeToM3(alignment.vb, unit);
        fb = alignment.fb;
        alignmentName = 'Custom';
    } else {
        // Named alignment
        const result = _calculateAlignmentParameters(driver, alignment, vasSI);
        vbSI = result.vb;
        fb = result.fb;
        alignmentName = result.name;
    }

    // Calculate port dimensions (Small 1973, Eq. 15)
    const portArea = Small1973.calculatePortArea(portDiameterSI);
    const portLengthSI = Small1973.calculatePortLength(vbSI, fb, portArea, portDiameterSI);

    // Calculate system parameters
    const alpha = Small1972.calculateAlpha(vasSI, vbSI);
    const f3 = Small1973.calculatePortedF3(driver.fs, fb, alpha, driver.qts, ql);

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
        response.push(Small1973.calculatePortedResponseDb(
            freq, driver.fs, fb, alpha, driver.qts, ql
        ));
    }

    // Calculate port velocity at Xmax
    let portVelocity = null;
    if (driver.sd && driver.xmax) {
        const sdSI = driver.sd / 10000;  // cm² to m²
        const xmaxSI = driver.xmax / 1000;  // mm to m
        const volumeVelocity = sdSI * xmaxSI * fb * 2 * Math.PI;
        portVelocity = {
            value: Number(Small1973.calculatePortVelocity(volumeVelocity, portArea).toFixed(1)),
            status: _getPortVelocityStatus(Small1973.calculatePortVelocity(volumeVelocity, portArea)),
            conservativeLimit: 15,
            aggressiveLimit: 20,
            method: 'Small 1973, port velocity calculation'
        };
    }

    // Calculate efficiency and sensitivity (if Qes available)
    let efficiency = null;
    if (driver.qes) {
        const eta0 = Small1972.calculateEta0(driver.fs, vasSI, driver.qes);
        const spl0 = Small1972.calculateSpl0(eta0);
        efficiency = {
            eta0: Number((eta0 * 100).toFixed(3)),
            spl0: Number(spl0.toFixed(1)),
            method: 'Small 1972, Equation 22'
        };
    }

    // Calculate power limits (if mechanical parameters available)
    let powerLimits = null;
    if (driver.xmax && driver.pe) {
        try {
            const params = _buildEngineeringParams(driver, vbSI, vasSI, 'ported', fb, ql);
            // Use same frequency grid as response for smooth curves
            const curve = Engineering.generateMaxPowerCurve(params, frequencies);

            const at20Hz = curve.find(p => Math.abs(p.frequency - 20) < 1);
            const at30Hz = curve.find(p => Math.abs(p.frequency - 30) < 1);
            const at50Hz = curve.find(p => Math.abs(p.frequency - 50) < 1);
            const atFb = curve.find(p => Math.abs(p.frequency - fb) < 2);

            powerLimits = {
                thermal: driver.pe,
                excursionLimited: {
                    at20Hz: at20Hz ? Math.round(at20Hz.maxPower) : null,
                    at30Hz: at30Hz ? Math.round(at30Hz.maxPower) : null,
                    at50Hz: at50Hz ? Math.round(at50Hz.maxPower) : null,
                    atFb: atFb ? Math.round(atFb.maxPower) : null,
                },
                fullCurve: curve,
                method: 'Engineering layer displacement model (captures excursion null)'
            };
        } catch (err) {
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
            name: alignmentName,
            type: 'ported',
            description: _getAlignmentDescription(alignmentName)
        },

        box: {
            volume: Units.formatVolume(vbSI),
            alpha: Number(alpha.toFixed(3)),
            f3: Number(f3.toFixed(1)),
            ql: Number(ql.toFixed(1)),
            method: 'Small 1973'
        },

        tuning: {
            fb: Number(fb.toFixed(1)),
            ratio: Number((fb / driver.fs).toFixed(2)),
            method: alignmentName === 'Custom' ? 'User specified' : `Thiele 1971 ${alignmentName}`
        },

        port: {
            diameter: Units.formatLength(portDiameterSI),
            length: Units.formatLength(portLengthSI),
            area: Units.formatArea(portArea),
            velocity: portVelocity,
            endCorrection: Small1973.PORT_END_CORRECTION,
            method: 'Small 1973, Equation 15 (Helmholtz resonator)'
        },

        response: {
            frequencies,
            magnitudesDb: response,
            range: responseRange,
            points: responsePoints,
            method: 'Small 1973, 4th-order transfer function with losses'
        },

        efficiency,
        powerLimits,

        citations: [
            'Small, Richard H. "Vented-Box Loudspeaker Systems" JAES Vol. 21 (1973)',
            'Thiele, A.N. "Loudspeakers in Vented Boxes" JAES Vol. 19 (1971)'
        ]
    };
}

/**
 * Compare multiple ported alignments
 *
 * @param {Object} driver - Driver parameters
 * @param {Array<string>} alignments - Array of alignment names
 * @param {Object} options - Configuration
 * @returns {Array<Object>} Array of designs for comparison
 */
export function comparePortedAlignments(driver, alignments = ['QB3', 'B4', 'C4'], options = {}) {
    return alignments.map(alignment => {
        try {
            return designPortedBox(driver, alignment, options);
        } catch (err) {
            return {
                alignment,
                error: err.message
            };
        }
    });
}

/**
 * Find optimal alignment for a driver
 *
 * Returns best QB3, B4, or C4 alignment based on driver Qts.
 *
 * @param {Object} driver - Driver parameters
 * @param {Object} options - Configuration
 * @returns {Object} Recommended design
 */
export function findOptimalPortedAlignment(driver, options = {}) {
    // Rule of thumb from Thiele/Small:
    // - Qts < 0.3: Not suitable for ported
    // - Qts 0.3-0.4: Excellent for QB3, B4, C4
    // - Qts 0.4-0.5: Good for QB3
    // - Qts > 0.5: Marginal for ported, prefer sealed

    if (driver.qts < 0.3) {
        throw new Error(`Qts=${driver.qts} too low for ported design. Consider sealed box.`);
    }

    if (driver.qts > 0.55) {
        throw new Error(`Qts=${driver.qts} too high for ported design. Consider sealed box (try Butterworth).`);
    }

    // Try QB3 first (most common)
    if (driver.qts >= 0.35 && driver.qts <= 0.50) {
        return designPortedBox(driver, 'QB3', options);
    }

    // Try B4 for lower Qts
    if (driver.qts < 0.40) {
        return designPortedBox(driver, 'B4', options);
    }

    // Default to QB3
    return designPortedBox(driver, 'QB3', options);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function _calculateAlignmentParameters(driver, alignment, vasSI) {
    const alignmentUpper = alignment.toUpperCase();

    switch (alignmentUpper) {
        case 'QB3':
            // QB3: Quasi-Butterworth 3rd order
            // Fb = Fs, Vb from formula
            const vbQB3 = Thiele1971.calculateQB3Volume(driver.qts, vasSI);
            return {
                vb: vbQB3,
                fb: driver.fs,
                name: 'QB3'
            };

        case 'B4':
            // B4: Butterworth 4th order (if implemented)
            try {
                const resultB4 = Small1973.designB4Alignment(driver.fs, driver.qts, vasSI);
                return {
                    vb: resultB4.vb,
                    fb: resultB4.fb,
                    name: 'B4'
                };
            } catch (err) {
                throw new Error(`B4 alignment not available: ${err.message}. Try QB3 instead.`);
            }

        case 'C4':
            // C4: Chebyshev 4th order (if implemented)
            try {
                const resultC4 = Small1973.designC4Alignment(driver.fs, driver.qts, vasSI);
                return {
                    vb: resultC4.vb,
                    fb: resultC4.fb,
                    name: 'C4'
                };
            } catch (err) {
                throw new Error(`C4 alignment not available: ${err.message}. Try QB3 instead.`);
            }

        case 'SBB4':
            // SBB4: Sub-Butterworth 4th order
            throw new Error('SBB4 alignment not yet implemented. Try QB3 instead.');

        default:
            throw new Error(`Unknown ported alignment: ${alignment}. Use QB3, B4, or C4.`);
    }
}

function _getAlignmentDescription(name) {
    const descriptions = {
        'QB3': 'Quasi-Butterworth 3rd-order - maximally flat, good efficiency',
        'B4': 'Butterworth 4th-order - maximally flat, extended bass',
        'C4': 'Chebyshev 4th-order - ripple, maximum extension',
        'SBB4': 'Sub-Butterworth 4th-order - smooth rolloff',
        'Custom': 'User-specified box volume and tuning'
    };
    return descriptions[name] || 'Unknown alignment';
}

function _getPortVelocityStatus(velocity) {
    if (velocity < 15) return 'good';
    if (velocity < 20) return 'moderate';
    if (velocity < 30) return 'high';
    return 'critical';
}

function _buildEngineeringParams(driver, vbSI, vasSI, boxType, fb = null, ql = Infinity) {
    const alpha = Small1972.calculateAlpha(vasSI, vbSI);

    // Calculate Rms from Qms if not directly provided
    // Qms = (ωs × Mms) / Rms  →  Rms = (ωs × Mms) / Qms
    let rms = driver.rms;
    if (!rms && driver.qms && driver.mms && driver.fs) {
        const omega_s = 2 * Math.PI * driver.fs;
        const mms_kg = driver.mms / 1000;  // convert to kg
        rms = (omega_s * mms_kg) / driver.qms;
    }

    const params = {
        boxType,
        fs: driver.fs,
        qts: driver.qts,
        qms: driver.qms,  // Pass through for calculations
        alpha,
        re: driver.re || 6.4,
        bl: driver.bl || 10,
        mms: driver.mms ? driver.mms / 1000 : 0.050,
        cms: driver.cms || _estimateCms(driver, vasSI),
        rms: rms || 1.0,  // Fallback only if Qms also unavailable
        xmax: driver.xmax / 1000,
        pe: driver.pe
    };

    if (boxType === 'ported') {
        params.fb = fb;
        params.ql = ql;
    }

    return params;
}

function _estimateCms(driver, vasSI) {
    if (!driver.sd) return 0.001;
    const rho = 1.204;
    const c = 343;
    const sd_m2 = driver.sd / 10000;
    return vasSI / (rho * c * c * sd_m2 * sd_m2);
}
