/**
 * Response Modifiers
 *
 * Stackable modifiers for subwoofer design planning.
 * Each modifier has a CATEGORY that determines how it affects analysis:
 *
 * - ROOM_GAIN: Acoustic boost from boundaries (+dB = more output for same power)
 * - EQ_DEMAND: Expected EQ needs in deployment (+dB = more excursion/power needed)
 * - SIGNAL: Real DSP like HPF (cuts signal, reduces output)
 * - TARGET: Reference curve only (just draws a line, no calculations)
 */

import { generateLogFrequencies } from '../lib/foundation/utils.js';

// Re-export for backwards compatibility
export const generateFrequencies = generateLogFrequencies;

// ============================================================================
// Transfer Functions (magnitude only - these are planning tools, not real filters)
// ============================================================================

/**
 * Low shelf response curve
 * @param {number} frequency - Hz
 * @param {number} cornerFreq - Hz, -3dB point
 * @param {number} gainDb - dB at low frequencies
 * @param {number} slope - steepness, default 1
 * @returns {number} gain in dB at frequency
 */
export function shelfResponse(frequency, cornerFreq, gainDb, slope = 1) {
    if (gainDb === 0 || !cornerFreq) return 0;

    const ratio = frequency / cornerFreq;
    const x = Math.pow(ratio, 2 * slope);

    // At f << corner: response = gain
    // At f = corner: response = gain/2 (-3dB point)
    // At f >> corner: response ≈ 0
    return gainDb / (1 + x);
}

/**
 * Parametric EQ peak/dip response
 */
export function peakResponse(frequency, centerFreq, gainDb, q = 1) {
    if (gainDb === 0 || !centerFreq) return 0;

    const ratio = frequency / centerFreq;
    const logRatio = Math.log2(ratio);
    const bandwidth = 1 / q;
    const x = Math.pow(logRatio / bandwidth, 2);

    return gainDb * Math.exp(-x * 2);
}

// ============================================================================
// COMPLEX TRANSFER FUNCTIONS
// ============================================================================
// Filter response is fundamentally complex: H(jω) = magnitude × e^(jφ)
// We compute both from the same math to avoid duplication and stay accurate.
//
// Return format: { magnitude: dB, phase: degrees }
// Phase convention: positive = leading, negative = lagging

/**
 * High-pass filter complex response (Butterworth)
 * H(s) = s^n / (s^n + ωc^n) evaluated at s = jω
 * @returns {{ magnitude: number, phase: number }} magnitude in dB, phase in degrees
 */
export function highpassComplex(frequency, cornerFreq, order = 4) {
    if (!cornerFreq) return { magnitude: 0, phase: 0 };

    const ratio = frequency / cornerFreq;

    // Well into passband: unity gain, zero phase shift
    if (ratio >= 10) return { magnitude: 0, phase: 0 };

    // Magnitude: |H| = ratio^n / sqrt(1 + ratio^(2n))
    const r2n = Math.pow(ratio, 2 * order);
    const magnitudeLinear = Math.sqrt(r2n / (1 + r2n));
    const magnitude = magnitudeLinear <= 0 ? -60 : 20 * Math.log10(magnitudeLinear);

    // Phase: Each order contributes arctan(fc/f) of lead
    // Total phase = n × arctan(1/ratio) = n × (90° - arctan(ratio))
    const phase = order * Math.atan(1 / ratio) * (180 / Math.PI);

    return { magnitude, phase };
}

/**
 * Low-pass filter complex response (Butterworth)
 * H(s) = ωc^n / (s^n + ωc^n) evaluated at s = jω
 * @returns {{ magnitude: number, phase: number }} magnitude in dB, phase in degrees
 */
export function lowpassComplex(frequency, cornerFreq, order = 4) {
    if (!cornerFreq) return { magnitude: 0, phase: 0 };

    const ratio = frequency / cornerFreq;

    // Well into passband: unity gain, zero phase shift
    if (ratio <= 0.1) return { magnitude: 0, phase: 0 };

    // Magnitude: |H| = 1 / sqrt(1 + ratio^(2n))
    const r2n = Math.pow(ratio, 2 * order);
    const magnitudeLinear = Math.sqrt(1 / (1 + r2n));
    const magnitude = magnitudeLinear <= 0 ? -60 : 20 * Math.log10(magnitudeLinear);

    // Phase: Each order contributes -arctan(f/fc) of lag
    const phase = -order * Math.atan(ratio) * (180 / Math.PI);

    return { magnitude, phase };
}

/**
 * Room gain complex response (environmental effect, not a DSP filter)
 * Models room boundary reinforcement below a corner frequency.
 * Phase is 0 - this is a pressure phenomenon, not a filter.
 * Shape options:
 * - 'shelf': Traditional shelf (flat below corner)
 * - '1st': 1st order rise (6dB/oct) - larger/leakier rooms
 * - '2nd': 2nd order rise (12dB/oct) - smaller/sealed rooms (pressure vessel)
 * @returns {{ magnitude: number, phase: number }} magnitude in dB, phase always 0
 */
export function roomGainComplex(frequency, cornerFreq, gainDb, shape = '2nd') {
    if (gainDb === 0 || !cornerFreq) return { magnitude: 0, phase: 0 };

    const ratio = frequency / cornerFreq;

    if (shape === 'shelf') {
        // Shelf: full gain below corner, rolls off above
        // At f << corner: gainDb. At f = corner: gainDb/2. At f >> corner: 0.
        const magnitude = gainDb / (1 + ratio * ratio);
        return { magnitude, phase: 0 };
    }

    // 1st or 2nd order highpass-like rise below corner frequency
    // This models room pressurization: gain rises as wavelength exceeds room dimensions
    // At corner: 0dB (transition point)
    // Below corner: rises at 6dB/oct (1st) or 12dB/oct (2nd)
    // Above corner: 0dB (no room gain)
    const order = shape === '1st' ? 1 : 2;

    // Use inverted highpass response shape
    // HPF: |H| = ratio^n / sqrt(1 + ratio^(2n))  -> 0 below corner, 1 above
    // Room gain: we want gainDb below corner, 0 above
    // So: magnitude = gainDb * (1 - HPF_response)
    const r2n = Math.pow(ratio, 2 * order);
    const hpfLinear = Math.sqrt(r2n / (1 + r2n));
    const magnitude = gainDb * (1 - hpfLinear);

    return { magnitude, phase: 0 };
}

/**
 * Low shelf complex response
 * @returns {{ magnitude: number, phase: number }}
 */
export function shelfComplex(frequency, cornerFreq, gainDb, slope = 1) {
    if (gainDb === 0 || !cornerFreq) return { magnitude: 0, phase: 0 };

    const ratio = frequency / cornerFreq;
    const x = Math.pow(ratio, 2 * slope);

    // Magnitude: shelf shape
    const magnitude = gainDb / (1 + x);

    // Phase: peaks at corner, proportional to gain
    // Boost = lag (negative), cut = lead (positive)
    const xLin = Math.pow(ratio, slope);
    const maxPhase = -gainDb * 5.7 * (slope / 2);
    const phase = maxPhase * (2 * xLin) / (1 + xLin * xLin);

    return { magnitude, phase };
}

/**
 * Parametric EQ (bell) complex response
 * @returns {{ magnitude: number, phase: number }}
 */
export function peakComplex(frequency, centerFreq, gainDb, q = 1) {
    if (gainDb === 0 || !centerFreq) return { magnitude: 0, phase: 0 };

    const ratio = frequency / centerFreq;
    const logRatio = Math.log2(ratio);
    const bandwidth = 1 / q;
    const xSq = Math.pow(logRatio / bandwidth, 2);

    // Magnitude: bell shape
    const magnitude = gainDb * Math.exp(-xSq * 2);

    // Phase: antisymmetric around center, steeper with Q
    const x = logRatio / bandwidth;
    const maxPhase = -gainDb * 15 * q;
    const phase = maxPhase * x * Math.exp(-x * x);

    return { magnitude, phase };
}

/**
 * Allpass filter complex response (1st order)
 * Unity magnitude, pure phase rotation
 * H(s) = (s - ωc) / (s + ωc)
 * Phase: 0° at DC, -90° at Fc, -180° at infinity
 * @returns {{ magnitude: number, phase: number }}
 */
export function allpass1stOrderComplex(frequency, cornerFreq) {
    if (!cornerFreq) return { magnitude: 0, phase: 0 };

    const ratio = frequency / cornerFreq;
    const magnitude = 0;
    // Phase: -2 × arctan(f/fc)
    const phase = -2 * Math.atan(ratio) * (180 / Math.PI);

    return { magnitude, phase };
}

/**
 * Allpass filter complex response (2nd order biquad with Q)
 * H(s) = (s² - s·ω₀/Q + ω₀²) / (s² + s·ω₀/Q + ω₀²)
 * Phase: 0° at DC, -180° at Fc, -360° at infinity
 * Q controls sharpness of transition (higher Q = steeper, more delay at Fc)
 * @param {number} frequency - Hz
 * @param {number} centerFreq - Center frequency Hz
 * @param {number} q - Q factor (0.5 to 50 typical, 0.707 = Butterworth-like)
 * @returns {{ magnitude: number, phase: number }}
 */
export function allpass2ndOrderComplex(frequency, centerFreq, q = 0.707) {
    if (!centerFreq) return { magnitude: 0, phase: 0 };

    const w = frequency / centerFreq;
    const w2 = w * w;

    // Magnitude is always unity (0 dB) for allpass
    const magnitude = 0;

    // Phase: derived from H(jω) = (1 - w² - jw/Q) / (1 - w² + jw/Q) ... wait
    // Actually H(jω) numerator: (jω)² - jω·ω₀/Q + ω₀² = -ω² - jω·ω₀/Q + ω₀² = (ω₀² - ω²) - j·ω·ω₀/Q
    // Denominator: (ω₀² - ω²) + j·ω·ω₀/Q
    // These are complex conjugates, so |H| = 1
    // Phase = 2 × arctan(Im/Re) where Im = -ω·ω₀/Q, Re = ω₀² - ω²
    // Phase = -2 × arctan(ω·ω₀/Q / (ω₀² - ω²)) = -2 × arctan(w/Q / (1 - w²))

    const num = w / q;
    const den = 1 - w2;

    // Use atan2 for proper quadrant handling
    // At w < 1: den > 0, phase is small negative
    // At w = 1: den = 0, phase = -180°
    // At w > 1: den < 0, phase approaches -360°
    const phase = -2 * Math.atan2(num, den) * (180 / Math.PI);

    return { magnitude, phase };
}

/**
 * Allpass filter complex response (backwards compatible wrapper)
 * @param {number} frequency - Hz
 * @param {number} cornerFreq - Corner/center frequency Hz
 * @param {number} order - 1 or 2
 * @param {number} q - Q factor (only used for order=2)
 * @returns {{ magnitude: number, phase: number }}
 */
export function allpassComplex(frequency, cornerFreq, order = 2, q = 0.707) {
    if (order === 1) {
        return allpass1stOrderComplex(frequency, cornerFreq);
    } else {
        return allpass2ndOrderComplex(frequency, cornerFreq, q);
    }
}

// ============================================================================
// CONVENIENCE WRAPPERS (magnitude-only, for backwards compatibility)
// ============================================================================

/**
 * High-pass filter magnitude response
 * Returns negative dB below corner (attenuation)
 */
export function highpassResponse(frequency, cornerFreq, order = 4) {
    return highpassComplex(frequency, cornerFreq, order).magnitude;
}

/**
 * Low-pass filter magnitude response
 */
export function lowpassResponse(frequency, cornerFreq, order = 4) {
    return lowpassComplex(frequency, cornerFreq, order).magnitude;
}

/**
 * Allpass magnitude (always 0)
 */
export function allpassResponse(frequency, cornerFreq, _order = 2) {
    return 0;
}

// ============================================================================
// PHASE-ONLY WRAPPERS (delegate to complex functions)
// ============================================================================

export function highpassPhase(frequency, cornerFreq, order = 4) {
    return highpassComplex(frequency, cornerFreq, order).phase;
}

export function lowpassPhase(frequency, cornerFreq, order = 4) {
    return lowpassComplex(frequency, cornerFreq, order).phase;
}

export function shelfPhase(frequency, cornerFreq, gainDb, slope = 1) {
    return shelfComplex(frequency, cornerFreq, gainDb, slope).phase;
}

export function peakPhase(frequency, centerFreq, gainDb, q = 1) {
    return peakComplex(frequency, centerFreq, gainDb, q).phase;
}

export function allpassPhase(frequency, cornerFreq, order = 2) {
    return allpassComplex(frequency, cornerFreq, order).phase;
}

// ============================================================================
// Enums
// ============================================================================

/**
 * Modifier categories - determines how it affects analysis
 */
export const ModifierCategory = {
    ROOM_GAIN: 'room_gain',  // Acoustic boost - adds to output capability
    EQ_DEMAND: 'eq_demand',  // Expected EQ needs - adds to excursion/power demand
    SIGNAL: 'signal',        // Real DSP (HPF/LPF) - cuts signal, reduces output
    TARGET: 'target'         // Reference only - just draws a line
};

/**
 * Modifier shape types
 */
export const ModifierType = {
    SHELF: 'shelf',
    PEAK: 'peak',
    HPF: 'hpf',
    LPF: 'lpf',
    ALLPASS: 'allpass',  // Phase-only, no magnitude change
    ROOM_GAIN: 'room_gain'  // Room boundary reinforcement (shelf, 1st, or 2nd order)
};

// ============================================================================
// Presets - grouped by category
// ============================================================================

export const ModifierPresets = {
    // Room gain presets (user enters positive dB - "I get +XdB from the room")
    roomCorner: {
        category: ModifierCategory.ROOM_GAIN,
        type: ModifierType.SHELF,
        name: 'Corner (+9dB)',
        cornerFreq: 40,
        gainDb: 9,
        description: 'Corner placement: +9dB boost below 40Hz'
    },
    roomTwoWalls: {
        category: ModifierCategory.ROOM_GAIN,
        type: ModifierType.SHELF,
        name: 'Two walls (+6dB)',
        cornerFreq: 50,
        gainDb: 6,
        description: 'Floor + one wall: +6dB boost'
    },
    roomOneWall: {
        category: ModifierCategory.ROOM_GAIN,
        type: ModifierType.SHELF,
        name: 'One wall (+3dB)',
        cornerFreq: 60,
        gainDb: 3,
        description: 'Near one boundary: +3dB boost'
    },

    // EQ demand presets (user enters positive dB - "I expect to need +XdB EQ here")
    eqHarman: {
        category: ModifierCategory.EQ_DEMAND,
        type: ModifierType.SHELF,
        name: 'Harman-style (+6dB)',
        cornerFreq: 80,
        gainDb: 6,
        description: 'Expect +6dB shelf boost for Harman curve'
    },
    eqModerate: {
        category: ModifierCategory.EQ_DEMAND,
        type: ModifierType.SHELF,
        name: 'Moderate (+3dB)',
        cornerFreq: 80,
        gainDb: 3,
        description: 'Expect +3dB shelf boost'
    },
    eqRoomMode: {
        category: ModifierCategory.EQ_DEMAND,
        type: ModifierType.PEAK,
        name: 'Room mode fill (+6dB)',
        centerFreq: 40,
        gainDb: 6,
        q: 2,
        description: 'Expect +6dB narrow boost to fill a null'
    },

    // Signal processing presets (HPF - subsonic protection)
    hpf20: {
        category: ModifierCategory.SIGNAL,
        type: ModifierType.HPF,
        name: 'HPF 20Hz (24dB/oct)',
        cornerFreq: 20,
        order: 4,
        description: 'Subsonic protection at 20Hz'
    },
    hpf15: {
        category: ModifierCategory.SIGNAL,
        type: ModifierType.HPF,
        name: 'HPF 15Hz (24dB/oct)',
        cornerFreq: 15,
        order: 4,
        description: 'Subsonic protection at 15Hz'
    },
    hpf25: {
        category: ModifierCategory.SIGNAL,
        type: ModifierType.HPF,
        name: 'HPF 25Hz (24dB/oct)',
        cornerFreq: 25,
        order: 4,
        description: 'Subsonic protection at 25Hz'
    },

    // Signal processing presets (LPF - crossover high-cut)
    lpf40: {
        category: ModifierCategory.SIGNAL,
        type: ModifierType.LPF,
        name: 'LPF 40Hz (24dB/oct)',
        cornerFreq: 40,
        order: 4,
        description: 'Crossover at 40Hz - infra sub duty'
    },
    lpf60: {
        category: ModifierCategory.SIGNAL,
        type: ModifierType.LPF,
        name: 'LPF 60Hz (24dB/oct)',
        cornerFreq: 60,
        order: 4,
        description: 'Crossover at 60Hz'
    },
    lpf80: {
        category: ModifierCategory.SIGNAL,
        type: ModifierType.LPF,
        name: 'LPF 80Hz (24dB/oct)',
        cornerFreq: 80,
        order: 4,
        description: 'Crossover at 80Hz - typical LFE'
    },
    lpf100: {
        category: ModifierCategory.SIGNAL,
        type: ModifierType.LPF,
        name: 'LPF 100Hz (24dB/oct)',
        cornerFreq: 100,
        order: 4,
        description: 'Crossover at 100Hz'
    },
    lpf120: {
        category: ModifierCategory.SIGNAL,
        type: ModifierType.LPF,
        name: 'LPF 120Hz (24dB/oct)',
        cornerFreq: 120,
        order: 4,
        description: 'Crossover at 120Hz - extended sub range'
    },

    // Target curve presets (reference only - no calculations)
    targetHarman: {
        category: ModifierCategory.TARGET,
        type: ModifierType.SHELF,
        name: 'Harman Target',
        cornerFreq: 80,
        gainDb: 6,
        description: 'Reference: Harman curve (+6dB shelf)'
    },
    targetFlat: {
        category: ModifierCategory.TARGET,
        type: ModifierType.SHELF,
        name: 'Flat Target',
        cornerFreq: 80,
        gainDb: 0,
        description: 'Reference: Flat response'
    }
};

// ============================================================================
// Modifier Class
// ============================================================================

/**
 * A single modifier in the stack
 */
export class Modifier {
    constructor(config) {
        this.id = config.id || crypto.randomUUID();
        this.category = config.category || ModifierCategory.EQ_DEMAND;
        this.type = config.type || ModifierType.SHELF;
        this.name = config.name || this._defaultName();
        this.enabled = config.enabled !== false;

        // Type-specific params
        switch (this.type) {
            case ModifierType.SHELF:
                this.cornerFreq = config.cornerFreq || 80;
                this.gainDb = config.gainDb || 0;
                this.slope = config.slope || 1;
                break;
            case ModifierType.PEAK:
                this.centerFreq = config.centerFreq || 80;
                this.gainDb = config.gainDb || 0;
                this.q = config.q || 1;
                break;
            case ModifierType.HPF:
            case ModifierType.LPF:
                this.cornerFreq = config.cornerFreq || 20;
                this.order = config.order || 4;
                break;
            case ModifierType.ALLPASS:
                this.cornerFreq = config.cornerFreq || 80;
                this.order = config.order || 2;
                break;
            case ModifierType.ROOM_GAIN:
                this.cornerFreq = config.cornerFreq || 30;
                this.gainDb = config.gainDb || 6;
                this.shape = config.shape || '2nd';  // 'shelf', '1st', '2nd'
                break;
        }
    }

    _defaultName() {
        const categoryNames = {
            [ModifierCategory.ROOM_GAIN]: 'Room Gain',
            [ModifierCategory.EQ_DEMAND]: 'EQ Demand',
            [ModifierCategory.SIGNAL]: 'Signal',
            [ModifierCategory.TARGET]: 'Target'
        };
        return categoryNames[this.category] || 'Modifier';
    }

    /**
     * Get complex response (magnitude + phase) at frequency
     * More efficient than calling magnitudeAt + phaseAt separately
     * @param {number} frequency - Hz
     * @returns {{ magnitude: number, phase: number }} dB and degrees
     */
    complexAt(frequency) {
        if (!this.enabled) return { magnitude: 0, phase: 0 };

        switch (this.type) {
            case ModifierType.SHELF:
                return shelfComplex(frequency, this.cornerFreq, this.gainDb, this.slope);
            case ModifierType.PEAK:
                return peakComplex(frequency, this.centerFreq, this.gainDb, this.q);
            case ModifierType.HPF:
                return highpassComplex(frequency, this.cornerFreq, this.order);
            case ModifierType.LPF:
                return lowpassComplex(frequency, this.cornerFreq, this.order);
            case ModifierType.ALLPASS:
                return allpassComplex(frequency, this.cornerFreq, this.order);
            case ModifierType.ROOM_GAIN:
                return roomGainComplex(frequency, this.cornerFreq, this.gainDb, this.shape);
            default:
                return { magnitude: 0, phase: 0 };
        }
    }

    /**
     * Get magnitude response at frequency
     * @param {number} frequency - Hz
     * @returns {number} dB
     */
    magnitudeAt(frequency) {
        return this.complexAt(frequency).magnitude;
    }

    /**
     * Get phase response at frequency
     * @param {number} frequency - Hz
     * @returns {number} degrees
     */
    phaseAt(frequency) {
        return this.complexAt(frequency).phase;
    }

    /**
     * Generate response curve for this single modifier
     * @param {number} fMin - Start frequency (Hz)
     * @param {number} fMax - End frequency (Hz)
     * @param {number} points - Number of points
     * @returns {Array<{frequency: number, db: number}>}
     */
    responseCurve(fMin = 10, fMax = 200, points = 30) {
        const frequencies = generateFrequencies(fMin, fMax, points);
        return frequencies.map(frequency => ({
            frequency,
            db: this.enabled ? this.magnitudeAt(frequency) : 0
        }));
    }

    /**
     * Get display string
     */
    toString() {
        switch (this.type) {
            case ModifierType.SHELF:
                const sign = this.gainDb >= 0 ? '+' : '';
                return `${sign}${this.gainDb}dB @ <${this.cornerFreq}Hz`;
            case ModifierType.PEAK:
                const psign = this.gainDb >= 0 ? '+' : '';
                return `${psign}${this.gainDb}dB @ ${this.centerFreq}Hz (Q=${this.q})`;
            case ModifierType.HPF:
                return `HPF ${this.cornerFreq}Hz ${this.order * 6}dB/oct`;
            case ModifierType.LPF:
                return `LPF ${this.cornerFreq}Hz ${this.order * 6}dB/oct`;
            case ModifierType.ALLPASS:
                return `APF ${this.cornerFreq}Hz (${this.order * 180}° rotation)`;
            case ModifierType.ROOM_GAIN:
                const shapeLabel = this.shape === 'shelf' ? 'shelf' : `${this.shape} order`;
                return `Room +${this.gainDb}dB @ ${this.cornerFreq}Hz (${shapeLabel})`;
            default:
                return this.name;
        }
    }

    /**
     * Get category display name
     */
    categoryName() {
        const names = {
            [ModifierCategory.ROOM_GAIN]: 'Room Gain',
            [ModifierCategory.EQ_DEMAND]: 'EQ Demand',
            [ModifierCategory.SIGNAL]: 'Signal',
            [ModifierCategory.TARGET]: 'Target'
        };
        return names[this.category] || 'Unknown';
    }
}

// ============================================================================
// Modifier Stack
// ============================================================================

/**
 * Stack of modifiers with category-aware analysis
 */
export class ModifierStack {
    constructor() {
        this.modifiers = [];
    }

    /**
     * Add a modifier
     */
    add(config) {
        const modifier = config instanceof Modifier ? config : new Modifier(config);
        this.modifiers.push(modifier);
        return modifier;
    }

    /**
     * Remove by ID
     */
    remove(id) {
        this.modifiers = this.modifiers.filter(m => m.id !== id);
    }

    /**
     * Get modifiers by category
     */
    byCategory(category) {
        return this.modifiers.filter(m => m.category === category && m.enabled);
    }

    /**
     * Get combined magnitude at frequency (all modifiers)
     * Use for display purposes
     */
    magnitudeAt(frequency) {
        return this.modifiers.reduce((sum, m) => sum + m.magnitudeAt(frequency), 0);
    }

    /**
     * Get combined phase at frequency (all modifiers)
     * Phase adds linearly for cascaded filters
     * @returns {number} degrees
     */
    phaseAt(frequency) {
        return this.modifiers.reduce((sum, m) => sum + m.phaseAt(frequency), 0);
    }

    /**
     * Get combined complex response (more efficient for getting both)
     * @returns {{ magnitude: number, phase: number }}
     */
    complexAt(frequency) {
        let magnitude = 0;
        let phase = 0;
        for (const m of this.modifiers) {
            const c = m.complexAt(frequency);
            magnitude += c.magnitude;
            phase += c.phase;
        }
        return { magnitude, phase };
    }

    /**
     * Get room gain contribution at frequency
     * Positive = more output for same power
     */
    roomGainAt(frequency) {
        return this.byCategory(ModifierCategory.ROOM_GAIN)
            .reduce((sum, m) => sum + m.magnitudeAt(frequency), 0);
    }

    /**
     * Get EQ demand contribution at frequency
     * Positive = more excursion/power needed
     */
    eqDemandAt(frequency) {
        return this.byCategory(ModifierCategory.EQ_DEMAND)
            .reduce((sum, m) => sum + m.magnitudeAt(frequency), 0);
    }

    /**
     * Get signal cut at frequency (HPF/LPF)
     * Negative = less output (signal is cut)
     */
    signalCutAt(frequency) {
        return this.byCategory(ModifierCategory.SIGNAL)
            .reduce((sum, m) => sum + m.magnitudeAt(frequency), 0);
    }

    /**
     * Get active DSP magnitude at frequency (signal path effects)
     * This is everything that shapes the signal BEFORE the amp/speaker:
     * - SIGNAL: HPF/LPF cuts
     * - EQ_DEMAND: EQ boosts/cuts
     *
     * Does NOT include room gain (that's acoustic, after the speaker).
     * Use this for mechanical/electrical quantities (excursion, current, velocity).
     */
    activeDspAt(frequency) {
        return this.eqDemandAt(frequency) + this.signalCutAt(frequency);
    }

    /**
     * Get full acoustic adjustment at frequency
     * This includes both signal-path DSP AND room gain.
     * Use this for SPL/acoustic output quantities.
     */
    acousticAt(frequency) {
        return this.activeDspAt(frequency) + this.roomGainAt(frequency);
    }

    /**
     * Get active DSP phase at frequency
     * Phase shift from signal-path DSP (HPF, LPF, EQ).
     * Room gain is modeled as magnitude-only (no phase).
     */
    activeDspPhaseAt(frequency) {
        // Only SIGNAL and EQ_DEMAND categories contribute phase
        const signalPhase = this.byCategory(ModifierCategory.SIGNAL)
            .reduce((sum, m) => sum + m.phaseAt(frequency), 0);
        const eqPhase = this.byCategory(ModifierCategory.EQ_DEMAND)
            .reduce((sum, m) => sum + m.phaseAt(frequency), 0);
        return signalPhase + eqPhase;
    }

    /**
     * Get active DSP group delay at frequency (in ms)
     * Group delay = -dφ/dω = -(1/2π) × dφ/df
     * Computed numerically from phase.
     */
    activeDspGroupDelayAt(frequency) {
        const df = frequency * 0.01; // 1% frequency delta
        const f1 = Math.max(1, frequency - df / 2);
        const f2 = frequency + df / 2;
        const phase1 = this.activeDspPhaseAt(f1) * Math.PI / 180; // to radians
        const phase2 = this.activeDspPhaseAt(f2) * Math.PI / 180;
        const dPhase = phase2 - phase1;
        const groupDelaySec = -dPhase / (2 * Math.PI * (f2 - f1));
        return groupDelaySec * 1000; // to ms
    }

    /**
     * Get target reference at frequency
     * For display only - doesn't affect calculations
     */
    targetAt(frequency) {
        return this.byCategory(ModifierCategory.TARGET)
            .reduce((sum, m) => sum + m.magnitudeAt(frequency), 0);
    }

    /**
     * Generate response curve (all modifiers combined)
     */
    responseCurve(fMin = 10, fMax = 200, points = 50) {
        const frequencies = generateFrequencies(fMin, fMax, points);
        return frequencies.map(frequency => ({
            frequency,
            db: this.magnitudeAt(frequency)
        }));
    }

    /**
     * Summary at key frequencies
     */
    getSummary() {
        return {
            at20Hz: this.magnitudeAt(20),
            at30Hz: this.magnitudeAt(30),
            at50Hz: this.magnitudeAt(50),
            at80Hz: this.magnitudeAt(80)
        };
    }

    /**
     * Check if stack has any enabled modifiers
     * @returns {boolean}
     */
    hasModifiers() {
        return this.modifiers.some(m => m.enabled);
    }

    /**
     * Clear all modifiers
     */
    clear() {
        this.modifiers = [];
    }

    /**
     * Add from preset key
     */
    addPreset(presetKey) {
        const preset = ModifierPresets[presetKey];
        if (preset) {
            this.add({ ...preset });
        }
    }

    // Backwards compatibility - expose as 'filters'
    get filters() {
        return this.modifiers;
    }
}

export default ModifierStack;
