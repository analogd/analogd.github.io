/**
 * Unit Conversion Utilities
 *
 * Cookbook layer uses user-friendly units (liters, cm, dB)
 * Foundation layer uses SI units (m³, m, Pa)
 *
 * This module handles conversions between layers.
 */

// ============================================================================
// VOLUME CONVERSIONS
// ============================================================================

export function volumeToM3(value, unit = 'liters') {
    const conversions = {
        'm3': 1,
        'm³': 1,
        'L': 0.001,
        'liters': 0.001,
        'litres': 0.001,
        'cuft': 0.0283168,
        'ft3': 0.0283168,
        'ft³': 0.0283168
    };

    const factor = conversions[unit];
    if (!factor) {
        throw new Error(`Unknown volume unit: ${unit}. Valid: m3, L, liters, cuft`);
    }

    return value * factor;
}

export function m3ToVolume(m3, unit = 'liters') {
    return volumeToM3(1, unit) > 0 ? m3 / volumeToM3(1, unit) : 0;
}

export function formatVolume(m3) {
    return {
        m3: Number(m3.toFixed(4)),
        liters: Number((m3 * 1000).toFixed(1)),
        cubicFeet: Number((m3 / 0.0283168).toFixed(2))
    };
}

// ============================================================================
// LENGTH CONVERSIONS
// ============================================================================

export function lengthToM(value, unit = 'cm') {
    const conversions = {
        'm': 1,
        'cm': 0.01,
        'mm': 0.001,
        'inches': 0.0254,
        'in': 0.0254,
        'ft': 0.3048
    };

    const factor = conversions[unit];
    if (!factor) {
        throw new Error(`Unknown length unit: ${unit}. Valid: m, cm, mm, inches`);
    }

    return value * factor;
}

export function mToLength(m, unit = 'cm') {
    return lengthToM(1, unit) > 0 ? m / lengthToM(1, unit) : 0;
}

export function formatLength(m) {
    return {
        m: Number(m.toFixed(4)),
        cm: Number((m * 100).toFixed(2)),
        mm: Number((m * 1000).toFixed(1)),
        inches: Number((m / 0.0254).toFixed(2))
    };
}

// ============================================================================
// AREA CONVERSIONS
// ============================================================================

export function areaToM2(value, unit = 'cm2') {
    const conversions = {
        'm2': 1,
        'm²': 1,
        'cm2': 0.0001,
        'cm²': 0.0001,
        'mm2': 0.000001,
        'mm²': 0.000001,
        'inches2': 0.00064516,
        'in2': 0.00064516,
        'in²': 0.00064516
    };

    const factor = conversions[unit];
    if (!factor) {
        throw new Error(`Unknown area unit: ${unit}. Valid: m2, cm2, mm2, inches2`);
    }

    return value * factor;
}

export function formatArea(m2) {
    return {
        m2: Number(m2.toFixed(6)),
        cm2: Number((m2 * 10000).toFixed(2)),
        inches2: Number((m2 / 0.00064516).toFixed(2))
    };
}

// ============================================================================
// ALIGNMENT DETECTION
// ============================================================================

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

    if (qtc < 0.5) return 'Underdamped';
    if (qtc < 0.65) return 'Quasi-Butterworth';
    if (qtc < 0.9) return 'Near-Critical';
    return 'Overdamped';
}
