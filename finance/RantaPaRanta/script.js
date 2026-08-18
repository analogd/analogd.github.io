"use strict";

// Ranta pa ranta, osockrat.
// UI, chart and URL state. The arithmetic lives in ../lib/engine.js, which this
// page loads first. Everything runs client side, nothing is stored, no
// dependencies.

// Years of ramp behind the back-solve helper. It mirrors the horizon exactly, and
// is anchored to the LAST saving year rather than to the horizon end: the
// contributions run through year Y-1, so (1+g)^(Y-1) is the final monthly amount.
// That makes this field and the "Manadssparande sista aret" stat the same number
// instead of two slightly different answers to the same question. A one-year
// horizon has no ramp to solve for.
function solveRamp(years) {
  const y = isFinite(years) ? Math.round(years) : 1;
  return Math.max(0, Math.min(MAXY, y) - 1);
}

const CONTROLS = [
  { id: "start", group: "basic", label: "Startbelopp", unit: "kr", min: 0, max: 1000000, step: 1000, value: 10000 },
  { id: "monthly", group: "basic", label: "Månadssparande nu", unit: "kr", min: 0, max: 40000, step: 100, value: 1000 },
  { id: "age", group: "basic", label: "Ålder nu", unit: "år", min: 0, max: 75, step: 1, value: 22 },
  { id: "years", group: "basic", label: "Sparhorisont", unit: "år", min: 1, max: MAXY, step: 1, value: 45 },
  {
    id: "ret",
    group: "basic",
    label: "Avkastning per år",
    unit: "%",
    min: 0,
    max: 12,
    step: 0.1,
    value: 7,
    hint: "Nominellt, brutto före avgifter. 7 % är branschens standardantagande för 100 % aktier."
  },
  {
    id: "growth",
    group: "adv",
    label: "Sparandet ändras per år",
    unit: "%",
    min: -15,
    max: 15,
    step: 0.1,
    value: 3,
    // Text, not number: a number field silently blanks a value carrying
    // thousand separators.
    hintHtml: 'vid horisontens slut: <input id="solve" type="text" inputmode="decimal" /> kr/mån'
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
    hint: "Fondavgift plus eventuell plattforms- eller förvaltningsavgift, sammanlagt. Tas på kapitalet, inte på avkastningen."
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
    hint: "Den 30 november året före, inte dagens. 2,55 % gällde 30 nov 2025, alltså schablon 3,55 % för 2026."
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
    hint: "Avdrag på kapitalunderlaget. 300 000 kr från 1 jan 2026, för ISK, kapitalförsäkring och PEPP sammanlagt."
  },
  {
    id: "vol",
    group: "adv",
    label: "Volatilitet per år",
    unit: "%",
    min: 0,
    max: 30,
    step: 1,
    value: 16,
    hint: "Standardavvikelse. En global aktieindexfond ligger historiskt runt 16 %."
  }
];

// Starting points, all ending at 67. They set the situation only: the honesty
// knobs (inflation, standardglidning, avgift, skatt) are deliberately untouched.
const PRESETS = [
  { name: "22 år, första jobbet", v: { start: 10000, monthly: 1000, age: 22, years: 45, growth: 3 } },
  { name: "30 år, etablerad", v: { start: 150000, monthly: 4000, age: 30, years: 37, growth: 2.5 } },
  { name: "45 år, sent i gång", v: { start: 300000, monthly: 8000, age: 45, years: 22, growth: 1.5 } },
  { name: "50 år, sparar hårt nu", v: { start: 500000, monthly: 21000, age: 50, years: 17, growth: -3 } },
  { name: "Barnspar till 18", v: { start: 0, monthly: 1000, age: 0, years: 18, growth: 0 } }
];

// The same engine read backwards: what a habit costs, priced as the saving it
// replaces. A phone is not a 15 000 kr purchase, it is 417 kr a month for as long
// as you keep buying phones, and that is the number worth seeing. Growth is set
// to the inflation default, so the habit stays the same size in real terms
// instead of quietly shrinking.
//
// These state a price. They do not tell anyone what to buy.
const COST_PRESETS = [
  { name: "Telefon, 15 000 kr var 3:e år", v: { start: 0, monthly: 417, age: 30, years: 37, growth: 2 } },
  { name: "Lunch ute i stället för matlåda", v: { start: 0, monthly: 2000, age: 30, years: 37, growth: 2 } },
  { name: "En bilklass uppåt", v: { start: 0, monthly: 1500, age: 30, years: 37, growth: 2 } },
  { name: "Tre streamingtjänster", v: { start: 0, monthly: 500, age: 30, years: 37, growth: 2 } }
];

const el = {};
let basis = "life";

// The legend is the series control. The spread starts off, so the axis opens
// scaled to the bars rather than to p90.
const SHOW = { start: true, mon: true, ret: true, loss: true, band: false };

// ---------- state ----------

function readParams() {
  const v = {};
  CONTROLS.forEach((c) => {
    v[c.id] = parseField(el[c.id].num.value);
    if (!isFinite(v[c.id])) v[c.id] = c.value;
  });
  return {
    start: v.start,
    monthly: v.monthly,
    age: v.age,
    years: Math.max(1, Math.round(v.years)),
    ret: v.ret / 100,
    growth: v.growth / 100,
    inflation: v.inflation / 100,
    drift: v.drift / 100,
    fee: v.fee / 100,
    slr: v.slr / 100,
    iskFree: v.iskFree,
    vol: v.vol / 100,
    isk: el.isk.checked,
    basis: basis
  };
}

const BASIS_LABEL = {
  nom: "Nominellt värde",
  cpi: "I dagens kronor (KPI-justerat)",
  life: "I dagens levnadsstandard (KPI och standardglidning)"
};

// Written in sentence-middle case, so KPI keeps its capitals.
const BASIS_NOTE = {
  nom: "nominellt värde",
  cpi: "i dagens kronor, KPI-justerat",
  life: "i dagens levnadsstandard, KPI och standardglidning"
};

// ---------- render ----------

let view = null;

// The Monte Carlo pass costs ~100 ms, too slow to run on every slider frame.
// Keep the last band on screen while dragging and recompute once the slider settles.
let bandKey = null;
let bandVal = null;
let bandTimer = null;

function getBand(p) {
  if (!SHOW.band || p.vol <= 0) {
    bandKey = null;
    bandVal = null;
    return null;
  }
  const key = [p.start, p.monthly, p.years, p.ret, p.growth, p.fee, p.slr, p.iskFree, p.vol, p.isk].join("|");
  if (key !== bandKey) {
    clearTimeout(bandTimer);
    bandTimer = setTimeout(() => {
      bandVal = percentileBand(p);
      bandKey = key;
      render();
    }, 130);
  }
  // stale band is fine to draw for one frame, but never one that is too short
  return bandVal && bandVal.p10.length > p.years ? bandVal : null;
}

function render() {
  const p = readParams();
  const Y = p.years;

  const bal = new Float64Array(Y + 1);
  const contrib = new Float64Array(Y + 1);
  const cost = simulate(p, null, bal, contrib);

  // The reference every bank calculator shows: nominal, flat contribution, no fee, no tax.
  const naiveBal = new Float64Array(Y + 1);
  const naiveContrib = new Float64Array(Y + 1);
  const naiveP = Object.assign({}, p, { fee: 0, isk: false, growth: 0 });
  simulate(naiveP, null, naiveBal, naiveContrib);

  const band = getBand(p);

  const d = deflator(p, Y);
  const realPaid = realContributions(p);
  const total = bal[Y] / d;
  const paid = realPaid[Y];
  const gain = total - paid;

  el.resultLabel.textContent = "Totalt efter " + Y + " år, vid " + Math.round(p.age + Y) + " års ålder";
  el.resultTotal.textContent = kr(total);
  el.resultSplit.innerHTML = "Varav " + kr(paid) + " insatt och <b>" + kr(gain) + "</b> avkastning &middot; " + BASIS_NOTE[basis];

  const lastMonthly = p.monthly * Math.pow(1 + p.growth, Y - 1);
  const naiveGapPct = total > 0 ? (naiveBal[Y] / total - 1) * 100 : 0;

  // Nominal money-weighted return, then Fisher-deflated into the chosen basis.
  const nomRate = moneyWeightedReturn(p, bal[Y]);
  const realRate = (1 + nomRate) / basisFactor(p) - 1;

  // The gap is not always in the bank's favour: a contribution ramping up faster
  // than inflation eats it, so the direction has to be read off the sign rather
  // than assumed.
  const gapWord = naiveGapPct >= 0 ? " % högre" : " % lägre";

  const stats = [
    ["Insatt totalt", kr(paid), "i dagens köpkraft, varje insättning räknad från sitt eget datum", false],
    ["Avkastning", kr(gain), paid > 0 ? NF2.format(gain / paid) + " gånger det insatta" : "", gain < 0],
    band
      ? [
          "Utfallsspann",
          krShort(band.p10[Y] / d) + " till " + krShort(band.p90[Y] / d),
          "p10 till p90 av " + NF.format(NPATHS) + " simulerade utfall",
          false
        ]
      : ["Utfallsspann", "Avstängt", "klicka Spann p10 till p90 i diagramförklaringen", false],
    el.lysaOn.checked
      ? [
          "Bankmodellens siffra",
          kr(naiveBal[Y]),
          NF.format(Math.abs(Math.round(naiveGapPct))) + gapWord + ". Nominellt, fast månadsbelopp, utan avgift och skatt",
          false
        ]
      : null,
    ["Avgifter och skatt", kr(cost.fees + cost.tax), "nominellt: " + kr(cost.fees) + " avgift, " + kr(cost.tax) + " ISK-skatt", false],
    ["Månadsuttag", kr((total * 0.04) / 12), "tumregel: 4 % av kapitalet per år, i valt basmått", false],
    ["Månadssparande sista året", kr(lastMonthly), "nominellt, motsvarar " + kr(lastMonthly / d) + " i valt basmått", false],
    [
      "Faktisk årsavkastning",
      isFinite(realRate) ? NF2.format(realRate * 100) + " %" : "okänd",
      "penningvägd, efter avgift och skatt, i valt basmått. Bruttoantagandet är " + NF1.format(p.ret * 100) + " %",
      realRate < 0
    ]
  ];

  el.stats.innerHTML = stats
    .filter(Boolean)
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

  view = { p: p, bal: bal, contrib: contrib, realPaid: realPaid, band: band };
  drawChart(view);
  updateHints(p);
  writeUrlState();
}

function updateHints(p) {
  el.years.hint.textContent = "Fram till " + Math.round(p.age + p.years) + " års ålder.";
  el.age.hint.textContent = "";
  el.start.hint.textContent = "Kapital du redan har.";
  el.monthly.hint.textContent = "";
  el.iskFree.hint.textContent = el.isk.checked ? el.iskFree.spec.hint : "ISK-skatten är avstängd.";

  const ramp = solveRamp(p.years);
  const target = p.monthly * Math.pow(1 + p.growth, ramp);
  if (document.activeElement !== el.solve) el.solve.value = NF.format(Math.round(target));
  el.solveNote.textContent =
    p.age + p.years <= 100 ? "(sista sparåret, fram till " + Math.round(p.age + p.years) + " års ålder)" : "(sista sparåret)";

  el.advSummary.textContent =
    "inflation " +
    NF1.format(p.inflation * 100) +
    " %, standardglidning " +
    NF1.format(p.drift * 100) +
    " %, avgift " +
    NF2.format(p.fee * 100) +
    " %, sparandet ändras " +
    NF1.format(p.growth * 100) +
    " %/år, ISK-skatt " +
    (p.isk ? "på" : "av");
}

// ---------- chart ----------

const W = 1000;

// Geometry is recomputed on every draw. The svg scales to its container, so on a
// phone one user unit is a third of a CSS pixel: without scaling the margins and
// font sizes by the same factor, the axis labels render at 4 px. Scaling the
// viewBox height too keeps the chart from collapsing into a sliver.
let G = { l: 62, r: 12, t: 16, b: 34, H: 380, s: 1, font: 12 };

function geometry() {
  const w = el.chart.clientWidth || W;
  const s = Math.max(1, Math.min(3.2, W / w));
  return { l: 62 * s, r: 12 * s, t: 16 * s, b: 34 * s, H: Math.round(380 * Math.min(2.05, s)), s: s, font: 12 * s };
}

function drawChart(v) {
  const p = v.p;
  const Y = p.years;
  G = geometry();
  const M = G;
  const H = G.H;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;

  const val = [];
  const paid = [];
  const startPart = [];
  const monPart = [];
  const gainPart = [];
  const lo = [];
  const hi = [];
  for (let y = 0; y <= Y; y++) {
    const d = deflator(p, y);
    val.push(v.bal[y] / d);
    paid.push(v.realPaid[y]);
    startPart.push(p.start);
    monPart.push(v.realPaid[y] - p.start);
    gainPart.push(v.bal[y] / d - v.realPaid[y]);
    if (v.band) {
      lo.push(v.band.p10[y] / d);
      hi.push(v.band.p90[y] / d);
    }
  }

  // The stack, bottom up, of whatever is switched on. Only what is drawn sets
  // the scale, so hiding a series rescales the axis.
  const stack = (y) => {
    const segs = [];
    if (SHOW.start && startPart[y] > 0) segs.push([startPart[y], "var(--start)"]);
    if (SHOW.mon && monPart[y] > 0) segs.push([monPart[y], "var(--in)"]);
    if (SHOW.ret && gainPart[y] > 0) segs.push([gainPart[y], "var(--ret)"]);
    return segs;
  };
  const barTop = (y) => stack(y).reduce((a, s) => a + s[0], 0);

  let max = 0;
  for (let y = 0; y <= Y; y++) {
    max = Math.max(max, barTop(y), v.band ? hi[y] : 0);
  }
  // Pick a round step first, then derive the top, so the labels read
  // 1 mkr / 2 mkr / 3 mkr rather than 875 tkr / 1,8 mkr / 2,6 mkr.
  const TICKS = 4;
  let step = niceStep((max * 1.04) / TICKS);
  while (step * TICKS < max) step = niceStep(step * 1.05);
  max = step * TICKS;

  const x = (y) => M.l + (pw * y) / Y;
  const yy = (value) => M.t + ph - (ph * value) / (max || 1);
  const barW = Math.max(2, Math.min(26 * G.s, (pw / Y) * 0.68));

  let s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img">';

  // gridlines
  for (let i = 0; i <= TICKS; i++) {
    const gv = (max * i) / TICKS;
    const gy = yy(gv);
    s +=
      '<line x1="' +
      M.l +
      '" y1="' +
      gy +
      '" x2="' +
      (W - M.r) +
      '" y2="' +
      gy +
      '" stroke="#242734" stroke-width="' +
      G.s +
      '"/>' +
      '<text x="' +
      (M.l - 10 * G.s) +
      '" y="' +
      (gy + 4 * G.s) +
      '" fill="#5c6070" font-size="' +
      G.font +
      '" text-anchor="end">' +
      krShort(gv) +
      "</text>";
  }

  // Monte Carlo band behind the bars
  if (v.band) {
    let up = "";
    let dn = "";
    for (let y = 0; y <= Y; y++) up += (y ? " L" : "M") + x(y).toFixed(1) + " " + yy(hi[y]).toFixed(1);
    for (let y = Y; y >= 0; y--) dn += " L" + x(y).toFixed(1) + " " + yy(lo[y]).toFixed(1);
    s +=
      '<path d="' +
      up +
      dn +
      ' Z" fill="rgba(107,155,255,0.09)"/>' +
      '<path d="' +
      up +
      '" fill="none" stroke="#5b78c4" stroke-width="' +
      1.2 * G.s +
      '" opacity="0.8"/>' +
      '<path d="' +
      dn.replace(/^ L/, "M") +
      '" fill="none" stroke="#5b78c4" stroke-width="' +
      1.2 * G.s +
      '" opacity="0.8"/>';
    let mid = "";
    for (let y = 0; y <= Y; y++) mid += (y ? " L" : "M") + x(y).toFixed(1) + " " + yy(v.band.p50[y] / deflator(p, y)).toFixed(1);
    s +=
      '<path d="' +
      mid +
      '" fill="none" stroke="#8fb0ff" stroke-width="' +
      1.4 * G.s +
      '" stroke-dasharray="' +
      5 * G.s +
      " " +
      5 * G.s +
      '" opacity="0.8"/>';
  }

  // bars: stacked bottom up, then the shortfall painted over the top of the
  // paid-in stack when the pot has not kept up with what was put in
  const zero = yy(0);
  for (let y = 1; y <= Y; y++) {
    const bx = x(y) - barW / 2;
    let acc = 0;
    stack(y).forEach((seg) => {
      const from = yy(acc);
      acc += seg[0];
      s += rect(bx, yy(acc), barW, from - yy(acc), seg[1]);
    });
    if (SHOW.loss && gainPart[y] < 0) {
      const shortfall = Math.min(-gainPart[y], acc);
      s += rect(bx, yy(acc), barW, yy(acc - shortfall) - yy(acc), "var(--loss)", 0.6);
    }
  }

  // x axis
  s += '<line x1="' + M.l + '" y1="' + zero + '" x2="' + (W - M.r) + '" y2="' + zero + '" stroke="#3a3f52" stroke-width="' + G.s + '"/>';
  const stepY = Math.max(1, Math.ceil(Y / 10));
  for (let y = 0; y <= Y; y += stepY) {
    s +=
      '<text x="' +
      x(y) +
      '" y="' +
      (H - 14 * G.s) +
      '" fill="#5c6070" font-size="' +
      G.font +
      '" text-anchor="middle">' +
      Math.round(p.age + y) +
      "</text>";
  }
  s += '<text x="' + M.l + '" y="' + (H - 2 * G.s) + '" fill="#484d5e" font-size="' + 11 * G.s + '">ålder</text>';
  s += "</svg>";

  el.chart.innerHTML = s;
  wireTooltip(v, { val: val, paid: paid, startPart: startPart, monPart: monPart, gainPart: gainPart, lo: lo, hi: hi });
}

function rect(x, y, w, h, fill, op) {
  if (!(h > 0)) return "";
  return (
    '<rect x="' +
    x.toFixed(1) +
    '" y="' +
    y.toFixed(1) +
    '" width="' +
    w.toFixed(1) +
    '" height="' +
    h.toFixed(1) +
    '" fill="' +
    fill +
    '"' +
    (op ? ' opacity="' + op + '"' : "") +
    "/>"
  );
}

function wireTooltip(v, series) {
  const svg = el.chart.firstChild;
  const Y = v.p.years;

  const show = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let y = Math.round(((px - G.l) / (W - G.l - G.r)) * Y);
    y = Math.max(0, Math.min(Y, y));
    const g = series.gainPart[y];
    let html =
      "<b>" +
      Math.round(v.p.age + y) +
      ' år</b> <span class="k">(år ' +
      y +
      ")</span><br>" +
      '<span class="k">Värde</span> <b>' +
      kr(series.val[y]) +
      "</b><br>" +
      '<span class="k">' +
      (g < 0 ? "Förlorad köpkraft" : "Avkastning") +
      "</span> " +
      kr(g) +
      '<br><span class="k">Månadssparande</span> ' +
      kr(series.monPart[y]) +
      '<br><span class="k">Startbelopp</span> ' +
      kr(series.startPart[y]);
    if (v.band) html += '<br><span class="k">p10 till p90</span> ' + krShort(series.lo[y]) + " till " + krShort(series.hi[y]);
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

  // Touch: no hover on a phone, so dragging a finger across the chart reads it.
  // No preventDefault, so vertical page scrolling still works over the chart.
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
      (c.hintHtml || c.hint || "") +
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

function buildPresets(hostId, list) {
  const host = document.getElementById(hostId);
  list.forEach((preset) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = preset.name;
    b.addEventListener("click", () => {
      Object.keys(preset.v).forEach((id) => setControl(id, preset.v[id]));
      // Both rows set the same controls, so only one button anywhere can be lit.
      document.querySelectorAll(".presets button").forEach((o) => o.classList.remove("active"));
      b.classList.add("active");
      render();
    });
    host.appendChild(b);
  });
}

// ---------- URL state ----------
//
// The address bar is the only persistence this page has, and the contract the
// other calculators here link through: one query parameter per control id, plain
// numbers with a dot as decimal separator, so a link survives copy and paste and
// a foreign app can build one without knowing anything about Swedish formatting.
// Flags are 0 or 1.
//
// Only values that differ from the default are written. That keeps a link short,
// and it means a default we revise later is not frozen into every old link.

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
  Object.keys(s.values).forEach((id) => setControl(id, s.values[id]));
  if (s.flags.isk !== undefined) el.isk.checked = s.flags.isk;
  if (s.flags.ref !== undefined) el.lysaOn.checked = s.flags.ref;
  if (s.basis) setBasis(s.basis);
  if (s.band !== null) setSeries("band", s.band);
}

// Called from render, so it fires on every animation frame while a slider is
// dragged. Safari rate-limits replaceState, so the write is debounced rather than
// done inline. A file:// page cannot always rewrite its own URL, and that is not
// worth an exception on a page that otherwise works offline.
let urlTimer = null;
function writeUrlState() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const values = {};
    CONTROLS.forEach((c) => {
      values[c.id] = parseField(el[c.id].num.value);
    });
    const s = buildUrlQuery(CONTROLS, values, { isk: el.isk.checked, ref: el.lysaOn.checked }, basis, SHOW.band);
    try {
      history.replaceState(null, "", s ? "?" + s : location.pathname);
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
  buildPresets("presets", PRESETS);
  buildPresets("cost-presets", COST_PRESETS);

  el.isk = document.getElementById("isk");
  el.lysaOn = document.getElementById("lysaOn");
  el.stats = document.getElementById("stats");
  el.chart = document.getElementById("chart");
  el.tip = document.getElementById("tip");
  el.resultLabel = document.getElementById("result-label");
  el.resultTotal = document.getElementById("result-total");
  el.resultSplit = document.getElementById("result-split");
  el.advSummary = document.getElementById("adv-summary");

  // the back-solve helper lives inside the growth control's hint
  el.solve = document.getElementById("solve");
  el.solveNote = document.createElement("span");
  el.solveNote.className = "solve-note";
  el.solve.parentElement.appendChild(el.solveNote);
  el.solve.addEventListener("input", () => {
    const target = parseField(el.solve.value);
    const now = parseField(el.monthly.num.value);
    const ramp = solveRamp(parseField(el.years.num.value));
    if (isFinite(target) && target > 0 && now > 0 && ramp > 0) {
      const g = (Math.pow(target / now, 1 / ramp) - 1) * 100;
      // Negative is allowed: a target below today's amount means the saving winds down.
      const clamped = Math.min(el.growth.spec.max, Math.max(el.growth.spec.min, g));
      el.growth.num.value = fieldText(el.growth.spec, clamped);
      el.growth.rng.value = valueToSlider(el.growth.spec, clamped);
      schedule();
    }
  });

  [el.isk, el.lysaOn].forEach((c) => c.addEventListener("change", schedule));

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
