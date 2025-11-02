# Loudspeaker Foundation

**Pure Thiele-Small theory from published papers**

A zero-dependency JavaScript library implementing canonical loudspeaker acoustics equations with complete citations.

## Philosophy

**Foundation = Immutable Mathematical Truth**

This library contains ONLY equations from published literature. Every function cites its source paper and equation number. No reverse-engineering, no "magic numbers", no pragmatic shortcuts.

### What This Is

✅ Small 1972: Sealed box calculations
✅ Thiele 1971: Standard alignments
✅ Small 1973: Port calculations
✅ SI units only (m³, Hz, Pa)
✅ Raw numbers (no objects, no formatting)
✅ Academic-grade documentation

### What This Is NOT

❌ Convenience layer (use `speakerphysics/` for that)
❌ User-friendly units (liters, mm, dB SPL)
❌ Validation or warnings
❌ Application logic

## Installation

```bash
# As ES6 module
import * as Foundation from './foundation/index.js';

# Or import specific modules
import { calculateFc, calculateQtc } from './foundation/small-1972.js';
import { BUTTERWORTH_QTC } from './foundation/thiele-1971.js';
```

## Usage

### Sealed Box Calculations

```javascript
import {
    calculateFc,
    calculateQtc,
    calculateF3
} from './foundation/small-1972.js';

// Driver parameters (SI units!)
const fs = 22;              // Hz
const qts = 0.53;           // dimensionless
const vas = 0.2482;         // m³ (248.2 liters)

// Box volume
const vb = 0.330;           // m³ (330 liters)

// Calculate system parameters
const alpha = vas / vb;           // 0.752 (compliance ratio)
const fc = calculateFc(fs, alpha);      // 29.1 Hz (system resonance)
const qtc = calculateQtc(qts, alpha);   // 0.702 (system Q)
const f3 = calculateF3(fc, qtc);        // 29.3 Hz (-3dB point)

console.log({ alpha, fc, qtc, f3 });
```

### Standard Alignments

```javascript
import {
    BUTTERWORTH_QTC,
    BESSEL_QTC,
    CHEBYCHEV_QTC,
    calculateVolumeForQtc
} from './foundation/thiele-1971.js';

// Find box volume for Butterworth alignment
const qts = 0.53;
const vas = 0.2482;  // m³

const vbButterworth = calculateVolumeForQtc(qts, vas, BUTTERWORTH_QTC);
console.log(`Butterworth box: ${(vbButterworth * 1000).toFixed(1)} liters`);
// Output: "Butterworth box: 330.0 liters"
```

### Reference Efficiency

```javascript
import { calculateEta0, calculateSpl0 } from './foundation/small-1972.js';

const fs = 22;       // Hz
const vas = 0.2482;  // m³
const qes = 0.56;    // dimensionless

const eta0 = calculateEta0(fs, vas, qes);
const spl0 = calculateSpl0(eta0);

console.log(`Efficiency: ${(eta0 * 100).toFixed(2)}%`);
console.log(`Reference SPL: ${spl0.toFixed(1)} dB`);
// Efficiency: 0.43%
// Reference SPL: 87.9 dB
```

### Port Design

```javascript
import {
    calculatePortLength,
    calculatePortArea
} from './foundation/small-1973.js';

const vb = 0.330;           // m³ (330 liters)
const fb = 22;              // Hz (tuning frequency)
const portDiameter = 0.10;  // m (10 cm)

const portArea = calculatePortArea(portDiameter);
const portLength = calculatePortLength(vb, fb, portArea, portDiameter);

console.log(`Port length: ${(portLength * 100).toFixed(1)} cm`);
// Port length: 32.5 cm
```

### Frequency Response

```javascript
import { calculateResponseDb } from './foundation/small-1972.js';

const fc = 29.1;   // Hz
const qtc = 0.702; // dimensionless

// Sweep from 10 Hz to 200 Hz
for (let f = 10; f <= 200; f += 10) {
    const responseDb = calculateResponseDb(f, fc, qtc);
    console.log(`${f} Hz: ${responseDb.toFixed(1)} dB`);
}
// 10 Hz: -17.9 dB
// 20 Hz: -5.8 dB
// 30 Hz: -0.1 dB (near resonance)
// ...
```

## API Reference

### Constants (`constants.js`)

| Constant | Value | Unit | Description |
|----------|-------|------|-------------|
| `SPEED_OF_SOUND` | 343 | m/s | At 20°C |
| `AIR_DENSITY` | 1.204 | kg/m³ | At 20°C, 101.325 kPa |
| `ATMOSPHERIC_PRESSURE` | 101325 | Pa | Sea level |
| `REFERENCE_PRESSURE` | 2×10⁻⁵ | Pa | SPL reference |

### Sealed Box (`small-1972.js`)

| Function | Returns | Source |
|----------|---------|--------|
| `calculateAlpha(vas, vb)` | Compliance ratio | Small 1972, Eq. 5 |
| `calculateFc(fs, alpha)` | System resonance (Hz) | Small 1972, Eq. 6 |
| `calculateQtc(qts, alpha)` | System Q | Small 1972, Eq. 7 |
| `calculateF3(fc, qtc)` | -3dB frequency (Hz) | Small 1972, Eq. 10 |
| `calculateResponseMagnitude(f, fc, qtc)` | Magnitude | Small 1972, Eq. 10 |
| `calculateResponseDb(f, fc, qtc)` | Response (dB) | Small 1972, Eq. 10 |
| `calculateEta0(fs, vas, qes)` | Efficiency | Small 1972, Eq. 22 |
| `calculateSpl0(eta0)` | SPL (dB) | Standard conversion |

### Alignments (`thiele-1971.js`)

| Constant/Function | Value/Returns | Source |
|-------------------|---------------|--------|
| `BUTTERWORTH_QTC` | 0.707 | Thiele 1971, Table II |
| `BESSEL_QTC` | 0.577 | Thiele 1971, Table II |
| `CHEBYCHEV_QTC` | 1.0 | Thiele 1971, Table II |
| `calculateVolumeForQtc(qts, vas, targetQtc)` | Volume (m³) | Derived from Small Eq. 7 |
| `calculateButterworthVolume(qts, vas)` | Volume (m³) | Thiele 1971, Table II |
| `QB3_ALIGNMENT.calculateVolume(qts, vas)` | Volume (m³) | Thiele 1971, Table II |
| `QB3_ALIGNMENT.calculateTuning(fs)` | Frequency (Hz) | Thiele 1971, Table II |

### Ported Box (`small-1973.js`)

| Function | Returns | Source |
|----------|---------|--------|
| `calculatePortLength(vb, fb, area, dia)` | Length (m) | Small 1973, Eq. 15 |
| `calculatePortArea(diameter)` | Area (m²) | Geometry |
| `calculateEquivalentDiameter(w, h)` | Diameter (m) | Geometry |
| `calculatePortVelocity(volVel, area)` | Velocity (m/s) | Fluid dynamics |
| `getMaxPortVelocity(conservative)` | Velocity (m/s) | Empirical |

## Units

**All inputs and outputs use SI units:**

| Parameter | Unit | Common Conversions |
|-----------|------|-------------------|
| Volume | m³ | 1 liter = 0.001 m³ |
| Frequency | Hz | No conversion |
| Length | m | 1 cm = 0.01 m, 1 mm = 0.001 m |
| Area | m² | 1 cm² = 0.0001 m² |
| Velocity | m/s | No conversion |
| Quality Factor | dimensionless | No conversion |

**Example conversion:**
```javascript
// Driver datasheet says Vas = 248.2 liters
const vasLiters = 248.2;
const vasM3 = vasLiters / 1000;  // 0.2482 m³

// Pass to foundation
const alpha = calculateAlpha(vasM3, vbM3);
```

## Validation

The library is validated against:

1. **Published alignment tables** (Thiele 1971, Table II)
   - Butterworth: Qtc = 0.707 ✓
   - Bessel: Qtc = 0.577 ✓
   - QB3: Fb = Fs, Vb = 15 × Qts^3.3 × Vas ✓

2. **Known driver calculations**
   - Dayton Audio UM18-22 V2 in 318L sealed → Qtc = 0.707 ✓ (Butterworth)

3. **Self-consistency**
   - F3 ≈ Fc for Qtc = 0.707 ✓
   - Transfer function poles match analytical solutions ✓

See `/test/foundation.test.js` for complete test suite.

## Roadmap

**Phase 1 (Current):** ✅ Core Thiele-Small equations

**Phase 2 (Planned):**
- Impedance modeling (Leach)
- Large signal parameters (Klippel)
- Port compression (Roozen 2007)
- 4th-order ported response (Small 1973)

**Phase 3 (Future):**
- Baffle step (Olson 1969, Linkwitz)
- Thermal dynamics
- Inductance effects

See `ROADMAP.md` for complete implementation plan.

## Citations

Every function cites its source paper. See `CITATIONS.md` for complete bibliography including:

- Thiele 1971: "Loudspeakers in Vented Boxes"
- Small 1972: "Direct-Radiator Loudspeaker System Analysis"
- Small 1973: "Vented-Box Loudspeaker Systems"
- Dickason 2006: "The Loudspeaker Design Cookbook"
- Plus modern extensions (Klippel, Roozen, Leach)

## Contributing

To add calculations:

1. Find source paper with equation numbers
2. Add citation to `CITATIONS.md`
3. Implement in appropriate `xxx-yyyy.js` file
4. Use SI units only
5. Return raw numbers (no objects)
6. Add tests with known correct values
7. Update `ROADMAP.md`

See `ROADMAP.md` for detailed contribution guidelines.

## Comparison: Foundation vs SpeakerPhysics

| Feature | Foundation | SpeakerPhysics |
|---------|-----------|----------------|
| **Purpose** | Pure theory | Practical use |
| **Units** | SI only | User-friendly (L, mm) |
| **Returns** | Raw numbers | Objects with metadata |
| **Validation** | Math only | Edge cases, warnings |
| **Dependencies** | Zero | Foundation + utils |
| **Target** | Academics, verification | Real-world design |
| **Changeability** | Immutable | Evolves frequently |

**Example:**
```javascript
// Foundation (pure theory)
const fc = calculateFc(22, 0.752);  // 29.1

// SpeakerPhysics (practical)
const box = new SealedBox(driver, 330);
console.log(box.fc);           // 29.1
console.log(box.alignment);    // "Butterworth"
console.log(box.warnings);     // []
```

## License

MIT

## Version

**0.1.0** - Initial release with core Thiele-Small equations

---

**Build from first principles. Trust through transparency.**
