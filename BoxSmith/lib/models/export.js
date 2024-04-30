/**
 * Data Export for Speaker Design
 *
 * Export frequency response and impedance data in standard formats
 * compatible with REW (Room EQ Wizard) and other measurement tools.
 */

// ============================================================================
// FRD EXPORT (Frequency Response Data)
// ============================================================================

/**
 * Export frequency response in FRD format
 *
 * FRD is a simple text format used by REW, VituixCAD, and others:
 * - Lines starting with * are comments
 * - Data lines: frequency (Hz) \t magnitude (dB) \t phase (degrees)
 *
 * @param {SealedBox|VentedBox} box - Box model instance
 * @param {Object} [options] - Export options
 * @param {number} [options.fMin=10] - Start frequency (Hz)
 * @param {number} [options.fMax=500] - End frequency (Hz)
 * @param {number} [options.points=100] - Number of data points
 * @param {string} [options.comment] - Optional comment line
 * @returns {string} FRD formatted text
 */
export function toFRD(box, options = {}) {
    const {
        fMin = 10,
        fMax = 500,
        points = 100,
        comment = ''
    } = options;

    const response = box.responseCurve(fMin, fMax, points);

    const lines = [];

    // Header comments
    lines.push('* Frequency Response Data (FRD)');
    lines.push('* Exported from BoxSmith');
    lines.push(`* Box type: ${box.qtc !== undefined ? 'Sealed' : 'Vented'}`);
    lines.push(`* Volume: ${box.volumeLiters.toFixed(1)} L`);
    if (box.qtc !== undefined) {
        lines.push(`* Qtc: ${box.qtc.toFixed(3)}`);
    } else {
        lines.push(`* Fb: ${box.fb.toFixed(1)} Hz`);
    }
    lines.push(`* F3: ${box.f3.toFixed(1)} Hz`);
    if (comment) {
        lines.push(`* ${comment}`);
    }
    lines.push('*');
    lines.push('* Freq(Hz)\tSPL(dB)\tPhase(deg)');

    // Data lines
    for (const point of response) {
        const phase = box.phaseAt(point.frequency);
        lines.push(
            `${point.frequency.toFixed(3)}\t${point.db.toFixed(4)}\t${phase.toFixed(2)}`
        );
    }

    return lines.join('\n');
}

// ============================================================================
// ZMA EXPORT (Impedance Data)
// ============================================================================

/**
 * Export impedance data in ZMA format
 *
 * ZMA is a simple text format used by REW and others:
 * - Lines starting with * are comments
 * - Data lines: frequency (Hz) \t impedance (ohms) \t phase (degrees)
 *
 * @param {SealedBox|VentedBox} box - Box model instance
 * @param {Object} [options] - Export options
 * @param {number} [options.fMin=10] - Start frequency (Hz)
 * @param {number} [options.fMax=500] - End frequency (Hz)
 * @param {number} [options.points=100] - Number of data points
 * @param {string} [options.comment] - Optional comment line
 * @returns {string} ZMA formatted text
 */
export function toZMA(box, options = {}) {
    const {
        fMin = 10,
        fMax = 500,
        points = 100,
        comment = ''
    } = options;

    if (!box.canCalculateImpedance) {
        throw new Error('Box missing impedance parameters (need re, bl, mms, cms, rms)');
    }

    const impedance = box.impedanceCurve(fMin, fMax, points);

    const lines = [];

    // Header comments
    lines.push('* Impedance Data (ZMA)');
    lines.push('* Exported from BoxSmith');
    lines.push(`* Box type: ${box.qtc !== undefined ? 'Sealed' : 'Vented'}`);
    lines.push(`* Volume: ${box.volumeLiters.toFixed(1)} L`);
    const driver = box.driver;
    if (driver?.re) {
        lines.push(`* Re: ${driver.re.toFixed(2)} ohms`);
    }
    if (comment) {
        lines.push(`* ${comment}`);
    }
    lines.push('*');
    lines.push('* Freq(Hz)\tZ(ohms)\tPhase(deg)');

    // Data lines
    for (const point of impedance) {
        lines.push(
            `${point.frequency.toFixed(3)}\t${point.magnitude.toFixed(4)}\t${point.phase.toFixed(2)}`
        );
    }

    return lines.join('\n');
}

// ============================================================================
// CSV EXPORT (Generic)
// ============================================================================

/**
 * Export any curve data as CSV
 *
 * @param {Array<Object>} data - Array of data points
 * @param {Object} [options] - Export options
 * @param {string[]} [options.columns] - Column names to export (default: all)
 * @param {string} [options.delimiter=','] - Field delimiter
 * @returns {string} CSV formatted text
 */
export function toCSV(data, options = {}) {
    const {
        columns = null,
        delimiter = ','
    } = options;

    if (!data || data.length === 0) {
        return '';
    }

    // Determine columns from first data point if not specified
    const cols = columns || Object.keys(data[0]);

    const lines = [];

    // Header
    lines.push(cols.join(delimiter));

    // Data
    for (const point of data) {
        const values = cols.map(col => {
            const val = point[col];
            if (typeof val === 'number') {
                return val.toFixed(6);
            }
            return String(val);
        });
        lines.push(values.join(delimiter));
    }

    return lines.join('\n');
}

// ============================================================================
// CONVENIENCE METHODS (can be added to box prototypes if desired)
// ============================================================================

/**
 * Generate downloadable blob for FRD export
 */
export function frdBlob(box, options = {}) {
    const content = toFRD(box, options);
    return new Blob([content], { type: 'text/plain' });
}

/**
 * Generate downloadable blob for ZMA export
 */
export function zmaBlob(box, options = {}) {
    const content = toZMA(box, options);
    return new Blob([content], { type: 'text/plain' });
}
