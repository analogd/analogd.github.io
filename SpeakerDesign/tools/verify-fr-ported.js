/**
 * Frequency Response Verification - Ported Box
 *
 * Build from foundation library upward to calculate FR.
 * Compare against WinISD reference data.
 */

import * as Small1973 from '../lib/foundation/small-1973.js';
import * as Small1973Normalized from '../lib/foundation/small-1973-normalized.js';

// UMII18-22 Thiele-Small Parameters
const driver = {
    fs: 22,        // Hz
    qts: 0.53,     // dimensionless
    qes: 0.67,     // dimensionless
    vas: 0.2482,   // m³ (248.2L)
    sd: 0.1184,  // m² (1184 cm²)
};

// Ported box configuration
const vb = 0.600;  // m³ (600L)
const fb = 25;     // Hz (tuning frequency)

// ============================================================================
// FOUNDATION LAYER - Pure Small 1973 Equations
// ============================================================================

console.log('═══════════════════════════════════════════════════════════');
console.log('Foundation Layer - Small 1973 Calculations');
console.log('═══════════════════════════════════════════════════════════\n');

// Step 1: Calculate compliance ratio α = Vas / Vb
const alpha = driver.vas / vb;
console.log(`α = Vas / Vb = ${driver.vas.toFixed(4)} / ${vb.toFixed(3)} = ${alpha.toFixed(3)}`);

// Step 2: Calculate h (tuning ratio) = fb / fs
const h = fb / driver.fs;
console.log(`h = fb / fs = ${fb} / ${driver.fs} = ${h.toFixed(3)}`);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('Transfer Function Evaluation');
console.log('═══════════════════════════════════════════════════════════\n');

// Evaluate transfer function at key frequencies
const testFrequencies = [10, 15, 20, 25, 30, 35, 40, 50, 60, 80, 100];

console.log('Freq(Hz)  OLD |H(f)|  OLD dB   NEW |H(f)|  NEW dB');
console.log('───────────────────────────────────────────────────');

for (const f of testFrequencies) {
    const magOld = Small1973.calculatePortedResponseMagnitude(f, driver.fs, fb, alpha, driver.qts);
    const dbOld = Small1973.calculatePortedResponseDb(f, driver.fs, fb, alpha, driver.qts);
    const magNew = Small1973Normalized.calculatePortedResponseMagnitudeNormalized(f, driver.fs, fb, alpha, driver.qts);
    const dbNew = Small1973Normalized.calculatePortedResponseDbNormalized(f, driver.fs, fb, alpha, driver.qts);
    console.log(`${f.toString().padStart(3)}      ${magOld.toFixed(4)}  ${dbOld.toFixed(2).padStart(7)}   ${magNew.toFixed(4)}  ${dbNew.toFixed(2).padStart(7)}`);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('Function-First API');
console.log('═══════════════════════════════════════════════════════════\n');

// Create a function that returns magnitude at any frequency
function createFrequencyResponseFunction(fs, qts, vas, vb, fb) {
    const alpha = vas / vb;
    const h = fb / fs;

    return {
        // Return a function: f → |H(f)|
        magnitude: (frequency) => Small1973.calculatePortedResponseMagnitude(frequency, fs, fb, alpha, qts),
        // Return a function: f → dB
        db: (frequency) => Small1973.calculatePortedResponseDb(frequency, fs, fb, alpha, qts),
        // System parameters
        alpha,
        h,
        fb
    };
}

const frFunction = createFrequencyResponseFunction(driver.fs, driver.qts, driver.vas, vb, fb);

console.log('Created FR function with parameters:');
console.log(`  fb = ${frFunction.fb.toFixed(2)} Hz`);
console.log(`  α = ${frFunction.alpha.toFixed(3)}`);
console.log(`  h = ${frFunction.h.toFixed(3)}`);

console.log('\nEvaluating function at specific frequencies:');
console.log(`  |H(20Hz)| = ${frFunction.magnitude(20).toFixed(4)} = ${frFunction.db(20).toFixed(2)} dB`);
console.log(`  |H(fb)| = ${frFunction.magnitude(frFunction.fb).toFixed(4)} = ${frFunction.db(frFunction.fb).toFixed(2)} dB`);
console.log(`  |H(100Hz)| = ${frFunction.magnitude(100).toFixed(4)} = ${frFunction.db(100).toFixed(2)} dB`);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('WinISD Comparison');
console.log('═══════════════════════════════════════════════════════════\n');

// Values read from WinISD screenshot (green line, ported 600L @ 25Hz)
// Fresh reference from 2025-11-03 with tuning freq = 25Hz
const winisdValues = [
    { freq: 10, db: -28 },
    { freq: 15, db: -16 },
    { freq: 20, db: -6 },
    { freq: 25, db: 6 },   // Peak at tuning frequency
    { freq: 30, db: 4 },
    { freq: 40, db: 2 },
    { freq: 50, db: 0 }
];

console.log('Freq   NEW dB   WinISD dB   Diff');
console.log('─────────────────────────────────');

for (const { freq, db: winisdDb } of winisdValues) {
    const ourDb = Small1973Normalized.calculatePortedResponseDbNormalized(freq, driver.fs, fb, alpha, driver.qts);
    const diff = ourDb - winisdDb;
    const match = Math.abs(diff) < 1.0 ? '✓' : '✗';
    console.log(`${freq.toString().padStart(3)}Hz  ${ourDb.toFixed(2).padStart(7)}  ${winisdDb.toFixed(2).padStart(10)}   ${diff.toFixed(2).padStart(5)} ${match}`);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('Next Steps');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('1. Verify ported FR matches WinISD');
console.log('2. Check if UI uses foundation layer (not direct calculations)');
console.log('3. Audit all layer boundaries to ensure proper abstraction');
