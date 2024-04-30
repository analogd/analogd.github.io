/**
 * Vented Box Foundation - Vent-Specific Calculations
 *
 * This module provides calculations specific to vent implementations
 * (port and passive radiator), separate from the universal 4th-order
 * vented box response in small-1973.js.
 *
 * The key insight: both port and PR boxes use the same 4th-order
 * transfer function. They only differ in:
 * - How tuning is achieved (port length vs PR mass)
 * - What limits output (air velocity vs cone excursion)
 * - Loss mechanisms (port friction vs PR mechanical losses)
 */

export * as Port from './port.js';
export * as PassiveRadiator from './passive-radiator.js';
