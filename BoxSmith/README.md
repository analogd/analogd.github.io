# BoxSmith

Subwoofer enclosure design tool built from Thiele-Small theory. **Understanding over answers** - move a slider, watch 32 graphs react in real-time.

**[Live Demo](https://analogd.github.io/BoxSmith/ui/)** · Zero dependencies · 720 tests

## Try It

**Interactive UI:**
```bash
# Serve from repo root
python3 -m http.server 8080
# Open http://localhost:8080/BoxSmith/ui/
```

**As a library:**
```javascript
import { Driver, SealedBox, VentedBox, Port } from './lib/models/index.js';

const driver = new Driver({
    fs: 22, qts: 0.53, vas: 248,
    qes: 0.56, qms: 7.7, re: 6.4,
    xmax: 18, sd: 1140, pe: 1200
});

const sealed = SealedBox.butterworth(driver);
console.log(`${sealed.volumeLiters.toFixed(0)}L, F3: ${sealed.f3.toFixed(1)}Hz`);

const port = new Port({ diameter: 10, flared: true });
const vented = VentedBox.qb3(driver, port);
console.log(`${vented.volumeLiters.toFixed(0)}L @ ${vented.fb.toFixed(0)}Hz`);
```

## What's Here

```
BoxSmith/
├── ui/                      Interactive web app
│   ├── index.html           32 real-time graphs
│   ├── app.js               Main application
│   └── graphRegistry.js     Graph definitions
│
├── lib/                     Platform-independent library
│   ├── foundation/          Paper-pure implementations
│   │   ├── small-1972.js    Sealed box theory
│   │   ├── small-1973.js    Ported box theory
│   │   ├── thiele-1971.js   Alignments
│   │   └── klippel/         Nonlinear modeling
│   │
│   ├── models/              Domain objects
│   │   ├── Driver.js        T/S parameter validation
│   │   ├── SealedBox.js     2nd-order sealed
│   │   ├── VentedBox.js     4th-order vented (port or PR)
│   │   └── ...
│   │
│   ├── engineering/         Power & displacement limits
│   └── test/                720 tests
│
├── papers/                  Reference PDFs
└── CLAUDE.md                Development context
```

## Features

- **Enclosures**: Sealed, ported (port or passive radiator), isobaric
- **32 graphs**: Response, impedance, excursion, max SPL, group delay, phase, and more
- **DSP-era analysis**: "What breaks first when I EQ flat?"
- **Klippel modeling**: Compression and THD estimates from Xmax
- **Driver library**: Import/export/edit custom drivers
- **Reference comparison**: Compare against commercial subs

## Tests

```bash
node lib/test/run-all-tests.mjs
```

720 tests covering foundation equations, physics invariants, models, and API contracts.

## Constraints

Classical Thiele-Small with these assumptions:
- Small-signal (linear) behavior below Xmax
- Anechoic (free-field) conditions
- Lumped-parameter model (wavelength >> cone diameter)

Known simplifications documented in [lib/future/README.md](lib/future/README.md).

## References

- **Small 1972**: "Direct-Radiator Loudspeaker System Analysis"
- **Small 1973**: "Vented-Box Loudspeaker Systems" Parts I-IV
- **Thiele 1971**: "Loudspeakers in Vented Boxes"
- **Klippel 2006**: "Loudspeaker Nonlinearities"
- **[T/S Parameters Explained](https://www.youtube.com/watch?v=JdQ3mLU5zBE)** — excellent walkthrough of Thiele-Small parameters

See [papers/README.md](papers/README.md) for implementation coverage.

## Development

See [CLAUDE.md](CLAUDE.md) for architecture, principles, and development setup.

## License

MIT
