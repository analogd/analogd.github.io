# Foundation Library

Reference implementations of Thiele-Small loudspeaker theory.

## Paper-Pure Implementations

Equations directly from published papers. Every function is verifiable against the source.

- **small-1972.js** - Small, R.H. "Closed-Box Loudspeaker Systems" JAES Vol. 20, 1972 - Sealed enclosure design.
- **thiele-1971.js** - Thiele, A.N. "Loudspeakers in Vented Boxes" JAES Vol. 19, 1971 - Alignment theory (Butterworth, Bessel, Chebyshev, QB3).
- **small-1973.js** - Small, R.H. "Vented-Box Loudspeaker Systems" Parts I-IV, JAES Vol. 21, 1973 - Ported enclosure design - 4th-order transfer function, port design, impedance measurement, alignments, loss modeling.

## Derived Tools

Built on the paper equations.

- **sensitivity.js** - Numerical differentiation for "what if" analysis
- **comparison.js** - Sealed vs ported side-by-side
- **bandpass.js** - 4th/6th order bandpass designs
- **boundary.js** - Room loading effects

## Placeholders

- **geddes.js** - Port compression (Geddes 1989-2003) - not yet implemented
- **klippel.js** - Nonlinear models (Klippel 1992-2006) - not yet implemented

## Usage

```javascript
import { designPortedBox, calculatePortLength, calculatePortArea } from './small-1973.js';

const driver = { fs: 30, qts: 0.5, vas: 0.150 };
const design = designPortedBox(driver, 'QB3');

const portDiameter = 0.10;  // 10cm
const portArea = calculatePortArea(portDiameter);
const portLength = calculatePortLength(design.vb, design.fb, portArea, portDiameter);

console.log(`Box: ${(design.vb * 1000).toFixed(1)}L @ ${design.fb.toFixed(1)}Hz`);
console.log(`Port: ${(portDiameter * 100).toFixed(0)}cm dia, ${(portLength * 100).toFixed(1)}cm long`);
```

## Philosophy

Paper-pure files are verifiable against source equations. Derived tools are clearly separated. Structure mirrors the papers. Comprehensive test suite validates correctness.

## Citations

**Foundation Papers:**
- Thiele, A. Neville. "Loudspeakers in Vented Boxes: Parts I & II" JAES Vol. 19, 1971 ([PDF](../../papers/Thiele_1971_Vented_Boxes_Parts_I-II.pdf))
- Small, Richard H. "Closed-Box Loudspeaker Systems" JAES Vol. 20, 1972 ([PDF](../../papers/Small_1972_Closed_Box.pdf))
- Small, Richard H. "Vented-Box Loudspeaker Systems" Parts I-IV, JAES Vol. 21, 1973 ([PDF](../../papers/Small_1973_Vented_Box_Parts_I-IV.pdf))

**Future Extensions:**
- Geddes, Earl. "Acoustic Waveguide Theory Revisited" ([PDF](../../papers/Geddes_Acoustic_Waveguide_Theory_Revisited.pdf))
- Klippel, Wolfgang. "Loudspeaker Nonlinearities—Causes, Parameters, Symptoms" 2006 ([PDF](../../papers/Klippel_2006_Loudspeaker_Nonlinearities.pdf))

**Industry Standards:**
- CEDIA/CTA RP22 "Immersive Audio Design" v1.2, 2023 ([PDF](../../papers/CEDIA-CTA_RP22_Immersive_Audio_Design_v1.2_2023.pdf))
