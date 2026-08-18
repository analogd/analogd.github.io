// Headless scenario runner for the BilTCO engine.
//
//   node test/scenarios.mjs
//
// Same idiom as finance/RantaPaRanta/test/scenarios.mjs: the page scripts are
// plain scripts (no ES modules), so this concatenates ../../lib/engine.js and
// ../script.js in load order and evaluates the result in a vm with a stub
// DOM, exactly as the browser sees them, then pulls out the functions it
// needs.

import fs from "fs";
import vm from "vm";
import path from "path";

const here = path.dirname(new URL(import.meta.url).pathname);
const read = (...p) => fs.readFileSync(path.join(here, ...p), "utf8");
const code = [read("..", "..", "lib", "engine.js"), read("..", "..", "lib", "ui.js"), read("..", "script.js")].join("\n");
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
  carValueSeries,
  serviceSeries,
  capitalCost,
  interestCost,
  fuelPerMil,
  computeCar,
  splitTripCost,
  buildRantaLink,
  parseRantaLink,
  sliderToValue,
  valueToSlider,
  parseField,
  fieldText,
  niceStep,
  CONTROLS,
  CONTROLS_B,
  PRESETS,
  SKV_MIL_ERSATTNING,
  RANTA_DEFAULT_MONTHLY
} = vm.runInContext(
  code +
    ";({carValueSeries, serviceSeries, capitalCost, interestCost, fuelPerMil, computeCar, splitTripCost, buildRantaLink, parseRantaLink, sliderToValue, valueToSlider, parseField, fieldText, niceStep, CONTROLS, CONTROLS_B, PRESETS, SKV_MIL_ERSATTNING, RANTA_DEFAULT_MONTHLY})",
  vm.createContext(sandbox)
);

const BASE = {
  price: 300000,
  years: 10,
  annualMil: 1500,
  financedShare: 0,
  ret: 0.07,
  interestRate: 0.05,
  depTime: 0.15,
  depMil: 0.03,
  carAgeAtPurchase: 0,
  electric: false,
  fuelConsumption: 7,
  fuelPrice: 18,
  elecConsumption: 18,
  elecPrice: 2.5,
  insurance: 8000,
  vehicleTax: 3000,
  besiktningCost: 500,
  besiktningInterval: 2,
  tireCost: 6000,
  tireSeasons: 4,
  serviceBase: 3000,
  serviceRise: 0.1,
  parking: 0
};

function withP(over) {
  return Object.assign({}, BASE, over);
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

// 1. Declining-balance depreciation against a hand calculation. 300 000 kr,
//    15 %/ar tidsdel, 3 %/1000 mil/ar mildel vid 1500 mil/ar (mileShare =
//    0,03 * 1,5 = 0,045). Year one: afterTime = 300000*0,85 = 255000,
//    afterBoth = 255000*0,955 = 243525. timeDep1 = 45000, mileageDep1 =
//    255000-243525 = 11475.
{
  const s = carValueSeries(withP({ years: 5 }));
  near("varde efter ar 1, handrakning", s.value[1], 243525, 0.01);
  near("tidsdel av vardeminskning ar 1", s.timeDep[1], 45000, 0.01);
  near("kortrackedel av vardeminskning ar 1", s.mileageDep[1], 11475, 0.01);

  // Year one costs more than year five, in kronor, because the rate bites on
  // a shrinking base.
  check(
    "ar 1 kostar mer i kronor an ar 5",
    s.timeDep[1] + s.mileageDep[1] > s.timeDep[5] + s.mileageDep[5],
    s.timeDep[1] + s.mileageDep[1],
    "> " + (s.timeDep[5] + s.mileageDep[5])
  );

  // Closed form for the value curve itself: each year multiplies by the same
  // combined factor, so value[t] = price * f^t.
  const f = (1 - 0.15) * (1 - 0.045);
  near("varde ar 5 foljer sluten form pris*f^5", s.value[5], 300000 * Math.pow(f, 5), 0.01);
}

// 2. Fixed plus marginal equals total, at two different annual mileages. The
//    identity has to hold by construction (fixed never reads annualMil), so
//    this checks that construction rather than a snapshot of one number.
{
  const r1 = computeCar(withP({ annualMil: 1000 }));
  const r2 = computeCar(withP({ annualMil: 2500 }));
  const months1 = BASE.years * 12;
  const months2 = BASE.years * 12;
  near("fast + marginellt = totalt vid 1000 mil/ar", r1.fixedMonthly * months1 + r1.marginalPerMil * 1000 * BASE.years, r1.grandTotal, 1);
  near("fast + marginellt = totalt vid 2500 mil/ar", r2.fixedMonthly * months2 + r2.marginalPerMil * 2500 * BASE.years, r2.grandTotal, 1);
  near("fastAnnualTotal ar oberoende av korstracka", r1.fixedAnnualTotal, r2.fixedAnnualTotal, 0.01);
}

// 3. kr per mil falls as annual mileage rises, because the fixed part
//    spreads over more mil.
{
  const low = computeCar(withP({ annualMil: 800 }));
  const high = computeCar(withP({ annualMil: 3000 }));
  check("kr/mil faller med hogre korstracka", high.krPerMil < low.krPerMil, high.krPerMil.toFixed(2), "< " + low.krPerMil.toFixed(2));
}

// 4. Skatteverket's schablon, asserted as the published figure: 25 kr/mil
//    for a private car, gallande inkomstaren 2025 och 2026. Kalla:
//    skatteverket.se.
near("Skatteverkets schablon ar 25 kr/mil", SKV_MIL_ERSATTNING, 25, 0);

// 5. The comparison delta is symmetric and signed correctly: swapping which
//    car is "A" flips the sign but not the size.
{
  const carA = withP({ price: 300000 });
  const carB = withP({ price: 150000, depTime: 0.1 });
  const rA = computeCar(carA);
  const rB = computeCar(carB);
  const deltaAB = rA.totalMonthly - rB.totalMonthly;
  const deltaBA = rB.totalMonthly - rA.totalMonthly;
  near("jamforelsedeltat ar symmetriskt", deltaAB, -deltaBA, 1e-9);
  check("den dyrare bilen ger ett positivt delta mot den billigare", deltaAB > 0, deltaAB, "> 0");
}

// 6. The generated RantaPaRanta link parses back to the value put in,
//    including a value that happens to equal the default (link collapses to
//    no query string, by the same "omit defaults" rule the contract uses).
{
  // RantaPaRanta reads its OWN location.search, i.e. only the "?..." tail of
  // whatever link it was opened from, so that is what a round trip has to
  // hand back through, not the whole relative path this side builds.
  const queryOf = (link) => (link.indexOf("?") === -1 ? "" : "?" + link.split("?")[1]);

  const link = buildRantaLink(1234.5);
  check("lanken pekar pa RantaPaRanta", link.indexOf("../RantaPaRanta/") === 0, link, "../RantaPaRanta/...");
  check("lanken har inga lokaliserade tal", !/[\s,]/.test(link), link, "punkt som decimaltecken, inga blanksteg");
  near("lanken parsas tillbaka till samma varde", parseRantaLink(queryOf(link)), 1234.5, 1e-9);

  const negLink = buildRantaLink(-300);
  near("negativt delta overlever lanken", parseRantaLink(queryOf(negLink)), -300, 1e-9);

  const defaultLink = buildRantaLink(RANTA_DEFAULT_MONTHLY);
  check(
    "ett delta som rakar traffa defaulten skriver ingen parameter",
    defaultLink === "../RantaPaRanta/",
    defaultLink,
    "../RantaPaRanta/"
  );
}

// 7. Formatter round-trips over the full range of every control, including
//    the sv-SE minus sign regression: sv-SE writes negatives with U+2212, not
//    ASCII hyphen. No control on this page has a negative range today, but
//    parseField is shared machinery, so it has to survive one that does. This
//    exact bug shipped in RantaPaRanta, hence the explicit assertion here too.
{
  const NF2sv = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });
  near("faltet klarar lokalens minustecken", parseField(NF2sv.format(-15)), -15, 0);
  near("och ett vanligt bindestreck", parseField("-15"), -15, 0);
  near("faltet klarar tusentalsavgransare", parseField("1 059 509"), 1059509, 0);
  near("faltet klarar decimalkomma", parseField("0,4"), 0.4, 0);

  CONTROLS.concat(CONTROLS_B).forEach((c) => {
    [c.min, c.max, c.value, (c.min + c.max) / 2].forEach((v) => {
      const want = c.unit === "kr" || c.unit.indexOf("kr/") === 0 ? Math.round(v) : Math.round(v * 100) / 100;
      near("falt-round-trip " + c.id + " vid " + v, parseField(fieldText(c, v)), want, 1e-9);
    });
  });

  // Slider round trip, kronor curve included.
  const kronor = { unit: "kr", min: 0, max: 1000000, step: 5000 };
  near("kr round-trip", sliderToValue(kronor, valueToSlider(kronor, 250000)), 250000, 5000);
  const years = { unit: "ar", min: 1, max: 15, step: 1 };
  near("linjar round-trip", sliderToValue(years, valueToSlider(years, 6)), 6, 0);
}

// 8. Kapitalkostnad uses the shared compounding engine: with no fee, no tax
//    and no monthly contribution, simulate() collapses to plain compound
//    growth, so the hand form price*(1+ret)^years - price must match exactly.
{
  const p = withP({ price: 200000, financedShare: 0, ret: 0.05, years: 8 });
  const got = capitalCost(p);
  const want = 200000 * Math.pow(1.05, 8) - 200000;
  near("kapitalkostnad matchar sluten form via motorn", got, want, 1);

  const financed = withP({ price: 200000, financedShare: 0.6, ret: 0.05, years: 8 });
  const gotFinanced = capitalCost(financed);
  const wantFinanced = 200000 * 0.4 * (Math.pow(1.05, 8) - 1);
  near("kapitalkostnad racknas bara pa egen insats", gotFinanced, wantFinanced, 1);

  near("ingen avkastning ger ingen kapitalkostnad", capitalCost(withP({ ret: 0 })), 0, 0.01);
}

// 9. Rantekostnad, hand calculation: simple interest on half the loan
//    (straight-line amortisation to zero), over the ownership years.
{
  const p = withP({ price: 200000, financedShare: 0.5, interestRate: 0.06, years: 10 });
  const got = interestCost(p);
  const want = ((200000 * 0.5) / 2) * 0.06 * 10;
  near("rantekostnad, handrakning", got, want, 0.01);
  near("ingen lanad del ger ingen rantekostnad", interestCost(withP({ financedShare: 0 })), 0, 0);
}

// 10. Fuel and electric cost per mil, hand calculation. 7 l/100km at 18 kr/l
//     is 0,7 l/mil, 12,6 kr/mil. 18 kWh/100km at 2,5 kr/kWh is 1,8 kWh/mil,
//     4,5 kr/mil.
{
  near("bransle kr/mil, handrakning", fuelPerMil(withP({ electric: false, fuelConsumption: 7, fuelPrice: 18 })), 12.6, 0.001);
  near("el kr/mil, handrakning", fuelPerMil(withP({ electric: true, elecConsumption: 18, elecPrice: 2.5 })), 4.5, 0.001);
}

// 11. Service and repairs rise with the car's age, hand calculation: 3000 kr
//     at age 0, rising 10 %/ar, bought at age 2 so year 3 of ownership is age
//     4: 3000 * 1,1^4.
{
  const s = serviceSeries(withP({ serviceBase: 3000, serviceRise: 0.1, carAgeAtPurchase: 2, years: 5 }));
  near("service ar 1 (bilalder 2)", s[1], 3000 * Math.pow(1.1, 2), 0.01);
  near("service ar 3 (bilalder 4)", s[3], 3000 * Math.pow(1.1, 4), 0.01);
  check("service stiger monotont med agandear", s[3] > s[1]);
}

// 12. Dela pa kostnaden: hand calculation of the split, and that the three
//     bases give three different numbers so the norm becomes visible as a
//     comparison rather than an assertion.
{
  near("split, handrakning: 100 kr/mil over 50 mil pa 2 personer", splitTripCost(100, 50, 1), 2500, 0.01);
  near("ingen medresenar delar inte", splitTripCost(100, 50, 0), 5000, 0.01);

  const p = withP({ fuelConsumption: 7, fuelPrice: 18, electric: false });
  const r = computeCar(p);
  const fuelOnly = splitTripCost(r.fuelPerMil, 50, 1);
  const skv = splitTripCost(SKV_MIL_ERSATTNING, 50, 1);
  const marginal = splitTripCost(r.marginalPerMil, 50, 1);
  check("de tre baserna ger olika svar", fuelOnly !== skv && skv !== marginal, [fuelOnly, skv, marginal].join(" / "), "tre olika tal");
  check("bara-bransle ar lagst av de tre for en typisk bil", fuelOnly < skv, fuelOnly, "< " + skv);
}

// 13. Every preset must be reachable by the controls it sets, and every
//     preset id must actually exist among the controls.
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
    });
  });
}

// 14. CONTROLS_B is derived from CONTROLS, not hand-duplicated: every "*B" id
//     has the same min, max and step as its base control, so the two sliders
//     can never drift apart.
{
  CONTROLS_B.forEach((cb) => {
    const baseId = cb.id.slice(0, -1);
    const base = CONTROLS.find((c) => c.id === baseId);
    check("bil B: " + cb.id + " har en bas-kontroll", !!base, baseId, "en kontroll i CONTROLS");
    if (base) {
      check("bil B: " + cb.id + " delar grans med basen", cb.min === base.min && cb.max === base.max && cb.step === base.step);
    }
  });
}

// 15. niceStep, same contract as RantaPaRanta's chart axis: round numbers
//     that cover the data.
{
  near("niceStep valjer 1 mkr for 0,9 mkr", niceStep(900000), 1000000, 0);
  near("niceStep valjer 2,5 for 2,1", niceStep(2.1), 2.5, 0);
}

// 16. Wiring: every id the script asks the DOM for exists either as static
//     markup in index.html or as a template the script writes itself.
{
  const fs2 = fs;
  const ui = read("..", "script.js");
  const page = read("..", "index.html");

  const asked = new Set();
  for (const m of ui.matchAll(/getElementById\("([\w-]+)"\)/g)) asked.add(m[1]);
  for (const m of ui.matchAll(/querySelector(?:All)?\(\s*(['"])#([\w-]+)(?:\s[^'"]*)?\1\s*\)/g)) asked.add(m[2]);
  ["basic", "capital", "value", "drift", "fuel-fields", "elec-fields", "compare-b", "fuel-fields-b", "elec-fields-b", "presets"].forEach(
    (id) => asked.add(id)
  );

  const provided = new Set();
  for (const src of [page, ui]) for (const m of src.matchAll(/id="([\w-]+)"/g)) provided.add(m[1]);

  check("scriptet fragar efter minst tio id:n", asked.size >= 10, asked.size, ">= 10");
  asked.forEach((id) => {
    check('id="' + id + '" finns', provided.has(id), "saknas", "i index.html eller i en mall i script.js");
  });

  const engineAt = page.indexOf("../lib/engine.js");
  const uiAt = page.indexOf("./script.js");
  check("motorn laddas", engineAt > -1);
  check("motorn laddas fore ui:t", engineAt > -1 && uiAt > engineAt, engineAt + " vs " + uiAt, "motorn forst");
  void fs2;
}

console.log("\n" + pass + " passerade, " + fail + " misslyckades");
process.exit(fail ? 1 : 0);
