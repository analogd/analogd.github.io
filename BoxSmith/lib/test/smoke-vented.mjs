/**
 * Smoke test for new VentedBox, Port, PassiveRadiator models
 */

import { Driver, VentedBox, Port, PassiveRadiator } from '../models/index.js';

console.log('=== VentedBox Smoke Test ===\n');

// Test driver (UM18-22 V2 style)
const driver = new Driver({
    fs: 22, qts: 0.53, vas: 248,
    qes: 0.56, qms: 7.7, re: 6.4,
    bl: 21.5, mms: 325, xmax: 18, sd: 1140, pe: 1200
});

console.log('Driver: UM18-22 style, Fs=' + driver.fs + 'Hz, Qts=' + driver.qts);

// === Port Tests ===
console.log('\n--- Port Model ---');
const port = new Port({ diameter: 10, flared: true });
console.log('Port: ' + port.description);
console.log('Area: ' + port.totalAreaCm2.toFixed(1) + ' cm²');
console.log('Max velocity: ' + port.maxVelocity + ' m/s');

const port2 = new Port({ diameter: 7.5, quantity: 2 });
console.log('Port2: ' + port2.description);
console.log('Total area: ' + port2.totalAreaCm2.toFixed(1) + ' cm²');

// === VentedBox with Port ===
console.log('\n--- VentedBox with Port ---');
const ventedPort = new VentedBox(driver, 140, 28, port);
console.log('Volume: ' + ventedPort.volumeLiters + 'L');
console.log('Fb: ' + ventedPort.fb + 'Hz');
console.log('F3: ' + ventedPort.f3.toFixed(1) + 'Hz');
console.log('Port length: ' + (ventedPort.portLengthCm ? ventedPort.portLengthCm.toFixed(1) : 'N/A') + 'cm');
console.log('Response @30Hz: ' + ventedPort.responseAt(30).toFixed(2) + 'dB');
console.log('isPort: ' + ventedPort.isPort);
console.log('Alignment: ' + ventedPort.alignmentName);

// === PassiveRadiator Tests ===
console.log('\n--- PassiveRadiator Model ---');
const pr = new PassiveRadiator({ mmp: 156, sd: 507, xmax: 22, qmp: 4 });
console.log('PR: ' + pr.description);
console.log('Mass: ' + pr.mmpGrams + 'g');
console.log('Area: ' + pr.sdCm2 + ' cm²');
console.log('Xmax: ' + pr.xmaxMm + 'mm');
console.log('Tuning for 140L: ' + pr.tuningFor(0.14).toFixed(1) + 'Hz');

// === VentedBox with PR ===
console.log('\n--- VentedBox with PR ---');
const ventedPR = new VentedBox(driver, 140, 28, pr);
console.log('Volume: ' + ventedPR.volumeLiters + 'L');
console.log('Fb: ' + ventedPR.fb + 'Hz');
console.log('F3: ' + ventedPR.f3.toFixed(1) + 'Hz');
console.log('Response @30Hz: ' + ventedPR.responseAt(30).toFixed(2) + 'dB');
console.log('isPassiveRadiator: ' + ventedPR.isPassiveRadiator);

// === Response Comparison ===
console.log('\n--- Response Comparison (Port vs PR) ---');
const freqs = [20, 30, 40, 50, 100];
for (const f of freqs) {
    const portResp = ventedPort.responseAt(f);
    const prResp = ventedPR.responseAt(f);
    const diff = Math.abs(portResp - prResp);
    console.log(f + 'Hz: Port=' + portResp.toFixed(2) + 'dB, PR=' + prResp.toFixed(2) + 'dB, diff=' + diff.toFixed(2) + 'dB');
}

// === Serialization ===
console.log('\n--- Serialization ---');
const obj = ventedPR.toObject();
console.log('Serialized type: ' + obj.type);
console.log('Serialized ventType: ' + obj.ventType);
const restored = VentedBox.fromObject(obj);
console.log('Restored F3: ' + restored.f3.toFixed(1) + 'Hz');
console.log('Restored isPassiveRadiator: ' + restored.isPassiveRadiator);

// === Factory Methods ===
console.log('\n--- Factory Methods ---');
const qb3 = VentedBox.qb3(driver, port);
console.log('QB3: ' + qb3.volumeLiters.toFixed(0) + 'L @ ' + qb3.fb.toFixed(1) + 'Hz, F3=' + qb3.f3.toFixed(1) + 'Hz');

console.log('\n✅ All smoke tests passed!');
