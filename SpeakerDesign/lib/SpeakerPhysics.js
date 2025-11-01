// SpeakerPhysics - Main library entry point
// Pure speaker enclosure physics calculations

class SpeakerPhysics {
    // Create a driver model from T-S parameters
    static createDriver(params) {
        return new Driver(params);
    }

    // Create a sealed box design
    static createSealedBox(driver, vb, options = {}) {
        return new SealedBox(driver, vb, options);
    }

    // Create a ported box design
    static createPortedBox(driver, vb, fb, options = {}) {
        return new PortedBox(driver, vb, fb, options);
    }

    // Calculate standard alignments
    static calculateAlignments(driver, enclosureType, options = {}) {
        if (enclosureType === 'sealed') {
            return AlignmentCalculator.calculateSealedAlignments(driver);
        } else if (enclosureType === 'ported') {
            return AlignmentCalculator.calculatePortedAlignments(driver, options);
        } else {
            throw new Error(`Unknown enclosure type: ${enclosureType}`);
        }
    }

    // Find optimal alignment
    static findOptimalAlignment(driver, enclosureType, criteria = {}) {
        return AlignmentCalculator.findOptimalAlignment(driver, enclosureType, criteria);
    }

    // SPL calculations
    static calculateSPL(box, power, frequency, options = {}) {
        return SPLCalculator.calculateSPL(box, power, frequency, options);
    }

    static calculateSPLSweep(box, power, startFreq, endFreq, points, options = {}) {
        return SPLCalculator.calculateSPLSweep(box, power, startFreq, endFreq, points, options);
    }

    // Analyze limiting factors
    static analyzeLimits(box, power, testFrequency, options = {}) {
        return SPLCalculator.analyzeLimits(box, power, testFrequency, options);
    }

    // Excursion calculations
    static calculateDisplacement(box, frequency, power) {
        return ExcursionCalculator.calculateDisplacement(box, frequency, power);
    }

    static calculateMaxPower(box, frequency) {
        return ExcursionCalculator.calculateMaxPower(box, frequency);
    }

    static generateMaxPowerCurve(box, frequencies = null) {
        return ExcursionCalculator.generateMaxPowerCurve(box, frequencies);
    }

    static checkPowerSafety(box, power, minFreq = 10, maxFreq = 200) {
        return ExcursionCalculator.checkPowerSafety(box, power, minFreq, maxFreq);
    }

    // Utility: Calculate port length for given dimensions
    static calculatePortLength(vb, fb, portDiameter) {
        const portArea = Math.PI * (portDiameter / 2) ** 2;
        const length = (23562.5 * portArea) / (vb * fb * fb) - 0.732 * portDiameter;
        return Math.max(1, length);
    }

    // Utility: Calculate port velocity
    static calculatePortVelocity(sd, xmax, fb, portDiameter) {
        const sdM2 = sd / 10000;
        const xmaxM = xmax / 1000;
        const portArea = Math.PI * (portDiameter / 2) ** 2;
        const spM2 = portArea / 10000;
        return (sdM2 * xmaxM * fb) / spM2;
    }
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SpeakerPhysics, Driver, SealedBox, PortedBox, AlignmentCalculator, SPLCalculator, ExcursionCalculator };
}
