// Headless scenario runner for the ranta-pa-ranta engine.
//
//   node test/scenarios.mjs
//
// The arithmetic lives in ../../lib/engine.js and the UI in ../script.js, both
// loaded as plain scripts (no ES modules) so that the page works when opened
// straight from disk. This runner therefore concatenates them in load order and
// evaluates the result in a vm with a stub DOM, exactly as the browser sees them,
// then grabs the functions it needs. Same idea as BoxSmith/lib/test/diagnose.mjs:
// reproduce what the page computes, in Node, without a browser.

import fs from "fs";
import vm from "vm";
import path from "path";

const here = path.dirname(new URL(import.meta.url).pathname);
const read = (...p) => fs.readFileSync(path.join(here, ...p), "utf8");
const code = read("..", "..", "lib", "engine.js") + "\n" + read("..", "script.js");
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
  simulate,
  percentileBand,
  moneyWeightedReturn,
  niceStep,
  sliderToValue,
  valueToSlider,
  parseField,
  fieldText,
  solveRamp,
  COST_PRESETS,
  parseUrlValues,
  buildUrlQuery,
  realContributions,
  PRESETS,
  CONTROLS,
  SHOW
} = vm.runInContext(
  code +
    ";({simulate, percentileBand, moneyWeightedReturn, niceStep, sliderToValue, valueToSlider, parseField, fieldText, solveRamp, COST_PRESETS, parseUrlValues, buildUrlQuery, realContributions, PRESETS, CONTROLS, SHOW})",
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

  // Regression: sv-SE formats negatives with U+2212, not ASCII hyphen. The field
  // is written by the same formatter it is read back by, so losing that sign
  // turned a shrinking contribution into a growing one.
  const NF2sv = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });
  near("faltet klarar lokalens minustecken", parseField(NF2sv.format(-15)), -15, 0);
  near("och ett vanligt bindestreck", parseField("-15"), -15, 0);
  near("negativt kronbelopp round-trip", parseField(new Intl.NumberFormat("sv-SE").format(-15000)), -15000, 0);
  // Every control is written by fieldText and read back by parseField, so the
  // pair has to be lossless over the whole range, not just for positive numbers.
  CONTROLS.forEach((c) => {
    [c.min, c.max, c.value, (c.min + c.max) / 2].forEach((v) => {
      const want = c.unit === "kr" ? Math.round(v) : Math.round(v * 100) / 100;
      near("falt-round-trip " + c.id + " vid " + v, parseField(fieldText(c, v)), want, 1e-9);
    });
  });
}

// 21. The back-solve helper mirrors the horizon and lands on the same number the
//     "sista aret" stat shows, so the two can never disagree.
{
  near("45 ars horisont rampar 44 ar", solveRamp(45), 44, 0);
  near("17 ars horisont rampar 16 ar", solveRamp(17), 16, 0);
  near("ett ars horisont har ingen ramp", solveRamp(1), 0, 0);
  near("tomt falt ger ingen ramp", solveRamp(NaN), 0, 0);
  near("horisonten kan inte overstiga reglagets tak", solveRamp(9999), 59, 0);

  // The field and the stat are the same quantity, computed the same way.
  const monthly = 21000;
  const growth = -0.03;
  const years = 17;
  const helper = monthly * Math.pow(1 + growth, solveRamp(years));
  const stat = monthly * Math.pow(1 + growth, years - 1);
  near("faltet och sista-aret-statistiken ar samma tal", helper, stat, 0);

  // And the back-solve inverts it exactly.
  const g = Math.pow(helper / monthly, 1 / solveRamp(years)) - 1;
  near("baklangeslosningen aterskapar takten", g, growth, 1e-12);
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

// 20. A shrinking contribution is a legal case, not a clamped one.
{
  const g = CONTROLS.find((c) => c.id === "growth");
  check("forandringstakten far vara negativ", g.min < 0, g.min, "< 0");
  near("minus 3 % halverar manadsbeloppet pa 23 ar", 1000 * Math.pow(0.97, 23), 500, 6);
  const down = run({ monthly: 21000, growth: -0.03, years: 17, start: 500000, fee: 0.004, isk: true, slr: 0.0255, iskFree: 300000 });
  const flat = run({ monthly: 21000, growth: 0, years: 17, start: 500000, fee: 0.004, isk: true, slr: 0.0255, iskFree: 300000 });
  check("minskande sparande ger mindre an platt", down.end < flat.end, Math.round(down.end), "< " + Math.round(flat.end));
  check("men fortfarande mer an bara startbeloppet", down.end > 500000);
  near("sista arets manadsbelopp har krympt", 21000 * Math.pow(0.97, 16), 12899, 1);
}

// 22. The URL contract. Other calculators here build these links to hand over a
//     scenario, so the format is an interface and not an implementation detail.
{
  const defaults = CONTROLS.reduce((a, c) => ((a[c.id] = c.value), a), {});

  // Defaults are never written, so a link stays short and a revised default is
  // not frozen into every old link.
  near("inga defaultvarden i lanken", buildUrlQuery(defaults, { isk: true, ref: true }, "life", false).length, 0, 0);

  // Anything that differs is written, as a plain number a foreign app can build.
  const q = buildUrlQuery({ ...defaults, monthly: 417, years: 37, growth: 2 }, { isk: true, ref: true }, "life", false);
  check("bara det som avviker skrivs ut", q === "monthly=417&years=37&growth=2", q, "monthly=417&years=37&growth=2");
  check("inga lokaliserade tal i lanken", !/[\s,]/.test(q), q, "punkt som decimaltecken, inga blanksteg");

  // Flags and basis only appear when they leave their default.
  check("avstangda flaggor syns", buildUrlQuery(defaults, { isk: false, ref: false }, "life", false) === "isk=0&ref=0");
  check("basmatt syns bara nar det inte ar life", buildUrlQuery(defaults, {}, "cpi", false) === "basis=cpi");
  check("spannet syns nar det ar pa", buildUrlQuery(defaults, {}, "life", true) === "band=1");

  // Round trip: what is written is what comes back.
  const wanted = { ...defaults, start: 250000, monthly: 1500, age: 41, years: 26, ret: 6.5, growth: -2.5 };
  const back = parseUrlValues("?" + buildUrlQuery(wanted, { isk: false, ref: true }, "nom", true));
  Object.keys(wanted).forEach((id) => {
    if (Math.abs(wanted[id] - defaults[id]) > 1e-9) near("url round-trip " + id, back.values[id], wanted[id], 1e-9);
  });
  check("negativ takt overlever lanken", back.values.growth === -2.5, back.values.growth, -2.5);
  check("flaggan foljer med", back.flags.isk === false);
  check("basmattet foljer med", back.basis === "nom", back.basis, "nom");
  check("spannet foljer med", back.band === true);

  // A hostile or hand-edited link must not poison the state.
  const junk = parseUrlValues("?monthly=abc&years=&basis=nonsense&start=1e5&nope=1");
  check("skrapvarden ignoreras", junk.values.monthly === undefined && junk.values.years === undefined);
  check("okant basmatt ignoreras", junk.basis === null, junk.basis, "null");
  near("exponentform ar giltigt tal", junk.values.start, 100000, 0);

  // Comma as decimal separator, because someone will hand-edit a link.
  near("kommatecken funkar i lanken", parseUrlValues("?ret=6,5").values.ret, 6.5, 0);
}

// 23. Wiring. The engine and the UI are separate files now, and the script asks
//     the page for elements by id. Nothing above catches a renamed id or a
//     missing script tag, because the tests never touch the DOM: this does, by
//     checking the two files against each other as text.
{
  const ui = read("..", "script.js");
  const page = read("..", "index.html");

  // Asked for by the script. Only whole string literals count: a selector built by
  // concatenation ("#n-" + c.id) names an element the script created itself.
  const asked = new Set();
  for (const m of ui.matchAll(/getElementById\("([\w-]+)"\)/g)) asked.add(m[1]);
  for (const m of ui.matchAll(/querySelector(?:All)?\(\s*(['"])#([\w-]+)(?:\s[^'"]*)?\1\s*\)/g)) asked.add(m[2]);
  CONTROLS.forEach((c) => asked.add(c.group)); // buildControls appends into the group id

  // Provided by either file: the page markup, or a template the script writes.
  const provided = new Set();
  for (const src of [page, ui]) for (const m of src.matchAll(/id="([\w-]+)"/g)) provided.add(m[1]);

  check("scriptet fragar efter minst tio id:n", asked.size >= 10, asked.size, ">= 10");
  asked.forEach((id) => {
    check('id="' + id + '" finns', provided.has(id), "saknas", "i index.html eller i en mall i script.js");
  });

  // Load order is load-bearing: script.js reads names the engine declares.
  const engineAt = page.indexOf("../lib/engine.js");
  const uiAt = page.indexOf("./script.js");
  check("motorn laddas", engineAt > -1);
  check("motorn laddas fore ui:t", engineAt > -1 && uiAt > engineAt, engineAt + " vs " + uiAt, "motorn forst");

  // Both preset rows have a host, and the cost row is not accidentally empty.
  check("bada presetraderna finns i sidan", page.includes('id="presets"') && page.includes('id="cost-presets"'));
  check("kostnadspresets ar ifyllda", COST_PRESETS.length >= 3, COST_PRESETS.length, ">= 3");
  COST_PRESETS.forEach((p) => {
    const byId = CONTROLS.reduce((a, c) => ((a[c.id] = c), a), {});
    Object.keys(p.v).forEach((id) => {
      const c = byId[id];
      check(
        "kostnadspreset " + p.name + ": " + id + " inom grans",
        c && p.v[id] >= c.min && p.v[id] <= c.max,
        p.v[id],
        c ? c.min + " till " + c.max : "okand"
      );
    });
  });
}

console.log("\n" + pass + " passerade, " + fail + " misslyckades");
process.exit(fail ? 1 : 0);
