// Physical and mathematical constants for speaker design calculations

const Constants = {
    // Unit conversions
    UNITS: {
        CM_TO_INCH: 2.54,
        LITERS_TO_CUFT: 0.0353147,
        LITERS_TO_CUIN: 61.024,
        CM2_TO_M2: 10000,
        MM_TO_M: 1000
    },

    // Port calculation constants
    PORT: {
        // Port length formula constant: (c² / (4π²)) where c = speed of sound
        LENGTH_CONSTANT: 23562.5,  // cm³·Hz² (for round ports)
        END_CORRECTION_FACTOR: 0.732,  // Port end correction in diameters
        VELOCITY_WARNING_MODERATE: 15,  // m/s
        VELOCITY_WARNING_HIGH: 20,  // m/s
        VELOCITY_WARNING_CRITICAL: 30,  // m/s
        FLARED_PORT_FACTOR: 0.85  // Length multiplier for flared ports
    },

    // SPL calculation constants
    SPL: {
        BASE_SENSITIVITY: 88,  // dB baseline
        VD_SPL_CONSTANT: 112,  // SPL constant for VD calculation
        DEFAULT_POWER: 1  // 1W reference power
    },

    // Box design constants
    BOX: {
        MATERIAL_THICKNESS_MM: 19,  // Standard MDF/plywood thickness
        MATERIAL_THICKNESS_INCH: 0.75,
        MATERIAL_THICKNESS_CM: 1.9,
        VOLUME_TOLERANCE_SEALED: 0.10,  // ±10% acceptable for sealed
        VOLUME_TOLERANCE_PORTED: 0.05,  // ±5% recommended for ported
        BRACING_THRESHOLD_LARGE: 100,  // Liters - strongly recommend bracing
        BRACING_THRESHOLD_MEDIUM: 50,  // Liters - consider bracing
        STUFFING_WEIGHT_LB: [0.5, 1.0],  // Recommended range
        DOUBLE_BAFFLE_THRESHOLD: 15,  // Driver size in inches

        // Driver displacement estimates (liters)
        DRIVER_DISPLACEMENT: {
            10: 1.5,
            12: 2.5,
            15: 3.5,
            18: 6.0,
            21: 8.0
        },

        // Volume loss estimates (liters)
        BRACING_VOLUME_LOSS: 2,  // Typical cross-bracing
        STUFFING_VOLUME_LOSS: 1,  // Light polyfill

        // Common aspect ratios for box dimensions
        RATIOS: {
            CUBE: { w: 1, h: 1, d: 1.2 },
            TALL: { w: 1, h: 1, d: 1.5 },
            WIDE: { w: 1.5, h: 1, d: 1 }
        }
    },

    // Alignment parameters
    ALIGNMENTS: {
        SEALED: [
            { name: 'Butterworth (Q=0.707)', qtc: 0.707 },
            { name: 'Bessel (Q=0.577)', qtc: 0.577 },
            { name: 'Chebychev (Q=1.0)', qtc: 1.0 }
        ],
        PORTED: [
            { name: 'QB3', fbMultiplier: 1.0, vbFactor: 15, exponent: 3.3 },
            { name: 'SC4', fbMultiplier: 0.7, vbFactor: 29, exponent: 3.3 },
            { name: 'C4', fbMultiplier: 0.8, vbFactor: 23, exponent: 3.3 }
        ],
        F3_PORTED_FACTOR: 0.95  // F3 approximation for ported boxes
    },

    // Frequency response calculation
    RESPONSE: {
        FREQ_START: 10,  // Hz
        FREQ_END: 200,   // Hz
        FREQ_STEP: 2     // Hz
    },

    // Default port dimensions for calculations
    DEFAULT_PORT_DIAMETER_CM: 5,

    // Room gain
    ROOM_GAIN: {
        CORNER_BOOST_DB: [6, 12],  // Range of corner placement boost below 100Hz
        TRANSITION_FREQ_HZ: 80     // Typical room gain transition frequency
    }
};

// Make it available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Constants;
}
