"use strict";

// Swedish mortgage mechanics, shared by the finance calculators.
//
// Plain script, no dependencies, same reason as engine.js: the pages have to work
// opened from disk. Pure arithmetic, no DOM.
//
// Statutory numbers here carry the date they apply from. They change, so every one
// of them is a parameter with a default rather than a constant welded into a
// formula. Sources are linked in the pages that use them.

// Ranteavdrag, Skatteverket: the tax reduction is 30 % of interest paid, dropping
// to 21 % on the part above 100 000 kr in a year. The cap is per person, so a
// household of two has twice the room. Returned as the reduction in kronor, not as
// a rate, because the rate is not constant: it is the whole point of the cap.
const DEDUCT_CAP = 100000;
const DEDUCT_HIGH = 0.3;
const DEDUCT_LOW = 0.21;

function interestDeduction(interest, cap) {
  const room = cap === undefined ? DEDUCT_CAP : cap;
  const under = Math.min(interest, room);
  return under * DEDUCT_HIGH + Math.max(0, interest - room) * DEDUCT_LOW;
}

// The marginal value of one more krona of interest, which is what decides whether
// amortising beats investing. Below the cap a krona of interest costs 70 ore net,
// above it 79 ore.
function marginalDeductionRate(interest, cap) {
  return (cap === undefined ? DEDUCT_CAP : cap) > interest ? DEDUCT_HIGH : DEDUCT_LOW;
}

// The guaranteed return on amortising: the mortgage rate after the deduction.
// This is the number the expected return on investing has to beat.
function afterTaxRate(rate, interest, cap) {
  return rate * (1 - marginalDeductionRate(interest, cap));
}

// Amorteringskravet, Finansinspektionen. Since 1 June 2016 a mortgage above 70 %
// of the property value amortises 2 % of the original loan per year, and above
// 50 % it is 1 %. Since 1 March 2018 a loan above 4,5 times gross yearly household
// income amortises one percentage point more.
//
// Simplification worth knowing about: the real rule sets the percentage against the
// loan at the most recent valuation and only lets it fall when the property is
// revalued. Here the bracket is read off the current balance against a fixed
// property value, which is the behaviour a borrower plans around, and it means the
// requirement steps down as the loan shrinks.
function requiredAmortisationRate(balance, propertyValue, income) {
  if (!(propertyValue > 0) || balance <= 0) return 0;
  const ltv = balance / propertyValue;
  let rate = ltv > 0.7 ? 0.02 : ltv > 0.5 ? 0.01 : 0;
  if (income > 0 && balance > 4.5 * income) rate += 0.01;
  return rate;
}

// Runs both strategies against the SAME monthly budget, month by month, and hands
// the fund contributions to the shared engine so the compounding, the fee and the
// ISK treatment are identical to every other calculator here.
//
// The budget is what the household spends on housing capital each month: interest,
// required amortisation, and the extra krona whose destination is the question. A
// branch that pays less interest therefore has more left over, and that surplus
// goes into the fund the same month rather than vanishing. Getting this wrong is
// what makes most published comparisons favour amortising: they let the winner
// bank the freed cash flow and the loser not.
//
// The yearly tax reduction is credited into the fund in both branches, because it
// arrives as cash either way.
//
// Returns the two paths plus net worth per completed year, in nominal kronor.
function comparePayoffVsInvest(m) {
  const N = m.years * 12;
  const rM = m.rate / 12;

  const branch = (extraToLoan) => {
    const debtByYear = new Float64Array(m.years + 1);
    const flows = new Float64Array(N);
    let debt = m.loan;
    let interestThisYear = 0;
    let paidInterest = 0;
    debtByYear[0] = debt;

    for (let i = 0; i < N; i++) {
      const interest = debt * rM;
      const reqRate = requiredAmortisationRate(debt, m.propertyValue, m.income);
      const required = Math.min(debt, (m.loan * reqRate) / 12);

      let toLoan = required;
      if (extraToLoan) toLoan = Math.min(debt, required + m.extra);

      // Whatever the budget does not spend on the loan is invested.
      let toFund = m.budget - interest - toLoan;
      if (toFund < 0) toFund = 0; // an underfunded budget cannot invest

      debt -= toLoan;
      if (debt < 0.005) debt = 0;
      interestThisYear += interest;
      paidInterest += interest;

      if (i % 12 === 11) {
        toFund += interestDeduction(interestThisYear, m.deductCap);
        interestThisYear = 0;
        debtByYear[(i + 1) / 12] = debt;
      }
      flows[i] = toFund;
    }
    return { debtByYear: debtByYear, flows: flows, paidInterest: paidInterest };
  };

  const run = (b) => {
    const p = Object.assign({}, m.fund, { years: m.years, start: 0, monthly: 0, growth: 0 });
    const bal = new Float64Array(m.years + 1);
    const contrib = new Float64Array(m.years + 1);
    const cost = simulateFlows(p, (i) => b.flows[i], null, bal, contrib);
    const net = new Float64Array(m.years + 1);
    for (let y = 0; y <= m.years; y++) net[y] = bal[y] - b.debtByYear[y];
    return { fund: bal, debt: b.debtByYear, net: net, invested: contrib, interest: b.paidInterest, fees: cost.fees, tax: cost.tax };
  };

  return { invest: run(branch(false)), amortise: run(branch(true)) };
}

// The expected return at which the two strategies end up level. Below it, paying
// down the loan wins; above it, the fund does. Bisection, because net worth at the
// horizon is monotone in the assumed return.
//
// This is the app's headline: one number that answers the question for a given
// mortgage rate, instead of a chart the reader has to interpret.
function breakEvenReturn(m) {
  const at = (ret) => {
    const trial = Object.assign({}, m, { fund: Object.assign({}, m.fund, { ret: ret, vol: 0 }) });
    const r = comparePayoffVsInvest(trial);
    return r.invest.net[m.years] - r.amortise.net[m.years];
  };
  let lo = 0;
  let hi = 0.25;
  if (at(lo) > 0) return 0; // amortising never wins, even at zero return
  if (at(hi) < 0) return NaN; // and never loses inside a believable range
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
