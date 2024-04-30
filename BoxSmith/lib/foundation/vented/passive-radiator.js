/**
 * Passive Radiator Calculations
 *
 * PR-specific calculations for vented box systems.
 * A passive radiator is acoustically equivalent to a port when
 * PR compliance << box compliance (acts as pure mass).
 *
 * Source: Small 1974 "Passive-Radiator Loudspeaker Systems"
 *
 * Key insight: The PR volume velocity transfer function is IDENTICAL
 * to the port volume velocity transfer function. The math doesn't care
 * whether it's air mass (port) or cone mass (PR) doing the moving.
 *
 * The differences are:
 * - Tuning: PR uses cone mass, port uses air mass
 * - Limits: PR has excursion limit, port has velocity limit
 * - Losses: PR has mechanical Q (Qmp), port has friction Q (Qp)
 *
 * Coverage:
 * - Box acoustic compliance
 * - Compliance ratio delta (PR compliance / box compliance)
 * - Tuning frequency from PR mass
 * - Required PR mass for target tuning
 * - PR excursion transfer function
 */

import { SPEED_OF_SOUND, AIR_DENSITY } from '../constants.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Typical PR mechanical Q
 *
 * PRs have higher Q than drivers (no motor losses).
 * Stiffer suspensions have higher Qmp.
 *
 * Typical range: 3-10
 * Very stiff PRs: 15-30
 */
export const TYPICAL_QMP = 5;

// ============================================================================
// BOX COMPLIANCE
// ============================================================================

/**
 * Calculate acoustic compliance of box
 *
 * Cab = Vb / (rho * c^2)
 *
 * This is the "springiness" of the air in the box.
 * Larger box = more compliance = softer spring.
 *
 * @param {number} vb - Box volume (m^3)
 * @returns {number} Acoustic compliance (m^5/N or m^3/Pa)
 */
export function calculateBoxAcousticCompliance(vb) {
    const rho = AIR_DENSITY;
    const c = SPEED_OF_SOUND;
    return vb / (rho * c * c);
}

/**
 * Calculate PR acoustic compliance from mechanical compliance
 *
 * Cap = Cmp * Sd^2
 *
 * Converts mechanical compliance (m/N) to acoustic compliance (m^5/N)
 * by multiplying by area squared.
 *
 * @param {number} cmp - PR mechanical compliance (m/N)
 * @param {number} sd - PR effective area (m^2)
 * @returns {number} PR acoustic compliance (m^5/N)
 */
export function calculatePRAcousticCompliance(cmp, sd) {
    return cmp * sd * sd;
}

/**
 * Calculate PR compliance ratio delta
 *
 * delta = Cap / Cab = (Cmp * Sd^2) / Cab
 *
 * This ratio determines how much the PR compliance affects tuning:
 *   delta << 1: PR acts like pure mass (ported-equivalent behavior)
 *   delta ~ 1: PR compliance significantly affects tuning
 *   delta >> 1: Box-dominated (unusual, very soft PR)
 *
 * Most commercial PRs have delta < 0.3, so they behave like ports.
 *
 * @param {number} cmp - PR mechanical compliance (m/N)
 * @param {number} sd - PR effective area (m^2)
 * @param {number} vb - Box volume (m^3)
 * @returns {number} Compliance ratio (dimensionless)
 */
export function calculateDelta(cmp, sd, vb) {
    if (cmp <= 0) return 0;  // Infinitely stiff PR = pure mass
    const cap = calculatePRAcousticCompliance(cmp, sd);
    const cab = calculateBoxAcousticCompliance(vb);
    return cap / cab;
}

// ============================================================================
// PR TUNING
// ============================================================================

/**
 * Calculate tuning frequency from PR parameters
 *
 * fb = 1 / (2*pi * sqrt(Map * Ctotal))
 *
 * Where:
 *   Map = Mmp / Sd^2 (acoustic mass of PR)
 *   Ctotal = Cab + Cap (box + PR compliance in parallel)
 *
 * For stiff PRs (Cmp ~ 0), this simplifies to:
 *   fb = 1 / (2*pi * sqrt(Map * Cab))
 *   fb = (c / 2*pi) * sqrt(Sd^2 / (Mmp * Vb))
 *
 * @param {Object} params
 * @param {number} params.mmp - PR moving mass (kg)
 * @param {number} params.cmp - PR mechanical compliance (m/N), can be 0
 * @param {number} params.sd - PR effective area (m^2)
 * @param {number} params.vb - Box volume (m^3)
 * @returns {number} Tuning frequency (Hz)
 */
export function calculateTuningFrequency({ mmp, cmp = 0, sd, vb }) {
    if (mmp <= 0) {
        throw new Error('PR moving mass must be positive');
    }
    if (sd <= 0) {
        throw new Error('PR area must be positive');
    }
    if (vb <= 0) {
        throw new Error('Box volume must be positive');
    }

    // Acoustic mass of PR
    const map = mmp / (sd * sd);

    // Total acoustic compliance (box + PR in parallel)
    const cab = calculateBoxAcousticCompliance(vb);
    const cap = cmp > 0 ? calculatePRAcousticCompliance(cmp, sd) : 0;
    const ctotal = cab + cap;

    return 1 / (2 * Math.PI * Math.sqrt(map * ctotal));
}

/**
 * Calculate required PR mass for target tuning frequency
 *
 * Solves: Mmp = Sd^2 / ((2*pi*fb)^2 * Ctotal)
 *
 * Use this to determine what PR mass is needed for a desired Fb.
 *
 * @param {Object} params
 * @param {number} params.fb - Target tuning frequency (Hz)
 * @param {number} params.cmp - PR mechanical compliance (m/N), can be 0
 * @param {number} params.sd - PR effective area (m^2)
 * @param {number} params.vb - Box volume (m^3)
 * @returns {number} Required PR moving mass (kg)
 */
export function calculateRequiredMass({ fb, cmp = 0, sd, vb }) {
    if (fb <= 0) {
        throw new Error('Tuning frequency must be positive');
    }
    if (sd <= 0) {
        throw new Error('PR area must be positive');
    }
    if (vb <= 0) {
        throw new Error('Box volume must be positive');
    }

    const cab = calculateBoxAcousticCompliance(vb);
    const cap = cmp > 0 ? calculatePRAcousticCompliance(cmp, sd) : 0;
    const ctotal = cab + cap;

    const omegaB = 2 * Math.PI * fb;
    const map = 1 / (omegaB * omegaB * ctotal);

    // Convert acoustic mass to mechanical mass
    return map * sd * sd;
}

/**
 * Calculate how much mass to add/remove for tuning adjustment
 *
 * PRs often have adjustable mass (weights can be added).
 * This calculates the mass delta needed to shift tuning.
 *
 * Note: currentFb is accepted for API context but not used. The adjustment
 * is computed from actual currentMmp vs required mass for targetFb.
 *
 * @param {Object} params
 * @param {number} params.currentMmp - Current PR mass (kg)
 * @param {number} params.currentFb - Current tuning (Hz) - for API context only
 * @param {number} params.targetFb - Desired tuning (Hz)
 * @param {number} params.sd - PR effective area (m^2)
 * @param {number} params.vb - Box volume (m^3)
 * @param {number} [params.cmp=0] - PR compliance (m/N)
 * @returns {number} Mass adjustment needed (kg, positive = add, negative = remove)
 */
export function calculateMassAdjustment({ currentMmp, currentFb: _currentFb, targetFb, sd, vb, cmp = 0 }) {
    const targetMass = calculateRequiredMass({ fb: targetFb, cmp, sd, vb });
    return targetMass - currentMmp;
}

// ============================================================================
// PR EXCURSION (Transfer Function)
// ============================================================================

/**
 * Calculate PR volume velocity transfer function (complex)
 *
 * The PR volume velocity transfer function is IDENTICAL to port.
 * At low frequencies, the PR handles most acoustic output.
 * Has a notch at Fs (driver resonance) where driver takes over.
 *
 * Formula: Hpr(s) = s^2*TB^2 * (TS^2*s^2 + TS*s/QT + 1) / D(s)
 *
 * Source: Small 1974, derived from network analysis
 *
 * @param {number} f - Frequency (Hz)
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @param {number} qt - Total driver Q (Qts)
 * @param {number} qmp - PR mechanical Q (default: TYPICAL_QMP)
 * @returns {Object} {real, imag, magnitude, phase}
 */
export function calculateVolumeVelocityComplex(f, fs, fb, alpha, qt, qmp = TYPICAL_QMP) {
    const omega = 2 * Math.PI * f;
    const TB = 1 / (2 * Math.PI * fb);
    const TS = 1 / (2 * Math.PI * fs);

    // === NUMERATOR: s^2*TB^2 * (TS^2*s^2 + TS*s/QT + 1) ===
    // Notch at Fs (driver resonance)

    const notch_real = 1 - omega * omega * TS * TS;
    const notch_imag = omega * TS / qt;

    const s2tb2 = -omega * omega * TB * TB;

    const num_real = s2tb2 * notch_real;
    const num_imag = s2tb2 * notch_imag;

    // === DENOMINATOR: 4th-order with Qmp for losses ===
    // Same structure as port, but using qmp instead of ql
    const s4_real = Math.pow(omega, 4) * TB * TB * TS * TS;
    const s2_real = -Math.pow(omega, 2) * ((alpha + 1) * TB * TB + TB * TS / (qmp * qt) + TS * TS);
    const s0_real = 1;
    const denom_real = s4_real + s2_real + s0_real;

    const s3_imag = -Math.pow(omega, 3) * (TB * TB * TS / qt + TB * TS * TS / qmp);
    const s1_imag = omega * (TB / qmp + TS / qt);
    const denom_imag = s3_imag + s1_imag;

    const denom_mag_sq = denom_real * denom_real + denom_imag * denom_imag;

    const result_real = (num_real * denom_real + num_imag * denom_imag) / denom_mag_sq;
    const result_imag = (num_imag * denom_real - num_real * denom_imag) / denom_mag_sq;

    const magnitude = Math.sqrt(result_real * result_real + result_imag * result_imag);
    const phase = Math.atan2(result_imag, result_real);

    return { real: result_real, imag: result_imag, magnitude, phase };
}

/**
 * Calculate PR volume velocity magnitude (normalized)
 *
 * @param {number} f - Frequency (Hz)
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @param {number} qt - Total driver Q (Qts)
 * @param {number} qmp - PR mechanical Q
 * @returns {number} Normalized magnitude
 */
export function calculateVolumeVelocityMagnitude(f, fs, fb, alpha, qt, qmp = TYPICAL_QMP) {
    return calculateVolumeVelocityComplex(f, fs, fb, alpha, qt, qmp).magnitude;
}

/**
 * Calculate PR displacement transfer function (normalized)
 *
 * X_pr = V_pr / (Sd * omega)
 *
 * This is the key function for PR excursion-limited power calculations.
 * The PR moves most at low frequencies, with excursion rising rapidly
 * below Fb (4th-order rolloff = +24 dB/octave excursion increase).
 *
 * @param {number} f - Frequency (Hz)
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} fb - Box tuning frequency (Hz)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @param {number} qt - Total driver Q (Qts)
 * @param {number} qmp - PR mechanical Q
 * @returns {number} Normalized displacement magnitude
 */
export function calculateDisplacementTransfer(f, fs, fb, alpha, qt, qmp = TYPICAL_QMP) {
    const omega = 2 * Math.PI * f;
    const velocityMag = calculateVolumeVelocityMagnitude(f, fs, fb, alpha, qt, qmp);

    // Displacement = velocity / omega
    // (velocity is volume velocity, need to divide by area to get linear velocity,
    //  but since we're normalized, the area cancels out)
    return velocityMag / omega;
}

/**
 * Assess PR excursion safety
 *
 * @param {number} excursion - Peak PR excursion (m)
 * @param {number} xmax - PR excursion limit (m)
 * @returns {Object} Assessment with severity and margin
 */
export function assessExcursion(excursion, xmax) {
    const ratio = excursion / xmax;
    const marginDb = 20 * Math.log10(xmax / excursion);

    let severity, message;

    if (ratio < 0.5) {
        severity = 'excellent';
        message = 'PR operating well within limits';
    } else if (ratio < 0.8) {
        severity = 'good';
        message = 'PR has adequate headroom';
    } else if (ratio < 1.0) {
        severity = 'caution';
        message = 'PR approaching excursion limit';
    } else {
        severity = 'danger';
        message = 'PR exceeds Xmax - reduce power or raise HPF';
    }

    return {
        excursion,
        xmax,
        ratio,
        marginDb: marginDb > 0 ? marginDb : 0,
        overLimit: ratio >= 1.0,
        severity,
        message
    };
}
