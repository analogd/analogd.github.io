// Validation test suite - validates calculations against known formulas
class LibraryValidator {
    static runAllTests() {
        const results = [];

        results.push(this.testSealedButterworth());
        results.push(this.testPortedQB3());
        results.push(this.testSealedSmall());
        results.push(this.testResponseCurve());
        results.push(this.testPortVelocity());
        results.push(this.testSealedHighQts());
        results.push(this.testPortedLowQts());
        results.push(this.testEBPClassification());

        return this.summarizeResults(results);
    }

    // Test 1: Sealed Butterworth
    static testSealedButterworth() {
        const ref = ReferenceData.sealed_butterworth;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);
        const butterworth = alignments.find(a => a.name.includes('Butterworth'));

        if (!butterworth) {
            return { test: 'Sealed Butterworth', passed: false, error: 'Butterworth alignment not found' };
        }

        const checks = {
            vb: Math.abs(butterworth.vb - ref.expected.vb) <= ref.tolerance.vb,
            qtc: Math.abs(butterworth.qtc - ref.expected.qtc) <= ref.tolerance.qtc,
            fc: Math.abs(butterworth.box.fc - ref.expected.fc) <= ref.tolerance.fc,
            f3: Math.abs(butterworth.box.f3 - ref.expected.f3) <= ref.tolerance.f3
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'Sealed Butterworth',
            passed: passed,
            checks: checks,
            actual: { vb: butterworth.vb.toFixed(1), qtc: butterworth.qtc.toFixed(3), fc: butterworth.box.fc.toFixed(1), f3: butterworth.box.f3.toFixed(1) },
            expected: ref.expected
        };
    }

    // Test 2: Ported QB3
    static testPortedQB3() {
        const ref = ReferenceData.ported_qb3;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculatePortedAlignments(driver, { portDiameter: 10 });
        const qb3 = alignments.find(a => a.name.includes('QB3'));

        if (!qb3) {
            return { test: 'Ported QB3', passed: false, error: 'QB3 alignment not found' };
        }

        const checks = {
            vb: Math.abs(qb3.vb - ref.expected.vb) <= ref.tolerance.vb,
            fb: Math.abs(qb3.fb - ref.expected.fb) <= ref.tolerance.fb,
            f3: Math.abs(qb3.box.f3 - ref.expected.f3) <= ref.tolerance.f3,
            portLength: Math.abs(qb3.portLength - ref.expected.portLength) <= ref.tolerance.portLength
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'Ported QB3',
            passed: passed,
            checks: checks,
            actual: { vb: qb3.vb.toFixed(1), fb: qb3.fb.toFixed(1), f3: qb3.box.f3.toFixed(1), portLength: qb3.portLength.toFixed(1) },
            expected: ref.expected
        };
    }

    // Test 3: Small sealed
    static testSealedSmall() {
        const ref = ReferenceData.sealed_small;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);
        const butterworth = alignments.find(a => a.name.includes('Butterworth'));

        if (!butterworth) {
            return { test: 'Sealed Small', passed: false, error: 'Butterworth alignment not found' };
        }

        const checks = {
            vb: Math.abs(butterworth.vb - ref.expected.vb) <= ref.tolerance.vb,
            qtc: Math.abs(butterworth.qtc - ref.expected.qtc) <= ref.tolerance.qtc,
            fc: Math.abs(butterworth.box.fc - ref.expected.fc) <= ref.tolerance.fc,
            f3: Math.abs(butterworth.box.f3 - ref.expected.f3) <= ref.tolerance.f3
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'Sealed Small',
            passed: passed,
            checks: checks,
            actual: { vb: butterworth.vb.toFixed(1), qtc: butterworth.qtc.toFixed(3), fc: butterworth.box.fc.toFixed(1), f3: butterworth.box.f3.toFixed(1) },
            expected: ref.expected
        };
    }

    // Test 4: Response curve
    static testResponseCurve() {
        const ref = ReferenceData.response_sealed;
        const driver = new Driver(ref.driver);
        const box = new SealedBox(driver, ref.box.vb);

        const checks = {};
        for (const point of ref.responsePoints) {
            const actualDb = box.responseDbAt(point.frequency);
            checks[`${point.frequency}Hz`] = Math.abs(actualDb - point.expectedDb) <= ref.tolerance;
        }

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'Response Curve',
            passed: passed,
            checks: checks,
            actual: ref.responsePoints.map(p => ({ freq: p.frequency, db: box.responseDbAt(p.frequency).toFixed(1) })),
            expected: ref.responsePoints.map(p => ({ freq: p.frequency, db: p.expectedDb }))
        };
    }

    // Test 5: Port velocity
    static testPortVelocity() {
        const ref = ReferenceData.port_velocity;
        const velocity = SpeakerPhysics.calculatePortVelocity(
            ref.driver.sd,
            ref.driver.xmax,
            ref.port.fb,
            ref.port.diameter
        );

        const passed = Math.abs(velocity - ref.expected.velocity) <= ref.tolerance;

        return {
            test: 'Port Velocity',
            passed: passed,
            actual: velocity.toFixed(1) + ' m/s',
            expected: ref.expected.velocity + ' m/s'
        };
    }

    // Test 6: Sealed high Qts
    static testSealedHighQts() {
        const ref = ReferenceData.sealed_high_qts;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);
        const butterworth = alignments.find(a => a.name.includes('Butterworth'));

        if (!butterworth) {
            return { test: 'Sealed High Qts', passed: false, error: 'Butterworth alignment not found' };
        }

        const checks = {
            vb: Math.abs(butterworth.vb - ref.expected.vb) <= ref.tolerance.vb,
            qtc: Math.abs(butterworth.qtc - ref.expected.qtc) <= ref.tolerance.qtc,
            fc: Math.abs(butterworth.box.fc - ref.expected.fc) <= ref.tolerance.fc,
            f3: Math.abs(butterworth.box.f3 - ref.expected.f3) <= ref.tolerance.f3
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'Sealed High Qts',
            passed: passed,
            checks: checks,
            actual: { vb: butterworth.vb.toFixed(1), qtc: butterworth.qtc.toFixed(3), fc: butterworth.box.fc.toFixed(1), f3: butterworth.box.f3.toFixed(1) },
            expected: ref.expected
        };
    }

    // Test 7: Ported low Qts
    static testPortedLowQts() {
        const ref = ReferenceData.ported_low_qts;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculatePortedAlignments(driver);
        const qb3 = alignments.find(a => a.name.includes('QB3'));

        if (!qb3) {
            return { test: 'Ported Low Qts', passed: false, error: 'QB3 alignment not found' };
        }

        const checks = {
            vb: Math.abs(qb3.vb - ref.expected.vb) <= ref.tolerance.vb,
            fb: Math.abs(qb3.fb - ref.expected.fb) <= ref.tolerance.fb,
            f3: Math.abs(qb3.box.f3 - ref.expected.f3) <= ref.tolerance.f3
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'Ported Low Qts',
            passed: passed,
            checks: checks,
            actual: { vb: qb3.vb.toFixed(1), fb: qb3.fb.toFixed(1), f3: qb3.box.f3.toFixed(1) },
            expected: ref.expected
        };
    }

    // Test 8: EBP classification
    static testEBPClassification() {
        const ref = ReferenceData.ebp_classification;
        const checks = {};

        for (const testCase of ref.cases) {
            const driver = new Driver(testCase.driver);
            const ebp = driver.derived.ebp;
            const hint = driver.derived.enclosureHint;

            checks[testCase.name + '_ebp'] = Math.abs(ebp - testCase.expected.ebp) <= ref.tolerance;
            checks[testCase.name + '_hint'] = hint === testCase.expected.hint;
        }

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'EBP Classification',
            passed: passed,
            checks: checks
        };
    }

    // Summarize test results
    static summarizeResults(results) {
        const passed = results.filter(r => r.passed).length;
        const total = results.length;

        return {
            passed: passed,
            total: total,
            allPassed: passed === total,
            results: results
        };
    }

    // Pretty print test results
    static printResults(summary) {
        console.log(`\n=== Library Validation Results ===`);
        console.log(`Passed: ${summary.passed}/${summary.total}`);
        console.log(`Status: ${summary.allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}\n`);

        for (const result of summary.results) {
            const status = result.passed ? '✓' : '✗';
            console.log(`${status} ${result.test}`);

            if (!result.passed) {
                if (result.error) {
                    console.log(`  Error: ${result.error}`);
                } else {
                    console.log(`  Expected:`, result.expected);
                    console.log(`  Actual:  `, result.actual);
                    if (result.checks) {
                        console.log(`  Checks:  `, result.checks);
                    }
                }
            }
            console.log('');
        }

        return summary.allPassed;
    }
}

// Quick validation function
function validateLibrary() {
    const summary = LibraryValidator.runAllTests();
    return LibraryValidator.printResults(summary);
}
