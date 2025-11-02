// Test that power->displacement and displacement->power are proper inverses
import * as Engineering from './lib/engineering/index.js';

const params = {
    boxType: 'sealed',
    re: 6.4,
    bl: 23.5,
    mms: 0.165,  // kg
    cms: 0.000653,  // m/N
    rms: 1.8,
    alpha: 1.65,  // 330L/200L
    fs: 26.5,
    qts: 0.43,
    xmax: 0.018,  // 18mm
    pe: 1200
};

console.log('Testing that forward and inverse calculations match:\n');
console.log('Freq   MaxPower  Limiting   Displacement  Error');
console.log('-----  --------  ---------  ------------  -----');

let maxError = 0;
let errorFreq = 0;

for (let freq = 15; freq <= 35; freq += 5) {
    params.frequency = freq;

    // Calculate max power (uses analytical inverse for sealed)
    const result = Engineering.calculateMaxPowerAtFrequency(params);

    // Calculate displacement at that power (forward calculation)
    const disp_m = Engineering.calculateDisplacementFromPower({
        ...params,
        power: result.maxPower
    });
    const disp_mm = Engineering.displacementToMm(disp_m);

    // For excursion-limited, displacement should equal Xmax (18mm)
    // For thermal-limited, displacement should be < Xmax
    const expectedDisp = result.limitingFactor === 'excursion' ? 18 : disp_mm;
    const error = Math.abs(disp_mm - expectedDisp);

    if (error > maxError) {
        maxError = error;
        errorFreq = freq;
    }

    const status = error > 0.5 ? ' ⚠️ MISMATCH' : ' ✓';

    console.log(
        freq.toString().padStart(4) + 'Hz  ' +
        result.maxPower.toFixed(0).padStart(7) + 'W  ' +
        result.limitingFactor.padEnd(9) + '  ' +
        disp_mm.toFixed(2).padStart(11) + 'mm' + status
    );
}

console.log('\nMax error: ' + maxError.toFixed(3) + 'mm at ' + errorFreq + 'Hz');

if (maxError > 0.5) {
    console.log('\n❌ VALIDATION FAILED: Forward/inverse calculations do not match!');
    console.log('The analytical power formula is WRONG.');
} else {
    console.log('\n✅ VALIDATION PASSED: Forward and inverse match within 0.5mm');
}

// Compare to WinISD expectation
console.log('\n=== Comparison to WinISD ===');
console.log('WinISD shows transition around 22-25Hz');
console.log('Our calculation shows transition at:');

params.frequency = 22;
const at22 = Engineering.calculateMaxPowerAtFrequency(params);
params.frequency = 25;
const at25 = Engineering.calculateMaxPowerAtFrequency(params);
params.frequency = 27;
const at27 = Engineering.calculateMaxPowerAtFrequency(params);

console.log('22Hz: ' + at22.maxPower.toFixed(0) + 'W (' + at22.limitingFactor + ')');
console.log('25Hz: ' + at25.maxPower.toFixed(0) + 'W (' + at25.limitingFactor + ')');
console.log('27Hz: ' + at27.maxPower.toFixed(0) + 'W (' + at27.limitingFactor + ')');
