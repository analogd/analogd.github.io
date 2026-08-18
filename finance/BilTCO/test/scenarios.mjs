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
  carValueSeries,
  serviceSeries,
  capitalCost,
  interestCost,
  annuityPayment,
  annuityInterestTotal,
  fuelPerMil,
  computeCar,
  plotX,
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
  TRAFA_SNITT_MIL_2025,
  SCB_ELPRIS_ORE_2025H2,
  fordonsskatt,
  DEFAULT_CO2_GRAM,
  RANTA_DEFAULT_MONTHLY
} = vm.runInContext(
  code +
    ";({carValueSeries, serviceSeries, capitalCost, interestCost, annuityPayment, annuityInterestTotal, fuelPerMil, computeCar, plotX, splitTripCost, buildRantaLink, parseRantaLink, sliderToValue, valueToSlider, parseField, fieldText, niceStep, CONTROLS, CONTROLS_B, PRESETS, SKV_MIL_ERSATTNING, TRAFA_SNITT_MIL_2025, SCB_ELPRIS_ORE_2025H2, fordonsskatt, DEFAULT_CO2_GRAM, RANTA_DEFAULT_MONTHLY})",
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
  besiktningInterval: 14,
  tireCost: 6000,
  tireSeasons: 4,
  tireMilShare: 0.7,
  serviceBase: 3000,
  serviceRise: 0.1,
  serviceMilShare: 0.5,
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

// 4b. The other defaults that come from a published table. Each assertion
//     states the figure as the source prints it, and then checks that the
//     control the user actually sees carries that figure. A default drifting
//     away from its own source is the failure mode this catches.
{
  const byId = CONTROLS.reduce((a, c) => ((a[c.id] = c), a), {});

  // Trafikanalys, Korstrackor 2025, tabell PB1 (ny metod): total korstracka
  // 7 042 865 683,96 mil fordelat pa 5 667 287 personbilar i trafik ger
  // 1 242,72 mil i snitt for 2025. Handrakningen ar divisionen sjalv, tagen
  // fran tva publicerade tal i samma tabell.
  near("Trafikanalys snittkorstracka 2025, fran totalen delat pa antalet bilar", TRAFA_SNITT_MIL_2025, 7042865683.96 / 5667287, 0.5);
  near("korstrackereglaget startar pa Trafikanalys snitt", byId.annualMil.value, TRAFA_SNITT_MIL_2025, 0);

  // SCB EN0301, tabell SSDHalvarElHus, forbrukarkategori DD, 2025H2:
  // totalpris 239,84 ore/kWh. Reglaget stegar i tiooringar, sa defaulten far
  // ligga hogst en halv steglangd fran den publicerade siffran.
  near("SCB totalpris el for hushall 2025H2", SCB_ELPRIS_ORE_2025H2, 239.84, 0);
  near(
    "elprisreglaget startar pa SCB:s siffra, inom sin steglangd",
    byId.elecPrice.value,
    SCB_ELPRIS_ORE_2025H2 / 100,
    byId.elecPrice.step / 2
  );

  // Transportstyrelsen, fordonsskattens storlek: 360 kr grundbelopp plus
  // 11 kr per gram over 111 g/km. Tre handrakade punkter langs formeln.
  near("fordonsskatt vid 111 g/km ar bara grundbeloppet", fordonsskatt(111), 360, 0);
  near("fordonsskatt vid 150 g/km: 360 + 11*39", fordonsskatt(150), 360 + 11 * 39, 0);
  near("fordonsskatt vid 200 g/km: 360 + 11*89", fordonsskatt(200), 1339, 0);
  near("under trosklen betalas inget koldioxidbelopp", fordonsskatt(80), 360, 0);
  near("fordonsskattereglaget startar pa formeln, inte pa en inskriven siffra", byId.vehicleTax.value, fordonsskatt(DEFAULT_CO2_GRAM), 0);

  // Transportstyrelsen, besiktningsregler: forsta besiktningen senast 36
  // manader efter forsta registrering, nasta senast 24 manader darefter,
  // sedan senast var 14:e manad. Appen kor ett jamnt intervall och startar
  // pa steady state, 14 manader.
  near("besiktningsintervallet startar pa Transportstyrelsens 14 manader", byId.besiktningInterval.value, 14, 0);
  check(
    "besiktningsintervallet mats i manader, inte ar",
    byId.besiktningInterval.unit === "månader",
    byId.besiktningInterval.unit,
    "månader"
  );

  // Och intervallet raknas om till en arskostnad: 500 kr var 14:e manad ar
  // 500 * 12 / 14 = 428,57 kr/ar.
  near(
    "besiktning per ar, handrakning",
    computeCar(withP({ besiktningCost: 500, besiktningInterval: 14 })).besiktningAnnual,
    428.5714,
    0.001
  );
  near(
    "ett tvaarsintervall ger halva arskostnaden",
    computeCar(withP({ besiktningCost: 600, besiktningInterval: 24 })).besiktningAnnual,
    300,
    0.001
  );
}

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

// 9. Rantekostnad is now an annuity from ../../lib/mortgage.js, not simple
//    interest on half the loan. Three independent checks of the same number:
//
//    (a) An explicit month-by-month schedule stepped here in the test. This is
//        a different derivation from the closed form in mortgage.js: it charges
//        rate/12 on the outstanding balance, subtracts the payment, and must
//        land on a zero balance. If the closed form is wrong the balance will
//        not clear.
//    (b) A hand-computed figure. 100 000 kr at 6 % over 120 months: the annuity
//        factor is 0,005 / (1 - 1,005^-120) = 0,01110205, so the payment is
//        1 110,205 kr, 133 224,60 kr paid, 33 224,60 kr of it interest.
//    (c) The direction of the model change: an annuity pays the principal down
//        more slowly than equal principal does, so it must cost MORE interest
//        than the old loan/2 * rate * years approximation, never less.
{
  const schedule = (loan, rate, months) => {
    const pay = annuityPayment(loan, rate, months);
    const rM = rate / 12;
    let bal = loan;
    let interest = 0;
    for (let i = 0; i < months; i++) {
      const due = bal * rM;
      interest += due;
      bal = bal + due - pay;
    }
    return { interest: interest, remaining: bal };
  };

  const s = schedule(100000, 0.06, 120);
  near("annuiteten loser lanet: saldot gar till noll", s.remaining, 0, 0.01);
  near("annuitetsrantan matchar en stegad amorteringsplan", annuityInterestTotal(100000, 0.06, 120), s.interest, 0.01);
  near("annuitetsrantan, handrakning 100 000 kr / 6 % / 120 man", annuityInterestTotal(100000, 0.06, 120), 33224.6, 1);
  near("annuitetsbetalningen, handrakning", annuityPayment(100000, 0.06, 120), 1110.205, 0.01);

  // Zero rate degenerates to plain repayment, no division by zero.
  near("nollranta ger ingen rantekostnad", annuityInterestTotal(100000, 0, 120), 0, 1e-9);
  near("nollranta betalar loan/months", annuityPayment(120000, 0, 120), 1000, 1e-9);

  const p = withP({ price: 200000, financedShare: 0.5, interestRate: 0.06, years: 10 });
  const straightLine = ((200000 * 0.5) / 2) * 0.06 * 10;
  const got = interestCost(p);
  near("rantekostnad gar via annuiteten i lib/mortgage.js", got, annuityInterestTotal(100000, 0.06, 120), 1e-9);
  check("annuiteten kostar mer ranta an rak amortering", got > straightLine, Math.round(got), "> " + straightLine);
  near("ingen lanad del ger ingen rantekostnad", interestCost(withP({ financedShare: 0 })), 0, 0);
}

// 9b. Tyres and service split into a time part and a mileage part.
//
//     Hand calculation at BASE (1500 mil/ar, 10 ar): two sets at 6 000 kr
//     lasting 4 seasons is 2*6000/4 = 3 000 kr/ar of tyres. Service is
//     3000 * 1,1^age summed over ages 0..9, a geometric series with the closed
//     form 3000 * (1,1^10 - 1) / 0,1 = 47 812,27 kr over the ten years.
{
  const tireAnnual = (2 * 6000) / 4;
  const sumService = (3000 * (Math.pow(1.1, 10) - 1)) / 0.1;
  near("dackkostnad per ar, handrakning", computeCar(withP({})).tireAnnual, tireAnnual, 0.01);
  near("servicesumma over horisonten, sluten form", computeCar(withP({})).sumService, sumService, 0.01);

  const none = computeCar(withP({ tireMilShare: 0, serviceMilShare: 0 }));
  const all = computeCar(withP({ tireMilShare: 1, serviceMilShare: 1 }));
  const half = computeCar(withP({ tireMilShare: 0.5, serviceMilShare: 0.5 }));

  // Reglagen flyttar kostnad mellan hinkarna, de skapar ingen ny kostnad.
  near("delningen andrar inte totalen (0 vs 1)", all.grandTotal, none.grandTotal, 0.01);
  near("delningen andrar inte totalen (0 vs 0,5)", half.grandTotal, none.grandTotal, 0.01);
  near("delningen andrar inte manadskostnaden", all.totalMonthly, none.totalMonthly, 0.01);

  // Vid andel 0 ligger hela dack- och servicekostnaden kvar i det fasta, vid
  // andel 1 ingen del av den: skillnaden ar exakt handrakningen ovan.
  near(
    "hela dack- och servicekostnaden flyttas vid andel 1",
    none.fixedAnnualTotal - all.fixedAnnualTotal,
    tireAnnual * 10 + sumService,
    0.01
  );
  near("halva flyttas vid andel 0,5", none.fixedAnnualTotal - half.fixedAnnualTotal, (tireAnnual * 10 + sumService) / 2, 0.01);

  // Och marginalkostnaden per mil stiger med exakt det flyttade beloppet
  // fordelat pa de mil som faktiskt kors: 1500 mil/ar i 10 ar.
  const milTotal = 1500 * 10;
  near(
    "marginalkostnaden per mil stiger med det flyttade beloppet",
    all.marginalPerMil - none.marginalPerMil,
    (tireAnnual * 10 + sumService) / milTotal,
    0.01
  );
  near(
    "bara dackandelen: 70 % av 3 000 kr/ar over 1500 mil/ar",
    computeCar(withP({ tireMilShare: 0.7, serviceMilShare: 0 })).marginalPerMil - none.marginalPerMil,
    (0.7 * tireAnnual) / 1500,
    0.01
  );

  // Delningen far inte krocka med invarianten: det fasta laser aldrig
  // korstrackan, oavsett hur reglagen star.
  [0, 0.35, 1].forEach((share) => {
    const a = computeCar(withP({ annualMil: 900, tireMilShare: share, serviceMilShare: share }));
    const b = computeCar(withP({ annualMil: 2600, tireMilShare: share, serviceMilShare: share }));
    near("fast ar oberoende av korstracka aven vid andel " + share, a.fixedAnnualTotal, b.fixedAnnualTotal, 0.01);
    near("fast + marginellt = totalt vid andel " + share, a.fixedMonthly * 120 + a.marginalPerMil * 900 * 10, a.grandTotal, 1);
  });

  // Poangen med hela andringen: en resa prissatt pa marginalkostnaden blir
  // dyrare nar dack och service raknas in, inte billigare.
  check(
    "marginalkostnaden per mil ar hogre med delningen an utan",
    computeCar(withP({})).marginalPerMil > none.marginalPerMil,
    computeCar(withP({})).marginalPerMil.toFixed(2),
    "> " + none.marginalPerMil.toFixed(2)
  );
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

// Chart geometry: bars are centred on their tick, so no bar may stick out past an
// axis. The first bar used to be centred exactly on the y axis and covered the
// value labels.
{
  const l = 68;
  const pw = 920;
  [1, 5, 12, 25].forEach((Y) => {
    [4, 26, 80].forEach((barW) => {
      const x = plotX(l, pw, Y, barW);
      check(
        "forsta stapeln ligger inom axeln (Y=" + Y + ", barW=" + barW + ")",
        x(0) - barW / 2 >= l - 1e-9,
        (x(0) - barW / 2).toFixed(2),
        ">= " + l
      );
      check(
        "sista stapeln ligger inom ritytan (Y=" + Y + ", barW=" + barW + ")",
        x(Y) + barW / 2 <= l + pw + 1e-9,
        (x(Y) + barW / 2).toFixed(2),
        "<= " + (l + pw)
      );
      check("staplarna ligger i vaxande ordning (Y=" + Y + ")", x(Y) > x(0) || Y === 0);
    });
  });
}

console.log("\n" + pass + " passerade, " + fail + " misslyckades");
process.exit(fail ? 1 : 0);
