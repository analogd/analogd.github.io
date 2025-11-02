// SPL and limiting factor calculations
import { MaxPowerCalculator } from './MaxPowerCalculator.js';
import * as Small1972 from '../foundation/small-1972.js';

export class SPLCalculator {
    /**
     * Get base sensitivity for driver (calculated or estimated)
     *
     * Priority order:
     * 1. User-provided baseSensitivity
     * 2. Driver.derived.sensitivity (if Qes available)
     * 3. Calculate from Qes if available
     * 4. Estimate from driver size and Fs (rough)
     * 5. Conservative fallback
     */
    static _getBaseSensitivity(box, options = {}) {
        const driver = box.driver;

        // 1. User-provided override
        if (options.baseSensitivity) {
            return options.baseSensitivity;
        }

        // 2. Use pre-calculated sensitivity from Driver constructor
        if (driver.derived?.sensitivity) {
            return driver.derived.sensitivity;
        }

        // 3. Calculate from T/S parameters if Qes available (Small 1972, Eq. 22)
        if (driver.qes && driver.fs && driver.vasSI) {
            try {
                const eta0 = Small1972.calculateEta0(driver.fs, driver.vasSI, driver.qes);
                const spl0 = Small1972.calculateSpl0(eta0);
                return spl0;
            } catch (err) {
                // Fall through to estimates
            }
        }

        // 4. Rough estimate from driver size and Fs
        // Larger drivers (higher Vas) and lower Fs generally have lower sensitivity
        // Typical range: 85-95 dB for subwoofers, 88-92 dB for midwoofers
        if (driver.vas && driver.fs) {
            const vasLiters = driver.vas;

            // Very rough empirical formula (not from papers, just practical)
            // Smaller Vas = smaller driver = typically higher sensitivity
            // Lower Fs = larger driver = typically lower sensitivity
            if (vasLiters > 200) {
                // Large subwoofer (18", UM18-22 territory)
                return 88;  // Conservative for large subs
            } else if (vasLiters > 100) {
                // Medium subwoofer (15")
                return 89;
            } else if (vasLiters > 50) {
                // Smaller subwoofer (12")
                return 90;
            } else if (vasLiters > 20) {
                // Midwoofer (8-10")
                return 91;
            } else {
                // Small midrange (6.5" and below)
                return 92;
            }
        }

        // 5. Conservative fallback if we have no data
        // 88 dB is conservative for most drivers (won't over-promise SPL)
        return 88;
    }

    // Calculate absolute SPL for a box design
    static calculateSPL(box, power, frequency, options = {}) {
        const baseSensitivity = this._getBaseSensitivity(box, options);

        // Power gain in dB
        const powerGain = 10 * Math.log10(power);

        // Frequency response relative to passband
        const responseDb = box.responseDbAt(frequency);

        return baseSensitivity + powerGain + responseDb;
    }

    // Calculate SPL sweep across frequency range
    static calculateSPLSweep(box, power, startFreq, endFreq, points, options = {}) {
        const baseSensitivity = this._getBaseSensitivity(box, options);
        const powerGain = 10 * Math.log10(power);

        const sweep = box.sweep(startFreq, endFreq, points);
        const spl = sweep.response.map(responseDb => baseSensitivity + powerGain + responseDb);

        return {
            frequencies: sweep.frequencies,
            spl: spl
        };
    }

    // Generate multi-power frequency response curves
    static generateMultiPowerCurves(box, powerLevels, startFreq = 10, endFreq = 200, points = 100, options = {}) {
        const baseSensitivity = this._getBaseSensitivity(box, options);

        const sweep = box.sweep(startFreq, endFreq, points);

        return powerLevels.map(power => {
            const powerGain = 10 * Math.log10(power);
            const spl = sweep.response.map(responseDb => baseSensitivity + powerGain + responseDb);

            return {
                power: power,
                frequencies: sweep.frequencies,
                spl: spl
            };
        });
    }

    // Calculate SPL ceiling (max achievable SPL at each frequency)
    static calculateSPLCeiling(box, startFreq = 10, endFreq = 200, points = 50) {
        const baseSensitivity = this._getBaseSensitivity(box, {});
        const frequencies = [];
        const ceiling = [];

        // Log-spaced frequencies
        const logStart = Math.log10(startFreq);
        const logEnd = Math.log10(endFreq);
        const step = (logEnd - logStart) / (points - 1);

        for (let i = 0; i < points; i++) {
            const freq = Math.pow(10, logStart + i * step);
            frequencies.push(freq);

            // Find max power at this frequency
            const maxPowerData = MaxPowerCalculator.calculateAtFrequency(box, freq);

            // Calculate SPL at max power
            const responseDb = box.responseDbAt(freq);
            const powerGain = 10 * Math.log10(maxPowerData.maxPower);
            const maxSpl = baseSensitivity + powerGain + responseDb;

            ceiling.push(maxSpl);
        }

        return { frequencies, spl: ceiling };
    }

    // Calculate thermal limit curve (SPL at Pe across frequency)
    static calculateThermalLimit(box, startFreq = 10, endFreq = 200, points = 100) {
        const baseSensitivity = this._getBaseSensitivity(box, {});
        const thermalPower = box.driver.pe;
        const powerGain = 10 * Math.log10(thermalPower);

        const sweep = box.sweep(startFreq, endFreq, points);
        const thermalSpl = sweep.response.map(responseDb => baseSensitivity + powerGain + responseDb);

        return {
            frequencies: sweep.frequencies,
            spl: thermalSpl
        };
    }

    // Calculate flat EQ thermal limit (worst-case SPL with Pe when boosting)
    static calculateFlatEQThermalLimit(box, startFreq = 10, endFreq = 200, points = 100) {
        const baseSensitivity = this._getBaseSensitivity(box, {});
        const thermalPower = box.driver.pe;
        const powerGain = 10 * Math.log10(thermalPower);

        const sweep = box.sweep(startFreq, endFreq, points);

        // Find worst-case (lowest) response in the sweep
        const minResponseDb = Math.min(...sweep.response);

        // Flat line at the SPL achievable with Pe at worst frequency
        const flatSpl = baseSensitivity + powerGain + minResponseDb;
        const flatLine = sweep.frequencies.map(() => flatSpl);

        return {
            frequencies: sweep.frequencies,
            spl: flatLine
        };
    }

    // Calculate excursion limit curve (SPL where excursion = Xmax)
    static calculateExcursionLimit(box, startFreq = 10, endFreq = 200, points = 100) {
        const baseSensitivity = this._getBaseSensitivity(box, {});
        const frequencies = [];
        const excursionLimitSpl = [];

        // Log-spaced frequencies
        const logStart = Math.log10(startFreq);
        const logEnd = Math.log10(endFreq);
        const step = (logEnd - logStart) / (points - 1);

        for (let i = 0; i < points; i++) {
            const freq = Math.pow(10, logStart + i * step);
            frequencies.push(freq);

            // Find power where excursion equals Xmax
            const maxPowerData = MaxPowerCalculator.calculateAtFrequency(box, freq);

            // If excursion-limited, use that power. Otherwise use thermal limit
            const limitPower = maxPowerData.limitingFactor === 'excursion'
                ? maxPowerData.maxPower
                : box.driver.pe;

            // Calculate SPL at that power
            const responseDb = box.responseDbAt(freq);
            const powerGain = 10 * Math.log10(limitPower);
            const spl = baseSensitivity + powerGain + responseDb;

            excursionLimitSpl.push(spl);
        }

        return { frequencies, spl: excursionLimitSpl };
    }

    // Calculate thermal headroom for a given power
    static calculateThermalHeadroom(driver, power, options = {}) {
        if (!driver.canCalculateThermalLimit()) return null;

        const baseSensitivity = options.baseSensitivity || driver.derived?.sensitivity || 88;
        const continuousPower = driver.pe * 0.7;  // 70% of Pe for thermal headroom

        const thermalLimitSPL = baseSensitivity + 10 * Math.log10(continuousPower);
        const headroom = continuousPower / power;  // ratio
        const headroomDb = 10 * Math.log10(headroom);

        return {
            continuousPower: continuousPower,
            limitSPL: thermalLimitSPL,
            headroomDb: headroomDb,
            limited: power > continuousPower
        };
    }

    // Calculate excursion limit SPL at a specific frequency
    static calculateExcursionLimitAtFrequency(box, frequency, options = {}) {
        const driver = box.driver;
        if (!driver.canCalculateExcursion()) return null;

        const baseSensitivity = this._getBaseSensitivity(box, options);

        // Excursion-limited SPL increases with frequency
        let excursionSPL;

        if (box instanceof SealedBox) {
            // Sealed: excursion follows response shape
            const ratio = frequency / box.fc;
            excursionSPL = baseSensitivity + 20 * Math.log10(ratio) + 10;
        } else if (box instanceof PortedBox) {
            // Ported: driver unloaded below tuning
            if (frequency < box.fb) {
                const vd = driver.sd * driver.xmax / 1000;  // cm³
                excursionSPL = 112 + 10 * Math.log10(vd * box.fb * box.fb)
                             - 40 * Math.log10(box.fb / frequency);
            } else {
                const vd = driver.sd * driver.xmax / 1000;
                excursionSPL = 112 + 10 * Math.log10(vd * frequency * frequency);
            }
        }

        return Math.min(excursionSPL, 140);  // Cap at realistic max
    }

    // Calculate all limiting factors at a test frequency
    static analyzeLimits(box, power, testFrequency, options = {}) {
        const driver = box.driver;

        const analysis = {
            frequency: testFrequency,
            power: power,
            systemSPL: this.calculateSPL(box, power, testFrequency, options)
        };

        // Thermal limit
        const thermal = this.calculateThermalHeadroom(driver, power, options);
        if (thermal) {
            analysis.thermal = thermal;
            analysis.thermalLimited = thermal.limited;
        }

        // Excursion limit
        const excursionLimit = this.calculateExcursionLimitAtFrequency(box, testFrequency, options);
        if (excursionLimit !== null) {
            analysis.excursionLimitSPL = excursionLimit;
            analysis.excursionMargin = excursionLimit - analysis.systemSPL;
            analysis.excursionLimited = analysis.excursionMargin < 0;
        }

        // Port velocity (ported only)
        if (box instanceof PortedBox) {
            const portStatus = box.portVelocityStatus();
            if (portStatus) {
                analysis.portVelocity = box.calculatePortVelocity();
                analysis.portStatus = portStatus;
                analysis.portLimited = portStatus.level === 'high' || portStatus.level === 'critical';
            }
        }

        // Determine primary limiting factor
        if (analysis.excursionLimited) {
            analysis.limitingFactor = 'excursion';
            analysis.limitingMargin = analysis.excursionMargin;
        } else if (analysis.thermalLimited) {
            analysis.limitingFactor = 'thermal';
            analysis.limitingMargin = thermal.headroomDb;
        } else if (analysis.portLimited) {
            analysis.limitingFactor = 'port';
            analysis.limitingMargin = -2;  // Subjective penalty
        } else {
            analysis.limitingFactor = 'none';
            analysis.limitingMargin = Math.min(
                analysis.excursionMargin || 10,
                thermal ? thermal.headroomDb : 10
            );
        }

        return analysis;
    }
}
