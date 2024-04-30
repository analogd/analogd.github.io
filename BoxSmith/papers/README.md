# Papers Directory

Reference papers for the BoxSmith foundation layer.
Each paper in this directory has corresponding implementation in `lib/foundation/`.

---

## Implemented Papers

### Small 1972 - Sealed Box Theory
**File**: `Small_1972_Closed_Box.pdf`
**Implementation**: `lib/foundation/small-1972.js`
**Coverage**: ✅ Complete

Richard Small's foundational paper on closed-box (sealed) loudspeaker systems.
Defines the relationship between driver T/S parameters and enclosure behavior.

| Paper Section | Implemented |
|--------------|-------------|
| Compliance ratio (α) | ✅ `calculateAlpha()` |
| System resonance (Fc) | ✅ `calculateFc()` |
| System Q (Qtc) | ✅ `calculateQtc()` |
| -3dB frequency (F3) | ✅ `calculateF3()` |
| Transfer function | ✅ `calculateResponseMagnitude()`, `calculateResponseDb()` |
| Reference efficiency (η₀) | ✅ `calculateEta0()` |
| Sensitivity (1W/1m) | ✅ `calculateSensitivity1W()` |
| Sensitivity (2.83V/1m) | ✅ `calculateSensitivity2v83()` |
| Phase response | ✅ `calculatePhase()`, `calculateResponseComplex()` |
| Group delay | ✅ `calculateGroupDelay()` |
| Impedance | ✅ `calculateSealedImpedance()` |
| Step/impulse response | ✅ `calculateStepResponse()`, `calculateImpulseResponse()` |

---

### Thiele 1971 - Alignment Theory
**File**: `Thiele_1971_Vented_Boxes_Parts_I-II.pdf`
**Implementation**: `lib/foundation/thiele-1971.js`
**Coverage**: ✅ Complete

Neville Thiele's paper defining canonical alignments for loudspeaker systems.
Table II provides the quality factors for optimal response shapes.

| Alignment | Qtc | Implemented |
|-----------|-----|-------------|
| Butterworth (B2) | 0.707 | ✅ `BUTTERWORTH_QTC`, `calculateButterworthVolume()` |
| Bessel (Br2) | 0.577 | ✅ `BESSEL_QTC`, `calculateBesselVolume()` |
| Chebyshev (C2) | 1.0 | ✅ `CHEBYSHEV_QTC`, `calculateChebyshevVolume()` |
| QB3 (vented) | - | ✅ `QB3_ALIGNMENT` |

---

### Small 1973 - Vented Box Theory
**File**: `Small_1973_Vented_Box_Parts_I-IV.pdf`
**Implementation**: `lib/foundation/small-1973.js`
**Coverage**: ✅ Comprehensive (34 functions)

Richard Small's comprehensive 4-part paper on vented (ported) loudspeaker systems.
The most detailed treatment of bass reflex design.

| Paper Part | Sections | Implemented |
|------------|----------|-------------|
| Part I | Basic analysis, Helmholtz resonator, losses | ✅ Port length, tuning ratio, QL |
| Part II | Efficiency, large-signal behavior | ✅ Power limits, displacement |
| Part III | Parameter measurement, design methods | ✅ Impedance analysis, B4/C4 design |
| Part IV | Alignment tables, appendices | ✅ B4, C4, QB3 alignments |

Key functions: `calculatePortedResponse()`, `calculatePortLength()`, `designPortedBox()`,
`calculatePortedImpedance()`, `calculatePeakFrequencies()`, and 30+ more.

---

### Klippel 2006 - Nonlinear Behavior
**File**: `Klippel_2006_Loudspeaker_Nonlinearities.pdf`
**Implementation**: `lib/foundation/klippel/`
**Coverage**: ⏳ Partial (estimation models only)

Wolfgang Klippel's tutorial on large-signal loudspeaker behavior.

| Paper Topic | Our Implementation | Notes |
|-------------|-------------------|-------|
| Bl(x) force factor | ✅ `blFromXmax()`, `blFromGeometry()` | Estimated from Xmax, not measured |
| Kms(x) stiffness | ✅ `kmsFromXmax()` | Symmetric polynomial model |
| SPL compression | ✅ `estimateCompression()`, `compressionCurve()` | Based on Bl reduction |
| Le(x,i) inductance | ❌ Not implemented | Affects HF impedance |
| Harmonic distortion | ❌ Not implemented | Requires measured curves |
| Thermal compression | ⏳ Placeholder | Simplistic model only |

**Important**: Our Klippel implementation is for *estimation* and *visualization*.
We estimate nonlinear behavior from Xmax without requiring Klippel measurement hardware.
This is useful for planning but not a substitute for actual measurements.

---

## Reference Documents (Not Implemented)

### CEDIA RP22 - Home Theater Standards
**File**: `CEDIA-CTA_RP22_Immersive_Audio_Design_v1.2_2023.pdf`
**Implementation**: None (reference thresholds only)

Industry-standard performance targets for home theater systems.
Used as reference for "is my design adequate?" checks.

Key thresholds extracted in `lib/future/README.md`:
- Reference level: 85 dB SPL
- Peak LFE capability: 115 dB(C)
- Headroom: 6 dB recommended
- Response tolerance: ±3 dB (good), ±6 dB (acceptable)

---

## Papers We Should Acquire

These papers would fill gaps in our implementation. See `lib/future/README.md` for details.

### High Priority
1. **Salvatti et al. "Maximizing Performance from Loudspeaker Ports" (AES 2002)**
   - Nonlinear port compression model
   - Would replace crude "15 m/s velocity limit" with real physics

### Medium Priority
2. **Beranek & Mellow "Acoustics: Sound Fields and Transducers" (2012)**
   - Radiation impedance, mutual coupling
   - Chapter 12 specifically for loudspeakers

3. **Olson "Direct Radiator Loudspeaker Enclosures" (JAES 1951)**
   - Baffle diffraction, historical foundation

---

## Deleted Papers

### Geddes - Acoustic Waveguide Theory
**Reason**: Horn/waveguide design is out of scope for enclosure calculator.
Horns are a specialized category that would require significant additional work.
