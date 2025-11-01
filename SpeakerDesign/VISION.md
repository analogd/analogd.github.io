# Speaker Design Calculator - Vision Document

**Last Updated**: Session 2025-11-01
**Status**: Prototyping / Establishing Core Architecture

## The Problem

Existing speaker calculators show you pretty frequency response curves but don't tell you **why your design will fail in the real world**:

- You plan a 1000W amp, but your driver can only handle 200W at 20Hz (excursion limited)
- Your port will chuff at high SPL
- Your "flat" frequency response falls apart at real listening levels
- You don't know which driver to buy for your application

**Result**: People build speakers that look good on paper but suck in practice.

## Our Solution

**"Don't Build Garbage"** - A speaker design app that shows real-world limitations, not just theoretical response.

### Core Value Propositions

1. **Reality Check** - Show where designs actually fail
   - Excursion limits at low frequencies
   - Thermal limits at high power
   - Port chuffing warnings
   - Safe operating ranges clearly marked

2. **Visual Trade-offs** - See consequences of every choice
   - Bigger box = better bass, same power handling
   - Lower tuning = more excursion risk
   - Different drivers = different compromises

3. **Driver Shopping Assistant** - Find the right driver for your needs
   - "I want 18" sealed, 500W, home theater"
   - Shows top matches from database
   - Ranks by actual performance, not marketing specs

4. **Interactive Exploration** - Sliders and live updates
   - Change box size, see everything update
   - Adjust power, see limiting factors
   - Compare multiple designs side-by-side

## Critical Visualizations (Inspired by WinISD)

### The Big Three (Must Have V1)

1. **Frequency Response** - SPL vs frequency
   - Show at multiple power levels (1W, 100W, 500W)
   - Response drops when hitting limits = reality

2. **Maximum Power Curve** - Max safe power vs frequency
   - Color-coded: red (excursion limited) vs blue (thermal limited)
   - Shows "you can only use 200W at 20Hz!"

3. **Cone Excursion** - Displacement vs frequency at given power
   - Xmax limit line clearly marked
   - Shows where driver goes nonlinear

### Additional (V2+)

4. **SPL Ceiling** - Maximum achievable SPL vs frequency (UNIQUE!)
5. **Port Velocity** - With chuffing warnings (ported designs)
6. **Comparison View** - 2-4 designs side-by-side

## Architecture: Two Libraries

### Foundation Library (`/lib/foundation/`)

**Purpose**: Pure Thiele-Small theory from documented sources

**Characteristics**:
- Zero dependencies
- Equations cite source papers (Small 1972, Thiele 1971, etc.)
- SI units only
- No opinions, just math
- Academic-grade documentation

**Why**: Maintainability, testability, credibility, swappability

**Status**: Formulas can be wrong during prototyping - structure matters more

**Example**:
```javascript
// foundation/sealed.js
// Source: Small (1972), Equation 6
function calculateResonanceFrequency(fs, vas, vb) {
    return fs * Math.sqrt(1 + vas / vb);
}
```

### SpeakerPhysics Library (`/lib/speakerphysics/`)

**Purpose**: Practical speaker design tool built on foundation

**Characteristics**:
- Depends on foundation library
- User-friendly units (liters, mm, watts)
- Returns structured objects with warnings
- Handles edge cases gracefully
- Validated against WinISD

**Example**:
```javascript
const driver = new Driver({ fs: 22, qts: 0.53, vas: 248.2 });
const box = new SealedBox(driver, 330);  // 330L

console.log(box.warnings);
// ["Exceeds Xmax below 28Hz at 500W"]
```

## Development Philosophy

### Build for VALUE First

- Beautiful, interactive UX
- Fast, responsive graphs
- Clear warnings and recommendations
- Mobile-friendly

### Foundation for MAINTAINABILITY

- Clean separation: theory vs pragmatic
- Well-tested API (even if formulas evolve)
- Easy to fix/improve formulas later
- Clear documentation

### Data-Driven CREDIBILITY

- Real driver database (50+ drivers with verified specs)
- Validated against WinISD measurements
- Citations for equations
- Transparent about assumptions

## Key Features

### V1 (MVP)
- ✓ Driver database with 50+ real drivers
- ✓ Sealed + ported box calculations
- ✓ Three core graphs (FR, Max Power, Excursion)
- ✓ Real-time warnings about limitations
- ✓ Standard alignments (Butterworth, QB3, etc.)
- ✓ Interactive sliders (box size, power, tuning)

### V2 (Enhanced)
- Compare 2-3 designs side-by-side
- Driver shopping (filter/search by specs)
- Save/share designs (URL params)
- Port calculator with chuffing warnings
- Export graphs as images

### V3 (Advanced)
- Room gain modeling
- Multiple driver arrays (2× 18", 4× 12")
- EQ suggestions for response correction
- Build plans generator
- Community driver database contributions

## UI Layout Concept

```
┌─────────────────────────────────────────────┐
│ Driver: [UMII18-22 ▼]  [Browse All]        │
│ Box: [Sealed ▼] Volume: [330L] [Optimize]  │
│ Power: [500W]                               │
├─────────────────────────────────────────────┤
│ 📊 FREQUENCY RESPONSE                       │
│    (1W, 100W, 500W overlaid)                │
├─────────────────────────────────────────────┤
│ ⚡ MAXIMUM POWER vs FREQUENCY               │
│    (excursion vs thermal limits)            │
├─────────────────────────────────────────────┤
│ 📍 CONE EXCURSION @ 500W                    │
│    (Xmax limit line)                        │
├─────────────────────────────────────────────┤
│ ⚠️  WARNINGS:                               │
│ • Exceeds Xmax below 28Hz at 500W          │
│ • Recommend 300W max for clean bass        │
│                                             │
│ [Compare] [Save] [Share] [Export PNG]      │
└─────────────────────────────────────────────┘
```

## Current State

### What We Have
- ✓ Driver database (50+ drivers, UMII18-22 verified)
- ✓ Basic models (Driver, SealedBox, PortedBox)
- ✓ Alignment calculator (Butterworth, Bessel, QB3, etc.)
- ✓ WinISD reference data for validation
- ✓ Architecture designed (foundation + pragmatic)
- ✓ Foundation playground (theory explorer)

### What's Missing
- Main app UI (currently just calculator prototypes)
- Interactive graphs (using Chart.js or similar)
- Maximum power calculator (started, needs refinement)
- Excursion calculator (started, needs refinement)
- Comparison view
- Driver browser/search
- Mobile responsive design

## Next Steps (Pick Your Priority)

### Option A: **Build Main UI**
Create the actual app layout with real controls and placeholders for graphs.
**Value**: See the vision come to life, easier to demo

### Option B: **Perfect the Graphs**
Implement beautiful, interactive Chart.js visualizations for FR, Max Power, Excursion.
**Value**: Core differentiation, most impressive feature

### Option C: **Driver Database UI**
Build browsing/filtering/comparison for drivers.
**Value**: Helps users find right driver for their needs

### Option D: **Comparison View**
Side-by-side design comparison (2-4 designs).
**Value**: Shows trade-offs visually, big UX win

### Option E: **Refine Calculators**
Get maximum power and excursion calculations matching WinISD exactly.
**Value**: Credibility, but can wait until later

## Design Principles

1. **Show, Don't Tell** - Graphs over numbers
2. **Warn Early** - Catch problems before building
3. **Compare Everything** - Side-by-side is powerful
4. **No Surprises** - Be honest about limitations
5. **Fast Iterations** - Sliders, live updates, responsive
6. **Mobile First** - Works on phone/tablet
7. **Foundation First** - Clean code, maintainable, testable

## Success Metrics

A user should be able to:
1. Pick a driver from database in < 30 seconds
2. See an optimal box design in < 10 seconds
3. Understand power limitations within 5 seconds of looking at graphs
4. Compare 3 drivers in < 1 minute
5. Know "will this work?" with confidence

## Technical Notes

- Foundation library uses pure functions (easy to test)
- Pragmatic library uses classes (convenient for UI)
- Both libraries work in browser (no build step required for prototyping)
- Can add TypeScript later for better DX
- Consider web worker for calculations if UI lags
- Chart.js for graphs (responsive, interactive, looks good)

## Remember

**We're prototyping for USER VALUE, not formula perfection.**

- Focus on UX and visualizations
- Formulas can be wrong - structure matters
- Build what shows the vision
- Refine calculations later with proper sources
- Foundation/pragmatic split = maintainability win

---

*"The best speaker calculator shows you why your design will fail before you waste time building it."*
