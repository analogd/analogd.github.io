/**
 * Defaults & Constants - User-configurable starting values and built-in data
 *
 * Single source of truth for:
 * - Initial UI values (box size, power, target SPL, etc.)
 * - Built-in driver presets
 * - Curve resolution settings
 */

// ============================================================================
// DEFAULTS - User-configurable starting values
// ============================================================================
// Initial values shown in the UI. Users can change these via controls.

export const DEFAULTS = {
    // Box design
    volumeLiters: 140,
    tuningFrequency: 28,        // Hz, for ported boxes
    ql: 7,                      // Enclosure losses Q (5-20 typical, higher = less loss)

    // Operating conditions
    power: 500,                 // Watts
    targetSpl: 115,             // dB at MLP

    // Port configuration
    portDiameter: 10,           // cm
    portWidth: 5,               // cm (rectangular)
    portHeight: 20,             // cm (rectangular)

    // Passive radiator design targets
    // Unlike drivers (component you have), PR specs are design outputs:
    // "What PR do I need for my target tuning?" - then find/buy one that matches.
    // These are starting points for exploration, not specs of a specific component.
    prMass: 150,                // grams - adjust to hit target tuning
    prArea: 500,                // cm² - typically matches driver Sd
    prXmax: 20,                 // mm - excursion limit for output capability

    // Graph axis ranges (user can change via UI)
    frequencyMax: 200,          // Hz, x-axis limit
    frequencyMin: 10,           // Hz, x-axis start
    timeDomainMax: 100,         // ms, for step/impulse response
    displacementAxisDefault: 20, // mm, axis range when driver xmax unknown (graphs will show N/A anyway)

    // Curve resolution - not user-facing, but centralized to avoid magic numbers.
    // 50 points is smooth enough for most curves; 100 for detailed ones (response, impedance).
    curvePoints: 50,
    curvePointsHigh: 100
};

// ============================================================================
// POPULAR DRIVERS - Built-in driver presets
// ============================================================================
// Common subwoofer drivers for easy selection. Users can also import custom JSON.
//
// Note: Cms and Rms values were calculated from other T/S params using standard
// formulas, then verified for consistency. They're stored as explicit values
// (not marked as _derived) because they represent verified reference data.

export const POPULAR_DRIVERS = [
    {
        id: 'ultimax-ii-18',
        name: 'Dayton UM18-22 (Ultimax II)',
        manufacturer: 'Dayton Audio',
        size: '18"',
        fs: 22.0,
        qts: 0.53,
        qes: 0.67,
        qms: 2.53,
        vas: 248.2,
        re: 4.2,
        le: 1.15,
        bl: 19.2,           // spec sheet: 19.2 Tm
        mms: 420,           // spec sheet: 420g
        cms: 0.000128,      // calculated: Vas/(ρ×c²×Sd²)
        rms: 22.95,         // calculated: (2π×fs×Mms)/Qms
        xmax: 28,           // spec sheet: 28mm at 70% Bl (Klippel verified)
        sd: 1184,
        pe: 1200,
        vd: 3315,           // spec sheet: 3315 cm³
        sensitivity: 90.7   // spec sheet: 90.7 dB @ 2.83V/1m
    },
    {
        id: 'fi-ib3-18',
        name: 'Fi Audio IB3 18"',
        manufacturer: 'Fi Car Audio',
        size: '18"',
        fs: 17.5,
        qts: 0.52,
        qes: 0.56,
        qms: 6.9,
        vas: 284,
        re: 3.1,
        le: 1.8,
        bl: 19.5,
        mms: 450,
        cms: 0.000133,      // calculated: Vas/(ρ×c²×Sd²)
        rms: 7.17,          // calculated: (2π×fs×Mms)/Qms
        xmax: 38,
        sd: 1240,
        pe: 2000
        // vd and sensitivity intentionally omitted - lets user discover the derive-and-use flow
    },
    {
        id: 'si-sql-15',
        name: 'Stereo Integrity SQL-15',
        manufacturer: 'Stereo Integrity',
        size: '15"',
        fs: 27.0,
        qts: 0.46,
        qes: 0.49,
        qms: 7.8,
        vas: 87.5,
        re: 2.0,
        le: 1.2,
        bl: 16.8,
        mms: 185,
        cms: 0.000086,      // calculated: Vas/(ρ×c²×Sd²)
        rms: 4.02,          // calculated: (2π×fs×Mms)/Qms
        xmax: 22,
        sd: 855,
        pe: 800
        // vd and sensitivity intentionally omitted - lets user discover the derive-and-use flow
    },
    {
        id: 'sb-sb29swnrx',
        name: 'SB Acoustics SB29SWNRX-S75-6',
        manufacturer: 'SB Acoustics',
        size: '12"',
        fs: 24.0,
        qts: 0.36,
        qes: 0.39,
        qms: 5.5,
        vas: 98,
        re: 5.1,
        le: 1.5,
        bl: 14.2,
        mms: 165,
        cms: 0.000276,      // calculated: Vas/(ρ×c²×Sd²)
        rms: 4.52,          // calculated: (2π×fs×Mms)/Qms
        xmax: 17,
        sd: 506,
        pe: 300
        // vd and sensitivity intentionally omitted - lets user discover the derive-and-use flow
    }
];

// Default driver is first entry (Ultimax II)
export const DEFAULT_DRIVER = POPULAR_DRIVERS[0];
