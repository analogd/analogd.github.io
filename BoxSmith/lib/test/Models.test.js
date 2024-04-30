/**
 * Models Layer Tests - Validated Domain Objects
 *
 * Validates:
 * 1. Driver construction validation (rejects invalid params)
 * 2. Driver derived properties (ebp, eta0, etc.)
 * 3. SealedBox factory methods and response calculations
 * 4. VentedBox (unified port/PR) functionality
 * 5. Serialization round-trips
 *
 * Note: No downstream consumers outside our UI - no backwards compat needed.
 */

import {
    DriverSpec,
    Driver,
    SealedBox,
    VentedBox,
    Port,
    PassiveRadiator,
    ReferenceSub,
    BUILTIN_REFERENCE_SUBS,
    compareSealedAlignments,
    comparePortedAlignments,
    compareAllAlignments
} from '../models/index.js';

// ============================================================================
// TEST DATA
// ============================================================================

// Valid driver params (Dayton UM18-22 V2)
const VALID_DRIVER_PARAMS = {
    fs: 22.0,
    qts: 0.53,
    vas: 248.2,
    qes: 0.56,
    qms: 7.7,
    re: 6.4,
    bl: 18.5,
    mms: 240,
    cms: 0.000138,
    rms: 4.31,
    xmax: 18,
    sd: 1140,
    pe: 1200,
    vd: 2052,           // Sd × Xmax / 10 = 1140 × 18 / 10
    sensitivity: 88.7,  // from eta0 calculation
    manufacturer: 'Dayton Audio',
    model: 'UM18-22 V2'
};

// Minimal valid driver (only required params)
const MINIMAL_DRIVER_PARAMS = {
    fs: 50,
    qts: 0.5,
    vas: 100
};

// Low Qts driver (good for ported)
const LOW_QTS_PARAMS = {
    fs: 30,
    qts: 0.35,
    vas: 150,
    qes: 0.40,
    qms: 4.5
};

// ============================================================================
// TEST SUITE
// ============================================================================

export function runModelsTests(TestFramework) {
    const { describe, test, expect } = TestFramework;

    // ========================================================================
    // DRIVER MODEL
    // ========================================================================

    describe('Driver - Construction Validation', () => {
        test('Accepts valid complete params', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            expect(driver.fs).toBe(22.0);
            expect(driver.qts).toBe(0.53);
            expect(driver.vas).toBe(248.2);
            expect(driver.manufacturer).toBe('Dayton Audio');
        });

        test('Accepts minimal required params', () => {
            const driver = new Driver(MINIMAL_DRIVER_PARAMS);
            expect(driver.fs).toBe(50);
            expect(driver.qts).toBe(0.5);
            expect(driver.vas).toBe(100);
            expect(driver.qes).toBe(undefined);
        });

        test('Rejects missing fs', () => {
            expect(() => new Driver({ qts: 0.5, vas: 100 }))
                .toThrow('requires fs');
        });

        test('Rejects missing qts', () => {
            expect(() => new Driver({ fs: 50, vas: 100 }))
                .toThrow('requires qts');
        });

        test('Rejects missing vas', () => {
            expect(() => new Driver({ fs: 50, qts: 0.5 }))
                .toThrow('requires vas');
        });

        test('Rejects fs outside valid range (too low)', () => {
            expect(() => new Driver({ fs: 5, qts: 0.5, vas: 100 }))
                .toThrow('outside valid range');
        });

        test('Rejects fs outside valid range (too high)', () => {
            expect(() => new Driver({ fs: 600, qts: 0.5, vas: 100 }))
                .toThrow('outside valid range');
        });

        test('Rejects qts outside valid range', () => {
            expect(() => new Driver({ fs: 50, qts: 3.0, vas: 100 }))
                .toThrow('outside valid range');
        });

        test('Rejects negative vas', () => {
            expect(() => new Driver({ fs: 50, qts: 0.5, vas: -100 }))
                .toThrow('must be positive');
        });

        test('Rejects vas that is too large (likely wrong units)', () => {
            expect(() => new Driver({ fs: 50, qts: 0.5, vas: 5000 }))
                .toThrow('unusually large');
        });
    });

    describe('Driver - Q Parameter Validation', () => {
        test('Rejects Qes < Qts', () => {
            expect(() => new Driver({ fs: 50, qts: 0.5, vas: 100, qes: 0.3 }))
                .toThrow('cannot be less than Qts');
        });

        test('Rejects Qms < Qts', () => {
            expect(() => new Driver({ fs: 50, qts: 0.5, vas: 100, qms: 0.3 }))
                .toThrow('cannot be less than Qts');
        });

        test('Rejects inconsistent Q parameters', () => {
            // Qes=0.6, Qms=0.8 implies Qts≈0.34, not 0.5
            expect(() => new Driver({ fs: 50, qts: 0.5, vas: 100, qes: 0.6, qms: 0.8 }))
                .toThrow('inconsistent');
        });

        test('Accepts consistent Q parameters', () => {
            // Qes=0.56, Qms=7.7 implies Qts≈0.522
            const driver = new Driver({
                fs: 50,
                qts: 0.52,
                vas: 100,
                qes: 0.56,
                qms: 7.7
            });
            expect(driver.qts).toBe(0.52);
        });
    });

    describe('Driver - Derived Properties', () => {
        test('Calculates EBP correctly', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const expectedEbp = 22.0 / 0.56;
            expect(driver.ebp).toBeCloseTo(expectedEbp, 1);
        });

        test('EBP is null without Qes', () => {
            const driver = new Driver(MINIMAL_DRIVER_PARAMS);
            expect(driver.ebp).toBe(null);
        });

        test('Enclosure hint based on EBP', () => {
            // UM18 has EBP ≈ 39, suggesting sealed
            const driver = new Driver(VALID_DRIVER_PARAMS);
            expect(driver.enclosureHint).toBe('sealed');

            // High EBP driver suggests ported (Qes must be >= Qts)
            const portedDriver = new Driver({
                fs: 30, qts: 0.25, vas: 150, qes: 0.30
            });
            expect(portedDriver.enclosureHint).toBe('ported');
        });

        test('Returns stored Vd (volume displacement)', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            // Vd is stored, not derived (derivation happens in edit UI only)
            expect(driver.vd).toBe(2052);
        });

        test('SI unit conversions', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            expect(driver.vasSI).toBeCloseTo(0.2482, 4);
            expect(driver.sdSI).toBeCloseTo(0.114, 4);
            expect(driver.xmaxSI).toBeCloseTo(0.018, 4);
        });

        test('suitsSealed and suitsPorted flags', () => {
            // UM18 (Qts=0.53) - both work but sealed preferred
            const um18 = new Driver(VALID_DRIVER_PARAMS);
            expect(um18.suitsSealed).toBe(true);
            expect(um18.suitsPorted).toBe(true);

            // Low Qts driver - ported preferred
            const low = new Driver(LOW_QTS_PARAMS);
            expect(low.suitsSealed).toBe(true);
            expect(low.suitsPorted).toBe(true);
        });
    });

    describe('Driver - Serialization', () => {
        test('Round-trip through toObject/fromObject', () => {
            const original = new Driver(VALID_DRIVER_PARAMS);
            const obj = original.toObject();
            const restored = Driver.fromObject(obj);

            expect(restored.fs).toBe(original.fs);
            expect(restored.qts).toBe(original.qts);
            expect(restored.vas).toBe(original.vas);
            expect(restored.manufacturer).toBe(original.manufacturer);
        });

        test('toObject omits null values', () => {
            const driver = new Driver(MINIMAL_DRIVER_PARAMS);
            const obj = driver.toObject();

            expect(obj.fs).toBe(50);
            expect(obj.qes).toBe(undefined);
            expect(obj.bl).toBe(undefined);
        });

        test('displayName with manufacturer/model', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            expect(driver.displayName).toBe('Dayton Audio UM18-22 V2');
        });

        test('displayName fallback without metadata', () => {
            const driver = new Driver(MINIMAL_DRIVER_PARAMS);
            expect(driver.displayName).toContain('Fs=50');
        });
    });

    // ========================================================================
    // DRIVER SPEC MODEL (derivation + provenance)
    // ========================================================================

    describe('DriverSpec - Derivation', () => {
        test('Derives Qms from Qts and Qes', () => {
            const spec = new DriverSpec({ fs: 22, qts: 0.53, qes: 0.67, vas: 248 });
            // Expected: (0.53 × 0.67) / (0.67 - 0.53) = 2.54
            expect(spec.qms).toBeCloseTo(2.54, 1);
            expect(spec.isDerived('qms')).toBe(true);
            expect(spec.isDerived('fs')).toBe(false);
        });

        test('Derives Cms from Vas and Sd', () => {
            const spec = new DriverSpec({ fs: 22, qts: 0.53, vas: 248, sd: 1184 });
            // Cms = Vas / (ρ × c² × Sd²) with unit conversions
            expect(spec.cms).toBeCloseTo(0.000125, 4);  // ~0.000125 m/N
            expect(spec.isDerived('cms')).toBe(true);
        });

        test('Derives Rms from Fs, Mms, and Qms', () => {
            const spec = new DriverSpec({
                fs: 22, qts: 0.53, qes: 0.67, vas: 248, mms: 420
            });
            // Qms derived first, then Rms = (2π × Fs × Mms) / Qms
            expect(spec.rms).toBeCloseTo(22.9, 0);
            expect(spec.isDerived('rms')).toBe(true);
        });

        test('Derives Vd from Sd and Xmax', () => {
            const spec = new DriverSpec({ fs: 22, qts: 0.53, vas: 248, sd: 1184, xmax: 28 });
            // Vd = Sd × Xmax / 10 = 1184 × 28 / 10 = 3315.2
            expect(spec.vd).toBeCloseTo(3315.2, 0);
            expect(spec.isDerived('vd')).toBe(true);
        });

        test('Does not derive when value already provided', () => {
            const spec = new DriverSpec({
                fs: 22, qts: 0.53, qes: 0.67, vas: 248, qms: 2.5  // Provided, not derived
            });
            expect(spec.qms).toBe(2.5);
            expect(spec.isDerived('qms')).toBe(false);
        });
    });

    describe('DriverSpec - Provenance Tracking', () => {
        test('getSource returns correct status', () => {
            const spec = new DriverSpec({ fs: 22, qts: 0.53, qes: 0.67, vas: 248 });
            expect(spec.getSource('fs')).toBe('entered');
            expect(spec.getSource('qms')).toBe('derived');
            expect(spec.getSource('bl')).toBe('missing');
        });

        test('derivedParams lists all derived parameters', () => {
            const spec = new DriverSpec({
                fs: 22, qts: 0.53, qes: 0.67, vas: 248, sd: 1184, mms: 420, xmax: 28
            });
            const derived = spec.derivedParams;
            expect(derived).toContain('qms');
            expect(derived).toContain('cms');
            expect(derived).toContain('rms');
            expect(derived).toContain('vd');
            expect(derived.includes('fs')).toBe(false);  // fs is entered, not derived
        });

        test('getDerivationInfo returns formula and dependencies', () => {
            const spec = new DriverSpec({ fs: 22, qts: 0.53, qes: 0.67, vas: 248 });
            const info = spec.getDerivationInfo('qms');
            expect(info.from).toContain('qts');
            expect(info.from).toContain('qes');
            expect(info.formula).toContain('Qts');
        });
    });

    describe('DriverSpec - toDriver Conversion', () => {
        test('Produces valid Driver from complete spec', () => {
            const spec = new DriverSpec({
                fs: 22, qts: 0.53, qes: 0.67, vas: 248, re: 4.2,
                bl: 19.2, mms: 420, sd: 1184, xmax: 28, pe: 1200
            });
            const driver = spec.toDriver();
            expect(driver).toBeInstanceOf(Driver);
            expect(driver.fs).toBe(22);
            // Derived values should be passed to Driver
            expect(driver.qms).toBeCloseTo(2.54, 1);
            expect(driver.cms).toBeCloseTo(0.000125, 4);
        });

        test('canCreateDriver returns false for incomplete spec', () => {
            const spec = new DriverSpec({ fs: 22 });  // Missing qts and vas
            expect(spec.canCreateDriver()).toBe(false);
        });

        test('getValidationErrors lists missing required params', () => {
            const spec = new DriverSpec({ fs: 22, qts: 0.53 });  // Missing vas
            const errors = spec.getValidationErrors();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.includes('Vas'))).toBe(true);
        });
    });

    describe('DriverSpec - Serialization', () => {
        test('Round-trip preserves derivation tracking', () => {
            const original = new DriverSpec({ fs: 22, qts: 0.53, qes: 0.67, vas: 248 });
            const obj = original.toObject();
            const restored = DriverSpec.fromObject(obj);

            expect(restored.qms).toBeCloseTo(original.qms, 2);
            expect(restored.isDerived('qms')).toBe(true);  // Preserved
            expect(obj._derived).toContain('qms');  // Serialized
        });

        test('toObject includes _derived array', () => {
            const spec = new DriverSpec({ fs: 22, qts: 0.53, qes: 0.67, vas: 248 });
            const obj = spec.toObject();
            expect(Array.isArray(obj._derived)).toBe(true);
            expect(obj._derived).toContain('qms');
        });
    });

    describe('DriverSpec - Discrepancy Detection', () => {
        test('getDiscrepancies finds conflicts', () => {
            const spec = new DriverSpec({
                fs: 22, qts: 0.53, qes: 0.67, vas: 248,
                qms: 3.0  // Entered value differs from derivable 2.54
            });
            const discrepancies = spec.getDiscrepancies();
            expect(discrepancies.length).toBe(1);
            expect(discrepancies[0].param).toBe('qms');
            expect(discrepancies[0].entered).toBe(3.0);
            expect(discrepancies[0].derived).toBeCloseTo(2.54, 1);
        });

        test('calculateDerived returns what a param would be', () => {
            const spec = new DriverSpec({
                fs: 22, qts: 0.53, qes: 0.67, vas: 248,
                qms: 3.0  // Entered, so not auto-derived
            });
            // But we can still calculate what it would be
            const calculated = spec.calculateDerived('qms');
            expect(calculated).toBeCloseTo(2.54, 1);
        });
    });

    // ========================================================================
    // SEALED BOX MODEL
    // ========================================================================

    describe('SealedBox - Construction', () => {
        test('Accepts Driver instance and volume', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = new SealedBox(driver, 200);

            expect(box.volumeLiters).toBe(200);
            expect(box.driver).toBe(driver);
        });

        test('Rejects non-Driver instance', () => {
            expect(() => new SealedBox(VALID_DRIVER_PARAMS, 200))
                .toThrow('requires a Driver instance');
        });

        test('Rejects invalid volume', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            expect(() => new SealedBox(driver, -100)).toThrow('must be positive');
            expect(() => new SealedBox(driver, 0)).toThrow('must be positive');
            expect(() => new SealedBox(driver, 10000)).toThrow('unusually large');
        });

        test('Computes system parameters', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = new SealedBox(driver, 200);

            expect(box.alpha).toBeGreaterThan(0);
            expect(box.fc).toBeGreaterThan(driver.fs);
            expect(box.qtc).toBeGreaterThan(driver.qts);
            expect(box.f3).toBeGreaterThan(0);
        });
    });

    describe('SealedBox - Factory Methods', () => {
        test('Butterworth alignment gives Qtc ≈ 0.707', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            expect(box.qtc).toBeCloseTo(0.707, 2);
            expect(box.alignmentName).toBe('Butterworth');
        });

        test('Bessel alignment gives Qtc ≈ 0.577', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.bessel(driver);

            expect(box.qtc).toBeCloseTo(0.577, 2);
            expect(box.alignmentName).toBe('Bessel');
        });

        test('Chebyshev alignment gives Qtc ≈ 1.0', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.chebyshev(driver);

            expect(box.qtc).toBeCloseTo(1.0, 1);
            expect(box.alignmentName).toBe('Chebyshev');
        });

        test('volumeForQtc rejects impossible target', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            // Can't get Qtc below Qts in sealed box
            expect(() => SealedBox.volumeForQtc(driver, 0.3))
                .toThrow('must be greater than');
        });
    });

    describe('SealedBox - Response', () => {
        test('responseAt returns 0dB in passband', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            // Well above F3 should be ~0dB
            const highFreq = box.f3 * 5;
            expect(box.responseAt(highFreq)).toBeCloseTo(0, 0);
        });

        test('responseAt returns -3dB at F3', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            expect(box.responseAt(box.f3)).toBeCloseTo(-3, 0);
        });

        test('responseCurve returns array of points', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = new SealedBox(driver, 200);

            const curve = box.responseCurve(10, 200, 50);
            expect(curve.length).toBe(50);
            expect(curve[0].frequency).toBeCloseTo(10, 0);
            expect(curve[49].frequency).toBeCloseTo(200, 0);
        });
    });

    describe('SealedBox - Serialization', () => {
        test('Round-trip through toObject/fromObject', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const original = new SealedBox(driver, 200);

            const obj = original.toObject();
            expect(obj.type).toBe('sealed');

            const restored = SealedBox.fromObject(obj);
            expect(restored.volumeLiters).toBe(200);
            expect(restored.qtc).toBeCloseTo(original.qtc, 3);
        });

        test('toString returns readable summary', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const str = box.toString();
            expect(str).toContain('SealedBox');
            expect(str).toContain('Butterworth');
        });
    });

    // ========================================================================
    // PHASE AND GROUP DELAY
    // ========================================================================

    describe('SealedBox - Phase and Group Delay', () => {
        test('phaseAt returns degrees', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            // Phase at high frequencies approaches 0
            const highFreq = box.f3 * 10;
            expect(Math.abs(box.phaseAt(highFreq))).toBeLessThan(30);

            // Phase at resonance is around 90 degrees
            const atFc = box.phaseAt(box.fc);
            expect(Math.abs(atFc)).toBeGreaterThan(60);
        });

        test('groupDelayAt returns positive seconds', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            // Group delay should be positive (causal system)
            expect(box.groupDelayAt(box.fc)).toBeGreaterThan(0);

            // Group delay peaks near resonance and decreases at high frequencies
            const highFreq = box.f3 * 10;
            expect(box.groupDelayAt(highFreq)).toBeLessThan(box.groupDelayAt(box.fc));
        });
    });

    // ========================================================================
    // ENGINEERING: POWER AND EXCURSION
    // ========================================================================

    describe('SealedBox - Engineering (Power/Excursion)', () => {
        test('canCalculateLimits is true for full driver', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);
            expect(box.canCalculateLimits).toBe(true);
        });

        test('canCalculateLimits is false for minimal driver', () => {
            const driver = new Driver(MINIMAL_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);
            expect(box.canCalculateLimits).toBe(false);
        });

        test('excursionAt calculates displacement in mm', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            // At 30Hz with 100W, should get reasonable excursion
            const excursion = box.excursionAt(30, 100);
            expect(excursion).toBeGreaterThan(0);
            expect(excursion).toBeLessThan(50); // Should be less than 50mm
        });

        test('maxPowerAt returns limiting factor', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const result = box.maxPowerAt(30);
            expect(result.maxPower).toBeGreaterThan(0);
            expect(['excursion', 'thermal']).toContain(result.limitingFactor);
            expect(result.excursion).toBeGreaterThan(0);
        });

        test('powerCurve returns array of points', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const curve = box.powerCurve(10, 100, 10);
            expect(curve.length).toBe(10);
            expect(curve[0].frequency).toBeCloseTo(10, 0);
            expect(curve[0].maxPower).toBeGreaterThan(0);
        });

        test('excursionCurve shows overXmax flag', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            // High power at low frequency should exceed Xmax
            const curve = box.excursionCurve(1000, 10, 50, 10);
            expect(curve.length).toBe(10);

            // At low frequencies with high power, should exceed Xmax
            const lowFreqPoint = curve.find(p => p.frequency < 20);
            expect(lowFreqPoint.excursion).toBeGreaterThan(0);
        });
    });

    // ========================================================================
    // ALIGNMENT COMPARISON
    // ========================================================================

    describe('Alignment Comparison', () => {
        test('compareSealedAlignments returns multiple designs', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const result = compareSealedAlignments(driver);

            expect(result.alignments).toBeDefined();
            expect(result.alignments.butterworth).toBeDefined();
            expect(result.alignments.butterworth.qtc).toBeCloseTo(0.707, 2);
        });

        test('comparePortedAlignments returns QB3 and B4', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const port = new Port({ diameter: 10 });
            const result = comparePortedAlignments(driver, port);

            expect(result.alignments.qb3).toBeDefined();
            expect(result.alignments.qb3.fb).toBeCloseTo(driver.fs, 0);
            expect(result.alignments.b4).toBeDefined();
        });

        test('compareAllAlignments combines both', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const result = compareAllAlignments(driver, port);

            expect(result.sealed).toBeDefined();
            expect(result.ported).toBeDefined();
            expect(result.all.length).toBeGreaterThan(0);

            // Should be sorted by F3
            for (let i = 1; i < result.all.length; i++) {
                expect(result.all[i].f3).toBeGreaterThanOrEqual(result.all[i-1].f3);
            }
        });
    });

    // ========================================================================
    // IMPEDANCE CALCULATIONS
    // ========================================================================

    describe('SealedBox - Impedance', () => {
        test('canCalculateImpedance is true for full driver', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);
            expect(box.canCalculateImpedance).toBe(true);
        });

        test('canCalculateImpedance is false for minimal driver', () => {
            const driver = new Driver(MINIMAL_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);
            expect(box.canCalculateImpedance).toBe(false);
        });

        test('impedanceAt returns magnitude and phase', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const z = box.impedanceAt(box.fc);
            expect(z.magnitude).toBeGreaterThan(0);
            expect(typeof z.phase).toBe('number');
        });

        test('impedance peaks at Fc', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const zAtFc = box.impedanceAt(box.fc);
            const zBelow = box.impedanceAt(box.fc / 2);
            const zAbove = box.impedanceAt(box.fc * 2);

            // Impedance should peak near Fc
            expect(zAtFc.magnitude).toBeGreaterThan(zBelow.magnitude);
            expect(zAtFc.magnitude).toBeGreaterThan(zAbove.magnitude);
        });

        test('impedanceCurve returns array of points', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const curve = box.impedanceCurve(10, 200, 20);
            expect(curve.length).toBe(20);
            expect(curve[0].frequency).toBeCloseTo(10, 0);
            expect(curve[0].magnitude).toBeGreaterThan(0);
        });
    });

    // ========================================================================
    // SPL CALCULATIONS
    // ========================================================================

    describe('SealedBox - SPL', () => {
        test('canCalculateSpl is true when sensitivity and re present', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);
            expect(box.canCalculateSpl).toBe(true);
        });

        test('canCalculateSpl is false when sensitivity or re missing', () => {
            const driver = new Driver(MINIMAL_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);
            expect(box.canCalculateSpl).toBe(false);
        });

        test('splAt returns realistic values', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            // At 1W in passband, should be near sensitivity
            const spl = box.splAt(100, 1);
            expect(spl).toBeGreaterThan(70);  // Reasonable minimum
            expect(spl).toBeLessThan(100);    // Reasonable maximum
        });

        test('SPL increases with power', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const spl1W = box.splAt(50, 1);
            const spl10W = box.splAt(50, 10);

            // 10× power = +10dB
            expect(spl10W - spl1W).toBeCloseTo(10, 0);
        });

        test('maxSplAt returns limiting factor', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const result = box.maxSplAt(30);
            expect(result.maxSpl).toBeGreaterThan(90);  // Should be loud
            expect(['excursion', 'thermal']).toContain(result.limitingFactor);
        });

        test('maxSplCurve returns array', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const curve = box.maxSplCurve(20, 100, 10);
            expect(curve.length).toBe(10);
            expect(curve[0].maxSpl).toBeGreaterThan(0);
        });
    });

    // ========================================================================
    // THERMAL/EXCURSION LIMIT CURVES
    // ========================================================================

    describe('SealedBox - Limit Curves', () => {
        test('thermalLimitCurve follows response shape', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const curve = box.thermalLimitCurve(20, 100, 10);
            expect(curve.length).toBe(10);

            // Thermal limit follows response shape - lower at low frequencies
            expect(curve[0].spl).toBeLessThan(curve[9].spl);
        });

        test('excursionLimitCurve rises with frequency', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const curve = box.excursionLimitCurve(20, 100, 10);
            expect(curve.length).toBe(10);

            // Excursion limit rises with frequency (less excursion needed)
            expect(curve[0].spl).toBeLessThan(curve[9].spl);
        });

        test('excursion limit is below thermal at low frequencies', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const thermal = box.thermalLimitCurve(20, 20, 1)[0].spl;
            const excursion = box.excursionLimitCurve(20, 20, 1)[0].spl;

            // At 20Hz, excursion should be the limiting factor
            expect(excursion).toBeLessThan(thermal);
        });

        test('usableF3At returns valid frequency', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const result = box.usableF3At(105);
            expect(result.usableF3).toBeGreaterThan(10);
            expect(result.usableF3).toBeLessThan(100);
            expect(['excursion', 'thermal']).toContain(result.limitingFactor);
            expect(result.headroomDb).toBeGreaterThanOrEqual(0);
        });

        test('headroomCurve returns correct structure', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const curve = box.headroomCurve(105, 20, 100, 10);
            expect(curve.length).toBe(10);

            // Each point should have the expected properties
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('headroom');
            expect(curve[0]).toHaveProperty('maxSpl');
            expect(curve[0]).toHaveProperty('limitingFactor');

            // Headroom = maxSpl - target
            expect(curve[0].headroom).toBeCloseTo(curve[0].maxSpl - 105, 0.1);
        });

        test('headroomCurve increases with frequency (more headroom at higher f)', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const curve = box.headroomCurve(105, 20, 100, 10);

            // Headroom should be higher at high frequencies (thermal still limiting)
            expect(curve[9].headroom).toBeGreaterThan(curve[0].headroom);
        });

        test('higher target SPL = higher usable F3', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const box = SealedBox.butterworth(driver);

            const f3At100dB = box.usableF3At(100).usableF3;
            const f3At110dB = box.usableF3At(110).usableF3;

            // Need higher frequency to hit higher SPL
            expect(f3At110dB).toBeGreaterThan(f3At100dB);
        });
    });

    // ========================================================================
    // REFERENCE SUB MODEL
    // ========================================================================

    describe('ReferenceSub - Construction', () => {
        const VALID_REF_DATA = {
            name: 'Test Sub',
            cea2010: [
                { hz: 20, dB: 95 },
                { hz: 40, dB: 110 },
                { hz: 80, dB: 115 }
            ]
        };

        test('Accepts valid data', () => {
            const sub = new ReferenceSub(VALID_REF_DATA);
            expect(sub.name).toBe('Test Sub');
            expect(sub.dataPointCount).toBe(3);
        });

        test('Generates ID from name', () => {
            const sub = new ReferenceSub(VALID_REF_DATA);
            expect(sub.id).toBe('test-sub');
        });

        test('Uses provided ID if given', () => {
            const sub = new ReferenceSub({ ...VALID_REF_DATA, id: 'custom-id' });
            expect(sub.id).toBe('custom-id');
        });

        test('Defaults type to sealed', () => {
            const sub = new ReferenceSub(VALID_REF_DATA);
            expect(sub.type).toBe('sealed');
        });

        test('Accepts ported type', () => {
            const sub = new ReferenceSub({ ...VALID_REF_DATA, type: 'ported' });
            expect(sub.type).toBe('ported');
        });

        test('Rejects missing name', () => {
            expect(() => new ReferenceSub({ cea2010: VALID_REF_DATA.cea2010 }))
                .toThrow('requires a name');
        });

        test('Rejects missing cea2010', () => {
            expect(() => new ReferenceSub({ name: 'Test' }))
                .toThrow('requires cea2010');
        });

        test('Rejects fewer than 3 data points', () => {
            expect(() => new ReferenceSub({
                name: 'Test',
                cea2010: [{ hz: 20, dB: 95 }, { hz: 40, dB: 100 }]
            })).toThrow('at least 3 data points');
        });

        test('Sorts data by frequency', () => {
            const sub = new ReferenceSub({
                name: 'Test',
                cea2010: [
                    { hz: 80, dB: 115 },
                    { hz: 20, dB: 95 },
                    { hz: 40, dB: 110 }
                ]
            });
            const data = sub.cea2010Data;
            expect(data[0].hz).toBe(20);
            expect(data[1].hz).toBe(40);
            expect(data[2].hz).toBe(80);
        });
    });

    describe('ReferenceSub - Interpolation', () => {
        const sub = new ReferenceSub({
            name: 'Test Sub',
            cea2010: [
                { hz: 20, dB: 90 },
                { hz: 40, dB: 100 },
                { hz: 80, dB: 110 },
                { hz: 160, dB: 115 }
            ]
        });

        test('Returns exact value at measured frequency', () => {
            expect(sub.maxSplAt(20)).toBe(90);
            expect(sub.maxSplAt(40)).toBe(100);
            expect(sub.maxSplAt(80)).toBe(110);
        });

        test('Interpolates between measured points', () => {
            // Midpoint in log-frequency between 20 and 40 is ~28.3 Hz
            // At 30 Hz, should be between 90 and 100
            const spl30 = sub.maxSplAt(30);
            expect(spl30).toBeGreaterThan(90);
            expect(spl30).toBeLessThan(100);
        });

        test('Extrapolates below measured range', () => {
            const spl10 = sub.maxSplAt(10);
            expect(spl10).toBeLessThan(90);  // Below 20 Hz value
        });

        test('Extrapolates above measured range', () => {
            const spl200 = sub.maxSplAt(200);
            expect(spl200).toBeGreaterThan(115);  // Above 160 Hz value
        });

        test('Quantity adds 6 dB for 2 subs', () => {
            const spl1 = sub.maxSplAt(40, 1);
            const spl2 = sub.maxSplAt(40, 2);
            expect(spl2 - spl1).toBeCloseTo(6, 0.1);  // 10*log10(2) ≈ 6 dB
        });

        test('Quantity adds 12 dB for 4 subs', () => {
            const spl1 = sub.maxSplAt(40, 1);
            const spl4 = sub.maxSplAt(40, 4);
            expect(spl4 - spl1).toBeCloseTo(12, 0.1);  // 10*log10(4) ≈ 12 dB
        });
    });

    describe('ReferenceSub - Curves', () => {
        const sub = new ReferenceSub({
            name: 'Test Sub',
            cea2010: [
                { hz: 20, dB: 90 },
                { hz: 40, dB: 100 },
                { hz: 80, dB: 110 }
            ]
        });

        test('maxSplCurve returns correct number of points', () => {
            const curve = sub.maxSplCurve(20, 80, 10);
            expect(curve.length).toBe(10);
        });

        test('maxSplCurve includes frequency and spl', () => {
            const curve = sub.maxSplCurve(20, 80, 5);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('spl');
        });

        test('headroomCurve calculates margin to target', () => {
            const curve = sub.headroomCurve(100, 20, 80, 5);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('headroom');
            expect(curve[0]).toHaveProperty('maxSpl');

            // At 20 Hz, max is 90 dB, target is 100, so headroom is -10
            expect(curve[0].headroom).toBeCloseTo(-10, 1);
        });
    });

    describe('ReferenceSub - Serialization', () => {
        const originalData = {
            name: 'Test Sub',
            type: 'ported',
            source: 'test-source',
            cea2010: [
                { hz: 20, dB: 90 },
                { hz: 40, dB: 100 },
                { hz: 80, dB: 110 }
            ]
        };

        test('toJSON returns valid object', () => {
            const sub = new ReferenceSub(originalData);
            const json = sub.toJSON();

            expect(json.name).toBe('Test Sub');
            expect(json.type).toBe('ported');
            expect(json.source).toBe('test-source');
            expect(json.cea2010.length).toBe(3);
        });

        test('fromJSON recreates equivalent object', () => {
            const sub = new ReferenceSub(originalData);
            const json = sub.toJSON();
            const restored = ReferenceSub.fromJSON(json);

            expect(restored.name).toBe(sub.name);
            expect(restored.type).toBe(sub.type);
            expect(restored.maxSplAt(40)).toBe(sub.maxSplAt(40));
        });

        test('fromJSON works with JSON string', () => {
            const sub = new ReferenceSub(originalData);
            const jsonString = JSON.stringify(sub.toJSON());
            const restored = ReferenceSub.fromJSON(jsonString);

            expect(restored.name).toBe(sub.name);
        });
    });

    describe('ReferenceSub - Validation', () => {
        test('validate returns valid for good data', () => {
            const result = ReferenceSub.validate({
                name: 'Test',
                cea2010: [
                    { hz: 20, dB: 90 },
                    { hz: 40, dB: 100 },
                    { hz: 80, dB: 110 }
                ]
            });
            expect(result.valid).toBe(true);
            expect(result.name).toBe('Test');
            expect(result.points).toBe(3);
        });

        test('validate returns error for missing name', () => {
            const result = ReferenceSub.validate({ cea2010: [] });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('name');
        });

        test('validate returns error for invalid JSON string', () => {
            const result = ReferenceSub.validate('not json');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid JSON');
        });
    });

    describe('ReferenceSub - Built-in Subs', () => {
        test('BUILTIN_REFERENCE_SUBS contains expected subs', () => {
            expect(BUILTIN_REFERENCE_SUBS.length).toBeGreaterThan(0);

            const svsSb3000 = BUILTIN_REFERENCE_SUBS.find(s => s.id === 'svs-sb3000');
            expect(svsSb3000).toBeDefined();
            expect(svsSb3000.name).toBe('SVS SB-3000');
        });

        test('Built-in subs can be instantiated', () => {
            const data = BUILTIN_REFERENCE_SUBS[0];
            const sub = new ReferenceSub(data);

            expect(sub.name).toBe(data.name);
            expect(sub.dataPointCount).toBe(data.cea2010.length);
        });

        test('SVS SB-3000 has realistic values', () => {
            const data = BUILTIN_REFERENCE_SUBS.find(s => s.id === 'svs-sb3000');
            const sub = new ReferenceSub(data);

            // Should be around 93-94 dB at 20 Hz based on data-bass
            const spl20 = sub.maxSplAt(20);
            expect(spl20).toBeGreaterThan(90);
            expect(spl20).toBeLessThan(100);

            // Should be around 117-118 dB at 80 Hz
            const spl80 = sub.maxSplAt(80);
            expect(spl80).toBeGreaterThan(115);
            expect(spl80).toBeLessThan(120);
        });
    });

    // ========================================================================
    // PORT MODEL
    // ========================================================================

    describe('Port - Construction', () => {
        test('Creates circular port from diameter', () => {
            const port = new Port({ diameter: 10 });
            expect(port.type).toBe('circular');
            expect(port.diameterCm).toBe(10);
            expect(port.quantity).toBe(1);
            expect(port.flared).toBe(false);
        });

        test('Creates flared port', () => {
            const port = new Port({ diameter: 10, flared: true });
            expect(port.flared).toBe(true);
            expect(port.maxVelocity).toBeGreaterThan(25);  // Higher limit for flared
        });

        test('Creates multiple ports', () => {
            const port = new Port({ diameter: 7.5, quantity: 2 });
            expect(port.quantity).toBe(2);
            // Total area = 2 * π * (3.75cm)² ≈ 88.4 cm²
            expect(port.totalAreaCm2).toBeCloseTo(88.4, 0);
        });

        test('Creates rectangular port', () => {
            const port = new Port({ width: 5, height: 20 });
            expect(port.type).toBe('rectangular');
            expect(port.widthCm).toBe(5);
            expect(port.heightCm).toBe(20);
        });

        test('Creates slot port (high aspect ratio)', () => {
            const port = new Port({ width: 2, height: 30 });
            expect(port.type).toBe('slot');
        });

        test('Rejects both diameter and width/height', () => {
            expect(() => new Port({ diameter: 10, width: 5, height: 20 }))
                .toThrow('not both');
        });

        test('Rejects invalid quantity', () => {
            expect(() => new Port({ diameter: 10, quantity: 5 }))
                .toThrow('1, 2, 3, or 4');
        });

        test('Rejects negative diameter', () => {
            expect(() => new Port({ diameter: -10 }))
                .toThrow('must be positive');
        });
    });

    describe('Port - Calculations', () => {
        test('lengthFor returns positive length', () => {
            const port = new Port({ diameter: 10, flared: true });
            const length = port.lengthFor(28, 0.14);  // 28Hz, 140L
            expect(length).toBeGreaterThan(0);
            expect(length).toBeLessThan(1);  // Less than 1 meter
        });

        test('velocityFor calculates from volume velocity', () => {
            const port = new Port({ diameter: 10 });
            // Volume velocity = 0.01 m³/s, area ≈ 0.00785 m²
            const velocity = port.velocityFor(0.01);
            expect(velocity).toBeCloseTo(0.01 / port.totalArea, 1);
        });

        test('machFor returns reasonable Mach number', () => {
            const port = new Port({ diameter: 10 });
            const mach = port.machFor(17);  // 17 m/s
            expect(mach).toBeCloseTo(0.05, 2);  // Mach = 17/343 ≈ 0.05
        });

        test('reynoldsFor returns turbulent range values', () => {
            const port = new Port({ diameter: 10 });
            const re = port.reynoldsFor(10);  // 10 m/s
            expect(re).toBeGreaterThan(4000);  // Turbulent flow
        });

        test('Multiple ports increase velocity limit', () => {
            const single = new Port({ diameter: 7.5 });
            const double = new Port({ diameter: 7.5, quantity: 2 });
            // Same velocity goes through more area with double ports
            expect(double.totalArea).toBeGreaterThan(single.totalArea);
        });
    });

    describe('Port - Serialization', () => {
        test('Round-trip circular port', () => {
            const original = new Port({ diameter: 10, flared: true, quantity: 2 });
            const obj = original.toObject();
            const restored = Port.fromObject(obj);

            expect(restored.type).toBe('circular');
            expect(restored.diameterCm).toBe(10);
            expect(restored.flared).toBe(true);
            expect(restored.quantity).toBe(2);
        });

        test('Round-trip rectangular port', () => {
            const original = new Port({ width: 5, height: 20 });
            const obj = original.toObject();
            const restored = Port.fromObject(obj);

            expect(restored.type).toBe('rectangular');
            expect(restored.widthCm).toBe(5);
            expect(restored.heightCm).toBe(20);
        });
    });

    // ========================================================================
    // PASSIVE RADIATOR MODEL
    // ========================================================================

    describe('PassiveRadiator - Construction', () => {
        test('Creates PR from basic params', () => {
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            expect(pr.mmpGrams).toBe(156);
            expect(pr.sdCm2).toBe(507);
            expect(pr.xmaxMm).toBe(22);
            expect(pr.quantity).toBe(1);
        });

        test('Creates multiple PRs', () => {
            const pr = new PassiveRadiator({ mmp: 100, sd: 400, xmax: 20, quantity: 2 });
            expect(pr.quantity).toBe(2);
            expect(pr.totalMassGrams).toBe(200);
            expect(pr.totalAreaCm2).toBe(800);
        });

        test('Stores SI units internally', () => {
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            expect(pr.mmpKg).toBeCloseTo(0.156, 3);
            expect(pr.sdSI).toBeCloseTo(0.0507, 4);
            expect(pr.xmaxSI).toBeCloseTo(0.022, 3);
        });

        test('Rejects invalid quantity', () => {
            expect(() => new PassiveRadiator({ mmp: 100, sd: 400, xmax: 20, quantity: 5 }))
                .toThrow('1, 2, 3, or 4');
        });

        test('Rejects zero mass', () => {
            expect(() => new PassiveRadiator({ mmp: 0, sd: 400, xmax: 20 }))
                .toThrow('must be positive');
        });
    });

    describe('PassiveRadiator - Calculations', () => {
        test('tuningFor calculates resonance frequency', () => {
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            const fb = pr.tuningFor(0.14);  // 140L box
            expect(fb).toBeGreaterThan(15);
            expect(fb).toBeLessThan(30);
        });

        test('requiredMassFor returns mass for target tuning', () => {
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            const requiredMass = pr.requiredMassFor(25, 0.14);  // 25Hz in 140L
            expect(requiredMass).toBeGreaterThan(50);
            expect(requiredMass).toBeLessThan(500);
        });

        test('canTuneTo returns true for reasonable tuning', () => {
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            expect(pr.canTuneTo(25, 0.14)).toBe(true);
        });

        test('canTuneTo returns false for impossible tuning', () => {
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            expect(pr.canTuneTo(100, 0.14)).toBe(false);  // Too high
        });
    });

    describe('PassiveRadiator - Database', () => {
        test('fromDatabase loads known PR', () => {
            const pr = PassiveRadiator.fromDatabase('dayton-sd315-pr');
            expect(pr.mmpGrams).toBe(156);
            expect(pr.sdCm2).toBe(507);
            expect(pr.model).toBe('Dayton Audio SD315-PR');
        });

        test('fromDatabase throws for unknown PR', () => {
            expect(() => PassiveRadiator.fromDatabase('unknown-pr'))
                .toThrow('Unknown PR model');
        });

        test('getAvailableModels returns list', () => {
            const models = PassiveRadiator.getAvailableModels();
            expect(models.length).toBeGreaterThan(0);
            expect(models[0]).toHaveProperty('id');
            expect(models[0]).toHaveProperty('model');
        });
    });

    describe('PassiveRadiator - Serialization', () => {
        test('Round-trip PR', () => {
            const original = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22, qmp: 4 });
            const obj = original.toObject();
            const restored = PassiveRadiator.fromObject(obj);

            expect(restored.mmpGrams).toBe(156);
            expect(restored.sdCm2).toBe(507);
            expect(restored.xmaxMm).toBe(22);
            expect(restored.qmp).toBe(4);
        });
    });

    // ========================================================================
    // VENTED BOX MODEL
    // ========================================================================

    describe('VentedBox - Construction with Port', () => {
        test('Creates VentedBox with circular port', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10, flared: true });
            const box = new VentedBox(driver, 140, 28, port);

            expect(box.volumeLiters).toBe(140);
            expect(box.fb).toBe(28);
            expect(box.isPort).toBe(true);
            expect(box.isPassiveRadiator).toBe(false);
            expect(box.ventType).toBe('port');
        });

        test('Calculates port length', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10, flared: true });
            const box = new VentedBox(driver, 140, 28, port);

            expect(box.portLengthCm).toBeGreaterThan(5);
            expect(box.portLengthCm).toBeLessThan(50);
        });

        test('Has valid F3', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = new VentedBox(driver, 140, 28, port);

            expect(box.f3).toBeGreaterThan(20);
            expect(box.f3).toBeLessThan(40);
        });
    });

    describe('VentedBox - Construction with PassiveRadiator', () => {
        test('Creates VentedBox with PR', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            const box = new VentedBox(driver, 140, 28, pr);

            expect(box.volumeLiters).toBe(140);
            expect(box.fb).toBe(28);
            expect(box.isPort).toBe(false);
            expect(box.isPassiveRadiator).toBe(true);
            expect(box.ventType).toBe('passive-radiator');
        });

        test('PR box has no port length', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            const box = new VentedBox(driver, 140, 28, pr);

            expect(box.portLengthCm).toBe(null);
        });
    });

    describe('VentedBox - Response (both vent types)', () => {
        test('Port and PR have similar response', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });

            const portBox = new VentedBox(driver, 140, 28, port);
            const prBox = new VentedBox(driver, 140, 28, pr);

            // Response should be similar (within a few dB)
            const portResp = portBox.responseAt(40);
            const prResp = prBox.responseAt(40);
            expect(Math.abs(portResp - prResp)).toBeLessThan(3);
        });

        test('responseAt returns reasonable values', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = new VentedBox(driver, 140, 28, port);

            // Passband should be near 0 dB
            expect(box.responseAt(50)).toBeGreaterThan(-3);
            expect(box.responseAt(50)).toBeLessThan(6);

            // Below Fb should roll off
            expect(box.responseAt(15)).toBeLessThan(-6);
        });

        test('responseCurve returns array of points', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = new VentedBox(driver, 140, 28, port);

            const curve = box.responseCurve(10, 200, 50);
            expect(curve.length).toBe(50);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('db');
        });
    });

    describe('VentedBox - Vent-specific Curves', () => {
        test('portVelocityCurve works for port vent', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = new VentedBox(driver, 140, 28, port);

            const curve = box.portVelocityCurve(500);
            expect(curve.length).toBe(50);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('velocity');
            expect(curve[0]).toHaveProperty('overLimit');
        });

        test('portVelocityCurve throws for PR vent', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            const box = new VentedBox(driver, 140, 28, pr);

            expect(() => box.portVelocityCurve(500)).toThrow('only available for port');
        });

        test('prExcursionCurve works for PR vent', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            const box = new VentedBox(driver, 140, 28, pr);

            const curve = box.prExcursionCurve(500);
            expect(curve.length).toBe(50);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('excursion');
            expect(curve[0]).toHaveProperty('overXmax');
        });

        test('prExcursionCurve throws for port vent', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = new VentedBox(driver, 140, 28, port);

            expect(() => box.prExcursionCurve(500)).toThrow('only available for passive radiator');
        });

        test('portMachCurve returns Mach data', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = new VentedBox(driver, 140, 28, port);

            const curve = box.portMachCurve(500);
            expect(curve.length).toBe(50);
            expect(curve[0]).toHaveProperty('mach');
            expect(curve[0]).toHaveProperty('overSafe');
            expect(curve[0]).toHaveProperty('overCaution');
        });

        test('portReynoldsCurve returns Reynolds data', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = new VentedBox(driver, 140, 28, port);

            const curve = box.portReynoldsCurve(500);
            expect(curve.length).toBe(50);
            expect(curve[0]).toHaveProperty('reynolds');
            expect(curve[0]).toHaveProperty('turbulent');
            expect(curve[0]).toHaveProperty('highlyTurbulent');
        });
    });

    describe('VentedBox - Factory Methods', () => {
        test('qb3 creates QB3 alignment', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            // QB3 has Fb ≈ Fs
            expect(Math.abs(box.fb - driver.fs)).toBeLessThan(5);
        });

        test('b4 creates B4 alignment', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const port = new Port({ diameter: 8 });
            const box = VentedBox.b4(driver, port);

            expect(box.volumeLiters).toBeGreaterThan(0);
            expect(box.fb).toBeGreaterThan(0);
        });
    });

    describe('VentedBox - Serialization', () => {
        test('Round-trip port VentedBox', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10, flared: true });
            const original = new VentedBox(driver, 140, 28, port);

            const obj = original.toObject();
            expect(obj.type).toBe('vented');
            expect(obj.ventType).toBe('port');

            const restored = VentedBox.fromObject(obj);
            expect(restored.volumeLiters).toBe(140);
            expect(restored.fb).toBe(28);
            expect(restored.isPort).toBe(true);
            expect(restored.vent.flared).toBe(true);
        });

        test('Round-trip PR VentedBox', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22 });
            const original = new VentedBox(driver, 140, 28, pr);

            const obj = original.toObject();
            expect(obj.type).toBe('vented');
            expect(obj.ventType).toBe('passive-radiator');

            const restored = VentedBox.fromObject(obj);
            expect(restored.volumeLiters).toBe(140);
            expect(restored.isPassiveRadiator).toBe(true);
            expect(restored.vent.mmpGrams).toBe(156);
        });
    });

    describe('VentedBox - Limit Curves and SPL Methods', () => {
        test('thermalLimitCurve returns SPL at Pe', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10, flared: true });
            const box = VentedBox.qb3(driver, port);

            const curve = box.thermalLimitCurve(20, 100, 10);
            expect(curve.length).toBe(10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('spl');
            // Thermal limit should produce realistic SPL values
            expect(curve[0].spl).toBeGreaterThan(90);
            expect(curve[0].spl).toBeLessThan(140);
        });

        test('excursionLimitCurve rises with frequency', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10, flared: true });
            const box = VentedBox.qb3(driver, port);

            const curve = box.excursionLimitCurve(20, 100, 10);
            expect(curve.length).toBe(10);
            // Excursion limit increases with frequency (f² relationship)
            expect(curve[9].spl).toBeGreaterThan(curve[0].spl);
        });

        test('headroomCurve calculates margin to target', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10, flared: true });
            const box = VentedBox.qb3(driver, port);

            const curve = box.headroomCurve(100, 20, 100, 10);
            expect(curve.length).toBe(10);
            expect(curve[0]).toHaveProperty('headroom');
            expect(curve[0]).toHaveProperty('maxSpl');
            expect(curve[0]).toHaveProperty('limitingFactor');
            // Headroom = maxSpl - target
            expect(curve[0].headroom).toBeCloseTo(curve[0].maxSpl - 100, 1);
        });

        test('usableF3At finds lowest usable frequency', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10, flared: true });
            const box = VentedBox.qb3(driver, port);

            const result = box.usableF3At(100);
            expect(result).toHaveProperty('usableF3');
            expect(result).toHaveProperty('limitingFactor');
            expect(result).toHaveProperty('headroomDb');
            expect(result.usableF3).toBeGreaterThan(0);
            expect(result.usableF3).toBeLessThan(200);
        });

        test('findImpedancePeaks returns fL and fH', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10, flared: true });
            const box = VentedBox.qb3(driver, port);

            const peaks = box.findImpedancePeaks();
            expect(peaks).toHaveProperty('fL');
            expect(peaks).toHaveProperty('fH');
            // fL < Fb < fH for vented box
            expect(peaks.fL).toBeLessThan(box.fb);
            expect(peaks.fH).toBeGreaterThan(box.fb);
        });
    });

    describe('VentedBox - Factory Methods Require Explicit Vent', () => {
        test('qb3 throws without vent specification', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            expect(() => VentedBox.qb3(driver)).toThrow('require explicit vent');
        });

        test('qb3 works with portDiameterCm and portFlared in options', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const box = VentedBox.qb3(driver, { portDiameterCm: 15, portFlared: true });

            expect(box.isPort).toBe(true);
            expect(box.vent.diameterCm).toBe(15);
            expect(box.fb).toBeCloseTo(driver.fs, 1);  // QB3: Fb ≈ Fs
        });

        test('qb3 throws without portFlared', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            expect(() => VentedBox.qb3(driver, { portDiameterCm: 15 })).toThrow('portFlared');
        });

        test('qb3 works with explicit Port', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            expect(box.isPort).toBe(true);
            expect(box.vent.diameterCm).toBe(10);
        });

        test('b4 throws without vent specification', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            expect(() => VentedBox.b4(driver)).toThrow('require explicit vent');
        });

        test('b4 works with explicit Port (lossless by default)', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.b4(driver, port);

            expect(box.isPort).toBe(true);
            expect(box.volumeLiters).toBeGreaterThan(0);
        });

        test('c4 throws without vent specification', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            expect(() => VentedBox.c4(driver)).toThrow('require explicit vent');
        });

        test('c4 throws without k parameter', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const port = new Port({ diameter: 10 });
            expect(() => VentedBox.c4(driver, port)).toThrow('requires options.k');
        });

        test('c4 works with explicit Port and k', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.c4(driver, port, { k: 0.5 });

            expect(box.isPort).toBe(true);
            expect(box.volumeLiters).toBeGreaterThan(0);
        });
    });

    describe('VentedBox - Vented-specific Behavior', () => {
        test('excursionAt shows null near Fb (critical ported behavior)', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            // Excursion near Fb should be lower than well below Fb
            const atFb = box.excursionAt(box.fb, 100);
            const wellBelow = box.excursionAt(box.fb / 2, 100);

            // Below tuning, excursion increases (cone unloaded)
            expect(wellBelow).toBeGreaterThan(atFb);
        });

        test('maxPowerAt peaks near Fb (port unloads cone)', () => {
            const driver = new Driver(VALID_DRIVER_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            // Power handling is highest near Fb (excursion null)
            const atFb = box.maxPowerAt(box.fb);
            const wellBelow = box.maxPowerAt(box.fb / 2);

            expect(atFb.maxPower).toBeGreaterThan(wellBelow.maxPower);
        });

        test('response rolls off steeply below Fb (4th-order)', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            // Deep bass should be heavily attenuated (4th-order = 24dB/octave)
            const veryLow = box.f3 / 3;
            expect(box.responseAt(veryLow)).toBeLessThan(-10);
        });

        test('phaseAt returns degrees in vented box', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            // Phase at high frequencies approaches 0
            expect(Math.abs(box.phaseAt(200))).toBeLessThan(30);
        });

        test('groupDelayAt returns positive seconds in vented box', () => {
            const driver = new Driver(LOW_QTS_PARAMS);
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            // Group delay should be positive
            expect(box.groupDelayAt(box.fb)).toBeGreaterThan(0);
        });
    });

    // ========================================================================
    // CURVE METHOD SMOKE TESTS
    // ========================================================================
    // Ensures all curve methods exist, are callable, and return expected shapes.
    // These tests catch bugs like:
    // - "box.maxPowerCurve is not a function" (method doesn't exist)
    // - yKey mismatch (curve returns 'magnitude' but UI expects 'impedance')
    //
    // Run against CurveContracts to verify model ↔ UI contract integrity.

    describe('Curve Methods: SealedBox', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);
        const box = new SealedBox(driver, 100);

        test('responseCurve returns {frequency, db}', () => {
            const curve = box.responseCurve(10, 200, 10);
            expect(Array.isArray(curve)).toBe(true);
            expect(curve.length).toBe(10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('db');
        });

        test('phaseCurve returns {frequency, phase}', () => {
            const curve = box.phaseCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('phase');
        });

        test('groupDelayCurve returns {frequency, delay}', () => {
            const curve = box.groupDelayCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('delay');
            // Delay in ms (converted from seconds)
            expect(curve[0].delay).toBeGreaterThan(0);
        });

        test('impedanceCurve returns {frequency, magnitude, phase}', () => {
            const curve = box.impedanceCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('magnitude');  // NOT 'impedance'!
            expect(curve[0]).toHaveProperty('phase');
        });

        test('currentDrawCurve returns {frequency, current}', () => {
            const curve = box.currentDrawCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('current');
        });

        test('epdrCurve returns {frequency, epdr}', () => {
            const curve = box.epdrCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('epdr');
        });

        test('apparentPowerCurve returns {frequency, va}', () => {
            const curve = box.apparentPowerCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('va');
        });

        test('thermalDissipationCurve returns {frequency, thermal}', () => {
            const curve = box.thermalDissipationCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('thermal');
        });

        test('excursionCurve returns {frequency, excursion, overXmax}', () => {
            const curve = box.excursionCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('excursion');
            expect(curve[0]).toHaveProperty('overXmax');
        });

        test('coneVelocityCurve returns {frequency, velocity}', () => {
            const curve = box.coneVelocityCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('velocity');
        });

        test('coneAccelerationCurve returns {frequency, accelG, accelMs2}', () => {
            const curve = box.coneAccelerationCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('accelG');
            expect(curve[0]).toHaveProperty('accelMs2');
        });

        test('splCurve returns {frequency, spl}', () => {
            const curve = box.splCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('spl');
        });

        test('maxSplCurve returns {frequency, maxSpl, maxPower, limitingFactor}', () => {
            const curve = box.maxSplCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('maxSpl');
            expect(curve[0]).toHaveProperty('maxPower');
            expect(curve[0]).toHaveProperty('limitingFactor');
        });

        test('powerCurve returns {frequency, maxPower, limitingFactor, excursion}', () => {
            const curve = box.powerCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('maxPower');
            expect(curve[0]).toHaveProperty('limitingFactor');
            expect(curve[0]).toHaveProperty('excursion');
        });

        test('headroomCurve returns {frequency, headroom, maxSpl, limitingFactor}', () => {
            const curve = box.headroomCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('headroom');
            expect(curve[0]).toHaveProperty('maxSpl');
            expect(curve[0]).toHaveProperty('limitingFactor');
        });

        test('stepResponseCurve returns {time, amplitude}', () => {
            const curve = box.stepResponseCurve(0.1, 20);
            expect(curve[0]).toHaveProperty('time');
            expect(curve[0]).toHaveProperty('amplitude');
            // Time in seconds
            expect(curve[0].time).toBeGreaterThanOrEqual(0);
        });

        test('impulseResponseCurve returns {time, amplitude}', () => {
            const curve = box.impulseResponseCurve(0.1, 20);
            expect(curve[0]).toHaveProperty('time');
            expect(curve[0]).toHaveProperty('amplitude');
        });

        test('compressionCurve returns {frequency, compressionDb, excursion, excursionPct}', () => {
            const curve = box.compressionCurve(500, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('compressionDb');
            expect(curve[0]).toHaveProperty('excursion');
            expect(curve[0]).toHaveProperty('excursionPct');
        });

        test('distortionCurve returns {frequency, thd, hd2, hd3, severity}', () => {
            const curve = box.distortionCurve(500, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('thd');
            expect(curve[0]).toHaveProperty('hd2');
            expect(curve[0]).toHaveProperty('hd3');
            expect(curve[0]).toHaveProperty('severity');
        });
    });

    describe('Curve Methods: VentedBox', () => {
        // Need VALID_DRIVER_PARAMS for full engineering curves
        const driver = new Driver(VALID_DRIVER_PARAMS);
        const port = new Port({ diameter: 10 });
        const box = VentedBox.qb3(driver, port);

        test('responseCurve returns {frequency, db}', () => {
            const curve = box.responseCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('db');
        });

        test('phaseCurve returns {frequency, phase}', () => {
            const curve = box.phaseCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('phase');
        });

        test('groupDelayCurve returns {frequency, delay}', () => {
            const curve = box.groupDelayCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('delay');
        });

        test('impedanceCurve returns {frequency, magnitude, phase}', () => {
            const curve = box.impedanceCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('magnitude');
            expect(curve[0]).toHaveProperty('phase');
        });

        test('contributionCurve returns {frequency, cone, port, total}', () => {
            const curve = box.contributionCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('cone');
            expect(curve[0]).toHaveProperty('port');
            expect(curve[0]).toHaveProperty('total');
        });

        test('portVelocityCurve returns {frequency, velocity, overLimit, overQuiet}', () => {
            const curve = box.portVelocityCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('velocity');
            expect(curve[0]).toHaveProperty('overLimit');
            expect(curve[0]).toHaveProperty('overQuiet');
        });

        test('portMachCurve returns {frequency, mach, velocity}', () => {
            const curve = box.portMachCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('mach');
            expect(curve[0]).toHaveProperty('velocity');
        });

        test('portReynoldsCurve returns {frequency, reynolds, velocity}', () => {
            const curve = box.portReynoldsCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('reynolds');
            expect(curve[0]).toHaveProperty('velocity');
        });

        test('stepResponseCurve returns {time, amplitude}', () => {
            const curve = box.stepResponseCurve(0.1, 20);
            expect(curve[0]).toHaveProperty('time');
            expect(curve[0]).toHaveProperty('amplitude');
        });

        test('impulseResponseCurve returns {time, amplitude}', () => {
            const curve = box.impulseResponseCurve(0.1, 20);
            expect(curve[0]).toHaveProperty('time');
            expect(curve[0]).toHaveProperty('amplitude');
        });
    });

    describe('Curve Methods: VentedBox with Passive Radiator', () => {
        // Need VALID_DRIVER_PARAMS for full engineering curves
        const driver = new Driver(VALID_DRIVER_PARAMS);
        const pr = new PassiveRadiator({
            sd: 500,    // cm² (not 'area')
            mmp: 150,   // grams (not 'mass')
            xmax: 25
        });
        const box = VentedBox.qb3(driver, pr);

        test('prExcursionCurve returns {frequency, excursion, overXmax}', () => {
            const curve = box.prExcursionCurve(100, 10, 200, 10);
            expect(curve[0]).toHaveProperty('frequency');
            expect(curve[0]).toHaveProperty('excursion');
            expect(curve[0]).toHaveProperty('overXmax');
        });

        test('contributionCurve still works with PR', () => {
            const curve = box.contributionCurve(10, 200, 10);
            expect(curve[0]).toHaveProperty('cone');
            expect(curve[0]).toHaveProperty('port');  // Still called 'port' for API consistency
        });
    });

    // ========================================================================
    // CURVE SHAPE TESTS - Behavioral Documentation
    // ========================================================================
    // These tests verify curve CHARACTERISTICS, not arbitrary point values.
    // They serve as documentation of expected acoustic behavior.
    // See CLAUDE.md "Curve Shape Testing Strategy" for philosophy.

    describe('Shape: Sealed Response by Qtc', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);

        test('Qtc=0.577 (Bessel/overdamped): monotonic rolloff, no peak above 0dB', () => {
            const box = SealedBox.bessel(driver);
            expect(box.qtc).toBeCloseTo(0.577, 2);

            // Sample passband and rolloff - should never exceed 0dB
            const curve = box.responseCurve(10, 200, 50);
            const maxResponse = Math.max(...curve.map(p => p.db));
            expect(maxResponse).toBeLessThanOrEqual(0.5); // Allow small numerical tolerance
        });

        test('Qtc=0.707 (Butterworth): exactly -3dB at Fc, flattest passband', () => {
            const box = SealedBox.butterworth(driver);
            expect(box.qtc).toBeCloseTo(0.707, 2);

            // -3dB at Fc is the Butterworth definition (within 0.5dB tolerance)
            const respAtFc = box.responseAt(box.fc);
            expect(respAtFc).toBeGreaterThan(-3.5);
            expect(respAtFc).toBeLessThan(-2.5);

            // Passband should be very flat (within 0.5dB)
            const passbandResponse = box.responseAt(box.fc * 2);
            expect(Math.abs(passbandResponse)).toBeLessThan(0.5);
        });

        test('Qtc=1.0 (Chebyshev/underdamped): has peak above 0dB before rolloff', () => {
            const box = SealedBox.chebyshev(driver);
            expect(box.qtc).toBeCloseTo(1.0, 1);

            // Should have a peak - sample around resonance
            const curve = box.responseCurve(box.fc * 0.5, box.fc * 1.5, 30);
            const maxResponse = Math.max(...curve.map(p => p.db));

            // Qtc=1.0 should have ~1.25dB peak (from theory)
            expect(maxResponse).toBeGreaterThan(0.5);
        });

        test('Higher Qtc = more peaking (1.3 peaks more than 1.0)', () => {
            // Create boxes with different Qtc by varying volume
            const vol10 = SealedBox.volumeForQtc(driver, 1.0);
            const vol13 = SealedBox.volumeForQtc(driver, 1.3);

            const box10 = new SealedBox(driver, vol10);
            const box13 = new SealedBox(driver, vol13);

            const curve10 = box10.responseCurve(10, 100, 30);
            const curve13 = box13.responseCurve(10, 100, 30);

            const peak10 = Math.max(...curve10.map(p => p.db));
            const peak13 = Math.max(...curve13.map(p => p.db));

            expect(peak13).toBeGreaterThan(peak10);
        });
    });

    describe('Shape: Sealed 12dB/octave Rolloff', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);
        const box = SealedBox.butterworth(driver);

        test('Response drops ~12dB per octave below Fc', () => {
            // Well below Fc, sealed box is 2nd-order = 12dB/octave
            const f1 = box.fc / 4;  // Two octaves below Fc
            const f2 = box.fc / 8;  // Three octaves below Fc

            const resp1 = box.responseAt(f1);
            const resp2 = box.responseAt(f2);

            // One octave difference should be ~12dB (within ±1dB)
            const rolloffPerOctave = resp1 - resp2;
            expect(rolloffPerOctave).toBeGreaterThan(11);
            expect(rolloffPerOctave).toBeLessThan(13);
        });

        test('Rolloff is consistent (monotonic decrease below Fc)', () => {
            const curve = box.responseCurve(box.fc / 10, box.fc / 2, 20);

            // Each point should be lower than the next (going from low to high freq)
            for (let i = 0; i < curve.length - 1; i++) {
                expect(curve[i].db).toBeLessThan(curve[i + 1].db);
            }
        });
    });

    describe('Shape: Vented Response vs Sealed', () => {
        const driver = new Driver(LOW_QTS_PARAMS);
        const port = new Port({ diameter: 10 });
        const vented = VentedBox.qb3(driver, port);
        const sealed = SealedBox.butterworth(driver);

        test('Vented rolls off steeper than sealed (24dB vs 12dB/octave)', () => {
            // Below F3, measure rolloff rate
            const ventedF1 = vented.f3 / 2;
            const ventedF2 = vented.f3 / 4;
            const ventedRolloff = vented.responseAt(ventedF1) - vented.responseAt(ventedF2);

            const sealedF1 = sealed.f3 / 2;
            const sealedF2 = sealed.f3 / 4;
            const sealedRolloff = sealed.responseAt(sealedF1) - sealed.responseAt(sealedF2);

            // Vented ~24dB/oct, sealed ~12dB/oct - vented should be ~2x steeper
            expect(ventedRolloff).toBeGreaterThan(sealedRolloff * 1.5);
        });

        test('Vented extends lower than sealed for same driver (lower F3)', () => {
            // This is why we use vented - better low frequency extension
            expect(vented.f3).toBeLessThan(sealed.f3);
        });
    });

    describe('Shape: Phase Behavior', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);

        test('Sealed phase: significant change between high and low frequencies', () => {
            const box = SealedBox.butterworth(driver);

            // High frequency phase
            const highPhase = box.phaseAt(box.fc * 10);

            // Low frequency phase
            const lowPhase = box.phaseAt(box.fc / 10);

            // 2nd order system should have ~180° total phase change
            const phaseChange = Math.abs(highPhase - lowPhase);
            expect(phaseChange).toBeGreaterThan(120);  // At least 120° change
        });

        test('Vented phase: distinct from sealed (different order system)', () => {
            const port = new Port({ diameter: 10 });
            // Use finite ql for realistic response modeling
            const vented = VentedBox.qb3(driver, port, { ql: 7 });
            const sealed = SealedBox.butterworth(driver);

            // At a mid frequency, phases should be different
            const testFreq = 30;  // Around typical Fb
            const ventedPhase = vented.phaseAt(testFreq);
            const sealedPhase = sealed.phaseAt(testFreq);

            // They should have meaningfully different phase at mid frequencies
            expect(Math.abs(ventedPhase - sealedPhase)).toBeGreaterThan(10);
        });

        test('Phase at resonance is significant (near 90° for sealed)', () => {
            const box = SealedBox.butterworth(driver);

            // At Fc, phase should be around 90° (exact value depends on convention)
            const phaseAtFc = Math.abs(box.phaseAt(box.fc));
            expect(phaseAtFc).toBeGreaterThan(45);
            expect(phaseAtFc).toBeLessThan(135);
        });
    });

    describe('Shape: Group Delay', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);

        test('Group delay peaks near system resonance', () => {
            const box = SealedBox.butterworth(driver);
            const curve = box.groupDelayCurve(10, 200, 50);

            // Find the peak
            let maxDelay = 0;
            let peakFreq = 0;
            for (const p of curve) {
                if (p.delay > maxDelay) {
                    maxDelay = p.delay;
                    peakFreq = p.frequency;
                }
            }

            // Peak should be near Fc (within factor of 2)
            expect(peakFreq).toBeGreaterThan(box.fc * 0.5);
            expect(peakFreq).toBeLessThan(box.fc * 2);
        });

        test('Group delay decreases at frequencies above resonance', () => {
            const box = SealedBox.butterworth(driver);

            const atFc = box.groupDelayAt(box.fc);
            const aboveFc = box.groupDelayAt(box.fc * 3);

            expect(aboveFc).toBeLessThan(atFc);
        });

        test('Group delay varies across frequency range', () => {
            const box = SealedBox.butterworth(driver);
            const curve = box.groupDelayCurve(10, 200, 20);

            const delays = curve.map(p => p.delay);
            const maxDelay = Math.max(...delays);
            const minDelay = Math.min(...delays);

            // Should have meaningful variation across the frequency range
            expect(maxDelay).toBeGreaterThan(minDelay);
        });
    });

    describe('Shape: Impedance', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);

        test('Sealed: has a clear impedance peak', () => {
            const box = SealedBox.butterworth(driver);
            const curve = box.impedanceCurve(10, 200, 50);

            // Find peak
            let maxZ = 0;
            let peakFreq = 0;
            for (const p of curve) {
                if (p.magnitude > maxZ) {
                    maxZ = p.magnitude;
                    peakFreq = p.frequency;
                }
            }

            // Peak should be significantly above DC resistance
            const reNominal = driver.re;
            expect(maxZ).toBeGreaterThan(reNominal * 2);

            // Peak should be in the bass region (under 100 Hz for typical sub)
            expect(peakFreq).toBeGreaterThan(10);
            expect(peakFreq).toBeLessThan(100);
        });

        test('Vented: two impedance peaks around Fb', () => {
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            const peaks = box.findImpedancePeaks();

            // fL < Fb < fH
            expect(peaks.fL).toBeLessThan(box.fb);
            expect(peaks.fH).toBeGreaterThan(box.fb);
        });

        test('Impedance minimum between peaks for vented (at Fb)', () => {
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            const peaks = box.findImpedancePeaks();
            const zAtFb = box.impedanceAt(box.fb).magnitude;
            const zAtFl = box.impedanceAt(peaks.fL).magnitude;
            const zAtFh = box.impedanceAt(peaks.fH).magnitude;

            // At Fb, impedance should be lower than at peaks
            expect(zAtFb).toBeLessThan(zAtFl);
            expect(zAtFb).toBeLessThan(zAtFh);
        });

        test('Impedance approaches Re at high frequencies', () => {
            const box = SealedBox.butterworth(driver);
            const re = driver.re;

            const zHigh = box.impedanceAt(1000).magnitude;

            // Should be close to Re (within 50% - Le causes some rise)
            expect(zHigh).toBeGreaterThan(re * 0.8);
            expect(zHigh).toBeLessThan(re * 2);
        });
    });

    describe('Shape: Excursion', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);

        test('Sealed: excursion increases monotonically as frequency decreases', () => {
            const box = SealedBox.butterworth(driver);
            const curve = box.excursionCurve(100, 10, 100, 20);

            // Going from high freq to low freq, excursion should increase
            for (let i = curve.length - 1; i > 0; i--) {
                expect(curve[i].excursion).toBeLessThan(curve[i - 1].excursion);
            }
        });

        test('Vented: excursion at Fb is less than below Fb (null effect)', () => {
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            // The key characteristic: excursion at Fb should be less than well below Fb
            // This is the "excursion null" that makes ported boxes handle more power at tuning
            const atFb = box.excursionAt(box.fb, 100);
            const belowFb = box.excursionAt(box.fb * 0.5, 100);

            // Excursion should be significantly less at Fb than below
            expect(atFb).toBeLessThan(belowFb * 0.8);
        });

        test('Vented: excursion increases again below Fb (cone unloading)', () => {
            const port = new Port({ diameter: 10 });
            const box = VentedBox.qb3(driver, port);

            const atFb = box.excursionAt(box.fb, 100);
            const belowFb = box.excursionAt(box.fb / 2, 100);

            // Below tuning, cone is unloaded - excursion rises sharply
            expect(belowFb).toBeGreaterThan(atFb * 1.5);
        });

        test('More power = more excursion (linear relationship)', () => {
            const box = SealedBox.butterworth(driver);

            const exc100 = box.excursionAt(30, 100);
            const exc400 = box.excursionAt(30, 400);

            // 4x power = 2x excursion (square root relationship)
            expect(exc400 / exc100).toBeCloseTo(2, 0.3);
        });
    });

    describe('Shape: Max SPL Limits', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);
        const box = SealedBox.butterworth(driver);

        test('Max SPL tracks the lower of thermal and excursion limits', () => {
            const curve = box.maxSplCurve(15, 150, 30);
            const thermalCurve = box.thermalLimitCurve(15, 150, 30);
            const excursionCurve = box.excursionLimitCurve(15, 150, 30);

            // Average maxSpl should be close to average of min(thermal, excursion)
            let sumMax = 0;
            let sumMin = 0;
            for (let i = 0; i < curve.length; i++) {
                sumMax += curve[i].maxSpl;
                sumMin += Math.min(thermalCurve[i].spl, excursionCurve[i].spl);
            }
            const avgMax = sumMax / curve.length;
            const avgMin = sumMin / curve.length;

            // Should be close (within 1dB on average)
            expect(Math.abs(avgMax - avgMin)).toBeLessThan(1);
        });

        test('Low freq: excursion limited (excursion < thermal)', () => {
            const lowFreq = 20;
            const result = box.maxSplAt(lowFreq);

            expect(result.limitingFactor).toBe('excursion');
        });

        test('High freq: thermal limited (thermal < excursion)', () => {
            const highFreq = 100;
            const result = box.maxSplAt(highFreq);

            expect(result.limitingFactor).toBe('thermal');
        });

        test('Crossover point exists where limits are equal', () => {
            const curve = box.maxSplCurve(15, 150, 50);

            // Find where limiting factor changes
            let crossoverFound = false;
            for (let i = 1; i < curve.length; i++) {
                if (curve[i].limitingFactor !== curve[i - 1].limitingFactor) {
                    crossoverFound = true;
                    break;
                }
            }

            expect(crossoverFound).toBe(true);
        });

        test('Both limits rise with frequency', () => {
            const thermalCurve = box.thermalLimitCurve(20, 100, 10);
            const excursionCurve = box.excursionLimitCurve(20, 100, 10);

            // Thermal limit follows response - higher at high freq
            expect(thermalCurve[9].spl).toBeGreaterThan(thermalCurve[0].spl);

            // Excursion limit rises with f² - much higher at high freq
            expect(excursionCurve[9].spl).toBeGreaterThan(excursionCurve[0].spl);
        });
    });

    describe('Shape: Vented Max Power at Fb', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);
        const port = new Port({ diameter: 10 });
        const box = VentedBox.qb3(driver, port);

        test('Max power peaks near Fb (excursion null = more power handling)', () => {
            const curve = box.powerCurve(15, 100, 30);

            // Find max power frequency
            let maxPower = 0;
            let maxPowerFreq = 0;
            for (const p of curve) {
                if (p.maxPower > maxPower) {
                    maxPower = p.maxPower;
                    maxPowerFreq = p.frequency;
                }
            }

            // Should be near Fb (within 30%)
            expect(maxPowerFreq).toBeGreaterThan(box.fb * 0.7);
            expect(maxPowerFreq).toBeLessThan(box.fb * 1.3);
        });

        test('Power handling drops sharply below Fb', () => {
            const atFb = box.maxPowerAt(box.fb).maxPower;
            const belowFb = box.maxPowerAt(box.fb / 2).maxPower;

            // Below tuning, cone unloads - much less power handling
            expect(belowFb).toBeLessThan(atFb * 0.5);
        });
    });

    describe('Shape: Time Domain', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);

        test('Step response: highpass behavior (starts high, decays to 0)', () => {
            const box = SealedBox.butterworth(driver);
            const curve = box.stepResponseCurve(0.2, 50);

            // For highpass system: step response starts at peak (passes the edge)
            // then decays to 0 (no DC response)
            const firstAmplitude = curve[0].amplitude;

            // Eventually settles back to 0 (highpass behavior)
            const lastPoints = curve.slice(-5);
            const avgLast = lastPoints.reduce((s, p) => s + Math.abs(p.amplitude), 0) / 5;
            expect(avgLast).toBeLessThan(Math.abs(firstAmplitude) * 0.3);

            // Should show some significant response
            const maxAmplitude = Math.max(...curve.map(p => Math.abs(p.amplitude)));
            expect(maxAmplitude).toBeGreaterThan(0.3);
        });

        test('Impulse response: peaks then decays', () => {
            const box = SealedBox.butterworth(driver);
            const curve = box.impulseResponseCurve(0.2, 50);

            // Find peak
            let peakIndex = 0;
            let peakValue = 0;
            for (let i = 0; i < curve.length; i++) {
                if (Math.abs(curve[i].amplitude) > peakValue) {
                    peakValue = Math.abs(curve[i].amplitude);
                    peakIndex = i;
                }
            }

            // Peak should be early in the response
            expect(peakIndex).toBeLessThan(curve.length / 2);

            // End should be near zero
            const lastAmplitude = Math.abs(curve[curve.length - 1].amplitude);
            expect(lastAmplitude).toBeLessThan(peakValue * 0.1);
        });

        test('Higher Qtc = more ringing in step response', () => {
            const low = SealedBox.bessel(driver);   // Low Q, no ringing
            const high = SealedBox.chebyshev(driver); // High Q, ringing

            const curveLow = low.stepResponseCurve(0.2, 50);
            const curveHigh = high.stepResponseCurve(0.2, 50);

            // Count zero crossings as proxy for ringing
            const crossingsLow = countZeroCrossings(curveLow.map(p => p.amplitude));
            const crossingsHigh = countZeroCrossings(curveHigh.map(p => p.amplitude));

            expect(crossingsHigh).toBeGreaterThanOrEqual(crossingsLow);
        });
    });

    describe('Shape: Port Velocity', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);
        const port = new Port({ diameter: 10 });
        // Use finite ql for realistic response modeling (lossless can have edge behavior)
        const box = VentedBox.qb3(driver, port, { ql: 7 });

        test('Port velocity peaks near Fb', () => {
            // Search around Fb
            const fMin = box.fb * 0.3;
            const fMax = box.fb * 3;
            const curve = box.portVelocityCurve(500, fMin, fMax, 50);

            // Find peak velocity
            let maxVelocity = 0;
            let peakFreq = 0;
            for (const p of curve) {
                if (p.velocity > maxVelocity) {
                    maxVelocity = p.velocity;
                    peakFreq = p.frequency;
                }
            }

            // Peak should be near Fb (within 50% - port velocity peaks slightly below Fb)
            expect(peakFreq).toBeGreaterThan(box.fb * 0.5);
            expect(peakFreq).toBeLessThan(box.fb * 1.5);
        });

        test('Port velocity decreases at high frequencies', () => {
            const nearFb = box.portVelocityCurve(500, box.fb * 0.9, box.fb * 1.1, 3)[1].velocity;
            const highFreq = box.portVelocityCurve(500, 100, 100, 1)[0].velocity;

            expect(highFreq).toBeLessThan(nearFb);
        });

        test('More power = more velocity (square root relationship)', () => {
            const vel100 = box.portVelocityCurve(100, box.fb, box.fb, 1)[0].velocity;
            const vel400 = box.portVelocityCurve(400, box.fb, box.fb, 1)[0].velocity;

            // 4x power = 2x velocity
            expect(vel400 / vel100).toBeCloseTo(2, 0.3);
        });
    });

    describe('Shape: Cone/Port Contribution', () => {
        const driver = new Driver(LOW_QTS_PARAMS);
        const port = new Port({ diameter: 10 });
        // Use finite ql for realistic response modeling
        const box = VentedBox.qb3(driver, port, { ql: 7 });

        test('Both cone and port contribute to output', () => {
            const curve = box.contributionCurve(10, 100, 30);

            // Should have non-zero values for both cone and port across the range
            const hasCone = curve.some(p => p.cone > 0);
            const hasPort = curve.some(p => p.port > 0);

            expect(hasCone).toBe(true);
            expect(hasPort).toBe(true);
        });

        test('Total output is present at all frequencies', () => {
            const curve = box.contributionCurve(10, 100, 30);

            // Total should always be positive
            for (const p of curve) {
                expect(p.total).toBeGreaterThan(0);
            }
        });

        test('Cone contribution varies with frequency', () => {
            const curve = box.contributionCurve(10, 100, 30);

            const coneValues = curve.map(p => p.cone);
            const maxCone = Math.max(...coneValues);
            const minCone = Math.min(...coneValues);

            // There should be meaningful variation
            expect(maxCone - minCone).toBeGreaterThan(0);
        });
    });

    describe('Shape: Compression and Distortion', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);
        const box = SealedBox.butterworth(driver);

        test('Excursion increases at low frequencies', () => {
            // Compression depends on excursion - verify that relationship
            const curve = box.compressionCurve(500, 20, 100, 20);

            // Lower freq = more excursion
            expect(curve[0].excursion).toBeGreaterThan(curve[19].excursion);
        });

        test('Higher power = more excursion = more compression effect', () => {
            const low = box.compressionCurve(100, 30, 30, 1)[0];
            const high = box.compressionCurve(1000, 30, 30, 1)[0];

            // More power should mean more excursion
            expect(high.excursion).toBeGreaterThan(low.excursion);
        });

        test('THD increases at low frequencies', () => {
            const curve = box.distortionCurve(500, 20, 100, 20);

            // Lower freq = more excursion = more distortion
            expect(curve[0].thd).toBeGreaterThan(curve[19].thd);
        });

        test('Severity categories are assigned based on THD', () => {
            // Use high power at low freq to get high THD
            const lowFreqHighPower = box.distortionCurve(2000, 15, 15, 1)[0];
            // Use low power at high freq to get low THD
            const highFreqLowPower = box.distortionCurve(50, 100, 100, 1)[0];

            // Low freq + high power should have higher severity
            const severityRank = { 'low': 1, 'moderate': 2, 'high': 3, 'severe': 4 };
            expect(severityRank[lowFreqHighPower.severity]).toBeGreaterThanOrEqual(
                severityRank[highFreqLowPower.severity]
            );
        });
    });

    describe('Shape: Headroom', () => {
        const driver = new Driver(VALID_DRIVER_PARAMS);
        const box = SealedBox.butterworth(driver);

        test('Headroom = maxSpl - target', () => {
            const target = 105;
            const curve = box.headroomCurve(target, 20, 100, 10);

            for (const p of curve) {
                expect(p.headroom).toBeCloseTo(p.maxSpl - target, 0.5);
            }
        });

        test('Higher target = less headroom everywhere', () => {
            const low = box.headroomCurve(100, 20, 100, 10);
            const high = box.headroomCurve(110, 20, 100, 10);

            for (let i = 0; i < low.length; i++) {
                expect(high[i].headroom).toBeLessThan(low[i].headroom);
            }
        });

        test('Headroom increases with frequency (limits rise)', () => {
            const curve = box.headroomCurve(100, 20, 100, 20);

            // Trend should be increasing (some local variation OK)
            expect(curve[19].headroom).toBeGreaterThan(curve[0].headroom);
        });
    });

    // Helper function for step response test
    function countZeroCrossings(values) {
        let crossings = 0;
        for (let i = 1; i < values.length; i++) {
            if ((values[i - 1] > 0 && values[i] < 0) || (values[i - 1] < 0 && values[i] > 0)) {
                crossings++;
            }
        }
        return crossings;
    }
}
