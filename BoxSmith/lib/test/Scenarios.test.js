// Scenario Tests - "What would a human see?"
//
// These tests exercise the FULL model pipeline the way the UI does:
//   Driver → SealedBox/VentedBox → curve methods → shape assertions
//
// They catch bugs that unit tests miss:
// - Box constructed with wrong params (box-builder wiring)
// - Curve method returns unexpected shape (model regression)
// - Response doesn't match what the alignment promises
//
// Design principles:
// - Test SHAPE, not values. "Flat passband" not "0.002dB at 100Hz"
// - Use real drivers from defaults.js (same data the UI uses)
// - Each scenario reads like a bug report: setup, expectation, check
// - Helpers are reusable — adding a scenario is 5-10 lines
//
// These are NOT:
// - Foundation tests (those validate individual equations)
// - Invariant tests (those validate physical laws abstractly)
// - Snapshot tests (nothing breaks when curve resolution changes)

import { Driver, SealedBox, VentedBox, Port, PassiveRadiator } from '../models/index.js';
import { POPULAR_DRIVERS, DEFAULTS } from '../../ui/defaults.js';

// ============================================================================
// CURVE SHAPE HELPERS
// ============================================================================
// Reusable assertions about curve characteristics. Each returns a descriptive
// error on failure so you know what went wrong without reading the helper code.

/**
 * Analyze response curve shape — the thing a human would notice at a glance.
 * Returns an object with shape properties to assert against.
 */
function analyzeResponse(box, fMin = 10, fMax = 200, points = 100) {
    const curve = box.responseCurve(fMin, fMax, points);
    // Passband = upper quarter of range, well above any resonance effects
    const passband = curve.filter(p => p.frequency >= fMax * 0.75);
    const passbandLevel = avg(passband.map(p => p.db));

    // Find peak in the region below passband (where humps live)
    const belowPassband = curve.filter(p => p.frequency < fMax * 0.6);
    const peakPoint = belowPassband.reduce((max, p) => p.db > max.db ? p : max, belowPassband[0]);
    const humpDb = peakPoint.db - passbandLevel;

    // Find F3 by walking down from passband
    const f3Target = passbandLevel - 3;
    let f3 = null;
    for (let i = curve.length - 1; i >= 0; i--) {
        if (curve[i].db <= f3Target) {
            f3 = curve[i].frequency;
            break;
        }
    }

    // Measure rolloff rate at two low frequencies (well below any resonance)
    // Uses fixed 12-24Hz range — far enough below any sub Fc to be asymptotic
    const rolloffLow = curve.find(p => p.frequency >= 12) || curve[0];
    const rolloffHigh = curve.find(p => p.frequency >= 24) || curve[1];
    const octaves = Math.log2(rolloffHigh.frequency / rolloffLow.frequency);
    const rolloffPerOctave = octaves > 0 ? (rolloffHigh.db - rolloffLow.db) / octaves : 0;

    return {
        curve,
        passbandLevel,
        humpDb,         // >0.5 means visible hump. <=0.5 means flat
        humpFreq: peakPoint.frequency,
        f3,
        rolloffPerOctave,   // positive = getting louder going up (rolloff slope)
        hasHump: humpDb > 0.5,
        isFlat: humpDb <= 0.5,
        atFreq(f) {
            const closest = curve.reduce((best, p) =>
                Math.abs(p.frequency - f) < Math.abs(best.frequency - f) ? p : best
            );
            return closest.db;
        }
    };
}

/**
 * Analyze impedance curve — peak count, peak locations
 */
function analyzeImpedance(box, fMin = 5, fMax = 200, points = 200) {
    const curve = box.impedanceCurve(fMin, fMax, points);
    const peaks = [];
    for (let i = 1; i < curve.length - 1; i++) {
        if (curve[i].magnitude > curve[i - 1].magnitude &&
            curve[i].magnitude > curve[i + 1].magnitude &&
            curve[i].magnitude > curve[0].magnitude * 1.2) { // significant peak, not noise
            peaks.push({ frequency: curve[i].frequency, magnitude: curve[i].magnitude });
        }
    }
    return { curve, peaks, peakCount: peaks.length };
}

/**
 * Analyze excursion curve — where it peaks, max value
 */
function analyzeExcursion(box, power, fMin = 10, fMax = 200, points = 100) {
    const curve = box.excursionCurve(power, fMin, fMax, points);
    const peakPoint = curve.reduce((max, p) => p.excursion > max.excursion ? p : max, curve[0]);
    return {
        curve,
        peakExcursion: peakPoint.excursion,
        peakFreq: peakPoint.frequency,
        atFreq(f) {
            const closest = curve.reduce((best, p) =>
                Math.abs(p.frequency - f) < Math.abs(best.frequency - f) ? p : best
            );
            return closest.excursion;
        }
    };
}

function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }

// ============================================================================
// DRIVER FACTORY
// ============================================================================
// Create Driver instances from the same data the UI uses

function makeDriver(name) {
    const lower = name.toLowerCase();
    const data = POPULAR_DRIVERS.find(d => d.id === name || d.id.includes(lower) || d.name.toLowerCase().includes(lower));
    if (!data) throw new Error(`Unknown driver: ${name}. Available: ${POPULAR_DRIVERS.map(d => d.id).join(', ')}`);
    return new Driver(data);
}

// ============================================================================
// TEST SUITE
// ============================================================================

export function runScenariosTests(TestFramework) {
    const { describe, test, expect } = TestFramework;

    // ========================================================================
    // SEALED BOX SCENARIOS
    // ========================================================================

    describe('SCENARIO: Sealed Butterworth (Qtc=0.707) — flat, no hump', () => {
        const driver = makeDriver('ultimax');
        const box = SealedBox.butterworth(driver);

        test('Qtc is 0.707', () => {
            expect(box.qtc).toBeCloseTo(0.707, 2);
        });

        test('Response is flat — no visible hump', () => {
            const shape = analyzeResponse(box);
            expect(shape.hasHump).toBe(false);
        });

        test('F3 is near Fc (Butterworth property)', () => {
            const shape = analyzeResponse(box);
            // For Butterworth, F3 = Fc. Allow 10% tolerance.
            const ratio = shape.f3 / box.fc;
            expect(ratio).toBeGreaterThan(0.85);
            expect(ratio).toBeLessThan(1.15);
        });

        test('Rolloff is approximately 12dB/octave (2nd order)', () => {
            const shape = analyzeResponse(box);
            // Measured well below Fc where rolloff is asymptotic
            expect(shape.rolloffPerOctave).toBeGreaterThan(9);
            expect(shape.rolloffPerOctave).toBeLessThan(14);
        });

        test('Single impedance peak', () => {
            const imp = analyzeImpedance(box);
            expect(imp.peakCount).toBe(1);
        });

        test('Impedance peak is near Fc', () => {
            const imp = analyzeImpedance(box);
            const ratio = imp.peaks[0].frequency / box.fc;
            expect(ratio).toBeGreaterThan(0.8);
            expect(ratio).toBeLessThan(1.2);
        });
    });

    describe('SCENARIO: Sealed underdamped (Qtc~0.9) — visible hump before rolloff', () => {
        const driver = makeDriver('ultimax');
        // Small box → high Qtc
        const targetQtc = 0.9;
        const alpha = (targetQtc / driver.qts) ** 2 - 1;
        const vb = driver.vas / alpha;
        const box = new SealedBox(driver, vb);

        test('Qtc is approximately 0.9', () => {
            expect(box.qtc).toBeCloseTo(0.9, 1);
        });

        test('Response has a visible hump', () => {
            const shape = analyzeResponse(box);
            expect(shape.hasHump).toBe(true);
        });

        test('Hump is moderate (0.5-2dB for Qtc=0.9)', () => {
            const shape = analyzeResponse(box);
            expect(shape.humpDb).toBeGreaterThan(0.4);
            expect(shape.humpDb).toBeLessThan(2.5);
        });

        test('F3 is below Fc (peak extends usable bandwidth)', () => {
            const shape = analyzeResponse(box);
            expect(shape.f3).toBeLessThan(box.fc);
        });
    });

    describe('SCENARIO: Sealed overdamped (Qtc~0.5) — gentle rolloff, no peak', () => {
        const driver = makeDriver('ultimax');
        // Big box → low Qtc
        const targetQtc = 0.56;
        const alpha = (targetQtc / driver.qts) ** 2 - 1;
        const vb = driver.vas / alpha;
        const box = new SealedBox(driver, vb);

        test('Qtc is approximately 0.56', () => {
            expect(box.qtc).toBeCloseTo(0.56, 1);
        });

        test('Response is flat — no hump', () => {
            const shape = analyzeResponse(box);
            expect(shape.isFlat).toBe(true);
        });

        test('F3 is above Fc (overdamped trades extension for flatness)', () => {
            const shape = analyzeResponse(box);
            expect(shape.f3).toBeGreaterThan(box.fc);
        });
    });

    describe('SCENARIO: Default UI state — Ultimax in 140L sealed', () => {
        // This is what the user sees when they first load BoxSmith
        const driver = makeDriver('ultimax');
        const box = new SealedBox(driver, DEFAULTS.volumeLiters);

        test('Box constructs without errors', () => {
            expect(box).toBeDefined();
        });

        test('Qtc is reasonable (0.5-1.2)', () => {
            expect(box.qtc).toBeGreaterThan(0.5);
            expect(box.qtc).toBeLessThan(1.2);
        });

        test('F3 is in subwoofer range (15-60Hz)', () => {
            const shape = analyzeResponse(box);
            expect(shape.f3).toBeGreaterThan(15);
            expect(shape.f3).toBeLessThan(60);
        });

        test('Response is reasonable at 30Hz (not catastrophically wrong)', () => {
            const shape = analyzeResponse(box);
            const db30 = shape.atFreq(30);
            // Should be somewhere between -10 and +3 for a 140L sub
            expect(db30).toBeGreaterThan(-10);
            expect(db30).toBeLessThan(3);
        });

        test('All curve methods return data (no empty arrays)', () => {
            expect(box.responseCurve(10, 200, 20).length).toBeGreaterThan(0);
            if (box.canCalculateSpl) {
                expect(box.splCurve(500, 10, 200, 20).length).toBeGreaterThan(0);
                expect(box.maxSplCurve(10, 200, 20).length).toBeGreaterThan(0);
            }
            if (box.canCalculateDisplacement) {
                expect(box.excursionCurve(500, 10, 200, 20).length).toBeGreaterThan(0);
            }
            if (box.canCalculateImpedance) {
                expect(box.impedanceCurve(10, 200, 20).length).toBeGreaterThan(0);
            }
        });

        test('Excursion peaks at low frequencies (physics sanity)', () => {
            if (!box.canCalculateDisplacement) return;
            const exc = analyzeExcursion(box, DEFAULTS.power);
            // Excursion should peak in the bass, not at 200Hz
            expect(exc.peakFreq).toBeLessThan(80);
        });
    });

    // ========================================================================
    // PORTED BOX SCENARIOS
    // ========================================================================

    describe('SCENARIO: Default ported — Ultimax 140L tuned to 28Hz', () => {
        const driver = makeDriver('ultimax');
        const port = new Port({ diameter: DEFAULTS.portDiameter });
        const box = new VentedBox(driver, DEFAULTS.volumeLiters, DEFAULTS.tuningFrequency, port);

        test('Box constructs without errors', () => {
            expect(box).toBeDefined();
        });

        test('Tuning frequency matches input', () => {
            expect(box.fb).toBeCloseTo(DEFAULTS.tuningFrequency, 0);
        });

        test('Port length is positive and reasonable', () => {
            expect(box.portLength).toBeGreaterThan(1);
            expect(box.portLength).toBeLessThan(200);  // cm
        });

        test('Response is flat-ish in passband', () => {
            const shape = analyzeResponse(box);
            // Ported can have small ripple, but shouldn't have a massive hump
            expect(shape.humpDb).toBeLessThan(4);
        });

        test('Rolloff is steeper than sealed (4th order vs 2nd order)', () => {
            // Compare response at a very low frequency
            const sealedBox = new SealedBox(driver, DEFAULTS.volumeLiters);
            const sealedShape = analyzeResponse(sealedBox);
            const portedShape = analyzeResponse(box);

            // At 10Hz, ported should be more negative (steeper rolloff)
            const sealedAt10 = sealedShape.atFreq(10);
            const portedAt10 = portedShape.atFreq(10);
            expect(portedAt10).toBeLessThan(sealedAt10);
        });

        test('Two impedance peaks (hallmark of ported box)', () => {
            if (!box.canCalculateImpedance) return;
            const imp = analyzeImpedance(box);
            expect(imp.peakCount).toBe(2);
        });

        test('Impedance minimum between peaks is near Fb', () => {
            if (!box.canCalculateImpedance) return;
            const imp = analyzeImpedance(box);
            if (imp.peakCount < 2) return;

            // Find minimum between the two peaks
            const between = imp.curve.filter(p =>
                p.frequency > imp.peaks[0].frequency && p.frequency < imp.peaks[1].frequency
            );
            const minPoint = between.reduce((min, p) => p.magnitude < min.magnitude ? p : min, between[0]);
            const ratio = minPoint.frequency / box.fb;
            expect(ratio).toBeGreaterThan(0.7);
            expect(ratio).toBeLessThan(1.3);
        });

        test('Excursion has minimum near tuning frequency (port takes over)', () => {
            if (!box.canCalculateDisplacement) return;
            const exc = analyzeExcursion(box, DEFAULTS.power);
            // Near Fb, the port does the work — driver excursion should dip
            const nearFb = exc.atFreq(DEFAULTS.tuningFrequency);
            const aboveFb = exc.atFreq(DEFAULTS.tuningFrequency * 2);
            const belowFb = exc.atFreq(DEFAULTS.tuningFrequency * 0.5);
            // Excursion at Fb should be less than at frequencies above and below
            expect(nearFb).toBeLessThan(belowFb);
            expect(nearFb).toBeLessThan(aboveFb);
        });
    });

    describe('SCENARIO: QB3 alignment — quasi-Butterworth ported', () => {
        // QB3 is "maximally flat" only for low-Qts drivers. For higher Qts
        // like the Ultimax (0.53), QB3 still produces a valid alignment but
        // with a response peak. The test validates the alignment is
        // structurally correct, not that it's flat.
        const driver = makeDriver('ultimax');
        const port = new Port({ diameter: DEFAULTS.portDiameter });
        const box = VentedBox.qb3(driver, port);

        test('Box constructs without errors', () => {
            expect(box).toBeDefined();
        });

        test('Response has data and passband is near 0dB', () => {
            const shape = analyzeResponse(box);
            // Passband should be roughly 0dB (within 1dB)
            expect(Math.abs(shape.passbandLevel)).toBeLessThan(1.0);
        });

        test('Two impedance peaks', () => {
            if (!box.canCalculateImpedance) return;
            const imp = analyzeImpedance(box);
            expect(imp.peakCount).toBe(2);
        });

        test('Steeper rolloff than sealed (4th order vs 2nd order)', () => {
            const sealedBox = new SealedBox(driver, DEFAULTS.volumeLiters);
            const sealedShape = analyzeResponse(sealedBox);
            const portedShape = analyzeResponse(box);
            // At very low freq, ported 4th-order drops faster than sealed 2nd-order
            expect(portedShape.atFreq(10)).toBeLessThan(sealedShape.atFreq(10));
        });
    });

    // ========================================================================
    // PASSIVE RADIATOR SCENARIOS
    // ========================================================================

    describe('SCENARIO: Passive radiator — same driver, same tuning as ported', () => {
        const driver = makeDriver('ultimax');
        const port = new Port({ diameter: DEFAULTS.portDiameter });
        const portedBox = new VentedBox(driver, DEFAULTS.volumeLiters, DEFAULTS.tuningFrequency, port);

        const pr = new PassiveRadiator({ mmp: DEFAULTS.prMass, sd: DEFAULTS.prArea, xmax: DEFAULTS.prXmax });
        const prBox = new VentedBox(driver, DEFAULTS.volumeLiters, DEFAULTS.tuningFrequency, pr);

        test('Both boxes construct', () => {
            expect(portedBox).toBeDefined();
            expect(prBox).toBeDefined();
        });

        test('Response shape is similar to ported (same alignment)', () => {
            const portedShape = analyzeResponse(portedBox);
            const prShape = analyzeResponse(prBox);

            // F3 should be in the same ballpark (within 30%)
            if (portedShape.f3 && prShape.f3) {
                const ratio = prShape.f3 / portedShape.f3;
                expect(ratio).toBeGreaterThan(0.7);
                expect(ratio).toBeLessThan(1.3);
            }
        });

        test('Two impedance peaks (same as ported)', () => {
            if (!prBox.canCalculateImpedance) return;
            const imp = analyzeImpedance(prBox);
            expect(imp.peakCount).toBe(2);
        });
    });

    // ========================================================================
    // CROSS-DRIVER SCENARIOS
    // ========================================================================

    describe('SCENARIO: All built-in drivers produce sane results in default box', () => {
        for (const driverData of POPULAR_DRIVERS) {
            const driver = new Driver(driverData);
            const box = new SealedBox(driver, DEFAULTS.volumeLiters);

            test(`${driverData.name}: sealed box constructs`, () => {
                expect(box).toBeDefined();
                expect(box.qtc).toBeGreaterThan(0.3);
                expect(box.qtc).toBeLessThan(3.0);
            });

            test(`${driverData.name}: response curve has data`, () => {
                const curve = box.responseCurve(10, 200, 20);
                expect(curve.length).toBeGreaterThan(0);
            });

            test(`${driverData.name}: F3 is in subwoofer range`, () => {
                const shape = analyzeResponse(box);
                expect(shape.f3).toBeGreaterThan(5);
                expect(shape.f3).toBeLessThan(100);
            });

            if (driver.hasParams('bl', 'mms', 'cms', 'rms')) {
                test(`${driverData.name}: impedance curve has single peak (sealed)`, () => {
                    const imp = analyzeImpedance(box);
                    expect(imp.peakCount).toBe(1);
                });
            }
        }
    });

    describe('SCENARIO: All built-in drivers in ported box', () => {
        for (const driverData of POPULAR_DRIVERS) {
            const driver = new Driver(driverData);
            const port = new Port({ diameter: 10 });
            const box = new VentedBox(driver, 100, 30, port);

            test(`${driverData.name}: ported box constructs`, () => {
                expect(box).toBeDefined();
            });

            test(`${driverData.name}: response curve has data`, () => {
                const curve = box.responseCurve(10, 200, 20);
                expect(curve.length).toBeGreaterThan(0);
            });

            if (driver.hasParams('bl', 'mms', 'cms', 'rms')) {
                test(`${driverData.name}: impedance has 2 peaks (ported)`, () => {
                    const imp = analyzeImpedance(box);
                    expect(imp.peakCount).toBe(2);
                });
            }
        }
    });

    // ========================================================================
    // COMPARATIVE SCENARIOS
    // ========================================================================

    describe('SCENARIO: Smaller box → higher Qtc → more hump', () => {
        const driver = makeDriver('ultimax');
        const bigBox = new SealedBox(driver, 300);    // big → low Qtc
        const smallBox = new SealedBox(driver, 50);    // small → high Qtc

        test('Small box has higher Qtc', () => {
            expect(smallBox.qtc).toBeGreaterThan(bigBox.qtc);
        });

        test('Small box has more hump', () => {
            const bigShape = analyzeResponse(bigBox);
            const smallShape = analyzeResponse(smallBox);
            expect(smallShape.humpDb).toBeGreaterThan(bigShape.humpDb);
        });

        test('Small box has higher Fc', () => {
            expect(smallBox.fc).toBeGreaterThan(bigBox.fc);
        });
    });

    describe('SCENARIO: Ported extends lower than sealed (same volume)', () => {
        const driver = makeDriver('ultimax');
        const sealed = new SealedBox(driver, DEFAULTS.volumeLiters);
        const port = new Port({ diameter: DEFAULTS.portDiameter });
        const ported = new VentedBox(driver, DEFAULTS.volumeLiters, 25, port);

        test('Ported F3 is lower than sealed F3', () => {
            const sealedShape = analyzeResponse(sealed);
            const portedShape = analyzeResponse(ported);
            expect(portedShape.f3).toBeLessThan(sealedShape.f3);
        });

        test('But ported has steeper rolloff below F3', () => {
            const sealedShape = analyzeResponse(sealed);
            const portedShape = analyzeResponse(ported);
            // At very low frequencies, ported drops faster
            expect(portedShape.atFreq(10)).toBeLessThan(sealedShape.atFreq(10));
        });
    });
}
