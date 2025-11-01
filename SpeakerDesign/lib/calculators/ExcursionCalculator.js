// ExcursionCalculator.js
// Calculates cone excursion and power limits

class ExcursionCalculator {
    /**
     * Calculate peak cone displacement at a given frequency and power
     * @param {SealedBox} box - Sealed box model
     * @param {number} frequency - Frequency in Hz
     * @param {number} power - Input power in watts
     * @returns {number} Peak displacement in mm
     */
    static calculateDisplacement(box, frequency, power) {
        const driver = box.driver;

        // Volume velocity (Vd) at resonance for 1W
        // Vd = Sd × Xmax (in m³ for 1W reference)
        const sd_m2 = driver.sd / 10000; // cm² to m²
        const xmax_m = driver.xmax / 1000; // mm to m

        // Reference displacement volume
        const vd_ref = sd_m2 * xmax_m;

        // Calculate impedance and response at frequency
        const response = box.responseAt(frequency);

        // Displacement scales with power and inverse of response
        // At resonance, response is maximum, so displacement is maximum
        // Above resonance, response increases, so displacement decreases
        const displacement_m = Math.sqrt(power) * vd_ref / (response * sd_m2);

        return displacement_m * 1000; // Convert to mm
    }

    /**
     * Calculate maximum safe power at a given frequency
     * Limited by either excursion (Xmax) or thermal (Pe)
     * @param {SealedBox} box - Sealed box model
     * @param {number} frequency - Frequency in Hz
     * @returns {Object} { maxPower, limitingFactor, displacement }
     */
    static calculateMaxPower(box, frequency) {
        const driver = box.driver;

        // Thermal limit is just Pe
        const thermalLimit = driver.pe;

        // For excursion limit, find power where displacement = Xmax
        // Start with thermal limit and work down if needed
        let testPower = thermalLimit;
        let displacement = this.calculateDisplacement(box, frequency, testPower);

        // If displacement exceeds Xmax at thermal limit, reduce power
        if (displacement > driver.xmax) {
            // Binary search for power where displacement = Xmax
            let lowPower = 1;
            let highPower = thermalLimit;

            while (highPower - lowPower > 1) {
                testPower = (lowPower + highPower) / 2;
                displacement = this.calculateDisplacement(box, frequency, testPower);

                if (displacement > driver.xmax) {
                    highPower = testPower;
                } else {
                    lowPower = testPower;
                }
            }

            return {
                maxPower: Math.round(lowPower),
                limitingFactor: 'excursion',
                displacement: driver.xmax
            };
        }

        // If displacement is under Xmax, thermal limit applies
        return {
            maxPower: Math.round(thermalLimit),
            limitingFactor: 'thermal',
            displacement: displacement
        };
    }

    /**
     * Generate maximum power curve across frequency range
     * @param {SealedBox} box - Sealed box model
     * @param {Array<number>} frequencies - Array of frequencies to test
     * @returns {Array<Object>} Array of { frequency, maxPower, limitingFactor, displacement }
     */
    static generateMaxPowerCurve(box, frequencies = null) {
        if (!frequencies) {
            // Default frequency points (log-spaced from 10Hz to 200Hz)
            frequencies = [10, 15, 20, 25, 30, 35, 40, 50, 60, 80, 100, 150, 200];
        }

        return frequencies.map(freq => {
            const result = this.calculateMaxPower(box, freq);
            return {
                frequency: freq,
                ...result
            };
        });
    }

    /**
     * Check if a given power level is safe across frequency range
     * @param {SealedBox} box - Sealed box model
     * @param {number} power - Power to test in watts
     * @param {number} minFreq - Minimum frequency to check
     * @param {number} maxFreq - Maximum frequency to check
     * @returns {Object} { safe, warnings }
     */
    static checkPowerSafety(box, power, minFreq = 10, maxFreq = 200) {
        const warnings = [];
        let safe = true;

        // Check at key frequencies
        const testFreqs = [minFreq, 20, 30, 40, 50, 80, maxFreq];

        for (const freq of testFreqs) {
            const maxPowerData = this.calculateMaxPower(box, freq);

            if (power > maxPowerData.maxPower) {
                safe = false;
                warnings.push({
                    frequency: freq,
                    requestedPower: power,
                    maxPower: maxPowerData.maxPower,
                    limitingFactor: maxPowerData.limitingFactor,
                    message: `${power}W exceeds ${maxPowerData.limitingFactor} limit of ${maxPowerData.maxPower}W at ${freq}Hz`
                });
            }
        }

        return { safe, warnings };
    }
}
