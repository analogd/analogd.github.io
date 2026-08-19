"use strict";

// När kan jag sluta: lägsta möjliga pensionsålder där livsvarig månadsinkomst
// efter skatt håller sig över ett golv, även efter att tidsbegränsade
// utbetalningar tagit slut.
//
// lib/engine.js, lib/ui.js och lib/pension.js laddas före den här filen.
// Modellsammansättningen (incomeCurve/evaluate/searchEarliest) lever här,
// inte i lib/, eftersom det är appens egen fråga, inte delad aritmetik:
// BilTCO håller computeCar här av samma skäl och delar bara annuityPayment.

// UI, chart och URL-tillstånd lever i den här filen (steg 4-7 i
// implementationsplanen), enligt samma uppdelning som RantaPaRanta och BilTCO:
// lib/*.js håller aritmetiken, appens egen script.js håller sammansättningen
// och DOM:en.

// ---------- kurvan för en given pensionsålder ----------

// En rad är en tjänstepension eller ett privat/ISK-sparande (aldrig allmän
// pension, den räknas separat via globals nedan eftersom den inte är en
// kapitalpott utan en delningstalsprognos). Formen:
//   { kind: 1|2, mode: 0|1, cap, mon, refage, start, years, liv, flex,
//     minstart, contrib }
// kind: 1 tjänste, 2 privat. mode: 0 kapital känt, 1 månadsbelopp känt.
// liv/flex: 0/1-flaggor. contrib: kr/mån, avsättning fram till start,
// endast för mode 0.

// När en rad faktiskt betalar ut, givet den kandiderade pensionsåldern A.
function rowWindow(row, A) {
  const start = row.flex ? Math.max(A, row.minstart) : row.start;
  const end = row.liv ? Infinity : start + row.years;
  return { start: start, end: end };
}

// Bruttobelopp per månad från en enskild rad vid en given ålder, för en
// given kandiderad pensionsålder A (som avgör när en flex-rad startar och,
// via ackumuleringstiden till start, hur stort kapitalet hinner bli).
function rowGrossMonthly(row, globals, A, age) {
  const w = rowWindow(row, A);
  if (age < w.start || age >= w.end) return 0;

  if (row.mode === 1) {
    // Känt månadsbelopp, giltigt bara vid row.refage. Att flexa starten bär
    // beloppet ojusterat, en dokumenterad förenkling (se "vad den inte gör").
    return row.mon;
  }

  const yearsToStart = Math.max(0, w.start - globals.currentAge);
  const capitalAtStart = growCapitalWithContrib(row.cap, row.contrib || 0, globals.realReturn, yearsToStart);
  if (row.liv) {
    return monthlyFromCapitalLifelong(capitalAtStart, globals.realReturn, w.start, globals.horizonAge);
  }
  return monthlyFromCapital(capitalAtStart, globals.realReturn, row.years * 12);
}

// Allmän pension vid en given ålder, givet den kandiderade pensionsåldern A:
// delningstalskvoten flyttar prognosen, och att sluta arbeta före
// globals.allmanRefAge kostar de uteblivna årens pensionsrätt.
function allmanGrossMonthly(globals, A, age) {
  const bas = allmanMonthlyAtAge({
    monthlyAtRef: globals.allmanMonthly,
    refAge: globals.allmanRefAge,
    age: age,
    table: globals.table
  });
  const yearsNotWorked = Math.max(0, globals.allmanRefAge - A);
  const pensionsratt = pensionsrattPerYear(globals.income, globals.ibb);
  const shortfall = allmanShortfallMonthly({
    pensionsratt: pensionsratt,
    yearsNotWorked: yearsNotWorked,
    age: age,
    table: globals.table,
    realReturn: globals.realReturn
  });
  return Math.max(0, bas - shortfall);
}

// Inkomstkurvan från den kandiderade pensionsåldern A till globals.maxAge,
// ett värde per beskattningsår (ageAtYearStart = heltalsålder). Det är
// exakt den här kurvan som har "klippan" när en tidsbegränsad utbetalning
// tar slut, eftersom varje källa håller sitt eget fönster.
function incomeCurve(rows, globals, A) {
  const firstYear = Math.floor(A);
  const curve = [];
  for (let age = firstYear; age <= globals.maxAge; age++) {
    const grossPerSource = rows.map((row) => rowGrossMonthly(row, globals, A, age));
    const grossAllman = allmanGrossMonthly(globals, A, age);
    const grossMonthly = grossAllman + grossPerSource.reduce((s, v) => s + v, 0);
    const grossYearly = grossMonthly * 12;
    const skatt = inkomstskattPension({
      yearly: grossYearly,
      ageAtYearStart: age,
      pbb: globals.pbb,
      kommunalskatt: globals.kommunalskatt,
      skiktgrans: globals.skiktgrans
    });
    curve.push({
      age: age,
      grossAllman: grossAllman,
      grossPerSource: grossPerSource,
      grossYearly: grossYearly,
      netYearly: skatt.netYearly,
      netMonthly: skatt.netYearly / 12
    });
  }
  return curve;
}

// ---------- de två villkoren ----------
//
// 1. Golvet: nettot får aldrig understiga floor.
// 2. Fallet: nettot får aldrig falla under (1-dropTol) av startnivån.
// Båda rapporteras separat, eftersom VARFÖR en ålder underkänns är det
// användbara: "för lite direkt" är ett annat problem än "håller inte efter
// klippan vid 75".
function evaluate(curve, floor, dropTol) {
  const startNet = curve[0].netMonthly;
  let minNet = Infinity;
  let minAtAge = curve[0].age;
  let cliffAge = null;
  let cliffDropKr = 0;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i].netMonthly < minNet) {
      minNet = curve[i].netMonthly;
      minAtAge = curve[i].age;
    }
    if (i > 0) {
      const drop = curve[i - 1].netMonthly - curve[i].netMonthly;
      if (drop > cliffDropKr) {
        cliffDropKr = drop;
        cliffAge = curve[i].age;
      }
    }
  }
  const okFloor = curve.every((c) => c.netMonthly >= floor);
  const dropFloor = (1 - dropTol) * startNet;
  const okDrop = curve.every((c) => c.netMonthly >= dropFloor);
  const worstDropPct = startNet > 0 ? 1 - minNet / startNet : 0;
  return {
    startNet: startNet,
    minNet: minNet,
    minAtAge: minAtAge,
    okFloor: okFloor,
    okDrop: okDrop,
    ok: okFloor && okDrop,
    worstDropPct: worstDropPct,
    cliffAge: cliffAge,
    cliffDropKr: cliffDropKr
  };
}

// ---------- sökningen ----------
//
// Linjär skanning i enmånadssteg, INTE binärsökning: uppfyllbarheten är
// bevisbart icke-monoton i A (en icke-flexibel rads fasta startålder,
// delningstalskurvan och förhöjt-grundavdrag-steget kan alla göra en äldre
// kandidat sämre än en yngre). Se testet
// "uppfyllbarheten är inte monoton" i test/scenarios.mjs, det är skälet
// den här inte får bli en binärsökning i en framtida "optimering".
function searchEarliest(rows, globals) {
  const map = [];
  const stepMonths = 1;
  const startCents = Math.round(globals.minSearchAge * 12);
  const endCents = Math.round(globals.maxSearchAge * 12);
  for (let m = startCents; m <= endCents; m += stepMonths) {
    const A = m / 12;
    const curve = incomeCurve(rows, globals, A);
    const ev = evaluate(curve, globals.floor, globals.dropTol);
    map.push({
      age: A,
      ok: ev.ok,
      okFloor: ev.okFloor,
      okDrop: ev.okDrop,
      // Den naiva golvtesten är bara FÖRSTA årets nettobelopp mot golvet,
      // exakt det en engångsprognos (minPension vid en vald ålder) visar.
      // ev.okFloor prövar golvet över HELA kurvan (rätt för det ärliga
      // villkoret, se evaluate()), men skulle den återanvändas här hade
      // "naiv" tyst blivit "golvet håller för alltid, fallet struntar vi i"
      // i stället för "bara det första året räknas", planens definition.
      okFloorFirstYear: curve[0].netMonthly >= globals.floor,
      startNet: ev.startNet,
      minNet: ev.minNet,
      minAtAge: ev.minAtAge
    });
  }
  const firstOk = map.find((r) => r.ok);
  const firstNaiveOk = map.find((r) => r.okFloorFirstYear);
  return {
    earliest: firstOk ? firstOk.age : null,
    earliestNaive: firstNaiveOk ? firstNaiveOk.age : null,
    map: map
  };
}

// ---------- globala kontroller (situation + ärlighetsknappar) ----------
//
// "rows" är en strukturell kontroll, inte en ärlighetsknapp: den styr hur
// många av de MAX_ROWS radkorten som räknas som aktiva, se "rader" nedan.
// Presets sätter den (radsettet är ett situationsfaktum), men den är inte i
// listan över knappar presets aldrig får röra.
const MAX_ROWS = 6;

const CONTROLS = [
  {
    id: "currentAge",
    group: "situation",
    label: "Din ålder nu",
    unit: "år",
    min: 40,
    max: 75,
    step: 1,
    value: 50
  },
  {
    id: "income",
    group: "situation",
    label: "Årslön nu",
    unit: "kr",
    min: 0,
    max: 1200000,
    step: 10000,
    value: 480000,
    hint: "Används för allmän pensions bortfallsberäkning och brytpunkten, inte för skatten på pensionen."
  },
  {
    id: "rows",
    group: "situation",
    label: "Antal pensionsrader",
    unit: "st",
    min: 1,
    max: MAX_ROWS,
    step: 1,
    value: 3,
    hint: "Tjänstepensioner och privat/ISK-sparande, en rad per källa. Allmän pension räknas separat ovan."
  },
  {
    id: "floor",
    group: "situation",
    label: "Golv: lägsta acceptabla nettoinkomst",
    unit: "kr",
    min: 5000,
    max: 40000,
    step: 500,
    value: 15000,
    hint: "Det är X i frågan: nettot per månad får aldrig understiga detta, hela vägen till maxåldern."
  },
  {
    id: "allmanMonthly",
    group: "situation",
    label: "Allmän pension enligt prognos",
    unit: "kr",
    min: 0,
    max: 30000,
    step: 500,
    value: 12000,
    hint: "Läs av från minPension.se eller Pensionsmyndighetens prognos, vid den ålder du anger nedan."
  },
  {
    id: "allmanRefAge",
    group: "situation",
    label: "...vid den åldern",
    unit: "år",
    min: 61,
    max: 70,
    step: 1,
    value: 65,
    hint: "Åldern prognosen ovan gäller för. Flyttas till andra åldrar med delningstalskvoten."
  },
  {
    id: "inflation",
    group: "honesty",
    label: "Inflation (KPI)",
    unit: "%",
    min: 0,
    max: 8,
    step: 0.1,
    value: 2,
    hint: "Riksbankens mål är 2 %. Används bara för att räkna om till nominella kronor i basväljaren."
  },
  {
    id: "drift",
    group: "honesty",
    label: "Standardglidning",
    unit: "%",
    min: 0,
    max: 3,
    step: 0.1,
    value: 1,
    hint: "Det KPI inte fångar: att normal standard flyttar sig uppåt. Samma default som Ränta på ränta."
  },
  {
    id: "dropTol",
    group: "honesty",
    label: "Falltolerans",
    unit: "%",
    min: 5,
    max: 50,
    step: 1,
    value: 20,
    hint: "Hur mycket nettot får sjunka under startnivån innan det räknas som ett fall, inte bara en avtrappning."
  },
  {
    id: "realReturn",
    group: "honesty",
    label: "Real avkastning",
    unit: "%",
    min: -2,
    max: 8,
    step: 0.1,
    value: 2,
    hint: 'Efter inflation. Modellen räknar i reala termer hela vägen, se "vad den inte gör".'
  },
  {
    id: "horizonAge",
    group: "honesty",
    label: "Självannuitiseringshorisont",
    unit: "år",
    min: 80,
    max: 100,
    step: 1,
    value: 90,
    hint: 'Åldern en livsvarig kapitalpott antas räcka till. Ingen dödlighetspoolning, se "vad den inte gör".'
  },
  {
    id: "maxAge",
    group: "honesty",
    label: "Kurvans slutålder",
    unit: "år",
    min: 80,
    max: 105,
    step: 1,
    value: 95,
    hint: "Hur långt golv- och fallvillkoret prövas. Sätt den högre än du tror du behöver, inte lägre."
  },
  {
    id: "minSearchAge",
    group: "honesty",
    label: "Sökning: lägsta ålder",
    unit: "år",
    min: 55,
    max: 70,
    step: 1,
    value: 60
  },
  {
    id: "maxSearchAge",
    group: "honesty",
    label: "Sökning: högsta ålder",
    unit: "år",
    min: 65,
    max: 80,
    step: 1,
    value: 72
  },
  {
    id: "pbb",
    group: "honesty",
    label: "Prisbasbelopp",
    unit: "kr",
    min: 50000,
    max: 70000,
    step: 100,
    value: 59200,
    hint: "2026 års prisbasbelopp, 59 200 kr. Källa: SCB/regeringen. Styr grundavdraget."
  },
  {
    id: "ibb",
    group: "honesty",
    label: "Inkomstbasbelopp",
    unit: "kr",
    min: 60000,
    max: 100000,
    step: 100,
    value: 83400,
    hint: "2026 års inkomstbasbelopp, 83 400 kr. Källa: Pensionsmyndigheten. Styr 7,5-IBB-taket."
  },
  {
    id: "kommunalskatt",
    group: "honesty",
    label: "Kommunalskatt",
    unit: "%",
    min: 25,
    max: 35,
    step: 0.01,
    value: 32.41,
    hint: "Riksgenomsnittet 2025 (senast kända inför 2026), 32,41 %. Byt till din egen kommuns skattesats."
  },
  {
    id: "skiktgrans",
    group: "honesty",
    label: "Skiktgräns, statlig skatt",
    unit: "kr",
    min: 500000,
    max: 800000,
    step: 1000,
    value: 643000,
    hint: "2026 års skiktgräns, 643 000 kr beskattningsbar inkomst. Källa: Skatteverket."
  }
];

// Varje fält en pensionsrad kan ha, samma id-mönster för alla MAX_ROWS
// radkort: p{i}kind, p{i}mode, ... En rad är alltid tjänste (1) eller
// privat/ISK (2), aldrig allmän pension (kind 0), det räknas via CONTROLS
// ovan (allmanMonthly/allmanRefAge/income) i stället för som en radtyp,
// eftersom allmän pension inte är en kapitalpott utan en delningstalsprognos.
// Det är appens tolkning av planens "rad 0 är alltid kind 0, kan inte tas
// bort": den fasta allmän-pensions-blocket ÄR rad 0, aldrig en genererad
// p0-kontroll, så den kan strukturellt inte tas bort.
function rowFieldSpecs(i) {
  const p = "p" + i;
  return [
    { id: p + "kind", label: "Typ", unit: "1=tjänste, 2=privat/ISK", min: 1, max: 2, step: 1, value: 1 },
    { id: p + "mode", label: "Vad som är känt", unit: "0=kapital känt, 1=månadsbelopp känt", min: 0, max: 1, step: 1, value: 0 },
    { id: p + "cap", label: "Kapital", unit: "kr", min: 0, max: 5000000, step: 10000, value: 300000 },
    { id: p + "mon", label: "Månadsbelopp", unit: "kr/mån", min: 0, max: 50000, step: 100, value: 0 },
    { id: p + "refage", label: "...vid den åldern", unit: "år", min: 55, max: 80, step: 1, value: 65 },
    { id: p + "start", label: "Startålder", unit: "år", min: 55, max: 80, step: 1, value: 65 },
    { id: p + "years", label: "Antal år den betalas ut", unit: "år", min: 0, max: 30, step: 1, value: 10 },
    { id: p + "liv", label: "Livsvarig", unit: "0=nej, 1=ja", min: 0, max: 1, step: 1, value: 0 },
    { id: p + "flex", label: "Startar när jag går i pension", unit: "0=nej, 1=ja", min: 0, max: 1, step: 1, value: 1 },
    { id: p + "minstart", label: "Tidigast startålder", unit: "år", min: 55, max: 80, step: 1, value: 60 },
    { id: p + "contrib", label: "Fortsatt avsättning fram till start", unit: "kr/mån", min: 0, max: 20000, step: 100, value: 0 }
  ];
}

function rowControlSpecs(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push.apply(out, rowFieldSpecs(i));
  return out;
}

// Kontroller för URL-LÄSNING täcker alltid alla MAX_ROWS radkort, så en länk
// byggd av en app med fler rader tolkas korrekt av en med färre (varje
// utelämnad p{i}xxx faller tillbaka på sitt eget default). Kontroller för
// URL-SKRIVNING täcker bara de just nu aktiva raderna, så en dold rads gamla
// värden aldrig läcker in i en delad länk (privacy).
const ALL_ROW_CONTROLS = rowControlSpecs(MAX_ROWS);

function activeControls(rowsCount) {
  return CONTROLS.concat(rowControlSpecs(rowsCount));
}

// ---------- presets ----------
//
// Situationer, aldrig ärlighetsknappar (regel i finance/CLAUDE.md och i
// planen): realReturn, horizonAge, maxAge, dropTol, pbb, ibb, kommunalskatt,
// skiktgrans, minSearchAge/maxSearchAge rörs aldrig här. Syntetiska, runda
// belopp, generiska etiketter, aldrig Daniels riktiga institutioner eller
// belopp (se personuppgifts-avsnittet i planen).
const PRESETS = [
  {
    name: "Anställd, tre tjänstepensioner, en tidsbegränsad",
    v: {
      currentAge: 50,
      income: 450000,
      floor: 15000,
      allmanMonthly: 9000,
      allmanRefAge: 65,
      rows: 3,
      p1kind: 1,
      p1mode: 0,
      p1cap: 200000,
      p1liv: 1,
      p1flex: 1,
      p1minstart: 63,
      p1contrib: 0,
      p2kind: 1,
      p2mode: 1,
      p2mon: 14000,
      p2refage: 63,
      p2liv: 0,
      p2flex: 0,
      p2start: 63,
      p2years: 5,
      p3kind: 1,
      p3mode: 0,
      p3cap: 200000,
      p3liv: 1,
      p3flex: 1,
      p3minstart: 63,
      p3contrib: 2000
    },
    labels: ["Tjänstepension A, livsvarig", "Tjänstepension B, tidsbegränsad 5 år", "Tjänstepension C, livsvarig"]
  },
  {
    name: "Bara allmän pension och en liten tjänstepension",
    v: {
      currentAge: 55,
      income: 300000,
      floor: 9000,
      allmanMonthly: 9000,
      allmanRefAge: 65,
      rows: 1,
      p1kind: 1,
      p1mode: 0,
      p1cap: 150000,
      p1liv: 1,
      p1flex: 1,
      p1minstart: 64,
      p1contrib: 0
    },
    labels: ["Liten tjänstepension, livsvarig"]
  },
  {
    name: "Stort privat kapital, kort utbetalningstid",
    v: {
      currentAge: 50,
      income: 400000,
      floor: 11000,
      allmanMonthly: 10000,
      allmanRefAge: 65,
      rows: 1,
      p1kind: 2,
      p1mode: 0,
      p1cap: 3000000,
      p1liv: 0,
      p1flex: 0,
      p1start: 60,
      p1years: 3,
      p1contrib: 0
    },
    labels: ["Stort privat kapital, 3 år"]
  },
  {
    name: "Allt livsvarigt",
    v: {
      currentAge: 55,
      income: 400000,
      floor: 16000,
      allmanMonthly: 11000,
      allmanRefAge: 65,
      rows: 2,
      p1kind: 1,
      p1mode: 0,
      p1cap: 500000,
      p1liv: 1,
      p1flex: 1,
      p1minstart: 61,
      p1contrib: 0,
      p2kind: 2,
      p2mode: 0,
      p2cap: 300000,
      p2liv: 1,
      p2flex: 1,
      p2minstart: 61,
      p2contrib: 0
    },
    labels: ["Tjänstepension, livsvarig", "Privat/ISK, livsvarig"]
  }
];

// ---------- DOM: kontroller ----------

const el = {};

function readControlValue(id) {
  return el[id] ? parseField(el[id].num.value) : NaN;
}

// Samma widget-mönster som BilTCO/RantaPaRanta: text + slider, ingen
// omimplementering av fieldText/parseField/sliderToValue/valueToSlider.
function buildControlsInto(host, list, elStore) {
  list.forEach((c) => {
    const wrap = document.createElement("div");
    wrap.className = "ctl";
    wrap.dataset.field = c.id;
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
    elStore[c.id] = { num: num, rng: rng, spec: c, wrap: wrap };

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
  // Radens kind/mode/liv/flex-fält har ett <select>/checkbox-adapter i
  // stället för slider+textfält (se buildRowCard), och saknar därför rng.
  store.num.value = store.rng ? fieldText(c, v) : String(Math.round(v));
  if (store.rng) store.rng.value = valueToSlider(c, v);
}

// ---------- rader: MAX_ROWS radkort, bara "rows" av dem är aktiva ----------
//
// Alla MAX_ROWS korten finns i DOM:en hela tiden, bara dolda: att ta bort en
// rad och sen lägga tillbaka den återställer alltså vad man senast skrev in,
// i stället för att nollställa den. "Aktiv" avgörs enbart av rows-kontrollen.

const ROW_LABELS_DEFAULT = [];
for (let i = 1; i <= MAX_ROWS; i++) ROW_LABELS_DEFAULT.push("Rad " + i);
let rowLabels = ROW_LABELS_DEFAULT.slice();

const ROW_FIELD_HOST_FIELDS = ["cap", "contrib", "mon", "refage", "start", "minstart", "years"];

function buildRowCard(i) {
  const host = document.getElementById("rows-host");
  const specs = rowFieldSpecs(i);
  const byField = {};
  specs.forEach((s) => (byField[s.id.replace("p" + i, "")] = s));

  const card = document.createElement("div");
  card.className = "row-card";
  card.dataset.row = String(i);
  card.innerHTML =
    '<div class="row-head">' +
    '<input type="text" class="row-label" id="p' +
    i +
    'label" value="' +
    rowLabels[i - 1] +
    '" aria-label="Radens namn" />' +
    '<select class="row-kind" id="p' +
    i +
    'kind" aria-label="Typ av pensionskälla">' +
    '<option value="1">Tjänstepension</option><option value="2">Privat/ISK-sparande</option>' +
    "</select>" +
    '<button type="button" class="row-remove" data-row="' +
    i +
    '">Ta bort rad</button>' +
    "</div>" +
    '<div class="row-toggles">' +
    '<select class="row-mode" id="p' +
    i +
    'mode" aria-label="Vad som är känt">' +
    '<option value="0">Kapital känt</option><option value="1">Månadsbelopp känt</option>' +
    "</select>" +
    '<label><input type="checkbox" class="row-liv" id="p' +
    i +
    'liv" /> Livsvarig</label>' +
    '<label><input type="checkbox" class="row-flex" id="p' +
    i +
    'flex" checked /> Startar när jag går i pension</label>' +
    "</div>" +
    '<div class="controls row-fields" id="p' +
    i +
    'fields"></div>';
  host.appendChild(card);

  buildControlsInto(
    card.querySelector("#p" + i + "fields"),
    ROW_FIELD_HOST_FIELDS.map((f) => byField[f]),
    el
  );

  const kindSel = card.querySelector(".row-kind");
  const modeSel = card.querySelector(".row-mode");
  const livCb = card.querySelector(".row-liv");
  const flexCb = card.querySelector(".row-flex");
  const labelInput = card.querySelector(".row-label");

  // kind/mode/liv/flex läses via en liten adapter, inte via
  // buildControlsInto: en 1-2-slider är en sämre widget för en typ-väljare
  // än ett <select>, men parseUrlValues/buildUrlQuery bryr sig bara om ett
  // id och ett numeriskt värde, aldrig om vilken DOM-nod som äger det.
  el["p" + i + "kind"] = {
    num: {
      get value() {
        return kindSel.value;
      },
      set value(v) {
        kindSel.value = v;
      }
    },
    spec: byField.kind
  };
  el["p" + i + "mode"] = {
    num: {
      get value() {
        return modeSel.value;
      },
      set value(v) {
        modeSel.value = v;
      }
    },
    spec: byField.mode
  };
  el["p" + i + "liv"] = {
    num: {
      get value() {
        return livCb.checked ? "1" : "0";
      },
      set value(v) {
        livCb.checked = v === "1" || v === 1;
      }
    },
    spec: byField.liv
  };
  el["p" + i + "flex"] = {
    num: {
      get value() {
        return flexCb.checked ? "1" : "0";
      },
      set value(v) {
        flexCb.checked = v === "1" || v === 1;
      }
    },
    spec: byField.flex
  };

  const updateVisibility = () => {
    const mode = modeSel.value === "1" ? 1 : 0;
    const liv = livCb.checked;
    const flex = flexCb.checked;
    card.querySelector('[data-field="p' + i + 'cap"]').classList.toggle("hidden", mode !== 0);
    card.querySelector('[data-field="p' + i + 'contrib"]').classList.toggle("hidden", mode !== 0);
    card.querySelector('[data-field="p' + i + 'mon"]').classList.toggle("hidden", mode !== 1);
    card.querySelector('[data-field="p' + i + 'refage"]').classList.toggle("hidden", mode !== 1);
    card.querySelector('[data-field="p' + i + 'years"]').classList.toggle("hidden", liv);
    card.querySelector('[data-field="p' + i + 'start"]').classList.toggle("hidden", flex);
    card.querySelector('[data-field="p' + i + 'minstart"]').classList.toggle("hidden", !flex);
  };
  updateVisibility();
  card._updateVisibility = updateVisibility;

  kindSel.addEventListener("change", schedule);
  modeSel.addEventListener("change", () => {
    updateVisibility();
    schedule();
  });
  livCb.addEventListener("change", () => {
    updateVisibility();
    schedule();
  });
  flexCb.addEventListener("change", () => {
    updateVisibility();
    schedule();
  });
  labelInput.addEventListener("input", () => {
    rowLabels[i - 1] = labelInput.value;
  });
  card.querySelector(".row-remove").addEventListener("click", () => {
    const n = Math.round(readControlValue("rows"));
    if (n <= 1) return;
    // "Ta bort" på rad i flyttar de aktiva raderna ovanför ihop, precis som
    // att dra ur en byrålåda: det är enklare att förstå än att hålla reda på
    // vilket kortnummer som råkar vara ledigt.
    for (let k = i; k < n; k++) copyRowValues(k + 1, k);
    setControl("rows", n - 1);
    updateRowsVisibility();
    schedule();
  });

  return card;
}

function copyRowValues(from, to) {
  ["kind", "mode", "cap", "mon", "refage", "start", "years", "liv", "flex", "minstart", "contrib"].forEach((f) => {
    const src = el["p" + from + f];
    if (src) setControl("p" + to + f, parseField(String(src.num.value)));
  });
  rowLabels[to - 1] = rowLabels[from - 1];
  const lbl = document.getElementById("p" + to + "label");
  if (lbl) lbl.value = rowLabels[to - 1];
}

function updateRowsVisibility() {
  const n = Math.round(readControlValue("rows"));
  for (let i = 1; i <= MAX_ROWS; i++) {
    const card = document.querySelector('.row-card[data-row="' + i + '"]');
    if (!card) continue;
    card.classList.toggle("hidden", i > n);
    const removeBtn = card.querySelector(".row-remove");
    if (removeBtn) removeBtn.disabled = n <= 1;
  }
  const addBtn = document.getElementById("row-add");
  if (addBtn) addBtn.disabled = n >= MAX_ROWS;
}

function rowsFromState() {
  const n = Math.round(readControlValue("rows"));
  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push({
      kind: Math.round(readControlValue("p" + i + "kind")),
      mode: Math.round(readControlValue("p" + i + "mode")),
      cap: readControlValue("p" + i + "cap"),
      mon: readControlValue("p" + i + "mon"),
      refage: readControlValue("p" + i + "refage"),
      start: readControlValue("p" + i + "start"),
      years: readControlValue("p" + i + "years"),
      liv: Math.round(readControlValue("p" + i + "liv")),
      flex: Math.round(readControlValue("p" + i + "flex")),
      minstart: readControlValue("p" + i + "minstart"),
      contrib: readControlValue("p" + i + "contrib") || 0,
      label: rowLabels[i - 1]
    });
  }
  return rows;
}

function globalsFromState() {
  return {
    currentAge: readControlValue("currentAge"),
    income: readControlValue("income"),
    floor: readControlValue("floor"),
    allmanMonthly: readControlValue("allmanMonthly"),
    allmanRefAge: readControlValue("allmanRefAge"),
    dropTol: readControlValue("dropTol") / 100,
    inflation: readControlValue("inflation") / 100,
    drift: readControlValue("drift") / 100,
    realReturn: readControlValue("realReturn") / 100,
    horizonAge: readControlValue("horizonAge"),
    maxAge: readControlValue("maxAge"),
    minSearchAge: readControlValue("minSearchAge"),
    maxSearchAge: readControlValue("maxSearchAge"),
    pbb: readControlValue("pbb"),
    ibb: readControlValue("ibb"),
    kommunalskatt: readControlValue("kommunalskatt") / 100,
    skiktgrans: readControlValue("skiktgrans"),
    table: DELNINGSTAL_ILLUSTRATIV
  };
}

// ---------- ålder som text ----------

function ageStr(a) {
  if (a === null || !isFinite(a)) return "aldrig inom sökintervallet";
  const years = Math.floor(a);
  const months = Math.round((a - years) * 12);
  const y2 = months === 12 ? years + 1 : years;
  const m2 = months === 12 ? 0 : months;
  return y2 + " år" + (m2 > 0 ? " " + m2 + " mån" : "");
}

// ---------- presets ----------

function applyPreset(preset) {
  // rows sist av CONTROLS-nycklarna, men det spelar ingen roll här: alla
  // MAX_ROWS radkort finns redan i DOM:en, bara synligheten ändras.
  Object.keys(preset.v).forEach((id) => setControl(id, preset.v[id]));
  const n = Math.round(readControlValue("rows"));
  for (let i = 1; i <= MAX_ROWS; i++) {
    rowLabels[i - 1] = i <= n && preset.labels && preset.labels[i - 1] ? preset.labels[i - 1] : "Rad " + i;
    const lbl = document.getElementById("p" + i + "label");
    if (lbl) lbl.value = rowLabels[i - 1];
    const card = document.querySelector('.row-card[data-row="' + i + '"]');
    if (card && card._updateVisibility) card._updateVisibility();
  }
  updateRowsVisibility();
}

function buildPresets(hostId, list) {
  const host = document.getElementById(hostId);
  list.forEach((preset) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = preset.name;
    b.addEventListener("click", () => {
      applyPreset(preset);
      document.querySelectorAll("#presets button").forEach((o) => o.classList.remove("active"));
      b.classList.add("active");
      render();
    });
    host.appendChild(b);
  });
}

// ---------- bas: nom/cpi/life ----------
//
// Modellen räknar reala termer nativt (realReturn har inflationen redan
// borträknad), medan RantaPaRanta och engine.js's basisFactor/deflator utgår
// från att NOMINELLT är det inbyggda läget och deflaterar nedåt därifrån.
// Den här appen vänder om: dagens kronor (cpi) ÄR grundläget, så "nom" måste
// räknas UPP med inflationen och "life" räknas ytterligare NER med
// standardglidningen. Att återanvända basisFactor/deflator rakt av hade gett
// fel tecken på exponenten, exakt den bas-riktningsbugg finance/CLAUDE.md
// redan varnar för, så det här är en egen liten funktion i stället, inte en
// omimplementering av samma formel: kvoten (1+inflation) respektive
// (1+drift) kommer från samma två kontroller, bara applicerade åt andra
// hållet.
//
// Defaulten här är "cpi", INTE "life" som resten av sajten (finance/CLAUDE.md
// dokumenterar undantaget). Standardglidning prisar in att NORMAL standard
// stiger över tid, den rätta linsen för en 25-åring som jämför sin framtida
// pott mot framtida jämnåriga. En pensionär jämför sin EGEN framtida
// konsumtion mot sin EGEN nuvarande, och forskningen om "the retirement
// spending smile" visar att den snarare krymper eller planar ut med åldern
// (mindre resande och konsumtion, färre stora inköp) än fortsätter stiga i
// takt med samhällets normhöjning. Att köra "life" som default här hade
// systematiskt överskattat hur mycket man behöver längre fram.
let basis = "cpi";

const BASIS_NOTE = {
  nom: "nominellt värde, kronor den dag de betalas ut",
  cpi: "i dagens kronor, KPI-justerat",
  life: "i dagens levnadsstandard, KPI och standardglidning"
};

function displayFactor(g, t) {
  if (basis === "nom") return Math.pow(1 + g.inflation, t);
  if (basis === "life") return Math.pow(1 + g.drift, -t);
  return 1;
}

function setBasis(b) {
  basis = b;
  document.querySelectorAll("#basis button").forEach((o) => o.classList.toggle("active", o.dataset.basis === b));
}

// ---------- rader att räkna på, färger ----------

const ROW_COLORS = ["#4a7cff", "#3f9a6a", "#c99a3f", "#b5495b", "#8a5fd6", "#3fb0b0"];
const ALLMAN_COLOR = "#6b9bff";

function rowLabelOrDefault(row, i) {
  return row.label && row.label.trim() ? row.label : "Rad " + (i + 1);
}

// ---------- statistikrader ----------

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

// Sista tidsbegränsade utbetalningens slutålder: högsta slutåldern bland
// rader som INTE är livsvariga, vid den valda pensionsåldern A. null om alla
// rader är livsvariga, det finns då ingen klippa att visa.
function lastFixedWindowEnd(rows, A) {
  let end = null;
  rows.forEach((row) => {
    if (row.liv) return;
    const w = rowWindow(row, A);
    if (isFinite(w.end) && (end === null || w.end > end)) end = w.end;
  });
  return end;
}

function render() {
  const g = globalsFromState();
  const rows = rowsFromState();
  const result = searchEarliest(rows, g);
  // Om ingen ålder i sökintervallet klarar villkoren finns inget "earliest"
  // att falla tillbaka på. g.currentAge (din ålder nu) är fel val då: det
  // låtsas att du redan är pensionär vid din nuvarande ålder, vilket bakar in
  // åratal av inte-uppburen allmän pension som ett bortfall i kurvan och gör
  // den obegriplig. g.minSearchAge, sökintervallets egen nedre gräns, visar i
  // stället den tidigast rimliga kandidaten, så diagrammet och remsan
  // fortfarande förklarar VARFÖR sökningen misslyckades.
  const A = viewedAge !== null ? viewedAge : result.earliest !== null ? result.earliest : g.minSearchAge;
  const curve = incomeCurve(rows, g, A);
  const ev = evaluate(curve, g.floor, g.dropTol);

  el.headlineEarliest.textContent = ageStr(result.earliest);
  el.headlineNaive.textContent = ageStr(result.earliestNaive);
  const cliffEnd = lastFixedWindowEnd(rows, A);
  el.headlineNote.textContent = cliffEnd
    ? "Gapet är åren från " + Math.round(cliffEnd) + " år, när en tidsbegränsad utbetalning tar slut, till maxåldern nettot måste hålla."
    : "Ingen rad är tidsbegränsad, så det finns ingen klippa: den naiva och den ärliga åldern kan hamna nära varandra.";

  // Golvet är satt i reala termer (dagens kronor, samma som modellens
  // nativa läge), precis som nettokurvan. Att visa det i valfri bas kräver
  // därför SAMMA per-ålder-faktor som nettot får, aldrig ett fast tal: annars
  // ritas en rät golvlinje mot en kurva som lutar i nom/life-basen, vilket är
  // fel även om ingen enskild siffra är fel var för sig. Se motsvarande fix
  // i drawChart för golv- och falltröskellinjerna.
  const d0 = displayFactor(g, curve[0].age - g.currentAge);
  const startNetDisp = curve[0].netMonthly * d0;
  const floorAtStart = g.floor * d0;
  const minEntry = curve.find((c) => c.age === ev.minAtAge) || curve[0];
  const dMin = displayFactor(g, minEntry.age - g.currentAge);
  const minDisp = ev.minNet * dMin;
  const floorAtMin = g.floor * dMin;
  const marginDisp = minDisp - floorAtMin;

  const allmanBas = allmanMonthlyAtAge({ monthlyAtRef: g.allmanMonthly, refAge: g.allmanRefAge, age: A, table: g.table });
  const allmanActual = allmanGrossMonthly(g, A, A);
  const brytpunkt = brytpunktAllmanPension(g.ibb);
  const dtAtA = delningstalAt(A, g.table);
  const dtAtRef = delningstalAt(g.allmanRefAge, g.table);

  const taxAtStart = curve[0].grossYearly > 0 ? 1 - curve[0].netYearly / curve[0].grossYearly : 0;
  const afterForhojt = curve.find((c) => c.age >= FORHOJT_GRUNDAVDRAG_ALDER) || curve[curve.length - 1];
  const taxAfterForhojt = afterForhojt.grossYearly > 0 ? 1 - afterForhojt.netYearly / afterForhojt.grossYearly : 0;

  const stats = [
    ["Netto vid start", kr(startNetDisp) + "/mån", "vid " + ageStr(A) + ", " + BASIS_NOTE[basis], false],
    ["Lägsta netto", kr(minDisp) + "/mån", "vid " + ageStr(minEntry.age), minDisp < floorAtMin],
    [
      "Fallet",
      kr(startNetDisp - minDisp) + " (" + NF1.format(ev.worstDropPct * 100) + " %)",
      "från startnivån till det lägsta, förankrat vid start",
      ev.worstDropPct > g.dropTol
    ],
    ["Marginal till golvet", kr(marginDisp) + "/mån", marginDisp >= 0 ? "över golvet vid det sämsta året" : "under golvet", marginDisp < 0],
    [
      "Skatt vid start jämfört med efter förhöjt grundavdrag",
      NF1.format(taxAtStart * 100) + " % / " + NF1.format(taxAfterForhojt * 100) + " %",
      "effektiv skattesats, före och efter " + FORHOJT_GRUNDAVDRAG_ALDER + " år",
      false
    ],
    [
      "Allmän pension: prognos jämfört med efter uteblivna år",
      kr(allmanBas) + " / " + kr(allmanActual),
      "per månad vid " + Math.round(A) + " år, före och efter bortfallet av att sluta tidigt",
      allmanActual < allmanBas
    ],
    ["Brytpunkt, allmän pension", kr(brytpunkt) + "/år", "årslön där mer lön ger noll extra pensionsrätt (7,5 IBB-taket)", false],
    [
      "Delningstal, vald ålder jämfört med prognosåldern",
      NF2.format(dtAtA) + " / " + NF2.format(dtAtRef),
      "en aktuariell kvot, inte en straffavgift",
      false
    ]
  ];
  el.stats.innerHTML = stats.map((s) => statRow(s[0], s[1], s[2], s[3])).join("");

  drawChart(curve, rows, g, ev, A);
  drawStrip(result, A, g);
  writeUrlState(g, rows);
}

// ---------- diagram ----------

const W = 1000;
let G = { l: 62, r: 12, t: 16, b: 34, H: 380, s: 1, font: 12 };
let bandOn = { allman: true };

function geometry() {
  const w = el.chart.clientWidth || W;
  const s = Math.max(1, Math.min(3.2, W / w));
  return { l: 62 * s, r: 12 * s, t: 16 * s, b: 34 * s, H: Math.round(380 * Math.min(2.05, s)), s: s, font: 12 * s };
}

function buildLegend(rows) {
  const host = document.getElementById("legend");
  if (bandOn.allman === undefined) bandOn.allman = true;
  rows.forEach((row, i) => {
    if (bandOn["r" + i] === undefined) bandOn["r" + i] = true;
  });
  const items = [{ key: "allman", label: "Allmän pension", color: ALLMAN_COLOR }].concat(
    rows.map((row, i) => ({ key: "r" + i, label: rowLabelOrDefault(row, i), color: ROW_COLORS[i % ROW_COLORS.length] }))
  );
  host.innerHTML = items
    .map(
      (it) =>
        '<button type="button" class="' +
        (bandOn[it.key] ? "" : "off") +
        '" data-series="' +
        it.key +
        '" aria-pressed="' +
        !!bandOn[it.key] +
        '"><i style="background:' +
        it.color +
        '"></i><span>' +
        it.label +
        "</span></button>"
    )
    .join("");
  host.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      const key = b.dataset.series;
      bandOn[key] = !bandOn[key];
      render();
    });
  });
}

function drawChart(curve, rows, g, ev, A) {
  buildLegend(rows);
  G = geometry();
  const M = G;
  const H = G.H;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const n = curve.length - 1;

  const disp = curve.map((c) => displayFactor(g, c.age - g.currentAge));
  const netSeries = curve.map((c, i) => c.netMonthly * disp[i]);
  const allmanSeries = curve.map((c, i) => c.grossAllman * disp[i]);
  const rowSeries = rows.map((row, ri) => curve.map((c, i) => c.grossPerSource[ri] * disp[i]));
  // Golvet är ett realt tal precis som nettot, se kommentaren nedan vid
  // floorSeries/dropSeries: måste skalas med samma disp[] för att jämförelsen
  // mot netSeries ska förbli meningsfull i nom/life-basen.
  const floorSeries = disp.map((d) => g.floor * d);
  const dropSeries = disp.map((d) => netSeries[0] * (1 - g.dropTol) * (d / disp[0]));

  const stackTop = (i) => {
    let acc = bandOn.allman ? allmanSeries[i] : 0;
    rowSeries.forEach((series, ri) => {
      if (bandOn["r" + ri]) acc += series[i];
    });
    return acc;
  };

  let max = 0;
  for (let i = 0; i <= n; i++) max = Math.max(max, stackTop(i), netSeries[i], floorSeries[i]);
  const TICKS = 4;
  let step = niceStep((max * 1.04) / TICKS);
  while (step * TICKS < max) step = niceStep(step * 1.05);
  max = step * TICKS;

  const x = (i) => M.l + (n > 0 ? (pw * i) / n : 0);
  const yy = (v) => M.t + ph - (ph * v) / (max || 1);
  const barW = Math.max(2, Math.min(22 * G.s, (pw / Math.max(1, n)) * 0.7));

  let s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img">';

  for (let i = 0; i <= TICKS; i++) {
    const gv = (max * i) / TICKS;
    const gy = yy(gv);
    s +=
      '<line x1="' +
      M.l +
      '" y1="' +
      gy +
      '" x2="' +
      (W - M.r) +
      '" y2="' +
      gy +
      '" stroke="#242734" stroke-width="' +
      G.s +
      '"/>' +
      '<text x="' +
      (M.l - 10 * G.s) +
      '" y="' +
      (gy + 4 * G.s) +
      '" fill="#5c6070" font-size="' +
      G.font +
      '" text-anchor="end">' +
      krShort(gv) +
      "</text>";
  }

  // staplade bruttoband, sedan nettolinjen ovanpå
  for (let i = 0; i <= n; i++) {
    const bx = x(i) - barW / 2;
    let acc = 0;
    if (bandOn.allman && allmanSeries[i] > 0) {
      s += rect(bx, yy(acc + allmanSeries[i]), barW, yy(acc) - yy(acc + allmanSeries[i]), ALLMAN_COLOR);
      acc += allmanSeries[i];
    }
    rowSeries.forEach((series, ri) => {
      if (!bandOn["r" + ri] || !(series[i] > 0)) return;
      s += rect(bx, yy(acc + series[i]), barW, yy(acc) - yy(acc + series[i]), ROW_COLORS[ri % ROW_COLORS.length]);
      acc += series[i];
    });
  }

  const dashedPath = (series, color, width, dash) => {
    let p = "";
    for (let i = 0; i <= n; i++) p += (i ? " L" : "M") + x(i).toFixed(1) + " " + yy(series[i]).toFixed(1);
    return '<path d="' + p + '" fill="none" stroke="' + color + '" stroke-width="' + width * G.s + '" stroke-dasharray="' + dash + '"/>';
  };
  s += dashedPath(floorSeries, "#e0798a", 1.4, 6 * G.s + " " + 4 * G.s);
  s += dashedPath(dropSeries, "#8b6b73", 1.1, 4 * G.s + " " + 4 * G.s);

  // nettolinjen
  let path = "";
  for (let i = 0; i <= n; i++) path += (i ? " L" : "M") + x(i).toFixed(1) + " " + yy(netSeries[i]).toFixed(1);
  s += '<path d="' + path + '" fill="none" stroke="#f2f2f2" stroke-width="' + 2.2 * G.s + '"/>';

  // förhöjt grundavdrag-åldern, vertikalt streck
  if (curve[0].age <= FORHOJT_GRUNDAVDRAG_ALDER && curve[curve.length - 1].age >= FORHOJT_GRUNDAVDRAG_ALDER) {
    const fi = FORHOJT_GRUNDAVDRAG_ALDER - curve[0].age;
    s +=
      '<line x1="' +
      x(fi) +
      '" y1="' +
      M.t +
      '" x2="' +
      x(fi) +
      '" y2="' +
      (M.t + ph) +
      '" stroke="#4a4e5e" stroke-width="' +
      G.s +
      '" stroke-dasharray="' +
      2 * G.s +
      " " +
      3 * G.s +
      '"/>';
  }

  const zero = yy(0);
  s += '<line x1="' + M.l + '" y1="' + zero + '" x2="' + (W - M.r) + '" y2="' + zero + '" stroke="#3a3f52" stroke-width="' + G.s + '"/>';
  const stepAge = Math.max(1, Math.ceil(n / 10));
  for (let i = 0; i <= n; i += stepAge) {
    s +=
      '<text x="' +
      x(i) +
      '" y="' +
      (H - 14 * G.s) +
      '" fill="#5c6070" font-size="' +
      G.font +
      '" text-anchor="middle">' +
      Math.round(curve[i].age) +
      "</text>";
  }
  s += '<text x="' + M.l + '" y="' + (H - 2 * G.s) + '" fill="#484d5e" font-size="' + 11 * G.s + '">ålder</text>';
  s += "</svg>";
  el.chart.innerHTML = s;

  wireTooltip(curve, netSeries, allmanSeries, rowSeries, rows, floorSeries);
}

function rect(x, y, w, h, fill) {
  if (!(h > 0)) return "";
  return (
    '<rect x="' +
    x.toFixed(1) +
    '" y="' +
    y.toFixed(1) +
    '" width="' +
    w.toFixed(1) +
    '" height="' +
    h.toFixed(1) +
    '" fill="' +
    fill +
    '"/>'
  );
}

function wireTooltip(curve, netSeries, allmanSeries, rowSeries, rows, floorSeries) {
  const svg = el.chart.firstChild;
  if (!svg) return;
  const n = curve.length - 1;

  const show = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let i = n > 0 ? Math.round(((px - G.l) / (W - G.l - G.r)) * n) : 0;
    i = Math.max(0, Math.min(n, i));
    let html = "<b>" + Math.round(curve[i].age) + ' år</b><br><span class="k">Netto</span> <b>' + kr(netSeries[i]) + "</b>/mån<br>";
    if (allmanSeries[i] > 0) html += '<span class="k">Allmän pension</span> ' + kr(allmanSeries[i]) + "<br>";
    rows.forEach((row, ri) => {
      if (rowSeries[ri][i] > 0) html += '<span class="k">' + rowLabelOrDefault(row, ri) + "</span> " + kr(rowSeries[ri][i]) + "<br>";
    });
    html += '<span class="k">Golv</span> ' + kr(floorSeries[i]);
    el.tip.innerHTML = html;
    el.tip.classList.add("on");
    const wrapR = el.chart.parentElement.getBoundingClientRect();
    const tipW = el.tip.offsetWidth || 210;
    let left = clientX - wrapR.left + 14;
    if (left + tipW > wrapR.width) left = Math.max(4, clientX - wrapR.left - tipW - 14);
    el.tip.style.left = left + "px";
    el.tip.style.top = Math.max(0, clientY - wrapR.top - 10) + "px";
  };

  svg.addEventListener("mousemove", (e) => show(e.clientX, e.clientY));
  svg.addEventListener("mouseleave", () => el.tip.classList.remove("on"));
  const touch = (e) => {
    if (e.touches && e.touches.length === 1) show(e.touches[0].clientX, e.touches[0].clientY);
  };
  svg.addEventListener("touchstart", touch, { passive: true });
  svg.addEventListener("touchmove", touch, { passive: true });
  svg.addEventListener("touchend", () => el.tip.classList.remove("on"), { passive: true });
}

// ---------- uppfyllbarhetsremsa ----------
//
// En cell per skannad ålder, klickbar: gör icke-monotoniciteten synlig i
// stället för att gömma den bakom en enda "lägsta ålder"-siffra, och
// fungerar som en ålderspickare för diagrammet ovan.
let viewedAge = null;

function drawStrip(result, A, g) {
  const host = el.strip;
  host.innerHTML = result.map
    .map((r) => {
      const cls = r.ok ? "ok" : r.okFloor ? "fail-drop" : "fail-floor";
      const on = Math.abs(r.age - A) < 1 / 24 ? " on" : "";
      return '<button type="button" class="cell ' + cls + on + '" data-age="' + r.age + '" title="' + ageStr(r.age) + '"></button>';
    })
    .join("");
  host.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      viewedAge = parseFloat(b.dataset.age);
      render();
    });
  });
  el.stripLegendEarliest.textContent = result.earliest !== null ? ageStr(result.earliest) : "ingen ålder i intervallet klarar villkoren";
}

// ---------- URL-tillstånd ----------
//
// Samma kontrakt som RantaPaRanta/BilTCO (finance/CLAUDE.md): ett
// query-parameter per kontroll-id, plain nummer, defaultvärden utelämnas.
// Radetiketterna kodas MEDVETET INTE: de är det mest identifierande fältet
// (se planens personuppgiftsavsnitt), så en delad länk bär beloppen men
// aldrig vad du kallar dem.

function applyUrlState() {
  const s = parseUrlValues(CONTROLS.concat(ALL_ROW_CONTROLS), location.search);
  Object.keys(s.values).forEach((id) => setControl(id, s.values[id]));
  if (s.basis) setBasis(s.basis);
  for (let i = 1; i <= MAX_ROWS; i++) {
    const card = document.querySelector('.row-card[data-row="' + i + '"]');
    if (card && card._updateVisibility) card._updateVisibility();
  }
  updateRowsVisibility();
}

let urlTimer = null;
function writeUrlState(g, rows) {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const active = activeControls(rows.length);
    const values = {};
    active.forEach((c) => {
      values[c.id] = readControlValue(c.id);
    });
    const q = buildUrlQuery(active, values, null, basis, null);
    try {
      history.replaceState(null, "", q ? "?" + q : location.pathname);
    } catch (e) {
      /* file:// eller en strypt history, inget användaren behöver höra om */
    }
  }, 400);
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

function init() {
  buildControlsInto(
    document.getElementById("situation"),
    CONTROLS.filter((c) => c.group === "situation"),
    el
  );
  buildControlsInto(
    document.getElementById("honesty"),
    CONTROLS.filter((c) => c.group === "honesty"),
    el
  );

  for (let i = 1; i <= MAX_ROWS; i++) buildRowCard(i);

  buildPresets("presets", PRESETS);

  el.stats = document.getElementById("stats");
  el.chart = document.getElementById("chart");
  el.tip = document.getElementById("tip");
  el.strip = document.getElementById("strip");
  el.stripLegendEarliest = document.getElementById("strip-earliest");
  el.headlineEarliest = document.getElementById("headline-earliest");
  el.headlineNaive = document.getElementById("headline-naive");
  el.headlineNote = document.getElementById("headline-note");

  document.querySelectorAll("#basis button").forEach((b) => {
    b.addEventListener("click", () => {
      setBasis(b.dataset.basis);
      render();
    });
  });

  document.getElementById("row-add").addEventListener("click", () => {
    const n = Math.round(readControlValue("rows"));
    if (n >= MAX_ROWS) return;
    setControl("rows", n + 1);
    updateRowsVisibility();
    schedule();
  });
  // Kortens synlighet styrs av "rows"-kontrollen oavsett hur den ändras:
  // "+ Lägg till en rad" ovan, en preset, en URL, eller att dra reglaget
  // direkt. De tre första anropar updateRowsVisibility() själva, men
  // reglaget/textfältet går via buildControlsInto:s vanliga input-lyssnare,
  // som bara vet om schedule(). Lägg på uppdateringen här i stället för att
  // gafla in ett specialfall i buildControlsInto.
  el.rows.num.addEventListener("input", updateRowsVisibility);
  el.rows.rng.addEventListener("input", updateRowsVisibility);

  applyUrlState();
  setBasis(basis);
  updateRowsVisibility();

  window.addEventListener("resize", () => {
    if (el.chart.firstChild) render();
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
