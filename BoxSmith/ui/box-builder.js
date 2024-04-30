/**
 * Box Builder - Constructs enclosure models from state
 *
 * Handles the logic for creating SealedBox/VentedBox instances
 * based on current state values. Subscribes to relevant state
 * changes and rebuilds boxes automatically.
 */

import { Driver, SealedBox, VentedBox, Port, PassiveRadiator, ReferenceSub, createIsobaricDriver, IsobaricWiring } from '../lib/models/index.js';
import { state } from './state.js';
import { DEFAULTS, DEFAULT_DRIVER } from './defaults.js';
import { loadCustomSubs, loadCustomDrivers, saveCustomSubs, saveCustomDrivers } from './persistence.js';
import { ModifierStack } from './filters.js';

// ============================================================================
// BOX CONSTRUCTION
// ============================================================================

/**
 * Build a box from current state values
 * Called automatically when relevant state changes
 */
function updateBox() {
    let driver = state.get('driver');
    const volumeLiters = state.get('volumeLiters');
    const boxType = state.get('boxType');

    if (!driver || !volumeLiters) return;

    // Apply isobaric transform if enabled
    const isobaric = state.get('isobaric');
    if (isobaric) {
        const wiring = state.require('isobaricWiring');
        driver = createIsobaricDriver(driver, wiring === 'parallel' ? IsobaricWiring.PARALLEL : IsobaricWiring.SERIES);
    }

    let box;
    if (boxType === 'sealed') {
        // Apply stuffing volume multiplier (isothermal effect)
        const stuffingMultipliers = { none: 1.0, light: 1.05, medium: 1.10, heavy: 1.15 };
        const stuffing = state.require('sealedStuffing');
        const multiplier = stuffingMultipliers[stuffing];
        if (multiplier === undefined) {
            throw new Error(`Unknown stuffing type '${stuffing}'. Valid: ${Object.keys(stuffingMultipliers).join(', ')}`);
        }
        const effectiveVolume = volumeLiters * multiplier;
        box = new SealedBox(driver, effectiveVolume);
    } else {
        // Ported/vented box - create VentedBox with appropriate vent
        const fb = state.require('tuningFrequency');
        const ventType = state.require('ventType');
        const ql = state.require('ql');

        // PR if boxType is 'pr' OR ventType is 'pr' (supports both UI flows)
        const isPR = boxType === 'pr' || ventType === 'pr';

        let vent;
        if (isPR) {
            // Passive Radiator - use calculated mass for exact target tuning
            const prArea = state.require('prArea');
            const prXmax = state.require('prXmax');
            const calculatedMass = state.get('prMassCalculated');
            if (!calculatedMass) {
                // Can't build PR box - impossible tuning target (mass outside 10-2000g)
                // Clear box so UI shows appropriate state (not stale data)
                state.set('box', null);
                return;
            }

            vent = new PassiveRadiator({
                mmp: calculatedMass,
                sd: prArea,
                xmax: prXmax
            });
        } else {
            // Port
            const portShape = state.require('portShape');
            if (portShape === 'rectangular') {
                vent = new Port({
                    width: state.require('portWidth'),
                    height: state.require('portHeight'),
                    flared: state.require('portFlared')
                });
            } else {
                vent = new Port({
                    diameter: state.require('portDiameter'),
                    flared: state.require('portFlared')
                });
            }
        }

        box = new VentedBox(driver, volumeLiters, fb, vent, { ql });
    }

    state.set('box', box);
}

// ============================================================================
// STATE SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to all state changes that affect box construction
 */
export function setupBoxSubscriptions() {
    state.subscribe('volumeLiters', updateBox);
    state.subscribe('driver', updateBox);
    state.subscribe('boxType', updateBox);
    state.subscribe('tuningFrequency', updateBox);
    state.subscribe('ql', updateBox);
    state.subscribe('sealedStuffing', updateBox);
    state.subscribe('ventType', updateBox);
    state.subscribe('portShape', updateBox);
    state.subscribe('portDiameter', updateBox);
    state.subscribe('portWidth', updateBox);
    state.subscribe('portHeight', updateBox);
    state.subscribe('portFlared', updateBox);
    state.subscribe('prMass', updateBox);
    state.subscribe('prMassCalculated', updateBox);  // Calculated mass for target tuning
    state.subscribe('prArea', updateBox);
    state.subscribe('prXmax', updateBox);
    state.subscribe('isobaric', updateBox);
    state.subscribe('isobaricWiring', updateBox);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize state with default Ultimax II in 140L sealed box
 */
export function initializeDefaultState() {
    const driverData = DEFAULT_DRIVER;
    const driver = new Driver(driverData);
    const box = new SealedBox(driver, DEFAULTS.volumeLiters);

    // Initialize modifier stack - empty by default
    const modifierStack = new ModifierStack();

    // Load custom subs and drivers from localStorage
    const customSubs = loadCustomSubs();
    const customDrivers = loadCustomDrivers();

    state.batch({
        driver,
        driverData,  // Store the raw data for UI display
        box,
        boxType: 'sealed',
        volumeLiters: DEFAULTS.volumeLiters,
        tuningFrequency: DEFAULTS.tuningFrequency,
        ql: DEFAULTS.ql,  // Enclosure losses Q for ported boxes
        sealedStuffing: 'none',  // 'none' | 'light' | 'medium' | 'heavy' for sealed boxes
        power: DEFAULTS.power,
        targetSpl: DEFAULTS.targetSpl,
        // Vent configuration (for ported/vented boxes)
        ventType: 'port',
        portShape: 'circular',
        portDiameter: DEFAULTS.portDiameter,
        portWidth: DEFAULTS.portWidth,
        portHeight: DEFAULTS.portHeight,
        portFlared: true,
        prMass: DEFAULTS.prMass,
        prArea: DEFAULTS.prArea,
        prXmax: DEFAULTS.prXmax,
        // Isobaric (compound) configuration
        isobaric: false,
        isobaricWiring: 'series',  // 'series' or 'parallel'
        // Modifier stack for planning scenarios
        modifierStack,
        // DSP/Environment toggle states (user must opt-in to see adjusted curves)
        // Note: showAdjusted is computed as (includeDsp || includeEnvironment), not stored
        includeDsp: false,
        includeEnvironment: false,
        // Reference sub comparison
        referenceSub: null,
        referenceQuantity: 1,
        showReference: false,
        realWorldDerating: 0,
        customSubs,
        // Custom drivers
        customDrivers,
        // Graph settings
        frequencyMax: DEFAULTS.frequencyMax
    });

    // Setup subscriptions after initial state
    setupBoxSubscriptions();
}

// ============================================================================
// DRIVER MANAGEMENT
// ============================================================================

/**
 * Set the active driver (rebuilds the box with new driver)
 * @param {Object} driverData - Driver data object
 */
export function setActiveDriver(driverData) {
    const driver = new Driver(driverData);
    state.set('driverData', driverData);
    state.set('driver', driver);  // triggers updateBox via subscription
}

/**
 * Add a custom driver and persist
 * @param {Object} driverData - Driver data object (will be validated)
 * @returns {Driver} The created Driver instance
 */
export function addCustomDriver(driverData) {
    // Validate by constructing (throws if invalid)
    const driver = new Driver(driverData);

    // Create data object with ID
    const dataWithId = {
        ...driverData,
        id: driverData.id || `custom-${Date.now()}`,
        name: driverData.name || 'Custom Driver'
    };

    // Add to state
    const customDrivers = state.get('customDrivers');
    const updated = [...customDrivers, dataWithId];
    state.set('customDrivers', updated);

    // Persist
    saveCustomDrivers(updated);

    return driver;
}

// ============================================================================
// SUB MANAGEMENT
// ============================================================================

/**
 * Add a custom sub and persist
 * @param {Object} subData - Sub data object (will be validated)
 * @returns {ReferenceSub} The created ReferenceSub instance
 */
export function addCustomSub(subData) {
    // Validate by constructing (throws if invalid)
    const sub = new ReferenceSub(subData);

    // Add to state
    const customSubs = state.get('customSubs');
    const updated = [...customSubs, sub.toJSON()];
    state.set('customSubs', updated);

    // Persist
    saveCustomSubs(updated);

    return sub;
}

/**
 * Remove a custom sub by ID
 * @param {string} id - Sub ID to remove
 */
export function removeCustomSub(id) {
    const customSubs = state.get('customSubs');
    const updated = customSubs.filter(s => s.id !== id);
    state.set('customSubs', updated);
    saveCustomSubs(updated);
}
