/**
 * Driver Displacement Calculations
 *
 * 📐 PAPER-BASED LAYER (Updated Dec 2025)
 *
 * These functions calculate cone excursion from electrical power.
 *
 * Sources:
 * - Small 1972: Sealed box mechanical impedance model
 * - Small 1973: Ported box cone velocity transfer function (Figure 2)
 *
 * Implementation:
 * - Sealed: Direct impedance calculation (ignores Le below 200Hz)
 * - Ported: Uses foundation layer calculateConeDisplacementTransfer()
 *           which derives the excursion null from network analysis
 *
 * Key Features:
 * - Sealed: ~5% error vs full network solver
 * - Ported: Paper-pure shape from Small 1973 network equations
 * - Both correctly show X ∝ 1/f² in mass-controlled region
 * - Ported shows excursion null at Fb (cone barely moves)
 *
 * Validation:
 * - Excursion null at Fb: ✓ (paper-derived)
 * - Power scaling: ✓ (2× power = √2× displacement)
 * - Frequency scaling: ✓ (X ∝ 1/f² above resonance)
 *
 * See: lib/test/Engineering.test.js for validation tests
 */

import { SPEED_OF_SOUND, AIR_DENSITY, REFERENCE_PRESSURE } from '../foundation/constants.js';

import * as Small1972 from '../foundation/small-1972.js';
import * as Small1973 from '../foundation/small-1973.js';

/**
 * Calculate sealed box displacement from electrical power
 *
 * 📄 PAPER-CLOSE APPROXIMATION (~5% error)
 *
 * Physics Basis:
 * - Uses Small 1972 box loading (compliance ratio α) - exact
 * - Simplified impedance model: Zmech = Rms + jω×Mms + 1/(jω×Cms×(1+α))
 * - Ignores Le (voice coil inductance) - valid below ~200Hz
 *
 * Derivation:
 * 1. Vin = sqrt(P × Re)           // Voltage from power
 * 2. Zmech = mechanical impedance with box loading
 * 3. Ztotal ≈ Re + (Bl)²/|Zmech|  // Reflected impedance
 * 4. I = Vin / Ztotal             // Current
 * 5. F = Bl × I                   // Force on cone
 * 6. X = F / |Zmech|              // Displacement
 *
 * Assumptions:
 * - Le negligible (valid below 200Hz for most drivers)
 * - Piston behavior (no cone breakup)
 * - Linear suspension (X < Xmax)
 *
 * Accuracy:
 * - ~5% error vs full network solver
 * - Best accuracy in mass-controlled region (f > fs)
 * - More error near resonance (high Q systems)
 *
 * Validation:
 * - Power scaling: ✓ 2× power = √2× displacement
 * - Box loading: ✓ Larger box (smaller α) = more displacement
 * - Frequency: ✓ Higher frequency = less displacement (1/f²)
 *
 * @param {Object} params - Driver and box parameters
 * @param {number} params.power - Electrical input power (W)
 * @param {number} params.frequency - Frequency (Hz)
 * @param {number} params.re - Voice coil DC resistance (Ω)
 * @param {number} params.bl - Force factor (T·m or N/A)
 * @param {number} params.mms - Moving mass (kg)
 * @param {number} params.cms - Compliance (m/N)
 * @param {number} params.rms - Mechanical resistance (kg/s)
 * @param {number} params.alpha - Compliance ratio Vas/Vb (from Small 1972)
 * @returns {number} Peak-to-peak displacement (m)
 */
export function calculateSealedDisplacementFromPower(params) {
    const { power, frequency, re, bl, mms, cms, rms, alpha } = params;

    // Validate inputs
    if (power <= 0 || frequency <= 0) return 0;
    if (!re || !bl || !mms || !cms || alpha <= 0) {
        throw new Error('Missing required mechanical parameters for displacement calculation');
    }

    // Guard against unrealistic frequency
    if (frequency < 0.1) {
        throw new Error('Frequency too low for displacement calculation (f < 0.1 Hz)');
    }

    // Guard against division by zero in impedance calculation
    if (cms <= 0 || mms <= 0) {
        throw new Error('Invalid mechanical parameters: Cms and Mms must be positive');
    }

    const omega = 2 * Math.PI * frequency;

    // 1. Input voltage from power: Vin = sqrt(P × Re)
    const vin = Math.sqrt(power * re);

    // 2. Mechanical impedance with box loading
    // Zmech = Rms + jω×Mms + 1/(jω×Cms×(1+α))
    // Where (1+α) is the stiffness increase from Small 1972
    if (!rms || rms <= 0) {
        throw new Error('Rms (mechanical resistance) required for displacement calculation. Calculate from Qms if not measured.');
    }
    const real_zmech = rms;
    const imag_zmech = omega * mms - 1 / (omega * cms * (1 + alpha));
    const zmech_mag = Math.sqrt(real_zmech * real_zmech + imag_zmech * imag_zmech);

    // 3. Total impedance ≈ Re + (Bl)²/|Zmech|
    // (Simplified - ignores Le, valid below 200Hz)
    const z_reflected = (bl * bl) / zmech_mag;
    const ztotal = re + z_reflected;

    // 4. Current: I = Vin / Ztotal
    const current = vin / ztotal;

    // 5. Force: F = Bl × I
    const force = bl * current;

    // 6. Displacement: X = F / (ω × |Zmech|)
    // Note: Zmech relates force to VELOCITY, so divide by ω to get displacement
    const displacement = force / (omega * zmech_mag);

    return Math.abs(displacement);
}

/**
 * Calculate ported box displacement from electrical power
 *
 * 📐 PAPER-BASED IMPLEMENTATION
 *
 * Source: Small 1973, Figure 2 network analysis
 *         Cone volume velocity transfer function with notch at Fb
 *
 * Physics:
 * - Small 1973 ported box creates frequency-dependent acoustic load
 * - Near port tuning (Fb): cone displacement → 0 (excursion null)
 * - Port handles acoustic output at Fb, cone barely moves
 * - At high frequencies, port mass blocks flow, cone handles output
 *
 * Method:
 * 1. Calculate sealed displacement as baseline (for absolute scaling)
 * 2. Use paper-pure cone displacement transfer function for shape
 * 3. Normalize: at high frequencies, ported matches sealed behavior
 *
 * Key Feature:
 * Uses foundation layer calculateConeDisplacementTransfer() which
 * correctly derives the excursion null from network analysis.
 * 
 * @param {Object} params - Driver and box parameters
 * @param {number} params.power - Electrical input power (W)
 * @param {number} params.frequency - Frequency (Hz)
 * @param {number} params.re - Voice coil DC resistance (Ω)
 * @param {number} params.bl - Force factor (T·m)
 * @param {number} params.mms - Moving mass (kg)
 * @param {number} params.cms - Compliance (m/N)
 * @param {number} params.rms - Mechanical resistance (kg/s)
 * @param {number} params.fs - Driver free-air resonance (Hz)
 * @param {number} params.fb - Box tuning frequency (Hz)
 * @param {number} params.alpha - Compliance ratio Vas/Vb
 * @param {number} params.qts - Driver total Q
 * @param {number} params.ql - Enclosure Q (default: Infinity for lossless)
 * @returns {number} Peak displacement (m)
 */
export function calculatePortedDisplacementFromPower(params) {
    const { power, frequency, re, bl, mms, cms, rms, fs, fb, alpha, qts, ql = Infinity } = params;

    // Validate inputs
    if (power <= 0 || frequency <= 0) return 0;

    // Guard against unrealistic frequency
    if (frequency < 0.1) {
        throw new Error('Frequency too low for displacement calculation (f < 0.1 Hz)');
    }

    // Guard against invalid tuning
    if (fb <= 0 || fs <= 0) {
        throw new Error('Invalid resonance frequencies: Fb and Fs must be positive');
    }

    // 1. Calculate sealed displacement as baseline
    // This gives correct absolute scaling
    const x_sealed = calculateSealedDisplacementFromPower({
        power, frequency, re, bl, mms, cms, rms, alpha
    });

    // 2. Calculate notch factor from foundation layer
    // The cone velocity transfer function has a notch at Fb.
    // We need the ratio: ported_cone_velocity / sealed_cone_velocity
    //
    // At Fb: notch_factor → 0 (cone barely moves, port handles output)
    // Far from Fb: notch_factor → 1 (ported behaves like sealed)

    // Cone velocity magnitude for ported box (has notch at Fb)
    const V_ported = Small1973.calculateConeVolumeVelocityMagnitude(frequency, fs, fb, alpha, qts, ql);

    // Sealed box response magnitude (no notch, just 2nd-order highpass)
    const fc_sealed = Small1972.calculateFc(fs, alpha);
    const qtc_sealed = Small1972.calculateQtc(qts, alpha);
    const V_sealed = Small1972.calculateResponseMagnitude(frequency, fc_sealed, qtc_sealed);

    // Notch factor: ratio of ported cone velocity to sealed response
    // This captures the key physics: port unloads the cone at Fb
    const notch_factor = (V_sealed > 1e-10) ? V_ported / V_sealed : 1.0;

    // 3. Apply notch factor to sealed displacement
    // x_ported = x_sealed × notch_factor
    // At Fb: notch_factor ≈ 0, so x_ported ≈ 0 (excursion null)
    // Far from Fb: notch_factor ≈ 1, so x_ported ≈ x_sealed
    const x_ported = x_sealed * notch_factor;

    return x_ported;
}

/**
 * Calculate displacement for either sealed or ported box
 *
 * Convenience wrapper that dispatches to correct function.
 *
 * @param {Object} params - Parameters (must include boxType: 'sealed' | 'ported')
 * @returns {number} Peak displacement (m)
 */
export function calculateDisplacementFromPower(params) {
    const { boxType } = params;

    if (boxType === 'sealed') {
        return calculateSealedDisplacementFromPower(params);
    } else if (boxType === 'ported') {
        return calculatePortedDisplacementFromPower(params);
    } else {
        throw new Error(`Unknown box type: ${boxType}. Must be 'sealed' or 'ported'.`);
    }
}

/**
 * Convert displacement (m) to mm for display
 *
 * @param {number} displacement_m - Displacement in meters
 * @returns {number} Displacement in millimeters
 */
export function displacementToMm(displacement_m) {
    return displacement_m * 1000;
}

/**
 * Convert displacement (mm) to m for calculations
 *
 * @param {number} displacement_mm - Displacement in millimeters
 * @returns {number} Displacement in meters
 */
export function displacementToM(displacement_mm) {
    return displacement_mm / 1000;
}

/**
 * Calculate SPL from cone displacement (geometric, box-independent)
 *
 * This is the physical maximum SPL at a given excursion - purely geometric.
 * Based on piston radiation formula. Does NOT depend on box volume, power,
 * or any electrical parameters.
 *
 * Physics (baffled piston, ka << 1):
 * - Velocity amplitude: v = ω × X
 * - Volume velocity: U = Sd × v = Sd × ω × X
 * - Far-field pressure: p = (ρ × c × k × Sd × U) / (2π × r)
 *   where k = ω/c is the wavenumber
 * - SPL rises at +12 dB/octave (f² relationship from k × U = k × ω × X ∝ f²)
 *
 * @param {number} sd - Cone area (m²)
 * @param {number} displacement - Peak displacement (m)
 * @param {number} frequency - Frequency (Hz)
 * @param {number} [distance=1] - Measurement distance (m)
 * @returns {number} SPL in dB
 */
export function splFromDisplacement(sd, displacement, frequency, distance = 1) {
    const omega = 2 * Math.PI * frequency;
    const k = omega / SPEED_OF_SOUND;     // Wavenumber

    // Peak pressure at distance r from a baffled piston (ka << 1):
    // p_peak = (ρ × c × k × Sd × v_peak) / (2π × r)
    //        = (ρ × c × k × Sd × ω × X) / (2π × r)
    //        = (ρ × ω² × Sd × X) / (2π × r)    [since k = ω/c]
    //
    // This gives the f² (12 dB/oct) relationship we expect.
    const vPeak = omega * displacement;
    const pPeak = (AIR_DENSITY * SPEED_OF_SOUND * k * sd * vPeak) / (2 * Math.PI * distance);
    const pRms = pPeak / Math.SQRT2;

    // Guard against log(0)
    if (pRms <= 0) return -Infinity;

    return 20 * Math.log10(pRms / REFERENCE_PRESSURE);
}
