// Ported box calculation routes
// Now uses Cookbook layer for clean, comprehensive results

import express from 'express';
import * as Cookbook from '../../../lib/cookbook/index.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * POST /ported-box/design
 * Complete ported box design for a given alignment
 *
 * Body:
 * {
 *   driver: { fs, qts, vas, qes?, xmax?, sd?, pe?, re?, bl?, mms? },
 *   alignment: 'QB3' | 'B4' | 'C4' | { vb: number, fb: number },
 *   options?: {
 *     unit?: 'liters' | 'm3' | 'cuft',
 *     vasUnit?: 'liters' | 'm3',
 *     portDiameter?: number,
 *     portDiameterUnit?: 'cm' | 'm',
 *     ql?: number,
 *     qa?: number,
 *     qp?: number,
 *     responseRange?: [number, number],
 *     responsePoints?: number
 *   }
 * }
 */
router.post('/design', asyncHandler(async (req, res) => {
    const { driver, alignment = 'QB3', options = {} } = req.body;

    // Validate required fields
    if (!driver) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required field: driver')
        );
    }

    if (!driver.fs || !driver.qts || !driver.vas) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Driver missing required T/S parameters: fs, qts, vas')
        );
    }

    try {
        // Use cookbook layer for complete design
        const design = Cookbook.designPortedBox(driver, alignment, options);

        res.json(successResponse(design, design.citations));
    } catch (error) {
        return res.status(400).json(
            errorResponse('CALCULATION_ERROR', error.message)
        );
    }
}));

/**
 * POST /ported-box/compare
 * Compare multiple ported alignments
 *
 * Body:
 * {
 *   driver: { fs, qts, vas, qes?, xmax?, sd?, pe? },
 *   alignments?: ['QB3', 'B4', 'C4'],
 *   options?: { unit, vasUnit, portDiameter, ql, responseRange, responsePoints }
 * }
 */
router.post('/compare', asyncHandler(async (req, res) => {
    const { driver, alignments = ['QB3', 'B4', 'C4'], options = {} } = req.body;

    if (!driver) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required field: driver')
        );
    }

    try {
        const designs = Cookbook.comparePortedAlignments(driver, alignments, options);

        res.json(successResponse({
            driver: driver,
            designs: designs,
            summary: {
                count: designs.filter(d => !d.error).length,
                errors: designs.filter(d => d.error).length
            }
        }));
    } catch (error) {
        return res.status(400).json(
            errorResponse('CALCULATION_ERROR', error.message)
        );
    }
}));

/**
 * POST /ported-box/optimal
 * Find optimal ported alignment for driver
 *
 * Body:
 * {
 *   driver: { fs, qts, vas, qes?, xmax?, sd?, pe? },
 *   options?: { unit, vasUnit, portDiameter, ql }
 * }
 */
router.post('/optimal', asyncHandler(async (req, res) => {
    const { driver, options = {} } = req.body;

    if (!driver) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required field: driver')
        );
    }

    try {
        const design = Cookbook.findOptimalPortedAlignment(driver, options);

        res.json(successResponse(design, design.citations));
    } catch (error) {
        return res.status(400).json(
            errorResponse('CALCULATION_ERROR', error.message)
        );
    }
}));

/**
 * POST /ported-box/sealed-vs-ported
 * Compare sealed vs ported designs with recommendation
 *
 * Body:
 * {
 *   driver: { fs, qts, vas, qes?, xmax?, sd?, pe? },
 *   options?: { unit, vasUnit, portDiameter }
 * }
 */
router.post('/sealed-vs-ported', asyncHandler(async (req, res) => {
    const { driver, options = {} } = req.body;

    if (!driver) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required field: driver')
        );
    }

    try {
        const comparison = Cookbook.compareSealedVsPorted(driver, options);

        res.json(successResponse(comparison));
    } catch (error) {
        return res.status(400).json(
            errorResponse('CALCULATION_ERROR', error.message)
        );
    }
}));

/**
 * POST /ported-box/calculate (DEPRECATED)
 * Legacy endpoint - use /design instead
 *
 * Maintained for backward compatibility.
 */
router.post('/calculate', asyncHandler(async (req, res) => {
    const {
        driver,
        boxVolume,
        boxVolumeUnit = 'liters',
        tuningFrequency,
        portDiameter = 10,
        portDiameterUnit = 'cm',
        ql = 7
    } = req.body;

    // Validate required fields
    if (!driver || !boxVolume || !tuningFrequency) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required fields: driver, boxVolume, tuningFrequency')
        );
    }

    try {
        // Use cookbook with custom vb/fb
        const design = Cookbook.designPortedBox(driver, {
            vb: boxVolume,
            fb: tuningFrequency
        }, {
            unit: boxVolumeUnit,
            vasUnit: driver.vasUnit || 'liters',
            portDiameter: portDiameter,
            portDiameterUnit: portDiameterUnit,
            ql: ql
        });

        // Format for legacy response structure
        const data = {
            port: {
                length: design.port.length,
                area: design.port.area,
                diameter: design.port.diameter
            },
            tuning: {
                fb: design.tuning.fb,
                unit: 'Hz',
                ratio: design.tuning.ratio
            },
            f3: {
                frequency: design.box.f3,
                unit: 'Hz'
            },
            alignment: design.alignment.name,
            boxVolume: design.box.volume,
            losses: {
                ql: design.box.ql
            }
        };

        if (design.port.velocity) {
            data.portVelocity = {
                value: design.port.velocity.value,
                unit: 'm/s',
                status: design.port.velocity.status
            };
        }

        if (design.efficiency) {
            data.efficiency = {
                eta0: design.efficiency.eta0 / 100,
                percent: design.efficiency.eta0
            };
            data.sensitivity = {
                spl0: design.efficiency.spl0,
                unit: 'dB @ 1W/1m'
            };
        }

        res.json(successResponse(data, design.citations));
    } catch (error) {
        return res.status(400).json(
            errorResponse('CALCULATION_ERROR', error.message)
        );
    }
}));

export default router;
