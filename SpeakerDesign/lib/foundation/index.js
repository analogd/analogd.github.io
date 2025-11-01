// Loudspeaker Foundation Library
//
// Pure Thiele-Small theory from published papers.
// All functions cite source papers and equation numbers.
//
// See CITATIONS.md for full bibliography.
// See ROADMAP.md for implementation status.

// Physical constants
export * from './constants.js';

// Small 1972 - Sealed box theory
export * from './small-1972.js';

// Thiele 1971 - Alignment theory
export * from './thiele-1971.js';

// Small 1973 - Ported box theory
export * from './small-1973.js';

/**
 * Library version
 */
export const VERSION = '0.1.0';

/**
 * Library metadata
 */
export const METADATA = {
    name: 'loudspeaker-foundation',
    version: VERSION,
    description: 'Pure Thiele-Small theory from published papers',

    implemented: [
        'Small 1972 - Sealed box calculations',
        'Thiele 1971 - Standard alignments',
        'Small 1973 - Port calculations (partial)'
    ],

    planned: [
        'Impedance modeling (Leach)',
        'Large signal parameters (Klippel)',
        'Port compression (Roozen)',
        '4th-order ported response (Small 1973)',
        'Baffle step (Olson, Linkwitz)',
        'Thermal dynamics',
        'Inductance effects'
    ],

    units: 'SI only (m³, Hz, Pa, m/s, etc.)',

    citations: 'See CITATIONS.md for complete bibliography',

    website: 'https://github.com/YOUR_USERNAME/loudspeaker-foundation'
};
