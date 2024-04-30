/**
 * Engineering Layer - Paper-Close Approximations
 *
 * Barrel export for all engineering approximations.
 *
 * See README.md for philosophy and validation approach.
 */

// Power limits (function-first API)
// Returns functions: (frequency) => result
// Use for: tests, verification, UI sampling
export * from './power-limits.js';

// Displacement calculations
export * from './displacement.js';
