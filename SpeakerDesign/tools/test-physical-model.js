import * as PhysicalModel from '../lib/foundation/vented-physical-model.js';

// UMII18-22 in 600L @ 25Hz
const driver = {
    fs: 22,
    qms: 2.53,
    qts: 0.53,
    vas: 0.2482,  // m³ (248.2L)
    re: 4.2,
    sd: 0.1184    // m² (1184 cm²) - FIXED: was 0.001184!
};

// Port for 600L tuned to 25Hz
// From WinISD screenshot: 10.20cm diameter, 7.73cm length
const vb = 0.600;  // m³
const fb = 25;     // Hz

const portDiameter = 0.1020;  // 10.20cm from WinISD
const portLength = 0.0773;    // 7.73cm from WinISD
const portArea = Math.PI * (portDiameter/2) ** 2;

console.log(`Port dimensions from WinISD:`);
console.log(`  Diameter: ${(portDiameter*100).toFixed(2)}cm`);
console.log(`  Length: ${(portLength*100).toFixed(2)}cm`);
console.log(`  Area: ${(portArea*10000).toFixed(1)}cm²`);
console.log(`  Target fb: ${fb}Hz\n`);

// Test frequencies
const testFreqs = [10, 15, 20, 25, 30, 50, 100];

console.log('Physical Model Results:');
console.log('Freq    dB');
console.log('─────────────');

for (const f of testFreqs) {
    const db = PhysicalModel.calculateVentedResponseDb(f, driver, vb, portArea, portLength);
    console.log(`${f.toString().padStart(3)}Hz  ${db.toFixed(2).padStart(7)}`);
}

console.log('\nWinISD Reference:');
console.log(' 10Hz   -18 dB');
console.log(' 15Hz   -10 dB');
console.log(' 20Hz    -3 dB');
console.log(' 25Hz     0 dB');
console.log(' 30Hz    -1 dB');
console.log(' 50Hz     0 dB');
console.log('100Hz     0 dB');
