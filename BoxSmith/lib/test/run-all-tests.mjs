#!/usr/bin/env node
// Combined Test Runner - Foundation + Invariants + Engineering + Models + Filters + Klippel + Tools + Isobaric + ExternalAPI + PortCompression
// Usage: node lib/test/run-all-tests.mjs

import { runFoundationTests } from './Foundation.test.js';
import { runInvariantsTests } from './Invariants.test.js';
import { runEngineeringTests } from './Engineering.test.js';
import { runModelsTests } from './Models.test.js';
import { runFiltersTests } from './Filters.test.js';
import { runKlippelTests } from './Klippel.test.js';
import { runToolsTests } from './Tools.test.js';
import { runIsobaricTests } from './Isobaric.test.js';
import { runExternalAPITests } from './ExternalAPI.test.js';
import { runPortCompressionTests } from './PortCompression.test.js';
import { runScenariosTests } from './Scenarios.test.js';

// Test statistics
const testStats = {
    total: 0,
    passed: 0,
    failed: 0,
    currentGroup: null,
    failures: []
};

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(message, color = '') {
    console.log(color + message + colors.reset);
}

function describe(name, fn) {
    testStats.currentGroup = name;
    log(`\n${name}`, colors.magenta + colors.bold);
    fn();
    testStats.currentGroup = null;
}

function test(name, fn) {
    testStats.total++;
    try {
        fn();
        testStats.passed++;
        log(`  ✅ ${name}`, colors.green);
    } catch (error) {
        testStats.failed++;
        log(`  ❌ ${name}`, colors.red);
        log(`     ${error.message}`, colors.red);
        testStats.failures.push({
            group: testStats.currentGroup,
            test: name,
            error: error.message
        });
    }
}

const expect = (actual) => ({
    toBe(expected) {
        if (actual !== expected) {
            throw new Error(`Expected ${expected}, got ${actual}`);
        }
    },
    toBeCloseTo(expected, decimals = 2) {
        const factor = Math.pow(10, decimals);
        const roundedActual = Math.round(actual * factor) / factor;
        const roundedExpected = Math.round(expected * factor) / factor;
        if (roundedActual !== roundedExpected) {
            throw new Error(`Expected ${expected}, got ${actual} (rounded to ${decimals} decimals)`);
        }
    },
    toBeGreaterThan(expected) {
        if (actual <= expected) {
            throw new Error(`Expected ${actual} > ${expected}`);
        }
    },
    toBeLessThan(expected) {
        if (actual >= expected) {
            throw new Error(`Expected ${actual} < ${expected}`);
        }
    },
    toBeGreaterThanOrEqual(expected) {
        if (actual < expected) {
            throw new Error(`Expected ${actual} >= ${expected}`);
        }
    },
    toBeLessThanOrEqual(expected) {
        if (actual > expected) {
            throw new Error(`Expected ${actual} <= ${expected}`);
        }
    },
    toBeDefined() {
        if (actual === undefined) {
            throw new Error('Expected value to be defined');
        }
    },
    toBeUndefined() {
        if (actual !== undefined) {
            throw new Error('Expected value to be undefined');
        }
    },
    toContain(str) {
        if (!actual.includes(str)) {
            throw new Error(`Expected "${actual}" to contain "${str}"`);
        }
    },
    toHaveProperty(prop) {
        if (!(prop in actual)) {
            throw new Error(`Missing property: ${prop}`);
        }
    },
    toBeInstanceOf(expectedClass) {
        if (!(actual instanceof expectedClass)) {
            throw new Error(`Expected instance of ${expectedClass.name}, got ${actual?.constructor?.name || typeof actual}`);
        }
    },
    toThrow(expectedMessage) {
        try {
            actual();
            throw new Error('Expected function to throw');
        } catch (e) {
            if (e.message === 'Expected function to throw') throw e;
            // Check message contains expected substring if provided
            if (expectedMessage && !e.message.includes(expectedMessage)) {
                throw new Error(`Expected error containing "${expectedMessage}", got: "${e.message}"`);
            }
            // Expected
        }
    }
});

const TestFramework = { test, expect, describe };

// Run all tests
log('\n' + '═'.repeat(70), colors.blue);
log('🧪 SPEAKERDESIGN - COMPLETE TEST SUITE', colors.cyan + colors.bold);
log('═'.repeat(70), colors.blue);

log('\n📚 PART 1: Foundation Tests (Unit + Integration)', colors.cyan);
log('Testing paper-based functions\n', colors.cyan);
runFoundationTests(TestFramework);
const foundationCount = testStats.total;

log('\n📚 PART 2: Physics Invariants', colors.cyan);
log('Verifying physical laws hold\n', colors.cyan);
runInvariantsTests(TestFramework);
const invariantCount = testStats.total - foundationCount;

log('\n📚 PART 3: Engineering Layer', colors.cyan);
log('Testing displacement and power limits\n', colors.cyan);
runEngineeringTests(TestFramework);
const engineeringCount = testStats.total - foundationCount - invariantCount;

log('\n📚 PART 4: Models Layer', colors.cyan);
log('Testing validated domain objects\n', colors.cyan);
runModelsTests(TestFramework);
const modelsCount = testStats.total - foundationCount - invariantCount - engineeringCount;

log('\n📚 PART 5: Filters/Modifiers', colors.cyan);
log('Testing UI transfer functions and modifier stack\n', colors.cyan);
runFiltersTests(TestFramework);
const filtersCount = testStats.total - foundationCount - invariantCount - engineeringCount - modelsCount;

log('\n📚 PART 6: Klippel Nonlinear Modeling', colors.cyan);
log('Testing large-signal parameter estimation\n', colors.cyan);
runKlippelTests(TestFramework);
const klippelCount = testStats.total - foundationCount - invariantCount - engineeringCount - modelsCount - filtersCount;

log('\n📚 PART 7: Tools/Utilities', colors.cyan);
log('Testing unit converters, exporters, validators\n', colors.cyan);
runToolsTests(TestFramework);
const toolsCount = testStats.total - foundationCount - invariantCount - engineeringCount - modelsCount - filtersCount - klippelCount;

log('\n📚 PART 8: Isobaric (Compound) Driver', colors.cyan);
log('Testing parameter transforms for compound loading\n', colors.cyan);
runIsobaricTests(TestFramework);
const isobaricCount = testStats.total - foundationCount - invariantCount - engineeringCount - modelsCount - filtersCount - klippelCount - toolsCount;

log('\n📚 PART 9: External API Contract', colors.cyan);
log('Testing public API surface for external consumers\n', colors.cyan);
runExternalAPITests(TestFramework);
const externalAPICount = testStats.total - foundationCount - invariantCount - engineeringCount - modelsCount - filtersCount - klippelCount - toolsCount - isobaricCount;

log('\n📚 PART 10: Port Compression (Salvatti/Bezzola)', colors.cyan);
log('Testing turbulence and compression modeling\n', colors.cyan);
runPortCompressionTests(TestFramework);
const portCompressionCount = testStats.total - foundationCount - invariantCount - engineeringCount - modelsCount - filtersCount - klippelCount - toolsCount - isobaricCount - externalAPICount;

log('\n📚 PART 11: Scenarios ("What would a human see?")', colors.cyan);
log('Testing full model pipeline with real drivers\n', colors.cyan);
runScenariosTests(TestFramework);
const scenariosCount = testStats.total - foundationCount - invariantCount - engineeringCount - modelsCount - filtersCount - klippelCount - toolsCount - isobaricCount - externalAPICount - portCompressionCount;

// Summary
const successRate = testStats.total > 0
    ? ((testStats.passed / testStats.total) * 100).toFixed(1)
    : 0;

log('\n' + '═'.repeat(70), colors.blue);
log('📊 COMPLETE TEST RESULTS', colors.cyan + colors.bold);
log('═'.repeat(70), colors.blue);

log(`Foundation:   ${foundationCount} tests`, colors.cyan);
log(`Invariants:   ${invariantCount} tests`, colors.cyan);
log(`Engineering:  ${engineeringCount} tests`, colors.cyan);
log(`Models:       ${modelsCount} tests`, colors.cyan);
log(`Filters:      ${filtersCount} tests`, colors.cyan);
log(`Klippel:      ${klippelCount} tests`, colors.cyan);
log(`Tools:        ${toolsCount} tests`, colors.cyan);
log(`Isobaric:     ${isobaricCount} tests`, colors.cyan);
log(`ExternalAPI:  ${externalAPICount} tests`, colors.cyan);
log(`PortCompress: ${portCompressionCount} tests`, colors.cyan);
log(`Scenarios:    ${scenariosCount} tests`, colors.cyan);
log(`Total:        ${testStats.total} tests`, colors.cyan);
log(`Passed:       ${testStats.passed}`, colors.green);
log(`Failed:       ${testStats.failed}`, testStats.failed > 0 ? colors.red : colors.green);
log(`Success:      ${successRate}%`, successRate === '100.0' ? colors.green : colors.yellow);

if (testStats.failed > 0) {
    log('\n❌ FAILURES:', colors.red + colors.bold);
    for (const failure of testStats.failures) {
        log(`\n  ${failure.group}`, colors.magenta);
        log(`    ${failure.test}`, colors.red);
        log(`    ${failure.error}`, colors.red);
    }
    process.exit(1);
} else {
    log('\n✅ All tests passed!', colors.green + colors.bold);
    log('Foundation solid. Models validated. Ready for UI.\n', colors.green);
    process.exit(0);
}
