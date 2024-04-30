/**
 * ReferenceSub - Commercial Subwoofer Reference Data
 *
 * Stores CEA-2010 measurement data for commercial subwoofers.
 * Used for comparing DIY designs against known commercial products.
 *
 * Important: CEA-2010 data is MEASURED (includes real-world losses).
 * Our DIY T/S model is THEORETICAL (linear, optimistic by ~3-6 dB).
 * This class does NOT apply derating - that's handled in the UI.
 *
 * Data sources: data-bass.com, Audioholics, Erin's Audio Corner
 *
 * Usage:
 *   const sub = new ReferenceSub({
 *     name: 'SVS SB-3000',
 *     cea2010: [{hz: 20, dB: 93.6}, {hz: 25, dB: 98.7}, ...]
 *   });
 *   const spl = sub.maxSplAt(30, 2);  // 30 Hz, 2 subs
 */

import { generateLogFrequencies } from '../foundation/utils.js';

export class ReferenceSub {
    #id;
    #name;
    #type;
    #source;
    #cea2010;  // [{hz, dB}, ...] sorted by frequency

    /**
     * Construct from JSON data
     *
     * @param {Object} data - Reference sub data
     * @param {string} data.name - Display name (e.g., "SVS SB-3000")
     * @param {Array} data.cea2010 - CEA-2010 measurements [{hz, dB}, ...]
     * @param {string} [data.id] - Unique identifier (generated from name if not provided)
     * @param {string} [data.type='sealed'] - Box type ('sealed' or 'ported')
     * @param {string} [data.source='User imported'] - Data source attribution
     */
    constructor(data) {
        // Validate required fields
        if (!data.name || typeof data.name !== 'string') {
            throw new Error('ReferenceSub requires a name');
        }
        if (!data.cea2010 || !Array.isArray(data.cea2010)) {
            throw new Error('ReferenceSub requires cea2010 array');
        }
        if (data.cea2010.length < 3) {
            throw new Error('ReferenceSub requires at least 3 data points');
        }

        // Validate and normalize CEA-2010 data
        const normalized = data.cea2010.map((point, i) => {
            if (typeof point.hz !== 'number' || typeof point.dB !== 'number') {
                throw new Error(`Invalid data point at index ${i}: requires hz and dB numbers`);
            }
            if (point.hz <= 0) {
                throw new Error(`Invalid frequency at index ${i}: must be positive`);
            }
            return { hz: point.hz, dB: point.dB };
        });

        // Sort by frequency (ascending)
        normalized.sort((a, b) => a.hz - b.hz);

        // Verify frequencies are unique
        for (let i = 1; i < normalized.length; i++) {
            if (normalized[i].hz === normalized[i - 1].hz) {
                throw new Error(`Duplicate frequency: ${normalized[i].hz} Hz`);
            }
        }

        this.#id = data.id || this.#generateId(data.name);
        this.#name = data.name;
        this.#type = data.type || 'sealed';
        this.#source = data.source || 'User imported';
        this.#cea2010 = normalized;

        Object.freeze(this);
    }

    // ========================================================================
    // GETTERS
    // ========================================================================

    get id() { return this.#id; }
    get name() { return this.#name; }
    get type() { return this.#type; }
    get source() { return this.#source; }

    /** Lowest measured frequency */
    get minFrequency() { return this.#cea2010[0].hz; }

    /** Highest measured frequency */
    get maxFrequency() { return this.#cea2010[this.#cea2010.length - 1].hz; }

    /** Number of data points */
    get dataPointCount() { return this.#cea2010.length; }

    /** Raw CEA-2010 data (copy) */
    get cea2010Data() { return [...this.#cea2010]; }

    // ========================================================================
    // INTERPOLATION
    // ========================================================================

    /**
     * Get max SPL at frequency via log-linear interpolation
     *
     * @param {number} frequency - Frequency in Hz
     * @param {number} [quantity=1] - Number of subs (+6 dB per doubling)
     * @returns {number} Max SPL in dB
     */
    maxSplAt(frequency, quantity = 1) {
        if (frequency <= 0) {
            throw new Error('Frequency must be positive');
        }
        if (quantity < 1) {
            throw new Error('Quantity must be at least 1');
        }

        const baseSpl = this.#interpolate(frequency);
        // Coherent summing: SPL doubles (+6 dB) when quantity doubles
        // At low frequencies in a room, multiple subs sum coherently (in phase)
        const quantityBonus = 20 * Math.log10(quantity);  // +6 dB for 2, +12 dB for 4

        return baseSpl + quantityBonus;
    }

    /**
     * Log-linear interpolation between measurement points
     * @private
     */
    #interpolate(frequency) {
        const data = this.#cea2010;

        // Below measured range: extrapolate from first two points
        if (frequency <= data[0].hz) {
            return this.#extrapolateLow(frequency);
        }

        // Above measured range: extrapolate from last two points
        if (frequency >= data[data.length - 1].hz) {
            return this.#extrapolateHigh(frequency);
        }

        // Find surrounding points
        let lowIdx = 0;
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i].hz <= frequency && data[i + 1].hz > frequency) {
                lowIdx = i;
                break;
            }
        }

        const low = data[lowIdx];
        const high = data[lowIdx + 1];

        // Log-linear interpolation (linear in log-frequency domain)
        const logF = Math.log10(frequency);
        const logLow = Math.log10(low.hz);
        const logHigh = Math.log10(high.hz);

        const t = (logF - logLow) / (logHigh - logLow);
        return low.dB + t * (high.dB - low.dB);
    }

    /**
     * Extrapolate below measured range
     * Uses slope from first two points
     * @private
     */
    #extrapolateLow(frequency) {
        const data = this.#cea2010;
        if (data.length < 2) return data[0].dB;

        const p1 = data[0];
        const p2 = data[1];

        // Calculate slope in log-frequency domain
        const logSlope = (p2.dB - p1.dB) / (Math.log10(p2.hz) - Math.log10(p1.hz));
        const logDelta = Math.log10(frequency) - Math.log10(p1.hz);

        return p1.dB + logSlope * logDelta;
    }

    /**
     * Extrapolate above measured range
     * Uses slope from last two points
     * @private
     */
    #extrapolateHigh(frequency) {
        const data = this.#cea2010;
        if (data.length < 2) return data[data.length - 1].dB;

        const p1 = data[data.length - 2];
        const p2 = data[data.length - 1];

        const logSlope = (p2.dB - p1.dB) / (Math.log10(p2.hz) - Math.log10(p1.hz));
        const logDelta = Math.log10(frequency) - Math.log10(p2.hz);

        return p2.dB + logSlope * logDelta;
    }

    // ========================================================================
    // CURVE GENERATION
    // ========================================================================

    /**
     * Generate max SPL curve for graphing
     *
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @param {number} [quantity=1] - Number of subs
     * @returns {Array<{frequency: number, spl: number}>}
     */
    maxSplCurve(fMin = 10, fMax = 200, points = 50, quantity = 1) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => ({
            frequency,
            spl: this.maxSplAt(frequency, quantity)
        }));
    }

    /**
     * Generate headroom curve (margin to target SPL)
     *
     * @param {number} targetSpl - Target SPL in dB
     * @param {number} [fMin=10] - Start frequency (Hz)
     * @param {number} [fMax=200] - End frequency (Hz)
     * @param {number} [points=50] - Number of points
     * @param {number} [quantity=1] - Number of subs
     * @returns {Array<{frequency: number, headroom: number, maxSpl: number}>}
     */
    headroomCurve(targetSpl, fMin = 10, fMax = 200, points = 50, quantity = 1) {
        return generateLogFrequencies(fMin, fMax, points).map(frequency => {
            const maxSpl = this.maxSplAt(frequency, quantity);
            return {
                frequency,
                headroom: maxSpl - targetSpl,
                maxSpl
            };
        });
    }

    // ========================================================================
    // SERIALIZATION
    // ========================================================================

    /**
     * Convert to plain object for JSON serialization
     */
    toJSON() {
        return {
            id: this.#id,
            name: this.#name,
            type: this.#type,
            source: this.#source,
            cea2010: this.#cea2010
        };
    }

    /**
     * Create ReferenceSub from JSON string or object
     */
    static fromJSON(json) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        return new ReferenceSub(data);
    }

    /**
     * Validate JSON without constructing (for UI preview)
     * Returns { valid: boolean, error?: string, name?: string, points?: number }
     */
    static validate(json) {
        try {
            const data = typeof json === 'string' ? JSON.parse(json) : json;

            if (!data.name) return { valid: false, error: 'Missing name' };
            if (!data.cea2010) return { valid: false, error: 'Missing cea2010 array' };
            if (!Array.isArray(data.cea2010)) return { valid: false, error: 'cea2010 must be an array' };
            if (data.cea2010.length < 3) return { valid: false, error: 'Need at least 3 data points' };

            for (let i = 0; i < data.cea2010.length; i++) {
                const p = data.cea2010[i];
                if (typeof p.hz !== 'number') return { valid: false, error: `Point ${i}: hz must be a number` };
                if (typeof p.dB !== 'number') return { valid: false, error: `Point ${i}: dB must be a number` };
            }

            return {
                valid: true,
                name: data.name,
                points: data.cea2010.length
            };
        } catch (e) {
            return { valid: false, error: `Invalid JSON: ${e.message}` };
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    /**
     * Generate ID from name (lowercase, hyphenated)
     * @private
     */
    #generateId(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    /**
     * Summary string
     */
    toString() {
        return `${this.#name} (${this.#type}, ${this.#cea2010.length} points, ${this.#source})`;
    }
}

export default ReferenceSub;
