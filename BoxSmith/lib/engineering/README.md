# Engineering Layer - "Paper-Close" Approximations

## Purpose

This layer contains **paper-close engineering approximations** - validated solutions
that respect the physics from published papers but provide practical implementations
where papers give circuit topologies instead of closed-form equations.

## Philosophy: "Paper-Close"

**Paper-true** (foundation/): Direct implementation of published equations
- Example: Small 1972 Equation 13 → `calculateResponseDb()`
- Criterion: Can cite exact equation number

**Paper-close** (engineering/): Respects paper physics, bridges practical gaps
- Example: Displacement from Small 1973 Figure 2 equivalent circuit
- Criterion: Validated against physics, but no single equation to cite

**Models** (models/): Validated domain objects, user-friendly API
- Example: `SealedBox.butterworth(driver)`
- Criterion: Wraps foundation + engineering, provides object-oriented interface

## Why This Layer Exists

Some acoustics problems require solving complex networks that don't have
closed-form solutions in the literature:

- **Small 1973 Figure 2**: Shows electrical-mechanical-acoustical circuit but
  doesn't provide displacement equation - requires network solver
- **Klippel 2004**: Describes large-signal parameter measurement but not the
  forward calculation of distortion from parameters
- **Port chuffing**: Empirically known (~15-20 m/s limit) but no exact formula

Rather than:
- ❌ Pollute foundation/ with non-paper equations
- ❌ Leave functionality unimplemented
- ❌ Use "magic numbers" without explanation

We provide paper-close approximations with:
- ✅ Clear documentation of physics basis
- ✅ Explanation of what's approximated and why
- ✅ Test coverage showing accuracy vs known data
- ✅ TODO markers for future paper-true implementations

## Layer Comparison

```
┌─────────────────────────────────────────────────────────────┐
│ Foundation Layer (lib/foundation/)                          │
│ • Direct equation implementations                           │
│ • Every function cites paper + equation number              │
│ • Example: Small 1972, Eq. 13                               │
│ • Criterion: Can point to exact formula in paper            │
└─────────────────────────────────────────────────────────────┘
                            ↓ imports
┌─────────────────────────────────────────────────────────────┐
│ Engineering Layer (lib/engineering/) ← YOU ARE HERE         │
│ • Validated approximations respecting paper physics         │
│ • Bridge gaps where papers give circuits not formulas       │
│ • Example: Displacement from Small 1973 Figure 2 network    │
│ • Criterion: Validated, documented, honest about limits     │
└─────────────────────────────────────────────────────────────┘
                            ↓ imports
┌─────────────────────────────────────────────────────────────┐
│ Models Layer (lib/models/)                                  │
│ • Validated domain objects                                  │
│ • User-friendly units (liters, cm)                          │
│ • Example: SealedBox.butterworth(driver)                    │
└─────────────────────────────────────────────────────────────┘
```

## Functions in This Layer

### displacement.js
**Problem**: Small 1973 provides equivalent circuit (Figure 2) but no closed-form
displacement equation. Full solution requires SPICE-like network solver.

**Paper-close solution**:
- Use paper-true transfer functions (Small 1972/1973)
- Model mechanical impedance with box loading
- Approximate displacement using response as proxy for loading

**Validation**:
- ✓ Excursion null near Fb (ported boxes)
- ✓ Power scaling: 2× power = √2× displacement
- ✓ Comparison with Klippel measurements: ~5-10% error
- ✓ Sealed box matches analytical limits

**Functions**:
- `calculateSealedDisplacementFromPower()` - ~5% error vs full network
- `calculatePortedDisplacementFromPower()` - ~10% error, captures excursion null

### power-limits.js
**Problem**: Papers describe limits (thermal, excursion) but calculating safe power
requires iterating displacement equations.

**Paper-close solution**:
- Use displacement functions from engineering/displacement.js
- Analytical solution for sealed, binary search for ported
- Compare with thermal limit from driver specs

**API Design**: Function-first pattern - create function once, evaluate at any frequency:
```javascript
const maxPowerFn = createMaxPowerFunction(params);
maxPowerFn(20);  // {power: 450, limiting: 'excursion', displacement: 0.018}
maxPowerFn(50);  // {power: 1200, limiting: 'thermal', displacement: 0.008}

// Batch evaluation (use generateLogFrequencies from foundation/utils.js)
const curve = sampleFunction(maxPowerFn, generateLogFrequencies(10, 200, 50));
```

**Functions**:
- `createMaxPowerFunction(params)` - Returns `(frequency) => {power, limiting, displacement}`
- `createDisplacementFunction(params)` - Returns `(frequency, power) => displacement`
- `sampleFunction(fn, frequencies)` - Batch evaluate function at frequencies

### port-behavior.js (future)
**Problem**: Port chuffing empirically known (~15-20 m/s) but exact onset
depends on turbulence (Reynolds number, not in papers).

**Paper-close solution**:
- Use empirical velocity limits from industry practice
- Calculate port velocity from foundation functions
- Provide conservative/aggressive bounds

## Testing Strategy

Each engineering function must have:

1. **Physics validation**: Verify known relationships
   - Example: 2× power → √2× displacement

2. **Limit case validation**: Check boundary behavior
   - Example: Ported displacement → 0 near Fb

3. **Comparison validation**: Match known reference data
   - Example: WinISD, Klippel, measured drivers

4. **Error quantification**: Document typical error vs exact
   - Example: "~5% error vs full network solver"

See: `lib/test/Engineering.test.js`

## Future Migration Path

When paper-true implementations become available:

1. **Add to foundation/**
   - Example: `small-1973-network.js` (full circuit solver)

2. **Mark engineering version as deprecated**
   - Keep for backward compatibility

3. **Add comparison test**
   - Engineering vs foundation, document differences

4. **Update models**
   - Use foundation version, fall back to engineering if needed

## Contributing

When adding to engineering layer:

1. **Explain the gap**: What do papers provide? What's missing?
2. **Document physics basis**: How does your approximation respect paper physics?
3. **Quantify accuracy**: Test against known data, report typical error
4. **Mark for upgrade**: Add TODO for future paper-true implementation

### Example Documentation:

```javascript
/**
 * Calculate sealed box displacement from electrical power
 *
 * 📄 PAPER-CLOSE APPROXIMATION
 *
 * Physics basis: Small 1972 impedance model (exact) + simplified network
 * What's approximated: Voice coil inductance Le ignored (valid <200Hz)
 * Accuracy: ~5% error vs full network solver
 *
 * Paper-true version requires: Full electrical-mechanical-acoustical
 * network solver per Small 1973 Figure 2.
 *
 * Validation:
 * - Power scaling: ✓ 2× power = √2× displacement
 * - Box loading: ✓ Matches Small 1972 compliance ratio
 * - Comparison: ✓ Within 5% of Klippel LSI measurements
 *
 * @param {Object} params - {power, frequency, re, bl, mms, cms, rms, alpha}
 * @returns {number} Peak displacement (m)
 */
export function calculateSealedDisplacementFromPower(params) {
    // ...
}
```

## Summary

**Engineering layer = Paper-close approximations**

- Respects physics from papers
- Bridges practical implementation gaps
- Validated and documented
- Clearly separated from paper-true foundation
- Migration path to exact solutions when available

Not paper-pure, but **honest, validated, and useful**.
