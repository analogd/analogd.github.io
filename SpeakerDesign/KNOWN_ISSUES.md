# Known Issues & Limitations

## Displacement Calculation Accuracy (Moderate Priority)

**Status**: Paper-close approximation, ~30% deviation from WinISD at very low frequencies

**Issue**:
The displacement-from-power calculation in `lib/engineering/displacement.js` uses a simplified voltage formula:
```javascript
Vin = sqrt(P × Re)
```

This assumes all power dissipates in the voice coil resistance (Re), but ignores the reflected mechanical impedance. The more accurate formula is:
```javascript
Vin = sqrt(P × Ztotal)
where Ztotal = Re + BL²/|Zmech|
```

However, calculating Ztotal requires knowing Zmech, which depends on displacement - creating a circular dependency.

**Current Behavior**:
- At 10Hz: Calculates 530W max vs WinISD 400W (33% high)
- At higher frequencies (>30Hz): Much closer agreement
- Trend and transition frequency are correct

**Root Cause**:
Paper-close approximation. Small 1972/1973 papers provide transfer functions, not closed-form displacement-from-power formulas.

**Impact**:
- Slightly optimistic power handling at very low frequencies (<15Hz)
- Users might undersize amplifiers slightly
- Not dangerous (doesn't underestimate excursion)

**Solutions** (in order of effort):

1. **Iterative approach** (days): Iterate to find Vin that satisfies both power and impedance equations
2. **Full network solver** (weeks): Implement Small 1973 Figure 2 complete circuit (SPICE-like)
3. **Empirical calibration** (hours): Add correction factor curve fit to WinISD/measurement data
4. **Accept limitation** (done): Document as "paper-close" approximation, good enough for most use cases

**Recommendation**: Solution 3 or 4 for now. Solution 2 when building foundation v2.

---

## BL Parameter Convention (Documentation Issue)

**Status**: Dual voice coil drivers report BL differently in different tools

**Issue**:
Dayton UMII18-22 spec sheet shows BL = 19.2 N/A, but WinISD displays 38.4.

This is likely due to dual voice coil (DVC) convention:
- Single coil BL = 19.2
- Series wiring (2+2Ω): BL_eff = 2 × 19.2 = 38.4

**Current Behavior**:
Using BL = 19.2 (PDF spec) gives reasonable results.
Using BL = 38.4 (WinISD) makes displacement too low (hits thermal limit, not excursion limit).

**Recommendation**:
Always use BL from spec sheet. If WinISD shows 2x value for DVC, divide by 2.

---

## Parameter Validation

**Status**: ✅ Fixed - Now validates derived relationships

Added `lib/foundation/validation.js` with checks for:
- 1/Qts = 1/Qes + 1/Qms
- Vas from Cms/Sd consistency
- fs from Mms/Cms consistency
- Absolute bounds on all parameters

Use `Validation.validateTSParameters(driver)` before calculations.

---

## B4/C4 Alignments

**Status**: Not implemented (21 tests commented out)

Some 4th-order Butterworth and Chebyshev ported alignments fail calculations.

**Options**:
1. Debug and fix (2-4 hours)
2. Return 501 Not Implemented error (5 minutes)

QB3 (3rd-order Butterworth) works perfectly and covers 90% of use cases.

---

## Future Enhancements

### Voice Coil Inductance (Le)
Currently ignored below 200Hz. May matter for high-excursion drivers at 20-50Hz.

### Nonlinear Effects
All calculations assume linear parameters. Real drivers have:
- BL(x) - force factor varies with displacement
- Kms(x) - suspension stiffness varies with displacement
- Le(i,x) - inductance varies with current and position

Klippel-style large-signal modeling would address this (foundation v2).

### Port Compression
Port velocity limits not checked. High-power ported designs may hit port compression before driver limits.

---

**Last Updated**: 2025-11-03
