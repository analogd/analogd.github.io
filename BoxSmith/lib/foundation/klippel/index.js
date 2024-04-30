/**
 * Klippel Nonlinear Modeling
 *
 * 📄 PAPER-CLOSE LAYER
 *
 * Functions for estimating nonlinear behavior of loudspeaker drivers.
 * Use these to predict SPL compression and distortion at high excursion.
 *
 * Key exports:
 * - Motor geometry: Bl(x) estimation
 * - Suspension: Kms(x) estimation
 * - Compression: Combined SPL loss prediction
 */

// Motor (Bl) nonlinearity
export {
    blFromGeometry,
    blFromXmax,
    effectiveBlForExcursion,
    blCompressionDb,
    estimateGeometry
} from './motor-geometry.js';

// Suspension (Kms/Cms) nonlinearity
export {
    kmsPolynomial,
    kmsFromXmax,
    cmsFromXmax,
    shiftedResonance,
    estimateCoefficients
} from './suspension.js';

// Combined compression prediction
export {
    estimateCompression,
    thermalCompressionDb,
    estimateTempRise,
    totalCompression,
    applySplCompression,
    compressionCurve,
    powerMultiplierForCompression,
    compressionSummary
} from './compression.js';

// Harmonic distortion estimation
export {
    estimateHD2,
    estimateHD3,
    estimateHD3FromBl,
    estimateHD3FromKms,
    estimateTHD,
    distortionAtExcursion,
    classifyDistortion,
    DISTORTION_THRESHOLDS
} from './distortion.js';
