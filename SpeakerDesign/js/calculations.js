// Core calculations for speaker enclosure design

class SpeakerCalculations {

    // Calculate sealed box parameters
    static calculateSealed(params) {
        const { fs, qts, vas } = params;

        // Qtc values for different alignments
        const alignments = [
            { name: 'Critically Damped', qtc: 0.707 },
            { name: 'Butterworth', qtc: 0.707 },
            { name: 'Bessel', qtc: 0.577 },
            { name: 'Chebychev', qtc: 1.0 }
        ];

        const results = [];

        for (const alignment of alignments) {
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
        const { fs, qts, vas } = params;

        const alignments = [
            { name: 'QB3', fb: fs, vb: 15 * qts ** 3.3 * vas },
            { name: 'SC4', fb: fs * 0.7, vb: 29 * qts ** 3.3 * vas },
            { name: 'C4', fb: fs * 0.8, vb: 23 * qts ** 3.3 * vas }
        ];

        const results = [];

        for (const alignment of alignments) {
            const fb = alignment.fb;
            const vb = alignment.vb;

            // Simplified port calculation (assuming round port)
            // Diameter in cm, length in cm
            const portDiameter = 5;
            const portArea = Math.PI * (portDiameter / 2) ** 2;
            const portLength = (23562.5 * portArea) / (vb * fb * fb) - 0.732 * portDiameter;

            results.push({
                alignment: alignment.name,
                vb: vb.toFixed(2),
                fb: fb.toFixed(1),
                portDiameter: portDiameter.toFixed(1),
                portLength: Math.max(1, portLength).toFixed(1)
            });
        }

        return results;
    }

    // Calculate frequency response
    static calculateFrequencyResponse(params, enclosure, boxVolume, fb = null) {
        const { fs, qts, vas, sd, pe } = params;

        const frequencies = [];
        const spl = [];

        // Generate frequency points (logarithmic scale)
        for (let i = 10; i <= 200; i += 2) {
            frequencies.push(i);
        }

        // Simplified SPL calculation
        const sensitivity = 88 + 10 * Math.log10(pe); // Rough estimate

        if (enclosure === 'sealed') {
            const alpha = vas / boxVolume;
            const qtc = qts * Math.sqrt(alpha + 1);
            const fc = fs * Math.sqrt(alpha + 1);

            for (const f of frequencies) {
                const ratio = f / fc;
                const response = -10 * Math.log10(1 + (ratio ** 4) / (qtc * qtc));
                spl.push(sensitivity + response);
            }
        } else if (enclosure === 'ported') {
            const fbTuning = fb || fs;

            for (const f of frequencies) {
                let response;
                if (f < fbTuning) {
                    // Below tuning: 24dB/octave rolloff
                    response = -40 * Math.log10(fbTuning / f);
                } else {
                    // Above tuning: approximate response
                    const ratio = f / fs;
                    response = -10 * Math.log10(1 + ratio ** 2);
                }
                spl.push(sensitivity + response);
            }
        }

        return { frequencies, spl };
    }
}
