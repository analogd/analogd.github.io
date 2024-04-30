# BoxSmith Library

Platform-independent loudspeaker enclosure design library built from Thiele-Small theory.

**Zero dependencies. Works anywhere JavaScript runs.**

## Structure

```
lib/
├── foundation/          Paper-based implementations
│   ├── small-1972.js    Sealed box theory
│   ├── small-1973.js    Ported box theory
│   ├── thiele-1971.js   Alignments
│   └── klippel/         Nonlinear modeling
│
├── models/              Validated domain objects
│   ├── Driver.js        T/S parameter validation
│   ├── SealedBox.js     2nd-order sealed enclosure
│   ├── VentedBox.js     4th-order vented (port or PR)
│   ├── vents/           Port and PassiveRadiator
│   └── Comparison.js    Alignment comparisons
│
├── engineering/         Power & displacement limits
│   ├── displacement.js
│   └── power-limits.js
│
├── future/              Not yet implemented
│   └── README.md        Gaps and planned extensions
│
└── test/                720 tests
    ├── Foundation.test.js
    ├── Invariants.test.js
    ├── Models.test.js
    ├── Engineering.test.js
    ├── Filters.test.js
    ├── Klippel.test.js
    ├── Tools.test.js
    ├── Isobaric.test.js
    ├── ExternalAPI.test.js
    └── run-all-tests.mjs
```

## Usage

### Models (Recommended API)

```javascript
import { Driver, SealedBox, VentedBox, Port } from './lib/models/index.js';

// Create validated driver
const driver = new Driver({
    fs: 22, qts: 0.53, vas: 248,
    qes: 0.56, qms: 7.7, re: 6.4,
    xmax: 18, sd: 1140, pe: 1200
});

// Design sealed box (factory methods)
const sealed = SealedBox.butterworth(driver);
console.log(sealed.f3);           // -3dB point
console.log(sealed.volumeLiters); // Box volume

// Design vented box
const port = new Port({ diameter: 10, flared: true });
const vented = VentedBox.qb3(driver, port);
console.log(vented.fb);           // Tuning frequency
console.log(vented.portLengthCm); // Required port length

// Get response curves
const response = sealed.responseCurve(10, 200, 50);
const maxSpl = sealed.maxSplCurve(10, 200, 50);
```

### Foundation (Paper-Pure)

```javascript
import * as Small1972 from './lib/foundation/small-1972.js';
import * as Small1973 from './lib/foundation/small-1973.js';

// Sealed box calculations
const alpha = Small1972.calculateAlpha(vas, vb);
const fc = Small1972.calculateFc(fs, alpha);
const qtc = Small1972.calculateQtc(qts, alpha);
const f3 = Small1972.calculateF3(fc, qtc);
const response = Small1972.calculateResponseDb(freq, fc, qtc);

// Ported box calculations
const design = Small1973.designPortedBox(driver, 'QB3');
const portLength = Small1973.calculatePortLength(vb, fb, portArea, portDiam);
```

### Engineering (Power Limits)

```javascript
import * as Engineering from './lib/engineering/index.js';

const maxPower = Engineering.calculateMaxPowerAtFrequency(params);
// { maxPower: 500, limitingFactor: 'excursion' }

const curve = Engineering.generateMaxPowerCurve(params, frequencies);
// Shows where excursion vs thermal limits apply
```

## References

- **Small 1972**: "Direct-Radiator Loudspeaker System Analysis" - Sealed box theory
- **Small 1973**: "Vented-Box Loudspeaker Systems" Parts I-IV - Ported box theory
- **Thiele 1971**: "Loudspeakers in Vented Boxes" - Alignment tables
- **Klippel 2006**: "Loudspeaker Nonlinearities" - Large signal modeling

## Tests

```bash
node lib/test/run-all-tests.mjs
```

720 tests covering foundation functions, physics invariants, models, engineering, filters, Klippel nonlinear modeling, tools, isobaric transforms, and external API contracts.
