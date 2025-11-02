/**
 * Cookbook Layer - High-Level Design Workflows
 *
 * 🍳 USER-FRIENDLY API
 *
 * One function call → complete loudspeaker design
 * Handles units, calls foundation + engineering layers
 * Returns comprehensive results ready for display
 *
 * Quick Start:
 * ```javascript
 * import * as Cookbook from './lib/cookbook/index.js';
 *
 * const driver = {
 *     fs: 22,
 *     qts: 0.53,
 *     vas: 248,    // liters
 *     qes: 0.56,
 *     xmax: 18,    // mm
 *     sd: 1140,    // cm²
 *     pe: 1200     // watts
 * };
 *
 * // Design sealed box
 * const sealed = Cookbook.designSealedBox(driver, 'butterworth');
 * console.log(`F3: ${sealed.box.f3}Hz, Volume: ${sealed.box.volume.liters}L`);
 *
 * // Design ported box
 * const ported = Cookbook.designPortedBox(driver, 'QB3', { portDiameter: 10 });
 * console.log(`F3: ${ported.box.f3}Hz, Port: ${ported.port.length.cm}cm`);
 *
 * // Compare options
 * const comparison = Cookbook.compareSealedVsPorted(driver);
 * console.log(`Recommendation: ${comparison.recommendation}`);
 * ```
 */

// Designers
export {
    designSealedBox,
    compareAlignments as compareSealedAlignments,
    designForF3
} from './sealed-box-designer.js';

export {
    designPortedBox,
    comparePortedAlignments,
    findOptimalPortedAlignment
} from './ported-box-designer.js';

// Comparison utilities
export {
    compareSealedVsPorted,
    compareAllAlignments,
    sensitivityAnalysis
} from './comparison.js';

// Unit conversions (for advanced users)
export * as Units from './units.js';
