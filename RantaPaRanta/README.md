# Ränta på ränta, osockrat

A compound interest calculator that does not flatter. Same monthly engine every
Swedish bank calculator uses, plus the four things they leave out: inflation,
standard-of-living drift, fees and ISK tax, a contribution that changes over
time, and a Monte Carlo spread instead of one smooth line.

**[Live](https://analogd.github.io/RantaPaRanta/)** · Zero dependencies · 110 scenario tests

## Files

```
RantaPaRanta/
├── index.html            markup and all the explanatory prose
├── styles.css            dark theme, matches the site palette
├── script.js             engine + chart + UI, plain script (no modules)
└── test/scenarios.mjs    headless Node runner, the only way this gets verified
```

`script.js` is a classic script, not an ES module, so the page works when opened
straight from disk (`file://` blocks module loading). The test runner therefore
evaluates it in a `vm` with a stub DOM and pulls the functions out. Same spirit
as `BoxSmith/lib/test/diagnose.mjs`.

## Run and verify

```sh
node test/scenarios.mjs      # 110 checks, must be 0 failures
npx prettier --check .       # repo uses printWidth 140
open index.html              # no build step
```

**There is no browser automation on this machine.** `screencapture` has no
permission, playwright is not installed, and launching Chrome violates company
policy (Prisma is the sanctioned browser, and headless Chromium hangs behind the
firewall). Verify the maths in Node, then ask Daniel to look at the page. Do not
burn a turn trying to screenshot it.

## Model conventions

Deliberate choices, each locked by a test:

- **Monthly, geometric.** Growth factor is `(1+r)^(1/12)`, not `r/12`. The
  contribution goes in at the start of the month and then grows (annuity-due).
  This matches Lysa's published formula exactly.
- **Fees** are charged on capital every month, `(1-fee)^(1/12)`, not on returns.
- **ISK tax** is charged once a year on a real kapitalunderlag: the value at the
  opening of each quarter plus the year's deposits, divided by four. Schablon is
  `max(SLR + 1pp, 1.25 %)`, taxed at 30 %. The fribelopp is a deduction on the
  kapitalunderlag.
- **Real cost basis.** Each contribution is deflated from its own date; the
  start amount is never deflated because it is paid today. Deflating the running
  total by the end-year factor (an early bug) cancels inflation out of the
  value-versus-paid-in comparison and makes the shortfall series unreachable.
- **Monte Carlo** uses lognormal monthly returns with the median set to the
  assumed return, from a seeded PRNG generated once, so dragging a slider does
  not make the band jitter. 1 200 paths, recomputed on a 130 ms debounce because
  a pass costs about 100 ms.
- **The median line sits above the bars** and that is correct, not a bug: the
  bars are one fixed-return scenario, and spreading contributions over time
  diversifies away some of the distribution's skew, pulling the median up toward
  the mean.

## Verified anchors

Do not change these without re-checking the source:

| Anchor                     | Value                                                    | Source                                |
| -------------------------- | -------------------------------------------------------- | ------------------------------------- |
| Lysa reference run         | 10 000 kr + 2 000 kr/mån, 7 %, 20 år = 1 059 509 kr      | lysa.se/ranta-pa-ranta, fetched       |
| Closed form                | annuity-due with geometric monthly rate, 0 kr difference | test 2                                |
| Statslåneränta 30 nov 2025 | 2,55 %, so schablon 3,55 % for 2026                      | Skatteverket, Belopp och procent 2026 |
| ISK effective tax 2026     | 1,065 % of kapitalunderlag above the fribelopp           | 30 % of 3,55 %                        |
| ISK fribelopp              | 300 000 kr from 1 Jan 2026 (was 150 000 in 2025)         | Skatteverket                          |
| Fee as a rate haircut      | 0,4 %/år is exactly 7 % becoming 6,572 %                 | 1,07 x 0,996                          |

## New tax year checklist

1. Statslåneräntan as of 30 November the previous year, not today's rate. It is
   the `slr` default in `CONTROLS`.
2. The fribelopp, and whether it still covers ISK, kapitalförsäkring and PEPP
   together. It is the `iskFree` default.
3. Update the numbers stated in the ISK bullet in `index.html` and the anchor
   table above, then update the test that locks them (test 15).

## UI decisions worth keeping

- **The legend is the series control.** Clicking a legend item toggles that
  series and the axis rescales to whatever is drawn. There is deliberately no
  second control for the same thing.
- **The spread starts hidden**, because p90 otherwise sets the scale and squashes
  the bars into the lower third.
- **Kronor sliders use a squared curve.** On a linear track, 10 000 kr out of a
  1 000 000 kr range sits 1 % along, with no resolution where people live.
- **Number fields are `type="text"`.** A number input silently blanks any value
  carrying a thousand separator, which is what "10 776" is.
- **The chart viewBox scales with container width** so that margins and font
  sizes stay at their intended CSS pixel size on a phone. Without it the axis
  labels render at about 4 px.
- **Presets set the situation only.** Inflation, drift, fee and tax stay where
  they are, so a preset cannot be used to make the outcome look better.

## Not modelled

No skew or fat tails, no autocorrelation or valuation dependence, no withdrawals
or pauses, no currency risk, no changes to tax law, and one tax mode only. The
page says all of this out loud in its own text, which is the point of it.

Scope note: this is a compound interest calculator, not a pension planner. Keep
account types, withdrawal taxation and salary-exchange mechanics out of it.
