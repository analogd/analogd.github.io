// Utility routes (constants, alignments, validation)

import express from 'express';
import * as Foundation from '../../../lib/foundation/index.js';
import * as Small1972 from '../../../lib/foundation/small-1972.js';
import * as Thiele1971 from '../../../lib/foundation/thiele-1971.js';
import { volumeToM3 } from '../utils/units.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * GET /constants
 * Physical constants
 */
router.get('/constants', (req, res) => {
    const data = {
        speedOfSound: {
            value: Foundation.SPEED_OF_SOUND,
            unit: 'm/s',
            conditions: '20°C, sea level'
        },
        airDensity: {
            value: Foundation.AIR_DENSITY,
            unit: 'kg/m³',
            conditions: '20°C, 101.325 kPa'
        },
        atmosphericPressure: {
            value: Foundation.ATMOSPHERIC_PRESSURE,
            unit: 'Pa',
            conditions: 'Sea level'
        },
        referencePressure: {
            value: Foundation.REFERENCE_PRESSURE,
            unit: 'Pa',
            description: 'Reference acoustic pressure (20 μPa)'
        }
    };

    res.json(successResponse(data));
});

/**
 * GET /alignments
 * Standard alignment constants
 */
router.get('/alignments', (req, res) => {
    const data = {
        butterworth: {
            qtc: Thiele1971.BUTTERWORTH_QTC,
            name: 'Butterworth',
            description: 'Maximally flat passband, -3dB at Fc',
            characteristics: '2nd-order Butterworth response',
            citation: 'Thiele 1971, Table II'
        },
        bessel: {
            qtc: Thiele1971.BESSEL_QTC,
            name: 'Bessel',
            description: 'Maximally flat group delay, gentler rolloff',
            characteristics: 'Transient-perfect response',
            citation: 'Thiele 1971, Table II'
        },
        chebyshev: {
            qtc: Thiele1971.CHEBYCHEV_QTC,
            name: 'Chebyshev',
            description: 'Peaked response at Fc, steeper rolloff',
            characteristics: 'Extended low frequency response',
            citation: 'Thiele 1971, Table II'
        },
        qb3: {
            name: 'QB3',
            description: 'Quasi-Butterworth 3rd order (ported)',
            formula: {
                volume: 'Vb = 15 × Qts^3.3 × Vas',
                tuning: 'Fb = Fs'
            },
            citation: 'Thiele 1971, Table II'
        }
    };

    const citations = ['Thiele 1971, Table II'];

    res.json(successResponse(data, citations));
});

/**
 * POST /validate/driver
 * Validate driver T/S parameters
 */
router.post('/validate/driver', asyncHandler(async (req, res) => {
    const { driver } = req.body;

    if (!driver) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required field: driver')
        );
    }

    const { fs, qts, vas, qes, vasUnit = 'm3' } = driver;

    if (!fs || !qts || !vas) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Driver must have fs, qts, and vas')
        );
    }

    // Convert Vas to SI
    const vasM3 = volumeToM3(vas, vasUnit);

    const warnings = [];
    const errors = [];

    try {
        Small1972.validateDriverParameters(fs, qts, vasM3, qes || null);
    } catch (err) {
        errors.push(err.message);
    }

    // Additional practical warnings
    if (qts < 0.3 && qts >= 0.2) {
        warnings.push('Qts < 0.3: Very low damping, may be difficult to design for');
    }
    if (qts > 1.2 && qts <= 1.5) {
        warnings.push('Qts > 1.2: Very high damping, expect significant ringing');
    }
    if (fs < 20) {
        warnings.push('Fs < 20Hz: Ensure pistonic behavior at these frequencies');
    }
    if (fs > 300) {
        warnings.push('Fs > 300Hz: Check for cone breakup modes');
    }

    const data = {
        valid: errors.length === 0,
        warnings: warnings.length > 0 ? warnings : undefined,
        errors: errors.length > 0 ? errors : undefined,
        parameters: {
            fs: { value: fs, unit: 'Hz', valid: fs >= 15 && fs <= 500 },
            qts: { value: qts, valid: qts >= 0.2 && qts <= 1.5 },
            vas: {
                value: vas,
                unit: vasUnit,
                m3: vasM3,
                valid: vasM3 > 0
            }
        }
    };

    if (qes !== undefined) {
        data.parameters.qes = {
            value: qes,
            valid: qes > 0 && qes >= qts
        };
    }

    const citations = [
        'Small 1972 (T/S parameter validity)',
        'Dickason 2006, Chapter 3 (practical ranges)'
    ];

    res.json(successResponse(data, citations));
}));

/**
 * POST /validate/box
 * Validate box volume
 */
router.post('/validate/box', asyncHandler(async (req, res) => {
    const { boxVolume, boxVolumeUnit = 'm3' } = req.body;

    if (boxVolume === undefined) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required field: boxVolume')
        );
    }

    const vbM3 = volumeToM3(boxVolume, boxVolumeUnit);

    const errors = [];
    const warnings = [];

    try {
        Small1972.validateBoxVolume(vbM3);
    } catch (err) {
        errors.push(err.message);
    }

    // Practical warnings
    if (vbM3 > 1.0) {
        warnings.push('Volume > 1 m³ (1000L): Very large enclosure');
    }
    if (vbM3 < 0.01) {
        warnings.push('Volume < 0.01 m³ (10L): Very small enclosure, may be impractical');
    }

    const data = {
        valid: errors.length === 0,
        warnings: warnings.length > 0 ? warnings : undefined,
        errors: errors.length > 0 ? errors : undefined,
        volume: {
            input: boxVolume,
            inputUnit: boxVolumeUnit,
            m3: vbM3,
            liters: vbM3 * 1000,
            cubicFeet: vbM3 / 0.0283168
        }
    };

    res.json(successResponse(data));
}));

export default router;
