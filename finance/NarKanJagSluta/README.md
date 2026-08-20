# NarKanJagSluta

Vid din planerade pensionsålder, vad blir nettoinkomsten: rattbar live, ändra
ett kapital och se numret röra sig. Och vad krävs: hur mycket sammanlagt
kapital (tjänstepension + privat/ISK) håller ett golv, lägsta acceptabla
nettoinkomst, hela vägen till slutet av kurvan.

## Modellen

Byggdes om i grunden 2026-08-19 efter feedback från Daniel under live-testning
(se git-historiken för `script.js`). Ursprungsplanen krävde en rad per
tjänstepension/privat-källa för att fånga "klippan" när en tidsbegränsad
tjänstepension tar slut. Daniel ifrågasatte hela premissen: en
tjänstepensions utbetalningsperiod går i praktiken att pausa eller förlänga,
bara inte korta ner, så man styr i regel bort från en klippa i stället för
att råka ut för en. Modellen är nu i stället:

- **Två fasta potter, tjänstepension och privat/ISK, alltid livsvariga.**
  Ingen rad-array, inget "kind"/"liv"/"flex"/"years"/"mode"-fält kvar. Varje
  pott är ett enda kapitalbelopp, självannuitiserat till horisontåldern från
  den ålder du provar. Se "vad den inte gör" för vad det kostar i precision.
- **Kapitalfälten är vad du väntas ha VID pensionen, inte idag.** En tidigare
  version tog kapitalet som "idag" och räknade upp det med real avkastning
  fram till provad ålder, vilket i onödan band in din nuvarande ålder i en
  fråga som inte behöver den. `potGrossMonthly` i `script.js` tar `pot.cap`
  rakt av, ingen `growCapital`-projektion.
- **Allmän pension** flyttas mellan åldrar med Pensionsmyndighetens egen
  delningstalskvot (`allmanMonthlyAtAge` i `../lib/pension.js`), inte
  återberäknad från en inkomsthistoria. Att sluta jobba innan prognosens ålder
  kostar de uteblivna årens pensionsrätt (`allmanShortfallMonthly`). Går inte
  att ta ut före `LAGSTA_UTTAGSALDER_ALLMAN` (64 år, 2026), en verklig spärr:
  planerar du att sluta tidigare bär tjänstepensionen/privat/ISK hela
  inkomsten själva fram till dess (den "gap"-notisen på sidan).
- **Skatten** är den fulla grundavdragsmodellen (`grundavdrag`,
  `inkomstskattPension`), inklusive det förhöjda grundavdraget från 66 år,
  transkriberad från Finansdepartementets Beräkningskonventioner 2026 och
  korsverifierad mot Skatteverkets skiktgränstabell 2026.
- **Kapitalpotterna** annuitiseras med
  `monthlyFromCapital`/`monthlyFromCapitalLifelong`, den reala
  ränta-på-ränta-konventionen `(1+r)^(1/12)-1`, medvetet INTE
  `../lib/mortgage.js`s `annuityPayment` (nominell `rate/12`, rätt för ett
  bolån, fel för en portfölj).
- **Den omvända frågan har en sluten bisektion, inte bara en sökning.**
  `requiredCapitalForFloor(globals, A, floor)` löser för det sammanlagda
  kapital (tjänstepension + privat/ISK, fördelningen spelar ingen roll, se
  testet "en storhet, ett tal för potterna") som håller golvet vid en given
  ålder. Nettot är monotont icke-avtagande i kapitalet (mer kapital ger mer
  bruttoinkomst, och en progressiv skatt sänker aldrig nettot när bruttot
  stiger), så bisektionen är giltig utan att härleda en sluten form ur hela
  grundavdragsbrakettabellen.
- **Ingen sökning kvar.** En sekundär "sök nedåt efter lägsta pensionsålder"
  fanns fram till 2026-08-20 (`searchEarliest`, en uppfyllbarhetsremsa, en
  egen rubrik, `minSearchAge`/`maxSearchAge`). Struken efter Daniels "vem
  kommer vilja skruva på Självannuitiseringshorisont? slutålder?": hela
  sök-maskineriet var kvarleva från planens ursprungliga skiss, inte den
  faktiska frågan, som alltid varit direkt (given en ålder, vad blir nettot;
  given ett golv, vad krävs). `evaluate` verifierar ändå hela kurvan till
  `maxAge`, inte bara startåret: kurvan råkar vara monotont icke-avtagande i
  ålder givet modellens antaganden (testat i `test/scenarios.mjs`), men
  koden litar inte på den egenskapen i tysthet.
- **Modellen räknar i reala termer nativt** (dagens kronor), inte nominellt:
  vänt om jämfört med RantaPaRanta/`../lib/engine.js`s konvention. Basväljaren
  (nominellt/dagens kronor/livsstilsjusterat) räknar därför UPP mot nominellt
  och NER mot livsstilsjusterat, i stället för att deflatera nedåt från ett
  nominellt grundläge, se kommentaren vid `displayFactor` i `script.js`.
- **Åldern ändras aldrig med basväljaren, bara de visade kronorna gör det.**
  `incomeCurve`/`evaluate` kör alltid i modellens reala nativa termer, så
  åldern är basoberoende av konstruktion. Golvlinjen i diagrammet och
  golv-relaterade statistikrader konverteras med samma per-ålder-faktor som
  nettot, annars hade en rät golvlinje jämförts mot en nettokurva som lutar i
  nom/life-basen: samma slags bas-riktningsbugg finance/CLAUDE.md varnar för,
  bara i en SVG i stället för i en formel.
- **Defaultbasen är dagens kronor, inte livsstilsjusterat som resten av
  sajten** (`../CLAUDE.md`s "Basis conventions" dokumenterar undantaget).
  Standardglidning prisar in att normal standard stiger över tid, rätt lins
  för ett sparande som jämförs mot framtida jämnåriga, fel lins för en
  pension där man jämför sin egen framtida konsumtion mot sin egen nuvarande:
  "the retirement spending smile"-forskningen visar att konsumtionen snarare
  planar ut eller krymper med åldern. Livsstilsjusterat hade systematiskt
  överskattat behovet längre fram.

## Ärlighetsknappar, total omtag 2026-08-20

Daniel: "vem kommer vilja skruva på Självannuitiseringshorisont? slutålder?
osv osv osv." Tre åtgärder:

- **`maxAge` (tidigare "Kurvans slutålder") är inte längre en kontroll.**
  Ingen läsare hade en åsikt om den, bara om horisonten pengarna faktiskt ska
  räcka till. `globalsFromState` sätter den nu till `horizonAge +
CURVE_END_MARGIN_YEARS` (10 år marginal), aldrig kortare än horisonten
  själv.
- **`minSearchAge`/`maxSearchAge` är borta** tillsammans med hela
  sök-maskineriet, se ovan.
- **Inflation och standardglidning flyttade fysiskt till basis-raden**, bredvid
  "Din ålder nu": alla tre rör bara vad en viss basväljarknapp betyder, ingen
  kapital- eller åldersberäkning, och att lista dem bland "Ärlighetsknappar"
  fick dem att se ut som allmänna antaganden. De är fortfarande
  ärlighetsknappar i kod (`group: "honesty"`, presets rör dem aldrig), bara
  fysiskt renderade på annat håll via `hostOverride: "basis-age"` i
  `CONTROLS`.

## Vad allmän pension betyder här

Allmän pension räknas separat (en delningstalsprognos, inte en kapitalpott)
och är strukturellt aldrig en av de två potterna: `incomeCurve` i `script.js`
lägger till den via `allmanGrossMonthly`, oberoende av `pots`-arrayen. Den
fasta "Allmän pension"-kontrollgruppen (`allmanMonthly`/`allmanRefAge`/
`income`) kan därför strukturellt inte tas bort på samma sätt en pott kan
nollställas.

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
bostadstillägg, tjänstepension och privat/ISK-kapital antas alltid livsvariga
och startandes exakt vid den provade pensionsåldern (ingen tidsbegränsad
utbetalning), livsvariga potter självannuitiseras (poolas inte mot
dödlighet), ingen uttagsordningsoptimering, kapitalfälten anger vad du väntas
ha VID pensionen utan att appen räknar upp ett nu-belopp åt dig. Tjänstepension
och privat/ISK annuitiseras identiskt trots att de är olika flexibla i
verkligheten (privat/ISK kan tas ut hur som helst, en tjänstepension är
bunden av produktens regler).

## Personuppgifter

Presets och CONTROLS-defaultvärden är syntetiska, runda tal, aldrig Daniels
riktiga pensionssiffror. `test/scenarios.mjs` asserterar att varje kronbelopp
i CONTROLS/PRESETS är runt, en tripwire mot att ett riktigt belopp klistras in
vid en senare redigering. Statutoriska konstanter (prisbasbelopp,
inkomstbasbelopp, skiktgräns, kommunalskatt) är undantagna från den
kontrollen: de är offentliga för alla, ingen privatlivsrisk, och ska tvärtom
vara källbelagda till kronan, inte avrundade för att se runda ut.

## Test

```
node test/scenarios.mjs
```

Täcker: lagstadgade/slutna-form-tal mot publicerade tabeller (nolltolerans),
delningstalsinterpolation och dess tur-och-retur-identitet, grundavdraget vid
varje brakettgräns inklusive det förhöjda och hundralapps-avrundningen, att
kurvan är monotont icke-avtagande i ålder, att fördelningen mellan potterna
aldrig ändrar det sammanlagda nettot, `requiredCapitalForFloor` mot en
oberoende handbyggd annuitets- och skattekedja plus en gränsvärdeskoll (en
krona mindre kapital håller inte golvet), URL-tur-och-retur,
formatterartur-och-retur över varje kontrolls fulla intervall inklusive
negativa tal, att presets aldrig sätter en ärlighetsknapp (oavsett var den
fysiskt renderas), och roundness-tripwiren mot personuppgifter.
