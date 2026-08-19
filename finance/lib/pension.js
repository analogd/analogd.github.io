"use strict";

// Pensionsmekanik som delas av NarKanJagSluta. Samma skäl som engine.js och
// mortgage.js: script utan beroenden, ren aritmetik, ingen DOM, så sidan
// fungerar öppnad direkt från disk.
//
// Lagstadgade tal här bär det år de gäller från, och varje ett är en
// parameter med ett default istället för en konstant svetsad in i en formel,
// samma konvention som mortgage.js's interestDeduction. Källor länkas i appen.

// ---------- källbelagda konstanter, inkomstår 2026 ----------

// Prisbasbelopp 2026, SCB/Regeringen.
const PBB = 59200;

// Inkomstbasbelopp 2026, Pensionsmyndigheten.
const IBB = 83400;

// Allmän pensionsavgift, lagen (1994:1744): 7 % av pensionsgrundande inkomst.
const PENSIONSAVGIFT = 0.07;

// Taket för pensionsgrundande inkomst: 7,5 inkomstbasbelopp. Lön över taket
// ger noll extra allmän pension, den brytpunkt en egenföretagare som styr sin
// egen lön ofta lägger sig precis vid. 625 500 kr för 2026 (7,5 * 83 400),
// verifierat mot Skatteverkets tabell.
const IBB_TAK_PENSIONSRATT = 7.5;

// Bruttolönebrytpunkten uttryckt i IBB är den EXAKTA kvoten 7,5/(1-0,07)
// avrundad uppåt till två decimaler, inte den exakta kvoten själv:
// Finansdepartementet räknar den officiella brytpunkten som 8,07 IBB rakt av
// (se Beräkningskonventioner, fotnot om PGI-taket), vilket ger 673 038 kr för
// 2026 (8,07 * 83 400). Den orundade kvoten (7,5/0,93) ger 672 581 kr, en
// krona-för-krona-skillnad mot den publicerade siffran, så den här appen
// använder den avrundade 8,07 för att träffa myndighetens egen siffra exakt.
const BRUTTOLONETAK_IBB = 8.07;

// 16 % inkomstpension + 2,5 % premiepension = 18,5 % av pensionsunderlaget.
const PENSIONSRATT_ANDEL = 0.185;

// Lägsta uttagsålder för allmän pension, Pensionsmyndigheten: 64 år från 2026
// (höjt från 63 år 2023-2025, från 62 år 2020-2022). Kontrollera vid ett
// senare års implementation, den här trappan höjs successivt.
const LAGSTA_UTTAGSALDER_ALLMAN = 64;

// Riktålder 2026-2031, Pensionsmyndigheten: 67 år.
const RIKTALDER = 67;

// Åldern vid beskattningsårets ingång som ger det förhöjda grundavdraget:
// 66 år för inkomstår 2026, höjs till 67 år från 2027.
const FORHOJT_GRUNDAVDRAG_ALDER = 66;

// Skiktgräns för statlig inkomstskatt 2026 (beskattningsbar inkomst), och den
// kommunala medelskattesatsen 2025 (den senast kända när 2026 räknas, enligt
// Finansdepartementets konvention). Statlig skatt 20 % över skiktgränsen.
const SKIKTGRANS = 643000;
const KOMMUNALSKATT_SNITT = 0.3241;
const STATLIG_SKATT = 0.2;

// ---------- kapital till utbetalning ----------

// Sluten-form jämn real annuitet: det månadsbelopp som exakt tömmer capital
// över months månader vid en real månadsränta härledd från realReturn.
// Konventionen är effektiv ränta-på-ränta, (1+realReturn)^(1/12)-1, samma som
// engine.js använder, INTE mortgage.js's annuityPayment (som medvetet
// använder rate/12, den nominella konvention en bank citerar ett bolån med).
// En pensionsportfölj ränta-på-ränta-växer, ett bolån gör inte det, så den
// här appen får inte återanvända mortgage.js's formel.
function monthlyFromCapital(capital, realReturn, months) {
  if (!(months > 0) || capital <= 0) return 0;
  const r = Math.pow(1 + realReturn, 1 / 12) - 1;
  if (Math.abs(r) < 1e-12) return capital / months;
  return (capital * r) / (1 - Math.pow(1 + r, -months));
}

// Ren ränta-på-ränta över decimala år.
function growCapital(capital, realReturn, years) {
  return capital * Math.pow(1 + realReturn, years);
}

// Samma, plus slutvärdet av en jämn månatlig avsättning: representerar
// fortsatt tjänstepensionsavsättning eller ISK-sparande fram till radens
// startålder, med ett enda platt kr/mån-fält, ingen lönekurva.
function growCapitalWithContrib(capital, monthlyContrib, realReturn, years) {
  const months = Math.round(years * 12);
  const r = Math.pow(1 + realReturn, 1 / 12) - 1;
  const fvCapital = growCapital(capital, realReturn, years);
  const fvContrib = Math.abs(r) < 1e-12 ? monthlyContrib * months : monthlyContrib * ((Math.pow(1 + r, months) - 1) / r);
  return fvCapital + fvContrib;
}

// Självannuitisering till en horisont, uttryckligen INTE dödlighetspoolning:
// ett försäkringsbolags livsvariga annuitet kan betala mer från samma
// kapital. horizonAge är därför en ärlighetsratt, inte en dold konstant.
function monthlyFromCapitalLifelong(capital, realReturn, startAge, horizonAge) {
  return monthlyFromCapital(capital, realReturn, Math.round((horizonAge - startAge) * 12));
}

// ---------- allmän pension: delningstalsvidareföring ----------

// Linjär interpolation mellan heltalsåldrar i en delningstalstabell
// [{age, value}, ...] sorterad stigande på age.
function delningstalAt(age, table) {
  if (!table || table.length === 0) return NaN;
  if (age <= table[0].age) return table[0].value;
  const last = table[table.length - 1];
  if (age >= last.age) return last.value;
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (age >= a.age && age <= b.age) {
      const t = (age - a.age) / (b.age - a.age);
      return a.value + t * (b.value - a.value);
    }
  }
  return NaN;
}

// En prognos läst vid refAge flyttas exakt till age med Pensionsmyndighetens
// egen delningstalskvot: behållningen förkortas bort, så ingen PGI-historik
// behöver återberäknas. Det är det externa ankaret för allmän-pension-delen.
// Returnerar 0 under den lägsta uttagsåldern.
function allmanMonthlyAtAge(o) {
  if (o.age < LAGSTA_UTTAGSALDER_ALLMAN) return 0;
  return (o.monthlyAtRef * delningstalAt(o.refAge, o.table)) / delningstalAt(o.age, o.table);
}

// Pensionsgrundande inkomst: 7 % pensionsavgift dras först, sedan takas vid
// 7,5 inkomstbasbelopp. IBB_TAK_PENSIONSRATT/(1-PENSIONSAVGIFT) är därför
// bruttolönebrytpunkten där mer lön ger noll extra pensionsrätt (~8,07 IBB,
// 673 038 kr för 2026, verifierat mot Skatteverkets tabell).
function pensionsUnderlag(income, ibb) {
  return Math.min(income * (1 - PENSIONSAVGIFT), IBB_TAK_PENSIONSRATT * ibb);
}

function pensionsrattPerYear(income, ibb) {
  return PENSIONSRATT_ANDEL * pensionsUnderlag(income, ibb);
}

function brytpunktAllmanPension(ibb) {
  return BRUTTOLONETAK_IBB * ibb;
}

// Prissätter den pensionsrätt som förloras genom att sluta jobba
// yearsNotWorked år tidigare än prognosens antagande: varje uteblivet års
// pensionsrätt växer som en jämn årlig annuitet (pensionsrätten krediteras en
// gång om året, inte månatligt) till uttagsåldern, delas med
// 12 * delningstal(age). Den naiva "bara gå i pension tidigare" dubbelräknar
// genom att både sluta tidigare och behålla hela prognosen, det här är vad
// den skillnaden kostar i kr/mån.
function allmanShortfallMonthly(o) {
  if (o.pensionsratt <= 0 || o.yearsNotWorked <= 0) return 0;
  const fv =
    Math.abs(o.realReturn) < 1e-12
      ? o.pensionsratt * o.yearsNotWorked
      : o.pensionsratt * ((Math.pow(1 + o.realReturn, o.yearsNotWorked) - 1) / o.realReturn);
  return Math.max(0, fv / (12 * delningstalAt(o.age, o.table)));
}

// ---------- grundavdrag: appens motsvarighet till interestDeduction ----------

function roundDownHundred(x) {
  return Math.floor(Math.max(0, x) / 100) * 100;
}
function roundUpHundred(x) {
  return Math.ceil(Math.max(0, x) / 100) * 100;
}

// Ordinarie grundavdrag, 63 kap 3 § IL. Brakettabellen är transkriberad från
// Finansdepartementets Beräkningskonventioner 2026, tabell 2.2, och
// korsverifierad till kronan mot Skatteverkets/Finansdepartementets
// "Skiktgränser, brytpunkter, prisbasbelopp" 2026-tabell (45 600 / 25 100 /
// 17 400 kr). En hump-form, inte monotont fallande: lägst vid mycket låg
// inkomst, högst i mitten, lägre igen vid hög inkomst.
function grundavdragBas(ffi, pbb) {
  const f = roundDownHundred(ffi);
  if (f <= 0.99 * pbb) return 0.423 * pbb;
  if (f <= 2.72 * pbb) return 0.225 * pbb + 0.2 * f;
  if (f <= 3.11 * pbb) return 0.77 * pbb;
  if (f <= 7.88 * pbb) return 1.081 * pbb - 0.1 * f;
  return 0.293 * pbb;
}

// Tillägget som ger det förhöjda grundavdraget för den som fyllt
// FORHOJT_GRUNDAVDRAG_ALDER vid beskattningsårets ingång, 63 kap 3 a § IL.
// Transkriberat från samma källa, tabell 2.3 (aviserat förslag i
// budgetpropositionen för 2026), korsverifierat mot tabell 2.4:s 179 100 kr
// vid platån (bas 0,293 PBB + tillägg 2,732 PBB = 3,025 PBB = 179 080,
// avrundas till 179 100) och 117 500 kr vid hög inkomst (0,293+1,691=1,984
// PBB = 117 437, avrundas till 117 500).
function tillaggForhojtGrundavdrag(ffi, pbb) {
  const f = roundDownHundred(ffi);
  if (f <= 0.99 * pbb) return 0.687 * pbb;
  if (f <= 1.11 * pbb) return 0.885 * pbb - 0.2 * f;
  if (f <= 1.965 * pbb) return 0.6 * pbb + 0.057 * f;
  if (f <= 2.72 * pbb) return 0.333 * pbb + 0.1949 * f;
  if (f <= 3.11 * pbb) return -0.212 * pbb + 0.3949 * f;
  if (f <= 3.24 * pbb) return -0.523 * pbb + 0.4949 * f;
  if (f <= 5.0 * pbb) return -0.073 * pbb + 0.356 * f;
  if (f <= 7.88 * pbb) return 0.017 * pbb + 0.338 * f;
  if (f <= 8.08 * pbb) return 0.703 * pbb + 0.251 * f;
  if (f <= 11.16 * pbb) return 2.732 * pbb;
  if (f <= 12.84 * pbb) return 9.652 * pbb - 0.62 * f;
  return 1.691 * pbb;
}

// Grundavdrag (och förhöjt grundavdrag) beräknas var för sig, läggs ihop, och
// avrundas UPPÅT till närmsta hundratal, den lagstadgade regeln. Fastställd
// förvärvsinkomst rundas NER till närmsta hundratal först.
function grundavdrag(yearlyIncome, pbb, forhojt) {
  const f = roundDownHundred(yearlyIncome);
  const total = grundavdragBas(f, pbb) + (forhojt ? tillaggForhojtGrundavdrag(f, pbb) : 0);
  return roundUpHundred(total);
}

// Skattereduktionen för förvärvsinkomster är en egen liten stegad funktion.
// Förenklad här till en platt andel av den kommunala + statliga skatten,
// dokumenterad förenkling (se "vad den inte gör"): den påverkar bara några
// hundralappar i månaden, inte vilken ålder som är den lägsta möjliga.
const SKATTEREDUKTION_ANDEL_APPROX = 0.014;

// Ingen allmän pensionsavgift på pensionsinkomst (bara på pensionsgrundande
// INKOMST AV ARBETE), därför saknas den här med flit.
function inkomstskattPension(o) {
  const forhojtAlder = o.forhojtAlder === undefined ? FORHOJT_GRUNDAVDRAG_ALDER : o.forhojtAlder;
  const forhojt = o.ageAtYearStart >= forhojtAlder;
  const ga = grundavdrag(o.yearly, o.pbb, forhojt);
  const beskattningsbar = Math.max(0, o.yearly - ga);
  const kommunal = beskattningsbar * o.kommunalskatt;
  const statlig = Math.max(0, beskattningsbar - o.skiktgrans) * (o.statligSkatt === undefined ? STATLIG_SKATT : o.statligSkatt);
  const skattereduktionMax = o.skattereduktionMax === undefined ? beskattningsbar * SKATTEREDUKTION_ANDEL_APPROX : o.skattereduktionMax;
  const skattereduktion = Math.min(skattereduktionMax, kommunal + statlig);
  const tax = Math.max(0, kommunal + statlig - skattereduktion);
  const netYearly = o.yearly - tax;
  return {
    grundavdrag: ga,
    beskattningsbar: beskattningsbar,
    kommunal: kommunal,
    statlig: statlig,
    skattereduktion: skattereduktion,
    tax: tax,
    netYearly: netYearly,
    effectiveRate: o.yearly > 0 ? tax / o.yearly : 0
  };
}

// Den enda konverteringen appen anropar för att gå från brutto årslön till
// netto per månad, så "en storhet, ett tal" har en plats att peka på.
function netMonthlyFromGrossYearly(yearly, ageAtYearStart, taxParams) {
  const o = Object.assign({ yearly: yearly, ageAtYearStart: ageAtYearStart }, taxParams);
  return inkomstskattPension(o).netYearly / 12;
}

// ---------- delningstalstabell, appens standardtabell ----------
//
// ILLUSTRATIV, INTE Pensionsmyndighetens publicerade kohorttabell. Det verkliga
// delningstalet skiljer sig per födelseårgång och ligger i en xlsx per årgång i
// Pensionsmyndighetens föreskrifter, inte i en enda gemensam tabell. Formen och
// storleksordningen här är rimlig (delningstalet vid 65 år har historiskt legat
// runt 17-18), men siffrorna är INTE verifierade mot en publicerad kohort och får
// aldrig läsas som ett riktigt prognosunderlag. Appen flaggar detta i UI:t
// (se "Overifierat" vid delningstalsstatistiken) i stället för att gömma det,
// enligt finance/CLAUDE.md's regel om att aldrig dölja ett overifierat antagande
// bakom ett siffra som ser exakt ut.
const DELNINGSTAL_ILLUSTRATIV = [
  { age: 61, value: 21.2 },
  { age: 62, value: 20.3 },
  { age: 63, value: 19.4 },
  { age: 64, value: 18.6 },
  { age: 65, value: 17.79 },
  { age: 66, value: 17.0 },
  { age: 67, value: 16.22 },
  { age: 68, value: 15.5 },
  { age: 69, value: 14.8 },
  { age: 70, value: 14.1 }
];
