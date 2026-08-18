"use strict";

// Ranta pa ranta, osockrat.
// Deterministic monthly engine + Monte Carlo band. Everything runs client side,
// nothing is stored, no dependencies.

const NPATHS = 1200;
const MAXY = 60;
const SOLVE_H = 20; // horizon (years) for the "sparar X kr/man om 20 ar" helper

const CONTROLS = [
  { id: "start", group: "basic", label: "Startbelopp", unit: "kr", min: 0, max: 1000000, step: 1000, value: 10000 },
  { id: "monthly", group: "basic", label: "Månadssparande nu", unit: "kr", min: 0, max: 20000, step: 100, value: 1000 },
  { id: "age", group: "basic", label: "Ålder nu", unit: "år", min: 15, max: 75, step: 1, value: 22 },
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
    label: "Sparandet växer per år",
    unit: "%",
    min: 0,
    max: 10,
    step: 0.1,
    value: 3,
    hintHtml: "om " + SOLVE_H + ' år: <input id="solve" type="number" step="100" min="0" /> kr/mån'
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
    hint: "Tas på kapitalet, inte på avkastningen."
  },
  {
    id: "slr",
    group: "adv",
    label: "Statslåneränta",
    unit: "%",
    min: 0,
    max: 8,
    step: 0.1,
    value: 2,
    hint: "Styr ISK-schablonen. Kontrollera aktuell siffra."
  },
  {
    id: "iskFree",
    group: "adv",
    label: "ISK-fribelopp",
    unit: "kr",
    min: 0,
    max: 600000,
    step: 10000,
    value: 150000,
    hint: "Avdrag på kapitalunderlaget."
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

const el = {};
let basis = "life";

// ---------- formatting ----------

const NF = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF2 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 });

const kr = (v) => NF.format(Math.round(v)) + " kr";

function krShort(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return NF1.format(v / 1e6) + " mkr";
  if (a >= 1e4) return NF.format(Math.round(v / 1000)) + " tkr";
  return NF.format(Math.round(v));
}

// ---------- pre-generated standard normals (seeded, so sliders do not jitter) ----------

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Z = (function () {
  const n = NPATHS * MAXY * 12;
  const z = new Float32Array(n);
  const rnd = mulberry32(20260818);
  for (let i = 0; i < n; i += 2) {
    let u = rnd();
    if (u < 1e-12) u = 1e-12;
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * rnd();
    z[i] = r * Math.cos(th);
    if (i + 1 < n) z[i + 1] = r * Math.sin(th);
  }
  return z;
})();

// ---------- engine ----------

// Runs one path month by month. zOff = null gives the deterministic path.
// bal/contrib are written per completed year (index 0 = today).
function simulate(p, zOff, bal, contrib) {
  const N = p.years * 12;
  const detM = Math.pow(1 + p.ret, 1 / 12);
  const feeM = Math.pow(1 - p.fee, 1 / 12);
  const muM = Math.log(1 + p.ret) / 12;
  const sdM = p.vol / Math.sqrt(12);
  const taxRate = 0.3 * Math.max(p.slr + 0.01, 0.0125);

  let b = p.start;
  let paid = p.start;
  let fees = 0;
  let tax = 0;
  let qSum = 0; // quarter-opening values, the ISK kapitalunderlag base
  let dep = 0; // deposits during the current year

  bal[0] = b;
  contrib[0] = paid;

  for (let m = 0; m < N; m++) {
    if (m % 3 === 0) qSum += b;

    const c = p.monthly * Math.pow(1 + p.growth, (m / 12) | 0);
    b += c;
    paid += c;
    dep += c;

    b *= zOff === null ? detM : Math.exp(muM + sdM * Z[zOff + m]);

    const beforeFee = b;
    b *= feeM;
    fees += beforeFee - b;

    if (m % 12 === 11) {
      if (p.isk) {
        const t = taxRate * Math.max(0, (qSum + dep) / 4 - p.iskFree);
        b -= t;
        tax += t;
      }
      qSum = 0;
      dep = 0;
      if (b < 0) b = 0;
      const y = (m + 1) / 12;
      bal[y] = b;
      contrib[y] = paid;
    }
  }
  return { fees: fees, tax: tax };
}

function percentileBand(p) {
  const Y = p.years;
  const rows = Y + 1;
  const mat = new Float64Array(rows * NPATHS);
  const bal = new Float64Array(rows);
  const contrib = new Float64Array(rows);
  const stride = MAXY * 12;

  for (let k = 0; k < NPATHS; k++) {
    simulate(p, k * stride, bal, contrib);
    for (let y = 0; y < rows; y++) mat[y * NPATHS + k] = bal[y];
  }

  const p10 = new Float64Array(rows);
  const p50 = new Float64Array(rows);
  const p90 = new Float64Array(rows);
  const col = new Float64Array(NPATHS);
  for (let y = 0; y < rows; y++) {
    col.set(mat.subarray(y * NPATHS, y * NPATHS + NPATHS));
    const s = Array.prototype.slice.call(col).sort((a, b) => a - b);
    p10[y] = s[Math.floor(0.1 * (NPATHS - 1))];
    p50[y] = s[Math.floor(0.5 * (NPATHS - 1))];
    p90[y] = s[Math.floor(0.9 * (NPATHS - 1))];
  }
  return { p10: p10, p50: p50, p90: p90 };
}

// ---------- state ----------

function readParams() {
  const v = {};
  CONTROLS.forEach((c) => {
    v[c.id] = parseFloat(el[c.id].num.value);
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
    isk: el.isk.checked
  };
}

function deflator(p, y) {
  if (basis === "nom") return 1;
  const f = basis === "cpi" ? 1 + p.inflation : (1 + p.inflation) * (1 + p.drift);
  return Math.pow(f, y);
}

const BASIS_LABEL = {
  nom: "Nominellt värde",
  cpi: "I dagens kronor (KPI-justerat)",
  life: "I dagens levnadsstandard (KPI och standardglidning)"
};

// ---------- render ----------

let view = null;

// The Monte Carlo pass costs ~100 ms, too slow to run on every slider frame.
// Keep the last band on screen while dragging and recompute once the slider settles.
let bandKey = null;
let bandVal = null;
let bandTimer = null;

function getBand(p) {
  if (!el.volOn.checked || p.vol <= 0) {
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
  const total = bal[Y] / d;
  const paid = contrib[Y] / d;
  const gain = total - paid;

  el.resultLabel.textContent = "Totalt efter " + Y + " år, vid " + Math.round(p.age + Y) + " års ålder";
  el.resultTotal.textContent = kr(total);
  el.resultSplit.innerHTML =
    "Varav " + kr(paid) + " insatt och <b>" + kr(gain) + "</b> avkastning &middot; " + BASIS_LABEL[basis].toLowerCase();

  const lastMonthly = p.monthly * Math.pow(1 + p.growth, Y - 1);
  const naiveGapPct = total > 0 ? (naiveBal[Y] / total - 1) * 100 : 0;

  const stats = [
    ["Insatt totalt", kr(paid), "därav " + kr(p.start / d) + " startbelopp", false],
    ["Avkastning", kr(gain), paid > 0 ? NF2.format(gain / paid) + " gånger det insatta" : "", gain < 0],
    band
      ? [
          "Utfallsspann",
          krShort(band.p10[Y] / d) + " till " + krShort(band.p90[Y] / d),
          "p10 till p90 av " + NF.format(NPATHS) + " simulerade utfall",
          false
        ]
      : ["Utfallsspann", "Avstängt", "slås på under Avancerat", false],
    [
      "Bankmodellens siffra",
      kr(naiveBal[Y]),
      el.lysaOn.checked
        ? NF.format(Math.round(naiveGapPct)) + " % högre. Nominellt, fast månadsbelopp, utan avgift och skatt"
        : "nominellt, utan avgift och skatt",
      false
    ],
    ["Avgifter och skatt", kr(cost.fees + cost.tax), "nominellt: " + kr(cost.fees) + " avgift, " + kr(cost.tax) + " ISK-skatt", false],
    ["Månadsuttag", kr((total * 0.04) / 12), "tumregel: 4 % av kapitalet per år, i valt basmått", false],
    ["Månadssparande sista året", kr(lastMonthly), "nominellt, motsvarar " + kr(lastMonthly / d) + " i valt basmått", false]
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

  view = { p: p, bal: bal, contrib: contrib, band: band };
  drawChart(view);
  updateHints(p);
}

function updateHints(p) {
  el.years.hint.textContent = "Fram till " + Math.round(p.age + p.years) + " års ålder.";
  el.age.hint.textContent = "";
  el.start.hint.textContent = "Kapital du redan har.";
  el.monthly.hint.textContent = "";
  el.iskFree.hint.textContent = el.isk.checked ? "Avdrag på kapitalunderlaget." : "ISK-skatten är avstängd.";

  const target = p.monthly * Math.pow(1 + p.growth, SOLVE_H);
  if (document.activeElement !== el.solve) el.solve.value = Math.round(target);
  el.solveNote.textContent = p.age + SOLVE_H <= 100 ? "(vid " + Math.round(p.age + SOLVE_H) + " års ålder)" : "";

  el.advSummary.textContent =
    "inflation " +
    NF1.format(p.inflation * 100) +
    " %, standardglidning " +
    NF1.format(p.drift * 100) +
    " %, avgift " +
    NF2.format(p.fee * 100) +
    " %, sparandet växer " +
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
  const lo = [];
  const hi = [];
  for (let y = 0; y <= Y; y++) {
    const d = deflator(p, y);
    val.push(v.bal[y] / d);
    paid.push(v.contrib[y] / d);
    if (v.band) {
      lo.push(v.band.p10[y] / d);
      hi.push(v.band.p90[y] / d);
    }
  }

  let max = 0;
  for (let y = 0; y <= Y; y++) {
    max = Math.max(max, val[y], paid[y], v.band ? hi[y] : 0);
  }
  max = niceCeil(max * 1.04);

  const x = (y) => M.l + (pw * y) / Y;
  const yy = (value) => M.t + ph - (ph * value) / (max || 1);
  const barW = Math.max(2, Math.min(26 * G.s, (pw / Y) * 0.68));

  let s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img">';

  // gridlines
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const gv = (max * i) / ticks;
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
      '" stroke="#242734" stroke-width="1"/>' +
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
    s += '<path d="' + up + dn + ' Z" fill="rgba(107,155,255,0.13)"/>';
    let mid = "";
    for (let y = 0; y <= Y; y++) mid += (y ? " L" : "M") + x(y).toFixed(1) + " " + yy(v.band.p50[y] / deflator(p, y)).toFixed(1);
    s += '<path d="' + mid + '" fill="none" stroke="#8fb0ff" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.75"/>';
  }

  // bars
  const zero = yy(0);
  for (let y = 1; y <= Y; y++) {
    const bx = x(y) - barW / 2;
    const vTop = yy(val[y]);
    const pTop = yy(paid[y]);
    if (val[y] >= paid[y]) {
      s += rect(bx, pTop, barW, zero - pTop, "var(--in)");
      s += rect(bx, vTop, barW, pTop - vTop, "var(--ret)");
    } else {
      s += rect(bx, vTop, barW, zero - vTop, "var(--in)");
      s += rect(bx, pTop, barW, vTop - pTop, "var(--loss)", 0.55);
    }
  }

  // x axis
  s += '<line x1="' + M.l + '" y1="' + zero + '" x2="' + (W - M.r) + '" y2="' + zero + '" stroke="#3a3f52"/>';
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
  wireTooltip(v, val, paid, lo, hi);
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

function niceCeil(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / (mag / 2)) * (mag / 2);
}

function wireTooltip(v, val, paid, lo, hi) {
  const svg = el.chart.firstChild;
  const Y = v.p.years;

  const show = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let y = Math.round(((px - G.l) / (W - G.l - G.r)) * Y);
    y = Math.max(0, Math.min(Y, y));
    const g = val[y] - paid[y];
    let html =
      "<b>" +
      Math.round(v.p.age + y) +
      ' år</b> <span class="k">(år ' +
      y +
      ")</span><br>" +
      '<span class="k">Värde</span> <b>' +
      kr(val[y]) +
      "</b><br>" +
      '<span class="k">Insatt</span> ' +
      kr(paid[y]) +
      "<br>" +
      '<span class="k">' +
      (g < 0 ? "Förlorad köpkraft" : "Avkastning") +
      "</span> " +
      kr(g);
    if (v.band) html += '<br><span class="k">p10 till p90</span> ' + krShort(lo[y]) + " till " + krShort(hi[y]);
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
      '<div class="ctl-head"><span class="ctl-label">' +
      c.label +
      "</span>" +
      '<span class="ctl-value"><input type="number" id="n-' +
      c.id +
      '" min="' +
      c.min +
      '" max="' +
      c.max +
      '" step="' +
      c.step +
      '" value="' +
      c.value +
      '" /><span class="ctl-unit">' +
      c.unit +
      "</span></span></div>" +
      '<div class="ctl-hint">' +
      (c.hintHtml || c.hint || "") +
      "</div>" +
      '<input type="range" id="r-' +
      c.id +
      '" min="' +
      c.min +
      '" max="' +
      c.max +
      '" step="' +
      c.step +
      '" value="' +
      c.value +
      '" />';
    document.getElementById(c.group).appendChild(wrap);

    const num = wrap.querySelector("#n-" + c.id);
    const rng = wrap.querySelector("#r-" + c.id);
    el[c.id] = { num: num, rng: rng, hint: wrap.querySelector(".ctl-hint"), spec: c };

    rng.addEventListener("input", () => {
      num.value = rng.value;
      schedule();
    });
    num.addEventListener("input", () => {
      const val = parseFloat(num.value);
      if (isFinite(val)) rng.value = Math.min(c.max, Math.max(c.min, val));
      schedule();
    });
  });
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

  el.isk = document.getElementById("isk");
  el.volOn = document.getElementById("volOn");
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
    const target = parseFloat(el.solve.value);
    const now = parseFloat(el.monthly.num.value);
    if (isFinite(target) && target > 0 && now > 0) {
      const g = (Math.pow(target / now, 1 / SOLVE_H) - 1) * 100;
      const clamped = Math.min(el.growth.spec.max, Math.max(0, g));
      el.growth.num.value = NF1.format(clamped).replace(",", ".");
      el.growth.rng.value = clamped;
      schedule();
    }
  });

  [el.isk, el.volOn, el.lysaOn].forEach((c) => c.addEventListener("change", schedule));

  document.querySelectorAll("#basis button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#basis button").forEach((o) => o.classList.remove("active"));
      b.classList.add("active");
      basis = b.dataset.basis;
      render();
    });
  });

  window.addEventListener("resize", () => {
    if (view) drawChart(view);
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
