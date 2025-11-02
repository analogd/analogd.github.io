# Cookbook Layer Refactor Plan

## Problem Statement

**Current State:**
- ✅ Foundation library: 45% coverage, rigorously tested, paper-cited (191 tests)
- ❌ Models layer (`lib/models/`, `lib/calculators/`): Duplicate equations, NOT using foundation
- ❌ Response calculations: Simplified approximations instead of exact transfer functions

**Example Issue:**
```javascript
// PortedBox.js current (WRONG):
responseAt(frequency) {
    if (frequency < this.fb) {
        return Math.pow(10, -octaves * 24 / 20);  // Simplified!
    }
    return 1.0;  // Flat above tuning (WRONG!)
}

// Should use (CORRECT):
Small1973.calculatePortedResponseMagnitude(f, fs, fb, alpha, qt, ql);
// Exact 4th-order transfer function with losses!
```

---

## Architecture

```
┌──────────────────────────────────────────┐
│  Foundation Layer (lib/foundation/)       │
│  - Pure math, SI units, zero dependencies │
│  - Small 1973 (43 funcs), 1972 (14), 1971│
│  - 191 tests, paper-cited                 │
└────────────────┬─────────────────────────┘
                 │ imports
┌────────────────▼─────────────────────────┐
│  Cookbook Layer (lib/cookbook/)    NEW!  │
│  - High-level workflows                   │
│  - User-friendly units (L, cm, dB)        │
│  - Sensible defaults                      │
│  - Rich return objects                    │
└────────────────┬─────────────────────────┘
                 │ imports
┌────────────────▼─────────────────────────┐
│  API Layer (api/v1/)                      │
│  - REST endpoints                         │
│  - OpenAPI/Swagger docs                   │
│  - HTTP validation                        │
└────────────────┬─────────────────────────┘
                 │ HTTP
┌────────────────▼─────────────────────────┐
│  UI Layer (browser or CLI)                │
│  - Interactive speaker builder            │
│  - Charts, forms, results                 │
└──────────────────────────────────────────┘
```

---

## Refactor Strategy

### Phase 1: Create New Cookbook Layer ✅

**Create `lib/cookbook/` with:**

1. **`lib/cookbook/sealed-box-designer.js`**
   - `designSealedBox(driver, alignment, options)` → complete design
   - Uses Small1972 + Thiele1971 foundation functions
   - Returns: `{ vb, fc, qtc, f3, eta0, spl0, alignment, response }`

2. **`lib/cookbook/ported-box-designer.js`**
   - `designPortedBox(driver, alignment, options)` → complete design
   - Uses Small1973.designPortedBox() (already exists!)
   - Returns: `{ vb, fb, port, f3, response, efficiency, powerLimits }`

3. **`lib/cookbook/measurement.js`**
   - `measureSystemFromImpedance(impedanceCurve)` → extract all parameters
   - Uses Small1973 Appendix 2 & 3 measurement functions
   - Returns: `{ fs, fb, alpha, QLP, QA, QP }`

4. **`lib/cookbook/comparison.js`**
   - `compareAlignments(driver, alignments)` → compare multiple designs
   - Returns array of designs with scores

5. **`lib/cookbook/units.js`**
   - Unit conversion utilities
   - `volumeToM3(value, unit)`, `formatVolume(m3)`
   - `lengthToM(value, unit)`, `formatLength(m)`
   - Keep it lean - copy from api/v1/utils/units.js

6. **`lib/cookbook/index.js`**
   - Export all cookbook functions
   - Single import point: `import * as Cookbook from './lib/cookbook/index.js'`

### Phase 2: Deprecate Old Models ⚠️

**Mark for removal:**
- `lib/models/SealedBox.js` → replaced by cookbook/sealed-box-designer.js
- `lib/models/PortedBox.js` → replaced by cookbook/ported-box-designer.js
- `lib/calculators/` → most functions now in cookbook

**Migration path:**
```javascript
// OLD (delete):
const box = new SealedBox(driver, vb);
const response = box.responseAt(100);

// NEW (use):
const design = Cookbook.designSealedBox(driver, 'butterworth');
const response = design.responseAt(100);
```

### Phase 3: Update API Layer 🔧

**Update `api/v1/routes/` to use cookbook:**
```javascript
// Before:
import * as Small1973 from '../../../lib/foundation/small-1973.js';
const portLength = Small1973.calculatePortLength(vb, fb, portArea, diameter);

// After:
import * as Cookbook from '../../../lib/cookbook/index.js';
const design = Cookbook.designPortedBox(driver, 'B4', { vb, fb });
```

### Phase 4: Update Examples 📚

**Simplify `example.html`:**
```javascript
// Before (15 lines):
const vb = Thiele1971.calculateButterworthVolume(driver.qts, driver.vas);
const alpha = Small1972.calculateAlpha(driver.vas, vb);
const fc = Small1972.calculateFc(driver.fs, alpha);
const qtc = Small1972.calculateQtc(driver.qts, alpha);
const f3 = Small1972.calculateF3(fc, qtc);
// ... more

// After (1 line):
const design = Cookbook.designSealedBox(driver, 'butterworth');
```

---

## Cookbook API Design

### Core Design Philosophy

1. **One function = one complete workflow**
   - No multi-step processes
   - All related calculations bundled
   - Return everything user might need

2. **User-friendly inputs**
   - Accept common units (liters, cm, inches)
   - Sensible defaults (QL=7 if not specified)
   - Validate and provide helpful errors

3. **Rich return objects**
   - All calculations performed
   - Ready-to-display results
   - Include citation/source references

### Example 1: Sealed Box Design

```javascript
import * as Cookbook from './lib/cookbook/index.js';

const driver = {
    name: 'Dayton Audio UM18-22 V2',
    fs: 22.0,      // Hz
    qts: 0.530,
    qes: 0.56,
    vas: 248.2,    // liters (auto-converts to m³)
    sd: 1140,      // cm²
    xmax: 18       // mm
};

// One function call, complete design
const design = Cookbook.designSealedBox(driver, 'butterworth', {
    unit: 'liters',  // output units
    responseRange: [10, 200],  // Hz
    responsePoints: 100
});

// Returns:
{
    driver: { ...driver },

    alignment: {
        name: 'Butterworth',
        type: 'QB3',  // if ported
        qtc: 0.707,
        description: 'Maximally flat frequency response'
    },

    box: {
        volume: { value: 124.1, unit: 'liters', m3: 0.1241 },
        alpha: 2.0,
        fc: 31.1,      // Hz
        f3: 28.0,      // Hz (-3dB point)
        qtc: 0.707
    },

    response: {
        frequencies: [10, 11.1, 12.3, ...],  // Hz
        magnitudes: [-20.5, -18.2, -15.7, ...],  // dB
        method: 'Small 1972, Eq. 13'
    },

    efficiency: {
        eta0: 0.0042,          // 0.42%
        spl0: 86.2,            // dB @ 1W/1m
        method: 'Small 1972, Eq. 19'
    },

    powerLimits: {
        displacementLimited: {
            at20Hz: 145,  // watts
            at30Hz: 326,
            method: 'Small 1973, Eq. 32'
        },
        electrical: {
            continuous: 500,  // watts
            method: 'Driver specs'
        }
    },

    citations: [
        'Small 1972 - Closed-Box Loudspeaker Systems',
        'Thiele 1971 - Loudspeakers in Vented Boxes'
    ]
}
```

### Example 2: Ported Box Design

```javascript
// One function, complete ported design
const design = Cookbook.designPortedBox(driver, 'B4', {
    unit: 'liters',
    portDiameter: 10,  // cm
    portDiameterUnit: 'cm'
});

// Returns everything from Example 1 PLUS:
{
    // ... (same as sealed) ...

    port: {
        diameter: { value: 10, unit: 'cm', m: 0.1 },
        length: { value: 42.3, unit: 'cm', m: 0.423 },
        area: { value: 78.5, unit: 'cm²', m2: 0.00785 },
        endCorrection: 0.732,
        velocity: {
            atFb: 12.4,      // m/s @ fb
            atXmax: 18.7,    // m/s @ full excursion
            status: 'good',
            warning: null
        }
    },

    tuning: {
        fb: 22.0,    // Hz
        ratio: 1.0,  // fb/fs
        method: 'Small 1973, B4 alignment'
    },

    losses: {
        QL: 7.0,           // combined enclosure Q
        QLP: 15.0,         // leakage (estimated)
        QA: 20.0,          // absorption (estimated)
        QP: 35.0,          // port friction (estimated)
        method: 'Small 1973, Section 3'
    }
}
```

### Example 3: Measure Existing System

```javascript
// User provides impedance measurements
const impedanceCurve = [
    { f: 10, Z: 8.2 },
    { f: 15, Z: 12.5 },
    { f: 20, Z: 35.0 },  // peak (fH)
    { f: 25, Z: 15.5 },
    { f: 30, Z: 10.2 },  // minimum (fB)
    { f: 35, Z: 16.8 },
    { f: 40, Z: 45.0 },  // peak (fL)
    // ... more points
];

const measured = Cookbook.measureSystemFromImpedance(impedanceCurve);

// Returns:
{
    peaks: {
        fH: 20.0,
        fL: 40.0,
        fB: 30.0,
        method: 'Small 1973, Section 7'
    },

    parameters: {
        fs: 28.3,      // Hz (driver resonance)
        fb: 30.0,      // Hz (box tuning)
        alpha: 2.5,    // Vas/Vb ratio
        method: 'Small 1973, Appendix 2 (Eq 45, 83)'
    },

    alignment: {
        detected: 'QB3',
        confidence: 0.85
    },

    losses: {
        QL: 8.5,
        method: 'Measured from impedance peak bandwidth'
    }
}
```

### Example 4: Compare Alignments

```javascript
const comparison = Cookbook.compareAlignments(driver, [
    'butterworth',  // sealed
    'B4',           // ported
    'C4',           // ported
    'QB3'           // ported
]);

// Returns:
[
    {
        alignment: 'Butterworth (sealed)',
        box: { volume: 124.1, unit: 'liters' },
        f3: 28.0,
        response: 'Maximally flat',
        score: { efficiency: 6, extension: 7, size: 8 },
        pros: ['Compact', 'Simple construction'],
        cons: ['Lower efficiency']
    },
    {
        alignment: 'B4 (ported)',
        box: { volume: 150.0, unit: 'liters' },
        port: { diameter: 10, length: 42.3, unit: 'cm' },
        f3: 22.0,
        response: 'Maximally flat',
        score: { efficiency: 8, extension: 9, size: 6 },
        pros: ['Better extension', 'Higher efficiency'],
        cons: ['Larger box', 'Port construction']
    },
    // ...
]
```

---

## Implementation Order

### Session 1: Core Cookbook Functions
1. ✅ Create `lib/cookbook/` directory
2. ✅ Implement `sealed-box-designer.js`
3. ✅ Implement `ported-box-designer.js`
4. ✅ Copy unit utilities
5. ✅ Create `index.js` barrel export

### Session 2: Measurement & Comparison
1. Implement `measurement.js`
2. Implement `comparison.js`
3. Add tests for cookbook functions

### Session 3: Integration
1. Update API routes to use cookbook
2. Update `example.html` to use cookbook
3. Deprecate old models
4. Update documentation

---

## Success Criteria

✅ **One-line design workflows**
```javascript
const design = Cookbook.designSealedBox(driver, 'butterworth');
```

✅ **Accurate calculations** (uses foundation library)
```javascript
// Uses Small1973.calculatePortedResponseDb() internally
design.response.at(50)  // Exact 4th-order transfer function
```

✅ **User-friendly**
```javascript
// Accepts liters, cm, inches
// Returns formatted with multiple units
design.box.volume  // { value: 124.1, unit: 'liters', m3: 0.1241 }
```

✅ **Complete information**
```javascript
// Everything user needs in one object
design.box, design.port, design.response, design.efficiency, design.powerLimits
```

✅ **Citation transparency**
```javascript
design.citations  // ['Small 1973, Part I, Eq. 13', ...]
```

---

## Next Step

**Start with `lib/cookbook/sealed-box-designer.js`** - simplest case, validates the pattern, then extend to ported boxes.

Ready to implement?
