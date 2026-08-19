# finance/

Personal-finance calculators. Swedish rules, Swedish audience, Swedish UI text.
The root `CLAUDE.md` bar applies in full; this file adds what the domain needs on
top of it.

## Shared libraries

Loaded as plain scripts, in dependency order, before each app script. ES modules do
not load over `file://`, so they define their names in global scope.

| File              | Holds                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/engine.js`   | The fund arithmetic. `simulateFlows` takes a month-by-month deposit series; `simulate` is the geometric-ramp special case. Bases, deflators, money-weighted return, Monte Carlo band.        |
| `lib/ui.js`       | Formatters, the squared slider curve, the `fieldText`/`parseField` pair, `niceStep`, and the URL contract (`parseUrlValues`, `buildUrlQuery`), which take the app's control list explicitly. |
| `lib/mortgage.js` | Swedish mortgage mechanics: interest deduction with its cap, the amortisation ladder, and the payoff-versus-invest comparison.                                                               |
| `lib/pension.js`  | Pension mechanics: capital-to-annuity math, delningstal carry-forward for allmän pension, the full grundavdrag/förhöjt grundavdrag closed-form tax formulas.                                 |
| `lib/app.css`     | The shared stylesheet.                                                                                                                                                                       |

Each app builds its own DOM, because the layouts genuinely differ. No app
reimplements a formatter, the link format, or any arithmetic.

## Apps

| Directory                 | What it answers                                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RantaPaRanta/`           | What a monthly saving is actually worth after inflation, standardglidning, avgift and ISK-skatt. The calculator the others hand a scenario to.                                                                                      |
| `AmorteraEllerInvestera/` | Mortgage versus index fund, answered as a break-even expected return. Both branches spend the same monthly budget.                                                                                                                  |
| `BilTCO/`                 | A car's true monthly cost, split into fixed and per-mil. Declining-balance depreciation, opportunity cost of the tied-up capital kept separate from loan interest, and a small trip-splitting section priced off the marginal cost. |
| `NarKanJagSluta/`         | Lowest retirement age where lifelong net income stays above a floor, with no cliff when a time-limited tjänstepension payout ends. Per-policy rows, searched downward, unlike minPension/Pensionsmyndigheten's own tools.           |

## Tax and rate numbers

- **Every statutory number carries the year it applies to, in the hint text.**
  Not "statslåneräntan 2,55 %" but which 30 November it was measured on and which
  tax year that governs. The rules change annually and a stale default that looks
  authoritative is worse than no default.
- **Link the primary source, not a blog summary.** Skatteverket for schablon and
  fribelopp, Riksgälden for statslåneräntan, SCB for KPI, Pensionsmyndigheten for
  pension. The source link goes in the page, not only in a comment.
- **Never hardcode a derived figure.** The schablonintäkt is
  `statslåneränta + 1 pp, floor 1,25 %`, and the effective tax is `30 %` of that.
  Compute the chain from the inputs so that changing the SLR slider stays correct;
  a hardcoded 1,065 % is right for exactly one year.
- **The known 2026 numbers**, for cross-checking a new app against RantaPaRanta:
  SLR on 30 Nov 2025 was 2,55 %, so schablon 3,55 % and effective 1,065 % of the
  kapitalunderlag. ISK fribelopp 300 000 kr from 1 Jan 2026, shared across ISK,
  kapitalförsäkring and PEPP. Kapitalunderlag = (value at the start of each
  quarter + deposits during the year) / 4. Verify before reusing; this is a note,
  not a source.
- **State when a simplification favours the user.** RantaPaRanta deducts the ISK
  tax at year end even though it is actually paid via the following year's tax
  return. Small, but the kind of thing that has to be written down rather than
  discovered.

## Pension sources

`NarKanJagSluta/` is built. Start from these rather than from scratch when
extending it, especially the delningstal table (see below, still unverified):

- **pensionsguiden.nu** hosts two calculators, one of them a sparkalkylator that
  models withdrawals: <https://pensionsguiden.nu/sparkalkylator-med-uttag>. The
  author is a well-regarded contributor on the RikaTillsammans forum, so the
  reasoning in the surrounding text is worth reading, not just the arithmetic.
  This is the closest thing to a peer benchmark, and a candidate external anchor.
- **Pensionsmyndigheten** for the statutory layer: allmän pension, inkomstbasbelopp,
  the 7,5 and 8,07 IBB breakpoints, uttagsregler.
- **minpension.se** for what a real forecast contains, and for the vocabulary
  people arrive with.

The withdrawal phase is the gap in RantaPaRanta: it accumulates and stops.
`NarKanJagSluta/` models drawdown and the tax profile of an uttag, but not
sequence-of-returns risk (single real return, no distribution, documented in
its "vad den inte gör").

**Delningstal table, still unverified.** `NarKanJagSluta` ships an illustrative
delningstal table (`DELNINGSTAL_ILLUSTRATIV` in `lib/pension.js`), not
Pensionsmyndighetens published cohort figures: the real delningstal is
published per birth year in Pensionsmyndighetens föreskrifter, one xlsx per
cohort, not a single shared table. Before showing a real pension figure from
this app, fetch the actual cohort table and replace the illustrative one; the
app flags this in its UI in the meantime rather than hiding it.

## Basis conventions

Any app showing a future amount offers the same three bases, with the same names:

- **Nominellt**: kronor on the day. What banks show.
- **Dagens kronor**: deflated by KPI.
- **Livsstilsjusterat**: deflated by KPI _and_ standardglidning, the drift in
  what counts as normal standard that KPI deliberately excludes.

The default is **livsstilsjusterat**, except in `NarKanJagSluta`, which
defaults to **dagens kronor**. Standardglidning models rising _expectations_
of normal, the right lens for comparing a future pot against future peers
while accumulating. A retirement question compares your own future
consumption against your own current one, and the "retirement spending
smile" research shows that tends to flatten or shrink with age, not keep
rising with the rest of society. Defaulting to livsstilsjusterat there would
systematically overstate how much a retiree needs later. Any new
withdrawal-phase app should default the same way, for the same reason; a
new accumulation-phase app should default to livsstilsjusterat like
RantaPaRanta.

Contributions are deflated by _their own date_, never by the end year, and an
amount paid today is not deflated at all. Deflating a running total by the
end-year factor cancels inflation out of the comparison entirely, which is the
bug that made "förlorad köpkraft" unreachable in the first version.

`NarKanJagSluta` is the one app where the basis toggle changes only the
displayed kronor figures, never the headline age: its model runs natively in
real terms (equivalent to the "dagens kronor" basis), so the earliest age is
basis-invariant by construction, and every money figure shown at a given age
(chart, stats, floor line) is converted by the same per-age factor so they
stay mutually consistent when the basis changes.

## Cross-linking

The point of a shared directory is that an alternativkostnad computed in one app
can be handed to RantaPaRanta rather than re-implemented. When an app needs that:

- The receiving app reads its state from URL query parameters, one per control,
  named exactly as the control ids, and falls back to its defaults for anything
  absent. That is the only permitted state channel between apps.
- The sending app shows its own schablonberäkning inline, and offers a link that
  opens RantaPaRanta prefilled. Do not fork the engine.
- A prefilled link is a claim about someone's money, so the sending app states
  which of its numbers it passed and which RantaPaRanta defaults are still in
  force.

## Not financial advice

These are models. No app here recommends a product, an allocation or a decision,
and none of them collect or transmit anything. Keep it that way.
