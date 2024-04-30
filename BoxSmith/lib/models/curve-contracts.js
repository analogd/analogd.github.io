/**
 * Curve Contracts - Definitive source of truth for curve method return shapes
 *
 * This file documents what each model curve method returns. Used for:
 * 1. Startup validation - catch yKey mismatches before graphs render empty
 * 2. Documentation - developers know exactly what fields are available
 * 3. Future TypeScript migration - these become type definitions
 *
 * IMPORTANT: Keep this in sync with actual model implementations.
 * If you change a curve method's return shape, update this file.
 * If you add a new curve method, add it here.
 *
 * The validation in graphRegistry.js will catch:
 * - Typos: yKey: 'impedance' (should be 'magnitude')
 * - Wrong field: yKey: 'groupDelay' (should be 'delay')
 * - Unknown fields: yKey: 'foo' (not defined anywhere)
 */

// ============================================================================
// CURVE CONTRACTS
// ============================================================================
// Maps curve method name → { x: 'fieldName', y: ['field1', 'field2', ...] }
//
// x: The x-axis field (usually 'frequency', sometimes 'time' or 'x')
// y: All y-axis fields the curve returns (what you can use for yKey)

export const CurveContracts = {
    // =========================================================================
    // RESPONSE CURVES
    // =========================================================================

    responseCurve: {
        x: 'frequency',
        y: ['db'],
        description: 'Frequency response relative to passband (0dB reference)'
    },

    phaseCurve: {
        x: 'frequency',
        y: ['phase'],
        description: 'Phase response in degrees'
    },

    groupDelayCurve: {
        x: 'frequency',
        y: ['delay'],  // NOT 'groupDelay' - this was a bug we caught!
        description: 'Group delay in milliseconds'
    },

    // =========================================================================
    // IMPEDANCE / ELECTRICAL CURVES
    // =========================================================================

    impedanceCurve: {
        x: 'frequency',
        y: ['magnitude', 'phase'],  // NOT 'impedance' - this was a bug we caught!
        description: 'Electrical impedance: magnitude in Ohms, phase in degrees'
    },

    currentDrawCurve: {
        x: 'frequency',
        y: ['current'],
        description: 'Current draw in Amps for given power'
    },

    epdrCurve: {
        x: 'frequency',
        y: ['epdr'],
        description: 'Equivalent Peak Dissipation Resistance in Ohms'
    },

    apparentPowerCurve: {
        x: 'frequency',
        y: ['va'],
        description: 'Apparent power in VA for given real power'
    },

    thermalDissipationCurve: {
        x: 'frequency',
        y: ['thermal'],
        description: 'Power dissipated as heat in voice coil (Watts)'
    },

    // =========================================================================
    // MECHANICAL CURVES
    // =========================================================================

    excursionCurve: {
        x: 'frequency',
        y: ['excursion', 'overXmax'],
        description: 'Cone excursion in mm, with Xmax violation flag'
    },

    coneVelocityCurve: {
        x: 'frequency',
        y: ['velocity'],
        description: 'Peak cone velocity in m/s'
    },

    coneAccelerationCurve: {
        x: 'frequency',
        y: ['accelG', 'accelMs2'],
        description: 'Peak cone acceleration in g and m/s²'
    },

    // =========================================================================
    // SPL / POWER CURVES
    // =========================================================================

    splCurve: {
        x: 'frequency',
        y: ['spl'],
        description: 'SPL in dB at 1 meter for given power'
    },

    maxSplCurve: {
        x: 'frequency',
        y: ['maxSpl', 'maxPower', 'limitingFactor'],
        description: 'Maximum SPL limited by thermal or excursion'
    },

    thermalLimitCurve: {
        x: 'frequency',
        y: ['spl'],
        description: 'SPL if limited only by thermal (Pe)'
    },

    excursionLimitCurve: {
        x: 'frequency',
        y: ['spl'],
        description: 'SPL if limited only by excursion (Xmax)'
    },

    headroomCurve: {
        x: 'frequency',
        y: ['headroom', 'maxSpl', 'limitingFactor'],
        description: 'Margin to target SPL (positive = can achieve)'
    },

    powerCurve: {
        x: 'frequency',
        y: ['maxPower', 'limitingFactor', 'excursion'],
        description: 'Maximum safe power at each frequency'
    },

    // =========================================================================
    // KLIPPEL / NONLINEAR CURVES
    // =========================================================================

    compressionCurve: {
        x: 'frequency',
        y: ['compressionDb', 'excursion', 'excursionPct'],
        description: 'SPL compression due to Bl(x) nonlinearity'
    },

    distortionCurve: {
        x: 'frequency',
        y: ['thd', 'hd2', 'hd3', 'severity', 'excursion'],
        description: 'Harmonic distortion estimates from Klippel model'
    },

    // =========================================================================
    // TIME DOMAIN CURVES
    // =========================================================================

    stepResponseCurve: {
        x: 'time',  // In seconds - UI converts to ms
        y: ['amplitude'],
        description: 'Step response (normalized, decays to 0)'
    },

    impulseResponseCurve: {
        x: 'time',  // In seconds - UI converts to ms
        y: ['amplitude'],
        description: 'Impulse response (normalized)'
    },

    // =========================================================================
    // VENTED BOX SPECIFIC
    // =========================================================================

    contributionCurve: {
        x: 'frequency',
        y: ['cone', 'port', 'total'],
        description: 'Cone vs port/PR contribution to output'
    },

    portVelocityCurve: {
        x: 'frequency',
        y: ['velocity', 'overLimit', 'overQuiet'],
        description: 'Port air velocity in m/s with limit flags'
    },

    prExcursionCurve: {
        x: 'frequency',
        y: ['excursion', 'overXmax'],
        description: 'Passive radiator excursion in mm'
    },

    portMachCurve: {
        x: 'frequency',
        y: ['mach', 'velocity', 'overSafe', 'overCaution', 'overSevere'],
        description: 'Port Mach number with threshold flags'
    },

    portReynoldsCurve: {
        x: 'frequency',
        y: ['reynolds', 'velocity', 'turbulent', 'highlyTurbulent'],
        description: 'Port Reynolds number with turbulence flags'
    },

    excursionComparisonCurve: {
        x: 'frequency',
        y: ['driverExcursion', 'prExcursion', 'ratio', 'driverOverXmax', 'prOverXmax'],
        description: 'Driver vs PR excursion comparison (PR only)'
    },

    prPowerLimitCurve: {
        x: 'frequency',
        y: ['prMaxPower', 'driverMaxPower', 'limitingFactor', 'effectiveMaxPower'],
        description: 'Power limits showing PR vs driver constraints (PR only)'
    }
};

// ============================================================================
// DERIVED SETS FOR VALIDATION
// ============================================================================

/**
 * All valid y-axis field names across all curve methods.
 * Used for typo detection - if a yKey isn't in this set, it's wrong.
 */
export const VALID_Y_KEYS = new Set(
    Object.values(CurveContracts).flatMap(c => c.y)
);

/**
 * Additional valid y-keys used in UI that aren't from curve methods.
 * These are constructed in render functions or are special cases.
 */
export const ADDITIONAL_VALID_KEYS = new Set([
    'y',           // Generic y after data transform (time domain graphs)
    'x',           // Generic x for pre-transformed data
    'bl',          // Klippel Bl(x) curve - constructed in render
    'kms',         // Klippel Kms(x) curve - constructed in render
    'power',       // Power axis for SPL vs Power graph
    'ratio',       // VA/W ratio - computed in amp load render
]);

/**
 * Complete set of all valid y-keys (curve fields + special UI fields)
 */
export const ALL_VALID_Y_KEYS = new Set([
    ...VALID_Y_KEYS,
    ...ADDITIONAL_VALID_KEYS
]);

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Find similar field name for error suggestions.
 * Uses simple Levenshtein-ish matching.
 */
function findSimilar(input, validSet) {
    const inputLower = input.toLowerCase();
    let best = null;
    let bestScore = Infinity;

    for (const valid of validSet) {
        const validLower = valid.toLowerCase();

        // Exact substring match
        if (validLower.includes(inputLower) || inputLower.includes(validLower)) {
            return valid;
        }

        // Simple edit distance approximation
        const lenDiff = Math.abs(input.length - valid.length);
        let matches = 0;
        for (let i = 0; i < Math.min(input.length, valid.length); i++) {
            if (inputLower[i] === validLower[i]) matches++;
        }
        const score = lenDiff + (input.length - matches);

        if (score < bestScore && score < input.length * 0.6) {
            bestScore = score;
            best = valid;
        }
    }

    return best;
}

/**
 * Validate a yKey against known valid fields.
 *
 * @param {string} yKey - The y-axis field name to validate
 * @param {string} context - Where this yKey is used (for error message)
 * @throws {Error} If yKey is not valid, with helpful suggestion
 */
export function validateYKey(yKey, context) {
    if (ALL_VALID_Y_KEYS.has(yKey)) return;

    const similar = findSimilar(yKey, ALL_VALID_Y_KEYS);
    const suggestion = similar
        ? `Did you mean '${similar}'?`
        : `Valid keys: ${[...ALL_VALID_Y_KEYS].sort().join(', ')}`;

    throw new Error(
        `Invalid yKey '${yKey}' in ${context}. ${suggestion}`
    );
}

/**
 * Get the curve contract for a method name.
 *
 * @param {string} methodName - e.g., 'impedanceCurve'
 * @returns {Object|null} The contract or null if not found
 */
export function getCurveContract(methodName) {
    return CurveContracts[methodName] || null;
}

/**
 * Get valid y-keys for a specific curve method.
 *
 * @param {string} methodName - e.g., 'impedanceCurve'
 * @returns {string[]} Array of valid y-key names
 */
export function getValidYKeysForCurve(methodName) {
    const contract = CurveContracts[methodName];
    return contract ? contract.y : [];
}

/**
 * Validate that a yKey is valid for a specific curve method.
 *
 * @param {string} yKey - The y-axis field name
 * @param {string} methodName - The curve method name
 * @param {string} context - Where this is used (for error message)
 * @throws {Error} If yKey is not valid for this curve method
 */
export function validateYKeyForCurve(yKey, methodName, context) {
    const contract = CurveContracts[methodName];
    if (!contract) {
        // Unknown curve method - fall back to general validation
        validateYKey(yKey, context);
        return;
    }

    if (contract.y.includes(yKey)) return;

    throw new Error(
        `Invalid yKey '${yKey}' for ${methodName} in ${context}. ` +
        `${methodName} returns: { ${contract.x}, ${contract.y.join(', ')} }`
    );
}
