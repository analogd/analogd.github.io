// Quick test to verify displacement fix
import * as Cookbook from './lib/cookbook/index.js';

// Test data: UM18-22 T/S parameters
const um18TS = {
    fs: 26.5,
    qts: 0.43,
    qes: 0.46,
    qms: 4.35,
    vas: 330,
    sd: 820,
    xmax: 18,
    pe: 1200,
    re: 6.4,
    bl: 23.5,
    mms: 165  // grams
};

console.log('Testing displacement calculations with fixed code...\n');
console.log('Driver: UM18-22');
console.log('Box: 200L sealed (Butterworth alignment)\n');

// Design with cookbook
const design = Cookbook.designSealedBox(um18TS, 'butterworth', {
    unit: 'liters',
    volume: 200
});

console.log(`✓ Design created: F3 = ${design.box.f3.toFixed(1)} Hz`);
console.log(`✓ Box volume: ${design.box.volume.liters.toFixed(1)}L`);
console.log(`✓ Qtc: ${design.box.qtc.toFixed(3)}\n`);

// Check power limits at key frequencies
console.log('Max Power Limits:');
const testFreqs = [10, 20, 25, 30, 50];
design.powerLimits.fullCurve.forEach(point => {
    if (testFreqs.includes(point.frequency)) {
        console.log(`  ${point.frequency}Hz: ${Math.round(point.maxPower)}W (${point.limitingFactor} limited)`);
    }
});

console.log('\nExpected results:');
console.log('  10Hz: ~68W (excursion limited)');
console.log('  20Hz: ~555W (excursion limited)');
console.log('  25Hz: ~1000W (excursion limited)');
console.log('  30Hz+: 1200W (thermal limited)');

// Verify 20Hz looks reasonable
const at20Hz = design.powerLimits.fullCurve.find(p => p.frequency === 20);
if (at20Hz && at20Hz.maxPower > 400 && at20Hz.maxPower < 700) {
    console.log('\n✅ DISPLACEMENT FIX VERIFIED: 20Hz power is ~555W (reasonable)');
} else {
    console.log(`\n❌ PROBLEM: 20Hz power is ${at20Hz?.maxPower}W (should be ~555W)`);
}
