# Project Architecture

## Layer Separation

```
┌─────────────────────────────────────────────────────────┐
│  SPEAKER BUILDER (Main SPA)                              │
│  User-friendly design tool                               │
│  - Forms, sliders, charts                                │
│  - Save/load designs                                     │
│  - Export results                                        │
│                                                           │
│  Credits: "Using Thiele-Small Lib [link]"               │
└────────────────────┬────────────────────────────────────┘
                     │ imports
┌────────────────────▼────────────────────────────────────┐
│  COOKBOOK LAYER (lib/cookbook/)                          │
│  High-level workflows                                    │
│  - designSealedBox(driver, alignment)                    │
│  - designPortedBox(driver, alignment)                    │
│  - User-friendly units (liters, cm)                      │
└────────────────────┬────────────────────────────────────┘
                     │ imports
┌────────────────────▼────────────────────────────────────┐
│  FOUNDATION LIBRARIES (lib/foundation/)                  │
│  Pure math, paper-cited implementations                  │
│                                                           │
│  Each lib has its own status page:                       │
│  - foundation.html ← Main showcase                       │
│  - Links to source papers                                │
│  - Function browser                                      │
│  - 191 tests                                             │
│                                                           │
│  Current libs:                                           │
│  ├─ small-1973.js   (43 funcs, 45% coverage)            │
│  ├─ small-1972.js   (14 funcs, ~90% coverage)           │
│  └─ thiele-1971.js  (5 funcs, 100% coverage)            │
│                                                           │
│  Future libs:                                            │
│  ├─ klippel-2004.js (large signal/distortion) TODO      │
│  └─ others...                                            │
└──────────────────────────────────────────────────────────┘
```

---

## Cross-Linking Strategy

### In the SPA (Speaker Builder):

**Footer or info panel:**
```html
<div class="foundation-credit">
    <strong>Acoustic Math:</strong>
    <a href="foundation.html">Thiele-Small Foundation Library</a>
    <span class="badge">43 functions, 191 tests</span>
</div>
```

**Tooltip on calculations:**
```
When user hovers over "F3: 28.0 Hz"
→ Show: "Calculated using Small1972.calculateF3()
         [View function →]"
```

**In settings/about:**
```
This tool uses rigorously tested implementations of:
• Small 1973 - Vented-Box Loudspeaker Systems (45% coverage)
• Small 1972 - Closed-Box Loudspeaker Systems (~90% coverage)
• Thiele 1971 - Loudspeakers in Vented Boxes (100% coverage)

[View Foundation Library →]
```

---

### In Foundation Library (foundation.html):

**Header:**
```html
<div class="used-by">
    <strong>Used by:</strong>
    <a href="index.html">Speaker Builder Tool</a>
</div>
```

**Benefits section:**
```
This library is used in production by:
• Speaker Builder - Interactive design tool
• [Your project here - PRs welcome!]
```

---

## File Structure

```
SpeakerDesign/
├── index.html              ← Speaker Builder SPA (main app)
├── foundation.html         ← Foundation library showcase
├── example.html            ← Simple usage examples
│
├── lib/
│   ├── foundation/         ← Pure math libraries
│   │   ├── small-1973.js
│   │   ├── small-1972.js
│   │   ├── thiele-1971.js
│   │   ├── constants.js
│   │   ├── index.js
│   │   ├── STATUS.md       ← Technical docs
│   │   └── SMALL_1973_INDEX.md
│   │
│   ├── cookbook/           ← High-level workflows (TODO)
│   │   ├── sealed-box-designer.js
│   │   ├── ported-box-designer.js
│   │   ├── measurement.js
│   │   └── index.js
│   │
│   └── test/               ← Test suite
│       ├── Foundation.test.js
│       └── run-foundation-tests.html
│
├── api/                    ← Optional REST API
│   └── v1/
│
└── docs/                   ← Documentation
    ├── ARCHITECTURE.md     ← This file
    ├── COOKBOOK_REFACTOR_PLAN.md
    ├── FOUNDATION_SHOWCASE_VISION.md
    └── PRACTICAL_PRIORITY.md
```

---

## User Journeys

### Journey 1: DIYer Building a Subwoofer

1. **Entry:** `index.html` (Speaker Builder)
2. **Action:** Enter driver specs, choose alignment, get results
3. **Curiosity:** Clicks "How is F3 calculated?"
4. **Deep dive:** Lands on `foundation.html`, sees Small 1972, Eq. 13
5. **Learning:** Explores related functions, runs tests
6. **Trust:** "Okay, the math is solid. Back to building!"

### Journey 2: Engineer Validating Tool

1. **Entry:** `foundation.html` (skeptical: "Is this accurate?")
2. **Inspection:** Sees paper citations, test coverage
3. **Validation:** Runs test suite, checks against known results
4. **Approval:** "Rigorous! I can use this."
5. **Usage:** Imports `small-1973.js` into their own project
6. **Contribution:** Files PR with additional tests

### Journey 3: Student Learning Acoustics

1. **Entry:** Google "Thiele-Small parameters calculator"
2. **Landing:** `foundation.html`
3. **Exploration:** Sees 43 functions, organized by paper section
4. **Study:** Reads Small 1973 PDF alongside implementations
5. **Experimentation:** Uses `example.html` to test understanding
6. **Mastery:** Builds own projects using foundation lib

---

## Benefits of This Architecture

### For the Foundation Library:
✅ **Standalone value** - Useful beyond just this app
✅ **Reusable** - Others can build on it
✅ **Maintainable** - Pure functions, well-tested
✅ **Educational** - Learn acoustics with executable code
✅ **Credible** - Paper citations build trust

### For the Speaker Builder:
✅ **Solid foundation** - Calculations are trustworthy
✅ **Transparent** - Users can verify the math
✅ **Marketing** - "Built on rigorously tested foundation lib"
✅ **Future-proof** - Can swap/upgrade lib versions
✅ **Focused** - SPA handles UX, lib handles math

### For Future Projects:
✅ **Klippel library** gets same treatment (status page, tests, docs)
✅ **Other apps** can use foundation libs
✅ **Contributors** know where to add improvements
✅ **Scalable** - Add new papers/libs without touching SPA

---

## Next Steps

1. ✅ **Foundation showcase done** - `foundation.html` is live
2. 🔨 **Add credits to SPA** - When we build/refactor it
3. 🔨 **Create cookbook layer** - Bridge foundation → SPA
4. ⏳ **Future: Klippel lib** - Same pattern, scales nicely

The foundation is now a **first-class artifact**, not hidden infrastructure!
