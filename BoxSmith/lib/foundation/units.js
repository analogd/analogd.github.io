/**
 * Unit Conversions for Speaker Design
 *
 * Common conversions needed when working with T/S parameters and enclosure design.
 * Spec sheets mix metric and imperial units constantly.
 */

// ============================================================================
// VOLUME CONVERSIONS
// ============================================================================

const L_TO_FT3 = 0.0353147;
const L_TO_IN3 = 61.0237;

/** Liters to cubic feet */
export const litersToFt3 = (L) => L * L_TO_FT3;

/** Cubic feet to liters */
export const ft3ToLiters = (ft3) => ft3 / L_TO_FT3;

/** Liters to cubic inches */
export const litersToIn3 = (L) => L * L_TO_IN3;

/** Cubic inches to liters */
export const in3ToLiters = (in3) => in3 / L_TO_IN3;

/** Cubic feet to cubic inches */
export const ft3ToIn3 = (ft3) => ft3 * 1728;

/** Cubic inches to cubic feet */
export const in3ToFt3 = (in3) => in3 / 1728;

// ============================================================================
// AREA CONVERSIONS
// ============================================================================

const CM2_TO_IN2 = 0.155;
const CM2_TO_M2 = 0.0001;

/** Square centimeters to square inches */
export const cm2ToIn2 = (cm2) => cm2 * CM2_TO_IN2;

/** Square inches to square centimeters */
export const in2ToCm2 = (in2) => in2 / CM2_TO_IN2;

/** Square centimeters to square meters */
export const cm2ToM2 = (cm2) => cm2 * CM2_TO_M2;

/** Square meters to square centimeters */
export const m2ToCm2 = (m2) => m2 / CM2_TO_M2;

/** Diameter to circular area */
export const diameterToArea = (d) => Math.PI * (d / 2) ** 2;

/** Circular area to diameter */
export const areaToDiameter = (a) => 2 * Math.sqrt(a / Math.PI);

// ============================================================================
// LENGTH CONVERSIONS
// ============================================================================

const MM_TO_IN = 0.0393701;
const CM_TO_IN = 0.393701;

/** Millimeters to inches */
export const mmToIn = (mm) => mm * MM_TO_IN;

/** Inches to millimeters */
export const inToMm = (inches) => inches / MM_TO_IN;

/** Centimeters to inches */
export const cmToIn = (cm) => cm * CM_TO_IN;

/** Inches to centimeters */
export const inToCm = (inches) => inches / CM_TO_IN;

// ============================================================================
// DECIBEL CONVERSIONS
// ============================================================================

/**
 * Voltage ratio to dB
 * dB = 20 × log10(V2/V1)
 */
export const voltageRatioToDb = (ratio) => 20 * Math.log10(ratio);

/**
 * Power ratio to dB
 * dB = 10 × log10(P2/P1)
 */
export const powerRatioToDb = (ratio) => 10 * Math.log10(ratio);

/**
 * dB to voltage ratio
 * ratio = 10^(dB/20)
 */
export const dbToVoltageRatio = (db) => Math.pow(10, db / 20);

/**
 * dB to power ratio
 * ratio = 10^(dB/10)
 */
export const dbToPowerRatio = (db) => Math.pow(10, db / 10);

/**
 * SPL addition (incoherent sources)
 * When adding N identical sources: +10×log10(N) dB
 */
export const splAddition = (splSingle, count) => splSingle + 10 * Math.log10(count);

/**
 * Power needed for SPL increase
 * To gain X dB, need 10^(X/10) times the power
 */
export const powerForSplGain = (splGainDb) => Math.pow(10, splGainDb / 10);

// ============================================================================
// MASS CONVERSIONS
// ============================================================================

/** Grams to kilograms */
export const gToKg = (g) => g / 1000;

/** Kilograms to grams */
export const kgToG = (kg) => kg * 1000;

/** Grams to ounces */
export const gToOz = (g) => g * 0.035274;

/** Ounces to grams */
export const ozToG = (oz) => oz / 0.035274;

// ============================================================================
// IMPEDANCE CONVERSIONS
// ============================================================================

/**
 * Magnitude and phase to real/imaginary (rectangular form)
 * @param {number} magnitude - |Z| in ohms
 * @param {number} phaseDeg - Phase angle in degrees
 * @returns {{real: number, imag: number}} Rectangular form
 */
export const polarToRect = (magnitude, phaseDeg) => {
    const phaseRad = phaseDeg * Math.PI / 180;
    return {
        real: magnitude * Math.cos(phaseRad),
        imag: magnitude * Math.sin(phaseRad)
    };
};

/**
 * Real/imaginary to magnitude and phase (polar form)
 * @param {number} real - Real part in ohms
 * @param {number} imag - Imaginary part in ohms
 * @returns {{magnitude: number, phaseDeg: number}} Polar form
 */
export const rectToPolar = (real, imag) => ({
    magnitude: Math.sqrt(real * real + imag * imag),
    phaseDeg: Math.atan2(imag, real) * 180 / Math.PI
});
