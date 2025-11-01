# Two-Library Architecture

## Philosophy

Split the codebase into **two distinct libraries** with clear separation of concerns:

### 1. Foundation Library (Pure Theory)

**Purpose**: Immutable mathematical truth from published literature

**Characteristics**:
- Zero dependencies
- No opinions or shortcuts
- Every function cites source paper + equation number
- SI units only (no imperial, no pragmatic conversions)
- Returns raw numbers, no formatting
- No validation or edge-case handling beyond mathematics
- Academic-grade documentation

**Example**:
```javascript
// foundation/sealed.js

/**
 * Calculate system resonance frequency for sealed enclosure
 *
 * Source: Small, Richard H. "Direct-Radiator Loudspeaker System Analysis"
 *         JAES Vol. 20, No. 5 (June 1972), pp. 383-395, Equation 6
 *
 * Formula: Fc = Fs × √(1 + α)
 * Where: α = Vas / Vb (compliance ratio)
 *
 * @param {number} fs - Driver resonance (Hz)
 * @param {number} vas - Equivalent volume (m³)
 * @param {number} vb - Box volume (m³)
 * @returns {number} System resonance (Hz)
 */
export function calculateResonanceFrequency(fs, vas, vb) {
    const alpha = vas / vb;
    return fs * Math.sqrt(1 + alpha);
}
```

**Who uses it**:
- Our practical library (primary consumer)
- Academics verifying calculations
- Other developers wanting pure theory
- Students learning Thiele-Small theory

### 2. SpeakerPhysics Library (Our Pragmatic Implementation)

**Purpose**: Real-world speaker design tool built on foundation

**Characteristics**:
- Depends on foundation library
- Adds convenience (models, validation, edge cases)
- User-friendly units (liters, mm, watts)
- Returns structured objects with metadata
- Handles errors gracefully
- Practical defaults and recommendations
- WinISD validation

**Example**:
```javascript
// speakerphysics/models/SealedBox.js
import { calculateResonanceFrequency } from 'foundation/sealed.js';

class SealedBox {
    constructor(driver, vb) {
        // Convert liters to m³ for foundation
        const vbM3 = vb / 1000;
        const vasM3 = driver.vas / 1000;

        // Use foundation pure theory
        this.fc = calculateResonanceFrequency(
            driver.fs,
            vasM3,
            vbM3
        );

        // Add practical metadata
        this.vb = vb;  // Keep in liters
        this.driver = driver;
        this.alpha = driver.vas / vb;

        // Validate and warn
        if (this.alpha < 0.5) {
            this.warnings.push('Very small box - Qtc will be high');
        }
    }
}
```

**Who uses it**:
- End users building speakers (primary)
- Our web UI
- Other speaker design tools

## Proposed Directory Structure

```
/lib
  /foundation                    ← LIBRARY 1: Pure Theory
    /src
      sealed.js                  ← Small 1972 sealed box equations
      ported.js                  ← Small 1973 ported box equations
      alignments.js              ← Thiele 1971 alignment theory
      efficiency.js              ← Reference efficiency calculations
      excursion.js               ← Impedance-based displacement
      constants.js               ← Physical constants (c, ρ₀, etc.)

    /test
      sealed.test.js             ← Verify against published tables
      ported.test.js

    foundation.js                ← Entry point (exports all)
    README.md                    ← Academic documentation
    CITATIONS.md                 ← Full bibliography
    package.json                 ← "loudspeaker-foundation"

  /speakerphysics               ← LIBRARY 2: Practical Implementation
    /src
      /models
        Driver.js                ← Wraps T-S params, adds derived values
        SealedBox.js             ← Uses foundation, adds conveniences
        PortedBox.js

      /calculators
        AlignmentCalculator.js   ← Finds optimal boxes using foundation
        SPLCalculator.js         ← SPL with practical corrections
        ExcursionCalculator.js   ← Power limits from foundation

      /validation
        winisd-reference.js      ← Real measurements for comparison
        validator.js             ← Test against WinISD

    speakerphysics.js            ← Entry point
    README.md                    ← User documentation
    package.json                 ← "speakerphysics" (depends on foundation)
```

## Benefits

### 1. **Clarity of Truth**
```javascript
// Foundation: Mathematical truth (can't argue with Small 1972)
import { calculateQtc } from 'foundation';
const qtc = calculateQtc(qts, alpha);

// Pragmatic: Our decisions (can be debated/improved)
const box = new SealedBox(driver, vb);  // Adds warnings, validation, etc.
```

### 2. **Independent Evolution**
- Foundation rarely changes (only if we find equation errors)
- Pragmatic evolves rapidly (better UX, new features)
- Foundation can be published standalone for academics

### 3. **Transparent Pragmatism**
```javascript
// This is OUR choice (pragmatic):
if (qtc > 1.0) {
    warnings.push('High Qtc - consider larger box');
}

// This is PHYSICS (foundation):
const fc = calculateResonanceFrequency(fs, vas, vb);
```

### 4. **Trust Through Transparency**
Users can inspect foundation and see exact equations from papers.
Pragmatic layer is clearly "our take" on top of immutable theory.

### 5. **Testability**
```javascript
// Foundation tests: Match published alignment tables
test('Butterworth Qtc=0.707', () => {
    const qtc = calculateQtc(0.5, 1.0);  // Specific alpha
    expect(qtc).toBeCloseTo(0.707, 3);
});

// Pragmatic tests: Match WinISD real-world results
test('UM18-22 in 330L matches WinISD', () => {
    const box = new SealedBox(um18, 330);
    expect(box.qtc).toBeCloseTo(0.707, 2);
    expect(box.fc).toBeCloseTo(68.7, 1);  // WinISD measurement
});
```

## Migration Path

### Phase 1: Create Foundation (This Week)
1. Create `/lib/foundation` directory
2. Extract pure equations from current code
3. Add citations and documentation
4. Test against Thiele alignment tables

### Phase 2: Refactor Pragmatic (Next)
1. Move models/calculators to `/lib/speakerphysics`
2. Update to use foundation functions
3. Keep practical conveniences
4. Validate against WinISD

### Phase 3: Separate Repos (Future)
1. Foundation → separate npm package
2. SpeakerPhysics depends on foundation
3. Both can be used independently

## Example Usage Comparison

### Foundation (For Academics/Verification)
```javascript
import * as Foundation from 'foundation';

// Pure math, SI units, no opinions
const fs = 22;  // Hz
const vas = 0.2482;  // m³
const vb = 0.330;  // m³

const fc = Foundation.calculateResonanceFrequency(fs, vas, vb);
const qtc = Foundation.calculateQtc(0.53, vas / vb);
const f3 = Foundation.calculateF3Sealed(fc, qtc);

console.log({ fc, qtc, f3 });  // Raw numbers
```

### Pragmatic (For Real Designs)
```javascript
import SpeakerPhysics from 'speakerphysics';

// User-friendly, liters/mm/watts, with guidance
const driver = new Driver({
    fs: 22, qts: 0.53, vas: 248.2,  // Liters!
    xmax: 28, sd: 1184, pe: 1200
});

const alignments = SpeakerPhysics.calculateAlignments(driver, 'sealed');
const best = alignments[0];

console.log(best);
// {
//   name: 'Butterworth',
//   vb: 330,
//   box: { qtc: 0.707, fc: 68.7, f3: 68.7 },
//   recommendation: 'Great all-around response',
//   warnings: []
// }
```

## API Comparison Table

| Feature | Foundation | Pragmatic |
|---------|-----------|-----------|
| **Units** | SI only (m³, Pa, m/s) | User-friendly (L, dB, mm) |
| **Returns** | Raw numbers | Structured objects |
| **Validation** | Math only | Edge cases, warnings |
| **Dependencies** | Zero | Foundation + utils |
| **Documentation** | Academic papers | User guides |
| **Target** | Verification, theory | Real-world design |
| **Changeability** | Immutable | Evolves frequently |

## Decision: Split Now or Later?

### Option A: Split Now (Recommended)
**Pro**: Forces clean architecture from start
**Pro**: Foundation can be validated independently
**Con**: More upfront work

### Option B: Single Lib First, Split Later
**Pro**: Faster initial progress
**Con**: Harder to untangle later
**Con**: Risk of mixing concerns

**Recommendation**: **Split now** - The foundation is small enough that creating it properly from the start will save time later and ensure clean architecture.

## Next Steps

1. Create `/lib/foundation/` directory structure
2. Extract sealed box equations to `foundation/sealed.js` with citations
3. Write foundation tests against Thiele alignment tables
4. Move current code to `/lib/speakerphysics/`
5. Update speakerphysics to import from foundation
6. Update main README to explain two-library architecture

This gives us:
- ✓ Clear separation of truth vs pragmatism
- ✓ Foundation validated against papers
- ✓ Pragmatic validated against WinISD
- ✓ Both can evolve independently
- ✓ Users can choose their level of abstraction
