# BoxSmith Testing Checklist

## Quick Browser Test (5 minutes)

### 1. Load UI with Hard Refresh
```bash
# Server should already be running on port 3000
# If not: python3 -m http.server 3000
```

1. Open browser to: http://localhost:3000/ui/index.html
2. **Force hard refresh:** Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
   - This clears cached JavaScript and loads new ES6 modules
3. Open browser console (F12 or Cmd+Option+I)
4. Check for errors (should see none)

### 2. Verify Module Loading
Check browser console Network tab should show:
- ✅ app.js loads
- ✅ Driver.js loads
- ✅ SealedBox.js loads
- ✅ PortedBox.js loads
- ✅ AlignmentCalculator.js loads
- ✅ SPLCalculator.js loads
- ✅ MaxPowerCalculator.js loads
- ✅ graphs.js loads
- ✅ small-1972.js loads (Foundation!)
- ✅ small-1973.js loads (Foundation!)
- ✅ thiele-1971.js loads (Foundation!)
- ✅ constants.js loads

### 3. Basic Functionality Test
**Sealed Box Test:**
1. Select driver: "Dayton Audio UM18-22 v2"
2. Enclosure type: Sealed
3. Box volume: 200 liters
4. Amplifier power: 500W
5. Click "Calculate"

**Expected Results:**
- Qtc ≈ 0.93 (overdamped, shown in box parameters)
- Fc ≈ 36 Hz
- F3 ≈ 41 Hz
- 4 graphs render:
  - Frequency Response (3 curves: 1W, 100W, 500W)
  - Max Power (excursion limit vs thermal limit)
  - Cone Excursion (at 500W)
  - SPL Ceiling (maximum achievable)

**Ported Box Test:**
1. Same driver: "Dayton Audio UM18-22 v2"
2. Enclosure type: Ported
3. Box volume: 330 liters
4. Port tuning: 25 Hz
5. Amplifier power: 500W
6. Click "Calculate"

**Expected Results:**
- F3 ≈ 22-24 Hz (lower than sealed)
- Port length ≈ 35-45 cm (depends on 10cm diameter)
- Port velocity shown with status (should be "Good" or "Moderate")
- All 4 graphs render

### 4. Alignment Picker Test
1. Select any driver
2. Click "Alignments" button
3. Modal should open showing:
   - **Sealed:** Butterworth (Q=0.707), Bessel (Q=0.577), Chebychev (Q=1.0)
   - **Ported:** QB3 only (B4/C4 excluded due to known issue)
4. Click on an alignment
5. Box volume should update to calculated value
6. Parameters should match alignment (e.g., Butterworth → Qtc ≈ 0.707)

### 5. Branding Check
Verify UI shows:
- ✅ Browser tab title: "BoxSmith - Speaker Design Calculator"
- ✅ Header: "🔊 BoxSmith"
- ✅ Tagline: "Trustworthy calculations • Real-world limitations • No surprises"
- ✅ Footer: "BoxSmith • Built with 189 tested equations from Small 1972/1973 & Thiele 1971"

## Validation Test (Already Confirmed Working)

The test-module.html file proves ES6 modules work:
```bash
open http://localhost:3000/ui/test-module.html
```

Should display:
```
✓ Module loading works!
Driver created: Fs=30Hz, Qts=0.4
Derived sensitivity: [calculated value]
```

This validates the full import chain: test-module → Driver → small-1972 → constants

## Troubleshooting

**If you see "Loading drivers..." forever:**
- Check browser console for errors
- Verify data/drivers.json exists and loads
- Check network tab for failed requests

**If graphs don't render:**
- Verify Chart.js CDN loaded: https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js
- Check console for "GraphManager is not defined" errors

**If calculations seem wrong:**
- Open browser console
- Enable debug mode: `localStorage.setItem('debug', 'true')` then reload
- Check console logs for calculation details

**If you see "Cannot import" errors:**
- Hard refresh browser (Cmd+Shift+R)
- Clear browser cache
- Check that .js files have correct exports (they should after refactoring)

## Success Criteria

✅ No console errors
✅ All 4 graphs render with data
✅ Alignment picker works
✅ Parameters update correctly
✅ Port velocity calculation shows (ported mode)
✅ Warnings appear when appropriate (high port velocity, excursion limit, etc.)
✅ Branding shows "BoxSmith"

## If Everything Works...

You're ready to commit and deploy! The refactoring successfully:
- Eliminated all equation duplication
- Established Foundation library (189 tests) as single source of truth
- Converted to proper ES6 modules
- Addressed the #1 WinISD complaint: "I could not really trust WinISD calculations"

BoxSmith now has **trustworthy, tested, traceable calculations** backed by peer-reviewed papers.
