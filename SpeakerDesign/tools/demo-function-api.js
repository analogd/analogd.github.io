/**
 * Demo: Function-First API
 *
 * Shows how the new v2 API works - functions not arrays.
 */

import * as PowerLimitsV2 from '../lib/engineering/power-limits-v2.js';

// UMII18-22 in sealed 200L (from WinISD reference)
const params = {
    boxType: 'sealed',
    fs: 22,
    qts: 0.53,
    qms: 2.53,
    alpha: 248.2 / 200,  // Vas / Vb
    re: 4.2,
    bl: 19.2,
    mms: 0.420,  // kg
    cms: 0.000124,  // m/N
    rms: (2 * Math.PI * 22 * 0.420) / 2.53,  // Calculate from Qms
    xmax: 0.028,  // m
    pe: 1200
};

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  FUNCTION-FIRST API DEMO                                  ║');
console.log('║  Sealed 200L with UMII18-22                               ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// === 1. CREATE THE FUNCTION ===
console.log('1. Create max power function:');
console.log('   const maxPowerFn = PowerLimitsV2.createMaxPowerFunction(params);');
const maxPowerFn = PowerLimitsV2.createMaxPowerFunction(params);
console.log('   ✓ Function created\n');

// === 2. EVALUATE AT SPECIFIC FREQUENCIES ===
console.log('2. Evaluate at specific frequencies:');
console.log('   maxPowerFn(10)  // Exact evaluation, no interpolation');
console.log('');
console.log('   Freq    Power    Limiting     Displacement');
console.log('   ────────────────────────────────────────────');

[10, 20, 30, 40, 50].forEach(f => {
    const result = maxPowerFn(f);
    console.log(
        `   ${f.toString().padStart(2)}Hz    ` +
        `${Math.round(result.power).toString().padStart(4)}W    ` +
        `${result.limiting.padEnd(10)}   ` +
        `${(result.displacement * 1000).toFixed(1)}mm`
    );
});

// === 3. COMPARE WITH WINISD ===
console.log('\n3. Compare with WinISD (at THEIR frequencies):');
const winisdData = {
    10: 400,
    15: 420,
    20: 450,
    25: 550,
    30: 700,
    35: 900,
    40: 1100,
    45: 1200,
    50: 1200
};

const comparison = PowerLimitsV2.compareWithWinISD(
    maxPowerFn,
    Object.keys(winisdData).map(Number),
    winisdData
);

console.log('');
console.log('   Freq    Ours    WinISD   Error    Status');
console.log('   ────────────────────────────────────────────────');

comparison.forEach(c => {
    const status = c.withinTolerance ? '✓' : '✗';
    console.log(
        `   ${c.frequency.toString().padStart(2)}Hz    ` +
        `${Math.round(c.ours).toString().padStart(4)}W   ` +
        `${c.winisd.toString().padStart(4)}W    ` +
        `${c.errorPct > 0 ? '+' : ''}${c.errorPct.toFixed(0).padStart(3)}%    ` +
        `${status}`
    );
});

// === 4. SAMPLE FOR UI ===
console.log('\n4. Sample for UI plotting (log-spaced):');
console.log('   const curve = PowerLimitsV2.sampleFunction(');
console.log('       maxPowerFn,');
console.log('       PowerLimitsV2.logspace(10, 500, 50)  // WinISD range');
console.log('   );');

const curve = PowerLimitsV2.sampleFunction(
    maxPowerFn,
    PowerLimitsV2.logspace(10, 500, 10)  // Just 10 for demo
);

console.log(`   ✓ Generated ${curve.length} points for plotting`);
console.log(`   ✓ First point: ${curve[0].frequency.toFixed(1)}Hz → ${Math.round(curve[0].power)}W`);
console.log(`   ✓ Last point: ${curve[curve.length-1].frequency.toFixed(1)}Hz → ${Math.round(curve[curve.length-1].power)}W\n`);

// === 5. KEY BENEFITS ===
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  KEY BENEFITS                                             ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');
console.log('✓ Tests validate exact formulas (maxPowerFn(20) === 450)');
console.log('✓ UI samples at chosen resolution (zoom, pan, redraw)');
console.log('✓ WinISD comparison uses THEIR frequencies (no interpolation)');
console.log('✓ Single source of truth across tests/UI/verification');
console.log('✓ Functions reflect mathematical truth (Small 1972/1973)');
console.log('');
console.log('Run: node tools/demo-function-api.js');
console.log('');
