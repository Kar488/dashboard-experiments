/* ============================================================================
 * MyDesk consolidated KPI board.
 *
 * One card per metric, each with its own smooth 52-week mini-trend (Actual +
 * dotted LY, hover to compare this week vs same week LY). A UPC/NCRC/CIG filter
 * re-scopes every card to a single item. Replaces the old #primaryMetrics /
 * #secondaryMetrics grids AND the "Weekly P&L and KPI Trends" panel.
 *
 * DATA: headline values mirror the dashboard's mock primaryMetrics; the weekly
 * series are generated deterministically. To feed real data later, set
 * window.__DXK_KPIS__ (same shape as KPIS below) before this script runs, or
 * call MyDeskKPI.load(kpis).
 * ========================================================================== */
(function () {
  "use strict";
  const ROOT = document.getElementById("kpiBoard");
  if (!ROOT) return;

  ROOT.innerHTML =
    '<div class="panel-heading" style="align-items:flex-end;">' +
      '<div><h2>KPI Overview</h2><p>Each card carries its own 52-week trend (solid = Actual, dotted = LY). Type a UPC / NCRC / CIG to re-scope the cards to a single item.</p></div>' +
      '<div class="dxk-head-right">' +
        '<div class="kfilter-group">' +
          '<div class="ftype" id="dxkType"><button data-t="UPC" class="active">UPC</button><button data-t="NCRC">NCRC</button><button data-t="CIG">CIG</button></div>' +
          '<div class="kfilter"><span class="kfi">⌕</span><input id="dxkFilter" type="text" placeholder="Search UPC…" autocomplete="off" /><button id="dxkClear" class="kclear" hidden aria-label="Clear filter">✕</button></div>' +
        '</div>' +
        '<div class="legend"><span><i></i>Actual</span><span><i class="ly"></i>Forecast / LY</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="fchip" id="dxkChip" hidden></div>' +
    '<div class="tier">Primary KPIs</div>' +
    '<div class="grid primary" id="dxkPrimary"></div>' +
    '<div class="tier">More metrics &amp; basket</div>' +
    '<div class="grid secondary" id="dxkSecondary"></div>';

  const tip = document.createElement("div");
  tip.id = "dxkTip";
  document.body.appendChild(tip);

  const $ = (id) => ROOT.querySelector("#" + id);

  /* ---------- deterministic RNG + series ---------- */
  function rng(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
  function series(seed, n, base, vol, drift, bump) { const r = rng(seed), out = []; let v = base; for (let i = 0; i < n; i++) { v += (r() - 0.5) * vol + drift; let y = v; if (bump && Math.abs(i - bump.at) < 5) y += bump.amp * Math.max(0, 1 - Math.abs(i - bump.at) / 5); out.push(Math.max(0.02, y)); } return out; }
  function movavg(a, w) { const n = a.length, r = (w - 1) / 2, out = []; for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) { s += a[j]; c++; } out.push(s / c); } return out; }
  const SMOOTH = (a) => movavg(movavg(a, 5), 3);

  /* ---------- KPI definitions ---------- */
  const KPIS = window.__DXK_KPIS__ || [
    { key: "sales", label: "Total Sales", ic: "$", accent: "#4a8a5d", value: "$820.39M", vs: "vs $824.06M LY", delta: "−0.45% · −$3.68M", neg: 1, base: 8.3, vol: 0.7, drift: -0.02, bump: { at: 17, amp: 9 }, foot: ["Top: Citrus +$3.5M", "Watch: Snacking −$1.3M"], primary: 1 },
    { key: "units", label: "Total Units", ic: "U", accent: "#1769e8", value: "357.79M", vs: "vs 348.90M LY", delta: "+2.55% · +8.88M", neg: 0, base: 6.4, vol: 0.5, drift: 0.03, foot: ["Top: Avocado +8.48M", "Watch: Onions −818K"], primary: 1 },
    { key: "agpPct", label: "AGP %", ic: "%", accent: "#7c4dcc", value: "34.02%", vs: "vs 34.30% LY", delta: "−0.25pp · −$2.44M", neg: 1, base: 34, vol: 0.6, drift: 0, foot: ["Top: Tropical Fruit +$2.46M", "Watch: Cherries −$2.63M"], primary: 1 },
    { key: "aiv", label: "AIV", ic: "A", accent: "#0891b2", value: "$2.29", vs: "vs $2.36 LY", delta: "−2.92% · −$0.07", neg: 1, base: 2.36, vol: 0.05, drift: -0.003, foot: ["Top: Premium Bev +$0.16", "Watch: Apples −$0.11"], primary: 1 },
    { key: "agpDol", label: "AGP Dollar", ic: "G", accent: "#9b4cf5", value: "$279.97M", vs: "vs $282.41M LY", delta: "−0.86% · −$2.44M", neg: 1, base: 5.3, vol: 0.5, drift: -0.005, bump: { at: 31, amp: 3 }, foot: ["Top: Bananas +$1.88M", "Watch: Berries −$3.43M"], primary: 1 },
    { key: "house", label: "Household Penetration", ic: "H", accent: "#1769e8", type: "flat", value: "42.7%", vs: "vs 40.8% Same 12 Wks LY", delta: "+4.7% · +1.9pp", neg: 0, foot: ["Top: Organic Veg +0.0pp", "Watch: Fresh Cut −45.4pp"], primary: 1 },
    { key: "share", label: "Market Share", ic: "M", accent: "#f36b12", type: "dual", primary: 1, source: "Source: Circana (Data as of Jun 13, 2026)", sub: [
      { label: "MULO+", value: "21.97%", vs: "vs 21.98% Same 12 Wks LY", delta: "−0.01pp · −$61.3K", neg: 1 },
      { label: "FOOD", value: "34.58%", vs: "vs 34.66% Same 12 Wks LY", delta: "−0.08pp · −$311.5K", neg: 1 },
    ] },
    { key: "cogs", label: "COGS", value: "$540.4M", vs: "vs $541.7M LY", delta: "−0.2%", neg: 0, base: 9, vol: 0.6, drift: -0.01, primary: 0 },
    { key: "allow", label: "Allowances", value: "$74.9M", vs: "vs $87.0M LY", delta: "−13.9%", neg: 1, base: 1.6, vol: 0.2, drift: -0.02, primary: 0 },
    { key: "deadnet", label: "Deadnet Cost", value: "$465.5M", vs: "vs $454.7M LY", delta: "+2.4%", neg: 1, base: 7.6, vol: 0.5, drift: 0.02, primary: 0 },
    { key: "deadunit", label: "Deadnet / Unit", value: "$1.30", vs: "vs $1.31 LY", delta: "−0.8%", neg: 0, base: 1.31, vol: 0.02, drift: -0.001, primary: 0 },
    { key: "mix", label: "Sales Mix %", value: "52.2%", vs: "vs 52.8% LY", delta: "−0.6pp", neg: 1, base: 53, vol: 0.4, drift: -0.02, primary: 0 },
    { key: "bog", label: "BOG %", value: "40.7%", vs: "vs 30.6% LY", delta: "+10.1pp", neg: 0, base: 31, vol: 0.7, drift: 0.18, primary: 0 },
    { key: "markdown", label: "Markdown $", value: "$87.0M", vs: "vs $80.6M LY", delta: "+7.9%", neg: 1, base: 1.5, vol: 0.2, drift: 0.02, primary: 0 },
    { key: "cpip", label: "CPI - P", value: "1.03", vs: "vs 1.00 LY", delta: "+0.03", neg: 1, base: 1.0, vol: 0.02, drift: 0.0006, primary: 0 },
    { key: "cpiw", label: "CPI - W", value: "1.01", vs: "vs 1.00 LY", delta: "+0.01", neg: 1, base: 1.0, vol: 0.015, drift: 0.0002, primary: 0 },
  ];
  const N = 52, ICDEF = "#1769e8";
  function genSeries(k) {
    if (!k.accent) k.accent = ICDEF;
    if (k.base == null) return;
    k.act = SMOOTH(series(k.key + "a", N, k.base, k.vol, k.drift, k.bump));
    k.ly = SMOOTH(series(k.key + "l", N, k.base * 1.01, k.vol * 0.8, k.drift * 0.6, k.bump ? { at: k.bump.at, amp: k.bump.amp * 0.8 } : null));
  }
  KPIS.forEach(genSeries);

  // Basket & household metrics — same compact tile as "More metrics". noScope: not item-attributable, so the UPC/NCRC/CIG filter leaves them as store-level context.
  const BASKET = [
    ["Avg Basket Spend", "$47.82", "$45.67", "+3.2%", 0],
    ["Items per Basket", "12.4", "13.5", "−1.1%", 1],
    ["Household Trips/Week", "2.8", "2.6", "+5.3%", 0],
    ["% Items in Basket (Produce)", "34.2%", "33.5%", "+1.8%", 0],
    ["$ Value in Basket (Produce)", "$16.35", "$15.20", "+4.1%", 0],
    ["% Households buying ≥1×/week", "42.7%", "40.8%", "+4.7%", 0],
    ["% Revenue from Top 100 Items", "67.8%", "68.3%", "−0.5%", 1],
  ].map(([label, value, prev, delta, neg], i) => ({ key: "basket" + i, label, value, vs: "vs " + prev + " LY", delta, neg, noScope: 1, noTrend: 1, muted: 1, primary: 0 }));
  const kpiByKey = (key) => KPIS.find((x) => x.key === key) || BASKET.find((x) => x.key === key);

  const state = { filter: "", filterType: "UPC" };
  const filterSeed = () => state.filterType + ":" + state.filter;
  function seriesOf(k) {
    if (!state.filter || k.noScope) return { act: k.act, ly: k.ly };
    const sd = filterSeed() + "|" + k.key, at = 5 + Math.floor(rng(sd + "at")() * 40), amp = k.base * 0.5;
    return {
      act: SMOOTH(series(sd + "a", N, k.base, k.vol, k.drift, k.bump ? { at, amp } : null)),
      ly: SMOOTH(series(sd + "l", N, k.base * 1.01, k.vol * 0.8, k.drift * 0.6, k.bump ? { at, amp: amp * 0.8 } : null)),
    };
  }

  /* ---------- curve + labels ---------- */
  function smooth(pts) {
    if (pts.length < 3) return "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L");
    let d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  function notableWeeks(arr) {
    const n = arr.length, R = 3, mn = Math.min(...arr), mx = Math.max(...arr), rg = (mx - mn) || 1, cand = [];
    for (let i = 1; i < n - 1; i++) {
      let isMax = true, isMin = true;
      for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) { if (arr[j] > arr[i]) isMax = false; if (arr[j] < arr[i]) isMin = false; }
      if (isMax || isMin) { let ref = isMax ? Infinity : -Infinity; for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) { if (j === i) continue; ref = isMax ? Math.min(ref, arr[j]) : Math.max(ref, arr[j]); } cand.push({ i, prom: Math.abs(arr[i] - ref) / rg }); }
    }
    cand.sort((a, b) => b.prom - a.prom);
    const chosen = [];
    for (const c of cand) { if (c.prom < 0.11) continue; if (chosen.some((x) => Math.abs(x - c.i) < 5)) continue; chosen.push(c.i); if (chosen.length >= 4) break; }
    let maxI = 0, minI = 0; arr.forEach((v, k) => { if (v > arr[maxI]) maxI = k; if (v < arr[minI]) minI = k; });
    [maxI, minI].forEach((gi) => { if (!chosen.some((x) => Math.abs(x - gi) < 4)) chosen.push(gi); });
    return [...new Set(chosen)].sort((a, b) => a - b);
  }
  function fmtHover(k, v) {
    const s = k.value || "";
    if (/M$/.test(s)) return (s[0] === "$" ? "$" : "") + v.toFixed(1) + "M";
    if (/%$/.test(s)) return v.toFixed(1) + "%";
    if (s[0] === "$") return "$" + v.toFixed(2);
    return v.toFixed(2);
  }

  function trend(k, H) {
    const S = seriesOf(k), act = S.act, ly = S.ly, n = act.length, W = 240, pT = 4, pB = 4, pL = 2, pR = 2;
    const all = act.concat(ly), mn = Math.min(...all), mx = Math.max(...all), rg = (mx - mn) || 1;
    const xs = (i) => pL + i / (n - 1) * (W - pL - pR), ys = (v) => H - pB - (v - mn) / rg * (H - pT - pB);
    const pts = (arr) => arr.map((v, i) => [xs(i), ys(v)]);
    const aLine = smooth(pts(act)), lyLine = smooth(pts(ly));
    const area = aLine + ` L${xs(n - 1).toFixed(1)},${H} L${xs(0).toFixed(1)},${H} Z`;
    const notable = notableWeeks(act);
    const col = k.primary ? k.accent : (k.neg ? "var(--red)" : "var(--green)");
    const guides = notable.map((i) => `<line class="g" x1="${xs(i).toFixed(1)}" y1="${pT}" x2="${xs(i).toFixed(1)}" y2="${H - pB}"/>`).join("");
    const dots = notable.map((i) => `<circle class="dot" cx="${xs(i).toFixed(1)}" cy="${ys(act[i]).toFixed(1)}" r="2.4"/>`).join("");
    const hover = `<line class="hl" x1="0" y1="${pT}" x2="0" y2="${H - pB}" style="display:none"/><circle class="ha" r="2.8" style="display:none"/><circle class="hly" r="2.4" style="display:none"/>`;
    const svg = `<svg class="trendsvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="color:${col}">${guides}<path class="area" d="${area}"/><path class="ly" d="${lyLine}"/><path class="act" d="${aLine}" stroke="${col}"/>${dots}${hover}</svg>`;
    const labels = notable.map((i) => { const pct = xs(i) / W * 100; const cl = pct < 9 ? "l" : (pct > 91 ? "r" : ""); return `<span class="${cl}" style="left:${pct.toFixed(1)}%">W${i + 1}</span>`; }).join("");
    return `<div class="trend"><div class="trend-plot" data-kpi="${k.key}" data-h="${H}" style="height:${H}px">${svg}</div><div class="trend-axis">${labels}</div></div>`;
  }

  function scoped(k) {
    if (!state.filter) return { value: k.value, delta: k.delta, neg: k.neg, vs: k.vs };
    const r = rng(filterSeed() + "|" + k.key + "|d");
    const dpct = (r() * 2 - 1) * 14, neg = dpct < 0;
    let value = k.value;
    const m = k.value.match(/^(\$?)([\d.]+)M$/);
    if (m) { const frac = 0.0001 + rng(filterSeed() + "frac")() * 0.0009; const v = parseFloat(m[2]) * frac; value = m[1] + (v < 1 ? v.toFixed(2) : v.toFixed(1)) + "M"; }
    const unit = /pp\b|%$/.test(k.delta) ? "pp" : "%";
    const delta = (neg ? "−" : "+") + Math.abs(dpct).toFixed(1) + unit;
    return { value, delta, neg, vs: "vs LY · this item" };
  }

  function primaryCard(k) {
    const head = `<div class="card-top"><span class="ic" style="color:${k.accent};background:${k.accent}1f">${k.ic}</span><span class="card-label">${k.label}</span></div>`;
    const explain = `<a class="explain">Explain drivers ›</a>`;
    if ((k.type === "dual" || k.type === "flat") && state.filter) {
      return `<div class="card">${head}<div class="card-na">Not tracked at item level</div>${explain}</div>`;
    }
    if (k.type === "dual") {
      const rows = k.sub.map((s) => `<div class="ms-row"><div class="ms-l"><span class="ms-label">${s.label}</span><span class="ms-val">${s.value}</span></div><div class="ms-r"><span class="ms-vs">${s.vs}</span><span class="ms-delta ${s.neg ? "neg" : "pos"}">${s.delta}</span></div></div>`).join("");
      return `<div class="card">${head}<div class="ms-grid">${rows}</div><div class="card-source">${k.source}</div>${explain}</div>`;
    }
    const sc = scoped(k);
    const trendBlock = k.type === "flat" ? "" : trend(k, 50);
    const foot = (!state.filter && k.foot) ? `<div class="card-foot"><span class="pos">${k.foot[0]}</span><span class="neg">${k.foot[1]}</span></div>` : "";
    return `<div class="card">${head}<div class="card-value">${sc.value}</div><div class="card-vsrow"><span class="card-delta ${sc.neg ? "neg" : "pos"}">${sc.delta}</span><span class="card-vs">${sc.vs}</span></div>${trendBlock}${foot}${explain}</div>`;
  }

  function tileHTML(k) {
    const sc = k.noScope ? { value: k.value, delta: k.delta, neg: k.neg, vs: k.vs } : scoped(k);
    const tr = k.noTrend ? '<div class="trend trend-blank"></div>' : trend(k, 40);
    return `<div class="tile ${k.muted ? "muted" : ""}"><span class="tile-label">${k.label}</span><div class="tile-vsrow"><span class="tile-value">${sc.value}</span><span class="tile-delta ${sc.neg ? "neg" : "pos"}">${sc.delta}</span></div>${tr}<span class="tile-vs">${sc.vs}</span></div>`;
  }
  function render() {
    $("dxkPrimary").innerHTML = KPIS.filter((k) => k.primary).map(primaryCard).join("");
    $("dxkSecondary").innerHTML = KPIS.filter((k) => !k.primary).concat(BASKET).map(tileHTML).join("");
  }

  /* ---------- filter ---------- */
  const fInput = $("dxkFilter"), fClear = $("dxkClear"), fChip = $("dxkChip"), fType = $("dxkType");
  function applyFilter(v) {
    state.filter = (v || "").trim();
    fClear.hidden = !state.filter;
    fChip.hidden = !state.filter;
    if (state.filter) fChip.innerHTML = `Cards scoped to <b>${state.filterType} ${state.filter}</b> <button id="dxkChipClear">Clear ✕</button>`;
    render();
  }
  fType.addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    state.filterType = b.dataset.t;
    [...fType.children].forEach((x) => x.classList.toggle("active", x === b));
    fInput.placeholder = "Search " + state.filterType + "…";
    if (state.filter) applyFilter(fInput.value);
  });
  fInput.addEventListener("keydown", (e) => { if (e.key === "Enter") applyFilter(fInput.value); });
  fInput.addEventListener("input", (e) => { if (e.target.value.trim() === "" && state.filter) applyFilter(""); });
  fClear.addEventListener("click", () => { fInput.value = ""; applyFilter(""); });
  fChip.addEventListener("click", (e) => { if (e.target.id === "dxkChipClear") { fInput.value = ""; applyFilter(""); } });

  /* ---------- hover: this week vs same week LY ---------- */
  function hideTip() { tip.style.display = "none"; ROOT.querySelectorAll(".trendsvg .hl,.trendsvg .ha,.trendsvg .hly").forEach((el) => (el.style.display = "none")); }
  function onTrendMove(e) {
    const plot = e.target.closest(".trend-plot"); if (!plot) { hideTip(); return; }
    const k = kpiByKey(plot.dataset.kpi); if (!k || !k.act) { hideTip(); return; }
    const sOf = seriesOf(k), act = sOf.act, ly = sOf.ly, n = act.length;
    const rect = plot.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const i = Math.round(frac * (n - 1));
    const H = +plot.dataset.h, W = 240, pT = 4, pB = 4, pL = 2, pR = 2;
    const all = act.concat(ly), mn = Math.min(...all), mx = Math.max(...all), rg = (mx - mn) || 1;
    const xs = (j) => pL + j / (n - 1) * (W - pL - pR), ys = (v) => H - pB - (v - mn) / rg * (H - pT - pB);
    ROOT.querySelectorAll(".trendsvg .hl,.trendsvg .ha,.trendsvg .hly").forEach((el) => (el.style.display = "none"));
    const svg = plot.querySelector("svg"), x = xs(i).toFixed(1);
    const hl = svg.querySelector(".hl"), ha = svg.querySelector(".ha"), hly = svg.querySelector(".hly");
    hl.setAttribute("x1", x); hl.setAttribute("x2", x); hl.style.display = "";
    ha.setAttribute("cx", x); ha.setAttribute("cy", ys(act[i]).toFixed(1)); ha.style.display = "";
    hly.setAttribute("cx", x); hly.setAttribute("cy", ys(ly[i]).toFixed(1)); hly.style.display = "";
    const a = act[i], l = ly[i], d = (a - l) / (l || 1) * 100;
    const col = k.primary ? k.accent : (k.neg ? "var(--red)" : "var(--green)");
    tip.innerHTML = `<b>W${i + 1} · this wk vs LY</b>` +
      `<span><i style="border-top-color:${col}"></i>This wk&nbsp; ${fmtHover(k, a)}</span>` +
      `<span><i class="ly"></i>LY&nbsp; ${fmtHover(k, l)}</span>` +
      `<span class="dl ${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}% vs LY</span>`;
    tip.style.display = "block";
    let lx = e.clientX + 14; if (lx + 150 > window.innerWidth) lx = e.clientX - 160;
    tip.style.left = lx + "px"; tip.style.top = (e.clientY + 14) + "px";
  }
  ["dxkPrimary", "dxkSecondary"].forEach((id) => { const g = $(id); g.addEventListener("mousemove", onTrendMove); g.addEventListener("mouseleave", hideTip); });

  window.MyDeskKPI = { load(kpis) { if (Array.isArray(kpis)) { KPIS.length = 0; kpis.forEach((k) => KPIS.push(k)); KPIS.forEach((k) => { if (!k.accent) k.accent = ICDEF; if (k.base != null) { k.act = SMOOTH(series(k.key + "a", N, k.base, k.vol, k.drift, k.bump)); k.ly = SMOOTH(series(k.key + "l", N, k.base * 1.01, k.vol * 0.8, k.drift * 0.6, k.bump ? { at: k.bump.at, amp: k.bump.amp * 0.8 } : null)); } }); render(); } } };

  render();
})();
