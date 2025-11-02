# Loudspeaker Foundation

**Pure Thiele-Small theory from published papers**

Zero dependencies, academically rigorous, fully tested JavaScript library for loudspeaker enclosure design.

## Quick Start

**Browser (GitHub Pages):**
```html
<script type="module">
import * as Small1972 from './lib/foundation/small-1972.js';
import * as Thiele1971 from './lib/foundation/thiele-1971.js';

// Dayton Audio UM18-22 V2 - Butterworth alignment
const driver = { fs: 22.0, qts: 0.530, vas: 0.2482 };
const vb = Thiele1971.calculateButterworthVolume(driver.qts, driver.vas);
console.log(`Box: ${(vb * 1000).toFixed(1)}L`);  // 318.0L
</script>
```

**Run tests:**
```bash
node lib/test/run-foundation-tests.mjs  # 73/73 tests passing
```

**Interactive examples:**
```bash
python3 -m http.server 8000
open http://localhost:8000/example.html
```

## What This Is

Foundation library implementing pure mathematics from published acoustics papers:

- ✅ Small 1972: Sealed box (Fc, Qtc, F3, η₀)
- ✅ Thiele 1971: Alignments (Butterworth, Bessel, Chebyshev, QB3)
- ✅ Small 1973: Ported box (Helmholtz, port length)
- ✅ 73 tests proving correctness
- ✅ Every function cites source equation
- ✅ SI units only (m³, Hz, Pa)
- ✅ Zero dependencies

[Full API Documentation →](lib/foundation/README.md)

## Project Structure

```
lib/foundation/              Foundation library (pure theory)
├── small-1972.js            Sealed box equations
├── thiele-1971.js           Alignment theory
├── small-1973.js            Ported box equations
├── README.md                API documentation
├── ROADMAP.md               Implementation status
└── CITATIONS.md             Bibliography

lib/test/
├── Foundation.test.js       73 tests
├── run-foundation-tests.html   Browser runner
└── run-foundation-tests.mjs    Node.js runner

example.html                 Interactive usage examples
api/                         REST API (local/serverless only)
```

## Test Coverage

**73/73 tests passing (100%)**

Categories:
- Physical constants (3)
- Small 1972 - Mathematical properties (24)
- Thiele 1971 - Alignment theory (7)
- Small 1973 - Ported box (8)
- Integration tests (6)
- Blackbox regression (6)
- Parameter validation (10)
- Edge cases (4)

Run: `node lib/test/run-foundation-tests.mjs`

## Validated Against

1. **Published tables** (Thiele 1971, Table II)
   - Butterworth: Qtc = 0.707 ✓
   - Bessel: Qtc = 0.577 ✓

2. **Real drivers**
   - Dayton Audio UM18-22 V2 in 318L → Qtc = 0.707 ✓

3. **Self-consistency**
   - Forward/inverse operations ✓
   - Physical constraints (η < 100%) ✓

## Drivers Tested

- Subwoofer: Dayton Audio UM18-22 V2 (Fs=22Hz, Qts=0.53, Vas=248L)
- Midbass: 10" (Fs=35Hz, Qts=0.45, Vas=70L)
- Midwoofer: 6.5" (Fs=45Hz, Qts=0.6, Vas=20L)

Valid ranges (enforced):
- Fs: 15-500 Hz
- Qts: 0.2-1.5

## Roadmap

**Phase 1 (Current):** ✅ Core T/S equations

**Phase 2 (Planned):**
- Impedance modeling (Leach)
- Large signal parameters (Klippel)
- Port compression (Roozen 2007)

[Complete Roadmap →](lib/foundation/ROADMAP.md)

## REST API

Optional API wrapper with Swagger UI.

**⚠️ Cannot run on GitHub Pages** (requires Node.js server)

Deploy to: Vercel, Netlify, AWS Lambda, or run locally

[API Documentation →](api/README.md)

## Philosophy

**Foundation = Immutable Mathematical Truth**

Contains ONLY equations from published literature. Every function cites source paper and equation number. No reverse-engineering, no magic numbers, no shortcuts.

**Separation:**
- **Foundation** (pure theory, SI units) ← This project
- **SpeakerPhysics** (pragmatic, user-friendly) ← Future
- **UI** (charts, validation) ← Future

## License

MIT

## Version

**0.1.0** - Core Thiele-Small equations

---

**Build from first principles. Trust through transparency.**
