/**
 * SealedBox Model - Validated Sealed Enclosure Design
 *
 * Represents a complete sealed box design. Computed parameters (Fc, Qtc, F3)
 * are calculated at construction and cached. Response can be queried at any frequency.
 *
 * Usage:
 *   const driver = new Driver({ fs: 22, qts: 0.53, vas: 248 });
 *   const box = new SealedBox(driver, 200);  // 200 liters
 *   console.log(box.f3);  // -3dB point
 *   console.log(box.responseAt(30));  // dB at 30Hz
 */

import { Driver } from './Driver.js';
import * as Small1972 from '../foundation/small-1972.js';
import { BUTTERWORTH_QTC, BESSEL_QTC, CHEBYSHEV_QTC } from '../foundation/thiele-1971.js';
import { createMaxPowerFunction, createDisplacementFunction, sampleFunction } from '../engineering/power-limits.js';
import * as Displacement from '../engineering/displacement.js';
import * as Klippel from '../foundation/klippel/index.js';
import { generateLogFrequencies, generateTimeCurve } from '../foundation/utils.js';
import { MOTOR_PARAMS, LIMIT_PARAMS, SPL_PARAMS } from './param-requirements.js';

/**
 * Immutable sealed box design
 */
export class SealedBox {
    #driver;
    #volumeLiters;

    // Computed at construction (cached)
    #alpha;
    #fc;
    #qtc;
    #f3;

    // Lazy-initialized engineering functions (function-first pattern)
    #maxPowerFn = null;
    #displacementFn = null;

    // Validation warnings (informational, not errors)
    #warnings = [];

    /**
     * Construct a sealed box design
     *
     * @param {Driver} driver - Validated Driver instance
     * @param {number} volumeLiters - Internal box volume in liters
     * @throws {Error} If driver is not a Driver instance or volume invalid
     */
    constructor(driver, volumeLiters) {
        // Validate driver
        if (!(driver instanceof Driver)) {
            throw new Error(
                'SealedBox requires a Driver instance. ' +
                'Use: new SealedBox(new Driver({...}), volume)'
            );
        }
        this.#driver = driver;

        // Validate volume
        if (volumeLiters == null || volumeLiters <= 0) {
            throw new Error('Box volume must be positive');
        }
        if (volumeLiters > 5000) {
            throw new Error(
                `Volume=${volumeLiters}L is unusually large (>5000L). ` +
                `Check your units.`
            );
        }
        this.#volumeLiters = volumeLiters;

        // Compute system parameters (Small 1972)
        const vbSI = volumeLiters / 1000;  // liters to m³
        const vasSI = driver.vasSI;

        this.#alpha = Small1972.calculateAlpha(vasSI, vbSI);
        this.#fc = Small1972.calculateFc(driver.fs, this.#alpha);
        this.#qtc = Small1972.calculateQtc(driver.qts, this.#alpha);
        this.#f3 = Small1972.calculateF3(this.#fc, this.#qtc);

        // Generate warnings for edge cases
        this.#generateWarnings();

        Object.freeze(this);
    }

    /**
     * Generate warnings for edge-case configurations
     * @private
     *
     * Threshold reasoning:
     * - Qtc > 1.3: Well above Chebyshev (1.0), catches truly peaky responses
     * - Qtc < 0.5: Below practical sealed designs, genuinely overdamped
     * - alpha < 0.3: Box is >3× Vas, diminishing returns on volume
     */
    #generateWarnings() {
        // Qtc very high - underdamped, peaky response
        if (this.#qtc > 1.3) {
            this.#warnings.push({
                type: 'high-qtc',
                message: `Qtc=${this.#qtc.toFixed(2)} is high (>1.3). ` +
                    `Response will be peaky/boomy. Consider a larger box.`,
                qtc: this.#qtc,
                severity: 'warn'
            });
        }

        // Qtc very low - overdamped, wasted volume
        if (this.#qtc < 0.5) {
            this.#warnings.push({
                type: 'low-qtc',
                message: `Qtc=${this.#qtc.toFixed(2)} is low (<0.5). ` +
                    `Response is overdamped. A smaller box would be equally effective.`,
                qtc: this.#qtc,
                severity: 'info'
            });
        }

        // Box much larger than driver's Vas (potentially inefficient)
        if (this.#alpha < 0.3) {
            this.#warnings.push({
                type: 'large-box',
                message: `Box is ${(1/this.#alpha).toFixed(1)}× driver Vas. ` +
                    `Very large box relative to driver. May be inefficient use of space.`,
                alpha: this.#alpha,
                severity: 'info'
            });
        }
    }

    // ====================================================================
    // GETTERS
    // ====================================================================

    /** The driver used in this design */
    get driver() { return this.#driver; }

    /** Box internal volume in liters */
    get volumeLiters() { return this.#volumeLiters; }

    /** Box internal volume in m³ */
    get volumeSI() { return this.#volumeLiters / 1000; }

    /** Compliance ratio (Vas/Vb) */
    get alpha() { return this.#alpha; }

    /** System resonance frequency (Hz) */
    get fc() { return this.#fc; }

    /** System total Q */
    get qtc() { return this.#qtc; }

    /** -3dB frequency (Hz) */
    get f3() { return this.#f3; }

    /** Always false for sealed boxes (capability check) */
    get isVented() { return false; }

    /**
     * Validation warnings (informational, not errors)
     * These are issues detected at construction time that don't prevent
     * the design from working but may indicate suboptimal configuration.
     * @returns {Array<{type: string, message: string, severity: string, ...details}>}
     */
    get warnings() { return [...this.#warnings]; }

    /** True if there are any warnings */
    get hasWarnings() { return this.#warnings.length > 0; }

    // ====================================================================
    // ALIGNMENT CLASSIFICATION
    // ====================================================================

    /**
     * Alignment name based on Qtc
     */
    get alignmentName() {
        if (Math.abs(this.#qtc - BUTTERWORTH_QTC) < 0.03) return 'Butterworth';
        if (Math.abs(this.#qtc - BESSEL_QTC) < 0.03) return 'Bessel';
        if (Math.abs(this.#qtc - CHEBYSHEV_QTC) < 0.05) return 'Chebyshev';
        if (this.#qtc < 0.5) return 'Overdamped';
        if (this.#qtc < 0.65) return 'Quasi-Butterworth';
        if (this.#qtc > 1.1) return 'Underdamped';
        return 'Custom';
    }

    /**
     * Alignment description
     */
    get alignmentDescription() {
        if (Math.abs(this.#qtc - BUTTERWORTH_QTC) < 0.03) return 'Maximally flat frequency response';
        if (Math.abs(this.#qtc - BESSEL_QTC) < 0.03) return 'Maximally flat group delay (best transients)';
        if (Math.abs(this.#qtc - CHEBYSHEV_QTC) < 0.05) return 'Extended bass with 0.5dB ripple';
        if (this.#qtc < 0.5) return 'Overdamped - reduced output, excellent transients';
        if (this.#qtc < 0.65) return 'Slightly overdamped - good compromise';
        if (this.#qtc > 1.1) return 'Underdamped - peaky response, bass emphasis';
        return 'Custom alignment';
    }

    // ====================================================================
    // RESPONSE CALCULATIONS
    // ====================================================================

    /**
     * Get response magnitude at frequency (linear, not dB)
     *
     * @param {number} frequency - Frequency in Hz
     * @returns {number} Linear magnitude (1.0 = passband)
     */
    magnitudeAt(frequency) {
        if (frequency <= 0) {
            throw new Error('Frequency must be positive');
        }
        return Small1972.calculateResponseMagnitude(frequency, this.#fc, this.#qtc);
    }

    /**
     * Get response at frequency in dB
     *
     * @param {number} frequency - Frequency in Hz
     * @returns {number} Response in dB (0 = passband, negative below)
     */
    responseAt(frequency) {
        if (frequency <= 0) {
            throw new Error('Frequency must be positive');
        }
        return Small1972.calculateResponseDb(frequency, this.#fc, this.#qtc);
    }

    /**
     * Generate response curve data
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=500] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, db: number}>} Response data
     *   - frequency: Hz
     *   - db: Response in dB (0 = passband reference)
     */
    responseCurve(fMin = 10, fMax = 200, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            db: this.responseAt(frequency)
        }));
    }

    /**
     * Get phase response at frequency in degrees
     *
     * @param {number} frequency - Frequency in Hz
     * @returns {number} Phase in degrees
     */
    phaseAt(frequency) {
        if (frequency <= 0) {
            throw new Error('Frequency must be positive');
        }
        return Small1972.calculatePhase(frequency, this.#fc, this.#qtc);
    }

    /**
     * Get group delay at frequency in seconds
     *
     * @param {number} frequency - Frequency in Hz
     * @returns {number} Group delay in seconds
     */
    groupDelayAt(frequency) {
        if (frequency <= 0) {
            throw new Error('Frequency must be positive');
        }
        return Small1972.calculateGroupDelay(frequency, this.#fc, this.#qtc);
    }

    /**
     * Generate phase curve data
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, phase: number}>} Phase data
     *   - frequency: Hz
     *   - phase: Degrees
     */
    phaseCurve(fMin = 10, fMax = 200, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            phase: this.phaseAt(frequency)
        }));
    }

    /**
     * Generate group delay curve data
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, delay: number}>} Group delay data
     *   - frequency: Hz
     *   - delay: Milliseconds (NOT seconds - converted from groupDelayAt)
     */
    groupDelayCurve(fMin = 10, fMax = 200, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            delay: this.groupDelayAt(frequency) * 1000  // seconds to ms
        }));
    }

    // ====================================================================
    // ENGINEERING CALCULATIONS (Power/Excursion)
    // ====================================================================

    /**
     * Check if driver has all motor params needed for displacement calculations
     */
    get canCalculateDisplacement() {
        return this.#driver.hasParams(...MOTOR_PARAMS);
    }

    /**
     * Check if driver has params for power/excursion limit calculations
     */
    get canCalculateLimits() {
        return this.canCalculateDisplacement && this.#driver.hasParams(...LIMIT_PARAMS);
    }

    /**
     * Build parameter object for engineering layer functions
     * @private
     */
    #buildEngineeringParams() {
        const d = this.#driver;
        const allParams = [...MOTOR_PARAMS, ...LIMIT_PARAMS];

        if (!d.hasParams(...allParams)) {
            const missing = d.missingParams(...allParams);
            throw new Error(
                `Driver missing parameters for engineering calculations: ${missing.join(', ')}`
            );
        }

        return {
            boxType: 'sealed',
            re: d.re,
            bl: d.bl,
            mms: d.mmsSI,
            cms: d.cms,
            rms: d.rms,
            alpha: this.#alpha,
            xmax: d.xmaxSI,
            pe: d.pe,
            fs: d.fs,
            qts: d.qts
        };
    }

    /**
     * Get max power function (lazy-initialized, function-first pattern)
     * Returns: (frequency) => {power, limiting, displacement}
     * @private
     */
    #getMaxPowerFn() {
        if (!this.#maxPowerFn) {
            const params = this.#buildEngineeringParams();
            this.#maxPowerFn = createMaxPowerFunction(params);
        }
        return this.#maxPowerFn;
    }

    /**
     * Get displacement function (lazy-initialized, function-first pattern)
     * Returns: (frequency, power) => displacement (meters)
     * @private
     */
    #getDisplacementFn() {
        if (!this.#displacementFn) {
            const params = this.#buildEngineeringParams();
            this.#displacementFn = createDisplacementFunction(params);
        }
        return this.#displacementFn;
    }

    /**
     * Calculate cone excursion at frequency for given power
     *
     * @param {number} frequency - Frequency in Hz
     * @param {number} power - Input power in watts
     * @returns {number} Excursion in mm (peak)
     */
    excursionAt(frequency, power) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        if (power <= 0) throw new Error('Power must be positive');

        const displacementFn = this.#getDisplacementFn();
        const excursionM = displacementFn(frequency, power);
        return excursionM * 1000; // m to mm
    }

    /**
     * Calculate maximum safe power at frequency (limited by excursion or thermal)
     *
     * @param {number} frequency - Frequency in Hz
     * @returns {Object} {maxPower: number, limitingFactor: 'excursion'|'thermal', excursion: number}
     */
    maxPowerAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');

        const maxPowerFn = this.#getMaxPowerFn();
        const result = maxPowerFn(frequency);

        return {
            maxPower: result.power,
            limitingFactor: result.limiting,
            excursion: result.displacement * 1000
        };
    }

    /**
     * Generate power curve (max power vs frequency)
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=20] - Number of points
     * @returns {Array<{frequency: number, maxPower: number, limitingFactor: string, excursion: number}>} Power limit data
     *   - frequency: Hz
     *   - maxPower: Watts (max safe power at this frequency)
     *   - limitingFactor: 'excursion' | 'thermal'
     *   - excursion: mm at max power
     */
    powerCurve(fMin = 10, fMax = 200, points = 20) {
        const maxPowerFn = this.#getMaxPowerFn();
        const frequencies = generateLogFrequencies(fMin, fMax, points);
        const raw = sampleFunction(maxPowerFn, frequencies);

        return raw.map(r => ({
            frequency: r.frequency,
            maxPower: r.power,
            limitingFactor: r.limiting,
            excursion: r.displacement * 1000
        }));
    }

    /**
     * Generate excursion curve at given power
     *
     * @param {number} power - Input power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<{frequency: number, excursion: number, overXmax: boolean}>} Excursion data
     *   - frequency: Hz
     *   - excursion: mm (peak)
     *   - overXmax: true if excursion > driver Xmax
     */
    excursionCurve(power, fMin = 10, fMax = 200, points = 50) {
        if (power <= 0) throw new Error('Power must be positive');
        const xmaxMm = this.#driver.xmax;

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const excursion = this.excursionAt(frequency, power);
            return {
                frequency,
                excursion,
                overXmax: excursion > xmaxMm
            };
        });
    }

    // ====================================================================
    // IMPEDANCE CALCULATIONS
    // ====================================================================

    /**
     * Check if driver has parameters needed for impedance calculation
     */
    get canCalculateImpedance() {
        return this.#driver.hasParams(...MOTOR_PARAMS);
    }

    /**
     * Calculate electrical impedance at frequency
     *
     * @param {number} frequency - Frequency in Hz
     * @returns {Object} {magnitude: Ω, phase: degrees}
     */
    impedanceAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');

        const d = this.#driver;
        if (!d.hasParams(...MOTOR_PARAMS)) {
            const missing = d.missingParams(...MOTOR_PARAMS);
            throw new Error(`Driver missing impedance parameters: ${missing.join(', ')}`);
        }

        const result = Small1972.calculateSealedImpedance(
            frequency,
            d.re,
            d.leSI,
            d.bl,
            d.mmsSI,
            d.cms,
            d.rms,
            this.#alpha
        );

        return { magnitude: result.magnitude, phase: result.phase };
    }

    /**
     * Generate impedance curve
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=500] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, magnitude: number, phase: number}>} Impedance data
     *   - frequency: Hz
     *   - magnitude: Ohms (use yKey: 'magnitude' in graphs)
     *   - phase: Degrees
     */
    impedanceCurve(fMin = 10, fMax = 500, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const z = this.impedanceAt(frequency);
            return {
                frequency,
                magnitude: z.magnitude,
                phase: z.phase
            };
        });
    }

    // ====================================================================
    // DERIVED ELECTRICAL CURVES (from impedance)
    // ====================================================================

    /**
     * Calculate current draw at frequency for given power
     *
     * I = √(P / |Z|)
     *
     * @param {number} frequency - Frequency in Hz
     * @param {number} power - Input power in watts
     * @returns {number} Current in amps
     */
    currentAt(frequency, power) {
        if (!this.canCalculateImpedance) {
            throw new Error('Driver missing impedance parameters');
        }
        const z = this.impedanceAt(frequency);
        return Math.sqrt(power / z.magnitude);
    }

    /**
     * Generate current draw curve
     *
     * @param {number} power - Input power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=500] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, current: number}>} Current draw data
     *   - frequency: Hz
     *   - current: Amps
     */
    currentDrawCurve(power, fMin = 10, fMax = 500, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            current: this.currentAt(frequency, power)
        }));
    }

    /**
     * Calculate EPDR (Equivalent Peak Dissipation Resistance) at frequency
     *
     * EPDR = |Z| × cos(φ)
     * Lower EPDR = harder load for amplifier
     *
     * @param {number} frequency - Frequency in Hz
     * @returns {number} EPDR in ohms
     */
    epdrAt(frequency) {
        if (!this.canCalculateImpedance) {
            throw new Error('Driver missing impedance parameters');
        }
        const z = this.impedanceAt(frequency);
        const phaseRad = z.phase * Math.PI / 180;
        return z.magnitude * Math.cos(phaseRad);
    }

    /**
     * Generate EPDR curve
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=500] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, epdr: number}>} EPDR data
     *   - frequency: Hz
     *   - epdr: Ohms (floored at 0.1)
     */
    epdrCurve(fMin = 10, fMax = 500, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            epdr: Math.max(this.epdrAt(frequency), 0.1)  // Floor at 0.1Ω
        }));
    }

    /**
     * Calculate apparent power (VA) at frequency for given real power
     *
     * VA = P / cos(φ) where φ is impedance phase
     *
     * @param {number} frequency - Frequency in Hz
     * @param {number} power - Real power in watts
     * @returns {number} Apparent power in VA
     */
    apparentPowerAt(frequency, power) {
        if (!this.canCalculateImpedance) {
            throw new Error('Driver missing impedance parameters');
        }
        const z = this.impedanceAt(frequency);
        const phaseRad = z.phase * Math.PI / 180;
        const powerFactor = Math.max(Math.abs(Math.cos(phaseRad)), 0.1);  // Floor at 0.1
        return power / powerFactor;
    }

    /**
     * Generate apparent power (VA) curve
     *
     * @param {number} power - Real power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=500] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, va: number}>} Apparent power data
     *   - frequency: Hz
     *   - va: VA (capped at 10× input power)
     */
    apparentPowerCurve(power, fMin = 10, fMax = 500, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            va: Math.min(this.apparentPowerAt(frequency, power), power * 10)  // Cap at 10×
        }));
    }

    /**
     * Calculate thermal dissipation at frequency for given input power
     *
     * P_thermal = I² × Re = P × Re / |Z|
     *
     * @param {number} frequency - Frequency in Hz
     * @param {number} power - Input power in watts
     * @returns {number} Power dissipated as heat in watts
     */
    thermalDissipationAt(frequency, power) {
        if (!this.canCalculateImpedance) {
            throw new Error('Driver missing impedance parameters');
        }
        const z = this.impedanceAt(frequency);
        const re = this.#driver.re;
        return power * re / z.magnitude;
    }

    /**
     * Generate thermal dissipation curve
     *
     * @param {number} power - Input power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=500] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, thermal: number}>} Thermal dissipation data
     *   - frequency: Hz
     *   - thermal: Watts dissipated as heat in voice coil
     */
    thermalDissipationCurve(power, fMin = 10, fMax = 500, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            thermal: this.thermalDissipationAt(frequency, power)
        }));
    }

    // ====================================================================
    // DERIVED MECHANICAL CURVES (from excursion)
    // ====================================================================

    /**
     * Calculate cone velocity at frequency for given power
     *
     * v = 2πf × x (peak velocity for sinusoidal motion)
     *
     * @param {number} frequency - Frequency in Hz
     * @param {number} power - Input power in watts
     * @returns {number} Peak velocity in m/s
     */
    coneVelocityAt(frequency, power) {
        if (!this.canCalculateLimits) {
            throw new Error('Driver missing engineering parameters');
        }
        const excursionMm = this.excursionAt(frequency, power);
        const excursionM = excursionMm / 1000;
        const omega = 2 * Math.PI * frequency;
        return omega * excursionM;
    }

    /**
     * Generate cone velocity curve
     *
     * @param {number} power - Input power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<{frequency: number, velocity: number}>} Cone velocity data
     *   - frequency: Hz
     *   - velocity: m/s (peak)
     */
    coneVelocityCurve(power, fMin = 10, fMax = 200, points = 50) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            velocity: this.coneVelocityAt(frequency, power)
        }));
    }

    /**
     * Calculate cone acceleration at frequency for given power
     *
     * a = (2πf)² × x (peak acceleration for sinusoidal motion)
     *
     * @param {number} frequency - Frequency in Hz
     * @param {number} power - Input power in watts
     * @returns {Object} {ms2: acceleration in m/s², g: acceleration in g's}
     */
    coneAccelerationAt(frequency, power) {
        if (!this.canCalculateLimits) {
            throw new Error('Driver missing engineering parameters');
        }
        const excursionMm = this.excursionAt(frequency, power);
        const excursionM = excursionMm / 1000;
        const omega = 2 * Math.PI * frequency;
        const ms2 = omega * omega * excursionM;
        return { ms2, g: ms2 / 9.81 };
    }

    /**
     * Generate cone acceleration curve
     *
     * @param {number} power - Input power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<{frequency: number, accelG: number, accelMs2: number}>} Cone acceleration data
     *   - frequency: Hz
     *   - accelG: g's (gravity units)
     *   - accelMs2: m/s² (SI acceleration)
     */
    coneAccelerationCurve(power, fMin = 10, fMax = 200, points = 50) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const accel = this.coneAccelerationAt(frequency, power);
            return {
                frequency,
                accelG: accel.g,
                accelMs2: accel.ms2
            };
        });
    }

    // ====================================================================
    // SPL CALCULATIONS
    // ====================================================================

    /**
     * Check if driver has parameters needed for SPL calculation
     * Needs sensitivity (2.83V/1m) and Re (for impedance correction)
     */
    get canCalculateSpl() {
        return this.#driver.hasParams(...SPL_PARAMS);
    }

    /**
     * Calculate SPL at frequency for given power
     *
     * Since sensitivity is stored as 2.83V/1m (industry standard), we need to
     * account for impedance when calculating SPL at arbitrary power levels.
     *
     * SPL = sensitivity_2.83V + response(f) + 10×log10(power × Re/8)
     *
     * The Re/8 term converts from "2.83V reference" to "actual watts":
     * - At 8Ω: 2.83V = 1W, so term is 0dB
     * - At 4Ω: 2.83V = 2W, so 1W is -3dB relative to sensitivity spec
     *
     * @param {number} frequency - Frequency in Hz
     * @param {number} [power=1] - Input power in watts
     * @returns {number} SPL in dB at 1 meter
     */
    splAt(frequency, power = 1) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        if (power <= 0) throw new Error('Power must be positive');

        const sensitivity = this.#driver.sensitivity;
        if (sensitivity == null) {
            throw new Error('Driver missing sensitivity - cannot calculate SPL');
        }

        const re = this.#driver.re;
        if (re == null) {
            throw new Error('Driver missing Re - cannot calculate SPL from 2.83V sensitivity');
        }

        // Convert from 2.83V reference to actual power
        return sensitivity + this.responseAt(frequency) + 10 * Math.log10(power * re / 8);
    }

    /**
     * Generate SPL curve at given power
     *
     * @param {number} [power=1] - Input power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=500] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, spl: number}>} SPL data
     *   - frequency: Hz
     *   - spl: dB SPL at 1 meter
     */
    splCurve(power = 1, fMin = 10, fMax = 500, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            spl: this.splAt(frequency, power)
        }));
    }

    /**
     * Calculate maximum SPL at frequency (limited by excursion or thermal)
     *
     * @param {number} frequency - Frequency in Hz
     * @returns {Object} {maxSpl: dB, maxPower: W, limitingFactor: string}
     */
    maxSplAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');

        const sensitivity = this.#driver.sensitivity;
        if (sensitivity == null) {
            throw new Error('Driver missing sensitivity - cannot calculate SPL');
        }

        const re = this.#driver.re;
        if (re == null) {
            throw new Error('Driver missing Re - cannot calculate SPL from 2.83V sensitivity');
        }

        const powerResult = this.maxPowerAt(frequency);
        // Convert from 2.83V reference to actual power (see splAt for explanation)
        const maxSpl = sensitivity + this.responseAt(frequency) + 10 * Math.log10(powerResult.maxPower * re / 8);

        return {
            maxSpl,
            maxPower: powerResult.maxPower,
            limitingFactor: powerResult.limitingFactor
        };
    }

    /**
     * Generate maximum SPL curve
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=30] - Number of points
     * @returns {Array<{frequency: number, maxSpl: number, maxPower: number, limitingFactor: string}>} Max SPL data
     *   - frequency: Hz
     *   - maxSpl: dB SPL at 1 meter (limited by thermal or excursion)
     *   - maxPower: Watts (power at limit)
     *   - limitingFactor: 'excursion' | 'thermal'
     */
    maxSplCurve(fMin = 10, fMax = 200, points = 30) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const result = this.maxSplAt(frequency);
            return {
                frequency,
                maxSpl: result.maxSpl,
                maxPower: result.maxPower,
                limitingFactor: result.limitingFactor
            };
        });
    }

    /**
     * Generate thermal-only limit curve (SPL limited only by Pe)
     *
     * Shows what SPL you could achieve if excursion wasn't a limit.
     * Useful for visualizing where thermal vs excursion dominates.
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=30] - Number of points
     * @returns {Array<{frequency: number, spl: number}>}
     */
    thermalLimitCurve(fMin = 10, fMax = 200, points = 30) {
        const sensitivity = this.#driver.sensitivity;
        if (sensitivity == null) {
            throw new Error('Driver missing sensitivity - cannot calculate SPL');
        }

        const re = this.#driver.re;
        if (re == null) {
            throw new Error('Driver missing Re - cannot calculate SPL from 2.83V sensitivity');
        }

        const pe = this.#driver.pe;
        if (!pe) {
            throw new Error('Driver missing Pe (power handling)');
        }

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            // SPL at thermal limit = sensitivity + response + 10*log10(Pe * Re/8)
            const spl = sensitivity + this.responseAt(frequency) + 10 * Math.log10(pe * re / 8);
            return { frequency, spl };
        });
    }

    /**
     * Generate excursion-only limit curve (SPL limited only by Xmax)
     *
     * Shows maximum SPL achievable at each frequency if cone is at Xmax.
     * This is purely geometric - depends only on Sd, Xmax, and frequency.
     * Does NOT depend on box volume, power, or electrical parameters.
     *
     * Physics: SPL ∝ f² at constant displacement (piston radiation)
     * Result: Straight line at +12 dB/octave on log-frequency plot
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=30] - Number of points
     * @returns {Array<{frequency: number, spl: number}>}
     */
    excursionLimitCurve(fMin = 10, fMax = 200, points = 30) {
        const xmax = this.#driver.xmaxSI;  // meters
        const sd = this.#driver.sdSI;      // m²

        if (!xmax || !sd) {
            throw new Error('Driver missing Xmax or Sd for excursion limit calculation');
        }

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            // SPL from piston radiation at Xmax - purely geometric
            const spl = Displacement.splFromDisplacement(sd, xmax, frequency);
            return { frequency, spl };
        });
    }

    /**
     * Generate headroom curve (margin to target SPL vs frequency)
     *
     * Headroom = Max achievable SPL - Target SPL
     * Positive = can achieve target with margin
     * Negative = cannot achieve target (need more capability)
     *
     * @param {number} targetSpl - Target SPL in dB
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<{frequency: number, headroom: number, maxSpl: number, limitingFactor: string}>}
     */
    headroomCurve(targetSpl, fMin = 10, fMax = 200, points = 50) {
        if (!targetSpl || targetSpl <= 0) {
            throw new Error('Target SPL must be positive');
        }

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const result = this.maxSplAt(frequency);
            return {
                frequency,
                headroom: result.maxSpl - targetSpl,
                maxSpl: result.maxSpl,
                limitingFactor: result.limitingFactor
            };
        });
    }

    /**
     * Find usable F3 at a target SPL level
     *
     * "Usable F3" is the lowest frequency where the system can achieve
     * the target SPL without exceeding thermal or excursion limits.
     *
     * @param {number} targetSpl - Target SPL in dB
     * @returns {Object} {usableF3: Hz, limitingFactor: string, headroomDb: number at F3}
     */
    usableF3At(targetSpl) {
        // Binary search for lowest frequency that can hit target SPL
        let low = 10;
        let high = 200;

        for (let i = 0; i < 20; i++) {
            const mid = (low + high) / 2;
            const maxAtMid = this.maxSplAt(mid);

            if (maxAtMid.maxSpl >= targetSpl) {
                high = mid;  // Can achieve target, try lower
            } else {
                low = mid;   // Can't achieve target, need higher frequency
            }
        }

        const usableF3 = Math.ceil(high);
        const result = this.maxSplAt(usableF3);

        return {
            usableF3,
            limitingFactor: result.limitingFactor,
            headroomDb: result.maxSpl - targetSpl
        };
    }

    // ====================================================================
    // NONLINEAR (KLIPPEL) EFFECTS
    // ====================================================================

    /**
     * Generate compression curve - SPL loss due to nonlinear effects
     *
     * At high excursions, Bl drops, causing SPL compression. This curve shows
     * how much SPL is lost at each frequency when operating at a given power.
     *
     * Based on Klippel 2006: "Loudspeaker Nonlinearities"
     *
     * @param {number} power - Input power (W)
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<{frequency: number, compressionDb: number, excursion: number, excursionPct: number}>}
     */
    compressionCurve(power, fMin = 10, fMax = 200, points = 50) {
        const xmax = this.#driver.xmax;  // mm
        if (!xmax) {
            throw new Error('Driver missing Xmax for compression calculation');
        }
        if (!this.canCalculateLimits) {
            throw new Error('Driver missing engineering params for compression calculation');
        }

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            // Get excursion at this frequency and power (already in mm)
            const excursion = this.excursionAt(frequency, power);

            // Calculate compression from Bl(x) at this excursion
            const compressionDb = Klippel.blCompressionDb(excursion, xmax);

            return {
                frequency,
                compressionDb,
                excursion,
                excursionPct: (excursion / xmax) * 100
            };
        });
    }

    /**
     * Get compression at a single frequency
     *
     * @param {number} frequency - Frequency (Hz)
     * @param {number} power - Input power (W)
     * @returns {Object} {compressionDb, excursion, excursionPct}
     */
    compressionAt(frequency, power) {
        const xmax = this.#driver.xmax;
        if (!xmax || !this.canCalculateLimits) {
            return { compressionDb: 0, excursion: 0, excursionPct: 0 };
        }

        // excursionAt already returns mm
        const excursion = this.excursionAt(frequency, power);
        const compressionDb = Klippel.blCompressionDb(excursion, xmax);

        return {
            compressionDb,
            excursion,
            excursionPct: (excursion / xmax) * 100
        };
    }

    /**
     * Get compression summary at key frequencies
     *
     * @param {number} power - Input power (W)
     * @returns {Object} Compression at key frequencies
     */
    compressionSummary(power) {
        const keyFreqs = [20, 30, 40, 50, 80];
        const summary = {};

        for (const f of keyFreqs) {
            const result = this.compressionAt(f, power);
            summary[`at${f}Hz`] = result;
        }

        return summary;
    }

    // ====================================================================
    // HARMONIC DISTORTION (Klippel estimation)
    // ====================================================================

    /**
     * Get harmonic distortion at a single frequency
     *
     * Estimates HD2, HD3, and THD based on excursion-driven Bl(x) and Kms(x)
     * nonlinearity. Uses Klippel 2006 simplified models.
     *
     * @param {number} frequency - Frequency (Hz)
     * @param {number} power - Input power (W)
     * @returns {Object} {hd2, hd3, thd, severity} - percentages and classification
     */
    distortionAt(frequency, power) {
        const xmax = this.#driver.xmax;
        if (!xmax || !this.canCalculateLimits) {
            return { hd2: 0, hd3: 0, thd: 0, severity: 'low' };
        }

        const excursionMm = this.excursionAt(frequency, power);  // already in mm
        const result = Klippel.distortionAtExcursion(excursionMm, xmax);

        return {
            hd2: result.hd2,
            hd3: result.hd3,
            thd: result.thd,
            hd3_bl: result.hd3_bl,
            hd3_kms: result.hd3_kms,
            excursion: excursionMm,
            severity: Klippel.classifyDistortion(result.thd)
        };
    }

    /**
     * Generate harmonic distortion curve vs frequency
     *
     * @param {number} power - Input power (W)
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<{frequency, hd2, hd3, thd, severity}>}
     */
    distortionCurve(power, fMin = 10, fMax = 200, points = 50) {
        const xmax = this.#driver.xmax;
        if (!xmax) {
            throw new Error('Driver missing Xmax for distortion calculation');
        }
        if (!this.canCalculateLimits) {
            throw new Error('Driver missing engineering params for distortion calculation');
        }

        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            ...this.distortionAt(frequency, power)
        }));
    }

    /**
     * Find frequency where THD exceeds threshold at given power
     *
     * Useful for finding "usable" low frequency limit based on distortion.
     *
     * @param {number} power - Input power (W)
     * @param {number} [thdThreshold=3] - THD threshold in percent
     * @returns {number|null} Frequency where THD exceeds threshold, or null if always below
     */
    distortionLimitFrequency(power, thdThreshold = 3) {
        const curve = this.distortionCurve(power, 10, 200, 100);

        // Scan from high to low frequency (THD increases at low freq)
        for (let i = curve.length - 1; i >= 0; i--) {
            if (curve[i].thd > thdThreshold) {
                return curve[i].frequency;
            }
        }

        return null;  // THD never exceeds threshold
    }

    // ====================================================================
    // TIME-DOMAIN RESPONSE
    // ====================================================================

    /**
     * Calculate step response at time t
     *
     * Step response shows how the system responds to a sudden input change.
     * For sealed boxes, this reveals transient behavior - "tight" vs "boomy".
     *
     * @param {number} t - Time in seconds
     * @returns {number} Normalized step response (1 at t=0, decays to 0)
     */
    stepResponseAt(t) {
        if (t < 0) throw new Error('Time must be non-negative');
        return Small1972.calculateStepResponse(t, this.#fc, this.#qtc);
    }

    /**
     * Calculate impulse response at time t
     *
     * Impulse response shows the system's "ringing" behavior.
     * Higher Qtc = more oscillation = boomier sound.
     *
     * @param {number} t - Time in seconds
     * @returns {number} Normalized impulse response
     */
    impulseResponseAt(t) {
        if (t < 0) throw new Error('Time must be non-negative');
        return Small1972.calculateImpulseResponse(t, this.#fc, this.#qtc);
    }

    /**
     * Generate step response curve
     *
     * @param {number} [tMax=0.1] - Maximum time in seconds (default 100ms)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{time: number, amplitude: number}>} Step response data
     *   - time: Seconds (NOT milliseconds - UI must convert for display)
     *   - amplitude: Normalized (1 at t=0 for step input, decays to 0)
     */
    stepResponseCurve(tMax = 0.1, points = 100) {
        return generateTimeCurve(t => this.stepResponseAt(t), tMax, points);
    }

    /**
     * Generate impulse response curve
     *
     * @param {number} [tMax=0.1] - Maximum time in seconds (default 100ms)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{time: number, amplitude: number}>} Impulse response data
     *   - time: Seconds (NOT milliseconds - UI must convert for display)
     *   - amplitude: Normalized impulse response
     */
    impulseResponseCurve(tMax = 0.1, points = 100) {
        return generateTimeCurve(t => this.impulseResponseAt(t), tMax, points);
    }

    /**
     * Get step response metrics
     *
     * Returns key transient performance indicators:
     * - overshoot: How much response overshoots (fraction)
     * - settlingTime: Time to settle within 5% (seconds)
     * - riseTime: Time for initial transition (seconds)
     * - dampingRatio: ζ = 1/(2×Qtc)
     *
     * @returns {Object} {overshoot, settlingTime, riseTime, dampingRatio}
     */
    stepResponseMetrics() {
        return Small1972.calculateStepResponseMetrics(this.#fc, this.#qtc);
    }

    // ====================================================================
    // STATIC FACTORY METHODS
    // ====================================================================

    /**
     * Design for Butterworth alignment (Qtc = 0.707)
     *
     * @param {Driver} driver - Driver instance
     * @returns {SealedBox} Box designed for Butterworth
     */
    static butterworth(driver) {
        const volume = SealedBox.volumeForQtc(driver, BUTTERWORTH_QTC);
        return new SealedBox(driver, volume);
    }

    /**
     * Design for Bessel alignment (Qtc = 0.577)
     *
     * @param {Driver} driver - Driver instance
     * @returns {SealedBox} Box designed for Bessel
     */
    static bessel(driver) {
        const volume = SealedBox.volumeForQtc(driver, BESSEL_QTC);
        return new SealedBox(driver, volume);
    }

    /**
     * Design for Chebyshev alignment (Qtc = 1.0)
     *
     * @param {Driver} driver - Driver instance
     * @returns {SealedBox} Box designed for Chebyshev
     */
    static chebyshev(driver) {
        const volume = SealedBox.volumeForQtc(driver, CHEBYSHEV_QTC);
        return new SealedBox(driver, volume);
    }

    /**
     * Calculate volume needed for target Qtc
     *
     * @param {Driver} driver - Driver instance
     * @param {number} targetQtc - Desired system Q
     * @returns {number} Required volume in liters
     * @throws {Error} If targetQtc <= driver.qts (impossible)
     */
    static volumeForQtc(driver, targetQtc) {
        if (!(driver instanceof Driver)) {
            throw new Error('volumeForQtc requires a Driver instance');
        }

        if (targetQtc <= driver.qts) {
            throw new Error(
                `Target Qtc=${targetQtc} must be greater than driver Qts=${driver.qts}. ` +
                `A sealed box always increases Q.`
            );
        }

        // From Qtc = Qts × √(1 + α), solve for α, then Vb
        // α = (Qtc/Qts)² - 1
        // Vb = Vas / α
        const ratio = targetQtc / driver.qts;
        const alpha = ratio * ratio - 1;
        const vbSI = driver.vasSI / alpha;

        return vbSI * 1000;  // m³ to liters
    }

    // ====================================================================
    // SERIALIZATION
    // ====================================================================

    /**
     * Export design as plain object
     */
    toObject() {
        return {
            type: 'sealed',
            driver: this.#driver.toObject(),
            volumeLiters: this.#volumeLiters,
            computed: {
                alpha: this.#alpha,
                fc: this.#fc,
                qtc: this.#qtc,
                f3: this.#f3,
                alignmentName: this.alignmentName
            }
        };
    }

    /**
     * Create SealedBox from plain object
     */
    static fromObject(obj) {
        if (obj.type !== 'sealed') {
            throw new Error(`Expected type='sealed', got '${obj.type}'`);
        }
        const driver = Driver.fromObject(obj.driver);
        return new SealedBox(driver, obj.volumeLiters);
    }

    /**
     * Summary string for display
     */
    toString() {
        return `SealedBox: ${this.#volumeLiters.toFixed(0)}L, ` +
               `Qtc=${this.#qtc.toFixed(3)}, F3=${this.#f3.toFixed(1)}Hz ` +
               `(${this.alignmentName})`;
    }
}
