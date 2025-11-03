# WinISD Verification Plan

## Status: Ready for WinISD Data Collection

### What We Know

**Sealed 200L**: ~33% high power at 10Hz, converges at higher frequencies
**Ported 600L**: ⚠️ **BROKEN** - shows 9x less power than sealed at 10Hz (should be MORE)

---

## Data Collection Steps

### 1. WinISD Sealed 200L (Already Started)

**Setup**:
- Driver: UMII18-22 (params in `winisd/um18-22-sealed-200L/driver-params.json`)
- Volume: 200 L
- Signal: 1200W

**Graphs Needed**:
- ✅ Maximum Power (partial data extracted)
- ⏳ Maximum SPL
- ⏳ Frequency Response
- ⏳ Cone Excursion at 1200W

**Extract**:
- Power limits at: 10, 15, 20, 25, 30, 35, 40, 45, 50 Hz
- Thermal transition frequency
- F3, Qtc
- Displacement at key frequencies

---

### 2. WinISD Ported 600L @ 25Hz (NEW)

**Setup**:
- Driver: Same UMII18-22
- Volume: 600 L
- Tuning: 25 Hz
- Signal: 1200W

**Critical Measurements**:
1. **Power at 10Hz** - Should be HIGHER than sealed (not lower!)
2. **Power at 25Hz (Fb)** - Should be thermal limited (1200W) due to excursion null
3. **Displacement at 25Hz** - Should be MINIMUM (< 5mm even at high power)
4. **Thermal transition** - Should be ~20-25 Hz (earlier than sealed's 45Hz)

**Graphs Needed**:
- Maximum Power vs Frequency
- Maximum SPL vs Frequency
- Frequency Response
- Cone Excursion vs Frequency (at 1200W) ⭐ CRITICAL
- Port Velocity vs Frequency (at 1200W)

---

## What This Will Reveal

### Sealed Displacement Formula

**Current error**: 530W vs 400W at 10Hz (33% high)

**Possible causes**:
- V = √(P×Re) simplification (vs V = √(P×Ztotal))
- BL convention issue (19.2 vs 38.4)
- Rms calculation
- Cms estimation

**WinISD data will show**:
- Is error consistent across frequencies? → Systematic formula issue
- Does error scale with frequency? → Impedance model problem
- Is Xmax at power limit correct? → Validates displacement magnitude

---

### Ported Displacement Correction

**Current behavior**: BACKWARDS - ported shows LESS power than sealed

**Expected from WinISD**:
```
         Our Code              WinISD Expected
10Hz:    58W (ported)         ~600W (ported should win)
15Hz:    619W (ported)        ~900W (ported should win)
20Hz:    1200W (both)         ~1200W (ported near thermal)
25Hz:    1200W (both)         1200W (excursion null at Fb)
```

**If WinISD confirms ported > sealed at 10-20Hz**:
→ Our transfer-function-based correction (h_sealed/h_ported)^0.8 is fundamentally wrong
→ Need full network solver to properly account for port loading

**If WinISD shows ported < sealed** (unlikely):
→ Something deeper wrong with our understanding

---

## Decision Tree After Data

### Scenario A: Both Off by ~30% (Same Direction)

**Interpretation**: Voltage formula V=√(P×Re) limitation affects both equally

**Action**:
1. Document as known limitation
2. Add empirical correction factor: `P_corrected = P_calculated / 1.33`
3. Ship with caveat

---

### Scenario B: Sealed Off 30%, Ported MUCH Worse

**Interpretation**: Transfer function correction is wrong

**Action**:
1. ⚠️ Disable ported power limits (return error or null)
2. Implement proper network solver for ported
3. Ship sealed only for now

---

### Scenario C: Both Match WinISD Well

**Interpretation**: Test parameters or WinISD setup was wrong

**Action**:
1. Verify all parameters triple-checked
2. Ship as-is with confidence

---

## After Verification

### If Sealed OK, Ported Broken:

**Short-term** (hours):
- Disable ported power limits in UI
- Show warning: "Power limits available for sealed boxes only"
- Return null or error for ported power calculations

**Medium-term** (weeks):
- Implement Small 1973 Figure 2 network solver
- Properly calculate Zmech with port loading
- Re-validate against WinISD

**Documentation**:
```javascript
// lib/engineering/displacement.js
export function calculatePortedDisplacementFromPower(params) {
    throw new Error(
        'Ported displacement calculation under development. ' +
        'Current transfer-function approximation does not properly ' +
        'account for port loading. Use sealed calculations or full ' +
        'network solver. See KNOWN_ISSUES.md'
    );
}
```

---

### If Both Need Work:

**Prioritize**:
1. Fix sealed (used more often, closer to working)
2. Implement iterative voltage solver: P×Ztotal instead of P×Re
3. Then tackle ported network solver

---

## Success Criteria

**Minimum (Ship)**:
- ✅ Sealed within 20% across 15-50 Hz
- ✅ Ported disabled or clearly marked "beta"

**Good (Confident)**:
- ✅ Sealed within 15% across 10-50 Hz
- ✅ Ported shows excursion null (qualitative)
- ✅ Both thermal transitions within ±5 Hz

**Excellent (No caveats)**:
- ✅ Both within 10% across all frequencies
- ✅ Excursion null quantitatively accurate
- ✅ Transitions within ±3 Hz

---

## Next Steps

1. **You**: Run WinISD simulations, extract data, fill `expected-values.json` files
2. **Me**: Analyze discrepancies, decide on fixes
3. **Together**: Either ship with docs or fix critical issues first

Ready when you are! 🚀
