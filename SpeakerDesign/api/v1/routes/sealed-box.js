// Sealed box calculation routes
// Now uses Cookbook layer for clean, comprehensive results

import express from 'express';
import * as Cookbook from '../../../lib/cookbook/index.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * POST /sealed-box/design
 * Complete sealed box design for a given alignment
 *
 * Body:
 * {
 *   driver: { fs, qts, vas, qes?, xmax?, sd?, pe?, re?, bl?, mms? },
 *   alignment: 'butterworth' | 'bessel' | 'chebyshev' | number (Qtc),
 *   options?: {
 *     unit?: 'liters' | 'm3' | 'cuft',
 *     vasUnit?: 'liters' | 'm3',
 *     responseRange?: [number, number],
 *     responsePoints?: number
 *   }
 * }
 */
router.post('/design', asyncHandler(async (req, res) => {
    const { driver, alignment = 'butterworth', options = {} } = req.body;

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
        const design = Cookbook.designSealedBox(driver, alignment, options);

        res.json(successResponse(design, design.citations));
    } catch (error) {
        return res.status(400).json(
            errorResponse('CALCULATION_ERROR', error.message)
        );
    }
}));

/**
 * POST /sealed-box/compare
 * Compare multiple sealed alignments
 *
 * Body:
 * {
 *   driver: { fs, qts, vas, qes?, xmax?, sd?, pe? },
 *   alignments?: ['butterworth', 'bessel', 'chebyshev'],
 *   options?: { unit, vasUnit, responseRange, responsePoints }
 * }
 */
router.post('/compare', asyncHandler(async (req, res) => {
    const { driver, alignments = ['bessel', 'butterworth', 'chebyshev'], options = {} } = req.body;

    if (!driver) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required field: driver')
        );
    }

    try {
        const designs = Cookbook.compareSealedAlignments(driver, alignments, options);

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
 * POST /sealed-box/target-f3
 * Design for specific F3 target
 *
 * Body:
 * {
 *   driver: { fs, qts, vas, qes?, xmax?, sd?, pe? },
 *   targetF3: number (Hz),
 *   options?: { unit, vasUnit }
 * }
 */
router.post('/target-f3', asyncHandler(async (req, res) => {
    const { driver, targetF3, options = {} } = req.body;

    if (!driver || !targetF3) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required fields: driver, targetF3')
        );
    }

    try {
        const design = Cookbook.designForF3(driver, targetF3, options);

        res.json(successResponse(design, design.citations));
    } catch (error) {
        return res.status(400).json(
            errorResponse('CALCULATION_ERROR', error.message)
        );
    }
}));

/**
 * POST /sealed-box/calculate (DEPRECATED)
 * Legacy endpoint - use /design instead
 *
 * Maintained for backward compatibility.
 */
router.post('/calculate', asyncHandler(async (req, res) => {
    const { driver, boxVolume, boxVolumeUnit = 'liters' } = req.body;

    if (!driver || !boxVolume) {
        return res.status(400).json(
            errorResponse('BAD_REQUEST', 'Missing required fields: driver, boxVolume')
        );
    }

    try {
        // Use cookbook with fixed volume
        const design = Cookbook.designSealedBox(driver, 'butterworth', {
            unit: boxVolumeUnit,
            vasUnit: driver.vasUnit || 'liters',
            volume: boxVolume
        });

        // Format for legacy response structure
        const data = {
            systemResonance: {
                fc: design.box.fc,
                unit: 'Hz'
            },
            totalQ: {
                qtc: design.box.qtc
            },
            f3: {
                frequency: design.box.f3,
                unit: 'Hz'
            },
            alignment: design.alignment.name,
            complianceRatio: {
                alpha: design.box.alpha,
                description: 'Vas / Vb'
            },
            boxVolume: design.box.volume
        };

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
