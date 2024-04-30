/**
 * VentedBox Model - Unified Vented Enclosure Design
 *
 * Represents a vented (bass reflex) box with either Port or PassiveRadiator vent.
 * The acoustic response is identical for both - only vent-specific limits differ.
 *
 * This unifies what was previously PortedBox + (future) PassiveRadiatorBox
 * into a single model with pluggable vent implementations.
 *
 * STRICTEST POLICY: Factory methods require explicit parameters.
 * - Vent (Port or PR) REQUIRED - no fabricated defaults
 * - ql defaults to Infinity (lossless, paper-true per Small 1973)
 * - C4 alignment requires explicit k (ripple is a design choice)
 * For realistic response modeling, pass { ql: 7 } explicitly.
 *
 * Usage:
 *   // With port - EXPLICIT vent required
 *   const port = new Port({ diameter: 10, flared: true });
 *   const box = VentedBox.qb3(driver, port);           // lossless (paper-true)
 *   const box = VentedBox.qb3(driver, port, {ql: 7});  // realistic losses
 *
 *   // With passive radiator
 *   const pr = new PassiveRadiator({ mmp: 150, sd: 500, xmax: 22 });
 *   const box = new VentedBox(driver, 100, 28, pr);
 *
 *   // Same response API for both:
 *   box.responseAt(30);     // dB
 *   box.f3;                 // -3dB point
 *   box.responseCurve();    // graph data
 *
 *   // Vent-specific limits via unified API:
 *   box.ventLimitAt(30, 500);  // returns velocity or excursion info
 */

import { Driver } from './Driver.js';
import { Port } from './vents/Port.js';
import { PassiveRadiator } from './vents/PassiveRadiator.js';
import * as Small1972 from '../foundation/small-1972.js';
import * as Small1973 from '../foundation/small-1973.js';
import * as PRCalc from '../foundation/vented/passive-radiator.js';
import { createMaxPowerFunction, createDisplacementFunction, sampleFunction } from '../engineering/power-limits.js';
import * as Displacement from '../engineering/displacement.js';
import * as Klippel from '../foundation/klippel/index.js';
import { generateLogFrequencies, generateTimeCurve } from '../foundation/utils.js';
import { MOTOR_PARAMS, LIMIT_PARAMS, SPL_PARAMS } from './param-requirements.js';

export class VentedBox {
    #driver;
    #volumeLiters;
    #fb;
    #vent;              // Port or PassiveRadiator
    #ventType;          // 'port' | 'passive-radiator'
    #ql;                // Enclosure losses Q

    // Computed at construction
    #alpha;
    #f3;
    #tuningRatio;

    // Port-specific (cached)
    #portLengthM;

    // Lazy-initialized engineering functions (function-first pattern)
    #maxPowerFn = null;
    #displacementFn = null;

    // Validation warnings (informational, not errors)
    #warnings = [];

    /**
     * Create a vented box design
     *
     * @param {Driver} driver - Validated driver instance
     * @param {number} volumeLiters - Internal box volume in liters
     * @param {number} fb - Tuning frequency in Hz
     * @param {Port|PassiveRadiator} vent - Vent configuration
     * @param {Object} [options]
     * @param {number} [options.ql=7] - Enclosure losses Q (7-10 typical)
     */
    constructor(driver, volumeLiters, fb, vent, options = {}) {
        const { ql = 7 } = options;

        // Validate driver
        if (!(driver instanceof Driver)) {
            throw new Error(
                'VentedBox requires a Driver instance. ' +
                'Use: new VentedBox(new Driver({...}), volume, fb, vent)'
            );
        }
        this.#driver = driver;

        // Validate volume
        if (volumeLiters == null || volumeLiters <= 0) {
            throw new Error('Box volume must be positive');
        }
        if (volumeLiters > 5000) {
            throw new Error(
                `Volume=${volumeLiters}L is unusually large (>5000L). Check units.`
            );
        }
        this.#volumeLiters = volumeLiters;

        // Validate tuning frequency
        if (fb == null || fb <= 0) {
            throw new Error('Tuning frequency (fb) must be positive');
        }
        if (fb > 200) {
            throw new Error(
                `Fb=${fb}Hz is unusually high for a subwoofer/woofer. ` +
                `Typical range: 15-60Hz.`
            );
        }
        this.#fb = fb;

        // Validate and store vent
        if (vent instanceof Port) {
            this.#ventType = 'port';
            this.#vent = vent;

            // Calculate port length
            try {
                this.#portLengthM = vent.lengthFor(fb, this.volumeSI);
            } catch {
                this.#portLengthM = null;  // Port too small
            }

        } else if (vent instanceof PassiveRadiator) {
            this.#ventType = 'passive-radiator';
            this.#vent = vent;

            // Note: PR tuning is determined by PR mass, not a parameter
            // Check if actual tuning matches requested
            // Threshold: 15% is audibly significant but allows for measurement tolerance
            const actualFb = vent.tuningFor(this.volumeSI);
            const fbError = Math.abs(actualFb - fb) / fb;
            if (fbError > 0.15) {
                this.#warnings.push({
                    type: 'pr-tuning-mismatch',
                    message: `PR natural tuning is ${actualFb.toFixed(1)}Hz, ` +
                        `requested ${fb.toFixed(1)}Hz (${(fbError * 100).toFixed(0)}% difference). ` +
                        `Consider adjusting PR mass.`,
                    actualFb,
                    requestedFb: fb,
                    errorPercent: fbError * 100
                });
            }

        } else {
            throw new Error(
                'VentedBox requires a Port or PassiveRadiator vent. ' +
                'Use: new Port({diameter: 10}) or new PassiveRadiator({mmp: 150, sd: 500, xmax: 22})'
            );
        }

        // Store QL
        if (ql <= 0) {
            throw new Error('QL must be positive (use Infinity for lossless)');
        }
        this.#ql = ql;

        // Compute system parameters
        const vbSI = volumeLiters / 1000;
        this.#alpha = Small1972.calculateAlpha(driver.vasSI, vbSI);
        this.#tuningRatio = fb / driver.fs;

        // Warn if tuning above Fs (unusual - loses bass extension benefit)
        // Threshold: 110% gives QB3 alignments (Fb ≈ Fs) breathing room
        if (fb > driver.fs * 1.1) {
            this.#warnings.push({
                type: 'tuning-above-fs',
                message: `Tuning frequency (${fb.toFixed(0)}Hz) is above driver Fs ` +
                    `(${driver.fs.toFixed(0)}Hz). This reduces bass extension benefit of porting.`,
                fb,
                fs: driver.fs,
                severity: 'info'
            });
        }

        // For response calculations, use appropriate loss Q
        const effectiveQl = this.#effectiveQl;
        this.#f3 = Small1973.calculatePortedF3(
            driver.fs, fb, this.#alpha, driver.qts, effectiveQl
        );

        Object.freeze(this);
    }

    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================

    /**
     * Effective Q for loss calculations
     * For port: use QL
     * For PR: use Qmp (PR mechanical losses dominate)
     */
    get #effectiveQl() {
        return this.#ventType === 'passive-radiator'
            ? this.#vent.qmp
            : this.#ql;
    }

    // ========================================================================
    // BASIC GETTERS
    // ========================================================================

    /** The driver used in this design */
    get driver() { return this.#driver; }

    /** Box internal volume in liters */
    get volumeLiters() { return this.#volumeLiters; }

    /** Box internal volume in m^3 */
    get volumeSI() { return this.#volumeLiters / 1000; }

    /** Tuning frequency (Hz) */
    get fb() { return this.#fb; }

    /** -3dB frequency (Hz) */
    get f3() { return this.#f3; }

    /** Compliance ratio (Vas/Vb) */
    get alpha() { return this.#alpha; }

    /** Tuning ratio (Fb/Fs) */
    get tuningRatio() { return this.#tuningRatio; }

    /** Enclosure losses Q */
    get ql() { return this.#ql; }

    // ========================================================================
    // VENT GETTERS
    // ========================================================================

    /** Vent type: 'port' or 'passive-radiator' */
    get ventType() { return this.#ventType; }

    /** The vent object (Port or PassiveRadiator) */
    get vent() { return this.#vent; }

    /** Always true for vented boxes (capability check) */
    get isVented() { return true; }

    /** True if vent is a port */
    get isPort() { return this.#ventType === 'port'; }

    /** True if vent is a passive radiator */
    get isPassiveRadiator() { return this.#ventType === 'passive-radiator'; }

    /**
     * Validation warnings (informational, not errors)
     * These are issues detected at construction time that don't prevent
     * the design from working but may indicate suboptimal configuration.
     * @returns {Array<{type: string, message: string, ...details}>}
     */
    get warnings() { return [...this.#warnings]; }

    /** True if there are any warnings */
    get hasWarnings() { return this.#warnings.length > 0; }

    // Port-specific
    /** Port length in m (port only, null otherwise) */
    get portLengthM() { return this.#portLengthM; }

    /** Port length in cm (port only, null otherwise) */
    get portLengthCm() { return this.#portLengthM != null ? this.#portLengthM * 100 : null; }

    /** Port length in mm (port only, null otherwise) */
    get portLengthMm() { return this.#portLengthM != null ? this.#portLengthM * 1000 : null; }

    // ========================================================================
    // ALIGNMENT CLASSIFICATION
    // ========================================================================

    /** Alignment name based on tuning ratio */
    get alignmentName() {
        if (Math.abs(this.#tuningRatio - 1.0) < 0.1) return 'QB3';
        if (this.#tuningRatio < 0.9 && this.#alpha > 1) return 'B4';
        if (this.#tuningRatio < 0.8) return 'C4';
        return 'Custom';
    }

    /** Alignment description */
    get alignmentDescription() {
        switch (this.alignmentName) {
            case 'QB3':
                return 'Quasi-Butterworth 3rd order - maximally flat, good efficiency';
            case 'B4':
                return 'Butterworth 4th order - maximally flat, extended bass';
            case 'C4':
                return 'Chebyshev 4th order - maximum extension with ripple';
            default:
                return 'Custom vented alignment';
        }
    }

    // ========================================================================
    // RESPONSE CALCULATIONS (Universal - same for port and PR)
    // ========================================================================

    /**
     * Get response at frequency in dB
     */
    responseAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        return Small1973.calculatePortedResponseDb(
            frequency, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#effectiveQl
        );
    }

    /**
     * Get response magnitude at frequency (linear)
     */
    magnitudeAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        return Small1973.calculatePortedResponseMagnitude(
            frequency, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#effectiveQl
        );
    }

    /**
     * Get phase response at frequency in degrees
     */
    phaseAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        return Small1973.calculatePortedResponsePhase(
            frequency, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#effectiveQl
        );
    }

    /**
     * Get group delay at frequency in seconds
     */
    groupDelayAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        return Small1973.calculateGroupDelay(
            frequency, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#effectiveQl
        );
    }

    /**
     * Get cone displacement transfer function magnitude (normalized)
     */
    coneDisplacementAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        return Small1973.calculateConeDisplacementTransfer(
            frequency, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#effectiveQl
        );
    }

    /**
     * Generate response curve data
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
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

    /**
     * Get cone volume velocity magnitude at frequency (normalized)
     *
     * Shows how much the CONE contributes to total acoustic output.
     * The notch at Fb is why ported boxes handle more power near tuning.
     *
     * @param {number} frequency - Hz
     * @returns {number} Normalized magnitude (0-1 scale, 1 = passband)
     */
    coneContributionAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        return Small1973.calculateConeVolumeVelocityMagnitude(
            frequency, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#effectiveQl
        );
    }

    /**
     * Get port volume velocity magnitude at frequency (normalized)
     *
     * Shows how much the PORT contributes to total acoustic output.
     * Maximum near Fb, rolls off above and below.
     *
     * @param {number} frequency - Hz
     * @returns {number} Normalized magnitude
     */
    portContributionAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        return Small1973.calculatePortVolumeVelocityMagnitude(
            frequency, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#effectiveQl
        );
    }

    /**
     * Generate cone/port contribution curves
     *
     * Shows how cone and port share the acoustic workload.
     * - Below Fb: both contribute, cone dominates
     * - At Fb: port maximum, cone minimum (the "notch")
     * - Above Fb: cone takes over, port rolls off
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=100] - Number of points
     * @returns {Array<{frequency: number, cone: number, port: number, total: number}>} Contribution data
     *   - frequency: Hz
     *   - cone: Normalized cone contribution (0-1)
     *   - port: Normalized port/PR contribution (0-1)
     *   - total: Combined response magnitude
     */
    contributionCurve(fMin = 10, fMax = 200, points = 100) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const cone = this.coneContributionAt(frequency);
            const port = this.portContributionAt(frequency);
            // Total is the vector sum (they're in phase in passband)
            // For display, we show the combined response magnitude
            const total = Small1973.calculatePortedResponseMagnitude(
                frequency, this.#driver.fs, this.#fb,
                this.#alpha, this.#driver.qts, this.#effectiveQl
            );
            return { frequency, cone, port, total };
        });
    }

    // ========================================================================
    // ENGINEERING CALCULATIONS
    // ========================================================================

    /** Check if driver has all motor params needed for displacement calculations */
    get canCalculateDisplacement() {
        return this.#driver.hasParams(...MOTOR_PARAMS);
    }

    /** Check if driver has params for power/excursion limit calculations */
    get canCalculateLimits() {
        return this.canCalculateDisplacement && this.#driver.hasParams(...LIMIT_PARAMS);
    }

    /**
     * Build parameter object for engineering layer
     * @private
     */
    #buildEngineeringParams() {
        const d = this.#driver;

        if (!d.hasParams(...MOTOR_PARAMS, ...LIMIT_PARAMS)) {
            throw new Error(
                'Driver missing engineering parameters. Required: re, bl, mms, cms, rms, xmax, pe.'
            );
        }

        return {
            boxType: 'ported',
            re: d.re,
            bl: d.bl,
            mms: d.mmsSI,
            cms: d.cms,
            rms: d.rms,
            alpha: this.#alpha,
            xmax: d.xmaxSI,
            pe: d.pe,
            fs: d.fs,
            fb: this.#fb,
            qts: d.qts,
            ql: this.#effectiveQl
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
     */
    excursionAt(frequency, power) {
        if (frequency <= 0) throw new Error('Frequency must be positive');
        if (power <= 0) throw new Error('Power must be positive');

        const displacementFn = this.#getDisplacementFn();
        const excursionM = displacementFn(frequency, power);
        return excursionM * 1000;  // m to mm
    }

    /**
     * Calculate maximum safe power at frequency (limited by excursion or thermal)
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

    // ========================================================================
    // VENT-SPECIFIC CALCULATIONS
    // ========================================================================

    /**
     * Get vent limit at frequency (unified API)
     *
     * For port: returns air velocity info
     * For PR: returns excursion info
     *
     * @param {number} frequency - Hz
     * @param {number} power - Watts
     * @returns {Object} {value, unit, limit, overLimit, type}
     */
    ventLimitAt(frequency, power) {
        if (this.isPort) {
            const velocity = this.portVelocityAt(frequency, power);
            const limit = this.#vent.maxVelocity;
            return {
                value: velocity,
                unit: 'm/s',
                limit,
                overLimit: velocity > limit,
                type: 'velocity'
            };
        } else {
            const excursion = this.prExcursionAt(frequency, power);
            const limit = this.#vent.xmaxMm;
            return {
                value: excursion,
                unit: 'mm',
                limit,
                overLimit: excursion > limit,
                type: 'excursion'
            };
        }
    }

    /**
     * Calculate port air velocity at frequency (port only)
     */
    portVelocityAt(frequency, power) {
        if (!this.isPort) {
            throw new Error('portVelocityAt only available for port vents');
        }
        if (frequency <= 0) throw new Error('Frequency must be positive');
        if (power <= 0) throw new Error('Power must be positive');

        // Calculate cone excursion
        const excursionM = this.excursionAt(frequency, power) / 1000;

        // Volume velocity from cone
        const volumeVelocity = this.#driver.sdSI * 2 * Math.PI * frequency * excursionM;

        // Port velocity
        return this.#vent.velocityFor(volumeVelocity);
    }

    /**
     * Calculate PR excursion at frequency (PR only)
     */
    prExcursionAt(frequency, power) {
        if (!this.isPassiveRadiator) {
            throw new Error('prExcursionAt only available for passive radiator vents');
        }
        if (frequency <= 0) throw new Error('Frequency must be positive');
        if (power <= 0) throw new Error('Power must be positive');

        // PR displacement transfer function (normalized)
        const transferMag = PRCalc.calculateDisplacementTransfer(
            frequency, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#vent.qmp
        );

        // Scale by cone excursion to get absolute PR excursion
        // PR and cone have similar excursion magnitudes near Fb
        const coneExcursionM = this.excursionAt(frequency, power) / 1000;

        // Use ratio of transfer functions
        const coneTransfer = Small1973.calculateConeDisplacementTransfer(
            frequency, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#vent.qmp
        );

        // PR excursion relative to cone
        const ratio = coneTransfer > 1e-10 ? transferMag / coneTransfer : 1;
        const prExcursionM = coneExcursionM * ratio * (this.#driver.sdSI / this.#vent.totalAreaSI);

        return prExcursionM * 1000;  // m to mm
    }

    /**
     * Generate port velocity curve (port only)
     *
     * @param {number} power - Input power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<{frequency: number, velocity: number, overLimit: boolean, overQuiet: boolean}>} Port velocity data
     *   - frequency: Hz
     *   - velocity: m/s (peak air velocity in port)
     *   - overLimit: true if velocity > port maxVelocity
     *   - overQuiet: true if velocity > port quietVelocity
     */
    portVelocityCurve(power, fMin = 10, fMax = 200, points = 50) {
        if (!this.isPort) {
            throw new Error('portVelocityCurve only available for port vents');
        }
        if (power <= 0) throw new Error('Power must be positive');

        const limit = this.#vent.maxVelocity;
        const quietLimit = this.#vent.quietVelocity;

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const velocity = this.portVelocityAt(frequency, power);
            return {
                frequency,
                velocity,
                overLimit: velocity > limit,
                overQuiet: velocity > quietLimit
            };
        });
    }

    /**
     * Generate PR excursion curve (PR only)
     *
     * @param {number} power - Input power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<{frequency: number, excursion: number, overXmax: boolean}>} PR excursion data
     *   - frequency: Hz
     *   - excursion: mm (peak)
     *   - overXmax: true if excursion > PR Xmax
     */
    prExcursionCurve(power, fMin = 10, fMax = 200, points = 50) {
        if (!this.isPassiveRadiator) {
            throw new Error('prExcursionCurve only available for passive radiator vents');
        }
        if (power <= 0) throw new Error('Power must be positive');

        const xmaxMm = this.#vent.xmaxMm;

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const excursion = this.prExcursionAt(frequency, power);
            return {
                frequency,
                excursion,
                overXmax: excursion > xmaxMm
            };
        });
    }

    /**
     * Generate vent limit curve (unified - works for both port and PR)
     */
    ventLimitCurve(power, fMin = 10, fMax = 200, points = 50) {
        if (this.isPort) {
            return this.portVelocityCurve(power, fMin, fMax, points);
        } else {
            return this.prExcursionCurve(power, fMin, fMax, points);
        }
    }

    /**
     * Generate excursion comparison curve (PR only)
     * Shows driver excursion vs PR excursion on same frequency axis
     *
     * @param {number} power - Input power in watts
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<Object>} Comparison data
     *   - frequency: Hz
     *   - driverExcursion: mm (driver cone excursion)
     *   - prExcursion: mm (passive radiator excursion)
     *   - ratio: prExcursion / driverExcursion
     *   - driverOverXmax: true if driver exceeds its Xmax
     *   - prOverXmax: true if PR exceeds its Xmax
     */
    excursionComparisonCurve(power, fMin = 10, fMax = 200, points = 50) {
        if (!this.isPassiveRadiator) {
            throw new Error('excursionComparisonCurve only available for passive radiator vents');
        }
        if (power <= 0) throw new Error('Power must be positive');

        const driverXmax = this.#driver.xmax;
        const prXmax = this.#vent.xmaxMm;

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const driverExcursion = this.excursionAt(frequency, power);
            const prExcursion = this.prExcursionAt(frequency, power);
            const ratio = driverExcursion > 0.001 ? prExcursion / driverExcursion : 0;

            return {
                frequency,
                driverExcursion,
                prExcursion,
                ratio,
                driverOverXmax: driverExcursion > driverXmax,
                prOverXmax: prExcursion > prXmax
            };
        });
    }

    /**
     * Generate PR power limit curve (PR only)
     * Shows maximum power at each frequency before PR hits its Xmax
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @returns {Array<Object>} Power limit data
     *   - frequency: Hz
     *   - prMaxPower: Watts (max power before PR Xmax exceeded)
     *   - driverMaxPower: Watts (max power before driver Xmax exceeded)
     *   - limitingFactor: 'pr' | 'driver' | 'thermal'
     *   - effectiveMaxPower: Watts (the actual limit, considering all factors)
     */
    prPowerLimitCurve(fMin = 10, fMax = 200, points = 50) {
        if (!this.isPassiveRadiator) {
            throw new Error('prPowerLimitCurve only available for passive radiator vents');
        }

        const prXmax = this.#vent.xmaxMm;
        const thermalLimit = this.#driver.pe || Infinity;

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            // Get driver max power (excursion limited)
            const driverResult = this.maxPowerAt(frequency);
            const driverMaxPower = driverResult.maxPower;

            // Calculate PR max power by scaling
            // PR excursion is proportional to sqrt(power), so:
            // prExcursion(P) = prExcursion(1W) * sqrt(P)
            // Solving for P when prExcursion = prXmax:
            // prMaxPower = (prXmax / prExcursion(1W))^2
            const prExcursionAt1W = this.prExcursionAt(frequency, 1);
            const prMaxPower = prExcursionAt1W > 0.001
                ? Math.pow(prXmax / prExcursionAt1W, 2)
                : Infinity;

            // Determine limiting factor
            let limitingFactor;
            let effectiveMaxPower;

            if (prMaxPower <= driverMaxPower && prMaxPower <= thermalLimit) {
                limitingFactor = 'pr';
                effectiveMaxPower = prMaxPower;
            } else if (driverMaxPower <= thermalLimit) {
                limitingFactor = 'driver';
                effectiveMaxPower = driverMaxPower;
            } else {
                limitingFactor = 'thermal';
                effectiveMaxPower = thermalLimit;
            }

            return {
                frequency,
                prMaxPower: Math.min(prMaxPower, 10000), // Cap at 10kW for display
                driverMaxPower,
                limitingFactor,
                effectiveMaxPower: Math.min(effectiveMaxPower, 10000)
            };
        });
    }

    /**
     * Generate port Mach number curve (port only)
     *
     * Mach = velocity / speed_of_sound
     * Guidelines:
     * - Mach < 0.05: Generally inaudible
     * - Mach 0.05-0.1: Audible turbulence possible
     * - Mach > 0.1: Severe chuffing
     */
    portMachCurve(power, fMin = 10, fMax = 200, points = 50) {
        if (!this.isPort) {
            throw new Error('portMachCurve only available for port vents');
        }
        if (power <= 0) throw new Error('Power must be positive');

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const velocity = this.portVelocityAt(frequency, power);
            const mach = this.#vent.machFor(velocity);
            return {
                frequency,
                mach,
                velocity,
                overSafe: mach > 0.05,
                overCaution: mach > 0.08,
                overSevere: mach > 0.1
            };
        });
    }

    /**
     * Generate port Reynolds number curve (port only)
     *
     * Re indicates turbulence regime:
     * - Re < 2,300: Laminar (quiet, unrealistic for ports)
     * - Re 2,300-4,000: Transitional
     * - Re > 4,000: Turbulent (all real port flow)
     * - Re > 50,000: Highly turbulent, significant noise
     */
    portReynoldsCurve(power, fMin = 10, fMax = 200, points = 50) {
        if (!this.isPort) {
            throw new Error('portReynoldsCurve only available for port vents');
        }
        if (power <= 0) throw new Error('Power must be positive');

        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const velocity = this.portVelocityAt(frequency, power);
            const reynolds = this.#vent.reynoldsFor(velocity);
            return {
                frequency,
                reynolds,
                velocity,
                turbulent: reynolds > 4000,
                highlyTurbulent: reynolds > 50000
            };
        });
    }

    // ========================================================================
    // IMPEDANCE CALCULATIONS
    // ========================================================================

    /** Check if driver has parameters needed for impedance calculation */
    get canCalculateImpedance() {
        return this.#driver.hasParams(...MOTOR_PARAMS);
    }

    /**
     * Calculate electrical impedance at frequency
     */
    impedanceAt(frequency) {
        if (frequency <= 0) throw new Error('Frequency must be positive');

        const d = this.#driver;
        if (!this.canCalculateImpedance) {
            throw new Error('Driver missing impedance parameters');
        }

        const result = Small1973.calculatePortedImpedance(
            frequency, d.fs, this.#fb, this.#alpha, d.qts, this.#effectiveQl,
            d.re, d.leSI, d.bl, d.mmsSI,
            d.cms, d.rms, d.sdSI
        );

        return { magnitude: result.magnitude, phase: result.phase };
    }

    /**
     * Generate impedance curve
     *
     * @param {number} [fMin=5] - Start frequency (Hz)
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

    // ========================================================================
    // DERIVED ELECTRICAL CURVES (from impedance)
    // ========================================================================

    /**
     * Calculate current draw at frequency for given power
     * I = √(P / |Z|)
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
     * Calculate EPDR at frequency
     * EPDR = |Z| × cos(φ)
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
            epdr: Math.max(this.epdrAt(frequency), 0.1)
        }));
    }

    /**
     * Calculate apparent power (VA) at frequency
     * VA = P / cos(φ)
     */
    apparentPowerAt(frequency, power) {
        if (!this.canCalculateImpedance) {
            throw new Error('Driver missing impedance parameters');
        }
        const z = this.impedanceAt(frequency);
        const phaseRad = z.phase * Math.PI / 180;
        const powerFactor = Math.max(Math.abs(Math.cos(phaseRad)), 0.1);
        return power / powerFactor;
    }

    /**
     * Generate apparent power curve
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
            va: Math.min(this.apparentPowerAt(frequency, power), power * 10)
        }));
    }

    /**
     * Calculate thermal dissipation at frequency
     * P_thermal = P × Re / |Z|
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

    // ========================================================================
    // DERIVED MECHANICAL CURVES (from excursion)
    // ========================================================================

    /**
     * Calculate cone velocity at frequency
     * v = 2πf × x
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
     * Calculate cone acceleration at frequency
     * a = (2πf)² × x
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

    // ========================================================================
    // SPL CALCULATIONS
    // ========================================================================

    /** Check if driver has parameters for SPL calculation */
    get canCalculateSpl() {
        return this.#driver.hasParams(...SPL_PARAMS);
    }

    /**
     * Calculate SPL at frequency for given power
     *
     * Since sensitivity is stored as 2.83V/1m (industry standard), we account
     * for impedance when calculating SPL at arbitrary power levels.
     * See SealedBox.splAt for detailed explanation.
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

        return sensitivity + this.responseAt(frequency) + 10 * Math.log10(power * re / 8);
    }

    /**
     * Generate SPL curve
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
     * Calculate maximum SPL at frequency
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
     * Shows maximum SPL if power handling were the only limit.
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

        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            spl: sensitivity + this.responseAt(frequency) + 10 * Math.log10(pe * re / 8)
        }));
    }

    /**
     * Generate excursion-only limit curve (SPL limited only by Xmax)
     *
     * Shows maximum SPL achievable at each frequency if cone is at Xmax.
     * This is purely geometric - depends only on Sd, Xmax, and frequency.
     * Does NOT depend on box volume, power, or electrical parameters.
     *
     * Note: For vented boxes, the ACTUAL excursion at a given power is reduced
     * near Fb (port unloading). But this curve shows the PHYSICAL LIMIT -
     * what happens if the cone somehow reaches Xmax at each frequency.
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

        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            spl: Displacement.splFromDisplacement(sd, xmax, frequency)
        }));
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
     * Searches for the lowest frequency where max SPL >= target.
     *
     * @param {number} targetSpl - Target SPL in dB
     * @returns {Object} {usableF3: Hz, limitingFactor: string, headroomDb: number}
     */
    usableF3At(targetSpl) {
        let low = 10;
        let high = 200;

        for (let i = 0; i < 20; i++) {
            const mid = (low + high) / 2;
            const maxAtMid = this.maxSplAt(mid);

            if (maxAtMid.maxSpl >= targetSpl) {
                high = mid;
            } else {
                low = mid;
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

    /**
     * Find the impedance peak frequencies (fL and fH)
     *
     * For vented boxes, impedance shows two peaks around the tuning frequency.
     *
     * @returns {Object} {fL: Hz, fH: Hz, Zmin: Ω}
     */
    findImpedancePeaks() {
        const d = this.#driver;
        if (!this.canCalculateImpedance) {
            throw new Error('Driver missing impedance parameters');
        }

        return Small1973.findPortedImpedancePeaks(
            d.fs,
            this.#fb,
            this.#alpha,
            d.qts,
            this.#ql,
            d.re,
            d.leSI,
            d.bl,
            d.mmsSI,
            d.cms,
            d.rms,
            d.sdSI
        );
    }

    // ========================================================================
    // NONLINEAR (KLIPPEL) EFFECTS
    // ========================================================================

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

    // ========================================================================
    // HARMONIC DISTORTION (Klippel estimation)
    // ========================================================================

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

    // ========================================================================
    // TIME-DOMAIN RESPONSE (Analytical - Pole Decomposition)
    // ========================================================================
    // Uses analytical 4th-order step/impulse response from foundation layer.
    // The response is computed via pole-residue decomposition of the transfer
    // function, giving exact results (no numerical approximations).

    /**
     * Calculate step response at specific time
     *
     * For a 4th-order highpass, step response starts at 1 (full response
     * to the step transient) and decays to 0 (DC blocked).
     *
     * @param {number} t - Time in seconds
     * @returns {number} Normalized amplitude (starts at 1, decays to 0)
     */
    stepResponseAt(t) {
        return Small1973.calculatePortedStepResponse(
            t, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#effectiveQl
        );
    }

    /**
     * Calculate impulse response at specific time
     *
     * For a 4th-order highpass, impulse response shows oscillatory decay.
     *
     * @param {number} t - Time in seconds
     * @returns {number} Normalized amplitude
     */
    impulseResponseAt(t) {
        return Small1973.calculatePortedImpulseResponse(
            t, this.#driver.fs, this.#fb,
            this.#alpha, this.#driver.qts, this.#effectiveQl
        );
    }

    /**
     * Generate impulse response curve
     *
     * @param {number} [tMax=0.1] - Maximum time in seconds
     * @param {number} [points=100] - Number of points
     * @returns {Array<{time: number, amplitude: number}>} Impulse response data
     *   - time: Seconds (NOT milliseconds - UI must convert for display)
     *   - amplitude: Normalized impulse response
     */
    impulseResponseCurve(tMax = 0.1, points = 100) {
        return generateTimeCurve(t => this.impulseResponseAt(t), tMax, points);
    }

    /**
     * Generate step response curve
     *
     * @param {number} [tMax=0.1] - Maximum time in seconds
     * @param {number} [points=100] - Number of points
     * @returns {Array<{time: number, amplitude: number}>} Step response data
     *   - time: Seconds (NOT milliseconds - UI must convert for display)
     *   - amplitude: Normalized (1 at t=0 for step input, decays to 0)
     */
    stepResponseCurve(tMax = 0.1, points = 100) {
        return generateTimeCurve(t => this.stepResponseAt(t), tMax, points);
    }

    /**
     * Get step response metrics (approximate)
     *
     * Uses foundation's analytical approximations for 4th-order metrics.
     *
     * @returns {Object} {overshoot, settlingTime, riseTime, dampingRatio}
     */
    stepResponseMetrics() {
        return Small1973.calculatePortedStepResponseMetrics(
            this.#driver.fs, this.#fb, this.#alpha,
            this.#driver.qts, this.#effectiveQl
        );
    }

    // ========================================================================
    // STATIC FACTORY METHODS
    // ========================================================================

    /**
     * Parse factory method arguments - handles optional vent parameter
     * @private
     */
    static #parseFactoryArgs(ventOrOptions, maybeOptions) {
        // If first arg is a Port or PassiveRadiator, use it
        if (ventOrOptions instanceof Port || ventOrOptions instanceof PassiveRadiator) {
            return { vent: ventOrOptions, options: maybeOptions || {} };
        }
        // Otherwise, first arg is options - require explicit port specification
        const options = ventOrOptions || maybeOptions || {};
        if (!options.portDiameterCm) {
            throw new Error(
                'Factory methods require explicit vent specification. ' +
                'Pass a Port/PassiveRadiator as second argument, or specify portDiameterCm in options. ' +
                'Example: VentedBox.qb3(driver, new Port({ diameter: 10 })) or ' +
                'VentedBox.qb3(driver, { portDiameterCm: 10, portFlared: true })'
            );
        }
        if (options.portFlared == null) {
            throw new Error(
                'Factory methods require explicit portFlared specification. ' +
                'Example: { portDiameterCm: 10, portFlared: true }'
            );
        }
        const vent = new Port({ diameter: options.portDiameterCm, flared: options.portFlared });
        return { vent, options };
    }

    /**
     * Design for QB3 alignment
     *
     * Per Small 1973: QB3 is defined for lossless enclosure (QL = ∞).
     * If options.ql is provided, lossy modeling is used for response curves.
     *
     * @param {Driver} driver - Driver instance
     * @param {Port|PassiveRadiator|Object} vent - Vent or options with portDiameterCm (REQUIRED)
     * @param {Object} [options] - Options (ql for lossy, portDiameterCm, portFlared)
     */
    static qb3(driver, ventOrOptions, maybeOptions) {
        if (!(driver instanceof Driver)) {
            throw new Error('qb3 requires a Driver instance');
        }

        const { vent, options } = VentedBox.#parseFactoryArgs(ventOrOptions, maybeOptions);
        const fb = driver.fs;
        const volumeLiters = 15 * Math.pow(driver.qts, 3.3) * driver.vas;

        // Pass ql explicitly - default to Infinity (lossless, paper-true)
        const constructorOptions = { ...options, ql: options.ql ?? Infinity };
        return new VentedBox(driver, volumeLiters, fb, vent, constructorOptions);
    }

    /**
     * Design for B4 (Butterworth 4th order) alignment
     *
     * Per Small 1973: B4 is defined for lossless enclosure (QL = ∞).
     * If options.ql is provided, lossy solution is attempted for both
     * alignment calculation and response modeling.
     *
     * @param {Driver} driver - Driver instance
     * @param {Port|PassiveRadiator|Object} vent - Vent or options with portDiameterCm
     * @param {Object} [options] - Options (ql for lossy, portDiameterCm, portFlared)
     */
    static b4(driver, ventOrOptions, maybeOptions) {
        if (!(driver instanceof Driver)) {
            throw new Error('b4 requires a Driver instance');
        }

        const { vent, options } = VentedBox.#parseFactoryArgs(ventOrOptions, maybeOptions);
        // Pass ql to foundation - undefined means lossless (paper-true default)
        const effectiveQl = options.ql ?? Infinity;
        const result = Small1973.B4_ALIGNMENT.calculateParameters(driver.qts, effectiveQl);
        const volumeLiters = driver.vas / result.alpha;
        const fb = driver.fs * result.h;

        // Pass same ql to constructor for consistent response modeling
        const constructorOptions = { ...options, ql: effectiveQl };
        return new VentedBox(driver, volumeLiters, fb, vent, constructorOptions);
    }

    /**
     * Design for C4 (Chebyshev 4th order) alignment
     *
     * Per Small 1973: C4 is parameterized by k (ripple control).
     * Common values: k=0.5 (~0.5dB ripple), k=0.7 (~1dB ripple)
     * options.k is REQUIRED - ripple is a design choice.
     *
     * @param {Driver} driver - Driver instance
     * @param {Port|PassiveRadiator|Object} vent - Vent or options with portDiameterCm
     * @param {Object} [options] - Options (k REQUIRED, ql for lossy, portDiameterCm, portFlared)
     */
    static c4(driver, ventOrOptions, maybeOptions) {
        if (!(driver instanceof Driver)) {
            throw new Error('c4 requires a Driver instance');
        }

        const { vent, options } = VentedBox.#parseFactoryArgs(ventOrOptions, maybeOptions);

        if (options.k == null) {
            throw new Error(
                'C4 alignment requires options.k (ripple parameter). ' +
                'Common values: k=0.5 (~0.5dB ripple), k=0.7 (~1dB ripple). ' +
                'See Small 1973, Appendix 1 for ripple formula.'
            );
        }

        // Pass ql to foundation - undefined means lossless (paper-true default)
        const effectiveQl = options.ql ?? Infinity;
        const result = Small1973.C4_ALIGNMENT.calculateParameters(driver.qts, options.k, effectiveQl);
        const volumeLiters = driver.vas / result.alpha;
        const fb = driver.fs * result.h;

        // Pass same ql to constructor for consistent response modeling
        const constructorOptions = { ...options, ql: effectiveQl };
        return new VentedBox(driver, volumeLiters, fb, vent, constructorOptions);
    }

    // ========================================================================
    // SERIALIZATION
    // ========================================================================

    /**
     * Export design as plain object
     */
    toObject() {
        const obj = {
            type: 'vented',
            ventType: this.#ventType,
            driver: this.#driver.toObject(),
            volumeLiters: this.#volumeLiters,
            fb: this.#fb,
            ql: this.#ql,
            vent: this.#vent.toObject(),
            computed: {
                alpha: this.#alpha,
                tuningRatio: this.#tuningRatio,
                f3: this.#f3,
                alignmentName: this.alignmentName
            }
        };

        if (this.isPort && this.#portLengthM != null) {
            obj.computed.portLengthCm = this.portLengthCm;
        }

        return obj;
    }

    /**
     * Create VentedBox from plain object
     */
    static fromObject(obj) {
        if (obj.type !== 'vented' && obj.type !== 'ported') {
            throw new Error(`Expected type='vented' or 'ported', got '${obj.type}'`);
        }

        const driver = Driver.fromObject(obj.driver);

        // Reconstruct vent - MUST be present in serialized data
        let vent;
        if (obj.ventType === 'passive-radiator') {
            if (!obj.vent) {
                throw new Error('VentedBox.fromObject: missing vent data for passive-radiator');
            }
            vent = PassiveRadiator.fromObject(obj.vent);
        } else {
            const ventData = obj.vent || obj.port;
            if (!ventData) {
                throw new Error('VentedBox.fromObject: missing vent/port data');
            }
            vent = Port.fromObject(ventData);
        }

        return new VentedBox(driver, obj.volumeLiters, obj.fb, vent, { ql: obj.ql });
    }

    /**
     * Summary string for display
     */
    toString() {
        const ventDesc = this.isPort
            ? `Port: ${this.#vent.description}`
            : `PR: ${this.#vent.description}`;

        let str = `VentedBox: ${this.#volumeLiters.toFixed(0)}L @ ${this.#fb.toFixed(1)}Hz, ` +
                  `F3=${this.#f3.toFixed(1)}Hz (${this.alignmentName})`;

        if (this.isPort && this.portLengthCm != null) {
            str += `, ${this.#vent.shortDescription} x ${this.portLengthCm.toFixed(1)}cm`;
        } else {
            str += `, ${ventDesc}`;
        }

        return str;
    }
}
