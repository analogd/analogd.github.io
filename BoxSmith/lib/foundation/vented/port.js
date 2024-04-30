/**
 * Port Calculations - Geometry, Velocity, Turbulence
 *
 * Port-specific calculations for vented box systems.
 * These functions handle the physical implementation of a port vent,
 * separate from the universal 4th-order vented box response.
 *
 * Sources:
 * - Small 1973, Part I: Port geometry and Helmholtz resonance
 * - Small 1973, Part II: Port velocity limits and compression
 *
 * Coverage:
 * - Port length calculation (Helmholtz resonator)
 * - End correction factors by geometry
 * - Air velocity and turbulence assessment
 * - Reynolds and Mach number calculations
 */

import { SPEED_OF_SOUND, AIR_DENSITY } from '../constants.js';

// ============================================================================
// END CORRECTION FACTORS
// ============================================================================

/**
 * Port end correction factors by geometry
 *
 * Empirical correction for effective acoustic length of port.
 * Accounts for air mass moving beyond physical port ends.
 *
 * Source: Small 1973, Part I, Equation (15), p. 317
 */
export const PORT_END_CORRECTION = {
    circular_unflanged: 0.732,  // Small's original value
    circular_flanged: 0.82,     // One or both ends flanged
    rectangular: 0.75,          // Rectangular cross-section
    slot: 0.65                  // High aspect ratio slot
};

// ============================================================================
// PORT GEOMETRY
// ============================================================================

/**
 * Calculate circular port area
 *
 * Formula: A = pi * (D/2)^2
 *
 * @param {number} diameter - Port diameter (m)
 * @returns {number} Port cross-sectional area (m^2)
 */
export function calculateCircularArea(diameter) {
    const radius = diameter / 2;
    return Math.PI * radius * radius;
}

/**
 * Calculate rectangular port dimensions
 *
 * Returns area and effective diameter for end correction.
 * Effective diameter = diameter of circular port with same area.
 *
 * @param {number} width - Port width (m)
 * @param {number} height - Port height (m)
 * @returns {Object} {area: m^2, effectiveDiameter: m}
 */
export function calculateRectangularDimensions(width, height) {
    const area = width * height;
    const effectiveDiameter = Math.sqrt(4 * area / Math.PI);
    return { area, effectiveDiameter };
}

/**
 * Calculate equivalent diameter for any port shape
 *
 * Formula: D = sqrt(4 * A / pi)
 *
 * For use in end correction calculation.
 * Gives diameter of circular port with same area.
 *
 * @param {number} area - Port cross-sectional area (m^2)
 * @returns {number} Equivalent diameter (m)
 */
export function calculateEquivalentDiameter(area) {
    return Math.sqrt(4 * area / Math.PI);
}

// ============================================================================
// PORT LENGTH CALCULATION
// ============================================================================

/**
 * Calculate required port length for Helmholtz resonator tuning
 *
 * Formula: Lv = (c^2 / (4*pi^2)) * (Sv / (Vb * Fb^2)) - k*D
 *
 * Where:
 *   c = speed of sound (343 m/s at 20C)
 *   Sv = port area (m^2)
 *   Vb = box internal volume (m^3)
 *   Fb = desired tuning frequency (Hz)
 *   k = end correction factor
 *   D = effective port diameter (m)
 *
 * The Helmholtz resonator models the port as an acoustic mass (air plug)
 * vibrating against the compliance (springiness) of air in the box.
 *
 * Source: Small 1973, Part I, Equation (15), p. 317
 *
 * @param {Object} params
 * @param {number} params.fb - Target tuning frequency (Hz)
 * @param {number} params.vb - Box internal volume (m^3)
 * @param {number} params.area - Port cross-sectional area (m^2)
 * @param {number} params.effectiveDiameter - For end correction (m)
 * @param {string} [params.type='circular_unflanged'] - Port type for end correction
 * @returns {number} Required port length (m)
 * @throws {Error} If resulting length is negative (port too small)
 */
export function calculateLength({ fb, vb, area, effectiveDiameter, type = 'circular_unflanged' }) {
    const c = SPEED_OF_SOUND;
    const k = PORT_END_CORRECTION[type] || PORT_END_CORRECTION.circular_unflanged;

    const cSquared = c * c;
    const fourPiSquared = 4 * Math.PI * Math.PI;
    const fbSquared = fb * fb;

    const rawLength = (cSquared / fourPiSquared) * (area / (vb * fbSquared));
    const endCorrection = k * effectiveDiameter;
    const length = rawLength - endCorrection;

    if (length <= 0) {
        throw new Error(
            `Port area ${(area * 10000).toFixed(1)}cm^2 is too small for ` +
            `Vb=${(vb * 1000).toFixed(0)}L, Fb=${fb}Hz. ` +
            `Try a larger port or different tuning.`
        );
    }

    return length;
}

/**
 * Calculate resulting tuning frequency from port dimensions
 *
 * Inverse of calculateLength - given dimensions, find Fb.
 *
 * Formula: Fb = (c / 2*pi) * sqrt(Sv / (Vb * Leff))
 *
 * Where Leff = L + k*D (physical length + end correction)
 *
 * @param {Object} params
 * @param {number} params.length - Port physical length (m)
 * @param {number} params.vb - Box volume (m^3)
 * @param {number} params.area - Port cross-sectional area (m^2)
 * @param {number} params.effectiveDiameter - For end correction (m)
 * @param {string} [params.type='circular_unflanged'] - Port type
 * @returns {number} Tuning frequency (Hz)
 */
export function calculateTuningFromDimensions({ length, vb, area, effectiveDiameter, type = 'circular_unflanged' }) {
    const c = SPEED_OF_SOUND;
    const k = PORT_END_CORRECTION[type] || PORT_END_CORRECTION.circular_unflanged;

    const effectiveLength = length + k * effectiveDiameter;

    if (effectiveLength <= 0) {
        throw new Error('Effective port length must be positive');
    }

    return (c / (2 * Math.PI)) * Math.sqrt(area / (vb * effectiveLength));
}

/**
 * Calculate minimum port area for given tuning
 *
 * Returns the minimum area that won't result in negative length.
 * Useful for validation and suggesting port sizes.
 *
 * @param {number} fb - Target tuning frequency (Hz)
 * @param {number} vb - Box volume (m^3)
 * @param {string} [type='circular_unflanged'] - Port type
 * @returns {number} Minimum port area (m^2)
 */
export function calculateMinimumArea(fb, vb, type = 'circular_unflanged') {
    const c = SPEED_OF_SOUND;
    const k = PORT_END_CORRECTION[type] || PORT_END_CORRECTION.circular_unflanged;

    // At minimum area, length = 0, so:
    // rawLength = endCorrection
    // (c^2 / 4*pi^2) * (A / (Vb * Fb^2)) = k * sqrt(4*A / pi)
    //
    // This is transcendental - solve iteratively
    let area = 0.001;  // Start at 10 cm^2
    for (let i = 0; i < 50; i++) {
        const d = calculateEquivalentDiameter(area);
        const rawLength = (c * c / (4 * Math.PI * Math.PI)) * (area / (vb * fb * fb));
        const endCorr = k * d;

        if (rawLength > endCorr * 1.1) {
            // Found a working area with 10% margin
            return area;
        }
        area *= 1.2;  // Increase by 20%
    }

    return area;
}

// ============================================================================
// PORT VELOCITY & TURBULENCE
// ============================================================================

/**
 * Velocity limits for port design
 *
 * Sources:
 * - Young 1975 via Salvatti 2002: "maximum velocity of about 10 m/s
 *   before serious sonic detriment occurs" (straight ports)
 * - Salvatti 2002: validates ~10 m/s for straight, higher for flared
 * - Bezzola 2019: optimally flared ports can go 10-16 dB louder
 *
 * Note: The Reynolds-based limit (Re=50k) is often more restrictive
 * for larger port diameters. Use both velocity AND Reynolds checks.
 */
export const VELOCITY_LIMITS = {
    straight_limit: 10,    // m/s - Young 1975 limit for straight ports
    quiet: 15,             // m/s - inaudible port noise (flared)
    acceptable: 20,        // m/s - minor chuffing at high power
    maximum_straight: 25,  // m/s - absolute max for straight port
    maximum_flared: 34     // m/s - flared ports tolerate higher velocity
};

/**
 * Mach number thresholds for port turbulence
 * Source: Empirical, validated against commercial designs
 */
export const MACH_THRESHOLDS = {
    safe: 0.05,            // Below this: negligible compression
    caution: 0.08,         // Audible compression possible
    severe: 0.1            // Severe chuffing, unacceptable
};

/**
 * Reynolds number thresholds for turbulence assessment
 *
 * Source: Salvatti, Devantier & Button "Maximizing Performance from
 * Loudspeaker Ports" JAES 2002, Section 3.2
 *
 * "All designs seem to hit a wall near a Reynolds number of about
 * 50,000-100,000. This number was also confirmed by Vanderkooy."
 */
export const REYNOLDS_THRESHOLDS = {
    linear: 50000,           // Below this: linear operation (< 1 dB compression)
    turbulent: 100000        // Above this: fully turbulent (> 6 dB compression)
};

/**
 * Calculate port air velocity from volume velocity
 *
 * Formula: v = U / Sv
 *
 * Where:
 *   U = volume velocity (m^3/s)
 *   Sv = port area (m^2)
 *
 * Source: Small 1973, Part II, Section 6, p. 442
 *
 * @param {number} volumeVelocity - Volume velocity through port (m^3/s)
 * @param {number} portArea - Port cross-sectional area (m^2)
 * @returns {number} Air velocity in port (m/s)
 */
export function calculateAirVelocity(volumeVelocity, portArea) {
    if (portArea <= 0) {
        throw new Error('Port area must be positive');
    }
    return volumeVelocity / portArea;
}

/**
 * Calculate Reynolds number for turbulence assessment
 *
 * Re = (v * D) / nu
 *
 * Where:
 *   v = air velocity (m/s)
 *   D = port diameter (m)
 *   nu = kinematic viscosity of air (~1.5e-5 m^2/s at 20C)
 *
 * Turbulence thresholds:
 *   Re < 2,300: Laminar flow (quiet)
 *   Re 2,300 - 4,000: Transitional
 *   Re > 4,000: Turbulent (normal for ports)
 *   Re > 50,000: Severe turbulence, significant noise
 *
 * @param {number} velocity - Air velocity (m/s)
 * @param {number} diameter - Port diameter or effective diameter (m)
 * @returns {number} Reynolds number (dimensionless)
 */
export function calculateReynoldsNumber(velocity, diameter) {
    const kinematicViscosity = 1.5e-5;  // m^2/s for air at 20C
    return (velocity * diameter) / kinematicViscosity;
}

/**
 * Calculate Mach number
 *
 * Mach = v / c
 *
 * Thresholds:
 *   Mach < 0.03: Negligible compressibility
 *   Mach 0.03 - 0.05: Minor compression effects
 *   Mach > 0.05: Audible compression/chuffing
 *   Mach > 0.1: Severe - likely distortion
 *
 * @param {number} velocity - Air velocity (m/s)
 * @returns {number} Mach number (dimensionless)
 */
export function calculateMachNumber(velocity) {
    return velocity / SPEED_OF_SOUND;
}

/**
 * Assess port turbulence and noise risk
 *
 * @param {number} velocity - Peak air velocity (m/s)
 * @param {number} diameter - Port effective diameter (m)
 * @param {boolean} flared - Whether port has flared ends
 * @returns {Object} Assessment with severity and recommendations
 */
export function assessTurbulence(velocity, diameter, flared = false) {
    const reynolds = calculateReynoldsNumber(velocity, diameter);
    const mach = calculateMachNumber(velocity);
    const limit = flared ? VELOCITY_LIMITS.maximum_flared : VELOCITY_LIMITS.maximum_straight;

    let severity, message;

    if (velocity <= VELOCITY_LIMITS.quiet) {
        severity = 'excellent';
        message = 'Port noise will be inaudible';
    } else if (velocity <= VELOCITY_LIMITS.acceptable) {
        severity = 'good';
        message = 'Minor port noise at high power levels';
    } else if (velocity <= limit) {
        severity = 'acceptable';
        message = flared
            ? 'Flared port handles this velocity adequately'
            : 'Audible chuffing likely at high power - consider flared port';
    } else {
        severity = 'poor';
        message = 'Excessive port velocity - increase port area or add ports';
    }

    return {
        velocity,
        reynolds,
        mach,
        limit,
        overLimit: velocity > limit,
        severity,
        message
    };
}

// ============================================================================
// PORT FRICTION LOSSES
// ============================================================================

/**
 * Calculate port Q from viscous friction losses
 *
 * Formula: QP = (rho * c * D^2) / (8 * mu * L * sqrt(2*pi*f))
 *
 * Where:
 *   rho = air density (1.204 kg/m^3)
 *   c = speed of sound (343 m/s)
 *   D = port diameter (m)
 *   L = port length (m)
 *   mu = dynamic viscosity of air (~1.81e-5 Pa*s at 20C)
 *   f = frequency (Hz)
 *
 * Typical values:
 *   Clean circular port (10cm dia, 20cm length): QP ~ 80-100
 *   Small port (5cm dia): QP ~ 40-60
 *   Port with screen/grill: QP ~ 20-40
 *   Slot port: QP ~ 30-60
 *
 * Source: Small 1973, Part I, Equation (18), p. 319
 *
 * @param {number} diameter - Port diameter (m)
 * @param {number} length - Port length (m)
 * @param {number} fb - Box tuning frequency (Hz)
 * @returns {number} Port friction Q
 */
export function calculateFrictionQ(diameter, length, fb) {
    const rho = AIR_DENSITY;
    const c = SPEED_OF_SOUND;
    const mu = 1.81e-5;  // Pa*s (dynamic viscosity of air at 20C)

    // Viscous losses scale with sqrt(f) (boundary layer thickness)
    const sqrtFreqTerm = Math.sqrt(2 * Math.PI * fb);

    // QP = (rho * c * D^2) / (8 * mu * L * sqrt(2*pi*f))
    const QP = (rho * c * diameter * diameter) / (8 * mu * length * sqrtFreqTerm);

    return QP;
}

// ============================================================================
// PORT VOLUME VELOCITY (Transfer Function)
// ============================================================================

/**
 * Calculate port volume velocity transfer function (complex)
 *
 * The port volume velocity has a notch at Fs (driver resonance).
 * Above Fs, the port contributes less as the driver takes over.
 *
 * Formula: Hp(s) = s^2*TB^2 * (TS^2*s^2 + TS*s/QT + 1) / D(s)
 *
 * Note: U_cone + U_port = U_total, so the two numerators add
 * to give the total output numerator s^4*TB^2*TS^2.
 *
 * Source: Derived from Small 1973, Figure 2 network analysis
 *
 * @param {number} f - Frequency (Hz)
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @param {number} qt - Total driver Q (Qts)
 * @param {number} ql - Enclosure Q (default: Infinity for lossless)
 * @returns {Object} {real, imag, magnitude, phase}
 */
export function calculateVolumeVelocityComplex(f, fs, fb, alpha, qt, ql = Infinity) {
    const omega = 2 * Math.PI * f;
    const TB = 1 / (2 * Math.PI * fb);
    const TS = 1 / (2 * Math.PI * fs);

    // === NUMERATOR: s^2*TB^2 * (TS^2*s^2 + TS*s/QT + 1) ===
    // Notch factor at Fs instead of Fb

    const notch_real = 1 - omega * omega * TS * TS;
    const notch_imag = omega * TS / qt;

    // s^2*TB^2 is pure real negative: -omega^2*TB^2
    const s2tb2 = -omega * omega * TB * TB;

    const num_real = s2tb2 * notch_real;
    const num_imag = s2tb2 * notch_imag;

    // === DENOMINATOR: Same as Equation 13 ===
    const s4_real = Math.pow(omega, 4) * TB * TB * TS * TS;
    const s2_real = -Math.pow(omega, 2) * ((alpha + 1) * TB * TB + TB * TS / (ql * qt) + TS * TS);
    const s0_real = 1;
    const denom_real = s4_real + s2_real + s0_real;

    const s3_imag = -Math.pow(omega, 3) * (TB * TB * TS / qt + TB * TS * TS / ql);
    const s1_imag = omega * (TB / ql + TS / qt);
    const denom_imag = s3_imag + s1_imag;

    const denom_mag_sq = denom_real * denom_real + denom_imag * denom_imag;

    const result_real = (num_real * denom_real + num_imag * denom_imag) / denom_mag_sq;
    const result_imag = (num_imag * denom_real - num_real * denom_imag) / denom_mag_sq;

    const magnitude = Math.sqrt(result_real * result_real + result_imag * result_imag);
    const phase = Math.atan2(result_imag, result_real);

    return { real: result_real, imag: result_imag, magnitude, phase };
}

/**
 * Calculate port volume velocity magnitude (normalized)
 *
 * @param {number} f - Frequency (Hz)
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @param {number} qt - Total driver Q (Qts)
 * @param {number} ql - Enclosure Q (default: Infinity)
 * @returns {number} Normalized magnitude (0 to ~1)
 */
export function calculateVolumeVelocityMagnitude(f, fs, fb, alpha, qt, ql = Infinity) {
    return calculateVolumeVelocityComplex(f, fs, fb, alpha, qt, ql).magnitude;
}
