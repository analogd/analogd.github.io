// Calculator for common box alignments
class AlignmentCalculator {
    // Standard sealed alignments
    static SEALED_ALIGNMENTS = [
        { name: 'Butterworth (Q=0.707)', qtc: 0.707 },
        { name: 'Bessel (Q=0.577)', qtc: 0.577 },
        { name: 'Chebychev (Q=1.0)', qtc: 1.0 }
    ];

    // Standard ported alignments
    static PORTED_ALIGNMENTS = [
        { name: 'QB3', fbMultiplier: 1.0, vbFactor: 15, exponent: 3.3 },
        { name: 'SC4', fbMultiplier: 0.7, vbFactor: 29, exponent: 3.3 },
        { name: 'C4', fbMultiplier: 0.8, vbFactor: 23, exponent: 3.3 }
    ];

    // Calculate all standard sealed alignments for a driver
    static calculateSealedAlignments(driver) {
        if (!driver.canCalculateSealed()) {
            throw new Error('Driver missing required parameters for sealed calculation');
        }

        const alignments = [];

        for (const alignment of this.SEALED_ALIGNMENTS) {
            const qtc = alignment.qtc;

            // Calculate alpha (ratio of Vas to Vb)
            const alpha = (qtc * qtc) / (driver.qts * driver.qts) - 1;

            if (alpha <= 0) {
                continue;  // Alignment not achievable with this driver
            }

            // Calculate box volume
            const vb = driver.vas / alpha;

            // Create sealed box model
            const box = new SealedBox(driver, vb);

            alignments.push({
                name: alignment.name,
                box: box,
                qtc: box.qtc,
                vb: vb,
                fc: box.fc,
                f3: box.f3
            });
        }

        return alignments;
    }

    // Calculate all standard ported alignments for a driver
    static calculatePortedAlignments(driver, options = {}) {
        if (!driver.canCalculatePorted()) {
            throw new Error('Driver missing required parameters for ported calculation');
        }

        const portDiameter = options.portDiameter || 10;  // Default 10cm
        const alignments = [];

        for (const alignment of this.PORTED_ALIGNMENTS) {
            // Calculate tuning frequency and box volume based on alignment
            const fb = driver.fs * alignment.fbMultiplier;
            const vb = alignment.vbFactor * Math.pow(driver.qts, alignment.exponent) * driver.vas;

            // Create ported box model
            const box = new PortedBox(driver, vb, fb, { portDiameter });

            alignments.push({
                name: alignment.name,
                box: box,
                vb: vb,
                fb: fb,
                f3: box.f3,
                portDiameter: box.portDiameter,
                portLength: box.portLength,
                portVelocity: box.calculatePortVelocity(),
                portStatus: box.portVelocityStatus()
            });
        }

        return alignments;
    }

    // Find optimal alignment based on criteria
    static findOptimalAlignment(driver, enclosureType, criteria = {}) {
        const alignments = enclosureType === 'sealed'
            ? this.calculateSealedAlignments(driver)
            : this.calculatePortedAlignments(driver, criteria);

        if (alignments.length === 0) return null;

        // Default preference based on enclosure type
        if (enclosureType === 'sealed') {
            // Prefer Butterworth for sealed
            return alignments.find(a => a.name.includes('Butterworth')) || alignments[0];
        } else {
            // Prefer QB3 for ported
            return alignments.find(a => a.name.includes('QB3')) || alignments[0];
        }
    }
}
