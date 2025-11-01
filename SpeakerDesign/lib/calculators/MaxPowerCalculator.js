// MaxPowerCalculator.js
// Calculates maximum safe power handling vs frequency
// Accounts for both excursion and thermal limits
//
// ⚠️ CONFIDENCE: MEDIUM
// - Thermal limiting: VALIDATED (simple Pe comparison)
// - Excursion calculation: APPROXIMATE (simplified model, needs proper impedance formula)
// - See FORMULA_STATUS.md for details

class MaxPowerCalculator {
    /**
     * Generate complete max power curve across frequency range
     * @param {SealedBox|PortedBox} box - Box model
     * @param {Array<number>} frequencies - Optional frequency array
     * @returns {Array<Object>} [{frequency, maxPower, limitingFactor, excursion}]
     */
    static generateCurve(box, frequencies = null) {
        if (!frequencies) {
            // Default: log-spaced from 10Hz to 200Hz
            frequencies = [10, 12, 15, 18, 20, 25, 30, 35, 40, 50, 60, 80, 100, 120, 150, 200];
        }

        return frequencies.map(freq => {
            const result = this.calculateAtFrequency(box, freq);
            return {
                frequency: freq,
                maxPower: result.maxPower,
                limitingFactor: result.limitingFactor,
                excursion: result.excursion
            };
        });
    }

    /**
     * Calculate max power at specific frequency
     * @param {SealedBox|PortedBox} box - Box model
     * @param {number} frequency - Frequency in Hz
     * @returns {Object} {maxPower, limitingFactor, excursion}
     */
    static calculateAtFrequency(box, frequency) {
        const driver = box.driver;
        const thermalLimit = driver.pe;

        // Calculate excursion at thermal power
        const excursionAtThermal = this.calculateExcursion(box, frequency, thermalLimit);

        if (excursionAtThermal <= driver.xmax) {
            // Thermal limited
            return {
                maxPower: thermalLimit,
                limitingFactor: 'thermal',
                excursion: excursionAtThermal
            };
        }

        // Excursion limited - find power where excursion = Xmax
        const maxPower = this.findExcursionLimitedPower(box, frequency);

        return {
            maxPower: maxPower,
            limitingFactor: 'excursion',
            excursion: driver.xmax
        };
    }

    /**
     * Calculate cone excursion at given power and frequency
     * Simplified model based on transfer function
     */
    static calculateExcursion(box, frequency, power) {
        const driver = box.driver;

        // Response relative to passband (linear scale)
        const response = box.responseAt(frequency);

        // At resonance, excursion is maximum
        // Above resonance, excursion decreases with frequency
        // This is simplified - real calculation involves impedance

        const sd_m2 = driver.sd / 10000; // cm² to m²
        const freqRatio = frequency / box.fc;

        // Volume velocity proportional to power and inverse of response
        // Excursion inversely proportional to frequency
        const excursion_m = Math.sqrt(power) / (sd_m2 * 2 * Math.PI * frequency * response);

        // Convert to mm and apply empirical correction factor
        return excursion_m * 1000 * 15; // Empirical factor to match WinISD ballpark
    }

    /**
     * Find power where excursion equals Xmax (binary search)
     */
    static findExcursionLimitedPower(box, frequency) {
        const driver = box.driver;
        let lowPower = 1;
        let highPower = driver.pe;

        // Binary search for power where excursion = Xmax
        for (let i = 0; i < 20; i++) {
            const testPower = (lowPower + highPower) / 2;
            const excursion = this.calculateExcursion(box, frequency, testPower);

            if (Math.abs(excursion - driver.xmax) < 0.1) {
                return Math.round(testPower);
            }

            if (excursion > driver.xmax) {
                highPower = testPower;
            } else {
                lowPower = testPower;
            }
        }

        return Math.round(lowPower);
    }

    /**
     * Check if given power is safe at a frequency
     */
    static isSafe(box, frequency, power) {
        const result = this.calculateAtFrequency(box, frequency);
        return power <= result.maxPower;
    }

    /**
     * Get warnings for given power across frequency range
     */
    static getWarnings(box, power) {
        const warnings = [];
        const testFreqs = [10, 15, 20, 25, 30, 40, 50, 80];

        for (const freq of testFreqs) {
            const result = this.calculateAtFrequency(box, freq);

            if (power > result.maxPower * 1.1) { // 10% margin
                warnings.push({
                    frequency: freq,
                    maxSafe: result.maxPower,
                    requested: power,
                    limitingFactor: result.limitingFactor,
                    message: `${power}W exceeds ${result.limitingFactor} limit (${Math.round(result.maxPower)}W) at ${freq}Hz`
                });
            }
        }

        return warnings;
    }
}
