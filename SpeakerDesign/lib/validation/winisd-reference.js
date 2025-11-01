// WinISD Reference Data
// Real measurements from WinISD 0.70 Alpha using Dayton UMII18-22 (Ultimax II Version 2)
// Parameters from official Dayton Audio datasheet
// These are ACTUAL results to match, not calculated values

const WinISDReference = {
    // UMII18-22 (Ultimax II) sealed 200L @ 1W
    // Parameters from WinISD driver editor / official datasheet
    umii18_sealed_200L: {
        driver: {
            fs: 22.0,
            qts: 0.530,
            qes: 0.670,
            qms: 2.530,
            vas: 248.2,
            re: 4.2,
            le: 1.15,
            xmax: 28,
            sd: 1184,
            pe: 1200
        },
        box: {
            type: 'sealed',
            vb: 200  // 200L box
        },
        power: 1,  // 1W
        // Frequency response from WinISD screenshot
        responsePoints: [
            { frequency: 10, expectedSpl: 76 },
            { frequency: 15, expectedSpl: 80 },
            { frequency: 20, expectedSpl: 84 },
            { frequency: 30, expectedSpl: 89 },
            { frequency: 40, expectedSpl: 92 },
            { frequency: 50, expectedSpl: 93 },
            { frequency: 60, expectedSpl: 93.5 },
            { frequency: 80, expectedSpl: 94 },
            { frequency: 100, expectedSpl: 94 },
            { frequency: 200, expectedSpl: 94 },
            { frequency: 500, expectedSpl: 94 }
        ],
        tolerance: 2.0,  // ±2dB acceptable
        notes: 'Reference from WinISD screenshot - user confirmed'
    },

    // UMII18-22 (Ultimax II) sealed Butterworth (330L for Qtc=0.707)
    // WinISD confirmed measurements
    umii18_sealed_butterworth: {
        driver: {
            fs: 22.0,
            qts: 0.530,
            qes: 0.670,
            qms: 2.530,
            vas: 248.2,
            re: 4.2,
            le: 1.15,
            xmax: 28,
            sd: 1184,
            pe: 1200
        },
        box: {
            type: 'sealed',
            vb: 330  // Butterworth volume for Qtc=0.707
        },
        power: 1,
        // WinISD measurements from user screenshots
        expectedQtc: 0.707,  // Confirmed from WinISD
        expectedFsc: 68.73,  // "Fsc" from WinISD sealed box screen
        // SPL from WinISD driver parameters
        passbandSpl: 90.7,  // SPL field in WinISD driver editor
        // Excursion data (from WinISD @ 1000W)
        excursion: {
            xmax: 28,  // mm - linear excursion limit
            peakExcursionAt1000W: 38,  // mm - peak excursion around resonance
            exceedXmaxBelow: 40  // Hz - approximate frequency where excursion exceeds Xmax at 1000W
        },
        // Maximum safe power at each frequency (from WinISD "Maximum Power" graph)
        // Below ~50Hz: Excursion limited
        // Above ~50Hz: Thermal limited (~1350W)
        maxPowerCurve: [
            { frequency: 10, maxPower: 200 },
            { frequency: 20, maxPower: 200 },
            { frequency: 30, maxPower: 350 },
            { frequency: 40, maxPower: 500 },
            { frequency: 50, maxPower: 1350 },
            { frequency: 100, maxPower: 1350 },
            { frequency: 200, maxPower: 1350 }
        ],
        tolerance: {
            qtc: 0.02,
            fsc: 3.0,
            spl: 2.0
        },
        notes: 'WinISD reference: 330L sealed, Q=0.707, Fsc=68.73Hz. Excursion graph shows peak ~38mm at resonance with 1000W input.'
    }
};
