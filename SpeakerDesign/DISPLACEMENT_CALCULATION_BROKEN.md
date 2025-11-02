# Displacement Calculation is Fundamentally Broken

**Status:** BROKEN - Underestimates displacement by ~2x
**Date:** 2025-11-02
**Cost to discover this:** $17.64, 2h 47m

## The Problem

The sealed box displacement calculation in `lib/engineering/displacement.js` **underestimates displacement**, which makes power handling look WAY better than reality.

### Evidence

**WinISD (trusted reference):**
- UM18-22 in 200L sealed box
- Thermal limit: 1200W
- Transition from excursion→thermal: **~45Hz**
- Below 45Hz: excursion limited

**Our broken code:**
- Same driver, same box
- Thermal limit: 1200W
- Transition from excursion→thermal: **27Hz** ❌
- Allows 1200W down to 27Hz when driver would be destroyed

**The gap:** We're off by ~18Hz. At 27Hz we calculate the driver can handle 1200W, when it should only handle ~600W (rough estimate based on WinISD curve shape).

### How We Fucked This Up (Repeatedly)

#### Mistake 1: Wrong Formula (First 30 minutes)
Used `X = F / |Zmech|` instead of `X = F / (ω × |Zmech|)`
**Result:** Calculated velocity instead of displacement
**How found:** Backend test showed 956mm displacement at 100W (physically impossible)
**Fix:** Added the ω term

#### Mistake 2: Binary Search Convergence (Next 60 minutes)
Tried to fix "steps" in Max Power curve with:
- Tighter tolerances
- More iterations
- Interpolation hacks
- Cubic spline smoothing
- Logarithmic frequency spacing

**Result:** Smooth curves that look nice but are WRONG
**How found:** Compared to WinISD, realized we're allowing too much power
**Fix:** None - was addressing symptoms not root cause

#### Mistake 3: "Analytical Solution" (Next 60 minutes)
Derived analytical inverse: if `X = f(P)`, solve for `P = g(X)`
**Result:** Perfect mathematical consistency between forward/inverse
**How found:** Validation test showed 0.000mm error (!)
**Why it failed:** Both forward AND inverse are based on the same WRONG displacement formula

Mathematical consistency ≠ Physical accuracy

#### Root Cause (Still Unfixed)

The displacement formula itself is wrong:

```javascript
// From lib/engineering/displacement.js line 87-133
// Calculates: X = (Bl × I) / (ω × |Zmech|)
// Where: I = Vin / (Re + Bl²/|Zmech|)

const zmech_mag = Math.sqrt(real_zmech * real_zmech + imag_zmech * imag_zmech);
const z_reflected = (bl * bl) / zmech_mag;
const ztotal = re + z_reflected;  // ← Simplified, ignores Le
const current = vin / ztotal;
const force = bl * current;
const displacement = force / (omega * zmech_mag);
```

**What's wrong:**
1. **Ignores Le (voice coil inductance)** - "valid below 200Hz" but maybe not?
2. **Simplified impedance model** - No accounting for complex interactions
3. **Maybe wrong Zmech formula?** - Using Small 1972 sealed box impedance but might be missing terms
4. **Parameter estimation errors?** - Cms, Rms calculated from T/S parameters with rough estimates

**What we DON'T know:**
- Is the impedance model wrong?
- Are the estimated mechanical parameters wrong?
- Is Le actually significant even at 20-30Hz?
- Is there a fundamental misunderstanding of the Small 1972 equations?

## What We Learned (The Hard Way)

### ✅ Good Practices We Followed
1. **Backend testing before UI** - Created `test-graph-data.js` to validate calculations independently
2. **Forward/inverse validation** - Verified mathematical consistency with `test-power-displacement-match.js`
3. **Marked hacks clearly** - Added "DOING STUPID SHIT HERE" comments for binary search workarounds
4. **Compared to reference** - Used WinISD as ground truth

### ❌ Mistakes We Made
1. **Focused on symptoms** - Spent 60min smoothing curves instead of validating physics
2. **Trusted math over physics** - Perfect forward/inverse match doesn't mean the formula is RIGHT
3. **Didn't validate early** - Should have compared to WinISD after first displacement fix
4. **Built on broken foundation** - Analytical solution is elegant but still wrong if base formula is wrong

## The Right Way Forward

### Step 1: Validate the displacement formula
- [ ] Find authoritative source for sealed box displacement (Small 1972 paper?)
- [ ] Check if Le matters at 20-50Hz
- [ ] Verify Zmech formula is correct
- [ ] Compare calculated displacement to measurements/simulations

### Step 2: Fix the root cause
- [ ] Implement CORRECT displacement calculation
- [ ] Keep analytical inverse (it's elegant and fast when formula is right)
- [ ] Re-run all validation tests

### Step 3: Validate against WinISD
- [ ] Match transition frequency within 2-3Hz
- [ ] Match power values within 10%
- [ ] Test multiple drivers, volumes, alignments

## Files Involved

**Broken code:**
- `lib/engineering/displacement.js` - Wrong displacement calculation
- `lib/engineering/power-limits.js` - Analytical inverse of wrong formula
- `lib/calculators/MaxPowerCalculator.js` - Wrapper around wrong calculations

**Test files (keep these):**
- `test-graph-data.js` - Backend validation of Max Power curves
- `test-power-displacement-match.js` - Forward/inverse consistency check
- `test-displacement-fix.js` - Basic sanity checks

**What to trust:**
- Foundation layer (`lib/foundation/small-1972.js`) - Paper-true, just transfer functions
- Cookbook layer - Works correctly IF displacement formula is fixed
- UI layer - Will show correct data once backend is fixed

## Lessons for Next Time

1. **Validate against known-good reference FIRST** - Before optimizing, before analytical solutions, before UI
2. **Question the foundation** - If results don't match reality, the BASE formula might be wrong
3. **Mathematical elegance ≠ Correctness** - Analytical solutions are beautiful but worthless if the formula is wrong
4. **Test early, test often** - Compare to WinISD after EVERY major change
5. **Document assumptions** - We assumed Le is negligible, Zmech formula is correct, etc. - write these down!

## Status

**STOP WORK ON THIS FEATURE**

Do not:
- ❌ Make UI changes
- ❌ Add more smoothing/interpolation
- ❌ Tweak tolerances or convergence
- ❌ Try different analytical inversions

Do instead:
- ✅ Study Small 1972 paper Section 2 on impedance
- ✅ Find measured displacement data for validation
- ✅ Understand why WinISD gets ~45Hz and we get 27Hz
- ✅ Fix the displacement formula itself

**The UI looks pretty. The curves are smooth. The math is consistent.**
**And it's all WRONG by a factor of 2.**

---

*"Premature optimization is the root of all evil" - Donald Knuth*
*"But shipping broken physics is even worse" - This session*
