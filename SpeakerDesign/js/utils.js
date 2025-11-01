// Utility functions for speaker design calculator

const Utils = {
    // Unit conversions
    cmToInch(cm) {
        return cm / Constants.UNITS.CM_TO_INCH;
    },

    inchToCm(inch) {
        return inch * Constants.UNITS.CM_TO_INCH;
    },

    litersToCuFt(liters) {
        return liters * Constants.UNITS.LITERS_TO_CUFT;
    },

    litersToCuIn(liters) {
        return liters * Constants.UNITS.LITERS_TO_CUIN;
    },

    // Number formatting
    formatNumber(value, decimals = 1) {
        if (value === null || value === undefined || isNaN(value)) {
            return 'N/A';
        }
        return parseFloat(value).toFixed(decimals);
    },

    formatVolume(liters) {
        const cuFt = this.litersToCuFt(liters);
        return `${this.formatNumber(liters)} L (${this.formatNumber(cuFt, 2)} cu.ft)`;
    },

    formatLength(cm) {
        const inch = this.cmToInch(cm);
        return `${this.formatNumber(cm)} cm (${this.formatNumber(inch)} in)`;
    },

    formatDimensions(cm1, cm2, cm3) {
        return {
            metric: `${this.formatNumber(cm1)}cm × ${this.formatNumber(cm2)}cm × ${this.formatNumber(cm3)}cm`,
            imperial: `${this.formatNumber(this.cmToInch(cm1))}" × ${this.formatNumber(this.cmToInch(cm2))}" × ${this.formatNumber(this.cmToInch(cm3))}"`
        };
    },

    // HTML escaping
    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    // Parse safely with fallback
    parseFloatSafe(value, fallback = null) {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? fallback : parsed;
    },

    // Check if value is valid number
    isValidNumber(value) {
        return value !== null && value !== undefined && !isNaN(value) && isFinite(value);
    },

    // Calculate box dimensions for a given volume and aspect ratio
    calculateBoxDimensions(volumeLiters, ratio = Constants.BOX.RATIOS.CUBE) {
        const volumeCuIn = this.litersToCuIn(volumeLiters);

        // Calculate base depth from volume and ratio
        // V = w * h * d, and we know w/d = ratio.w, h/d = ratio.h
        // So V = ratio.w * ratio.h * d³
        const depth = Math.pow(volumeCuIn / (ratio.w * ratio.h), 1/3);
        const width = depth * ratio.w;
        const height = depth * ratio.h;

        return this.formatDimensions(
            width * Constants.UNITS.CM_TO_INCH,
            height * Constants.UNITS.CM_TO_INCH,
            depth * Constants.UNITS.CM_TO_INCH
        );
    },

    // Get multiple dimension options for a volume
    getDimensionOptions(volumeLiters) {
        return [
            {
                name: 'Cube-ish',
                ...this.calculateBoxDimensions(volumeLiters, Constants.BOX.RATIOS.CUBE)
            },
            {
                name: 'Tall',
                ...this.calculateBoxDimensions(volumeLiters, Constants.BOX.RATIOS.TALL)
            },
            {
                name: 'Wide',
                ...this.calculateBoxDimensions(volumeLiters, Constants.BOX.RATIOS.WIDE)
            }
        ];
    },

    // Get bracing recommendation based on volume
    getBracingNote(volumeLiters) {
        if (volumeLiters > Constants.BOX.BRACING_THRESHOLD_LARGE) {
            return 'Internal cross-bracing strongly recommended for panel rigidity';
        } else if (volumeLiters > Constants.BOX.BRACING_THRESHOLD_MEDIUM) {
            return 'Consider cross-bracing on larger panels';
        } else {
            return 'Optional for this size';
        }
    },

    // Get stuffing recommendation
    getStuffingNote() {
        const [min, max] = Constants.BOX.STUFFING_WEIGHT_LB;
        return `Light polyfill or acoustic foam, ${min}-${max} lb, loosely packed. Do not overstuff.`;
    },

    // Port velocity color coding
    getPortVelocityColor(velocity) {
        if (velocity > Constants.PORT.VELOCITY_WARNING_CRITICAL) {
            return '#e74c3c';  // Red
        } else if (velocity > Constants.PORT.VELOCITY_WARNING_HIGH) {
            return '#e74c3c';  // Red
        } else if (velocity > Constants.PORT.VELOCITY_WARNING_MODERATE) {
            return '#f39c12';  // Orange
        } else {
            return '#27ae60';  // Green
        }
    },

    // Port velocity warning text
    getPortVelocityWarning(velocity) {
        if (velocity > Constants.PORT.VELOCITY_WARNING_CRITICAL) {
            return 'Very high - expect significant chuffing';
        } else if (velocity > Constants.PORT.VELOCITY_WARNING_HIGH) {
            return 'High - may have audible chuffing';
        } else if (velocity > Constants.PORT.VELOCITY_WARNING_MODERATE) {
            return 'Moderate - acceptable for most uses';
        } else {
            return 'Good - low chuffing risk';
        }
    },

    // Safe localStorage operations with error handling
    storage: {
        get(key) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (error) {
                console.error(`Failed to read from localStorage: ${key}`, error);
                return null;
            }
        },

        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error(`Failed to write to localStorage: ${key}`, error);
                // Check if quota exceeded
                if (error.name === 'QuotaExceededError') {
                    alert('Storage quota exceeded. Cannot save data.');
                }
                return false;
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error(`Failed to remove from localStorage: ${key}`, error);
                return false;
            }
        }
    },

    // Generate unique ID
    generateId() {
        return `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    // Debounce function for input handlers
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Calculate net internal volume and external dimensions
    calculateNetVolumeAndDimensions(grossInternalVolume, driverSize) {
        // Get driver displacement
        const driverDisplacement = Constants.BOX.DRIVER_DISPLACEMENT[driverSize] || 0;

        // Check if we need bracing
        const needsBracing = grossInternalVolume > Constants.BOX.BRACING_THRESHOLD_MEDIUM;
        const bracingLoss = needsBracing ? Constants.BOX.BRACING_VOLUME_LOSS : 0;

        // Stuffing always used
        const stuffingLoss = Constants.BOX.STUFFING_VOLUME_LOSS;

        // Calculate net required internal volume
        const totalLoss = driverDisplacement + bracingLoss + stuffingLoss;
        const netInternalVolume = grossInternalVolume + totalLoss;

        // Calculate internal dimensions (use cube-ish ratio)
        const volumeCuIn = this.litersToCuIn(netInternalVolume);
        const ratio = Constants.BOX.RATIOS.CUBE;
        const depth = Math.pow(volumeCuIn / (ratio.w * ratio.h), 1/3);
        const width = depth * ratio.w;
        const height = depth * ratio.h;

        // Convert to cm
        const widthCm = width * Constants.UNITS.CM_TO_INCH;
        const heightCm = height * Constants.UNITS.CM_TO_INCH;
        const depthCm = depth * Constants.UNITS.CM_TO_INCH;

        // Add wall thickness for external dimensions
        const wallThickness = Constants.BOX.MATERIAL_THICKNESS_CM;
        const doubleBaffle = driverSize >= Constants.BOX.DOUBLE_BAFFLE_THRESHOLD;
        const baffleThickness = doubleBaffle ? wallThickness * 2 : wallThickness;

        const externalWidth = widthCm + (2 * wallThickness);
        const externalHeight = heightCm + (2 * wallThickness);
        const externalDepth = depthCm + wallThickness + baffleThickness;

        return {
            netInternalVolume: this.formatNumber(netInternalVolume, 1),
            externalDimensions: this.formatDimensions(externalWidth, externalHeight, externalDepth),
            displacement: {
                driver: this.formatNumber(driverDisplacement, 1),
                bracing: needsBracing ? this.formatNumber(bracingLoss, 1) : null,
                stuffing: this.formatNumber(stuffingLoss, 1),
                total: this.formatNumber(totalLoss, 1)
            },
            doubleBaffle: doubleBaffle
        };
    }
};
