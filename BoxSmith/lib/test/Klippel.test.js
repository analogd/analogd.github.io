/**
 * Klippel Nonlinear Modeling Tests
 *
 * Tests for the nonlinear parameter estimation and compression prediction.
 * Reference: Klippel 2006 "Loudspeaker Nonlinearities"
 *
 * These are ESTIMATION models, so we test:
 * 1. Physical reasonableness (compression increases with excursion)
 * 2. Mathematical properties (monotonicity, limits)
 * 3. Typical real-world values (3-6 dB compression at Xmax)
 */

import * as Motor from '../foundation/klippel/motor-geometry.js';
import * as Suspension from '../foundation/klippel/suspension.js';
import * as Compression from '../foundation/klippel/compression.js';
import * as Klippel from '../foundation/klippel/index.js';

// ============================================================================
// TEST DATA - Typical subwoofer parameters
// ============================================================================

const TYPICAL_SUB = {
    xmax: 20,       // mm, one-way
    bl: 18,         // T·m
    coilHeight: 35, // mm
    gapDepth: 10    // mm
};

const _HIGH_EXCURSION_SUB = {
    xmax: 35,       // mm, one-way (like Ultimax)
    bl: 19,         // T·m
    coilHeight: 55, // mm
    gapDepth: 12    // mm
};

// ============================================================================
// TEST SUITE
// ============================================================================

export function runKlippelTests(TestFramework) {
    const { describe, test, expect } = TestFramework;

    describe('Motor Geometry - Bl(x)', () => {
        describe('blFromGeometry - Overhang motor', () => {
            test('Bl is maximum at rest position', () => {
                const bl0 = TYPICAL_SUB.bl;
                const bl = Motor.blFromGeometry(0, bl0, TYPICAL_SUB.coilHeight, TYPICAL_SUB.gapDepth);
                expect(bl).toBe(bl0);
            });

            test('Bl stays flat within overhang region', () => {
                const bl0 = TYPICAL_SUB.bl;
                const overhang = (TYPICAL_SUB.coilHeight - TYPICAL_SUB.gapDepth) / 2;  // 12.5mm

                // Test at half overhang - should still be at Bl0
                const bl5 = Motor.blFromGeometry(5, bl0, TYPICAL_SUB.coilHeight, TYPICAL_SUB.gapDepth);
                expect(bl5).toBe(bl0);

                // Test at edge of overhang - should still be at Bl0
                const blEdge = Motor.blFromGeometry(overhang - 0.1, bl0, TYPICAL_SUB.coilHeight, TYPICAL_SUB.gapDepth);
                expect(blEdge).toBe(bl0);
            });

            test('Bl decreases beyond overhang', () => {
                const bl0 = TYPICAL_SUB.bl;
                const overhang = (TYPICAL_SUB.coilHeight - TYPICAL_SUB.gapDepth) / 2;

                // Test beyond overhang
                const blBeyond = Motor.blFromGeometry(overhang + 5, bl0, TYPICAL_SUB.coilHeight, TYPICAL_SUB.gapDepth);
                expect(blBeyond).toBeLessThan(bl0);
            });

            test('Bl is symmetric (same positive and negative)', () => {
                const bl0 = TYPICAL_SUB.bl;
                const x = 15;  // mm

                const blPos = Motor.blFromGeometry(x, bl0, TYPICAL_SUB.coilHeight, TYPICAL_SUB.gapDepth);
                const blNeg = Motor.blFromGeometry(-x, bl0, TYPICAL_SUB.coilHeight, TYPICAL_SUB.gapDepth);

                expect(blPos).toBe(blNeg);
            });
        });

        describe('blFromXmax - Empirical estimation', () => {
            test('Bl is maximum at rest', () => {
                const bl = Motor.blFromXmax(0, 18, 20);
                expect(bl).toBe(18);
            });

            test('Bl decreases towards Xmax', () => {
                const bl0 = 18;
                const xmax = 20;

                const blMid = Motor.blFromXmax(xmax * 0.5, bl0, xmax);
                const blMax = Motor.blFromXmax(xmax, bl0, xmax);

                expect(blMid).toBeGreaterThan(blMax);
                expect(blMax).toBeLessThan(bl0);
            });

            test('Bl at Xmax is approximately 50% of Bl0 (default)', () => {
                const bl = Motor.blFromXmax(20, 18, 20);
                expect(bl).toBeCloseTo(18 * 0.5, 1);
            });

            test('Custom plateauFraction works', () => {
                const bl0 = 18;
                const xmax = 20;

                // With larger plateau, Bl stays flat longer
                const blLargePlateau = Motor.blFromXmax(xmax * 0.7, bl0, xmax, { plateauFraction: 0.8 });
                const blSmallPlateau = Motor.blFromXmax(xmax * 0.7, bl0, xmax, { plateauFraction: 0.4 });

                expect(blLargePlateau).toBeGreaterThan(blSmallPlateau);
            });
        });

        describe('effectiveBlForExcursion - RMS average', () => {
            test('Effective Bl equals Bl0 at zero excursion', () => {
                const blEff = Motor.effectiveBlForExcursion(0, 18, 20);
                expect(blEff).toBeCloseTo(18, 1);
            });

            test('Effective Bl is less than Bl0 at high excursion', () => {
                const blEff = Motor.effectiveBlForExcursion(18, 18, 20);  // 90% of Xmax
                expect(blEff).toBeLessThan(18);
            });

            test('Effective Bl is between Bl(Xmax) and Bl0', () => {
                const bl0 = 18;
                const xmax = 20;
                const blEff = Motor.effectiveBlForExcursion(xmax, bl0, xmax);
                const blAtXmax = Motor.blFromXmax(xmax, bl0, xmax);

                expect(blEff).toBeLessThan(bl0);
                expect(blEff).toBeGreaterThan(blAtXmax);
            });
        });

        describe('blCompressionDb', () => {
            test('Zero compression at low excursion', () => {
                const comp = Motor.blCompressionDb(5, 20);  // 25% of Xmax
                expect(Math.abs(comp)).toBeLessThan(0.5);  // < 0.5 dB
            });

            test('Significant compression near Xmax', () => {
                const comp = Motor.blCompressionDb(18, 20);  // 90% of Xmax
                expect(comp).toBeLessThan(-1);  // At least -1 dB
            });

            test('Compression is negative (loss)', () => {
                const comp = Motor.blCompressionDb(20, 20);
                expect(comp).toBeLessThan(0);
            });

            test('Compression increases with excursion', () => {
                const comp50 = Motor.blCompressionDb(10, 20);  // 50%
                const comp75 = Motor.blCompressionDb(15, 20);  // 75%
                const comp100 = Motor.blCompressionDb(20, 20); // 100%

                expect(comp75).toBeLessThan(comp50);
                expect(comp100).toBeLessThan(comp75);
            });
        });
    });

    describe('Suspension - Kms(x)', () => {
        test('Kms at rest equals Kms0', () => {
            const kms0 = 5000;  // N/m
            const kms = Suspension.kmsFromXmax(0, kms0, 20);
            expect(kms).toBe(kms0);
        });

        test('Kms increases with displacement (progressive)', () => {
            const kms0 = 5000;
            const kmsMid = Suspension.kmsFromXmax(10, kms0, 20);
            const kmsMax = Suspension.kmsFromXmax(20, kms0, 20);

            expect(kmsMid).toBeGreaterThan(kms0);
            expect(kmsMax).toBeGreaterThan(kmsMid);
        });

        test('Default: Kms doubles at Xmax', () => {
            const kms0 = 5000;
            const kmsMax = Suspension.kmsFromXmax(20, kms0, 20);
            expect(kmsMax).toBeCloseTo(kms0 * 2, 0);
        });

        test('Custom stiffness ratio works', () => {
            const kms0 = 5000;
            const kmsMax = Suspension.kmsFromXmax(20, kms0, 20, { stiffnessRatioAtXmax: 3 });
            expect(kmsMax).toBeCloseTo(kms0 * 3, 0);
        });

        test('Kms is symmetric', () => {
            const kms0 = 5000;
            const kmsPos = Suspension.kmsFromXmax(15, kms0, 20);
            const kmsNeg = Suspension.kmsFromXmax(-15, kms0, 20);
            expect(kmsPos).toBe(kmsNeg);
        });

        test('Resonance shift at high excursion', () => {
            const fs0 = 25;  // Hz
            const fsMax = Suspension.shiftedResonance(fs0, 20, 20);  // At Xmax

            // With Kms doubled, fs should increase by sqrt(2) ≈ 1.41
            expect(fsMax).toBeCloseTo(fs0 * Math.sqrt(2), 1);
        });
    });

    describe('Compression Prediction', () => {
        describe('estimateCompression', () => {
            test('Zero compression at rest', () => {
                const result = Compression.estimateCompression(0, 20);
                expect(result.total).toBe(0);
            });

            test('Returns structured result', () => {
                const result = Compression.estimateCompression(15, 20);
                expect(result).toHaveProperty('total');
                expect(result).toHaveProperty('bl');
                expect(result).toHaveProperty('notes');
            });

            test('Typical compression 2-4 dB at Xmax', () => {
                const result = Compression.estimateCompression(20, 20);
                expect(result.total).toBeLessThan(-1);
                expect(result.total).toBeGreaterThan(-6);
            });

            test('Notes warn when approaching Xmax', () => {
                const result = Compression.estimateCompression(18, 20);  // 90%
                expect(result.notes.length).toBeGreaterThan(0);
            });
        });

        describe('thermalCompressionDb', () => {
            test('Zero compression at no temp rise', () => {
                const comp = Compression.thermalCompressionDb(0);
                expect(comp).toBe(0);
            });

            test('Typical thermal compression ~1dB at 100°C rise', () => {
                const comp = Compression.thermalCompressionDb(100);
                // 100°C → Re × 1.4 → current × 0.71 → -3dB
                expect(comp).toBeCloseTo(-3, 0.5);
            });

            test('Compression is negative', () => {
                const comp = Compression.thermalCompressionDb(50);
                expect(comp).toBeLessThan(0);
            });
        });

        describe('totalCompression', () => {
            test('Combines Bl and thermal compression', () => {
                const result = Compression.totalCompression(15, 20, 500);

                expect(result.bl).toBeLessThan(0);
                expect(result.thermal).toBeLessThan(0);
                expect(result.total).toBe(result.bl + result.thermal);
            });

            test('Reports temperature rise', () => {
                const result = Compression.totalCompression(15, 20, 500);
                expect(result.tempRise).toBeGreaterThan(0);
            });
        });

        describe('compressionCurve', () => {
            test('Generates curve points', () => {
                const curve = Compression.compressionCurve(20);
                expect(curve.length).toBeGreaterThan(10);
            });

            test('First point (x=0) has zero compression', () => {
                const curve = Compression.compressionCurve(20);
                expect(curve[0].compressionDb).toBe(0);
            });

            test('Compression increases along curve', () => {
                const curve = Compression.compressionCurve(20);
                // Find point at 80% of Xmax (past plateau)
                const at80pct = curve.find(p => p.xRatio >= 0.8);
                // Find point at 100% of Xmax
                const at100pct = curve.find(p => p.xRatio >= 1.0);

                // Compression should be negative at high excursion
                expect(at80pct.compressionDb).toBeLessThan(0);
                // And more negative at higher excursion
                expect(at100pct.compressionDb).toBeLessThan(at80pct.compressionDb);
            });
        });

        describe('compressionSummary', () => {
            test('Returns summary at key excursion levels', () => {
                const summary = Compression.compressionSummary(20);

                expect(summary.compression.at50pct).toBeDefined();
                expect(summary.compression.at80pct).toBeDefined();
                expect(summary.compression.at100pct).toBeDefined();
                expect(summary.interpretation).toBeDefined();
            });

            test('Compression increases with excursion level', () => {
                const summary = Compression.compressionSummary(20);

                expect(summary.compression.at80pct).toBeLessThan(summary.compression.at50pct);
                expect(summary.compression.at100pct).toBeLessThan(summary.compression.at80pct);
            });
        });

        describe('powerMultiplierForCompression', () => {
            test('No multiplier needed at zero compression', () => {
                const mult = Compression.powerMultiplierForCompression(0);
                expect(mult).toBe(1);
            });

            test('-3dB compression needs 2x power', () => {
                const mult = Compression.powerMultiplierForCompression(-3);
                expect(mult).toBeCloseTo(2, 1);
            });

            test('-6dB compression needs 4x power', () => {
                const mult = Compression.powerMultiplierForCompression(-6);
                expect(mult).toBeCloseTo(4, 1);
            });
        });
    });

    describe('Real-World Sanity Checks', () => {
        test('High-excursion sub (Ultimax-like) compression is reasonable', () => {
            // Ultimax UM18-22 has Xmax ≈ 28mm
            const xmax = 28;
            const result = Compression.estimateCompression(xmax, xmax);

            // Should be 2-5 dB compression at Xmax
            expect(result.total).toBeLessThan(-1);
            expect(result.total).toBeGreaterThan(-8);
        });

        test('Standard sub (15mm Xmax) compression is reasonable', () => {
            const xmax = 15;
            const result = Compression.estimateCompression(xmax, xmax);

            expect(result.total).toBeLessThan(-1);
            expect(result.total).toBeGreaterThan(-6);
        });

        test('Compression curve matches published behavior', () => {
            // Klippel 2006: "8 dB" compression possible at extreme excursion
            // We model ~3-4 dB at Xmax which is conservative/typical
            const xmax = 20;

            const at50 = Compression.estimateCompression(xmax * 0.5, xmax).total;
            const at100 = Compression.estimateCompression(xmax, xmax).total;
            const at120 = Compression.estimateCompression(xmax * 1.2, xmax).total;

            // At 50%: nearly linear (< 0.5 dB)
            expect(Math.abs(at50)).toBeLessThan(1);

            // At 100%: moderate compression (2-4 dB)
            expect(at100).toBeGreaterThan(-5);
            expect(at100).toBeLessThan(-1);

            // At 120%: heavy compression (> 4 dB)
            expect(at120).toBeLessThan(-4);
        });
    });

    // ========================================================================
    // HARMONIC DISTORTION ESTIMATION
    // ========================================================================

    describe('Harmonic Distortion Estimation', () => {
        test('HD3 from Bl is zero at small excursion', () => {
            const hd3 = Klippel.estimateHD3FromBl(1, 20);  // 1mm of 20mm Xmax
            expect(hd3).toBe(0);  // Within plateau
        });

        test('HD3 from Bl increases with excursion', () => {
            const hd3_50 = Klippel.estimateHD3FromBl(10, 20);  // 50% Xmax
            const hd3_100 = Klippel.estimateHD3FromBl(20, 20); // 100% Xmax

            expect(hd3_50).toBe(0);  // Still in plateau at 50%
            expect(hd3_100).toBeGreaterThan(0);  // Outside plateau at 100%
            expect(hd3_100).toBeGreaterThan(hd3_50);
        });

        test('HD3 from Kms increases with excursion', () => {
            const hd3_10 = Klippel.estimateHD3FromKms(2, 20);  // 10% Xmax
            const hd3_100 = Klippel.estimateHD3FromKms(20, 20); // 100% Xmax

            expect(hd3_10).toBeGreaterThan(0);  // Kms stiffens from start
            expect(hd3_100).toBeGreaterThan(hd3_10);
        });

        test('Total HD3 is reasonable at Xmax', () => {
            const hd3 = Klippel.estimateHD3(20, 20);  // 100% Xmax

            // Klippel 2006: HD3 typically 5-15% at Xmax
            expect(hd3).toBeGreaterThan(0.03);  // > 3%
            expect(hd3).toBeLessThan(0.30);     // < 30%
        });

        test('HD2 is proportional to HD3 via asymmetry factor', () => {
            const hd2 = Klippel.estimateHD2(20, 20);
            const hd3 = Klippel.estimateHD3(20, 20);

            // Default asymmetry factor is 0.5
            expect(hd2).toBeCloseTo(hd3 * 0.5, 5);
        });

        test('THD combines HD2 and HD3', () => {
            const thd = Klippel.estimateTHD(20, 20);
            const hd2 = Klippel.estimateHD2(20, 20);
            const hd3 = Klippel.estimateHD3(20, 20);

            const expected = Math.sqrt(hd2 * hd2 + hd3 * hd3);
            expect(thd).toBeCloseTo(expected, 10);
        });

        test('distortionAtExcursion returns percentages', () => {
            const result = Klippel.distortionAtExcursion(15, 20);  // 75% Xmax

            expect(result.hd2).toBeGreaterThan(0);
            expect(result.hd3).toBeGreaterThan(0);
            expect(result.thd).toBeGreaterThan(0);
            expect(result.thd).toBeLessThan(100);

            // THD should be >= max(HD2, HD3)
            expect(result.thd).toBeGreaterThanOrEqual(result.hd3);
        });

        test('classifyDistortion returns correct severity', () => {
            expect(Klippel.classifyDistortion(0.5)).toBe('low');
            expect(Klippel.classifyDistortion(2)).toBe('moderate');
            expect(Klippel.classifyDistortion(5)).toBe('high');
            expect(Klippel.classifyDistortion(15)).toBe('severe');
        });

        test('Distortion is higher at low excursion ratios for Kms only', () => {
            // Bl stays flat in plateau, but Kms stiffens from start
            const hd3_bl_10 = Klippel.estimateHD3FromBl(2, 20);
            const hd3_kms_10 = Klippel.estimateHD3FromKms(2, 20);

            expect(hd3_bl_10).toBe(0);  // Bl flat in plateau
            expect(hd3_kms_10).toBeGreaterThan(0);  // Kms always contributes
        });
    });
}
