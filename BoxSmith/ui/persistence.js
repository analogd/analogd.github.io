/**
 * Persistence - localStorage for custom subs and drivers
 *
 * Handles loading/saving user-added data that persists across sessions.
 * Isolated from state management to keep concerns separate.
 */

import { Driver, BUILTIN_REFERENCE_SUBS } from '../lib/models/index.js';
import { POPULAR_DRIVERS } from './defaults.js';

// ============================================================================
// STORAGE KEYS
// ============================================================================

const CUSTOM_SUBS_KEY = 'boxsmith-custom-subs';
const CUSTOM_DRIVERS_KEY = 'boxsmith_custom_drivers';

// ============================================================================
// CUSTOM SUBS
// ============================================================================

/**
 * Load custom subs from localStorage
 * @returns {Array} Array of custom sub data objects
 */
export function loadCustomSubs() {
    try {
        const stored = localStorage.getItem(CUSTOM_SUBS_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('[Persistence] Failed to load custom subs:', e);
        return [];
    }
}

/**
 * Save custom subs to localStorage
 * @param {Array} subs - Array of custom sub data objects
 */
export function saveCustomSubs(subs) {
    try {
        localStorage.setItem(CUSTOM_SUBS_KEY, JSON.stringify(subs));
    } catch (e) {
        console.warn('[Persistence] Failed to save custom subs:', e);
    }
}

/**
 * Get all available subs (built-in + custom)
 * @param {Array} customSubs - Custom subs from state
 * @returns {Array} Combined list of sub data objects
 */
export function getAllAvailableSubs(customSubs = []) {
    return [...BUILTIN_REFERENCE_SUBS, ...customSubs];
}

// ============================================================================
// CUSTOM DRIVERS
// ============================================================================

/**
 * Load custom drivers from localStorage
 * @returns {Array} Array of custom driver data objects
 */
export function loadCustomDrivers() {
    try {
        const stored = localStorage.getItem(CUSTOM_DRIVERS_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('[Persistence] Failed to load custom drivers:', e);
        return [];
    }
}

/**
 * Save custom drivers to localStorage
 * @param {Array} drivers - Array of custom driver data objects
 */
export function saveCustomDrivers(drivers) {
    try {
        localStorage.setItem(CUSTOM_DRIVERS_KEY, JSON.stringify(drivers));
    } catch (e) {
        console.warn('[Persistence] Failed to save custom drivers:', e);
    }
}

/**
 * Get all available drivers (built-in + custom)
 * @param {Array} customDrivers - Custom drivers from state
 * @returns {Array} Combined list of driver data objects
 */
export function getAllAvailableDrivers(customDrivers = []) {
    return [...POPULAR_DRIVERS, ...customDrivers];
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate driver JSON input
 * @param {string} jsonString - JSON string to validate
 * @returns {{ valid: boolean, error?: string, data?: Object }}
 */
export function validateDriverJson(jsonString) {
    try {
        const data = JSON.parse(jsonString);

        // Check required fields
        const required = ['fs', 'qts', 'vas'];
        for (const field of required) {
            if (data[field] == null) {
                return { valid: false, error: `Missing required field: ${field}` };
            }
        }

        // Try constructing to validate
        new Driver(data);

        return { valid: true, data };
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

// Re-export for convenience
export { ReferenceSub, BUILTIN_REFERENCE_SUBS } from '../lib/models/index.js';
