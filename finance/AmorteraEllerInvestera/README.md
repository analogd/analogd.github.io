# Amortera eller investera

Answers one question: should the next spare krona go to the mortgage or to an index
fund? The answer is a single number, the **break-even expected return** at which
the two strategies end up with the same net worth.

Open `index.html`. No build step, no dependencies, works from `file://`.

    node test/scenarios.mjs

## What makes it different from the usual comparison

**Both branches spend the same monthly budget.** The budget is today's interest,
today's required amortisation, and the extra amount. The branch that amortises
faster pays less interest, and that freed krona is invested the same month. Most
published comparisons let the amortising branch bank its interest saving without
crediting the investing branch with anything, which decides the answer before the
arithmetic starts.

**The comparison is on net worth**, fund value minus remaining debt, so paying down
a loan is correctly treated as moving money rather than spending it.

**The interest deduction is marginal, not average.** 30 % of interest up to
100 000 kr per person per year, 21 % above that. Which side of the cap the next
krona of interest falls on changes the guaranteed return on amortising, and that is
exactly the number the fund has to beat.

**The amortisation requirement is derived, not entered.** 2 % of the original loan
per year above 70 % LTV, 1 % above 50 %, nothing below, plus one percentage point
above a debt-to-income ratio of 4,5. High up the ladder the choice is not yours:
you amortise anyway and the question only concerns the extra.

## Model

- `../lib/engine.js` does the compounding, the fee and the ISK tax, driven through
  `simulateFlows` with the month-by-month deposit series each branch produces. The
  fund arithmetic is identical to Ränta på ränta by construction.
- `../lib/mortgage.js` holds the Swedish mechanics: `interestDeduction`,
  `marginalDeductionRate`, `afterTaxRate`, `requiredAmortisationRate`,
  `comparePayoffVsInvest`, `breakEvenReturn`.
- Three bases (nominal, KPI, lifestyle-adjusted), same convention and same defaults
  as the other calculators here.

## Assumptions, stated rather than hidden

Every one of these is a slider with a sourced hint, except where noted.

- **Zero volatility.** The comparison is deterministic, which understates the real
  difference between the branches: amortising returns a guaranteed rate, investing
  an expected one. Sequence-of-returns risk is not modelled. This is the biggest
  omission and it is stated in the page.
- **The mortgage rate never changes** over the horizon.
- **The budget is fixed in nominal kronor**, so it gets easier to carry each year.
- **The amortisation bracket is read off the current balance** against a fixed
  property value, so the requirement steps down as the loan shrinks. The real rule
  ties the percentage to the loan at the most recent valuation and only lowers it on
  a new one, so in practice the step down can come later than modelled. A side
  effect worth knowing: a branch that amortises hard can drop out of the requirement
  entirely, which reduces its _required_ amortisation while the freed money goes to
  the fund.
- **The yearly tax reduction is credited into the fund** in both branches, because
  it arrives as cash either way.
- No arrangement fees, no moving costs, no capital gains tax on the property, no
  buffer, no job loss, no change to the tax rules.

## Numbers and their sources

| Number                     | Value                | Source                                    |
| -------------------------- | -------------------- | ----------------------------------------- |
| Ränteavdrag                | 30 %, 21 % above cap | Skatteverket                              |
| Avdragstak                 | 100 000 kr/person/år | Skatteverket                              |
| Amorteringskrav            | 2 % / 1 % / 0 %      | Finansinspektionen, from 1 June 2016      |
| Skuldkvotstak              | +1 pp above 4,5x     | Finansinspektionen, from 1 March 2018     |
| Statslåneränta 30 nov 2025 | 2,55 %               | Riksgälden, governs the 2026 ISK schablon |
| ISK-fribelopp 2026         | 300 000 kr           | Skatteverket                              |

Rules change. Check the figures for the year you are calculating for.
