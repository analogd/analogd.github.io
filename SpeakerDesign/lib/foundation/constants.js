// Physical constants for loudspeaker calculations
// All values in SI units

/**
 * Speed of sound in air at 20°C (293.15 K)
 *
 * Source: Standard atmospheric conditions
 * Value: c ≈ 331.3 + 0.606 × T(°C) = 343.3 m/s at 20°C
 *
 * Commonly rounded to 343 m/s or 344 m/s in literature
 *
 * @constant {number}
 * @unit m/s
 */
export const SPEED_OF_SOUND = 343;

/**
 * Air density at 20°C (293.15 K) and 101.325 kPa
 *
 * Source: Standard atmospheric conditions
 * Value: ρ₀ = 1.204 kg/m³ at 20°C
 *
 * Often approximated as 1.18 kg/m³ or 1.2 kg/m³ in calculations
 *
 * @constant {number}
 * @unit kg/m³
 */
export const AIR_DENSITY = 1.204;

/**
 * Atmospheric pressure at sea level
 *
 * Source: Standard atmospheric pressure
 * Value: 101.325 kPa = 101325 Pa
 *
 * @constant {number}
 * @unit Pa (N/m²)
 */
export const ATMOSPHERIC_PRESSURE = 101325;

/**
 * Reference acoustic pressure (threshold of hearing at 1 kHz)
 *
 * Source: SPL reference standard
 * Value: 20 μPa = 2×10⁻⁵ Pa
 *
 * Used in SPL calculations: SPL = 20×log₁₀(P/P_ref)
 *
 * @constant {number}
 * @unit Pa
 */
export const REFERENCE_PRESSURE = 2e-5;
