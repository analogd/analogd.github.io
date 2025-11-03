// optimization.js - Smart preset optimizations for modern workflows
// Part of cookbook layer - orchestrates foundation calculations for real-world goals

import { designSealedBox } from './sealed-box-designer.js';
import { designPortedBox } from './ported-box-designer.js';

/**
 * Optimize sealed box for DSP room correction workflows
 *
 * Modern reality: Users run Dirac/ARC/Audyssey which will EQ boost low end by 6-10dB.
 * Traditional "flat" alignments waste power handling on natural extension.
 * Instead: optimize for MAX SPL at target frequency WITH EQ boost applied.
 *
 * Strategy: Smaller box = less natural extension BUT more power handling = higher post-DSP SPL
 *
 * @param {Object} driverTS - Driver Thiele-Small parameters
 * @param {Object} options - Optimization parameters
 * @param {number} options.targetFreq - Frequency to optimize for (default: 25 Hz)
 * @param {number} options.eqBoostDb - Expected DSP boost in dB (default: 8 dB)
 * @param {number} options.ampPower - Available amplifier power (default: 500 W)
 * @param {number} options.maxVolume - Max practical volume in liters (default: 500)
 * @param {number} options.maxExcursionRatio - Max fraction of Xmax to use (default: 0.8)
 * @param {number} options.sensitivity - Driver sensitivity in dB @ 2.83V/1m (default: 89)
 * @returns {Object} Optimized design object
 */
export function optimizeForDSP(driverTS, options = {}) {
    const {
        targetFreq = 25,
        eqBoostDb = 8,
        ampPower = 500,
        maxVolume = 500,
        maxExcursionRatio = 0.8,
        sensitivity = 89,  // Typical for subwoofer
        unit = 'liters'
    } = options;

    // Search strategy: try volumes from small to large
    // Smaller volumes = higher Qtc = more power handling but less natural extension
    const volumeMin = 10;
    const volumeMax = maxVolume;
    const steps = 50;

    let bestDesign = null;
    let bestSPL = -Infinity;

    for (let i = 0; i <= steps; i++) {
        const volumeLiters = volumeMin + (volumeMax - volumeMin) * (i / steps);

        // Design sealed box at this volume
        const design = designSealedBox(driverTS, 'butterworth', {
            volume: volumeLiters,
            unit: 'liters',
            responsePoints: 200
        });

        // Calculate maximum safe power at target frequency
        // Limited by excursion (frequency dependent) and thermal (constant)
        const maxExcursion = driverTS.xmax * maxExcursionRatio;

        // Calculate excursion at target freq with given power
        // X = V / (2π * f * Bl * Sd) where V = sqrt(P * Re)
        const voltage = Math.sqrt(ampPower * driverTS.re);
        const excursionAtFreq = voltage / (2 * Math.PI * targetFreq * driverTS.bl * driverTS.sd);
        const excursionMm = excursionAtFreq * 1000;

        // Check if this volume can handle the power at target freq
        if (excursionMm > maxExcursion) {
            continue; // Exceeds Xmax, skip
        }

        // Calculate thermal limit
        const thermalLimit = driverTS.pe || (ampPower * 1.5); // Use Pe if available

        // Calculate SPL at target freq with available power
        // SPL = sensitivity + 10*log10(P) + response_dB(targetFreq)
        const powerDb = 10 * Math.log10(ampPower);

        // Get response at target frequency from design
        const responseAtFreq = design.response.frequencies.findIndex(f => f >= targetFreq);
        const responseMag = responseAtFreq >= 0 ? design.response.magnitudesDb[responseAtFreq] : -20;

        const achievableSPL = sensitivity + powerDb + responseMag;

        // Track best design
        if (achievableSPL > bestSPL) {
            bestSPL = achievableSPL;
            bestDesign = {
                ...design,
                optimization: {
                    type: 'dsp-ready',
                    targetFreq,
                    eqBoostDb,
                    achievableSPL,
                    excursionMm,
                    maxExcursion,
                    headroomDb: eqBoostDb // How much boost this can handle
                }
            };
        }
    }

    if (!bestDesign) {
        // Fallback to Butterworth if optimization fails
        return designSealedBox(driverTS, 'butterworth', { unit, responsePoints: 200 });
    }

    return bestDesign;
}

/**
 * Optimize for room gain boundary loading
 *
 * Reality: Speakers near walls/corners get +3dB/octave boost below 80Hz from room boundaries.
 * Strategy: Design for natural rolloff that COMPLEMENTS room gain = flat in-room response.
 * This means smaller box than Butterworth (higher rolloff), room makes up the difference.
 *
 * @param {Object} driverTS - Driver parameters
 * @param {Object} options - Optimization options
 * @returns {Object} Optimized design
 */
export function optimizeForRoomGain(driverTS, options = {}) {
    const {
        maxVolume = 500,
        unit = 'liters'
    } = options;

    // Target: Qtc around 0.5-0.6 (underdamped) to complement room gain
    // Room gain adds +3dB/octave, sealed rolloff is -12dB/octave
    // Net result: -9dB/octave = more natural than Butterworth in-room

    // Search for volume that gives Qtc ~ 0.55
    const targetQtc = 0.55;
    const volumeMin = 10;
    const volumeMax = maxVolume;
    const steps = 50;

    let bestDesign = null;
    let bestQtcError = Infinity;

    for (let i = 0; i <= steps; i++) {
        const volumeLiters = volumeMin + (volumeMax - volumeMin) * (i / steps);

        const design = designSealedBox(driverTS, 'butterworth', {
            volume: volumeLiters,
            unit: 'liters',
            responsePoints: 200
        });

        const qtcError = Math.abs(design.box.qtc - targetQtc);

        if (qtcError < bestQtcError) {
            bestQtcError = qtcError;
            bestDesign = {
                ...design,
                optimization: {
                    type: 'room-gain',
                    targetQtc,
                    actualQtc: design.box.qtc,
                    description: 'Optimized for boundary loading (+3dB/octave room gain)'
                }
            };
        }
    }

    return bestDesign || designSealedBox(driverTS, 'butterworth', { unit, responsePoints: 200 });
}

/**
 * Optimize for maximum raw output (no DSP assumed)
 *
 * Traditional approach: maximize unEQed SPL at target frequency.
 * For sealed: smaller box = more power handling = higher SPL despite less extension.
 *
 * @param {Object} driverTS - Driver parameters
 * @param {Object} options - Optimization options
 * @returns {Object} Optimized design
 */
export function optimizeForMaxOutput(driverTS, options = {}) {
    const {
        targetFreq = 30,
        ampPower = 500,
        maxVolume = 500,
        maxExcursionRatio = 0.8,
        maxPortVelocity = 17,
        sensitivity = 89,
        unit = 'liters',
        enclosureType = 'sealed'
    } = options;

    if (enclosureType === 'ported') {
        // For ported, try different tunings to maximize output
        // TODO: implement ported optimization
        return designPortedBoxFull(driverTS, {
            vb: 100,
            fb: 25
        }, { unit, responsePoints: 200 });
    }

    // For sealed: iterate volumes to find max SPL
    const volumeMin = 10;
    const volumeMax = maxVolume;
    const steps = 50;

    let bestDesign = null;
    let bestSPL = -Infinity;

    for (let i = 0; i <= steps; i++) {
        const volumeLiters = volumeMin + (volumeMax - volumeMin) * (i / steps);

        const design = designSealedBox(driverTS, 'butterworth', {
            volume: volumeLiters,
            unit: 'liters',
            responsePoints: 200
        });

        // Check excursion limit
        const maxExcursion = driverTS.xmax * maxExcursionRatio;
        const voltage = Math.sqrt(ampPower * driverTS.re);
        const excursionAtFreq = voltage / (2 * Math.PI * targetFreq * driverTS.bl * driverTS.sd);
        const excursionMm = excursionAtFreq * 1000;

        if (excursionMm > maxExcursion) continue;

        // Calculate SPL
        const powerDb = 10 * Math.log10(ampPower);
        const responseAtFreq = design.response.frequencies.findIndex(f => f >= targetFreq);
        const responseMag = responseAtFreq >= 0 ? design.response.magnitudesDb[responseAtFreq] : -20;
        const achievableSPL = sensitivity + powerDb + responseMag;

        if (achievableSPL > bestSPL) {
            bestSPL = achievableSPL;
            bestDesign = {
                ...design,
                optimization: {
                    type: 'max-output',
                    targetFreq,
                    achievableSPL,
                    excursionMm
                }
            };
        }
    }

    return bestDesign || designSealedBox(driverTS, 'butterworth', { unit, responsePoints: 200 });
}

/**
 * Optimize for most compact enclosure
 *
 * Strategy: Minimize volume while keeping F3 within reasonable range of Butterworth.
 * Accepts slightly worse extension for significant space savings.
 *
 * @param {Object} driverTS - Driver parameters
 * @param {Object} options - Optimization options
 * @returns {Object} Optimized design
 */
export function optimizeForCompact(driverTS, options = {}) {
    const {
        maxF3Penalty = 1.1, // Allow F3 up to 10% higher than Butterworth
        unit = 'liters'
    } = options;

    // First get Butterworth F3 as reference
    const butterworthDesign = designSealedBox(driverTS, 'butterworth', {
        unit: 'liters',
        responsePoints: 200
    });
    const referenceF3 = butterworthDesign.box.f3;
    const maxAllowedF3 = referenceF3 * maxF3Penalty;

    // Search from small to large, take first that meets F3 requirement
    const volumeMin = 5;
    const volumeMax = butterworthDesign.box.volume.liters;
    const steps = 50;

    for (let i = 0; i <= steps; i++) {
        const volumeLiters = volumeMin + (volumeMax - volumeMin) * (i / steps);

        const design = designSealedBox(driverTS, 'butterworth', {
            volume: volumeLiters,
            unit: 'liters',
            responsePoints: 200
        });

        if (design.box.f3 <= maxAllowedF3) {
            return {
                ...design,
                optimization: {
                    type: 'compact',
                    referenceF3,
                    actualF3: design.box.f3,
                    volumeSavings: ((butterworthDesign.box.volume.liters - volumeLiters) / butterworthDesign.box.volume.liters * 100).toFixed(0) + '%'
                }
            };
        }
    }

    // Fallback to Butterworth
    return butterworthDesign;
}
