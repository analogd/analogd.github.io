"use strict";

// Shared UI plumbing for the finance calculators: number formatting, the slider
// curve, the text-field parse and format pair, and the URL handover contract.
//
// Plain script, no dependencies, loaded before each app script. Same reason as
// engine.js: these pages have to work opened straight from disk.
//
// Nothing here touches a specific app layout. Each app builds its own DOM, because
// the layouts genuinely differ, but no app reimplements a formatter or the link
// format: those are the two places a silent bug hides.

// The three bases every app here offers. Kept in the contract layer rather than
// read off an app-level label table, so a link parses the same way in every app.
const BASES = ["nom", "cpi", "life"];

const NF = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF2 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });

const kr = (v) => NF.format(Math.round(v)) + " kr";

function krShort(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return NF2.format(v / 1e6) + " mkr";
  if (a >= 1e4) return NF.format(Math.round(v / 1000)) + " tkr";
  return NF.format(Math.round(v));
}

// Kronor sliders run on a squared curve: 10 000 kr out of a 1 000 000 kr range
// would otherwise sit 1 % along the track, with no resolution where people live.
const SLIDER_STEPS = 1000;
const isKronor = (c) => c.unit === "kr" || c.unit.indexOf("kr/") === 0;
const curveOf = (c) => (isKronor(c) ? 2 : 1);

function sliderToValue(c, t) {
  const raw = c.min + (c.max - c.min) * Math.pow(t / SLIDER_STEPS, curveOf(c));
  const snapped = Math.round(raw / c.step) * c.step;
  return Math.min(c.max, Math.max(c.min, Math.round(snapped * 100) / 100));
}

function valueToSlider(c, v) {
  const frac = Math.max(0, Math.min(1, (v - c.min) / (c.max - c.min)));
  return Math.round(SLIDER_STEPS * Math.pow(frac, 1 / curveOf(c)));
}

// Fields are text, not number, so kronor can carry thousand separators.
function fieldText(c, v) {
  return isKronor(c) ? NF.format(Math.round(v)) : NF2.format(v);
}

// Strips whatever grouping character the locale used, plain or non-breaking.
// The dash normalisation is load-bearing, not cosmetic: sv-SE writes a negative
// number with U+2212 MINUS SIGN, which the character class below dropped. A
// field written by fieldText() therefore came back with its sign silently
// removed, and a saving winding down 15 %/ar was read as growing 15 %/ar.
function parseField(s) {
  return parseFloat(
    String(s)
      .replace(/[\u2212\u2012\u2013\u2014\u2015]/g, "-")
      .replace(/[^0-9.,-]/g, "")
      .replace(",", ".")
  );
}

// Pure half of the contract, so the link format can be asserted in the tests
// without a DOM. The DOM glue is applyUrlState and writeUrlState further down.

function parseUrlValues(controls, search) {
  const q = new URLSearchParams(search);
  const out = { values: {}, flags: {}, basis: null, band: null };
  controls.forEach((c) => {
    const raw = q.get(c.id);
    if (raw === null) return;
    const v = parseFloat(String(raw).replace(",", "."));
    if (isFinite(v)) out.values[c.id] = v;
  });
  ["isk", "ref"].forEach((k) => {
    if (q.get(k) !== null) out.flags[k] = q.get(k) !== "0";
  });
  if (BASES.indexOf(q.get("basis")) > -1) out.basis = q.get("basis");
  if (q.get("band") !== null) out.band = q.get("band") !== "0";
  return out;
}

function buildUrlQuery(controls, values, flags, basisName, band) {
  const q = new URLSearchParams();
  controls.forEach((c) => {
    const v = values[c.id];
    if (isFinite(v) && Math.abs(v - c.value) > 1e-9) q.set(c.id, String(Math.round(v * 100) / 100));
  });
  if (flags && flags.isk === false) q.set("isk", "0");
  if (flags && flags.ref === false) q.set("ref", "0");
  if (basisName && basisName !== "life") q.set("basis", basisName);
  if (band) q.set("band", "1");
  return q.toString();
}

// Round axis steps, so the labels read 1 mkr / 2 mkr and not 875 tkr / 1,8 mkr.
function niceStep(v) {
  if (!(v > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
