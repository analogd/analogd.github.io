/**
 * Port Compression and Turbulence Tests
 *
 * Based on:
 * - Salvatti, Devantier & Button "Maximizing Performance from Loudspeaker Ports" JAES 2002
 * - Bezzola, Devantier & McMullin "Loudspeaker Port Design for Optimal Performance" AES 2019
 */

import {
    portEigenfrequency,
    assessReynoldsRegime,
    estimateFlarePenalty,
    calculateVelocityHeadroom,
    assessPortCompression,
    FlowRegime,
    THRESHOLDS
} from '../foundation/vented/port-compression.js';
import { Port } from '../models/vents/Port.js';

export function runPortCompressionTests({ test, expect, describe }) {

    // ========================================================================
    // EIGENFREQUENCY TESTS
    // ========================================================================

    describe('Port Eigenfrequency (Bezzola 2019)', () => {
        test('f_p1 = c/(2L) for typical port lengths', () => {
            // From Bezzola 2019: "Disregarding end corrections, the first
            // Eigenfrequency of ports f_p1 can be estimated by the half-wavelength"

            // 20cm port -> ~858 Hz
            const f20cm = portEigenfrequency(0.20);
            expect(f20cm).toBeCloseTo(857.5, 0);

            // 25cm port -> ~686 Hz
            const f25cm = portEigenfrequency(0.25);
            expect(f25cm).toBeCloseTo(686, 0);

            // 50cm port -> ~343 Hz
            const f50cm = portEigenfrequency(0.50);
            expect(f50cm).toBeCloseTo(343, 0);
        });

        test('eigenfrequency in typical 700-1000 Hz range for subwoofer ports', () => {
            // Paper: "f_p1 is larger than 343 Hz, which is several octaves
            // higher than the port tuning frequency"
            const f = portEigenfrequency(0.24);  // 24cm port
            expect(f).toBeGreaterThan(700);
            expect(f).toBeLessThan(1000);
        });

        test('throws for invalid port length', () => {
            expect(() => portEigenfrequency(0)).toThrow();
            expect(() => portEigenfrequency(-0.1)).toThrow();
        });
    });

    // ========================================================================
    // REYNOLDS REGIME TESTS
    // ========================================================================

    describe('Reynolds Regime Assessment (Salvatti 2002)', () => {
        test('linear regime below 50,000', () => {
            // Salvatti: "a Reynolds number of about 50,000 is a good
            // indicator of when the system begins to degrade"
            const regime = assessReynoldsRegime(30000);
            expect(regime.regime).toBe(FlowRegime.LINEAR);
            expect(regime.compressionRisk).toBe('low');
        });

        test('transition regime 50,000-100,000', () => {
            // Salvatti: "All designs seem to hit a wall near a Reynolds
            // number of about 50,000-100,000"
            const regime1 = assessReynoldsRegime(50000);
            expect(regime1.regime).toBe(FlowRegime.TRANSITION);
            expect(regime1.compressionRisk).toBe('moderate');

            const regime2 = assessReynoldsRegime(75000);
            expect(regime2.regime).toBe(FlowRegime.TRANSITION);
        });

        test('turbulent regime above 100,000', () => {
            const regime = assessReynoldsRegime(100000);
            expect(regime.regime).toBe(FlowRegime.TURBULENT);
            expect(regime.compressionRisk).toBe('high');
        });

        test('expected compression ranges match paper findings', () => {
            // Linear: minimal compression
            expect(assessReynoldsRegime(30000).expectedCompression).toContain('< 1');

            // Transition: 1-3 dB (from Bezzola 2019)
            expect(assessReynoldsRegime(75000).expectedCompression).toContain('1-3');

            // Turbulent: > 6 dB
            expect(assessReynoldsRegime(120000).expectedCompression).toContain('> 6');
        });

        test('throws for negative Reynolds number', () => {
            expect(() => assessReynoldsRegime(-1)).toThrow();
        });
    });

    // ========================================================================
    // FLARE PENALTY TESTS
    // ========================================================================

    describe('Flare Penalty Estimation (Salvatti/Bezzola)', () => {
        test('flared port has no baseline penalty', () => {
            const penalty = estimateFlarePenalty(30000, true);
            expect(penalty.baselinePenaltyDb).toBe(0);
            expect(penalty.highLevelPenaltyRange).toBe(null);
        });

        test('straight port has 2dB baseline penalty', () => {
            // Salvatti: "the straight port starts out with about 2 dB
            // less output than any flared port"
            const penalty = estimateFlarePenalty(30000, false);
            expect(penalty.baselinePenaltyDb).toBe(2);
        });

        test('straight port penalty increases in transition zone', () => {
            const penalty = estimateFlarePenalty(75000, false);
            expect(penalty.baselinePenaltyDb).toBe(2);
            expect(penalty.highLevelPenaltyRange[0]).toBe(2);
            expect(penalty.highLevelPenaltyRange[1]).toBe(6);
        });

        test('straight port 10-16 dB penalty in turbulent zone', () => {
            // Bezzola: "10 to 16 dB louder before noise becomes audible,
            // compared to straight ports"
            const penalty = estimateFlarePenalty(120000, false);
            expect(penalty.highLevelPenaltyRange[0]).toBe(10);
            expect(penalty.highLevelPenaltyRange[1]).toBe(16);
        });
    });

    // ========================================================================
    // VELOCITY HEADROOM TESTS
    // ========================================================================

    describe('Velocity Headroom Calculation', () => {
        test('large headroom when velocity low', () => {
            const headroom = calculateVelocityHeadroom(2, 0.10, true);
            expect(headroom.headroomDb).toBeGreaterThan(10);
        });

        test('limited headroom near velocity limits', () => {
            const headroom = calculateVelocityHeadroom(20, 0.10, true);
            expect(headroom.headroomDb).toBeLessThan(6);
        });

        test('zero headroom when at or above limit', () => {
            const headroom = calculateVelocityHeadroom(30, 0.10, true);
            expect(headroom.headroomDb).toBe(0);
        });

        test('straight port has lower limit than flared (large diameter)', () => {
            // Use larger diameter where practical velocity limits apply
            // (not Reynolds-limited)
            // For D=0.15m, Re limit = 50000 * 1.5e-5 / 0.15 = 5 m/s
            // So practical limits apply: 10 m/s straight vs 25 m/s flared
            const _straightHeadroom = calculateVelocityHeadroom(3, 0.15, false);
            const _flaredHeadroom = calculateVelocityHeadroom(3, 0.15, true);
            // Straight limit = min(5, 10) = 5
            // Flared limit = min(5, 25) = 5
            // Both Reynolds-limited at this diameter too.

            // Use even larger diameter: D=0.20m, Re limit = 50000 * 1.5e-5 / 0.20 = 3.75 m/s
            // Still Reynolds limited. The key insight is that Reynolds limit
            // is the same for both flared and straight - only practical limits differ.
            // At very large diameters where Re limit > 25, flared has advantage.

            // For D=0.50m, Re limit = 50000 * 1.5e-5 / 0.50 = 1.5 m/s
            // Still Reynolds-limited.

            // Actually, practical limits only matter when Re limit > practical limit.
            // Re_limit = 50000 * 1.5e-5 / D = 0.75 / D
            // For Re_limit > 10: D > 0.075m (7.5cm) - straight limit applies
            // For Re_limit > 25: D > 0.03m (3cm) - flared limit applies

            // So for any port > 7.5cm, Reynolds is the limiting factor.
            // The practical limits only matter for very small ports.

            // Test with 3cm port where flared limit (25) kicks in:
            const small_straight = calculateVelocityHeadroom(10, 0.03, false);
            const small_flared = calculateVelocityHeadroom(10, 0.03, true);
            // D=0.03m: Re limit = 0.75/0.03 = 25 m/s
            // Straight: min(25, 10) = 10
            // Flared: min(25, 25) = 25
            expect(small_straight.limitVelocity).toBe(10);
            expect(small_flared.limitVelocity).toBe(25);
        });

        test('Reynolds-based limit for small diameter ports', () => {
            // For D = 0.05m, v_onset = 50000 * 1.5e-5 / 0.05 = 15 m/s
            const headroom = calculateVelocityHeadroom(5, 0.05, true);
            expect(headroom.limitVelocity).toBe(15);
        });
    });

    // ========================================================================
    // COMPREHENSIVE ASSESSMENT TESTS
    // ========================================================================

    describe('Comprehensive Port Assessment', () => {
        test('assessment combines all metrics', () => {
            const assessment = assessPortCompression(10, 0.10, 0.25, true);

            expect(assessment).toHaveProperty('velocity');
            expect(assessment).toHaveProperty('reynolds');
            expect(assessment).toHaveProperty('mach');
            expect(assessment).toHaveProperty('regime');
            expect(assessment).toHaveProperty('flarePenalty');
            expect(assessment).toHaveProperty('headroom');
            expect(assessment).toHaveProperty('eigenfrequency');
            expect(assessment).toHaveProperty('overallRisk');
            expect(assessment).toHaveProperty('recommendations');
        });

        test('eigenfrequency calculated correctly', () => {
            const assessment = assessPortCompression(10, 0.10, 0.25, true);
            // 25cm port -> 686 Hz
            expect(assessment.eigenfrequency).toBeCloseTo(686, 0);
        });

        test('straight port gets flare recommendation', () => {
            const assessment = assessPortCompression(10, 0.10, 0.25, false);
            const hasFlareRec = assessment.recommendations.some(r => r.includes('flared'));
            expect(hasFlareRec).toBe(true);
        });

        test('high velocity triggers turbulent regime', () => {
            const assessment = assessPortCompression(20, 0.10, 0.25, true);
            // 20 m/s at 10cm diameter = Re = 133,333 -> turbulent
            expect(assessment.regime.regime).toBe(FlowRegime.TURBULENT);
            expect(assessment.overallRisk).toBe('critical');
        });

        test('low velocity is linear operation', () => {
            // Use very low velocity to ensure both regime is linear AND
            // headroom > 6 dB (required for 'low' overall risk)
            const assessment = assessPortCompression(2, 0.10, 0.25, true);
            expect(assessment.regime.regime).toBe(FlowRegime.LINEAR);
            expect(assessment.overallRisk).toBe('low');
        });
    });

    // ========================================================================
    // PORT MODEL INTEGRATION TESTS
    // ========================================================================

    describe('Port Model Compression Methods', () => {
        test('Port.eigenfrequencyFor matches foundation', () => {
            const port = new Port({ diameter: 10 });
            const lengthM = 0.25;

            const modelResult = port.eigenfrequencyFor(lengthM);
            const foundationResult = portEigenfrequency(lengthM);

            expect(modelResult).toBe(foundationResult);
        });

        test('Port.flowRegimeAt uses Reynolds correctly', () => {
            const port = new Port({ diameter: 10 });  // 10cm = 0.1m

            // At 5 m/s: Re = 5 * 0.1 / 1.5e-5 = 33,333 -> linear
            const regime = port.flowRegimeAt(5);
            expect(regime.regime).toBe(FlowRegime.LINEAR);

            // At 15 m/s: Re = 15 * 0.1 / 1.5e-5 = 100,000 -> turbulent
            const regime2 = port.flowRegimeAt(15);
            expect(regime2.regime).toBe(FlowRegime.TURBULENT);
        });

        test('Port.flarePenaltyAt reflects flared status', () => {
            const straightPort = new Port({ diameter: 10, flared: false });
            const flaredPort = new Port({ diameter: 10, flared: true });

            const straightPenalty = straightPort.flarePenaltyAt(10);
            const flaredPenalty = flaredPort.flarePenaltyAt(10);

            expect(straightPenalty.baselinePenaltyDb).toBe(2);
            expect(flaredPenalty.baselinePenaltyDb).toBe(0);
        });

        test('Port.velocityHeadroomAt different for straight vs flared', () => {
            // Use small diameter (3cm) where practical velocity limits apply
            // rather than Reynolds limit
            const straightPort = new Port({ diameter: 3, flared: false });
            const flaredPort = new Port({ diameter: 3, flared: true });

            const straightHeadroom = straightPort.velocityHeadroomAt(8);
            const flaredHeadroom = flaredPort.velocityHeadroomAt(8);

            // For 3cm port: Re limit = 25 m/s
            // Straight limit = min(25, 10) = 10
            // Flared limit = min(25, 25) = 25
            // At 8 m/s: straight has 20*log10(10/8) = 1.9 dB
            //           flared has 20*log10(25/8) = 9.9 dB
            expect(straightHeadroom.headroomDb).toBeLessThan(flaredHeadroom.headroomDb);
        });

        test('Port.compressionAssessmentAt provides full assessment', () => {
            const port = new Port({ diameter: 10, flared: true });
            const assessment = port.compressionAssessmentAt(10, 0.25);

            expect(assessment.velocity).toBe(10);
            expect(assessment).toHaveProperty('reynolds');
            expect(assessment.eigenfrequency).toBeCloseTo(686, 0);
        });
    });

    // ========================================================================
    // THRESHOLD CONSTANT TESTS
    // ========================================================================

    describe('Threshold Constants (Paper Values)', () => {
        test('Reynolds thresholds match Salvatti 2002', () => {
            expect(THRESHOLDS.REYNOLDS_LINEAR).toBe(50000);
            expect(THRESHOLDS.REYNOLDS_TURBULENT).toBe(100000);
        });

        test('velocity thresholds match paper values', () => {
            // Young 1975 via Salvatti
            expect(THRESHOLDS.VELOCITY_STRAIGHT_LIMIT).toBe(10);
            expect(THRESHOLDS.VELOCITY_FLARED_QUIET).toBe(15);
            expect(THRESHOLDS.VELOCITY_FLARED_LIMIT).toBe(25);
        });
    });
}
