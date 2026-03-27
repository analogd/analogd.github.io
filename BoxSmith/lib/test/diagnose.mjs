#!/usr/bin/env node
/**
 * Diagnostic harness for investigating graph/calculation issues.
 *
 * Usage:
 *   node lib/test/diagnose.mjs                          — run default scenario
 *   node lib/test/diagnose.mjs --scenario sealed-qtc707  — run named scenario
 *   node lib/test/diagnose.mjs --list                    — list available scenarios
 *
 * To investigate a bug:
 *   1. Add a scenario below that reproduces the conditions
 *   2. Run it — inspect the numbers
 *   3. Compare against user-reported debugGraphs() output
 *   4. Trace discrepancy to foundation, model, or UI layer
 *
 * This runs the same lib code the UI uses, minus the browser.
 * If output here is correct but UI shows wrong data → bug is in UI wiring.
 * If output here is wrong → bug is in foundation/models.
 */

import { Driver, SealedBox, VentedBox, Port, PassiveRadiator } from '../models/index.js';
import { DEFAULTS, POPULAR_DRIVERS } from '../../ui/defaults.js';

// ============================================================================
// SCENARIO DEFINITIONS
// ============================================================================

const SCENARIOS = {

    'sealed-default': {
        description: 'Default Ultimax II in 140L sealed (should be Qtc ~0.68)',
        run() {
            const driver = new Driver(POPULAR_DRIVERS[0]);
            const box = new SealedBox(driver, DEFAULTS.volumeLiters);
            return analyzeSealed(driver, box);
        }
    },

    'sealed-qtc707': {
        description: 'Ultimax II at Butterworth (Qtc=0.707) alignment',
        run() {
            const driver = new Driver(POPULAR_DRIVERS[0]);
            const box = SealedBox.butterworth(driver);
            return analyzeSealed(driver, box);
        }
    },

    'sealed-qtc900': {
        description: 'Ultimax II in small box for Qtc ~0.9 (expect hump before rolloff)',
        run() {
            const driver = new Driver(POPULAR_DRIVERS[0]);
            // Qtc = Qts * sqrt(1 + Vas/Vb), solve for Vb given target Qtc
            const targetQtc = 0.9;
            const ratio = (targetQtc / driver.qts) ** 2 - 1;
            const vb = driver.vas / ratio;
            const box = new SealedBox(driver, vb);
            return analyzeSealed(driver, box);
        }
    },

    'ported-default': {
        description: 'Default Ultimax II ported, 140L tuned to 28Hz',
        run() {
            const driver = new Driver(POPULAR_DRIVERS[0]);
            const port = new Port({ diameter: DEFAULTS.portDiameter });
            const box = new VentedBox(driver, DEFAULTS.volumeLiters, DEFAULTS.tuningFrequency, port);
            return analyzeVented(driver, box);
        }
    },

    'ported-qb3': {
        description: 'Ultimax II QB3 alignment (maximally flat)',
        run() {
            const driver = new Driver(POPULAR_DRIVERS[0]);
            const port = new Port({ diameter: DEFAULTS.portDiameter });
            const box = VentedBox.qb3(driver, port);
            return analyzeVented(driver, box);
        }
    }
};

// ============================================================================
// ANALYSIS HELPERS
// ============================================================================

function analyzeSealed(driver, box) {
    const result = {
        driver: { name: driver.name, fs: driver.fs, qts: driver.qts, vas: driver.vas },
        box: {
            volume: box.volume,
            qtc: round(box.qtc, 4),
            fc: round(box.fc, 2),
            f3: round(box.f3, 2),
            alpha: round(box.alpha, 4)
        },
        warnings: box.warnings,
        curves: {}
    };

    // Response curve
    if (box.canCalculateSpl) {
        const response = box.responseCurve(10, 200, 50);
        result.curves.response = summarizeCurve(response, 'db');

        // Check for hump (Qtc > 0.707 indicator)
        const passband = response.filter(p => p.frequency >= 30 && p.frequency <= 150);
        const maxDb = Math.max(...passband.map(p => p.db));
        result.responseShape = {
            passbandPeak: round(maxDb, 2),
            hasHump: maxDb > 0.5,
            note: maxDb > 0.5
                ? `Peak of ${round(maxDb, 2)} dB — expected for Qtc=${round(box.qtc, 3)} > 0.707`
                : `Flat passband (peak ${round(maxDb, 2)} dB) — expected for Qtc=${round(box.qtc, 3)} <= 0.707`
        };
    }

    // Excursion curve (returns {frequency, excursion, overXmax})
    if (box.canCalculateDisplacement) {
        const excursion = box.excursionCurve(DEFAULTS.power, 10, 200, 50);
        result.curves.excursion = summarizeCurve(excursion, 'excursion');
    }

    // Impedance curve (returns {frequency, magnitude, phase})
    if (box.canCalculateImpedance) {
        const impedance = box.impedanceCurve(10, 200, 100);
        result.curves.impedance = summarizeCurve(impedance, 'magnitude');
    }

    return result;
}

function analyzeVented(driver, box) {
    const result = {
        driver: { name: driver.name, fs: driver.fs, qts: driver.qts, vas: driver.vas },
        box: {
            volume: box.volume,
            fb: round(box.fb, 2),
            f3: box.f3 !== undefined ? round(box.f3, 2) : 'N/A',
            ventType: box.ventType,
            portLength: box.isPort ? round(box.portLength, 1) : 'N/A'
        },
        warnings: box.warnings,
        curves: {}
    };

    if (box.canCalculateSpl) {
        const response = box.responseCurve(10, 200, 50);
        result.curves.response = summarizeCurve(response, 'db');
    }

    if (box.canCalculateDisplacement) {
        const excursion = box.excursionCurve(DEFAULTS.power, 10, 200, 50);
        result.curves.excursion = summarizeCurve(excursion, 'excursion');
    }

    if (box.canCalculateImpedance) {
        const impedance = box.impedanceCurve(10, 200, 100);
        result.curves.impedance = summarizeCurve(impedance, 'magnitude');

        // Ported boxes should have 2 impedance peaks
        const peaks = findPeaks(impedance, 'magnitude');
        result.impedancePeaks = peaks.map(p => ({
            frequency: round(p.frequency, 1),
            magnitude: round(p.magnitude, 1)
        }));
    }

    return result;
}

/**
 * Summarize a curve: key frequencies, min/max, shape
 */
function summarizeCurve(curve, yKey) {
    const ys = curve.map(p => p[yKey]).filter(y => isFinite(y));
    const keyFreqs = [15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200];

    const atFreqs = {};
    for (const targetF of keyFreqs) {
        const closest = curve.reduce((best, p) =>
            Math.abs(p.frequency - targetF) < Math.abs(best.frequency - targetF) ? p : best
        );
        if (Math.abs(closest.frequency - targetF) / targetF < 0.15) {
            atFreqs[`${targetF}Hz`] = round(closest[yKey], 3);
        }
    }

    return {
        points: curve.length,
        yMin: round(Math.min(...ys), 3),
        yMax: round(Math.max(...ys), 3),
        atFrequencies: atFreqs
    };
}

/**
 * Find peaks in a curve (local maxima)
 */
function findPeaks(curve, yKey) {
    const peaks = [];
    for (let i = 1; i < curve.length - 1; i++) {
        if (curve[i][yKey] > curve[i - 1][yKey] && curve[i][yKey] > curve[i + 1][yKey]) {
            peaks.push(curve[i]);
        }
    }
    return peaks;
}

function round(val, decimals) {
    return Number(val.toFixed(decimals));
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--list')) {
    console.log('\nAvailable scenarios:\n');
    for (const [name, s] of Object.entries(SCENARIOS)) {
        console.log(`  ${name.padEnd(20)} ${s.description}`);
    }
    console.log(`\nUsage: node lib/test/diagnose.mjs --scenario <name>\n`);
    process.exit(0);
}

const scenarioIdx = args.indexOf('--scenario');
const scenarioName = scenarioIdx >= 0 ? args[scenarioIdx + 1] : 'sealed-default';

const scenario = SCENARIOS[scenarioName];
if (!scenario) {
    console.error(`Unknown scenario: ${scenarioName}`);
    console.error(`Run with --list to see available scenarios`);
    process.exit(1);
}

console.log(`\n=== ${scenarioName}: ${scenario.description} ===\n`);
const result = scenario.run();
console.log(JSON.stringify(result, null, 2));
