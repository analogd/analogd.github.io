/**
 * Port Model - Validated Port Configuration
 *
 * Represents a validated port configuration with geometry and limits.
 * Immutable after construction.
 *
 * Usage:
 *   // Circular port
 *   const port = new Port({ diameter: 10 });  // 10cm diameter
 *
 *   // Circular flared port
 *   const port = new Port({ diameter: 10, flared: true });
 *
 *   // Multiple ports
 *   const port = new Port({ diameter: 7.5, quantity: 2 });
 *
 *   // Rectangular/slot port
 *   const port = new Port({ width: 5, height: 20 });
 *
 * All dimensions in cm for constructor, SI internally.
 */

import * as PortCalc from '../../foundation/vented/port.js';
import * as PortCompression from '../../foundation/vented/port-compression.js';

export class Port {
    #type;              // 'circular' | 'rectangular' | 'slot'
    #quantity;          // 1-4
    #flared;            // boolean

    // Circular (m)
    #diameter;

    // Rectangular/slot (m)
    #width;
    #height;

    // Computed (m, m^2)
    #singleArea;
    #totalArea;
    #effectiveDiameter;

    /**
     * Create a port configuration
     *
     * @param {Object} config
     * @param {number} [config.diameter] - Diameter in cm (circular)
     * @param {number} [config.width] - Width in cm (rectangular/slot)
     * @param {number} [config.height] - Height in cm (rectangular/slot)
     * @param {number} [config.quantity=1] - Number of ports (1-4)
     * @param {boolean} [config.flared=false] - Flared ends
     */
    constructor(config) {
        const { diameter, width, height, quantity = 1, flared = false } = config;

        // Validate quantity
        if (quantity < 1 || quantity > 4 || !Number.isInteger(quantity)) {
            throw new Error(
                `Port quantity must be 1, 2, 3, or 4 (got ${quantity})`
            );
        }
        this.#quantity = quantity;
        this.#flared = !!flared;

        // Determine type and validate dimensions
        if (diameter != null) {
            if (width != null || height != null) {
                throw new Error(
                    'Specify diameter (circular) OR width/height (rectangular), not both'
                );
            }
            if (diameter <= 0) {
                throw new Error('Port diameter must be positive');
            }
            if (diameter > 50) {
                throw new Error(
                    `Port diameter ${diameter}cm is unusually large (>50cm). Check units.`
                );
            }

            this.#type = 'circular';
            this.#diameter = diameter / 100;  // cm to m
            this.#singleArea = PortCalc.calculateCircularArea(this.#diameter);
            this.#effectiveDiameter = this.#diameter;

        } else if (width != null && height != null) {
            if (width <= 0 || height <= 0) {
                throw new Error('Port width and height must be positive');
            }
            if (width > 100 || height > 100) {
                throw new Error(
                    `Port dimensions ${width}x${height}cm unusually large. Check units.`
                );
            }

            // Slot: aspect ratio > 4:1
            const aspectRatio = Math.max(width / height, height / width);
            this.#type = aspectRatio > 4 ? 'slot' : 'rectangular';

            this.#width = width / 100;    // cm to m
            this.#height = height / 100;

            const dims = PortCalc.calculateRectangularDimensions(this.#width, this.#height);
            this.#singleArea = dims.area;
            this.#effectiveDiameter = dims.effectiveDiameter;

        } else {
            throw new Error(
                'Port requires diameter (circular) or width+height (rectangular)'
            );
        }

        this.#totalArea = this.#singleArea * this.#quantity;

        Object.freeze(this);
    }

    // ========================================================================
    // GETTERS - Basic Properties
    // ========================================================================

    /** Port type: 'circular', 'rectangular', or 'slot' */
    get type() { return this.#type; }

    /** Number of ports (1-4) */
    get quantity() { return this.#quantity; }

    /** Whether port has flared ends */
    get flared() { return this.#flared; }

    /** Single port area (m^2) */
    get singleArea() { return this.#singleArea; }

    /** Total port area - all ports combined (m^2) */
    get totalArea() { return this.#totalArea; }

    /** Effective diameter for end correction (m) */
    get effectiveDiameter() { return this.#effectiveDiameter; }

    // ========================================================================
    // GETTERS - Dimensions in User-Friendly Units
    // ========================================================================

    /** Diameter in cm (circular only) */
    get diameterCm() {
        return this.#type === 'circular' ? this.#diameter * 100 : null;
    }

    /** Diameter in mm (circular only) */
    get diameterMm() {
        return this.#type === 'circular' ? this.#diameter * 1000 : null;
    }

    /** Width in cm (rectangular/slot only) */
    get widthCm() {
        return this.#width != null ? this.#width * 100 : null;
    }

    /** Height in cm (rectangular/slot only) */
    get heightCm() {
        return this.#height != null ? this.#height * 100 : null;
    }

    /** Single port area in cm^2 */
    get singleAreaCm2() {
        return this.#singleArea * 10000;
    }

    /** Total port area in cm^2 */
    get totalAreaCm2() {
        return this.#totalArea * 10000;
    }

    // ========================================================================
    // GETTERS - Derived Properties
    // ========================================================================

    /** End correction type string for calculations */
    get endCorrectionType() {
        if (this.#type === 'circular') {
            return this.#flared ? 'circular_flanged' : 'circular_unflanged';
        }
        return this.#type;  // 'rectangular' or 'slot'
    }

    /** Maximum velocity before noise (m/s) */
    get maxVelocity() {
        return this.#flared
            ? PortCalc.VELOCITY_LIMITS.maximum_flared
            : PortCalc.VELOCITY_LIMITS.maximum_straight;
    }

    /** Quiet velocity threshold (m/s) */
    get quietVelocity() {
        return PortCalc.VELOCITY_LIMITS.quiet;
    }

    // ========================================================================
    // CALCULATIONS
    // ========================================================================

    /**
     * Calculate required port length for target tuning
     *
     * @param {number} fb - Target tuning frequency (Hz)
     * @param {number} vb - Box volume (m^3)
     * @returns {number} Length per port (m)
     * @throws {Error} If port too small for tuning
     */
    lengthFor(fb, vb) {
        return PortCalc.calculateLength({
            fb,
            vb,
            area: this.#totalArea,
            effectiveDiameter: this.#effectiveDiameter,
            type: this.endCorrectionType
        });
    }

    /**
     * Calculate port length in cm
     *
     * @param {number} fb - Target tuning frequency (Hz)
     * @param {number} vb - Box volume (m^3)
     * @returns {number} Length per port (cm)
     */
    lengthCmFor(fb, vb) {
        return this.lengthFor(fb, vb) * 100;
    }

    /**
     * Calculate resulting tuning from port length
     *
     * @param {number} length - Port length (m)
     * @param {number} vb - Box volume (m^3)
     * @returns {number} Tuning frequency (Hz)
     */
    tuningFor(length, vb) {
        return PortCalc.calculateTuningFromDimensions({
            length,
            vb,
            area: this.#totalArea,
            effectiveDiameter: this.#effectiveDiameter,
            type: this.endCorrectionType
        });
    }

    /**
     * Check if port can achieve target tuning (length > 0)
     *
     * @param {number} fb - Target tuning frequency (Hz)
     * @param {number} vb - Box volume (m^3)
     * @returns {boolean}
     */
    canTuneTo(fb, vb) {
        try {
            const length = this.lengthFor(fb, vb);
            return length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Calculate air velocity from volume velocity
     *
     * @param {number} volumeVelocity - Volume velocity (m^3/s)
     * @returns {number} Air velocity (m/s)
     */
    velocityFor(volumeVelocity) {
        return PortCalc.calculateAirVelocity(volumeVelocity, this.#totalArea);
    }

    /**
     * Check if velocity is within safe limits
     *
     * @param {number} velocity - Air velocity (m/s)
     * @returns {boolean}
     */
    isVelocitySafe(velocity) {
        return velocity <= this.maxVelocity;
    }

    /**
     * Check if velocity is quiet
     *
     * @param {number} velocity - Air velocity (m/s)
     * @returns {boolean}
     */
    isVelocityQuiet(velocity) {
        return velocity <= this.quietVelocity;
    }

    /**
     * Calculate Reynolds number for turbulence assessment
     *
     * @param {number} velocity - Air velocity (m/s)
     * @returns {number} Reynolds number
     */
    reynoldsFor(velocity) {
        return PortCalc.calculateReynoldsNumber(velocity, this.#effectiveDiameter);
    }

    /**
     * Calculate Mach number
     *
     * @param {number} velocity - Air velocity (m/s)
     * @returns {number} Mach number
     */
    machFor(velocity) {
        return PortCalc.calculateMachNumber(velocity);
    }

    /**
     * Full turbulence assessment
     *
     * @param {number} velocity - Peak air velocity (m/s)
     * @returns {Object} Assessment with severity and recommendations
     */
    assessTurbulence(velocity) {
        return PortCalc.assessTurbulence(velocity, this.#effectiveDiameter, this.#flared);
    }

    /**
     * Calculate port friction Q
     *
     * @param {number} length - Port length (m)
     * @param {number} fb - Tuning frequency (Hz)
     * @returns {number} Port friction Q
     */
    frictionQFor(length, fb) {
        return PortCalc.calculateFrictionQ(this.#effectiveDiameter, length, fb);
    }

    // ========================================================================
    // COMPRESSION ASSESSMENT (Salvatti 2002, Bezzola 2019)
    // ========================================================================

    /**
     * Calculate port eigenfrequency (first pipe resonance)
     *
     * This is where turbulent vortex shedding manifests as audible noise.
     * From Bezzola 2019: f_p1 = c/(2L)
     *
     * @param {number} lengthM - Port length in meters
     * @returns {number} Eigenfrequency in Hz
     */
    eigenfrequencyFor(lengthM) {
        return PortCompression.portEigenfrequency(lengthM);
    }

    /**
     * Assess flow regime based on Reynolds number
     *
     * From Salvatti 2002:
     * - Re < 50,000: Linear operation
     * - 50,000-100,000: Transition zone (1-3 dB compression)
     * - Re > 100,000: Fully turbulent (severe compression)
     *
     * @param {number} velocity - Air velocity in m/s
     * @returns {{regime: string, compressionRisk: string, expectedCompression: string, description: string}}
     */
    flowRegimeAt(velocity) {
        const reynolds = this.reynoldsFor(velocity);
        return PortCompression.assessReynoldsRegime(reynolds);
    }

    /**
     * Estimate flare-related performance penalty
     *
     * From Salvatti 2002: Straight ports have ~2dB baseline loss vs flared.
     * From Bezzola 2019: At high levels, straight ports are 10-16 dB worse.
     *
     * @param {number} velocity - Air velocity in m/s
     * @returns {{baselinePenaltyDb: number, highLevelPenaltyRange: [number, number]|null, description: string}}
     */
    flarePenaltyAt(velocity) {
        const reynolds = this.reynoldsFor(velocity);
        return PortCompression.estimateFlarePenalty(reynolds, this.#flared);
    }

    /**
     * Calculate velocity headroom before compression onset
     *
     * Returns dB margin before reaching Reynolds threshold for compression.
     *
     * @param {number} velocity - Current air velocity in m/s
     * @returns {{headroomDb: number, limitVelocity: number, currentVelocity: number, regime: string, description: string}}
     */
    velocityHeadroomAt(velocity) {
        return PortCompression.calculateVelocityHeadroom(
            velocity,
            this.#effectiveDiameter,
            this.#flared
        );
    }

    /**
     * Comprehensive port compression assessment
     *
     * Combines regime, flare penalty, headroom, and eigenfrequency into
     * a single assessment with recommendations.
     *
     * @param {number} velocity - Air velocity in m/s
     * @param {number} lengthM - Port length in meters
     * @returns {{
     *   velocity: number,
     *   reynolds: number,
     *   mach: number,
     *   regime: object,
     *   flarePenalty: object,
     *   headroom: object,
     *   eigenfrequency: number,
     *   overallRisk: string,
     *   recommendations: string[]
     * }}
     */
    compressionAssessmentAt(velocity, lengthM) {
        return PortCompression.assessPortCompression(
            velocity,
            this.#effectiveDiameter,
            lengthM,
            this.#flared
        );
    }

    // ========================================================================
    // SERIALIZATION
    // ========================================================================

    /**
     * Convert to plain object for storage
     */
    toObject() {
        const obj = {
            type: this.#type,
            quantity: this.#quantity,
            flared: this.#flared
        };

        if (this.#type === 'circular') {
            obj.diameterCm = this.diameterCm;
        } else {
            obj.widthCm = this.widthCm;
            obj.heightCm = this.heightCm;
        }

        return obj;
    }

    /**
     * Create from plain object
     */
    static fromObject(obj) {
        if (obj.type === 'circular' || obj.diameterCm != null) {
            return new Port({
                diameter: obj.diameterCm,
                quantity: obj.quantity || 1,
                flared: obj.flared || false
            });
        } else {
            return new Port({
                width: obj.widthCm,
                height: obj.heightCm,
                quantity: obj.quantity || 1,
                flared: obj.flared || false
            });
        }
    }

    // ========================================================================
    // DISPLAY
    // ========================================================================

    /**
     * Human-readable description
     */
    get description() {
        const flareStr = this.#flared ? ' flared' : '';
        const qtyStr = this.#quantity > 1 ? `${this.#quantity}x ` : '';

        if (this.#type === 'circular') {
            return `${qtyStr}${this.diameterCm.toFixed(1)}cm${flareStr} circular port`;
        } else {
            return `${qtyStr}${this.widthCm.toFixed(1)}x${this.heightCm.toFixed(1)}cm ${this.#type} port`;
        }
    }

    /**
     * Short description for UI
     */
    get shortDescription() {
        const qtyStr = this.#quantity > 1 ? `${this.#quantity}x ` : '';

        if (this.#type === 'circular') {
            return `${qtyStr}${this.diameterCm.toFixed(0)}cm port`;
        } else {
            return `${qtyStr}${this.widthCm.toFixed(0)}x${this.heightCm.toFixed(0)}cm ${this.#type}`;
        }
    }
}
