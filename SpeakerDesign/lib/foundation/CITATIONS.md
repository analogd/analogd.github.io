# Foundation Library Citations

Complete bibliography for all equations implemented in the foundation library.

## Critical Papers Needed ⚠️

These are the PRIMARY sources we need to implement the library correctly:

### 1. A.N. Thiele Papers

**"Loudspeakers in Vented Boxes: Part I"**
- Journal: JAES (Journal of the Audio Engineering Society)
- Volume: 19, Issue: 5
- Date: May 1971
- Pages: 382-392
- DOI: (if available)
- **STATUS**: ❌ NEED PDF/EQUATIONS
- **What we need**:
  - Alignment tables (Butterworth, Bessel, Chebyshev)
  - Box volume formulas for each alignment
  - Transfer function derivations

**"Loudspeakers in Vented Boxes: Part II"**
- Journal: JAES
- Volume: 19, Issue: 6
- Date: June 1971
- Pages: 471-483
- **STATUS**: ❌ NEED PDF/EQUATIONS
- **What we need**:
  - Ported box alignments
  - Port tuning calculations
  - QB3, SC4, C4 formulas

### 2. Richard H. Small Papers

**"Direct-Radiator Loudspeaker System Analysis"**
- Journal: JAES
- Volume: 20, Issue: 5
- Date: June 1972
- Pages: 383-395
- **STATUS**: ❌ NEED PDF/EQUATIONS
- **What we need**:
  - Equation 5: α = Vas / Vb
  - Equation 6: Fc = Fs × √(1 + α)
  - Equation 7: Qtc = Qts × √(α + 1)
  - Equation 10: Transfer function H(s)
  - Equation 22: Reference efficiency η₀

**"Vented-Box Loudspeaker Systems: Part I"**
- Journal: JAES
- Volume: 21, Issue: 5
- Date: 1973
- **STATUS**: ❌ NEED PDF/EQUATIONS
- **What we need**:
  - 4th-order ported transfer function
  - Port length calculation (Helmholtz resonator)
  - Efficiency in ported systems

**"Vented-Box Loudspeaker Systems: Parts II-IV"**
- Journal: JAES
- Volume: 21, Issues: 6-8
- Date: 1973
- **STATUS**: ❌ NEED PDF/EQUATIONS

### 3. Textbooks

**Vance Dickason - "The Loudspeaker Design Cookbook" (7th Edition)**
- Publisher: Audio Amateur Press
- Year: 2006
- ISBN: 978-1882580477
- **STATUS**: ⚠️ PARTIAL (have general formulas, need chapter/page refs)
- **What we need**:
  - Chapter 4: Efficiency and SPL calculations
  - Port length formulas with end corrections
  - Practical alignment recommendations

**Martin Colloms - "High Performance Loudspeakers" (6th Edition)**
- Publisher: Wiley
- Year: 2005
- ISBN: 978-0470094303
- **STATUS**: ❌ NEED ACCESS
- **What we need**:
  - Advanced parameter measurements
  - Non-linear effects
  - Power compression

### 4. Additional References

**Beranek, Leo - "Acoustics"**
- Classic acoustics textbook
- Need: Helmholtz resonator formula derivation

**Olson, Harry - "Elements of Acoustical Engineering"**
- Need: Baffle step calculations
- Need: Radiation impedance

**Linkwitz, Siegfried - Papers on baffle step and directivity**
- Need: His loudspeaker papers from AES
- **STATUS**: May be available on linkwitzlab.com

## What I Currently Have (Not Verified)

I have **general knowledge** of these formulas but NOT the actual papers:

### Sealed Box (believed to be Small 1972)
```
α = Vas / Vb
Fc = Fs × √(1 + α)
Qtc = Qts × √(α + 1)
F3 = Fc / √[(1 - 1/(2Qtc²)) + √((1 - 1/(2Qtc²))² + 1)]
```

### Ported Box (believed to be Thiele 1971, Small 1973)
```
QB3: Fb = Fs, Vb = 15 × Qts^3.3 × Vas
Port length: Lv = (c²/4π²) × (Sv/(Vb×Fb²)) - k×D
```

### Efficiency (believed to be Small 1972)
```
η₀ = (4π²/c³) × (Fs³ × Vas / Qes)
SPL₀ = 112 + 10×log₁₀(η₀)
```

**⚠️ THESE NEED VERIFICATION** - I need the actual papers to confirm:
1. Equation numbers
2. Exact formulas (are my versions correct?)
3. Original notation and units
4. Assumptions and limitations stated by authors

## How to Help

If you can provide:
1. **PDFs of the papers** (especially Thiele 1971 and Small 1972-1973)
2. **Photos of specific equations** from textbooks
3. **Links to online versions** (some JAES papers may be on AES website)
4. **Scans of Dickason cookbook** relevant chapters

I can then:
1. Verify my formulas are correct
2. Add proper equation numbers
3. Note author's assumptions
4. Implement exactly as documented

## Long-term Goal

Every function in `/foundation/src/` should have:
```javascript
/**
 * Calculate system resonance frequency
 *
 * Source: Small (1972), Equation 6, Page 385
 * Paper: "Direct-Radiator Loudspeaker System Analysis"
 *        JAES Vol. 20, No. 5, pp. 383-395
 *
 * Original formula: f_c = f_s √(1 + V_AS/V_B)
 * Where: V_AS = equivalent air compliance (m³)
 *        V_B = box volume (m³)
 *
 * Assumptions:
 * - Sealed box
 * - No leaks
 * - Box compliance >> driver compliance
 *
 * @param {number} fs - Driver resonance (Hz)
 * @param {number} vas - Equivalent volume (m³)
 * @param {number} vb - Box volume (m³)
 * @returns {number} System resonance (Hz)
 */
function calculateResonanceFrequency(fs, vas, vb) {
    // Equation 6, Small 1972
    return fs * Math.sqrt(1 + vas / vb);
}
```

## Priority Order

**Most critical for v1.0:**
1. ✅ Small (1972) - Sealed box equations (have formulas, need verification)
2. ⚠️ Thiele (1971) - Alignment tables (need exact table values)
3. ⚠️ Small (1973) - Ported box (have QB3, need complete 4th-order)
4. ⚠️ Dickason - SPL calculations (need chapter 4)

**Nice to have for v1.0:**
5. Linkwitz baffle step
6. Colloms power compression

**Future:**
7. Olson radiation impedance
8. Advanced non-linear models
