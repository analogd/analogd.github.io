## Cookbook Layer - High-Level Design Workflows

### Philosophy

The cookbook layer provides **one-line design workflows** that handle:
- User-friendly units (liters, cm, dB)
- Complete design calculations
- Multiple output formats
- Sensible defaults

It orchestrates calls to:
- **Foundation layer** (paper-true equations)
- **Engineering layer** (paper-close approximations)
- Returns comprehensive, ready-to-use results

### Quick Start

```javascript
import * as Cookbook from './lib/cookbook/index.js';

const driver = {
    fs: 22,      // Hz
    qts: 0.53,
    vas: 248,    // liters
    qes: 0.56,
    xmax: 18,    // mm
    sd: 1140,    // cm²
    pe: 1200     // watts
};

// One-line design
const design = Cookbook.designSealedBox(driver, 'butterworth');

console.log(`F3: ${design.box.f3}Hz`);
console.log(`Volume: ${design.box.volume.liters}L`);
console.log(`Sensitivity: ${design.efficiency.spl0}dB`);
```

### API Reference

#### Sealed Box Design

**`designSealedBox(driver, alignment, options)`**

Design complete sealed box system.

**Parameters:**
- `driver` - Driver T/S parameters
- `alignment` - 'butterworth', 'bessel', 'chebyshev', or numeric Qtc
- `options` - Configuration object

**Returns:** Complete design with:
- `box` - Volume, Fc, Qtc, F3
- `response` - Frequency response curve
- `efficiency` - Reference efficiency and SPL
- `powerLimits` - Thermal and excursion limits
- `citations` - Source papers

**Example:**
```javascript
const design = Cookbook.designSealedBox(driver, 'butterworth', {
    unit: 'liters',
    responseRange: [10, 200],
    responsePoints: 100
});

// Access results
design.box.volume.liters  // Box volume in liters
design.box.f3             // -3dB frequency
design.response.frequencies  // Frequency array
design.response.magnitudesDb // Response in dB
design.powerLimits.excursionLimited.at20Hz  // Max power at 20Hz
```

#### Ported Box Design

**`designPortedBox(driver, alignment, options)`**

Design complete ported box system with port dimensions.

**Parameters:**
- `driver` - Driver T/S parameters
- `alignment` - 'QB3', 'B4', 'C4', or {vb, fb} object
- `options` - Configuration object

**Returns:** Complete design with:
- `box` - Volume, F3, losses (QL)
- `port` - Diameter, length, velocity, status
- `tuning` - Fb, Fb/Fs ratio
- `response` - Frequency response with losses
- `powerLimits` - Includes excursion null near Fb

**Example:**
```javascript
const design = Cookbook.designPortedBox(driver, 'QB3', {
    portDiameter: 10,      // cm
    portDiameterUnit: 'cm',
    ql: 7.0                // Enclosure loss Q
});

// Port dimensions
design.port.diameter.cm  // 10 cm
design.port.length.cm    // Calculated length
design.port.velocity.value  // m/s at Xmax
design.port.velocity.status // 'good', 'moderate', 'high', 'critical'

// Power at tuning (excursion null)
design.powerLimits.excursionLimited.atFb  // Much higher than off-tuning
```

#### Comparison Workflows

**`compareSealedVsPorted(driver, options)`**

Compare sealed Butterworth vs ported QB3.

**Returns:**
```javascript
{
    sealed: { /* sealed design */ },
    ported: { /* ported design */ },
    recommendation: 'sealed' | 'ported' | 'both',
    reasoning: ['Low Qts favors ported', ...],
    summary: {
        sealedF3, portedF3,
        f3Improvement,
        volumeRatio
    }
}
```

**`compareAllAlignments(driver, options)`**

Returns array of all viable designs (sealed + ported) sorted by F3.

**`sensitivityAnalysis(driver, parameter, range, options)`**

Vary parameter and see effect on design.

**Example:**
```javascript
// How does ±10% Qts affect design?
const results = Cookbook.sensitivityAnalysis(driver, 'qts', [-10, 10, 2]);

results.forEach(r => {
    console.log(`Qts ${r.value.toFixed(3)}: F3 = ${r.design.box.f3}Hz`);
});
```

### Alignment Guide

#### Sealed Alignments

| Alignment | Qtc | Characteristics |
|-----------|-----|-----------------|
| Butterworth | 0.707 | Maximally flat frequency response |
| Bessel | 0.577 | Maximally flat transient response |
| Chebyshev | 1.0 | 0.5dB ripple, extended bass |

**Recommendation:**
- Most users: **Butterworth** (good balance)
- Critical listening: **Bessel** (best transients)
- Maximum extension: **Chebyshev** (accepts ripple)

#### Ported Alignments

| Alignment | Characteristics | Qts Range |
|-----------|-----------------|-----------|
| QB3 | Quasi-Butterworth 3rd-order, Fb=Fs | 0.3-0.5 |
| B4 | Butterworth 4th-order, extended bass | 0.25-0.4 |
| C4 | Chebyshev 4th-order, maximum extension | 0.25-0.4 |

**Recommendation:**
- Most users: **QB3** (simple, predictable)
- Maximum extension: **B4** or **C4** (larger box)

**Qts Guidelines:**
- Qts < 0.3: Too low for ported
- Qts 0.3-0.4: Excellent for all ported alignments
- Qts 0.4-0.5: Good for QB3
- Qts 0.5-0.6: Marginal for ported, prefer sealed
- Qts > 0.6: Use sealed

### Options Reference

#### Common Options

```javascript
{
    unit: 'liters',           // Output volume unit: 'liters', 'm3', 'cuft'
    vasUnit: 'liters',        // Input Vas unit (if different)
    responseRange: [10, 200], // Frequency range for response curve
    responsePoints: 100       // Number of points in response curve
}
```

#### Ported-Specific Options

```javascript
{
    portDiameter: 10,         // Port diameter (default: 10)
    portDiameterUnit: 'cm',   // Unit for port diameter
    ql: 7.0,                  // Enclosure loss Q (default: 7.0)
    qa: Infinity,             // Absorption Q (default: lossless)
    qp: Infinity              // Port friction Q (default: lossless)
}
```

**QL Guidelines:**
- `ql = Infinity`: Lossless (theoretical)
- `ql = 10-20`: Well-sealed, no damping
- `ql = 7-10`: Typical well-built box with light damping
- `ql = 5-7`: Moderate damping material
- `ql = 3-5`: Heavy damping

### Return Object Structure

#### Sealed Box Design

```javascript
{
    driver: {
        fs, qts, vas: {m3, liters, cubicFeet},
        qes, xmax, sd, pe
    },
    alignment: {
        name: 'Butterworth',
        targetQtc: 0.707,
        actualQtc: 0.707,
        description: 'Maximally flat frequency response'
    },
    box: {
        volume: {m3, liters, cubicFeet},
        alpha: 2.0,
        fc: 31.1,
        qtc: 0.707,
        f3: 31.1,
        method: 'Small 1972'
    },
    response: {
        frequencies: [10, 11.1, ...],
        magnitudesDb: [-20.5, -18.2, ...],
        range: [10, 200],
        points: 100,
        method: 'Small 1972, Equation 13'
    },
    efficiency: {
        eta0: 0.42,           // Percentage
        spl0: 86.2,           // dB @ 1W/1m
        method: 'Small 1972, Equation 22'
    },
    powerLimits: {
        thermal: 1200,
        excursionLimited: {
            at20Hz: 145,
            at30Hz: 326,
            at50Hz: 1200
        },
        fullCurve: [...]
    },
    citations: [...]
}
```

#### Ported Box Design

Same as sealed, plus:

```javascript
{
    tuning: {
        fb: 22.0,
        ratio: 1.0,
        method: 'Thiele 1971 QB3'
    },
    port: {
        diameter: {m, cm, mm, inches},
        length: {m, cm, mm, inches},
        area: {m2, cm2, inches2},
        velocity: {
            value: 12.4,
            status: 'good',
            conservativeLimit: 15,
            aggressiveLimit: 20
        },
        endCorrection: 0.732
    }
}
```

### Error Handling

Functions throw descriptive errors:

```javascript
try {
    const design = Cookbook.designPortedBox(driver, 'QB3');
} catch (err) {
    console.error(err.message);
    // "Qts=0.65 too high for ported design. Consider sealed box (try Butterworth)."
}
```

### Advanced Usage

#### Custom Qtc

```javascript
// Design for specific Qtc instead of named alignment
const design = Cookbook.designSealedBox(driver, 0.6);
```

#### Custom Vb/Fb

```javascript
// Specify exact box volume and tuning
const design = Cookbook.designPortedBox(driver, {
    vb: 150,  // liters
    fb: 25    // Hz
});
```

#### Target F3

```javascript
// Design to achieve specific F3
const design = Cookbook.designForF3(driver, 25);  // Target F3=25Hz
```

### Integration with Foundation Layer

For direct access to paper-true equations:

```javascript
import * as Foundation from '../foundation/index.js';
import * as Cookbook from '../cookbook/index.js';

// Cookbook for high-level design
const design = Cookbook.designSealedBox(driver, 'butterworth');

// Foundation for custom calculations
const alpha = Foundation.Small1972.calculateAlpha(vas_SI, vb_SI);
const fc = Foundation.Small1972.calculateFc(fs, alpha);
```

### Testing

See `lib/test/Cookbook.test.js` for comprehensive test suite validating:
- Unit conversions
- Alignment calculations
- Comparison workflows
- Error handling

### Future Enhancements

- [ ] Measurement workflows (impedance → T/S parameters)
- [ ] Room boundary effects (corner loading, etc.)
- [ ] Multi-driver systems (mutual coupling)
- [ ] Passive radiator designs
- [ ] Bandpass designs

### Contributing

When adding cookbook functions:
1. Accept user-friendly units (liters, cm)
2. Delegate calculations to foundation/engineering
3. Return comprehensive objects with multiple unit formats
4. Include method/citation in results
5. Provide helpful error messages
6. Add tests
