// SPL and limiting factor calculations
class SPLCalculator {
    // Calculate absolute SPL for a box design
    static calculateSPL(box, power, frequency, options = {}) {
        const baseSensitivity = options.baseSensitivity || 88;  // dB @ 1W/1m

        // Power gain in dB
        const powerGain = 10 * Math.log10(power);

        // Frequency response relative to passband
        const responseDb = box.responseDbAt(frequency);

        return baseSensitivity + powerGain + responseDb;
    }

    // Calculate SPL sweep across frequency range
    static calculateSPLSweep(box, power, startFreq, endFreq, points, options = {}) {
        const baseSensitivity = options.baseSensitivity || 88;
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
        const baseSensitivity = options.baseSensitivity || 88;

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
        const baseSensitivity = 88; // Will be driver-specific later
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

    // Calculate thermal limit (flat across frequency)
    static calculateThermalLimit(driver, power, options = {}) {
        if (!driver.canCalculateThermalLimit()) return null;

        const baseSensitivity = options.baseSensitivity || 88;
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

    // Calculate excursion limit at a specific frequency
    static calculateExcursionLimit(box, frequency, options = {}) {
        const driver = box.driver;
        if (!driver.canCalculateExcursion()) return null;

        const baseSensitivity = options.baseSensitivity || 88;

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
        const thermal = this.calculateThermalLimit(driver, power, options);
        if (thermal) {
            analysis.thermal = thermal;
            analysis.thermalLimited = thermal.limited;
        }

        // Excursion limit
        const excursionLimit = this.calculateExcursionLimit(box, testFrequency, options);
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
