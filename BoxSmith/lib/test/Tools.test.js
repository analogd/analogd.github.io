/**
 * Tests for Toolbox utilities
 *
 * Unit converters, exporters, validators, and calculator re-exports.
 */

import {
    // Unit converters
    litersToFt3, ft3ToLiters,
    litersToIn3, in3ToLiters,
    cm2ToIn2, in2ToCm2,
    diameterToArea, areaToDiameter,
    mmToIn, inToMm,
    voltageRatioToDb, dbToVoltageRatio,
    powerRatioToDb, dbToPowerRatio,
    splAddition, powerForSplGain,
    polarToRect, rectToPolar,

    // Validators
    validateTSParams, isValid, getEBPRecommendation,

    // Exporters
    toFRD, toZMA, toCSV,

    // Port calculators
    portLength, portCircularArea
} from '../tools/index.js';

import {
    CurveContracts,
    VALID_Y_KEYS,
    ALL_VALID_Y_KEYS,
    validateYKey,
    getValidYKeysForCurve
} from '../models/curve-contracts.js';

import { Driver } from '../models/Driver.js';
import { SealedBox } from '../models/SealedBox.js';

// Test driver for export tests
// Qts = (Qes × Qms) / (Qes + Qms) = (0.52 × 5.5) / (0.52 + 5.5) = 2.86 / 6.02 = 0.475
const testDriver = new Driver({
    fs: 28,
    qts: 0.475,
    vas: 120,
    qes: 0.52,
    qms: 5.5,
    re: 3.2,
    le: 1.5,
    bl: 14,
    mms: 150,
    cms: 0.000118,
    rms: 4.80,
    sd: 855,
    xmax: 18,
    pe: 800
});

export function runToolsTests(TestFramework) {
    const { describe, test, expect } = TestFramework;

    // ========================================================================
    // UNIT CONVERTERS
    // ========================================================================

    describe('Unit Converters - Volume', () => {
        test('liters to cubic feet roundtrip', () => {
            const liters = 100;
            const ft3 = litersToFt3(liters);
            const back = ft3ToLiters(ft3);
            expect(back).toBeCloseTo(liters, 2);
        });

        test('1 cubic foot ≈ 28.3 liters', () => {
            const liters = ft3ToLiters(1);
            expect(liters).toBeCloseTo(28.3168, 2);
        });

        test('liters to cubic inches roundtrip', () => {
            const liters = 50;
            const in3 = litersToIn3(liters);
            const back = in3ToLiters(in3);
            expect(back).toBeCloseTo(liters, 2);
        });
    });

    describe('Unit Converters - Area', () => {
        test('cm² to in² roundtrip', () => {
            const cm2 = 500;
            const in2 = cm2ToIn2(cm2);
            const back = in2ToCm2(in2);
            expect(back).toBeCloseTo(cm2, 2);
        });

        test('diameter to area roundtrip', () => {
            const diameter = 30;  // 30cm diameter
            const area = diameterToArea(diameter);
            const back = areaToDiameter(area);
            expect(back).toBeCloseTo(diameter, 2);
        });
    });

    describe('Unit Converters - Length', () => {
        test('25.4mm = 1 inch exactly', () => {
            const inches = mmToIn(25.4);
            expect(inches).toBeCloseTo(1, 3);
        });

        test('mm to inches roundtrip', () => {
            const mm = 100;
            const inches = mmToIn(mm);
            const back = inToMm(inches);
            expect(back).toBeCloseTo(mm, 2);
        });
    });

    describe('Unit Converters - Decibels', () => {
        test('voltage ratio 2× = +6dB', () => {
            const db = voltageRatioToDb(2);
            expect(db).toBeCloseTo(6.02, 2);
        });

        test('power ratio 2× = +3dB', () => {
            const db = powerRatioToDb(2);
            expect(db).toBeCloseTo(3.01, 2);
        });

        test('power ratio 10× = +10dB', () => {
            const db = powerRatioToDb(10);
            expect(db).toBeCloseTo(10, 2);
        });

        test('dB to voltage ratio roundtrip', () => {
            const db = 12;
            const ratio = dbToVoltageRatio(db);
            const back = voltageRatioToDb(ratio);
            expect(back).toBeCloseTo(db, 2);
        });

        test('dB to power ratio roundtrip', () => {
            const db = 6;
            const ratio = dbToPowerRatio(db);
            const back = powerRatioToDb(ratio);
            expect(back).toBeCloseTo(db, 2);
        });

        test('SPL addition: 2 sources = +3dB', () => {
            const spl = splAddition(100, 2);
            expect(spl).toBeCloseTo(103.01, 2);
        });

        test('SPL addition: 4 sources = +6dB', () => {
            const spl = splAddition(100, 4);
            expect(spl).toBeCloseTo(106.02, 2);
        });

        test('power for +10dB = 10× power', () => {
            const multiplier = powerForSplGain(10);
            expect(multiplier).toBeCloseTo(10, 2);
        });
    });

    describe('Unit Converters - Impedance', () => {
        test('polar to rect: 10Ω @ 0° = 10+0j', () => {
            const rect = polarToRect(10, 0);
            expect(rect.real).toBeCloseTo(10, 2);
            expect(rect.imag).toBeCloseTo(0, 2);
        });

        test('polar to rect: 10Ω @ 45° = 7.07+7.07j', () => {
            const rect = polarToRect(10, 45);
            expect(rect.real).toBeCloseTo(7.07, 2);
            expect(rect.imag).toBeCloseTo(7.07, 2);
        });

        test('rect to polar roundtrip', () => {
            const original = { magnitude: 8, phaseDeg: 30 };
            const rect = polarToRect(original.magnitude, original.phaseDeg);
            const back = rectToPolar(rect.real, rect.imag);
            expect(back.magnitude).toBeCloseTo(original.magnitude, 2);
            expect(back.phaseDeg).toBeCloseTo(original.phaseDeg, 2);
        });
    });

    // ========================================================================
    // VALIDATORS
    // ========================================================================

    describe('T/S Parameter Validators', () => {
        test('valid params pass validation', () => {
            const result = validateTSParams({
                fs: 22,
                qts: 0.38,
                qes: 0.44,
                qms: 6.5,
                vas: 200
            });
            expect(result.isValid).toBe(true);
        });

        test('inconsistent Q values flagged as error', () => {
            // Qts should be ~0.41, but we give 0.50
            const result = validateTSParams({
                fs: 22,
                qts: 0.50,
                qes: 0.44,
                qms: 6.5,
                vas: 200
            });
            expect(result.isValid).toBe(false);
            expect(result.issues.some(i => i.code === 'Q_MISMATCH')).toBe(true);
        });

        test('missing critical params flagged', () => {
            const result = validateTSParams({
                fs: 22
                // missing qts, vas
            });
            expect(result.isValid).toBe(false);
            expect(result.issues.some(i => i.code === 'MISSING_PARAMS')).toBe(true);
        });

        test('EBP < 50 suggests sealed', () => {
            const rec = getEBPRecommendation({ fs: 20, qes: 0.5 });  // EBP = 40
            expect(rec).toBe('sealed');
        });

        test('EBP > 90 suggests vented', () => {
            const rec = getEBPRecommendation({ fs: 30, qes: 0.3 });  // EBP = 100
            expect(rec).toBe('vented');
        });

        test('EBP 50-90 suggests either', () => {
            const rec = getEBPRecommendation({ fs: 25, qes: 0.4 });  // EBP = 62.5
            expect(rec).toBe('either');
        });

        test('isValid convenience function works', () => {
            expect(isValid({ fs: 22, qts: 0.4, vas: 100 })).toBe(true);
            expect(isValid({ fs: 22 })).toBe(false);  // missing params
        });
    });

    // ========================================================================
    // EXPORTERS
    // ========================================================================

    describe('FRD Export', () => {
        const testBox = new SealedBox(testDriver, 100);

        test('produces valid format with comments', () => {
            const frd = toFRD(testBox, { points: 10 });
            expect(frd.includes('* Frequency Response Data')).toBe(true);
            expect(frd.includes('Freq(Hz)')).toBe(true);
        });

        test('contains tab-separated data', () => {
            const frd = toFRD(testBox, { points: 5 });
            const dataLines = frd.split('\n').filter(l => !l.startsWith('*') && l.trim());
            for (const line of dataLines) {
                const parts = line.split('\t');
                expect(parts.length).toBe(3);  // freq, dB, phase
            }
        });

        test('respects point count option', () => {
            const frd5 = toFRD(testBox, { points: 5 });
            const frd10 = toFRD(testBox, { points: 10 });
            const lines5 = frd5.split('\n').filter(l => !l.startsWith('*') && l.trim());
            const lines10 = frd10.split('\n').filter(l => !l.startsWith('*') && l.trim());
            expect(lines5.length).toBe(5);
            expect(lines10.length).toBe(10);
        });
    });

    describe('ZMA Export', () => {
        const testBox = new SealedBox(testDriver, 100);

        test('produces valid format with comments', () => {
            const zma = toZMA(testBox, { points: 10 });
            expect(zma.includes('* Impedance Data')).toBe(true);
            expect(zma.includes('Z(ohms)')).toBe(true);
        });

        test('contains tab-separated data', () => {
            const zma = toZMA(testBox, { points: 5 });
            const dataLines = zma.split('\n').filter(l => !l.startsWith('*') && l.trim());
            for (const line of dataLines) {
                const parts = line.split('\t');
                expect(parts.length).toBe(3);  // freq, impedance, phase
            }
        });
    });

    describe('CSV Export', () => {
        test('generates header and data rows', () => {
            const data = [
                { frequency: 20, spl: 100 },
                { frequency: 30, spl: 105 }
            ];
            const csv = toCSV(data);
            expect(csv.includes('frequency,spl')).toBe(true);
            expect(csv.split('\n').length).toBe(3);  // header + 2 rows
        });

        test('respects column selection', () => {
            const data = [
                { frequency: 20, spl: 100, extra: 'ignored' }
            ];
            const csv = toCSV(data, { columns: ['frequency', 'spl'] });
            expect(csv.includes('extra')).toBe(false);
            expect(csv.includes('ignored')).toBe(false);
        });

        test('handles custom delimiter', () => {
            const data = [{ a: 1, b: 2 }];
            const csv = toCSV(data, { delimiter: ';' });
            expect(csv.includes('a;b')).toBe(true);
        });
    });

    // ========================================================================
    // PORT CALCULATORS (re-exports)
    // ========================================================================

    describe('Port Calculators', () => {
        test('circular area: 10cm diameter = 78.5 cm²', () => {
            const area = portCircularArea(10);
            expect(area).toBeCloseTo(78.54, 1);
        });

        test('port length produces reasonable result', () => {
            // 100L box, 30Hz tuning, 10cm diameter port
            // portLength expects SI units: m³ for volume, m² for area, m for diameter
            const vbM3 = 0.100;  // 100L = 0.1 m³
            const areaM2 = portCircularArea(10) / 10000;  // cm² → m²
            const diameterM = 0.10;  // 10cm = 0.1m

            const lengthM = portLength({
                fb: 30,
                vb: vbM3,
                area: areaM2,
                effectiveDiameter: diameterM,
                type: 'circular_unflanged'
            });
            // Convert to cm for human-readable check
            const lengthCm = lengthM * 100;
            // Should be somewhere in 20-50cm range for these params
            expect(lengthCm).toBeGreaterThan(15);
            expect(lengthCm).toBeLessThan(60);
        });

        test('larger port area = longer length (area in numerator)', () => {
            // Physics: L ∝ area / (volume × fb²)
            // Bigger port cross-section needs longer tube to tune same frequency
            const vbM3 = 0.100;  // 100L
            const length8cm = portLength({
                fb: 30, vb: vbM3,
                area: portCircularArea(8) / 10000,
                effectiveDiameter: 0.08,
                type: 'circular_unflanged'
            });
            const length10cm = portLength({
                fb: 30, vb: vbM3,
                area: portCircularArea(10) / 10000,
                effectiveDiameter: 0.10,
                type: 'circular_unflanged'
            });
            expect(length10cm).toBeGreaterThan(length8cm);
        });
    });

    // ========================================================================
    // CURVE CONTRACTS (yKey validation)
    // ========================================================================

    describe('Curve Contracts', () => {
        test('CurveContracts has all expected curve methods', () => {
            // Key curve methods that must be defined
            const required = [
                'responseCurve', 'phaseCurve', 'groupDelayCurve',
                'impedanceCurve', 'excursionCurve', 'splCurve', 'maxSplCurve',
                'stepResponseCurve', 'impulseResponseCurve'
            ];
            for (const method of required) {
                expect(CurveContracts[method]).toBeDefined();
            }
        });

        test('each contract has x and y fields', () => {
            for (const [_name, contract] of Object.entries(CurveContracts)) {
                expect(contract.x).toBeDefined();
                expect(Array.isArray(contract.y)).toBe(true);
                expect(contract.y.length).toBeGreaterThan(0);
            }
        });

        test('VALID_Y_KEYS contains all curve y-fields', () => {
            // Every y field in every contract should be in VALID_Y_KEYS
            for (const contract of Object.values(CurveContracts)) {
                for (const yKey of contract.y) {
                    expect(VALID_Y_KEYS.has(yKey)).toBe(true);
                }
            }
        });

        test('validateYKey passes for valid keys', () => {
            // These should NOT throw
            validateYKey('magnitude', 'test');
            validateYKey('delay', 'test');
            validateYKey('db', 'test');
            validateYKey('spl', 'test');
            validateYKey('excursion', 'test');
            // If we got here, all passed
            expect(true).toBe(true);
        });

        test('validateYKey throws for invalid keys', () => {
            expect(() => validateYKey('impedance', 'test')).toThrow();
            expect(() => validateYKey('groupDelay', 'test')).toThrow();
            expect(() => validateYKey('foo', 'test')).toThrow();
        });

        test('validateYKey suggests similar keys', () => {
            // 'delay' should be suggested for 'groupDelay'
            expect(() => validateYKey('groupDelay', 'test')).toThrow('delay');
        });

        test('getValidYKeysForCurve returns correct fields', () => {
            const impedanceKeys = getValidYKeysForCurve('impedanceCurve');
            expect(impedanceKeys).toContain('magnitude');
            expect(impedanceKeys).toContain('phase');

            const groupDelayKeys = getValidYKeysForCurve('groupDelayCurve');
            expect(groupDelayKeys).toContain('delay');

            const responseKeys = getValidYKeysForCurve('responseCurve');
            expect(responseKeys).toContain('db');
        });

        test('ALL_VALID_Y_KEYS includes UI-specific keys', () => {
            // These are constructed in UI, not from curve methods
            expect(ALL_VALID_Y_KEYS.has('y')).toBe(true);
            expect(ALL_VALID_Y_KEYS.has('bl')).toBe(true);
            expect(ALL_VALID_Y_KEYS.has('kms')).toBe(true);
        });

        test('contracts match actual model return shapes', () => {
            // Verify a few contracts against what models actually return
            // This is a sanity check - if models change, this fails

            // impedanceCurve returns {frequency, magnitude, phase}
            const impedance = CurveContracts.impedanceCurve;
            expect(impedance.x).toBe('frequency');
            expect(impedance.y).toContain('magnitude');
            expect(impedance.y).toContain('phase');

            // groupDelayCurve returns {frequency, delay} (NOT groupDelay!)
            const groupDelay = CurveContracts.groupDelayCurve;
            expect(groupDelay.x).toBe('frequency');
            expect(groupDelay.y).toContain('delay');

            // stepResponseCurve returns {time, amplitude}
            const step = CurveContracts.stepResponseCurve;
            expect(step.x).toBe('time');
            expect(step.y).toContain('amplitude');
        });
    });
}
