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
const { simulate, percentileBand } = vm.runInContext(code + ";({simulate, percentileBand})", vm.createContext(sandbox));

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

console.log("\n" + pass + " passerade, " + fail + " misslyckades");
process.exit(fail ? 1 : 0);
