# Fsc Investigation - WinISD vs Our Calculations

**Status**: CRITICAL DISCREPANCY - Needs Resolution
**Date**: 2025-11-01

## The Problem

For UMII18-22 in 330L sealed box (Butterworth alignment):

| Parameter | Our Calculation | WinISD Shows | Ratio |
|-----------|----------------|--------------|-------|
| Fc (system resonance) | 29.12 Hz | - | - |
| F3 (-3dB point) | 29.35 Hz | - | - |
| Qtc | 0.702 | 0.707 | ✅ Match |
| **Fsc** | ??? | **68.73 Hz** | **2.36x** |

## Our Calculations (Verified)

Using Small 1972 equations:

```
Driver Parameters:
- Fs = 22.0 Hz (free-air resonance)
- Qts = 0.530
- Vas = 248.2 L

Box:
- Vb = 330 L (Butterworth volume)

Calculations:
- α = Vas / Vb = 248.2 / 330 = 0.752
- Qtc = Qts × √(α+1) = 0.530 × √(1.752) = 0.702 ✅
- Fc = Fs × √(α+1) = 22.0 × √(1.752) = 29.12 Hz
- F3 = Fc / √(... formula ...) = 29.35 Hz
```

**Confidence in our Fc calculation**: HIGH
- Equation is standard (Small 1972)
- Qtc matches WinISD (0.702 vs 0.707) ✅
- Test suite validates the formula

## What Could "Fsc" Be?

### Hypothesis 1: Different Parameter Entirely
WinISD's "Fsc" might not be the system resonance frequency at all. It could be:
- System cutoff frequency (different calculation?)
- F6 (-6dB point) instead of F3?
- Some proprietary WinISD parameter?

### Hypothesis 2: Different Alignment
Could WinISD be calculating Fsc for a different alignment?
- But we confirmed Qtc matches (0.707)
- So it's definitely the same Butterworth alignment

### Hypothesis 3: Parameter Confusion
Could there be confusion in what parameters mean?
- Our Fc is closed-box resonance (29 Hz) ✅
- WinISD's Fsc might be something else entirely

### Hypothesis 4: Half-Space vs Full-Space
Could this be related to baffle step or room loading?
- 2.36x is oddly close to 2.4 (one octave)
- But baffle step doesn't work that way

### Hypothesis 5: WinISD Bug or Different Model
- WinISD might use a different model
- Or there's a unit conversion issue?

## What We Need

1. **WinISD Screenshot** showing what "Fsc" field means
   - Where does this value appear in WinISD?
   - What's the label/context?

2. **WinISD Documentation** for "Fsc" parameter
   - What does WinISD define as "Fsc"?
   - Is it different from "Fc"?

3. **Comparison with Other Tools**
   - BassBox Pro
   - Hornresp
   - Online calculators

4. **Thiele 1971 Paper** - Verify standard definitions
   - What's the canonical definition of system resonance?
   - Are there multiple "system frequencies"?

## Test Results

Our SealedBox tests all pass:
- ✅ Alpha calculation matches theory
- ✅ Fc calculation matches Small 1972
- ✅ Qtc calculation matches theory (and WinISD!)
- ✅ F3 calculation for Butterworth (F3 ≈ Fc) ✅

**Key Insight**: Our Qtc matches WinISD's Qtc (0.702 vs 0.707), so we're using the same driver parameters and box volume. The formulas are working correctly.

## Possible Resolutions

### If WinISD's Fsc ≠ System Resonance Fc
- No problem with our code
- Need to understand what Fsc means
- Document the difference

### If WinISD's Fsc = System Resonance Fc
- We have a fundamental error
- Need to find the correct formula
- But this seems unlikely given Qtc matches

### If It's a Different F3 Definition
- Perhaps WinISD uses a different cutoff criteria
- F6 instead of F3?
- Or includes room gain?

## Action Items

1. ⏸️  Get WinISD screenshot showing "Fsc" field with label
2. ⏸️  Check what frequency WinISD shows for F3 (-3dB point)
3. ⏸️  Compare WinISD's frequency response graph with our calculations
4. ⏸️  Test with a different driver to see if ratio is consistent
5. ⏸️  Search WinISD documentation/forums for "Fsc" definition

## Current Status

**Safe to proceed**: YES
- Our formulas are validated against theory
- Qtc matches WinISD ✅
- Core calculations are sound

**Impact on app**: LOW for now
- Users won't know about Fsc unless they use WinISD
- Our Fc and F3 are theoretically correct
- All tests pass

**Priority**: MEDIUM-HIGH
- Could indicate fundamental misunderstanding
- Or could be naming confusion
- Need to understand for proper validation

## Notes

From SESSION_SUMMARY.md:
```
**WinISD Fsc vs Our Fc:**
- Our Fc (UMII18-22/330L): 29.1 Hz
- WinISD Fsc: 68.73 Hz
- Status: INVESTIGATING
- Hypothesis: Different parameters (Fsc ≠ Fc?)
```

The fact that Qtc matches perfectly suggests our underlying calculations are correct. The discrepancy is likely in what "Fsc" means versus what we're calling "Fc".
