/**
 * Reference Validation Test Suite
 *
 * Validates our calculations against WinISD reference data.
 * These are CANARY TESTS - if these fail, the displacement/power calculations are broken.
 *
 * DO NOT "fix" these tests by loosening tolerances.
 * If tests fail, FIX THE UNDERLYING CALCULATIONS.
 */

import * as Cookbook from '../lib/cookbook/index.js';
import * as Engineering from '../lib/engineering/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load reference data
function loadReference(testCase) {
    const basePath = join(__dirname, 'winisd', testCase);
    const driver = JSON.parse(readFileSync(join(basePath, 'driver-params.json'), 'utf8'));
    const expected = JSON.parse(readFileSync(join(basePath, 'expected-values.json'), 'utf8'));
    return { driver: driver.thiele_small, expected, testCase };
}

// Assertion helpers
function assertWithinTolerance(actual, expected, tolerance, label) {
    const diff = Math.abs(actual - expected);
    const pass = diff <= tolerance;
    const status = pass ? '✓' : '✗';

    console.log(`  ${status} ${label}: ${actual.toFixed(2)} (expected ${expected} ±${tolerance})`);

    if (!pass) {
        throw new Error(`${label} FAILED: ${actual.toFixed(2)} vs ${expected} ±${tolerance} (diff: ${diff.toFixed(2)})`);
    }
}

function assertMonotonic(values, label) {
    for (let i = 1; i < values.length; i++) {
        if (values[i] < values[i-1]) {
            console.log(`  ✗ ${label}: NOT monotonic at index ${i} (${values[i-1]} → ${values[i]})`);
            throw new Error(`${label} is not monotonically increasing`);
        }
    }
    console.log(`  ✓ ${label}: Monotonically increasing`);
}

// Test sealed box
function testSealed() {
    console.log('\n═══════════════════════════════════════════════');
    console.log('TEST: UM18-22 Sealed 200L');
    console.log('═══════════════════════════════════════════════\n');

    const { driver, expected } = loadReference('um18-22-sealed-200L');

    // Design with cookbook - use fixed volume to match WinISD
    const design = Cookbook.designSealedBox(driver, 'custom', {
        unit: 'liters',
        volume: expected.configuration.volume,
        responsePoints: 200
    });

    // Test 1: System parameters
    console.log('1. System Parameters:');
    if (expected.systemParameters.qtc.value !== 'TBD') {
        assertWithinTolerance(
            design.box.qtc,
            expected.systemParameters.qtc.value,
            expected.systemParameters.qtc.tolerance,
            'Qtc'
        );
    } else {
        console.log(`  ⏭ Qtc: ${design.box.qtc.toFixed(3)} (reference TBD)`);
    }

    if (expected.systemParameters.f3.value !== 'TBD') {
        assertWithinTolerance(
            design.box.f3,
            expected.systemParameters.f3.value,
            expected.systemParameters.f3.tolerance,
            'F3'
        );
    } else {
        console.log(`  ⏭ F3: ${design.box.f3.toFixed(1)}Hz (reference TBD)`);
    }

    // Test 2: Max Power at key frequencies
    console.log('\n2. Max Power Handling:');
    const powerTests = expected.maxPower.dataPoints;
    let transitionFound = false;
    let transitionFreq = 0;

    for (const [freqStr, expectation] of Object.entries(powerTests)) {
        const freq = parseInt(freqStr);
        const actual = design.powerLimits.fullCurve.find(p => Math.abs(p.frequency - freq) < 1);

        if (!actual) {
            console.log(`  ⚠ No data point near ${freq}Hz`);
            continue;
        }

        // Check power value
        assertWithinTolerance(
            actual.maxPower,
            expectation.power,
            expectation.tolerance,
            `Power at ${freq}Hz`
        );

        // Check limiting factor
        const limitMatch = actual.limitingFactor === expectation.limiting;
        const limitStatus = limitMatch ? '✓' : '✗';
        console.log(`  ${limitStatus}   Limiting: ${actual.limitingFactor} (expected ${expectation.limiting})`);

        if (!limitMatch && expectation.limiting !== 'excursion or thermal') {
            throw new Error(`Limiting factor mismatch at ${freq}Hz`);
        }

        // Track transition
        if (!transitionFound && actual.limitingFactor === 'thermal') {
            transitionFound = true;
            transitionFreq = actual.frequency;
        }
    }

    // Test 3: Thermal transition frequency
    console.log('\n3. Thermal Transition:');
    assertWithinTolerance(
        transitionFreq,
        expected.maxPower.thermalTransition.frequency,
        expected.maxPower.thermalTransition.tolerance,
        'Transition frequency'
    );

    // Test 4: Physics constraints
    console.log('\n4. Physics Constraints:');

    // Monotonicity
    const powerValues = design.powerLimits.fullCurve
        .filter(p => p.frequency <= 100)
        .map(p => p.maxPower);
    assertMonotonic(powerValues, 'Max Power vs Frequency');

    // Excursion at limit should be near Xmax
    const excursionLimitedPoint = design.powerLimits.fullCurve.find(p =>
        p.limitingFactor === 'excursion' && p.frequency >= 20
    );
    if (excursionLimitedPoint) {
        const disp_m = Engineering.calculateDisplacementFromPower({
            ...design.driverTS || driver,
            boxType: 'sealed',
            alpha: design.box.alpha,
            frequency: excursionLimitedPoint.frequency,
            power: excursionLimitedPoint.maxPower,
            mms: (driver.mms || 165) / 1000,
            cms: driver.cms || 0.000653,
            rms: driver.rms || 1.8
        });
        const disp_mm = Engineering.displacementToMm(disp_m);

        assertWithinTolerance(
            disp_mm,
            driver.xmax,
            2,
            `Displacement at excursion limit (${excursionLimitedPoint.frequency.toFixed(0)}Hz)`
        );
    }

    console.log('\n✅ SEALED BOX TEST PASSED\n');
}

// Test ported box (when data available)
function testPorted() {
    console.log('\n═══════════════════════════════════════════════');
    console.log('TEST: UM18-22 Ported 500L @ 25Hz');
    console.log('═══════════════════════════════════════════════\n');

    const { driver, expected } = loadReference('um18-22-ported-500L-25Hz');

    // Check if reference data is complete
    if (expected.maxPower.dataPoints['20Hz'].power === 'TBD') {
        console.log('⏭  SKIPPED: Reference data not yet collected from WinISD');
        console.log('   Run WinISD simulation and fill in expected-values.json\n');
        return;
    }

    // Design with cookbook
    const design = Cookbook.designPortedBox(driver, {
        vb: expected.configuration.volume,
        fb: expected.configuration.tuning
    }, {
        unit: 'liters',
        portDiameter: expected.configuration.portDiameter,
        responsePoints: 200
    });

    // Similar tests as sealed...
    console.log('TODO: Implement ported validation tests\n');
}

// Run all tests
console.log('\n╔═══════════════════════════════════════════════╗');
console.log('║   REFERENCE VALIDATION TEST SUITE            ║');
console.log('║   Canary tests against WinISD                ║');
console.log('╚═══════════════════════════════════════════════╝');

try {
    testSealed();
    testPorted();

    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║   ✅ ALL TESTS PASSED                         ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

} catch (error) {
    console.error('\n╔═══════════════════════════════════════════════╗');
    console.error('║   ❌ TEST FAILED                              ║');
    console.error('╚═══════════════════════════════════════════════╝');
    console.error('\n' + error.message + '\n');
    console.error('Stack:', error.stack);
    process.exit(1);
}
