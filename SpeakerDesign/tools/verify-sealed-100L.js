/**
 * Verify Sealed Box - UMII18-22 in 100L
 * Fresh WinISD reference: Qtc=0.961, Fsc=42.45Hz
 */

import * as Small1972 from '../lib/foundation/small-1972.js';

const driver = {
    fs: 22,        // Hz
    qts: 0.53,     // dimensionless
    vas: 0.2482,   // m³ (248.2L)
};

const vb = 0.100;  // m³ (100L)

// Calculate system parameters
const alpha = driver.vas / vb;
const fc = driver.fs * Math.sqrt(1 + alpha);
const qtc = driver.qts * Math.sqrt(1 + alpha);

console.log('System Parameters:');
console.log(`α = Vas/Vb = ${driver.vas}/${vb} = ${alpha.toFixed(3)}`);
console.log(`Fsc = Fs × √(1+α) = ${driver.fs} × √(1+${alpha.toFixed(3)}) = ${fc.toFixed(2)} Hz`);
console.log(`Qtc = Qts × √(1+α) = ${driver.qts} × √(1+${alpha.toFixed(3)}) = ${qtc.toFixed(3)}`);
console.log();

console.log('WinISD Reference:');
console.log(`Fsc = 42.45 Hz`);
console.log(`Qtc = 0.961`);
console.log();

console.log('Frequency Response:');
console.log('Freq(Hz)  |H(f)|    dB');
console.log('──────────────────────');

const testFreqs = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 200, 500];

for (const f of testFreqs) {
    const mag = Small1972.calculateResponseMagnitude(f, driver.fs, driver.qts, vb, driver.vas);
    const db = Small1972.calculateResponseDb(f, driver.fs, driver.qts, vb, driver.vas);
    console.log(`${f.toString().padStart(3)}      ${mag.toFixed(4)}  ${db.toFixed(2).padStart(7)}`);
}
