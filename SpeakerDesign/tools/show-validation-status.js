/**
 * Show Validation Status - Display what's working and what's broken
 */

import { getValidationSummary, formatCalculationInfo } from '../lib/foundation/calculation-metadata.js';

const summary = getValidationSummary();

console.log('═══════════════════════════════════════════════════════════');
console.log('Calculation Validation Status');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('✅ VERIFIED (matches WinISD within 1 dB):\n');
for (const { key, name } of summary.verified) {
    console.log(`   - ${name}`);
}

console.log('\n❌ BROKEN (errors > 1 dB):\n');
for (const { key, name, maxError } of summary.broken) {
    console.log(`   - ${name} (max error: ${maxError})`);
}

console.log('\n⚠️  NOT IMPLEMENTED:\n');
for (const { key, name } of summary.notImplemented) {
    console.log(`   - ${name}`);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('Detailed Information');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(formatCalculationInfo('sealed-fr'));
console.log('\n---\n');
console.log(formatCalculationInfo('ported-fr'));
console.log('\n---\n');
console.log(formatCalculationInfo('sealed-displacement'));
