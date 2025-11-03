# Design Philosophy - Formula-First Architecture

## Core Principle

**The backend should think in FUNCTIONS, not data points.**

```javascript
// ❌ WRONG - Point-based thinking
const power10Hz = calculatePowerAt(10);
const power20Hz = calculatePowerAt(20);
// → Forces interpolation, loses mathematical properties

// ✅ RIGHT - Function-based thinking
function maxPower(frequency) {
    return calculateMaxPower(frequency);
}
// → Can evaluate at ANY frequency, UI samples as needed
```

---

## Why This Matters

### 1. Tests, UI, and Verification Pull Same Direction

**Current state**: Different code paths
```javascript
// Test suite
const power = calculatePowerAt(20);  // Point evaluation

// UI
const curve = generatePowerCurve([10, 20, 30, ...]);  // Batch evaluation

// WinISD comparison
const points = extractFromGraph([...]);  // Fixed points
```

**Problem**: Three different "truths" - hard to keep in sync.

**Solution**: Single source of truth
```javascript
// Backend exposes pure function
export function maxPower(frequency, driver, box) {
    // Small 1972/1973 equations evaluated at f
    return calculateDisplacement(f) < xmax
        ? thermalPower
        : excursionLimitedPower(f);
}

// Tests evaluate at specific points
assert(maxPower(20, driver, box) === 450); ✓

// UI samples for plotting
const curve = frequencies.map(f => maxPower(f, driver, box)); ✓

// WinISD comparison evaluates at THEIR frequencies
winisdFreqs.forEach(f => compare(maxPower(f), winisdValue(f))); ✓
```

**All three use the SAME calculation → guaranteed consistency.**

---

## 2. Graphs ARE the API

The end user sees graphs. Therefore:

**Backend should OUTPUT functions ready to graph**

```javascript
// ✅ Backend returns function
const design = designSealedBox(driver, 'butterworth');

design.maxPower = (frequency) => { /* formula */ };
design.response = (frequency) => { /* Small 1972 Eq 13 */ };
design.excursion = (frequency, power) => { /* displacement */ };

// UI decides sampling
const plotPoints = logSpace(10, 200, 100);  // 100 points, log scale
const curve = plotPoints.map(f => design.maxPower(f));

// Tests evaluate at exact points
assert(design.maxPower(22) === expectedFsResponse);

// WinISD comparison uses their frequencies
const winisdComparison = winisdFreqs.map(f => ({
    freq: f,
    ours: design.maxPower(f),
    winisd: winisdData[f],
    error: Math.abs(design.maxPower(f) - winisdData[f])
}));
```

**Benefits**:
- No interpolation errors
- Tests validate exact formulas
- UI can zoom/resample without backend changes
- WinISD comparison uses their exact frequencies
- Future APIs can expose functions directly

---

## 3. Formula-Based Y(f) Not Interpolation

### The Anti-Pattern: Pre-sampled Arrays

```javascript
// ❌ Backend does sampling
const powerCurve = {
    frequencies: [10, 15, 20, 25, 30, ...],  // Fixed grid
    powers: [400, 420, 450, 550, 700, ...]   // Interpolate between?
};

// Problems:
// - What if UI wants 100 points? 1000 points? Different range?
// - What if test needs value at 22.5 Hz? Interpolate?
// - What if WinISD uses different frequencies? Interpolate?
// - Interpolation adds error on top of formula error
```

### The Pattern: Pure Functions

```javascript
// ✅ Backend exposes formula
const powerFormula = (f) => {
    const x = calculateDisplacement(f, power);
    return x < xmax ? pe : solveForPowerAtXmax(f);
};

// Caller decides resolution
const lowRes = [10, 20, 30, 40, 50].map(powerFormula);
const highRes = linspace(10, 50, 1000).map(powerFormula);
const testPoint = powerFormula(22.5);  // Exact, no interpolation
```

**Mathematical truth**: Small 1972/1973 give continuous functions f → P(f).
Our code should reflect this mathematical reality.

---

## 4. Architecture Alignment

### Current Structure (Good Start)

```
Foundation → Engineering → Cookbook
(formulas)   (approx)      (workflows)
```

**Foundation**: Already formula-based ✓
```javascript
calculateResponseDb(frequency, fc, qtc);  // Pure function of f
```

**Engineering**: Currently point-based ❌
```javascript
generateMaxPowerCurve(params, frequencies);  // Takes frequency array
```

**Cookbook**: Returns mixed data ⚠️
```javascript
{
    powerLimits: {
        fullCurve: [...],  // Array of points
        at20Hz: 450,       // Specific point
    }
}
```

### Target Structure

```
Foundation → Engineering → Cookbook
(f → y)      (f → y)       (workflows return functions)
```

**Engineering**: Formula-based
```javascript
export function createMaxPowerFunction(params) {
    return (frequency) => {
        // Calculate at this specific frequency
        return /* formula evaluation */;
    };
}
```

**Cookbook**: Returns functions + convenience samples
```javascript
{
    maxPower: (f) => { /* formula */ },  // Function

    // Optional: Pre-sampled for convenience
    maxPowerCurve: {
        sample: (frequencies) => frequencies.map(maxPower),
        default: maxPower.sample(logspace(10, 200, 100))
    }
}
```

---

## 5. Benefits for WinISD Comparison

**Current workflow** (painful):
1. WinISD generates graph with their frequency grid
2. We extract points manually from screenshot
3. We generate curve with OUR frequency grid
4. Try to interpolate/match grids for comparison
5. Interpolation adds error

**Formula-first workflow** (clean):
1. WinISD generates graph at frequencies [f1, f2, f3, ...]
2. We extract points from screenshot
3. **We evaluate our formula at THEIR frequencies**
4. Direct comparison, zero interpolation error

```javascript
// WinISD data
const winisd = {
    frequencies: [10, 15, 20, 25, 30, 35, 40, 45, 50],
    maxPower: [400, 420, 450, 550, 700, 900, 1100, 1200, 1200]
};

// Our formula
const ourFormula = createMaxPowerFunction(driver, box);

// Compare at THEIR frequencies
const comparison = winisd.frequencies.map(f => ({
    frequency: f,
    winisd: winisd.maxPower[winisd.frequencies.indexOf(f)],
    ours: ourFormula(f),  // Exact evaluation, no interpolation
    error: Math.abs(ourFormula(f) - winisd.maxPower[...])
}));
```

---

## 6. Implementation Strategy

### Phase 1: Refactor Engineering Layer (Days)

Change from:
```javascript
function generateMaxPowerCurve(params, frequencies) {
    return frequencies.map(f => ({
        frequency: f,
        maxPower: calculate(f, params)
    }));
}
```

To:
```javascript
function createMaxPowerFunction(params) {
    return (frequency) => {
        const displacement = calculateDisplacement(frequency, params.pe, params);
        return displacement < params.xmax
            ? params.pe
            : solveForPowerAtXmax(frequency, params);
    };
}

// Convenience wrapper for batch evaluation
function sampleFunction(fn, frequencies) {
    return frequencies.map(f => ({ frequency: f, value: fn(f) }));
}
```

### Phase 2: Update Cookbook Layer (Hours)

```javascript
export function designSealedBox(driver, alignment, options) {
    // ... existing parameter calculations ...

    const maxPowerFn = Engineering.createMaxPowerFunction(params);
    const responseFn = (f) => Small1972.calculateResponseDb(f, fc, qtc);
    const excursionFn = (f, power) => Engineering.calculateDisplacement(f, power, params);

    return {
        // Functions (primary API)
        maxPower: maxPowerFn,
        response: responseFn,
        excursion: excursionFn,

        // Convenience samples (backward compat)
        maxPowerCurve: Engineering.sample(maxPowerFn, logspace(10, 200, 100)),
        responseCurve: Engineering.sample(responseFn, logspace(10, 200, 100)),

        // Box parameters (unchanged)
        box: { volume, fc, qtc, f3 }
    };
}
```

### Phase 3: Update Tests (Hours)

```javascript
// Old style - testing array
test('sealed max power curve', () => {
    const design = designSealedBox(...);
    const at20Hz = design.powerLimits.fullCurve.find(p => p.frequency === 20);
    assert(at20Hz.maxPower, 450);  // Fragile - depends on sampling
});

// New style - testing function
test('sealed max power at specific frequencies', () => {
    const design = designSealedBox(...);
    assert.closeTo(design.maxPower(20), 450, 50);  // Exact evaluation
    assert.closeTo(design.maxPower(45), 1200, 100);
});
```

### Phase 4: Update Tools/Verification (Hours)

```javascript
// tools/export-calculation-data.js
const design = designSealedBox(driver, 'custom', { volume: 200 });

// Export for plotting
const data = {
    // Function metadata
    type: 'maxPower',
    unit: 'W',

    // Sample at WinISD's frequencies for comparison
    calculated: winisdFreqs.map(f => ({
        frequency: f,
        value: design.maxPower(f)  // Exact, no interpolation
    })),

    // Also export high-res for smooth curves
    plotCurve: logspace(10, 200, 500).map(f => ({
        frequency: f,
        value: design.maxPower(f)
    }))
};
```

---

## 7. UI Benefits

**Responsive zooming**:
```javascript
// User zooms to 20-30 Hz range
const zoomedFreqs = linspace(20, 30, 100);  // High density in zoom
const zoomedCurve = zoomedFreqs.map(design.maxPower);
// No backend call needed, just resample the function
```

**Interactive cursor**:
```javascript
// User hovers at 27.3 Hz
const powerAt27_3 = design.maxPower(27.3);  // Exact value, not interpolated
showTooltip(`${powerAt27_3.toFixed(0)}W @ 27.3Hz`);
```

**Compare multiple configs**:
```javascript
const sealed200 = designSealedBox(driver, 'butterworth', { volume: 200 });
const sealed300 = designSealedBox(driver, 'butterworth', { volume: 300 });

// Plot both on same frequencies for fair comparison
const freqs = logspace(10, 200, 100);
plotLines([
    { label: '200L', data: freqs.map(sealed200.maxPower) },
    { label: '300L', data: freqs.map(sealed300.maxPower) }
]);
```

---

## Summary

**Design Principle**: Backend exposes CONTINUOUS FUNCTIONS, not discrete points.

**Benefits**:
1. ✅ Tests validate exact formulas
2. ✅ UI samples as needed (zoom, resolution, range)
3. ✅ WinISD comparison uses their frequencies (no interpolation error)
4. ✅ Future APIs can expose functions directly
5. ✅ Mathematical truth: Small 1972/1973 give f → y functions
6. ✅ Single source of truth across tests/UI/verification

**Implementation**: Refactor engineering layer to return functions instead of arrays. Provide convenience wrappers for sampling.

**This aligns tests, UI, and verification around the same mathematical truth: our loudspeaker functions are f → y, just like the papers describe them.**

---

**Next**: Refactor `lib/engineering/power-limits.js` to return function factories instead of curve generators?
