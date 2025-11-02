// MaxPowerCalculator.test.js
// Tests for maximum safe power calculations

function createMaxPowerCalculatorTests() {
    const suite = new TestFramework('MaxPowerCalculator');

    const testDriver = {
        fs: 27.4,
        qts: 0.39,
        qes: 0.49,
        qms: 2.5,
        vas: 185,
        re: 6.4,
        sd: 346,
        xmax: 12.7,
        pe: 500  // 500W thermal limit
    };

    suite.test('At high frequency, thermal limited', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        // At 150Hz, should be thermally limited (excursion low)
        const result = MaxPowerCalculator.calculateAtFrequency(box, 150);

        TestFramework.assertEquals(result.limitingFactor, 'thermal');
        TestFramework.assertAlmostEqual(result.maxPower, 500, 1); // Should be Pe
    });

    suite.test('At low frequency, excursion limited', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        // At 20Hz, should be excursion limited
        const result = MaxPowerCalculator.calculateAtFrequency(box, 20);

        TestFramework.assertEquals(result.limitingFactor, 'excursion');

        // Max power should be less than Pe
        if (result.maxPower >= testDriver.pe) {
            throw new Error(`At 20Hz, max power should be excursion limited (< ${testDriver.pe}W)`);
        }

        // Max power should be positive
        if (result.maxPower <= 0) {
            throw new Error('Max power should be positive');
        }
    });

    suite.test('Excursion at Xmax should equal driver Xmax', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const result = MaxPowerCalculator.calculateAtFrequency(box, 30);

        // If excursion limited, excursion should equal Xmax
        if (result.limitingFactor === 'excursion') {
            TestFramework.assertAlmostEqual(result.excursion, driver.xmax, 1);
        }
    });

    suite.test('Generates curve with correct structure', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const curve = MaxPowerCalculator.generateCurve(box);

        // Should return array of objects
        if (!Array.isArray(curve)) {
            throw new Error('generateCurve should return array');
        }

        // Each point should have required properties
        for (const point of curve) {
            if (!point.frequency || !point.maxPower || !point.limitingFactor) {
                throw new Error('Each point must have frequency, maxPower, limitingFactor');
            }
        }
    });

    suite.test('Curve has default frequencies if none provided', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const curve = MaxPowerCalculator.generateCurve(box);

        // Should have default frequency points
        if (curve.length < 10) {
            throw new Error('Should have at least 10 frequency points');
        }

        // First point should be low frequency
        if (curve[0].frequency > 15) {
            throw new Error('First point should be low frequency');
        }

        // Last point should be higher frequency
        if (curve[curve.length - 1].frequency < 100) {
            throw new Error('Last point should be >= 100Hz');
        }
    });

    suite.test('Curve uses custom frequencies when provided', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const customFreqs = [20, 40, 60, 80, 100];
        const curve = MaxPowerCalculator.generateCurve(box, customFreqs);

        TestFramework.assertEquals(curve.length, 5);
        TestFramework.assertEquals(curve[0].frequency, 20);
        TestFramework.assertEquals(curve[4].frequency, 100);
    });

    suite.test('Max power increases with frequency (generally)', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const curve = MaxPowerCalculator.generateCurve(box, [15, 25, 50, 100, 150]);

        // Generally, max power should increase as frequency increases
        // (excursion becomes less limiting)
        let increasingCount = 0;
        for (let i = 1; i < curve.length; i++) {
            if (curve[i].maxPower >= curve[i-1].maxPower) {
                increasingCount++;
            }
        }

        // Most points should be increasing (allow for some response shape variation)
        if (increasingCount < 3) {
            throw new Error('Max power should generally increase with frequency');
        }
    });

    suite.test('isSafe returns boolean', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const safe = MaxPowerCalculator.isSafe(box, 50, 100);

        if (typeof safe !== 'boolean') {
            throw new Error('isSafe should return boolean');
        }
    });

    suite.test('isSafe detects unsafe power at low frequency', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        // 500W at 20Hz is likely unsafe (excursion limited)
        const safe = MaxPowerCalculator.isSafe(box, 20, 500);

        TestFramework.assertEquals(safe, false);
    });

    suite.test('isSafe allows safe power at high frequency', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        // 100W at 150Hz should be safe (well below Pe)
        const safe = MaxPowerCalculator.isSafe(box, 150, 100);

        TestFramework.assertEquals(safe, true);
    });

    suite.test('getWarnings returns array', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const warnings = MaxPowerCalculator.getWarnings(box, 300);

        if (!Array.isArray(warnings)) {
            throw new Error('getWarnings should return array');
        }
    });

    suite.test('getWarnings detects excessive power', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        // 1000W is way too much for this driver
        const warnings = MaxPowerCalculator.getWarnings(box, 1000);

        if (warnings.length === 0) {
            throw new Error('Should have warnings for 1000W');
        }

        // Warnings should have required properties
        for (const warning of warnings) {
            if (!warning.frequency || !warning.limitingFactor || !warning.message) {
                throw new Error('Warning must have frequency, limitingFactor, message');
            }
        }
    });

    suite.test('getWarnings empty for safe power', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        // 50W should be safe across most frequencies
        const warnings = MaxPowerCalculator.getWarnings(box, 50);

        // Should have few or no warnings
        if (warnings.length > 2) {
            throw new Error('50W should be generally safe, got too many warnings');
        }
    });

    suite.test('calculateExcursion returns positive value', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const excursion = MaxPowerCalculator.calculateExcursion(box, 30, 100);

        if (excursion <= 0) {
            throw new Error('Excursion should be positive');
        }
    });

    suite.test('Higher power gives higher excursion', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const exc100W = MaxPowerCalculator.calculateExcursion(box, 30, 100);
        const exc200W = MaxPowerCalculator.calculateExcursion(box, 30, 200);

        if (exc200W <= exc100W) {
            throw new Error('200W should give higher excursion than 100W');
        }
    });

    suite.test('Lower frequency gives higher excursion (same power)', () => {
        const driver = new Driver(testDriver);
        const box = new SealedBox(driver, 80.9);

        const exc20Hz = MaxPowerCalculator.calculateExcursion(box, 20, 100);
        const exc100Hz = MaxPowerCalculator.calculateExcursion(box, 100, 100);

        if (exc20Hz <= exc100Hz) {
            throw new Error('20Hz should give higher excursion than 100Hz at same power');
        }
    });

    suite.test('Mms estimator accuracy - Dayton UM18-22 V2', () => {
        // Real driver: Dayton Audio UM18-22 V2 (18" subwoofer)
        // Published Mms: 240 grams (from datasheet)
        const um18Driver = {
            fs: 22.0,
            qts: 0.530,
            vas: 248.2,  // liters
            sd: 1140     // cm²
        };

        const estimated = MaxPowerCalculator._estimateMms(um18Driver);
        const published = 240;  // grams (from datasheet)

        const error = Math.abs(estimated - published) / published;

        // Should be within 15% of published value
        if (error > 0.15) {
            throw new Error(
                `Mms estimator error too high: ${(error * 100).toFixed(1)}% ` +
                `(estimated: ${estimated.toFixed(1)}g, published: ${published}g). ` +
                `Should be within 15%.`
            );
        }

        // Log the accuracy for informational purposes
        console.log(`Mms estimation accuracy: ${(error * 100).toFixed(1)}% error ` +
                    `(estimated: ${estimated.toFixed(1)}g, published: ${published}g)`);
    });

    return suite;
}
