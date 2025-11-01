#!/usr/bin/env node

// Script to add derived parameters to driver library
// Run with: node scripts/add-derived-params.js

const fs = require('fs');
const path = require('path');

const driversPath = path.join(__dirname, '../data/drivers.json');
const driversData = JSON.parse(fs.readFileSync(driversPath, 'utf8'));

function calculateDerivedParams(driver) {
    const derived = {};

    // VD = Sd × Xmax (displacement volume)
    if (driver.ts.sd && driver.ts.xmax) {
        derived.vd = Math.round(driver.ts.sd * driver.ts.xmax);
    }

    // EBP = Fs / Qes (efficiency bandwidth product)
    if (driver.ts.fs && driver.ts.qes) {
        derived.ebp = Math.round((driver.ts.fs / driver.ts.qes) * 10) / 10;
    }

    // Enclosure hint based on EBP
    if (derived.ebp) {
        if (derived.ebp < 50) {
            derived.enclosureHint = 'sealed';
        } else if (derived.ebp < 100) {
            derived.enclosureHint = 'versatile';
        } else {
            derived.enclosureHint = 'ported';
        }
    }

    // Sensitivity estimation (rough)
    if (driver.ts.fs && driver.ts.vas) {
        const fs3 = Math.pow(driver.ts.fs, 3);
        const product = fs3 * driver.ts.vas;
        derived.sensitivityEst = Math.round(112 + 10 * Math.log10(product));
    }

    // Calculate Qts if Qes and Qms provided
    if (driver.ts.qes && driver.ts.qms && !driver.ts.qts) {
        driver.ts.qts = Math.round(((driver.ts.qes * driver.ts.qms) / (driver.ts.qes + driver.ts.qms)) * 100) / 100;
    }

    return derived;
}

// Process all drivers
for (const driver of driversData.drivers) {
    driver.derived = calculateDerivedParams(driver);
}

// Write back to file
fs.writeFileSync(driversPath, JSON.stringify(driversData, null, 2));

console.log(`Processed ${driversData.drivers.length} drivers`);
console.log('Added derived parameters: vd, ebp, enclosureHint, sensitivityEst');
