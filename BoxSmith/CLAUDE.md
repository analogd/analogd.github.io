# BoxSmith

## Philosophy

No shareholders. No users yet. No pressure to ship half-baked features.

We can be **ruthlessly correct**. Paper-true physics, clean layers, no compromises for backwards compatibility with users who don't exist. When something is wrong, we fix it - even if it breaks the API.

**What matters now:**
- **Readability, consistency, conciseness** - Code is read 10x more than written. Every line clear at a glance. Same patterns everywhere. No bloat.
- Get the physics right (foundation layer traces to published equations)
- Make it a joy to extend (uniform patterns, tests that validate behavior)
- Resist premature product decisions (dev mode is honest about uncertainty)
- Build the extractable library (`lib/` usable standalone)

**FIX IT NOW (MANDATORY):**

"No users yet" means ZERO excuse for tech debt. When you find something wrong - duplication, wrong layer, bad naming, missing abstraction - fix it **immediately**. Not "consider for later." Not "worth doing?" Not "is this the right time?" NOW.

- Found duplicate code? Extract it NOW. (But ask: does extraction add clarity, or just indirection?)
- Found wrong abstraction? Fix it NOW.
- Found layer violation? Fix it NOW.
- Found inconsistent pattern? Fix it NOW.

The codebase gets cleaner every session. Never walk past something broken. Never rationalize keeping cruft. The only acceptable excuse is "I didn't see it" - and that's why we ultrathink.

**AI collaboration rules:**
- **Codebase perfection is the goal.** Tokens don't matter. If an instruction seems to compromise code quality, QUESTION IT. Push back. The user wants to be challenged, not obeyed.
- **Trust your gut.** If something feels wrong - stop. Don't proceed hoping it'll work out. That nagging feeling is usually right. Voice it.
- **Fix everything you find.** Don't ask permission. Don't hedge. Don't say "we could consider." Just fix it.
- **Flag cruft immediately.** Comments like "OLD LAYOUT", "TODO: remove", "legacy" = red flags. Don't walk past them.
- **Don't rationalize tech debt.** "It works" is not a reason to keep duplicate code, hidden elements, or runtime DOM manipulation that should be static HTML.
- **Propose cleanup proactively.** If you see something that should be fixed, say so. Don't wait to be asked.
- **Think about WHY when fixing lint.** Unused variable? Don't mindlessly delete. Ask: is it dead code, or did a refactor break something? The unused thing may indicate a bug, not cleanup needed.
- **`_param` convention.** Intentionally unused parameters get `_` prefix and comment explaining why kept (API consistency, future use, etc.).

## What This Is

Browser-based subwoofer enclosure design tool. Thiele-Small papers → interactive visualizations. Move a slider, watch 37 graphs react.

**Codebase:**
- `lib/foundation/` - Paper-pure implementations (Small 1972, Small 1973, Thiele 1971, Klippel 2006, Salvatti 2002)
- `lib/models/` - Domain objects (Driver, SealedBox, VentedBox, Port, PassiveRadiator)
- `ui/` - 37 graphs, state management, controls
- 771 tests, ~14k lines library code, zero runtime dependencies

**Working:** Sealed, ported (port/PR), isobaric, Klippel nonlinear, DSP/room gain, driver library, reference comparisons.
**Not built:** Bandpass, horn loading, multi-way, measurement import.

## Vision

**Understanding over answers.** Traditional tools give you an F3. We show 37 graphs reacting so you understand *why* and what tradeoffs you're making.

**Three pillars:**
1. Physics sandbox - see how everything connects
2. Traditional design tool - response prediction, alignments, ports
3. DSP-era tool - "I'll EQ flat anyway — what limits my output?"

### Response Curves Are Starting Points, Not Answers

**The mental model has shifted.** Even users not running Dirac understand that EQ exists. When comparing a naturally-flat 140L ported box against a compact high-Qtc sealed box, they know the sealed box *can* be EQ'd to match. The question is: what's the cost?

**Two ways users think about this:**

1. **Full room correction** (Dirac, Audyssey): DSP forces response to target curve anyway. Theoretical response is just raw material. What matters is output capability *after* DSP reshapes it.

2. **Manual EQ / "I'll boost the bass"**: User knows they'll add a shelf or parametric. They want to understand how much boost, and what that costs in headroom.

**Both ask the same questions:**
1. **EQ demand**: How much boost does this design need at 25Hz to hit a target?
2. **Headroom after EQ**: Max SPL minus EQ demand = actual usable output
3. **Where does it give up**: The frequency where EQ demand exceeds available headroom

**Example**: A high-Qtc sealed box (Qtc=1.0) might look "worse" on paper (that bump!), but it needs *less* EQ boost in the deep bass. After EQ flattens both designs to the same curve, the high-Qtc box might have *more* usable output than a "textbook perfect" Qtc=0.707 design.

**Design implication**: Comparison features should help users see the cost of achieving equivalent responses - not just compare raw curves. A 100L box with -6dB@30Hz and a 60L box with -12dB@30Hz might both deliver 105dB@30Hz after EQ - but with very different excursion and thermal margins.

**Current state:** Full sandbox with top control panel and collapsible graph sections. Intentionally a "dev mode" dumping ground until we know users better.

## Development Setup

```bash
# Start server (kills existing on port 8080, serves from repo root)
./BoxSmith/start-server.sh

# Or manually
python3 -m http.server 8080 &
```

Access: http://localhost:8080/BoxSmith/ui/
Tests: `npm test` or `node --experimental-vm-modules lib/test/run-all-tests.mjs`
Lint: `npm run lint` (ESLint 9, catches broken imports and unused vars)
Screenshots: Not available (company browser lockdown - no Chrome/headless access)

## Architecture

**Layers (DO NOT violate):**
- **Foundation** - Paper-pure math. No UI concerns. Every function traces to published equation.
- **Models** - Immutable validated domain objects. Wrap foundation, don't add physics.
- **UI** - Consumes models, doesn't reimplement math.

When something seems hard, check if you're in the wrong layer.

**Key files:**
| Layer | Files |
|-------|-------|
| Foundation | `small-1972.js` (sealed), `small-1973.js` (vented), `vented/port.js`, `vented/passive-radiator.js`, `vented/port-compression.js` |
| Models | `Driver`, `SealedBox`, `VentedBox`, `Port`, `PassiveRadiator`, `ReferenceSub`* |
| UI | `state.js` (pub/sub), `graphRegistry.js` (37 graphs), `app.js` (controls), `box-builder.js` |

*`ReferenceSub` is NOT a physics model - it's a container for CEA-2010 measured data from commercial subs. Useful for comparing DIY theoretical output to real products. Currently lib-only (no UI), but tested and maintained.

## Critical Rules

### DESIGN FIRST, CODE SECOND (TOP PRIORITY)

**NEVER pattern-match to "solve the immediate problem."** Always stop and ask "what's the right design?"

Before writing ANY code, ask:
1. **What's the root cause?** Not the symptom, the actual problem.
2. **What's the RIGHT design?** Not the quick fix, the correct solution.
3. **Does this add special cases?** If yes, it's wrong. Go back to step 1.

If you catch yourself writing `if (specialCase) { handleIt }` - STOP. That's a hack. The right design makes the special case impossible or handles it uniformly with everything else.

**Do it right the first time.** Don't write a hack and wait to be corrected. The user shouldn't have to chase you to get good code. Iterating toward correctness is lazy and wastes everyone's time.

### FAIL LOUD, NOT SILENT (MANDATORY)

**This is a mandatory design principle.** A super-anal codebase helps us find issues faster instead of hiding them.

No users yet. No legacy to protect. Build an extremely anal codebase that breaks and throws rather than silently papering over bugs.

**Principle:** If something is wrong, crash immediately with a clear error. Don't try to "preserve user experience" by guessing or falling back to defaults.

**`state.require()` over `state.get() || DEFAULT`:**
```javascript
// BAD - hides initialization bugs
const power = state.get('power') || DEFAULTS.power;

// GOOD - crashes if state not initialized
const power = state.require('power');
```

**Why this matters:**
- Silent fallbacks hide bugs for weeks/months
- When you finally discover the bug, you can't tell when it started
- "Works on my machine" becomes impossible to debug
- We have zero users to upset with crashes - only ourselves to blame for bugs

**NEVER suppress warnings.** If a warning is annoying, either fix the underlying issue or understand why it's expected. Suppressing warnings defeats the entire purpose of failing loud.

**Solve problems at the right level.** When something is wrong, don't patch the symptom - fix the root cause. Ask: "Why is this happening?" not "How do I make this stop?" If the fix involves special-casing, conditional skips, or "don't do X when Y" logic, it's probably a hack. The right solution usually means the problem *can't* occur, not that we handle it gracefully when it does.

**When to use `state.get()` vs `state.require()`:**
- `require()` - state keys that are initialized in `initializeDefaultState()` and must exist
- `get()` - optional/computed state that may legitimately be null (e.g., `prMassCalculated` for impossible tuning)

### NO HIDDEN FALLBACKS

Code like `driver?.pe || 1200` is **FORBIDDEN**. It lies - user thinks they see their driver's behavior but sees fabricated numbers.

| Category | Example | Defaults OK? |
|----------|---------|--------------|
| Component specs | Driver Fs, Qts, Vas | ❌ NO - physical measurement |
| Design choices | Port diameter, flared, ql, k | ❌ NO - user must choose |
| Computed outputs | Port length, PR mass | ✅ YES - derived from choices |
| Operating conditions | Power, target SPL | ✅ YES - visible in UI |

If data missing → show N/A. Never fabricate.

**The test:** Would a different default change the graphs? If yes, require explicit choice.

**Factory methods are stricter than constructors:**
```javascript
// Factory methods - STRICT, paper-true
VentedBox.qb3(driver, vent)              // vent REQUIRED, ql=Infinity (lossless)
VentedBox.qb3(driver, vent, {ql: 7})     // explicit lossy modeling
VentedBox.c4(driver, vent, {k: 0.5})     // k REQUIRED (ripple is design choice)
comparePortedAlignments(driver, vent)    // vent REQUIRED

// Constructor - practical defaults for advanced users
new VentedBox(driver, vol, fb, vent)     // ql defaults to 7
```

### One Pattern, One Place

Uniform patterns matter for AI collaboration and maintainability:
- Error handling: `safeUpdateGraph` wrapper
- N/A states: `naPlaceholder()` helper
- Capability checks: `box.canCalculateLimits`, `requires: Requires.LIMITS`
- Curves: models provide `*Curve()` methods, UI doesn't rebuild

If copy-pasting between graph functions → extract the pattern.

### Layer Discipline

- Foundation tests validate against published equations
- Model tests validate API behavior (black-box)
- If test requires implementation details, wrong layer
- No console.warn/log in library code - throw or return validation

### Units: SI Internally, Always

**Library code uses SI units internally. Period.**

| Param | Internal (SI) | UI Display | Conversion |
|-------|---------------|------------|------------|
| Cms | m/N | m/N | none |
| Mms | kg | g | ×1000 |
| Sd | m² | cm² | ×10000 |
| Vas | m³ | L | ×1000 |
| Xmax | m | mm | ×1000 |

**Why this matters:**
- Physics equations expect SI — no unit conversion bugs in math
- Consistency across all calculations
- UI is the only place that deals with "user-friendly" units
- Never change internal representation to make UI easier

**Driver stores mixed units (historical/spec-sheet convention):**
- fs (Hz), qts, qes, qms, vas (L), re (Ω), le (mH), bl (T·m), mms (g), sd (cm²), xmax (mm), pe (W)
- Driver provides SI getters: `vasSI`, `sdSI`, `xmaxSI`, `mmsSI`, `leSI`
- Foundation/engineering code uses SI getters, never raw values

### Capability Checks

Don't use `instanceof`. Use capability methods.

**Type checks:**
- `box.isVented`, `box.isPort`, `box.isPassiveRadiator`, `box.ventType`

**Capability checks (box methods):**
```javascript
box.canCalculateSpl         // has sensitivity + re
box.canCalculateDisplacement // has motor params (re, bl, mms, cms, rms)
box.canCalculateLimits      // has motor + limit params (xmax, pe)
box.canCalculateImpedance   // has impedance params
```

**Driver param checking (used internally by models):**
```javascript
driver.hasParams('bl', 'mms', 'cms', 'rms')  // true/false
driver.missingParams('bl', 'mms')            // ['mms'] if mms is null
```

**How it works:** Box capability methods use `driver.hasParams()` internally. Graphs check box capabilities, not raw params.

## How to Add a Graph

1. **Model**: Add `*Curve()` returning `[{frequency, value, ...}]` to both SealedBox and VentedBox
2. **graphRegistry.js**: Add entry with `id`, `label`, `domain`, `yRange`, `requires`, `inputs`, `render`
3. **index.html**: Add `<div class="chart-container">` with canvas
4. **CLAUDE.md**: Update graph count

**`requires`**: Capability check from `Requires` enum:
- `Requires.NONE` - always show
- `Requires.SPL` - needs `canCalculateSpl`
- `Requires.LIMITS` - needs `canCalculateLimits`
- `Requires.IMPEDANCE` - needs `canCalculateImpedance`
- `Requires.PORT` - ported box with port vent
- `Requires.PR` - ported box with passive radiator

```javascript
foo: {
    id: 'fooChart',
    label: 'Foo (units)',
    domain: Domain.FREQUENCY,
    yRange: { min: 0, max: null },
    requires: Requires.LIMITS,
    inputs: ['boxType', 'volume', 'power'],
    render: (box, ctx) => {
        const { power, getFreqRange, points } = ctx;
        const { min: fMin, max: fMax } = getFreqRange();
        return [{ data: box.fooCurve(power, fMin, fMax, points), label: 'Foo', color: COLORS.primary, yKey: 'value' }];
    }
}
```

## Anti-Patterns

**Library code:**
- ❌ `console.warn/log` - throw or return validation

**UI code:**
- ❌ Inline N/A - use `naPlaceholder('reason')`
- ❌ `frequencies.map(f => box.fooAt(f))` - use `box.fooCurve()`
- ❌ Bypassing registry - all graphs in GRAPH_REGISTRY
- ❌ Modal: `.visible` for overlay, `.active` for internal. Don't mix.

**Data:**
- ❌ `driver?.pe || 1200` - fabricates physics
- ❌ `ratios[type] || 2.0` - throw on unknown keys

## Curve Contracts

Model curves return specific field names. UI uses `yKey` to extract. Mismatch = silent empty graph.

Solution: `lib/models/curve-contracts.js` defines all returns. `graphRegistry.js` validates at startup.

When adding curves: add to CurveContracts, add smoke test, use correct yKey.

## Model Warnings

```javascript
box.warnings      // Array of { type, message, severity }
box.hasWarnings   // Boolean
```

Use for: physics constraints violated, unusual-but-valid configs.
Don't use for: runtime limits (graphs handle), input validation (UI handles).

## Testing Philosophy

**Test characteristics, not arbitrary values:**
```javascript
// BAD - what if both wrong?
expect(box.responseAt(30)).toBeCloseTo(-4.2, 1);

// GOOD - physical behavior
test('Butterworth: -3dB at Fc', () => {
    expect(SealedBox.butterworth(driver).responseAt(box.fc)).toBeCloseTo(-3, 0.5);
});
```

Test: known relationships (Butterworth = -3dB at Fc), shape characteristics (Qtc < 0.707 = no peak), ordering guarantees (response decreases in rolloff).

## Status (Jan 2026)

| Done | Not Started |
|------|-------------|
| Sealed/ported/PR modeling | Bandpass |
| Isobaric | Thermal time-domain |
| Klippel nonlinear, port compression | Design comparison (DSP-era) |
| DSP/room gain | - |
| Driver library | |
| 37 graphs | |

**Validation:** Cross-checked against WinISD. Passband matches; rolloff differs 2-3dB (investigating).

## Graph Inventory (37)

| Category | Graphs |
|----------|--------|
| Primary | Max SPL, Response, Sensitivity, Excursion, Headroom, Max Power |
| Scenario | DSP, DSP Phase, Environment |
| Electrical | Impedance, Impedance Phase, EPDR, Current Draw, Amp Load |
| Mechanical | Cone Velocity, Cone Accel, Thermal Dissipation |
| Ported | Port Velocity, Vent Mach, Vent Reynolds, Port Contribution |
| Passive Radiator | PR Excursion, Excursion Comparison, Power Limits, PR Contribution |
| Design | Volume Compare, SPL vs Power, Power Required, Alignment Compare |
| Time | Step Response, Impulse Response, Group Delay, Phase |
| Klippel | Bl Compression, THD Estimate, Bl(x), Kms(x) |

## Klippel Nonlinear (Summary)

Based on Klippel 2006. Models Bl(x) motor compression and Kms(x) suspension stiffening at high excursion.

**What it is:** Planning approximation for real-world vs theoretical SPL loss.
**What it isn't:** Precise prediction (needs actual Klippel measurements for that).

Default: Bl drops to 50% at Xmax → ~6dB compression. Conservative for planning.

## Port Compression (Summary)

Based on Salvatti 2002 and Bezzola 2019 (Harman/Samsung). Models turbulent flow effects in ports at high velocities.

**Key thresholds (from papers):**
| Threshold | Value | Effect |
|-----------|-------|--------|
| Reynolds linear | < 50,000 | Linear operation, < 1 dB compression |
| Reynolds transition | 50,000-100,000 | 1-3 dB compression expected |
| Reynolds turbulent | > 100,000 | Severe compression (> 6 dB) |
| Velocity straight | 10 m/s | Young 1975 limit for straight ports |
| Velocity flared | 15-25 m/s | Flared ports tolerate higher velocity |

**Straight port penalty:** ~2 dB baseline loss vs flared, growing to 10-16 dB at high levels (Bezzola 2019).

**Port eigenfrequency:** f_p1 = c/(2L), typically 700-1000 Hz. This is where turbulent noise manifests as audible "chuffing".

**What we DON'T model:** Smooth compression curves. The papers show empirical curves for specific test ports but no general formula. We show thresholds, not interpolated values.

## Roadmap

1. ~~Phase 1: 37 graphs~~ ✓
2. ~~Phase 2: Passive Radiator~~ ✓
3. ~~Phase 3: Isobaric~~ ✓
4. Phase 4: Bandpass
5. Phase 5: Design comparison (DSP-era metrics: headroom after EQ, usable bandwidth)

## Parking Lot

- TypeScript migration for lib/ (priority when bandwidth allows)
- CI pipeline
- Missing UI controls: QL (enclosure losses), rectangular port dimensions

## Future: Graph Dependency Validation

**Problem:** Graphs can silently break (show empty/wrong data) when wiring gets disconnected. We caught PR graphs being empty because `boxType: 'pr'` wasn't triggering PR vent creation. Need automated detection.

**Current state:**
- `graphRegistry.js` has `inputs` array per graph declaring dependencies
- `Graph.js` warns when data layers are empty (added Jan 2026)
- But no validation that declared inputs actually affect output

**Design intention:**

1. **Input catalog** - Formalize all state keys with valid ranges:
   ```javascript
   const INPUT_CATALOG = {
       volume: { min: 10, max: 1000, unit: 'L', affects: ['all'] },
       tuning: { min: 15, max: 80, unit: 'Hz', affects: ['ported', 'pr'] },
       power: { min: 1, max: 5000, unit: 'W', affects: ['excursion', 'spl', 'thermal'] },
   };
   ```

2. **Graph sensitivity** - Declare expected effect per input:
   ```javascript
   excursion: {
       inputs: ['volume', 'power'],
       sensitivity: {
           power: { minEffect: 0.1 },  // >10% output change expected
           volume: { minEffect: 0.01, testFreqs: [30, 50] },
       }
   }
   ```

3. **Validation harness** - Dev-mode or test-time:
   - Render graph, hash output
   - Wiggle each declared input
   - Re-render, verify output changed above threshold
   - Warn if declared dependency has no effect

**Challenges:**
- Some inputs only matter in certain modes (tuning irrelevant for sealed)
- Reference lines don't change, only data curves
- Need to compare curve data, not pixel output
- False positives would be noisy

**Value:** Catches wiring bugs before user reports "graphs are empty."

## Conventions

- Zero runtime dependencies (dev deps OK)
- Driver versions matter: UM18-22 V2 ≠ V1
- GitHub Pages hosting
- Personal project
