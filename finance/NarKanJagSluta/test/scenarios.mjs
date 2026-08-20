// Headless scenariokörare för lib/pension.js och NarKanJagSluta/script.js.
//
//   node test/scenarios.mjs
//
// Samma idiom som BilTCO/test/scenarios.mjs: sidskripten är vanliga scripts
// (inga ES-moduler), så den här konkatenerar dem i laddordning och
// evaluerar resultatet i en vm med en stub-DOM, precis som webbläsaren ser
// dem, och plockar sedan ut de funktioner den behöver. DOM-uppbyggnaden
// (buildControlsInto, buildPotCard, render, init) körs INTE här: stubben gör
// document.addEventListener till en no-op, så DOMContentLoaded aldrig
// triggar init(). Det här filen testar bara de rena funktionerna:
// aritmetiken i lib/pension.js och algoritmen/kontraktet i script.js.

import fs from "fs";
import vm from "vm";
import path from "path";

const here = path.dirname(new URL(import.meta.url).pathname);
const read = (...p) => fs.readFileSync(path.join(here, ...p), "utf8");
const code = [
  read("..", "..", "lib", "engine.js"),
  read("..", "..", "lib", "ui.js"),
  read("..", "..", "lib", "pension.js"),
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
  monthlyFromCapital,
  growCapital,
  growCapitalWithContrib,
  monthlyFromCapitalLifelong,
  delningstalAt,
  allmanMonthlyAtAge,
  pensionsUnderlag,
  pensionsrattPerYear,
  brytpunktAllmanPension,
  allmanShortfallMonthly,
  grundavdrag,
  inkomstskattPension,
  netMonthlyFromGrossYearly,
  PBB,
  IBB,
  SKIKTGRANS,
  LAGSTA_UTTAGSALDER_ALLMAN,
  FORHOJT_GRUNDAVDRAG_ALDER,
  KOMMUNALSKATT_SNITT,
  SKATTEREDUKTION_ANDEL_APPROX,
  incomeCurve,
  evaluate,
  requiredCapitalForFloor,
  netAtCapital,
  totalCapital,
  DELNINGSTAL_ILLUSTRATIV,
  CONTROLS,
  PRESETS,
  POTS,
  potFieldSpecs,
  activeControls,
  ageStr,
  parseUrlValues,
  buildUrlQuery,
  fieldText,
  parseField
} = vm.runInContext(
  code +
    ";({monthlyFromCapital, growCapital, growCapitalWithContrib, monthlyFromCapitalLifelong, delningstalAt, allmanMonthlyAtAge, pensionsUnderlag, pensionsrattPerYear, brytpunktAllmanPension, allmanShortfallMonthly, grundavdrag, inkomstskattPension, netMonthlyFromGrossYearly, PBB, IBB, SKIKTGRANS, LAGSTA_UTTAGSALDER_ALLMAN, FORHOJT_GRUNDAVDRAG_ALDER, KOMMUNALSKATT_SNITT, SKATTEREDUKTION_ANDEL_APPROX, incomeCurve, evaluate, requiredCapitalForFloor, netAtCapital, totalCapital, DELNINGSTAL_ILLUSTRATIV, CONTROLS, PRESETS, POTS, potFieldSpecs, activeControls, ageStr, parseUrlValues, buildUrlQuery, fieldText, parseField})",
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
  check(name, Math.abs(got - want) <= tol, Math.round(got * 100) / 100, want + " +/- " + tol);
}

// Exempel-delningstalstabell, ENDAST för att testa interpolationsmatematiken.
// INTE de riktiga värden Pensionsmyndigheten publicerar för någon kohort:
// de ligger i en xlsx per födelseår och måste hämtas därifrån innan appen
// visar en pensionssiffra på riktigt. Se finance/CLAUDE.md.
const DT = [
  { age: 65, value: 18.0 },
  { age: 66, value: 17.3 },
  { age: 67, value: 16.6 },
  { age: 68, value: 15.9 },
  { age: 69, value: 15.2 },
  { age: 70, value: 14.6 }
];

// 1. Källbelagda konstanter, inkomstår 2026, mot Skatteverkets/
//    Finansdepartementets publicerade tabeller.
{
  near("prisbasbelopp 2026", PBB, 59200, 0);
  near("inkomstbasbelopp 2026", IBB, 83400, 0);
  near("skiktgräns 2026", SKIKTGRANS, 643000, 0);
  near("lägsta uttagsålder allmän pension 2026", LAGSTA_UTTAGSALDER_ALLMAN, 64, 0);
  near("förhöjt grundavdrag från 66 år 2026", FORHOJT_GRUNDAVDRAG_ALDER, 66, 0);
}

// 2. monthlyFromCapital mot en oberoende handbyggd annuitetsformel, plus
//    realReturn=0 och en enda månad.
{
  const capital = 500000;
  const realReturn = 0.02;
  const months = 120;
  const r = Math.pow(1 + realReturn, 1 / 12) - 1;
  const handbyggd = (capital * r) / (1 - Math.pow(1 + r, -months));
  near("monthlyFromCapital mot handbyggd annuitetsformel", monthlyFromCapital(capital, realReturn, months), handbyggd, 1e-6);
  near("monthlyFromCapital vid noll avkastning", monthlyFromCapital(120000, 0, 120), 1000, 1e-9);
  // En månad kvar: hela summan plus den månadens ränta måste betalas ut, så
  // betalningen är capital*(1+r), inte capital självt.
  const rEnMan = Math.pow(1.03, 1 / 12) - 1;
  near("monthlyFromCapital över en enda månad", monthlyFromCapital(10000, 0.03, 1), 10000 * (1 + rEnMan), 1e-6);
  check("monthlyFromCapital utan kapital ger 0", monthlyFromCapital(0, 0.02, 120) === 0, 0, 0);
}

// 3. growCapital och growCapitalWithContrib mot en handbyggd
//    slutvärde-av-annuitet-beräkning. Ingen av de två används längre av
//    script.js (potterna anger kapitalet VID pensionen direkt, ingen
//    tillväxtprojektion från idag, se potGrossMonthlys header 2026-08-19),
//    men de lever kvar i lib/pension.js och testas ändå: delad aritmetik ska
//    hålla oavsett vem som råkar anropa den just nu.
{
  near("growCapital ren ränta-på-ränta", growCapital(100000, 0.03, 10), 100000 * Math.pow(1.03, 10), 1e-6);

  const capital = 200000;
  const contrib = 3000;
  const realReturn = 0.025;
  const years = 15;
  const months = years * 12;
  const r = Math.pow(1 + realReturn, 1 / 12) - 1;
  const handbyggdFvKapital = capital * Math.pow(1 + realReturn, years);
  const handbyggdFvContrib = contrib * ((Math.pow(1 + r, months) - 1) / r);
  near(
    "growCapitalWithContrib mot handbyggd FV-av-annuitet",
    growCapitalWithContrib(capital, contrib, realReturn, years),
    handbyggdFvKapital + handbyggdFvContrib,
    1e-3
  );
  near(
    "growCapitalWithContrib vid noll avkastning är ren summering",
    growCapitalWithContrib(100000, 1000, 0, 10),
    100000 + 1000 * 120,
    1e-9
  );
}

// 4. monthlyFromCapitalLifelong: självannuitisering till en horisont.
{
  near(
    "monthlyFromCapitalLifelong motsvarar monthlyFromCapital över horisonten i månader",
    monthlyFromCapitalLifelong(400000, 0.02, 67, 90),
    monthlyFromCapital(400000, 0.02, 23 * 12),
    1e-6
  );
}

// 5. delningstalAt: exakt vid heltalsåldrar, linjär interpolation vid
//    mittpunkter, platt utanför tabellens ändar.
{
  near("delningstal vid heltalsålder", delningstalAt(67, DT), 16.6, 0);
  near("delningstal vid mittpunkt", delningstalAt(67.5, DT), (16.6 + 15.9) / 2, 1e-9);
  near("delningstal under tabellens början är platt", delningstalAt(60, DT), 18.0, 0);
  near("delningstal över tabellens slut är platt", delningstalAt(80, DT), 14.6, 0);
}

// 6. allmanMonthlyAtAge: delningstalskvoten flyttar en prognos exakt, och
//    behållningen förkortas bort (ref->A->ref är identiteten).
{
  const monthlyAtRef = 15000;
  const refAge = 67;
  const atA = allmanMonthlyAtAge({ monthlyAtRef, refAge, age: 65, table: DT });
  near("allmanMonthlyAtAge mot handbyggd delningstalskvot", atA, (monthlyAtRef * delningstalAt(67, DT)) / delningstalAt(65, DT), 1e-9);
  near(
    "allmanMonthlyAtAge ref->A->ref är identiteten",
    allmanMonthlyAtAge({ monthlyAtRef: atA, refAge: 65, age: refAge, table: DT }),
    monthlyAtRef,
    1e-6
  );
  check(
    "allmanMonthlyAtAge vid referensåldern ger samma belopp",
    Math.abs(allmanMonthlyAtAge({ monthlyAtRef, refAge, age: refAge, table: DT }) - monthlyAtRef) < 1e-9,
    allmanMonthlyAtAge({ monthlyAtRef, refAge, age: refAge, table: DT }),
    monthlyAtRef
  );
  check(
    "allmanMonthlyAtAge under lägsta uttagsåldern ger 0",
    allmanMonthlyAtAge({ monthlyAtRef, refAge, age: LAGSTA_UTTAGSALDER_ALLMAN - 1, table: DT }) === 0,
    allmanMonthlyAtAge({ monthlyAtRef, refAge, age: LAGSTA_UTTAGSALDER_ALLMAN - 1, table: DT }),
    0
  );
}

// 7. pensionsUnderlag / brytpunktAllmanPension: taket vid 7,5 IBB, och
//    bruttolönebrytpunkten där mer lön ger noll extra pensionsrätt.
//    Verifierat mot Skatteverkets tabell: 7,5*83400 = 625500 kr,
//    brytpunkten (8,07 IBB, avrundat) = 673038 kr för 2026.
{
  near("pensionsUnderlag under taket följer avgiften", pensionsUnderlag(400000, IBB), 400000 * 0.93, 1e-6);
  near("pensionsUnderlag takas vid 7,5 IBB", pensionsUnderlag(1000000, IBB), 7.5 * IBB, 1e-6);
  near("7,5 IBB för 2026 enligt Skatteverkets tabell", 7.5 * IBB, 625500, 0);
  // Bruttolönebrytpunkten använder den officiellt avrundade 8,07 IBB, inte
  // den exakta kvoten 7,5/(1-0,07) (som ger 672 581 kr, en krona-för-krona-
  // avvikelse mot myndighetens egen publicerade 673 038 kr för 2026).
  near("brytpunkten för allmän pension för 2026", brytpunktAllmanPension(IBB), 8.07 * IBB, 0);
  near("det motsvarar 673 038 kr för 2026", brytpunktAllmanPension(IBB), 673038, 0);
  check(
    "lön precis vid brytpunkten ger exakt taket i pensionsunderlag",
    Math.abs(pensionsUnderlag(brytpunktAllmanPension(IBB), IBB) - 7.5 * IBB) < 1e-6,
    pensionsUnderlag(brytpunktAllmanPension(IBB), IBB),
    7.5 * IBB
  );
  near("pensionsrattPerYear är 18,5 % av underlaget", pensionsrattPerYear(400000, IBB), 0.185 * (400000 * 0.93), 1e-6);
}

// 8. allmanShortfallMonthly mot en handbyggd annuitets-slutvärde-beräkning.
{
  const pensionsratt = 10000;
  const yearsNotWorked = 3;
  const realReturn = 0.02;
  const age = 65;
  const handbyggdFv = pensionsratt * ((Math.pow(1 + realReturn, yearsNotWorked) - 1) / realReturn);
  near(
    "allmanShortfallMonthly mot handbyggd FV",
    allmanShortfallMonthly({ pensionsratt, yearsNotWorked, age, table: DT, realReturn }),
    handbyggdFv / (12 * delningstalAt(age, DT)),
    1e-6
  );
  check(
    "allmanShortfallMonthly utan uteblivna år ger 0",
    allmanShortfallMonthly({ pensionsratt, yearsNotWorked: 0, age, table: DT, realReturn }) === 0,
    0,
    0
  );
}

// 9. grundavdrag vid varje brakettgräns, ordinarie, mot Skatteverkets/
//    Finansdepartementets publicerade 2026-anker (hela hundratal).
{
  near("grundavdrag vid mycket låg inkomst", grundavdrag(20000, PBB, false), 25100, 0);
  near("grundavdrag i toppen av platån", grundavdrag(170000, PBB, false), 45600, 0);
  near("grundavdrag vid hög inkomst", grundavdrag(600000, PBB, false), 17400, 0);
  check(
    "grundavdraget är en hump, inte monotont fallande",
    grundavdrag(170000, PBB, false) > grundavdrag(20000, PBB, false) && grundavdrag(170000, PBB, false) > grundavdrag(600000, PBB, false),
    grundavdrag(170000, PBB, false),
    "störst av de tre"
  );
  check(
    "grundavdraget är alltid en hel hundralapp",
    grundavdrag(237654, PBB, false) % 100 === 0,
    grundavdrag(237654, PBB, false),
    "delbart med 100"
  );
}

// 10. Förhöjt grundavdrag: platån och höginkomstgolvet mot Skatteverkets
//     tabell 2.4 för 2026 (179 100 / 117 500 kr), plus att steget vid
//     förhöjningsåldern höjer nettot, aldrig sänker det.
{
  near("förhöjt grundavdrag i platån, 2026", grundavdrag(500000, PBB, true), 179100, 0);
  // 12,84 PBB = 759 888 kr för 2026; 700 000 kr ligger fortfarande i den
  // fallande braketten, inte i höginkomstgolvet.
  near("förhöjt grundavdrag vid hög inkomst, 2026", grundavdrag(800000, PBB, true), 117500, 0);
  check(
    "förhöjt grundavdrag är alltid större än ordinarie vid samma inkomst",
    grundavdrag(500000, PBB, true) > grundavdrag(500000, PBB, false),
    grundavdrag(500000, PBB, true),
    "> " + grundavdrag(500000, PBB, false)
  );

  const taxParams = { pbb: PBB, kommunalskatt: KOMMUNALSKATT_SNITT, skiktgrans: SKIKTGRANS };
  const yearly = 400000;
  const straxUnder = netMonthlyFromGrossYearly(yearly, FORHOJT_GRUNDAVDRAG_ALDER - 1, taxParams);
  const vidGransen = netMonthlyFromGrossYearly(yearly, FORHOJT_GRUNDAVDRAG_ALDER, taxParams);
  check("förhöjningssteget höjer nettot, sänker det aldrig", vidGransen >= straxUnder, vidGransen, ">= " + straxUnder);
  const gaUnder = grundavdrag(yearly, PBB, false);
  const gaOver = grundavdrag(yearly, PBB, true);
  // Skattereduktionen är själv en andel av beskattningsbar, så den äter upp
  // en liten bit av grundavdragsdeltats effekt: den verkliga marginalen är
  // kommunalskatt minus skattereduktionsandelen, inte kommunalskatten rakt av.
  near(
    "hela steget förklaras av grundavdragsdeltat gånger marginalskatten",
    vidGransen - straxUnder,
    ((gaOver - gaUnder) * (KOMMUNALSKATT_SNITT - SKATTEREDUKTION_ANDEL_APPROX)) / 12,
    0.5
  );
}

// 11. inkomstskattPension mot en handbyggd kedja, under respektive över
//     skiktgränsen.
{
  const taxParams = { pbb: PBB, kommunalskatt: KOMMUNALSKATT_SNITT, skiktgrans: SKIKTGRANS, ageAtYearStart: 65 };

  const underSkikt = 300000;
  const rUnder = inkomstskattPension(Object.assign({ yearly: underSkikt }, taxParams));
  const gaUnder = grundavdrag(underSkikt, PBB, false);
  const beskattningsbarUnder = underSkikt - gaUnder;
  const kommunalUnder = beskattningsbarUnder * KOMMUNALSKATT_SNITT;
  near("grundavdrag i kedjan under skiktgränsen", rUnder.grundavdrag, gaUnder, 0);
  near("beskattningsbar under skiktgränsen", rUnder.beskattningsbar, beskattningsbarUnder, 0);
  near("ingen statlig skatt under skiktgränsen", rUnder.statlig, 0, 1e-9);
  near("kommunal skatt under skiktgränsen", rUnder.kommunal, kommunalUnder, 1e-6);

  const overSkikt = 800000;
  const rOver = inkomstskattPension(Object.assign({ yearly: overSkikt }, taxParams));
  const gaOver = grundavdrag(overSkikt, PBB, false);
  const beskattningsbarOver = overSkikt - gaOver;
  const statligOver = Math.max(0, beskattningsbarOver - SKIKTGRANS) * 0.2;
  near("statlig skatt över skiktgränsen", rOver.statlig, statligOver, 1e-6);
  check("netto är mindre än brutto", rOver.netYearly < overSkikt, rOver.netYearly, "< " + overSkikt);
}

// ---------- kärnberäkningen: incomeCurve / evaluate ----------
//
// Modellen slog tidigare upp per-policy-rader med egna fönster, för att
// fånga "klippan" när en tidsbegränsad tjänstepension tar slut (se
// script.js's headerkommentar). Sedan 2026-08-19 är båda potterna alltid
// livsvariga och startar exakt vid den planerade pensionsåldern, och sedan
// 2026-08-20 finns ingen sekundär "sök nedåt efter lägsta ålder"-fråga
// kvar heller: frågan är alltid direkt, vid en given ålder. Testerna nedan
// speglar det: de verifierar att golvvillkoret verkligen prövas hela vägen
// till kurvans slut, inte att det råkar klara sig vid startåldern.

const GLOBALS_BASE = {
  currentAge: 50,
  floor: 1,
  allmanMonthly: 0,
  allmanRefAge: 67,
  income: 0,
  realReturn: 0.02,
  horizonAge: 90,
  maxAge: 100,
  ibb: IBB,
  pbb: PBB,
  kommunalskatt: KOMMUNALSKATT_SNITT,
  skiktgrans: SKIKTGRANS,
  table: DT
};

// 12. Kurvan är monotont icke-avtagande i ålder (potterna är konstanta,
//     allmän pension stiger med delningstalskvoten, skatten sjunker aldrig
//     vid förhöjt grundavdrag): den lägsta punkten i kurvan är alltid
//     STARTÅLDERN. Det är skälet evaluate() ändå kontrollerar hela kurvan i
//     stället för att lita på egenskapen (se kommentaren vid evaluate): en
//     framtida modelländring som bryter monotoniciteten ska fortfarande
//     fångas av okFloor, inte tyst förlita sig på att kurvan råkar stiga.
{
  const pots = [{ id: "tjp", cap: 400000 }];
  const g = Object.assign({}, GLOBALS_BASE, { allmanMonthly: 12000, income: 400000, allmanRefAge: 67 });
  const curve = incomeCurve(pots, g, 65);
  for (let i = 1; i < curve.length; i++) {
    check(
      "nettot vid " + curve[i].age + " år är minst nettot vid " + curve[i - 1].age + " år",
      curve[i].netMonthly >= curve[i - 1].netMonthly - 1e-9,
      curve[i].netMonthly,
      ">= " + curve[i - 1].netMonthly
    );
  }
  const evLow = evaluate(curve, 1000000);
  const evHigh = evaluate(curve, 1);
  check("ett orimligt högt golv underkänns", evLow.okFloor === false, evLow.okFloor, false);
  check("ett golv på nästan noll godkänns alltid", evHigh.okFloor === true, evHigh.okFloor, true);
}

// 13. Två potter summerar bruttot: att fördela samma totala kapital på
//     tjänstepension och privat/ISK ger samma golvresultat som att lägga
//     hela beloppet i en enda pott, eftersom båda annuitiseras på samma
//     sätt. "En storhet, ett tal" för potterna, inte bara för golvet.
{
  const onePot = [{ id: "tjp", cap: 1000000 }];
  const twoPots = [
    { id: "tjp", cap: 600000 },
    { id: "priv", cap: 400000 }
  ];
  const A = 65;
  const curveOne = incomeCurve(onePot, GLOBALS_BASE, A);
  const curveTwo = incomeCurve(twoPots, GLOBALS_BASE, A);
  near("samma totalkapital ger samma nettot, oavsett fördelning mellan potterna", curveTwo[0].netMonthly, curveOne[0].netMonthly, 1e-6);
}

// 14. Att sluta jobba tidigare än allmän pensions prognosålder kostar
//     uteblivna års pensionsrätt: nettot vid start är strikt lägre ju
//     tidigare A är, allt annat lika, eftersom bortfallet växer.
{
  const pots = [{ id: "tjp", cap: 500000 }];
  const g = Object.assign({}, GLOBALS_BASE, { allmanMonthly: 12000, allmanRefAge: 67, income: 400000 });
  const netAt60 = allmanGrossMonthlyForTest(g, 60);
  const netAt65 = allmanGrossMonthlyForTest(g, 65);
  const netAt67 = allmanGrossMonthlyForTest(g, 67);
  check("allmän pension efter bortfall stiger ju närmre prognosåldern man slutar", netAt65 > netAt60, netAt65, "> " + netAt60);
  check("allmän pension efter bortfall är som högst vid prognosåldern", netAt67 >= netAt65, netAt67, ">= " + netAt65);

  function allmanGrossMonthlyForTest(globals, A) {
    const curve = incomeCurve(pots, globals, A);
    return curve[0].grossAllman;
  }
}

// 15. En storhet, ett tal: golvet som används i villkoret är exakt samma
//     tal som skickas in, ingen dold omskalning någonstans i kedjan.
{
  const pots = [{ id: "tjp", cap: 500000 }];
  const g = Object.assign({}, GLOBALS_BASE, { floor: 17321, allmanMonthly: 9000 });
  const curve = incomeCurve(pots, g, 65);
  const ev = evaluate(curve, g.floor);
  check(
    "golvvärdet i villkoret är identiskt med kontrollens värde",
    ev.okFloor === curve.every((c) => c.netMonthly >= 17321),
    ev.okFloor,
    curve.every((c) => c.netMonthly >= 17321)
  );
}

// ---------- kapitalbehovet: den omvända frågan ----------

// 16b. requiredCapitalForFloor mot en oberoende handbyggd kedja: kapitalet
//      VID A som bisektionen hittar ska, annuitiserat med monthlyFromCapital,
//      ge exakt den BRUTTOinkomst grundavdragskedjan (redan verifierad i
//      test 9-11) sedan skattar ner till floor. Två separata kedjor
//      (bisektion mot skatt+annuitet i koden, algebra mot annuiteten för sig
//      här) som ändå ska mötas. requiredCapitalForFloor är pot-agnostisk (se
//      filhuvudkommentaren vid funktionen): den tar inga potter alls, bara
//      globals/A/floor, och kapitalet den löser för är VID A, inte idag (se
//      potGrossMonthlys header, 2026-08-19: nuvarande ålder är irrelevant
//      för frågan).
{
  const g = Object.assign({}, GLOBALS_BASE, { allmanMonthly: 0, income: 0 });
  const A = 65;
  const floor = 12000;
  const capital = requiredCapitalForFloor(g, A, floor);
  near("kapitalet håller golvet exakt", netAtCapital(g, A, capital), floor, 0.02);

  const months = Math.round((g.horizonAge - A) * 12);
  const handbyggdGrossMonthly = monthlyFromCapital(capital, g.realReturn, months);
  const taxParams = { pbb: g.pbb, kommunalskatt: g.kommunalskatt, skiktgrans: g.skiktgrans, ageAtYearStart: Math.floor(A) };
  const handbyggdNet = inkomstskattPension(Object.assign({ yearly: handbyggdGrossMonthly * 12 }, taxParams)).netYearly / 12;
  near("den handbyggda annuitets- och skattekedjan ger också floor", handbyggdNet, floor, 0.02);

  // Ett kapital en enda krona mindre får INTE hålla golvet, annars vore
  // bisektionen inte den lägsta lösningen utan bara "en lösning".
  const evOneLess = netAtCapital(g, A, capital - 1);
  check("en krona mindre kapital håller inte längre golvet", evOneLess < floor, evOneLess, "< " + floor);
}

// 16c. requiredCapitalForFloor ger 0 när golvet redan hålls utan kapital
//      (allmän pension ensam räcker).
{
  const g = Object.assign({}, GLOBALS_BASE, { allmanMonthly: 40000 });
  near("golvet redan uppnått kräver inget extra kapital", requiredCapitalForFloor(g, 65, 12000), 0, 0);
}

// 16d. Fördelningen mellan potterna spelar ingen roll för hur mycket
//      SAMMANLAGT kapital som saknas: att redan ha hälften av det behövda
//      kapitalet i tjänstepensionen ger samma återstående gap som att ha
//      det i privat/ISK, eftersom båda annuitiseras identiskt.
{
  const g = Object.assign({}, GLOBALS_BASE, { allmanMonthly: 8000 });
  const A = 65;
  const floor = 15000;
  const required = requiredCapitalForFloor(g, A, floor);
  const halfInTjp = [{ id: "tjp", cap: required / 2 }];
  const halfInPriv = [{ id: "priv", cap: required / 2 }];
  const gapTjp = requiredCapitalForFloor(g, A, floor) - totalCapital(halfInTjp);
  const gapPriv = requiredCapitalForFloor(g, A, floor) - totalCapital(halfInPriv);
  near("gapet är detsamma oavsett vilken pott halva kapitalet ligger i", gapTjp, gapPriv, 1);
}

// ---------- kontroller, presets, URL-kontrakt, personuppgifter ----------

function specForId(id) {
  return (
    CONTROLS.find((c) => c.id === id) ||
    POTS.map((p) => potFieldSpecs(p.id))
      .flat()
      .find((c) => c.id === id)
  );
}

// Statutoriska konstanter (pbb/ibb/skiktgrans) är UNDANTAGNA från
// roundness-tripwiren: de är offentliga för alla, ingen personuppgiftsrisk,
// och ska vara källbelagda till kronan, inte avrundade för att se runda ut
// (rotens regel 1: "verified against a published reference, to the last
// digit"). Tripwiren gäller bara situationsfälten som skulle kunna bära ett
// riktigt pensionsbelopp.
const STATUTORY_EXEMPT = ["pbb", "ibb", "skiktgrans"];

function isKr(spec) {
  return spec.unit === "kr" || spec.unit.indexOf("kr/") === 0;
}
function roundnessOk(spec, v) {
  if (!isKr(spec) || STATUTORY_EXEMPT.indexOf(spec.id) > -1) return true;
  const divisor = spec.unit.indexOf("kr/") === 0 ? 100 : 1000;
  return v % divisor === 0;
}

// 17. Personuppgifts-tripwire: varje kronbelopp i CONTROLS, potternas
//     fältspecar och PRESETS är runt (delbart med 1000, eller 100 för
//     månatliga belopp), utom de statutoriska konstanterna ovan.
{
  const allPotSpecs = POTS.map((p) => potFieldSpecs(p.id)).flat();
  CONTROLS.forEach((c) => {
    check("CONTROLS." + c.id + " är runt (eller undantaget)", roundnessOk(c, c.value), c.value, "delbart med 1000/100");
  });
  allPotSpecs.forEach((c) => {
    check("pottfält " + c.id + " är runt (eller undantaget)", roundnessOk(c, c.value), c.value, "delbart med 1000/100");
  });
  PRESETS.forEach((preset) => {
    Object.keys(preset.v).forEach((id) => {
      const spec = specForId(id);
      if (!spec) return;
      check(
        'preset "' + preset.name + '" fält ' + id + " är runt (eller undantaget)",
        roundnessOk(spec, preset.v[id]),
        preset.v[id],
        "delbart med 1000/100"
      );
    });
  });
}

// 18. Presets rör aldrig en ärlighetsknapp: realReturn, horizonAge,
//     inflation, drift, pbb, ibb, kommunalskatt, skiktgrans. Gäller även
//     inflation/drift trots att de fysiskt visas i basis-raden (hostOverride
//     är bara var de renderas, inte deras group).
{
  const honestyIds = CONTROLS.filter((c) => c.group === "honesty").map((c) => c.id);
  check("det finns minst en ärlighetsknapp att skydda", honestyIds.length > 0, honestyIds.length, "> 0");
  PRESETS.forEach((preset) => {
    const touched = Object.keys(preset.v).filter((id) => honestyIds.indexOf(id) > -1);
    check('preset "' + preset.name + '" rör ingen ärlighetsknapp', touched.length === 0, touched, "[]");
  });
}

// 19. URL-tur-och-retur: bygg med alla aktiva kontroller, tolka tillbaka.
{
  const controls = activeControls();
  const values = {};
  controls.forEach((c) => {
    values[c.id] = c.value + c.step; // varje värde skilt från defaulten
  });
  const q = buildUrlQuery(controls, values, null, "cpi", null);
  const parsed = parseUrlValues(controls, "?" + q);
  controls.forEach((c) => {
    near("URL-tur-och-retur " + c.id, parsed.values[c.id], values[c.id], 1e-6);
  });
  check("URL-tur-och-retur bär basen", parsed.basis === "cpi", parsed.basis, "cpi");
}

// 20. Formatterartur-och-retur över varje kontrolls fulla intervall,
//     inklusive negativa tal (realReturn har min under 0).
{
  activeControls().forEach((c) => {
    [c.min, c.max, (c.min + c.max) / 2].forEach((v) => {
      const text = fieldText(c, v);
      const back = parseField(text);
      const tol = isKr(c) ? 0.51 : 0.006;
      near("formatterartur-och-retur " + c.id + " vid " + v, back, v, tol);
    });
  });
}

// Delad hjälpfunktion för presettestet nedan: bygger globals från en preset
// exakt som applyPreset()/globalsFromState() gör i script.js, men utan DOM.
// Använder DELNINGSTAL_ILLUSTRATIV, den TABELL APPEN FAKTISKT SKEPPAR, inte
// testsvitens egen DT: testet vill veta hur presetens siffror beter sig i
// appen, inte testa interpolationsmatematiken isolerat (det gör redan test 5
// ovan, mot DT).
function globalsFromPreset(preset) {
  const g = {};
  CONTROLS.forEach((c) => {
    g[c.id] = preset.v[c.id] !== undefined ? preset.v[c.id] : c.value;
  });
  return {
    currentAge: g.currentAge,
    income: g.income,
    floor: g.floor,
    plannedAge: g.plannedAge,
    allmanMonthly: g.allmanMonthly,
    allmanRefAge: g.allmanRefAge,
    realReturn: g.realReturn / 100,
    horizonAge: g.horizonAge,
    maxAge: g.horizonAge + 10, // samma CURVE_END_MARGIN_YEARS som globalsFromState i script.js
    pbb: g.pbb,
    ibb: g.ibb,
    kommunalskatt: g.kommunalskatt / 100,
    skiktgrans: g.skiktgrans,
    table: DELNINGSTAL_ILLUSTRATIV
  };
}
// 21. Varje presets faktiska kapitalbehov vid sin planerade ålder är inom
//     ett rimligt tak, verifierat genom att faktiskt köra siffrorna (node,
//     inte "ser rimligt ut"). Ett par av de ursprungliga radbaserade
//     presettalen gav "aldrig någon giltig lösning" innan de retunades, ett
//     tyst fel som bara syns om man frågar algoritmen, inte källkoden.
{
  PRESETS.forEach((preset) => {
    const g = globalsFromPreset(preset);
    const required = requiredCapitalForFloor(g, g.plannedAge, g.floor);
    check(
      'preset "' + preset.name + '" ger ett kapitalbehov inom rimligt tak vid sin planerade ålder',
      required !== null,
      required,
      "!== null"
    );
  });
}

console.log(pass + " pass, " + fail + " fail");
if (fail > 0) process.exit(1);
