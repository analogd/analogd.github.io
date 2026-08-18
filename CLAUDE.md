# analogd.github.io

Static site, GitHub Pages, no build step. Every app is a directory with its own
`index.html`. The root `index.html` is a sectioned gallery and is the only index:
a shipped app that is not linked there does not exist.

## Layout

```
index.html              sectioned gallery, one card per app
CLAUDE.md               this file, the bar every app has to clear
BoxSmith/               audio, has its own CLAUDE.md
Audyssey*/              audio
AcousticCalculationTools/
finance/                personal finance, has its own CLAUDE.md
  RantaPaRanta/
```

New app: create the directory, add a card to the right section in the root
`index.html` in the same commit, and add a `README.md` explaining the model.

## The bar

This is the whole point of the site, so it is not negotiable per app. An app that
cannot clear it is not ready to link from the index.

1. **Verified against a published external reference, to the last digit.** Not
   "looks about right". Find a calculator or table someone else publishes, match
   it exactly with every adjustment switched off, and make that match a test.
   RantaPaRanta matches Lysa's published example to the krona (1 059 509 kr); the
   test fails if the compounding convention ever drifts. Without an external
   anchor a calculator is just an opinion with a chart.

2. **Every assumption is a control, not a constant.** If a number changes the
   answer, the user gets a slider and a hint saying where the number comes from.
   Hidden defaults are how the calculators we are competing with lie: they are
   not wrong about the arithmetic, they are silent about the assumptions.

3. **The thing the naive model omits is the product.** State it in the lede, show
   it as a separate figure next to the naive one, and explain the mechanism in
   prose further down. Not a disclaimer at the bottom: the honest number is the
   headline.

4. **A "what this does not do" section, written honestly.** List the omissions
   that a knowledgeable reader would otherwise catch you on, and do not soften
   them. Modelling artifacts that look like bugs get explained where the user
   meets them, not hidden.

5. **A headless test suite under `test/`, runnable as `node test/<name>.mjs`.**
   No dependencies, no browser, no test framework. The page script stays a plain
   script so it works opened from `file://`, so the runner evaluates it in a `vm`
   with a stub DOM and pulls out the functions it needs. Pattern:
   `finance/RantaPaRanta/test/scenarios.mjs`, `BoxSmith/lib/test/diagnose.mjs`.

6. **Test the hand calculation, not the current output.** Every assertion states
   a value derived independently (closed form, a published figure, a worked
   example) with a tolerance. Never snapshot what the code happens to return: a
   test that only says "unchanged" cannot tell correct from consistently wrong.

7. **Formatter round-trips are tested.** Anything written to a field by a
   formatter and read back by a parser gets round-tripped over its whole range,
   negatives included. `sv-SE` writes negatives with U+2212 MINUS SIGN, and one
   character class that only allowed ASCII hyphen silently turned a shrinking
   contribution into a growing one for two commits.

8. **One quantity, one number.** If two places on the page answer the same
   question, they compute it the same way and are asserted equal in the tests.
   Two nearly-identical figures is the reader's cue that neither is trustworthy.

9. **Zero dependencies, zero build, no network, nothing stored.** It has to work
   from a local file with the wifi off. No CDN, no analytics, no localStorage
   unless the user asked for saving.

10. **Comments carry the why.** Not what the line does. Every non-obvious choice
    (a convention, a deliberate artifact, a bug that cost real time) gets a
    comment explaining the reasoning, so the next pass does not undo it.

11. **Mobile is a real target.** SVG geometry and font sizes scale with the
    container, and anything that relies on hover has a touch path.

12. **Language follows the subject, not the repo.** ISK, statslåneränta and
    Skatteverket are Swedish concepts, so those apps are written in Swedish.
    Audio apps are written in English, because the literature and the audience
    are. The root gallery is English. Never mix inside one page.

## Writing

The prose is half the product, so it gets the same discipline as the arithmetic.
Apply this while writing, not as a later edit pass.

**Zinsser's four principles, in this order:**

1. **Simplicity.** Cut every word that carries no information. Adjectives that
   only add emphasis, adverbs that repeat the verb, and phrases like "det är
   värt att notera" all go.
2. **Brevity.** One mechanism, one paragraph. If a section needs five paragraphs
   to justify itself, the section is the problem, not its length.
3. **Clarity.** The reader must not have to hold two ideas open to finish a
   sentence. Define a term the first time it appears, then reuse that term.
4. **Humanity.** Write to a person. Concrete examples beat abstractions, the
   reader is allowed to be smart, and a dry joke is allowed to stay.

The test per sentence: **would a reader do something differently without it?**
Change a number, distrust a figure, look somewhere else, stop worrying about
something. If not, cut it. Explaining a mechanism the user needs earns space;
proving that the work was done does not.

Borrowed from Simplified Technical English, which is otherwise too rigid for a
page aimed at end users: one idea per sentence, active voice, and the same word
for the same thing every time. Synonym variation reads as style and lands as a
second concept. In Swedish that mostly means short main clauses and no chains of
"vilket".

## Conventions

- Presets set the _situation_ only (age, amounts, horizon). They never touch the
  honesty knobs, because "pick a preset" must not quietly re-optimise the
  assumptions in the user's favour.
- The chart legend is the series control, and the axis rescales to what is
  visible.
- Prettier config lives in `package.json`. `npx prettier --write` before
  committing.
- Files are ASCII plus Swedish letters. No typographic dashes or quotes in
  source; when a character class or string needs one, write it as a `\uXXXX`
  escape.
