/**
 * Built-in Reference Subwoofer Data
 *
 * CEA-2010 burst measurements for common commercial subwoofers.
 * Data sourced from data-bass.com (used with attribution).
 *
 * Format:
 *   {
 *     id: 'unique-id',
 *     name: 'Display Name',
 *     type: 'sealed' | 'ported',
 *     source: 'data-bass.com',
 *     cea2010: [{hz: frequency, dB: max_spl}, ...]
 *   }
 *
 * CEA-2010 measures max output at standard frequencies until distortion threshold.
 * This is real-world data including thermal compression and nonlinearities.
 *
 * To add a new sub:
 * 1. Find CEA-2010 data from data-bass.com or similar
 * 2. Add entry to BUILTIN_REFERENCE_SUBS array
 * 3. Include all measured frequencies (typically 10-125 Hz)
 */

export const BUILTIN_REFERENCE_SUBS = [
    // ========================================================================
    // SVS
    // ========================================================================
    {
        id: 'svs-sb3000',
        name: 'SVS SB-3000',
        type: 'sealed',
        source: 'data-bass.com',
        cea2010: [
            { hz: 16, dB: 87.3 },
            { hz: 20, dB: 93.6 },
            { hz: 25, dB: 98.7 },
            { hz: 31.5, dB: 104.8 },
            { hz: 40, dB: 111.6 },
            { hz: 50, dB: 116.7 },
            { hz: 63, dB: 117.7 },
            { hz: 80, dB: 117.9 },
            { hz: 100, dB: 117.8 },
            { hz: 125, dB: 117.7 }
        ]
    },
    {
        id: 'svs-pb3000',
        name: 'SVS PB-3000',
        type: 'ported',
        source: 'data-bass.com',
        cea2010: [
            { hz: 12.5, dB: 82.1 },
            { hz: 16, dB: 96.2 },
            { hz: 20, dB: 108.3 },
            { hz: 25, dB: 113.3 },
            { hz: 31.5, dB: 114.9 },
            { hz: 40, dB: 118.0 },
            { hz: 50, dB: 119.6 },
            { hz: 63, dB: 118.6 },
            { hz: 80, dB: 117.8 },
            { hz: 100, dB: 118.7 },
            { hz: 125, dB: 118.0 }
        ]
    },

    // ========================================================================
    // More subs can be added here
    // Data available at data-bass.com for hundreds of models
    // ========================================================================

    // Example template for adding more:
    // {
    //     id: 'brand-model',
    //     name: 'Brand Model',
    //     type: 'sealed',
    //     source: 'data-bass.com',
    //     cea2010: [
    //         { hz: 16, dB: 0 },
    //         { hz: 20, dB: 0 },
    //         // ... add all measured frequencies
    //     ]
    // },
];

/**
 * Get reference sub by ID
 * @param {string} id - Sub ID
 * @returns {Object|undefined} Sub data or undefined
 */
export function getBuiltinSub(id) {
    return BUILTIN_REFERENCE_SUBS.find(sub => sub.id === id);
}

/**
 * Get all built-in subs as options for dropdown
 * @returns {Array<{id: string, name: string, type: string}>}
 */
export function getBuiltinSubOptions() {
    return BUILTIN_REFERENCE_SUBS.map(sub => ({
        id: sub.id,
        name: sub.name,
        type: sub.type
    }));
}

export default BUILTIN_REFERENCE_SUBS;
