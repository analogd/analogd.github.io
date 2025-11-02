// Ported box model - represents a vented enclosure design
// Uses Foundation library for all calculations (189 tested functions)
import * as Small1973 from '../foundation/small-1973.js';

export class PortedBox {
    constructor(driver, vb, fb, options = {}) {
        this.driver = driver;
        this.vb = vb;  // Box volume (L)
        this.fb = fb;  // Tuning frequency (Hz)

        // Port configuration
        this.portDiameter = options.portDiameter || 10;  // cm

        // Loss parameters (Small 1973, Section 3)
        // QL = combined enclosure Q (leakage, absorption, port friction)
        // Default to typical well-sealed, moderately damped box
        this.ql = options.ql !== undefined ? options.ql : 7.0;
        this.qa = options.qa || Infinity;  // Absorption Q (separate if provided)
        this.qp = options.qp || Infinity;  // Port friction Q (separate if provided)

        // Convert to SI for Foundation calls
        const vbSI = vb / 1000;  // Liters to m³
        const portDiameterSI = this.portDiameter / 100;  // cm to m

        // Calculate port dimensions using Foundation (Small 1973, Eq. 15)
        const portArea = Small1973.calculatePortArea(portDiameterSI);
        const portLengthSI = Small1973.calculatePortLength(vbSI, fb, portArea, portDiameterSI);
        this.portLength = portLengthSI * 100;  // Convert back to cm

        // Calculate system parameters
        const alpha = driver.vasSI / vbSI;
        this.alpha = alpha;  // Store for use in response calculations
        this.f3 = Small1973.calculatePortedF3(driver.fs, fb, alpha, driver.qts, this.ql);

        // Alignment classification
        this.alignment = this._classifyAlignment();
    }

    _classifyAlignment() {
        const ratio = this.fb / this.driver.fs;
        const vbRatio = this.vb / this.driver.vas;

        if (Math.abs(ratio - 1.0) < 0.1) return 'QB3';
        if (Math.abs(ratio - 0.7) < 0.1) return 'SC4';
        if (Math.abs(ratio - 0.8) < 0.1) return 'C4';

        if (ratio > 1.2) return 'High tuning';
        if (ratio < 0.6) return 'Low tuning';
        return 'Custom';
    }

    // Calculate frequency response at a single frequency
    // Delegated to Foundation (Small 1973, Eq. 13 - 4th order transfer function)
    // Now includes losses (QL) for accurate response
    responseAt(frequency) {
        return Small1973.calculatePortedResponseMagnitude(
            frequency,
            this.driver.fs,
            this.fb,
            this.alpha,
            this.driver.qts,
            this.ql  // Include losses
        );
    }

    responseDbAt(frequency) {
        return Small1973.calculatePortedResponseDb(
            frequency,
            this.driver.fs,
            this.fb,
            this.alpha,
            this.driver.qts,
            this.ql  // Include losses
        );
    }

    // Port velocity calculation (uses Foundation helper, adds status interpretation)
    calculatePortVelocity() {
        if (!this.driver.sd || !this.driver.xmax) return null;

        // Calculate volume velocity at driver Xmax
        const sdSI = this.driver.sd / 10000;  // cm² to m²
        const xmaxSI = this.driver.xmax / 1000;  // mm to m
        const volumeVelocity = sdSI * xmaxSI * this.fb;

        // Get port area (SI)
        const portDiameterSI = this.portDiameter / 100;
        const portArea = Small1973.calculatePortArea(portDiameterSI);

        // Calculate port velocity using Foundation
        return Small1973.calculatePortVelocity(volumeVelocity, portArea);
    }

    portVelocityStatus() {
        const velocity = this.calculatePortVelocity();
        if (!velocity) return null;

        // Use Foundation limits
        const conservativeLimit = Small1973.getMaxPortVelocity(true);   // 15 m/s
        const aggressiveLimit = Small1973.getMaxPortVelocity(false);    // 20 m/s

        if (velocity > aggressiveLimit * 1.5) return { level: 'critical', warning: 'Very high - expect significant chuffing' };
        if (velocity > aggressiveLimit) return { level: 'high', warning: 'High - may have audible chuffing' };
        if (velocity > conservativeLimit) return { level: 'moderate', warning: 'Moderate - acceptable for most uses' };
        return { level: 'good', warning: 'Good - low chuffing risk' };
    }

    // Generate frequency response sweep
    sweep(startFreq, endFreq, points) {
        const step = (endFreq - startFreq) / (points - 1);
        const frequencies = [];
        const response = [];

        for (let i = 0; i < points; i++) {
            const f = startFreq + i * step;
            frequencies.push(f);
            response.push(this.responseDbAt(f));
        }

        return { frequencies, response };
    }
}
