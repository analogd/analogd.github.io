/**
 * Motor Geometry - Bl(x) Estimation
 *
 * 📄 PAPER-CLOSE LAYER
 * Reference: Klippel 2006 "Loudspeaker Nonlinearities – Causes, Parameters, Symptoms"
 *
 * The force factor Bl varies with voice coil position because:
 * - As coil moves, fewer windings are in the magnetic gap
 * - The magnetic field is not uniform at gap edges
 *
 * Two main motor topologies:
 * 1. OVERHANG: Coil height > gap depth
 *    - Bl stays nearly constant while coil is in gap
 *    - Drops rapidly when coil exits gap
 *    - "Clean until it clips" behavior
 *
 * 2. EQUAL-LENGTH: Coil height ≈ gap depth
 *    - Bl decreases gradually from center
 *    - More progressive compression
 *    - Better behavior in large-signal domain
 */

/**
 * Estimate Bl(x) from motor geometry
 *
 * Uses the overhang model which is typical for high-excursion subwoofers.
 *
 * @param {number} x - Displacement from rest (mm)
 * @param {number} bl0 - Bl at rest position (T·m)
 * @param {number} coilHeight - Voice coil winding height (mm)
 * @param {number} gapDepth - Magnetic gap depth (mm)
 * @returns {number} Bl at position x (T·m)
 */
export function blFromGeometry(x, bl0, coilHeight, gapDepth) {
    const overhang = (coilHeight - gapDepth) / 2;  // One-way overhang (mm)

    if (overhang <= 0) {
        // Equal-length or underhung: quadratic falloff from center
        // Bl(x) = Bl0 × [1 - (x/coilHeight)²]
        const normalized = x / coilHeight;
        return bl0 * Math.max(0.1, 1 - normalized * normalized);
    }

    // Overhang: flat plateau, then rapid falloff
    const xAbs = Math.abs(x);

    if (xAbs <= overhang) {
        // Coil still fully in gap - Bl is constant
        // (In reality there's small ripple, we ignore it)
        return bl0;
    }

    // Coil leaving gap - linear-ish falloff
    // Model: Bl drops linearly with how much coil has left gap
    const exitDistance = xAbs - overhang;  // How far past plateau (mm)
    const totalCoilHalf = coilHeight / 2;
    const dropFraction = Math.min(exitDistance / totalCoilHalf, 0.9);  // Cap at 90% drop

    return bl0 * (1 - dropFraction);
}

/**
 * Estimate Bl(x) when motor geometry is unknown
 *
 * Uses empirical model based on typical subwoofer behavior:
 * - Bl stays roughly flat until ~50% of Xmax
 * - Then drops progressively, reaching ~50% at Xmax
 *
 * Based on Klippel 2006: typical compression of 3-6 dB at Xmax,
 * which corresponds to Bl dropping to 50-70% of Bl0.
 *
 * This is a planning approximation - real drivers vary significantly!
 *
 * @param {number} x - Displacement from rest (mm)
 * @param {number} bl0 - Bl at rest position (T·m)
 * @param {number} xmax - Rated Xmax (mm)
 * @param {Object} [options] - Tuning parameters
 * @param {number} [options.plateauFraction=0.5] - Fraction of Xmax where Bl is flat
 * @param {number} [options.blAtXmax=0.5] - Bl/Bl0 ratio at Xmax
 * @returns {number} Bl at position x (T·m)
 */
export function blFromXmax(x, bl0, xmax, options = {}) {
    const {
        plateauFraction = 0.5,  // Typical overhang driver
        blAtXmax = 0.5          // Bl drops to 50% at Xmax (~6dB)
    } = options;

    const xAbs = Math.abs(x);
    const plateauEnd = xmax * plateauFraction;

    if (xAbs <= plateauEnd) {
        return bl0;
    }

    // Linear rolloff from plateau to Xmax (more aggressive than quadratic)
    // At plateauEnd: Bl = Bl0
    // At Xmax: Bl = Bl0 × blAtXmax
    const progress = (xAbs - plateauEnd) / (xmax - plateauEnd);
    const blRatio = 1 - (1 - blAtXmax) * progress;

    return bl0 * Math.max(0.1, blRatio);
}

/**
 * Calculate effective Bl for RMS excursion over a cycle
 *
 * Since Bl(x) varies with position, and excursion is sinusoidal,
 * the effective Bl over a cycle is the RMS-weighted average.
 *
 * For small excursions: Bl_eff ≈ Bl0
 * For large excursions: Bl_eff < Bl0 (compression)
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} bl0 - Bl at rest (T·m)
 * @param {number} xmax - Rated Xmax (mm)
 * @param {Object} [options] - Options for blFromXmax
 * @returns {number} Effective Bl over the cycle (T·m)
 */
export function effectiveBlForExcursion(xPeak, bl0, xmax, options = {}) {
    // Numerical integration over sinusoidal cycle
    // x(t) = xPeak × sin(ωt)
    // Bl_eff = sqrt(1/T × ∫ Bl(x(t))² dt)

    const numPoints = 32;  // Points per quarter cycle
    let sumSquared = 0;

    for (let i = 0; i < numPoints; i++) {
        const theta = (Math.PI / 2) * (i / numPoints);  // 0 to π/2
        const x = xPeak * Math.sin(theta);
        const bl = blFromXmax(x, bl0, xmax, options);
        sumSquared += bl * bl;
    }

    return Math.sqrt(sumSquared / numPoints);
}

/**
 * Calculate Bl compression in dB
 *
 * Uses peak-based compression: the SPL limit is determined by the Bl
 * at peak excursion, not the RMS average over the cycle.
 *
 * For planning purposes, this gives a conservative estimate of how much
 * output is lost when operating near Xmax.
 *
 * @param {number} xPeak - Peak excursion (mm)
 * @param {number} xmax - Rated Xmax (mm)
 * @param {Object} [options] - Options for Bl estimation
 * @returns {number} Compression in dB (negative = loss)
 */
export function blCompressionDb(xPeak, xmax, options = {}) {
    const bl0 = 1;  // Normalized
    const blAtPeak = blFromXmax(xPeak, bl0, xmax, options);
    const ratio = blAtPeak / bl0;

    if (ratio >= 1) return 0;
    return 20 * Math.log10(ratio);
}

/**
 * Estimate required motor geometry from Bl and Xmax
 *
 * Useful for calculating what geometry would give measured Bl behavior.
 * Assumes typical overhang design.
 *
 * @param {number} bl0 - Bl at rest (T·m)
 * @param {number} xmax - Rated Xmax (mm)
 * @returns {Object} {coilHeight, gapDepth} estimated in mm
 */
export function estimateGeometry(bl0, xmax) {
    // Rule of thumb for overhang subwoofers:
    // - Overhang ≈ 0.6-0.7 × Xmax (gives flat Bl plateau)
    // - Gap depth ≈ 8-12mm for typical motors
    // - Coil height = gap + 2 × overhang

    const typicalGapDepth = 10;  // mm
    const overhang = 0.65 * xmax;
    const coilHeight = typicalGapDepth + 2 * overhang;

    return {
        coilHeight,
        gapDepth: typicalGapDepth,
        overhang
    };
}
