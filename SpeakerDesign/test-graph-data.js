import * as Cookbook from './lib/cookbook/index.js';

const um18TS = {
    fs: 26.5, qts: 0.43, qes: 0.46, vas: 330,
    sd: 820, xmax: 18, pe: 1200,
    re: 6.4, bl: 23.5, mms: 165
};

console.log('=== SEALED BOX TEST ===');
const sealed = Cookbook.designSealedBox(um18TS, 'butterworth', {
    unit: 'liters',
    volume: 200,
    responsePoints: 200
});

console.log('\nSealed Box Max Power Curve:');
console.log('Freq(Hz)  Power(W)  Limiting');
console.log('----------------------------');
sealed.powerLimits.fullCurve
    .filter(p => p.frequency >= 10 && p.frequency <= 50)
    .forEach(p => {
        const freq = p.frequency.toFixed(1).padStart(6);
        const power = p.maxPower.toFixed(0).padStart(8);
        console.log(freq + '  ' + power + '  ' + p.limitingFactor);
    });

const transition = sealed.powerLimits.fullCurve.find(p => 
    p.limitingFactor === 'thermal' && 
    sealed.powerLimits.fullCurve[sealed.powerLimits.fullCurve.indexOf(p)-1]?.limitingFactor === 'excursion'
);
console.log('\nTransition point: ' + (transition ? transition.frequency.toFixed(1) + 'Hz' : 'NOT FOUND'));

console.log('\n=== PORTED BOX TEST ===');
const ported = Cookbook.designPortedBox(um18TS, {
    vb: 200,
    fb: 25
}, {
    unit: 'liters',
    portDiameter: 10,
    responsePoints: 200
});

console.log('\nPorted Box Max Power Curve:');
console.log('Freq(Hz)  Power(W)  Limiting');
console.log('----------------------------');
ported.powerLimits.fullCurve
    .filter(p => p.frequency >= 10 && p.frequency <= 50)
    .forEach(p => {
        const freq = p.frequency.toFixed(1).padStart(6);
        const power = p.maxPower.toFixed(0).padStart(8);
        console.log(freq + '  ' + power + '  ' + p.limitingFactor);
    });

const transitionPorted = ported.powerLimits.fullCurve.find(p => 
    p.limitingFactor === 'thermal' && 
    ported.powerLimits.fullCurve[ported.powerLimits.fullCurve.indexOf(p)-1]?.limitingFactor === 'excursion'
);
console.log('\nTransition point: ' + (transitionPorted ? transitionPorted.frequency.toFixed(1) + 'Hz' : 'NOT FOUND'));

// Sanity checks
console.log('\n=== SANITY CHECKS ===');
const sealed20Hz = sealed.powerLimits.fullCurve.find(p => Math.abs(p.frequency - 20) < 1);
console.log('Sealed @ 20Hz: ' + sealed20Hz.maxPower.toFixed(0) + 'W (expect ~550-600W excursion limited)');

const ported20Hz = ported.powerLimits.fullCurve.find(p => Math.abs(p.frequency - 20) < 1);
console.log('Ported @ 20Hz: ' + ported20Hz.maxPower.toFixed(0) + 'W (expect ~800-1000W due to port help)');

const portedFb = ported.powerLimits.fullCurve.find(p => Math.abs(p.frequency - 25) < 1);
console.log('Ported @ Fb(25Hz): ' + portedFb.maxPower.toFixed(0) + 'W (expect >1000W, near excursion null)');
