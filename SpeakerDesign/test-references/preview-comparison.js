/**
 * Preview Sealed vs Ported Comparison
 *
 * Generates predicted curves for both configurations before WinISD validation.
 * Helps visualize what we expect to see.
 */

import * as Cookbook from '../lib/cookbook/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load driver from reference
const driverData = JSON.parse(
    readFileSync(join(__dirname, 'winisd/um18-22-sealed-200L/driver-params.json'), 'utf8')
);
const driver = driverData.thiele_small;

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  SEALED vs PORTED COMPARISON PREVIEW                    ║');
console.log('║  Predictions from our code (before WinISD validation)   ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log('Driver: Dayton Audio UMII18-22');
console.log(`  Fs: ${driver.fs} Hz, Qts: ${driver.qts}, Vas: ${driver.vas} L`);
console.log(`  Xmax: ${driver.xmax} mm, Pe: ${driver.pe} W\n`);

// Design sealed 200L
console.log('═══════════════════════════════════════════════════════════');
console.log('SEALED 200L (Custom Qtc ≈ 0.79)');
console.log('═══════════════════════════════════════════════════════════\n');

const sealed = Cookbook.designSealedBox(driver, 'custom', {
    unit: 'liters',
    vasUnit: 'liters',
    volume: 200,
    responseRange: [10, 100],
    responsePoints: 200
});

console.log('System Parameters:');
console.log(`  Volume: ${sealed.box.volume.liters.toFixed(1)} L`);
console.log(`  Qtc: ${sealed.box.qtc}`);
console.log(`  Fc: ${sealed.box.fc} Hz`);
console.log(`  F3: ${sealed.box.f3} Hz`);
console.log();

console.log('Power Limits:');
const sealedPower = [10, 15, 20, 25, 30, 35, 40, 45, 50];
console.log('Freq (Hz)  Power (W)  Limiting     Displacement (mm)');
console.log('─────────────────────────────────────────────────────────');

for (const freq of sealedPower) {
    const point = sealed.powerLimits.fullCurve.find(p => Math.abs(p.frequency - freq) < 0.5);
    if (point) {
        const disp = point.displacementAtLimit ? point.displacementAtLimit * 1000 : 0;
        console.log(
            `${freq.toString().padStart(3)}        ` +
            `${Math.round(point.maxPower).toString().padStart(4)}       ` +
            `${point.limitingFactor.padEnd(12)} ` +
            `${disp.toFixed(1)}`
        );
    }
}

// Thermal transition
const sealedTransition = sealed.powerLimits.fullCurve.find(p => p.limitingFactor === 'thermal');
console.log(`\nThermal Transition: ${sealedTransition ? sealedTransition.frequency.toFixed(1) : 'N/A'} Hz`);

// Design ported 600L @ 25Hz
console.log('\n═══════════════════════════════════════════════════════════');
console.log('PORTED 600L @ 25Hz (3x larger, tuned to 25Hz)');
console.log('═══════════════════════════════════════════════════════════\n');

const ported = Cookbook.designPortedBox(driver, {
    vb: 600,
    fb: 25
}, {
    unit: 'liters',
    vasUnit: 'liters',
    portDiameter: 10,
    responseRange: [10, 100],
    responsePoints: 200
});

console.log('System Parameters:');
console.log(`  Volume: ${ported.box.volume.liters.toFixed(1)} L`);
console.log(`  Tuning: ${ported.box.fb} Hz`);
console.log(`  F3: ${ported.box.f3} Hz`);
console.log(`  Port: ${ported.port.diameter.cm.toFixed(1)} cm × ${ported.port.length.cm.toFixed(1)} cm`);
console.log();

console.log('Power Limits:');
console.log('Freq (Hz)  Power (W)  Limiting     Displacement (mm)');
console.log('─────────────────────────────────────────────────────────');

const portedPower = [10, 15, 20, 25, 30, 35, 40, 45, 50];
for (const freq of portedPower) {
    const point = ported.powerLimits.fullCurve.find(p => Math.abs(p.frequency - freq) < 0.5);
    if (point) {
        const disp = point.displacementAtLimit ? point.displacementAtLimit * 1000 : 0;
        console.log(
            `${freq.toString().padStart(3)}        ` +
            `${Math.round(point.maxPower).toString().padStart(4)}       ` +
            `${point.limitingFactor.padEnd(12)} ` +
            `${disp.toFixed(1)}`
        );
    }
}

const portedTransition = ported.powerLimits.fullCurve.find(p => p.limitingFactor === 'thermal');
console.log(`\nThermal Transition: ${portedTransition ? portedTransition.frequency.toFixed(1) : 'N/A'} Hz`);

// Comparison
console.log('\n═══════════════════════════════════════════════════════════');
console.log('DIRECT COMPARISON');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('                Sealed 200L    Ported 600L    Advantage');
console.log('─────────────────────────────────────────────────────────────');

function compare(freq) {
    const s = sealed.powerLimits.fullCurve.find(p => Math.abs(p.frequency - freq) < 0.5);
    const p = ported.powerLimits.fullCurve.find(p => Math.abs(p.frequency - freq) < 0.5);

    if (s && p) {
        const ratio = p.maxPower / s.maxPower;
        const advantage = ratio > 1.1 ? 'Ported' : ratio < 0.9 ? 'Sealed' : 'Similar';
        console.log(
            `Power @ ${freq}Hz:     ` +
            `${Math.round(s.maxPower).toString().padStart(4)}W         ` +
            `${Math.round(p.maxPower).toString().padStart(4)}W      ` +
            `${advantage} (${ratio.toFixed(2)}x)`
        );
    }
}

compare(10);
compare(15);
compare(20);
compare(25);
compare(30);
compare(40);
compare(50);

console.log();
console.log(`F3:                 ${sealed.box.f3.toFixed(1)}Hz         ${ported.box.f3.toFixed(1)}Hz      Ported (-${(sealed.box.f3 - ported.box.f3).toFixed(1)}Hz)`);
console.log(`Thermal Transition: ${sealedTransition ? sealedTransition.frequency.toFixed(1) : 'N/A'}Hz         ${portedTransition ? portedTransition.frequency.toFixed(1) : 'N/A'}Hz      Ported (earlier)`);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('CRITICAL VALIDATION POINTS');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('✓ Check #1: Excursion null at Fb (25Hz)');
const portedAt25 = ported.powerLimits.fullCurve.find(p => Math.abs(p.frequency - 25) < 0.5);
const sealedAt25 = sealed.powerLimits.fullCurve.find(p => Math.abs(p.frequency - 25) < 0.5);
if (portedAt25 && sealedAt25) {
    const dispRatio = (portedAt25.displacementAtLimit || 0) / (sealedAt25.displacementAtLimit || 0);
    console.log(`  Ported displacement at 25Hz: ${((portedAt25.displacementAtLimit || 0) * 1000).toFixed(1)}mm`);
    console.log(`  Sealed displacement at 25Hz: ${((sealedAt25.displacementAtLimit || 0) * 1000).toFixed(1)}mm`);
    console.log(`  Ratio: ${dispRatio.toFixed(2)}x (should be < 0.5 for good null)`);
}

console.log('\n✓ Check #2: Ported handles more power 15-30Hz');
console.log('  (See comparison table above)');

console.log('\n✓ Check #3: Earlier thermal transition for ported');
if (sealedTransition && portedTransition) {
    console.log(`  Sealed: ${sealedTransition.frequency.toFixed(1)}Hz`);
    console.log(`  Ported: ${portedTransition.frequency.toFixed(1)}Hz`);
    console.log(`  Difference: ${(sealedTransition.frequency - portedTransition.frequency).toFixed(1)}Hz`);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('NEXT STEPS');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('1. Run WinISD simulations for both configurations');
console.log('2. Extract power/displacement values from graphs');
console.log('3. Fill expected-values.json files');
console.log('4. Run: node test-references/reference-validation.test.js');
console.log('5. Compare predictions above with actual WinISD output\n');
