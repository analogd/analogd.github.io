"use strict";

// Bilens verkliga manadskostnad.
//
// UI, chart and URL handover live here. Compounding for kapitalkostnad comes
// from ../lib/engine.js (loaded first), because that is the one place this
// site's investment-return arithmetic is allowed to live. Everything else
// (depreciation, fuel, running costs) is this app's own model, since none of
// it is compounding in the ISK/investment sense engine.js exists for.
//
// Distance is in mil (10 km), the Swedish convention, because that is also
// the unit Skatteverket's schablon and every fuel-economy sticker use.

// Skatteverket, skattefri bilersattning for resa med egen bil: 25 kr/mil,
// oforandrad sedan 1 jan 2023, gallande for inkomstaren 2025 och 2026.
// Kalla: skatteverket.se, "Jag reser en del i tjansten..." (privat/FAQ).
const SKV_MIL_ERSATTNING = 25;

// ---------- sourced defaults ----------
//
// Every number below comes from a published table, carries the period it
// applies to, and is asserted in test/scenarios.mjs against that published
// figure. A default that is NOT in this block is a reasonable guess and says
// "Overifierat" in its hint. That distinction is the whole point of the block:
// a reader can tell which of the numbers on the page are claims and which are
// placeholders.

// Trafikanalys, Korstrackor 2025, Tabell PB1 (ny metod), publicerad
// 2026-04-17: genomsnittlig korstracka per personbil i trafik var 1 242,72
// mil under 2025. Trafikanalys ar statistikansvarig myndighet, sa detta ar
// officiell statistik, inte en branschuppskattning.
// Kalla: trafa.se/vagtrafik/korstrackor/
const TRAFA_SNITT_MIL_2025 = 1243;

// SCB, Elpriser och elavtal (EN0301), halvarsstatistik: totalpris pa el for
// hushall i forbrukarkategori DD (5 000 till 14 999 kWh/ar, alltsa en villa
// som ocksa laddar bil) var 239,84 ore/kWh under andra halvaret 2025.
// Totalpris betyder allt hushallet faktiskt betalar: handelspris, natpris,
// elskatt och moms. Kalla: SCB:s statistikdatabas, tabell SSDHalvarElHus.
const SCB_ELPRIS_ORE_2025H2 = 239.84;

// Transportstyrelsen, fordonsskattens storlek: for en personbil av model 2006
// eller senare ar skatten 360 kr i grundbelopp plus 11 kr per gram koldioxid
// over 111 g/km vid blandad korning. Detta ar grundformeln, inte malus;
// malus ligger ovanpa i tre ar for bilar over 75 g/km och star kvar som
// kontext i fordonsskattens ledtext.
// Kalla: transportstyrelsen.se/.../fordonsskatt/skattens-storlek/
const FORDONSSKATT_GRUND = 360;
const FORDONSSKATT_KR_PER_GRAM = 11;
const FORDONSSKATT_FRI_GRAM = 111;

// Appens default for fordonsskatt ar den har formeln utvarderad for en
// bensinbil pa 150 g CO2/km, ett rimligt varde for en begagnad bil i den
// storlek appen annars utgar fran. Formeln ar kallbelagd, de 150 grammen ar
// det inte, sa ledtexten sager bada delarna. Rakna aldrig ut siffran for hand
// och skriv in den: da ar den ratt for exakt ett utslapp.
function fordonsskatt(co2GramPerKm) {
  return FORDONSSKATT_GRUND + FORDONSSKATT_KR_PER_GRAM * Math.max(0, co2GramPerKm - FORDONSSKATT_FRI_GRAM);
}
const DEFAULT_CO2_GRAM = 150;

// RantaPaRanta's own default for its "monthly" control (see
// ../RantaPaRanta/script.js CONTROLS). Duplicated here only so the "omit
// defaults" rule of the URL handover contract can be honoured from this side
// too. Keep in sync if that default is ever revised.
const RANTA_DEFAULT_MONTHLY = 1000;

// ---------- car model ----------

// Declining-balance value curve: each year the car loses a fixed share of its
// CURRENT value, split into a time-driven share (depTime) and a mileage-driven
// share (depMil, per 1000 mil driven that year). Applied multiplicatively, time
// first, so the mileage share bites on what time has already taken off. This
// is what makes depreciation steepest in year one: the rate is constant, but it
// is a constant fraction of a shrinking number, so the kronor amount shrinks
// with it. A flat kr/year model cannot produce that shape; this can, by
// construction.
//
// The value curve and the fixed/marginal split are computed against TWO
// trajectories on purpose. "value" is the real one: time and mileage compound
// on top of each other year over year, and it is what the chart draws.
// "timeOnlyValue" is a hypothetical curve with the mileage factor switched
// off entirely, used only to define timeDep. Driving more this year leaves a
// smaller base for time-decay to bite on next year, an interaction effect
// that is real but belongs to the cost of DRIVING, not the cost of owning.
// Computing timeDep from the mileage-free curve keeps it a pure function of
// depTime and price, so it truly cannot change when annualMil changes;
// mileageDep is then whatever is left of the actual depreciation, which is
// where that whole interaction effect ends up. That is what makes "fixed
// never reads annualMil" an actual invariant instead of an approximation.
function carValueSeries(p) {
  const Y = p.years;
  const value = new Float64Array(Y + 1);
  const timeOnlyValue = new Float64Array(Y + 1);
  const timeDep = new Float64Array(Y + 1);
  const mileageDep = new Float64Array(Y + 1);
  value[0] = p.price;
  timeOnlyValue[0] = p.price;
  const mileShare = p.depMil * (p.annualMil / 1000);
  for (let t = 1; t <= Y; t++) {
    value[t] = Math.max(0, value[t - 1] * (1 - p.depTime) * (1 - mileShare));
    timeOnlyValue[t] = timeOnlyValue[t - 1] * (1 - p.depTime);
    timeDep[t] = timeOnlyValue[t - 1] - timeOnlyValue[t];
    mileageDep[t] = value[t - 1] - value[t] - timeDep[t];
  }
  return { value: value, timeOnlyValue: timeOnlyValue, timeDep: timeDep, mileageDep: mileageDep };
}

// Service and repairs rise with the car's AGE, not with ownership year: a car
// bought used at age 3 starts this curve at age 3, not at age 0. That is the
// whole reason carAgeAtPurchase is its own control instead of folded into a
// single "starting service cost" slider.
function serviceSeries(p) {
  const Y = p.years;
  const out = new Float64Array(Y + 1);
  for (let t = 1; t <= Y; t++) {
    const age = p.carAgeAtPurchase + t - 1;
    out[t] = p.serviceBase * Math.pow(1 + p.serviceRise, age);
  }
  return out;
}

// Opportunity cost of the equity tied up in the car: what that money would
// have grown to had it been invested instead, over the same years, using the
// SAME compounding engine as every other app on this site. financedShare is
// money you never had, so it is excluded here and priced separately below
// (rantekostnad) instead: borrowed money is not money you could have invested,
// and adding both would price the same kronor twice.
function capitalCost(p) {
  const equity = p.price * (1 - p.financedShare);
  const bal = new Float64Array(p.years + 1);
  const contrib = new Float64Array(p.years + 1);
  simulate({ start: equity, monthly: 0, years: p.years, ret: p.ret, growth: 0, fee: 0, isk: false }, null, bal, contrib);
  return bal[p.years] - equity;
}

// Interest cost on the financed share: a real annuity schedule, from
// ../lib/mortgage.js, so this app does not carry a second implementation of
// loan arithmetic. Loan term is the ownership horizon, which is the one
// assumption left; the payment is then whatever clears the loan over that term.
//
// This used to be simple interest on half the loan, the straight-line
// approximation. An annuity pays the principal down more slowly, so it costs
// more interest at the same rate: at 6 % over 6 years on 125 000 kr the gap is
// about 1 700 kr. The old number was low, not conservative.
function interestCost(p) {
  const loan = p.price * p.financedShare;
  if (loan <= 0) return 0;
  return annuityInterestTotal(loan, p.interestRate, p.years * 12);
}

function fuelPerMil(p) {
  return p.electric ? (p.elecConsumption / 10) * p.elecPrice : (p.fuelConsumption / 10) * p.fuelPrice;
}

// The full model for one car: every cost line, summed over the ownership
// horizon, then split into what is fixed regardless of how much you drive and
// what is marginal per mil. The split is exact by construction: every fixed
// line's formula below never reads p.annualMil, so fixedAnnualTotal cannot
// change when annualMil changes, and marginalAnnualTotal is defined as
// everything else. Fixed + marginal therefore always equals the total; the
// test suite checks this holds, it does not need to be true by luck.
//
// Tyres and service are split, not moved: a share of each goes to the
// marginal bucket, the rest stays fixed, and the sum is untouched. The split
// is calibrated at the mileage the user stated, because that is what the two
// input controls already describe. "Mina däck håller fyra säsonger" and "en
// service kostar 3 000 kr" are statements about how this person drives, not
// about a car in the abstract, so the honest reading of tireMilShare is "av
// den däckkostnad du just angav, så stor del beror på körningen". Driving one
// more mil then costs tireMileageAnnual / annualMil, which is exactly the
// number "Dela på kostnaden" needs. What it does NOT do is raise the total
// when the mileage slider moves: a permanently higher mileage also shortens
// tireSeasons, and that is the user's control to move. Stated in the notes.
function computeCar(p) {
  const Y = p.years;
  const dep = carValueSeries(p);
  const service = serviceSeries(p);

  let sumTimeDep = 0;
  let sumMileageDep = 0;
  let sumService = 0;
  for (let t = 1; t <= Y; t++) {
    sumTimeDep += dep.timeDep[t];
    sumMileageDep += dep.mileageDep[t];
    sumService += service[t];
  }

  const capCost = capitalCost(p);
  const intCost = interestCost(p);
  const perMilFuel = fuelPerMil(p);
  const fuelTotal = perMilFuel * p.annualMil * Y;
  const tireAnnual = p.tireSeasons > 0 ? (2 * p.tireCost) / p.tireSeasons : 0;
  // The interval is in months, because Transportstyrelsen's real one is 14 and
  // a slider in whole years cannot express that.
  const besiktningAnnual = p.besiktningInterval > 0 ? (p.besiktningCost * 12) / p.besiktningInterval : 0;
  const parkingAnnual = p.parking * 12;

  const tireMileageAnnual = tireAnnual * p.tireMilShare;
  const tireFixedAnnual = tireAnnual - tireMileageAnnual;
  const serviceMileageTotal = sumService * p.serviceMilShare;
  const serviceFixedTotal = sumService - serviceMileageTotal;

  const fixedAnnualTotal =
    sumTimeDep +
    capCost +
    intCost +
    p.insurance * Y +
    p.vehicleTax * Y +
    besiktningAnnual * Y +
    tireFixedAnnual * Y +
    serviceFixedTotal +
    parkingAnnual * Y;
  const marginalAnnualTotal = fuelTotal + sumMileageDep + tireMileageAnnual * Y + serviceMileageTotal;
  const grandTotal = fixedAnnualTotal + marginalAnnualTotal;

  const months = Y * 12;
  const fixedMonthly = fixedAnnualTotal / months;
  const marginalPerMil = p.annualMil > 0 ? marginalAnnualTotal / (Y * p.annualMil) : perMilFuel;
  const totalMonthly = grandTotal / months;
  const krPerMil = p.annualMil > 0 ? grandTotal / (Y * p.annualMil) : NaN;

  return {
    dep: dep,
    service: service,
    sumTimeDep: sumTimeDep,
    sumMileageDep: sumMileageDep,
    sumService: sumService,
    capitalCostTotal: capCost,
    interestCostTotal: intCost,
    fuelTotal: fuelTotal,
    fuelPerMil: perMilFuel,
    tireAnnual: tireAnnual,
    tireMileageAnnual: tireMileageAnnual,
    tireFixedAnnual: tireFixedAnnual,
    serviceMileageTotal: serviceMileageTotal,
    serviceFixedTotal: serviceFixedTotal,
    besiktningAnnual: besiktningAnnual,
    fixedAnnualTotal: fixedAnnualTotal,
    marginalAnnualTotal: marginalAnnualTotal,
    grandTotal: grandTotal,
    fixedMonthly: fixedMonthly,
    marginalPerMil: marginalPerMil,
    totalMonthly: totalMonthly,
    krPerMil: krPerMil
  };
}

// Dela pa kostnaden. The driver owns the car regardless of who rides along, so
// the trip's true incremental cost is the MARGINAL cost, never a slice of the
// fixed costs the driver carries anyway. This just prices a trip under three
// candidate rates and splits it across everyone in the car, including the
// driver: it does not decide who should pay what, it makes the three answers
// visible as numbers.
function splitTripCost(ratePerMil, tripMil, passengers) {
  const occupants = 1 + Math.max(0, passengers);
  return (ratePerMil * tripMil) / occupants;
}

// ---------- URL handover to RantaPaRanta ----------
//
// One parameter, following the contract in finance/CLAUDE.md: plain number,
// dot decimal, default omitted. RantaPaRanta reads "monthly" itself and falls
// back to its own default for everything else, so this app only ever needs to
// state the one number it actually computed.
function buildRantaLink(monthlyValue) {
  if (!isFinite(monthlyValue)) return "../RantaPaRanta/";
  const v = Math.round(monthlyValue * 100) / 100;
  if (Math.abs(v - RANTA_DEFAULT_MONTHLY) < 1e-9) return "../RantaPaRanta/";
  return "../RantaPaRanta/?monthly=" + String(v);
}

function parseRantaLink(query) {
  const q = new URLSearchParams(query);
  const raw = q.get("monthly");
  if (raw === null) return null;
  const v = parseFloat(raw);
  return isFinite(v) ? v : null;
}

// ---------- controls ----------

const CONTROLS = [
  {
    id: "price",
    group: "basic",
    label: "Inköpspris",
    unit: "kr",
    min: 20000,
    max: 1000000,
    step: 5000,
    value: 250000,
    hint: "Vad bilen kostar dig i dag, inte listpriset."
  },
  {
    id: "years",
    group: "basic",
    label: "Ägandehorisont",
    unit: "år",
    min: 1,
    max: 15,
    step: 1,
    value: 6,
    hint: "Hur länge du planerar att äga bilen."
  },
  {
    id: "annualMil",
    group: "basic",
    label: "Körsträcka per år",
    unit: "mil",
    min: 200,
    max: 4000,
    step: 10,
    value: TRAFA_SNITT_MIL_2025,
    hint: "Snittet för svenska personbilar i trafik var 1 243 mil under 2025. Källa: Trafikanalys, Körsträckor 2025, tabell PB1."
  },
  {
    id: "financedShare",
    group: "basic",
    label: "Andel lånefinansierad",
    unit: "%",
    min: 0,
    max: 100,
    step: 5,
    value: 50,
    hint: "Resten är din egen insats, den som binder kapital."
  },
  {
    id: "ret",
    group: "capital",
    label: "Avkastning om pengarna investerats i stället",
    unit: "%",
    min: 0,
    max: 12,
    step: 0.1,
    value: 7,
    hint: "Samma default som Ränta på ränta har på sajten: branschens standardantagande för 100 % aktier, nominellt."
  },
  {
    id: "interestRate",
    group: "capital",
    label: "Ränta på billånet",
    unit: "%",
    min: 0,
    max: 15,
    step: 0.1,
    value: 6,
    hint: "Overifierat, jämför med din banks aktuella snitt för billån."
  },
  {
    id: "depTime",
    group: "value",
    label: "Värdeminskning, tid",
    unit: "%/år",
    min: 0,
    max: 40,
    step: 0.5,
    value: 15,
    hint: "Andel av aktuellt värde per år, oavsett körning. Overifierad grovskattning, nya bilar tappar ofta mer de första åren."
  },
  {
    id: "depMil",
    group: "value",
    label: "Värdeminskning, körsträcka",
    unit: "%/1000 mil/år",
    min: 0,
    max: 20,
    step: 0.5,
    value: 2,
    hint: "Extra andel av aktuellt värde, skalad mot hur mycket du kör. Overifierad grovskattning."
  },
  {
    id: "carAgeAtPurchase",
    group: "value",
    label: "Bilens ålder vid köp",
    unit: "år",
    min: 0,
    max: 20,
    step: 1,
    value: 3,
    hint: "Styr var på serviceåldern kalkylen börjar, inte värdeminskningen."
  },
  {
    id: "fuelConsumption",
    group: "drift",
    label: "Bränsleförbrukning",
    unit: "l/100km",
    min: 3,
    max: 15,
    step: 0.1,
    value: 6.5,
    hint: "Blandad körning. Används inte om elbil är valt nedan."
  },
  {
    id: "fuelPrice",
    group: "drift",
    label: "Bränslepris",
    unit: "kr/l",
    min: 10,
    max: 30,
    step: 0.5,
    value: 18.5,
    hint: "Overifierat, kolla dagens pris."
  },
  {
    id: "elecConsumption",
    group: "drift",
    label: "Elförbrukning",
    unit: "kWh/100km",
    min: 10,
    max: 30,
    step: 0.5,
    value: 18,
    hint: "Blandad körning. Används bara om elbil är valt."
  },
  {
    id: "elecPrice",
    group: "drift",
    label: "Elpris",
    unit: "kr/kWh",
    min: 0.5,
    max: 6,
    step: 0.1,
    value: Math.round(SCB_ELPRIS_ORE_2025H2 / 10) / 10,
    hint:
      "Totalpris för hushåll med 5 000 till 15 000 kWh/år, inklusive nät, elskatt och moms: 239,84 öre/kWh under andra halvåret 2025. " +
      "Källa: SCB, Elpriser och elavtal. Ditt elområde och avtal kan avvika rejält."
  },
  {
    id: "insurance",
    group: "drift",
    label: "Försäkring",
    unit: "kr/år",
    min: 1000,
    max: 30000,
    step: 500,
    value: 8000,
    hint: "Overifierat, varierar starkt med förare, ort och bilmodell."
  },
  {
    id: "vehicleTax",
    group: "drift",
    label: "Fordonsskatt",
    unit: "kr/år",
    min: 0,
    max: 20000,
    step: 1,
    value: fordonsskatt(DEFAULT_CO2_GRAM),
    hint:
      "Grundformeln är 360 kr plus 11 kr per gram CO2 över 111 g/km. Defaulten är den formeln för en bensinbil på 150 g/km. " +
      "En ny bil över 75 g/km betalar malus ovanpå i 3 år: 107 kr/g upp till 125 g, sedan 132 kr/g. Källa: transportstyrelsen.se."
  },
  {
    id: "besiktningCost",
    group: "drift",
    label: "Besiktning",
    unit: "kr/tillfälle",
    min: 0,
    max: 2000,
    step: 50,
    value: 500,
    hint: "Overifierat, varierar per station."
  },
  {
    id: "besiktningInterval",
    group: "drift",
    label: "Besiktning, intervall",
    unit: "månader",
    min: 12,
    max: 48,
    step: 1,
    value: 14,
    hint:
      "Transportstyrelsens regel: först efter 36 månader, nästa 24 månader senare, sedan var 14:e månad. " +
      "Modellen kör ett jämnt intervall, och 14 månader är det en bil äldre än fem år faktiskt ligger på."
  },
  {
    id: "tireCost",
    group: "drift",
    label: "Däck, kostnad per sats",
    unit: "kr",
    min: 1000,
    max: 30000,
    step: 500,
    value: 6000,
    hint: "En sats (sommar eller vinter). Overifierat."
  },
  {
    id: "tireSeasons",
    group: "drift",
    label: "Däck, hur länge en sats håller",
    unit: "säsonger",
    min: 1,
    max: 8,
    step: 1,
    value: 4,
    hint: "Antas kräva två satser (sommar och vinter) samtidigt."
  },
  {
    id: "tireMilShare",
    group: "drift",
    label: "Däck, andel som drivs av körsträckan",
    unit: "%",
    min: 0,
    max: 100,
    step: 5,
    value: 70,
    hint: "Resten åldras bort oavsett körning: gummi hårdnar, och en sats byts sällan senare än vid sex år. Overifierat."
  },
  {
    id: "serviceBase",
    group: "drift",
    label: "Service och reparationer, ny bil",
    unit: "kr/år",
    min: 0,
    max: 30000,
    step: 500,
    value: 3000,
    hint: "Overifierat, kostnad vid ålder noll."
  },
  {
    id: "serviceRise",
    group: "drift",
    label: "Service och reparationer, ökning med ålder",
    unit: "%/år",
    min: 0,
    max: 30,
    step: 1,
    value: 12,
    hint: "Modellantagande, inte en uppmätt siffra: reparationer blir dyrare och vanligare med bilens ålder."
  },
  {
    id: "serviceMilShare",
    group: "drift",
    label: "Service, andel som drivs av körsträckan",
    unit: "%",
    min: 0,
    max: 100,
    step: 5,
    value: 50,
    hint: "Olja, bromsar och kopplingar slits av mil. Rost, gummi och batteri gör det inte. Overifierat."
  },
  {
    id: "parking",
    group: "drift",
    label: "Parkering",
    unit: "kr/mån",
    min: 0,
    max: 5000,
    step: 50,
    value: 0,
    hint: "Valfri post, 0 om du inte betalar för parkering."
  }
];

// Fields that differ between the two cars in jamforelselaget. Derived from
// CONTROLS rather than hand-duplicated, so a slider's min/max/step can never
// drift out of sync between car A and car B.
const CAR_B_IDS = [
  "price",
  "depTime",
  "depMil",
  "carAgeAtPurchase",
  "fuelConsumption",
  "fuelPrice",
  "elecConsumption",
  "elecPrice",
  "insurance",
  "vehicleTax",
  "tireCost",
  "serviceBase",
  "serviceRise"
];

const CONTROLS_B = CAR_B_IDS.map((id) => {
  const base = CONTROLS.find((c) => c.id === id);
  return Object.assign({}, base, { id: id + "B", label: base.label + " (bil B)" });
});

// Situations, not implementations: only the facts about the car and how it is
// used, never the honesty knobs (ret, interestRate, depreciation rates,
// serviceRise stay untouched).
const PRESETS = [
  {
    name: "Nyare bensinbil, delvis lånad",
    v: { price: 280000, years: 6, annualMil: 1300, financedShare: 60, carAgeAtPurchase: 1, fuelConsumption: 6.5 }
  },
  {
    name: "Begagnad, kontant",
    v: { price: 90000, years: 6, annualMil: 1000, financedShare: 0, carAgeAtPurchase: 8, fuelConsumption: 7.5 }
  },
  {
    name: "Ny elbil, mycket körning",
    v: { price: 400000, years: 8, annualMil: 2000, financedShare: 70, carAgeAtPurchase: 0, elecConsumption: 17 }
  },
  {
    name: "Firmabilsmässig pendlare",
    v: { price: 220000, years: 4, annualMil: 2200, financedShare: 80, carAgeAtPurchase: 2, fuelConsumption: 6 }
  }
];

// ---------- DOM wiring ----------

const el = {};
let flags = { electric: false, electricB: false, compare: false };

function readControlValue(id) {
  return el[id] ? parseField(el[id].num.value) : NaN;
}

function paramsFor(suffix) {
  const g = (id) => {
    const v = readControlValue(id + suffix);
    const spec = CONTROLS.find((c) => c.id === id) || CONTROLS_B.find((c) => c.id === id + "B");
    return isFinite(v) ? v : spec.value;
  };
  // Shared across both cars: how you use it and how you finance it.
  const shared = {
    years: readControlValue("years"),
    annualMil: readControlValue("annualMil"),
    financedShare: readControlValue("financedShare") / 100,
    ret: readControlValue("ret") / 100,
    interestRate: readControlValue("interestRate") / 100,
    besiktningCost: readControlValue("besiktningCost"),
    besiktningInterval: readControlValue("besiktningInterval"),
    tireSeasons: readControlValue("tireSeasons"),
    tireMilShare: readControlValue("tireMilShare") / 100,
    serviceMilShare: readControlValue("serviceMilShare") / 100,
    parking: readControlValue("parking")
  };
  const electric = suffix === "B" ? flags.electricB : flags.electric;
  return Object.assign({}, shared, {
    price: g("price"),
    depTime: g("depTime") / 100,
    depMil: g("depMil") / 100,
    carAgeAtPurchase: g("carAgeAtPurchase"),
    electric: electric,
    fuelConsumption: g("fuelConsumption"),
    fuelPrice: g("fuelPrice"),
    elecConsumption: g("elecConsumption"),
    elecPrice: g("elecPrice"),
    insurance: g("insurance"),
    vehicleTax: g("vehicleTax"),
    tireCost: g("tireCost"),
    serviceBase: g("serviceBase"),
    serviceRise: g("serviceRise") / 100
  });
}

function buildControls(hostId, list, elStore) {
  const host = document.getElementById(hostId);
  list.forEach((c) => {
    const wrap = document.createElement("div");
    wrap.className = "ctl";
    wrap.innerHTML =
      '<div class="ctl-head"><label class="ctl-label" for="n-' +
      c.id +
      '">' +
      c.label +
      "</label>" +
      '<span class="ctl-value"><input type="text" inputmode="decimal" id="n-' +
      c.id +
      '" value="' +
      fieldText(c, c.value) +
      '" /><span class="ctl-unit">' +
      c.unit +
      "</span></span></div>" +
      '<div class="ctl-hint">' +
      (c.hint || "") +
      "</div>" +
      '<input type="range" id="r-' +
      c.id +
      '" aria-label="' +
      c.label +
      ', reglage" min="0" max="' +
      SLIDER_STEPS +
      '" step="1" value="' +
      valueToSlider(c, c.value) +
      '" />';
    host.appendChild(wrap);

    const num = wrap.querySelector("#n-" + c.id);
    const rng = wrap.querySelector("#r-" + c.id);
    elStore[c.id] = { num: num, rng: rng, spec: c };

    rng.addEventListener("input", () => {
      num.value = fieldText(c, sliderToValue(c, +rng.value));
      schedule();
    });
    num.addEventListener("input", () => {
      const v = parseField(num.value);
      if (isFinite(v)) rng.value = valueToSlider(c, v);
      schedule();
    });
    num.addEventListener("blur", () => {
      const v = parseField(num.value);
      num.value = fieldText(c, isFinite(v) ? Math.min(c.max, Math.max(c.min, v)) : c.value);
      schedule();
    });
  });
}

function setControl(id, value) {
  const store = el[id];
  if (!store) return;
  const c = store.spec;
  const v = Math.min(c.max, Math.max(c.min, value));
  store.num.value = fieldText(c, v);
  store.rng.value = valueToSlider(c, v);
}

function buildPresets(hostId, list) {
  const host = document.getElementById(hostId);
  list.forEach((preset) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = preset.name;
    b.addEventListener("click", () => {
      Object.keys(preset.v).forEach((id) => setControl(id, preset.v[id]));
      document.querySelectorAll("#presets button").forEach((o) => o.classList.remove("active"));
      b.classList.add("active");
      render();
    });
    host.appendChild(b);
  });
}

// ---------- render ----------

function statRow(k, v, n, neg) {
  return (
    '<div class="stat"><div class="stat-k">' +
    k +
    '</div><div class="stat-v' +
    (neg ? " neg" : "") +
    '">' +
    v +
    '</div><div class="stat-n">' +
    n +
    "</div></div>"
  );
}

function render() {
  const p = paramsFor("");
  const result = computeCar(p);

  el.headlineTotal.textContent = kr(result.totalMonthly) + " / mån";
  el.headlineSplit.innerHTML =
    "Varav <b>" +
    kr(result.fixedMonthly) +
    "</b> fast, oavsett körning, och <b>" +
    NF2.format(result.marginalPerMil) +
    " kr</b> per mil du kör.";
  el.headlineKrMil.textContent = isFinite(result.krPerMil) ? NF2.format(result.krPerMil) + " kr/mil" : "-";

  const stats = [
    ["Värdeminskning", kr((result.sumTimeDep + result.sumMileageDep) / p.years), "per år i snitt, störst de första åren", false],
    ["Kapitalkostnad", kr(result.capitalCostTotal / p.years), "per år, alternativkostnad på din egen insats", false],
    ["Räntekostnad", kr(result.interestCostTotal / p.years), "per år, på den lånade delen", false],
    ["Drivmedel", kr(result.fuelTotal / p.years), "per år, " + NF2.format(result.fuelPerMil) + " kr/mil", false],
    ["Försäkring och skatt", kr((p.insurance + p.vehicleTax) * 1), "per år", false],
    ["Besiktning, däck, service", kr(result.besiktningAnnual + result.tireAnnual + result.sumService / p.years), "per år i snitt", false],
    ["Totalt över horisonten", kr(result.grandTotal), "över " + p.years + " år, allt inräknat", false]
  ];
  el.stats.innerHTML = stats.map((s) => statRow(s[0], s[1], s[2], s[3])).join("");

  drawValueChart(result, p);
  renderCompare(result, p);
  renderShare(result);
}

// Bars are centred on their tick, so the first and last need half a bar of room
// inside the axes. Without the inset, x(0) sits exactly on the y axis and half of
// the first bar covers the axis labels, which is how it shipped.
function plotX(l, pw, Y, barW) {
  const inset = barW / 2;
  const span = Math.max(1, pw - barW);
  return (t) => l + inset + (span * t) / Y;
}

function drawValueChart(result, p) {
  const Y = p.years;
  const W = 1000;
  const s = Math.max(1, Math.min(3.2, W / (el.chart.clientWidth || W)));
  const M = { l: 68 * s, r: 12 * s, t: 16 * s, b: 30 * s };
  const H = Math.round(280 * Math.min(2.05, s));
  const font = 12 * s;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;

  let max = result.dep.value[0];
  const TICKS = 4;
  let step = niceStep((max * 1.04) / TICKS);
  while (step * TICKS < max) step = niceStep(step * 1.05);
  max = step * TICKS;

  const yy = (v) => M.t + ph - (ph * v) / (max || 1);
  const barW = Math.max(2, Math.min(26 * s, (pw / (Y + 1)) * 0.68));
  const x = plotX(M.l, pw, Y, barW);

  let svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img">';
  for (let i = 0; i <= TICKS; i++) {
    const gv = (max * i) / TICKS;
    const gy = yy(gv);
    svg +=
      '<line x1="' +
      M.l +
      '" y1="' +
      gy +
      '" x2="' +
      (W - M.r) +
      '" y2="' +
      gy +
      '" stroke="#242734" stroke-width="' +
      s +
      '"/>' +
      '<text x="' +
      (M.l - 10 * s) +
      '" y="' +
      (gy + 4 * s) +
      '" fill="#5c6070" font-size="' +
      font +
      '" text-anchor="end">' +
      krShort(gv) +
      "</text>";
  }
  for (let t = 0; t <= Y; t++) {
    const bx = x(t) - barW / 2;
    const v = result.dep.value[t];
    const h = yy(0) - yy(v);
    svg +=
      '<rect x="' +
      bx.toFixed(1) +
      '" y="' +
      yy(v).toFixed(1) +
      '" width="' +
      barW.toFixed(1) +
      '" height="' +
      h.toFixed(1) +
      '" fill="#4a7cff"/>';
  }
  svg += '<line x1="' + M.l + '" y1="' + yy(0) + '" x2="' + (W - M.r) + '" y2="' + yy(0) + '" stroke="#3a3f52" stroke-width="' + s + '"/>';
  for (let t = 0; t <= Y; t++) {
    svg += '<text x="' + x(t) + '" y="' + (H - 8 * s) + '" fill="#5c6070" font-size="' + font + '" text-anchor="middle">' + t + "</text>";
  }
  svg += "</svg>";
  el.chart.innerHTML = svg;
}

function renderCompare(resultA, pShared) {
  el.compareWrap.classList.toggle("on", flags.compare);
  if (!flags.compare) return;
  const pB = paramsFor("B");
  const resultB = computeCar(pB);
  const delta = resultA.totalMonthly - resultB.totalMonthly;
  const cheaper = delta > 0 ? "B" : delta < 0 ? "A" : null;
  const abs = Math.abs(delta);

  el.compareResult.innerHTML =
    (cheaper ? "Bil " + cheaper + " kostar " + kr(abs) + " mindre per månad." : "Bilarna kostar lika mycket per månad.") +
    "<br>Bil A: " +
    kr(resultA.totalMonthly) +
    " / mån &middot; Bil B: " +
    kr(resultB.totalMonthly) +
    " / mån";

  const link = buildRantaLink(abs);
  el.compareLink.href = link;
  el.compareLink.textContent = cheaper
    ? "Se vad " + kr(abs) + "/mån är värt sparat i " + Math.round(pShared.years) + " år"
    : "Öppna Ränta på ränta";
}

function renderShare(result) {
  const tripMil = readControlValue("tripMil");
  const passengers = readControlValue("passengers");
  const t = isFinite(tripMil) ? tripMil : 0;
  const n = isFinite(passengers) ? passengers : 0;

  const rows = [
    ["Bara bränsle", result.fuelPerMil],
    ["Skatteverkets schablon (25 kr/mil)", SKV_MIL_ERSATTNING],
    ["Bilens egen marginalkostnad", result.marginalPerMil]
  ];
  el.shareRows.innerHTML = rows
    .map((r) => "<div class='share-row'><span>" + r[0] + "</span><b>" + NF2.format(splitTripCost(r[1], t, n)) + " kr</b></div>")
    .join("");
}

// ---------- init ----------

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    render();
  });
}

// Fuel and electric fields live in their own hosts, not just their own rows,
// because only one set applies at a time (rule: bransletyp is a toggle, not
// two lines that are both always shown). Splitting the host is what lets
// buildControls stay the same simple function used everywhere else on this
// page instead of growing a visibility flag per control.
const FUEL_IDS = ["fuelConsumption", "fuelPrice"];
const ELEC_IDS = ["elecConsumption", "elecPrice"];

function init() {
  buildControls(
    "basic",
    CONTROLS.filter((c) => c.group === "basic"),
    el
  );
  buildControls(
    "capital",
    CONTROLS.filter((c) => c.group === "capital"),
    el
  );
  buildControls(
    "value",
    CONTROLS.filter((c) => c.group === "value"),
    el
  );
  buildControls(
    "drift",
    CONTROLS.filter((c) => c.group === "drift" && FUEL_IDS.indexOf(c.id) === -1 && ELEC_IDS.indexOf(c.id) === -1),
    el
  );
  buildControls(
    "fuel-fields",
    CONTROLS.filter((c) => FUEL_IDS.indexOf(c.id) !== -1),
    el
  );
  buildControls(
    "elec-fields",
    CONTROLS.filter((c) => ELEC_IDS.indexOf(c.id) !== -1),
    el
  );

  buildControls(
    "compare-b",
    CONTROLS_B.filter((c) => FUEL_IDS.indexOf(c.id.slice(0, -1)) === -1 && ELEC_IDS.indexOf(c.id.slice(0, -1)) === -1),
    el
  );
  buildControls(
    "fuel-fields-b",
    CONTROLS_B.filter((c) => FUEL_IDS.indexOf(c.id.slice(0, -1)) !== -1),
    el
  );
  buildControls(
    "elec-fields-b",
    CONTROLS_B.filter((c) => ELEC_IDS.indexOf(c.id.slice(0, -1)) !== -1),
    el
  );
  buildPresets("presets", PRESETS);

  el.stats = document.getElementById("stats");
  el.chart = document.getElementById("chart");
  el.headlineTotal = document.getElementById("headline-total");
  el.headlineSplit = document.getElementById("headline-split");
  el.headlineKrMil = document.getElementById("headline-krmil");
  el.compareWrap = document.getElementById("compare-wrap");
  el.compareResult = document.getElementById("compare-result");
  el.compareLink = document.getElementById("compare-link");
  el.shareRows = document.getElementById("share-rows");

  el.electric = document.getElementById("electric");
  el.electricB = document.getElementById("electricB");
  el.compare = document.getElementById("compare");
  el.tripMil = { num: document.getElementById("n-tripMil") };
  el.passengers = { num: document.getElementById("n-passengers") };

  el.electric.addEventListener("change", () => {
    flags.electric = el.electric.checked;
    document.getElementById("fuel-fields").classList.toggle("hidden", flags.electric);
    document.getElementById("elec-fields").classList.toggle("hidden", !flags.electric);
    schedule();
  });
  el.electricB.addEventListener("change", () => {
    flags.electricB = el.electricB.checked;
    document.getElementById("fuel-fields-b").classList.toggle("hidden", flags.electricB);
    document.getElementById("elec-fields-b").classList.toggle("hidden", !flags.electricB);
    schedule();
  });
  el.compare.addEventListener("change", () => {
    flags.compare = el.compare.checked;
    schedule();
  });
  [el.tripMil.num, el.passengers.num].forEach((n) => n.addEventListener("input", schedule));

  window.addEventListener("resize", () => {
    if (el.chart.firstChild) render();
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
