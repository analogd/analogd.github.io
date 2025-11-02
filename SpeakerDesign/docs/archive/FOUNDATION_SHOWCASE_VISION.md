# Foundation Library Showcase Vision

## The Core Insight

**The foundation library isn't just infrastructure - it's a research artifact!**

You've translated 50+ years of acoustic research (Small 1973, 1972, Thiele 1971) into executable, tested, cited code. That deserves to be showcased independently, not buried under UI layers.

**Value proposition:**
- 🎓 **Students**: Learn acoustics with executable equations
- 🔬 **Researchers**: Validate models, check calculations
- 🛠️ **Engineers**: Reference implementation for their tools
- 🔊 **DIYers**: Understand the math behind speaker design

---

## Showcase Architecture

```
foundation.analogd.dev/                    ← Landing page
├── papers/                                ← Source papers & context
│   ├── small-1973/                       ← Full paper analysis
│   │   ├── index.html                    ← Paper overview
│   │   ├── coverage.html                 ← 45% coverage map
│   │   └── sections/                     ← Section-by-section
│   ├── small-1972/
│   └── thiele-1971/
│
├── explorer/                              ← Interactive function explorer
│   ├── index.html                        ← Function browser
│   ├── small-1973.html                   ← All Small 1973 functions
│   ├── small-1972.html
│   └── thiele-1971.html
│
├── playground/                            ← Live code environment
│   ├── index.html                        ← REPL interface
│   └── examples/                         ← Pre-built examples
│       ├── sealed-butterworth.js
│       ├── ported-b4.js
│       └── impedance-measurement.js
│
├── gallery/                               ← Visual examples
│   ├── index.html                        ← Gallery grid
│   ├── response-curves.html              ← Interactive plots
│   ├── alignments.html                   ← Alignment comparison
│   └── impedance.html                    ← Impedance curves
│
├── tests/                                 ← Test suite as docs
│   └── index.html                        ← 191 tests, live results
│
└── api/                                   ← Optional REST wrapper
    └── docs/                             ← Swagger/OpenAPI
```

---

## Page Designs

### 1. Landing Page (`index.html`)

**Hero Section:**
```
┌─────────────────────────────────────────────────────────┐
│  LOUDSPEAKER FOUNDATION LIBRARY                          │
│  Executable implementations of classic acoustic research │
│                                                           │
│  [Explore Functions]  [Try Playground]  [View Papers]    │
└─────────────────────────────────────────────────────────┘

What is this?
50+ years of loudspeaker design research (Small, Thiele)
translated into rigorously tested JavaScript functions.

Coverage:
▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░ 45%
Small 1973: 43/96 equations (9/12 sections at 100%)
Small 1972: 14 functions (~90% coverage)
Thiele 1971: 5 functions (100% coverage)

Quality:
✅ 191 comprehensive tests (~90% passing)
✅ Every function cites source paper + equation
✅ Zero dependencies, pure functions
✅ Production-ready code

Recent work:
📝 Appendix 3: Loss measurement procedures (QLP, QA, QP)
📝 Section 8: Automated design synthesis (B4/C4/QB3)
📝 Section 7: Impedance-based parameter extraction
```

**Quick Examples:**
```javascript
// Design a sealed box
import * as Small1972 from './lib/foundation/small-1972.js';
const vb = Small1972.calculateButterworthVolume(driver.qts, driver.vas);
const f3 = Small1972.calculateF3(fc, qtc);

// Calculate ported response
import * as Small1973 from './lib/foundation/small-1973.js';
const response = Small1973.calculatePortedResponseDb(
    50, fs, fb, alpha, qt, ql
);  // Exact 4th-order transfer function

// Measure system from impedance
const params = Small1973.calculateAlphaFromImpedance(fH, fL, fB);
// No disassembly needed!
```

**Navigation Grid:**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 📚 Papers   │ 🔍 Explorer │ 🎮 Playground│ 🎨 Gallery  │
│ Source docs │ Browse 62   │ Live REPL   │ Visual      │
│ Coverage    │ functions   │ Try code    │ examples    │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

---

### 2. Function Explorer (`explorer/small-1973.html`)

**Layout:**
```
┌────────────────────┬────────────────────────────────────┐
│ FUNCTIONS (43)     │ calculatePortedResponseDb()        │
│                    │                                    │
│ Section 2: Basic   │ Calculate frequency response in dB │
│ ✓ calculateTuning  │                                    │
│ ✓ calculatePort    │ 📖 Source:                         │
│                    │ Small 1973, Part I, Eq. 13, p.319  │
│ Section 3: Losses  │                                    │
│ ✓ calculateAbsorp  │ 📐 Formula:                        │
│ ✓ calculatePortFr  │ |H(f)| = ... (LaTeX rendered)      │
│ ✓ calculateCombin  │                                    │
│                    │ 📥 Parameters:                     │
│ Section 4: Response│ • f: frequency (Hz)                │
│ ▶ calculatePorted  │ • fs: driver resonance (Hz)        │
│   ├─ Db ✓         │ • fb: box tuning (Hz)              │
│   ├─ Magnitude ✓  │ • alpha: Vas/Vb ratio              │
│   ├─ Phase ✓      │ • qt: driver Q                     │
│   └─ Complex ✓    │ • ql: enclosure Q (default: ∞)     │
│                    │                                    │
│ [Search...]        │ 🧮 Try It:                         │
│                    │ ┌────────────────────────────────┐ │
│                    │ │ f:  50    Hz                   │ │
│                    │ │ fs: 22    Hz                   │ │
│                    │ │ fb: 22    Hz                   │ │
│                    │ │ alpha: 2.0                     │ │
│                    │ │ qt: 0.4                        │ │
│                    │ │ ql: 7                          │ │
│                    │ │                                │ │
│                    │ │ [Calculate]                    │ │
│                    │ └────────────────────────────────┘ │
│                    │                                    │
│                    │ 📤 Result: +2.3 dB                 │
│                    │                                    │
│                    │ 💻 Code:                           │
│                    │ ```js                              │
│                    │ import { calculatePortedResponseDb │
│                    │ } from './small-1973.js';          │
│                    │                                    │
│                    │ const responseDb = calculate...    │
│                    │ ```                                │
└────────────────────┴────────────────────────────────────┘
```

**Features:**
- ✅ Hierarchical function tree (by paper section)
- ✅ Live search/filter
- ✅ Click function → see full docs
- ✅ LaTeX-rendered equations
- ✅ Interactive calculator for each function
- ✅ Copy code snippet
- ✅ Link to source code on GitHub
- ✅ Link to paper citation
- ✅ Related functions

---

### 3. Playground (`playground/index.html`)

**Interactive REPL:**
```
┌──────────────────────────────────────────────────────────┐
│ 🎮 FOUNDATION LIBRARY PLAYGROUND                          │
├──────────────────────────────────────────────────────────┤
│ Examples: [Sealed Box] [Ported Box] [Impedance] [Custom] │
├──────────────────────────────────────────────────────────┤
│ CODE EDITOR:                                              │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ import * as Small1973 from './foundation/small-1973' │ │
│ │                                                       │ │
│ │ // Design a B4 ported box                            │ │
│ │ const driver = {                                     │ │
│ │     fs: 22.0,                                        │ │
│ │     qts: 0.530,                                      │ │
│ │     vas: 0.2482  // m³                               │ │
│ │ };                                                   │ │
│ │                                                       │ │
│ │ const design = Small1973.designPortedBox(            │ │
│ │     driver,                                          │ │
│ │     'B4',                                            │ │
│ │     { ql: 7 }                                        │ │
│ │ );                                                   │ │
│ │                                                       │ │
│ │ console.log('Box volume:', design.vb, 'liters');     │ │
│ │ console.log('Port length:', design.port.length, 'cm');│ │
│ │                                                       │ │
│ │ // Calculate response                                │ │
│ │ const freqs = [10, 20, 30, 40, 50, 100];            │ │
│ │ const response = freqs.map(f =>                      │ │
│ │     Small1973.calculatePortedResponseDb(             │ │
│ │         f, driver.fs, design.fb, design.alpha,       │ │
│ │         driver.qts, 7                                │ │
│ │     )                                                │ │
│ │ );                                                   │ │
│ │                                                       │ │
│ │ plot(freqs, response);  // Built-in plotting         │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                           │
│ [▶ Run]  [💾 Save]  [🔗 Share]  [📋 Copy]               │
├──────────────────────────────────────────────────────────┤
│ OUTPUT:                                                   │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Box volume: 150.2 liters                             │ │
│ │ Port length: 42.3 cm                                 │ │
│ │                                                       │ │
│ │ [Response Plot]                                      │ │
│ │  0 dB ┤         ▄▄▄▄▄▄▄▄▄▄▄▄                         │ │
│ │ -3 dB ┤      ▄▄▀              ▀▄▄                    │ │
│ │ -6 dB ┤    ▄▀                    ▀▄                  │ │
│ │-10 dB ┤  ▄▀                        ▀▄                │ │
│ │-20 dB ┤▄▀                            ▀▄              │ │
│ │       └────────────────────────────────              │ │
│ │       10Hz    30Hz    100Hz   300Hz                  │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Features:**
- ✅ Monaco editor (VS Code in browser)
- ✅ Live execution
- ✅ Pre-loaded examples (dropdown)
- ✅ Built-in plotting (Chart.js or similar)
- ✅ Console output
- ✅ Save/share snippets (URL encoding or GitHub Gist)
- ✅ Error highlighting

---

### 4. Gallery (`gallery/index.html`)

**Visual showcase:**
```
┌─────────────────────────────────────────────────────────┐
│ 🎨 FOUNDATION GALLERY                                    │
│ Visual demonstrations of acoustic principles            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ┌──────────────────┐  ┌──────────────────┐             │
│ │ Alignment        │  │ Port Tuning      │             │
│ │ Comparison       │  │ Effects          │             │
│ │                  │  │                  │             │
│ │ [Interactive]    │  │ [Interactive]    │             │
│ │ Compare B4, C4,  │  │ See how fb/fs    │             │
│ │ QB3, sealed      │  │ affects response │             │
│ └──────────────────┘  └──────────────────┘             │
│                                                          │
│ ┌──────────────────┐  ┌──────────────────┐             │
│ │ Enclosure Losses │  │ Group Delay      │             │
│ │ QL Effects       │  │ Visualization    │             │
│ │                  │  │                  │             │
│ │ [Interactive]    │  │ [Interactive]    │             │
│ │ Adjust QL, see   │  │ Explore phase    │             │
│ │ response change  │  │ linearity        │             │
│ └──────────────────┘  └──────────────────┘             │
│                                                          │
│ ┌──────────────────┐  ┌──────────────────┐             │
│ │ Impedance        │  │ Power Limits     │             │
│ │ Measurement      │  │ Calculator       │             │
│ │                  │  │                  │             │
│ │ [Interactive]    │  │ [Interactive]    │             │
│ │ Upload curve,    │  │ Xmax vs SPL      │             │
│ │ extract params   │  │ tradeoffs        │             │
│ └──────────────────┘  └──────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

Each gallery item:
- Interactive sliders/controls
- Real-time calculation
- Visual output (charts)
- Explanation of principles
- Link to source functions
- Code snippet

---

### 5. Papers (`papers/small-1973/index.html`)

**Paper analysis page:**
```
┌─────────────────────────────────────────────────────────┐
│ Small 1973: "Vented-Box Loudspeaker Systems"            │
│ Journal of the Audio Engineering Society, Parts I-IV    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 📊 Implementation Coverage: 43/96 equations (45%)       │
│                                                          │
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░ 45%                             │
│                                                          │
│ ✅ Part I: Small-Signal Analysis                        │
│    Section 2: Basic Analysis ──────────── 100% (5/5)    │
│    Section 3: Enclosure Losses ────────── 100% (3/3)    │
│    Section 4: Response ────────────────── 100% (8/8)    │
│                                                          │
│ ✅ Part II: Efficiency and Power                        │
│    Section 5: Efficiency ──────────────── 100% (3/3)    │
│    Section 6: Large-Signal ────────────── 100% (5/5)    │
│                                                          │
│ ✅ Part III: System Design                              │
│    Section 7: Parameter Measurement ──── 100% (3/3)    │
│    Section 8: Design Methods ──────────── 100% (1/1)    │
│                                                          │
│ ✅ Part IV: Appendices                                  │
│    Appendix 1: Alignments ─────────────── 100% (8/8)    │
│    Appendix 2: Impedance ──────────────── 100% (3/3)    │
│    Appendix 3: Loss Measurement ───────── 100% (3/3)    │
│                                                          │
│ ⏳ Remaining: ~53 equations (advanced topics)           │
│                                                          │
│ [View Section Details] [See All Functions]              │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ Key Contributions:                                       │
│ • 4th-order transfer function (Eq. 13) - THE HEART      │
│ • Impedance-based measurement (no disassembly!)         │
│ • Systematic alignment design (B4, C4, QB3)             │
│ • Loss modeling (QA, QP, QL)                            │
│                                                          │
│ 📄 Original Paper: [PDF] [AES Link]                     │
│ 💻 Implementation: [GitHub] [Explorer]                  │
└─────────────────────────────────────────────────────────┘
```

---

### 6. Tests as Documentation (`tests/index.html`)

**Live test runner:**
```
┌─────────────────────────────────────────────────────────┐
│ 🧪 FOUNDATION TEST SUITE                                │
│ 191 tests, executable specifications                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ▶ Small 1973 Tests (178 tests)         [Run All]        │
│   ▶ Section 2: Basic Analysis (5 tests)                 │
│     ✅ Port length calculation                          │
│     ✅ Tuning ratio validation                          │
│     ✅ Port area for rectangular ports                  │
│     ...                                                  │
│                                                          │
│   ▼ Section 4: Response (53 tests)                      │
│     ✅ Transfer function magnitude                      │
│        Test: B4 alignment @ 50Hz                        │
│        Expected: +2.3 dB                                │
│        Got: +2.3 dB ✅                                   │
│        [View Code] [Run Test]                           │
│                                                          │
│     ✅ Phase response accuracy                          │
│     ✅ Group delay calculation                          │
│     ...                                                  │
│                                                          │
│   ▶ Appendix 3: Loss Measurement (13 tests)             │
│     ✅ measureLeakageQ: Valid bandwidth                 │
│     ✅ measureAbsorptionQ: Differential                 │
│     ...                                                  │
│                                                          │
│ ▶ Small 1972 Tests (61 tests)          [Run All]        │
│ ▶ Thiele 1971 Tests (20 tests)         [Run All]        │
│                                                          │
│ Summary: 172/191 passing (90%)                          │
└─────────────────────────────────────────────────────────┘
```

**Why tests as docs?**
- ✅ Executable specifications
- ✅ Show expected behavior
- ✅ Validate your own calculations
- ✅ Learn by example

---

## API Layer (Optional)

**For those who want REST instead of JavaScript:**

```
GET /api/v1/small1973/response
  ?f=50&fs=22&fb=22&alpha=2&qt=0.4&ql=7

Response:
{
  "responseDb": 2.3,
  "method": "Small 1973, Eq. 13",
  "parameters": {
    "f": 50, "fs": 22, "fb": 22,
    "alpha": 2.0, "qt": 0.4, "ql": 7.0
  }
}
```

**Swagger UI at `/api/docs`** with:
- All 62 functions as endpoints
- Interactive "Try it" interface
- Code generation (curl, Python, JS)
- Response schemas

**But honestly?** The JavaScript lib is probably better for most users. REST API adds latency, server dependency, rate limits. Direct function calls are instant, offline-capable, zero-cost.

---

## Implementation Plan

### Phase 1: Landing + Explorer (1-2 sessions)
1. Create `foundation.html` (landing page)
2. Create `explorer/index.html` (function browser)
3. Generate function docs from code (JSDoc → HTML)
4. Add LaTeX rendering (KaTeX)
5. Add interactive calculators per function

### Phase 2: Playground (1 session)
1. Create `playground/index.html` (REPL)
2. Integrate Monaco editor
3. Add example snippets
4. Add plotting capability
5. Implement save/share

### Phase 3: Gallery + Papers (1 session)
1. Create visual examples with sliders
2. Create paper coverage pages
3. Link implementations to paper sections
4. Add PDF links (if legally permissible)

### Phase 4: Polish (1 session)
1. Mobile responsiveness
2. Dark mode
3. Search functionality
4. Performance optimization
5. Analytics (optional)

---

## Tech Stack (Minimalist)

**Zero build step, pure HTML/JS/CSS:**
- ✅ No React, Vue, etc. (keep it simple)
- ✅ Monaco Editor (VS Code in browser) for playground
- ✅ KaTeX (LaTeX rendering) for equations
- ✅ Chart.js (plotting) for visuals
- ✅ Vanilla JS for everything else

**Why?**
- Fast to build
- Fast to load
- Works on GitHub Pages
- No maintenance burden
- Inspectable code

---

## Future Extensions

### When you add Klippel Large Signal:
```
foundation.analogd.dev/
├── papers/
│   ├── small-1973/          ✅ Done
│   ├── small-1972/          ✅ Done
│   ├── thiele-1971/         ✅ Done
│   └── klippel-2004/        ⭐ NEW!
│       ├── index.html
│       ├── coverage.html
│       └── nonlinear-models.html
│
├── explorer/
│   ├── small-1973.html      ✅ Done
│   └── klippel-2004.html    ⭐ NEW!
│
└── gallery/
    ├── alignments.html      ✅ Done
    └── distortion.html      ⭐ NEW! (nonlinear)
```

**Same pattern, scales infinitely!**

---

## Value Proposition

**For Students:**
"Learn acoustics with executable code. Every equation cited, tested, visual."

**For Researchers:**
"Reference implementation of classic papers. Validate your models, check calculations."

**For Engineers:**
"Production-ready acoustic functions. Use directly or reference for your tools."

**For DIYers:**
"Understand the math behind speaker design. No black boxes, full transparency."

---

## Next Steps

Want to start with:
1. **Landing page** (foundation.html) - Quick win, sets the tone
2. **Function explorer** (explorer/small-1973.html) - Most useful
3. **Playground** (playground/index.html) - Most fun

Which sounds best to start?
