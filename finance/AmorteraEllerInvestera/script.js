"use strict";

// Amortera eller investera.
// UI and chart. The compounding lives in ../lib/engine.js, the mortgage mechanics
// in ../lib/mortgage.js, and the formatters and URL contract in ../lib/ui.js, all
// loaded before this file.

const CONTROLS = [
  { id: "loan", group: "basic", label: "Lån i dag", unit: "kr", min: 0, max: 8000000, step: 10000, value: 2500000 },
  {
    id: "value",
    group: "basic",
    label: "Bostadens värde",
    unit: "kr",
    min: 100000,
    max: 15000000,
    step: 50000,
    value: 3500000,
    hint: "Styr belåningsgraden, och därmed hur mycket du måste amortera."
  },
  {
    id: "rate",
    group: "basic",
    label: "Bolåneränta",
    unit: "%",
    min: 0,
    max: 10,
    step: 0.05,
    value: 4,
    hint: "Din faktiska snittränta efter rabatt, inte listräntan."
  },
  {
    id: "extra",
    group: "basic",
    label: "Extra per månad",
    unit: "kr",
    min: 0,
    max: 30000,
    step: 250,
    value: 3000,
    hint: "Kronorna vars destination är hela frågan: extra amortering eller fondsparande."
  },
  { id: "years", group: "basic", label: "Horisont", unit: "år", min: 1, max: MAXY, step: 1, value: 20 },
  {
    id: "ret",
    group: "basic",
    label: "Förväntad avkastning",
    unit: "%",
    min: 0,
    max: 12,
    step: 0.1,
    value: 7,
    hint: "Nominellt, brutto före avgift och skatt."
  },
  {
    id: "income",
    group: "adv",
    label: "Hushållets bruttoinkomst per år",
    unit: "kr",
    min: 0,
    max: 3000000,
    step: 10000,
    value: 700000,
    hint: "Bara för skuldkvotstaket: över 4,5 gånger inkomsten tillkommer 1 procentenhet amortering."
  },
  {
    id: "deductCap",
    group: "adv",
    label: "Ränteavdragets tak",
    unit: "kr",
    min: 0,
    max: 400000,
    step: 10000,
    value: 100000,
    hint: "100 000 kr per person och år. Under taket är avdraget 30 %, över det 21 %. Två låntagare har dubbla taket."
  },
  {
    id: "inflation",
    group: "adv",
    label: "Inflation (KPI)",
    unit: "%",
    min: 0,
    max: 8,
    step: 0.1,
    value: 2,
    hint: "Riksbankens mål är 2 %."
  },
  {
    id: "drift",
    group: "adv",
    label: "Standardglidning",
    unit: "%",
    min: 0,
    max: 3,
    step: 0.1,
    value: 1,
    hint: "Det KPI inte fångar: att normal standard flyttar sig uppåt."
  },
  {
    id: "fee",
    group: "adv",
    label: "Avgift per år",
    unit: "%",
    min: 0,
    max: 2,
    step: 0.05,
    value: 0.4,
    hint: "Fondavgift plus eventuell plattforms- eller förvaltningsavgift. Tas på kapitalet."
  },
  {
    id: "slr",
    group: "adv",
    label: "Statslåneränta",
    unit: "%",
    min: 0,
    max: 8,
    step: 0.05,
    value: 2.55,
    hint: "Den 30 november året före. 2,55 % gällde 30 nov 2025, alltså schablon 3,55 % för 2026."
  },
  {
    id: "iskFree",
    group: "adv",
    label: "ISK-fribelopp",
    unit: "kr",
    min: 0,
    max: 600000,
    step: 10000,
    value: 300000,
    hint: "300 000 kr från 1 jan 2026, för ISK, kapitalförsäkring och PEPP sammanlagt."
  }
];

// Situations, not opinions. Each one puts the borrower somewhere else on the
// belaningsgrad ladder, because that is what decides how much of the choice is
// even yours to make.
const PRESETS = [
  { name: "Nytt lån, 85 %", v: { loan: 2975000, value: 3500000, rate: 4, extra: 3000, years: 20, income: 700000 } },
  { name: "Halvvägs, 60 %", v: { loan: 2100000, value: 3500000, rate: 4, extra: 3000, years: 20, income: 700000 } },
  { name: "Under 50 %, inget krav", v: { loan: 1500000, value: 3500000, rate: 4, extra: 3000, years: 20, income: 700000 } },
  { name: "Hög skuldkvot", v: { loan: 3400000, value: 4000000, rate: 4, extra: 3000, years: 20, income: 600000 } },
  { name: "Dyr ränta, 6 %", v: { loan: 2500000, value: 3500000, rate: 6, extra: 3000, years: 20, income: 700000 } }
];

const el = {};
let basis = "life";
// Two branches, so two of everything. One debt line would belong to one branch
// and silently be read as belonging to both: the invest branch only pays the
// required amortisation, the amortise branch pays the extra on top, so their
// debt paths genuinely differ. Each debt is drawn in its own branch colour.
const SHOW = { invest: true, amortise: true, debtInvest: true, debtAmortise: true };

// ---------- state ----------

const BASIS_NOTE = {
  nom: "nominellt värde",
  cpi: "i dagens kronor, KPI-justerat",
  life: "i dagens levnadsstandard, KPI och standardglidning"
};

function readParams() {
  const v = {};
  CONTROLS.forEach((c) => {
    v[c.id] = parseField(el[c.id].num.value);
    if (!isFinite(v[c.id])) v[c.id] = c.value;
  });
  const years = Math.max(1, Math.round(v.years));
  const fund = {
    ret: v.ret / 100,
    fee: v.fee / 100,
    slr: v.slr / 100,
    iskFree: v.iskFree,
    vol: 0,
    isk: el.isk.checked,
    inflation: v.inflation / 100,
    drift: v.drift / 100,
    basis: basis
  };
  // The budget both branches spend: today's interest, today's required
  // amortisation, and the extra. Fixed in nominal kronor, which is a
  // simplification stated in the notes.
  const reqRate = requiredAmortisationRate(v.loan, v.value, v.income);
  const budget = (v.loan * v.rate) / 100 / 12 + (v.loan * reqRate) / 12 + v.extra;
  return {
    loan: v.loan,
    propertyValue: v.value,
    rate: v.rate / 100,
    income: v.income,
    extra: v.extra,
    deductCap: v.deductCap,
    years: years,
    budget: budget,
    reqRate: reqRate,
    fund: fund,
    basis: basis
  };
}

// ---------- render ----------

let view = null;

function render() {
  const m = readParams();
  const Y = m.years;
  const r = comparePayoffVsInvest(m);
  const d = deflator(m.fund, Y);

  const investNet = r.invest.net[Y] / d;
  const amortiseNet = r.amortise.net[Y] / d;
  const diff = investNet - amortiseNet;
  const be = breakEvenReturn(m);

  const winner = diff >= 0 ? "Fondsparande" : "Amortering";
  el.resultLabel.textContent = "Nettoförmögenhet efter " + Y + " år, samma månadsbudget i båda fallen";
  el.resultTotal.textContent = winner + " leder med " + kr(Math.abs(diff));
  el.resultSplit.innerHTML =
    "Investera ger <b>" + kr(investNet) + "</b>, amortera ger <b>" + kr(amortiseNet) + "</b> &middot; " + BASIS_NOTE[basis];

  // The one number the whole app exists to produce.
  const marginal = marginalDeductionRate(r.invest.interest / Y, m.deductCap);
  const stats = [
    [
      "Brytpunkt",
      isFinite(be) ? NF1.format(be * 100) + " %" : "saknas",
      isFinite(be)
        ? "över den förväntade avkastningen vinner fonden, under den vinner amortering"
        : "amortering vinner inte ens vid 25 % avkastning",
      false
    ],
    [
      "Räntan efter avdrag",
      NF2.format(afterTaxRate(m.rate, r.invest.interest / Y, m.deductCap) * 100) + " %",
      "garanterad avkastning på amortering. Marginellt avdrag " + NF.format(marginal * 100) + " %",
      false
    ],
    ["Månadsbudget", kr(m.budget), "ränta plus krävd amortering plus extra, lika i båda grenarna", false],
    [
      "Amorteringskrav nu",
      NF1.format(m.reqRate * 100) + " % per år",
      "belåningsgrad " + NF1.format((m.loan / m.propertyValue) * 100) + " %, skuldkvot " + NF1.format(m.loan / Math.max(1, m.income)),
      false
    ],
    ["Räntekostnad, investera", kr(r.invest.interest), "nominellt före avdrag över hela horisonten", false],
    ["Räntekostnad, amortera", kr(r.amortise.interest), "nominellt före avdrag. Skillnaden är vad snabbare amortering köper", false],
    ["Skuldfri", debtFreeLabel(r.amortise.debt, Y), "med extra amortering", false],
    ["Avgift och skatt i fonden", kr(r.invest.fees + r.invest.tax), "investeringsgrenen, nominellt", false]
  ];

  el.stats.innerHTML = stats
    .map(
      (s) =>
        '<div class="stat"><div class="stat-k">' +
        s[0] +
        '</div><div class="stat-v' +
        (s[3] ? " neg" : "") +
        '">' +
        s[1] +
        '</div><div class="stat-n">' +
        s[2] +
        "</div></div>"
    )
    .join("");

  view = { m: m, r: r };
  drawChart(view);
  updateHints(m);
  writeUrlState();
}

function debtFreeLabel(debt, Y) {
  for (let y = 0; y <= Y; y++) if (debt[y] <= 0.5) return "efter " + y + " år";
  return "inte inom " + Y + " år";
}

function updateHints(m) {
  el.loan.hint.textContent = "Belåningsgrad " + NF1.format((m.loan / m.propertyValue) * 100) + " %.";
  el.years.hint.textContent = "";
  el.iskFree.hint.textContent = el.isk.checked ? el.iskFree.spec.hint : "ISK-skatten är avstängd.";

  // The handover: the same extra krona, priced by the calculator that owns
  // compounding. Built with the shared contract, never a hand-rolled link.
  // The receiving app owns its own control list, so the handover names the
  // parameters directly rather than filtering against this app's defaults.
  const q = new URLSearchParams();
  q.set("monthly", String(Math.round(m.extra)));
  q.set("years", String(m.years));
  q.set("start", "0");
  q.set("growth", "0");
  q.set("ret", String(Math.round(m.fund.ret * 1000) / 10));
  q.set("fee", String(Math.round(m.fund.fee * 10000) / 100));
  if (basis !== "life") q.set("basis", basis);
  el.handover.href = "../RantaPaRanta/?" + q.toString();
  el.handover.textContent = "Se vad " + kr(m.extra) + "/mån blir i Ränta på ränta";

  el.advSummary.textContent =
    "inflation " +
    NF1.format(m.fund.inflation * 100) +
    " %, standardglidning " +
    NF1.format(m.fund.drift * 100) +
    " %, avgift " +
    NF2.format(m.fund.fee * 100) +
    " %, ISK-skatt " +
    (el.isk.checked ? "på" : "av");
}

// ---------- chart ----------

const W = 1000;
let G = { l: 62, r: 12, t: 16, b: 34, H: 380, s: 1, font: 12 };

function geometry() {
  const w = el.chart.clientWidth || W;
  const s = Math.max(1, Math.min(3.2, W / w));
  return { l: 62 * s, r: 12 * s, t: 16 * s, b: 34 * s, H: Math.round(380 * Math.min(2.05, s)), s: s, font: 12 * s };
}

function drawChart(v) {
  const m = v.m;
  const Y = m.years;
  G = geometry();
  const H = G.H;
  const pw = W - G.l - G.r;
  const ph = H - G.t - G.b;

  const series = [];
  if (SHOW.invest) series.push({ key: "invest", color: "var(--ret)", data: pathOf(v.r.invest.net, m) });
  if (SHOW.amortise) series.push({ key: "amortise", color: "var(--start)", data: pathOf(v.r.amortise.net, m) });
  if (SHOW.debtInvest) series.push({ key: "debtInvest", color: "var(--ret)", dash: true, data: pathOf(v.r.invest.debt, m, -1) });
  if (SHOW.debtAmortise) series.push({ key: "debtAmortise", color: "var(--start)", dash: true, data: pathOf(v.r.amortise.debt, m, -1) });

  let hi = 0;
  let lo = 0;
  series.forEach((s) => {
    for (let y = 0; y <= Y; y++) {
      hi = Math.max(hi, s.data[y]);
      lo = Math.min(lo, s.data[y]);
    }
  });

  const TICKS = 4;
  let step = niceStep(Math.max(1, (hi - lo) * 1.04) / TICKS);
  while (step * TICKS < hi - lo) step = niceStep(step * 1.05);
  const top = Math.ceil(hi / step) * step || step;
  const bottom = Math.floor(lo / step) * step;

  const x = (y) => G.l + (pw * y) / Y;
  const yy = (val) => G.t + ph - (ph * (val - bottom)) / (top - bottom || 1);

  let s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img">';
  for (let gv = bottom; gv <= top + 1e-6; gv += step) {
    const gy = yy(gv);
    s +=
      '<line x1="' +
      G.l +
      '" y1="' +
      gy +
      '" x2="' +
      (W - G.r) +
      '" y2="' +
      gy +
      '" stroke="' +
      (Math.abs(gv) < 1e-6 ? "#3a3f52" : "#242734") +
      '" stroke-width="' +
      G.s +
      '"/><text x="' +
      (G.l - 10 * G.s) +
      '" y="' +
      (gy + 4 * G.s) +
      '" fill="#5c6070" font-size="' +
      G.font +
      '" text-anchor="end">' +
      krShort(gv) +
      "</text>";
  }

  series.forEach((ser) => {
    let d = "";
    for (let y = 0; y <= Y; y++) d += (y ? " L" : "M") + x(y).toFixed(1) + " " + yy(ser.data[y]).toFixed(1);
    s +=
      '<path d="' +
      d +
      '" fill="none" stroke="' +
      ser.color +
      '" stroke-width="' +
      (ser.dash ? 1.6 : 2.2) * G.s +
      '"' +
      (ser.dash ? ' stroke-dasharray="' + 5 * G.s + " " + 4 * G.s + '"' : "") +
      "/>";
  });

  const stepY = Math.max(1, Math.ceil(Y / 10));
  for (let y = 0; y <= Y; y += stepY) {
    s +=
      '<text x="' + x(y) + '" y="' + (H - 14 * G.s) + '" fill="#5c6070" font-size="' + G.font + '" text-anchor="middle">' + y + "</text>";
  }
  s += '<text x="' + G.l + '" y="' + (H - 2 * G.s) + '" fill="#484d5e" font-size="' + 11 * G.s + '">år</text>';
  s += "</svg>";
  el.chart.innerHTML = s;
  wireTooltip(v, series);
}

// Deflated into the chosen basis, each year by its own factor. sign = -1 draws a
// liability below the axis, which is what a debt is.
function pathOf(arr, m, sign) {
  const out = new Float64Array(m.years + 1);
  for (let y = 0; y <= m.years; y++) out[y] = ((sign || 1) * arr[y]) / deflator(m.fund, y);
  return out;
}

function wireTooltip(v, series) {
  const svg = el.chart.firstChild;
  const Y = v.m.years;
  const show = (clientX, clientY) => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let y = Math.round(((px - G.l) / (W - G.l - G.r)) * Y);
    y = Math.max(0, Math.min(Y, y));
    let html = "<b>År " + y + "</b><br>";
    const names = {
      invest: "Investera, netto",
      amortise: "Amortera, netto",
      debtInvest: "Skuld, investera",
      debtAmortise: "Skuld, amortera"
    };
    series.forEach((s) => {
      html += '<span class="k">' + names[s.key] + "</span> " + kr(Math.abs(s.data[y])) + "<br>";
    });
    el.tip.innerHTML = html;
    el.tip.classList.add("on");
    const wrapR = el.chart.parentElement.getBoundingClientRect();
    const tipW = el.tip.offsetWidth || 210;
    let left = clientX - wrapR.left + 14;
    if (left + tipW > wrapR.width) left = Math.max(4, clientX - wrapR.left - tipW - 14);
    el.tip.style.left = left + "px";
    el.tip.style.top = Math.max(0, clientY - wrapR.top - 10) + "px";
  };
  svg.addEventListener("mousemove", (e) => show(e.clientX, e.clientY));
  svg.addEventListener("mouseleave", () => el.tip.classList.remove("on"));
  const touch = (e) => {
    if (e.touches && e.touches.length === 1) show(e.touches[0].clientX, e.touches[0].clientY);
  };
  svg.addEventListener("touchstart", touch, { passive: true });
  svg.addEventListener("touchmove", touch, { passive: true });
  svg.addEventListener("touchend", () => el.tip.classList.remove("on"), { passive: true });
}

// ---------- build UI ----------

function buildControls() {
  CONTROLS.forEach((c) => {
    const wrap = document.createElement("div");
    wrap.className = "ctl";
    wrap.innerHTML =
      '<div class="ctl-head"><label class="ctl-label" for="n-' +
      c.id +
      '">' +
      c.label +
      "</label>" +
      '<span class="ctl-value"><input type="text" inputmode="decimal" id="n-' +
      c.id +
      '" value="' +
      fieldText(c, c.value) +
      '" /><span class="ctl-unit">' +
      c.unit +
      "</span></span></div>" +
      '<div class="ctl-hint">' +
      (c.hint || "") +
      "</div>" +
      '<input type="range" id="r-' +
      c.id +
      '" aria-label="' +
      c.label +
      ', reglage" min="0" max="' +
      SLIDER_STEPS +
      '" step="1" value="' +
      valueToSlider(c, c.value) +
      '" />';
    document.getElementById(c.group).appendChild(wrap);

    const num = wrap.querySelector("#n-" + c.id);
    const rng = wrap.querySelector("#r-" + c.id);
    el[c.id] = { num: num, rng: rng, hint: wrap.querySelector(".ctl-hint"), spec: c };

    rng.addEventListener("input", () => {
      num.value = fieldText(c, sliderToValue(c, +rng.value));
      schedule();
    });
    num.addEventListener("input", () => {
      const v = parseField(num.value);
      if (isFinite(v)) rng.value = valueToSlider(c, v);
      schedule();
    });
    num.addEventListener("blur", () => {
      const v = parseField(num.value);
      num.value = fieldText(c, isFinite(v) ? Math.min(c.max, Math.max(c.min, v)) : c.value);
      schedule();
    });
  });
}

function setControl(id, value) {
  const c = el[id].spec;
  const v = Math.min(c.max, Math.max(c.min, value));
  el[id].num.value = fieldText(c, v);
  el[id].rng.value = valueToSlider(c, v);
}

function buildPresets() {
  const host = document.getElementById("presets");
  PRESETS.forEach((preset) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = preset.name;
    b.addEventListener("click", () => {
      Object.keys(preset.v).forEach((id) => setControl(id, preset.v[id]));
      host.querySelectorAll("button").forEach((o) => o.classList.remove("active"));
      b.classList.add("active");
      render();
    });
    host.appendChild(b);
  });
}

function setBasis(b) {
  basis = b;
  document.querySelectorAll("#basis button").forEach((o) => o.classList.toggle("active", o.dataset.basis === b));
}

function setSeries(key, on) {
  SHOW[key] = on;
  const b = document.querySelector('#legend button[data-series="' + key + '"]');
  if (!b) return;
  b.classList.toggle("off", !on);
  b.setAttribute("aria-pressed", String(on));
}

function applyUrlState() {
  const s = parseUrlValues(CONTROLS, location.search);
  Object.keys(s.values).forEach((id) => {
    if (el[id]) setControl(id, s.values[id]);
  });
  if (s.flags.isk !== undefined) el.isk.checked = s.flags.isk;
  if (s.basis) setBasis(s.basis);
}

let urlTimer = null;
function writeUrlState() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const values = {};
    CONTROLS.forEach((c) => {
      values[c.id] = parseField(el[c.id].num.value);
    });
    const q = buildUrlQuery(CONTROLS, values, { isk: el.isk.checked }, basis, false);
    try {
      history.replaceState(null, "", q ? "?" + q : location.pathname);
    } catch (e) {
      /* file:// or a throttled history, nothing the user needs to hear about */
    }
  }, 400);
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    render();
  });
}

function init() {
  buildControls();
  buildPresets();

  el.isk = document.getElementById("isk");
  el.stats = document.getElementById("stats");
  el.chart = document.getElementById("chart");
  el.tip = document.getElementById("tip");
  el.resultLabel = document.getElementById("result-label");
  el.resultTotal = document.getElementById("result-total");
  el.resultSplit = document.getElementById("result-split");
  el.advSummary = document.getElementById("adv-summary");
  el.handover = document.getElementById("handover");

  el.isk.addEventListener("change", schedule);

  document.querySelectorAll("#legend button").forEach((b) => {
    const key = b.dataset.series;
    setSeries(key, SHOW[key]);
    b.addEventListener("click", () => {
      setSeries(key, !SHOW[key]);
      render();
    });
  });

  document.querySelectorAll("#basis button").forEach((b) => {
    b.addEventListener("click", () => {
      setBasis(b.dataset.basis);
      render();
    });
  });

  window.addEventListener("resize", () => {
    if (view) drawChart(view);
  });

  applyUrlState();
  render();
}

document.addEventListener("DOMContentLoaded", init);
