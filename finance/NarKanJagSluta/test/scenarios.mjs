// Headless scenariokörare för lib/pension.js och NarKanJagSluta/script.js.
//
//   node test/scenarios.mjs
//
// Samma idiom som BilTCO/test/scenarios.mjs: sidskripten är vanliga scripts
// (inga ES-moduler), så den här konkatenerar dem i laddordning och
// evaluerar resultatet i en vm med en stub-DOM, precis som webbläsaren ser
// dem, och plockar sedan ut de funktioner den behöver. DOM-uppbyggnaden
// (buildControlsInto, buildRowCard, render, init) körs INTE här: stubben gör
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
  searchEarliest,
  DELNINGSTAL_ILLUSTRATIV,
  CONTROLS,
  PRESETS,
  MAX_ROWS,
  rowFieldSpecs,
  rowControlSpecs,
  activeControls,
  ageStr,
  parseUrlValues,
  buildUrlQuery,
  fieldText,
  parseField
} = vm.runInContext(
  code +
    ";({monthlyFromCapital, growCapital, growCapitalWithContrib, monthlyFromCapitalLifelong, delningstalAt, allmanMonthlyAtAge, pensionsUnderlag, pensionsrattPerYear, brytpunktAllmanPension, allmanShortfallMonthly, grundavdrag, inkomstskattPension, netMonthlyFromGrossYearly, PBB, IBB, SKIKTGRANS, LAGSTA_UTTAGSALDER_ALLMAN, FORHOJT_GRUNDAVDRAG_ALDER, KOMMUNALSKATT_SNITT, SKATTEREDUKTION_ANDEL_APPROX, incomeCurve, evaluate, searchEarliest, DELNINGSTAL_ILLUSTRATIV, CONTROLS, PRESETS, MAX_ROWS, rowFieldSpecs, rowControlSpecs, activeControls, ageStr, parseUrlValues, buildUrlQuery, fieldText, parseField})",
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
//    slutvärde-av-annuitet-beräkning.
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

// ---------- sökalgoritmen: incomeCurve / evaluate / searchEarliest ----------

const GLOBALS_BASE = {
  currentAge: 50,
  floor: 1,
  dropTol: 0.3,
  allmanMonthly: 0,
  allmanRefAge: 67,
  income: 0,
  realReturn: 0.02,
  horizonAge: 90,
  maxAge: 85,
  ibb: IBB,
  pbb: PBB,
  kommunalskatt: KOMMUNALSKATT_SNITT,
  skiktgrans: SKIKTGRANS,
  table: DT,
  minSearchAge: 60,
  maxSearchAge: 75
};

// 12. Uppfyllbarheten är inte monoton i A: en livsvarig flexibel baspott ger
//     ett jämnt golv, och en icke-flexibel rad med fast fönster 68-70 höjer
//     inkomsten temporärt. Den som går i pension MITT I höjningen (69) får
//     sin egen startnivå satt av den tillfälliga höjningen, och när den tar
//     slut blir fallet större än dropTol. Den som går i pension FÖRE (65)
//     eller EFTER (72) höjningen har en låg startnivå hela vägen och klarar
//     sig. Det är skälet searchEarliest måste skanna linjärt, inte
//     binärsöka: en binärsökning på det här predikatet ger ett tyst fel svar.
{
  const rows = [
    { kind: 1, mode: 0, cap: 300000, contrib: 0, liv: 1, flex: true, minstart: 60, start: 60, years: 0 },
    { kind: 1, mode: 0, cap: 1500000, contrib: 0, liv: 0, flex: false, start: 68, years: 3, minstart: 68 }
  ];
  const evAt = (A) => evaluate(incomeCurve(rows, GLOBALS_BASE, A), GLOBALS_BASE.floor, GLOBALS_BASE.dropTol);
  const ok65 = evAt(65).ok;
  const ok69 = evAt(69).ok;
  const ok72 = evAt(72).ok;
  check("pension före höjningen klarar fallet (65)", ok65 === true, ok65, true);
  check("pension mitt i höjningen klarar INTE fallet (69)", ok69 === false, ok69, false);
  check("pension efter höjningen klarar fallet igen (72)", ok72 === true, ok72, true);

  const result = searchEarliest(rows, GLOBALS_BASE);
  const idx69 = result.map.findIndex((r) => Math.abs(r.age - 69) < 1 / 24);
  const firstTrueAfter69 = result.map.slice(idx69).find((r) => r.ok);
  check(
    "kartan är genuint icke-monoton: en sann ålder finns bortom en falsk",
    result.map[idx69].ok === false && !!firstTrueAfter69,
    result.map[idx69].ok,
    "false, med en sann ålder efteråt"
  );
  check(
    "searchEarliest returnerar ändå den lägsta sanna åldern, inte en binärsökt fel",
    Math.abs(result.earliest - 60) < 1 / 24,
    result.earliest,
    60
  );
}

// 13. earliestNaive <= earliest över en slumpad genomgång av radsett: den
//     som bara tittar på första året kan aldrig ge en HÖGRE ålder än den
//     som också kräver att fallet klarar sig, bara en lägre eller lika.
{
  // Deterministisk pseudoslump (Date.now/Math.random är inte tillåtna i
  // testmiljön när det spelar roll, men det gör det inte här och Math.random
  // är tillgänglig i sandboxen). En enkel LCG räcker och gör testet
  // reproducerbart utan att bero på något globalt slumpfrö.
  let seed = 42;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  for (let trial = 0; trial < 15; trial++) {
    const rows = [];
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const liv = rnd() < 0.5 ? 1 : 0;
      rows.push({
        kind: rnd() < 0.5 ? 1 : 2,
        mode: 0,
        cap: 100000 + rnd() * 900000,
        contrib: 0,
        liv: liv,
        flex: rnd() < 0.5,
        start: 60 + Math.floor(rnd() * 10),
        years: liv ? 0 : 3 + Math.floor(rnd() * 10),
        minstart: 60
      });
    }
    const g = Object.assign({}, GLOBALS_BASE, {
      floor: 5000 + rnd() * 15000,
      dropTol: 0.1 + rnd() * 0.3,
      allmanMonthly: 5000 + rnd() * 10000
    });
    const result = searchEarliest(rows, g);
    if (result.earliest !== null && result.earliestNaive !== null) {
      check(
        "earliestNaive <= earliest (trial " + trial + ")",
        result.earliestNaive <= result.earliest + 1e-9,
        result.earliestNaive,
        "<= " + result.earliest
      );
    }
  }
}

// 14. Allt livsvarigt: inget fönster tar någonsin slut, så den naiva
//     första-årets-testen och det fulla testet ger EXAKT samma ålder.
{
  const rows = [{ kind: 1, mode: 0, cap: 800000, contrib: 0, liv: 1, flex: true, minstart: 60, start: 60, years: 0 }];
  const g = Object.assign({}, GLOBALS_BASE, { allmanMonthly: 10000, floor: 15000, dropTol: 0.1 });
  const result = searchEarliest(rows, g);
  near("allt livsvarigt: naiv och ärlig ålder är identiska", result.earliestNaive, result.earliest, 1e-9);
}

// 15. Att höja golvet sänker aldrig earliest, att höja falltoleransen höjer
//     aldrig earliest. Två garanterade monotonicitetsegenskaper, billiga
//     sanitetstester även om huvudsökningen inte är monoton i sig själv.
{
  const rows = [
    { kind: 1, mode: 0, cap: 400000, contrib: 0, liv: 1, flex: true, minstart: 60, start: 60, years: 0 },
    { kind: 2, mode: 0, cap: 600000, contrib: 0, liv: 0, flex: true, minstart: 60, start: 60, years: 15 }
  ];
  const gLow = Object.assign({}, GLOBALS_BASE, { allmanMonthly: 8000, floor: 12000, dropTol: 0.2 });
  const gHighFloor = Object.assign({}, gLow, { floor: 25000 });
  const gHighDrop = Object.assign({}, gLow, { dropTol: 0.5 });
  const rLow = searchEarliest(rows, gLow);
  const rHighFloor = searchEarliest(rows, gHighFloor);
  const rHighDrop = searchEarliest(rows, gHighDrop);
  if (rLow.earliest !== null && rHighFloor.earliest !== null) {
    check("högre golv sänker aldrig earliest", rHighFloor.earliest >= rLow.earliest - 1e-9, rHighFloor.earliest, ">= " + rLow.earliest);
  }
  if (rLow.earliest !== null && rHighDrop.earliest !== null) {
    check(
      "större falltolerans höjer aldrig earliest",
      rHighDrop.earliest <= rLow.earliest + 1e-9,
      rHighDrop.earliest,
      "<= " + rLow.earliest
    );
  }
}

// 16. En storhet, ett tal: golvet som används i villkoret är exakt samma
//     tal som skickas in, ingen dold omskalning någonstans i kedjan.
{
  const rows = [{ kind: 1, mode: 0, cap: 500000, contrib: 0, liv: 1, flex: true, minstart: 60, start: 60, years: 0 }];
  const g = Object.assign({}, GLOBALS_BASE, { floor: 17321, allmanMonthly: 9000 });
  const curve = incomeCurve(rows, g, 65);
  const ev = evaluate(curve, g.floor, g.dropTol);
  check(
    "golvvärdet i villkoret är identiskt med kontrollens värde",
    ev.okFloor === curve.every((c) => c.netMonthly >= 17321),
    ev.okFloor,
    curve.every((c) => c.netMonthly >= 17321)
  );
}

// ---------- steg 4-8: kontroller, presets, URL-kontrakt, personuppgifter ----------

function specForId(id) {
  return CONTROLS.find((c) => c.id === id) || rowControlSpecs(MAX_ROWS).find((c) => c.id === id);
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

// 17. Personuppgifts-tripwire: varje kronbelopp i CONTROLS och PRESETS är
//     runt (delbart med 1000, eller 100 för månatliga belopp), utom de
//     statutoriska konstanterna ovan.
{
  CONTROLS.forEach((c) => {
    check("CONTROLS." + c.id + " är runt (eller undantaget)", roundnessOk(c, c.value), c.value, "delbart med 1000/100");
  });
  rowControlSpecs(MAX_ROWS).forEach((c) => {
    check("radfält " + c.id + " är runt (eller undantaget)", roundnessOk(c, c.value), c.value, "delbart med 1000/100");
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

// 18. Presets rör aldrig en ärlighetsknapp: realReturn, horizonAge, maxAge,
//     dropTol, inflation, drift, pbb, ibb, kommunalskatt, skiktgrans,
//     minSearchAge/maxSearchAge.
{
  const honestyIds = CONTROLS.filter((c) => c.group === "honesty").map((c) => c.id);
  check("det finns minst en ärlighetsknapp att skydda", honestyIds.length > 0, honestyIds.length, "> 0");
  PRESETS.forEach((preset) => {
    const touched = Object.keys(preset.v).filter((id) => honestyIds.indexOf(id) > -1);
    check('preset "' + preset.name + '" rör ingen ärlighetsknapp', touched.length === 0, touched, "[]");
  });
}

// 19. URL-tur-och-retur med en dynamisk radlista: bygg med n rader, tolka
//     tillbaka mot samma lista, och mot en LÄNGRE lista (fler rader än
//     länken faktiskt bär, ska falla tillbaka på sina egna defaultvärden).
{
  const n = 4;
  const controls = activeControls(n);
  const values = {};
  controls.forEach((c) => {
    values[c.id] = c.value + c.step; // varje värde skilt från defaulten
  });
  const q = buildUrlQuery(controls, values, null, "cpi", null);
  const parsedSame = parseUrlValues(controls, "?" + q);
  controls.forEach((c) => {
    near("URL-tur-och-retur (samma lista) " + c.id, parsedSame.values[c.id], values[c.id], 1e-6);
  });
  check("URL-tur-och-retur bär basen", parsedSame.basis === "cpi", parsedSame.basis, "cpi");

  const widerControls = activeControls(MAX_ROWS);
  const parsedWider = parseUrlValues(widerControls, "?" + q);
  controls.forEach((c) => {
    near("URL tolkas korrekt in i en app med fler rader, " + c.id, parsedWider.values[c.id], values[c.id], 1e-6);
  });
  const extraSpec = rowFieldSpecs(n + 1)[0];
  check(
    "en rad bortom länken får sitt eget default, inte något från länken",
    parsedWider.values[extraSpec.id] === undefined,
    parsedWider.values[extraSpec.id],
    undefined
  );
}

// 20. Formatterartur-och-retur över varje kontrolls fulla intervall,
//     inklusive negativa tal (realReturn har min under 0).
{
  CONTROLS.concat(rowFieldSpecs(1)).forEach((c) => {
    [c.min, c.max, (c.min + c.max) / 2].forEach((v) => {
      const text = fieldText(c, v);
      const back = parseField(text);
      const tol = isKr(c) ? 0.51 : 0.006;
      near("formatterartur-och-retur " + c.id + " vid " + v, back, v, tol);
    });
  });
}

// Delade hjälpfunktioner för presettesterna nedan: bygger globals/rows från
// en preset exakt som applyPreset()/rowsFromState() gör i script.js, men
// utan DOM. Använder DELNINGSTAL_ILLUSTRATIV, den TABELL APPEN FAKTISKT
// SKEPPAR, inte testsvitens egen DT: de här testerna vill veta hur presetens
// siffror beter sig i appen, inte testa interpolationsmatematiken isolerat
// (det gör redan test 5 ovan, mot DT).
function globalsFromPreset(preset) {
  const g = {};
  CONTROLS.forEach((c) => {
    g[c.id] = preset.v[c.id] !== undefined ? preset.v[c.id] : c.value;
  });
  return {
    currentAge: g.currentAge,
    income: g.income,
    floor: g.floor,
    allmanMonthly: g.allmanMonthly,
    allmanRefAge: g.allmanRefAge,
    dropTol: g.dropTol / 100,
    realReturn: g.realReturn / 100,
    horizonAge: g.horizonAge,
    maxAge: g.maxAge,
    minSearchAge: g.minSearchAge,
    maxSearchAge: g.maxSearchAge,
    pbb: g.pbb,
    ibb: g.ibb,
    kommunalskatt: g.kommunalskatt / 100,
    skiktgrans: g.skiktgrans,
    table: DELNINGSTAL_ILLUSTRATIV
  };
}
function rowsFromPreset(preset) {
  const n = preset.v.rows;
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const specs = rowFieldSpecs(i);
    const row = {};
    specs.forEach((s) => {
      const field = s.id.slice(("p" + i).length);
      row[field] = preset.v[s.id] !== undefined ? preset.v[s.id] : s.value;
    });
    rows.push(row);
  }
  return rows;
}

// 21. Allt-livsvarigt-preseten (PRESETS[3]) ger earliestNaive === earliest
//     exakt: ingen rad är tidsbegränsad, så det finns ingen klippa att
//     skilja den naiva och den ärliga åldern åt.
{
  const preset = PRESETS[3];
  check('den fjärde preseten heter "Allt livsvarigt"', preset.name === "Allt livsvarigt", preset.name, "Allt livsvarigt");
  const rows = rowsFromPreset(preset);
  check(
    "alla rader i allt-livsvarigt-preseten är faktiskt livsvariga",
    rows.every((r) => r.liv === 1),
    rows.map((r) => r.liv),
    "alla 1"
  );
  const g = globalsFromPreset(preset);
  const result = searchEarliest(rows, g);
  check("allt-livsvarigt-preseten hittar en giltig ålder", result.earliest !== null, result.earliest, "!== null");
  near("allt-livsvarigt-preseten: naiv och ärlig ålder är identiska", result.earliestNaive, result.earliest, 1e-9);
}

// 22. Varje presets faktiska sökresultat matchar vad presetens EGEN
// beskrivning lovar, inte bara att koden råkar köra utan fel. Hittad genom
// att faktiskt köra siffrorna (node, inte "ser rimligt ut"): presetens
// ursprungliga tal gav "aldrig någon ålder" för två av fyra presets och
// "ingen klippa alls" för den som skulle visa klippan, tre tysta fel som
// bara syns om man frågar algoritmen, inte källkoden.
{
  const p0 = rowsAndGlobals(0);
  const r0 = searchEarliest(p0.rows, p0.g);
  check(
    'preset 0 ("tre tjänstepensioner, en tidsbegränsad") visar ett verkligt gap',
    r0.earliest !== null && r0.earliestNaive !== null && r0.earliest > r0.earliestNaive + 1,
    { earliest: r0.earliest, naive: r0.earliestNaive },
    "earliest > naive + 1 år"
  );

  const p1 = rowsAndGlobals(1);
  const r1 = searchEarliest(p1.rows, p1.g);
  check(
    'preset 1 ("bara allmän + liten tjänstepension") hittar en giltig ålder trots 63/64-tröskeln',
    r1.earliest !== null,
    r1.earliest,
    "!== null"
  );

  const p2 = rowsAndGlobals(2);
  const r2 = searchEarliest(p2.rows, p2.g);
  check(
    'preset 2 ("stort privat kapital, kort utbetalningstid") visar det största naiv/ärlig-gapet',
    r2.earliest !== null && r2.earliestNaive !== null && r2.earliest - r2.earliestNaive >= r0.earliest - r0.earliestNaive,
    { earliest: r2.earliest, naive: r2.earliestNaive },
    "gap >= preset 0:s gap"
  );

  function rowsAndGlobals(idx) {
    const preset = PRESETS[idx];
    return { rows: rowsFromPreset(preset), g: globalsFromPreset(preset) };
  }
}

console.log(pass + " pass, " + fail + " fail");
if (fail > 0) process.exit(1);
