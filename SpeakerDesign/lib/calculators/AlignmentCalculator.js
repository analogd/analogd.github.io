// Calculator for common box alignments
// Uses Foundation library for all calculations (189 tested functions)
import * as Thiele1971 from '../foundation/thiele-1971.js';
import { SealedBox } from '../models/SealedBox.js';
import { PortedBox } from '../models/PortedBox.js';

export class AlignmentCalculator {
    // Standard sealed alignments (Thiele 1971, Table II)
    static SEALED_ALIGNMENTS = [
        { name: 'Butterworth (Q=0.707)', qtc: Thiele1971.BUTTERWORTH_QTC },
        { name: 'Bessel (Q=0.577)', qtc: Thiele1971.BESSEL_QTC },
        { name: 'Chebychev (Q=1.0)', qtc: Thiele1971.CHEBYCHEV_QTC }
    ];

    // Standard ported alignments
    static PORTED_ALIGNMENTS = [
        { name: 'QB3', alignment: Thiele1971.QB3_ALIGNMENT }
        // Note: B4/C4 not included (known issue, see KNOWN_ISSUES.md)
    ];

    // Calculate all standard sealed alignments for a driver
    // Delegated to Foundation (Thiele 1971, Table II)
    static calculateSealedAlignments(driver) {
        if (!driver.canCalculateSealed()) {
            throw new Error('Driver missing required parameters for sealed calculation');
        }

        const alignments = [];

        for (const alignment of this.SEALED_ALIGNMENTS) {
            const qtc = alignment.qtc;

            // Skip if alignment not achievable (Qtc must be > Qts)
            if (qtc <= driver.qts) continue;

            // Calculate box volume using Foundation (Thiele 1971)
            let vbSI;
            if (qtc === Thiele1971.BUTTERWORTH_QTC) {
                vbSI = Thiele1971.calculateButterworthVolume(driver.qts, driver.vasSI);
            } else if (qtc === Thiele1971.BESSEL_QTC) {
                vbSI = Thiele1971.calculateBesselVolume(driver.qts, driver.vasSI);
            } else if (qtc === Thiele1971.CHEBYCHEV_QTC) {
                vbSI = Thiele1971.calculateChebychevVolume(driver.qts, driver.vasSI);
            }

            // Convert to liters
            const vb = vbSI * 1000;

            // Create sealed box model (now uses Foundation internally)
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
    // Delegated to Foundation (Thiele 1971, Small 1973)
    static calculatePortedAlignments(driver, options = {}) {
        if (!driver.canCalculatePorted()) {
            throw new Error('Driver missing required parameters for ported calculation');
        }

        const portDiameter = options.portDiameter || 10;  // Default 10cm
        const alignments = [];

        for (const alignment of this.PORTED_ALIGNMENTS) {
            // Use Foundation QB3 alignment (Thiele 1971, Table II)
            const qb3 = alignment.alignment;

            const vbSI = qb3.calculateVolume(driver.qts, driver.vasSI);
            const vb = vbSI * 1000;  // Convert to liters
            const fb = qb3.calculateTuning(driver.fs);

            // Create ported box model (now uses Foundation internally)
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
