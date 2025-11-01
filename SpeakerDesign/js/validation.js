// Input validation for speaker parameters

class Validator {
    // Parameter validation ranges (reasonable limits for subwoofers)
    static ranges = {
        fs: { min: 10, max: 100, unit: 'Hz', name: 'Resonance Frequency' },
        qts: { min: 0.2, max: 2.0, unit: '', name: 'Total Q' },
        qes: { min: 0.2, max: 2.0, unit: '', name: 'Electrical Q' },
        qms: { min: 1.0, max: 20.0, unit: '', name: 'Mechanical Q' },
        vas: { min: 5, max: 1000, unit: 'L', name: 'Equivalent Volume' },
        re: { min: 0.5, max: 20, unit: 'Ω', name: 'DC Resistance' },
        le: { min: 0.1, max: 20, unit: 'mH', name: 'Voice Coil Inductance' },
        xmax: { min: 1, max: 50, unit: 'mm', name: 'Linear Excursion' },
        sd: { min: 50, max: 2000, unit: 'cm²', name: 'Effective Piston Area' },
        pe: { min: 50, max: 10000, unit: 'W', name: 'Power Handling' },
        power: { min: 1, max: 20000, unit: 'W', name: 'Amplifier Power' },
        boxVolume: { min: 5, max: 1000, unit: 'L', name: 'Box Volume' },
        portDiameter: { min: 2, max: 30, unit: 'cm', name: 'Port Diameter' }
    };

    static validateParameter(name, value) {
        const range = this.ranges[name];
        if (!range) {
            return { valid: true };
        }

        // Check if value is a number
        if (isNaN(value)) {
            return {
                valid: false,
                error: `${range.name} must be a number`
            };
        }

        const numValue = parseFloat(value);

        // Check if positive
        if (numValue <= 0) {
            return {
                valid: false,
                error: `${range.name} must be positive`
            };
        }

        // Check range
        if (numValue < range.min || numValue > range.max) {
            return {
                valid: false,
                error: `${range.name} should be between ${range.min} and ${range.max} ${range.unit}`,
                warning: true // This is a warning, not hard error
            };
        }

        return { valid: true, value: numValue };
    }

    static validateDriverParameters(params) {
        const errors = [];
        const warnings = [];
        const validated = {};

        const requiredParams = ['fs', 'qts', 'vas'];
        const optionalParams = ['re', 'le', 'xmax', 'sd', 'pe'];

        // Validate required parameters
        for (const param of requiredParams) {
            const result = this.validateParameter(param, params[param]);
            if (!result.valid) {
                errors.push(result.error);
            } else {
                validated[param] = result.value;
            }
        }

        // Validate optional parameters
        for (const param of optionalParams) {
            if (params[param] !== undefined && params[param] !== '') {
                const result = this.validateParameter(param, params[param]);
                if (!result.valid) {
                    if (result.warning) {
                        warnings.push(result.error);
                    } else {
                        errors.push(result.error);
                    }
                } else {
                    validated[param] = result.value;
                }
            }
        }

        // Cross-parameter validation
        if (validated.qts && validated.qes && validated.qms) {
            // Qts should equal (Qes * Qms) / (Qes + Qms)
            const expectedQts = (validated.qes * validated.qms) / (validated.qes + validated.qms);
            const diff = Math.abs(validated.qts - expectedQts);
            if (diff > 0.05) {
                warnings.push(`Qts value (${validated.qts.toFixed(3)}) doesn't match calculated value from Qes/Qms (${expectedQts.toFixed(3)})`);
            }
        }

        // VD check if we have sd and xmax
        if (validated.sd && validated.xmax) {
            const vd = validated.sd * validated.xmax;
            if (vd < 1000) {
                warnings.push(`Low displacement volume (VD: ${Math.round(vd)} cm³). May limit SPL capability.`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            validated
        };
    }

    static validatePower(power) {
        if (!power || power === '') {
            return { valid: true, value: null }; // Power is optional
        }

        return this.validateParameter('power', power);
    }

    static validateBoxVolume(volume) {
        return this.validateParameter('boxVolume', volume);
    }

    static validatePortDiameter(diameter) {
        return this.validateParameter('portDiameter', diameter);
    }

    static displayValidationErrors(errors, warnings) {
        let html = '';

        if (errors.length > 0) {
            html += '<div class="validation-errors">';
            html += '<h4 style="color: #e74c3c; margin: 10px 0;">⚠️ Errors:</h4>';
            html += '<ul style="color: #e74c3c; margin: 5px 0 15px 20px;">';
            errors.forEach(err => {
                html += `<li>${err}</li>`;
            });
            html += '</ul></div>';
        }

        if (warnings.length > 0) {
            html += '<div class="validation-warnings">';
            html += '<h4 style="color: #f39c12; margin: 10px 0;">⚠️ Warnings:</h4>';
            html += '<ul style="color: #856404; margin: 5px 0 15px 20px;">';
            warnings.forEach(warn => {
                html += `<li>${warn}</li>`;
            });
            html += '</ul></div>';
        }

        return html;
    }

    // Real-time validation for input fields
    static attachFieldValidation(fieldId, paramName) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        field.addEventListener('blur', () => {
            const value = field.value;
            if (!value) return;

            const result = this.validateParameter(paramName, value);
            if (!result.valid && !result.warning) {
                field.style.borderColor = '#e74c3c';
                field.title = result.error;
            } else if (result.warning) {
                field.style.borderColor = '#f39c12';
                field.title = result.error;
            } else {
                field.style.borderColor = '';
                field.title = '';
            }
        });

        field.addEventListener('focus', () => {
            field.style.borderColor = '#3498db';
        });
    }
}
