// Loudspeaker Foundation Library
//
// Pure Thiele-Small theory from published papers.
// All functions cite source papers and equation numbers.
//
// See papers/README.md for bibliography and implementation status.
// See lib/future/README.md for known gaps and planned extensions.
//
// NOTE: We use namespaced exports to avoid collisions (e.g., both Small1972
// and Small1973 have calculateGroupDelay with different signatures).

// Physical constants (safe to spread - no collisions)
export * from './constants.js';

// Utilities (safe to spread - unique names)
export * from './utils.js';

// Paper implementations - namespaced to avoid collisions
export * as Small1972 from './small-1972.js';
export * as Thiele1971 from './thiele-1971.js';
export * as Small1973 from './small-1973.js';

// Extended models - namespaced
export * as Klippel from './klippel/index.js';
export * as Sensitivity from './sensitivity.js';
export * as Boundary from './boundary.js';
export * as PortCompression from './vented/port-compression.js';
