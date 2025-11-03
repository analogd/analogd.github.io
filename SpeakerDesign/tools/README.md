# Verification Tools - CLI Graph Generation

## Purpose

Generate comparison graphs directly from calculations without browser/UI overhead.

**Workflow**:
```bash
node tools/generate-comparison.js sealed 200L
# → Generates PNG with our calculations vs WinISD reference
# → Shows exact numerical differences
# → Fast iteration on formula tuning
```

## Tools

### `generate-comparison.js`
Main verification tool - generates side-by-side comparison graphs.

**Features**:
- Reads WinISD reference data (screenshots, extracted values)
- Runs our calculations (sealed/ported)
- Plots both on same graph with difference overlay
- Outputs PNG + numerical report
- Color codes: Green (within tolerance), Yellow (acceptable), Red (broken)

**Output**:
```
graphs/
├── sealed-200L-max-power-comparison.png
├── sealed-200L-max-spl-comparison.png
├── sealed-200L-cone-excursion-comparison.png
├── ported-600L-max-power-comparison.png
└── comparison-report.txt
```

### `plot-single.js`
Generate individual graphs from our calculations only (no WinISD comparison).

**Use cases**:
- Exploring parameter variations
- Debugging formula changes
- Understanding system behavior

**Example**:
```bash
node tools/plot-single.js sealed 200L --graph=maxPower --range=10-100Hz
# → graphs/sealed-200L-max-power.png
```

### `batch-verify.js`
Run all reference cases, generate comparison report.

**Output**: Summary table showing pass/fail for each test case.

---

## Technology Stack

**Option 1: Node.js + Chart.js (server-side)**
- Pros: Already familiar, same lib as UI might use
- Cons: Requires canvas package, heavier dependencies

**Option 2: Node.js + Plotly (node)**
- Pros: Scientific plotting, great for comparisons
- Cons: Another dependency

**Option 3: Python + Matplotlib (best for this use case)**
- Pros: Industry standard for scientific comparison plots
- Cons: Requires Python, data export from JS

**Option 4: gnuplot (minimal)**
- Pros: Lightweight, scriptable, no heavy dependencies
- Cons: Less pretty, more manual formatting

**Recommendation**: Start with Option 4 (gnuplot) for speed, upgrade to Plotly if needed.

---

## Implementation Plan

### Phase 1: Data Export (30 min)

Create `tools/export-calculation-data.js`:
```javascript
// Run calculation, export to JSON
const design = Cookbook.designSealedBox(driver, 'custom', { volume: 200 });
const data = {
    frequencies: design.powerLimits.fullCurve.map(p => p.frequency),
    maxPower: design.powerLimits.fullCurve.map(p => p.maxPower),
    limitingFactor: design.powerLimits.fullCurve.map(p => p.limitingFactor)
};
fs.writeFileSync('graphs/data/sealed-200L-calculated.json', JSON.stringify(data));
```

### Phase 2: WinISD Data Extraction (1 hour)

Create `tools/extract-winisd-data.js`:
```javascript
// Read screenshots with OCR or manual JSON files
// For now: Manual extraction to JSON (we already have some)
const winisdData = {
    frequencies: [10, 15, 20, 25, 30, 35, 40, 45, 50],
    maxPower: [400, 400, 450, 550, 700, 900, 1100, 1200, 1200]
};
```

### Phase 3: Plotting (1 hour)

Create `tools/plot-comparison.sh`:
```bash
#!/bin/bash
# Uses gnuplot to create comparison graph

gnuplot << EOF
set terminal png size 1200,800
set output 'graphs/sealed-200L-max-power-comparison.png'
set title 'Maximum Power: Our Code vs WinISD (Sealed 200L)'
set xlabel 'Frequency (Hz)'
set ylabel 'Power (W)'
set logscale x
set grid
set key left top

plot 'graphs/data/sealed-200L-calculated.json' using 1:2 with lines lw 2 title 'Our Code', \\
     'graphs/data/sealed-200L-winisd.json' using 1:2 with lines lw 2 title 'WinISD', \\
     'graphs/data/sealed-200L-diff.json' using 1:2 with lines lw 1 dt 2 title 'Difference'
EOF
```

### Phase 4: Automated Workflow (30 min)

```bash
# One command generates all comparisons
npm run verify:graphs
```

---

## File Structure

```
tools/
├── README.md (this file)
├── export-calculation-data.js    # Run our code, export JSON
├── extract-winisd-data.js        # Parse WinISD references to JSON
├── plot-comparison.sh            # gnuplot script
├── generate-comparison.js        # Main orchestrator
├── plot-single.js                # Single graph generator
├── batch-verify.js               # Run all test cases
└── templates/
    ├── max-power.gnuplot
    ├── max-spl.gnuplot
    └── cone-excursion.gnuplot

graphs/
├── data/                         # Exported JSON data
│   ├── sealed-200L-calculated.json
│   ├── sealed-200L-winisd.json
│   └── sealed-200L-diff.json
└── sealed-200L-max-power-comparison.png  # Output graphs

package.json:
{
  "scripts": {
    "verify:graphs": "node tools/generate-comparison.js --all",
    "plot": "node tools/plot-single.js"
  }
}
```

---

## Benefits for Development

### 1. Rapid Formula Iteration

```bash
# Edit displacement.js
vim lib/engineering/displacement.js

# Instantly see impact
npm run verify:graphs

# Check graphs/sealed-200L-max-power-comparison.png
# See if red zones turned yellow/green
```

### 2. Systematic Tuning

Test different corrections:
```javascript
// Try correction factor
const correctedPower = calculatedPower / 2.5;

// Generate graph
npm run plot -- sealed 200L --correction=2.5

// Compare multiple corrections side-by-side
```

### 3. Regression Prevention

Before committing:
```bash
npm run verify:graphs
git diff graphs/  # See if graphs changed unexpectedly
```

### 4. Documentation

Graphs become living documentation:
```markdown
# README.md
## Validation Status

![Sealed Max Power](graphs/sealed-200L-max-power-comparison.png)

Status: Within 30% at low freq, converges at high freq ✓
```

---

## Advanced Features (Later)

### Diff Heatmap
Color-code frequency regions by error magnitude:
- Green: <15% error
- Yellow: 15-30% error
- Red: >30% error

### Animation
Show how graphs change with parameter sweeps:
```bash
node tools/animate-parameter-sweep.js --param=Rms --range=1-50
# → graphs/rms-sweep.gif
```

### Batch Comparison Matrix
Test multiple drivers × multiple boxes:
```
         Sealed 100L  Sealed 200L  Ported 25Hz  Ported 30Hz
UM18-22    ✓ Pass      ⚠ 30%        ❌ Fail      ❌ Fail
W15GTX     ⚠ 25%       ✓ Pass       ⚠ 35%        ⚠ 40%
```

---

## Next Steps

1. **Create basic exporter** (30 min) - tools/export-calculation-data.js
2. **Manual WinISD data extraction** (30 min) - JSON files with values from graphs
3. **Simple gnuplot script** (30 min) - Plot both lines
4. **Iterate on sealed formula** (hours/days) - Tune until green
5. **Then tackle ported** (weeks) - Network solver

**Start simple**: Just get ONE graph (sealed max power) comparing our code to WinISD. Then expand.

Want me to build the initial exporter + plotter?
