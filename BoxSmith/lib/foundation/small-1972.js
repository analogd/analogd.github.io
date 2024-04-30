// Small, Richard H. "Direct-Radiator Loudspeaker System Analysis"
// Journal of the Audio Engineering Society (JAES)
// Vol. 20, No. 5, June 1972, pp. 383-395
//
// Sealed (closed-box) loudspeaker system calculations
//
// ⚠️  IMPORTANT: When adding/removing functions, update lib/foundation/metadata.js

import { SPEED_OF_SOUND, AIR_DENSITY } from './constants.js';

// ============================================================================
// PARAMETER VALIDATION
// ============================================================================

/**
 * Validate driver Thiele-Small parameters
 *
 * Thiele-Small theory assumes:
 * - Pistonic driver behavior (no cone breakup)
 * - Linear suspension (small signal)
 * - Direct radiator (not horn-loaded)
 *
 * Valid ranges based on Small 1972 and practical experience:
 * - Fs: 15-500 Hz (below 15Hz: not pistonic, above 500Hz: breakup modes)
 * - Qts: 0.2-1.5 (below 0.2: overdamped/unstable, above 1.5: underdamped/ringing)
 * - Vas: Must be positive (physical constraint)
 * - Qes: Must be positive and typically > Qts (electrical losses)
 *
 * Source: Small 1972 applies to direct radiators only
 *         Dickason 2006, Chapter 3 for practical ranges
 *
 * @param {number} fs - Free-air resonance (Hz)
 * @param {number} qts - Total Q factor
 * @param {number} vas - Equivalent compliance volume (m³)
 * @param {number} qes - Electrical Q factor (optional)
 * @throws {Error} If parameters are outside valid ranges
 */
export function validateDriverParameters(fs, qts, vas, qes = null) {
    if (fs < 15 || fs > 500) {
        throw new Error(
            `Fs=${fs}Hz outside valid range (15-500Hz). ` +
            `Thiele-Small parameters assume pistonic behavior without cone breakup. ` +
            `Below 15Hz or above 500Hz, the model may not be accurate. ` +
            `Source: Small 1972 applies to direct radiators.`
        );
    }

    if (qts < 0.2 || qts > 1.5) {
        throw new Error(
            `Qts=${qts.toFixed(2)} outside practical range (0.2-1.5). ` +
            `Very low Qts (<0.2) indicates overdamping or measurement error. ` +
            `Very high Qts (>1.5) indicates severe underdamping with excessive ringing. ` +
            `Source: Dickason 2006, Chapter 3.`
        );
    }

    if (vas <= 0) {
        throw new Error(
            `Vas=${vas} must be positive. ` +
            `Vas represents equivalent air compliance volume and must be > 0.`
        );
    }

    if (qes !== null) {
        if (qes <= 0) {
            throw new Error(
                `Qes=${qes} must be positive. ` +
                `Qes represents electrical damping and must be > 0.`
            );
        }
        if (qes < qts) {
            throw new Error(
                `Qes=${qes.toFixed(2)} cannot be less than Qts=${qts.toFixed(2)}. ` +
                `By definition: 1/Qts = 1/Qes + 1/Qms, so Qes ≥ Qts. ` +
                `Check your T/S parameters.`
            );
        }
    }
}

/**
 * Validate box volume
 *
 * @param {number} vb - Box volume (m³)
 * @throws {Error} If volume is invalid
 */
export function validateBoxVolume(vb) {
    if (vb <= 0) {
        throw new Error(`Box volume Vb=${vb} must be positive.`);
    }
    if (vb > 10) {
        throw new Error(
            `Box volume Vb=${vb}m³ (${vb * 1000}L) is unusually large. ` +
            `Are you sure this is correct? Typical subwoofers are < 1000L.`
        );
    }
}

/**
 * Calculate compliance ratio (alpha) for sealed enclosure
 *
 * Formula: α = Vas / Vb
 *
 * This ratio determines how much the enclosure compliance affects
 * the driver's free-air compliance.
 *
 * Source: Small 1972, Equation 5
 *
 * @param {number} vas - Driver equivalent compliance volume (m³)
 * @param {number} vb - Box internal volume (m³)
 * @returns {number} Compliance ratio (dimensionless)
 */
export function calculateAlpha(vas, vb) {
    return vas / vb;
}

/**
 * Calculate system resonance frequency for sealed enclosure
 *
 * Formula: Fc = Fs × √(1 + α)
 * Where: α = Vas / Vb
 *
 * The box increases the system resonance relative to the driver's
 * free-air resonance by stiffening the suspension.
 *
 * Source: Small 1972, Equation 6
 *
 * @param {number} fs - Driver free-air resonance frequency (Hz)
 * @param {number} alpha - Compliance ratio (dimensionless)
 * @returns {number} System resonance frequency Fc (Hz)
 */
export function calculateFc(fs, alpha) {
    return fs * Math.sqrt(1 + alpha);
}

/**
 * Calculate total system quality factor for sealed enclosure
 *
 * Formula: Qtc = Qts × √(α + 1)
 * Where: α = Vas / Vb
 *
 * The box increases damping (Q) proportionally to the resonance shift.
 *
 * Source: Small 1972, Equation 7
 *
 * @param {number} qts - Driver total quality factor (dimensionless)
 * @param {number} alpha - Compliance ratio (dimensionless)
 * @returns {number} System total quality factor Qtc (dimensionless)
 */
export function calculateQtc(qts, alpha) {
    return qts * Math.sqrt(1 + alpha);
}

/**
 * Calculate -3dB frequency (F3) for sealed enclosure
 *
 * Derived from the 2nd-order highpass transfer function by finding
 * the frequency where |H(f)| = 1/√2 (-3dB).
 *
 * Formula: F3 = Fc / √[(1 - 1/(2Qtc²)) + √((1 - 1/(2Qtc²))² + 1)]
 *
 * Special case: For Butterworth alignment (Qtc = 0.707), F3 = Fc exactly.
 *
 * Source: Derived from Small 1972, Equation 10 (transfer function)
 *
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor (dimensionless)
 * @returns {number} -3dB frequency F3 (Hz)
 */
export function calculateF3(fc, qtc) {
    const term = 1 - 1 / (2 * qtc * qtc);
    const sqrt = Math.sqrt(term * term + 1);
    return fc / Math.sqrt(term + sqrt);
}

/**
 * Calculate normalized frequency response magnitude for sealed enclosure
 *
 * Formula: |H(f)| = (f/Fc)² / √[(1 - (f/Fc)²)² + (f/Fc)² / Qtc²]
 *
 * This is the 2nd-order highpass transfer function magnitude.
 * Returns normalized magnitude (1.0 = 0dB in passband).
 *
 * Source: Small 1972, Equation 10
 *
 * @param {number} frequency - Frequency to evaluate (Hz)
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor (dimensionless)
 * @returns {number} Normalized magnitude (dimensionless, 0 to ~1+)
 */
export function calculateResponseMagnitude(frequency, fc, qtc) {
    const ratio = frequency / fc;
    const ratio2 = ratio * ratio;

    const numerator = ratio2;
    const denominator = Math.sqrt(
        Math.pow(1 - ratio2, 2) + ratio2 / (qtc * qtc)
    );

    return numerator / denominator;
}

/**
 * Calculate response in dB for sealed enclosure
 *
 * Converts normalized magnitude to decibels relative to passband.
 *
 * Formula: Response(dB) = 20 × log₁₀(|H(f)|)
 *
 * Source: Standard dB conversion applied to Small 1972, Eq. 10
 *
 * @param {number} frequency - Frequency to evaluate (Hz)
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor (dimensionless)
 * @returns {number} Response in dB (negative below passband, 0 at passband)
 */
export function calculateResponseDb(frequency, fc, qtc) {
    const magnitude = calculateResponseMagnitude(frequency, fc, qtc);
    return 20 * Math.log10(magnitude);
}

/**
 * Calculate reference efficiency (η₀) for direct-radiator loudspeaker
 *
 * Formula: η₀ = (4π²/c³) × (Fs³ × Vas / Qes)
 *
 * This is the half-space reference efficiency, the fraction of electrical
 * input power converted to acoustic power at the reference frequency.
 *
 * Typically 0.001 to 0.05 (0.1% to 5%) for direct radiators.
 *
 * Source: Small 1972, Equation 22
 *
 * @param {number} fs - Driver free-air resonance (Hz)
 * @param {number} vas - Driver equivalent volume (m³)
 * @param {number} qes - Driver electrical quality factor (dimensionless)
 * @returns {number} Reference efficiency η₀ (dimensionless, 0 to 1)
 */
export function calculateEta0(fs, vas, qes) {
    const c = SPEED_OF_SOUND;
    const fourPiSquared = 4 * Math.PI * Math.PI;
    const cCubed = c * c * c;
    const fsCubed = fs * fs * fs;

    return (fourPiSquared / cCubed) * (fsCubed * vas / qes);
}

/**
 * Calculate 1W/1m sensitivity from reference efficiency
 *
 * Formula: sensitivity_1W = 112 + 10 × log₁₀(η₀)
 *
 * This is the impedance-independent sensitivity: SPL at 1 meter with 1 watt
 * of electrical input, in half-space (driver mounted in infinite baffle).
 *
 * The constant 112 dB comes from acoustic physics:
 * - 1W input power
 * - Reference distance 1m
 * - Half-space radiation (2π steradians)
 *
 * Note: This is NOT the same as the industry-standard 2.83V/1m spec.
 * For 2.83V/1m, use calculateSensitivity2v83() which accounts for impedance.
 *
 * Source: Standard conversion from efficiency to sensitivity
 *         (Derived from Small 1972, using standard acoustic formulas)
 *
 * @param {number} eta0 - Reference efficiency η₀ (dimensionless)
 * @returns {number} Sensitivity at 1W/1m (dB)
 */
export function calculateSensitivity1W(eta0) {
    return 112 + 10 * Math.log10(eta0);
}

/**
 * Calculate industry-standard 2.83V/1m sensitivity
 *
 * Formula: sensitivity_2.83V = 112 + 10 × log₁₀(η₀ × 8/Re)
 *
 * The industry standard references 2.83V, which delivers:
 * - 1W into 8Ω (2.83² / 8 = 1)
 * - 2W into 4Ω (2.83² / 4 = 2) → +3dB vs 1W
 * - 4W into 2Ω (2.83² / 2 = 4) → +6dB vs 1W
 *
 * This makes lower-impedance drivers appear more sensitive in spec sheets,
 * which is fair because they ARE louder at the same voltage (but draw more current).
 *
 * @param {number} eta0 - Reference efficiency η₀ (dimensionless)
 * @param {number} re - Voice coil DC resistance (Ω)
 * @returns {number} Sensitivity at 2.83V/1m (dB)
 */
export function calculateSensitivity2v83(eta0, re) {
    // Power at 2.83V = V²/R = 8/Re watts
    // SPL = 1W sensitivity + 10*log10(power)
    return 112 + 10 * Math.log10(eta0 * 8 / re);
}


// ============================================================================
// ADDITIONAL T/S PARAMETER RELATIONSHIPS
// ============================================================================

/**
 * Calculate mechanical Q (Qms) from Qts and Qes
 *
 * Formula: 1/Qts = 1/Qes + 1/Qms
 * Rearranged: Qms = 1 / (1/Qts - 1/Qes) = Qts×Qes / (Qes - Qts)
 *
 * Qms represents mechanical losses (suspension damping).
 * Typically much higher than Qes for modern drivers.
 *
 * Source: Small 1972, fundamental T/S relationships
 *
 * @param {number} qts - Total Q
 * @param {number} qes - Electrical Q
 * @returns {number} Mechanical Q (Qms)
 */
export function calculateQms(qts, qes) {
    if (qes <= qts) {
        throw new Error(`Qes (${qes}) must be greater than Qts (${qts})`);
    }
    return (qts * qes) / (qes - qts);
}

/**
 * Calculate electrical Q (Qes) from Qts and Qms
 *
 * Formula: Qes = Qts×Qms / (Qms - Qts)
 *
 * @param {number} qts - Total Q
 * @param {number} qms - Mechanical Q
 * @returns {number} Electrical Q (Qes)
 */
export function calculateQes(qts, qms) {
    if (qms <= qts) {
        throw new Error(`Qms (${qms}) must be greater than Qts (${qts})`);
    }
    return (qts * qms) / (qms - qts);
}

/**
 * Calculate total Q (Qts) from Qes and Qms
 *
 * Formula: 1/Qts = 1/Qes + 1/Qms
 * Rearranged: Qts = Qes×Qms / (Qes + Qms)
 *
 * This is the parallel combination of electrical and mechanical Q.
 *
 * Source: Small 1972, fundamental T/S relationships
 *
 * @param {number} qes - Electrical Q
 * @param {number} qms - Mechanical Q
 * @returns {number} Total Q (Qts)
 */
export function calculateQts(qes, qms) {
    return (qes * qms) / (qes + qms);
}

/**
 * Calculate equivalent volume Vas from other parameters
 *
 * Formula: Vas = ρ₀×c²×Sd² / (Cms×(2πfs)²×Bl²/Re + Mms×(2πfs)²)
 *
 * Simplified for common use: Vas = ρ₀×c²×Cms×Sd²
 *
 * Where Cms = suspension compliance
 *
 * Source: Small 1972, Equation 3
 *
 * @param {number} cms - Mechanical compliance (m/N)
 * @param {number} sd - Diaphragm area (m²)
 * @returns {number} Equivalent volume Vas (m³)
 */
export function calculateVas(cms, sd) {
    return AIR_DENSITY * SPEED_OF_SOUND * SPEED_OF_SOUND * cms * sd * sd;
}

// ============================================================================
// PHASE AND GROUP DELAY
// ============================================================================

/**
 * Calculate complex response (magnitude and phase) for sealed enclosure
 *
 * The transfer function for a 2nd-order highpass is:
 *   H(s) = s² / (s² + (ω₀/Q)s + ω₀²)
 *
 * At s = jω:
 *   H(jω) = -ω² / (ω₀² - ω² + jω(ω₀/Q))
 *
 * Source: Derived from Small 1972, Equation 10
 *
 * @param {number} frequency - Frequency to evaluate (Hz)
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor
 * @returns {Object} {magnitude: number, phase: number (radians)}
 */
export function calculateResponseComplex(frequency, fc, qtc) {
    const omega = 2 * Math.PI * frequency;
    const omega_c = 2 * Math.PI * fc;

    const omega2 = omega * omega;
    const omega_c2 = omega_c * omega_c;

    // H(jω) = -ω² / (ω₀² - ω² + jω(ω₀/Q))
    // Numerator: -ω² (real, negative)
    const num_real = -omega2;
    const num_imag = 0;

    // Denominator: (ω₀² - ω²) + j(ω × ω₀ / Q)
    const den_real = omega_c2 - omega2;
    const den_imag = omega * omega_c / qtc;

    // Complex division: (a+bi)/(c+di) = ((ac+bd) + (bc-ad)i) / (c²+d²)
    const den_mag2 = den_real * den_real + den_imag * den_imag;

    const h_real = (num_real * den_real + num_imag * den_imag) / den_mag2;
    const h_imag = (num_imag * den_real - num_real * den_imag) / den_mag2;

    const magnitude = Math.sqrt(h_real * h_real + h_imag * h_imag);
    const phase = Math.atan2(h_imag, h_real);

    return { magnitude, phase };
}

/**
 * Calculate phase response for sealed enclosure
 *
 * Phase response of 2nd-order highpass filter.
 * Starts at +180° at DC, passes through +90° at resonance,
 * and approaches 0° at high frequencies.
 *
 * Source: Derived from Small 1972, Equation 10
 *
 * @param {number} frequency - Frequency to evaluate (Hz)
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor
 * @returns {number} Phase in degrees
 */
export function calculatePhase(frequency, fc, qtc) {
    const { phase } = calculateResponseComplex(frequency, fc, qtc);
    return phase * (180 / Math.PI);
}

/**
 * Calculate group delay for sealed enclosure
 *
 * Group delay: τ(ω) = -dφ/dω
 *
 * For a 2nd-order highpass, group delay peaks at resonance.
 * Lower Qtc = less group delay variation (better transients)
 * Bessel alignment (Qtc = 0.577) minimizes group delay variation.
 *
 * Implementation uses central difference numerical differentiation.
 *
 * Source: Small 1972 (implicit from transfer function)
 *         Beranek 1954 for group delay definition
 *
 * @param {number} frequency - Frequency to evaluate (Hz)
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor
 * @returns {number} Group delay in seconds
 */
export function calculateGroupDelay(frequency, fc, qtc) {
    // Use small frequency step for numerical differentiation
    const df = Math.max(frequency * 0.001, 0.01);

    // Calculate phase at f-df and f+df
    const phase_minus = calculateResponseComplex(frequency - df, fc, qtc).phase;
    const phase_plus = calculateResponseComplex(frequency + df, fc, qtc).phase;

    // Handle phase unwrapping
    let phase_diff = phase_plus - phase_minus;
    while (phase_diff > Math.PI) phase_diff -= 2 * Math.PI;
    while (phase_diff < -Math.PI) phase_diff += 2 * Math.PI;

    // Numerical derivative: dφ/df
    const dphase_df = phase_diff / (2 * df);

    // Convert to dφ/dω: dφ/dω = dφ/df / (2π)
    const dphase_domega = dphase_df / (2 * Math.PI);

    // Group delay: τ = -dφ/dω
    return -dphase_domega;
}

// ============================================================================
// IMPEDANCE MODELING
// ============================================================================

/**
 * Calculate electrical impedance of driver in sealed enclosure
 *
 * The total electrical impedance is:
 *   Z(jω) = Re + jωLe + Zem(jω)
 *
 * Where Zem is the motional impedance:
 *   Zem = Bl² / Zmech
 *
 * And Zmech is the mechanical impedance including box loading:
 *   Zmech = Rms + jωMms + 1/(jωCms_system)
 *   Cms_system = Cms / (1 + α)  (box stiffens suspension)
 *
 * Source: Small 1972, Section 2 (equivalent circuit analysis)
 *         Beranek 1954, Chapter 3 (electro-mechanical-acoustic analogies)
 *
 * @param {number} frequency - Frequency (Hz)
 * @param {number} re - Voice coil DC resistance (Ω)
 * @param {number} le - Voice coil inductance (H) - use 0 if unknown
 * @param {number} bl - Force factor (T·m)
 * @param {number} mms - Moving mass (kg)
 * @param {number} cms - Driver compliance (m/N)
 * @param {number} rms - Mechanical resistance (kg/s)
 * @param {number} alpha - Compliance ratio Vas/Vb
 * @returns {Object} {magnitude: Ω, phase: degrees, real: Ω, imag: Ω}
 */
export function calculateSealedImpedance(frequency, re, le, bl, mms, cms, rms, alpha) {
    const omega = 2 * Math.PI * frequency;

    // Voice coil impedance: Zvc = Re + jωLe
    const Zvc_real = re;
    const Zvc_imag = omega * le;

    // System compliance (box stiffens the suspension)
    // Cms_system = Cms / (1 + α)
    const cms_system = cms / (1 + alpha);

    // Mechanical impedance: Zmech = Rms + jωMms + 1/(jωCms)
    // 1/(jωCms) = -j/(ωCms)
    const Zmech_real = rms;
    const Zmech_imag = omega * mms - 1 / (omega * cms_system);
    const Zmech_mag2 = Zmech_real * Zmech_real + Zmech_imag * Zmech_imag;

    // Motional impedance: Zem = Bl² / Zmech
    // Complex division: Bl²/Zmech = Bl² × Zmech* / |Zmech|²
    const Bl2 = bl * bl;
    const Zem_real = Bl2 * Zmech_real / Zmech_mag2;
    const Zem_imag = -Bl2 * Zmech_imag / Zmech_mag2;  // conjugate in denominator

    // Total impedance: Z = Zvc + Zem
    const Z_real = Zvc_real + Zem_real;
    const Z_imag = Zvc_imag + Zem_imag;

    const magnitude = Math.sqrt(Z_real * Z_real + Z_imag * Z_imag);
    const phase = Math.atan2(Z_imag, Z_real) * (180 / Math.PI);

    return { magnitude, phase, real: Z_real, imag: Z_imag };
}

/**
 * Calculate impedance at resonance (Fc) for sealed box
 *
 * At resonance, the reactive components cancel (Zmech is purely resistive),
 * giving maximum motional impedance.
 *
 * Zmax ≈ Re + Bl²/Rms = Re × (1 + Qes/Qms × (1+α))
 *      ≈ Re × Qts × (1+α) / Qes  (simplified)
 *
 * Source: Small 1972, derived from equivalent circuit
 *
 * @param {number} re - Voice coil DC resistance (Ω)
 * @param {number} bl - Force factor (T·m)
 * @param {number} rms - Mechanical resistance (kg/s)
 * @returns {number} Impedance at resonance (Ω)
 */
export function calculateImpedanceAtResonance(re, bl, rms) {
    return re + (bl * bl) / rms;
}

// ============================================================================
// TIME-DOMAIN RESPONSE
// ============================================================================

/**
 * Calculate step response for sealed enclosure at time t
 *
 * For a 2nd-order high-pass system, the step response is:
 *   - Underdamped (Qtc > 0.5): Oscillating decay
 *   - Critically damped (Qtc = 0.5): Fastest non-oscillating decay
 *   - Overdamped (Qtc < 0.5): Slower monotonic decay
 *
 * The high-pass step response starts at 1 (full response to transient)
 * and decays to 0 (DC blocked).
 *
 * Formulas:
 *   ζ = 1/(2×Qtc)           -- damping ratio
 *   ωn = 2π×Fc              -- natural frequency
 *   ωd = ωn×√(1-ζ²)         -- damped frequency (underdamped case)
 *
 *   Underdamped (ζ < 1):
 *     y(t) = e^(-ζωnt) × [cos(ωdt) + (ζ/√(1-ζ²))×sin(ωdt)]
 *
 *   Critically damped (ζ = 1):
 *     y(t) = (1 + ωnt) × e^(-ωnt)
 *
 *   Overdamped (ζ > 1):
 *     y(t) = (α₁×e^(s₁t) - α₂×e^(s₂t)) / (s₁ - s₂)
 *     where s₁,s₂ = -ζωn ± ωn×√(ζ²-1)
 *
 * Source: Standard 2nd-order system theory applied to Small 1972 transfer function
 *         Ogata, "Modern Control Engineering" for time-domain solutions
 *
 * @param {number} t - Time in seconds
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor
 * @returns {number} Normalized step response (starts at 1, decays to 0)
 */
export function calculateStepResponse(t, fc, qtc) {
    if (t < 0) return 0;
    if (t === 0) return 1;

    const omega_n = 2 * Math.PI * fc;
    const zeta = 1 / (2 * qtc);

    if (Math.abs(zeta - 1) < 0.001) {
        // Critically damped (ζ ≈ 1, Qtc ≈ 0.5)
        return (1 + omega_n * t) * Math.exp(-omega_n * t);
    } else if (zeta < 1) {
        // Underdamped (ζ < 1, Qtc > 0.5) - most common case
        const omega_d = omega_n * Math.sqrt(1 - zeta * zeta);
        const decay = Math.exp(-zeta * omega_n * t);
        const ratio = zeta / Math.sqrt(1 - zeta * zeta);
        return decay * (Math.cos(omega_d * t) + ratio * Math.sin(omega_d * t));
    } else {
        // Overdamped (ζ > 1, Qtc < 0.5)
        const sqrtTerm = Math.sqrt(zeta * zeta - 1);
        const s1 = omega_n * (-zeta + sqrtTerm);
        const s2 = omega_n * (-zeta - sqrtTerm);
        // Coefficients for step response of HP filter
        const alpha = omega_n * omega_n / (s1 - s2);
        return alpha * (Math.exp(s1 * t) / s1 - Math.exp(s2 * t) / s2);
    }
}

/**
 * Calculate impulse response for sealed enclosure at time t
 *
 * The impulse response is the derivative of the step response.
 * For a 2nd-order high-pass, it shows the "ringing" behavior.
 *
 * Note: The true impulse response of a high-pass with s² numerator
 * includes a delta function at t=0. This function returns only the
 * regular (non-impulsive) part, which shows the decay/ringing.
 *
 * For underdamped systems (Qtc > 0.5), the impulse response oscillates.
 * The number of visible oscillations increases with higher Qtc.
 *
 * Source: Derivative of step response, standard control theory
 *
 * @param {number} t - Time in seconds
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor
 * @returns {number} Normalized impulse response (regular part only)
 */
export function calculateImpulseResponse(t, fc, qtc) {
    if (t <= 0) return 0;

    const omega_n = 2 * Math.PI * fc;
    const zeta = 1 / (2 * qtc);

    if (Math.abs(zeta - 1) < 0.001) {
        // Critically damped
        // d/dt[(1 + ωnt)×e^(-ωnt)] = ωn×e^(-ωnt) - ωn×(1+ωnt)×e^(-ωnt)
        //                          = -ωn²t×e^(-ωnt)
        return -omega_n * omega_n * t * Math.exp(-omega_n * t);
    } else if (zeta < 1) {
        // Underdamped - derivative of step response
        const omega_d = omega_n * Math.sqrt(1 - zeta * zeta);
        const decay = Math.exp(-zeta * omega_n * t);
        // d/dt[e^(-at)(cos(bt) + c×sin(bt))]
        // = -a×e^(-at)(cos(bt) + c×sin(bt)) + e^(-at)(-b×sin(bt) + c×b×cos(bt))
        // After simplification for HP: = -(ωn²/ωd)×e^(-ζωnt)×sin(ωdt)
        return -(omega_n * omega_n / omega_d) * decay * Math.sin(omega_d * t);
    } else {
        // Overdamped - numerical derivative
        const dt = 0.00001;
        const step_t = calculateStepResponse(t, fc, qtc);
        const step_tdt = calculateStepResponse(t + dt, fc, qtc);
        return (step_tdt - step_t) / dt;
    }
}

/**
 * Calculate key step response characteristics
 *
 * Returns settling time, overshoot, and rise time for the step response.
 * These metrics help characterize transient behavior.
 *
 * Definitions:
 * - Overshoot: Maximum deviation below 0 (for HP step response)
 * - Settling time: Time to stay within 5% of final value (0)
 * - Rise time: Time from 90% to 10% of initial value
 *
 * Source: Standard control system metrics
 *
 * @param {number} fc - System resonance frequency (Hz)
 * @param {number} qtc - System total quality factor
 * @returns {Object} {overshoot: fraction, settlingTime: seconds, riseTime: seconds}
 */
export function calculateStepResponseMetrics(fc, qtc) {
    const omega_n = 2 * Math.PI * fc;
    const zeta = 1 / (2 * qtc);

    // Overshoot for underdamped system
    let overshoot = 0;
    if (zeta < 1) {
        // For a high-pass, overshoot is how much it goes negative
        // Peak occurs at t = π/ωd
        const omega_d = omega_n * Math.sqrt(1 - zeta * zeta);
        const t_peak = Math.PI / omega_d;
        const y_peak = calculateStepResponse(t_peak, fc, qtc);
        overshoot = Math.abs(Math.min(y_peak, 0));
    }

    // Settling time (2% criterion): approximately 4/(ζωn)
    const settlingTime = 4 / (zeta * omega_n);

    // Rise time approximation: (1.8/ωn) for underdamped
    const riseTime = zeta < 1 ? 1.8 / omega_n : 2.2 / omega_n;

    return {
        overshoot,
        settlingTime,
        riseTime,
        dampingRatio: zeta
    };
}
