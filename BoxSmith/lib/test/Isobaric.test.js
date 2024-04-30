/**
 * Isobaric (Compound) Driver Tests
 *
 * Validates the parameter transforms for isobaric configurations.
 */

import { Driver } from '../models/Driver.js';
import { SealedBox } from '../models/SealedBox.js';
import {
    createIsobaricDriver,
    IsobaricWiring,
    analyzeIsobaricSuitability,
    getIsobaricSensitivityLoss
} from '../models/isobaric.js';

export function runIsobaricTests({ describe, test, expect }) {
    // Create a test driver with all parameters
    const baseDriver = new Driver({
        fs: 22,
        qts: 0.53,
        vas: 248,
        qes: 0.67,
        qms: 2.53,
        re: 4.2,
        le: 1.15,
        bl: 18.9,
        mms: 325,
        cms: 0.000127,
        rms: 17.76,
        sd: 1184,
        xmax: 28,
        pe: 1200,
        sensitivity: 88.0,  // from eta0 calculation
        name: 'Test Driver'
    });

    describe('Isobaric: Core T/S Parameter Transforms', () => {
        test('Fs remains unchanged', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.fs).toBe(baseDriver.fs);
        });

        test('Qts remains unchanged', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.qts).toBe(baseDriver.qts);
        });

        test('Vas is halved', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.vas).toBe(baseDriver.vas / 2);
        });

        test('Qes remains unchanged', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.qes).toBe(baseDriver.qes);
        });

        test('Qms remains unchanged', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.qms).toBe(baseDriver.qms);
        });
    });

    describe('Isobaric: Series Wiring', () => {
        test('Re doubles in series', () => {
            const isoDriver = createIsobaricDriver(baseDriver, IsobaricWiring.SERIES);
            expect(isoDriver.re).toBe(baseDriver.re * 2);
        });

        test('Le doubles in series', () => {
            const isoDriver = createIsobaricDriver(baseDriver, IsobaricWiring.SERIES);
            expect(isoDriver.le).toBe(baseDriver.le * 2);
        });

        test('Bl doubles in series', () => {
            const isoDriver = createIsobaricDriver(baseDriver, IsobaricWiring.SERIES);
            expect(isoDriver.bl).toBe(baseDriver.bl * 2);
        });
    });

    describe('Isobaric: Parallel Wiring', () => {
        test('Re halves in parallel', () => {
            const isoDriver = createIsobaricDriver(baseDriver, IsobaricWiring.PARALLEL);
            expect(isoDriver.re).toBe(baseDriver.re / 2);
        });

        test('Le halves in parallel', () => {
            const isoDriver = createIsobaricDriver(baseDriver, IsobaricWiring.PARALLEL);
            expect(isoDriver.le).toBe(baseDriver.le / 2);
        });

        test('Bl unchanged in parallel', () => {
            const isoDriver = createIsobaricDriver(baseDriver, IsobaricWiring.PARALLEL);
            expect(isoDriver.bl).toBe(baseDriver.bl);
        });
    });

    describe('Isobaric: Mechanical Parameters', () => {
        test('Mms doubles', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.mms).toBe(baseDriver.mms * 2);
        });

        test('Pe doubles (two voice coils)', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.pe).toBe(baseDriver.pe * 2);
        });

        test('Sd unchanged (only one driver radiates)', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.sd).toBe(baseDriver.sd);
        });

        test('Xmax unchanged', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.xmax).toBe(baseDriver.xmax);
        });
    });

    describe('Isobaric: Derived Properties', () => {
        test('Sensitivity drops by ~3dB', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            const baseSens = baseDriver.sensitivity;
            const isoSens = isoDriver.sensitivity;

            // Should be approximately -3dB
            const diff = isoSens - baseSens;
            expect(diff).toBeCloseTo(-3, 0);
        });

        test('Efficiency halves', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            const ratio = isoDriver.eta0 / baseDriver.eta0;
            expect(ratio).toBeCloseTo(0.5, 1);
        });

        test('EBP unchanged', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            expect(isoDriver.ebp).toBeCloseTo(baseDriver.ebp, 1);
        });
    });

    describe('Isobaric: Suitability Analysis', () => {
        test('High-Vas driver is suitable', () => {
            const analysis = analyzeIsobaricSuitability(baseDriver);
            expect(analysis.suitable).toBe(true);
            expect(analysis.vasReduction).toBe(124);
        });

        test('Low-Vas driver is not suitable', () => {
            const lowVas = new Driver({ fs: 40, qts: 0.5, vas: 30 });
            const analysis = analyzeIsobaricSuitability(lowVas);
            expect(analysis.suitable).toBe(false);
        });

        test('Sensitivity loss constant is -3dB', () => {
            expect(getIsobaricSensitivityLoss()).toBe(-3);
        });
    });

    describe('Isobaric: Integration with Box Design', () => {
        test('Isobaric driver creates valid SealedBox', () => {
            const isoDriver = createIsobaricDriver(baseDriver);
            const box = new SealedBox(isoDriver, 70);
            expect(box.f3).toBeDefined();
            expect(box.qtc).toBeDefined();
        });

        test('Same Qtc with half volume', () => {
            const normalBox = new SealedBox(baseDriver, 140);
            const isoDriver = createIsobaricDriver(baseDriver);
            const isoBox = new SealedBox(isoDriver, 70);

            // Qtc should be similar (same alpha = Vas/Vb ratio)
            expect(isoBox.qtc).toBeCloseTo(normalBox.qtc, 1);
        });

        test('Similar F3 with half volume', () => {
            const normalBox = new SealedBox(baseDriver, 140);
            const isoDriver = createIsobaricDriver(baseDriver);
            const isoBox = new SealedBox(isoDriver, 70);

            // F3 should be similar
            expect(isoBox.f3).toBeCloseTo(normalBox.f3, 0);
        });
    });

    describe('Isobaric: Error Handling', () => {
        test('Throws if not given Driver instance', () => {
            expect(() => createIsobaricDriver({ fs: 22, qts: 0.5, vas: 100 }))
                .toThrow('requires a Driver instance');
        });
    });
}
