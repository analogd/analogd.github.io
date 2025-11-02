// Foundation library tests - first-principles validation
//
// These tests PROVE correctness by validating:
// 1. Mathematical properties (not just examples)
// 2. Published reference values (Thiele 1971, Small 1972)
// 3. Limit cases (boundary behavior)
// 4. Self-consistency (forward/inverse operations)
// 5. Physical constraints (conservation of energy, etc.)
// 6. Transfer function properties (exact -3dB points, slopes)

// Import foundation (ES6 modules)
import * as Foundation from '../foundation/index.js';
import * as Small1972 from '../foundation/small-1972.js';
import * as Thiele1971 from '../foundation/thiele-1971.js';
import * as Small1973 from '../foundation/small-1973.js';

// ============================================================================
// THEORETICAL DRIVERS - Perfect numbers for hand calculation
// ============================================================================

// Driver A: "Perfect" driver with simple math
const PERFECT_DRIVER = {
    name: 'Perfect (textbook example)',
    fs: 50,         // Round frequency (realistic)
    qts: 0.5,       // Simple fraction
    qes: 0.55,      // Slightly lower than Qts
    vas: 0.100      // 100 liters (realistic midwoofer)
};

// Driver B: Already at Butterworth Q
const BUTTERWORTH_DRIVER = {
    name: 'Butterworth Driver',
    fs: 50,
    qts: 0.707,     // Already Butterworth
    qes: 0.75,
    vas: 0.100      // 100 liters
};

// Driver C: Low Q (ported box candidate)
const PORTED_DRIVER = {
    name: 'Ported Driver',
    fs: 25,
    qts: 0.35,      // Low Q, good for ported
    qes: 0.40,
    vas: 0.200      // 200 liters
};

// Driver D: Real-world reference (Dayton Audio UM18-22 V2)
const REAL_DRIVER = {
    name: 'Dayton Audio UM18-22 V2',
    fs: 22.0,
    qts: 0.530,
    qes: 0.56,
    vas: 0.2482     // 248.2 liters
};

// Driver E: Midwoofer (6-8" typical)
const MIDWOOFER_DRIVER = {
    name: 'Midwoofer 6.5"',
    fs: 45,         // Typical 6.5" midwoofer
    qts: 0.6,       // Moderate Q
    qes: 0.65,
    vas: 0.020      // 20 liters (typical 6.5")
};

// Driver F: Midbass (10-12" typical)
const MIDBASS_DRIVER = {
    name: 'Midbass 10"',
    fs: 35,         // Typical 10" midbass
    qts: 0.45,      // Lower Q (good sealed/ported)
    qes: 0.50,
    vas: 0.070      // 70 liters (typical 10")
};

// ============================================================================
// TEST SUITE
// ============================================================================

export function runFoundationTests(TestFramework) {
    const { describe, test, expect } = TestFramework;

    describe('Physical Constants', () => {
        test('Speed of sound at 20°C is 343 m/s', () => {
            expect(Foundation.SPEED_OF_SOUND).toBe(343);
        });

        test('Air density at 20°C is 1.204 kg/m³', () => {
            expect(Foundation.AIR_DENSITY).toBe(1.204);
        });

        test('Reference pressure is 20 μPa', () => {
            expect(Foundation.REFERENCE_PRESSURE).toBe(2e-5);
        });
    });

    describe('Small 1972 - Mathematical Properties', () => {

        describe('Known Exact Ratios', () => {
            test('When Vb = Vas (α = 1), Fc = Fs × √2', () => {
                // Alpha = 1 is special case with known exact ratio
                const fc = Small1972.calculateFc(PERFECT_DRIVER.fs, 1);
                const expected = PERFECT_DRIVER.fs * Math.sqrt(2);  // 50 × √2 = 70.71
                expect(fc).toBeCloseTo(expected, 4);
            });

            test('When Vb = Vas (α = 1), Qtc = Qts × √2', () => {
                const qtc = Small1972.calculateQtc(PERFECT_DRIVER.qts, 1);
                const expected = PERFECT_DRIVER.qts * Math.sqrt(2);
                expect(qtc).toBeCloseTo(expected, 4);
            });

            test('When Vb = Vas and Qts = 0.5, result is Butterworth', () => {
                // Beautiful coincidence: 0.5 × √2 = 0.707
                const qtc = Small1972.calculateQtc(0.5, 1);
                expect(qtc).toBeCloseTo(0.707, 3);
            });
        });

        describe('Limit Cases (Boundary Behavior)', () => {
            test('Infinite box → Fc approaches Fs (free air)', () => {
                const hugeBox = 1000;  // 1000 m³ vs 1 m³ Vas
                const alpha = PERFECT_DRIVER.vas / hugeBox;  // ≈ 0.001
                const fc = Small1972.calculateFc(PERFECT_DRIVER.fs, alpha);

                // Should be very close to free air resonance
                expect(fc).toBeCloseTo(PERFECT_DRIVER.fs, 0);
            });

            test('Infinite box → Qtc approaches Qts (free air)', () => {
                const hugeBox = 1000;
                const alpha = PERFECT_DRIVER.vas / hugeBox;
                const qtc = Small1972.calculateQtc(PERFECT_DRIVER.qts, alpha);

                expect(qtc).toBeCloseTo(PERFECT_DRIVER.qts, 2);
            });

            test('Tiny box → very high Qtc (overdamped)', () => {
                const tinyBox = 0.01;  // 10 liters vs 100 liters Vas
                const alpha = PERFECT_DRIVER.vas / tinyBox;  // = 10
                const qtc = Small1972.calculateQtc(PERFECT_DRIVER.qts, alpha);

                // Physics: stiff box = higher Q
                // With alpha=10: Qtc = 0.5 × √11 ≈ 1.66
                expect(qtc).toBeGreaterThan(1.5);
            });

            test('Tiny box → much higher Fc', () => {
                const tinyBox = 0.01;
                const alpha = PERFECT_DRIVER.vas / tinyBox;  // = 10
                const fc = Small1972.calculateFc(PERFECT_DRIVER.fs, alpha);

                // Fc = Fs × √(1 + 10) = 50 × √11 ≈ 165 Hz
                expect(fc).toBeGreaterThan(PERFECT_DRIVER.fs * 3);
            });
        });

        describe('Self-Consistency (Forward/Inverse)', () => {
            test('Alpha calculation inverts correctly', () => {
                const vas = 0.100;
                const vb = 0.200;
                const alpha = Small1972.calculateAlpha(vas, vb);

                // Should give exactly vas/vb
                expect(alpha).toBe(vas / vb);
            });

            test('Fc and Qtc increase proportionally with alpha', () => {
                // Mathematical property: both scale with √(1+α)
                const alpha1 = 0.5;
                const alpha2 = 1.0;

                const fc1 = Small1972.calculateFc(100, alpha1);
                const fc2 = Small1972.calculateFc(100, alpha2);

                const qtc1 = Small1972.calculateQtc(0.5, alpha1);
                const qtc2 = Small1972.calculateQtc(0.5, alpha2);

                // Ratio should be same for both
                const fcRatio = fc2 / fc1;
                const qtcRatio = qtc2 / qtc1;

                expect(qtcRatio).toBeCloseTo(fcRatio, 4);
            });
        });

        describe('Transfer Function Properties', () => {
            test('Response at DC (f=0) is exactly zero', () => {
                // Highpass filter kills DC
                const magnitude = Small1972.calculateResponseMagnitude(0, 100, 0.707);
                expect(magnitude).toBe(0);
            });

            test('Response at f >> Fc approaches 1 (flat passband)', () => {
                const fc = 50;
                const magnitude = Small1972.calculateResponseMagnitude(5000, fc, 0.707);

                // Should be very close to 1.0
                expect(magnitude).toBeCloseTo(1.0, 3);
            });

            test('Butterworth: Response at Fc is exactly -3dB', () => {
                // Mathematical property of Butterworth (Qtc = 0.707)
                const fc = 100;
                const qtc = 0.707;

                const magnitude = Small1972.calculateResponseMagnitude(fc, fc, qtc);
                const db = Small1972.calculateResponseDb(fc, fc, qtc);

                // Magnitude should be 1/√2 (with floating point tolerance)
                expect(magnitude).toBeCloseTo(1 / Math.sqrt(2), 3);

                // dB should be approximately -3dB (20×log10(1/√2))
                expect(db).toBeCloseTo(-3.0103, 1);
            });

            test('2nd-order highpass has 12dB/octave slope', () => {
                // Physics: 2nd order = 12dB per octave below Fc
                const fc = 100;

                const db50 = Small1972.calculateResponseDb(50, fc, 0.707);  // 1 octave below
                const db25 = Small1972.calculateResponseDb(25, fc, 0.707);  // 2 octaves below

                const slope = db50 - db25;  // Change over 1 octave (positive = rising)

                // Slope should be approximately +12dB (11.79 is close enough)
                expect(Math.abs(slope - 12)).toBeLessThan(1.0);
            });

            test('Response monotonically decreases below Fc', () => {
                const fc = 100;

                // Sample points below resonance
                for (let f = 10; f < fc; f += 10) {
                    const db1 = Small1972.calculateResponseDb(f, fc, 0.707);
                    const db2 = Small1972.calculateResponseDb(f + 5, fc, 0.707);

                    // Higher frequency = higher response
                    expect(db2).toBeGreaterThan(db1);
                }
            });
        });

        describe('F3 Calculation Properties', () => {
            test('For Butterworth, F3 = Fc exactly', () => {
                // Mathematical property: Butterworth -3dB point is at Fc
                const fc = 75;
                const f3 = Small1972.calculateF3(fc, 0.707);

                expect(f3).toBeCloseTo(fc, 1);
            });

            test('For Bessel, F3 > Fc (underdamped)', () => {
                const fc = 75;
                const f3 = Small1972.calculateF3(fc, 0.577);

                // Bessel (Qtc < 0.707) has F3 higher than Fc
                expect(f3).toBeGreaterThan(fc);
            });

            test('For Chebyshev, F3 < Fc (steeper rolloff)', () => {
                const fc = 75;
                const f3 = Small1972.calculateF3(fc, 1.0);

                // Higher Q = peak at Fc, so F3 is lower
                expect(f3).toBeLessThan(fc);
            });

            test('F3 is always positive', () => {
                // Physical constraint: frequency can't be negative
                for (let qtc = 0.5; qtc < 2.0; qtc += 0.1) {
                    const f3 = Small1972.calculateF3(100, qtc);
                    expect(f3).toBeGreaterThan(0);
                }
            });
        });

        describe('Reference Efficiency (η₀)', () => {
            test('Efficiency is always between 0 and 1', () => {
                // Physical constraint: can't convert >100% power
                const testCases = [
                    PERFECT_DRIVER,
                    BUTTERWORTH_DRIVER,
                    PORTED_DRIVER,
                    REAL_DRIVER,
                    MIDWOOFER_DRIVER,
                    MIDBASS_DRIVER
                ];

                for (const driver of testCases) {
                    const eta0 = Small1972.calculateEta0(driver.fs, driver.vas, driver.qes);

                    expect(eta0).toBeGreaterThan(0);
                    expect(eta0).toBeLessThan(1);  // Can't exceed 100%
                }
            });

            test('Lower Qes → higher efficiency', () => {
                // Physics: lower electrical losses = higher efficiency
                const eta1 = Small1972.calculateEta0(50, 0.1, 0.8);
                const eta2 = Small1972.calculateEta0(50, 0.1, 0.4);  // Lower Qes

                expect(eta2).toBeGreaterThan(eta1);
            });

            test('Larger Vas → higher efficiency', () => {
                // Physics: larger cone displacement volume = more output
                const eta1 = Small1972.calculateEta0(50, 0.1, 0.5);
                const eta2 = Small1972.calculateEta0(50, 0.2, 0.5);  // Larger Vas

                expect(eta2).toBeGreaterThan(eta1);
            });

            test('Higher Fs → higher efficiency', () => {
                // Physics: higher frequency = more cycles per second
                const eta1 = Small1972.calculateEta0(20, 0.1, 0.5);
                const eta2 = Small1972.calculateEta0(40, 0.1, 0.5);  // Higher Fs

                expect(eta2).toBeGreaterThan(eta1);
            });

            test('SPL increases monotonically with efficiency', () => {
                // More efficiency = more sound
                for (let eta = 0.001; eta < 0.05; eta += 0.005) {
                    const spl1 = Small1972.calculateSpl0(eta);
                    const spl2 = Small1972.calculateSpl0(eta + 0.001);

                    expect(spl2).toBeGreaterThan(spl1);
                }
            });

            test('SPL is within realistic range (70-100 dB)', () => {
                // Real drivers typically 85-95 dB
                const testCases = [BUTTERWORTH_DRIVER, PORTED_DRIVER, REAL_DRIVER];

                for (const driver of testCases) {
                    const eta0 = Small1972.calculateEta0(driver.fs, driver.vas, driver.qes);
                    const spl0 = Small1972.calculateSpl0(eta0);

                    expect(spl0).toBeGreaterThan(70);   // Sanity check
                    expect(spl0).toBeLessThan(100);     // Realistic
                }
            });
        });
    });

    describe('Thiele 1971 - Alignment Theory', () => {

        describe('Published Reference Values', () => {
            test('Butterworth constant is exactly 0.707 (Table II)', () => {
                expect(Thiele1971.BUTTERWORTH_QTC).toBe(0.707);
            });

            test('Bessel constant is exactly 0.577 (Table II)', () => {
                expect(Thiele1971.BESSEL_QTC).toBe(0.577);
            });

            test('Chebyshev constant is exactly 1.0 (Table II)', () => {
                expect(Thiele1971.CHEBYCHEV_QTC).toBe(1.0);
            });
        });

        describe('Volume Calculation Self-Consistency', () => {
            test('calculateVolumeForQtc inverts perfectly for ANY driver', () => {
                // For ANY driver, calculating volume for target Qtc,
                // then calculating Qtc from that volume MUST give target back
                const testDrivers = [
                    PERFECT_DRIVER,
                    BUTTERWORTH_DRIVER,
                    PORTED_DRIVER,
                    REAL_DRIVER
                ];

                const targetQtcs = [0.577, 0.707, 0.85, 1.0];

                for (const driver of testDrivers) {
                    for (const targetQtc of targetQtcs) {
                        if (targetQtc <= driver.qts) continue;  // Skip impossible cases

                        const vb = Thiele1971.calculateVolumeForQtc(driver.qts, driver.vas, targetQtc);
                        const alpha = Small1972.calculateAlpha(driver.vas, vb);
                        const actualQtc = Small1972.calculateQtc(driver.qts, alpha);

                        expect(actualQtc).toBeCloseTo(targetQtc, 4);
                    }
                }
            });

            test('Throws error if targetQtc ≤ driver Qts (impossible)', () => {
                // Physics: sealed box ALWAYS increases Q
                expect(() => {
                    Thiele1971.calculateVolumeForQtc(0.5, 0.1, 0.4);
                }).toThrow();

                expect(() => {
                    Thiele1971.calculateVolumeForQtc(0.5, 0.1, 0.5);
                }).toThrow();
            });

            test('Lower target Qtc → larger box volume', () => {
                // Physics: lower Q needs bigger box
                const vbButterworth = Thiele1971.calculateButterworthVolume(0.5, 0.1);
                const vbBessel = Thiele1971.calculateBesselVolume(0.5, 0.1);
                const vbChebyshev = Thiele1971.calculateChebychevVolume(0.5, 0.1);

                // Bessel (0.577) < Butterworth (0.707) < Chebyshev (1.0)
                // So: Vb_Bessel > Vb_Butterworth > Vb_Chebyshev
                expect(vbBessel).toBeGreaterThan(vbButterworth);
                expect(vbButterworth).toBeGreaterThan(vbChebyshev);
            });
        });

        describe('Multiple Drivers Same Alignment', () => {
            test('Butterworth works for wide range of Qts values', () => {
                // Alignment should work for ANY valid driver
                const qtsValues = [0.3, 0.4, 0.5, 0.6, 0.7];

                for (const qts of qtsValues) {
                    const vb = Thiele1971.calculateButterworthVolume(qts, 0.1);
                    const alpha = Small1972.calculateAlpha(0.1, vb);
                    const qtc = Small1972.calculateQtc(qts, alpha);

                    expect(qtc).toBeCloseTo(0.707, 3);
                }
            });
        });

        describe('QB3 Ported Alignment', () => {
            test('QB3 tuning equals driver Fs (Table II)', () => {
                const fb = Thiele1971.QB3_ALIGNMENT.calculateTuning(25);
                expect(fb).toBe(25);

                const fb2 = Thiele1971.QB3_ALIGNMENT.calculateTuning(REAL_DRIVER.fs);
                expect(fb2).toBe(REAL_DRIVER.fs);
            });

            test('QB3 volume is larger than sealed Butterworth', () => {
                // Ported needs bigger box than sealed
                const vbQB3 = Thiele1971.QB3_ALIGNMENT.calculateVolume(
                    PORTED_DRIVER.qts,
                    PORTED_DRIVER.vas
                );
                const vbSealed = Thiele1971.calculateButterworthVolume(
                    PORTED_DRIVER.qts,
                    PORTED_DRIVER.vas
                );

                expect(vbQB3).toBeGreaterThan(vbSealed);
            });

            test('QB3 volume scales with Qts^3.3', () => {
                // Formula: Vb = 15 × Qts^3.3 × Vas
                const vas = 0.1;
                const qts1 = 0.3;
                const qts2 = 0.4;

                const vb1 = Thiele1971.QB3_ALIGNMENT.calculateVolume(qts1, vas);
                const vb2 = Thiele1971.QB3_ALIGNMENT.calculateVolume(qts2, vas);

                const expectedRatio = Math.pow(qts2 / qts1, 3.3);
                const actualRatio = vb2 / vb1;

                expect(actualRatio).toBeCloseTo(expectedRatio, 3);
            });
        });
    });

    describe('Small 1973 - Ported Box', () => {

        describe('Port Geometry', () => {
            test('Port area from diameter is π×r²', () => {
                const diameter = 0.10;  // 10 cm
                const area = Small1973.calculatePortArea(diameter);
                const expected = Math.PI * Math.pow(diameter / 2, 2);

                expect(area).toBeCloseTo(expected, 8);
            });

            test('Equivalent diameter preserves area', () => {
                const width = 0.08;
                const height = 0.06;
                const rectArea = width * height;

                const diameter = Small1973.calculateEquivalentDiameter(width, height);
                const circleArea = Math.PI * Math.pow(diameter / 2, 2);

                expect(circleArea).toBeCloseTo(rectArea, 8);
            });
        });

        describe('Port Length Properties', () => {
            test('Port length is positive for realistic parameters', () => {
                const vb = 0.330;
                const fb = 25;
                const diameter = 0.10;
                const area = Small1973.calculatePortArea(diameter);

                const length = Small1973.calculatePortLength(vb, fb, area, diameter);

                expect(length).toBeGreaterThan(0);
            });

            test('Higher tuning frequency → shorter port', () => {
                // Physics: inverse relationship with f²
                const vb = 0.330;
                const diameter = 0.10;
                const area = Small1973.calculatePortArea(diameter);

                const length20 = Small1973.calculatePortLength(vb, 20, area, diameter);
                const length30 = Small1973.calculatePortLength(vb, 30, area, diameter);
                const length40 = Small1973.calculatePortLength(vb, 40, area, diameter);

                expect(length30).toBeLessThan(length20);
                expect(length40).toBeLessThan(length30);
            });

            test('Larger port area → longer port', () => {
                // Physics: direct relationship (Helmholtz: L ∝ S/V)
                const vb = 0.330;
                const fb = 25;

                const length1 = Small1973.calculatePortLength(vb, fb, 0.01, 0.10);
                const length2 = Small1973.calculatePortLength(vb, fb, 0.02, 0.10);

                expect(length2).toBeGreaterThan(length1);
            });

            test('Larger box → shorter port', () => {
                // Physics: inverse relationship (Helmholtz: L ∝ S/V, so L ∝ 1/V)
                const fb = 25;
                const diameter = 0.10;
                const area = Small1973.calculatePortArea(diameter);

                const length1 = Small1973.calculatePortLength(0.200, fb, area, diameter);
                const length2 = Small1973.calculatePortLength(0.400, fb, area, diameter);

                expect(length2).toBeLessThan(length1);
            });
        });

        describe('Port Velocity', () => {
            test('Port velocity = volume velocity / area', () => {
                const volumeVelocity = 0.01;  // m³/s
                const portArea = 0.005;        // m²

                const velocity = Small1973.calculatePortVelocity(volumeVelocity, portArea);

                expect(velocity).toBe(volumeVelocity / portArea);
            });

            test('Port velocity increases with volume velocity', () => {
                const portArea = 0.005;
                const v1 = Small1973.calculatePortVelocity(0.01, portArea);
                const v2 = Small1973.calculatePortVelocity(0.02, portArea);

                expect(v2).toBeGreaterThan(v1);
            });

            test('Port velocity decreases with larger port area', () => {
                const volumeVelocity = 0.01;
                const v1 = Small1973.calculatePortVelocity(volumeVelocity, 0.005);
                const v2 = Small1973.calculatePortVelocity(volumeVelocity, 0.010);

                expect(v2).toBeLessThan(v1);
            });

            test('Max port velocity limits are reasonable', () => {
                const conservative = Small1973.getMaxPortVelocity(true);
                const aggressive = Small1973.getMaxPortVelocity(false);

                expect(conservative).toBe(15);
                expect(aggressive).toBe(20);
                expect(aggressive).toBeGreaterThan(conservative);

                // Both should be well below speed of sound
                expect(conservative).toBeLessThan(Foundation.SPEED_OF_SOUND);
                expect(aggressive).toBeLessThan(Foundation.SPEED_OF_SOUND);
            });
        });
    });

    describe('Integration Tests - Complete Designs', () => {

        test('Perfect Driver: Sealed Butterworth design', () => {
            // Complete design flow with hand-calculable numbers
            const vb = Thiele1971.calculateButterworthVolume(
                PERFECT_DRIVER.qts,
                PERFECT_DRIVER.vas
            );
            const alpha = Small1972.calculateAlpha(PERFECT_DRIVER.vas, vb);
            const fc = Small1972.calculateFc(PERFECT_DRIVER.fs, alpha);
            const qtc = Small1972.calculateQtc(PERFECT_DRIVER.qts, alpha);
            const f3 = Small1972.calculateF3(fc, qtc);

            // Verify all results are sensible
            expect(vb).toBeGreaterThan(0);
            expect(qtc).toBeCloseTo(0.707, 2);
            expect(f3).toBeCloseTo(fc, 0);
            expect(fc).toBeGreaterThan(PERFECT_DRIVER.fs);
        });

        test('Real Driver: Sealed Butterworth matches published data', () => {
            // Dayton Audio UM18-22 V2 Butterworth alignment
            const vb = Thiele1971.calculateButterworthVolume(REAL_DRIVER.qts, REAL_DRIVER.vas);
            const alpha = Small1972.calculateAlpha(REAL_DRIVER.vas, vb);
            const qtc = Small1972.calculateQtc(REAL_DRIVER.qts, alpha);

            expect(vb).toBeCloseTo(0.318, 2);   // ≈ 318 liters (calculated correctly)
            expect(qtc).toBeCloseTo(0.707, 2);  // Butterworth
        });

        test('Ported Driver: Complete QB3 design', () => {
            const vb = Thiele1971.QB3_ALIGNMENT.calculateVolume(
                PORTED_DRIVER.qts,
                PORTED_DRIVER.vas
            );
            const fb = Thiele1971.QB3_ALIGNMENT.calculateTuning(PORTED_DRIVER.fs);
            const portDiameter = 0.10;
            const portArea = Small1973.calculatePortArea(portDiameter);
            const portLength = Small1973.calculatePortLength(vb, fb, portArea, portDiameter);

            // Verify all positive and reasonable
            expect(vb).toBeGreaterThan(0);
            expect(fb).toBe(PORTED_DRIVER.fs);
            expect(portLength).toBeGreaterThan(0.05);   // > 5 cm
            expect(portLength).toBeLessThan(2.0);       // < 2 m
        });

        test('Multiple drivers all achieve Butterworth', () => {
            // Prove formula works for ANY driver (except those already at Butterworth)
            const drivers = [PERFECT_DRIVER, PORTED_DRIVER, REAL_DRIVER, MIDWOOFER_DRIVER, MIDBASS_DRIVER];

            for (const driver of drivers) {
                const vb = Thiele1971.calculateButterworthVolume(driver.qts, driver.vas);
                const alpha = Small1972.calculateAlpha(driver.vas, vb);
                const qtc = Small1972.calculateQtc(driver.qts, alpha);

                expect(qtc).toBeCloseTo(0.707, 2);
            }
        });

        test('Midwoofer complete Butterworth design', () => {
            // 6.5" midwoofer - higher Fs, smaller Vas
            const driver = MIDWOOFER_DRIVER;

            const vb = Thiele1971.calculateButterworthVolume(driver.qts, driver.vas);
            const alpha = Small1972.calculateAlpha(driver.vas, vb);
            const fc = Small1972.calculateFc(driver.fs, alpha);
            const qtc = Small1972.calculateQtc(driver.qts, alpha);
            const f3 = Small1972.calculateF3(fc, qtc);

            // Verify all parameters sensible
            expect(vb).toBeGreaterThan(0);
            // Note: For Qts=0.6, Butterworth requires Vb > Vas (box raises Q from 0.6 to 0.707)
            expect(qtc).toBeCloseTo(0.707, 2);        // Butterworth
            expect(fc).toBeGreaterThan(driver.fs);    // System resonance > Fs
            expect(f3).toBeCloseTo(fc, 1);            // F3 ≈ Fc for Butterworth
        });

        test('Midbass complete Butterworth design', () => {
            // 10" midbass - mid-range Fs, moderate Vas
            const driver = MIDBASS_DRIVER;

            const vb = Thiele1971.calculateButterworthVolume(driver.qts, driver.vas);
            const alpha = Small1972.calculateAlpha(driver.vas, vb);
            const fc = Small1972.calculateFc(driver.fs, alpha);
            const qtc = Small1972.calculateQtc(driver.qts, alpha);
            const f3 = Small1972.calculateF3(fc, qtc);

            // Verify all parameters sensible
            expect(vb).toBeGreaterThan(0);
            expect(vb).toBeLessThan(driver.vas);      // Smaller box than Vas
            expect(qtc).toBeCloseTo(0.707, 2);        // Butterworth
            expect(fc).toBeGreaterThan(driver.fs);    // System resonance > Fs
            expect(f3).toBeCloseTo(fc, 1);            // F3 ≈ Fc for Butterworth
        });
    });

    describe('Blackbox Regression Tests - Known Good Results', () => {
        // These are high-level end-to-end tests that:
        // 1. Exercise multiple functions in realistic workflows
        // 2. Don't depend on implementation details (blackbox)
        // 3. Stay valid through refactoring
        // 4. Catch regressions across multiple layers
        // 5. Provide high code coverage per test

        test('Dayton Audio UM18-22 V2 complete Butterworth design (all parameters)', () => {
            // Complete sealed box design - exercises entire calculation chain
            // Input: real driver from datasheet
            const driver = REAL_DRIVER;

            // Design flow (uses 6 foundation functions)
            const vb = Thiele1971.calculateButterworthVolume(driver.qts, driver.vas);
            const alpha = Small1972.calculateAlpha(driver.vas, vb);
            const fc = Small1972.calculateFc(driver.fs, alpha);
            const qtc = Small1972.calculateQtc(driver.qts, alpha);
            const f3 = Small1972.calculateF3(fc, qtc);
            const eta0 = Small1972.calculateEta0(driver.fs, driver.vas, driver.qes);
            const spl0 = Small1972.calculateSpl0(eta0);

            // Expected: known-good results (verified against theory)
            expect(vb).toBeCloseTo(0.318, 2);      // 318 liters
            expect(alpha).toBeCloseTo(0.780, 2);   // Compliance ratio
            expect(fc).toBeCloseTo(29.3, 0);       // System resonance (29.35 Hz)
            expect(qtc).toBeCloseTo(0.707, 2);     // Butterworth Q
            expect(f3).toBeCloseTo(29.3, 0);       // -3dB point (≈ Fc for Butterworth)
            expect(eta0).toBeGreaterThan(0.003);   // Efficiency ~0.4%
            expect(spl0).toBeCloseTo(88.6, 1);     // Sensitivity (calculated: 88.64 dB)

            // If ANY of these break, we know something changed in the chain
        });

        test('Dayton Audio UM18-22 V2 complete Bessel design (all parameters)', () => {
            // Same driver, different alignment - tests alignment flexibility
            const driver = REAL_DRIVER;

            const vb = Thiele1971.calculateBesselVolume(driver.qts, driver.vas);
            const alpha = Small1972.calculateAlpha(driver.vas, vb);
            const fc = Small1972.calculateFc(driver.fs, alpha);
            const qtc = Small1972.calculateQtc(driver.qts, alpha);
            const f3 = Small1972.calculateF3(fc, qtc);

            // Bessel needs bigger box than Butterworth
            expect(vb).toBeGreaterThan(0.318);     // Bigger than Butterworth (318L)
            expect(qtc).toBeCloseTo(0.577, 2);     // Bessel Q
            expect(f3).toBeGreaterThan(fc);        // F3 > Fc for Bessel (Qtc < 0.707)
        });

        test('Dayton Audio UM18-22 V2 complete QB3 ported design (all parameters)', () => {
            // Complete ported box design - exercises ported calculations
            const driver = REAL_DRIVER;

            // Calculate QB3 alignment
            const vb = Thiele1971.QB3_ALIGNMENT.calculateVolume(driver.qts, driver.vas);
            const fb = Thiele1971.QB3_ALIGNMENT.calculateTuning(driver.fs);

            // Design 10cm diameter port
            const portDiameter = 0.10;  // 10 cm
            const portArea = Small1973.calculatePortArea(portDiameter);
            const portLength = Small1973.calculatePortLength(vb, fb, portArea, portDiameter);

            // Expected results (QB3 with Qts=0.53 gives ~458L, very short port ~3cm)
            expect(vb).toBeGreaterThan(0.400);         // QB3 needs big box (~458L)
            expect(fb).toBe(22.0);                      // Tuned to Fs
            expect(portArea).toBeCloseTo(0.00785, 5);   // π × 0.05²
            expect(portLength).toBeGreaterThan(0.01);   // Port length is positive (~3.2cm)
            expect(portLength).toBeLessThan(0.10);      // Short port due to large box + low tuning
        });

        test('Perfect Driver: Vb=Vas special case (complete flow)', () => {
            // Special mathematical case: when box = Vas, alpha = 1
            // This exercises all functions with known exact ratios
            const driver = PERFECT_DRIVER;
            const vb = driver.vas;  // Vb = Vas = 0.1 m³

            const alpha = Small1972.calculateAlpha(driver.vas, vb);
            const fc = Small1972.calculateFc(driver.fs, alpha);
            const qtc = Small1972.calculateQtc(driver.qts, alpha);
            const f3 = Small1972.calculateF3(fc, qtc);

            // Known exact mathematical results
            expect(alpha).toBe(1);                              // Vb = Vas
            expect(fc).toBeCloseTo(70.71, 2);                  // 50 × √2
            expect(qtc).toBeCloseTo(0.707, 3);                 // 0.5 × √2 = Butterworth!
            expect(f3).toBeCloseTo(fc, 1);                     // F3 ≈ Fc for Butterworth

            // Beautiful coincidence: Qts=0.5, Vb=Vas → Butterworth
        });

        test('Response sweep at key frequencies (Butterworth)', () => {
            // Test complete frequency response calculation
            const fc = 50;
            const qtc = 0.707;  // Butterworth

            // Test at specific frequencies
            const responses = {
                dc: Small1972.calculateResponseDb(0, fc, qtc),
                f_half: Small1972.calculateResponseDb(fc / 2, fc, qtc),
                f_res: Small1972.calculateResponseDb(fc, fc, qtc),
                f_double: Small1972.calculateResponseDb(fc * 2, fc, qtc),
                f_high: Small1972.calculateResponseDb(fc * 100, fc, qtc)
            };

            // Expected response characteristics
            expect(responses.dc).toBe(-Infinity);              // DC killed
            expect(responses.f_half).toBeLessThan(-10);        // Well below Fc
            expect(responses.f_res).toBeCloseTo(-3.0, 1);      // -3dB at Fc (Butterworth)
            expect(responses.f_double).toBeGreaterThan(-1.0);  // Approaching passband
            expect(responses.f_high).toBeCloseTo(0, 0.5);      // Flat passband
        });

        test('Three alignments same driver (complete comparison)', () => {
            // One driver, three alignments - comprehensive test
            const driver = PORTED_DRIVER;

            // Calculate all three alignments
            const butterworth = {
                vb: Thiele1971.calculateButterworthVolume(driver.qts, driver.vas),
            };
            butterworth.alpha = Small1972.calculateAlpha(driver.vas, butterworth.vb);
            butterworth.qtc = Small1972.calculateQtc(driver.qts, butterworth.alpha);
            butterworth.fc = Small1972.calculateFc(driver.fs, butterworth.alpha);
            butterworth.f3 = Small1972.calculateF3(butterworth.fc, butterworth.qtc);

            const bessel = {
                vb: Thiele1971.calculateBesselVolume(driver.qts, driver.vas),
            };
            bessel.alpha = Small1972.calculateAlpha(driver.vas, bessel.vb);
            bessel.qtc = Small1972.calculateQtc(driver.qts, bessel.alpha);
            bessel.fc = Small1972.calculateFc(driver.fs, bessel.alpha);
            bessel.f3 = Small1972.calculateF3(bessel.fc, bessel.qtc);

            const chebyshev = {
                vb: Thiele1971.calculateChebychevVolume(driver.qts, driver.vas),
            };
            chebyshev.alpha = Small1972.calculateAlpha(driver.vas, chebyshev.vb);
            chebyshev.qtc = Small1972.calculateQtc(driver.qts, chebyshev.alpha);
            chebyshev.fc = Small1972.calculateFc(driver.fs, chebyshev.alpha);
            chebyshev.f3 = Small1972.calculateF3(chebyshev.fc, chebyshev.qtc);

            // Verify correct target Qtc achieved
            expect(butterworth.qtc).toBeCloseTo(0.707, 2);
            expect(bessel.qtc).toBeCloseTo(0.577, 2);
            expect(chebyshev.qtc).toBeCloseTo(1.0, 2);

            // Verify volume relationships
            expect(bessel.vb).toBeGreaterThan(butterworth.vb);
            expect(butterworth.vb).toBeGreaterThan(chebyshev.vb);

            // Verify all use same driver Fs
            expect(butterworth.fc).toBeGreaterThan(driver.fs);
            expect(bessel.fc).toBeGreaterThan(driver.fs);
            expect(chebyshev.fc).toBeGreaterThan(driver.fs);
        });
    });

    describe('Parameter Validation', () => {

        test('Rejects Fs below 15Hz (not pistonic)', () => {
            expect(() => {
                Small1972.validateDriverParameters(10, 0.5, 0.1);
            }).toThrow();
        });

        test('Rejects Fs above 500Hz (cone breakup)', () => {
            expect(() => {
                Small1972.validateDriverParameters(600, 0.5, 0.1);
            }).toThrow();
        });

        test('Rejects Qts below 0.2 (overdamped)', () => {
            expect(() => {
                Small1972.validateDriverParameters(50, 0.15, 0.1);
            }).toThrow();
        });

        test('Rejects Qts above 1.5 (severe underdamping)', () => {
            expect(() => {
                Small1972.validateDriverParameters(50, 1.8, 0.1);
            }).toThrow();
        });

        test('Rejects negative Vas', () => {
            expect(() => {
                Small1972.validateDriverParameters(50, 0.5, -0.1);
            }).toThrow();
        });

        test('Rejects Qes < Qts (violates definition)', () => {
            expect(() => {
                Small1972.validateDriverParameters(50, 0.5, 0.1, 0.4);
            }).toThrow();
        });

        test('Accepts valid parameters', () => {
            // Should not throw
            Small1972.validateDriverParameters(22, 0.53, 0.2482, 0.56);
            Small1972.validateDriverParameters(45, 0.6, 0.020, 0.65);
            Small1972.validateDriverParameters(35, 0.45, 0.070, 0.50);
        });

        test('Rejects negative box volume', () => {
            expect(() => {
                Small1972.validateBoxVolume(-0.1);
            }).toThrow();
        });

        test('Rejects unrealistically large box volume', () => {
            expect(() => {
                Small1972.validateBoxVolume(15);  // 15000 liters
            }).toThrow();
        });

        test('Accepts realistic box volumes', () => {
            // Should not throw
            Small1972.validateBoxVolume(0.020);   // 20L
            Small1972.validateBoxVolume(0.330);   // 330L
            Small1972.validateBoxVolume(1.0);     // 1000L
        });
    });

    describe('Edge Cases and Robustness', () => {

        test('Very small alpha (huge box)', () => {
            const alpha = 0.001;  // Vb = 1000 × Vas
            const fc = Small1972.calculateFc(100, alpha);
            const qtc = Small1972.calculateQtc(0.5, alpha);

            // Should approximate free air
            expect(fc).toBeCloseTo(100, 0);
            expect(qtc).toBeCloseTo(0.5, 1);
        });

        test('Very large alpha (tiny box)', () => {
            const alpha = 100;  // Vb = Vas / 100
            const fc = Small1972.calculateFc(50, alpha);
            const qtc = Small1972.calculateQtc(0.4, alpha);

            // Should be very high
            expect(fc).toBeGreaterThan(500);
            expect(qtc).toBeGreaterThan(4.0);
        });

        test('Extremely high Q (underdamped)', () => {
            const qtc = 5.0;
            const f3 = Small1972.calculateF3(100, qtc);

            // Should still be positive
            expect(f3).toBeGreaterThan(0);
        });

        test('Extremely low Q (overdamped)', () => {
            const qtc = 0.3;
            const f3 = Small1972.calculateF3(100, qtc);

            // Should still be positive
            expect(f3).toBeGreaterThan(0);
        });
    });
}
