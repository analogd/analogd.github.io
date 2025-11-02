// Unit conversion utilities
// Foundation uses SI units (m³, m, Hz, Pa)
// API accepts user-friendly units (liters, cm, etc.)

/**
 * Convert volume to m³ (SI unit)
 */
export function volumeToM3(value, unit = 'm3') {
    const conversions = {
        'm3': 1,
        'L': 0.001,
        'liters': 0.001,
        'cuft': 0.0283168
    };

    const factor = conversions[unit];
    if (!factor) {
        throw new Error(`Unknown volume unit: ${unit}. Valid: m3, L, liters, cuft`);
    }

    return value * factor;
}

/**
 * Convert length to m (SI unit)
 */
export function lengthToM(value, unit = 'm') {
    const conversions = {
        'm': 1,
        'cm': 0.01,
        'mm': 0.001,
        'inches': 0.0254
    };

    const factor = conversions[unit];
    if (!factor) {
        throw new Error(`Unknown length unit: ${unit}. Valid: m, cm, mm, inches`);
    }

    return value * factor;
}

/**
 * Format volume in multiple units
 */
export function formatVolume(m3) {
    return {
        m3: Number(m3.toFixed(4)),
        liters: Number((m3 * 1000).toFixed(1)),
        cubicFeet: Number((m3 / 0.0283168).toFixed(2))
    };
}

/**
 * Format length in multiple units
 */
export function formatLength(m) {
    return {
        m: Number(m.toFixed(4)),
        cm: Number((m * 100).toFixed(2)),
        mm: Number((m * 1000).toFixed(1)),
        inches: Number((m / 0.0254).toFixed(2))
    };
}

/**
 * Format area in multiple units
 */
export function formatArea(m2) {
    return {
        m2: Number(m2.toFixed(6)),
        cm2: Number((m2 * 10000).toFixed(2)),
        inches2: Number((m2 / 0.00064516).toFixed(2))
    };
}

/**
 * Detect alignment from Qtc
 */
export function detectAlignment(qtc, tolerance = 0.05) {
    const alignments = [
        { name: 'Bessel', qtc: 0.577 },
        { name: 'Butterworth', qtc: 0.707 },
        { name: 'Chebyshev', qtc: 1.0 }
    ];

    for (const alignment of alignments) {
        if (Math.abs(qtc - alignment.qtc) < tolerance) {
            return alignment.name;
        }
    }

    return 'Custom';
}
