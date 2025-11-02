/**
 * Parameter Definitions for Thiele-Small Theory
 *
 * Extracted from Small 1973 "LIST OF IMPORTANT SYMBOLS" (JAES Vol. 21, p. 316)
 * Single source of truth for all parameter metadata.
 * Used by JSDoc, UI tooltips, validation, etc.
 */

export const PARAMETERS = {
    // Frequencies (Small 1973, p. 316)
    fb: {
        name: 'fb',
        description: 'Resonance frequency of vented enclosure',
        unit: 'Hz',
        source: 'Small 1973, p. 316',
    },

    fh: {
        name: 'fH',
        description: 'Frequency of upper voice-coil impedance peak',
        unit: 'Hz',
        source: 'Small 1973, p. 316',
    },

    fl: {
        name: 'fL',
        description: 'Frequency of lower voice-coil impedance peak',
        unit: 'Hz',
        source: 'Small 1973, p. 316',
    },

    fm: {
        name: 'fm',
        description: 'Frequency of minimum voice-coil impedance between fL and fH',
        unit: 'Hz',
        source: 'Small 1973, p. 316',
    },

    fs: {
        name: 'fs',
        description: 'Resonance frequency of driver',
        unit: 'Hz',
        source: 'Small 1973, p. 316',
    },

    fc: {
        name: 'fc',
        description: 'Resonance frequency of driver mounted in enclosure',
        unit: 'Hz',
        source: 'Small 1973, p. 316',
    },

    f3: {
        name: 'f3',
        description: 'Half-power (-3 dB) frequency of loudspeaker system response',
        unit: 'Hz',
        source: 'Small 1973, p. 316',
    },

    // System parameters (Small 1973, p. 316)
    h: {
        name: 'h',
        description: 'System tuning ratio, = fb/fs',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    alpha: {
        name: 'α',
        description: 'System compliance ratio, = VAS/VB',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    eta0: {
        name: 'η₀',
        description: 'Reference efficiency',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    // Q parameters (Small 1973, p. 316)
    qa: {
        name: 'QA',
        description: 'Enclosure Q at fb resulting from absorption losses',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    ql: {
        name: 'QL',
        description: 'Total enclosure Q at fb resulting from all enclosure and vent losses',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    qle: {
        name: 'QLE',
        description: 'Enclosure Q at fb resulting from leakage losses',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    qp: {
        name: 'QP',
        description: 'Enclosure Q at fb resulting from vent frictional losses',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    qes: {
        name: 'QES',
        description: 'Driver Q at fs considering electrical resistance RE only',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    qms: {
        name: 'QMS',
        description: 'Driver Q at fs considering driver nonelectrical losses only',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    qts: {
        name: 'QTS',
        description: 'Total driver Q at fs resulting from all driver resistances',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    qt: {
        name: 'QT',
        description: 'Total driver Q at fs resulting from all system resistances',
        unit: '',
        source: 'Small 1973, p. 316',
    },

    qtc: {
        name: 'QTC',
        description: 'Total system Q (sealed box)',
        unit: '',
        source: 'Small 1972',
    },

    // Volumes and displacement (Small 1973, p. 316)
    vas: {
        name: 'VAS',
        description: 'Volume of air having same acoustic compliance as driver suspension',
        unit: 'm³',
        source: 'Small 1973, p. 316',
    },

    vb: {
        name: 'VB',
        description: 'Net internal volume of enclosure',
        unit: 'm³',
        source: 'Small 1973, p. 316',
    },

    vd: {
        name: 'VD',
        description: 'Peak displacement volume of driver diaphragm',
        unit: 'm³',
        source: 'Small 1973, p. 316',
    },

    xmax: {
        name: 'Xmax',
        description: 'Peak linear displacement of driver diaphragm',
        unit: 'm',
        source: 'Small 1973, p. 316',
    },

    // Driver electrical parameters
    re: {
        name: 'RE',
        description: 'DC resistance of driver voice coil',
        unit: 'Ω',
        source: 'Small 1973, p. 316',
    },

    // Additional common parameters (from Small 1972, Thiele 1971)
    sd: {
        name: 'SD',
        description: 'Effective piston area',
        unit: 'm²',
        source: 'Small 1972',
    },

    bl: {
        name: 'Bl',
        description: 'Force factor',
        unit: 'T·m',
        source: 'Small 1972',
    },

    mms: {
        name: 'MMS',
        description: 'Moving mass',
        unit: 'kg',
        source: 'Small 1972',
    },

    // Port parameters
    lv: {
        name: 'Lv',
        description: 'Port length',
        unit: 'm',
        source: 'Small 1973',
    },

    sv: {
        name: 'Sv',
        description: 'Port area',
        unit: 'm²',
        source: 'Small 1973',
    },

    dv: {
        name: 'Dv',
        description: 'Port diameter',
        unit: 'm',
        source: 'Derived',
    },
};

/**
 * Format parameter for JSDoc
 * @param {string} key - Parameter key from PARAMETERS
 * @returns {string} JSDoc formatted string
 */
export function toJSDoc(key) {
    const p = PARAMETERS[key];
    if (!p) throw new Error(`Unknown parameter: ${key}`);
    return `${p.description}${p.unit ? ' (' + p.unit + ')' : ''}`;
}

/**
 * Get parameter for UI tooltip
 * @param {string} key - Parameter key from PARAMETERS
 * @returns {object} {name, description, unit, typical}
 */
export function getTooltip(key) {
    const p = PARAMETERS[key];
    if (!p) return null;
    return {
        name: p.name,
        description: p.description,
        unit: p.unit,
        typicalRange: p.typical ? `${p.typical[0]}-${p.typical[1]} ${p.unit}` : null,
    };
}
