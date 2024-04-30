/**
 * Models Layer - Validated Domain Objects
 *
 * Provides immutable, validated models for drivers and enclosures.
 * Once constructed, objects are guaranteed valid - no downstream validation needed.
 *
 * Architecture:
 *   Foundation (pure math) → Models (validated objects) → UI
 *
 * EXPORTS BY CATEGORY:
 *
 * 1. Core Physics Models (T-S based calculations)
 *    - Driver, DriverSpec, SealedBox, VentedBox, Port, PassiveRadiator
 *
 * 2. Isobaric (compound loading)
 *    - createIsobaricDriver, IsobaricWiring, analyzeIsobaricSuitability
 *
 * 3. Comparison Utilities (alignment analysis)
 *    - compareSealedAlignments, comparePortedAlignments, compareAllAlignments
 *
 * 4. Reference Data (measured commercial subs for comparison)
 *    - ReferenceSub, BUILTIN_REFERENCE_SUBS
 *    - NOTE: ReferenceSub holds MEASURED data, not physics calculations.
 *      Useful for comparing DIY theoretical output to real-world commercial products.
 *
 * Usage:
 * ```javascript
 * import { Driver, SealedBox, VentedBox, Port } from './lib/models/index.js';
 *
 * const driver = new Driver({ fs: 22, qts: 0.53, vas: 248, ... });
 * const sealed = SealedBox.butterworth(driver);
 * console.log(sealed.f3);  // -3dB point
 * ```
 */

// ============================================================================
// CORE PHYSICS MODELS
// ============================================================================

export { DriverSpec } from './DriverSpec.js';
export { Driver } from './Driver.js';
export { SealedBox } from './SealedBox.js';
export { VentedBox } from './VentedBox.js';
export { Port } from './vents/Port.js';
export { PassiveRadiator } from './vents/PassiveRadiator.js';

// ============================================================================
// ISOBARIC (COMPOUND LOADING)
// ============================================================================

export {
    createIsobaricDriver,
    IsobaricWiring,
    analyzeIsobaricSuitability,
    getIsobaricSensitivityLoss
} from './isobaric.js';

// ============================================================================
// COMPARISON UTILITIES
// ============================================================================

export {
    compareSealedAlignments,
    comparePortedAlignments,
    compareAllAlignments,
    compareVolumes,
    getParetoFrontier
} from './Comparison.js';

// ============================================================================
// REFERENCE DATA (measured commercial subs)
// ============================================================================
// ReferenceSub is NOT a physics model - it's a container for CEA-2010 measured
// data. Useful for comparing DIY theoretical calculations to real-world
// commercial products. The ~3-6dB gap between theoretical and measured is
// expected (real-world losses vs linear model).

export { ReferenceSub } from './ReferenceSub.js';
export {
    BUILTIN_REFERENCE_SUBS,
    getBuiltinSub,
    getBuiltinSubOptions
} from '../reference/subs.js';
