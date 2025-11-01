# SpeakerPhysics Library

A loudspeaker enclosure design library built from **first principles** using documented Thiele-Small theory.

## Foundation Philosophy

This library implements the **canonical equations** from loudspeaker acoustics literature, not reverse-engineered approximations.

Every calculation traces back to published papers and textbooks with proper citations.

### Primary References (FOUNDATION)

1. **A.N. Thiele** - "Loudspeakers in Vented Boxes: Parts I & II"
   - JAES Vol. 19, No. 5 (May 1971), pp. 382-392
   - JAES Vol. 19, No. 6 (June 1971), pp. 471-483
   - **Original alignment theory**: Butterworth, Bessel, Chebyshev
   - **Transfer function derivations** for sealed and ported boxes

2. **Richard H. Small** - "Direct-Radiator Loudspeaker System Analysis"
   - JAES Vol. 20, No. 5 (June 1972), pp. 383-395
   - **Thiele-Small parameters formalized**
   - **Closed-box response calculations** (exact 2nd-order highpass)
   - Electrical-mechanical-acoustical equivalence

3. **Richard H. Small** - "Vented-Box Loudspeaker Systems: Parts I-IV"
   - JAES Vol. 21, No. 5-8 (1973)
   - **Complete ported box theory** (4th-order response)
   - Port tuning, efficiency, alignment tables

4. **Vance Dickason** - "The Loudspeaker Design Cookbook" (7th Edition, 2006)
   - **Industry standard practical reference**
   - Simplified formulas for real-world design
   - Implementation guidance and edge cases

5. **Martin Colloms** - "High Performance Loudspeakers" (6th Edition, 2005)
   - Advanced measurement and theory
   - Comprehensive parameter coverage

## Library Structure

```
/lib
  /foundation/                    ← PURE THEORY (exact equations from papers)
    TransferFunction.js           ← Small 1972: 2nd/4th order transfer functions
    Alignments.js                 ← Thiele 1971: Canonical alignment tables
    Efficiency.js                 ← Small 1972: Reference efficiency η₀
    Excursion.js                  ← Impedance-based cone displacement
    CITATIONS.md                  ← Full bibliography with equation numbers

  /calculators/                   ← PRACTICAL (simplified for everyday use)
    AlignmentCalculator.js        ← User-friendly alignment finder
    SPLCalculator.js              ← SPL with practical corrections
    ExcursionCalculator.js        ← Power limits with safety checks

  /models/                        ← Data structures
    Driver.js                     ← T-S parameters container
    SealedBox.js                  ← Sealed enclosure model
    PortedBox.js                  ← Ported enclosure model

  /validation/                    ← Test data & verification
    winisd-reference.js           ← WinISD measurements for comparison
    reference-data-v2.js          ← Self-contained test fixtures
```

## Foundation Equations

All formulas below are from the cited papers. Comments in code include equation numbers.

### Sealed Box (Small 1972)

**Compliance ratio:**
```
α = Vas / Vb
```
(Equation 5, Small 1972)

**System resonance frequency:**
```
Fc = Fs × √(1 + α)
```
(Equation 6, Small 1972)

**Total Q:**
```
Qtc = Qts × √(α + 1)
```
(Equation 7, Small 1972)

**Transfer function (normalized 2nd-order highpass):**
```
H(s) = (s/ωc)² / [s² + (ωc/Qtc)s + ωc²]
where s = jω, ωc = 2πFc
```
(Equation 10, Small 1972)

**-3dB frequency (exact):**
```
F3 = Fc / √[(1 - 1/(2Qtc²)) + √((1 - 1/(2Qtc²))² + 1)]
```
(Derived from transfer function roots)

**Special case - Butterworth (Qtc = 0.707):**
```
F3 = Fc × 1.000  (exactly)
```

### Ported Box (Small 1973, Thiele 1971)

**QB3 Alignment (Quasi-Butterworth 3rd order):**
```
Fb = Fs
Vb = 15 × Qts^3.3 × Vas
```
(Table II, Thiele 1971)

**Port length (Helmholtz resonator):**
```
Lv = (c²/(4π²)) × (Sv/(Vb×Fb²)) - k×D

where:
  c = 343 m/s (speed of sound, 20°C)
  Sv = port area (m²)
  D = port diameter (m)
  k ≈ 0.732 (end correction factor)
```
(Equation 15, Small 1973)

### Efficiency & SPL (Small 1972)

**Reference efficiency:**
```
η₀ = (4π²/c³) × (Fs³ × Vas / Qes)
```
(Equation 22, Small 1972)

**Reference SPL (2.83V @ 1m, half-space):**
```
SPL₀ = 112 + 10×log₁₀(η₀)
```
(Dickason, Chapter 4)

### Cone Excursion

**Volume velocity:**
```
U = Sd × v = Sd × 2πf × Xpeak
```

**Peak-to-peak displacement:**
```
Xpp = 2 × Xpeak = P/(π² × f² × Sd × ρ₀ × c)
```
Where P is acoustic power, ρ₀ = 1.18 kg/m³ (air density)

## Design Principles

1. **Theory First**: Every calculation implemented from source equations
2. **Transparency**: All formulas cite paper/textbook and equation numbers
3. **Flexibility**: Pure theory available alongside practical simplifications
4. **Validation**: Checked against published alignment tables and measurements

## Usage

### Foundation (Pure Theory)

```javascript
// Use exact Small 1972 equations
const transferFunc = Foundation.sealedTransferFunction(driver, vb);
const response = transferFunc.evaluate(frequency);

// Use canonical Thiele alignments
const butterworth = Foundation.getAlignment('butterworth');
// Returns exact Qtc=0.707 from Thiele's paper
```

### Practical (Simplified)

```javascript
// User-friendly with sensible defaults
const driver = SpeakerPhysics.createDriver({
    fs: 22, qts: 0.53, vas: 248.2,
    xmax: 28, sd: 1184, pe: 1200
});

const alignments = SpeakerPhysics.calculateAlignments(driver, 'sealed');
// Returns: [Butterworth, Bessel, Chebychev] with box volumes

const box = alignments[0].box;
console.log(`Qtc: ${box.qtc.toFixed(3)}`);  // 0.707
console.log(`Fc: ${box.fc.toFixed(1)} Hz`);
console.log(`F3: ${box.f3.toFixed(1)} Hz`);  // ≈ Fc for Butterworth
```

### Maximum Power Analysis

```javascript
// Excursion vs thermal limiting
const maxPowerCurve = SpeakerPhysics.generateMaxPowerCurve(box);

maxPowerCurve.forEach(point => {
    console.log(`${point.frequency}Hz: ${point.maxPower}W (${point.limitingFactor})`);
});
// 20Hz: 200W (excursion)
// 50Hz: 1200W (thermal)
// Shows real-world power handling, not just thermal rating
```

## Validation

The library is validated against:

1. **Published alignment tables** (Thiele 1971, Table II)
   - Butterworth Qtc=0.707 ✓
   - Bessel Qtc=0.577 ✓
   - QB3, SC4, C4 ported alignments ✓

2. **WinISD measurements** (industry standard software)
   - Frequency response curves
   - Box parameters
   - Power limits

3. **Self-consistency** (mathematical relationships)
   - Transfer function poles match F3 calculation
   - Efficiency calculations match sensitivity measurements

Run tests:
```bash
python3 -m http.server 8000
open http://localhost:8000/SpeakerDesign/lib/test.html
```

## What Makes This Different

**Most calculators**: Reverse-engineered formulas, no citations, "magic numbers"

**This library**:
- ✓ Every equation cites source paper
- ✓ Exact formulas from Thiele-Small theory
- ✓ Both pure theory and practical versions
- ✓ Validated against published data
- ✓ Transparent assumptions

Example:
```javascript
// Other calculators: Qtc = Qts * someNumber  // Where'd that come from?

// This library:
// Qtc = Qts × √(α + 1)
// Source: Small 1972, Equation 7
// Where: α = Vas/Vb (compliance ratio)
const qtc = driver.qts * Math.sqrt(driver.vas / vb + 1);
```

## Future Work (Foundation)

- [ ] Complete Small 1973 4th-order ported transfer function
- [ ] Baffle step correction (Olson 1969, Linkwitz)
- [ ] Port compression at high SPL (Roozen et al.)
- [ ] Thermal power compression (voice coil heating)
- [ ] Le effects at high frequency (inductance rolloff)
- [ ] Mutual coupling (multiple drivers)

## Contributing

When adding calculations:

1. **Find the source** - Locate paper/textbook with the formula
2. **Implement in `/foundation`** - Use exact equation with citation
3. **Add practical version** - Simplified in `/calculators` if needed
4. **Validate** - Create test with known correct answer
5. **Document** - Explain assumptions and limitations

Example code structure:
```javascript
/**
 * Calculate sealed box resonance frequency
 *
 * Formula: Fc = Fs × √(1 + α)
 * Where: α = Vas / Vb
 *
 * Source: Small, Richard H. "Direct-Radiator Loudspeaker System Analysis"
 *         JAES Vol. 20, No. 5 (June 1972), Equation 6
 *
 * @param {number} fs - Driver resonance frequency (Hz)
 * @param {number} vas - Driver equivalent volume (liters)
 * @param {number} vb - Box volume (liters)
 * @returns {number} System resonance frequency (Hz)
 */
function calculateFc(fs, vas, vb) {
    const alpha = vas / vb;  // Compliance ratio
    return fs * Math.sqrt(1 + alpha);
}
```

## License

MIT
