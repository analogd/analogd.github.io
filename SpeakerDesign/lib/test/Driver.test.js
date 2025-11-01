// Driver Model Tests

function createDriverTests() {
    const suite = new TestFramework('Driver Model');

    suite.test('Creates driver with basic T-S parameters', () => {
        const driver = new Driver({
            fs: 22,
            qts: 0.53,
            qes: 0.67,
            qms: 2.53,
            vas: 248.2,
            re: 4.2,
            le: 1.15,
            xmax: 28,
            sd: 1184,
            pe: 1200
        });

        TestFramework.assertEquals(driver.fs, 22);
        TestFramework.assertEquals(driver.qts, 0.53);
        TestFramework.assertEquals(driver.vas, 248.2);
    });

    suite.test('Calculates EBP correctly', () => {
        // EBP = Fs / Qes
        const driver = new Driver({
            fs: 22,
            qts: 0.53,
            qes: 0.67,
            vas: 248.2
        });

        const expectedEBP = 22 / 0.67; // = 32.8
        TestFramework.assertAlmostEqual(driver.derived.ebp, expectedEBP, 1);
    });

    suite.test('Classifies EBP as sealed (< 50)', () => {
        const driver = new Driver({
            fs: 28,
            qes: 0.70,
            qts: 0.5,
            vas: 100
        });

        // EBP = 28 / 0.70 = 40
        TestFramework.assertEquals(driver.derived.enclosureHint, 'sealed');
    });

    suite.test('Classifies EBP as versatile (50-100)', () => {
        const driver = new Driver({
            fs: 30,
            qes: 0.50,
            qts: 0.4,
            vas: 100
        });

        // EBP = 30 / 0.50 = 60
        TestFramework.assertEquals(driver.derived.enclosureHint, 'versatile');
    });

    suite.test('Classifies EBP as ported (> 100)', () => {
        const driver = new Driver({
            fs: 35,
            qes: 0.30,
            qts: 0.35,
            vas: 150
        });

        // EBP = 35 / 0.30 = 116.7
        TestFramework.assertEquals(driver.derived.enclosureHint, 'ported');
    });

    suite.test('Calculates Vd (displacement volume)', () => {
        const driver = new Driver({
            fs: 22,
            qts: 0.53,
            vas: 248.2,
            sd: 1184,  // cm²
            xmax: 28   // mm
        });

        // Vd = Sd × Xmax = 1184 cm² × 28 mm = 33,152 cm³
        const expectedVd = 1184 * 28;
        TestFramework.assertEquals(driver.derived.vd, expectedVd);
    });

    suite.test('Handles missing optional parameters', () => {
        const driver = new Driver({
            fs: 22,
            qts: 0.53,
            vas: 248.2
        });

        TestFramework.assertEquals(driver.fs, 22);
        TestFramework.assertEquals(driver.xmax, undefined);
    });

    suite.test('canCalculateExcursion returns true with xmax and sd', () => {
        const driver = new Driver({
            fs: 22,
            qts: 0.53,
            vas: 248.2,
            xmax: 28,
            sd: 1184
        });

        TestFramework.assertTrue(driver.canCalculateExcursion());
    });

    suite.test('canCalculateExcursion returns false without xmax', () => {
        const driver = new Driver({
            fs: 22,
            qts: 0.53,
            vas: 248.2,
            sd: 1184
        });

        TestFramework.assertFalse(driver.canCalculateExcursion());
    });

    suite.test('canCalculateThermalLimit returns true with pe', () => {
        const driver = new Driver({
            fs: 22,
            qts: 0.53,
            vas: 248.2,
            pe: 1200
        });

        TestFramework.assertTrue(driver.canCalculateThermalLimit());
    });

    suite.test('Calculates reference sensitivity (η₀ formula)', () => {
        // UMII18-22 parameters
        const driver = new Driver({
            fs: 22.0,
            qts: 0.53,
            qes: 0.67,
            vas: 248.2
        });

        // Should calculate sensitivity
        TestFramework.assertTrue(driver.derived.sensitivity !== undefined);

        // Should be in reasonable range (85-95 dB for subwoofer)
        const sens = driver.derived.sensitivity;
        if (sens < 80 || sens > 100) {
            throw new Error(`Sensitivity ${sens} dB out of reasonable range`);
        }

        // For UMII18-22: WinISD shows 90.7, we calculate ~87.9
        // Within ±3dB is acceptable for simplified formula
        console.log(`    Calculated sensitivity: ${sens.toFixed(1)} dB (WinISD: 90.7 dB)`);
    });

    suite.test('Sensitivity requires Fs, Vas, and Qes', () => {
        // Without Qes, should fall back to estimate
        const driverNoQes = new Driver({
            fs: 22.0,
            qts: 0.53,
            vas: 248.2
        });

        TestFramework.assertTrue(driverNoQes.derived.sensitivity === undefined);
        TestFramework.assertTrue(driverNoQes.derived.sensitivityEst !== undefined);
    });

    return suite;
}
