# Foundation Library

Reference implementations of Thiele-Small loudspeaker theory.

## Paper-Pure Implementations

Equations directly from published papers. Every function is verifiable against the source.

- **small-1972.js** - Small, R.H. "Closed-Box Loudspeaker Systems" JAES Vol. 20, 1972
- **thiele-1971.js** - Thiele, A.N. "Loudspeakers in Vented Boxes" JAES Vol. 19, 1971
- **small-1973.js** - Small, R.H. "Vented-Box Loudspeaker Systems" Parts I-IV, JAES Vol. 21, 1973
- **klippel/** - Klippel, W. "Loudspeaker Nonlinearities" JAES 2006 (estimation models)

## Derived Tools

Built on the paper equations.

- **sensitivity.js** - Numerical differentiation for "what if" analysis
- **boundary.js** - Room loading effects
- **vented/port.js** - Port geometry, velocity, turbulence
- **vented/passive-radiator.js** - PR tuning, mass, excursion

## Philosophy

Paper-pure files are verifiable against source equations. Derived tools are clearly separated.
See `papers/README.md` for full paper coverage and `lib/future/README.md` for known gaps.
