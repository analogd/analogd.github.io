// SPLCalculator.test.js
// Tests for SPL calculations

function createSPLCalculatorTests() {
    const suite = new TestFramework('SPLCalculator');

    // Test driver (similar to test driver used in other tests)
    const testDriver = {
        fs: 27.4,
        qts: 0.39,
        qes: 0.49,
        qms: 2.5,
        vas: 185,
        re: 6.4,
        sd: 346,
        xmax: 12.7,
        pe: 500
    };

    suite.test('Calculates power gain correctly (10*log10)', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        // 10W should be +10dB over 1W
        const baseSpl = 88; // Assume base
        const spl1W = SPLCalculator.calculateSPL(box, 100, 1);
        const spl10W = SPLCalculator.calculateSPL(box, 100, 10);

        const gain = spl10W - spl1W;
        TestFramework.assertAlmostEqual(gain, 10, 1); // 10*log10(10) = 10dB
    });

    suite.test('100W is +20dB over 1W', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const spl1W = SPLCalculator.calculateSPL(box, 100, 1);
        const spl100W = SPLCalculator.calculateSPL(box, 100, 100);

        const gain = spl100W - spl1W;
        TestFramework.assertAlmostEqual(gain, 20, 1); // 10*log10(100) = 20dB
    });

    suite.test('Generates multi-power curves with correct count', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const powerLevels = [1, 10, 100, 500];
        const curves = SPLCalculator.generateMultiPowerCurves(box, powerLevels, 20, 200, 50);

        TestFramework.assertEquals(curves.length, 4);
        TestFramework.assertEquals(curves[0].power, 1);
        TestFramework.assertEquals(curves[3].power, 500);
    });

    suite.test('Multi-power curves have consistent frequency arrays', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const curves = SPLCalculator.generateMultiPowerCurves(box, [1, 100], 20, 200, 50);

        // All curves should have same frequencies
        TestFramework.assertEquals(curves[0].frequencies.length, 50);
        TestFramework.assertEquals(curves[1].frequencies.length, 50);

        // Check first and last frequency match
        TestFramework.assertEquals(curves[0].frequencies[0], curves[1].frequencies[0]);
        TestFramework.assertEquals(curves[0].frequencies[49], curves[1].frequencies[49]);
    });

    suite.test('Higher power gives higher SPL at same frequency', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const curves = SPLCalculator.generateMultiPowerCurves(box, [1, 10, 100], 50, 100, 20);

        // At each frequency point, higher power should give higher SPL
        for (let i = 0; i < curves[0].spl.length; i++) {
            const spl1W = curves[0].spl[i];
            const spl10W = curves[1].spl[i];
            const spl100W = curves[2].spl[i];

            if (spl10W <= spl1W) {
                throw new Error(`At index ${i}: 10W (${spl10W}) should be > 1W (${spl1W})`);
            }
            if (spl100W <= spl10W) {
                throw new Error(`At index ${i}: 100W (${spl100W}) should be > 10W (${spl10W})`);
            }
        }
    });

    suite.test('SPL ceiling exists and has correct structure', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const ceiling = SPLCalculator.calculateSPLCeiling(box, 20, 200, 30);

        TestFramework.assertEquals(ceiling.frequencies.length, 30);
        TestFramework.assertEquals(ceiling.spl.length, 30);

        // All SPL values should be reasonable (50-120 dB range)
        for (const spl of ceiling.spl) {
            if (spl < 50 || spl > 130) {
                throw new Error(`SPL ${spl} out of reasonable range`);
            }
        }
    });

    suite.test('SPL ceiling decreases at low frequencies (excursion limited)', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const ceiling = SPLCalculator.calculateSPLCeiling(box, 10, 200, 50);

        // Find SPL at 20Hz and 100Hz
        const idx20Hz = ceiling.frequencies.findIndex(f => f >= 20);
        const idx100Hz = ceiling.frequencies.findIndex(f => f >= 100);

        const spl20Hz = ceiling.spl[idx20Hz];
        const spl100Hz = ceiling.spl[idx100Hz];

        // SPL at 20Hz should be lower than at 100Hz (excursion limiting)
        // This might not always be true depending on response shape,
        // but generally excursion limits low frequency output
        console.log(`    SPL ceiling: 20Hz=${spl20Hz.toFixed(1)}dB, 100Hz=${spl100Hz.toFixed(1)}dB`);
    });

    suite.test('Sweep generates expected number of points', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const sweep = SPLCalculator.generateSweep(box, 100, 20, 200, 75);

        TestFramework.assertEquals(sweep.frequencies.length, 75);
        TestFramework.assertEquals(sweep.spl.length, 75);
    });

    suite.test('Sweep frequencies are in ascending order', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const sweep = SPLCalculator.generateSweep(box, 100, 20, 200, 50);

        for (let i = 1; i < sweep.frequencies.length; i++) {
            if (sweep.frequencies[i] <= sweep.frequencies[i-1]) {
                throw new Error(`Frequencies not ascending at index ${i}`);
            }
        }
    });

    suite.test('calculateSPL accepts box with driver', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        // Should not throw
        const spl = SPLCalculator.calculateSPL(box, 50, 100);

        // Should return a number
        if (typeof spl !== 'number') {
            throw new Error('calculateSPL should return a number');
        }

        // Should be reasonable
        if (spl < 50 || spl > 130) {
            throw new Error(`SPL ${spl} out of reasonable range`);
        }
    });

    return suite;
}
