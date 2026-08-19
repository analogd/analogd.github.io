# NarKanJagSluta

Lägsta möjliga pensionsålder där livsvarig nettoinkomst håller sig över ett
golv, hela vägen, även efter att en tidsbegränsad tjänstepension tagit slut.
minPension.se och Pensionsmyndighetens egna verktyg svarar bara på det motsatta
("vänta längre, få mer"); den här söker nedåt i stället.

## Modellen

- **Per-policy-rader, inte en grovtotal.** Fallmekaniken beror på när varje
  enskild källa slutar betala, en summa döljer exakt det. Allmän pension räknas
  separat (den är en delningstalsprognos, inte en kapitalpott) och är aldrig en
  rad.
- **Allmän pension** flyttas mellan åldrar med Pensionsmyndighetens egen
  delningstalskvot (`allmanMonthlyAtAge` i `../lib/pension.js`), inte
  återberäknad från en inkomsthistorik. Att sluta jobba innan prognosens ålder
  kostar de uteblivna årens pensionsrätt (`allmanShortfallMonthly`), prissatt
  separat så den naiva "bara gå i pension tidigare" inte dubbelräknar.
- **Skatten** är den fulla grundavdragsmodellen (`grundavdrag`,
  `inkomstskattPension`), inklusive det förhöjda grundavdraget från 66 år,
  transkriberad från Finansdepartementets Beräkningskonventioner 2026 och
  korsverifierad mot Skatteverkets skiktgränstabell 2026.
- **Kapitalrader** (tjänstepension eller privat/ISK) annuitiseras med
  `monthlyFromCapital`/`monthlyFromCapitalLifelong`, den reala
  ränta-på-ränta-konventionen `(1+r)^(1/12)-1`, medvetet INTE
  `../lib/mortgage.js`s `annuityPayment` (nominell `rate/12`, rätt för ett
  bolån, fel för en portfölj). En rad kan spara vidare fram till sin egen
  startålder (`contrib`, kr/mån), räknat med `growCapitalWithContrib`.
- **Två villkor, rapporterade separat:** golvet (nettot får aldrig understiga
  X) och fallet (nettot får aldrig sjunka mer än falltoleransen under
  startnivån). "Varför en ålder underkänns" är den användbara informationen,
  och de två skälen är olika problem.
- **Sökningen är en linjär skanning i enmånadssteg, inte en binärsökning.**
  Uppfyllbarheten är bevisbart icke-monoton i pensionsåldern (en fast
  startålder, delningstalskurvan och förhöjt-grundavdrag-steget kan alla göra
  en äldre kandidat sämre än en yngre), testat med ett konstruerat
  motexempel i `test/scenarios.mjs` så en framtida "optimering" till
  binärsökning får ett fel som slår direkt.
- **Modellen räknar i reala termer nativt** (dagens kronor), inte nominellt:
  vänt om jämfört med RantaPaRanta/`../lib/engine.js`s konvention. Basväljaren
  (nominellt/dagens kronor/livsstilsjusterat) räknar därför UPP mot nominellt
  och NER mot livsstilsjusterat, i stället för att deflatera nedåt från ett
  nominellt grundläge, se kommentaren vid `displayFactor` i `script.js`.
- **Åldern ändras aldrig med basväljaren, bara de visade kronorna gör det.**
  `searchEarliest`/`evaluate` kör alltid i modellens reala nativa termer, så
  åldern är basoberoende av konstruktion. Golvlinjen i diagrammet och
  golv-relaterade statistikrader konverteras med samma per-ålder-faktor som
  nettot, annars hade en rät golvlinje jämförts mot en nettokurva som lutar i
  nom/life-basen: samma slags bas-riktningsbugg finance/CLAUDE.md varnar för,
  bara i en SVG i stället för i en formel. Det här är en medveten avvikelse
  från planens ursprungliga skiss (som ville låta basen även flytta åldern):
  en ålder som hoppar när man bara byter visningsläge är svårare att lita på
  än en ålder som står still medan siffrorna runt den räknas om.
- **Defaultbasen är dagens kronor, inte livsstilsjusterat som resten av
  sajten** (`../CLAUDE.md`s "Basis conventions" dokumenterar undantaget).
  Standardglidning prisar in att normal standard stiger över tid, rätt lins
  för ett sparande som jämförs mot framtida jämnåriga, fel lins för en
  pension där man jämför sin egen framtida konsumtion mot sin egen nuvarande:
  "the retirement spending smile"-forskningen visar att konsumtionen snarare
  planar ut eller krymper med åldern. Livsstilsjusterat hade systematiskt
  överskattat behovet längre fram.

## Vad "rad 0" betyder

Planens datamodell säger att rad 0 alltid är "kind 0" (allmän pension) och
inte kan tas bort. I den här implementationen är det den fasta
"Allmän pension"-kontrollgruppen (`allmanMonthly`/`allmanRefAge`/`income`),
inte en genererad `p0`-rad: allmän pension är strukturellt aldrig en rad i
`rows`-arrayen `incomeCurve` räknar på, så den kan strukturellt inte tas bort.

## Verifierat mot extern källa

Se `../lib/pension.js` för källbelagda konstanter (prisbasbelopp, inkomstbasbelopp,
skiktgräns, grundavdragets brakettabell och förhöjda tillägg, allt inkomstår 2026) och `test/scenarios.mjs` för assertionerna mot de publicerade siffrorna.

**Delningstalstabellen är overifierad.** Det verkliga delningstalet publiceras
per födelseårgång i Pensionsmyndighetens föreskrifter (en xlsx per årgång), inte
i en gemensam tabell, och den siffran är inte hämtad än. Tabellen som skeppas
(`DELNINGSTAL_ILLUSTRATIV` i `../lib/pension.js`) har en rimlig storleksordning
men är inte den publicerade kohorttabellen. Flaggat i UI:t och i
`../CLAUDE.md`s pensionskällor-avsnitt.

## Vad den inte gör

Se "Vad den inte gör" på sidan själv för den fullständiga listan. Kort: ingen
avkastningsfördelning eller avkastningsordningsrisk, ingen garantipension eller
bostadstillägg, livsvariga potter självannuitiseras (poolas inte mot
dödlighet), en rads känt månadsbelopp flyttat till en annan startålder bärs
ojusterat, ingen uttagsordningsoptimering, ingen automatisk "hur mycket behöver
jag spara"-lösare för en privat/ISK-rad.

## Personuppgifter

Presets och CONTROLS-defaultvärden är syntetiska, runda tal, aldrig Daniels
riktiga pensionssiffror. Radernas fritextetiketter kodas medvetet inte i
URL:en (det mest identifierande fältet), bara beloppen gör det.
`test/scenarios.mjs` asserterar att varje kronbelopp i CONTROLS/PRESETS är
runt, en tripwire mot att ett riktigt belopp klistras in vid en senare
redigering. Statutoriska konstanter (prisbasbelopp, inkomstbasbelopp,
skiktgräns, kommunalskatt) är undantagna från den kontrollen: de är offentliga
för alla, ingen privatlivsrisk, och ska tvärtom vara källbelagda till kronan,
inte avrundade för att se runda ut.

## Test

```
node test/scenarios.mjs
```

Täcker: lagstadgade/slutna-form-tal mot publicerade tabeller (nolltolerans),
delningstalsinterpolation och dess tur-och-retur-identitet, grundavdraget vid
varje brakettgräns inklusive det förhöjda och hundralapps-avrundningen,
sökalgoritmens icke-monotonicitet med ett namngivet motexempel, att
`earliestNaive` aldrig överstiger `earliest`, att höjt golv aldrig sänker
`earliest` och att höjd falltolerans aldrig höjer den, URL-tur-och-retur med
en dynamisk radlista, formatterartur-och-retur över varje kontrolls fulla
intervall inklusive negativa tal, att presets aldrig sätter en
ärlighetsknapp, och roundness-tripwiren mot personuppgifter.
