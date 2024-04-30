/**
 * Parameter Requirements - Shared capability check definitions
 *
 * Centralized definitions of which driver parameters are needed for
 * different calculation types. Used by SealedBox and VentedBox to
 * implement consistent capability checks.
 *
 * Why centralized:
 * - Single source of truth (no drift between box types)
 * - Clear documentation of what each calculation needs
 * - Easy to extend when adding new calculation types
 */

/**
 * Parameters needed for motor/displacement calculations
 * These are the mechanical parameters that define cone motion response to current.
 */
export const MOTOR_PARAMS = ['re', 'bl', 'mms', 'cms', 'rms'];

/**
 * Parameters needed for excursion/power limit calculations
 * These define the physical limits of the driver.
 */
export const LIMIT_PARAMS = ['xmax', 'pe'];

/**
 * Parameters needed for SPL calculations
 * Sensitivity gives the baseline, Re is needed for power-to-SPL conversion
 * since sensitivity is specified at 2.83V (1W into 8Ω).
 */
export const SPL_PARAMS = ['sensitivity', 're'];
