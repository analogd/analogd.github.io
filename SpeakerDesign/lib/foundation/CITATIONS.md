# Foundation Citations

Complete bibliography for all formulas and theory in the foundation library.

## Primary References (Implemented)

### Thiele 1971
**Thiele, A. Neville.** "Loudspeakers in Vented Boxes: Parts I & II"
*Journal of the Audio Engineering Society (JAES)*

- Part I: Vol. 19, No. 5, May 1971, pp. 382-392
- Part II: Vol. 19, No. 6, June 1971, pp. 471-483

**Contents:**
- Alignment theory (Butterworth, Bessel, Chebyshev)
- Sealed and vented box design principles
- Table II: Canonical alignment parameters
- Transfer function derivations

**Implemented in:** `thiele-1971.js`

**Key equations:**
- Butterworth: Qtc = 0.707 (Table II)
- Bessel: Qtc = 0.577 (Table II)
- Chebyshev: Qtc = 1.0 (Table II)
- QB3: Fb = Fs, Vb = 15 × Qts^3.3 × Vas (Table II)

---

### Small 1972
**Small, Richard H.** "Direct-Radiator Loudspeaker System Analysis"
*Journal of the Audio Engineering Society (JAES)*
Vol. 20, No. 5, June 1972, pp. 383-395

**Contents:**
- Thiele-Small parameter formalization
- Closed-box response calculations
- 2nd-order highpass transfer function (exact)
- Reference efficiency and sensitivity

**Implemented in:** `small-1972.js`

**Key equations:**
- Eq. 5: α = Vas / Vb (compliance ratio)
- Eq. 6: Fc = Fs × √(1 + α) (system resonance)
- Eq. 7: Qtc = Qts × √(α + 1) (total Q)
- Eq. 10: 2nd-order transfer function
- Eq. 22: η₀ = (4π²/c³) × (Fs³ × Vas / Qes) (reference efficiency)

---

### Small 1973
**Small, Richard H.** "Vented-Box Loudspeaker Systems: Parts I-IV"
*Journal of the Audio Engineering Society (JAES)*
Vol. 21, 1973

- Part I: No. 5, June 1973, pp. 363-372
- Part II: No. 6, July/August 1973, pp. 438-444
- Part III: No. 7, September 1973, pp. 549-554
- Part IV: No. 8, October 1973, pp. 635-639

**Contents:**
- Complete ported box theory
- 4th-order transfer function
- Port tuning and design
- Helmholtz resonator calculations

**Implemented in:** `small-1973.js`

**Key equations:**
- Eq. 15: Port length calculation with end correction
- Port velocity and volume velocity
- 4th-order response (NOT YET IMPLEMENTED)

---

## Secondary References

### Dickason 2006
**Dickason, Vance.** *The Loudspeaker Design Cookbook*, 7th Edition
Audio Amateur Press, 2006
ISBN: 978-1882580477

**Contents:**
- Practical implementation of Thiele-Small theory
- Simplified formulas for real-world design
- Edge cases and guidance

**Usage:**
- Used to validate practical interpretations
- Cookbook approach implemented in `speakerphysics/` (not foundation)

---

### Colloms 2005
**Colloms, Martin.** *High Performance Loudspeakers*, 6th Edition
Wiley, 2005
ISBN: 978-0470094303

**Contents:**
- Advanced measurement techniques
- Comprehensive parameter coverage
- Modern design approaches

---

## Modern Extensions (Planned)

### Klippel 1990s-2000s
**Klippel, Wolfgang.** Various papers on large-signal parameters

**Key contributions:**
- Bl(x): Force factor vs displacement
- Cms(x): Compliance vs displacement
- Le(i): Inductance vs current
- Large signal modeling

**Status:** NOT YET IMPLEMENTED
**Priority:** HIGH (Phase 2)
**Would improve:** Excursion and power limit accuracy

**Representative papers:**
- "Dynamic Measurement and Interpretation of the Nonlinear Parameters of Electrodynamic Loudspeakers"
- "Measurement of Impulsive Distortion, Rub and Buzz and Loose Particles"

---

### Roozen et al. 2007
**Roozen, N.B., et al.** "Vortex Sound in Bass-Reflex Ports of Loudspeakers"

**Key contributions:**
- Port compression theory
- Non-linear losses at high velocity
- Chuffing and turbulence modeling

**Status:** NOT YET IMPLEMENTED
**Priority:** MEDIUM (Phase 2)
**Would improve:** Port velocity limits, high-SPL accuracy

---

### Leach 1980s-90s
**Leach, W. Marshall Jr.** Various papers on impedance modeling

**Key contributions:**
- More complete impedance models
- Excursion prediction from impedance curves
- Improved accuracy over simplified models

**Status:** NOT YET IMPLEMENTED
**Priority:** HIGH (Phase 2)
**Would improve:** Excursion calculator (currently using empirical factor)

---

### Olson 1969
**Olson, Harry F.** *Acoustical Engineering*

**Key contributions:**
- Baffle diffraction theory
- Edge effects on response
- Baffle step calculations

**Status:** NOT YET IMPLEMENTED
**Priority:** MEDIUM (Phase 3)
**Would add:** Baffle step correction to response

---

### Linkwitz (Various)
**Linkwitz, Siegfried.** Papers and articles on baffle step compensation

**Key contributions:**
- Practical baffle step correction
- Active equalization approaches
- Measurement techniques

**Status:** NOT YET IMPLEMENTED
**Priority:** MEDIUM (Phase 3)
**Would add:** Baffle step correction

---

## Standard References

### Physical Constants

**NIST (National Institute of Standards and Technology)**
- Speed of sound: c ≈ 343 m/s at 20°C
- Air density: ρ₀ ≈ 1.204 kg/m³ at 20°C, 101.325 kPa

**Implemented in:** `constants.js`

---

## How to Contribute

When adding new calculations to foundation:

1. **Find the source** - Locate original paper/textbook
2. **Add to this file** - Include full citation with DOI if available
3. **Document equations** - Note equation numbers from paper
4. **Implement in appropriate file** - `small-XXXX.js` or create new file
5. **Add tests** - Validate against published values
6. **Update ROADMAP.md** - Mark as implemented

### Citation Format

For papers:
```
Author, Name. "Paper Title"
Journal Name, Vol. X, No. Y, Month Year, pp. XXX-XXX
DOI: XX.XXXX/XXXXX (if available)
```

For books:
```
Author, Name. Book Title, Edition
Publisher, Year
ISBN: XXX-XXXXXXXXXX
```

---

## Paper Acquisition

**Available:**
- ✅ Thiele 1971: Available through AES library
- ✅ Small 1972: Available through AES library
- ✅ Small 1973: Available through AES library

**Needed:**
- ❌ Klippel papers: Some available through AES, some through IEEE
- ❌ Roozen 2007: Check AES/Acoustical Society
- ❌ Leach papers: Available through IEEE

**How to access:**
- AES members can download papers from [aes.org](https://aes.org)
- Many university libraries have AES/IEEE access
- Some authors share PDFs on personal websites
- Interlibrary loan for older papers

---

## Version History

- 2025-11-01: Initial foundation bibliography created
- 2025-11-01: Added modern extensions (Klippel, Roozen, Leach)
