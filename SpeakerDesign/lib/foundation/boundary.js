// Room Boundary Effects
// Based on standard acoustics theory (boundary loading)
//
// Loudspeaker placement near walls/corners increases low-frequency SPL
// due to reduced radiation space. NOT driver-specific - affects all systems.
//
// Source: General acoustics theory (not paper-specific)

/**
 * Calculate SPL gain from room boundary loading
 *
 * Formula: Gain = 10×log₁₀(loading_factor)
 *
 * Where loading_factor depends on placement:
 * - Free space (full space): 0 dB (reference)
 * - Half-space (against wall or floor): +6 dB
 * - Quarter-space (floor-wall): +12 dB
 * - Eighth-space (corner): +18 dB
 *
 * This gain applies primarily below room transition frequency (~100-200Hz).
 *
 * @param {string} placement - 'free-space', 'half-space', 'quarter-space', 'corner'
 * @returns {number} SPL gain in dB
 */
export function calculateRoomGain(placement) {
    const placements = {
        'free-space': 1,      // Full space (4π steradians)
        'half-space': 2,      // Against wall (2π steradians)
        'quarter-space': 4,   // Floor-wall (π steradians)
        'corner': 8,          // Corner (π/2 steradians)
        'eighth-space': 8     // Alias for corner
    };

    const factor = placements[placement.toLowerCase()];
    if (!factor) {
        throw new Error(
            `Invalid placement: '${placement}'. ` +
            `Valid options: 'free-space', 'half-space', 'quarter-space', 'corner'`
        );
    }

    return 10 * Math.log10(factor);
}
