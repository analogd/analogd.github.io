/**
 * Export WinISD Comparison Data
 *
 * Evaluates our calculations at WinISD's exact frequencies.
 * Exports to JSON + CSV for plotting.
 *
 * Usage:
 *   node tools/export-winisd-comparison.js sealed
 *   node tools/export-winisd-comparison.js ported
 *   node tools/export-winisd-comparison.js all
 */

import * as PowerLimitsV2 from '../lib/engineering/power-limits-v2.js';
import { writeFileSync, mkdirSync } from 'fs';

// WinISD Reference Data - Sealed 200L
const SEALED_WINISD = {
    config: {
        driver: 'UMII18-22',
        boxType: 'sealed',
        volume: 200,
        volumeUnit: 'L'
    },
    params: {
        boxType: 'sealed',
        fs: 22,
        qts: 0.53,
        qms: 2.53,
        alpha: 248.2 / 200,
        re: 4.2,
        bl: 19.2,
        mms: 0.420,
        cms: 0.000124,
        rms: (2 * Math.PI * 22 * 0.420) / 2.53,
        xmax: 0.028,
        pe: 1200
    },
    winisd: {
        // Extracted from WinISD screenshots
        maxPower: {
            10: 400,
            15: 420,
            20: 450,
            25: 550,
            30: 700,
            35: 900,
            40: 1100,
            45: 1200,
            50: 1200,
            60: 1200,
            80: 1200,
            100: 1200
        }
    }
};

// WinISD Reference Data - Ported 600L @ 25Hz
const PORTED_WINISD = {
    config: {
        driver: 'UMII18-22',
        boxType: 'ported',
        volume: 600,
        volumeUnit: 'L',
        tuning: 25,
        tuningUnit: 'Hz'
    },
    params: {
        boxType: 'ported',
        fs: 22,
        qts: 0.53,
        qms: 2.53,
        alpha: 248.2 / 600,
        fb: 25,
        re: 4.2,
        bl: 19.2,
        mms: 0.420,
        cms: 0.000124,
        rms: (2 * Math.PI * 22 * 0.420) / 2.53,
        xmax: 0.028,
        pe: 1200
    },
    winisd: {
        // From WinISD screenshots - ported has complex behavior!
        maxPower: {
            10: 150,   // Sub-tuning rolloff
            15: 250,
            18: 1200,  // Excursion null spike!
            20: 1200,
            22: 1200,
            25: 400,   // Dip after null
            28: 450,
            30: 500,
            35: 700,
            40: 900,
            50: 1200,
            60: 1200,
            80: 1200,
            100: 1200
        }
    }
};

/**
 * Generate comparison data for a configuration
 */
function generateComparison(testCase, name) {
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`Generating comparison: ${name}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    const { config, params, winisd } = testCase;

    // Create max power function
    console.log('Creating max power function...');
    const maxPowerFn = PowerLimitsV2.createMaxPowerFunction(params);
    console.log('✓ Function created\n');

    // Get WinISD frequencies
    const winisdFreqs = Object.keys(winisd.maxPower).map(Number).sort((a, b) => a - b);
    console.log(`Evaluating at ${winisdFreqs.length} WinISD frequencies: ${winisdFreqs[0]}-${winisdFreqs[winisdFreqs.length-1]}Hz`);

    // Evaluate our code at WinISD frequencies
    const calculated = winisdFreqs.map(f => {
        const result = maxPowerFn(f);
        return {
            frequency: f,
            power: result.power,
            limiting: result.limiting,
            displacement: result.displacement
        };
    });

    // Build comparison
    const comparison = winisdFreqs.map(f => {
        const ours = calculated.find(c => c.frequency === f);
        const winisdPower = winisd.maxPower[f];
        const error = ours.power - winisdPower;
        const errorPct = (error / winisdPower) * 100;

        return {
            frequency: f,
            ours: Math.round(ours.power),
            winisd: winisdPower,
            error: Math.round(error),
            errorPct: Math.round(errorPct),
            limiting: ours.limiting,
            displacement: (ours.displacement * 1000).toFixed(1),
            within30pct: Math.abs(errorPct) < 30
        };
    });

    // Print summary
    console.log('\nComparison Results:');
    console.log('Freq    Ours    WinISD   Error    Limiting');
    console.log('───────────────────────────────────────────────');
    comparison.forEach(c => {
        const status = c.within30pct ? '✓' : '✗';
        console.log(
            `${c.frequency.toString().padStart(3)}Hz   ` +
            `${c.ours.toString().padStart(4)}W   ` +
            `${c.winisd.toString().padStart(4)}W   ` +
            `${(c.errorPct > 0 ? '+' : '')}${c.errorPct.toString().padStart(3)}%   ` +
            `${c.limiting.padEnd(10)} ${status}`
        );
    });

    // Calculate stats
    const errors = comparison.map(c => Math.abs(c.errorPct));
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    const maxError = Math.max(...errors);
    const within30 = comparison.filter(c => c.within30pct).length;

    console.log('\nStatistics:');
    console.log(`  Mean error: ${meanError.toFixed(1)}%`);
    console.log(`  Max error: ${maxError.toFixed(1)}%`);
    console.log(`  Within 30%: ${within30}/${comparison.length} (${(within30/comparison.length*100).toFixed(0)}%)`);

    // Generate high-res curve for plotting
    console.log('\nGenerating high-res curve for plotting...');
    const plotFreqs = PowerLimitsV2.logspace(10, 500, 200);  // WinISD range, smooth curve
    const plotCurve = plotFreqs.map(f => {
        const result = maxPowerFn(f);
        return {
            frequency: f,
            power: result.power,
            limiting: result.limiting
        };
    });
    console.log(`✓ Generated ${plotCurve.length} points\n`);

    return {
        config,
        comparison,
        plotCurve,
        stats: {
            meanError,
            maxError,
            within30pct: within30,
            total: comparison.length
        }
    };
}

/**
 * Export to JSON
 */
function exportJSON(data, filename) {
    const path = `graphs/data/${filename}.json`;
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`✓ Exported: ${path}`);
}

/**
 * Export to CSV (for gnuplot, Excel, etc)
 */
function exportCSV(data, filename) {
    const path = `graphs/data/${filename}.csv`;

    // Header
    let csv = 'frequency,power,limiting\n';

    // Data rows
    data.forEach(row => {
        csv += `${row.frequency},${row.power},${row.limiting}\n`;
    });

    writeFileSync(path, csv);
    console.log(`✓ Exported: ${path}`);
}

/**
 * Export comparison CSV (ours vs winisd)
 */
function exportComparisonCSV(comparison, filename) {
    const path = `graphs/data/${filename}-comparison.csv`;

    let csv = 'frequency,ours,winisd,error,errorPct\n';
    comparison.forEach(c => {
        csv += `${c.frequency},${c.ours},${c.winisd},${c.error},${c.errorPct}\n`;
    });

    writeFileSync(path, csv);
    console.log(`✓ Exported: ${path}`);
}

// Main
const arg = process.argv[2] || 'all';

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  WinISD Comparison Data Export                           ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// Ensure output directory exists
mkdirSync('graphs/data', { recursive: true });

if (arg === 'sealed' || arg === 'all') {
    const sealed = generateComparison(SEALED_WINISD, 'Sealed 200L');

    console.log('Exporting files...');
    exportJSON(sealed.plotCurve, 'sealed-200L-calculated');
    exportCSV(sealed.plotCurve, 'sealed-200L-calculated');
    exportJSON({ frequencies: Object.keys(SEALED_WINISD.winisd.maxPower).map(Number), powers: Object.values(SEALED_WINISD.winisd.maxPower) }, 'sealed-200L-winisd');
    exportComparisonCSV(sealed.comparison, 'sealed-200L');

    console.log('');
}

if (arg === 'ported' || arg === 'all') {
    const ported = generateComparison(PORTED_WINISD, 'Ported 600L @ 25Hz');

    console.log('Exporting files...');
    exportJSON(ported.plotCurve, 'ported-600L-calculated');
    exportCSV(ported.plotCurve, 'ported-600L-calculated');
    exportJSON({ frequencies: Object.keys(PORTED_WINISD.winisd.maxPower).map(Number), powers: Object.values(PORTED_WINISD.winisd.maxPower) }, 'ported-600L-winisd');
    exportComparisonCSV(ported.comparison, 'ported-600L');

    console.log('');
}

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  Export Complete                                         ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('\nNext steps:');
console.log('  1. Generate graphs: node tools/plot-comparison.js');
console.log('  2. View: open graphs/*.png');
console.log('  3. Iterate on formulas, re-run export, see changes');
console.log('');
