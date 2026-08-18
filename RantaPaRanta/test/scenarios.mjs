// Headless scenario runner for the ranta-pa-ranta engine.
//
//   node test/scenarios.mjs
//
// The engine lives in script.js and is loaded as a plain script (no ES module),
// so that the page works when opened straight from disk. This runner therefore
// evaluates script.js in a vm with a stub DOM and grabs the two functions it
// needs. Same idea as BoxSmith/lib/test/diagnose.mjs: reproduce what the page
// computes, in Node, without a browser.

import fs from "fs";
import vm from "vm";
import path from "path";

const here = path.dirname(new URL(import.meta.url).pathname);
const code = fs.readFileSync(path.join(here, "..", "script.js"), "utf8");
const sandbox = { document: { addEventListener() {} }, window: { addEventListener() {} }, requestAnimationFrame() {}, Intl, Math, console };
const {
  simulate,
  percentileBand,
  moneyWeightedReturn,
  niceStep,
  sliderToValue,
  valueToSlider,
  parseField,
  realContributions,
  PRESETS,
  CONTROLS,
  SHOW
} = vm.runInContext(
  code +
    ";({simulate, percentileBand, moneyWeightedReturn, niceStep, sliderToValue, valueToSlider, parseField, realContributions, PRESETS, CONTROLS, SHOW})",
  vm.createContext(sandbox)
);

const BASE = {
  start: 10000,
  monthly: 2000,
  age: 22,
  years: 20,
  ret: 0.07,
  growth: 0,
  inflation: 0.02,
  drift: 0.01,
  fee: 0,
  slr: 0.02,
  iskFree: 150000,
  vol: 0.16,
  isk: false
};

function run(over) {
  const p = Object.assign({}, BASE, over);
  const bal = new Float64Array(p.years + 1);
  const contrib = new Float64Array(p.years + 1);
  const cost = simulate(p, null, bal, contrib);
  return { p, bal, contrib, end: bal[p.years], paid: contrib[p.years], fees: cost.fees, tax: cost.tax };
}

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
  check(name, Math.abs(got - want) <= tol, Math.round(got * 100) / 100, want + " +/- " + tol);
}

// 1. The published Lysa number, with every adjustment switched off. This is the
//    anchor: if it drifts, the compounding convention changed.
near("matchar Lysas publicerade siffra (10k + 2k/man, 7 %, 20 ar)", run({}).end, 1059509, 1);

// 2. Closed-form annuity-due with geometric monthly rate.
{
  const rm = Math.pow(1.07, 1 / 12);
  const n = 360;
  const closed = 10000 * Math.pow(rm, n) + 2000 * ((Math.pow(rm, n) - 1) / (rm - 1)) * rm;
  near("sluten annuitetsformel, 30 ar", run({ years: 30 }).end, closed, 1);
}

// 3. Nothing happens with no return and no costs.
{
  const r = run({ ret: 0, years: 10 });
  near("ret=0 ger slutvarde = insatt", r.end, r.paid, 0.01);
  near("insatt = start + 120 inbetalningar", r.paid, 10000 + 120 * 2000, 0.01);
}

// 4. Fees are charged on capital and always cost something.
{
  const a = run({}).end;
  const b = run({ fee: 0.004 }).end;
  check("avgift minskar slutvardet", b < a);
  check("0,4 % avgift kostar 4 till 8 % over 20 ar", 1 - b / a > 0.04 && 1 - b / a < 0.08, ((1 - b / a) * 100).toFixed(2) + " %", "4-8 %");
  near("rapporterad avgift ar positiv och rimlig", run({ fee: 0.004 }).fees > 0 ? 1 : 0, 1, 0);
}

// 5. ISK schablon, computed by hand: 100 000 kr parked for one year, no return,
//    no fribelopp. Kapitalunderlag = 100 000, schablon = SLR + 1 pp = 3 %,
//    tax = 30 % of that = 900 kr.
{
  const r = run({ start: 100000, monthly: 0, ret: 0, years: 1, isk: true, iskFree: 0, slr: 0.02 });
  near("ISK-skatt for handrakningen", r.tax, 900, 0.01);
  near("slutvarde efter ISK-skatt", r.end, 99100, 0.01);
}

// 6. Below the fribelopp there is no tax at all.
{
  const r = run({ start: 100000, monthly: 0, ret: 0, years: 3, isk: true, iskFree: 150000 });
  near("inget skatteuttag under fribeloppet", r.tax, 0, 0);
}

// 7. Never under the 1,25 % floor, even at zero statslaneranta.
{
  const r = run({ start: 100000, monthly: 0, ret: 0, years: 1, isk: true, iskFree: 0, slr: 0 });
  near("schablongolvet 1,25 % galler", r.tax, 0.3 * 0.0125 * 100000, 0.01);
}

// 8. Contribution growth: 1 000 kr/man growing 7,177 %/ar is 4 000 kr/man in year 21.
{
  const g = Math.pow(4, 1 / 20) - 1;
  near("sparandet fyrdubblas pa 20 ar", 1000 * Math.pow(1 + g, 20), 4000, 0.01);
  const flat = run({ monthly: 1000, growth: 0, years: 45 }).end;
  const ramp = run({ monthly: 1000, growth: 0.03, years: 45 }).end;
  // 3 %/ar over 45 ar maler ut ~1,48x mot ett platt sparande. Tarskeln ar satt
  // strax under det matta vardet, inte gissad.
  check("vaxande sparande ger mer", ramp > flat * 1.4, (ramp / flat).toFixed(2) + "x", "> 1,4x");
}

// 9. The three bases are ordered, always.
{
  const r = run({ years: 45 });
  const cpi = r.end / Math.pow(1 + BASE.inflation, 45);
  const life = r.end / Math.pow((1 + BASE.inflation) * (1 + BASE.drift), 45);
  check("nominellt > KPI-justerat > livsstilsjusterat", r.end > cpi && cpi > life);
  near("1 % standardglidning over 45 ar kostar 36 %", 1 - life / cpi, 1 - Math.pow(1.01, -45), 0.001);
}

// 10. Monte Carlo: zero volatility must collapse onto the deterministic path,
//     and the percentiles must stay ordered.
{
  const p0 = Object.assign({}, BASE, { vol: 0, years: 20 });
  const b0 = percentileBand(p0);
  near("vol=0 ger p10 = p90", b0.p90[20] - b0.p10[20], 0, 0.01);
  near("vol=0 ger p50 = deterministisk", b0.p50[20], run({ vol: 0 }).end, 1);

  const p = Object.assign({}, BASE, { years: 45, monthly: 1000, fee: 0.004, isk: true, growth: 0.03 });
  const b = percentileBand(p);
  check("p10 < p50 < p90", b.p10[45] < b.p50[45] && b.p50[45] < b.p90[45]);
  check("spannet ar brett pa 45 ars horisont", b.p90[45] / b.p10[45] > 3, (b.p90[45] / b.p10[45]).toFixed(1) + "x", "> 3x");
  // Documented artifact: with contributions spread over time the median of the
  // simulated wealth sits above the single deterministic scenario.
  const det = run({ years: 45, monthly: 1000, fee: 0.004, isk: true, growth: 0.03 }).end;
  check(
    "median over deterministisk men inom 25 %",
    b.p50[45] > det && b.p50[45] < det * 1.25,
    (b.p50[45] / det).toFixed(3),
    "1,00 till 1,25"
  );
  check(
    "banden ar monotona over tiden",
    b.p50.every((v, y) => y === 0 || v >= b.p50[y - 1])
  );
}

// 11. Yearly series is filled in and consistent.
{
  const r = run({ years: 30 });
  check("en punkt per ar", r.bal.length === 31 && r.bal[30] > 0);
  check(
    "insatt vaxer monotont",
    r.contrib.every((v, y) => y === 0 || v >= r.contrib[y - 1])
  );
  check(
    "varde vaxer monotont vid positiv avkastning",
    r.bal.every((v, y) => y === 0 || v >= r.bal[y - 1])
  );
}

// 12. Money-weighted return: with no fee and no tax it must recover exactly the
//     assumed return, and every cost must push it below.
{
  const clean = run({ years: 30 });
  near("penningvagd avkastning = antagandet nar inget dras av", moneyWeightedReturn(clean.p, clean.end), 0.07, 1e-6);

  const p = { years: 45, monthly: 1000, fee: 0.004, isk: true, growth: 0.03 };
  const costly = run(p);
  const mwr = moneyWeightedReturn(costly.p, costly.end);
  check("avgift och skatt sanker den under 7 %", mwr < 0.07 && mwr > 0.05, (mwr * 100).toFixed(2) + " %", "5 till 7 %");

  const real = (1 + mwr) / (1.02 * 1.01) - 1;
  check(
    "realt efter KPI och standardglidning ar mycket lagre",
    real < mwr - 0.025,
    (real * 100).toFixed(2) + " %",
    "< " + ((mwr - 0.025) * 100).toFixed(2) + " %"
  );
}

// 13. Axis steps must be round numbers, and the top must cover the data.
{
  near("niceStep valjer 1 mkr for 0,9 mkr", niceStep(900000), 1000000, 0);
  near("niceStep valjer 2,5 for 2,1", niceStep(2.1), 2.5, 0);
  const rawMax = 3411000;
  let step = niceStep((rawMax * 1.04) / 4);
  while (step * 4 < rawMax) step = niceStep(step * 1.05);
  check("axeltoppen tacker datan", step * 4 >= rawMax, step * 4, ">= " + rawMax);
  near("och stegen ar runda", step, 1000000, 0);
}

// 14. Slider mapping: kronor use a squared curve, round trips must survive it.
{
  const kronor = { unit: "kr", min: 0, max: 1000000, step: 1000 };
  const years = { unit: "ar", min: 1, max: 60, step: 1 };
  near("10 000 kr hamnar 10 % in pa reglaget, inte 1 %", valueToSlider(kronor, 10000), 100, 1);
  near("kr round-trip", sliderToValue(kronor, valueToSlider(kronor, 250000)), 250000, 1000);
  near("linjar round-trip", sliderToValue(years, valueToSlider(years, 45)), 45, 0);
  near("faltet klarar tusentalsavgransare", parseField("1 059 509"), 1059509, 0);
  near("faltet klarar decimalkomma", parseField("0,4"), 0.4, 0);
}

// 15. The 2026 ISK numbers, straight off Skatteverket: statslaneranta 2,55 % on
//     30 Nov 2025 gives schablon 3,55 % and an effective 1,065 % of the
//     kapitalunderlag above the fribelopp.
{
  const r = run({ start: 1300000, monthly: 0, ret: 0, years: 1, isk: true, iskFree: 300000, slr: 0.0255 });
  near("effektiv ISK-skatt 1,065 % over fribeloppet", r.tax, 0.01065 * 1000000, 0.01);
  const defaults = CONTROLS.reduce((a, c) => ((a[c.id] = c.value), a), {});
  near("default statslaneranta ar 2026-siffran", defaults.slr, 2.55, 0);
  near("default fribelopp ar 2026-siffran", defaults.iskFree, 300000, 0);
}

// 16. Every preset must be reachable by the controls it sets.
{
  const byId = CONTROLS.reduce((a, c) => ((a[c.id] = c), a), {});
  PRESETS.forEach((preset) => {
    Object.keys(preset.v).forEach((id) => {
      const c = byId[id];
      const v = preset.v[id];
      check(
        "preset " + preset.name + ": " + id + " inom reglagets grans",
        c && v >= c.min && v <= c.max,
        v,
        c ? c.min + " till " + c.max : "okand kontroll"
      );
      check("preset " + preset.name + ": " + id + " overlever reglaget", Math.abs(sliderToValue(c, valueToSlider(c, v)) - v) <= c.step);
    });
    check("preset " + preset.name + " har en horisont", preset.v.years > 0);
  });
}

// 17. Opening state of the chart series: bars on, spread off, so the axis opens
//     scaled to the bars.
{
  check("startbelopp syns fran borjan", SHOW.start === true);
  check("manadssparande syns fran borjan", SHOW.mon === true);
  check("avkastning syns fran borjan", SHOW.ret === true);
  check("forlorad kopkraft syns fran borjan", SHOW.loss === true);
  check("spannet ar avstangt fran borjan", SHOW.band === false);
}

// 18. The real cost basis: every contribution deflated by its own date, the
//     start amount not at all (it is paid today). Default basis is "life".
{
  const p = { start: 100000, monthly: 1000, years: 10, growth: 0, inflation: 0.02, drift: 0.01 };
  const rc = realContributions(p);
  const nominal = 100000 + 120 * 1000;
  const f = 1.02 * 1.01;
  near("startbeloppet deflateras aldrig", rc[0], 100000, 0);
  check("realt insatt ar lagre an nominellt", rc[10] < nominal, Math.round(rc[10]), "< " + nominal);
  check(
    "men hogre an att deflatera hela summan med slutaret",
    rc[10] > nominal / Math.pow(f, 10),
    Math.round(rc[10]),
    "> " + Math.round(nominal / Math.pow(f, 10))
  );
  near("utan inflation ar realt = nominellt", realContributions({ ...p, inflation: 0, drift: 0 })[10], nominal, 0.01);
}

// 19. Forlorad kopkraft must be reachable: a low enough return leaves the pot
//     below what was paid in, measured in today's purchasing power.
{
  const p = {
    start: 10000,
    monthly: 1000,
    years: 30,
    growth: 0,
    ret: 0.02,
    fee: 0.004,
    slr: 0.0255,
    iskFree: 300000,
    isk: true,
    vol: 0,
    inflation: 0.02,
    drift: 0.01
  };
  const bal = new Float64Array(p.years + 1);
  const contrib = new Float64Array(p.years + 1);
  simulate(p, null, bal, contrib);
  const real = bal[p.years] / Math.pow(1.02 * 1.01, p.years);
  const cost = realContributions(p)[p.years];
  check("2 % avkastning ger forlorad kopkraft", real < cost, Math.round(real), "< " + Math.round(cost));

  const good = { ...p, ret: 0.07 };
  const balG = new Float64Array(good.years + 1);
  simulate(good, null, balG, new Float64Array(good.years + 1));
  check("7 % gor det inte", balG[good.years] / Math.pow(1.02 * 1.01, good.years) > realContributions(good)[good.years]);
}

console.log("\n" + pass + " passerade, " + fail + " misslyckades");
process.exit(fail ? 1 : 0);
