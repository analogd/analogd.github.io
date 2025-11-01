# Speaker Design Calculator

**First-principles speaker enclosure design tool**

Built on validated Thiele-Small physics with comprehensive testing.

## Quick Start

### Run Tests (67/67 passing)
```bash
python3 -m http.server 8000
open http://localhost:8000/lib/test/run-tests.html
```

### Run Application
```bash
python3 -m http.server 8000
open http://localhost:8000/ui/index.html
```

## Project Structure

```
/lib/                          Core physics library
  /models/                     Driver, SealedBox, PortedBox
  /calculators/                Alignment, SPL, MaxPower
  /test/                       Test suite (67 tests)
  
/ui/                           Application
  index.html                   Main app
  driver-browser.html          Driver discovery
  compare.html                 Design comparison
  
/data/                         Driver database
  drivers.json                 50+ drivers
```

## Documentation

- **VISION.md** - Project vision and goals
- **FORMULA_STATUS.md** - Validation status of all formulas
- **CODEBASE_AUDIT.md** - Complete codebase analysis
- **CLEANUP_SUMMARY.md** - Recent cleanup details
- **FSC_INVESTIGATION.md** - Fsc discrepancy analysis

## Test Coverage

- **Driver Model**: 12/12 tests ✅ HIGH confidence
- **SealedBox Model**: 14/14 tests ✅ HIGH confidence
- **AlignmentCalculator**: 15/15 tests ✅ HIGH confidence
- **SPLCalculator**: 10/10 tests ✅ MEDIUM-HIGH confidence
- **MaxPowerCalculator**: 16/16 tests ✅ MEDIUM confidence

**Total: 67/67 tests passing (100%)**

## Features

- **Driver Database** - 50+ drivers with T-S parameters
- **Box Calculations** - Sealed and ported enclosures
- **Standard Alignments** - Butterworth, Bessel, Chebychev, QB3
- **Power Limiting** - Excursion and thermal limits
- **SPL Calculations** - Multi-power frequency response
- **Real-World Warnings** - "Don't build garbage"

## Confidence Levels

### HIGH (Production Ready)
- Driver T-S parameter handling
- Sealed box calculations (Small 1972)
- Standard alignments (Thiele 1971)

### MEDIUM (Good Enough, Can Improve)
- SPL sensitivity calculations (±3dB)
- Ported box response (simplified model)
- Max power curve structure

### LOW (Needs Work)
- Excursion calculation (simplified, empirical)

## Built With

- Vanilla JavaScript (no build step)
- Chart.js for graphs
- Zero-dependency test framework
- LocalStorage for saved designs

## Philosophy

**First Principles**
- Build from documented theory (Small, Thiele papers)
- Test everything against known values
- Document confidence levels
- Show users real-world limitations

**User Value**
- Help users avoid bad designs
- Show excursion and thermal limits
- Explain trade-offs visually
- "Don't build garbage"

## License

Open source - TBD

## Status

✅ Complete working prototype
✅ Comprehensive test coverage
✅ Clean, maintainable codebase
✅ Ready for user testing
