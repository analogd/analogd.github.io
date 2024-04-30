# Future Extensions & Known Gaps

This document tracks what we've intentionally simplified, what's missing, and what could be added.
Ordered by importance for a speaker enclosure design tool.

**Note on research validation (Dec 2025):** ChatGPT analysis of post-T/S research confirmed our priorities align with Klippel's extended modeling work. T/S remains the foundational "small-signal" layer; extensions add state-dependent parameters (position, temperature, velocity). Our layered architecture (Foundation → Models → UI) supports incremental additions without redesign.

---

## Priority 1: High-Impact Gaps (Would Significantly Improve Accuracy)

### 1.1 Thermal Modeling (HIGHEST)

**What we have**: Static Pe limit graphs showing "thermal ceiling."

**What we're missing**: Dynamic voice coil heating:
- **Re(T)** - Resistance increases ~0.4%/°C for copper
- **Power → heat → Re rise → current drop → SPL loss**
- **Time constants** - Voice coil heats in seconds, magnet in minutes
- **Dynamic compression** - Output drops 3-6 dB after sustained high power

**Why it matters**: This affects *every* high-power subwoofer design. Current "thermal limit" is static and optimistic. Real drivers compress significantly before reaching rated power. A 500W-rated driver playing bass content will see Re rise 30-50% after minutes of use.

**To implement properly**:
- Two-time-constant thermal model (voice coil τ≈1-5s, magnet τ≈30-120s)
- Re(T) = Re₀ × (1 + 0.004 × ΔT) for copper
- Thermal resistance Rtvc (°C/W) - estimate from Pe and max temp rise
- Could add "sustained power" vs "burst power" analysis

**Reference**:
- Klippel papers on thermal behavior and protection
- AES2-2012 standard for power testing
- COMSOL lumped thermal models

**Implementation approach**: New graph "Thermal Compression vs Time" showing Re rise and SPL loss for given power level. Add `thermalModel.js` to foundation with time-domain simulation.

### 1.2 Port Turbulence & Compression (HIGH)

**What we have**: Velocity calculation, Mach/Reynolds graphs, "15-25 m/s" rule of thumb.

**What we're missing**: Real port compression is nonlinear and frequency-dependent. At high SPL:
- Turbulent flow develops (Reynolds > ~50,000)
- Jet formation at port exit causes additional losses
- Effective tuning frequency shifts
- Output compresses by 2-6 dB before reaching "chuffing"

**Why it matters**: Subwoofer designs routinely hit port limits. Current velocity warnings don't quantify the SPL penalty.

**To implement properly**:
- Nonlinear port resistance model (empirical curve fitting)
- SPL compression as function of velocity/Mach
- Dynamic tuning shift calculation

**Papers to acquire**:
- Salvatti, A., Devantier, A., & Button, D. "Maximizing Performance from Loudspeaker Ports" AES 2002
- Roozen, N.B. "Reduction of port noise" (various)

**Implementation approach**: Add `portCompressionDb(velocity)` function returning estimated SPL loss. Overlay on existing Vent Limit graph.

### 1.3 Radiation Impedance & Mutual Coupling (MEDIUM)

**What we have**: Half-space (2π) radiation assumption.

**What we're missing**:
- Real radiation impedance varies with frequency and baffle size
- Multiple drivers couple acoustically (not just sum of SPLs)
- Proximity to boundaries affects loading below ~200 Hz

**Why it matters**: Multi-driver arrays, isobaric configurations, and accurate sensitivity predictions.

**Papers to acquire**:
- Beranek, L. & Mellow, T. "Acoustics: Sound Fields and Transducers" (2012) - Chapter 12
- Olson, H. "Direct Radiator Loudspeaker Enclosures" (1951)

---

## Priority 2: Would Be Nice (Adds Value But Not Critical)

### 2.1 Baffle Diffraction (MEDIUM-LOW)

**What we have**: Nothing.

**What we're missing**: Sound diffracts around enclosure edges, causing response ripples above ~500 Hz.

**Why it matters**: Primarily affects full-range/midrange speakers. Less relevant for subwoofers.

**Reference**:
- Olson's classic diffraction measurements
- Vanderkooy edge-diffraction model

### 2.2 Passive Radiator Coupling Details (LOW)

**What we have**: Basic PR mass/area/Xmax calculations, tuning formula.

**What we're missing**:
- PR self-resonance effects
- Cms nonlinearity of PR suspension
- PR-to-driver coupling impedance details

**Why it matters**: PRs are increasingly popular. Current model is adequate for basic design.

### 2.3 Cone Breakup / Upper Frequency Limit (LOW)

**What we have**: Validation warning if Fs > 500 Hz (T/S model breaks down).

**What we're missing**: Prediction of cone breakup frequency, above which pistonic assumption fails.

**Why it matters**: Primarily for full-range designs. Not critical for subwoofer-focused tool.

---

## Priority 3: Different Product Categories (Out of Current Scope)

### 3.1 Bandpass Enclosures

**What we have**: Nothing (sketch removed - heuristics pretending to be foundation code).

**Status**: Not started. When we do this, do it right.

**Best sources**:
- Keele, D.B. "Low-Frequency Loudspeaker Assessment by Nearfield Sound-Pressure Measurement" JAES 1974 (foundation)
- Keele, D.B. "The Design of a 4th-Order Bandpass Loudspeaker Enclosure" AES Preprint 3617, 1993
- Keele, D.B. "A New Set of Sixth-Order Vented-Box Loudspeaker System Alignments" JAES 1975
- Small, R.H. "Closed-Box Loudspeaker Systems Part I: Analysis" JAES 1972 (sealed rear chamber)
- Small, R.H. "Vented-Box Loudspeaker Systems" JAES 1973 (ported front chamber)

Bandpass combines sealed (rear) + ported (front) chambers. The math is straightforward once you have both foundations - it's the interaction that needs careful modeling.

### 3.2 Transmission Line / Quarter-Wave

**What we have**: Nothing.

**Status**: Different design philosophy. Complex standing-wave calculations. Low priority.

### 3.3 Horn Loading

**What we have**: Nothing (deleted Geddes placeholder).

**Status**: Out of scope. Horns are a specialized category requiring waveguide theory.

---

## What We've "Cheated" On (Known Simplifications)

### Documented Simplifications (Acceptable)

| Area | Simplification | Impact | Notes |
|------|---------------|--------|-------|
| **Bl(x)** | Estimate from Xmax, not measured | ±20% error possible | Clearly labeled as estimation |
| **Kms(x)** | Assume symmetric polynomial | Real suspensions asymmetric | Good enough for planning |
| **Port end correction** | Fixed 0.732 factor | Varies by flare, placement | Industry-standard approximation |
| **Enclosure losses (QL)** | Default QL=7 | Varies 5-20 by construction | Industry-standard default |
| **Air properties** | Fixed c=343m/s, ρ=1.204 | Varies with temp/altitude | Negligible for most cases |
| **Le (inductance)** | Constant or zero | Varies with x, i, and frequency | Low impact for subs (see below) |

### Not Cheating - Just Scope Limits

- We model **enclosures**, not crossovers, room acoustics, or amplifiers
- Small-signal T/S is the foundation; Klippel is bonus estimation
- We cross-check against existing tools (WinISD, etc.) for validation, treating neither as absolute truth

### Explicitly Out of Scope (Valid Research We're Not Pursuing)

These extensions exist in academic literature and pro tools but are LOW VALUE for subwoofer enclosure design:

| Extension | Why It's Real | Why We Skip It |
|-----------|--------------|----------------|
| **Le(i,x) lossy inductance** | Voice coil inductance varies with current, position, and frequency. Semi-inductance models improve impedance accuracy above resonance. | Subwoofers operate 10-200Hz where Le effects are negligible. Matters for crossover design (not our scope). |
| **Rms(v) velocity-dependent damping** | Mechanical resistance increases at high cone velocity. | Esoteric effect, rarely modeled even in pro tools. |
| **Cone breakup / distributed mechanics** | Real cones have resonant modes causing peaks/dips in response. | 18" subs break up at 300-500Hz+, above our passband. Critical for midranges, not subs. |
| **Viscoelastic creep** | Suspension compliance drifts over time under load. | Real but too esoteric for a design tool. We handle amplitude dependence via Kms(x). |
| **FEM/BEM multiphysics** | Finite element methods for precise field modeling. | Overkill for browser-based enclosure design. Better as validation, not primary model. |
| **Microspeaker models** | Small transducers have different dominant nonlinearities. | Completely out of scope - we do subwoofers. |

**Architectural note**: If we ever expand to full-range speakers, Le(i,x) and breakup modeling would become relevant. Current architecture could support this via additional foundation modules.

---

## Reference Data: CEDIA RP22 Thresholds

These thresholds from CEDIA/CTA-RP22 (2023) can inform "is my design good enough?" checks:

### SPL Targets (Home Theater)
- **Reference level**: 85 dB at listening position
- **Peak capability - mains**: 105 dB(C)
- **Peak capability - LFE**: 115 dB(C) (10 dB above mains)
- **Headroom recommendation**: 6 dB above reference

### Frequency Extension
- **LFE range**: 20-120 Hz nominal
- **Bass management crossover**: typically 80-120 Hz

### Response Tolerance
- **Seat-to-seat variation**: ±3 dB (good), ±6 dB (acceptable)
- **Tonal balance sensitivity**: 1-2 dB deviations are audible

### Distance Loss
- **Point source**: -6 dB per doubling of distance
- **Line array**: -3 dB per doubling

---

## Priority 4: Data Integrity & User Experience

### 4.1 Driver Data Provenance (HIGH)

**What we have**: Driver model validates params at construction, derives some values (Cms from Vas/Sd, Rms from Qms/Mms/Fs).

**What we're missing**: No tracking of where each value came from:
- **Entered** - User typed it
- **Derived** - Calculated from other params
- **Default** - We assumed it (Le=0, QL=7)
- **Estimated** - Approximation model (Bl(x) from Xmax)

**Why it matters**: User can't tell what's real data vs assumptions. A driver with missing Le silently uses 0, affecting impedance graphs without indication.

**To implement**:
```javascript
class TrackedDriver {
    #driver;   // The actual Driver (pure math)
    #sources;  // Map: param → { source, derivedFrom?, note? }

    getSource(param) { return this.#sources.get(param); }
    get warnings() { /* consistency checks */ }
}
```

UI could show: 🔵 entered, 🟢 derived, 🟡 estimated, ⚪ default

### 4.2 Enhanced T/S Cross-Validation (MEDIUM)

**What we have**: Q relationship validation (Qes ≥ Qts, 1/Qts ≈ 1/Qes + 1/Qms).

**What we're missing**: T/S params are over-determined. Could verify:
- `Fs ≈ 1/(2π√(Mms×Cms))` if all three provided
- `Qes ≈ Re×Cms/(Bl²)×2πFs` if motor params provided
- `Vas ≈ ρ₀c²×Cms×Sd²` if compliance and area provided
- Efficiency sanity check (η₀ typically 0.1% - 5%)

**Unit confusion detection**:
- Sd looks like m² instead of cm² (factor 10000)
- Mms looks like kg instead of grams (factor 1000)
- Xmax looks like peak-to-peak instead of one-way (factor 2)

### 4.3 Enclosure Losses (QL) Slider

**Status**: ✅ DONE (Dec 2025)

User-adjustable QL slider (3-20 range) in Box Configuration panel for ported boxes.

### 4.4 Missing Driver Parameters (LOW)

Currently not modeled:
- **Xmech** - Mechanical limit (> Xmax, where suspension bottoms out)
- **Coil geometry** - Height, gap height, overhang (better Bl(x) estimation)
- **Thermal resistance** - Rtvc, Rtmag (for proper thermal modeling)

---

## Implementation Status

| Component | Status | Tests |
|-----------|--------|-------|
| Klippel Bl(x) estimation | ✅ Done | 50 |
| Klippel Kms(x) estimation | ✅ Done | included above |
| Klippel compression curves | ✅ Done | included above |
| Klippel THD estimation | ✅ Done | included above |
| Isobaric (compound) driver | ✅ Done | 25 |
| QL slider | ✅ Done | - |
| Thermal compression | ⏳ Static limit only | - |
| Port turbulence effects | ⏳ Velocity/Mach only | - |
| Radiation impedance | ❌ Not started | - |
| Baffle diffraction | ❌ Not started | - |
| Bandpass rigorous | ❌ Not started | - |
| Driver provenance tracking | ❌ Not started | - |
| Enhanced T/S validation | ❌ Not started | - |

---

## Priority 5: User Experience Exploration

### Current State
Full sandbox mode: 32 graphs visible, all controls exposed. Powerful for exploration and experts, but potentially overwhelming for focused tasks or beginners.

### User Types We Could Serve

| User | Primary Question | Current Fit |
|------|-----------------|-------------|
| First-time builder | "Will this driver work in my space?" | Poor - too many options |
| Experienced DIYer | "What's the smallest box for 115dB at 25Hz?" | Good - has all the data |
| Troubleshooter | "Why does my sub sound boomy?" | Poor - no guidance |
| Comparison shopper | "How does DIY compare to SVS SB-3000?" | Partial - reference subs exist |
| Learner | "What does Qts actually do?" | Good - can experiment |

### Experience Modes to Explore

**1. Guided Wizard**
- Step-by-step for beginners: "What driver?" → "Space constraints?" → "SPL goals?" → "Here's your design"
- Explains *why* at each step
- Full sandbox available but not default

**2. Goal-Driven Optimizer**
- Input: target SPL, frequency range, space constraint
- Output: ranked designs that achieve goals
- Shows tradeoffs: "150L gets you 3dB more headroom"

**3. Troubleshooting Mode**
- "My sub sounds boomy below 40Hz"
- → "Qtc of 1.3 + room gain = +6dB at 45Hz"
- → "Try EQ cuts or reduce box volume"

**4. Comparison Mode**
- A/B/C configurations side by side
- Same driver, different boxes
- Different drivers, same constraints
- DIY vs commercial reference

**5. Learning Mode**
- Interactive: "What happens if Qts is higher?"
- Animate parameter changes, show cause/effect
- Link concepts to graphs

**6. Multi-Configuration Comparison (HIGH PRIORITY)**

A common workflow in WinISD:
1. Pick a driver (from library or create)
2. Create a first "reference" design (e.g., 150L sealed)
3. Duplicate → tweak volume → save as "compact sealed"
4. Duplicate → change to ported → tweak tuning → save as "ported option"
5. Compare all three side by side

**What we need:**
- Multiple named configurations (same or different drivers)
- "Duplicate" / "Save as" workflow
- Graphs overlay all configs (color-coded)
- Toggle visibility per config
- Quick A/B/C switching

**Use cases this covers:**
- Box optimization: "Same driver in 100L sealed vs 150L ported vs 200L ported"
- Driver comparison: "Same 150L box with Driver A vs B vs C"
- Design iteration: "Start conservative, explore alternatives, pick winner"

**Implementation notes:**
- Each config = { driver, box, name, color, visible }
- Current "active" config gets slider control
- Graphs render all visible configs
- Could persist to localStorage as "project"

### Key UX Questions (Undecided)

1. **Entry point**: Sandbox-first (current) vs choice screen vs auto-detect?
2. **Progressive disclosure**: How do beginners discover advanced features?
3. **Graph focus**: Show all 32 or context-relevant subset?
4. **Mobile/tablet**: Same experience or simplified view?

### Implementation Notes

Any new mode should:
- Reuse existing graph infrastructure (registry-based)
- Not require new physics code (modes are UI-only)
- Maintain access to full sandbox (expert escape hatch)
- Be additive (current sandbox remains default until we decide otherwise)

---

## Priority 6: Distribution & Platform

### App Store Distribution (iPad)

If we want to publish as an iPad app (not just PWA), Apple requires more than a "website in a wrapper" (Guideline 4.2 - minimum functionality).

**Required for App Store approval:**
- **Offline mode** - PWA-style caching so it works without network
- **Local projects** - Save/load designs via IndexedDB, export/import JSON
- **iPad-first UX** - Touch interactions, drag handles, proper gestures
- **Native integrations** - File share/export, share sheet, "Open in..." for designs

**Packaging options:**
1. **PWA only (no App Store)** - Users add to Home Screen. Easiest path.
2. **Capacitor/Cordova** - Wrap web UI in native WKWebView shell, submit as iOS app.

**Current status:** Web-only. These features would need implementation before App Store submission is viable.

### Touch/Tablet Enhancements (Beyond Current Responsive)

Current: Works on tablets via responsive breakpoints.

Future possibilities:
- Swipe gestures for graph navigation
- Pinch-to-zoom on individual graphs
- Collapsible sidebar for more graph space
- "Focus mode" showing fewer graphs larger
