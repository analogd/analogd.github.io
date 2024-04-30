/**
 * Isobaric (Compound) Driver Configuration
 *
 * Isobaric loading places two identical drivers in a sealed chamber between them,
 * moving as one unit. This effectively halves Vas, allowing smaller enclosures
 * at the cost of 3dB sensitivity and requiring two drivers.
 *
 * Physics:
 * - Two suspensions work on same air volume → Vas_eff = Vas / 2
 * - Two motors (series wiring) → Bl_eff = 2×Bl, Re_eff = 2×Re
 * - Twice the moving mass → Mms_eff = 2×Mms
 * - Only one driver radiates → Sd unchanged
 * - Both cones move together → Xmax unchanged
 * - Two voice coils → Pe_eff = 2×Pe
 *
 * Net effect:
 * - Fs unchanged
 * - Qts unchanged
 * - Vas halved (main benefit - smaller box for same response)
 * - Sensitivity -3dB (efficiency halved)
 * - Power handling doubled
 *
 * Wiring options:
 * - Series: 2× impedance (two 4Ω → 8Ω)
 * - Parallel: 0.5× impedance (two 4Ω → 2Ω)
 * Both give same acoustic result; choice depends on amplifier matching.
 */

import { Driver } from './Driver.js';

/**
 * Wiring configuration for isobaric compound
 */
export const IsobaricWiring = {
    SERIES: 'series',     // Most common - doubles impedance
    PARALLEL: 'parallel'  // Halves impedance
};

/**
 * Create an effective driver representing isobaric compound of two identical drivers
 *
 * @param {Driver} driver - The base driver (will use two of these)
 * @param {string} [wiring='series'] - Wiring configuration ('series' or 'parallel')
 * @returns {Driver} New driver with transformed parameters
 */
export function createIsobaricDriver(driver, wiring = IsobaricWiring.SERIES) {
    if (!(driver instanceof Driver)) {
        throw new Error('createIsobaricDriver requires a Driver instance');
    }

    const isSeries = wiring === IsobaricWiring.SERIES;

    // Build transformed parameters
    const params = {
        // Core T/S - Vas halves, Fs and Qts unchanged
        fs: driver.fs,
        qts: driver.qts,
        vas: driver.vas / 2,

        // Q parameters unchanged
        qes: driver.qes,
        qms: driver.qms,

        // Electrical - depends on wiring
        // Series: Re doubles, parallel: Re halves
        re: driver.re ? (isSeries ? driver.re * 2 : driver.re / 2) : undefined,
        le: driver.le ? (isSeries ? driver.le * 2 : driver.le / 2) : undefined,

        // Motor - series doubles Bl (both coils contribute), parallel unchanged
        bl: driver.bl ? (isSeries ? driver.bl * 2 : driver.bl) : undefined,

        // Mechanical - always doubled/halved regardless of wiring
        mms: driver.mms ? driver.mms * 2 : undefined,
        cms: driver.cms ? driver.cms / 2 : undefined,
        rms: driver.rms ? driver.rms * 2 : undefined,

        // Physical - Sd unchanged (one driver radiates), Xmax unchanged
        sd: driver.sd,
        xmax: driver.xmax,

        // Power handling doubled (two voice coils)
        pe: driver.pe ? driver.pe * 2 : undefined,

        // Vd unchanged (one radiating cone)
        vd: driver.vd,

        // Sensitivity drops 3dB (efficiency halved due to doubled mass)
        sensitivity: driver.sensitivity != null ? driver.sensitivity - 3 : undefined,

        // Metadata
        name: driver.name ? `${driver.name} (Isobaric)` : 'Isobaric Compound',
        manufacturer: driver.manufacturer
    };

    // Remove undefined values
    Object.keys(params).forEach(key => {
        if (params[key] === undefined) delete params[key];
    });

    return new Driver(params);
}

/**
 * Calculate the theoretical sensitivity loss for isobaric
 * Always -3dB (efficiency halved due to doubled moving mass)
 *
 * @returns {number} Sensitivity change in dB (-3)
 */
export function getIsobaricSensitivityLoss() {
    return -3;
}

/**
 * Check if a driver is suitable for isobaric configuration
 * Isobaric is most beneficial for high-Vas drivers that would need huge boxes
 *
 * @param {Driver} driver - Driver to check
 * @returns {{ suitable: boolean, reason: string, vasReduction: number }}
 */
export function analyzeIsobaricSuitability(driver) {
    const vasReduction = driver.vas / 2;

    // Isobaric makes most sense when:
    // 1. Driver has high Vas (would need large box otherwise)
    // 2. Driver has good sensitivity (can afford -3dB loss)
    // 3. User needs compact enclosure

    if (driver.vas < 50) {
        return {
            suitable: false,
            reason: 'Vas already small - isobaric offers little benefit',
            vasReduction
        };
    }

    const sensitivity = driver.sensitivity;
    if (sensitivity && sensitivity < 85) {
        return {
            suitable: false,
            reason: 'Low sensitivity - 3dB loss may be too much',
            vasReduction
        };
    }

    return {
        suitable: true,
        reason: `Reduces effective Vas from ${driver.vas.toFixed(0)}L to ${vasReduction.toFixed(0)}L`,
        vasReduction
    };
}

export default createIsobaricDriver;
