/**
 * External API Contract Tests
 *
 * These tests verify the PUBLIC API that external consumers depend on.
 * They import ONLY from the official entry point (models/index.js).
 *
 * PURPOSE:
 * - Prevent accidental breaking changes to the stable API
 * - Document what external consumers can rely on
 * - Catch regressions in canonical reference cases
 *
 * RULES:
 * 1. Import ONLY from '../models/index.js' - no internal imports
 * 2. Use canonical drivers with known-good reference values
 * 3. Test the API surface, not implementation details
 * 4. If a test fails, the API contract is broken - fix carefully
 *
 * When extracting to a separate package, these tests should pass unchanged
 * with just an import path update.
 */

import {
    // Domain objects - the primary API
    Driver,
    SealedBox,
    VentedBox,
    Port,
    PassiveRadiator,

    // Isobaric transforms
    createIsobaricDriver,
    IsobaricWiring,

    // Comparison utilities
    compareSealedAlignments,
    comparePortedAlignments,

    // Reference data
    ReferenceSub,
    BUILTIN_REFERENCE_SUBS
} from '../models/index.js';

// ============================================================================
// CANONICAL TEST DATA
// ============================================================================
// These are real drivers with known specifications.
// Reference values are cross-validated against WinISD and paper equations.

const UM18_22_V2 = {
    // Dayton Audio Ultimax UM18-22 V2
    // Source: Manufacturer datasheet + measurements
    fs: 22.0,
    qts: 0.53,
    qes: 0.67,
    qms: 2.53,
    vas: 248.2,
    re: 4.2,
    le: 1.15,
    bl: 18.9,
    mms: 325,
    cms: 0.000128,
    rms: 17.76,
    xmax: 28,
    sd: 1184,
    pe: 1200,
    vd: 3315,          // Sd × Xmax / 10 = 1184 × 28 / 10
    sensitivity: 88.0  // from eta0 calculation
};

const LOW_QTS_DRIVER = {
    // Hypothetical low-Qts driver ideal for ported
    fs: 28,
    qts: 0.32,
    qes: 0.35,
    qms: 4.0,
    vas: 180,
    re: 3.5,
    bl: 16,
    mms: 200,
    cms: 0.000130,
    rms: 8.80,
    xmax: 20,
    sd: 1000,
    pe: 1000,
    vd: 2000,          // Sd × Xmax / 10 = 1000 × 20 / 10
    sensitivity: 92.5  // from eta0 calculation
};

// ============================================================================
// CONTRACT TESTS
// ============================================================================

export function runExternalAPITests(TestFramework) {
    const { describe, test, expect } = TestFramework;

    // ========================================================================
    // DRIVER API
    // ========================================================================

    describe('External API: Driver', () => {
        test('constructs with valid T/S parameters', () => {
            const driver = new Driver(UM18_22_V2);

            // Core T/S params accessible
            expect(driver.fs).toBe(22.0);
            expect(driver.qts).toBe(0.53);
            expect(driver.vas).toBe(248.2);

            // Derived params calculated
            expect(driver.qes).toBe(0.67);
            expect(driver.qms).toBe(2.53);
        });

        test('validates and rejects invalid parameters', () => {
            expect(() => new Driver({ fs: -10, qts: 0.5, vas: 100 })).toThrow();
            expect(() => new Driver({ fs: 30, qts: 5, vas: 100 })).toThrow();
            expect(() => new Driver({ fs: 30, qts: 0.5, vas: -100 })).toThrow();
        });

        test('hasParams checks specific parameters', () => {
            const full = new Driver(UM18_22_V2);
            expect(full.hasParams('bl', 'mms', 'xmax', 'pe')).toBe(true);

            const minimal = new Driver({ fs: 30, qts: 0.5, vas: 100 });
            expect(minimal.hasParams('bl', 'mms', 'xmax', 'pe')).toBe(false);
        });

        test('canCalculateSpl exposed via SealedBox', () => {
            // canCalculateSpl checks for sensitivity and re
            const driver = new Driver(UM18_22_V2);
            const box = new SealedBox(driver, 140);
            expect(box.canCalculateSpl).toBe(true);

            // Minimal driver without sensitivity or re
            const minimalDriver = new Driver({ fs: 30, qts: 0.5, vas: 100 });
            const minimalBox = new SealedBox(minimalDriver, 100);
            expect(minimalBox.canCalculateSpl).toBe(false);
        });
    });

    // ========================================================================
    // SEALED BOX API
    // ========================================================================

    describe('External API: SealedBox', () => {
        test('constructs with driver and volume', () => {
            const driver = new Driver(UM18_22_V2);
            const box = new SealedBox(driver, 140);

            expect(box.volumeLiters).toBe(140);
            expect(box.driver).toBe(driver);
        });

        test('static factory: butterworth alignment', () => {
            const driver = new Driver(UM18_22_V2);
            const box = SealedBox.butterworth(driver);

            // Butterworth = Qtc of 0.707
            expect(box.qtc).toBeCloseTo(0.707, 2);
        });

        test('responseAt returns dB relative to passband', () => {
            const driver = new Driver(UM18_22_V2);
            const box = new SealedBox(driver, 140);

            // High frequency should be ~0dB (passband)
            expect(box.responseAt(200)).toBeCloseTo(0, 0);

            // F3 should be -3dB by definition
            expect(box.responseAt(box.f3)).toBeCloseTo(-3, 0);
        });

        test('responseCurve returns array with expected shape', () => {
            const driver = new Driver(UM18_22_V2);
            const box = new SealedBox(driver, 140);
            const curve = box.responseCurve(10, 200, 20);

            expect(Array.isArray(curve)).toBe(true);
            expect(curve.length).toBe(20);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('db');
        });

        test('impedanceCurve returns magnitude and phase', () => {
            const driver = new Driver(UM18_22_V2);
            const box = new SealedBox(driver, 140);
            const curve = box.impedanceCurve(10, 200, 10);

            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('magnitude');
            expect(curve[0]).toHaveProperty('phase');
        });

        test('maxSplAt returns SPL and limiting factor', () => {
            const driver = new Driver(UM18_22_V2);
            const box = new SealedBox(driver, 140);
            const result = box.maxSplAt(30);

            expect(result).toHaveProperty('maxSpl');
            expect(result).toHaveProperty('maxPower');
            expect(result).toHaveProperty('limitingFactor');
            expect(['thermal', 'excursion']).toContain(result.limitingFactor);
        });
    });

    // ========================================================================
    // VENTED BOX API
    // ========================================================================

    describe('External API: VentedBox', () => {
        test('constructs with driver, volume, tuning, and port', () => {
            const driver = new Driver(LOW_QTS_DRIVER);
            const port = new Port({ diameter: 10 });
            const box = new VentedBox(driver, 100, 30, port);

            expect(box.volumeLiters).toBe(100);
            expect(box.fb).toBe(30);
            expect(box.isVented).toBe(true);
            expect(box.isPort).toBe(true);
        });

        test('static factory: QB3 alignment', () => {
            const driver = new Driver(LOW_QTS_DRIVER);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            // QB3 produces specific tuning ratio
            expect(box.fb).toBeGreaterThan(0);
            expect(box.volumeLiters).toBeGreaterThan(0);
        });

        test('responseAt returns 4th-order vented response', () => {
            const driver = new Driver(LOW_QTS_DRIVER);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            // High frequency ~0dB
            expect(box.responseAt(200)).toBeCloseTo(0, 0);

            // Deep bass rolls off steeply (4th order)
            expect(box.responseAt(box.f3 / 3)).toBeLessThan(-15);
        });

        test('portVelocityCurve available for port vents', () => {
            const driver = new Driver(LOW_QTS_DRIVER);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);
            const curve = box.portVelocityCurve(100, 10, 100, 10);

            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('velocity');
        });

        test('works with passive radiator instead of port', () => {
            const driver = new Driver(LOW_QTS_DRIVER);
            const pr = new PassiveRadiator({ sd: 500, mmp: 150, xmax: 25 });
            const box = VentedBox.qb3(driver, pr);

            expect(box.isVented).toBe(true);
            expect(box.isPassiveRadiator).toBe(true);
            expect(box.isPort).toBe(false);

            // PR excursion curve available
            const curve = box.prExcursionCurve(100, 10, 100, 10);
            expect(curve[0]).toHaveProperty('excursion');
        });
    });

    // ========================================================================
    // PORT API
    // ========================================================================

    describe('External API: Port', () => {
        test('constructs circular port', () => {
            const port = new Port({ diameter: 10 });

            expect(port.diameterCm).toBe(10);
            expect(port.type).toBe('circular');
        });

        test('constructs rectangular port', () => {
            const port = new Port({ width: 5, height: 20 });

            expect(port.widthCm).toBe(5);
            expect(port.heightCm).toBe(20);
            expect(port.type).toBe('rectangular');
        });

        test('supports flared option', () => {
            const flared = new Port({ diameter: 10, flared: true });
            const unflared = new Port({ diameter: 10, flared: false });

            expect(flared.flared).toBe(true);
            expect(unflared.flared).toBe(false);
        });

        test('supports quantity for multiple ports', () => {
            const quad = new Port({ diameter: 7.5, quantity: 4 });

            expect(quad.quantity).toBe(4);
            // Total area = 4x single port area
            expect(quad.totalAreaCm2).toBeCloseTo(4 * Math.PI * 3.75 * 3.75, 0);
        });
    });

    // ========================================================================
    // PASSIVE RADIATOR API
    // ========================================================================

    describe('External API: PassiveRadiator', () => {
        test('constructs with required parameters', () => {
            const pr = new PassiveRadiator({
                sd: 500,    // cm²
                mmp: 150,   // grams
                xmax: 25    // mm
            });

            // Properties have unit suffixes for clarity
            expect(pr.sdCm2).toBe(500);
            expect(pr.mmpGrams).toBe(150);
            expect(pr.xmaxMm).toBe(25);
        });

        test('calculates natural tuning frequency', () => {
            const pr = new PassiveRadiator({
                sd: 500,
                mmp: 150,
                xmax: 25,
                cmp: 0.5  // mm/N compliance
            });

            // Natural frequency depends on mass and compliance
            expect(pr.naturalFrequency).toBeGreaterThan(0);
        });

        test('supports quantity for multiple PRs', () => {
            const dual = new PassiveRadiator({
                sd: 500,
                mmp: 150,
                xmax: 25,
                quantity: 2
            });

            expect(dual.quantity).toBe(2);
        });
    });

    // ========================================================================
    // ISOBARIC API
    // ========================================================================

    describe('External API: Isobaric', () => {
        test('createIsobaricDriver transforms driver parameters', () => {
            const driver = new Driver(UM18_22_V2);
            const isobaric = createIsobaricDriver(driver, IsobaricWiring.SERIES);

            // Vas halved for isobaric
            expect(isobaric.vas).toBeCloseTo(driver.vas / 2, 1);

            // Fs and Qts preserved
            expect(isobaric.fs).toBe(driver.fs);
            expect(isobaric.qts).toBe(driver.qts);
        });

        test('isobaric driver creates valid sealed box', () => {
            const driver = new Driver(UM18_22_V2);
            const isobaric = createIsobaricDriver(driver, IsobaricWiring.SERIES);
            const box = SealedBox.butterworth(isobaric);

            // Same Qtc target, half the volume
            expect(box.qtc).toBeCloseTo(0.707, 2);
        });
    });

    // ========================================================================
    // COMPARISON API
    // ========================================================================

    describe('External API: Comparison', () => {
        test('compareSealedAlignments returns structured result', () => {
            const driver = new Driver(UM18_22_V2);
            const result = compareSealedAlignments(driver);

            // Returns object with alignments property
            expect(result).toHaveProperty('alignments');
            expect(result).toHaveProperty('recommendation');

            // Alignments is an object with named alignments
            const alignments = result.alignments;
            expect(alignments).toHaveProperty('butterworth');
            expect(alignments).toHaveProperty('bessel');

            // Each alignment has box instance
            expect(alignments.butterworth).toHaveProperty('box');
            expect(alignments.butterworth.box).toBeInstanceOf(SealedBox);
        });

        test('comparePortedAlignments returns QB3 and B4', () => {
            const driver = new Driver(LOW_QTS_DRIVER);
            const port = new Port({ diameter: 10 });
            const result = comparePortedAlignments(driver, port);

            // Returns object with alignments
            expect(result).toHaveProperty('alignments');
            expect(result.alignments).toHaveProperty('qb3');
            expect(result.alignments).toHaveProperty('b4');
            // C4 not included without k parameter
            expect(result.alignments.c4).toBeUndefined();
        });

        test('comparePortedAlignments includes C4 when k provided', () => {
            const driver = new Driver(LOW_QTS_DRIVER);
            const port = new Port({ diameter: 10 });
            const result = comparePortedAlignments(driver, port, { k: 0.5 });

            expect(result.alignments).toHaveProperty('c4');
        });
    });

    // ========================================================================
    // REFERENCE SUB API
    // ========================================================================

    describe('External API: ReferenceSub', () => {
        test('BUILTIN_REFERENCE_SUBS contains known subs', () => {
            expect(Array.isArray(BUILTIN_REFERENCE_SUBS)).toBe(true);
            expect(BUILTIN_REFERENCE_SUBS.length).toBeGreaterThan(0);

            const first = BUILTIN_REFERENCE_SUBS[0];
            expect(first).toHaveProperty('name');
            expect(first).toHaveProperty('cea2010');  // CEA-2010 measurement data
        });

        test('ReferenceSub provides SPL curves', () => {
            const subData = BUILTIN_REFERENCE_SUBS[0];
            const sub = new ReferenceSub(subData);

            expect(sub.name).toBeDefined();

            // Can generate SPL curve
            const curve = sub.maxSplCurve(20, 80, 10);
            expect(Array.isArray(curve)).toBe(true);
        });
    });

    // ========================================================================
    // CANONICAL REFERENCE VALUES
    // ========================================================================
    // These test specific numerical outputs that should NOT change.
    // If they change, the physics model has been altered.
    //
    // UM18-22 V2: Qts=0.53, Vas=248L, Fs=22Hz
    // For Butterworth (Qtc=0.707):
    //   alpha = (Qtc/Qts)² - 1 = (0.707/0.53)² - 1 = 0.78
    //   Vb = Vas/alpha = 248/0.78 = 318L
    //   Fc = Fs × sqrt(alpha+1) = 22 × 1.33 = 29Hz

    describe('External API: Reference Values (UM18-22 V2)', () => {
        const driver = new Driver(UM18_22_V2);

        test('Butterworth sealed: volume ~318L', () => {
            const box = SealedBox.butterworth(driver);
            // Calculated from Small 1972: Vb = Vas / ((Qtc/Qts)² - 1)
            expect(box.volumeLiters).toBeCloseTo(318, 0);
        });

        test('Butterworth sealed: F3 ~29Hz', () => {
            const box = SealedBox.butterworth(driver);
            // For Qtc=0.707, F3 ≈ Fc
            expect(box.f3).toBeCloseTo(29, 0);
        });

        test('140L sealed: Qtc ~0.88', () => {
            const box = new SealedBox(driver, 140);
            // alpha = Vas/Vb = 248/140 = 1.77
            // Qtc = Qts × sqrt(alpha+1) = 0.53 × sqrt(2.77) = 0.88
            expect(box.qtc).toBeCloseTo(0.88, 1);
        });

        test('140L sealed: Fc ~37Hz', () => {
            const box = new SealedBox(driver, 140);
            // Fc = Fs × sqrt(alpha+1) = 22 × sqrt(2.77) = 37Hz
            expect(box.fc).toBeCloseTo(37, 0);
        });

        test('Response at Fc for overdamped box', () => {
            const box = new SealedBox(driver, 140);
            // For Qtc > 0.707, there's a resonant peak
            // Response at Fc is typically elevated
            const responseAtFc = box.responseAt(box.fc);
            // With Qtc=0.88, there's a slight peak
            expect(responseAtFc).toBeGreaterThan(-3);
        });

        test('Impedance peak at Fc', () => {
            const box = new SealedBox(driver, 140);
            const z = box.impedanceAt(box.fc);
            const zLow = box.impedanceAt(200);

            // Impedance at Fc should be higher than passband
            expect(z.magnitude).toBeGreaterThan(zLow.magnitude);
        });
    });
}
