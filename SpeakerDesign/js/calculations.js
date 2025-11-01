// Core calculations for speaker enclosure design

class SpeakerCalculations {

    // Calculate sealed box parameters
    static calculateSealed(params) {
        const { fs, qts, vas } = params;

        const results = [];

        for (const alignment of Constants.ALIGNMENTS.SEALED) {
            const qtc = alignment.qtc;

            // Calculate alpha (ratio of Vas to Vb)
            const alpha = (qtc * qtc) / (qts * qts) - 1;

            if (alpha <= 0) {
                continue;
            }

            // Calculate box volume
            const vb = vas / alpha;

            // Calculate f3 (-3dB frequency)
            const fc = fs * Math.sqrt(alpha + 1);
            const f3 = fc / Math.sqrt(1 - 1 / (2 * qtc * qtc) + Math.sqrt((1 - 1 / (2 * qtc * qtc)) ** 2 + 1));

            results.push({
                alignment: alignment.name,
                qtc: qtc.toFixed(3),
                vb: vb.toFixed(2),
                fc: fc.toFixed(1),
                f3: f3.toFixed(1)
            });
        }

        return results;
    }

    // Calculate ported box parameters
    static calculatePorted(params) {
        const { fs, qts, vas, sd, xmax } = params;

        const results = [];

        for (const alignment of Constants.ALIGNMENTS.PORTED) {
            // Calculate tuning frequency and box volume based on alignment
            const fb = fs * alignment.fbMultiplier;
            const vb = alignment.vbFactor * Math.pow(qts, alignment.exponent) * vas;

            // F3 approximation for ported boxes
            const f3 = fb * Constants.ALIGNMENTS.F3_PORTED_FACTOR;

            // Simplified port calculation (assuming round port)
            const portDiameter = Constants.DEFAULT_PORT_DIAMETER_CM;
            const portArea = Math.PI * (portDiameter / 2) ** 2;
            const portLength = (Constants.PORT.LENGTH_CONSTANT * portArea) / (vb * fb * fb) -
                              Constants.PORT.END_CORRECTION_FACTOR * portDiameter;

            // Calculate port velocity at tuning frequency if we have driver parameters
            let portVelocity = null;
            let portVelocityWarning = null;
            if (sd && xmax) {
                portVelocity = this.calculatePortVelocity(sd, xmax, fb, portDiameter);
                portVelocityWarning = this.getPortVelocityWarning(portVelocity);
            }

            results.push({
                alignment: alignment.name,
                vb: vb.toFixed(2),
                fb: fb.toFixed(1),
                f3: f3.toFixed(1),
                portDiameter: portDiameter.toFixed(1),
                portLength: Math.max(1, portLength).toFixed(1),
                portVelocity: portVelocity ? portVelocity.toFixed(1) : null,
                portVelocityWarning: portVelocityWarning
            });
        }

        return results;
    }

    // Calculate port velocity for custom port dimensions
    // Returns velocity in m/s
    static calculatePortVelocity(sd, xmax, fb, portDiameter) {
        if (!sd || !xmax || !fb || !portDiameter) return null;

        // Port velocity V = (Sd × Xpeak × fb) / Sp
        // Assume Xpeak ≈ Xmax for conservative estimate
        const sdM2 = sd / Constants.UNITS.CM2_TO_M2;
        const xmaxM = xmax / Constants.UNITS.MM_TO_M;
        const portArea = Math.PI * (portDiameter / 2) ** 2;
        const spM2 = portArea / Constants.UNITS.CM2_TO_M2;

        return (sdM2 * xmaxM * fb) / spM2;
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
        const { fs, qts, vas, sd, pe, xmax } = params;

        const frequencies = [];
        const spl = [];
        const thermalLimit = [];
        const excursionLimit = [];

        // Generate frequency points (logarithmic scale)
        for (let i = Constants.RESPONSE.FREQ_START;
             i <= Constants.RESPONSE.FREQ_END;
             i += Constants.RESPONSE.FREQ_STEP) {
            frequencies.push(i);
        }

        // Simplified baseline sensitivity
        // For subwoofers, typical sensitivity is 85-95 dB
        // Use a reasonable baseline and let the response curves show the shape
        const baseSensitivity = 88;

        // Actual power to use
        const actualPower = power || Constants.SPL.DEFAULT_POWER;
        const powerGain = 10 * Math.log10(actualPower);

        if (enclosure === 'sealed') {
            const alpha = vas / boxVolume;
            const qtc = qts * Math.sqrt(alpha + 1);
            const fc = fs * Math.sqrt(alpha + 1);

            for (const f of frequencies) {
                const ratio = f / fc;
                // Sealed box 2nd order high-pass: response relative to passband
                // At high frequencies (f >> fc), response = 0dB
                // Below fc, rolls off at 12dB/octave
                const ratio2 = ratio * ratio;
                const responseAmplitude = ratio2 / Math.sqrt((1 - ratio2) ** 2 + ratio2 / (qtc * qtc));
                const response = 20 * Math.log10(responseAmplitude);
                spl.push(baseSensitivity + response + powerGain);

                // Thermal limit (flat across frequency)
                if (pe && power) {
                    thermalLimit.push(baseSensitivity + powerGain);
                }

                // Excursion limit: max SPL before exceeding Xmax
                // This is independent of input power - it's a physical limit
                if (sd && xmax) {
                    // SPL from Xmax displacement at frequency f
                    // SPL ≈ baseSens + 20*log10(f/fc) at excursion limit
                    // Simplified: assume excursion-limited SPL rises with frequency
                    const xmaxM = xmax / Constants.UNITS.MM_TO_M;
                    const sdM2 = sd / Constants.UNITS.CM2_TO_M2;
                    // Displacement volume at Xmax
                    const vdM3 = sdM2 * xmaxM;
                    // SPL from volume velocity at 1m
                    const excursionSpl = baseSensitivity + 20 * Math.log10(f / fc) + 10;
                    excursionLimit.push(Math.min(excursionSpl, 140)); // Cap at realistic max
                }
            }
        } else if (enclosure === 'ported') {
            const fbTuning = fb || fs;

            for (const f of frequencies) {
                let response;

                if (f < fbTuning) {
                    // Below tuning: 24dB/octave rolloff
                    const rolloff = -40 * Math.log10(fbTuning / f);
                    response = Math.max(rolloff, -40); // Cap at -40dB
                } else {
                    // Above tuning: essentially flat (slight rolloff at very high f)
                    // For subwoofer range (10-200Hz), treat as flat
                    response = 0;
                }

                spl.push(baseSensitivity + response + powerGain);

                // Thermal limit
                if (pe && power) {
                    thermalLimit.push(baseSensitivity + powerGain);
                }

                // Excursion limit (driver unloaded below port tuning)
                if (sd && xmax && power) {
                    const vd = sd * xmax / Constants.UNITS.MM_TO_M;
                    let excursionSpl;
                    if (f < fbTuning) {
                        // Below tuning: driver excursion increases rapidly
                        excursionSpl = Constants.SPL.VD_SPL_CONSTANT +
                                      10 * Math.log10(vd * fbTuning * fbTuning) -
                                      40 * Math.log10(fbTuning / f);
                    } else {
                        excursionSpl = Constants.SPL.VD_SPL_CONSTANT +
                                      10 * Math.log10(vd * f * f) + powerGain;
                    }
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
        const { sd, xmax, pe, re } = params;

        if (!power || !sd || !xmax || !pe) {
            return null;
        }

        const limits = {
            frequency: testFreq,
            power: power
        };

        // Calculate system SPL at test frequency
        const response = this.calculateFrequencyResponse(params, enclosure, boxVolume, fb, power);
        const freqIndex = response.frequencies.findIndex(f => f >= testFreq);
        limits.systemSPL = freqIndex >= 0 ? response.spl[freqIndex] : null;

        // Thermal limit: continuous power handling
        // Assume continuous = 0.7 × Pe for thermal headroom
        const thermalPower = pe * 0.7;
        const thermalGain = 10 * Math.log10(power / thermalPower);
        limits.thermalHeadroom = -thermalGain;
        limits.thermalLimited = power > thermalPower;

        // Excursion limit: calculate excursion at test frequency
        // Simplified: Vd = Sd × Xpeak, Power ∝ Xpeak²
        const voltage = Math.sqrt(power * re);
        const fs = params.fs;
        const qts = params.qts;

        // Approximate excursion at frequency (very simplified)
        // More accurate would need full impedance model
        const freqRatio = testFreq / fs;
        let excursionFactor;
        if (enclosure === 'sealed') {
            const alpha = params.vas / boxVolume;
            const qtc = qts * Math.sqrt(alpha + 1);
            const fc = fs * Math.sqrt(alpha + 1);
            const ratio = testFreq / fc;
            excursionFactor = 1 / Math.sqrt(ratio ** 4 + (ratio / qtc) ** 2);
        } else {
            // Ported: approximation
            if (testFreq < fb) {
                excursionFactor = (fb / testFreq) ** 2; // Unloaded below tuning
            } else {
                excursionFactor = 0.3; // Port controls excursion above tuning
            }
        }

        const estimatedExcursion = excursionFactor * voltage * 0.5; // Very rough
        limits.excursionPercent = (estimatedExcursion / xmax) * 100;
        limits.excursionLimited = estimatedExcursion > xmax * 0.8; // 80% = distortion

        // Port velocity limit (if ported)
        if (enclosure === 'ported' && fb) {
            const portVelocity = this.calculatePortVelocity(sd, xmax, fb, Constants.DEFAULT_PORT_DIAMETER_CM);
            limits.portVelocity = portVelocity;
            limits.portLimited = portVelocity > 15; // 15 m/s threshold
        }

        // Determine primary limiting factor
        if (limits.excursionLimited) {
            limits.limitingFactor = 'excursion';
            limits.limitingMargin = -3 * (limits.excursionPercent / 100);
        } else if (limits.thermalLimited) {
            limits.limitingFactor = 'thermal';
            limits.limitingMargin = limits.thermalHeadroom;
        } else if (limits.portLimited) {
            limits.limitingFactor = 'port';
            limits.limitingMargin = -2;
        } else {
            limits.limitingFactor = 'none';
            limits.limitingMargin = 0;
        }

        return limits;
    }

    // Calculate all common alignments for a driver
    static calculateAllAlignments(params, enclosureType) {
        const results = [];

        if (enclosureType === 'sealed') {
            const sealedResults = this.calculateSealed(params);
            for (const alignment of sealedResults) {
                const response = this.calculateFrequencyResponse(
                    params,
                    'sealed',
                    parseFloat(alignment.vb)
                );
                results.push({
                    ...alignment,
                    type: 'sealed',
                    frequencies: response.frequencies,
                    spl: response.spl
                });
            }
        } else if (enclosureType === 'ported') {
            const portedResults = this.calculatePorted(params);
            for (const alignment of portedResults) {
                const response = this.calculateFrequencyResponse(
                    params,
                    'ported',
                    parseFloat(alignment.vb),
                    parseFloat(alignment.fb)
                );
                results.push({
                    ...alignment,
                    type: 'ported',
                    frequencies: response.frequencies,
                    spl: response.spl
                });
            }
        }

        return results;
    }
}
