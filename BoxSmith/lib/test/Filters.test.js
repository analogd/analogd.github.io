/**
 * Filters/Modifiers Tests - Transfer Function Math
 *
 * Validates:
 * 1. Transfer function responses (shelf, peak, HPF, LPF)
 * 2. Modifier class behavior
 * 3. ModifierStack aggregation and category filtering
 */

import {
    shelfResponse,
    peakResponse,
    highpassResponse,
    lowpassResponse,
    highpassComplex,
    lowpassComplex,
    shelfComplex,
    peakComplex,
    allpassComplex,
    ModifierCategory,
    ModifierType,
    Modifier,
    ModifierStack,
    ModifierPresets
} from '../../ui/filters.js';

// ============================================================================
// TEST SUITE
// ============================================================================

export function runFiltersTests(TestFramework) {
    const { describe, test, expect } = TestFramework;

    // ========================================================================
    // SHELF RESPONSE
    // ========================================================================

    describe('shelfResponse - Low Shelf Transfer Function', () => {
        test('Returns 0 when gain is 0', () => {
            expect(shelfResponse(20, 80, 0)).toBe(0);
            expect(shelfResponse(100, 80, 0)).toBe(0);
        });

        test('Returns 0 when cornerFreq is missing', () => {
            expect(shelfResponse(20, null, 6)).toBe(0);
            expect(shelfResponse(20, 0, 6)).toBe(0);
        });

        test('Returns full gain well below corner', () => {
            // At f << corner, response should approach gainDb
            const response = shelfResponse(10, 80, 6);
            expect(response).toBeCloseTo(6, 0);
        });

        test('Returns ~half gain at corner (-3dB point)', () => {
            // At f = corner, response = gain/2 for slope=1
            const response = shelfResponse(80, 80, 6);
            expect(response).toBeCloseTo(3, 0);
        });

        test('Returns near-zero well above corner', () => {
            // At f >> corner, response approaches 0
            const response = shelfResponse(800, 80, 6);
            expect(response).toBeLessThan(0.1);
        });

        test('Works with negative gain (cut)', () => {
            const response = shelfResponse(10, 80, -6);
            expect(response).toBeCloseTo(-6, 0);
        });

        test('Steeper slope gives faster rolloff', () => {
            const slope1 = shelfResponse(160, 80, 6, 1);
            const slope2 = shelfResponse(160, 80, 6, 2);
            // Higher slope = less response above corner
            expect(slope2).toBeLessThan(slope1);
        });
    });

    // ========================================================================
    // PEAK RESPONSE
    // ========================================================================

    describe('peakResponse - Parametric EQ', () => {
        test('Returns 0 when gain is 0', () => {
            expect(peakResponse(40, 40, 0, 2)).toBe(0);
        });

        test('Returns 0 when centerFreq is missing', () => {
            expect(peakResponse(40, null, 6, 2)).toBe(0);
            expect(peakResponse(40, 0, 6, 2)).toBe(0);
        });

        test('Returns full gain at center frequency', () => {
            const response = peakResponse(40, 40, 6, 2);
            expect(response).toBeCloseTo(6, 0);
        });

        test('Returns near-zero far from center', () => {
            // 2 octaves away with Q=2 should be minimal
            const response = peakResponse(160, 40, 6, 2);
            expect(response).toBeLessThan(0.5);
        });

        test('Higher Q gives narrower peak', () => {
            // At 1 octave away (80 Hz when center is 40 Hz)
            const lowQ = peakResponse(80, 40, 6, 1);
            const highQ = peakResponse(80, 40, 6, 4);
            // Higher Q = less response off-center
            expect(highQ).toBeLessThan(lowQ);
        });

        test('Works with negative gain (notch)', () => {
            const response = peakResponse(40, 40, -6, 2);
            expect(response).toBeCloseTo(-6, 0);
        });
    });

    // ========================================================================
    // HIGHPASS RESPONSE
    // ========================================================================

    describe('highpassResponse - HPF Transfer Function', () => {
        test('Returns 0 when cornerFreq is missing', () => {
            expect(highpassResponse(20, null, 4)).toBe(0);
            expect(highpassResponse(20, 0, 4)).toBe(0);
        });

        test('Returns 0 well above corner (passband)', () => {
            // 10× corner frequency should be passband
            const response = highpassResponse(200, 20, 4);
            expect(response).toBe(0);
        });

        test('Returns ~-3dB at corner (2nd order)', () => {
            // For Butterworth, -3dB at corner
            const response = highpassResponse(20, 20, 2);
            expect(response).toBeCloseTo(-3, 0);
        });

        test('Returns negative dB below corner (attenuation)', () => {
            const response = highpassResponse(10, 20, 4);
            expect(response).toBeLessThan(-10);
        });

        test('Higher order gives steeper rolloff', () => {
            // At 1 octave below corner
            const order2 = highpassResponse(10, 20, 2);  // 12 dB/oct
            const order4 = highpassResponse(10, 20, 4);  // 24 dB/oct
            const order6 = highpassResponse(10, 20, 6);  // 36 dB/oct

            // Each doubling of order adds ~12 dB/oct
            expect(order4).toBeLessThan(order2);
            expect(order6).toBeLessThan(order4);
        });

        test('Rolloff is approximately 6×order dB/octave', () => {
            // 1 octave below corner (10 Hz when corner is 20 Hz)
            const order4 = highpassResponse(10, 20, 4);
            // Should be approximately -24 dB (4 × 6 dB/oct × 1 octave)
            expect(order4).toBeCloseTo(-24, 0);  // Within 1 dB
        });

        test('Returns finite value at extreme attenuation', () => {
            // Very low frequency should return finite value, not -Infinity
            const response = highpassResponse(1, 20, 4);
            expect(response).toBeLessThan(0);
            expect(response).toBeGreaterThan(-200);  // Finite, not -Infinity
        });
    });

    // ========================================================================
    // LOWPASS RESPONSE
    // ========================================================================

    describe('lowpassResponse - LPF Transfer Function', () => {
        test('Returns 0 when cornerFreq is missing', () => {
            expect(lowpassResponse(200, null, 4)).toBe(0);
            expect(lowpassResponse(200, 0, 4)).toBe(0);
        });

        test('Returns 0 well below corner (passband)', () => {
            // 1/10× corner frequency should be passband
            const response = lowpassResponse(8, 80, 4);
            expect(response).toBe(0);
        });

        test('Returns negative dB above corner (attenuation)', () => {
            const response = lowpassResponse(160, 80, 4);
            expect(response).toBeLessThan(-10);
        });

        test('Higher order gives steeper rolloff', () => {
            // At 1 octave above corner
            const order2 = lowpassResponse(160, 80, 2);
            const order4 = lowpassResponse(160, 80, 4);

            expect(order4).toBeLessThan(order2);
        });
    });

    // ========================================================================
    // MODIFIER CLASS
    // ========================================================================

    describe('Modifier - Individual Modifier Behavior', () => {
        test('Constructs with defaults', () => {
            const mod = new Modifier({});
            expect(mod.enabled).toBe(true);
            expect(mod.category).toBe(ModifierCategory.EQ_DEMAND);
            expect(mod.type).toBe(ModifierType.SHELF);
        });

        test('Generates unique ID', () => {
            const mod1 = new Modifier({});
            const mod2 = new Modifier({});
            // IDs should be different
            const idsAreDifferent = mod1.id !== mod2.id;
            expect(idsAreDifferent).toBe(true);
        });

        test('Uses provided ID', () => {
            const mod = new Modifier({ id: 'my-id' });
            expect(mod.id).toBe('my-id');
        });

        test('SHELF type has correct params', () => {
            const mod = new Modifier({
                type: ModifierType.SHELF,
                cornerFreq: 60,
                gainDb: 9
            });
            expect(mod.cornerFreq).toBe(60);
            expect(mod.gainDb).toBe(9);
        });

        test('PEAK type has correct params', () => {
            const mod = new Modifier({
                type: ModifierType.PEAK,
                centerFreq: 40,
                gainDb: 6,
                q: 2
            });
            expect(mod.centerFreq).toBe(40);
            expect(mod.gainDb).toBe(6);
            expect(mod.q).toBe(2);
        });

        test('HPF type has correct params', () => {
            const mod = new Modifier({
                type: ModifierType.HPF,
                cornerFreq: 20,
                order: 4
            });
            expect(mod.cornerFreq).toBe(20);
            expect(mod.order).toBe(4);
        });

        test('magnitudeAt delegates to correct transfer function', () => {
            const shelf = new Modifier({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 6
            });
            expect(shelf.magnitudeAt(10)).toBeCloseTo(6, 0);
            expect(shelf.magnitudeAt(800)).toBeCloseTo(0, 0);

            const hpf = new Modifier({
                type: ModifierType.HPF,
                cornerFreq: 20,
                order: 4
            });
            expect(hpf.magnitudeAt(200)).toBe(0);
            expect(hpf.magnitudeAt(10)).toBeLessThan(-10);
        });

        test('Returns 0 when disabled', () => {
            const mod = new Modifier({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 6,
                enabled: false
            });
            expect(mod.magnitudeAt(10)).toBe(0);
        });

        test('toString returns readable description', () => {
            const shelf = new Modifier({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 6
            });
            expect(shelf.toString()).toContain('+6dB');
            expect(shelf.toString()).toContain('80Hz');

            const hpf = new Modifier({
                type: ModifierType.HPF,
                cornerFreq: 20,
                order: 4
            });
            expect(hpf.toString()).toContain('HPF');
            expect(hpf.toString()).toContain('20Hz');
            expect(hpf.toString()).toContain('24dB/oct');
        });

        test('categoryName returns human-readable name', () => {
            const roomGain = new Modifier({ category: ModifierCategory.ROOM_GAIN });
            expect(roomGain.categoryName()).toBe('Room Gain');

            const signal = new Modifier({ category: ModifierCategory.SIGNAL });
            expect(signal.categoryName()).toBe('Signal');
        });
    });

    // ========================================================================
    // MODIFIER STACK
    // ========================================================================

    describe('ModifierStack - Aggregation and Category Filtering', () => {
        test('Starts empty', () => {
            const stack = new ModifierStack();
            expect(stack.modifiers.length).toBe(0);
        });

        test('add() creates and stores modifier', () => {
            const stack = new ModifierStack();
            const mod = stack.add({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 6
            });

            expect(stack.modifiers.length).toBe(1);
            expect(mod.gainDb).toBe(6);
        });

        test('add() accepts Modifier instance', () => {
            const stack = new ModifierStack();
            const mod = new Modifier({ gainDb: 9 });
            stack.add(mod);

            expect(stack.modifiers[0]).toBe(mod);
        });

        test('remove() by ID', () => {
            const stack = new ModifierStack();
            const mod = stack.add({ gainDb: 6 });
            stack.add({ gainDb: 3 });

            stack.remove(mod.id);
            expect(stack.modifiers.length).toBe(1);
            expect(stack.modifiers[0].gainDb).toBe(3);
        });

        test('magnitudeAt sums all modifiers', () => {
            const stack = new ModifierStack();
            stack.add({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 6,
                category: ModifierCategory.ROOM_GAIN
            });
            stack.add({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 3,
                category: ModifierCategory.EQ_DEMAND
            });

            // At low freq, both shelves contribute full gain
            const total = stack.magnitudeAt(10);
            expect(total).toBeCloseTo(9, 0);
        });

        test('byCategory filters correctly', () => {
            const stack = new ModifierStack();
            stack.add({ category: ModifierCategory.ROOM_GAIN, gainDb: 6 });
            stack.add({ category: ModifierCategory.ROOM_GAIN, gainDb: 3 });
            stack.add({ category: ModifierCategory.EQ_DEMAND, gainDb: 4 });

            const roomGain = stack.byCategory(ModifierCategory.ROOM_GAIN);
            expect(roomGain.length).toBe(2);

            const eqDemand = stack.byCategory(ModifierCategory.EQ_DEMAND);
            expect(eqDemand.length).toBe(1);
        });

        test('byCategory excludes disabled modifiers', () => {
            const stack = new ModifierStack();
            stack.add({ category: ModifierCategory.ROOM_GAIN, gainDb: 6, enabled: true });
            stack.add({ category: ModifierCategory.ROOM_GAIN, gainDb: 3, enabled: false });

            const roomGain = stack.byCategory(ModifierCategory.ROOM_GAIN);
            expect(roomGain.length).toBe(1);
        });

        test('roomGainAt returns only room gain category', () => {
            const stack = new ModifierStack();
            stack.add({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 6,
                category: ModifierCategory.ROOM_GAIN
            });
            stack.add({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 3,
                category: ModifierCategory.EQ_DEMAND
            });

            // roomGainAt should only include ROOM_GAIN category
            expect(stack.roomGainAt(10)).toBeCloseTo(6, 0);
        });

        test('eqDemandAt returns only EQ demand category', () => {
            const stack = new ModifierStack();
            stack.add({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 6,
                category: ModifierCategory.ROOM_GAIN
            });
            stack.add({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 3,
                category: ModifierCategory.EQ_DEMAND
            });

            expect(stack.eqDemandAt(10)).toBeCloseTo(3, 0);
        });

        test('signalCutAt returns only signal category (HPF/LPF)', () => {
            const stack = new ModifierStack();
            stack.add({
                type: ModifierType.HPF,
                cornerFreq: 20,
                order: 4,
                category: ModifierCategory.SIGNAL
            });
            stack.add({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 6,
                category: ModifierCategory.ROOM_GAIN
            });

            // At 10 Hz, HPF should be attenuating (negative dB)
            const signalCut = stack.signalCutAt(10);
            expect(signalCut).toBeLessThan(-10);

            // Room gain should not be included (it would add +6, making total positive)
            // signalCut should be negative, not positive
            expect(signalCut).toBeLessThan(0);
        });

        test('getSummary returns key frequencies', () => {
            const stack = new ModifierStack();
            stack.add({
                type: ModifierType.SHELF,
                cornerFreq: 80,
                gainDb: 6
            });

            const summary = stack.getSummary();
            expect(summary).toHaveProperty('at20Hz');
            expect(summary).toHaveProperty('at30Hz');
            expect(summary).toHaveProperty('at50Hz');
            expect(summary).toHaveProperty('at80Hz');

            // Well below corner (20Hz when corner is 80Hz) - response approaches full gain
            // Shelf response at f << corner approaches gainDb but isn't exactly gainDb
            expect(summary.at20Hz).toBeGreaterThan(5);
            expect(summary.at20Hz).toBeLessThan(6.1);

            // At corner (80Hz), response is half gain (3dB for 6dB shelf)
            expect(summary.at80Hz).toBeCloseTo(3, 0);
        });

        test('clear removes all modifiers', () => {
            const stack = new ModifierStack();
            stack.add({ gainDb: 6 });
            stack.add({ gainDb: 3 });

            stack.clear();
            expect(stack.modifiers.length).toBe(0);
        });

        test('addPreset adds from preset key', () => {
            const stack = new ModifierStack();
            stack.addPreset('roomCorner');

            expect(stack.modifiers.length).toBe(1);
            expect(stack.modifiers[0].category).toBe(ModifierCategory.ROOM_GAIN);
            expect(stack.modifiers[0].gainDb).toBe(9);
        });

        test('responseCurve generates correct number of points', () => {
            const stack = new ModifierStack();
            stack.add({ type: ModifierType.SHELF, cornerFreq: 80, gainDb: 6 });

            const curve = stack.responseCurve(10, 200, 25);
            expect(curve.length).toBe(25);
            expect(curve[0].frequency).toBeCloseTo(10, 0);
            expect(curve[24].frequency).toBeCloseTo(200, 0);
        });
    });

    // ========================================================================
    // PRESETS
    // ========================================================================

    describe('ModifierPresets - Built-in Configurations', () => {
        test('Room gain presets have correct category', () => {
            expect(ModifierPresets.roomCorner.category).toBe(ModifierCategory.ROOM_GAIN);
            expect(ModifierPresets.roomTwoWalls.category).toBe(ModifierCategory.ROOM_GAIN);
            expect(ModifierPresets.roomOneWall.category).toBe(ModifierCategory.ROOM_GAIN);
        });

        test('EQ demand presets have correct category', () => {
            expect(ModifierPresets.eqHarman.category).toBe(ModifierCategory.EQ_DEMAND);
            expect(ModifierPresets.eqModerate.category).toBe(ModifierCategory.EQ_DEMAND);
            expect(ModifierPresets.eqRoomMode.category).toBe(ModifierCategory.EQ_DEMAND);
        });

        test('Signal presets have correct category', () => {
            expect(ModifierPresets.hpf20.category).toBe(ModifierCategory.SIGNAL);
            expect(ModifierPresets.hpf15.category).toBe(ModifierCategory.SIGNAL);
            expect(ModifierPresets.hpf25.category).toBe(ModifierCategory.SIGNAL);
        });

        test('Target presets have correct category', () => {
            expect(ModifierPresets.targetHarman.category).toBe(ModifierCategory.TARGET);
            expect(ModifierPresets.targetFlat.category).toBe(ModifierCategory.TARGET);
        });

        test('All presets can be instantiated', () => {
            for (const [_key, preset] of Object.entries(ModifierPresets)) {
                const mod = new Modifier(preset);
                expect(mod.name).toBe(preset.name);
            }
        });
    });

    // ========================================================================
    // EDGE CASES
    // ========================================================================

    describe('Edge Cases', () => {
        test('Empty stack returns 0 for all queries', () => {
            const stack = new ModifierStack();
            expect(stack.magnitudeAt(30)).toBe(0);
            expect(stack.roomGainAt(30)).toBe(0);
            expect(stack.eqDemandAt(30)).toBe(0);
            expect(stack.signalCutAt(30)).toBe(0);
        });

        test('Very high frequency HPF is passband', () => {
            const response = highpassResponse(1000, 20, 4);
            expect(response).toBe(0);
        });

        test('Very low frequency LPF is passband', () => {
            const response = lowpassResponse(1, 80, 4);
            expect(response).toBe(0);
        });

        test('Multiple HPFs stack additively', () => {
            const stack = new ModifierStack();
            stack.add({
                type: ModifierType.HPF,
                cornerFreq: 20,
                order: 2,
                category: ModifierCategory.SIGNAL
            });
            stack.add({
                type: ModifierType.HPF,
                cornerFreq: 20,
                order: 2,
                category: ModifierCategory.SIGNAL
            });

            // Two 12dB/oct HPFs = 24dB/oct effective
            const single = highpassResponse(10, 20, 2);
            const stacked = stack.signalCutAt(10);
            expect(stacked).toBeCloseTo(single * 2, 1);
        });
    });

    // ========================================================================
    // COMPLEX RESPONSE (PHASE)
    // ========================================================================

    describe('Complex Response - Phase Calculations', () => {
        test('HPF phase is 90° per order at corner frequency', () => {
            // At corner, phase = n × 45° (arctan(1) = 45°)
            const { phase } = highpassComplex(80, 80, 2);
            expect(phase).toBeCloseTo(90, 1);  // 2 orders × 45°
        });

        test('HPF phase approaches 0 in passband', () => {
            const { phase } = highpassComplex(800, 80, 4);
            expect(phase).toBe(0);  // Well above corner
        });

        test('LPF phase is negative (lagging)', () => {
            const { phase } = lowpassComplex(80, 80, 2);
            expect(phase).toBeCloseTo(-90, 1);  // 2 orders × -45°
        });

        test('LPF phase approaches 0 in passband', () => {
            const { phase } = lowpassComplex(8, 80, 4);
            expect(phase).toBe(0);  // Well below corner
        });

        test('Allpass has unity magnitude at all frequencies', () => {
            const atLow = allpassComplex(20, 80, 2);
            const atCorner = allpassComplex(80, 80, 2);
            const atHigh = allpassComplex(320, 80, 2);

            expect(atLow.magnitude).toBe(0);
            expect(atCorner.magnitude).toBe(0);
            expect(atHigh.magnitude).toBe(0);
        });

        test('Allpass phase is -90° at corner (order 1)', () => {
            // First-order allpass: phase = -2 × arctan(1) = -90°
            const { phase } = allpassComplex(80, 80, 1);
            expect(phase).toBeCloseTo(-90, 1);
        });

        test('Allpass phase is -180° at corner (order 2)', () => {
            // Second-order: phase = -2 × 2 × arctan(1) = -180°
            const { phase } = allpassComplex(80, 80, 2);
            expect(phase).toBeCloseTo(-180, 1);
        });

        test('Shelf phase is non-zero around corner', () => {
            const { phase } = shelfComplex(50, 50, 6, 1);
            // Boost causes lag (negative phase)
            expect(phase).toBeLessThan(0);
        });

        test('Peak phase is antisymmetric around center', () => {
            const below = peakComplex(40, 80, 6, 2);
            const above = peakComplex(160, 80, 6, 2);
            // Phase should be opposite signs
            expect(below.phase * above.phase).toBeLessThan(0);
        });

        test('Modifier complexAt returns both magnitude and phase', () => {
            const hpf = new Modifier({
                type: ModifierType.HPF,
                cornerFreq: 80,
                order: 4,
                category: ModifierCategory.SIGNAL
            });

            const result = hpf.complexAt(40);  // Below corner
            expect(result.magnitude).toBeLessThan(0);  // Attenuated
            expect(result.phase).toBeGreaterThan(0);   // Phase lead
        });

        test('ModifierStack phaseAt sums phases', () => {
            const stack = new ModifierStack();
            stack.add({
                type: ModifierType.HPF,
                cornerFreq: 80,
                order: 2,
                category: ModifierCategory.SIGNAL
            });
            stack.add({
                type: ModifierType.ALLPASS,
                cornerFreq: 80,
                order: 1,
                category: ModifierCategory.SIGNAL
            });

            // At corner: HPF gives +90°, allpass gives -90°, sum ≈ 0
            const phase = stack.phaseAt(80);
            expect(phase).toBeCloseTo(0, 0);
        });
    });
}
