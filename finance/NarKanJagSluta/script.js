"use strict";

// När kan jag sluta: lägsta möjliga pensionsålder där livsvarig månadsinkomst
// efter skatt håller sig över ett golv.
//
// lib/engine.js, lib/ui.js och lib/pension.js laddas före den här filen.
// Modellsammansättningen (incomeCurve/evaluate/searchEarliest) lever här,
// inte i lib/, eftersom det är appens egen fråga, inte delad aritmetik:
// BilTCO håller computeCar här av samma skäl och delar bara annuityPayment.

// UI, chart och URL-tillstånd lever i den här filen, enligt samma
// uppdelning som RantaPaRanta och BilTCO: lib/*.js håller aritmetiken,
// appens egen script.js håller sammansättningen och DOM:en.

// Modellen slog tidigare upp till MAX_ROWS fritt konfigurerbara
// tjänstepensions/privat-rader, var och en med egen startålder, längd och
// livsvarig/tidsbegränsad-flagga, för att fånga "klippan" när en
// tidsbegränsad tjänstepension tar slut. Daniel (2026-08-19) ifrågasatte den
// premissen: en tjänstepension går i praktiken att pausa och förlänga, bara
// inte korta ner (se "vad den inte gör"), så man styr i praktiken bort från
// en klippa i stället för att råka ut för en. Modellen antar nu i stället att
// varje pott alltid tas ut livsvarigt (självannuitiserat till
// horisontåldern), startandes exakt vid den kandiderade pensionsåldern. Det
// är en enklare, mindre exakt modell för den som faktiskt har en tecknad
// tidsbegränsad utbetalning, dokumenterat som en avvikelse i "vad den inte
// gör" i stället för dolt.

// ---------- de två potterna ----------

// En pott är antingen tjänstepension eller privat/ISK-sparande, alltid
// kapital känt (se filhuvudet 2026-08-19: ett känt-månadsbelopp-läge fanns
// tidigare men gav inget en läsare inte redan kan göra genom att lägga in
// motsvarande kapital, ren komplexitet utan en fråga den besvarade). Formen:
//   { cap }
const POTS = [
  { id: "tjp", title: "Tjänstepension" },
  { id: "priv", title: "Privat/ISK-sparande" }
];

// Bruttobelopp per månad från en pott, givet den kandiderade pensionsåldern
// A. pot.cap är kapitalet VID A, inte idag: Daniel (2026-08-19) påpekade att
// frågan alltid handlar om vad man har när man går i pension, så
// nuvarande ålder är irrelevant för den här beräkningen. En tidigare version
// tog kapitalet som "idag" och räknade upp det med realReturn fram till A,
// vilket i onödan kopplade in currentAge i en fråga som inte behöver den:
// den som vill uppskatta ett framtida kapital från ett nuvarande gör det
// själv (till exempel med Ränta på ränta) och skriver in resultatet här,
// precis som "Allmän pension enligt prognos" redan är en prognos vid en
// vald ålder, inte ett dagens-saldo. Konstant över hela kurvan: potten är
// alltid livsvarig och startar exakt vid A.
function potGrossMonthly(pot, globals, A) {
  return monthlyFromCapitalLifelong(pot.cap, globals.realReturn, A, globals.horizonAge);
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
// ett värde per beskattningsår (ageAtYearStart = heltalsålder). Potterna är
// konstanta över kurvan (se potGrossMonthly), allmän pension och skatten
// rör sig med åldern.
function incomeCurve(pots, globals, A) {
  const firstYear = Math.floor(A);
  const potMonthly = pots.map((pot) => potGrossMonthly(pot, globals, A));
  const curve = [];
  for (let age = firstYear; age <= globals.maxAge; age++) {
    const grossAllman = allmanGrossMonthly(globals, A, age);
    const grossMonthly = grossAllman + potMonthly.reduce((s, v) => s + v, 0);
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
      grossPerPot: potMonthly,
      grossYearly: grossYearly,
      netYearly: skatt.netYearly,
      netMonthly: skatt.netYearly / 12
    });
  }
  return curve;
}

// ---------- villkoret ----------
//
// Golvet: nettot får aldrig understiga floor, hela vägen till kurvans
// slutålder. Utan tidsbegränsade potter finns ingen klippa längre (se filens
// header), men kurvan kontrolleras ändå hela vägen i stället för att bara
// lita på att den råkar vara stigande: en framtida ändring av modellen ska
// inte tyst tappa skyddet.
function evaluate(curve, floor) {
  const startNet = curve[0].netMonthly;
  let minNet = Infinity;
  let minAtAge = curve[0].age;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i].netMonthly < minNet) {
      minNet = curve[i].netMonthly;
      minAtAge = curve[i].age;
    }
  }
  const okFloor = curve.every((c) => c.netMonthly >= floor);
  return {
    startNet: startNet,
    minNet: minNet,
    minAtAge: minAtAge,
    okFloor: okFloor,
    ok: okFloor
  };
}

// ---------- kapitalbehovet ----------
//
// 2026-08-20: appen körde tidigare en sekundär "sök nedåt efter lägsta
// pensionsålder"-fråga (`searchEarliest`, en uppfyllbarhetsremsa, en egen
// rubrik) vid sidan av den direkta frågan nedan. Daniel strök den: "vem
// kommer vilja skruva på Självannuitiseringshorisont? slutålder?" var
// startskottet för att inse att sökrutan (minSearchAge/maxSearchAge) och
// hela sök-maskineriet bara var kvarleva från planens ursprungliga skiss,
// och att den faktiska frågan alltid varit den direkta: vid min planerade
// ålder, hur stort måste mitt sammanlagda kapital vara. Två potter som är
// livsvariga och startar exakt vid A ger samma sammanlagda netto oavsett hur
// ett givet totalkapital delas mellan dem (se testet "en storhet, ett tal
// för potterna"), så frågan reduceras till EN variabel, oberoende av hur
// kapitalet faktiskt är fördelat mellan tjänstepensionen och privat/ISK.

// Nettot vid start om det sammanlagda kapitalet vore totalCap.
function netAtCapital(globals, A, totalCap) {
  return incomeCurve([{ id: "solve", cap: totalCap }], globals, A)[0].netMonthly;
}

// Lägsta sammanlagda kapital som håller golvet vid A, med bisektion: nettot
// är monotont icke-avtagande i kapitalet (mer kapital ger mer
// bruttoinkomst, och även en progressiv skatt sänker aldrig nettot när
// bruttot stiger), så bisektionen är giltig även om ingen sluten form är
// värd att härleda ur den fulla grundavdragsbrakettabellen. Returnerar 0 om
// golvet redan hålls utan något kapital alls (allmän pension räcker), null
// om inget kapital inom ett rimligt tak räcker.
function requiredCapitalForFloor(globals, A, floor) {
  if (netAtCapital(globals, A, 0) >= floor) return 0;
  let hi = 100000;
  while (netAtCapital(globals, A, hi) < floor) {
    hi *= 2;
    if (hi > 1e9) return null;
  }
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (netAtCapital(globals, A, mid) >= floor) hi = mid;
    else lo = mid;
  }
  return hi;
}

function totalCapital(pots) {
  return pots.reduce((s, p) => s + p.cap, 0);
}

// ---------- globala kontroller (situation + ärlighetsknappar) ----------

const CONTROLS = [
  {
    id: "floor",
    group: "situation",
    label: "Golv: lägsta acceptabla nettoinkomst",
    unit: "kr",
    min: 5000,
    max: 40000,
    step: 500,
    value: 15000,
    hint: 'Det är X i frågan: nettot per månad får aldrig understiga detta, hela vägen till maxåldern. Knappen "Sätt till dagens nettolön" nedan ger en utgångspunkt.'
  },
  {
    id: "plannedAge",
    group: "situation",
    label: "Planerad pensionsålder",
    unit: "år",
    min: 55,
    max: 75,
    step: 1,
    value: 65,
    hint: "Åldern du siktar på att sluta jobba. Kapitalet du behöver nedan räknas fram för just den här åldern."
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
    id: "income",
    group: "situation",
    label: "Årslön nu",
    unit: "kr",
    min: 0,
    max: 1200000,
    step: 10000,
    value: 480000,
    hint: "Bara till för att prissätta bortfallet av att sluta innan allmän pensions prognosålder ovan: uteblivna års pensionsrätt. Inte skatten på pensionen."
  },
  {
    id: "currentAge",
    group: "basis",
    label: "Din ålder nu",
    unit: "år",
    min: 40,
    max: 75,
    step: 1,
    value: 50,
    hint: 'Bara referenspunkten för "dagens kronor" i basväljaren nedan, rör inget annat i beräkningen.'
  },
  {
    id: "inflation",
    group: "honesty",
    hostOverride: "basis-age",
    label: "Inflation (KPI)",
    unit: "%",
    min: 0,
    max: 8,
    step: 0.1,
    value: 2,
    hint: 'Bara till för basväljarens "Nominellt", Riksbankens mål 2 %. Rör inget annat i beräkningen.'
  },
  {
    id: "drift",
    group: "honesty",
    hostOverride: "basis-age",
    label: "Standardglidning",
    unit: "%",
    min: 0,
    max: 3,
    step: 0.1,
    value: 1,
    hint: 'Bara till för basväljarens "Livsstilsjusterat": att normal standard flyttar sig uppåt. Rör inget annat i beräkningen.'
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
    hint: 'Åldern kapitalpotterna antas räcka till. Ingen dödlighetspoolning, se "vad den inte gör".'
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

// Varje fält en pott har, samma id-mönster för de två fasta potterna:
// tjpcap, tjpmon, ... privcap, privmon, ... Ingen "kind"-väljare längre: de
// två potterna ÄR typen, ingen dynamisk lista av rader att typa om.
function potFieldSpecs(potId) {
  return [
    {
      id: potId + "cap",
      label: "Kapital vid pensionen",
      unit: "kr",
      min: 0,
      max: 8000000,
      step: 10000,
      value: potId === "tjp" ? 1200000 : 0,
      hint: "Vad du väntas ha VID den planerade pensionsåldern nedan, inte vad du har idag. Räkna upp ett nu-belopp själv om du utgår från ett."
    }
  ];
}

const ALL_POT_CONTROLS = POTS.reduce((out, pot) => out.concat(potFieldSpecs(pot.id)), []);

function activeControls() {
  return CONTROLS.concat(ALL_POT_CONTROLS);
}

// ---------- presets ----------
//
// Situationer, aldrig ärlighetsknappar (regel i finance/CLAUDE.md och i
// planen): realReturn, horizonAge, inflation, drift, pbb, ibb, kommunalskatt,
// skiktgrans rörs aldrig här, oavsett var de fysiskt visas (inflation/drift
// bor i basis-raden men är fortfarande ärlighetsknappar, se hostOverride).
// Syntetiska, runda
// belopp, generiska etiketter, aldrig Daniels riktiga institutioner eller
// belopp (se personuppgifts-avsnittet i planen). Verifierade mot faktiskt
// sökresultat (test/scenarios.mjs), inte mot ögonmått.
const PRESETS = [
  {
    name: "Anställd, tjänstepension och lite eget sparande",
    v: {
      currentAge: 50,
      income: 450000,
      floor: 15000,
      plannedAge: 65,
      allmanMonthly: 9000,
      allmanRefAge: 65,
      tjpcap: 2000000,
      privcap: 700000
    }
  },
  {
    name: "Bara allmän pension och en liten tjänstepension",
    v: {
      currentAge: 55,
      income: 300000,
      floor: 9000,
      plannedAge: 65,
      allmanMonthly: 9000,
      allmanRefAge: 65,
      tjpcap: 700000,
      privcap: 0
    }
  },
  {
    name: "Stort privat kapital, tidig pension",
    v: {
      currentAge: 50,
      income: 400000,
      floor: 15000,
      plannedAge: 58,
      allmanMonthly: 10000,
      allmanRefAge: 65,
      tjpcap: 300000,
      privcap: 6000000
    }
  },
  {
    name: "Vill sluta vid 62, saknar kapital ännu",
    v: {
      currentAge: 50,
      income: 400000,
      floor: 16000,
      plannedAge: 62,
      allmanMonthly: 11000,
      allmanRefAge: 65,
      tjpcap: 1500000,
      privcap: 1000000
    }
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
  store.num.value = fieldText(c, v);
  store.rng.value = valueToSlider(c, v);
}

// ---------- de två fasta pottkorten ----------

function buildPotCard(pot) {
  const host = document.getElementById("pots-host");
  const specs = potFieldSpecs(pot.id);

  const card = document.createElement("div");
  card.className = "row-card";
  card.dataset.pot = pot.id;
  card.innerHTML =
    '<div class="row-head"><span class="row-label">' +
    pot.title +
    '</span></div><div class="controls row-fields" id="' +
    pot.id +
    'fields"></div>';
  host.appendChild(card);

  buildControlsInto(card.querySelector("#" + pot.id + "fields"), specs, el);

  return card;
}

function potsFromState() {
  return POTS.map((pot) => ({
    id: pot.id,
    cap: readControlValue(pot.id + "cap")
  }));
}

// Hur långt golvvillkoret prövas. Var tidigare en egen ärlighetsknapp
// ("Kurvans slutålder"), struken 2026-08-20: ingen läsare hade en åsikt om
// den, bara om horisonten pengarna faktiskt ska räcka till. maxAge sätts nu
// till horisonten plus en marginal, aldrig kortare än horisonten själv.
const CURVE_END_MARGIN_YEARS = 10;

function globalsFromState() {
  const horizonAge = readControlValue("horizonAge");
  return {
    currentAge: readControlValue("currentAge"),
    income: readControlValue("income"),
    floor: readControlValue("floor"),
    allmanMonthly: readControlValue("allmanMonthly"),
    allmanRefAge: readControlValue("allmanRefAge"),
    inflation: readControlValue("inflation") / 100,
    drift: readControlValue("drift") / 100,
    realReturn: readControlValue("realReturn") / 100,
    horizonAge: horizonAge,
    maxAge: horizonAge + CURVE_END_MARGIN_YEARS,
    pbb: readControlValue("pbb"),
    ibb: readControlValue("ibb"),
    kommunalskatt: readControlValue("kommunalskatt") / 100,
    skiktgrans: readControlValue("skiktgrans"),
    table: DELNINGSTAL_ILLUSTRATIV
  };
}

// ---------- ålder som text ----------

function ageStr(a) {
  const years = Math.floor(a);
  const months = Math.round((a - years) * 12);
  const y2 = months === 12 ? years + 1 : years;
  const m2 = months === 12 ? 0 : months;
  return y2 + " år" + (m2 > 0 ? " " + m2 + " mån" : "");
}

// ---------- presets ----------

function applyPreset(preset) {
  Object.keys(preset.v).forEach((id) => setControl(id, preset.v[id]));
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

// ---------- serier, färger ----------

const POT_COLORS = ["#4a7cff", "#3f9a6a"];
const ALLMAN_COLOR = "#6b9bff";

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

function render() {
  const g = globalsFromState();
  const pots = potsFromState();

  // Huvudfrågan, direkt: vid den planerade åldern och det kapital du just nu
  // har angett, hur stor blir månadsinkomsten. Ingen sökning, ingen
  // bisektion, bara incomeCurve rakt av vid g.plannedAge, så den här siffran
  // uppdateras live så fort ett kapital- eller ålderreglage dras, precis den
  // "rattning" appen finns till för. A är alltid den planerade åldern nu:
  // det fanns tidigare en sekundär "sök nedåt"-fråga med en egen ålder att
  // titta på, struken 2026-08-20 (se kommentaren vid requiredCapitalForFloor).
  const A = g.plannedAge;
  const curve = incomeCurve(pots, g, A);
  const ev = evaluate(curve, g.floor);
  const plannedNet = curve[0].netMonthly;
  el.headlinePlannedAge.textContent = Math.round(g.plannedAge);
  el.headlineIncome.textContent = kr(plannedNet);

  // Den omvända frågan, som en stat-rad snarare än en rubrik: vid den
  // planerade åldern, hur stort måste det sammanlagda kapitalet
  // (tjänstepension + privat/ISK) vara för att hålla golvet. Pot-agnostiskt
  // med flit (se requiredCapitalForFloor): modellen annuitiserar båda
  // potterna på exakt samma sätt, så den saknade summan är densamma oavsett
  // om den läggs i tjänstepensionen eller i privat/ISK.
  const requiredTotal = requiredCapitalForFloor(g, g.plannedAge, g.floor);
  const haveTotal = totalCapital(pots);
  let capitalGapNote;
  if (requiredTotal === null) {
    capitalGapNote = "golvet nås inte inom ett rimligt kapitalbelopp";
  } else {
    const gapCapital = requiredTotal - haveTotal;
    capitalGapNote =
      "behöver " +
      kr(requiredTotal) +
      " totalt (du har " +
      kr(haveTotal) +
      "), " +
      (gapCapital > 0 ? "saknar " + kr(gapCapital) : kr(-gapCapital) + " över golvet");
  }

  // Gapet innan allmän pension tidigast kan tas ut: planerar du att sluta
  // före LAGSTA_UTTAGSALDER_ALLMAN bär tjänstepensionen/privat/ISK hela
  // inkomsten själva fram till dess, sedan tillkommer allmän pension. Det är
  // ingen klippa (åldern är känd i förväg och beloppen är fasta, se
  // filhuvudet), men en läsare bör se den, inte bara ana den i diagrammet.
  if (g.plannedAge < LAGSTA_UTTAGSALDER_ALLMAN) {
    const afterGap = curve.find((c) => c.age >= LAGSTA_UTTAGSALDER_ALLMAN);
    el.gapNote.textContent = afterGap
      ? Math.round(g.plannedAge) +
        " till " +
        LAGSTA_UTTAGSALDER_ALLMAN +
        " år: " +
        kr(plannedNet) +
        "/mån, bara tjänstepension och privat/ISK, allmän pension går inte att ta ut än. Från " +
        LAGSTA_UTTAGSALDER_ALLMAN +
        " år: " +
        kr(afterGap.netMonthly) +
        "/mån."
      : "";
    el.gapNote.classList.toggle("hidden", !afterGap);
  } else {
    el.gapNote.classList.add("hidden");
  }

  // Golvet är satt i reala termer (dagens kronor, samma som modellens
  // nativa läge), precis som nettokurvan. Att visa det i valfri bas kräver
  // därför SAMMA per-ålder-faktor som nettot får, aldrig ett fast tal: annars
  // ritas en rät golvlinje mot en kurva som lutar i nom/life-basen, vilket är
  // fel även om ingen enskild siffra är fel var för sig. Se motsvarande fix
  // i drawChart för golvlinjen.
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
    [
      "Kapital du behöver vid " + Math.round(g.plannedAge) + " år",
      requiredTotal === null ? "-" : kr(requiredTotal),
      capitalGapNote,
      requiredTotal !== null && requiredTotal > haveTotal
    ],
    ["Lägsta netto", kr(minDisp) + "/mån", "vid " + ageStr(minEntry.age) + ", " + BASIS_NOTE[basis], minDisp < floorAtMin],
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

  drawChart(curve, pots, g, ev, A);
  writeUrlState(g);
}

// ---------- diagram ----------

const W = 1000;
let G = { l: 62, r: 12, t: 16, b: 34, H: 380, s: 1, font: 12 };
let bandOn = { allman: true, tjp: true, priv: true };

function geometry() {
  const w = el.chart.clientWidth || W;
  const s = Math.max(1, Math.min(3.2, W / w));
  return { l: 62 * s, r: 12 * s, t: 16 * s, b: 34 * s, H: Math.round(380 * Math.min(2.05, s)), s: s, font: 12 * s };
}

function buildLegend(pots) {
  const host = document.getElementById("legend");
  const items = [{ key: "allman", label: "Allmän pension", color: ALLMAN_COLOR }].concat(
    POTS.map((pot, i) => ({ key: pot.id, label: pot.title, color: POT_COLORS[i % POT_COLORS.length] }))
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

function drawChart(curve, pots, g, ev, A) {
  buildLegend(pots);
  G = geometry();
  const M = G;
  const H = G.H;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const n = curve.length - 1;

  const disp = curve.map((c) => displayFactor(g, c.age - g.currentAge));
  const netSeries = curve.map((c, i) => c.netMonthly * disp[i]);
  const allmanSeries = curve.map((c, i) => c.grossAllman * disp[i]);
  const potSeries = pots.map((pot, pi) => curve.map((c, i) => c.grossPerPot[pi] * disp[i]));
  // Golvet är ett realt tal precis som nettot, se kommentaren nedan: måste
  // skalas med samma disp[] för att jämförelsen mot netSeries ska förbli
  // meningsfull i nom/life-basen.
  const floorSeries = disp.map((d) => g.floor * d);

  const stackTop = (i) => {
    let acc = bandOn.allman ? allmanSeries[i] : 0;
    pots.forEach((pot, pi) => {
      if (bandOn[pot.id]) acc += potSeries[pi][i];
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
    pots.forEach((pot, pi) => {
      if (!bandOn[pot.id] || !(potSeries[pi][i] > 0)) return;
      s += rect(bx, yy(acc + potSeries[pi][i]), barW, yy(acc) - yy(acc + potSeries[pi][i]), POT_COLORS[pi % POT_COLORS.length]);
      acc += potSeries[pi][i];
    });
  }

  const dashedPath = (series, color, width, dash) => {
    let p = "";
    for (let i = 0; i <= n; i++) p += (i ? " L" : "M") + x(i).toFixed(1) + " " + yy(series[i]).toFixed(1);
    return '<path d="' + p + '" fill="none" stroke="' + color + '" stroke-width="' + width * G.s + '" stroke-dasharray="' + dash + '"/>';
  };
  s += dashedPath(floorSeries, "#e0798a", 1.4, 6 * G.s + " " + 4 * G.s);

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

  wireTooltip(curve, netSeries, allmanSeries, potSeries, pots, floorSeries);
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

function wireTooltip(curve, netSeries, allmanSeries, potSeries, pots, floorSeries) {
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
    pots.forEach((pot, pi) => {
      if (potSeries[pi][i] > 0) html += '<span class="k">' + pot.title + "</span> " + kr(potSeries[pi][i]) + "<br>";
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

// ---------- URL-tillstånd ----------
//
// Samma kontrakt som RantaPaRanta/BilTCO (finance/CLAUDE.md): ett
// query-parameter per kontroll-id, plain nummer, defaultvärden utelämnas.

function applyUrlState() {
  const s = parseUrlValues(activeControls(), location.search);
  Object.keys(s.values).forEach((id) => setControl(id, s.values[id]));
  if (s.basis) setBasis(s.basis);
}

let urlTimer = null;
function writeUrlState(g) {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const active = activeControls();
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
    CONTROLS.filter((c) => c.group === "honesty" && !c.hostOverride),
    el
  );
  // "Din ålder nu", inflation och standardglidning hör hemma vid
  // basväljaren, inte i "Din situation"/"Ärlighetsknappar": alla tre rör
  // bara vad en viss basväljarknapp betyder, ingen kapital- eller
  // åldersberäkning. Att lista dem bland de faktiskt verkningsfulla fälten
  // var precis den sortens dolda-utan-att-vara-dold clutter Daniel
  // (2026-08-19/20) reagerade på i Prisma. Inflation/drift är fortfarande
  // ärlighetsknappar (group "honesty", presets rör dem aldrig, se testet),
  // bara fysiskt flyttade via hostOverride.
  buildControlsInto(
    document.getElementById("basis-age"),
    CONTROLS.filter((c) => c.group === "basis" || c.hostOverride === "basis-age"),
    el
  );

  POTS.forEach((pot) => buildPotCard(pot));

  buildPresets("presets", PRESETS);

  // Golvet defaultar till en godtycklig 15 000 kr, inte till din faktiska
  // inkomst: den här knappen ger en snabb utgångspunkt för "kan jag behålla
  // dagens inkomst". Approximationen återanvänder pensionens skatteformel på
  // dagens lön, vilket INTE är rätt skatt (jobbskatteavdrag på förvärvsinkomst
  // saknas, se "vad den inte gör"), men appen har ingen egen löneskattmodell
  // och det är en bättre startpunkt än ett gissat rundat tal.
  const floorBtn = document.createElement("button");
  floorBtn.type = "button";
  floorBtn.id = "floor-to-income";
  floorBtn.textContent = "Sätt till dagens nettolön (uppskattat)";
  floorBtn.addEventListener("click", () => {
    const g = globalsFromState();
    const net = netMonthlyFromGrossYearly(readControlValue("income"), Math.round(g.currentAge), {
      pbb: g.pbb,
      kommunalskatt: g.kommunalskatt,
      skiktgrans: g.skiktgrans
    });
    setControl("floor", Math.round(net / 100) * 100);
    schedule();
  });
  el.floor.wrap.appendChild(floorBtn);

  el.stats = document.getElementById("stats");
  el.chart = document.getElementById("chart");
  el.tip = document.getElementById("tip");
  el.headlinePlannedAge = document.getElementById("headline-planned-age");
  el.headlineIncome = document.getElementById("headline-income");
  el.gapNote = document.getElementById("gap-note");

  document.querySelectorAll("#basis button").forEach((b) => {
    b.addEventListener("click", () => {
      setBasis(b.dataset.basis);
      render();
    });
  });

  applyUrlState();
  setBasis(basis);

  window.addEventListener("resize", () => {
    if (el.chart.firstChild) render();
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
