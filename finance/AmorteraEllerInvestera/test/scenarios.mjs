// Headless scenario runner for amortera-eller-investera.
//
//   node test/scenarios.mjs
//
// Same harness as finance/RantaPaRanta: the page loads plain scripts so it works
// from a file:// URL, so this concatenates them in load order, evaluates the result
// in a vm with a stub DOM, and pulls out the functions. No dependencies.

import fs from "fs";
import vm from "vm";
import path from "path";

const here = path.dirname(new URL(import.meta.url).pathname);
const read = (...p) => fs.readFileSync(path.join(here, ...p), "utf8");
const code = [
  read("..", "..", "lib", "engine.js"),
  read("..", "..", "lib", "ui.js"),
  read("..", "..", "lib", "mortgage.js"),
  read("..", "script.js")
].join("\n");

const sandbox = {
  document: { addEventListener() {} },
  window: { addEventListener() {} },
  requestAnimationFrame() {},
  URLSearchParams,
  Intl,
  Math,
  console
};

const {
  interestDeduction,
  marginalDeductionRate,
  afterTaxRate,
  requiredAmortisationRate,
  comparePayoffVsInvest,
  breakEvenReturn,
  fieldText,
  parseField,
  parseUrlValues,
  buildUrlQuery,
  CONTROLS,
  PRESETS,
  SHOW
} = vm.runInContext(
  code +
    ";({interestDeduction, marginalDeductionRate, afterTaxRate, requiredAmortisationRate, comparePayoffVsInvest, breakEvenReturn, fieldText, parseField, parseUrlValues, buildUrlQuery, CONTROLS, PRESETS, SHOW})",
  vm.createContext(sandbox)
);

let pass = 0;
let fail = 0;

function check(name, ok, got, want) {
  if (ok) {
    pass++;
    return;
  }
  fail++;
  console.log("FAIL  " + name + (got !== undefined ? "\n      got " + got + ", want " + want : ""));
}

function near(name, got, want, tol) {
  check(name, Math.abs(got - want) <= tol, Math.round(got * 1000) / 1000, want + " +/- " + tol);
}

const FUND = { ret: 0.07, fee: 0, slr: 0.0255, iskFree: 300000, vol: 0, isk: false, inflation: 0.02, drift: 0.01, basis: "nom" };

function model(over) {
  const m = Object.assign(
    {
      loan: 2000000,
      propertyValue: 4000000, // 50 %, so no amortisation requirement gets in the way
      rate: 0.04,
      income: 0,
      extra: 3000,
      deductCap: 100000,
      years: 20,
      fund: FUND
    },
    over
  );
  const reqRate = requiredAmortisationRate(m.loan, m.propertyValue, m.income);
  if (m.budget === undefined) m.budget = (m.loan * m.rate) / 12 + (m.loan * reqRate) / 12 + m.extra;
  return m;
}

// 1. Ranteavdraget, by hand. 30 % under the cap, 21 % above it.
{
  near("30 % under taket", interestDeduction(80000, 100000), 24000, 0);
  near("exakt pa taket", interestDeduction(100000, 100000), 30000, 0);
  near("30 % pa forsta 100 000 och 21 % pa resten", interestDeduction(150000, 100000), 30000 + 0.21 * 50000, 0);
  near("marginellt under taket", marginalDeductionRate(80000, 100000), 0.3, 0);
  near("marginellt over taket", marginalDeductionRate(150000, 100000), 0.21, 0);
  near("4 % ranta blir 2,8 % efter avdrag", afterTaxRate(0.04, 50000, 100000), 0.028, 1e-12);
  near("och 3,16 % over taket", afterTaxRate(0.04, 150000, 100000), 0.04 * 0.79, 1e-12);
}

// 2. Amorteringskravet, straight off the Finansinspektionen ladder.
{
  near("over 70 % ger 2 %", requiredAmortisationRate(3000000, 4000000, 0), 0.02, 0);
  near("over 50 % ger 1 %", requiredAmortisationRate(2400000, 4000000, 0), 0.01, 0);
  near("under 50 % ger inget krav", requiredAmortisationRate(1900000, 4000000, 0), 0, 0);
  near("exakt 70 % ligger i det lagre spannet", requiredAmortisationRate(2800000, 4000000, 0), 0.01, 0);
  // Skuldkvotstaket: 3 000 000 against 600 000 income is 5,0x, above 4,5x.
  near("hog skuldkvot lagger pa en procentenhet", requiredAmortisationRate(3000000, 4000000, 600000), 0.03, 0);
  near("lag skuldkvot gor det inte", requiredAmortisationRate(3000000, 4000000, 800000), 0.02, 0);
  near("inget lan, inget krav", requiredAmortisationRate(0, 4000000, 600000), 0, 0);
}

// 3. Both branches must spend the same money. This is the fairness invariant the
//    whole comparison rests on, so it is asserted rather than assumed: the total
//    that leaves the household is budget * months in both branches, split between
//    interest, amortisation and deposits.
{
  const m = model({});
  const r = comparePayoffVsInvest(m);
  const N = m.years * 12;
  // Amortisation is loan minus remaining debt; deposits are what the engine got.
  const spentInvest = r.invest.interest + (m.loan - r.invest.debt[m.years]) + r.invest.invested[m.years];
  const spentAmortise = r.amortise.interest + (m.loan - r.amortise.debt[m.years]) + r.amortise.invested[m.years];
  // The yearly tax reduction is credited into the fund, so it shows up in the
  // deposits without having left the household. Subtract it to compare outlay.
  const dedInvest = interestDeduction(r.invest.interest / m.years, m.deductCap) * m.years;
  const dedAmortise = interestDeduction(r.amortise.interest / m.years, m.deductCap) * m.years;
  near("investeringsgrenen spenderar budgeten", spentInvest - dedInvest, m.budget * N, m.budget * N * 0.02);
  near("amorteringsgrenen spenderar samma budget", spentAmortise - dedAmortise, m.budget * N * 1, m.budget * N * 0.02);
  check(
    "grenarna spenderar lika mycket",
    Math.abs(spentInvest - dedInvest - (spentAmortise - dedAmortise)) < m.budget * 12,
    Math.round(spentInvest - dedInvest - (spentAmortise - dedAmortise)),
    "inom en manadsbudget"
  );
}

// 4. Amortising must cost less interest, and must clear the debt sooner.
{
  const m = model({});
  const r = comparePayoffVsInvest(m);
  check(
    "extra amortering ger lagre rantekostnad",
    r.amortise.interest < r.invest.interest,
    Math.round(r.amortise.interest),
    "< " + Math.round(r.invest.interest)
  );
  check("och lagre kvarvarande skuld", r.amortise.debt[m.years] < r.invest.debt[m.years]);
  check("men mindre i fonden", r.amortise.fund[m.years] < r.invest.fund[m.years]);
}

// 5. With no return at all, amortising has to win: it saves interest while the
//    fund earns nothing. Nothing in the model may reverse that.
{
  const m = model({ fund: Object.assign({}, FUND, { ret: 0 }) });
  const r = comparePayoffVsInvest(m);
  check(
    "vid noll avkastning vinner amortering",
    r.amortise.net[m.years] > r.invest.net[m.years],
    Math.round(r.amortise.net[m.years]) + " mot " + Math.round(r.invest.net[m.years]),
    "amortering hogre"
  );
  near("och brytpunkten ar over noll", breakEvenReturn(m) > 0 ? 1 : 0, 1, 0);
}

// 6. At a high enough return the fund has to win, and the break-even must sit
//    between the two cases rather than at an endpoint.
{
  const m = model({});
  const be = breakEvenReturn(m);
  check("brytpunkten ligger i ett trovardigt intervall", be > 0.01 && be < 0.12, (be * 100).toFixed(2) + " %", "1 till 12 %");

  const below = comparePayoffVsInvest(model({ fund: Object.assign({}, FUND, { ret: be - 0.01 }) }));
  const above = comparePayoffVsInvest(model({ fund: Object.assign({}, FUND, { ret: be + 0.01 }) }));
  check("under brytpunkten vinner amortering", below.amortise.net[20] > below.invest.net[20]);
  check("over brytpunkten vinner fonden", above.invest.net[20] > above.amortise.net[20]);

  // At the break-even itself the two branches are level, which is the definition.
  const at = comparePayoffVsInvest(model({ fund: Object.assign({}, FUND, { ret: be }) }));
  near("vid brytpunkten ar de jamna", at.invest.net[20] - at.amortise.net[20], 0, Math.abs(at.invest.net[20]) * 0.002 + 1000);
}

// 7. The break-even has to sit above the mortgage rate after deduction: the fund
//    pays a fee and an ISK tax before it can match a guaranteed saving.
{
  const m = model({ fund: Object.assign({}, FUND, { fee: 0.004, isk: true, iskFree: 0 }) });
  const be = breakEvenReturn(m);
  const guaranteed = afterTaxRate(m.rate, 2000000 * 0.04, m.deductCap);
  check(
    "brytpunkten ligger over den garanterade rantan",
    be > guaranteed,
    (be * 100).toFixed(2) + " %",
    "> " + (guaranteed * 100).toFixed(2) + " %"
  );
  const withoutCosts = breakEvenReturn(model({ fund: Object.assign({}, FUND, { fee: 0, isk: false }) }));
  check("avgift och skatt hojer brytpunkten", be > withoutCosts, (be * 100).toFixed(2), "> " + (withoutCosts * 100).toFixed(2));
}

// 8. A higher mortgage rate makes amortising more attractive, so the break-even
//    must rise with it. Monotone, not just different.
{
  const bes = [0.02, 0.04, 0.06, 0.08].map((rate) => breakEvenReturn(model({ rate: rate })));
  check(
    "brytpunkten vaxer med bolanerantan",
    bes.every((v, i) => i === 0 || v > bes[i - 1]),
    bes.map((v) => (v * 100).toFixed(2)).join(" "),
    "vaxande"
  );
}

// 9. A loan that is already repaid leaves nothing to decide, and must not blow up.
{
  const m = model({ loan: 0 });
  const r = comparePayoffVsInvest(m);
  near("utan lan ar grenarna identiska", r.invest.net[m.years] - r.amortise.net[m.years], 0, 0.01);
  near("och ingen ranta betalas", r.invest.interest, 0, 0);
}

// 10. Formatter round-trips over every control, negatives included. sv-SE writes a
//     negative with U+2212 MINUS SIGN, and stripping it silently flips the sign.
//     That bug shipped once in RantaPaRanta, so it is asserted here from the start.
{
  CONTROLS.forEach((c) => {
    [c.min, c.max, c.value, (c.min + c.max) / 2].forEach((v) => {
      const want = c.unit === "kr" ? Math.round(v) : Math.round(v * 100) / 100;
      near("falt-round-trip " + c.id + " vid " + v, parseField(fieldText(c, v)), want, 1e-9);
    });
  });
  const NF2sv = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });
  near("lokalens minustecken overlever", parseField(NF2sv.format(-4.5)), -4.5, 0);
}

// 11. Every preset must be reachable through the controls it sets.
{
  const byId = CONTROLS.reduce((a, c) => ((a[c.id] = c), a), {});
  PRESETS.forEach((preset) => {
    Object.keys(preset.v).forEach((id) => {
      const c = byId[id];
      const v = preset.v[id];
      check("preset " + preset.name + ": " + id + " inom grans", c && v >= c.min && v <= c.max, v, c ? c.min + " till " + c.max : "okand");
    });
    check("preset " + preset.name + " har en horisont", preset.v.years > 0);
    // A preset that sets a loan above the property value would be nonsense.
    if (preset.v.loan !== undefined && preset.v.value !== undefined) {
      check("preset " + preset.name + " har rimlig belaningsgrad", preset.v.loan <= preset.v.value, preset.v.loan, "<= " + preset.v.value);
    }
  });
}

// 12. The URL contract, shared with the other calculators here.
{
  const defaults = CONTROLS.reduce((a, c) => ((a[c.id] = c.value), a), {});
  near("inga defaultvarden i lanken", buildUrlQuery(CONTROLS, defaults, { isk: true }, "life", false).length, 0, 0);
  const wanted = Object.assign({}, defaults, { loan: 1800000, rate: 5.25, extra: 5000, years: 15 });
  const back = parseUrlValues(CONTROLS, "?" + buildUrlQuery(CONTROLS, wanted, { isk: false }, "nom", false));
  near("lan overlever lanken", back.values.loan, 1800000, 0);
  near("ranta med decimaler overlever", back.values.rate, 5.25, 0);
  check("flaggan foljer med", back.flags.isk === false);
  check("basmattet foljer med", back.basis === "nom", back.basis, "nom");
}

// 13. Wiring: the page has to provide every id the script asks for, and load the
//     four scripts in dependency order.
{
  const ui = read("..", "script.js");
  const page = read("..", "index.html");

  const asked = new Set();
  for (const m of ui.matchAll(/getElementById\("([\w-]+)"\)/g)) asked.add(m[1]);
  for (const m of ui.matchAll(/querySelector(?:All)?\(\s*(['"])#([\w-]+)(?:\s[^'"]*)?\1\s*\)/g)) asked.add(m[2]);
  CONTROLS.forEach((c) => asked.add(c.group));

  const provided = new Set();
  for (const src of [page, ui]) for (const m of src.matchAll(/id="([\w-]+)"/g)) provided.add(m[1]);

  check("scriptet fragar efter minst atta id:n", asked.size >= 8, asked.size, ">= 8");
  asked.forEach((id) => check('id="' + id + '" finns', provided.has(id), "saknas", "i index.html eller i en mall i script.js"));

  const order = ["../lib/engine.js", "../lib/ui.js", "../lib/mortgage.js", "./script.js"].map((f) => page.indexOf(f));
  check(
    "alla fyra skripten laddas",
    order.every((i) => i > -1),
    order.join(" "),
    "inga -1"
  );
  check(
    "laddordningen foljer beroendena",
    order.every((v, i) => i === 0 || v > order[i - 1]),
    order.join(" "),
    "vaxande"
  );
  check("stilmallen ar den delade", page.includes("../lib/app.css"));
}

// 14. The chart has to carry one debt line per branch. The two branches pay the
//     loan down at different speeds, so a single line labelled "kvar av lanet"
//     belongs to one of them and gets read as belonging to both. That shipped
//     once.
{
  const m = model({});
  const r = comparePayoffVsInvest(m);
  let differing = 0;
  for (let y = 1; y <= m.years; y++) if (Math.abs(r.invest.debt[y] - r.amortise.debt[y]) > 1) differing++;
  check("grenarnas skuldbanor skiljer sig nastan varje ar", differing >= m.years - 1, differing + " av " + m.years, ">= " + (m.years - 1));

  check("det finns en skuldserie per gren", SHOW.debtInvest !== undefined && SHOW.debtAmortise !== undefined);
  check("och ingen odelbar skuldserie kvar", SHOW.debt === undefined);

  // The legend is the series control, so it and SHOW have to agree exactly:
  // a button with no key does nothing, a key with no button cannot be turned off.
  const page = read("..", "index.html");
  const buttons = [...page.matchAll(/data-series="([\w-]+)"/g)].map((x) => x[1]);
  Object.keys(SHOW).forEach((k) => check("forklaringen har en knapp for " + k, buttons.indexOf(k) > -1, buttons.join(" "), k));
  buttons.forEach((b) => check("knappen " + b + " styr en verklig serie", SHOW[b] !== undefined));
}

console.log("\n" + pass + " passerade, " + fail + " misslyckades");
process.exit(fail ? 1 : 0);
