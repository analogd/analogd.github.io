import * as Cookbook from './lib/cookbook/index.js';

const um18TS = {
    fs: 26.5, qts: 0.43, qes: 0.46, qms: 4.35, vas: 330,
    sd: 820, xmax: 18, pe: 1200, re: 6.4, bl: 23.5, mms: 165
};

const design = Cookbook.designSealedBox(um18TS, 'butterworth', { unit: 'liters', volume: 200 });

console.log('Power curve around transition (18-32Hz):');
design.powerLimits.fullCurve
    .filter(p => p.frequency >= 18 && p.frequency <= 32)
    .forEach(p => {
        const freq = p.frequency.toFixed(1);
        const power = p.maxPower.toFixed(1);
        console.log(freq + 'Hz: ' + power + 'W (' + p.limitingFactor + ')');
    });
