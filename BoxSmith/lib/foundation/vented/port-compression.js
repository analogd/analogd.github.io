/**
 * Port Compression and Turbulence Modeling
 *
 * Based on:
 * - Salvatti, Devantier & Button "Maximizing Performance from Loudspeaker Ports" JAES 2002
 * - Bezzola, Devantier & McMullin "Loudspeaker Port Design for Optimal Performance" AES 2019
 *
 * KEY FINDINGS FROM PAPERS:
 *
 * 1. Reynolds number determines flow regime:
 *    - Re < 50,000: Linear operation
 *    - 50,000 ≤ Re < 100,000: Transition zone (1-3 dB compression)
 *    - Re ≥ 100,000: Fully turbulent (severe compression)
 *
 * 2. Flared ports significantly outperform straight ports:
 *    - Baseline: Straight ports ~2 dB less efficient even at low levels
 *    - At noise onset: Straight ports 10-16 dB worse than optimally flared
 *    - Optimal flare rate (NFR ≈ 0.5) balances inlet/outlet aerodynamics
 *
 * 3. Port eigenfrequency f_p1 = c/(2L):
 *    - Turbulent vortex shedding excites this resonance
 *    - Creates audible "chuffing" noise in 700-1000 Hz range
 *    - This is what listeners perceive as "port noise"
 *
 * 4. Traditional velocity limits:
 *    - Straight port: 10 m/s (Young 1975)
 *    - Flared port: 15-25 m/s depending on flare geometry
 *
 * WHAT THIS MODULE DOES NOT DO:
 *
 * The papers show empirical compression curves for specific test ports but don't
 * provide a general formula for compression(velocity, flare). We intentionally
 * don't fabricate such a curve. Instead, we provide:
 * - Regime assessment based on Reynolds thresholds
 * - Headroom calculations to turbulence onset
 * - Qualitative penalty estimates with honest uncertainty ranges
 */

import { SPEED_OF_SOUND } from '../constants.js';

// =============================================================================
// THRESHOLDS FROM PAPERS
// =============================================================================

/**
 * Reynolds number thresholds (Salvatti 2002, Section 3.2)
 *
 * From the paper: "All designs seem to hit a wall near a Reynolds number of
 * about 50,000-100,000. This number was also confirmed by Vanderkooy."
 */
export const REYNOLDS_LINEAR = 50000;      // Below: linear operation
export const REYNOLDS_TURBULENT = 100000;  // Above: fully turbulent

/**
 * Velocity thresholds
 *
 * VELOCITY_STRAIGHT_LIMIT: Young 1975 via Salvatti - "maximum velocity of about
 * 10 m/s before serious sonic detriment occurs"
 *
 * VELOCITY_FLARED_QUIET: Conservative limit for flared ports before audible artifacts
 * VELOCITY_FLARED_LIMIT: Practical maximum for well-designed flared ports
 */
export const VELOCITY_STRAIGHT_LIMIT = 10;  // m/s
export const VELOCITY_FLARED_QUIET = 15;    // m/s
export const VELOCITY_FLARED_LIMIT = 25;    // m/s

/**
 * Kinematic viscosity of air at 20°C (used for Reynolds calculations)
 */
export const KINEMATIC_VISCOSITY = 1.5e-5;  // m²/s

// =============================================================================
// EIGENFREQUENCY
// =============================================================================

/**
 * Calculate port eigenfrequency (first pipe resonance)
 *
 * From Bezzola 2019: "Disregarding end corrections, the first Eigenfrequency
 * of ports f_p1 can be estimated by the half-wavelength f_p1 ≈ c / 2L"
 *
 * This is where turbulent vortex shedding manifests as audible noise.
 * For typical port lengths (0.1-0.5m), this is 340-1700 Hz.
 *
 * @param {number} lengthM - Port length in meters
 * @returns {number} Eigenfrequency in Hz
 */
export function portEigenfrequency(lengthM) {
    if (lengthM <= 0) {
        throw new Error('Port length must be positive');
    }
    return SPEED_OF_SOUND / (2 * lengthM);
}

// =============================================================================
// REGIME ASSESSMENT
// =============================================================================

/**
 * Flow regime types
 */
export const FlowRegime = {
    LINEAR: 'linear',
    TRANSITION: 'transition',
    TURBULENT: 'turbulent'
};

/**
 * Assess port operating regime based on Reynolds number
 *
 * From Salvatti 2002, Section 3.2: Reynolds number correlates with compression
 * across different port designs, box volumes, and tuning frequencies.
 *
 * @param {number} reynolds - Reynolds number
 * @returns {{
 *   regime: string,
 *   compressionRisk: 'low'|'moderate'|'high',
 *   expectedCompression: string,
 *   description: string
 * }}
 */
export function assessReynoldsRegime(reynolds) {
    if (reynolds < 0) {
        throw new Error('Reynolds number cannot be negative');
    }

    if (reynolds < REYNOLDS_LINEAR) {
        return {
            regime: FlowRegime.LINEAR,
            compressionRisk: 'low',
            expectedCompression: '< 1 dB',
            description: 'Linear operation - flow is laminar, minimal compression'
        };
    } else if (reynolds < REYNOLDS_TURBULENT) {
        return {
            regime: FlowRegime.TRANSITION,
            compressionRisk: 'moderate',
            expectedCompression: '1-3 dB',
            description: 'Transition zone - boundary layer becoming turbulent'
        };
    } else {
        return {
            regime: FlowRegime.TURBULENT,
            compressionRisk: 'high',
            expectedCompression: '> 6 dB',
            description: 'Fully turbulent - severe compression, possible noise'
        };
    }
}

// =============================================================================
// FLARE PENALTY ESTIMATION
// =============================================================================

/**
 * Estimate performance difference between straight and flared ports
 *
 * From Salvatti 2002: "the straight port starts out with about 2 dB less output
 * than any flared port" (Section 3.4)
 *
 * From Bezzola 2019: "An optimal port can play 10 to 16 dB louder before noise
 * becomes audible, compared to straight ports."
 *
 * @param {number} reynolds - Reynolds number
 * @param {boolean} isFlared - Whether port has flared ends
 * @returns {{
 *   baselinePenaltyDb: number,
 *   highLevelPenaltyRange: [number, number]|null,
 *   description: string
 * }}
 */
export function estimateFlarePenalty(reynolds, isFlared) {
    if (isFlared) {
        return {
            baselinePenaltyDb: 0,
            highLevelPenaltyRange: null,
            description: 'Flared port - optimal aerodynamic efficiency'
        };
    }

    // Straight port always has baseline penalty
    const baselinePenaltyDb = 2;

    if (reynolds < REYNOLDS_LINEAR) {
        return {
            baselinePenaltyDb,
            highLevelPenaltyRange: null,
            description: `Straight port: ~${baselinePenaltyDb} dB baseline loss vs flared`
        };
    } else if (reynolds < REYNOLDS_TURBULENT) {
        return {
            baselinePenaltyDb,
            highLevelPenaltyRange: [2, 6],
            description: `Straight port: ${baselinePenaltyDb}-6 dB loss vs flared (transition)`
        };
    } else {
        return {
            baselinePenaltyDb,
            highLevelPenaltyRange: [10, 16],
            description: 'Straight port: 10-16 dB loss vs optimally flared (turbulent)'
        };
    }
}

// =============================================================================
// HEADROOM CALCULATION
// =============================================================================

/**
 * Calculate velocity headroom before compression onset
 *
 * Returns how much the velocity could increase (in dB) before reaching
 * the Reynolds threshold for compression onset (Re = 50,000).
 *
 * Since port SPL is proportional to velocity, this directly translates
 * to SPL headroom.
 *
 * @param {number} currentVelocity - Current air velocity in m/s
 * @param {number} diameterM - Port diameter in meters
 * @param {boolean} isFlared - Whether port has flared ends
 * @returns {{
 *   headroomDb: number,
 *   limitVelocity: number,
 *   currentVelocity: number,
 *   regime: string,
 *   description: string
 * }}
 */
export function calculateVelocityHeadroom(currentVelocity, diameterM, isFlared) {
    if (diameterM <= 0) {
        throw new Error('Port diameter must be positive');
    }

    // Velocity at which Re = REYNOLDS_LINEAR (onset of compression)
    // Re = v * D / ν  =>  v = Re * ν / D
    const onsetVelocity = (REYNOLDS_LINEAR * KINEMATIC_VISCOSITY) / diameterM;

    // Also apply practical velocity limits from the papers
    const practicalLimit = isFlared ? VELOCITY_FLARED_LIMIT : VELOCITY_STRAIGHT_LIMIT;

    // Use the more restrictive limit
    const limitVelocity = Math.min(onsetVelocity, practicalLimit);

    if (currentVelocity <= 0) {
        return {
            headroomDb: Infinity,
            limitVelocity,
            currentVelocity: 0,
            regime: FlowRegime.LINEAR,
            description: 'No air movement'
        };
    }

    // Current regime
    const reynolds = (currentVelocity * diameterM) / KINEMATIC_VISCOSITY;
    const { regime } = assessReynoldsRegime(reynolds);

    // Headroom in dB: 20*log10(limit/current)
    // Port SPL ∝ velocity, so this is the SPL headroom
    const ratio = limitVelocity / currentVelocity;
    const headroomDb = ratio > 1 ? 20 * Math.log10(ratio) : 0;

    let description;
    if (headroomDb > 10) {
        description = 'Plenty of headroom - port operating well within limits';
    } else if (headroomDb > 6) {
        description = 'Good headroom - port has room to spare';
    } else if (headroomDb > 3) {
        description = 'Moderate headroom - approaching limits at high power';
    } else if (headroomDb > 0) {
        description = 'Limited headroom - consider larger port diameter';
    } else {
        description = 'At or above limit - compression is occurring';
    }

    return {
        headroomDb,
        limitVelocity,
        currentVelocity,
        regime,
        description
    };
}

// =============================================================================
// COMPREHENSIVE PORT ASSESSMENT
// =============================================================================

/**
 * Comprehensive port compression assessment
 *
 * Combines all metrics into a single assessment object.
 *
 * @param {number} velocity - Air velocity in m/s
 * @param {number} diameterM - Port diameter in meters
 * @param {number} lengthM - Port length in meters
 * @param {boolean} isFlared - Whether port has flared ends
 * @returns {{
 *   velocity: number,
 *   reynolds: number,
 *   mach: number,
 *   regime: object,
 *   flarePenalty: object,
 *   headroom: object,
 *   eigenfrequency: number,
 *   overallRisk: 'low'|'moderate'|'high'|'critical',
 *   recommendations: string[]
 * }}
 */
export function assessPortCompression(velocity, diameterM, lengthM, isFlared) {
    // Calculate Reynolds number
    const reynolds = (velocity * diameterM) / KINEMATIC_VISCOSITY;

    // Calculate Mach number
    const mach = velocity / SPEED_OF_SOUND;

    // Get regime assessment
    const regime = assessReynoldsRegime(reynolds);

    // Get flare penalty
    const flarePenalty = estimateFlarePenalty(reynolds, isFlared);

    // Get headroom
    const headroom = calculateVelocityHeadroom(velocity, diameterM, isFlared);

    // Get eigenfrequency
    const eigenfrequency = portEigenfrequency(lengthM);

    // Determine overall risk
    let overallRisk;
    if (regime.regime === FlowRegime.LINEAR && headroom.headroomDb > 6) {
        overallRisk = 'low';
    } else if (regime.regime === FlowRegime.LINEAR) {
        overallRisk = 'moderate';
    } else if (regime.regime === FlowRegime.TRANSITION) {
        overallRisk = 'high';
    } else {
        overallRisk = 'critical';
    }

    // Generate recommendations
    const recommendations = [];

    if (!isFlared) {
        recommendations.push('Consider flared port ends for 2+ dB improvement');
    }

    if (regime.regime === FlowRegime.TRANSITION) {
        recommendations.push('Port operating in transition zone - expect 1-3 dB compression');
    } else if (regime.regime === FlowRegime.TURBULENT) {
        recommendations.push('Port is turbulent - increase diameter or add more ports');
    }

    if (headroom.headroomDb < 3 && headroom.headroomDb > 0) {
        recommendations.push('Limited headroom - larger port recommended for high-power use');
    }

    if (mach > 0.05) {
        recommendations.push(`Mach ${(mach * 100).toFixed(1)}% - audible compression likely`);
    }

    return {
        velocity,
        reynolds,
        mach,
        regime,
        flarePenalty,
        headroom,
        eigenfrequency,
        overallRisk,
        recommendations
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

export const THRESHOLDS = {
    REYNOLDS_LINEAR,
    REYNOLDS_TURBULENT,
    VELOCITY_STRAIGHT_LIMIT,
    VELOCITY_FLARED_QUIET,
    VELOCITY_FLARED_LIMIT,
    KINEMATIC_VISCOSITY
};
