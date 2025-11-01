// Reference validation data - self-contained test fixtures
// Tests validate internal consistency and formula correctness
// NOT claiming to match WinISD - these validate OUR calculations work correctly

const ReferenceData = {
    // Test case 1: Sealed Butterworth alignment
    // Given: Fs=27.4, Qts=0.39, Vas=185
    // Target: Qtc=0.707 (Butterworth)
    // Formula: alpha = (Qtc/Qts)^2 - 1 = (0.707/0.39)^2 - 1 = 2.286
    //          Vb = Vas / alpha = 185 / 2.286 = 80.9L
    //          Fc = Fs * sqrt(1 + alpha) = 27.4 * 1.813 = 49.7Hz
    //          For Butterworth: F3 ≈ Fc = 49.7Hz
    sealed_butterworth: {
        driver: {
            fs: 27.4,
            qts: 0.39,
            vas: 185,
            re: 3.5,
            xmax: 18,
            sd: 1160,
            pe: 500
        },
        expected: {
            vb: 80.9,      // Calculated
            qtc: 0.707,
            fc: 49.7,
            f3: 49.7       // Butterworth: F3 = Fc
        },
        tolerance: {
            vb: 1.0,
            qtc: 0.01,
            fc: 1.0,
            f3: 1.0
        }
    },

    // Test case 2: Ported QB3 alignment
    // Given: Fs=34.3, Qts=0.35, Vas=201
    // QB3: Fb = Fs = 34.3Hz
    //      Vb = 15 * Qts^3.3 * Vas = 15 * (0.35)^3.3 * 201 = 94.3L
    //      F3 ≈ Fb * 0.8 = 27.4Hz
    ported_qb3: {
        driver: {
            fs: 34.3,
            qts: 0.35,
            vas: 201,
            re: 5.4,
            xmax: 8.5,
            sd: 860,
            pe: 800
        },
        expected: {
            vb: 94.3,      // 15 * Qts^3.3 * Vas
            fb: 34.3,      // QB3: Fb = Fs
            f3: 27.4,      // Fb * 0.8
            portDiameter: 10.0,
            portLength: 9.4  // Calculated for 10cm port
        },
        tolerance: {
            vb: 2.0,
            fb: 0.5,
            f3: 1.0,
            portLength: 1.0
        }
    },

    // Test case 3: Small sealed driver
    // Given: Fs=35, Qts=0.45, Vas=75
    // Target: Qtc=0.707
    // Vb = 75 / ((0.707/0.45)^2 - 1) = 51.1L
    // Fc = 35 * sqrt(1 + 75/51.1) = 55.0Hz
    // F3 = Fc = 55.0Hz
    sealed_small: {
        driver: {
            fs: 35.0,
            qts: 0.45,
            vas: 75.0,
            re: 6.0,
            xmax: 10.0,
            sd: 500,
            pe: 300
        },
        expected: {
            vb: 51.1,
            qtc: 0.707,
            fc: 55.0,
            f3: 55.0
        },
        tolerance: {
            vb: 1.0,
            qtc: 0.01,
            fc: 1.0,
            f3: 1.0
        }
    },

    // Test case 4: Response curve validation
    // Sealed box with Q=0.707
    // Response should follow 2nd-order highpass
    response_sealed: {
        driver: {
            fs: 30.0,
            qts: 0.40,
            vas: 100.0
        },
        box: {
            vb: 80.0  // Should give Q ≈ 0.707
        },
        // Expected response relative to passband (100Hz = 0dB)
        responsePoints: [
            { frequency: 20, expectedDb: -15.0 },  // Deep rolloff
            { frequency: 35, expectedDb: -7.0 },   // Near Fc
            { frequency: 60, expectedDb: -2.4 },   // Approaching passband
            { frequency: 100, expectedDb: -0.8 }   // Near passband
        ],
        tolerance: 1.5  // ±1.5dB
    },

    // Test case 5: Port velocity
    // V = (Sd × Xmax × Fb) / Sp
    // Given: Sd=860cm², Xmax=8.5mm, Fb=34.3Hz, port dia=10cm
    // Sd = 860cm² = 0.086m²
    // Xmax = 8.5mm = 0.0085m
    // Sp = π × (5cm)² = 78.5cm² = 0.00785m²
    // V = (0.086 × 0.0085 × 34.3) / 0.00785 = 3.2 m/s
    port_velocity: {
        driver: {
            sd: 860,    // cm²
            xmax: 8.5   // mm
        },
        port: {
            diameter: 10,  // cm
            fb: 34.3       // Hz
        },
        expected: {
            velocity: 3.2  // m/s (CORRECTED)
        },
        tolerance: 0.3
    },

    // Test case 6: High Qts sealed
    // Qts=0.55 (high, good for sealed)
    // For Q=0.707: Vb = 150 / ((0.707/0.55)^2 - 1) = 232L
    sealed_high_qts: {
        driver: {
            fs: 25.0,
            qts: 0.55,
            vas: 150.0,
            xmax: 15.0,
            sd: 800,
            pe: 400
        },
        expected: {
            vb: 232.0,
            qtc: 0.707,
            fc: 40.5,
            f3: 40.5
        },
        tolerance: {
            vb: 5.0,
            qtc: 0.02,
            fc: 2.0,
            f3: 2.0
        }
    },

    // Test case 7: Low Qts ported
    // Qts=0.30 (low, good for ported)
    // QB3: Vb = 15 * (0.30)^3.3 * 180 = 50.8L
    ported_low_qts: {
        driver: {
            fs: 32.0,
            qts: 0.30,
            vas: 180.0,
            xmax: 12.0,
            sd: 950,
            pe: 600
        },
        expected: {
            vb: 50.8,   // 15 * Qts^3.3 * Vas
            fb: 32.0,
            f3: 25.6    // Fb * 0.8
        },
        tolerance: {
            vb: 2.0,
            fb: 0.5,
            f3: 1.0
        }
    },

    // Test case 8: EBP classification
    // EBP = Fs / Qes
    // <50: sealed, 50-100: versatile, >100: ported
    ebp_classification: {
        cases: [
            {
                name: 'sealed_driver',
                driver: { fs: 28.0, qes: 0.70, qts: 0.5, vas: 100 },
                expected: { ebp: 40.0, hint: 'sealed' }
            },
            {
                name: 'versatile_driver',
                driver: { fs: 30.0, qes: 0.50, qts: 0.4, vas: 100 },
                expected: { ebp: 60.0, hint: 'versatile' }
            },
            {
                name: 'ported_driver',
                driver: { fs: 35.0, qes: 0.30, qts: 0.35, vas: 150 },
                expected: { ebp: 116.7, hint: 'ported' }
            }
        ],
        tolerance: 2.0  // ±2 for EBP
    }
};
