// AlignmentCalculator Tests - Validates standard alignments

function createAlignmentCalculatorTests() {
    const suite = new TestFramework('AlignmentCalculator');

    const createTestDriver = () => new Driver({
        fs: 27.4,
        qts: 0.39,
        vas: 185,
        re: 3.5,
        xmax: 18,
        sd: 1160,
        pe: 500
    });

    suite.test('Calculates Butterworth alignment correctly', () => {
        const driver = createTestDriver();
        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);

        const butterworth = alignments.find(a => a.name.includes('Butterworth'));
        TestFramework.assertExists(butterworth, 'Butterworth alignment should exist');

        // Should target Qtc = 0.707
        TestFramework.assertAlmostEqual(butterworth.qtc, 0.707, 2);

        // Box volume should be calculated correctly
        // α = (0.707/0.39)² - 1 = 2.286
        // Vb = 185 / 2.286 = 80.9L
        TestFramework.assertAlmostEqual(butterworth.vb, 80.9, 1);
    });

    suite.test('Calculates Bessel alignment correctly', () => {
        const driver = createTestDriver();
        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);

        const bessel = alignments.find(a => a.name.includes('Bessel'));
        TestFramework.assertExists(bessel, 'Bessel alignment should exist');

        // Should target Qtc = 0.577
        TestFramework.assertAlmostEqual(bessel.qtc, 0.577, 2);

        // Box should be larger than Butterworth (lower Qtc needs larger box)
        const butterworth = alignments.find(a => a.name.includes('Butterworth'));
        TestFramework.assertTrue(bessel.vb > butterworth.vb);
    });

    suite.test('Calculates Chebychev alignment correctly', () => {
        const driver = createTestDriver();
        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);

        const cheby = alignments.find(a => a.name.includes('Chebychev'));
        TestFramework.assertExists(cheby, 'Chebychev alignment should exist');

        // Should target Qtc = 1.0
        TestFramework.assertAlmostEqual(cheby.qtc, 1.0, 2);

        // Box should be smaller than Butterworth (higher Qtc needs smaller box)
        const butterworth = alignments.find(a => a.name.includes('Butterworth'));
        TestFramework.assertTrue(cheby.vb < butterworth.vb);
    });

    suite.test('All alignments have required properties', () => {
        const driver = createTestDriver();
        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);

        for (const alignment of alignments) {
            TestFramework.assertExists(alignment.name);
            TestFramework.assertExists(alignment.vb);
            TestFramework.assertExists(alignment.qtc);
            TestFramework.assertExists(alignment.box);
            TestFramework.assertExists(alignment.fc);
            TestFramework.assertExists(alignment.f3);
        }
    });

    suite.test('Alignments sorted by volume (smallest to largest)', () => {
        const driver = createTestDriver();
        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);

        for (let i = 1; i < alignments.length; i++) {
            TestFramework.assertTrue(
                alignments[i].vb >= alignments[i - 1].vb,
                'Alignments should be sorted by volume'
            );
        }
    });

    suite.test('QB3 ported alignment: Fb = Fs', () => {
        const driver = new Driver({
            fs: 34.3,
            qts: 0.35,
            vas: 201,
            re: 5.4,
            xmax: 8.5,
            sd: 860,
            pe: 800
        });

        const alignments = AlignmentCalculator.calculatePortedAlignments(driver, { portDiameter: 10 });
        const qb3 = alignments.find(a => a.name.includes('QB3'));

        TestFramework.assertExists(qb3);
        // QB3: Fb = Fs
        TestFramework.assertAlmostEqual(qb3.fb, driver.fs, 1);
    });

    suite.test('QB3 ported alignment: Vb formula', () => {
        const driver = new Driver({
            fs: 34.3,
            qts: 0.35,
            vas: 201
        });

        const alignments = AlignmentCalculator.calculatePortedAlignments(driver);
        const qb3 = alignments.find(a => a.name.includes('QB3'));

        // QB3: Vb = 15 × Qts^3.3 × Vas
        const expectedVb = 15 * Math.pow(0.35, 3.3) * 201;
        TestFramework.assertAlmostEqual(qb3.vb, expectedVb, 5);
    });

    suite.test('High Qts driver unsuitable for some alignments', () => {
        // Very high Qts driver
        const driver = new Driver({
            fs: 25,
            qts: 0.80, // Too high for Butterworth in reasonable box
            vas: 100
        });

        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);

        // Should skip alignments that would require negative alpha
        // Butterworth needs Qtc=0.707, which is less than Qts=0.80
        // So Butterworth is impossible
        const butterworth = alignments.find(a => a.name.includes('Butterworth'));
        TestFramework.assertEquals(butterworth, undefined);
    });

    suite.test('Low Qts driver suitable for all sealed alignments', () => {
        const driver = new Driver({
            fs: 25,
            qts: 0.30, // Low, good for sealed
            vas: 150
        });

        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);

        // Should have Butterworth, Bessel, and Chebychev
        TestFramework.assertTrue(alignments.length >= 3);
    });

    suite.test('findOptimalAlignment prefers Butterworth for sealed', () => {
        const driver = createTestDriver();
        const optimal = AlignmentCalculator.findOptimalAlignment(driver, 'sealed');

        TestFramework.assertExists(optimal);
        TestFramework.assertTrue(optimal.name.includes('Butterworth'));
    });

    suite.test('Port length calculated for ported alignments', () => {
        const driver = new Driver({
            fs: 34.3,
            qts: 0.35,
            vas: 201,
            sd: 860
        });

        const alignments = AlignmentCalculator.calculatePortedAlignments(driver, { portDiameter: 10 });
        const qb3 = alignments.find(a => a.name.includes('QB3'));

        TestFramework.assertExists(qb3.portLength);
        TestFramework.assertTrue(qb3.portLength > 0);
    });

    suite.test('Port velocity calculated for ported alignments', () => {
        const driver = new Driver({
            fs: 34.3,
            qts: 0.35,
            vas: 201,
            sd: 860,
            xmax: 8.5
        });

        const alignments = AlignmentCalculator.calculatePortedAlignments(driver, { portDiameter: 10 });
        const qb3 = alignments.find(a => a.name.includes('QB3'));

        TestFramework.assertExists(qb3.portVelocity);
        TestFramework.assertTrue(qb3.portVelocity > 0);
    });

    return suite;
}
