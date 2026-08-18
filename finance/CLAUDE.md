# finance/

Personal-finance calculators. Swedish rules, Swedish audience, Swedish UI text.
The root `CLAUDE.md` bar applies in full; this file adds what the domain needs on
top of it.

## Apps

| Directory       | What it answers                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `RantaPaRanta/` | What a monthly saving is actually worth after inflation, standardglidning, avgift and ISK-skatt. The reference engine the others link into. |

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

## Pension sources, for when the pension app gets built

A dedicated session is planned for designing the pension calculators. Start from
these rather than from scratch:

- **pensionsguiden.nu** hosts two calculators, one of them a sparkalkylator that
  models withdrawals: <https://pensionsguiden.nu/sparkalkylator-med-uttag>. The
  author is a well-regarded contributor on the RikaTillsammans forum, so the
  reasoning in the surrounding text is worth reading, not just the arithmetic.
  This is the closest thing to a peer benchmark, and a candidate external anchor.
- **Pensionsmyndigheten** for the statutory layer: allmän pension, inkomstbasbelopp,
  the 7,5 and 8,07 IBB breakpoints, uttagsregler.
- **minpension.se** for what a real forecast contains, and for the vocabulary
  people arrive with.

The withdrawal phase is the gap in RantaPaRanta: it accumulates and stops. Any
pension app has to model drawdown, sequence-of-returns risk in the first years of
withdrawal, and the tax profile of an uttag, none of which exist here yet.

## Basis conventions

Any app showing a future amount offers the same three bases, with the same names,
and defaults to the same one:

- **Nominellt**: kronor on the day. What banks show.
- **Dagens kronor**: deflated by KPI.
- **Livsstilsjusterat** (default): deflated by KPI _and_ standardglidning, the
  drift in what counts as normal standard that KPI deliberately excludes.

Contributions are deflated by _their own date_, never by the end year, and an
amount paid today is not deflated at all. Deflating a running total by the
end-year factor cancels inflation out of the comparison entirely, which is the
bug that made "förlorad köpkraft" unreachable in the first version.

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
