/**
 * Alignment Comparison Utilities
 *
 * Compare multiple enclosure designs side-by-side.
 * Useful for deciding between alignments or box sizes.
 */

import { Driver } from './Driver.js';
import { SealedBox } from './SealedBox.js';
import { VentedBox } from './VentedBox.js';
import { Port } from './vents/Port.js';
import { PassiveRadiator } from './vents/PassiveRadiator.js';
import { generateLogScale } from '../foundation/utils.js';
import { BUTTERWORTH_QTC, BESSEL_QTC, CHEBYSHEV_QTC } from '../foundation/thiele-1971.js';

/**
 * Compare sealed box alignments for a driver
 *
 * Returns a comparison of Butterworth, Bessel, and Chebyshev alignments
 * showing volume, F3, Qtc, and other key metrics.
 *
 * @param {Driver} driver - Driver to design for
 * @returns {Object} Comparison results
 */
export function compareSealedAlignments(driver) {
    if (!(driver instanceof Driver)) {
        throw new Error('compareSealedAlignments requires a Driver instance');
    }

    const alignments = {};
    const errors = {};

    // Try each alignment (some may fail if Qts is too high)
    const configs = [
        { name: 'butterworth', factory: () => SealedBox.butterworth(driver), qtc: BUTTERWORTH_QTC },
        { name: 'bessel', factory: () => SealedBox.bessel(driver), qtc: BESSEL_QTC },
        { name: 'chebyshev', factory: () => SealedBox.chebyshev(driver), qtc: CHEBYSHEV_QTC }
    ];

    for (const config of configs) {
        try {
            const box = config.factory();
            alignments[config.name] = {
                volumeLiters: box.volumeLiters,
                qtc: box.qtc,
                fc: box.fc,
                f3: box.f3,
                alignmentDescription: box.alignmentDescription,
                box  // Include the actual box for further queries
            };
        } catch (e) {
            errors[config.name] = e.message;
        }
    }

    return {
        driver: driver.displayName,
        driverQts: driver.qts,
        alignments,
        errors,
        recommendation: getRecommendation(driver, alignments)
    };
}

/**
 * Compare ported box alignments for a driver
 *
 * Returns a comparison of QB3 and B4 alignments (unique solutions).
 * C4 is only included if options.k is provided (it's a family of alignments).
 *
 * @param {Driver} driver - Driver to design for
 * @param {Port|PassiveRadiator} vent - Vent specification (REQUIRED)
 * @param {Object} [options] - Options (ql for lossy, k for C4 alignment)
 * @returns {Object} Comparison results
 */
export function comparePortedAlignments(driver, vent, options = {}) {
    if (!(driver instanceof Driver)) {
        throw new Error('comparePortedAlignments requires a Driver instance');
    }

    if (!(vent instanceof Port) && !(vent instanceof PassiveRadiator)) {
        throw new Error(
            'comparePortedAlignments requires a Port or PassiveRadiator as second argument'
        );
    }

    const alignments = {};
    const errors = {};

    // QB3 and B4 have unique solutions
    const configs = [
        { name: 'qb3', factory: () => VentedBox.qb3(driver, vent, options) },
        { name: 'b4', factory: () => VentedBox.b4(driver, vent, options) }
    ];

    // C4 only if k is provided (it's a family of alignments parameterized by k)
    if (options.k != null) {
        configs.push({ name: 'c4', factory: () => VentedBox.c4(driver, vent, options) });
    }

    for (const config of configs) {
        try {
            const box = config.factory();
            alignments[config.name] = {
                volumeLiters: box.volumeLiters,
                fb: box.fb,
                tuningRatio: box.tuningRatio,
                f3: box.f3,
                alignmentDescription: box.alignmentDescription,
                box
            };
        } catch (e) {
            errors[config.name] = e.message;
        }
    }

    return {
        driver: driver.displayName,
        driverQts: driver.qts,
        driverEbp: driver.ebp,
        alignments,
        errors
    };
}

/**
 * Compare all alignments (sealed and ported) for a driver
 *
 * @param {Driver} driver - Driver to design for
 * @param {Port|PassiveRadiator} vent - Vent for ported alignments (REQUIRED)
 * @param {Object} [options] - Options (ql for lossy, k for C4)
 * @returns {Object} Full comparison
 */
export function compareAllAlignments(driver, vent, options = {}) {
    const sealed = compareSealedAlignments(driver);
    const ported = comparePortedAlignments(driver, vent, options);

    // Build unified table
    const all = [];

    for (const [name, data] of Object.entries(sealed.alignments)) {
        all.push({
            type: 'sealed',
            alignment: name,
            volumeLiters: data.volumeLiters,
            f3: data.f3,
            description: data.alignmentDescription,
            box: data.box
        });
    }

    for (const [name, data] of Object.entries(ported.alignments)) {
        all.push({
            type: 'ported',
            alignment: name,
            volumeLiters: data.volumeLiters,
            fb: data.fb,
            f3: data.f3,
            description: data.alignmentDescription,
            box: data.box
        });
    }

    // Sort by F3 (lowest extension first)
    all.sort((a, b) => a.f3 - b.f3);

    return {
        driver: driver.displayName,
        driverQts: driver.qts,
        driverEbp: driver.ebp,
        enclosureHint: driver.enclosureHint,
        sealed,
        ported,
        all
    };
}

/**
 * Compare multiple volumes for a single alignment type
 *
 * Useful for exploring volume vs F3 tradeoffs.
 *
 * @param {Driver} driver - Driver to design for
 * @param {Array<number>} volumes - Volumes to compare (liters)
 * @param {string} [type='sealed'] - 'sealed' or 'ported'
 * @returns {Array<Object>} Comparison data
 */
export function compareVolumes(driver, volumes, type = 'sealed') {
    if (!(driver instanceof Driver)) {
        throw new Error('compareVolumes requires a Driver instance');
    }

    return volumes.map(v => {
        try {
            if (type === 'sealed') {
                const box = new SealedBox(driver, v);
                return {
                    volumeLiters: v,
                    qtc: box.qtc,
                    f3: box.f3,
                    alignmentName: box.alignmentName,
                    box
                };
            } else {
                // For vented, need to estimate a reasonable Fb
                // Use the formula Fb ≈ Fs × (Vas/Vb)^0.31 as starting point
                const alpha = driver.vas / v;
                const fb = driver.fs * Math.pow(alpha, 0.31);
                const port = new Port({ diameter: 10, flared: true });
                const box = new VentedBox(driver, v, fb, port);
                return {
                    volumeLiters: v,
                    fb: box.fb,
                    f3: box.f3,
                    alignmentName: box.alignmentName,
                    box
                };
            }
        } catch (e) {
            return {
                volumeLiters: v,
                error: e.message
            };
        }
    });
}

/**
 * Generate Pareto-optimal points for volume vs F3
 *
 * Finds designs where you can't improve F3 without increasing volume.
 *
 * @param {Driver} driver - Driver to design for
 * @param {number} [minVolume=20] - Minimum volume to consider (liters)
 * @param {number} [maxVolume=500] - Maximum volume to consider (liters)
 * @param {number} [points=20] - Number of volumes to test
 * @returns {Array<Object>} Pareto frontier points
 */
export function getParetoFrontier(driver, minVolume = 20, maxVolume = 500, points = 20) {
    const volumes = generateLogScale(minVolume, maxVolume, points);

    // Get all sealed designs
    const sealedPoints = compareVolumes(driver, volumes, 'sealed')
        .filter(p => !p.error)
        .map(p => ({ type: 'sealed', ...p }));

    // Get all ported designs
    const portedPoints = compareVolumes(driver, volumes, 'ported')
        .filter(p => !p.error)
        .map(p => ({ type: 'ported', ...p }));

    const allPoints = [...sealedPoints, ...portedPoints];

    // Find Pareto frontier: no point is dominated by another
    // A point is dominated if another point has both lower volume AND lower F3
    const pareto = allPoints.filter(p1 => {
        return !allPoints.some(p2 =>
            p2.volumeLiters < p1.volumeLiters && p2.f3 < p1.f3
        );
    });

    // Sort by volume
    pareto.sort((a, b) => a.volumeLiters - b.volumeLiters);

    return pareto;
}

/**
 * Get a simple recommendation based on driver parameters
 * @private
 */
function getRecommendation(driver, _alignments) {
    const ebp = driver.ebp;
    const qts = driver.qts;

    // Basic recommendations
    if (qts > 0.7) {
        return 'High Qts driver - suited for sealed box. Consider Butterworth for flat response.';
    }

    if (ebp !== null) {
        if (ebp < 50) {
            return 'Low EBP - better suited for sealed box.';
        }
        if (ebp > 90) {
            return 'High EBP - well suited for ported box.';
        }
    }

    if (qts >= 0.35 && qts <= 0.45) {
        return 'Optimal Qts range for ported alignments. Consider B4 or QB3.';
    }

    return 'Consider both sealed and ported options.';
}
