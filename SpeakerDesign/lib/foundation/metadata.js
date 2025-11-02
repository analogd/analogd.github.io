// Foundation Library Metadata
// Single source of truth for function counts, coverage, etc.

export const metadata = {
    // Paper-pure implementations
    paperPure: {
        'small-1972.js': {
            functions: 14,
            paper: 'Small, R.H. "Closed-Box Loudspeaker Systems" JAES Vol. 20, 1972',
            description: 'Sealed enclosure design'
        },
        'thiele-1971.js': {
            functions: 4,
            paper: 'Thiele, A.N. "Loudspeakers in Vented Boxes" JAES Vol. 19, 1971',
            description: 'Alignment theory (Butterworth, Bessel, Chebyshev, QB3)'
        },
        'small-1973.js': {
            functions: 33,
            paper: 'Small, R.H. "Vented-Box Loudspeaker Systems" Parts I-IV, JAES Vol. 21, 1973',
            description: 'Ported enclosure design - 4th-order transfer function, port design, impedance measurement, alignments, loss modeling'
        }
    },

    // Derived tools
    derived: {
        'sensitivity.js': {
            functions: 4,
            description: 'Numerical differentiation for "what if" analysis'
        },
        'comparison.js': {
            functions: 3,
            description: 'Sealed vs ported side-by-side'
        },
        'bandpass.js': {
            functions: 3,
            description: '4th/6th order bandpass designs'
        },
        'boundary.js': {
            functions: 1,
            description: 'Room loading effects'
        }
    },

    // Placeholders
    placeholders: {
        'geddes.js': {
            paper: 'Geddes, E. "Acoustic Waveguide Theory" (1989-2003)',
            description: 'Port compression - not yet implemented'
        },
        'klippel.js': {
            paper: 'Klippel, W. "Loudspeaker Nonlinearities" (1992-2006)',
            description: 'Nonlinear models - not yet implemented'
        }
    }
};

// Calculate totals
export function getStats() {
    const paperPureFunctions = Object.values(metadata.paperPure)
        .reduce((sum, lib) => sum + lib.functions, 0);

    const derivedFunctions = Object.values(metadata.derived)
        .reduce((sum, lib) => sum + lib.functions, 0);

    return {
        paperPureFunctions,      // 51
        derivedFunctions,         // 11
        totalFunctions: paperPureFunctions + derivedFunctions,  // 62
        placeholders: Object.keys(metadata.placeholders).length  // 2
    };
}
