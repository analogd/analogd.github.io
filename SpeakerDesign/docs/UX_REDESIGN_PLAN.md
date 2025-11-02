# BoxSmith UX Redesign - Two-Mode Architecture

**Date:** 2025-11-02
**Status:** Approved, Ready to Implement

## Vision

Build a speaker design tool that's **better than WinISD** by showing multiple design alternatives simultaneously without context switching. Enable rapid exploration through overlaid graphs and real-time comparison.

## Core Philosophy

**"More information at once, not flipping through views"**

- WinISD: 20 graphs in dropdown, single design, save/load workflow
- BoxSmith: Overlay multiple designs, compare at a glance, iterate rapidly

## Architecture: Two Modes

### Mode 1: Project View (Main Page)
**Purpose:** Compare multiple design alternatives
**User:** "I have a driver, what are my options?"

Features:
- Project contains up to 10 designs (all for same driver)
- Checkbox to show/hide designs in graphs (max 5 visible)
- Comparison table shows key metrics side-by-side
- Graphs overlay all checked designs with distinct colors
- Quick actions: [+ New Design] [Edit] [Fork] [Delete]

### Mode 2: Design Editor (Separate Page)
**Purpose:** Deep dive into single design
**User:** "Let me perfect this one design"

Features:
- Full-screen editor for one design
- Advanced controls (port count, materials, construction)
- Larger graphs (single design, more detail)
- Real-time calculation updates
- Save & Return to Project View

## Key Features

### 1. Multi-Design Overlay Graphs
**All graphs show all checked designs simultaneously:**
- Frequency Response - See which has better extension
- Max Power - See which limits first (excursion vs thermal)
- Cone Excursion - See which stays under Xmax
- Port Velocity - See which has chuffing risk

**Visual System:**
- Each design gets unique color from palette
- Legend shows: ● Design A, ● Design B, ● Design C
- Hover tooltip: "Design A: 98dB @ 30Hz"
- Limit lines (dashed): Xmax, 15 m/s, 20 m/s

### 2. Comparison Table
**At-a-glance metrics:**

| Design | F3 | MaxSPL@20Hz | Excursion@20Hz | Port Velocity | Status |
|--------|-----|-------------|----------------|---------------|--------|
| A: 330L P25 | 23Hz | 115dB | 8.2mm | 12 m/s ⚠️ | [Edit][Fork][×] |
| B: 330L P25×3 | 23Hz | 115dB | 8.2mm | 4 m/s ✓ | [Edit][Fork][×] |
| C: 200L Seal | 38Hz | 108dB | 12mm | - | [Edit][Fork][×] |

**Benefits:**
- See tradeoffs instantly (extension vs size vs output)
- Status indicators: ✓ Good, ⚠️ Warning, ❌ Problem
- Sortable by any column
- Click [Edit] → opens Design Editor for that design

### 3. Port Count Feature
**Critical for subwoofer design:**
- 1 port @ 10cm = 12 m/s (borderline chuffing)
- 3 ports @ 10cm = 4 m/s (no chuffing)
- Same tuning, same length per port
- Just divide the velocity by port count

**UI in Design Editor:**
```
Port Configuration:
├─ Count: [1▾] [2] [3] [4]
├─ Diameter: [10___] cm each
└─ Each: 35.2cm × 3 = 105.6cm total tube
```

### 4. Project Concept
**Project = Collection of designs for same driver**

```javascript
Project {
  id: 'project-123',
  name: 'Living Room Sub',
  driver: 'dayton-um18-22',
  designs: [
    { id: 'a', name: 'UM18 330L Ported', params: {...}, shownInGraph: true },
    { id: 'b', name: 'UM18 330L P25×3', params: {...}, shownInGraph: true },
    // ... up to 10 designs
  ]
}
```

**Why Projects?**
- Keeps related explorations together
- All designs share same driver (makes sense)
- Can save/load entire project
- Future: Multiple projects per user

### 5. URL Sharing & Import

**Share single design:**
```
boxsmith.app/design?driver=um18-22&type=ported&vol=330&tune=25&ports=3
```

**Friend clicks → Import Modal:**
```
┌────────────────────────────────┐
│ Import Design?                 │
│                                │
│ UM18-22 330L Ported (3 ports)  │
│                                │
│ ○ Start new project            │
│ ○ Add to current project       │
│ ○ Just view (don't save)       │
│                                │
│ [Import] [Cancel]              │
└────────────────────────────────┘
```

### 6. Auto-Naming Strategy

**Format:** `{driver-short} {volume}L {type} {distinguisher}`

Examples:
- "UM18 330L Ported" (first design)
- "UM18 330L Ported (3 ports)" (forked with port change)
- "UM18 400L Ported" (volume changed)
- "UM18 200L Sealed" (type changed)

User can rename inline (click name → edit).

## User Workflows

### Workflow 1: Size vs Extension Tradeoff
1. Load UMII18 driver (auto-loaded for development)
2. Calculate 330L ported @ 25Hz
3. Click "Try ±10%" → adds 297L and 363L designs
4. **All 3 designs appear on graphs overlaid**
5. Table shows: 297L F3=25Hz, 330L F3=23Hz, 363L F3=22Hz
6. User sees diminishing returns (70L more = only 1Hz gain)
7. Decides 330L is best value

### Workflow 2: Sealed vs Ported Decision
1. Calculate 330L ported @ 25Hz
2. Click [+ New Design] → "Try Sealed Equivalent"
3. Calculates 200L sealed (equivalent Qtc)
4. **Both designs overlaid on graphs**
5. Table reveals:
   - Ported: 115dB, F3=23Hz, 330L
   - Sealed: 108dB, F3=38Hz, 200L
6. Excursion graph shows sealed hits Xmax earlier
7. Informed decision: Ported for extension, Sealed for simplicity

### Workflow 3: Port Chuffing Fix
1. Design A: 330L ported, 1 port × 10cm
2. Table shows: Port velocity 18 m/s ⚠️
3. Click [Fork] → Design B
4. Click [Edit] on Design B → opens Design Editor
5. Change port count: 1 → 3
6. **Velocity updates: 18 m/s → 6 m/s ✓**
7. Click [Save & Return]
8. **Graphs now show both A and B overlaid**
9. Table shows: A=18 m/s ⚠️, B=6 m/s ✓
10. User chooses B (3 ports)

## Implementation Phases

### Phase 1: Project View Foundation (~8 hours)
- Project data structure
- Design list with checkboxes
- Comparison table
- Graph overlay system (modify GraphManager)
- Color palette per design

### Phase 2: Design Editor Page (~10 hours)
- New editor.html page
- Navigation: [Edit] → Editor, [Save] → Project View
- Port count feature (1-4 ports)
- Real-time calculation updates
- Larger graphs (single design)

### Phase 3: Integration (~6 hours)
- Project View ↔ Editor navigation
- URL import modal
- localStorage persistence
- "Try ±10%" quick variations

### Phase 4: Polish & UX (~6 hours)
- Development auto-load (UMII18)
- Auto-naming system
- Graph selection (max 5 visible)
- Inline rename designs

### Phase 5: Advanced Features (Future)
- Materials & construction tab
- Advanced port designer (flared, slot)
- Bill of materials
- Multiple projects management

## Design Decisions

### 1. Initial State
**Development:** Auto-load UMII18 with 330L ported design
**Production:** Empty project, show "Select driver to start"

### 2. Design Naming
**Auto-generate:** "UM18 330L Ported (3 ports)"
**User rename:** Click name → inline edit

### 3. Max Designs in Project
**Total:** 10 designs in project
**Visible:** 5 checked for graphs (prevent clutter)

### 4. Port Count Limits
**Current:** 1-4 ports (practical limit)
**Future:** Advanced port designer for slot ports, flared, etc.

### 5. URL Sharing
**Current:** Single design URL
**Future:** Project export/import (JSON file or cloud URL)

## Technical Architecture

### File Structure
```
ui/
├── index.html      → Project View (main page)
├── editor.html     → Design Editor (new)
├── app.js          → Project View logic (refactor)
├── editor.js       → Design Editor logic (new)
├── project.js      → Project data model (new)
├── graphs.js       → Chart rendering (modify for overlays)
└── styles.css      → Shared styles

lib/
├── models/
│   ├── Driver.js
│   ├── SealedBox.js
│   ├── PortedBox.js
│   └── Project.js  → New: Project class
└── calculators/
    ├── AlignmentCalculator.js
    ├── SPLCalculator.js
    ├── MaxPowerCalculator.js
    └── PortCalculator.js → New: Multi-port handling
```

### Data Structures

**Project:**
```javascript
{
  id: string,
  name: string,
  driver: string,  // Shared across designs
  designs: Design[]
}
```

**Design:**
```javascript
{
  id: string,
  name: string,  // Auto or user-named
  type: 'sealed' | 'ported',
  volume: number,  // Liters
  tuning: number | null,  // Hz (ported only)
  power: number,  // Watts
  portDiameter: number | null,  // cm
  portCount: number,  // 1-4
  shownInGraph: boolean,
  results: {
    f3: number,
    maxSpl20Hz: number,
    excursion20Hz: number,
    portVelocity: number | null,
    // ... all calculated values
    curves: {
      frequencyResponse: [...],
      maxPower: [...],
      excursion: [...],
      portVelocity: [...]
    }
  }
}
```

### Graph Overlay Implementation

**GraphManager modification:**
```javascript
// OLD: Single design
GraphManager.createFrequencyResponse(canvasId, data);

// NEW: Multiple designs
GraphManager.createFrequencyResponse(canvasId, designs);
// designs = [
//   { label: 'Design A', data: [...], color: '#58a6ff' },
//   { label: 'Design B', data: [...], color: '#39d353' },
// ]
```

**Each graph automatically overlays all designs with:**
- Distinct colors from palette
- Legend showing design names
- Hover tooltips: "Design A: 98dB @ 30Hz"
- Limit lines (Xmax, port velocity thresholds)

### Port Count Calculation

```javascript
// Multi-port calculation
function calculateMultiPortDesign(vb, fb, portDiameter, portCount) {
  const singlePortArea = calculatePortArea(portDiameter);
  const totalArea = singlePortArea * portCount;

  // Length is SAME for each port (all tuned to same Fb)
  const portLength = calculatePortLength(vb, fb, totalArea, portDiameter);

  // Velocity divides by port count
  const velocityPerPort = calculatePortVelocity(volumeVelocity, totalArea);

  return {
    portLength,  // cm per port
    velocityPerPort,  // m/s per port
    totalTubeLength: portLength * portCount
  };
}
```

## Success Metrics

✅ Can compare 5 designs overlaid on graphs simultaneously
✅ Comparison table shows key tradeoffs at a glance
✅ Design Editor allows deep dive with advanced features
✅ Port count feature correctly divides velocity
✅ URL sharing enables single-design import
✅ Auto-naming generates sensible defaults
✅ Development mode auto-loads test design
✅ Code remains maintainable and testable
✅ Foundation library (189 tests) remains single source of truth

## Future Enhancements

### Near-term (Next Iteration)
- Group delay graph (Foundation function exists)
- Impedance graph (needs Foundation work)
- "Try Alignments" quick action
- Multi-power excursion graph

### Medium-term
- Multiple projects per user
- Project export/import (JSON)
- Advanced port designer (flared, slot)
- Materials & construction modeling

### Long-term
- Cloud sync (requires backend)
- Collaborative projects (share with team)
- Driver database contributions
- Advanced optimization (genetic algorithms)

## Why This Design Wins

**vs WinISD:**
- No context switching (multiple designs visible simultaneously)
- No save/load project workflow (everything live)
- Interactive graphs (hover, toggle, zoom)
- Modern web UI (responsive, fast)

**vs Other Tools:**
- Trustworthy (189 tested Foundation functions)
- Transparent (traceable to papers)
- Extensible (clean architecture)
- Free & open source

**Core Advantage:**
**See all your design alternatives at once, understand tradeoffs instantly, make better decisions faster.**

---

## Implementation Notes

- Start with Phase 1 (Project View foundation)
- Keep Foundation library unchanged (already perfect)
- ES6 modules throughout (already converted)
- Chart.js for graphs (already working)
- localStorage for persistence (simple, no backend needed)
- Mobile support: Phase 6+ (not priority)

## Maintenance Strategy

- Foundation library: Paper-pure, never touch unless adding papers
- Model layer: Thin wrappers, delegate to Foundation
- UI layer: Clean separation, easy to modify
- Test coverage: 189 Foundation tests, add UI integration tests later
- Documentation: Keep this file updated as implementation evolves
