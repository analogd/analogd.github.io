/**
 * Plot Comparison Graphs using gnuplot
 *
 * Generates comparison graphs from exported data.
 * Requires: gnuplot installed
 *
 * Usage:
 *   node tools/plot-comparison.js
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

// Check if gnuplot is installed
function checkGnuplot() {
    try {
        execSync('gnuplot --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

// Generate gnuplot script for maximum power comparison
function generateMaxPowerScript(config) {
    const { name, calculatedFile, winisdFile, comparisonFile, output, title } = config;

    // Read data to get value ranges
    const calculated = JSON.parse(readFileSync(calculatedFile, 'utf8'));
    const winisd = JSON.parse(readFileSync(winisdFile, 'utf8'));

    return `
# Maximum Power Comparison: ${title}
set terminal png size 1400,900 font "Arial,12"
set output '${output}'

# Title and labels
set title "${title}\\nOur Calculations vs WinISD Reference" font "Arial,16"
set xlabel "Frequency (Hz)" font "Arial,12"
set ylabel "Maximum Power (W)" font "Arial,12"

# Logarithmic x-axis (standard for audio)
set logscale x
set xrange [10:500]
set yrange [0:1400]

# Grid
set grid xtics ytics mxtics mytics
set grid linewidth 1, linewidth 0.5

# Legend
set key left top box

# Plot styles
set style line 1 lc rgb '#0072BD' lt 1 lw 3  # Our code - blue
set style line 2 lc rgb '#D95319' lt 1 lw 3  # WinISD - orange
set style line 3 lc rgb '#77AC30' lt 2 lw 2  # Difference - green

# Plot
plot '${calculatedFile.replace('.json', '.csv')}' using 1:2 with lines ls 1 title 'Our Code', \\
     '${winisdFile.replace('.json', '.csv')}' using 1:2 with linespoints ls 2 pt 7 ps 1.5 title 'WinISD Reference', \\
     '${comparisonFile}' using 1:4 with lines ls 3 title 'Error (W)'
`;
}

// Alternative: Simple ASCII plot if gnuplot not available
function generateASCIIPlot(comparisonFile) {
    const csv = readFileSync(comparisonFile, 'utf8');
    const lines = csv.split('\n').slice(1).filter(l => l.trim());

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  ASCII Comparison Plot (install gnuplot for PNG)         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('Freq    Ours    WinISD   Error    Visual');
    console.log('────────────────────────────────────────────────────────────────');

    lines.forEach(line => {
        const [freq, ours, winisd, error, errorPct] = line.split(',').map(Number);
        const bars = Math.round(Math.abs(errorPct) / 5);  // 5% per bar
        const visual = errorPct > 0 ? '+'.repeat(bars) : '-'.repeat(bars);

        console.log(
            `${freq.toString().padStart(3)}Hz   ` +
            `${ours.toString().padStart(4)}W   ` +
            `${winisd.toString().padStart(4)}W   ` +
            `${(errorPct > 0 ? '+' : '')}${errorPct.toString().padStart(3)}%   ` +
            `${visual}`
        );
    });

    console.log('\nLegend: + = our code too high, - = our code too low');
    console.log('        Each symbol ≈ 5% error\n');
}

// Main
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  Plot Comparison Graphs                                  ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// Check if data exists
if (!existsSync('graphs/data/sealed-200L-calculated.json')) {
    console.log('⚠ No data found. Run first:');
    console.log('  node tools/export-winisd-comparison.js\n');
    process.exit(1);
}

// Check for gnuplot
const hasGnuplot = checkGnuplot();

if (!hasGnuplot) {
    console.log('⚠ gnuplot not found. Install with:');
    console.log('  macOS:   brew install gnuplot');
    console.log('  Ubuntu:  sudo apt install gnuplot');
    console.log('  Windows: https://sourceforge.net/projects/gnuplot/\n');
    console.log('Falling back to ASCII plots...\n');

    // Generate ASCII plots
    if (existsSync('graphs/data/sealed-200L-comparison.csv')) {
        console.log('SEALED 200L:');
        generateASCIIPlot('graphs/data/sealed-200L-comparison.csv');
    }

    if (existsSync('graphs/data/ported-600L-comparison.csv')) {
        console.log('\nPORTED 600L @ 25Hz:');
        generateASCIIPlot('graphs/data/ported-600L-comparison.csv');
    }

    process.exit(0);
}

console.log('✓ gnuplot found\n');

// Generate sealed comparison
if (existsSync('graphs/data/sealed-200L-calculated.json')) {
    console.log('Generating sealed 200L comparison graph...');

    // Convert JSON to CSV for gnuplot
    const sealedCalc = JSON.parse(readFileSync('graphs/data/sealed-200L-calculated.json', 'utf8'));
    const sealedWinisd = JSON.parse(readFileSync('graphs/data/sealed-200L-winisd.json', 'utf8'));

    // Write WinISD CSV
    let winisdCSV = 'frequency,power\n';
    sealedWinisd.frequencies.forEach((f, i) => {
        winisdCSV += `${f},${sealedWinisd.powers[i]}\n`;
    });
    import('fs').then(({ writeFileSync }) => {
        writeFileSync('graphs/data/sealed-200L-winisd.csv', winisdCSV);
    });

    const script = generateMaxPowerScript({
        name: 'sealed-200L',
        calculatedFile: 'graphs/data/sealed-200L-calculated.json',
        winisdFile: 'graphs/data/sealed-200L-winisd.json',
        comparisonFile: 'graphs/data/sealed-200L-comparison.csv',
        output: 'graphs/sealed-200L-max-power-comparison.png',
        title: 'Sealed 200L - Maximum Power'
    });

    execSync(`gnuplot`, { input: script });
    console.log('✓ Generated: graphs/sealed-200L-max-power-comparison.png\n');
}

// Generate ported comparison
if (existsSync('graphs/data/ported-600L-calculated.json')) {
    console.log('Generating ported 600L comparison graph...');

    const portedWinisd = JSON.parse(readFileSync('graphs/data/ported-600L-winisd.json', 'utf8'));

    let winisdCSV = 'frequency,power\n';
    portedWinisd.frequencies.forEach((f, i) => {
        winisdCSV += `${f},${portedWinisd.powers[i]}\n`;
    });
    import('fs').then(({ writeFileSync }) => {
        writeFileSync('graphs/data/ported-600L-winisd.csv', winisdCSV);
    });

    const script = generateMaxPowerScript({
        name: 'ported-600L',
        calculatedFile: 'graphs/data/ported-600L-calculated.json',
        winisdFile: 'graphs/data/ported-600L-winisd.json',
        comparisonFile: 'graphs/data/ported-600L-comparison.csv',
        output: 'graphs/ported-600L-max-power-comparison.png',
        title: 'Ported 600L @ 25Hz - Maximum Power'
    });

    execSync(`gnuplot`, { input: script });
    console.log('✓ Generated: graphs/ported-600L-max-power-comparison.png\n');
}

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  Graphs Generated                                        ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');
console.log('View graphs:');
console.log('  open graphs/*.png');
console.log('\nIterate on formulas:');
console.log('  1. Edit lib/engineering/displacement.js');
console.log('  2. node tools/export-winisd-comparison.js');
console.log('  3. node tools/plot-comparison.js');
console.log('  4. Check graphs/\n');
