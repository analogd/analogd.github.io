import * as Cookbook from './lib/cookbook/index.js';

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
    mms: 165
};

const design = Cookbook.designSealedBox(um18TS, 'butterworth', {
    unit: 'liters',
    volume: 200
});

console.log('Power limits curve:');
design.powerLimits.fullCurve.forEach(p => {
    console.log(`${p.frequency.toFixed(1)}Hz: ${p.maxPower.toFixed(0)}W (${p.limitingFactor})`);
});
