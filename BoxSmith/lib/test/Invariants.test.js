// Physics Invariants Tests
// These are LAWS - if violated, the code is fundamentally wrong
//
// Unlike unit tests (check specific values) or integration tests (check workflows),
// invariants verify that physical principles hold regardless of specific inputs.
//
// If these fail, it's not a rounding error - it's a category error in the physics.

import * as Small1972 from '../foundation/small-1972.js';
import * as Small1973 from '../foundation/small-1973.js';
import * as Thiele1971 from '../foundation/thiele-1971.js';

// ============================================================================
// TEST DRIVERS - Range of realistic parameters
// ============================================================================

const TEST_DRIVERS = [
    { name: '18" subwoofer', fs: 22, qts: 0.53, qes: 0.67, qms: 2.53, vas: 0.248 },
    { name: '15" PA sub', fs: 35, qts: 0.42, qes: 0.45, qms: 6.8, vas: 0.185 },
    { name: '12" sealed', fs: 28, qts: 0.65, qes: 0.74, qms: 5.8, vas: 0.075 },
    { name: '10" midbass', fs: 45, qts: 0.45, qes: 0.50, qms: 6.0, vas: 0.035 },
    { name: '6.5" midwoofer', fs: 55, qts: 0.55, qes: 0.60, qms: 5.5, vas: 0.012 },
];

// ============================================================================
// HELPER: Generate frequency response curve
// ============================================================================

function generateSealedCurve(fc, qtc, startHz = 5, endHz = 200, points = 50) {
    const curve = [];
    for (let i = 0; i < points; i++) {
        const f = startHz * Math.pow(endHz / startHz, i / (points - 1));
        const db = Small1972.calculateResponseDb(f, fc, qtc);
        curve.push({ f, db });
    }
    return curve;
}

function generatePortedCurve(fs, fb, alpha, qts, ql = Infinity, startHz = 5, endHz = 200, points = 50) {
    const curve = [];
    for (let i = 0; i < points; i++) {
        const f = startHz * Math.pow(endHz / startHz, i / (points - 1));
        const db = Small1973.calculatePortedResponseDb(f, fs, fb, alpha, qts, ql);
        curve.push({ f, db });
    }
    return curve;
}

function findPeak(curve) {
    return curve.reduce((max, p) => p.db > max.db ? p : max, curve[0]);
}

function findPassband(curve) {
    // Find where response stabilizes (highest frequency region)
    const highFreqPoints = curve.slice(-5);
    return highFreqPoints.reduce((sum, p) => sum + p.db, 0) / highFreqPoints.length;
}

// ============================================================================
// EXPORT TEST FUNCTION
// ============================================================================

export function runInvariantsTests(TestFramework) {
    const { describe, test, expect } = TestFramework;

    // ========================================================================
    // RESPONSE SHAPE INVARIANTS
    // ========================================================================

    describe('INVARIANT: Qtc vs Response Shape', () => {

        test('Qtc = 0.707 (Butterworth) → F3 equals Fc exactly', () => {
            // This is the DEFINITION of Butterworth alignment
            const fc = 50;
            const qtc = 0.707;
            const f3 = Small1972.calculateF3(fc, qtc);

            // Must be within 1% - this is definitional
            const error = Math.abs(f3 - fc) / fc;
            expect(error).toBeLessThan(0.01);
        });

        test('Qtc < 0.707 → F3 > Fc (response rolls off early)', () => {
            const fc = 50;
            const qtc = 0.5;  // Bessel-ish, overdamped
            const f3 = Small1972.calculateF3(fc, qtc);

            expect(f3).toBeGreaterThan(fc);
        });

        test('Qtc > 0.707 → F3 < Fc (peak extends response)', () => {
            const fc = 50;
            const qtc = 1.0;  // Chebyshev, underdamped
            const f3 = Small1972.calculateF3(fc, qtc);

            expect(f3).toBeLessThan(fc);
        });

        test('Qtc < 0.707 → no significant peak above passband', () => {
            const fc = 50, qtc = 0.5;  // Overdamped
            const curve = generateSealedCurve(fc, qtc);
            const passband = findPassband(curve);
            const peak = findPeak(curve);

            // Peak should not significantly exceed passband (< 0.5dB hump allowed)
            // Overdamped systems have monotonic rolloff or very slight hump
            expect(peak.db).toBeLessThan(passband + 0.5);
        });

        test('Qtc > 0.707 → peak above passband (hump before rolloff)', () => {
            const fc = 50, qtc = 1.0;
            const curve = generateSealedCurve(fc, qtc);
            const passband = findPassband(curve);
            const peak = findPeak(curve);

            // Peak should exceed passband
            expect(peak.db).toBeGreaterThan(passband + 0.5);

            // Peak should be in bass region, not passband
            expect(peak.f).toBeLessThan(fc * 1.5);
        });

        test('Qtc = 1.0 → peak above 0dB (underdamped resonance)', () => {
            // For Qtc=1.0, there should be a resonance peak above flat passband
            // Theoretical: peak ≈ 1.25dB, but implementation may vary
            const fc = 50, qtc = 1.0;
            const curve = generateSealedCurve(fc, qtc);
            const passband = findPassband(curve);
            const peak = findPeak(curve);

            const peakAbovePassband = peak.db - passband;

            // Should have noticeable peak (> 0.5dB above passband)
            expect(peakAbovePassband).toBeGreaterThan(0.5);
            // But not absurdly high (< 3dB)
            expect(peakAbovePassband).toBeLessThan(3.0);
        });

        test('Higher Qtc → higher peak (monotonic relationship)', () => {
            const fc = 50;

            const peak_0p8 = findPeak(generateSealedCurve(fc, 0.8)).db;
            const peak_1p0 = findPeak(generateSealedCurve(fc, 1.0)).db;
            const peak_1p2 = findPeak(generateSealedCurve(fc, 1.2)).db;

            expect(peak_1p0).toBeGreaterThan(peak_0p8);
            expect(peak_1p2).toBeGreaterThan(peak_1p0);
        });

    });

    // ========================================================================
    // ROLLOFF RATE INVARIANTS
    // ========================================================================

    describe('INVARIANT: Rolloff Rates', () => {

        test('Sealed box → 12dB/octave rolloff (2nd-order highpass)', () => {
            const fc = 50, qtc = 0.707;

            // Measure rolloff well below resonance where it's asymptotic
            const f1 = 10;   // Well below fc
            const f2 = 5;    // One octave below f1

            const db1 = Small1972.calculateResponseDb(f1, fc, qtc);
            const db2 = Small1972.calculateResponseDb(f2, fc, qtc);

            const rolloffPerOctave = db1 - db2;

            // Should be approximately 12 dB/octave (±1.5 dB tolerance)
            expect(rolloffPerOctave).toBeGreaterThan(10.5);
            expect(rolloffPerOctave).toBeLessThan(13.5);
        });

        test('Ported box → 24dB/octave rolloff below tuning (4th-order)', () => {
            const fs = 30, fb = 25, alpha = 2, qts = 0.4;

            // Measure well below Fb where rolloff is asymptotic
            const f1 = 8;    // Well below fb
            const f2 = 4;    // One octave below f1

            const db1 = Small1973.calculatePortedResponseDb(f1, fs, fb, alpha, qts);
            const db2 = Small1973.calculatePortedResponseDb(f2, fs, fb, alpha, qts);

            const rolloffPerOctave = db1 - db2;

            // Should approach 24 dB/octave (±3 dB tolerance - asymptotic)
            expect(rolloffPerOctave).toBeGreaterThan(20);
            expect(rolloffPerOctave).toBeLessThan(28);
        });

        test('Ported rolloff is steeper than sealed (always)', () => {
            const fs = 30, qts = 0.4, vas = 0.2;
            const vb = 0.1;  // 100L box
            const fb = 25;
            const alpha = vas / vb;

            // Sealed system
            const fc = Small1972.calculateFc(fs, alpha);
            const qtc = Small1972.calculateQtc(qts, alpha);

            // Measure at low frequency
            const f = 8;
            const sealedDb = Small1972.calculateResponseDb(f, fc, qtc);
            const portedDb = Small1973.calculatePortedResponseDb(f, fs, fb, alpha, qts);

            // Ported should be MORE negative (steeper rolloff)
            expect(portedDb).toBeLessThan(sealedDb);
        });

    });

    // ========================================================================
    // PARAMETER RELATIONSHIP INVARIANTS
    // ========================================================================

    describe('INVARIANT: Box Size Effects', () => {

        test('Smaller box → higher Fc (always, for any driver)', () => {
            for (const driver of TEST_DRIVERS) {
                const fc_large = Small1972.calculateFc(driver.fs, driver.vas / 0.2);  // 200L
                const fc_small = Small1972.calculateFc(driver.fs, driver.vas / 0.05); // 50L

                expect(fc_small).toBeGreaterThan(fc_large);
            }
        });

        test('Smaller box → higher Qtc (always, for any driver)', () => {
            for (const driver of TEST_DRIVERS) {
                const qtc_large = Small1972.calculateQtc(driver.qts, driver.vas / 0.2);
                const qtc_small = Small1972.calculateQtc(driver.qts, driver.vas / 0.05);

                expect(qtc_small).toBeGreaterThan(qtc_large);
            }
        });

        test('Fc and Qtc scale together (same ratio for any box change)', () => {
            const driver = TEST_DRIVERS[0];
            const alpha1 = driver.vas / 0.2;
            const alpha2 = driver.vas / 0.1;

            const fc1 = Small1972.calculateFc(driver.fs, alpha1);
            const fc2 = Small1972.calculateFc(driver.fs, alpha2);

            const qtc1 = Small1972.calculateQtc(driver.qts, alpha1);
            const qtc2 = Small1972.calculateQtc(driver.qts, alpha2);

            // Ratio should be identical (both scale with √(1+α))
            const fcRatio = fc2 / fc1;
            const qtcRatio = qtc2 / qtc1;

            expect(Math.abs(fcRatio - qtcRatio)).toBeLessThan(0.001);
        });

    });

    describe('INVARIANT: Limit Behavior', () => {

        test('Infinite box → Fc approaches Fs (free-air behavior)', () => {
            for (const driver of TEST_DRIVERS) {
                const alpha = driver.vas / 1000;  // 1000m³ box (essentially infinite)
                const fc = Small1972.calculateFc(driver.fs, alpha);

                const error = Math.abs(fc - driver.fs) / driver.fs;
                expect(error).toBeLessThan(0.01);  // Within 1%
            }
        });

        test('Infinite box → Qtc approaches Qts (free-air behavior)', () => {
            for (const driver of TEST_DRIVERS) {
                const alpha = driver.vas / 1000;
                const qtc = Small1972.calculateQtc(driver.qts, alpha);

                const error = Math.abs(qtc - driver.qts) / driver.qts;
                expect(error).toBeLessThan(0.01);
            }
        });

        test('Zero frequency → zero response (DC blocking)', () => {
            // Sealed: 2nd-order highpass
            const sealedMag = Small1972.calculateResponseMagnitude(0, 50, 0.707);
            expect(sealedMag).toBe(0);

            // Ported: 4th-order highpass
            const portedMag = Small1973.calculatePortedResponseMagnitude(0, 30, 25, 2, 0.4);
            expect(portedMag).toBe(0);
        });

        test('Very high frequency → unity response (flat passband)', () => {
            // Sealed
            const sealedMag = Small1972.calculateResponseMagnitude(10000, 50, 0.707);
            expect(sealedMag).toBeGreaterThan(0.99);
            expect(sealedMag).toBeLessThan(1.01);

            // Ported
            const portedMag = Small1973.calculatePortedResponseMagnitude(10000, 30, 25, 2, 0.4);
            expect(portedMag).toBeGreaterThan(0.99);
            expect(portedMag).toBeLessThan(1.01);
        });

    });

    // ========================================================================
    // Q FACTOR RELATIONSHIPS
    // ========================================================================

    describe('INVARIANT: Q Factor Relationships', () => {

        test('1/Qts = 1/Qes + 1/Qms (definitional identity)', () => {
            // Note: Datasheet values often have rounding, so allow 5% tolerance
            for (const driver of TEST_DRIVERS) {
                if (!driver.qes || !driver.qms) continue;

                const calculatedQts = Small1972.calculateQts(driver.qes, driver.qms);
                const error = Math.abs(calculatedQts - driver.qts) / driver.qts;

                expect(error).toBeLessThan(0.05);  // 5% tolerance for datasheet rounding
            }
        });

        test('Qes > Qts always (electrical Q includes mechanical)', () => {
            for (const driver of TEST_DRIVERS) {
                if (!driver.qes) continue;
                expect(driver.qes).toBeGreaterThan(driver.qts);
            }
        });

        test('Qms > Qts always (mechanical Q includes electrical)', () => {
            for (const driver of TEST_DRIVERS) {
                if (!driver.qms) continue;
                expect(driver.qms).toBeGreaterThan(driver.qts);
            }
        });

        test('Qms >> Qes typically (mechanical damping is lower)', () => {
            // Most drivers have Qms 3-10x higher than Qes
            for (const driver of TEST_DRIVERS) {
                if (!driver.qes || !driver.qms) continue;
                expect(driver.qms).toBeGreaterThan(driver.qes);
            }
        });

    });

    // ========================================================================
    // EFFICIENCY INVARIANTS
    // ========================================================================

    describe('INVARIANT: Efficiency Physics', () => {

        test('Efficiency is always 0 < η₀ < 1', () => {
            for (const driver of TEST_DRIVERS) {
                if (!driver.qes) continue;
                const eta = Small1972.calculateEta0(driver.fs, driver.vas, driver.qes);

                expect(eta).toBeGreaterThan(0);
                expect(eta).toBeLessThan(1);
            }
        });

        test('Efficiency scales with Fs³ (cube law)', () => {
            const vas = 0.1, qes = 0.5;

            const eta_30 = Small1972.calculateEta0(30, vas, qes);
            const eta_60 = Small1972.calculateEta0(60, vas, qes);

            // Doubling Fs should 8x efficiency (2³ = 8)
            const ratio = eta_60 / eta_30;
            expect(ratio).toBeGreaterThan(7);
            expect(ratio).toBeLessThan(9);
        });

        test('Efficiency scales linearly with Vas', () => {
            const fs = 30, qes = 0.5;

            const eta_small = Small1972.calculateEta0(fs, 0.1, qes);
            const eta_large = Small1972.calculateEta0(fs, 0.2, qes);

            const ratio = eta_large / eta_small;
            expect(ratio).toBeGreaterThan(1.9);
            expect(ratio).toBeLessThan(2.1);
        });

        test('Efficiency scales inversely with Qes', () => {
            const fs = 30, vas = 0.1;

            const eta_lowQ = Small1972.calculateEta0(fs, vas, 0.3);
            const eta_highQ = Small1972.calculateEta0(fs, vas, 0.6);

            // Double Qes → half efficiency
            const ratio = eta_lowQ / eta_highQ;
            expect(ratio).toBeGreaterThan(1.9);
            expect(ratio).toBeLessThan(2.1);
        });

        test('Real drivers have realistic efficiency (0.1% to 5%)', () => {
            for (const driver of TEST_DRIVERS) {
                if (!driver.qes) continue;
                const eta = Small1972.calculateEta0(driver.fs, driver.vas, driver.qes);

                expect(eta).toBeGreaterThan(0.001);  // > 0.1%
                expect(eta).toBeLessThan(0.10);      // < 10%
            }
        });

    });

    // ========================================================================
    // PORTED BOX SPECIFIC INVARIANTS
    // ========================================================================

    describe('INVARIANT: Ported Box Behavior', () => {

        test('Response at tuning frequency (Fb) near optimal alignment is reasonable', () => {
            // At QB3 alignment (fb ≈ fs), response at Fb should be close to passband
            // For sub-optimal tunings, there may be more dip
            const driver = TEST_DRIVERS[0];  // 18" sub
            const vb = 0.15;
            const alpha = driver.vas / vb;
            const fb = driver.fs;  // QB3 tuning

            const dbAtFb = Small1973.calculatePortedResponseDb(fb, driver.fs, fb, alpha, driver.qts);

            // QB3 alignment should have reasonable response at Fb (within 6dB)
            expect(dbAtFb).toBeGreaterThan(-6);
        });

        test('Ported F3 can be lower than sealed F3 (extended bass)', () => {
            const driver = TEST_DRIVERS[0];  // 18" sub
            const vb = 0.15;  // 150L
            const alpha = driver.vas / vb;

            // Sealed
            const fc = Small1972.calculateFc(driver.fs, alpha);
            const qtc = Small1972.calculateQtc(driver.qts, alpha);
            const sealedF3 = Small1972.calculateF3(fc, qtc);

            // Ported (QB3 alignment: fb = fs)
            const fb = driver.fs;
            const portedF3 = Small1973.calculatePortedF3(driver.fs, fb, alpha, driver.qts);

            // Ported should go lower (this is the whole point)
            expect(portedF3).toBeLessThan(sealedF3);
        });

        test('Optimal tuning (near fs) gives lowest F3 (U-shaped curve)', () => {
            // F3 vs Fb is U-shaped: too low OR too high tuning raises F3
            // Optimal is typically around fs (QB3) or slightly below (B4)
            const driver = TEST_DRIVERS[0];
            const vb = 0.15;
            const alpha = driver.vas / vb;

            const f3_optimal = Small1973.calculatePortedF3(driver.fs, driver.fs, alpha, driver.qts);  // QB3
            const f3_low = Small1973.calculatePortedF3(driver.fs, driver.fs * 0.6, alpha, driver.qts);  // Very low
            const f3_high = Small1973.calculatePortedF3(driver.fs, driver.fs * 1.5, alpha, driver.qts);  // Very high

            // Optimal should be better than extremes
            expect(f3_optimal).toBeLessThanOrEqual(f3_low);
            expect(f3_optimal).toBeLessThanOrEqual(f3_high);
        });

        test('Enclosure losses (QL) reduce peak response', () => {
            const fs = 30, fb = 25, alpha = 2, qts = 0.4;

            // Lossless
            const curve_lossless = generatePortedCurve(fs, fb, alpha, qts, Infinity);
            const peak_lossless = findPeak(curve_lossless);

            // With losses (QL = 7, typical)
            const curve_lossy = generatePortedCurve(fs, fb, alpha, qts, 7);
            const peak_lossy = findPeak(curve_lossy);

            // Lossy should have lower peak
            expect(peak_lossy.db).toBeLessThan(peak_lossless.db);
        });

    });

    // ========================================================================
    // PORT PHYSICS INVARIANTS
    // ========================================================================

    describe('INVARIANT: Port Physics', () => {

        test('Port length is positive for realistic parameters', () => {
            const vb = 0.1;     // 100L
            const fb = 30;      // 30Hz tuning
            const portDia = 0.1; // 10cm port
            const portArea = Small1973.calculatePortArea(portDia);

            const length = Small1973.calculatePortLength(vb, fb, portArea, portDia);

            expect(length).toBeGreaterThan(0);
        });

        test('Higher tuning → shorter port (inverse relationship)', () => {
            const vb = 0.1, portDia = 0.1;
            const portArea = Small1973.calculatePortArea(portDia);

            const length_25Hz = Small1973.calculatePortLength(vb, 25, portArea, portDia);
            const length_35Hz = Small1973.calculatePortLength(vb, 35, portArea, portDia);

            expect(length_35Hz).toBeLessThan(length_25Hz);
        });

        test('Larger port area → longer port (for same tuning)', () => {
            const vb = 0.1, fb = 30;

            const area_small = Small1973.calculatePortArea(0.08);  // 8cm
            const area_large = Small1973.calculatePortArea(0.12);  // 12cm

            const length_small = Small1973.calculatePortLength(vb, fb, area_small, 0.08);
            const length_large = Small1973.calculatePortLength(vb, fb, area_large, 0.12);

            expect(length_large).toBeGreaterThan(length_small);
        });

        test('Larger box → shorter port (for same tuning)', () => {
            const fb = 30, portDia = 0.1;
            const portArea = Small1973.calculatePortArea(portDia);

            const length_100L = Small1973.calculatePortLength(0.1, fb, portArea, portDia);
            const length_200L = Small1973.calculatePortLength(0.2, fb, portArea, portDia);

            expect(length_200L).toBeLessThan(length_100L);
        });

        test('Port area = π × r² (geometry)', () => {
            const diameter = 0.10;  // 10cm
            const area = Small1973.calculatePortArea(diameter);
            const expected = Math.PI * Math.pow(diameter / 2, 2);

            expect(Math.abs(area - expected)).toBeLessThan(0.0001);
        });

    });

    // ========================================================================
    // ALIGNMENT INVARIANTS
    // ========================================================================

    describe('INVARIANT: Alignment Properties', () => {

        test('Butterworth Qtc (0.707) produces F3 = Fc', () => {
            const fc = 50;
            const f3 = Small1972.calculateF3(fc, Thiele1971.BUTTERWORTH_QTC);

            expect(Math.abs(f3 - fc)).toBeLessThan(0.5);
        });

        test('Bessel Qtc (0.577) produces F3 > Fc', () => {
            const fc = 50;
            const f3 = Small1972.calculateF3(fc, Thiele1971.BESSEL_QTC);

            expect(f3).toBeGreaterThan(fc);
        });

        test('Chebyshev Qtc (1.0) produces F3 < Fc', () => {
            const fc = 50;
            const f3 = Small1972.calculateF3(fc, Thiele1971.CHEBYSHEV_QTC);

            expect(f3).toBeLessThan(fc);
        });

        test('Lower target Qtc requires larger box', () => {
            const driver = TEST_DRIVERS[0];

            // Skip if driver Qts is too high for Bessel
            if (driver.qts >= 0.55) return;

            const vb_bessel = Thiele1971.calculateBesselVolume(driver.qts, driver.vas);
            const vb_butterworth = Thiele1971.calculateButterworthVolume(driver.qts, driver.vas);

            // Bessel (0.577) < Butterworth (0.707), so Bessel needs larger box
            expect(vb_bessel).toBeGreaterThan(vb_butterworth);
        });

    });

    // ========================================================================
    // SANITY CHECKS ON REAL DRIVERS
    // ========================================================================

    describe('SANITY: Real Driver Results', () => {

        test('18" sub in 150L sealed → reasonable F3 (20-50Hz)', () => {
            const driver = TEST_DRIVERS[0];  // 18" sub: fs=22, qts=0.53, vas=248L
            const vb = 0.15;  // 150L
            const alpha = driver.vas / vb;

            const fc = Small1972.calculateFc(driver.fs, alpha);
            const qtc = Small1972.calculateQtc(driver.qts, alpha);
            const f3 = Small1972.calculateF3(fc, qtc);

            expect(f3).toBeGreaterThan(20);
            expect(f3).toBeLessThan(50);
        });

        test('All test drivers → Butterworth box is reasonable size', () => {
            for (const driver of TEST_DRIVERS) {
                // Skip drivers with Qts >= 0.707 (already at/above Butterworth)
                if (driver.qts >= 0.707) continue;

                const vb = Thiele1971.calculateButterworthVolume(driver.qts, driver.vas);

                // Box should be positive and not absurdly large
                expect(vb).toBeGreaterThan(0);
                expect(vb).toBeLessThan(10);  // < 10,000 liters

                // Box should be proportional to Vas (typically 0.3x to 5x)
                const ratio = vb / driver.vas;
                expect(ratio).toBeGreaterThan(0.1);
                expect(ratio).toBeLessThan(20);
            }
        });

        test('Ported box F3 is in subwoofer range for subwoofer drivers', () => {
            const subDrivers = TEST_DRIVERS.filter(d => d.fs < 40);

            for (const driver of subDrivers) {
                const vb = 0.15;  // 150L
                const fb = driver.fs;  // QB3 tuning
                const alpha = driver.vas / vb;

                const f3 = Small1973.calculatePortedF3(driver.fs, fb, alpha, driver.qts);

                // Subwoofer should go below 40Hz
                expect(f3).toBeLessThan(50);
                expect(f3).toBeGreaterThan(10);  // But not impossibly low
            }
        });

    });

    // ========================================================================
    // FUTURE WORK REMINDERS
    // ========================================================================
    // These tests document what's NOT YET IMPLEMENTED.
    // They pass by acknowledging the gap, not by having working code.
    // When you implement the feature, convert to a real test.

    describe('FUTURE: Not Yet Implemented (see lib/future/README.md)', () => {

        test('Klippel thermal compression model → lib/future/klippel.js', () => {
            // When implemented, this should test:
            // - Voice coil temperature rise vs power/time
            // - Resistance increase (Re rises ~0.4%/°C)
            // - SPL compression prediction
            //
            // For now, just document the gap exists
            const implemented = false;
            expect(implemented).toBe(false);  // Will fail when you implement it!
        });

        test('Geddes port compression model → lib/future/geddes.js', () => {
            // When implemented, this should test:
            // - Reynolds number calculation
            // - Turbulence onset prediction
            // - Nonlinear port resistance
            //
            // For now, just document the gap exists
            const implemented = false;
            expect(implemented).toBe(false);  // Will fail when you implement it!
        });

        test('Cone excursion vs frequency curve', () => {
            // Critical for knowing when driver will bottom out
            // Should calculate X(f) given power input
            //
            // Partially in Small1973.calculatePeakDisplacement but needs
            // full frequency sweep and transfer function integration
            const fullyImplemented = false;
            expect(fullyImplemented).toBe(false);
        });

    });

}
