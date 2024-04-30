#!/usr/bin/env node
// Physics Invariants Test Runner
// Usage: node lib/test/run-invariants-tests.mjs
//
// These tests verify physical laws hold - not specific values.
// If these fail, the code has fundamental physics errors.

import { runInvariantsTests } from './Invariants.test.js';

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
    }
});

// Run tests
log('\n⚛️  Physics Invariants Test Suite', colors.cyan + colors.bold);
log('Verifying physical laws hold regardless of specific inputs\n', colors.cyan);

runInvariantsTests({ test, expect, describe });

// Summary
const successRate = testStats.total > 0
    ? ((testStats.passed / testStats.total) * 100).toFixed(1)
    : 0;

log('\n' + '═'.repeat(70), colors.blue);
log('📊 Invariants Test Results', colors.cyan + colors.bold);
log('═'.repeat(70), colors.blue);

log(`Total:   ${testStats.total}`, colors.cyan);
log(`Passed:  ${testStats.passed}`, colors.green);
log(`Failed:  ${testStats.failed}`, testStats.failed > 0 ? colors.red : colors.green);
log(`Success: ${successRate}%`, successRate === '100.0' ? colors.green : colors.yellow);

if (testStats.failed > 0) {
    log('\n❌ PHYSICS VIOLATIONS DETECTED:', colors.red + colors.bold);
    log('These failures indicate fundamental errors in the calculations.\n', colors.red);
    for (const failure of testStats.failures) {
        log(`  ${failure.group}`, colors.magenta);
        log(`    ${failure.test}`, colors.red);
        log(`    ${failure.error}`, colors.red);
    }
    process.exit(1);
} else {
    log('\n✅ All physics invariants hold!', colors.green + colors.bold);
    process.exit(0);
}
