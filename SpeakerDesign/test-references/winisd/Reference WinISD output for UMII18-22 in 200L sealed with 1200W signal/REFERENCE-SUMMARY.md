# WinISD Reference Data Summary

**Configuration:** Dayton UMII18-22 in 200L sealed box with 1200W input
**Software:** WinISD Pro 0.7.0.950
**Date:** 2025-11-03

## Critical Discovery: Wrong Driver Parameters!

We were testing with **manufacturer datasheet values**, but WinISD uses **different parameters** (possibly measured or auto-calculated):

| Parameter | Our Tests | WinISD | Difference |
|-----------|-----------|--------|------------|
| Fs | 26.5 Hz | 22.0 Hz | -17% |
| Qts | 0.43 | 0.530 | +23% |
| Qes | 0.46 | 0.670 | +46% |
| Vas | 330 L | 248.2 L | -25% |
| Mms | 165 g | 420 g | +155% |
| BL | 23.5 | 38.4 | +63% |
| Re | 6.4 Ω | 4.2 Ω | -34% |
| Xmax | 18 mm | 28 mm | +56% |

**Impact:** These parameter differences significantly affect simulation results. We need to test with WinISD's exact values.

## System Configuration

- **Box Type:** Closed (sealed)
- **Box Volume:** 200.00 L
- **System Fc (Fsc):** 34.04 Hz
- **System Qtc:** 0.791
- **F-3dB:** ~34 Hz
- **Input Power:** 1200 W
- **Measurement Distance:** 1.0 m

## Key Validation Data

### Max Power Curve (14-graph-maximum-power.png)
The most critical graph for validating displacement calculations:

| Frequency | Max Power | Limiting Factor |
|-----------|-----------|-----------------|
| 10 Hz | ~400 W | Excursion |
| 20 Hz | ~475 W | Excursion |
| 30 Hz | ~700 W | Excursion |
| 40 Hz | ~1100 W | Excursion |
| 45 Hz | ~1200 W | **Transition** |
| 50 Hz+ | 1200 W | Thermal |

**Transition point:** 45 Hz (where excursion limit meets thermal limit)

### Our Current Results (WRONG parameters)
| Frequency | Our Calc | WinISD | Error |
|-----------|----------|--------|-------|
| 10 Hz | 129 W | 400 W | **-68%** |
| 20 Hz | 623 W | 475 W | +31% |
| Transition | 27 Hz | 45 Hz | **-18 Hz** |

The 10Hz error (-68%) suggests displacement formula is wrong, but testing with wrong parameters makes it worse.

### Max SPL Curve (15-graph-maximum-spl.png)
| Frequency | Max SPL @ 1m |
|-----------|--------------|
| 10 Hz | ~100 dB |
| 20 Hz | ~108 dB |
| 30 Hz | ~115 dB |
| 40 Hz | ~122 dB |
| 50 Hz+ | ~125 dB (plateau) |

### Cone Excursion (18-graph-cone-excursion.png)
At 1200W input power:
| Frequency | Excursion |
|-----------|-----------|
| 10 Hz | ~40 mm (exceeds Xmax) |
| 20 Hz | ~30 mm (exceeds Xmax) |
| 30 Hz | ~22 mm (below Xmax) |
| 40 Hz | ~15 mm |
| 50 Hz | ~10 mm |

Xmax limit: 28mm peak

### Impedance (19-graph-impedance.png)
| Frequency | Impedance |
|-----------|-----------|
| 10 Hz | ~8 Ω |
| 34 Hz (Fsc) | ~50 Ω (peak) |
| 100 Hz+ | ~4-5 Ω |

## Files Organized

### Driver Configuration (6 files)
- `01-driver-ts-parameters.png` + `.txt` - **CRITICAL: Contains correct params**
- `02-driver-advanced-parameters.png` + `.txt`
- `03-driver-dimensions.png`
- `04-options-environment.png`
- `05-options-plot-window.png`
- `06-driver-overview.png`

### Box Configuration (2 files)
- `07-box-configuration.png`
- `08-signal-configuration.png`

### Settings (2 files)
- `09-advanced-settings.png`
- `10-graph-type-menu.png`

### Graphs (10 files)
- `11-graph-transfer-function-magnitude.png` - Frequency response
- `12-graph-transfer-function-phase.png` - Phase response
- `13-graph-group-delay.png` - Group delay
- `14-graph-maximum-power.png` + `.txt` - **KEY VALIDATION GRAPH**
- `15-graph-maximum-spl.png` - Max SPL
- `16-graph-amplifier-apparent-load.png` - VA load
- `17-graph-spl.png` - SPL at 1200W
- `18-graph-cone-excursion.png` - Excursion at 1200W
- `19-graph-impedance.png` - Impedance magnitude
- `20-graph-impedance-phase.png` - Impedance phase

## Next Steps

1. **Update test with correct parameters:**
   - Use `WINISD-DRIVER-PARAMS.json` values
   - Rerun `reference-validation.test.js`
   - See if errors shrink

2. **If still failing:**
   - Displacement formula is fundamentally wrong
   - Study Small 1972 Section 2 on sealed box impedance
   - Check if Le (1.15mH) matters at 10-45Hz
   - Verify Zmech calculation

3. **Document progress:**
   - Track improvement as parameters are corrected
   - Capture before/after comparison
   - Build confidence in the fix

## Usage

```bash
# Test with CORRECT WinISD parameters
node test-references/reference-validation.test.js

# Should show much smaller errors once parameters are fixed
```
