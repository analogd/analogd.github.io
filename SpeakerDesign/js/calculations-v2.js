// Core calculations for speaker enclosure design
// V2: Uses SpeakerPhysics library internally

class SpeakerCalculations {

    // Calculate sealed box parameters
    static calculateSealed(params) {
        const driver = new Driver(params);
        const alignments = AlignmentCalculator.calculateSealedAlignments(driver);

        return alignments.map(alignment => ({
            alignment: alignment.name,
            qtc: alignment.qtc.toFixed(3),
            vb: alignment.vb.toFixed(2),
            fc: alignment.box.fc.toFixed(1),
            f3: alignment.box.f3.toFixed(1)
        }));
    }

    // Calculate ported box parameters
    static calculatePorted(params) {
        const driver = new Driver(params);
        const alignments = AlignmentCalculator.calculatePortedAlignments(driver, {
            portDiameter: Constants.DEFAULT_PORT_DIAMETER_CM
        });

        return alignments.map(alignment => ({
            alignment: alignment.name,
            vb: alignment.vb.toFixed(2),
            fb: alignment.fb.toFixed(1),
            f3: alignment.box.f3.toFixed(1),
            portDiameter: alignment.portDiameter.toFixed(1),
            portLength: alignment.portLength.toFixed(1),
            portVelocity: alignment.portVelocity ? alignment.portVelocity.toFixed(1) : null,
            portVelocityWarning: alignment.portStatus ? alignment.portStatus.warning : null
        }));
    }

    // Calculate port velocity for custom port dimensions
    static calculatePortVelocity(sd, xmax, fb, portDiameter) {
        return SpeakerPhysics.calculatePortVelocity(sd, xmax, fb, portDiameter);
    }

    // Get port velocity warning text
    static getPortVelocityWarning(velocity) {
        if (!velocity) return null;

        if (velocity > Constants.PORT.VELOCITY_WARNING_CRITICAL) {
            return 'Very high - expect significant chuffing';
        } else if (velocity > Constants.PORT.VELOCITY_WARNING_HIGH) {
            return 'High - may have audible chuffing';
        } else if (velocity > Constants.PORT.VELOCITY_WARNING_MODERATE) {
            return 'Moderate - acceptable for most uses';
        }
        return null;
    }

    // Calculate frequency response
    static calculateFrequencyResponse(params, enclosure, boxVolume, fb = null, power = null) {
        const driver = new Driver(params);
        const actualPower = power || Constants.SPL.DEFAULT_POWER;

        let box;
        if (enclosure === 'sealed') {
            box = new SealedBox(driver, boxVolume);
        } else if (enclosure === 'ported') {
            box = new PortedBox(driver, boxVolume, fb || driver.fs);
        }

        const frequencies = [];
        const spl = [];
        const thermalLimit = [];
        const excursionLimit = [];

        // Generate frequency points
        for (let i = Constants.RESPONSE.FREQ_START;
             i <= Constants.RESPONSE.FREQ_END;
             i += Constants.RESPONSE.FREQ_STEP) {
            frequencies.push(i);
        }

        // Calculate SPL at each frequency
        const baseSensitivity = Constants.SPL.BASE_SENSITIVITY;
        const powerGain = 10 * Math.log10(actualPower);

        for (const f of frequencies) {
            const responseDb = box.responseDbAt(f);
            spl.push(baseSensitivity + powerGain + responseDb);

            // Thermal limit (flat)
            if (driver.pe && power) {
                thermalLimit.push(baseSensitivity + powerGain);
            }

            // Excursion limit
            if (driver.sd && driver.xmax) {
                const excursionSpl = SPLCalculator.calculateExcursionLimit(box, f, { baseSensitivity });
                if (excursionSpl !== null) {
                    excursionLimit.push(excursionSpl);
                }
            }
        }

        const result = { frequencies, spl };
        if (thermalLimit.length > 0) result.thermalLimit = thermalLimit;
        if (excursionLimit.length > 0) result.excursionLimit = excursionLimit;

        return result;
    }

    // Calculate limiting factors at a specific frequency
    static calculateLimitingFactors(params, enclosure, boxVolume, fb, power, testFreq = 25) {
        const driver = new Driver(params);

        if (!power || !driver.sd || !driver.xmax || !driver.pe) {
            return null;
        }

        let box;
        if (enclosure === 'sealed') {
            box = new SealedBox(driver, boxVolume);
        } else if (enclosure === 'ported') {
            box = new PortedBox(driver, boxVolume, fb || driver.fs);
        }

        const analysis = SPLCalculator.analyzeLimits(box, power, testFreq, {
            baseSensitivity: Constants.SPL.BASE_SENSITIVITY
        });

        // Convert to old format for compatibility
        return {
            frequency: testFreq,
            power: power,
            systemSPL: analysis.systemSPL,
            thermalHeadroom: analysis.thermal ? analysis.thermal.headroomDb : 0,
            thermalLimited: analysis.thermalLimited || false,
            excursionPercent: analysis.excursionMargin ? (100 - analysis.excursionMargin * 10) : 0,
            excursionLimited: analysis.excursionLimited || false,
            portVelocity: analysis.portVelocity || null,
            portLimited: analysis.portLimited || false,
            limitingFactor: analysis.limitingFactor,
            limitingMargin: analysis.limitingMargin
        };
    }

    // Calculate all common alignments for a driver
    static calculateAllAlignments(params, enclosureType) {
        const driver = new Driver(params);
        const alignments = SpeakerPhysics.calculateAlignments(driver, enclosureType, {
            portDiameter: Constants.DEFAULT_PORT_DIAMETER_CM
        });

        const results = [];

        for (const alignment of alignments) {
            const response = this.calculateFrequencyResponse(
                params,
                enclosureType,
                alignment.vb,
                alignment.fb || null
            );

            const alignmentData = {
                alignment: alignment.name,
                type: enclosureType,
                frequencies: response.frequencies,
                spl: response.spl
            };

            // Copy all properties from alignment
            if (enclosureType === 'sealed') {
                alignmentData.qtc = alignment.qtc.toFixed(3);
                alignmentData.vb = alignment.vb.toFixed(2);
                alignmentData.fc = alignment.box.fc.toFixed(1);
                alignmentData.f3 = alignment.box.f3.toFixed(1);
            } else if (enclosureType === 'ported') {
                alignmentData.vb = alignment.vb.toFixed(2);
                alignmentData.fb = alignment.fb.toFixed(1);
                alignmentData.f3 = alignment.box.f3.toFixed(1);
                alignmentData.portDiameter = alignment.portDiameter.toFixed(1);
                alignmentData.portLength = alignment.portLength.toFixed(1);
                alignmentData.portVelocity = alignment.portVelocity ? alignment.portVelocity.toFixed(1) : null;
                alignmentData.portVelocityWarning = alignment.portStatus ? alignment.portStatus.warning : null;
            }

            results.push(alignmentData);
        }

        return results;
    }
}
