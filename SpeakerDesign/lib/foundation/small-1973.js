// Small, Richard H. "Vented-Box Loudspeaker Systems"
// Journal of the Audio Engineering Society (JAES)
// Vol. 21, No. 5-8, 1973
//
// Ported (vented-box) loudspeaker system calculations
//
// This paper extends Small 1972 to include port loading and provides
// the complete 4th-order transfer function for vented systems.

import { SPEED_OF_SOUND, AIR_DENSITY } from './constants.js';

/**
 * Port end correction factor
 *
 * Empirical correction for effective acoustic length of port.
 * Accounts for air mass moving beyond physical port ends.
 *
 * Typical values: 0.732 to 0.85 depending on port geometry
 *
 * Source: Small 1973, Equation 15
 *
 * @constant {number}
 */
export const PORT_END_CORRECTION = 0.732;

/**
 * Calculate required port length for Helmholtz resonator tuning
 *
 * Formula: Lv = (c² / (4π²)) × (Sv / (Vb × Fb²)) - k × D
 *
 * Where:
 *   c = speed of sound (m/s)
 *   Sv = port area (m²)
 *   Vb = box volume (m³)
 *   Fb = tuning frequency (Hz)
 *   k = end correction factor (≈0.732)
 *   D = port diameter (m)
 *
 * The end correction accounts for acoustic mass beyond the physical port ends.
 * For non-circular ports, use D = √(4×Sv/π) (equivalent diameter).
 *
 * Source: Small 1973, Equation 15
 *
 * @param {number} vb - Box internal volume (m³)
 * @param {number} fb - Desired tuning frequency (Hz)
 * @param {number} portArea - Port cross-sectional area (m²)
 * @param {number} portDiameter - Port diameter (m)
 * @returns {number} Required port length (m)
 */
export function calculatePortLength(vb, fb, portArea, portDiameter) {
    const c = SPEED_OF_SOUND;
    const cSquared = c * c;
    const fourPiSquared = 4 * Math.PI * Math.PI;
    const fbSquared = fb * fb;

    const length = (cSquared / fourPiSquared) * (portArea / (vb * fbSquared));
    const endCorrection = PORT_END_CORRECTION * portDiameter;

    return length - endCorrection;
}

/**
 * Calculate port area from diameter
 *
 * Formula: A = π × (D/2)²
 *
 * @param {number} diameter - Port diameter (m)
 * @returns {number} Port cross-sectional area (m²)
 */
export function calculatePortArea(diameter) {
    const radius = diameter / 2;
    return Math.PI * radius * radius;
}

/**
 * Calculate equivalent diameter for rectangular port
 *
 * For use in end correction calculation.
 *
 * Formula: D = √(4 × A / π)
 *
 * This gives the diameter of a circular port with the same area.
 *
 * @param {number} width - Port width (m)
 * @param {number} height - Port height (m)
 * @returns {number} Equivalent diameter (m)
 */
export function calculateEquivalentDiameter(width, height) {
    const area = width * height;
    return Math.sqrt(4 * area / Math.PI);
}

/**
 * Calculate port air velocity at given frequency and volume velocity
 *
 * Formula: v = U / Sv
 *
 * Where:
 *   U = volume velocity (m³/s)
 *   Sv = port area (m²)
 *
 * Port velocity should typically stay below 15-20 m/s to avoid:
 * - Port compression (non-linear losses)
 * - Audible chuffing/noise
 * - Turbulence
 *
 * Source: Standard fluid dynamics applied to ports
 *
 * @param {number} volumeVelocity - Volume velocity through port (m³/s)
 * @param {number} portArea - Port cross-sectional area (m²)
 * @returns {number} Air velocity in port (m/s)
 */
export function calculatePortVelocity(volumeVelocity, portArea) {
    return volumeVelocity / portArea;
}

/**
 * Calculate maximum safe port velocity (empirical limit)
 *
 * Returns recommended maximum port velocity to avoid compression
 * and audible noise.
 *
 * Conservative: 15 m/s
 * Aggressive: 20 m/s
 *
 * Source: Empirical observations, not from Small paper
 *         (See Roozen et al. for detailed port compression theory)
 *
 * @param {boolean} conservative - Use conservative limit (default: true)
 * @returns {number} Maximum recommended velocity (m/s)
 */
export function getMaxPortVelocity(conservative = true) {
    return conservative ? 15 : 20;
}

/**
 * Calculate volume velocity from acoustic power and frequency
 *
 * Formula: U = √(2 × W / (ρ₀ × c × S))
 *
 * Where:
 *   W = acoustic power (W)
 *   ρ₀ = air density (kg/m³)
 *   c = speed of sound (m/s)
 *   S = radiation area (m²)
 *
 * Status: SIMPLIFIED - Full derivation requires impedance analysis
 *
 * @param {number} power - Acoustic power (W)
 * @param {number} radiationArea - Effective radiation area (m²)
 * @returns {number} Volume velocity (m³/s)
 */
export function calculateVolumeVelocity(power, radiationArea) {
    const rho = AIR_DENSITY;
    const c = SPEED_OF_SOUND;
    const impedance = rho * c * radiationArea;

    return Math.sqrt(2 * power / impedance);
}

/**
 * 4th-order vented box transfer function
 *
 * Status: NOT YET IMPLEMENTED
 *
 * The complete ported box has a 4th-order highpass characteristic
 * requiring complex pole-zero analysis.
 *
 * Source: Small 1973, Part III, Equations for complete system response
 *
 * @throws {Error} Not yet implemented
 */
export function calculatePortedResponse() {
    throw new Error(
        'small-1973.calculatePortedResponse: Not yet implemented. ' +
        'Requires 4th-order transfer function implementation. ' +
        'See ROADMAP.md'
    );
}
