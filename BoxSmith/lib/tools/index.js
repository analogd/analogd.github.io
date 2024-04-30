/**
 * BoxSmith Toolbox
 *
 * Single entry point for utility functions, calculators, and exporters.
 * Import from here for convenient access to tools.
 *
 * @example
 * import { litersToFt3, toFRD, validateTSParams, portLength } from './tools/index.js';
 */

// ============================================================================
// UNIT CONVERTERS
// ============================================================================

export {
    // Volume
    litersToFt3,
    ft3ToLiters,
    litersToIn3,
    in3ToLiters,
    ft3ToIn3,
    in3ToFt3,

    // Area
    cm2ToIn2,
    in2ToCm2,
    cm2ToM2,
    m2ToCm2,
    diameterToArea,
    areaToDiameter,

    // Length
    mmToIn,
    inToMm,
    cmToIn,
    inToCm,

    // Decibels
    voltageRatioToDb,
    powerRatioToDb,
    dbToVoltageRatio,
    dbToPowerRatio,
    splAddition,
    powerForSplGain,

    // Mass
    gToKg,
    kgToG,
    gToOz,
    ozToG,

    // Impedance
    polarToRect,
    rectToPolar
} from '../foundation/units.js';

// ============================================================================
// EXPORTERS
// ============================================================================

export {
    toFRD,
    toZMA,
    toCSV,
    frdBlob,
    zmaBlob
} from '../models/export.js';

// ============================================================================
// VALIDATORS
// ============================================================================

export {
    validateTSParams,
    isValid,
    getErrors,
    getWarnings,
    getEBPRecommendation
} from '../models/validate.js';

// ============================================================================
// PORT CALCULATORS (re-exported from foundation)
// ============================================================================

export {
    calculateLength as portLength,
    calculateTuningFromDimensions as portTuningFromDimensions,
    calculateMinimumArea as portMinimumArea,
    calculateCircularArea as portCircularArea,
    calculateEquivalentDiameter as portEquivalentDiameter,
    calculateAirVelocity as portAirVelocity,
    calculateReynoldsNumber as portReynoldsNumber,
    calculateMachNumber as portMachNumber,
    assessTurbulence as portAssessTurbulence,
    PORT_END_CORRECTION,
    VELOCITY_LIMITS
} from '../foundation/vented/port.js';

// ============================================================================
// PASSIVE RADIATOR CALCULATORS (re-exported from foundation)
// ============================================================================

export {
    calculateTuningFrequency as prTuningFrequency,
    calculateRequiredMass as prRequiredMass,
    calculateMassAdjustment as prMassAdjustment,
    calculateDelta as prDelta,
    TYPICAL_QMP
} from '../foundation/vented/passive-radiator.js';
