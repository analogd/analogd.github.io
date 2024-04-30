/**
 * Graph Registry - Declarative graph definitions
 *
 * Each graph is defined once with all its configuration:
 * - Canvas ID, labels, axis ranges
 * - Domain type (frequency, frequency-extended, time, displacement, power)
 * - Capability requirements (canCalculateSpl, canCalculateLimits, etc.)
 * - Input dependencies (for hover highlighting)
 * - DSP adjustment config
 * - Render function that returns layers
 *
 * Benefits:
 * - Single source of truth for each graph
 * - Automatic safeUpdateGraph wrapping
 * - Automatic GRAPH_INPUTS derivation
 * - Automatic DSP_ADJUSTMENTS derivation
 * - Enforced consistency across all graphs
 */

import { COLORS, refLine, zeroDbLine, zeroLine, naPlaceholder } from './graph.js';
import { ALL_VALID_Y_KEYS } from '../lib/models/curve-contracts.js';
import { BUTTERWORTH_QTC, BESSEL_QTC, CHEBYSHEV_QTC } from '../lib/foundation/thiele-1971.js';

// ============================================================================
// DOMAIN TYPES
// ============================================================================
// Define x-axis behavior for different graph categories

export const Domain = {
    FREQUENCY: 'frequency',           // 10Hz - frequencyMax (log scale)
    FREQUENCY_EXTENDED: 'frequency-extended',  // 10Hz - frequencyMax*2.5 (electrical graphs)
    TIME: 'time',                     // 0 - 100ms (linear)
    DISPLACEMENT: 'displacement',     // -Xmax to +Xmax (linear)
    POWER: 'power'                    // 10W - 2000W (log scale)
};

// ============================================================================
// CAPABILITY REQUIREMENTS
// ============================================================================

export const Requires = {
    NONE: null,
    SPL: 'canCalculateSpl',
    LIMITS: 'canCalculateLimits',
    IMPEDANCE: 'canCalculateImpedance',
    VENTED: 'isVented',
    PORT: 'hasPort',  // isVented && ventType === 'port'
    PR: 'isPassiveRadiator',  // isVented && ventType === 'pr'
    DSP_ENABLED: 'dspEnabled',  // includeDsp toggle is on
    ENV_ENABLED: 'envEnabled'   // includeEnvironment toggle is on
};

// ============================================================================
// GRAPH DEFINITIONS
// ============================================================================

export const GRAPH_REGISTRY = {
    // =========================================================================
    // PRIMARY GRAPHS
    // =========================================================================

    maxSpl: {
        id: 'maxSplChart',
        label: 'Max SPL (dB @ 1m)',
        domain: Domain.FREQUENCY,
        yRange: { min: null, max: null, suggestedMax: 130 },
        requires: Requires.SPL,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'targetSpl', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'room-only', yKeys: ['spl', 'maxSpl'] },
        render: (box, ctx) => {
            const { power, targetSpl, showAdjusted, applyDsp, getFreqRange, derating } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const layers = [];

            // Thermal limit
            const thermalCurve = applyDsp(box.thermalLimitCurve(fMin, fMax, ctx.points));
            layers.push({
                data: thermalCurve,
                label: showAdjusted ? 'Thermal (adjusted)' : 'Thermal Limit (Pe)',
                color: COLORS.thermal,
                dashed: true,
                yKey: 'spl'
            });

            // Power limit
            const powerCurve = applyDsp(box.splCurve(power, fMin, fMax, ctx.points));
            layers.push({
                data: powerCurve,
                label: showAdjusted ? `Power ${power}W (adjusted)` : `Power Limit (${power}W)`,
                color: COLORS.primary,
                dashed: true,
                yKey: 'spl'
            });

            // Excursion limit (if can calculate limits)
            if (box.canCalculateLimits) {
                const excursionCurve = applyDsp(box.excursionLimitCurve(fMin, fMax, ctx.points));
                layers.push({
                    data: excursionCurve,
                    label: showAdjusted ? 'Excursion (adjusted)' : 'Excursion Limit (Xmax)',
                    color: COLORS.excursion,
                    dashed: true,
                    yKey: 'spl'
                });
            }

            // Max SPL (combined limit)
            const maxSplCurve = applyDsp(box.maxSplCurve(fMin, fMax, ctx.points));
            const deratedCurve = derating !== 0
                ? maxSplCurve.map(p => ({ ...p, maxSpl: p.maxSpl + derating }))
                : maxSplCurve;
            layers.push({
                data: deratedCurve,
                label: showAdjusted
                    ? `Max SPL (adjusted${derating ? `, ${derating}dB` : ''})`
                    : `Max SPL (theoretical${derating ? `, ${derating}dB` : ''})`,
                color: COLORS.actual,
                width: 2.5,
                yKey: 'maxSpl'
            });

            // Target line
            if (targetSpl) {
                layers.push({
                    data: [{ x: fMin, y: targetSpl }, { x: fMax, y: targetSpl }],
                    label: `Target (${targetSpl} dB)`,
                    color: '#ffffff',
                    dashed: true,
                    width: 1.5
                });
            }

            return layers;
        }
    },

    response: {
        id: 'responseChart',
        label: 'Response (dB)',
        domain: Domain.FREQUENCY,
        yRange: { min: null, max: null, suggestedMin: -30, suggestedMax: 6 },
        requires: Requires.NONE,
        inputs: ['boxType', 'volume', 'tuning', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'acoustic', yKeys: ['db'] },
        render: (box, ctx) => {
            const { showAdjusted, applyDsp, getFreqRange, modifierStack } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const layers = [zeroDbLine(fMin, fMax), refLine(-3, '-3 dB (F3)', fMin, fMax)];

            // Raw response
            const responseCurve = box.responseCurve(fMin, fMax, ctx.pointsHigh);
            const boxLabel = box.qtc !== undefined
                ? `Raw (Qtc=${box.qtc.toFixed(2)})`
                : `Raw (Fb=${box.fb?.toFixed(0)}Hz, h=${box.tuningRatio?.toFixed(2)})`;
            layers.push({
                data: responseCurve,
                label: boxLabel,
                color: COLORS.primary,
                yKey: 'db'
            });

            // Adjusted response (if modifiers active)
            if (showAdjusted && modifierStack?.hasModifiers()) {
                const adjustedCurve = applyDsp(responseCurve);
                layers.push({
                    data: adjustedCurve,
                    label: 'Adjusted',
                    color: COLORS.actual,
                    width: 2,
                    yKey: 'db'
                });
            }

            return layers;
        }
    },

    sensitivity: {
        id: 'sensitivityChart',
        label: 'Sensitivity (dB @ 1W/1m)',
        domain: Domain.FREQUENCY,
        yRange: { min: null, max: null, suggestedMin: 70, suggestedMax: 110 },
        requires: Requires.SPL,
        inputs: ['boxType', 'volume', 'tuning', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'acoustic', yKeys: ['spl'] },
        render: (box, ctx) => {
            const { showAdjusted, applyDsp, getFreqRange, modifierStack } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const layers = [];

            // Reference sensitivity line (driver's rated sensitivity)
            const driverSens = box.driver?.sensitivity;
            if (driverSens) {
                layers.push(refLine(driverSens, `Driver: ${driverSens.toFixed(1)} dB`, fMin, fMax));
            }

            // SPL @ 1W/1m curve
            const splCurve = box.splCurve(1, fMin, fMax, ctx.points);
            layers.push({
                data: splCurve,
                label: 'Sensitivity (1W/1m)',
                color: COLORS.primary,
                width: 2,
                yKey: 'spl'
            });

            // Adjusted (if modifiers active)
            if (showAdjusted && modifierStack?.hasModifiers()) {
                const adjustedCurve = applyDsp(splCurve);
                layers.push({
                    data: adjustedCurve,
                    label: 'Adjusted',
                    color: COLORS.actual,
                    width: 2,
                    yKey: 'spl'
                });
            }

            return layers;
        }
    },

    excursion: {
        id: 'excursionChart',
        label: 'Excursion (mm)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.LIMITS,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'scale-amplitude', yKeys: ['excursion'] },
        render: (box, ctx) => {
            const { power, showAdjusted, applyDsp, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const xmax = box.driver?.xmax;

            const excursionCurve = box.excursionCurve(power, fMin, fMax, ctx.points);
            const adjustedCurve = showAdjusted ? applyDsp(excursionCurve) : excursionCurve;

            const maxExcursion = Math.max(...adjustedCurve.map(p => p.excursion));
            const exceedsXmax = xmax && maxExcursion > xmax;

            const layers = [];

            // Xmax line
            if (xmax) {
                layers.push({
                    data: [{ x: fMin, y: xmax }, { x: fMax, y: xmax }],
                    label: `Xmax (${xmax}mm)`,
                    color: COLORS.xmax,
                    dashed: true,
                    width: 1.5
                });
            }

            // Excursion curve
            layers.push({
                data: adjustedCurve,
                label: showAdjusted ? `Excursion @ ${power}W (adjusted)` : `Excursion @ ${power}W`,
                color: exceedsXmax ? '#f0883e' : COLORS.primary,
                width: 2,
                yKey: 'excursion'
            });

            return layers;
        }
    },

    // =========================================================================
    // ELECTRICAL GRAPHS (extended frequency range)
    // =========================================================================

    impedance: {
        id: 'impedanceChart',
        label: 'Impedance (Ω)',
        domain: Domain.FREQUENCY_EXTENDED,
        yRange: { min: 0, max: null },
        requires: Requires.IMPEDANCE,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,  // Not affected by DSP
        render: (box, ctx) => {
            const { getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const driver = box.driver;

            const layers = [];

            // Re reference line
            if (driver?.re) {
                layers.push({
                    data: [{ x: fMin, y: driver.re }, { x: fMax, y: driver.re }],
                    label: `Re (${driver.re.toFixed(1)}Ω)`,
                    color: COLORS.reference,
                    dashed: true,
                    width: 1
                });
            }

            // Impedance curve
            const impedanceCurve = box.impedanceCurve(fMin, fMax, ctx.pointsHigh);
            layers.push({
                data: impedanceCurve,
                label: 'Impedance',
                color: COLORS.primary,
                width: 2,
                yKey: 'magnitude'
            });

            return layers;
        }
    },

    impedancePhase: {
        id: 'impedancePhaseChart',
        label: 'Phase (°)',
        domain: Domain.FREQUENCY_EXTENDED,
        yRange: { min: -90, max: 90 },
        requires: Requires.IMPEDANCE,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            const { getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();

            const layers = [
                zeroLine(fMin, fMax),
                { data: [{ x: fMin, y: 45 }, { x: fMax, y: 45 }], label: '+45°', color: COLORS.reference, dashed: true, width: 1 },
                { data: [{ x: fMin, y: -45 }, { x: fMax, y: -45 }], label: '-45°', color: COLORS.reference, dashed: true, width: 1 }
            ];

            const impedanceCurve = box.impedanceCurve(fMin, fMax, ctx.pointsHigh);
            layers.push({
                data: impedanceCurve,
                label: 'Impedance Phase',
                color: COLORS.primary,
                width: 2,
                yKey: 'phase'
            });

            return layers;
        }
    },

    epdr: {
        id: 'epdrChart',
        label: 'EPDR (Ω)',
        domain: Domain.FREQUENCY_EXTENDED,
        yRange: { min: 0, max: null },
        requires: Requires.IMPEDANCE,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            const { getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const driver = box.driver;
            const nominalZ = driver?.re ? Math.round(driver.re * 1.25) : 4;

            const layers = [
                { data: [{ x: fMin, y: nominalZ }, { x: fMax, y: nominalZ }], label: `Nominal (${nominalZ}Ω)`, color: COLORS.reference, dashed: true, width: 1 },
                { data: [{ x: fMin, y: 2 }, { x: fMax, y: 2 }], label: 'Difficult (2Ω)', color: '#f0883e', dashed: true, width: 1 },
                { data: [{ x: fMin, y: 1 }, { x: fMax, y: 1 }], label: 'Critical (1Ω)', color: COLORS.thermal, dashed: true, width: 1 }
            ];

            const epdrCurve = box.epdrCurve(fMin, fMax, ctx.pointsHigh);
            layers.push({
                data: epdrCurve,
                label: 'EPDR',
                color: COLORS.primary,
                width: 2,
                yKey: 'epdr'
            });

            return layers;
        }
    },

    currentDraw: {
        id: 'currentDrawChart',
        label: 'Current (A)',
        domain: Domain.FREQUENCY_EXTENDED,
        yRange: { min: 0, max: null },
        requires: Requires.IMPEDANCE,
        inputs: ['boxType', 'volume', 'tuning', 'power'],
        dspAdjust: { type: 'scale-amplitude', yKeys: ['current'] },
        render: (box, ctx) => {
            const { power, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const driver = box.driver;
            const nominalZ = driver?.re ? Math.round(driver.re * 1.25) : 4;
            const nominalCurrent = Math.sqrt(power / nominalZ);

            const layers = [
                { data: [{ x: fMin, y: nominalCurrent }, { x: fMax, y: nominalCurrent }], label: `Nominal (${nominalCurrent.toFixed(1)}A)`, color: COLORS.reference, dashed: true, width: 1 },
                { data: [{ x: fMin, y: 20 }, { x: fMax, y: 20 }], label: 'High (20A)', color: '#f0883e', dashed: true, width: 1 }
            ];

            const currentCurve = box.currentDrawCurve(power, fMin, fMax, ctx.pointsHigh);
            layers.push({
                data: currentCurve,
                label: `Current @ ${power}W`,
                color: COLORS.primary,
                width: 2,
                yKey: 'current'
            });

            return layers;
        }
    },

    ampLoad: {
        id: 'ampLoadChart',
        label: 'VA/W Ratio',
        domain: Domain.FREQUENCY_EXTENDED,
        yRange: { min: 0.8, max: null },
        requires: Requires.IMPEDANCE,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,  // Ratio doesn't scale with DSP
        render: (box, ctx) => {
            const { power, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();

            // VA/W ratio = 1/power_factor. Shows how much harder amp works vs resistive load.
            // 1.0 = purely resistive, >1.0 = reactive (amp delivers more VA than real watts)
            const vaCurve = box.apparentPowerCurve(power, fMin, fMax, ctx.pointsHigh);
            const ratioCurve = vaCurve.map(p => ({ frequency: p.frequency, ratio: p.va / power }));

            return [
                { data: [{ x: fMin, y: 1.0 }, { x: fMax, y: 1.0 }], label: 'Resistive (1.0)', color: COLORS.success, dashed: true, width: 1 },
                { data: [{ x: fMin, y: 1.5 }, { x: fMax, y: 1.5 }], label: 'Moderate (1.5)', color: COLORS.warning, dashed: true, width: 1 },
                { data: [{ x: fMin, y: 2.0 }, { x: fMax, y: 2.0 }], label: 'Heavy (2.0)', color: COLORS.excursion, dashed: true, width: 1 },
                { data: ratioCurve, label: 'VA/W Ratio', color: COLORS.primary, width: 2, yKey: 'ratio' }
            ];
        }
    },

    thermalDissipation: {
        id: 'thermalDissipationChart',
        label: 'Power (W)',
        domain: Domain.FREQUENCY_EXTENDED,
        yRange: { min: 0, max: null },
        requires: Requires.IMPEDANCE,
        inputs: ['boxType', 'volume', 'tuning', 'power'],
        dspAdjust: { type: 'scale-power', yKeys: ['thermal'] },
        render: (box, ctx) => {
            const { power, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const pe = box.driver?.pe;

            const layers = [
                { data: [{ x: fMin, y: power }, { x: fMax, y: power }], label: `Input (${power}W)`, color: COLORS.reference, dashed: true, width: 1 }
            ];

            if (pe) {
                layers.push({
                    data: [{ x: fMin, y: pe }, { x: fMax, y: pe }],
                    label: `Pe limit (${pe}W)`,
                    color: COLORS.thermal,
                    dashed: true,
                    width: 1
                });
            }

            const thermalCurve = box.thermalDissipationCurve(power, fMin, fMax, ctx.pointsHigh);
            layers.push({
                data: thermalCurve,
                label: 'Thermal Dissipation',
                color: COLORS.primary,
                width: 2,
                yKey: 'thermal'
            });

            return layers;
        }
    },

    // =========================================================================
    // TIME DOMAIN
    // =========================================================================

    stepResponse: {
        id: 'stepResponseChart',
        label: 'Amplitude',
        domain: Domain.TIME,
        yRange: { min: -0.5, max: 1.2 },
        xRange: { min: 0, max: 100 },  // Explicit x-axis range for time domain
        requires: Requires.NONE,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            const curve = box.stepResponseCurve(ctx.timeMax / 1000, ctx.points);  // timeMax is in ms, model expects seconds
            // Transform {time (s), amplitude} to {x (ms), y}
            const data = curve.map(p => ({ x: p.time * 1000, y: p.amplitude }));
            return [{
                data,
                label: 'Step Response',
                color: COLORS.primary,
                width: 2
            }];
        }
    },

    impulseResponse: {
        id: 'impulseResponseChart',
        label: 'Amplitude',
        domain: Domain.TIME,
        yRange: { min: null, max: null },
        xRange: { min: 0, max: 100 },  // Explicit x-axis range for time domain
        requires: Requires.NONE,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            const curve = box.impulseResponseCurve(ctx.timeMax / 1000, ctx.points);  // timeMax is in ms, model expects seconds
            // Transform {time (s), amplitude} to {x (ms), y}
            const data = curve.map(p => ({ x: p.time * 1000, y: p.amplitude }));
            return [{
                data,
                label: 'Impulse Response',
                color: COLORS.primary,
                width: 2
            }];
        }
    },

    // =========================================================================
    // HEADROOM & DESIGN
    // =========================================================================

    headroom: {
        id: 'headroomChart',
        label: 'Headroom (dB)',
        domain: Domain.FREQUENCY,
        yRange: { min: null, max: null },
        requires: Requires.SPL,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'targetSpl', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'headroom', yKeys: ['headroom'] },
        render: (box, ctx) => {
            if (!box.canCalculateLimits) return [naPlaceholder('missing engineering params')];

            const { targetSpl, showAdjusted, applyDsp, getFreqRange, derating } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();

            // Get headroom curve: max SPL - target SPL at each frequency
            const rawCurve = ctx.getHeadroomCurve(box, targetSpl);
            const dspAdjustedCurve = applyDsp(rawCurve);
            const adjustedCurve = derating !== 0
                ? dspAdjustedCurve.map(p => ({ ...p, headroom: p.headroom + derating }))
                : dspAdjustedCurve;

            const layers = [
                { data: [{ x: fMin, y: 0 }, { x: fMax, y: 0 }], label: 'Target threshold', color: '#ffffff', dashed: true, width: 1.5 },
                { data: [{ x: fMin, y: 6 }, { x: fMax, y: 6 }], label: '+6 dB headroom', color: COLORS.reference, dashed: true, width: 1 }
            ];

            const minHeadroom = Math.min(...adjustedCurve.map(p => p.headroom));
            const curveColor = minHeadroom >= 6 ? '#3fb950' : minHeadroom >= 0 ? '#f0883e' : '#f85149';
            const deratingLabel = derating ? `, ${derating}dB` : '';

            layers.push({
                data: adjustedCurve,
                label: showAdjusted ? `Headroom (adjusted${deratingLabel})` : `Headroom (theoretical${deratingLabel})`,
                color: curveColor,
                width: 2.5,
                yKey: 'headroom',
                fillTarget: 'origin',
                fillAbove: 'rgba(63, 185, 80, 0.25)',
                fillBelow: 'rgba(248, 81, 73, 0.25)'
            });

            return layers;
        }
    },

    groupDelay: {
        id: 'groupDelayChart',
        label: 'Group Delay (ms)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null, suggestedMax: 50 },  // Floor at 0 (causal system), soft max
        requires: Requires.NONE,
        inputs: ['boxType', 'volume', 'tuning', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'group-delay', yKeys: ['delay'] },
        render: (box, ctx) => {
            const { showAdjusted, applyDsp, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();

            // Model returns {frequency, delay} in ms already
            const curve = box.groupDelayCurve(fMin, fMax, ctx.pointsHigh);
            const adjustedCurve = applyDsp(curve);

            // Cycle-based thresholds (Blauert & Laws 1978)
            // Audibility depends on cycles of delay, not absolute ms
            // threshold_ms = cycles * 1000 / frequency
            // Curves naturally go off top of graph at low frequencies
            const cycleThreshold = (cycles) => {
                const points = [];
                for (let f = fMin; f <= fMax; f *= 1.05) {
                    points.push({ x: f, y: (cycles * 1000) / f });
                }
                return points;
            };

            return [
                { data: cycleThreshold(1.5), label: '1.5 cycles (inaudible)', color: COLORS.success, dashed: true, width: 1 },
                { data: cycleThreshold(2.5), label: '2.5 cycles (threshold)', color: COLORS.warning, dashed: true, width: 1 },
                { data: adjustedCurve, label: showAdjusted ? 'Group Delay (with DSP)' : 'Group Delay', color: COLORS.primary, width: 2, yKey: 'delay' }
            ];
        }
    },

    phase: {
        id: 'phaseChart',
        label: 'Phase (°)',
        domain: Domain.FREQUENCY,
        yRange: { min: -180, max: 180 },  // Full range for 4th-order ported (2nd-order sealed uses subset)
        requires: Requires.NONE,
        inputs: ['boxType', 'volume', 'tuning', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'phase', yKeys: ['phase'] },
        render: (box, ctx) => {
            const { showAdjusted, applyDsp, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();

            const curve = box.phaseCurve(fMin, fMax, ctx.pointsHigh);
            const adjustedCurve = applyDsp(curve);

            const layers = [
                { data: [{ x: fMin, y: 0 }, { x: fMax, y: 0 }], label: '0° reference', color: COLORS.reference, dashed: true, width: 1 }
            ];

            // Add 90° line for sealed boxes (at resonance)
            if (!box.isVented) {
                layers.push({ data: [{ x: fMin, y: 90 }, { x: fMax, y: 90 }], label: '90° (Fc)', color: COLORS.reference, dashed: true, width: 1 });
            }

            layers.push({ data: adjustedCurve, label: showAdjusted ? 'Phase (with DSP)' : 'Phase', color: '#a371f7', width: 2, yKey: 'phase' });

            return layers;
        }
    },

    powerRequired: {
        id: 'powerRequiredChart',
        label: 'Power (W)',
        domain: Domain.FREQUENCY,
        yRange: { min: 10, max: 10000, logScale: true },
        requires: Requires.SPL,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'targetSpl'],
        dspAdjust: null,
        render: (box, ctx) => {
            const { power, targetSpl, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const driver = box.driver;
            const sensitivity = driver.sensitivity;

            const curve = box.responseCurve(fMin, fMax, ctx.points).map(p => {
                const powerNeeded = Math.pow(10, (targetSpl - sensitivity - p.db) / 10);
                return { frequency: p.frequency, power: Math.min(powerNeeded, 10000) };
            });

            const layers = [
                { data: [{ x: fMin, y: power }, { x: fMax, y: power }], label: `Your amp (${power}W)`, color: COLORS.primary, dashed: true, width: 1.5 }
            ];

            if (driver.pe) {
                layers.push({ data: [{ x: fMin, y: driver.pe }, { x: fMax, y: driver.pe }], label: `Thermal limit (${driver.pe}W)`, color: COLORS.thermal, dashed: true, width: 1 });
            }

            layers.push({ data: curve, label: `Power for ${targetSpl}dB`, color: '#f0883e', width: 2, yKey: 'power' });
            return layers;
        }
    },

    maxPower: {
        id: 'maxPowerChart',
        label: 'Max Power (W)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.LIMITS,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            const { getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const pe = box.driver.pe;

            const powerCurve = box.powerCurve(fMin, fMax, ctx.points);

            const layers = [
                { data: [{ x: fMin, y: pe }, { x: fMax, y: pe }], label: `Thermal limit (${pe}W)`, color: COLORS.thermal, dashed: true, width: 1.5 }
            ];

            const excursionLimited = powerCurve.filter(p => p.limitingFactor === 'excursion');
            const thermalLimited = powerCurve.filter(p => p.limitingFactor === 'thermal');

            if (excursionLimited.length > 0) {
                layers.push({ data: excursionLimited, label: 'Excursion limited', color: COLORS.excursion, width: 2.5, yKey: 'maxPower' });
            }
            if (thermalLimited.length > 0) {
                layers.push({ data: thermalLimited, label: 'Thermal limited', color: COLORS.thermal, width: 2.5, yKey: 'maxPower' });
            }
            layers.push({ data: powerCurve, label: 'Max Power', color: COLORS.primary, width: 1.5, dashed: true, yKey: 'maxPower' });

            return layers;
        }
    },

    // =========================================================================
    // COMPARISON GRAPHS
    // =========================================================================

    volumeCompare: {
        id: 'volumeCompareChart',
        label: 'Response (dB)',
        domain: Domain.FREQUENCY,
        yRange: { min: -30, max: 6 },
        requires: Requires.NONE,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            const { getFreqRange, SealedBox, VentedBox } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const driver = box.driver;
            const currentVolume = box.volumeLiters;
            const isVented = box.isVented;

            const volumes = [
                { vol: Math.round(currentVolume * 0.7), color: '#f0883e' },
                { vol: currentVolume, color: COLORS.actual },
                { vol: Math.round(currentVolume * 1.5), color: '#58a6ff' }
            ];

            const layers = [zeroDbLine(fMin, fMax), refLine(-3, '-3 dB (F3)', fMin, fMax)];

            for (const { vol, color } of volumes) {
                const testBox = isVented
                    ? new VentedBox(driver, vol, box.fb, box.vent)
                    : new SealedBox(driver, vol);
                const curve = testBox.responseCurve(fMin, fMax, ctx.pointsHigh);
                const isCurrent = vol === currentVolume;
                const infoLabel = isVented
                    ? `${vol}L @${Math.round(box.fb)}Hz`
                    : `${vol}L (Qtc=${testBox.qtc.toFixed(2)})`;

                layers.push({
                    data: curve,
                    label: infoLabel,
                    color,
                    width: isCurrent ? 2.5 : 1.5,
                    dashed: !isCurrent,
                    yKey: 'db'
                });
            }

            return layers;
        }
    },

    alignmentCompare: {
        id: 'alignmentCompareChart',
        label: 'Response (dB)',
        domain: Domain.FREQUENCY,
        yRange: { min: -30, max: 6 },
        requires: Requires.NONE,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            const { getFreqRange, SealedBox } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();

            if (box.isVented) {
                const curve = box.responseCurve(fMin, fMax, ctx.pointsHigh);
                return [
                    zeroDbLine(fMin, fMax),
                    refLine(-3, '-3 dB (F3)', fMin, fMax),
                    { data: curve, label: `${box.volumeLiters.toFixed(0)}L @${Math.round(box.fb)}Hz`, color: COLORS.actual, width: 2.5, yKey: 'db' }
                ];
            }

            const driver = box.driver;
            const qts = driver.qts;
            const alignments = [];

            // Guards are conservative (qts < target - margin) so factories should always succeed.
            // Try/catch kept as defense-in-depth for edge cases (e.g., floating point near boundary).
            if (qts < BESSEL_QTC - 0.02) {
                try { alignments.push({ box: SealedBox.bessel(driver), name: 'Bessel', color: '#a371f7', qtc: BESSEL_QTC }); } catch { /* guard should prevent this */ }
            }
            if (qts < BUTTERWORTH_QTC - 0.02) {
                try { alignments.push({ box: SealedBox.butterworth(driver), name: 'Butterworth', color: COLORS.primary, qtc: BUTTERWORTH_QTC }); } catch { /* guard should prevent this */ }
            }
            alignments.push({ box, name: 'Current', color: COLORS.actual, qtc: box.qtc, isCurrent: true });
            if (qts < CHEBYSHEV_QTC - 0.05) {
                try {
                    const cheb = SealedBox.chebyshev(driver);
                    if (Math.abs(cheb.volumeLiters - box.volumeLiters) > 5) {
                        alignments.push({ box: cheb, name: 'Chebyshev', color: COLORS.excursion, qtc: CHEBYSHEV_QTC });
                    }
                } catch { /* guard should prevent this */ }
            }

            const layers = [zeroDbLine(fMin, fMax), refLine(-3, '-3 dB (F3)', fMin, fMax)];
            for (const a of alignments) {
                const curve = a.box.responseCurve(fMin, fMax, ctx.pointsHigh);
                layers.push({
                    data: curve,
                    label: `${a.name} ${a.box.volumeLiters.toFixed(0)}L (Qtc=${a.qtc.toFixed(2)})`,
                    color: a.color,
                    width: a.isCurrent ? 2.5 : 1.5,
                    dashed: !a.isCurrent,
                    yKey: 'db'
                });
            }

            return layers;
        }
    },

    splVsPower: {
        id: 'splVsPowerChart',
        label: 'SPL (dB)',
        domain: Domain.POWER,
        yRange: { min: null, max: null },
        requires: Requires.SPL,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, _ctx) => {
            const driver = box.driver;
            const refFreq = 30;

            const powerPoints = [];
            for (let p = 10; p <= 2000; p *= 1.2) powerPoints.push(Math.round(p));

            const splCurve = powerPoints.map(power => ({ x: power, y: box.splAt(refFreq, power) }));

            const layers = [{ data: splCurve, label: `SPL @ ${refFreq}Hz`, color: COLORS.primary, width: 2 }];

            if (driver.pe) {
                const thermalSpl = box.splAt(refFreq, driver.pe);
                layers.push({ data: [{ x: driver.pe, y: 70 }, { x: driver.pe, y: thermalSpl + 5 }], label: `Thermal (${driver.pe}W)`, color: COLORS.thermal, dashed: true, width: 1.5 });
            }

            if (box.canCalculateLimits) {
                const xlimPower = box.maxPowerAt(refFreq);
                if (xlimPower && xlimPower < 2000) {
                    const xlimSpl = box.splAt(refFreq, xlimPower);
                    layers.push({ data: [{ x: xlimPower, y: 70 }, { x: xlimPower, y: xlimSpl + 5 }], label: `Xmax (${Math.round(xlimPower)}W)`, color: COLORS.excursion, dashed: true, width: 1.5 });
                }
            }

            return layers;
        }
    },

    // =========================================================================
    // PORTED/VENTED SPECIFIC
    // =========================================================================

    portVelocity: {
        id: 'portVelocityChart',
        label: 'Velocity (m/s)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.PORT,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'portConfig', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'scale-amplitude', yKeys: ['velocity'] },
        render: (box, ctx) => {
            if (!box.isPort) return [naPlaceholder(box.isPassiveRadiator ? 'passive radiator' : 'sealed box')];

            const { power, showAdjusted, applyDsp, getFreqRange, VELOCITY_LIMITS } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const velocityCurve = box.portVelocityCurve(power, fMin, fMax, ctx.points);
            const adjustedCurve = applyDsp(velocityCurve);
            const isFlared = box.vent.flared;
            // Use appropriate limit: Young 1975 limit (10 m/s) for straight, quiet (15 m/s) for flared
            const cautionLimit = isFlared ? VELOCITY_LIMITS.quiet : VELOCITY_LIMITS.straight_limit;
            const hasOverLimit = adjustedCurve.some(p => p.velocity > cautionLimit);
            const maxVel = box.vent.maxVelocity;

            const layers = [];

            // Show appropriate thresholds based on flare status
            if (isFlared) {
                layers.push({ data: [{ x: fMin, y: VELOCITY_LIMITS.quiet }, { x: fMax, y: VELOCITY_LIMITS.quiet }], label: `Safe (${VELOCITY_LIMITS.quiet} m/s)`, color: COLORS.actual, dashed: true, width: 1.5 });
            } else {
                // Straight port: show Young 1975 limit (10 m/s) prominently
                layers.push({ data: [{ x: fMin, y: VELOCITY_LIMITS.straight_limit }, { x: fMax, y: VELOCITY_LIMITS.straight_limit }], label: `Young '75 limit (${VELOCITY_LIMITS.straight_limit} m/s)`, color: COLORS.excursion, dashed: true, width: 1.5 });
            }

            layers.push({ data: [{ x: fMin, y: maxVel }, { x: fMax, y: maxVel }], label: `Max ${isFlared ? 'flared' : 'straight'} (${maxVel} m/s)`, color: COLORS.thermal, dashed: true, width: 1 });
            layers.push({ data: adjustedCurve, label: showAdjusted ? `Velocity @ ${power}W (with DSP)` : `Velocity @ ${power}W`, color: hasOverLimit ? COLORS.excursion : COLORS.primary, width: 2, yKey: 'velocity' });

            return layers;
        }
    },

    prExcursion: {
        id: 'prExcursionChart',
        label: 'Excursion (mm)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.PR,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'scale-amplitude', yKeys: ['excursion'] },
        render: (box, ctx) => {
            if (!box.isPassiveRadiator) return [naPlaceholder(box.isPort ? 'ported box' : 'sealed box')];

            const { power, showAdjusted, applyDsp, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const prCurve = box.prExcursionCurve(power, fMin, fMax, ctx.points);
            const adjustedCurve = applyDsp(prCurve);
            const prXmax = box.vent.xmaxMm;
            const hasOverXmax = adjustedCurve.some(p => p.excursion > prXmax);

            return [
                { data: [{ x: fMin, y: prXmax }, { x: fMax, y: prXmax }], label: `PR Xmax (${prXmax}mm)`, color: COLORS.excursion, dashed: true, width: 1.5 },
                { data: adjustedCurve, label: showAdjusted ? `PR Excursion @ ${power}W (with DSP)` : `PR Excursion @ ${power}W`, color: hasOverXmax ? COLORS.excursion : COLORS.primary, width: 2, yKey: 'excursion' }
            ];
        }
    },

    portContribution: {
        id: 'portContributionChart',
        label: 'SPL (dB)',
        domain: Domain.FREQUENCY,
        yRange: { min: null, max: null },
        requires: Requires.PORT,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            if (!box.isPort) return [naPlaceholder(box.isPassiveRadiator ? 'passive radiator' : 'sealed box')];
            if (!box.contributionCurve) return [naPlaceholder('missing data')];

            const { getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const curve = box.contributionCurve(fMin, fMax, ctx.points);
            const fb = box.fb;
            const maxY = Math.max(...curve.map(p => Math.max(p.cone, p.port, p.total))) * 1.1;

            return [
                { data: [{ x: fb, y: 0 }, { x: fb, y: maxY }], label: `Fb (${fb.toFixed(0)}Hz)`, color: COLORS.reference, dashed: true, width: 1 },
                { data: curve, label: 'Total', color: COLORS.reference, width: 1, yKey: 'total', dashed: true },
                { data: curve, label: 'Cone', color: COLORS.primary, width: 2, yKey: 'cone' },
                { data: curve, label: 'Port', color: COLORS.excursion, width: 2, yKey: 'port' }
            ];
        }
    },

    prContribution: {
        id: 'prContributionChart',
        label: 'SPL (dB)',
        domain: Domain.FREQUENCY,
        yRange: { min: null, max: null },
        requires: Requires.PR,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            if (!box.isPassiveRadiator) return [naPlaceholder(box.isPort ? 'ported box' : 'sealed box')];
            if (!box.contributionCurve) return [naPlaceholder('missing data')];

            const { getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const curve = box.contributionCurve(fMin, fMax, ctx.points);
            const fb = box.fb;
            const maxY = Math.max(...curve.map(p => Math.max(p.cone, p.port, p.total))) * 1.1;

            return [
                { data: [{ x: fb, y: 0 }, { x: fb, y: maxY }], label: `Fb (${fb.toFixed(0)}Hz)`, color: COLORS.reference, dashed: true, width: 1 },
                { data: curve, label: 'Total', color: COLORS.reference, width: 1, yKey: 'total', dashed: true },
                { data: curve, label: 'Cone', color: COLORS.primary, width: 2, yKey: 'cone' },
                { data: curve, label: 'PR', color: COLORS.excursion, width: 2, yKey: 'port' }
            ];
        }
    },

    ventMach: {
        id: 'ventMachChart',
        label: 'Mach Number',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.PORT,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'portConfig', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'scale-amplitude', yKeys: ['mach'] },
        render: (box, ctx) => {
            if (!box.isPort) return [naPlaceholder(box.isPassiveRadiator ? 'passive radiator' : 'sealed box')];

            const { power, showAdjusted, applyDsp, getFreqRange, MACH_THRESHOLDS } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const machCurve = box.portMachCurve(power, fMin, fMax, ctx.points);
            const adjustedCurve = applyDsp(machCurve);
            const maxMach = Math.max(...adjustedCurve.map(p => p.mach));

            return [
                { data: [{ x: fMin, y: MACH_THRESHOLDS.safe }, { x: fMax, y: MACH_THRESHOLDS.safe }], label: `Safe (${MACH_THRESHOLDS.safe})`, color: COLORS.actual, dashed: true, width: 1.5 },
                { data: [{ x: fMin, y: MACH_THRESHOLDS.caution }, { x: fMax, y: MACH_THRESHOLDS.caution }], label: `Caution (${MACH_THRESHOLDS.caution})`, color: COLORS.excursion, dashed: true, width: 1 },
                { data: [{ x: fMin, y: MACH_THRESHOLDS.severe }, { x: fMax, y: MACH_THRESHOLDS.severe }], label: `Severe (${MACH_THRESHOLDS.severe})`, color: COLORS.thermal, dashed: true, width: 1 },
                { data: adjustedCurve, label: showAdjusted ? `Mach @ ${power}W (with DSP)` : `Mach @ ${power}W`, color: maxMach > MACH_THRESHOLDS.caution ? COLORS.excursion : COLORS.primary, width: 2, yKey: 'mach' }
            ];
        }
    },

    ventReynolds: {
        id: 'ventReynoldsChart',
        label: 'Reynolds Number',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.PORT,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'portConfig', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'scale-amplitude', yKeys: ['reynolds'] },
        render: (box, ctx) => {
            if (!box.isPort) return [naPlaceholder(box.isPassiveRadiator ? 'passive radiator' : 'sealed box')];

            const { power, showAdjusted, applyDsp, getFreqRange, REYNOLDS_THRESHOLDS } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const reynoldsCurve = box.portReynoldsCurve(power, fMin, fMax, ctx.points);
            const adjustedCurve = applyDsp(reynoldsCurve);
            const maxRe = Math.max(...adjustedCurve.map(p => p.reynolds));

            // Salvatti 2002: compression onset at Re=50k, severe at Re=100k
            return [
                { data: [{ x: fMin, y: REYNOLDS_THRESHOLDS.linear }, { x: fMax, y: REYNOLDS_THRESHOLDS.linear }], label: `Compression onset (50k, 1-3dB)`, color: COLORS.excursion, dashed: true, width: 1.5 },
                { data: [{ x: fMin, y: REYNOLDS_THRESHOLDS.turbulent }, { x: fMax, y: REYNOLDS_THRESHOLDS.turbulent }], label: `Severe (100k, >6dB)`, color: COLORS.thermal, dashed: true, width: 1 },
                { data: adjustedCurve, label: showAdjusted ? `Re @ ${power}W (with DSP)` : `Re @ ${power}W`, color: maxRe > REYNOLDS_THRESHOLDS.linear ? COLORS.excursion : COLORS.primary, width: 2, yKey: 'reynolds' }
            ];
        }
    },

    // =========================================================================
    // PASSIVE RADIATOR SPECIFIC
    // =========================================================================

    excursionComparison: {
        id: 'excursionComparisonChart',
        label: 'Excursion (mm)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.PR,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'scale-amplitude', yKeys: ['driverExcursion', 'prExcursion'] },
        render: (box, ctx) => {
            if (!box.isPassiveRadiator) return [naPlaceholder(box.isPort ? 'ported box' : 'sealed box')];

            const { power, showAdjusted, applyDsp, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const comparisonCurve = box.excursionComparisonCurve(power, fMin, fMax, ctx.points);
            const adjustedCurve = applyDsp(comparisonCurve);

            const driverXmax = box.driver.xmax;
            const prXmax = box.vent.xmaxMm;
            const driverOverXmax = adjustedCurve.some(p => p.driverExcursion > driverXmax);
            const prOverXmax = adjustedCurve.some(p => p.prExcursion > prXmax);

            return [
                { data: [{ x: fMin, y: driverXmax }, { x: fMax, y: driverXmax }], label: `Driver Xmax (${driverXmax}mm)`, color: COLORS.primary, dashed: true, width: 1.5 },
                { data: [{ x: fMin, y: prXmax }, { x: fMax, y: prXmax }], label: `PR Xmax (${prXmax}mm)`, color: COLORS.excursion, dashed: true, width: 1.5 },
                { data: adjustedCurve, label: showAdjusted ? `Driver @ ${power}W (DSP)` : `Driver @ ${power}W`, color: driverOverXmax ? COLORS.thermal : COLORS.primary, width: 2, yKey: 'driverExcursion' },
                { data: adjustedCurve, label: showAdjusted ? `PR @ ${power}W (DSP)` : `PR @ ${power}W`, color: prOverXmax ? COLORS.thermal : COLORS.excursion, width: 2, yKey: 'prExcursion' }
            ];
        }
    },

    prPowerLimit: {
        id: 'prPowerLimitChart',
        label: 'Power (W)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.PR,
        inputs: ['boxType', 'volume', 'tuning'],
        dspAdjust: null,
        render: (box, ctx) => {
            if (!box.isPassiveRadiator) return [naPlaceholder(box.isPort ? 'ported box' : 'sealed box')];

            const { getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const powerCurve = box.prPowerLimitCurve(fMin, fMax, ctx.points);

            // Find where PR becomes the limiter
            const prLimitedFreqs = powerCurve.filter(p => p.limitingFactor === 'pr');
            const prIsLimiter = prLimitedFreqs.length > powerCurve.length * 0.1; // >10% of range

            return [
                { data: powerCurve, label: 'Driver limit', color: COLORS.primary, width: 2, yKey: 'driverMaxPower' },
                { data: powerCurve, label: 'PR limit', color: COLORS.excursion, width: 2, yKey: 'prMaxPower' },
                { data: powerCurve, label: 'Effective limit', color: prIsLimiter ? COLORS.thermal : COLORS.actual, width: 2.5, yKey: 'effectiveMaxPower', dashed: true }
            ];
        }
    },

    // =========================================================================
    // MECHANICAL
    // =========================================================================

    coneVelocity: {
        id: 'coneVelocityChart',
        label: 'Velocity (m/s)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.LIMITS,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'scale-amplitude', yKeys: ['velocity'] },
        render: (box, ctx) => {
            const { power, showAdjusted, applyDsp, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const velocityCurve = box.coneVelocityCurve(power, fMin, fMax, ctx.points);
            const adjustedCurve = applyDsp(velocityCurve);
            const maxVelocity = Math.max(...adjustedCurve.map(p => p.velocity));

            return [
                { data: [{ x: fMin, y: 5 }, { x: fMax, y: 5 }], label: '5 m/s reference', color: COLORS.reference, dashed: true, width: 1 },
                { data: adjustedCurve, label: showAdjusted ? `Velocity @ ${power}W (with DSP)` : `Velocity @ ${power}W (max ${maxVelocity.toFixed(1)} m/s)`, color: COLORS.primary, width: 2, yKey: 'velocity' }
            ];
        }
    },

    coneAccel: {
        id: 'coneAccelChart',
        label: 'Acceleration (g)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.LIMITS,
        inputs: ['boxType', 'volume', 'tuning', 'power', 'modifiers', 'adjusted'],
        dspAdjust: { type: 'scale-amplitude', yKeys: ['accelG'] },
        render: (box, ctx) => {
            const { power, showAdjusted, applyDsp, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const accelCurve = box.coneAccelerationCurve(power, fMin, fMax, ctx.points);
            const adjustedCurve = applyDsp(accelCurve);

            return [
                { data: [{ x: fMin, y: 10 }, { x: fMax, y: 10 }], label: '10g reference', color: COLORS.reference, dashed: true, width: 1 },
                { data: adjustedCurve, label: showAdjusted ? `Acceleration @ ${power}W (with DSP)` : `Acceleration @ ${power}W`, color: COLORS.primary, width: 2, yKey: 'accelG' }
            ];
        }
    },

    // =========================================================================
    // NONLINEAR (KLIPPEL)
    // =========================================================================

    compression: {
        id: 'compressionChart',
        label: 'Compression (dB)',
        domain: Domain.FREQUENCY,
        yRange: { min: null, max: 0 },
        requires: Requires.LIMITS,
        inputs: ['boxType', 'volume', 'tuning', 'power'],
        dspAdjust: null,
        render: (box, ctx) => {
            const { power, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const curve = box.compressionCurve(power, fMin, fMax, ctx.points);

            const graphData = curve.map(p => ({ x: p.frequency, y: p.compressionDb }));
            const layers = [
                { data: [{ x: fMin, y: -3 }, { x: fMax, y: -3 }], label: '-3dB (significant)', color: COLORS.warning, dashed: true, width: 1 },
                { data: graphData, label: `Compression @ ${power}W`, color: COLORS.secondary, width: 2 }
            ];

            const peakPoint = curve.reduce((worst, p) => p.compressionDb < worst.compressionDb ? p : worst, curve[0]);
            if (peakPoint.compressionDb < -0.5) {
                layers.push({
                    data: [{ x: peakPoint.frequency, y: 0 }, { x: peakPoint.frequency, y: peakPoint.compressionDb }],
                    label: `Peak: ${peakPoint.compressionDb.toFixed(1)}dB @ ${peakPoint.frequency.toFixed(0)}Hz`,
                    color: COLORS.danger,
                    dashed: true,
                    width: 1
                });
            }

            return layers;
        }
    },

    distortion: {
        id: 'distortionChart',
        label: 'THD (%)',
        domain: Domain.FREQUENCY,
        yRange: { min: 0, max: null },
        requires: Requires.LIMITS,
        inputs: ['boxType', 'volume', 'tuning', 'power'],
        dspAdjust: null,
        render: (box, ctx) => {
            const { power, getFreqRange } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();
            const curve = box.distortionCurve(power, fMin, fMax, ctx.points);

            const thdData = curve.map(p => ({ x: p.frequency, y: p.thd }));
            const hd3Data = curve.map(p => ({ x: p.frequency, y: p.hd3 }));
            const hd2Data = curve.map(p => ({ x: p.frequency, y: p.hd2 }));

            const layers = [
                { data: [{ x: fMin, y: 1 }, { x: fMax, y: 1 }], label: '1% (low)', color: COLORS.success, dashed: true, width: 1 },
                { data: [{ x: fMin, y: 3 }, { x: fMax, y: 3 }], label: '3% (moderate)', color: COLORS.warning, dashed: true, width: 1 },
                { data: [{ x: fMin, y: 10 }, { x: fMax, y: 10 }], label: '10% (high)', color: COLORS.danger, dashed: true, width: 1 },
                { data: hd2Data, label: 'HD2', color: COLORS.tertiary, width: 1.5 },
                { data: hd3Data, label: 'HD3', color: COLORS.secondary, width: 1.5 },
                { data: thdData, label: `THD @ ${power}W`, color: COLORS.primary, width: 2.5 }
            ];

            try {
                const limitFreq = box.distortionLimitFrequency(power, 3);
                if (limitFreq && limitFreq >= 10 && limitFreq <= 200) {
                    layers.push({
                        data: [{ x: limitFreq, y: 0 }, { x: limitFreq, y: 15 }],
                        label: `3% limit: ${limitFreq.toFixed(0)}Hz`,
                        color: COLORS.warning,
                        dashed: true,
                        width: 1.5
                    });
                }
            } catch {}

            return layers;
        }
    },

    blCurve: {
        id: 'blCurveChart',
        label: 'Bl / Bl₀',
        domain: Domain.DISPLACEMENT,
        yRange: { min: 0, max: 1.2 },
        requires: Requires.LIMITS,
        inputs: [],
        dspAdjust: null,
        render: (box, ctx) => {
            const xmax = box.driver.xmax;
            if (!xmax) return [naPlaceholder('no Xmax')];

            const { blFromXmax } = ctx;
            const range = xmax * 1.2;
            const curveData = [];
            const linearData = [];

            for (let i = 0; i <= ctx.points; i++) {
                const x = -range + (2 * range * i / ctx.points);
                curveData.push({ x, y: blFromXmax(x, 1.0, xmax) });
                linearData.push({ x, y: 1.0 });
            }

            return [
                { data: linearData, label: 'Small-signal (constant)', color: COLORS.reference, dashed: true, width: 1 },
                { data: [{ x: -xmax, y: 0 }, { x: -xmax, y: 1.1 }], label: '-Xmax', color: COLORS.warning, dashed: true, width: 1 },
                { data: [{ x: xmax, y: 0 }, { x: xmax, y: 1.1 }], label: '+Xmax', color: COLORS.warning, dashed: true, width: 1 },
                { data: curveData, label: 'Bl(x) / Bl₀', color: COLORS.primary, width: 2 }
            ];
        }
    },

    kmsCurve: {
        id: 'kmsCurveChart',
        label: 'Kms / Kms₀',
        domain: Domain.DISPLACEMENT,
        yRange: { min: 0.8, max: 3 },
        requires: Requires.LIMITS,
        inputs: [],
        dspAdjust: null,
        render: (box, ctx) => {
            const xmax = box.driver.xmax;
            if (!xmax) return [naPlaceholder('no Xmax')];

            const { kmsFromXmax } = ctx;
            const range = xmax * 1.2;
            const curveData = [];
            const linearData = [];

            for (let i = 0; i <= ctx.points; i++) {
                const x = -range + (2 * range * i / ctx.points);
                curveData.push({ x, y: kmsFromXmax(x, 1.0, xmax) });
                linearData.push({ x, y: 1.0 });
            }

            return [
                { data: linearData, label: 'Small-signal (constant)', color: COLORS.reference, dashed: true, width: 1 },
                { data: [{ x: -xmax, y: 0.8 }, { x: -xmax, y: 2.5 }], label: '-Xmax', color: COLORS.warning, dashed: true, width: 1 },
                { data: [{ x: xmax, y: 0.8 }, { x: xmax, y: 2.5 }], label: '+Xmax', color: COLORS.warning, dashed: true, width: 1 },
                { data: curveData, label: 'Kms(x) / Kms₀', color: COLORS.excursion, width: 2 }
            ];
        }
    },

    // =========================================================================
    // DSP/ENVIRONMENT (special - no box dependency)
    // =========================================================================

    dsp: {
        id: 'dspChart',
        label: 'DSP (dB)',
        domain: Domain.FREQUENCY,
        yRange: { min: null, max: null, suggestedMin: -24, suggestedMax: 15 },
        requires: Requires.DSP_ENABLED,
        inputs: ['modifiers'],
        dspAdjust: null,
        noBox: true,  // Special flag: this graph doesn't need a box
        render: (box, ctx) => {
            const { modifierStack, getFreqRange, isActiveModifier, CATEGORY_COLORS, FILTER_COLORS } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();

            const layers = [zeroDbLine(fMin, fMax)];
            if (!modifierStack) return layers;

            const activeModifiers = modifierStack.modifiers.filter(m => m.enabled && isActiveModifier(m.category));
            if (activeModifiers.length === 0) return layers;

            activeModifiers.forEach((modifier, index) => {
                const curve = [];
                for (let f = fMin; f <= fMax; f *= 1.05) curve.push({ x: f, y: modifier.magnitudeAt(f) });
                layers.push({ data: curve, label: modifier.name, color: CATEGORY_COLORS[modifier.category] || FILTER_COLORS[index % FILTER_COLORS.length], width: 1.5, dashed: true });
            });

            if (activeModifiers.length > 1) {
                const totalCurve = [];
                for (let f = fMin; f <= fMax; f *= 1.05) {
                    totalCurve.push({ x: f, y: activeModifiers.reduce((sum, m) => sum + m.magnitudeAt(f), 0) });
                }
                layers.push({ data: totalCurve, label: 'DSP Total', color: '#ffffff', width: 2.5 });
            }

            return layers;
        }
    },

    dspPhase: {
        id: 'dspPhaseChart',
        label: 'Phase (°)',
        domain: Domain.FREQUENCY,
        yRange: { min: null, max: null, suggestedMin: -180, suggestedMax: 180 },
        requires: Requires.DSP_ENABLED,
        inputs: ['modifiers'],
        dspAdjust: null,
        noBox: true,
        render: (box, ctx) => {
            const { modifierStack, getFreqRange, isActiveModifier, CATEGORY_COLORS, FILTER_COLORS } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();

            const layers = [zeroLine(fMin, fMax)];
            if (!modifierStack) return layers;

            const activeModifiers = modifierStack.modifiers.filter(m => m.enabled && isActiveModifier(m.category));
            if (activeModifiers.length === 0) return layers;

            activeModifiers.forEach((modifier, index) => {
                const curve = [];
                for (let f = fMin; f <= fMax; f *= 1.05) curve.push({ x: f, y: modifier.phaseAt(f) });
                layers.push({ data: curve, label: modifier.name, color: CATEGORY_COLORS[modifier.category] || FILTER_COLORS[index % FILTER_COLORS.length], width: 1.5, dashed: true });
            });

            if (activeModifiers.length > 1) {
                const totalCurve = [];
                for (let f = fMin; f <= fMax; f *= 1.05) {
                    totalCurve.push({ x: f, y: activeModifiers.reduce((sum, m) => sum + m.phaseAt(f), 0) });
                }
                layers.push({ data: totalCurve, label: 'DSP Total', color: '#ffffff', width: 2.5 });
            }

            return layers;
        }
    },

    environment: {
        id: 'environmentChart',
        label: 'Room Gain (dB)',
        domain: Domain.FREQUENCY,
        yRange: { min: -10, max: 20 },
        requires: Requires.ENV_ENABLED,
        inputs: ['modifiers'],
        dspAdjust: null,
        noBox: true,
        render: (box, ctx) => {
            const { modifierStack, getFreqRange, isPassiveModifier, CATEGORY_COLORS, FILTER_COLORS } = ctx;
            const { min: fMin, max: fMax } = getFreqRange();

            const layers = [zeroDbLine(fMin, fMax)];
            if (!modifierStack) return layers;

            const passiveModifiers = modifierStack.modifiers.filter(m => m.enabled && isPassiveModifier(m.category));
            if (passiveModifiers.length === 0) return layers;

            passiveModifiers.forEach((modifier, index) => {
                const curve = [];
                for (let f = fMin; f <= fMax; f *= 1.05) curve.push({ x: f, y: modifier.magnitudeAt(f) });
                layers.push({ data: curve, label: modifier.name, color: CATEGORY_COLORS[modifier.category] || FILTER_COLORS[index % FILTER_COLORS.length], width: 1.5, dashed: true });
            });

            if (passiveModifiers.length > 1) {
                const totalCurve = [];
                for (let f = fMin; f <= fMax; f *= 1.05) {
                    totalCurve.push({ x: f, y: passiveModifiers.reduce((sum, m) => sum + m.magnitudeAt(f), 0) });
                }
                layers.push({ data: totalCurve, label: 'Room Total', color: '#f0883e', width: 2.5 });
            }

            return layers;
        }
    }
};

// ============================================================================
// DERIVED MAPS (auto-generated from registry)
// ============================================================================

/**
 * Generate GRAPH_INPUTS map from registry
 */
export function deriveGraphInputs() {
    const inputs = {};
    for (const [_key, config] of Object.entries(GRAPH_REGISTRY)) {
        inputs[config.id] = config.inputs || [];
    }
    return inputs;
}

/**
 * Generate DSP_ADJUSTMENTS map from registry
 */
export function deriveDspAdjustments() {
    const adjustments = {};
    for (const [_key, config] of Object.entries(GRAPH_REGISTRY)) {
        if (config.dspAdjust) {
            adjustments[config.id] = config.dspAdjust;
        }
    }
    return adjustments;
}

/**
 * Invert inputs map: setting -> [chart IDs affected]
 */
export function deriveSettingAffects(graphInputs) {
    const affects = {};
    for (const [chartId, settings] of Object.entries(graphInputs)) {
        for (const setting of settings) {
            if (!affects[setting]) affects[setting] = [];
            affects[setting].push(chartId);
        }
    }
    return affects;
}

/**
 * Get x-axis range for a domain type
 * @param {string} domain - Domain type from Domain enum
 * @param {Object} opts - Options: { freqMin, freqMax, timeMax, xmax }
 * @returns {{ min: number, max: number, logScale: boolean }}
 */
export function getDomainRange(domain, opts) {
    const { freqMin = 10, freqMax = 200, timeMax = 100, xmax = 30 } = opts;

    switch (domain) {
        case Domain.FREQUENCY:
            return { min: freqMin, max: freqMax, logScale: true };
        case Domain.FREQUENCY_EXTENDED:
            return { min: freqMin, max: freqMax * 2.5, logScale: true };
        case Domain.TIME:
            return { min: 0, max: timeMax, logScale: false };
        case Domain.DISPLACEMENT:
            return { min: -xmax * 1.2, max: xmax * 1.2, logScale: false };
        case Domain.POWER:
            return { min: 10, max: 2000, logScale: true };
        default:
            return { min: freqMin, max: freqMax, logScale: true };
    }
}

/**
 * Check if a box/context satisfies a graph's requirements
 * @param {Object} box - Box instance
 * @param {string} requires - Requires enum value
 * @param {Object} ctx - Render context (for state-based requirements like DSP_ENABLED)
 * @returns {boolean}
 */
export function checkRequirements(box, requires, ctx = {}) {
    if (!requires) return true;

    switch (requires) {
        case Requires.SPL:
            return box.canCalculateSpl;
        case Requires.LIMITS:
            return box.canCalculateLimits;
        case Requires.IMPEDANCE:
            return box.canCalculateImpedance;
        case Requires.VENTED:
            return box.isVented;
        case Requires.PORT:
            return box.isPort;
        case Requires.PR:
            return box.isPassiveRadiator;
        case Requires.DSP_ENABLED:
            return ctx.includeDsp === true;
        case Requires.ENV_ENABLED:
            return ctx.includeEnv === true;
        default:
            return true;
    }
}

/**
 * Get all graph keys
 */
export function getGraphKeys() {
    return Object.keys(GRAPH_REGISTRY);
}

/**
 * Get graph config by key
 */
export function getGraphConfig(key) {
    return GRAPH_REGISTRY[key];
}

/**
 * Count of all registered graphs
 */
export const GRAPH_COUNT = Object.keys(GRAPH_REGISTRY).length;

// ============================================================================
// GRAPH RENDERER
// ============================================================================

/**
 * Create a renderer for a graph that wraps error handling and capability checks
 *
 * @param {string} graphKey - Key in GRAPH_REGISTRY
 * @param {Object} graphInstance - Graph instance to render to
 * @param {Function} safeUpdateGraph - Error wrapper function from app.js
 * @returns {Function} - Renderer function: (box, ctx) => void
 */
export function createGraphRenderer(graphKey, graphInstance, safeUpdateGraph) {
    const config = GRAPH_REGISTRY[graphKey];
    if (!config) {
        throw new Error(`Unknown graph: ${graphKey}`);
    }

    return function render(box, ctx) {
        // Check requirements - skip render entirely if not met
        if (config.requires && !checkRequirements(box, config.requires, ctx)) {
            safeUpdateGraph(graphInstance, graphKey, () => {
                // Feature toggles: show why disabled
                // Missing params: show N/A so user knows why graph is empty
                if (config.requires === Requires.DSP_ENABLED) {
                    graphInstance.setLayers([naPlaceholder('no DSP configured')]);
                } else if (config.requires === Requires.ENV_ENABLED) {
                    graphInstance.setLayers([naPlaceholder('no room gain configured')]);
                } else {
                    // Map capability requirements to user-friendly messages
                    const requiresMessages = {
                        [Requires.SPL]: 'SPL params (sensitivity, Re)',
                        [Requires.LIMITS]: 'limit params (Xmax, Pe, motor)',
                        [Requires.IMPEDANCE]: 'impedance params (Re, Bl, Mms, etc.)'
                    };
                    const msg = requiresMessages[config.requires] || 'required parameters';
                    graphInstance.setLayers([naPlaceholder(`missing ${msg}`)]);
                }
            });
            return;
        }

        safeUpdateGraph(graphInstance, graphKey, () => {

            // Create graph-specific context:
            // - applyDsp bound to this chart's ID
            // - getFreqRange returns domain-appropriate range (extended for electrical graphs)
            const graphCtx = {
                ...ctx,
                applyDsp: (curve) => ctx.applyDsp(config.id, curve),
                getFreqRange: () => {
                    const base = ctx.getFreqRange();
                    if (config.domain === Domain.FREQUENCY_EXTENDED) {
                        return { min: base.min, max: Math.round(base.max * 2.5) };
                    }
                    return base;
                }
            };

            // Call render function
            const layers = config.render(box, graphCtx);
            graphInstance.setLayers(layers);
        });
    };
}

/**
 * Create render context with all dependencies graphs might need
 *
 * This is the "ctx" object passed to render functions.
 * Centralizing it here ensures all graphs get the same interface.
 *
 * @param {Object} deps - Dependencies from app.js
 * @returns {Object} - Render context
 */
export function createRenderContext(deps) {
    const {
        // State
        power,
        targetSpl,
        showAdjusted,
        modifierStack,
        derating,
        frequencyMin,
        frequencyMax,
        timeMax,
        // Helpers
        applyDsp,
        getHeadroomCurve,
        // Model constructors (for comparison graphs)
        SealedBox,
        VentedBox,
        // Klippel functions
        blFromXmax,
        kmsFromXmax,
        // Modifier category helpers
        isActiveModifier,
        isPassiveModifier,
        CATEGORY_COLORS,
        FILTER_COLORS,
        // Constants
        VELOCITY_LIMITS,
        MACH_THRESHOLDS,
        REYNOLDS_THRESHOLDS,
        // Point counts
        points,
        pointsHigh
    } = deps;

    return {
        // State values
        power,
        targetSpl,
        showAdjusted,
        modifierStack,
        derating,
        timeMax,
        points,
        pointsHigh,

        // Frequency range getter (returns {min, max} based on graph's domain)
        getFreqRange: () => ({ min: frequencyMin, max: frequencyMax }),

        // DSP adjustment applier
        applyDsp,

        // Special helper for headroom calculation
        getHeadroomCurve,

        // Model constructors for comparison graphs
        SealedBox,
        VentedBox,

        // Klippel functions
        blFromXmax,
        kmsFromXmax,

        // Modifier helpers
        isActiveModifier,
        isPassiveModifier,
        CATEGORY_COLORS,
        FILTER_COLORS,

        // Physics constants
        VELOCITY_LIMITS,
        MACH_THRESHOLDS,
        REYNOLDS_THRESHOLDS
    };
}

/**
 * Update graph options based on domain
 *
 * Call this when creating graphs or when frequency range changes.
 *
 * @param {Object} graphInstance - Graph instance
 * @param {string} domain - Domain type
 * @param {Object} opts - Range options
 */
export function updateGraphDomain(graphInstance, domain, opts) {
    const range = getDomainRange(domain, opts);
    graphInstance.setOptions({
        xMin: range.min,
        xMax: range.max,
        xLog: range.logScale
    });
}

// ============================================================================
// STARTUP VALIDATION
// ============================================================================
// Runs at import time - catches yKey mismatches before any graphs render.
// This prevents silent "empty graph" bugs that are hard to debug.

/**
 * Validate all yKeys in GRAPH_REGISTRY.
 *
 * Checks:
 * 1. dspAdjust.yKeys - fields that get DSP adjustment applied
 *
 * Throws at startup if any yKey is invalid, with helpful error message.
 */
function validateAllYKeys() {
    const errors = [];

    for (const [graphKey, config] of Object.entries(GRAPH_REGISTRY)) {
        // Validate dspAdjust.yKeys
        if (config.dspAdjust?.yKeys) {
            for (const yKey of config.dspAdjust.yKeys) {
                if (!ALL_VALID_Y_KEYS.has(yKey)) {
                    // Find suggestion
                    let suggestion = '';
                    for (const valid of ALL_VALID_Y_KEYS) {
                        if (valid.toLowerCase().includes(yKey.toLowerCase()) ||
                            yKey.toLowerCase().includes(valid.toLowerCase())) {
                            suggestion = ` Did you mean '${valid}'?`;
                            break;
                        }
                    }
                    errors.push(
                        `Graph '${graphKey}' (${config.id}): ` +
                        `invalid dspAdjust.yKey '${yKey}'.${suggestion}`
                    );
                }
            }
        }
    }

    if (errors.length > 0) {
        throw new Error(
            `GRAPH REGISTRY VALIDATION FAILED:\n\n` +
            errors.map(e => `  • ${e}`).join('\n') +
            `\n\nValid yKeys: ${[...ALL_VALID_Y_KEYS].sort().join(', ')}`
        );
    }
}

// Run validation at import time
validateAllYKeys();
