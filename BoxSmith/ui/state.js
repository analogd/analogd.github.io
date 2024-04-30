/**
 * State Management - Simple pub/sub reactive state
 *
 * Pure state management infrastructure. No domain logic, no persistence.
 * For domain logic (box building), see box-builder.js
 * For persistence (localStorage), see persistence.js
 * For defaults/constants, see defaults.js
 *
 * Usage:
 *   state.set('driver', myDriver);
 *   state.subscribe('driver', (driver) => updateUI(driver));
 *   state.get('driver');
 */

// ============================================================================
// STATE MANAGER CLASS
// ============================================================================

class StateManager {
    constructor() {
        this._state = {};
        this._subscribers = {};
        this._anySubscribers = [];
    }

    /**
     * Get current value
     */
    get(key) {
        return this._state[key];
    }

    /**
     * Get current value or throw if missing/falsy
     * Use this instead of `get(key) || DEFAULT` to catch initialization bugs
     */
    require(key) {
        const value = this._state[key];
        if (value === undefined || value === null) {
            throw new Error(`State '${key}' is required but was ${value}. Check initializeDefaultState().`);
        }
        return value;
    }

    /**
     * Set value and notify subscribers
     */
    set(key, value) {
        const oldValue = this._state[key];
        this._state[key] = value;

        // Notify key-specific subscribers
        if (this._subscribers[key]) {
            this._subscribers[key].forEach(fn => fn(value, oldValue, key));
        }

        // Notify any-change subscribers
        this._anySubscribers.forEach(fn => fn(key, value, oldValue));
    }

    /**
     * Subscribe to changes on a specific key
     */
    subscribe(key, callback) {
        if (!this._subscribers[key]) {
            this._subscribers[key] = [];
        }
        this._subscribers[key].push(callback);

        // Return unsubscribe function
        return () => {
            this._subscribers[key] = this._subscribers[key].filter(fn => fn !== callback);
        };
    }

    /**
     * Subscribe to any state change
     */
    subscribeAny(callback) {
        this._anySubscribers.push(callback);
        return () => {
            this._anySubscribers = this._anySubscribers.filter(fn => fn !== callback);
        };
    }

    /**
     * Batch multiple updates (triggers subscribers once at end)
     */
    batch(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this._state[key] = value;
        });

        // Notify all
        Object.entries(updates).forEach(([key, value]) => {
            if (this._subscribers[key]) {
                this._subscribers[key].forEach(fn => fn(value, undefined, key));
            }
        });
        this._anySubscribers.forEach(fn => fn('batch', updates, null));
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const state = new StateManager();


// ============================================================================
// RE-EXPORTS FOR BACKWARDS COMPATIBILITY
// ============================================================================
// These re-exports maintain the existing API so consumers don't need to change
// their imports immediately. Over time, consumers should import directly from
// the appropriate modules.

export { DEFAULTS, POPULAR_DRIVERS, DEFAULT_DRIVER } from './defaults.js';
export {
    loadCustomDrivers,
    saveCustomDrivers,
    getAllAvailableDrivers,
    validateDriverJson
} from './persistence.js';
export {
    initializeDefaultState,
    setupBoxSubscriptions,
    setActiveDriver,
    addCustomDriver
} from './box-builder.js';

// Re-export modifier utilities for convenience
export { ModifierStack, ModifierCategory, ModifierType, ModifierPresets, generateFrequencies } from './filters.js';

export default state;
