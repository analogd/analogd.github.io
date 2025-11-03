# Reference Validation Test Suite

This directory contains **canary tests** that validate our loudspeaker calculations against WinISD Pro as a reference.

## Purpose

These tests exist to prevent us from:
1. **Chasing UI problems** when the math is broken
2. **Breaking physics** while optimizing curves
3. **Shipping wrong calculations** that look pretty but are dangerously incorrect

## Structure

```
test-references/
  winisd/                           # Reference data from WinISD
    um18-22-sealed-200L/           # Test case 1: Sealed box
      driver-params.json            # Exact T/S parameters used
      expected-values.json          # Hard numbers extracted from WinISD
      screenshot-*.png              # Visual reference (to be added)
    um18-22-ported-500L-25Hz/      # Test case 2: Ported box
      ...
  reference-validation.test.js     # The actual test runner
```

## Running Tests

```bash
node test-references/reference-validation.test.js
```

**Expected output:**
```
✅ ALL TESTS PASSED
```

**If tests fail:**
```
❌ TEST FAILED
Power at 20Hz FAILED: 623W vs 450 ±50 (diff: 173W)
```

## What Gets Tested

### 1. System Parameters
- **F3** (-3dB frequency)
- **Qtc** (total Q of sealed system)
- **Fb** (port tuning for ported)

### 2. Max Power Handling
- Power at key frequencies (10, 20, 30, 40, 50 Hz)
- Limiting factor (excursion vs thermal)
- Thermal transition frequency

### 3. Physics Constraints
- **Monotonicity**: Power increases with frequency
- **Xmax validation**: Excursion-limited points should produce displacement ≈ Xmax
- **Thermal limit**: Should equal Pe at flat region
- **Sealed vs Ported**: Ported should handle more power at low freq

### 4. Comparative Tests
- Sealed vs Ported transition frequency
- Displacement behavior near port tuning
- Excursion null in ported designs

## Tolerances

We use **realistic tolerances** because:
- WinISD uses approximations
- We use Small's exact equations
- Parameter estimation has uncertainty
- Perfect match is impossible

**Default tolerances:**
- Power: ±10% or ±50W (whichever is larger)
- Frequency: ±3Hz
- SPL: ±2dB

**DO NOT loosen tolerances to make tests pass.**
**Fix the underlying calculations instead.**

## Adding New Reference Cases

1. **Choose a driver + configuration**
   ```
   Example: Dayton RSS390HO-4 in 100L sealed
   ```

2. **Create directory structure**
   ```bash
   mkdir -p test-references/winisd/rss390-sealed-100L
   ```

3. **Run WinISD simulation**
   - Load driver T/S parameters
   - Configure box (type, volume, tuning)
   - Generate graphs: Max Power, Max SPL, Frequency Response
   - Take screenshots

4. **Extract data**
   - Create `driver-params.json` with exact T/S used
   - Create `expected-values.json` with measurements from graphs
   - Save screenshots as `screenshot-*.png`

5. **Add test case**
   - Update `reference-validation.test.js` to load new case
   - Run test to verify

## Known Issues

### Current Status (2025-11-02)

**Sealed Box (UM18-22, 200L):**
- ❌ FAILING - Transition at 27Hz vs WinISD 45Hz
- ❌ Displacement underestimated by ~2x
- ❌ Allows 1200W at 27Hz when should be 600W

**Root cause:** Displacement formula in `lib/engineering/displacement.js` is wrong.

See `../DISPLACEMENT_CALCULATION_BROKEN.md` for full analysis.

**Ported Box (UM18-22, 500L @ 25Hz):**
- ⏭ NOT YET TESTED - Reference data not collected

## Philosophy

> "If you can't measure it, you can't improve it."
> - Peter Drucker (but for loudspeaker simulation)

These tests are our **ground truth**. They tell us:
- ✅ Math is correct → Ship it
- ❌ Math is wrong → Fix it before touching UI

**No more:**
- "Does this curve look smooth enough?"
- "Maybe if we add more frequency points..."
- "Let's try cubic interpolation..."

**Instead:**
- "Does it match WinISD within tolerance?"
- Yes → Done
- No → Fix displacement formula

## Future Improvements

- [ ] Add more reference cases (different drivers, volumes, alignments)
- [ ] Add frequency response validation
- [ ] Add impedance curve validation
- [ ] Add group delay validation
- [ ] Automate screenshot comparison (visual diff)
- [ ] CI integration - fail builds if tests fail

## References

- **WinISD Pro 0.7.0.950** - Industry standard sealed/ported box design software
- **Small 1972/1973 Papers** - Theoretical foundation we're implementing
- **Driver Datasheets** - Source of T/S parameters
