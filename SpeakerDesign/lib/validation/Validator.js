// Validation test suite - validates calculations against reference data
class LibraryValidator {
    static runAllTests() {
        const results = [];

        results.push(this.testUM18SealedButterworth());
        results.push(this.testBC15SW76PortedQB3());
        results.push(this.testSmallSealed());
        results.push(this.testResponseCurve());
        results.push(this.testPortVelocity());
        results.push(this.testHighQtsSealed());
        results.push(this.testLowQtsPorted());
        results.push(this.testEBPClassification());

        return this.summarizeResults(results);
    }

    // Test 1: Dayton UM18-22 sealed Butterworth
    static testUM18SealedButterworth() {
        const ref = ReferenceData.um18_sealed_butterworth;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);
        const butterworth = alignments.find(a => a.name.includes('Butterworth'));

        if (!butterworth) {
            return { test: 'UM18 Sealed Butterworth', passed: false, error: 'Butterworth alignment not found' };
        }

        const checks = {
            vb: Math.abs(butterworth.vb - ref.box.vb) <= ref.tolerance.vb,
            qtc: Math.abs(butterworth.qtc - ref.box.expectedQtc) <= ref.tolerance.qtc,
            fc: Math.abs(butterworth.box.fc - ref.box.expectedFc) <= ref.tolerance.fc,
            f3: Math.abs(butterworth.box.f3 - ref.box.expectedF3) <= ref.tolerance.f3
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'UM18 Sealed Butterworth',
            passed: passed,
            checks: checks,
            actual: { vb: butterworth.vb, qtc: butterworth.qtc, fc: butterworth.box.fc, f3: butterworth.box.f3 },
            expected: { vb: ref.box.vb, qtc: ref.box.expectedQtc, fc: ref.box.expectedFc, f3: ref.box.expectedF3 }
        };
    }

    // Test 2: B&C 15SW76 ported QB3
    static testBC15SW76PortedQB3() {
        const ref = ReferenceData.bc15sw76_ported_qb3;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculatePortedAlignments(driver, { portDiameter: 10 });
        const qb3 = alignments.find(a => a.name.includes('QB3'));

        if (!qb3) {
            return { test: 'BC15SW76 Ported QB3', passed: false, error: 'QB3 alignment not found' };
        }

        const checks = {
            vb: Math.abs(qb3.vb - ref.box.vb) <= ref.tolerance.vb,
            fb: Math.abs(qb3.fb - ref.box.fb) <= ref.tolerance.fb,
            f3: Math.abs(qb3.box.f3 - ref.box.expectedF3) <= ref.tolerance.f3,
            portLength: Math.abs(qb3.portLength - ref.box.expectedPortLength) <= ref.tolerance.portLength
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'BC15SW76 Ported QB3',
            passed: passed,
            checks: checks,
            actual: { vb: qb3.vb, fb: qb3.fb, f3: qb3.box.f3, portLength: qb3.portLength },
            expected: { vb: ref.box.vb, fb: ref.box.fb, f3: ref.box.expectedF3, portLength: ref.box.expectedPortLength }
        };
    }

    // Test 3: Small sealed driver
    static testSmallSealed() {
        const ref = ReferenceData.small_sealed;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);
        const butterworth = alignments.find(a => a.name.includes('Butterworth'));

        if (!butterworth) {
            return { test: 'Small Sealed', passed: false, error: 'Butterworth alignment not found' };
        }

        const checks = {
            vb: Math.abs(butterworth.vb - ref.box.vb) <= ref.tolerance.vb,
            qtc: Math.abs(butterworth.qtc - ref.box.expectedQtc) <= ref.tolerance.qtc,
            fc: Math.abs(butterworth.box.fc - ref.box.expectedFc) <= ref.tolerance.fc,
            f3: Math.abs(butterworth.box.f3 - ref.box.expectedF3) <= ref.tolerance.f3
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'Small Sealed',
            passed: passed,
            checks: checks,
            actual: { vb: butterworth.vb, qtc: butterworth.qtc, fc: butterworth.box.fc, f3: butterworth.box.f3 },
            expected: { vb: ref.box.vb, qtc: ref.box.expectedQtc, fc: ref.box.expectedFc, f3: ref.box.expectedF3 }
        };
    }

    // Test 4: Response curve shape
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
            test: 'Response Curve Shape',
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

        const passed = Math.abs(velocity - ref.expectedVelocity) <= ref.tolerance;

        return {
            test: 'Port Velocity',
            passed: passed,
            actual: velocity.toFixed(1),
            expected: ref.expectedVelocity
        };
    }

    // Test 6: High Qts sealed driver
    static testHighQtsSealed() {
        const ref = ReferenceData.high_qts_sealed;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);
        const butterworth = alignments.find(a => a.name.includes('Butterworth'));

        if (!butterworth) {
            return { test: 'High Qts Sealed', passed: false, error: 'Butterworth alignment not found' };
        }

        const checks = {
            vb: Math.abs(butterworth.vb - ref.box.vb) <= ref.tolerance.vb,
            qtc: Math.abs(butterworth.qtc - ref.box.expectedQtc) <= ref.tolerance.qtc,
            f3: Math.abs(butterworth.box.f3 - ref.box.expectedF3) <= ref.tolerance.f3
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'High Qts Sealed',
            passed: passed,
            checks: checks,
            actual: { vb: butterworth.vb, qtc: butterworth.qtc, f3: butterworth.box.f3 },
            expected: { vb: ref.box.vb, qtc: ref.box.expectedQtc, f3: ref.box.expectedF3 }
        };
    }

    // Test 7: Low Qts ported driver
    static testLowQtsPorted() {
        const ref = ReferenceData.low_qts_ported;
        const driver = new Driver(ref.driver);

        const alignments = AlignmentCalculator.calculatePortedAlignments(driver);
        const qb3 = alignments.find(a => a.name.includes('QB3'));

        if (!qb3) {
            return { test: 'Low Qts Ported', passed: false, error: 'QB3 alignment not found' };
        }

        const checks = {
            vb: Math.abs(qb3.vb - ref.box.expectedVb) <= ref.tolerance.vb,
            fb: Math.abs(qb3.fb - ref.box.fb) <= ref.tolerance.fb,
            f3: Math.abs(qb3.box.f3 - ref.box.expectedF3) <= ref.tolerance.f3
        };

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'Low Qts Ported',
            passed: passed,
            checks: checks,
            actual: { vb: qb3.vb, fb: qb3.fb, f3: qb3.box.f3 },
            expected: { vb: ref.box.expectedVb, fb: ref.box.fb, f3: ref.box.expectedF3 }
        };
    }

    // Test 8: EBP classification
    static testEBPClassification() {
        const ref = ReferenceData.ebp_classification;
        const checks = {};

        // Test sealed driver
        const sealedDriver = new Driver({ ...ref.sealed_driver, qts: 0.4, vas: 100 });
        const sealedEBP = sealedDriver.derived.ebp;
        const sealedHint = sealedDriver.derived.enclosureHint;
        checks.sealed_ebp = Math.abs(sealedEBP - ref.sealed_driver.expectedEBP) < 1.0;
        checks.sealed_hint = sealedHint === ref.sealed_driver.expectedHint;

        // Test ported driver
        const portedDriver = new Driver({ ...ref.ported_driver, qts: 0.35, vas: 150 });
        const portedEBP = portedDriver.derived.ebp;
        const portedHint = portedDriver.derived.enclosureHint;
        checks.ported_ebp = Math.abs(portedEBP - ref.ported_driver.expectedEBP) < 1.0;
        checks.ported_hint = portedHint === ref.ported_driver.expectedHint;

        // Test sealed-only driver
        const sealedOnlyDriver = new Driver({ ...ref.sealed_only_driver, qts: 0.5, vas: 100 });
        const sealedOnlyEBP = sealedOnlyDriver.derived.ebp;
        const sealedOnlyHint = sealedOnlyDriver.derived.enclosureHint;
        checks.sealed_only_ebp = Math.abs(sealedOnlyEBP - ref.sealed_only_driver.expectedEBP) < 1.0;
        checks.sealed_only_hint = sealedOnlyHint === ref.sealed_only_driver.expectedHint;

        const passed = Object.values(checks).every(v => v);

        return {
            test: 'EBP Classification',
            passed: passed,
            checks: checks,
            actual: {
                sealed: { ebp: sealedEBP, hint: sealedHint },
                ported: { ebp: portedEBP, hint: portedHint },
                sealedOnly: { ebp: sealedOnlyEBP, hint: sealedOnlyHint }
            },
            expected: {
                sealed: ref.sealed_driver,
                ported: ref.ported_driver,
                sealedOnly: ref.sealed_only_driver
            }
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
                    console.log(`  Checks:  `, result.checks);
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
