# Foundation Roadmap

Implementation status and planned features for the foundation library.

## Philosophy

**Foundation = Immutable mathematical truth**

This library contains ONLY equations from published papers, not application logic or convenience features. Every function must cite a source.

---

## Current Status (Phase 1)

### ✅ IMPLEMENTED

#### `constants.js`
- Speed of sound (343 m/s at 20°C)
- Air density (1.204 kg/m³)
- Atmospheric pressure
- Reference acoustic pressure

#### `small-1972.js` - Sealed Box Theory
- ✅ `calculateAlpha(vas, vb)` - Compliance ratio (Eq. 5)
- ✅ `calculateFc(fs, alpha)` - System resonance (Eq. 6)
- ✅ `calculateQtc(qts, alpha)` - Total Q (Eq. 7)
- ✅ `calculateF3(fc, qtc)` - -3dB frequency (derived from Eq. 10)
- ✅ `calculateResponseMagnitude(f, fc, qtc)` - Transfer function (Eq. 10)
- ✅ `calculateResponseDb(f, fc, qtc)` - Response in dB
- ✅ `calculateEta0(fs, vas, qes)` - Reference efficiency (Eq. 22)
- ✅ `calculateSpl0(eta0)` - Reference SPL

#### `thiele-1971.js` - Alignment Theory
- ✅ `BUTTERWORTH_QTC` = 0.707 (Table II)
- ✅ `BESSEL_QTC` = 0.577 (Table II)
- ✅ `CHEBYCHEV_QTC` = 1.0 (Table II)
- ✅ `calculateVolumeForQtc(qts, vas, targetQtc)` - Required box volume
- ✅ `calculateButterworthVolume(qts, vas)` - Convenience function
- ✅ `calculateBesselVolume(qts, vas)` - Convenience function
- ✅ `calculateChebychevVolume(qts, vas)` - Convenience function
- ✅ `QB3_ALIGNMENT` - Quasi-Butterworth 3rd order (Table II)
- ⚠️ `SC4_ALIGNMENT` - Stub (needs formula verification)
- ⚠️ `C4_ALIGNMENT` - Stub (needs formula verification)

#### `small-1973.js` - Ported Box Theory
- ✅ `PORT_END_CORRECTION` = 0.732
- ✅ `calculatePortLength(vb, fb, portArea, portDiameter)` - Helmholtz (Eq. 15)
- ✅ `calculatePortArea(diameter)` - Circle area
- ✅ `calculateEquivalentDiameter(width, height)` - Rectangular port
- ✅ `calculatePortVelocity(volumeVelocity, portArea)` - Air velocity
- ✅ `getMaxPortVelocity(conservative)` - Empirical limit (15-20 m/s)
- ⚠️ `calculateVolumeVelocity(power, area)` - Simplified (needs impedance)
- ❌ `calculatePortedResponse()` - Not implemented (needs 4th-order transfer function)

---

## Phase 2: Critical Improvements

### Priority: HIGH

#### Impedance Modeling (Small 1972 + Leach)
**Why:** Needed for accurate excursion calculation

**New file:** `impedance.js`

**Functions:**
```javascript
calculateImpedance(driver, frequency)  // Z(f) including Re, Le, Bl, Mms, Cms
calculatePhase(driver, frequency)      // Phase angle
calculateDisplacementFromImpedance()   // Excursion from impedance curve
```

**Impact:** Fixes current excursion calculator which uses empirical 15× factor

**Source papers:**
- Small 1972: Basic impedance equations
- Leach: Improved models with Le effects

---

#### Large Signal Parameters (Klippel)
**Why:** T/S parameters change with displacement/current at high power

**New file:** `klippel.js`

**Functions:**
```javascript
calculateBlX(x, bl0, ...)           // Force factor vs displacement
calculateCmsX(x, cms0, ...)         // Compliance vs displacement
calculateLeI(i, le0, ...)           // Inductance vs current
adjustParametersForDisplacement()   // Get effective parameters at given x
```

**Impact:** Accurate high-power calculations, distortion prediction

**Source papers:**
- Klippel: "Dynamic Measurement and Interpretation of the Nonlinear Parameters"
- Klippel: "Measurement of Impulsive Distortion"

---

#### Port Compression (Roozen)
**Why:** Port velocity limit is currently empirical (15-20 m/s)

**New file:** `roozen-2007.js`

**Functions:**
```javascript
calculatePortCompression(velocity, ...)    // Loss in dB vs velocity
calculateChuffingThreshold(...)            // When audible noise starts
calculateTurbulentLosses(...)              // Non-linear losses
```

**Impact:** Accurate high-SPL ported box behavior

**Source papers:**
- Roozen et al. 2007: "Vortex Sound in Bass-Reflex Ports"

---

#### 4th-Order Ported Response (Small 1973)
**Why:** Currently using simplified 2nd-order approximation

**Update:** `small-1973.js`

**Functions:**
```javascript
calculatePortedResponse(driver, vb, fb, frequency)  // Complete 4th-order
calculatePortedF3(driver, vb, fb)                   // Exact -3dB point
```

**Impact:** Accurate ported box frequency response

**Source papers:**
- Small 1973, Part III: Complete system response

---

## Phase 3: Extensions

### Priority: MEDIUM

#### Baffle Step (Olson 1969, Linkwitz)
**Why:** Edge diffraction affects all real speakers

**New file:** `baffle-step.js`

**Functions:**
```javascript
calculateBaffleStepFrequency(width, height)  // Transition frequency
calculateBaffleStepMagnitude(frequency, ...)  // dB correction needed
```

**Impact:** Accurate in-room response prediction

---

#### Thermal Dynamics
**Why:** Static Pe doesn't account for thermal time constants

**New file:** `thermal.js`

**Functions:**
```javascript
calculateThermalTimeConstant(...)       // Voice coil heating time
calculatePowerCompression(power, time)  // SPL loss over time
calculateThermalLimit(duration)         // Power limit vs time
```

**Impact:** Accurate long-term power handling

---

#### Voice Coil Inductance Effects
**Why:** Le causes HF rolloff

**New file:** `inductance.js`

**Functions:**
```javascript
calculateLeRolloff(frequency, le, re)   // SPL reduction vs frequency
calculateEffectiveQes(frequency, ...)   // Qes changes with frequency
```

**Impact:** Accurate high-frequency response

---

## Phase 4: Advanced Features

### Priority: LOW (Future)

#### Crossover Theory
**New file:** `crossovers.js`

**Functions:**
```javascript
calculateButterworthFilter(order, fc)
calculateLinkwitzRileyFilter(order, fc)
```

**Note:** This is a separate domain from enclosure design

---

#### Room Gain
**New file:** `room-gain.js`

**Functions:**
```javascript
calculateBoundaryGain(distance, ...)
calculateRoomModes(dimensions)
```

**Note:** Installation-specific, may not belong in foundation

---

#### Multiple Driver Coupling
**New file:** `coupling.js`

**Functions:**
```javascript
calculateMutualCoupling(drivers, spacing)
calculateArrayResponse(drivers, geometry)
```

**Note:** Complex topic, needs extensive validation

---

## Testing Strategy

### Phase 1 (Current)
- ✅ Test against published alignment tables (Thiele 1971, Table II)
- ✅ Validate Qtc calculations
- ✅ Check response curves match theory
- ⏸️ Compare with WinISD (some discrepancies noted)

### Phase 2
- Test impedance calculations against measured curves
- Validate Klippel parameters against published driver data
- Check port compression against Roozen measurements
- Verify 4th-order response against Small's published curves

### Phase 3
- Validate baffle step against measurements
- Check thermal model against long-duration tests
- Verify Le effects against impedance sweeps

---

## Known Issues

### WinISD Fsc Discrepancy
**Status:** INVESTIGATING

Our Fc ≈ 29 Hz for UM18-22/330L, WinISD shows Fsc ≈ 68.73 Hz.

**Hypothesis:** Different parameter definition (Fsc ≠ Fc?)

**Impact:** LOW - Our Qtc matches WinISD (0.702 vs 0.707), so calculations are correct

**Priority:** Need to understand what WinISD's "Fsc" represents

See: `/FSC_INVESTIGATION.md`

---

### Excursion Calculator Accuracy
**Status:** ACKNOWLEDGED

Current implementation uses simplified empirical factor (15×).

**Issue:** Not matching WinISD excursion values

**Fix:** Phase 2 - Implement proper impedance-based calculation

**Impact:** MEDIUM - Affects max power curve accuracy

---

### SC4/C4 Alignments
**Status:** INCOMPLETE

Thiele 1971 defines these alignments but formulas need verification.

**Impact:** LOW - Less commonly used than QB3

**Priority:** Complete during Phase 2 ported box work

---

## Design Principles

### Adding New Features

**Required:**
1. Source paper with equation numbers
2. Citation in CITATIONS.md
3. Tests with known correct values
4. SI units only (m³, Hz, Pa, etc.)
5. Raw number returns (no objects/metadata)
6. Clear documentation

**Forbidden:**
1. Reverse-engineered formulas
2. "Magic numbers" without citations
3. Convenience features (those go in speakerphysics/)
4. Application logic
5. Unit conversions (liters, mm, etc.)

### Code Structure

```javascript
/**
 * Brief description
 *
 * Formula: Mathematical formula
 *
 * Source: Author Year, Paper Title
 *         Journal, Vol, Page, Equation Number
 *
 * @param {number} param - Description (units)
 * @returns {number} Description (units)
 */
export function calculateSomething(param) {
    // Implementation with comments
    return result;
}
```

---

## Version History

- 2025-11-01: Foundation created with core Thiele-Small equations
- 2025-11-01: Phase 2 roadmap defined (impedance, Klippel, Roozen)
- 2025-11-01: Phase 3 extensions planned (baffle step, thermal, Le)
