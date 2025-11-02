/**
 * Design Comparison Utilities
 *
 * 🍳 COOKBOOK LAYER
 *
 * Compare sealed vs ported, multiple alignments, parameter sensitivity
 */

import { designSealedBox, compareAlignments as compareSealedAlignments } from './sealed-box-designer.js';
import { designPortedBox, comparePortedAlignments } from './ported-box-designer.js';

/**
 * Compare sealed vs ported designs for a driver
 *
 * @param {Object} driver - Driver parameters
 * @param {Object} options - Configuration
 * @returns {Object} {sealed, ported, recommendation}
 */
export function compareSealedVsPorted(driver, options = {}) {
    const sealed = designSealedBox(driver, 'butterworth', options);

    let ported = null;
    let portedError = null;
    try {
        ported = designPortedBox(driver, 'QB3', options);
    } catch (err) {
        portedError = err.message;
    }

    // Determine recommendation
    let recommendation = 'sealed';
    let reasoning = [];

    if (driver.qts < 0.4) {
        recommendation = 'ported';
        reasoning.push(`Low Qts (${driver.qts}) favors ported design`);
    } else if (driver.qts > 0.6) {
        recommendation = 'sealed';
        reasoning.push(`High Qts (${driver.qts}) favors sealed design`);
    } else {
        recommendation = 'both';
        reasoning.push('Qts in versatile range - both designs viable');
    }

    if (ported && sealed) {
        if (ported.box.f3 < sealed.box.f3 - 3) {
            reasoning.push(`Ported extends bass by ${Math.round(sealed.box.f3 - ported.box.f3)}Hz`);
        }
        if (ported.box.volume.liters > sealed.box.volume.liters * 1.5) {
            reasoning.push(`Ported requires ${Math.round((ported.box.volume.liters / sealed.box.volume.liters - 1) * 100)}% more volume`);
        }
    }

    return {
        sealed,
        ported,
        portedError,
        recommendation,
        reasoning,
        summary: {
            sealedF3: sealed.box.f3,
            sealedVolume: sealed.box.volume.liters,
            portedF3: ported ? ported.box.f3 : null,
            portedVolume: ported ? ported.box.volume.liters : null,
            f3Improvement: ported ? sealed.box.f3 - ported.box.f3 : null,
            volumeRatio: ported ? ported.box.volume.liters / sealed.box.volume.liters : null
        }
    };
}

/**
 * Compare all viable alignments (sealed + ported)
 *
 * @param {Object} driver - Driver parameters
 * @param {Object} options - Configuration
 * @returns {Array<Object>} All designs sorted by F3
 */
export function compareAllAlignments(driver, options = {}) {
    const designs = [];

    // Add sealed alignments
    try {
        const sealedDesigns = compareSealedAlignments(driver, ['bessel', 'butterworth', 'chebyshev'], options);
        designs.push(...sealedDesigns.filter(d => !d.error));
    } catch (err) {
        // Skip if sealed fails
    }

    // Add ported alignments (if suitable)
    if (driver.qts >= 0.3 && driver.qts <= 0.55) {
        try {
            const portedDesigns = comparePortedAlignments(driver, ['QB3', 'B4', 'C4'], options);
            designs.push(...portedDesigns.filter(d => !d.error));
        } catch (err) {
            // Skip if ported fails
        }
    }

    // Sort by F3 (extension)
    designs.sort((a, b) => a.box.f3 - b.box.f3);

    return designs;
}

/**
 * Sensitivity analysis - how parameter changes affect design
 *
 * @param {Object} driver - Driver parameters
 * @param {string} parameter - Parameter to vary ('qts', 'vas', 'fs')
 * @param {Array<number>} range - [min, max, step]
 * @param {Object} options - Configuration
 * @returns {Array<Object>} Designs at each parameter value
 */
export function sensitivityAnalysis(driver, parameter, range = [-10, 10, 5], options = {}) {
    const [minPercent, maxPercent, stepPercent] = range;
    const results = [];

    const baseValue = driver[parameter];
    if (!baseValue) {
        throw new Error(`Driver missing parameter: ${parameter}`);
    }

    for (let percent = minPercent; percent <= maxPercent; percent += stepPercent) {
        const testDriver = { ...driver };
        testDriver[parameter] = baseValue * (1 + percent / 100);

        try {
            const sealed = designSealedBox(testDriver, 'butterworth', options);
            results.push({
                parameter,
                percent,
                value: testDriver[parameter],
                design: sealed
            });
        } catch (err) {
            results.push({
                parameter,
                percent,
                value: testDriver[parameter],
                error: err.message
            });
        }
    }

    return results;
}
