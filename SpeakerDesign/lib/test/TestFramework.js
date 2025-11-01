// Simple test framework - no dependencies needed
// Works in browser console or Node.js

class TestFramework {
    constructor(suiteName) {
        this.suiteName = suiteName;
        this.tests = [];
        this.results = {
            passed: 0,
            failed: 0,
            total: 0,
            failures: []
        };
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🧪 Running: ${this.suiteName}`);
        console.log('='.repeat(60));

        for (const test of this.tests) {
            try {
                await test.fn();
                this.results.passed++;
                console.log(`✅ ${test.name}`);
            } catch (error) {
                this.results.failed++;
                this.results.failures.push({
                    test: test.name,
                    error: error.message
                });
                console.error(`❌ ${test.name}`);
                console.error(`   ${error.message}`);
            }
            this.results.total++;
        }

        this.printSummary();
        return this.results;
    }

    printSummary() {
        console.log('\n' + '-'.repeat(60));
        console.log(`📊 Results: ${this.results.passed}/${this.results.total} passed`);

        if (this.results.failed === 0) {
            console.log('🎉 All tests passed!');
        } else {
            console.log(`⚠️  ${this.results.failed} test(s) failed`);
        }
        console.log('='.repeat(60) + '\n');
    }

    // Assertion helpers
    static assert(condition, message = 'Assertion failed') {
        if (!condition) {
            throw new Error(message);
        }
    }

    static assertEquals(actual, expected, tolerance = 0, message = '') {
        const diff = Math.abs(actual - expected);
        if (diff > tolerance) {
            throw new Error(
                message ||
                `Expected ${expected} (±${tolerance}), got ${actual} (diff: ${diff.toFixed(6)})`
            );
        }
    }

    static assertAlmostEqual(actual, expected, decimalPlaces = 2, message = '') {
        const tolerance = Math.pow(10, -decimalPlaces) / 2;
        this.assertEquals(actual, expected, tolerance, message);
    }

    static assertBetween(value, min, max, message = '') {
        if (value < min || value > max) {
            throw new Error(
                message ||
                `Expected value between ${min} and ${max}, got ${value}`
            );
        }
    }

    static assertTrue(condition, message = 'Expected true') {
        if (!condition) {
            throw new Error(message);
        }
    }

    static assertFalse(condition, message = 'Expected false') {
        if (condition) {
            throw new Error(message);
        }
    }

    static assertExists(value, message = 'Expected value to exist') {
        if (value === null || value === undefined) {
            throw new Error(message);
        }
    }

    static assertArrayEquals(actual, expected, tolerance = 0) {
        if (actual.length !== expected.length) {
            throw new Error(`Array length mismatch: expected ${expected.length}, got ${actual.length}`);
        }

        for (let i = 0; i < actual.length; i++) {
            if (Math.abs(actual[i] - expected[i]) > tolerance) {
                throw new Error(
                    `Array element [${i}] mismatch: expected ${expected[i]}, got ${actual[i]}`
                );
            }
        }
    }
}

// Test runner for multiple suites
class TestRunner {
    constructor() {
        this.suites = [];
    }

    addSuite(suite) {
        this.suites.push(suite);
    }

    async runAll() {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 RUNNING ALL TEST SUITES');
        console.log('='.repeat(60));

        const summary = {
            totalPassed: 0,
            totalFailed: 0,
            totalTests: 0,
            suites: []
        };

        for (const suite of this.suites) {
            const results = await suite.run();
            summary.totalPassed += results.passed;
            summary.totalFailed += results.failed;
            summary.totalTests += results.total;
            summary.suites.push({
                name: suite.suiteName,
                results
            });
        }

        this.printOverallSummary(summary);
        return summary;
    }

    printOverallSummary(summary) {
        console.log('\n' + '='.repeat(60));
        console.log('📈 OVERALL SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${summary.totalTests}`);
        console.log(`Passed: ${summary.totalPassed}`);
        console.log(`Failed: ${summary.totalFailed}`);
        console.log(`Success Rate: ${((summary.totalPassed / summary.totalTests) * 100).toFixed(1)}%`);

        if (summary.totalFailed === 0) {
            console.log('\n🎉🎉🎉 ALL TESTS PASSED! 🎉🎉🎉');
        } else {
            console.log('\n⚠️  Some tests failed - review output above');
        }
        console.log('='.repeat(60) + '\n');
    }
}
