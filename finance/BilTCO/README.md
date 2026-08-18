# BilTCO

Bilens verkliga månadskostnad, uppdelad i fast kostnad (oavsett körning) och
marginell kostnad (per mil). Byggd autonomt enligt spec, se beslut och
antaganden nedan för allt som ägaren bör kunna överpröva.

## Modellen

- **Värdeminskning**: fallande saldo. Varje år tappar bilen en andel av sitt
  aktuella värde, en tidsdel (`Värdeminskning, tid`) och en körsträckedel
  (`Värdeminskning, körsträcka`, skalad mot mil/år). Det ger den branta-först-
  formen en rak linje inte kan, av samma anledning som en 2-årig bil tappar
  fler kronor än en 10-årig fast båda tappar samma procent.
- **Kapitalkostnad**: alternativkostnaden på den egna insatsen (pris minus
  lånefinansierad andel), räknad med `finance/lib/engine.js`s `simulate()`
  (samma motor som Ränta på ränta), inte en egen implementation.
- **Räntekostnad**: enkel ränta på halva lånebeloppet (antar rak amortering
  till noll över ägandehorisonten). Hålls separat från kapitalkostnaden: lånad
  peng är aldrig peng du kunde investerat, så att lägga ihop dem hade räknat
  samma krona två gånger.
- **Drivmedel**: liter/100 km eller kWh/100 km, med prislapp per liter/kWh, styrt
  av en elbil-växel.
- **Försäkring, fordonsskatt, besiktning, däck**: egna kontroller.
- **Service och reparationer**: stiger med bilens ålder (inte ägandeår), en
  konstant procentsats per år.
- **Fast vs marginellt**: fast = allt som aldrig läser körsträckan i sin
  formel (värdeminskningens tidsdel, kapitalkostnad, räntekostnad, försäkring,
  skatt, besiktning, däck, service, parkering). Marginellt = drivmedel plus
  körsträckedelen av värdeminskningen. Delningen är exakt av konstruktion, inte
  en approximation, testat i `test/scenarios.mjs`.
- **Jämförelseläge**: två bilar, delar körvanor och finansieringsantaganden,
  skiljer sig bara i det som faktiskt skiljer en bil från en annan. Länkar
  vidare till Ränta på ränta med `monthly` satt till skillnaden.
- **Dela på kostnaden**: en liten, medveten sidoruta. Föraren äger bilen oavsett,
  så en medresenärs riktiga kostnad är marginalkostnaden, aldrig en andel av
  det fasta. Tre baser (bara bränsle, Skatteverkets schablon, appens egen
  marginalkostnad) visar normen som ett tal.

## Verifierat mot extern källa

- **Skatteverkets skattefria bilersättning, egen bil: 25 kr/mil.** Gäller
  inkomståren 2025 och 2026 (oförändrat sedan 1 januari 2023). Källa:
  [skatteverket.se](https://www.skatteverket.se/privat/etjansterochblanketter/svarpavanligafragor/avdrag/privattjansteresafaq/jagreserendelitjanstenvilkareglergallerfordekostnadsersattningarsomjagfaravminarbetsgivare.5.10010ec103545f243e80001472.html),
  testad i `test/scenarios.mjs` (`SKV_MIL_ERSATTNING === 25`).
- **Malus (förhöjd fordonsskatt): 3 år, tröskel 75 g CO2/km, 107 kr/gram upp
  till 125 g, 132 kr/gram därutöver, 360 kr grundbelopp.** Källa:
  [transportstyrelsen.se/malus](https://www.transportstyrelsen.se/sv/vagtrafik/fordon/skatter-och-avgifter/malus/).
  Står i fordonsskattens ledtext som kontext, matar inte in i beräkningen:
  fordonsskatten är en egen kontroll eftersom den verkliga formeln också beror
  på vikt och koldioxidklass, utanför den här appens omfattning.

## Siffror som behöver kontrolleras (overifierade defaults)

Alla följande är rimlighetsantaganden, inte uppmätta eller källbelagda tal.
Ledtexten på varje kontroll säger "Overifierat":

- Körsträcka per år (1 200 mil), nämnt mot ett SCB-snitt men inte verifierat
  mot en specifik SCB-tabell.
- Ränta på billån (6 %).
- Värdeminskning, tid och körsträcka (15 %/år respektive 2 %/1000 mil/år).
- Bränslepris (18,50 kr/l) och elpris (2,50 kr/kWh).
- Försäkring (8 000 kr/år) och fordonsskatt (2 000 kr/år): varierar extremt
  mycket per bil, förare och ort, kan inte ha en meningsfull default.
- Besiktningskostnad (500 kr) och intervall (2 år, förenklat till jämnt
  intervall, i verkligheten styrt av bilens ålder).
- Däckkostnad per sats (6 000 kr) och livslängd (4 säsonger).
- Service vid ny bil (3 000 kr/år) och ökningstakt med ålder (12 %/år): ett
  modellantagande, inte en uppmätt kurva.

## Beslut ägaren bör kunna överpröva

- **Distansenhet är mil**, inte km, för att matcha Skatteverkets schablon och
  svenska förbrukningssiffror.
- **Räntekostnaden antar rak amortering till noll** över ägandehorisonten
  (lånetid = ägandehorisont), inte en annuitet. En verklig annuitetslan lägger
  mer ränta i början; denna förenkling underskattar år ett och överskattar de
  sista åren.
- **Kapitalkostnaden räknas bara på den kontanta insatsen**, inte på hela
  priset. Den lånade delen prissätts separat som räntekostnad.
- **Körsträckans effekt på värdeminskningen är definierad mot en
  körsträcke-fri hypotetisk kurva** (se kommentaren i `script.js` vid
  `carValueSeries`), så att "fast" aldrig kan bero på körsträckan, ens
  indirekt via nästa års lägre bas. Interaktionseffekten (att mer körning
  lämnar en mindre bas för nästa års tidsberoende värdeminskning) hamnar då
  helt i den marginella kostnaden.
- **Besiktning är ett jämnt intervall**, inte Transportstyrelsens verkliga
  schema (var 14:e månad efter en viss ålder).
- **Däck antas kräva två satser (sommar och vinter) och slits av tid**, inte
  av körsträcka.
- **Jämförelseläget delar körvanor och finansieringsantaganden** mellan bil A
  och bil B (samma `years`, `annualMil`, `financedShare`, `ret`,
  `interestRate`, besiktning, däcklivslängd, parkering). Bara det som
  faktiskt skiljer en bil åt (pris, värdeminskning, drift, service) är egna
  kontroller för bil B.
- **Fordonsskatten är en manuell kontroll**, inte beräknad från CO2 och vikt,
  trots att malus-reglerna är verifierade: den fulla formeln kräver fler
  fordonsspecifika indata än appen samlar in i denna version.

## Test

```
node test/scenarios.mjs
```

256 assertions, 0 misslyckade vid leverans. Täcker: fallande-saldo-
värdeminskning mot handräkning (år 1 > år 5), fast+marginellt=totalt vid två
körsträckor, kr/mil fallande med körsträcka, Skatteverkets schablon,
jämförelsedeltats symmetri och tecken, RantaPaRanta-länkens rundtur, samt
formatter-rundturen över varje kontrolls fulla intervall inklusive sv-SE:s
minustecken (U+2212).
