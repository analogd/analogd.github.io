/**
 * Calculation Metadata - Document how each graph/metric is calculated
 *
 * This provides transparency to users about what physics/equations back each calculation.
 * Each entry should include:
 * - Source paper/reference
 * - Equation number if applicable
 * - Key assumptions
 * - Validation status vs WinISD/other tools
 * - Known limitations
 */

export const CALCULATION_METHODS = {
    // ========================================================================
    // FREQUENCY RESPONSE
    // ========================================================================

    'sealed-fr': {
        name: 'Sealed Box Frequency Response',
        source: 'Small 1972, Equation 10',
        formula: '|H(f)| = (f/Fc)² / √[(1-(f/Fc)²)² + (f/Fc)²/Qtc²]',
        variables: {
            Fc: 'System resonance = Fs × √(1 + α)',
            Qtc: 'System Q = Qts × √(1 + α)',
            α: 'Compliance ratio = Vas / Vb'
        },
        assumptions: [
            'Small-signal linear behavior',
            'Pistonic driver motion (no breakup)',
            'Rigid enclosure',
            'Perfect seal (no leaks)'
        ],
        validation: {
            status: 'UNTESTED',
            notes: 'Awaiting fresh validation'
        },
        implementation: 'lib/foundation/small-1972.js:calculateResponseMagnitude()',
        limitations: [
            'Voice coil inductance (Le) ignored - valid below ~200Hz',
            'Does not model cone breakup modes',
            'Assumes constant Bl(x) - nonlinear excursion not modeled'
        ]
    },

    'ported-fr': {
        name: 'Ported Box Frequency Response',
        source: 'Small 1973, Equation 13',
        formula: '4th-order highpass transfer function H(s) = s⁴/(s⁴ + a₃s³ + a₂s² + a₁s + a₀)',
        variables: {
            fb: 'Port tuning frequency (Hz)',
            α: 'Compliance ratio = Vas / Vb',
            Qts: 'Driver total Q',
            QL: 'Enclosure losses (leakage, absorption, port friction)'
        },
        assumptions: [
            'Small-signal linear behavior',
            'Port air mass lumped (not distributed)',
            'Port acts as pure compliance below resonance',
            'No port turbulence (laminar flow)'
        ],
        validation: {
            status: 'UNTESTED',
            notes: 'Awaiting fresh validation'
        },
        implementation: 'lib/foundation/small-1973-normalized.js:calculatePortedResponseDbNormalized()',
        limitations: [
            'Port velocity limiting not modeled',
            'Port length end correction approximate'
        ]
    },

    // ========================================================================
    // DISPLACEMENT
    // ========================================================================

    'sealed-displacement': {
        name: 'Sealed Box Cone Displacement',
        source: 'Engineering approximation based on Small 1972 impedance',
        formula: 'X = F / (ω × |Zmech|) where F = Bl × I, I = V / Ztotal',
        variables: {
            Zmech: 'Mechanical impedance = Rms + jω×Mms + 1/(jω×Cms×(1+α))',
            Ztotal: 'Electrical impedance = Re + Bl²/|Zmech|',
            V: 'Input voltage = √(P × Re) [WRONG - being fixed]'
        },
        assumptions: [
            'Linear suspension (X < Xmax)',
            'Voice coil inductance ignored',
            'Power dissipated entirely in Re (NOT TRUE at low freq)'
        ],
        validation: {
            status: 'UNTESTED',
            notes: 'Awaiting fresh validation'
        },
        implementation: 'lib/engineering/displacement.js:calculateSealedDisplacementFromPower()',
        limitations: [
            'Does not model suspension nonlinearity',
            'Does not model thermal compression'
        ]
    },

    'ported-displacement': {
        name: 'Ported Box Cone Displacement',
        source: 'Engineering approximation with transfer function correction',
        formula: 'X_ported = X_sealed × correction_factor',
        variables: {
            correction_factor: '(H_sealed / H_ported)^0.8 [EMPIRICAL - NOT PAPER-TRUE]'
        },
        assumptions: [
            'Transfer function ratio approximates excursion ratio',
            'Excursion null at tuning modeled by H_ported → ∞'
        ],
        validation: {
            status: 'UNTESTED',
            notes: 'Awaiting fresh validation'
        },
        implementation: 'lib/engineering/displacement.js:calculatePortedDisplacementFromPower()',
        limitations: [
            'Does not model suspension nonlinearity',
            'Does not model thermal compression'
        ]
    },

    // ========================================================================
    // ALIGNMENTS
    // ========================================================================

    'alignments': {
        name: 'Ported Box Alignment Families',
        source: 'Thiele 1971, Small 1973',
        families: {
            'B2': {
                name: 'Butterworth 2nd Order',
                Qts: 0.383,
                'Vb/Vas': 1.0,
                'fb/fs': 1.414,
                description: 'Maximally flat magnitude response'
            },
            'QB3': {
                name: 'Quasi-Butterworth 3rd Order',
                Qts: '0.303-0.383',
                'Vb/Vas': '1.5-3.0',
                'fb/fs': '1.3-1.6',
                description: 'Compromise between efficiency and box size'
            },
            'C4': {
                name: 'Chebyshev 4th Order',
                Qts: 0.383,
                'Vb/Vas': 0.707,
                'fb/fs': 1.0,
                description: '1 dB ripple, extended low frequency'
            },
            'SBB4': {
                name: 'Sub-Butterworth 4th Order',
                Qts: 0.383,
                'Vb/Vas': '1.5-2.0',
                'fb/fs': 1.2,
                description: 'Small box, reduced efficiency'
            },
            'EBS': {
                name: 'Extended Bass Shelf',
                Qts: 0.30,
                'Vb/Vas': '2.5-4.0',
                'fb/fs': '1.4-1.8',
                description: 'Large box, extended deep bass'
            }
        },
        validation: {
            status: 'NOT IMPLEMENTED',
            notes: 'Alignment calculator should be added to foundation layer'
        },
        implementation: 'TODO: lib/foundation/thiele-1971.js:calculateAlignment()',
        limitations: [
            '❌ No automatic alignment suggestion',
            '❌ No box volume optimizer',
            '❌ User must manually choose Vb and fb'
        ]
    }
};

/**
 * Get calculation method metadata for a specific graph/metric
 *
 * @param {string} key - Calculation method key (e.g., 'sealed-fr')
 * @returns {Object} Metadata object
 */
export function getCalculationMethod(key) {
    return CALCULATION_METHODS[key];
}

/**
 * Get validation status summary
 *
 * @returns {Object} Summary of validation status for all calculations
 */
export function getValidationSummary() {
    const summary = {
        verified: [],
        partial: [],
        broken: [],
        notImplemented: []
    };

    for (const [key, method] of Object.entries(CALCULATION_METHODS)) {
        const status = method.validation?.status;
        if (status === 'VERIFIED') {
            summary.verified.push({ key, name: method.name });
        } else if (status === 'PARTIAL') {
            summary.partial.push({
                key,
                name: method.name,
                maxError: method.validation.maxError
            });
        } else if (status === 'BROKEN' || status === 'COMPLETELY BROKEN') {
            summary.broken.push({
                key,
                name: method.name,
                maxError: method.validation.maxError
            });
        } else if (status === 'NOT IMPLEMENTED') {
            summary.notImplemented.push({ key, name: method.name });
        }
    }

    return summary;
}

/**
 * Format calculation method for user display
 *
 * @param {string} key - Calculation method key
 * @returns {string} Formatted markdown string
 */
export function formatCalculationInfo(key) {
    const method = CALCULATION_METHODS[key];
    if (!method) return 'Unknown calculation method';

    let info = `## ${method.name}\n\n`;
    info += `**Source:** ${method.source}\n\n`;

    if (method.formula) {
        info += `**Formula:** \`${method.formula}\`\n\n`;
    }

    if (method.variables) {
        info += `**Variables:**\n`;
        for (const [variable, description] of Object.entries(method.variables)) {
            info += `- ${variable}: ${description}\n`;
        }
        info += '\n';
    }

    if (method.validation) {
        const status = method.validation.status;
        const emoji = status === 'VERIFIED' ? '✅' : status.includes('BROKEN') ? '❌' : '⚠️';
        info += `**Validation:** ${emoji} ${status}\n`;
        if (method.validation.maxError) {
            info += `- Max error: ${method.validation.maxError}\n`;
        }
        if (method.validation.notes) {
            info += `- ${method.validation.notes}\n`;
        }
        info += '\n';
    }

    if (method.limitations && method.limitations.length > 0) {
        info += `**Limitations:**\n`;
        for (const limitation of method.limitations) {
            info += `- ${limitation}\n`;
        }
    }

    return info;
}
