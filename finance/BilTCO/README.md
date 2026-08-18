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
- **Räntekostnad**: ett annuitetslån, alltså samma månadsbetalning hela vägen,
  räknat med `annuityInterestTotal` i `finance/lib/mortgage.js`. Lånetiden är
  ägandehorisonten. Hålls separat från kapitalkostnaden: lånad peng är aldrig
  peng du kunde investerat, så att lägga ihop dem hade räknat samma krona två
  gånger.
- **Drivmedel**: liter/100 km eller kWh/100 km, med prislapp per liter/kWh, styrt
  av en elbil-växel.
- **Försäkring, fordonsskatt, besiktning, däck**: egna kontroller.
- **Service och reparationer**: stiger med bilens ålder (inte ägandeår), en
  konstant procentsats per år.
- **Däck och service delas mellan hinkarna**: två reglage sätter hur stor andel
  av vardera som körsträckan driver. Delningen flyttar kostnad mellan fast och
  marginellt, den ändrar aldrig totalen, och den är kalibrerad mot den
  körsträcka användaren angett (se kommentaren vid `computeCar`).
- **Fast vs marginellt**: fast = allt som aldrig läser körsträckan i sin
  formel (värdeminskningens tidsdel, kapitalkostnad, räntekostnad, försäkring,
  skatt, besiktning, tidsdelen av däck och service, parkering). Marginellt =
  drivmedel, körsträckedelen av värdeminskningen och körsträckedelen av däck
  och service. Delningen är exakt av konstruktion, inte
  en approximation, testat i `test/scenarios.mjs`.
- **Jämförelseläge**: två bilar, delar körvanor och finansieringsantaganden,
  skiljer sig bara i det som faktiskt skiljer en bil från en annan. Länkar
  vidare till Ränta på ränta med `monthly` satt till skillnaden.
- **Dela på kostnaden**: en liten, medveten sidoruta. Föraren äger bilen oavsett,
  så en medresenärs riktiga kostnad är marginalkostnaden, aldrig en andel av
  det fasta. Tre baser (bara bränsle, Skatteverkets schablon, appens egen
  marginalkostnad) visar normen som ett tal.

## Verifierat mot extern källa

Varje siffra här ligger som en namngiven konstant i `script.js` och testas mot
den publicerade siffran i `test/scenarios.mjs`. En default som inte står i den
här listan är en gissning och säger "Overifierat" i sin ledtext.

- **Skatteverkets skattefria bilersättning, egen bil: 25 kr/mil.** Gäller
  inkomståren 2025 och 2026 (oförändrat sedan 1 januari 2023). Källa:
  [skatteverket.se](https://www.skatteverket.se/privat/etjansterochblanketter/svarpavanligafragor/avdrag/privattjansteresafaq/jagreserendelitjanstenvilkareglergallerfordekostnadsersattningarsomjagfaravminarbetsgivare.5.10010ec103545f243e80001472.html).
  Används i "Dela på kostnaden".
- **Genomsnittlig körsträcka: 1 243 mil per personbil i trafik, 2025.** Källa:
  [Trafikanalys, Körsträckor 2025](https://www.trafa.se/vagtrafik/korstrackor/),
  tabell PB1, ny metod, publicerad 17 april 2026. Testet räknar fram siffran ur
  två andra tal i samma tabell (7 042 865 683,96 mil / 5 667 287 bilar), så det
  är divisionen som verifieras, inte en avskrift.
- **Fordonsskattens grundformel: 360 kr plus 11 kr per gram CO2 över 111 g/km**
  för personbil av modell 2006 eller senare. Källa:
  [Transportstyrelsen](https://www.transportstyrelsen.se/sv/vagtrafik/fordon/skatter-och-avgifter/fordonsskatt/skattens-storlek/).
  Formeln ligger i `fordonsskatt()` och defaulten är den utvärderad för 150
  g/km, alltså 789 kr. De 150 grammen är däremot inte källbelagda, och det står
  i ledtexten.
- **Besiktningsintervall: 36 månader till första besiktningen, 24 till nästa,
  sedan var 14:e månad.** Källa:
  [Transportstyrelsen, besiktningsregler](https://www.transportstyrelsen.se/sv/vagtrafik/fordon/aga-kopa-eller-salja-fordon/fordonsbesiktning/besiktningsregler/personbil-och-lastbil-som-inte-overstiger-3500-kg-i-totalvikt/).
  Reglaget mäts därför i månader, inte år: 14 går inte att uttrycka i hela år,
  och den utbredda "vartannat år" är fel mot myndighetens egen text.
- **Elpris för hushåll: 239,84 öre/kWh, andra halvåret 2025.** Totalpris
  inklusive nät, elskatt och moms, förbrukarkategori 5 000 till 14 999 kWh/år.
  Källa: [SCB, Elpriser och elavtal](https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__EN__EN0301__EN0301A/SSDHalvarElHus/)
  (tabell SSDHalvarElHus, hämtad via SCB:s API).
- **Malus (förhöjd fordonsskatt): 3 år, tröskel 75 g CO2/km, 107 kr/gram upp
  till 125 g, 132 kr/gram därutöver, 360 kr grundbelopp.** Källa:
  [transportstyrelsen.se/malus](https://www.transportstyrelsen.se/sv/vagtrafik/fordon/skatter-och-avgifter/malus/).
  Står i fordonsskattens ledtext som kontext, matar inte in i beräkningen:
  fordonsskatten är en egen kontroll eftersom den verkliga formeln också beror
  på vikt och koldioxidklass. Tröskeln 75 g gäller bilar tagna i trafik från 1
  juni 2022; äldre malusbilar har 90 eller 95 g.

## Siffror som behöver kontrolleras (overifierade defaults)

Följande är rimlighetsantaganden, inte uppmätta eller källbelagda tal.
Ledtexten på varje kontroll säger "Overifierat":

- Ränta på billån (6 %).
- Värdeminskning, tid och körsträcka (15 %/år respektive 2 %/1000 mil/år).
- Bränslepris (18,50 kr/l). Drivkraft Sverige är rätt källa och publicerar
  månadssnitt för pumppriset, men bara som klientrenderade diagram, så siffran
  gick inte att hämta maskinellt.
- Försäkring (8 000 kr/år): varierar extremt mycket per bil, förare och ort,
  kan inte ha en meningsfull default.
- Besiktningskostnad (500 kr): varierar per station.
- Däckkostnad per sats (6 000 kr) och livslängd (4 säsonger).
- Service vid ny bil (3 000 kr/år) och ökningstakt med ålder (12 %/år): ett
  modellantagande, inte en uppmätt kurva.
- **Andelen av däck och service som drivs av körsträckan (70 % respektive
  50 %).** Eftersökt hos Trafikanalys, Konsumentverket och M Sverige: ingen av
  dem publicerar en kvantifierad uppdelning mellan tid och körsträcka. M
  Sveriges bilkalkyl bekräftar kvalitativt att vissa poster är fasta
  (besiktning) och andra skalar med mil, men ger ingen procentsats och räknar
  inte in plötsliga reparationer alls. Talen är alltså valda, inte mätta.

## Beslut ägaren bör kunna överpröva

- **Distansenhet är mil**, inte km, för att matcha Skatteverkets schablon och
  svenska förbrukningssiffror.
- **Räntekostnaden är en annuitet, inte rak amortering.** Svenska billån
  offereras normalt som annuiteter, alltså en fast månadskostnad hela vägen, och
  en annuitet betar av skulden långsammare än rak amortering, så den kostar mer
  ränta vid samma sats. Lånetiden antas vara lika lång som ägandehorisonten,
  vilket är antagandet som är kvar att överpröva: säljer man bilen tidigare än
  lånet löper är räntekostnaden i underkant. Aritmetiken ligger i
  `finance/lib/mortgage.js`, inte i den här appen.
- **Kapitalkostnaden räknas bara på den kontanta insatsen**, inte på hela
  priset. Den lånade delen prissätts separat som räntekostnad.
- **Körsträckans effekt på värdeminskningen är definierad mot en
  körsträcke-fri hypotetisk kurva** (se kommentaren i `script.js` vid
  `carValueSeries`), så att "fast" aldrig kan bero på körsträckan, ens
  indirekt via nästa års lägre bas. Interaktionseffekten (att mer körning
  lämnar en mindre bas för nästa års tidsberoende värdeminskning) hamnar då
  helt i den marginella kostnaden.
- **Besiktning är ett jämnt intervall** på 14 månader, inte Transportstyrelsens
  trappa (36, sedan 24, sedan 14 månader). Modellen tar alltså i för en bil
  yngre än fem år och stämmer för en äldre.
- **Däck antas kräva två satser (sommar och vinter)**, och 70 % av kostnaden
  antas drivas av körsträckan, 30 % av tid. För service är motsvarande siffra
  50/50. Båda är reglage, båda är ogrundade.
- **Delningen ändrar inte totalen.** Drar man upp körsträckan växer inte däck-
  och servicekostnaden, den omfördelas bara. Den som permanent kör mycket mer
  får själv korta ner "hur länge en sats håller". Delningen svarar på vad en
  extra mil kostar vid nuvarande körande, inte på vad ett annat körmönster
  kostar.
- **Jämförelseläget delar körvanor och finansieringsantaganden** mellan bil A
  och bil B (samma `years`, `annualMil`, `financedShare`, `ret`,
  `interestRate`, besiktning, däcklivslängd, parkering). Bara det som
  faktiskt skiljer en bil åt (pris, värdeminskning, drift, service) är egna
  kontroller för bil B.
- **Fordonsskatten är en manuell kontroll**, inte beräknad från CO2 och vikt.
  Grundformeln är källbelagd och sätter defaulten, men appen frågar aldrig
  efter bilens utsläpp, och den fulla verkliga formeln kräver dessutom vikt och
  koldioxidklass.

## Test

```
node test/scenarios.mjs
```

336 assertions, 0 misslyckade. Täcker: fallande-saldo-värdeminskning mot
handräkning, fast+marginellt=totalt vid flera körsträckor och flera
delningsandelar, invarianten att det fasta aldrig läser körsträckan,
annuitetsräntan mot en månadsvis stegad amorteringsplan (två oberoende
härledningar av samma tal), varje källbelagd default mot sin publicerade
siffra, kr/mil fallande med körsträcka, jämförelsedeltats symmetri och tecken,
RantaPaRanta-länkens rundtur, samt formatter-rundturen över varje kontrolls
fulla intervall inklusive sv-SE:s minustecken (U+2212).
