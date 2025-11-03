/**
 * Engineering Layer - Paper-Close Approximations
 *
 * Barrel export for all engineering approximations.
 *
 * See README.md for philosophy and validation approach.
 */

// Function-first API (v2 - RECOMMENDED for new code)
// Returns functions: (frequency) => result
// Use for: tests, verification, UI sampling
export * from './power-limits-v2.js';

// Array-based API (v1 - backward compatibility)
export * from './displacement.js';
export * from './power-limits.js';
