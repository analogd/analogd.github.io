"use strict";

// Shared compounding engine for the finance calculators.
//
// Pure arithmetic: no DOM, no formatting, no UI state. Loaded as a plain script
// (not a module) so that every page here keeps working when opened straight from
// disk, which rules out ES module imports over file://. It therefore defines its
// names in global scope, and each app script uses them directly.
//
// Any app that needs to compound a monthly amount uses THIS file. Reimplementing
// the arithmetic would give two answers to one question, which is the thing this
// whole site exists to argue against.
//
// The basis (nominal, CPI-deflated, lifestyle-deflated) travels inside the
// parameter object as p.basis, so the engine stays free of UI state. Absent, it
// falls back to "life".

const NPATHS = 1200;
const MAXY = 60;

// ---------- pre-generated standard normals (seeded, so sliders do not jitter) ----------

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Z = (function () {
  const n = NPATHS * MAXY * 12;
  const z = new Float32Array(n);
  const rnd = mulberry32(20260818);
  for (let i = 0; i < n; i += 2) {
    let u = rnd();
    if (u < 1e-12) u = 1e-12;
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * rnd();
    z[i] = r * Math.cos(th);
    if (i + 1 < n) z[i + 1] = r * Math.sin(th);
  }
  return z;
})();

// ---------- engine ----------

// Runs one path month by month, taking the deposit for month m from contribOf(m).
// zOff = null gives the deterministic path. bal/contrib are written per completed
// year (index 0 = today).
//
// The contribution series is a callback rather than a rate so that a caller with
// an irregular cash flow (a mortgage being paid off frees money gradually) gets
// the same compounding, fee and ISK treatment as a flat monthly saving. simulate()
// below is the special case where the series is a geometric ramp. There is one
// implementation of this arithmetic on the site, and this is it.
function simulateFlows(p, contribOf, zOff, bal, contrib) {
  const N = p.years * 12;
  const detM = Math.pow(1 + p.ret, 1 / 12);
  const feeM = Math.pow(1 - p.fee, 1 / 12);
  const muM = Math.log(1 + p.ret) / 12;
  const sdM = p.vol / Math.sqrt(12);
  const taxRate = 0.3 * Math.max(p.slr + 0.01, 0.0125);

  let b = p.start;
  let paid = p.start;
  let fees = 0;
  let tax = 0;
  let qSum = 0; // quarter-opening values, the ISK kapitalunderlag base
  let dep = 0; // deposits during the current year

  bal[0] = b;
  contrib[0] = paid;

  for (let m = 0; m < N; m++) {
    if (m % 3 === 0) qSum += b;

    const c = contribOf(m);
    b += c;
    paid += c;
    dep += c;

    b *= zOff === null ? detM : Math.exp(muM + sdM * Z[zOff + m]);

    const beforeFee = b;
    b *= feeM;
    fees += beforeFee - b;

    if (m % 12 === 11) {
      if (p.isk) {
        const t = taxRate * Math.max(0, (qSum + dep) / 4 - p.iskFree);
        b -= t;
        tax += t;
      }
      qSum = 0;
      dep = 0;
      if (b < 0) b = 0;
      const y = (m + 1) / 12;
      bal[y] = b;
      contrib[y] = paid;
    }
  }
  return { fees: fees, tax: tax };
}

// The flat-monthly-saving case: a contribution that steps up (or down) once a year
// by p.growth. This is what RantaPaRanta drives.
function rampOf(p) {
  return (m) => p.monthly * Math.pow(1 + p.growth, (m / 12) | 0);
}

function simulate(p, zOff, bal, contrib) {
  return simulateFlows(p, rampOf(p), zOff, bal, contrib);
}

function percentileBand(p) {
  const Y = p.years;
  const rows = Y + 1;
  const mat = new Float64Array(rows * NPATHS);
  const bal = new Float64Array(rows);
  const contrib = new Float64Array(rows);
  const stride = MAXY * 12;

  for (let k = 0; k < NPATHS; k++) {
    simulate(p, k * stride, bal, contrib);
    for (let y = 0; y < rows; y++) mat[y * NPATHS + k] = bal[y];
  }

  const p10 = new Float64Array(rows);
  const p50 = new Float64Array(rows);
  const p90 = new Float64Array(rows);
  const col = new Float64Array(NPATHS);
  for (let y = 0; y < rows; y++) {
    col.set(mat.subarray(y * NPATHS, y * NPATHS + NPATHS));
    const s = Array.prototype.slice.call(col).sort((a, b) => a - b);
    p10[y] = s[Math.floor(0.1 * (NPATHS - 1))];
    p50[y] = s[Math.floor(0.5 * (NPATHS - 1))];
    p90[y] = s[Math.floor(0.9 * (NPATHS - 1))];
  }
  return { p10: p10, p50: p50, p90: p90 };
}

function basisFactor(p) {
  const b = p.basis || "life";
  if (b === "nom") return 1;
  return b === "cpi" ? 1 + p.inflation : (1 + p.inflation) * (1 + p.drift);
}

function deflator(p, y) {
  return Math.pow(basisFactor(p), y);
}

// What the contributions cost in today's purchasing power. Each one is deflated
// by its OWN date, not by the end year: 1 000 kr paid in 30 years is not the
// same sacrifice as 1 000 kr paid today, and the start amount is paid today, so
// it is never deflated at all. Deflating the whole running total by the end-year
// factor (the earlier version) cancelled inflation out of the comparison
// entirely, which made "forlorad kopkraft" unreachable.
function realContributions(p) {
  const f = basisFactor(p);
  const ramp = rampOf(p);
  const out = new Float64Array(p.years + 1);
  let acc = p.start;
  out[0] = acc;
  for (let m = 0; m < p.years * 12; m++) {
    acc += ramp(m) / Math.pow(f, (m + 1) / 12);
    if (m % 12 === 11) out[(m + 1) / 12] = acc;
  }
  return out;
}

// Money-weighted (internal) rate of return on the actual cash flows, so fees,
// tax and the contribution ramp are all inside the number. Bisection on the
// monthly rate: the terminal value is monotone in it.
function moneyWeightedReturn(p, endValue) {
  const N = p.years * 12;
  const forward = (rm) => {
    let v = p.start;
    for (let m = 0; m < N; m++) {
      v += p.monthly * Math.pow(1 + p.growth, (m / 12) | 0);
      v *= rm;
    }
    return v;
  };
  let lo = 0.5;
  let hi = 1.05;
  if (forward(hi) < endValue) return NaN;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (forward(mid) < endValue) lo = mid;
    else hi = mid;
  }
  return Math.pow((lo + hi) / 2, 12) - 1;
}
