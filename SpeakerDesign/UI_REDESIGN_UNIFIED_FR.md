# UI Redesign: Unified FR Graph with Limit Lines

## The Insight

For an **Ultimax 18 in 200L sealed box at 500W**:
- Max SPL is flat at ~125dB from 50Hz upwards (thermally limited)
- Max SPL tilts down below 50Hz, reaching ~98dB at 20Hz (excursion limited)

**Why?** The crossover happens where the two limit lines intersect:
- **Thermal limit line** (orange dashed): SPL0 + 10×log10(Pe) + response(f)
- **Excursion limit line** (red dashed): SPL0 + 10×log10(Pxmax) + response(f)

Where Pxmax(f) is the frequency-dependent power that causes Xmax displacement.

## Old Approach (Problematic)

**4 separate graphs**:
1. Frequency Response - showed SPL at 1W and amp power
2. Maximum Power - showed where thermal vs excursion limiting
3. Cone Excursion - showed displacement at amp power
4. SPL Ceiling - redundant with limit lines

**Problems**:
- User has to mentally correlate 4 graphs
- "SPL Ceiling" is just what the limit lines already show
- Redundant calculations (max power calculated 2x, excursion 2x)
- Ugly orchestration code in app.js

## New Approach (Clean)

**1 unified FR graph** with toggleable overlays:

### Always Shown:
1. **1W Reference** (blue thin dashed) - baseline response
2. **Amp Power** (green thick solid) - SPL at user's power
3. **Thermal Limit** (orange dashed) - Pe limit line
4. **Excursion Limit** (red dashed) - Xmax limit line

### Toggle Secondary Axis:
- **None** (default): Just SPL
- **+ Max Power**: Overlay max safe power curve (right axis)
- **+ Excursion**: Overlay cone displacement at amp power (right axis)

## What the Limit Lines Show

Looking at UM18-22 @ 500W in 200L:

```
SPL Graph:
125 dB |     _____________________ (Thermal limit - flat)
       |    /
120 dB |   /  ____500W line_______ (Amp power)
       |  /  /
115 dB | /  /
       |/  /
110 dB |  /
       | /_____________________ (Excursion limit - tilted down)
105 dB |/
       |
100 dB |
       |
 95 dB |____________
       10  20  50  100  200 Hz
```

**Key insight**: Where amp power line exceeds excursion limit (below ~40Hz), you're excursion limited. Where it's below thermal limit (above ~40Hz), you're thermally limited.

## Implementation

### Cookbook Integration

Old app.js (~400 lines of orchestration):
```javascript
// Manual calculation
const driver = new Driver(driverData.ts);
const box = new SealedBox(driver, boxVolume);

// Manual SPL calculation
const frCurves = SPLCalculator.generateMultiPowerCurves(box, [1, ampPower]);

// Manual limit calculation
const limits = {
    thermal: SPLCalculator.calculateThermalLimit(box),
    thermalFlat: SPLCalculator.calculateFlatEQThermalLimit(box),
    excursion: SPLCalculator.calculateExcursionLimit(box)
};

// Manual orchestration
GraphManager.createFrequencyResponse(...);
```

New app.js (~250 lines, cookbook-powered):
```javascript
// One-line design
const design = Cookbook.designSealedBox(driverData.ts, 'butterworth', {
    unit: 'liters',
    volume: boxVolume
});

// Design already contains:
// - design.response.frequencies
// - design.response.magnitudesDb
// - design.efficiency.spl0
// - design.powerLimits.thermal
// - design.powerLimits.excursionLimited (per-frequency)

// Build unified graph data
const graphData = buildUnifiedFRData(design, ampPower, secondaryMode);

// Single graph call
GraphManager.createUnifiedFrequencyResponse('frequencyResponseChart', graphData);
```

### Graph Data Structure

```javascript
{
    datasets: [
        // Base response curves
        { label: '1W Reference', data: [...], borderColor: '#58a6ff', borderDash: [3,3] },
        { label: '500W', data: [...], borderColor: '#39d353' },

        // Limit lines
        { label: 'Thermal Limit (Pe)', data: [...], borderColor: '#f0883e', borderDash: [5,5] },
        { label: 'Excursion Limit (Xmax)', data: [...], borderColor: '#ff7b72', borderDash: [5,5] },

        // Optional secondary axis
        { label: 'Max Power', data: [...], borderColor: '#d29922', yAxisID: 'y2' }
    ],
    secondaryMode: 'power' | 'excursion' | 'none'
}
```

## Benefits

1. **Immediate visual understanding** - see where thermal→excursion transition happens
2. **One graph does everything** - no mental correlation needed
3. **Clean code** - cookbook provides all data, no orchestration
4. **No redundant calculations** - calculate once, display multiple ways
5. **Extensible** - easy to add more overlays (port velocity, group delay, etc.)

## Remaining Work

1. ✅ Connect UI to cookbook
2. ✅ Create unified FR graph function
3. ⏳ Test with real data
4. ⏳ Remove old separate graph functions (maxPower, excursion, splCeiling)
5. ⏳ Update HTML to remove unnecessary graph panels

## Future Enhancements

- **Multi-design overlay**: Show 3 designs on same graph (different colors)
- **Port velocity limit line**: For ported boxes
- **Room gain estimate**: Show +3dB/octave below transition
- **Interactive limit lines**: Click to see what parameter change would shift the line
