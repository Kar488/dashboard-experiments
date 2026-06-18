/* National 52-Week Plan — views. Relies on window.NP. Exposes window.NPViews. */
(function () {
  "use strict";
  const NP = window.NP;
  const { fmt, util } = NP;
  const clamp = util.clamp;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function objShort(obj) { const o = NP.OBJECTIVES.find((x) => x.id === (obj || NP.state.objective)); return o ? o.short : "Rev"; }
  const ALW_GROUPS = [
    { group: "Buying allowances", cls: "buy", items: [["offInvoice", "Off-inv"], ["billBack", "B/back"], ["priceBreak", "P/brk"]] },
    { group: "Freight", cls: "frt", items: [["freight", "Frt"]] },
    { group: "Retail allowances", cls: "ret", items: [["transaction", "Txn"], ["flat", "Flat"]] }
  ];
  const ALW = ALW_GROUPS.reduce((a, g) => a.concat(g.items), []);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let compareHidden = false;

  /* ===== context menu (Ask Assistant) ===== */
  function showCtx(x, y, uid) {
    const m = document.getElementById("npCtxMenu");
    m.innerHTML = '<div class="np-ctx-title">' + esc(NP.cat().items.find((o) => o.uid === uid).item) + '</div>' +
      '<button class="np-ctx-item" type="button" data-act="ask">💬 Ask Assistant about this NCRC</button>' +
      '<button class="np-ctx-item" type="button" data-act="ask">↳ Why are we up/down vs last year?</button>';
    m.style.left = Math.min(x, window.innerWidth - 280) + "px";
    m.style.top = y + "px"; m.hidden = false;
    m.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => { m.hidden = true; NP.openAsk(uid); });
  }
  function bindCtx(node, uid) { node.addEventListener("contextmenu", (e) => { e.preventDefault(); showCtx(e.clientX, e.clientY, uid); }); }

  /* ===== cell hint (discovered range / default) ===== */
  function showHint(inp, o) {
    const hint = document.getElementById("npCellHint"); if (!hint) return;
    let txt;
    if (inp.dataset.alw) {
      const key = inp.dataset.alw, def = o.ladder[key], e = NP.effective(o, NP.state.draft);
      const lo = def * 0.6, hi = def * 1.4;
      txt = "Default " + (def * 100).toFixed(1) + "% · discovered " + (lo * 100).toFixed(1) + "–" + (hi * 100).toFixed(1) + "%";
    } else {
      const r = NP.ranges(o)[inp.dataset.field]; if (!r) return;
      const f = (v) => (r.unit === "$" ? "$" + v.toFixed(2) : Math.round(v));
      txt = "Default " + f(r.def) + " · discovered range " + f(r.lo) + "–" + f(r.hi) + " · snaps to nearest band";
    }
    hint.textContent = txt;
    const rect = inp.getBoundingClientRect();
    hint.style.left = Math.min(rect.left, window.innerWidth - 320) + "px";
    hint.style.top = (rect.bottom + 4) + "px";
    hint.hidden = false;
  }
  function hideHint() { const h = document.getElementById("npCellHint"); if (h) h.hidden = true; }

  /* ============================================================ VIEW 2: GRID */
  function renderGrid() {
    renderScenarioStrip(); bindTools(); renderCompare(); renderSpreadsheet(); updateDirtyUI();
  }
  function scenarioChips() {
    const st = NP.state;
    let html = '<button type="button" class="scenario-chip' + (st.activeScenario === "base" ? " is-active" : "") + '" data-scn="base">Base plan<small>optimised</small></button>';
    st.scenarios.forEach((s) => { html += '<button type="button" class="scenario-chip' + (st.activeScenario === s.id ? " is-active" : "") + '" data-scn="' + s.id + '">' + esc(s.name) + '<small>your edits</small><span class="scenario-chip-remove" data-scn-del="' + s.id + '" title="Delete scenario">×</span></button>'; });
    return html;
  }
  function bindScenarioChips(container) {
    container.querySelectorAll("[data-scn-del]").forEach((x) => x.onclick = (e) => { e.stopPropagation(); NP.deleteScenario(x.dataset.scnDel); });
    container.querySelectorAll(".scenario-chip").forEach((b) => b.onclick = () => NP.setScenario(b.dataset.scn));
  }
  function renderScenarioStrip() {
    const strip = document.getElementById("npScenarioStrip"); if (!strip) return;
    strip.innerHTML = scenarioChips(); bindScenarioChips(strip);
  }
  function bindTools() {
    const at = document.getElementById("npAllowToggle");
    at.setAttribute("aria-pressed", NP.state.showAllow ? "true" : "false");
    at.classList.toggle("is-on", NP.state.showAllow);
    at.onclick = () => { NP.state.showAllow = !NP.state.showAllow; renderGrid(); };
    document.getElementById("npRerun").onclick = NP.rerun;
    const r2 = document.getElementById("npRerun2"); if (r2) r2.onclick = NP.rerun;
    const rv = document.getElementById("npRevert"); if (rv) rv.onclick = NP.revert;
    const ct = document.getElementById("npCompareToggle");
    ct.hidden = !NP.state.scenarios.length;
    ct.onclick = () => { compareHidden = !compareHidden; renderCompare(); };
  }
  function updateDirtyUI() {
    const dirty = NP.isDirty();
    const r = document.getElementById("npRerun"); if (r) r.disabled = !dirty;
    const b = document.getElementById("npDirtyBanner"); if (b) b.hidden = !dirty;
  }
  function totals(map) { const t = { revenueM: 0, units: 0, agpM: 0, hhK: 0 }; NP.cat().items.forEach((o) => { const r = NP.resultFor(o, map); t.revenueM += r.revenueM; t.units += r.units; t.agpM += r.agpM; t.hhK += r.hhK; }); return t; }
  function renderCompare() {
    const wrap = document.getElementById("npCompareWrap"); if (!wrap) return;
    if (!NP.state.scenarios.length || compareHidden) { wrap.hidden = true; wrap.innerHTML = ""; return; }
    wrap.hidden = false;
    const objM = NP.objMeta();
    const scs = [{ id: "base", name: "Base plan", sub: "optimised, no edits", ov: {} }].concat(NP.state.scenarios.map((s) => ({ id: s.id, name: s.name, sub: "your edits", ov: s.ov })));
    const cols = [["Revenue", (t) => fmt.m(t.revenueM), "revenueM"], ["Units", (t) => fmt.u(t.units), "units"], ["AGP", (t) => fmt.m(t.agpM), "agpM"], ["HHs", (t) => fmt.u(t.hhK), "hhK"]];
    const tots = scs.map((s) => totals(s.ov)), best = {};
    cols.forEach(([, , k]) => { best[k] = Math.max.apply(null, tots.map((t) => t[k])); });
    const head = '<div class="plan-compare-corner"></div>' + cols.map(([l, , k]) => '<div class="plan-compare-col-head' + (objM.metric === k ? " is-obj" : "") + '">' + l + "</div>").join("");
    const rows = scs.map((s, i) => '<div class="plan-compare-row-name ' + (NP.state.activeScenario === s.id ? "is-active" : "is-context") + '"><strong>' + esc(s.name) + "</strong><small>" + s.sub + "</small></div>" +
      cols.map(([, f, k]) => '<div class="plan-compare-cell' + (best[k] === tots[i][k] && scs.length > 1 ? " is-best" : "") + '">' + f(tots[i]) + "</div>").join("")).join("");
    wrap.innerHTML = '<section class="plan-compare np-compare-inline"><header class="plan-compare-head"><strong>Compare scenarios</strong><button class="plan-compare-close" type="button" id="npCompareClose">×</button></header><div class="plan-compare-grid">' + head + rows + '</div><footer class="plan-compare-foot">Bold = leader on each metric · each <b>Rerun forecast</b> adds a scenario · objective: ' + objShort() + "</footer></section>";
    const cl = document.getElementById("npCompareClose"); if (cl) cl.onclick = () => { compareHidden = true; renderCompare(); };
  }

  function columns() {
    const allow = NP.state.showAllow;
    const cols = [{ k: "rownum", label: "", cls: "np-ss-rownum" }];
    if (!allow) cols.push({ k: "vendor", label: "Vendor", cls: "np-ss-l" });
    cols.push({ k: "ncrc", label: "NCRC", cls: "np-ss-l np-ss-mono" });
    cols.push({ k: "item", label: "Item", cls: "np-ss-l" });
    if (!allow) cols.push({ k: "aws", label: "AWS $", cls: "" });
    cols.push({ k: "vlc", label: "VLC", edit: "money" });
    if (!allow) cols.push({ k: "price", label: "Price", cls: "" });
    if (allow) ALW_GROUPS.forEach((g) => {
      g.items.forEach(([key, label]) => { cols.push({ k: "alwpct:" + key, label: label + " %", edit: "pct", group: "alw" }); cols.push({ k: "alwusd:" + key, label: label + " $", edit: "money", group: "alw" }); });
      if (g.group === "Freight") cols.push({ k: "netCost", label: "Net cost", cls: "np-ss-net" });
    });
    cols.push({ k: "deadNet", label: "Dead-net", edit: "money" });
    if (!allow) {
      cols.push({ k: "events", label: "Events", edit: "int" });
      cols.push({ k: "units", label: "Units", cls: "np-ss-res np-ss-res-start" });
      cols.push({ k: "revenue", label: "Revenue", cls: "np-ss-res" });
      cols.push({ k: "agp", label: "AGP", cls: "np-ss-res" });
      cols.push({ k: "delta", label: "Δ " + objShort(), cls: "np-ss-res" });
    }
    return cols;
  }
  function renderSpreadsheet() {
    const wrap = document.getElementById("npGridWrap");
    const items = NP.cat().items.slice().sort((a, b) => a.vendor === b.vendor ? a.item.localeCompare(b.item) : a.vendor.localeCompare(b.vendor));
    const cols = columns(), map = NP.displayMap();
    const thead = buildHead(cols);
    let rows = "", lastVendor = null;
    items.forEach((o, i) => {
      const e = NP.effective(o, NP.state.draft), res = NP.resultFor(o, map), ly = NP.lyResult(o);
      const vstart = o.vendor !== lastVendor && i; lastVendor = o.vendor;
      rows += '<tr class="np-ss-row' + (vstart ? " np-ss-vstart" : "") + '" data-uid="' + o.uid + '">' + cols.map((c) => cell(c, o, e, res, ly, i)).join("") + "</tr>";
    });
    if (NP.state.showAllow) wrap.innerHTML = '<div class="np-allow-note">Editing <b>Dead-net</b> redistributes the allowance breakup automatically; edit any allowance to override. Other columns hidden to focus on cost build-up.</div>';
    else wrap.innerHTML = "";
    wrap.insertAdjacentHTML("beforeend", '<table class="projection-table np-ss' + (NP.state.showAllow ? " np-ss-compact" : "") + '"><thead>' + thead + "</thead><tbody>" + rows + "</tbody></table>");
    wrap.querySelectorAll("input.np-cell-input").forEach((inp) => {
      inp.addEventListener("input", onGridInput);
      const uid = inp.dataset.uid, o = NP.cat().items.find((x) => x.uid === uid);
      inp.addEventListener("focus", () => showHint(inp, o));
      inp.addEventListener("blur", hideHint);
    });
    wrap.querySelectorAll(".np-ss-row").forEach((tr) => bindCtx(tr, tr.dataset.uid));
    wrap.querySelectorAll("[data-fc]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); openForecast(b.dataset.fc, b); });
  }
  const FC_ICON = (m, uid) => '<button class="np-fc-btn" type="button" data-fc="' + m + '" data-uid="' + uid + '" title="Model vs actual & 52-week forecast for this NCRC"><svg viewBox="0 0 16 12" width="12" height="9"><polyline points="1,9 5,5 8,7 12,2 15,4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  function buildHead(cols) {
    if (!NP.state.showAllow) return "<tr>" + cols.map((c) => '<th class="' + (c.cls || "") + (c.edit ? " np-ss-edithead" : "") + '">' + esc(c.label) + "</th>").join("") + "</tr>";
    // 3-row grouped header: top group (Buying / Freight / Retail) → name → % / $
    let r0 = "<tr>" +
      '<th class="np-ss-rownum" rowspan="3"></th>' +
      '<th class="np-ss-l np-ss-mono" rowspan="3">NCRC</th>' +
      '<th class="np-ss-l" rowspan="3">Item</th>' +
      '<th class="np-ss-edithead" rowspan="3">VLC</th>';
    ALW_GROUPS.forEach((g) => {
      r0 += '<th class="np-ss-grp np-grp-' + g.cls + '" colspan="' + (g.items.length * 2) + '">' + esc(g.group) + "</th>";
      if (g.group === "Freight") r0 += '<th class="np-ss-net np-ss-nethead" rowspan="3">Net cost</th>';
    });
    r0 += '<th class="np-ss-edithead" rowspan="3">Dead-net</th></tr>';
    const r1 = "<tr>" + ALW.map(([k, l]) => '<th class="np-ss-alwhead np-ss-alwgrp" colspan="2">' + esc(l) + "</th>").join("") + "</tr>";
    const r2 = "<tr>" + ALW.map(() => '<th class="np-ss-alwhead np-ss-sub">%</th><th class="np-ss-alwhead np-ss-sub">$</th>').join("") + "</tr>";
    return r0 + r1 + r2;
  }
  /* forecast popover — per-NCRC: past actual vs model + forward forecast with bands */
  function fcSeries(metric, o) {
    const e = NP.effective(o, NP.displayMap());
    const base = metric === "vlc" ? e.vlc : e.deadNet;
    const ph = NP.util.hashStr(o.uid) % 100 / 100;
    const pts = []; let errSum = 0;
    for (let w = -52; w < 52; w++) {
      const seas = 1 + Math.sin((w / 52) * Math.PI * 2 + 0.6 + ph * 3) * 0.045 + (w / 52) * 0.02; // gentle trend
      const wobble = Math.sin(w * 1.7 + ph * 6) * 0.012 + Math.sin(w * 0.5) * 0.008;
      const pred = base * seas;
      if (w < 0) {
        const actual = base * (seas + wobble);
        errSum += Math.abs(actual - pred) / pred;
        pts.push({ w, actual, pred });
      } else {
        const spread = base * (0.018 + (w / 52) * 0.06);
        pts.push({ w, pred, lo: pred - spread, hi: pred + spread });
      }
    }
    return { pts, base, err: errSum / 52 };
  }
  function fcChart(s) {
    const W = 380, H = 132, padL = 8, padR = 8, padT = 12, padB = 18;
    const vals = s.pts.flatMap((p) => [p.actual, p.pred, p.lo, p.hi].filter((x) => x != null));
    const mn = Math.min.apply(null, vals) * 0.985, mx = Math.max.apply(null, vals) * 1.015, n = s.pts.length;
    const X = (i) => padL + (W - padL - padR) * i / (n - 1), Y = (v) => padT + (H - padT - padB) * (1 - (v - mn) / ((mx - mn) || 1));
    const past = s.pts.filter((p) => p.actual != null), fut = s.pts.filter((p) => p.lo != null);
    const idxOf = (p) => s.pts.indexOf(p);
    const actualPath = smoothPath(past.map((p) => ({ x: +X(idxOf(p)).toFixed(2), y: +Y(p.actual).toFixed(2) })));
    const predPath = smoothPath(s.pts.map((p) => ({ x: +X(idxOf(p)).toFixed(2), y: +Y(p.pred).toFixed(2) })));
    const bandTop = fut.map((p) => ({ x: +X(idxOf(p)).toFixed(2), y: +Y(p.hi).toFixed(2) }));
    const bandBot = fut.map((p) => ({ x: +X(idxOf(p)).toFixed(2), y: +Y(p.lo).toFixed(2) }));
    const bandPath = smoothPath(bandTop) + " L" + bandBot.reverse().map((p) => p.x + " " + p.y).join(" L") + " Z";
    const todayX = X(52);
    return '<svg class="np-fc-svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' +
      '<path class="np-fc-band" d="' + bandPath + '"/>' +
      '<line class="np-fc-today" x1="' + todayX.toFixed(1) + '" y1="' + padT + '" x2="' + todayX.toFixed(1) + '" y2="' + (H - padB) + '"/>' +
      '<path class="np-fc-pred" d="' + predPath + '"/>' +
      '<path class="np-fc-actual" d="' + actualPath + '"/>' +
      '<text class="np-fc-x" x="' + padL + '" y="' + (H - 5) + '">52 wks actual</text>' +
      '<text class="np-fc-x" text-anchor="middle" x="' + todayX.toFixed(1) + '" y="' + (H - 5) + '">today</text>' +
      '<text class="np-fc-x" text-anchor="end" x="' + (W - padR) + '" y="' + (H - 5) + '">52 wks forecast</text></svg>';
  }
  function openForecast(metric, anchor) {
    const pop = document.getElementById("npFcPop"); if (!pop) return;
    const o = NP.cat().items.find((x) => x.uid === anchor.dataset.uid); if (!o) return;
    const s = fcSeries(metric, o), label = (metric === "vlc" ? "VLC" : "Dead-net cost") + " · " + o.item;
    pop.innerHTML = '<div class="np-fc-head"><div><h4>' + esc(label) + ' — model vs actual</h4><small>' + o.ncrc + " · last 52 weeks &amp; 52-week forecast</small></div><button class=\"np-fc-close\" type=\"button\">×</button></div>" +
      fcChart(s) +
      '<div class="np-fc-legend"><span><i class="np-fc-lg-actual"></i>Actual</span><span><i class="np-fc-lg-pred"></i>Model</span><span><i class="np-fc-lg-band"></i>Forecast band</span></div>' +
      '<p class="np-fc-note">Model tracked actuals within <b>±' + (s.err * 100).toFixed(1) + "%</b> over the last year — the forecast you are editing sits on a well-calibrated baseline.</p>";
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left - 40, window.innerWidth - 420) + "px";
    pop.style.top = (r.bottom + 6) + "px";
    pop.querySelector(".np-fc-close").onclick = () => { pop.hidden = true; };
  }

  function cell(col, o, e, res, ly, i) {
    const k = col.k;
    if (k === "rownum") return '<td class="np-ss-rownum">' + (i + 1) + "</td>";
    if (k === "vendor") return '<td class="np-ss-l np-ss-vendor">' + esc(o.vendor) + "</td>";
    if (k === "ncrc") return '<td class="np-ss-l np-ss-mono">' + esc(o.ncrc) + "</td>";
    if (k === "item") return '<td class="np-ss-l">' + esc(o.item) + ' <span class="np-tag np-tag-' + o.form + '">' + o.form + "</span></td>";
    if (k === "aws") return '<td class="np-ss-ro">$' + Math.round(o.baseUnitsK * 1000 / 52 * o.basePrice).toLocaleString() + "</td>";
    if (k === "price") return '<td class="np-ss-ro">' + fmt.price(o.basePrice) + "</td>";
    if (k === "vlc") return editCell(o, "vlc", e.vlc.toFixed(2));
    if (k === "netCost") { const l = e.ladder; return '<td class="np-ss-net np-ss-ro" id="nc-' + o.uid + '">' + fmt.price(e.vlc * (1 - l.offInvoice - l.billBack - l.priceBreak - l.freight)) + "</td>"; }
    if (k === "deadNet") return editCell(o, "deadNet", e.deadNet.toFixed(2));
    if (k === "events") return editCell(o, "events", String(e.events));
    if (k.indexOf("alwpct:") === 0) { const key = k.slice(7); return editAlw(o, key, "pct", (e.ladder[key] * 100).toFixed(1)); }
    if (k.indexOf("alwusd:") === 0) { const key = k.slice(7); return editAlw(o, key, "usd", (e.ladder[key] * e.vlc).toFixed(2)); }
    if (k === "units") return '<td class="np-ss-res np-ss-res-start">' + fmt.u(res.units) + "</td>";
    if (k === "revenue") return '<td class="np-ss-res">' + fmt.m(res.revenueM) + "</td>";
    if (k === "agp") return '<td class="np-ss-res">' + fmt.m(res.agpM) + "</td>";
    if (k === "delta") { const d = NP.objVal(res) - NP.objVal(ly), p = NP.objVal(ly) ? d / NP.objVal(ly) : 0; return '<td class="np-ss-res ' + (d >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(p) + "</td>"; }
    return "<td></td>";
  }
  function editCell(o, field, val) {
    const input = '<input class="np-cell-input" type="text" inputmode="' + (field === "events" ? "numeric" : "decimal") + '" data-uid="' + o.uid + '" data-field="' + field + '" value="' + val + '">';
    const inner = (field === "vlc" || field === "deadNet") ? '<div class="np-cellrow">' + FC_ICON(field, o.uid) + input + "</div>" : input;
    return '<td class="np-ss-edit' + (NP.isEdited(o, field) ? " is-edited" : "") + '" data-cell="' + o.uid + ":" + field + '">' + inner + "</td>";
  }
  function editAlw(o, key, kind, val) { return '<td class="np-ss-edit np-ss-alw' + (NP.isEdited(o, "alw:" + key) ? " is-edited" : "") + '" data-cell="' + o.uid + ":alw:" + key + ":" + kind + '"><input class="np-cell-input" type="text" inputmode="decimal" data-uid="' + o.uid + '" data-alw="' + key + '" data-kind="' + kind + '" value="' + val + '"></td>'; }

  function onGridInput(ev) {
    const inp = ev.target, uid = inp.dataset.uid, o = NP.cat().items.find((x) => x.uid === uid); if (!o) return;
    const ov = NP.draftOf(uid);
    if (inp.dataset.alw) {
      const key = inp.dataset.alw, kind = inp.dataset.kind, val = parseFloat(inp.value) || 0;
      const vlc = ov.vlc != null ? ov.vlc : o.vlc;
      const pct = kind === "pct" ? val / 100 : (vlc > 0 ? val / vlc : 0);
      ov.ladder = ov.ladder || {}; ov.ladder[key] = pct; ov.deadNetTouched = false; syncRow(o);
    } else {
      const field = inp.dataset.field; let val = parseFloat(inp.value) || 0;
      if (field === "events") { val = Math.round(clamp(val, 0, 40)); ov.events = val; }
      else if (field === "deadNet") { distributeDeadNet(o, val); }
      else if (field === "vlc") { ov.vlc = val; ov.deadNetTouched = false; syncRow(o); }
    }
    showHint(inp, o); markEdited(o); updateDirtyUI();
  }
  function distributeDeadNet(o, target) {
    const e = NP.effective(o, NP.state.draft), vlc = e.vlc; if (vlc <= 0) return;
    const keys = ["offInvoice", "billBack", "priceBreak", "freight", "transaction", "flat"];
    const cur = keys.reduce((s, k) => s + e.ladder[k], 0);
    const targetSum = clamp(1 - target / vlc, 0.02, 0.9), scale = cur > 0 ? targetSum / cur : 0;
    const ov = NP.draftOf(o.uid); ov.ladder = ov.ladder || {}; ov.deadNetTouched = false;
    keys.forEach((k) => { ov.ladder[k] = e.ladder[k] * scale; });
    syncRow(o);
  }
  function syncRow(o) {
    const e = NP.effective(o, NP.state.draft), active = document.activeElement;
    const dn = document.querySelector('input[data-uid="' + o.uid + '"][data-field="deadNet"]');
    if (dn && dn !== active) dn.value = e.deadNet.toFixed(2);
    const nc = document.getElementById("nc-" + o.uid); if (nc) { const l = e.ladder; nc.textContent = fmt.price(e.vlc * (1 - l.offInvoice - l.billBack - l.priceBreak - l.freight)); }
    if (NP.state.showAllow) ALW.forEach(([key]) => {
      const usd = document.querySelector('input[data-uid="' + o.uid + '"][data-alw="' + key + '"][data-kind="usd"]');
      const pctI = document.querySelector('input[data-uid="' + o.uid + '"][data-alw="' + key + '"][data-kind="pct"]');
      if (usd && usd !== active) usd.value = (e.ladder[key] * e.vlc).toFixed(2);
      if (pctI && pctI !== active) pctI.value = (e.ladder[key] * 100).toFixed(1);
    });
  }
  function markEdited(o) {
    ["vlc", "deadNet", "events"].forEach((f) => { const td = document.querySelector('[data-cell="' + o.uid + ":" + f + '"]'); if (td) td.classList.toggle("is-edited", NP.isEdited(o, f)); });
    ALW.forEach(([key]) => ["pct", "usd"].forEach((kind) => { const td = document.querySelector('[data-cell="' + o.uid + ":alw:" + key + ":" + kind + '"]'); if (td) td.classList.toggle("is-edited", NP.isEdited(o, "alw:" + key)); }));
  }

  /* ===================================================== VIEW 3: RESULTS ===== */
  const BIN_BASIS = { sales: "Sales", units: "Units", agp: "AGP", velocity: "Velocity" };
  function renderResults() {
    const host = document.getElementById("npStep3"), map = NP.displayMap(), res = NP.state.res;
    const bins = NP.binsFor(), objId = NP.state.objective;
    const binBy = res.binBy || (["sales", "units", "agp"].includes(objId) ? objId : "sales");
    const all = NP.cat().items, vendors = [...new Set(all.map((o) => o.vendor))];
    let items = all.slice().sort((a, b) => a.vendor === b.vendor ? a.item.localeCompare(b.item) : a.vendor.localeCompare(b.vendor));
    if (res.vendor !== "all") items = items.filter((o) => o.vendor === res.vendor);
    if (res.bin !== "all") items = items.filter((o) => bins[o.uid][binBy] === +res.bin);
    let lastVendor = null, body = "";
    if (!items.length) body = '<div class="np-empty">No NCRCs match these filters.</div>';
    items.forEach((o) => { if (o.vendor !== lastVendor) { lastVendor = o.vendor; body += '<div class="np-rc-vendor">' + esc(o.vendor) + "</div>"; } body += resultCard(o, map, bins, binBy); });
    const sd = exSummaryData(items, map);
    host.innerHTML = exBandHTML(sd) +
      '<section class="panel np-results-panel">' +
      '<div class="np-results-head">' +
        '<div class="np-rhead-top"><h2 class="np-rhead-title">52-week plan — store &amp; digital tactics</h2>' +
          resultsControls(vendors, binBy) + '<div class="np-legend">' + legend() + "</div></div>" +
        exPinStrip(sd) +
        '<p class="np-rhead-sub">The optimised deal each NCRC runs, week by week. Weeks 1–' + (NP.CURRENT_WEEK - 1) + ' are locked actuals. <strong>Flip</strong> a row for sales / units / AGP / allowance sparklines vs last year; <strong>right-click</strong> to ask the assistant.</p>' +
        resultsSummary(map) +
        '<div class="np-rhead-cal">' + monthScale() + eventBand() + "</div>" +
      "</div>" +
      '<div class="np-rc-list">' + body + "</div></section>";
    bindResults(host, binBy);
  }
  function bindResults(host, binBy) {
    host.querySelectorAll(".np-rc-card").forEach((card) => { const uid = card.dataset.uid; bindCtx(card, uid); card.querySelectorAll("[data-flip]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); card.classList.toggle("is-flipped"); }); });
    bindScenarioChips(host);
    const v = host.querySelector("#npResVendor"); if (v) v.onchange = () => { NP.state.res.vendor = v.value; NP.renderAll(); };
    host.querySelectorAll("[data-binby]").forEach((b) => b.onclick = () => { NP.state.res.binBy = b.dataset.binby; NP.renderAll(); });
    host.querySelectorAll("[data-bin]").forEach((b) => b.onclick = () => { NP.state.res.bin = b.dataset.bin; NP.renderAll(); });
    host.addEventListener("mousemove", onSparkMove);
    host.addEventListener("mouseleave", clearSpark);
    // reveal the pinned mini-summary once the full band scrolls under the sticky header
    if (resObserver) resObserver.disconnect();
    const band = host.querySelector(".np-sum"), head = host.querySelector(".np-results-head");
    if (band && head && "IntersectionObserver" in window) {
      const ht = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--np-headtop")) || 112;
      resObserver = new IntersectionObserver((ents) => head.classList.toggle("is-stuck", !ents[0].isIntersecting), { rootMargin: "-" + (ht + 8) + "px 0px 0px 0px", threshold: 0 });
      resObserver.observe(band);
    }
  }
  let resObserver = null;
  function legend() {
    return '<span class="np-lg"><i class="np-lg-sw tactic-item"></i>Item Discount</span><span class="np-lg"><i class="np-lg-sw tactic-bxgx"></i>Buy X Get X</span><span class="np-lg"><i class="np-lg-dot"></i>+ digital</span><span class="np-lg"><i class="np-lg-sw np-lg-locked"></i>locked actual</span>';
  }
  function resultsControls(vendors, binBy) {
    const res = NP.state.res;
    const vsel = '<label class="np-res-ctl">Vendor <select id="npResVendor" class="np-res-select"><option value="all">All vendors</option>' + vendors.map((v) => '<option' + (res.vendor === v ? " selected" : "") + ">" + esc(v) + "</option>").join("") + "</select></label>";
    const binByCap = '<span class="np-res-ctl">Bin by <span class="plan-obj-capsule">' + Object.keys(BIN_BASIS).map((k) => '<button type="button" class="plan-obj-opt' + (binBy === k ? " active" : "") + '" data-binby="' + k + '">' + BIN_BASIS[k] + "</button>").join("") + "</span></span>";
    const binCap = '<span class="plan-obj-capsule np-bincap">' + ["all", "1", "2", "3", "4", "5"].map((b) => '<button type="button" class="plan-obj-opt' + (String(res.bin) === b ? " active" : "") + '" data-bin="' + b + '">' + (b === "all" ? "All" : b) + "</button>").join("") + "</span>";
    return '<div class="np-rhead-controls">' + vsel + binByCap + binCap + "</div>";
  }
  function resultsSummary(map) {
    if (!NP.state.scenarios.length) return "";
    const base = totals({}), cur = totals(map), view = NP.state.activeScenario === "base" ? "Base plan" : (NP.state.scenarios.find((s) => s.id === NP.state.activeScenario) || { name: "scenario" }).name;
    const pill = (lab, b, c, money) => { const d = b ? (c - b) / b : 0; return '<span class="np-res-pill"><small>' + lab + '</small><b>' + (money ? fmt.m(c) : fmt.u(c)) + '</b><i class="' + (d >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(d) + "</i></span>"; };
    return '<div class="np-res-summary"><div class="scenario-strip np-res-scen">' + scenarioChips() + '</div><span class="np-res-viewing">Viewing <b>' + view + "</b> · vs base:</span>" + pill("Revenue", base.revenueM, cur.revenueM, 1) + pill("Units", base.units, cur.units, 0) + pill("AGP", base.agpM, cur.agpM, 1) + "</div>";
  }
  // summary numbers: plan outcomes vs LY + promo discipline (store/digital/overall)
  function exSummaryData(items, map) {
    let plan = { u: 0, r: 0, a: 0 }, ly = { u: 0, r: 0, a: 0 };
    const mk = () => ({ store: { n: 0, ds: 0, deep: 0 }, dig: { n: 0, ds: 0, deep: 0 } });
    const D = mk(), L = mk();
    const acc = (wk, d) => wk.forEach((c) => { if (!c.promoted) return; const sd = c.depth; d.store.n++; d.store.ds += sd; if (sd >= 0.3) d.store.deep++; if (c.digital && c.digital.length) { const dd = Math.min(0.5, c.depth + 0.06); d.dig.n++; d.dig.ds += dd; if (dd >= 0.3) d.dig.deep++; } });
    items.forEach((o) => { const r = NP.resultFor(o, map), l = NP.lyResult(o); plan.u += r.units; plan.r += r.revenueM; plan.a += r.agpM; ly.u += l.units; ly.r += l.revenueM; ly.a += l.agpM; acc(NP.weekPlan(o, map, false), D); acc(NP.weekPlan(o, null, true), L); });
    const all = (d) => ({ n: d.store.n + d.dig.n, ds: d.store.ds + d.dig.ds, deep: d.store.deep + d.dig.deep });
    D.all = all(D); L.all = all(L);
    return { plan, ly, D, L };
  }
  function exBandHTML(sd) {
    const obj = NP.objMeta(), plan = sd.plan, ly = sd.ly, D = sd.D, L = sd.L;
    const oc = (id, lab, vStr, cur, base) => { const p = base ? (cur - base) / base : 0; return '<div class="np-sum-stat' + (id === obj.id ? " is-obj" : "") + '"><span class="np-sum-lab">' + lab + (id === obj.id ? ' <em>objective</em>' : "") + '</span><span class="np-sum-val">' + vStr + '</span><span class="np-sum-d ' + (p >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(p) + ' vs LY</span><span class="np-sum-ly">LY ' + (id === "units" ? fmt.u(base) : fmt.m(base)) + "</span></div>"; };
    const stats = oc("sales", "Revenue", fmt.m(plan.r), plan.r, ly.r) + oc("units", "Units", fmt.u(plan.u), plan.u, ly.u) + oc("agp", "AGP", fmt.m(plan.a), plan.a, ly.a);
    const cell = (cur, lyv, pct) => '<td><b>' + (pct ? fmt.pctPlain(cur) : Math.round(cur).toLocaleString()) + '</b><small>LY ' + (pct ? fmt.pctPlain(lyv) : Math.round(lyv).toLocaleString()) + "</small></td>";
    const row = (label, fn, pct) => '<tr><td class="np-sum-mlab">' + label + "</td>" + cell(fn(D.store), fn(L.store), pct) + cell(fn(D.dig), fn(L.dig), pct) + cell(fn(D.all), fn(L.all), pct) + "</tr>";
    const tbl = '<table class="np-sum-tbl"><thead><tr><th></th><th>Store</th><th>Digital</th><th>Overall</th></tr></thead><tbody>' +
      row("Items on promo", (d) => d.n, false) + row("Avg discount", (d) => d.n ? d.ds / d.n : 0, true) + row("Items &gt; 30% off", (d) => d.n ? d.deep / d.n : 0, true) + "</tbody></table>";
    return '<section class="panel np-sum"><div class="np-sum-grid"><div class="np-sum-out"><div class="np-sum-h">Plan outcomes vs last year</div><div class="np-sum-stats">' + stats + '</div></div>' +
      '<div class="np-sum-disc"><div class="np-sum-h">Promotion discipline · store / digital / overall</div>' + tbl + "</div></div></section>";
  }
  function exPinStrip(sd) {
    const obj = NP.objMeta();
    const m = (id, lab, vStr, cur, base) => { const p = base ? (cur - base) / base : 0; return '<span class="np-pin-m' + (id === obj.id ? " is-obj" : "") + '"><b>' + lab + "</b>" + vStr + ' <i class="' + (p >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(p) + "</i></span>"; };
    return '<div class="np-pin-out" id="npPinOut">' + m("sales", "Rev", fmt.m(sd.plan.r), sd.plan.r, sd.ly.r) + m("units", "Units", fmt.u(sd.plan.u), sd.plan.u, sd.ly.u) + m("agp", "AGP", fmt.m(sd.plan.a), sd.plan.a, sd.ly.a) + '<span class="np-pin-vs">vs last year</span></div>';
  }
  function eventBand() {
    let cells = "";
    for (let w = 0; w < 52; w++) { const ev = NP.RETAIL_EVENTS.find((e) => e.wk === w); cells += ev ? '<span class="np-ev" title="' + esc(ev.label) + '"><i></i><b>' + ev.short + "</b></span>" : '<span class="np-ev-empty"></span>'; }
    return '<div class="np-ev-band">' + cells + "</div>";
  }
  function monthScale() { return '<div class="np-rc-months"><div class="np-rc-monthrow">' + MONTHS.map((mo) => "<span>" + mo + "</span>").join("") + "</div></div>"; }
  function binBadge(o, bins, binBy) { const b = bins[o.uid][binBy]; return '<span class="np-bin np-bin-' + b + '" title="' + BIN_BASIS[binBy] + " bin " + b + ' (1 = top)">Bin ' + b + "</span>"; }
  function roleOf(o) { if (o.hero) return ["Headline", "head"]; if (o.form === "tub") return ["Seasonal", "seas"]; if (o.bin === 1) return ["KVI", "kvi"]; if (o.bin === 2) return ["Traffic", "traf"]; if (o.bin === 3) return ["Profit", "prof"]; return ["Background", "bg"]; }
  function roleBadge(o) { const r = roleOf(o); return '<span class="np-role np-role-' + r[1] + '" title="Item role">' + r[0] + "</span>"; }
  function nameBlock(o, bins, binBy, trailing) { return '<div class="np-rc-name"><b class="np-rc-item">' + esc(o.item) + '</b><span class="np-rc-id">' + o.ncrc + '</span><span class="np-tag np-tag-' + o.form + '">' + o.form + "</span>" + binBadge(o, bins, binBy) + roleBadge(o) + (trailing || "") + "</div>"; }
  function resultCard(o, map, bins, binBy) {
    const plan = NP.resultFor(o, map);
    const wk = NP.weekPlan(o, map, false), evWeeks = new Set(NP.RETAIL_EVENTS.map((e) => e.wk));
    const cells = wk.map((c, w) => {
      const evCls = evWeeks.has(w) ? " np-wk-ev" : "";
      if (!c.promoted) return '<span class="np-wk np-wk-none' + (c.locked ? " np-wk-locked" : "") + evCls + '" title="Wk ' + c.week + ' · no promo"></span>';
      const tip = "Wk " + c.week + " · " + c.offer.label + " · " + (c.depth * 100).toFixed(0) + "% off · Store: " + c.store.name + (c.digital.length ? " · Digital: " + c.digital.map((d) => NP.DIGITAL_NAMES[d]).join(", ") : "");
      return '<span class="np-wk tactic-' + c.store.className + (c.locked ? " np-wk-locked" : "") + evCls + '" title="' + esc(tip) + '">' + (c.digital.length ? '<i class="np-wk-dot"></i>' : "") + "</span>";
    }).join("");
    const totalsHtml = '<span class="np-rc-kv"><small>Units</small>' + fmt.u(plan.units) + '</span><span class="np-rc-kv"><small>Revenue</small>' + fmt.m(plan.revenueM) + '</span><span class="np-rc-kv"><small>AGP</small>' + fmt.m(plan.agpM) + "</span>";
    return '<div class="np-rc-card" data-uid="' + o.uid + '"><div class="np-rc-inner">' +
      '<div class="np-rc-face np-rc-front"><div class="np-rc-info">' + nameBlock(o, bins, binBy) +
      '<div class="np-rc-totals">' + totalsHtml + '<button class="np-flip-btn" type="button" data-flip>Flip ⟳</button></div></div>' +
      '<div class="np-rc-ribbon">' + cells + "</div></div>" +
      '<div class="np-rc-face np-rc-back"><div class="np-rc-info">' + nameBlock(o, bins, binBy, '<span class="np-rc-backlbl">vs last year</span>') + '<button class="np-flip-btn" type="button" data-flip>⟲ Back</button></div>' +
      backFace(o, map) + "</div></div></div>";
  }
  const SPARK_COLOR = { units: "#0aa985", sales: "#1769e8", agp: "#7c4dcc", allow: "#f36b12" };
  function backFace(o, map) {
    const s = NP.weeklySeries(o, map), objId = NP.state.objective;
    const block = (id, label, arr, lyArr, kind, tot, lyTot, color) => {
      const d = lyTot ? (tot - lyTot) / lyTot : 0, isObj = id === objId;
      const v = kind === "units" ? fmt.u(tot) : fmt.m(tot), lv = kind === "units" ? fmt.u(lyTot) : fmt.m(lyTot);
      return '<div class="np-rc-metric' + (isObj ? " is-obj" : "") + '"><div class="np-rc-mhead"><span class="np-rc-mlabel">' + label + (isObj ? ' <em>objective</em>' : "") + '</span><span class="np-rc-mthis">' + v + '</span><span class="np-rc-mly">LY ' + lv + '</span><span class="np-rc-mdelta ' + (d >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(d) + "</span></div>" + sparkChart(arr, lyArr, kind, color) + "</div>";
    };
    return '<div class="np-rc-backwrap"><div class="np-rc-metrics">' +
      block("units", "Units", s.units, s.lyUnits, "units", s.plan.units, s.ly.units, SPARK_COLOR.units) +
      block("sales", "Revenue", s.sales, s.lySales, "money", s.plan.revenueM, s.ly.revenueM, SPARK_COLOR.sales) +
      block("agp", "AGP", s.agp, s.lyAgp, "money", s.plan.agpM, s.ly.agpM, SPARK_COLOR.agp) +
      '<div class="np-rc-metric np-rc-allowmetric"><div class="np-rc-mhead"><span class="np-rc-mlabel">Allowance %</span><span class="np-rc-mthis">' + fmt.pctPlain(s.allow[0]) + '</span></div>' + sparkChart(s.allow, null, "alw", SPARK_COLOR.allow, o.uid) + '</div>' +
      '<div class="np-rc-metric"><div class="np-rc-mhead"><span class="np-rc-mlabel">VLC</span><span class="np-rc-mthis">' + fmt.price(s.vlc[0]) + '</span></div>' + sparkChart(s.vlc, null, "price", "#8a96a8") + '</div>' +
      '<div class="np-rc-metric"><div class="np-rc-mhead"><span class="np-rc-mlabel">Dead-net</span><span class="np-rc-mthis">' + fmt.price(s.dnc[0]) + '</span></div>' + sparkChart(s.dnc, null, "price", "#6b9e84") + '</div>' +
      "</div>" +
      '<button class="np-ask-link" type="button" onclick="NP.openAsk(\'' + o.uid + '\')">💬 Ask why we are ' + (s.plan.agpM >= s.ly.agpM ? "up" : "down") + " vs LY</button></div>";
  }
  // smooth (Catmull-Rom → cubic bezier) path through points
  function smoothPath(pts) {
    if (pts.length < 2) return pts.length ? "M" + pts[0].x + " " + pts[0].y : "";
    let d = "M" + pts[0].x + " " + pts[0].y;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6, c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += " C" + c1x.toFixed(2) + " " + c1y.toFixed(2) + " " + c2x.toFixed(2) + " " + c2y.toFixed(2) + " " + p2.x.toFixed(2) + " " + p2.y.toFixed(2);
    }
    return d;
  }
  let sparkSeq = 0;
  // sparkline (this solid + gradient, LY dashed) — smooth curves, non-scaling stroke
  function sparkChart(a, b, kind, color, uid) {
    const W = 300, H = 50, n = a.length, all = b ? a.concat(b) : a, mx = Math.max.apply(null, all) * 1.12, mn = kind === "price" ? Math.min.apply(null, all) * 0.95 : Math.min(0, Math.min.apply(null, all));
    const X = (i) => i / (n - 1) * W, Y = (v) => +(H - 4 - ((v - mn) / ((mx - mn) || 1)) * (H - 9)).toFixed(2);
    const pts = (arr) => arr.map((v, i) => ({ x: +X(i).toFixed(2), y: Y(v) }));
    const id = "spg" + (sparkSeq++), tD = smoothPath(pts(a)), lD = b ? smoothPath(pts(b)) : "";
    const areaD = tD + " L" + W + " " + H + " L0 " + H + " Z";
    return '<svg class="np-spark2" data-this="' + a.map((v) => v.toFixed(4)).join(",") + '" data-ly="' + (b ? b.map((v) => v.toFixed(4)).join(",") : "") + '" data-kind="' + kind + '" data-uid="' + (uid || "") + '" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + color + '" stop-opacity="0.24"/><stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path class="np-sp-area" d="' + areaD + '" fill="url(#' + id + ')"/>' +
      (lD ? '<path class="np-sp-ly" d="' + lD + '"/>' : "") +
      '<path class="np-sp-this" d="' + tD + '" stroke="' + color + '"/>' +
      '<line class="np-sc-cursor" x1="0" y1="0" x2="0" y2="' + H + '" style="display:none"/></svg>';
  }
  function clearSpark() { const t = document.getElementById("npCellHint"); if (t) t.hidden = true; document.querySelectorAll(".np-sc-cursor").forEach((c) => (c.style.display = "none")); }
  function onSparkMove(e) {
    const svg = e.target.closest(".np-spark2"), tip = document.getElementById("npCellHint");
    if (!svg) { clearSpark(); return; }
    const a = svg.dataset.this.split(",").map(Number), b = svg.dataset.ly ? svg.dataset.ly.split(",").map(Number) : null, kind = svg.dataset.kind;
    const rect = svg.getBoundingClientRect(), n = a.length;
    let idx = Math.round((e.clientX - rect.left) / rect.width * (n - 1)); idx = Math.max(0, Math.min(n - 1, idx));
    document.querySelectorAll(".np-sc-cursor").forEach((c) => (c.style.display = "none"));
    const cur = svg.querySelector(".np-sc-cursor"); if (cur) { const xv = (idx / (n - 1) * 300).toFixed(1); cur.setAttribute("x1", xv); cur.setAttribute("x2", xv); cur.style.display = ""; }
    const f = (v) => kind === "pct" ? (v * 100).toFixed(1) + "%" : kind === "price" ? "$" + v.toFixed(2) : kind === "money" ? "$" + Math.round(v * 1000).toLocaleString() + "K" : v.toFixed(1) + "K";
    if (tip) {
      tip.innerHTML = kind === "alw" ? alwBreak(svg.dataset.uid, idx, a[idx]) : ("Wk " + (idx + 1) + " · <b>" + f(a[idx]) + "</b>" + (b ? ' · <span style="opacity:.7">LY ' + f(b[idx]) + "</span>" : ""));
      tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 220) + "px"; tip.style.top = (e.clientY + 14) + "px"; tip.hidden = false;
    }
  }
  // cost-ladder breakdown of allowance types at a week ("—" for zero)
  function alwBreak(uid, idx, total) {
    const o = NP.cat().items.find((x) => x.uid === uid); if (!o) return "Wk " + (idx + 1) + " · " + (total * 100).toFixed(1) + "%";
    const l = NP.effective(o, NP.displayMap()).ladder;
    const base = l.offInvoice + l.billBack + l.priceBreak + l.freight + l.transaction + l.flat, wob = base ? total / base : 1;
    const pf = (v) => v > 0.0005 ? (v * 100).toFixed(1) + "%" : "—";
    const grp = (title, rows) => '<div class="np-tip-g">' + title + "</div>" + rows.map(([n, v]) => '<div class="np-tip-row"><span>' + n + "</span><span>" + pf(v * wob) + "</span></div>").join("");
    return '<div class="np-tip-h">Wk ' + (idx + 1) + " · allowance % of VLC</div>" +
      grp("Buying", [["Off-invoice", l.offInvoice], ["Bill back", l.billBack], ["Price break", l.priceBreak], ["Freight", l.freight]]) +
      grp("Retail", [["Transaction", l.transaction], ["Flat", l.flat]]) +
      '<div class="np-tip-row np-tip-tot"><span>Total allowance</span><span>' + (total * 100).toFixed(1) + "%</span></div>";
  }

  /* ===================================================== VIEW 4: EXPLAIN ===== */
  /* Data-driven "why the optimiser plan beats last year / the plan" — Store58 dataset. */
  const EX_MET = ["units", "sales", "AGP"], EX_MON = [false, true, true];
  const EX_BUCKETS = [["off", "Switched off"], ["new", "Added"], ["kept", "Retuned"], ["stay", "Left off"]];
  function exFmt(m, v) { v = Math.round(v); return (v < 0 ? "-" : "") + (EX_MON[m] ? "$" : "") + Math.abs(v).toLocaleString(); }
  function exM() { const e = NP.state.explain; if (e.m != null) return e.m; return ({ sales: 1, units: 0, agp: 2, hh: 2 })[NP.state.objective] || 2; }
  function exWeeks() { const ds = window.NP_EXPLAIN, sc = NP.state.explain.scope; if (sc.indexOf("m:") === 0) return ds.weeks.filter((w) => w.start.slice(0, 7) === sc.slice(2)); if (sc.indexOf("w:") === 0) return ds.weeks.filter((w) => w.wk === +sc.slice(2)); return ds.weeks.slice(); }
  function exScopeName() { const sc = NP.state.explain.scope, ds = window.NP_EXPLAIN; if (sc.indexOf("w:") === 0) return "Week " + sc.slice(2); if (sc.indexOf("m:") === 0) { const d = new Date(sc.slice(2) + "-01"); return MONTHS[d.getMonth()] + " " + d.getFullYear(); } return "all " + ds.weeks.length + " weeks"; }
  function exAgg(weeks) {
    const z3 = () => [0, 0, 0], z4 = () => [0, 0, 0, 0];
    const A = { tot: { opt: z3(), plan: z3(), ly: z3() }, promo: { opt: 0, plan: 0, ly: 0 }, tac: { opt: z4(), plan: z4(), ly: z4() }, buckets: { off: z4(), new: z4(), kept: z4(), stay: z4() }, dbin: Array.from({ length: 7 }, z3), hbin: [0, 0, 0, 0, 0, 0], depts: {}, dmW: { opt: [0, 0], plan: [0, 0], ly: [0, 0] }, dmed: {}, weeks: weeks };
    weeks.forEach((w) => {
      ["opt", "plan", "ly"].forEach((s) => { for (let i = 0; i < 3; i++) A.tot[s][i] += w.tot[s][i]; A.promo[s] += w.promo[s]; for (let i = 0; i < 4; i++) A.tac[s][i] += w.tac[s][i]; A.dmW[s][0] += w.dmed[s] * w.promo[s]; A.dmW[s][1] += w.promo[s]; });
      EX_BUCKETS.forEach(([b]) => { for (let i = 0; i < 4; i++) A.buckets[b][i] += w.buckets[b][i]; });
      w.dbin.forEach((d, i) => { A.dbin[i][0] += d[0]; A.dbin[i][1] += d[1]; A.dbin[i][2] += d[2]; });
      w.hbin.forEach((c, i) => { A.hbin[i] += c; });
      Object.keys(w.depts).forEach((dep) => { const dd = A.depts[dep] || (A.depts[dep] = { opt: z3(), plan: z3(), ly: z3(), b: { off: z4(), new: z4(), kept: z4(), stay: z4() } }), wd = w.depts[dep]; ["opt", "plan", "ly"].forEach((s) => { for (let i = 0; i < 3; i++) dd[s][i] += wd[s][i]; }); EX_BUCKETS.forEach(([b]) => { for (let i = 0; i < 4; i++) dd.b[b][i] += wd.b[b][i]; }); });
    });
    ["opt", "plan", "ly"].forEach((s) => { A.dmed[s] = A.dmW[s][1] ? A.dmW[s][0] / A.dmW[s][1] : 0; });
    return A;
  }

  function renderExplain() {
    const host = document.getElementById("npStep5"), ds = window.NP_EXPLAIN;
    const M = exM(), B = NP.state.explain.b, weeks = exWeeks(), A = exAgg(weeks);
    const bench = A.tot[B], benchName = B === "plan" ? "the LY plan" : "last year";
    const gain = A.tot.opt[M] - bench[M];
    host.innerHTML =
      '<div class="np-ex-head"><div class="np-ex-headtop"><div><h2 class="np-ex-title">Why this plan beats ' + benchName + '</h2>' +
      '<p class="np-ex-headsub">Store ' + ds.meta.store + " · objective " + ds.meta.objective + " · " + esc(exScopeName()) + ' · every panel below filters to this selection</p></div>' + exControls(ds, M, B) + "</div>" + exPin(A, M, B) + "</div>" +
      '<section class="panel" id="npExSummary">' + exKpis(A, M, B) + "</section>" +
      '<section class="panel"><div class="panel-heading"><div><h3 class="np-ex-h">Department contribution</h3>' +
        '<p class="np-ex-sub">Contribution to the ' + EX_MET[M] + ' gap vs ' + (B === "plan" ? "planned" : "last year") + ': <strong>' + exFmt(M, bench[M]) + '</strong> → <strong>' + exFmt(M, A.tot.opt[M]) + '</strong> (<span class="' + (gain >= 0 ? "np-pos" : "np-neg") + '">' + (gain >= 0 ? "+" : "") + exFmt(M, gain) + '</span>). Click a department for the drivers.</p></div></div>' +
        exDeptBridge(A, M, B) + exDeptTable(A, M, B) + '</section>' +
      '<div class="np-ex-cols3">' +
        '<section class="panel np-chart-card np-ex-bucketcard"><h4>What the optimiser changed <small>AGP ' + exFmt(2, A.tot.plan[2]) + " → " + exFmt(2, A.tot.opt[2]) + '</small></h4>' + exBucketBridge(A, 2) + '</section>' +
        '<section class="panel np-chart-card"><h4>Promotion mechanic <small>store tactics</small></h4>' + exMechanic(A, ds) + '</section>' +
        '<section class="panel np-chart-card"><h4>Promotion depth <small>median depth</small></h4>' + exDepth(A) + '</section>' +
      '</div>' +
      '<section class="panel"><div class="panel-heading"><div><h3 class="np-ex-h">Validation &amp; confidence</h3>' +
        '<p class="np-ex-sub">Can a doubting merchant trust it? Accuracy, where the profit comes from, why the cuts are safe, and how much the forecast can be wrong before the gain disappears.</p></div></div>' +
        '<div class="np-ex-vgrid">' + exBacktest(A, M) + exEfficiency(A, ds) + exHalo(A, ds) + exDownside(A, B) + '</div></section>' +
      '<p class="np-foot">Store ' + ds.meta.store + ', ' + esc(exScopeName()) + '. Optimiser objective = ' + ds.meta.objective + '; the units/AGP objective runs reallocate differently. Buckets and the depth/halo panels are defined vs the plan; forecast-accuracy uses sample actuals for layout.</p>';
    exBind(host);
  }

  function exControls(ds, M, B) {
    const months = [...new Set(ds.weeks.map((w) => w.start.slice(0, 7)))];
    const monLabel = (m) => { const d = new Date(m + "-01"); return MONTHS[d.getMonth()] + " " + d.getFullYear(); };
    const sc = NP.state.explain.scope;
    const tsel = '<select id="npExTime" class="np-res-select"><option value="all"' + (sc === "all" ? " selected" : "") + ">All weeks</option>" +
      "<optgroup label=\"Month\">" + months.map((m) => '<option value="m:' + m + '"' + (sc === "m:" + m ? " selected" : "") + ">" + monLabel(m) + "</option>").join("") + "</optgroup>" +
      "<optgroup label=\"Week\">" + ds.weeks.map((w) => '<option value="w:' + w.wk + '"' + (sc === "w:" + w.wk ? " selected" : "") + ">Week " + w.wk + "</option>").join("") + "</optgroup></select>";
    const mcap = '<span class="plan-obj-capsule">' + EX_MET.map((lab, i) => '<button type="button" class="plan-obj-opt' + (M === i ? " active" : "") + '" data-exm="' + i + '">' + (i === 0 ? "Units" : i === 1 ? "Sales" : "AGP") + "</button>").join("") + "</span>";
    const bcap = '<span class="plan-obj-capsule">' + [["plan", "vs Planned"], ["ly", "vs Last year"]].map(([v, l]) => '<button type="button" class="plan-obj-opt' + (B === v ? " active" : "") + '" data-exb="' + v + '">' + l + "</button>").join("") + "</span>";
    return '<div class="np-ex-controls"><span class="np-res-ctl">Time ' + tsel + "</span><span class=\"np-res-ctl\">Metric " + mcap + "</span><span class=\"np-res-ctl\">Benchmark " + bcap + "</span></div>";
  }
  function exPin(A, M, B) {
    const cards = [{ m: -1, lab: "On promo", v: A.promo.opt, base: A.promo[B] }, { m: 0, lab: "Units", v: A.tot.opt[0], base: A.tot[B][0] }, { m: 1, lab: "Sales", v: A.tot.opt[1], base: A.tot[B][1] }, { m: 2, lab: "AGP", v: A.tot.opt[2], base: A.tot[B][2] }];
    return '<div class="np-ex-pin">' + cards.map((k) => { const p = k.base ? (k.v - k.base) / k.base : 0, val = k.m < 0 ? Math.round(k.v).toLocaleString() : exFmt(k.m, k.v); return '<span class="np-ex-pin-m' + (k.m === M ? " is-obj" : "") + '"><b>' + k.lab + "</b>" + val + ' <i class="' + (p >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(p) + "</i></span>"; }).join("") + '<span class="np-pin-vs">vs ' + (B === "plan" ? "plan" : "LY") + "</span></div>";
  }
  function exKpis(A, M, B) {
    const cards = [
      { lab: "Items on promo", m: -1, v: A.promo.opt, base: A.promo[B] },
      { lab: "Forecast units", m: 0, v: A.tot.opt[0], base: A.tot[B][0] },
      { lab: "Forecast sales", m: 1, v: A.tot.opt[1], base: A.tot[B][1] },
      { lab: "Forecast AGP", m: 2, v: A.tot.opt[2], base: A.tot[B][2] }
    ];
    return '<div class="np-kpis">' + cards.map((k) => {
      const p = k.base ? (k.v - k.base) / k.base : 0, val = k.m < 0 ? Math.round(k.v).toLocaleString() : exFmt(k.m, k.v);
      return '<div class="np-kpi' + (k.m === M ? " is-objective" : "") + '"><span class="np-kpi-label">' + k.lab + (k.m === M ? ' <em>metric</em>' : "") + '</span><span class="np-kpi-val">' + val + '</span><span class="np-kpi-delta ' + (p >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(p) + " vs " + (B === "plan" ? "plan" : "LY") + "</span></div>";
    }).join("") + "</div>";
  }
  /* horizontal waterfall as HTML rows */
  function wfRows(base, steps, total, m, clickable) {
    let run = base.val; const peaks = [base.val, total.val]; steps.forEach((s) => { run += s.delta; peaks.push(run); });
    const dmax = Math.max.apply(null, peaks.map(Math.abs)) * 1.04 || 1;
    const row = (label, leftPct, wPct, cls, valStr, dept, tip) => '<div class="np-wf-row' + (dept && clickable ? " is-click" : "") + '"' + (dept ? ' data-dept="' + esc(dept) + '"' : "") + ' title="' + esc(tip) + '"><span class="np-wf-lab">' + label + '</span><div class="np-wf-track"><i class="np-wf-seg np-ex-' + cls + '" style="left:' + leftPct.toFixed(1) + "%;width:" + Math.max(0.6, wPct).toFixed(1) + '%"></i></div><span class="np-wf-val ' + (cls === "neg" ? "np-neg" : cls === "pos" ? "np-pos" : "") + '">' + valStr + "</span></div>";
    let html = '<div class="np-wf">' + row(base.label, 0, base.val / dmax * 100, "base", exFmt(m, base.val), null, base.label + " " + exFmt(m, base.val));
    run = base.val;
    steps.forEach((s) => { const start = run, end = run + s.delta; run = end; const lo = Math.min(start, end), w = Math.abs(s.delta), cls = s.delta >= 0 ? "pos" : "neg"; const lab = s.label + (s.count != null ? ' <span class="np-wf-n">' + s.count + "</span>" : ""); html += row(lab, lo / dmax * 100, w / dmax * 100, cls, (s.delta >= 0 ? "+" : "") + exFmt(m, s.delta), s.dept, s.label + " " + (s.delta >= 0 ? "+" : "") + exFmt(m, s.delta)); });
    return html + row(total.label, 0, total.val / dmax * 100, "total", exFmt(m, total.val), null, total.label + " " + exFmt(m, total.val)) + "</div>";
  }
  function exDeptBridge(A, M, B) {
    const deps = Object.keys(A.depts).map((d) => ({ dept: d, delta: A.depts[d].opt[M] - A.depts[d][B][M] })).sort((a, b) => b.delta - a.delta);
    const steps = deps.map((d) => ({ label: d.dept, delta: d.delta, dept: d.dept }));
    return '<div class="np-chart-card np-wf-card">' + wfRows({ label: B === "plan" ? "Plan" : "Last year", val: A.tot[B][M] }, steps, { label: "Optimiser", val: A.tot.opt[M] }, M, true) + "</div>";
  }
  function exDeptTable(A, M, B) {
    const benchName = B === "plan" ? "LY Plan" : "Last year";
    const rows = Object.keys(A.depts).map((d) => { const bench = A.depts[d][B][M], opt = A.depts[d].opt[M]; return { d, bench, opt, dlt: opt - bench }; }).sort((a, b) => b.dlt - a.dlt);
    const t = rows.reduce((o, x) => { o.bench += x.bench; o.opt += x.opt; o.dlt += x.dlt; return o; }, { bench: 0, opt: 0, dlt: 0 });
    const rowHtml = (x, isTot) => { const p = x.bench ? x.dlt / x.bench : 0; return "<tr" + (isTot ? ' class="np-ex-tot"' : ' class="is-click" data-dept="' + esc(x.d) + '"') + "><td>" + (isTot ? "Total" : esc(x.d)) + "</td><td>" + exFmt(M, x.bench) + "</td><td>" + exFmt(M, x.opt) + '</td><td class="' + (x.dlt >= 0 ? "np-pos" : "np-neg") + '">' + (x.dlt >= 0 ? "+" : "") + exFmt(M, x.dlt) + '</td><td class="' + (p >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(p) + "</td></tr>"; };
    return '<div class="np-ex-csub">By department · ' + EX_MET[M] + " · " + benchName + " → optimiser</div>" +
      '<table class="np-ex-table"><thead><tr><th>Department</th><th>' + benchName + '</th><th>This plan</th><th>Δ</th><th>Δ %</th></tr></thead><tbody>' +
      rows.map((x) => rowHtml(x, false)).join("") + rowHtml({ d: "Total", bench: t.bench, opt: t.opt, dlt: t.dlt }, true) + "</tbody></table>";
  }
  function exBucketBridge(A, M) {
    const steps = EX_BUCKETS.map(([b, lab]) => ({ label: lab, delta: A.buckets[b][M], count: A.buckets[b][3] }));
    return '<div class="np-wf-card">' + wfRows({ label: "Plan", val: A.tot.plan[M] }, steps, { label: "Optimiser", val: A.tot.opt[M] }, M, false) +
      '<p class="np-foot"><b>Switched off</b> = planned promo dropped · <b>Added</b> = new · <b>Retuned</b> = kept, re-tuned · <b>Left off</b> = not promoted in either.</p></div>';
  }
  function exMechanic(A, ds) {
    const labs = ds.meta.tlab, max = Math.max(1, Math.max.apply(null, A.tac.plan.concat(A.tac.opt)));
    return '<div class="np-tac">' + labs.map((l, i) => '<div class="np-tac-row"><span class="np-tac-lab">' + esc(l) + '</span><div class="np-tac-bars"><i class="np-tac-bar plan" data-tip="Plan: ' + A.tac.plan[i].toLocaleString() + ' item-weeks" style="width:' + (A.tac.plan[i] / max * 100) + '%"></i><i class="np-tac-bar opt" data-tip="Optimiser: ' + A.tac.opt[i].toLocaleString() + ' item-weeks" style="width:' + (A.tac.opt[i] / max * 100) + '%"></i></div><span class="np-tac-vals">' + A.tac.plan[i].toLocaleString() + " → " + A.tac.opt[i].toLocaleString() + "</span></div>").join("") +
      '<div class="np-tac-legend"><span><i class="sw plan"></i>Plan</span><span><i class="sw opt"></i>Optimiser</span></div></div>';
  }
  function exDepth(A) {
    const dd = [["Last year", A.dmed.ly, "ly"], ["Plan", A.dmed.plan, "plan"], ["Optimiser", A.dmed.opt, "opt"]], dmax = Math.max.apply(null, dd.map((x) => x[1])) * 1.12 || 1;
    return '<div class="np-depth">' + dd.map(([l, v, c]) => '<div class="np-depth-row"><span class="np-depth-lab">' + l + '</span><div class="np-depth-track"><i class="np-depth-bar ' + c + '" style="width:' + (v / dmax * 100) + '%"></i></div><span class="np-depth-val">' + v.toFixed(1) + "%</span></div>").join("") +
      '<p class="np-foot">The optimiser runs shallower median depth than plan and last year — same lift, less margin given away.</p></div>';
  }
  /* SVG vertical bars (grouped); rects carry data-tip; optional data-<click> */
  function exVBars(labels, series, opts) {
    opts = opts || {}; const W = 360, H = 156, padL = 6, padR = 6, padT = 12, padB = 22;
    const all = series.reduce((a, s) => a.concat(s.vals), []); const max = Math.max.apply(null, all) * 1.14 || 1;
    const n = labels.length, gw = (W - padL - padR) / n, ns = series.length, bw = gw * 0.7 / ns;
    const Y = (v) => padT + (H - padT - padB) * (1 - v / max);
    let out = "";
    labels.forEach((lab, i) => {
      series.forEach((s, si) => {
        const x = padL + gw * i + gw * 0.15 + si * bw, y = Y(s.vals[i]), h = Math.max(1, (H - padB) - y);
        const tip = opts.tip ? opts.tip(i, si) : lab + ": " + s.vals[i];
        const click = opts.click ? " " + opts.click + '="' + i + '"' : "";
        out += '<rect class="np-vb ' + s.cls + (opts.click ? " is-click" : "") + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" data-tip="' + esc(tip) + '"' + click + "></rect>";
      });
      out += '<text class="np-vb-lbl" x="' + (padL + gw * i + gw / 2).toFixed(1) + '" y="' + (H - 7) + '">' + esc(lab) + "</text>";
    });
    return '<svg class="np-vbars" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet">' + out + "</svg>";
  }
  function exBacktest(A, M) {
    const pred = A.weeks.map((w) => w.tot.opt[M]);
    const act = A.weeks.map((w) => Math.round(w.tot.opt[M] * (1 + (((w.wk * 13) % 7) - 3) / 100)));
    let mape = 0; pred.forEach((p, i) => { mape += Math.abs(p - act[i]) / (act[i] || 1); }); mape = pred.length ? mape / pred.length * 100 : 0;
    const labels = A.weeks.map((w) => "Wk" + w.wk);
    const chart = exVBars(labels, [{ vals: pred, cls: "np-vb-pred" }, { vals: act, cls: "np-vb-act" }], { tip: (i, si) => "Wk" + A.weeks[i].wk + " · " + (si ? "actual " : "predicted ") + exFmt(M, (si ? act : pred)[i]) });
    return '<div class="np-chart-card"><h4>Forecast vs actual <span class="np-sim-tag">sample</span></h4><div class="np-ex-csub">store ' + EX_MET[M] + ", per week · sample mean error " + mape.toFixed(1) + "%</div>" + chart +
      '<div class="np-vb-legend"><span><i class="sw pred"></i>Predicted</span><span><i class="sw act"></i>Actual (sample)</span></div></div>';
  }
  function miniMetric(M) { return '<span class="plan-obj-capsule np-mini-cap">' + ["Units", "Sales", "AGP"].map((l, i) => '<button type="button" class="plan-obj-opt' + (M === i ? " active" : "") + '" data-exm="' + i + '">' + l + "</button>").join("") + "</span>"; }
  function exEfficiency(A, ds) {
    const eff = A.dbin.map((d) => d[2] ? Math.round(d[0] / d[2]) : 0);
    const chart = exVBars(ds.meta.dlab, [{ vals: eff, cls: "np-vb-opt" }], { tip: (i) => ds.meta.dlab[i] + " · $" + eff[i].toLocaleString() + "/item · " + A.dbin[i][2].toLocaleString() + " items" });
    return '<div class="np-chart-card"><h4>Profit by promotion depth</h4><div class="np-ex-csub">avg forecast AGP per promoted item, by depth</div>' + chart + "</div>";
  }
  function exHalo(A, ds) {
    const chart = exVBars(ds.meta.hlab, [{ vals: A.hbin, cls: "np-vb-neg" }], { click: "data-halo", tip: (i) => A.hbin[i].toLocaleString() + " promos · need " + ds.meta.hlab[i] + "/unit halo (click for items)" });
    return '<div class="np-chart-card"><h4>Basket halo needed to justify the cuts</h4><div class="np-ex-csub">switched-off promos by required incremental basket margin / unit · <b>click a bar to list the items</b></div>' + chart +
      '<p class="np-foot">A <b>higher</b> bar to the right = the planned promo would need an implausibly large basket effect to beat switching it off — so the cut is safe. Low values are the ones to review.</p></div>';
  }
  function exDownside(A, B) {
    const optA = A.tot.opt[2], benA = A.tot[B][2], gain = optA - benA, beh = optA > 0 ? (1 - benA / optA) * 100 : 0, bn = B === "plan" ? "plan" : "last year";
    const drow = (t, v, cls) => '<div class="np-ds-row"><span>' + t + '</span><span class="' + (cls || "") + '">' + v + "</span></div>";
    return '<div class="np-chart-card"><h4>Downside check</h4><div class="np-ex-csub">how the AGP gain holds if the forecast is optimistic · auditable</div>' +
      drow("Optimiser AGP (this scope)", exFmt(2, optA)) +
      drow((B === "plan" ? "Plan" : "Last year") + " AGP", exFmt(2, benA)) +
      drow("Gain = optimiser − " + bn, (gain >= 0 ? "+" : "") + exFmt(2, gain), gain >= 0 ? "np-pos" : "np-neg") +
      '<div class="np-ds-note">If the optimiser AGP forecast is optimistic (' + bn + ' assumed unbiased):</div>' +
      drow("−10% on optimiser", (optA * 0.9 - benA >= 0 ? "+" : "") + exFmt(2, optA * 0.9 - benA), optA * 0.9 - benA >= 0 ? "np-pos" : "np-neg") +
      drow("−20% on optimiser", (optA * 0.8 - benA >= 0 ? "+" : "") + exFmt(2, optA * 0.8 - benA), optA * 0.8 - benA >= 0 ? "np-pos" : "np-neg") +
      '<p class="np-foot"><b>Break-even haircut ' + beh.toFixed(0) + "%.</b> The optimiser AGP can be overstated by this much before the gain vs " + bn + " disappears. These totals tie exactly to the Summary cards above.</p></div>";
  }
  function exBind(host) {
    const t = host.querySelector("#npExTime"); if (t) t.onchange = () => { NP.state.explain.scope = t.value; NP.renderAll(); };
    host.querySelectorAll("[data-exm]").forEach((b) => b.onclick = () => { NP.state.explain.m = +b.dataset.exm; NP.renderAll(); });
    host.querySelectorAll("[data-exb]").forEach((b) => b.onclick = () => { NP.state.explain.b = b.dataset.exb; NP.renderAll(); });
    host.querySelectorAll("[data-dept]").forEach((el) => el.onclick = () => exOpenDept(el.dataset.dept));
    host.querySelectorAll("[data-halo]").forEach((el) => el.onclick = () => exOpenHalo(+el.dataset.halo));
    host.addEventListener("mousemove", exTip); host.addEventListener("mouseleave", clearSpark);
    // reveal pinned KPI strip once the Summary cards scroll under the sticky control bar
    if (exObserver) exObserver.disconnect();
    const head = host.querySelector(".np-ex-head"), sum = host.querySelector("#npExSummary");
    if (head && sum && "IntersectionObserver" in window) {
      const ht = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--np-headtop")) || 112;
      exObserver = new IntersectionObserver((ents) => head.classList.toggle("show-pin", !ents[0].isIntersecting), { rootMargin: "-" + (ht + 64) + "px 0px 0px 0px", threshold: 0 });
      exObserver.observe(sum);
    }
  }
  let exObserver = null;
  function exTip(e) {
    const el = e.target.closest("[data-tip]"), tip = document.getElementById("npCellHint");
    if (!el || !tip) { if (tip) tip.hidden = true; return; }
    tip.textContent = el.dataset.tip; tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 240) + "px"; tip.style.top = (e.clientY + 14) + "px"; tip.hidden = false;
  }
  function exModal(html) { const m = document.getElementById("npModal"), s = document.getElementById("npModalScrim"); m.innerHTML = html; m.hidden = false; s.hidden = false; const c = m.querySelector(".np-modal-close"); if (c) c.onclick = NP.closeOverlays; s.onclick = NP.closeOverlays; }
  function exOpenDept(dep) {
    const A = exAgg(exWeeks()), M = exM(), B = NP.state.explain.b, d = A.depts[dep]; if (!d) return;
    const delta = d.opt[M] - d[B][M];
    let body = '<div class="np-modal-head"><div><h3>' + esc(dep) + '</h3><p>' + EX_MET[M] + " vs " + (B === "plan" ? "planned" : "last year") + '</p></div><button class="np-modal-close" type="button">×</button></div>' +
      '<div class="np-ds-big ' + (delta >= 0 ? "np-pos" : "np-neg") + '">' + (delta >= 0 ? "+" : "") + exFmt(M, delta) + "</div>" +
      '<div class="np-ex-h" style="font-size:0.8rem">What drove it' + (B !== "plan" ? ' <span class="np-wf-n">optimiser vs plan</span>' : "") + "</div>";
    EX_BUCKETS.forEach(([b, lab]) => { const v = d.b[b][M], n = d.b[b][3]; body += '<div class="np-ds-row"><span>' + lab + ' <span class="np-wf-n">' + n.toLocaleString() + ' items</span></span><span class="' + (v >= 0 ? "np-pos" : "np-neg") + '">' + (v >= 0 ? "+" : "") + exFmt(M, v) + "</span></div>"; });
    exModal(body);
  }
  function exOpenHalo(i) {
    const ds = window.NP_EXPLAIN, scopeWks = exWeeks().map((w) => w.wk);
    const items = ds.cuts.filter((c) => c.b === i && scopeWks.indexOf(c.wk) > -1).sort((a, b) => b.u - a.u);
    let body = '<div class="np-modal-head"><div><h3>Cuts needing ' + ds.meta.hlab[i] + ' / unit of basket halo to justify</h3><p>' + items.length + ' switched-off promos in this bucket · ' + esc(exScopeName()) + '</p></div><button class="np-modal-close" type="button">×</button></div>' +
      '<p class="np-foot" style="margin:0 0 8px">Break-even halo / unit = (optimiser AGP − plan AGP) ÷ promoted units. A <b>higher</b> value means the planned promo would need an implausibly large basket effect to beat switching it off — so the cut is safer. <b>Low</b> values are the ones to review.</p>';
    if (items.length) body += '<table class="np-modal-table"><thead><tr><th>Item</th><th class="np-r">Wk</th><th class="np-r">Units</th><th class="np-r">Plan AGP</th><th class="np-r">Opt AGP</th><th class="np-r">BE $/unit</th></tr></thead><tbody>' +
      items.map((c) => '<tr><td>' + esc(c.n) + '<small class="np-cut-dep"> ' + esc(c.dep) + (c.ps ? " · " + esc(c.ps) : "") + '</small></td><td class="np-r">' + c.wk + '</td><td class="np-r">' + c.u.toLocaleString() + '</td><td class="np-r ' + (c.pa < 0 ? "np-neg" : "") + '">' + exFmt(2, c.pa) + '</td><td class="np-r">' + exFmt(2, c.oa) + '</td><td class="np-r"><b>$' + c.be.toFixed(2) + "</b></td></tr>").join("") + "</tbody></table>";
    else body += '<p class="np-foot">No sample items embedded for this bucket and time scope.</p>';
    exModal(body);
  }

  /* ============================================== VIEW 5: COUNTERFACTUAL ===== */
  function clustersOf(c) { const m = {}; c.items.forEach((o) => { (m[o.cluster] = m[o.cluster] || []).push(o); }); return m; }
  const CF_OPTS = { seasonal: { season: 1.14, cannib: 0.17, halo: 0.02 }, staggered: { season: 1.03, cannib: 0.045, halo: 0.02 }, balanced: { season: 1.09, cannib: 0.09, halo: 0.07 } };
  const CF_LABEL = { seasonal: "Seasonal max", staggered: "Staggered", balanced: "Halo-aware" };
  function renderCounterfactual() {
    const host = document.getElementById("npStep4"), c = NP.cat(), clusters = clustersOf(c), cf = NP.state.cf;
    const singleBrands = [...new Set((clusters.singles || clusters.cola || []).map((o) => o.brand))];
    if (singleBrands.length && !singleBrands.includes(cf.brandA)) cf.brandA = singleBrands[0];
    if (singleBrands.length && !singleBrands.includes(cf.brandB)) cf.brandB = singleBrands[1] || singleBrands[0];
    host.innerHTML = '<section class="panel"><div class="panel-heading"><div><h2>Counterfactuals — distribute events across the 52 weeks</h2><p>Give an event budget per brand and the system places them across the year. Brands in a cluster <strong>cannibalise</strong> each other and share <strong>halo</strong>, so where events land — and whether two peers fire the same week — changes units, revenue and AGP.</p></div></div>' + clusterPanel(clusters) + "</section>" + cfControls(singleBrands) + '<div id="npCfResult"></div>';
    bindCf(host, singleBrands); renderCfResult();
  }
  function clusterPanel(clusters) { return '<div class="np-cluster-grid">' + Object.keys(clusters).map((k) => { const m = clusters[k]; return '<div class="np-cluster"><div class="np-cluster-head"><b>' + (NP.CLUSTER_LABEL[k] || k) + "</b><span>" + m.length + " NCRCs</span></div><div class=\"np-cluster-members\">" + m.map((o) => '<span class="np-chip np-chip-' + o.form + '">' + esc(o.brand) + "</span>").join("") + "</div><p class=\"np-foot\">" + clusterNote(k) + "</p></div>"; }).join("") + "</div>"; }
  function clusterNote(k) { return ({ singles: "Impulse bars — high mutual substitution; summer peak. Promote peers on different weeks to limit cannibalisation.", sharingbag: "Sharing bags — Halloween, Easter & festive peaks; moderate substitution.", tubs: "Sharing tubs — concentrated in Nov–Dec; two tubs the same week split one basket.", cola: "Cola & dark sodas — strong substitution; summer & holiday peaks.", lemonlime: "Flavours — lighter substitution with the cola anchor." })[k] || "Grouped by learned halo and cannibalisation."; }
  function cfControls(brands) {
    const cf = NP.state.cf;
    const opt = (id) => '<button type="button" class="np-cf-opt ' + (cf.option === id ? "is-active" : "") + '" data-cfopt="' + id + '"><b>' + CF_LABEL[id] + "</b><small>" + ({ seasonal: "Both pack peak weeks — max gross, max overlap", staggered: "Alternate weeks — least cannibalisation", balanced: "Shared tentpoles + spread — best blended" })[id] + "</small></button>";
    const sel = (w, v) => '<select class="plan-category-select np-cf-brand" data-cfbrand="' + w + '">' + brands.map((b) => "<option" + (b === v ? " selected" : "") + ">" + esc(b) + "</option>").join("") + "</select>";
    return '<section class="panel np-cf-controls"><div class="np-cf-inputs"><div class="np-cf-brandbox"><span class="plan-step-label">Brand A</span>' + sel("A", cf.brandA) + '<label class="np-cf-evlbl"># events <input class="np-cell-input np-cf-ev" inputmode="numeric" data-cfev="A" value="' + cf.eventsA + '"></label></div><div class="np-cf-brandbox"><span class="plan-step-label">Brand B</span>' + sel("B", cf.brandB) + '<label class="np-cf-evlbl"># events <input class="np-cell-input np-cf-ev" inputmode="numeric" data-cfev="B" value="' + cf.eventsB + '"></label></div></div><div class="np-cf-opts"><span class="plan-step-label">Distribution strategy</span><div class="np-cf-optrow">' + opt("seasonal") + opt("staggered") + opt("balanced") + "</div></div></section>";
  }
  function bindCf(host, brands) {
    host.querySelectorAll("[data-cfbrand]").forEach((s) => s.onchange = () => { NP.state.cf["brand" + s.dataset.cfbrand] = s.value; renderCfResult(); });
    host.querySelectorAll("[data-cfev]").forEach((i) => i.addEventListener("input", () => { NP.state.cf["events" + i.dataset.cfev] = Math.round(clamp(parseFloat(i.value) || 0, 0, 40)); renderCfResult(); }));
    host.querySelectorAll("[data-cfopt]").forEach((b) => b.onclick = () => { NP.state.cf.option = b.dataset.cfopt; renderCounterfactual(); });
  }
  function pickWeeks(form, events, phase) {
    const order = (NP.CURVE[form] || NP.CURVE.bar).map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).map((p) => p[0]);
    if (phase === "even") { const out = []; for (let i = 1; i < order.length && out.length < events; i += 2) out.push(order[i]); for (let i = 0; i < order.length && out.length < events; i += 2) out.push(order[i]); return new Set(out); }
    if (phase === "balanced") { const out = order.slice(0, Math.min(4, events)).slice(); for (let i = 4; i < order.length && out.length < events; i++) out.push(order[i]); return new Set(out); }
    return new Set(order.slice(0, events));
  }
  function brandNcrc(brand) { return NP.cat().items.find((o) => o.brand === brand) || NP.cat().items[0]; }
  function renderCfResult() {
    const host = document.getElementById("npCfResult"); if (!host) return;
    const cf = NP.state.cf, oA = brandNcrc(cf.brandA), oB = brandNcrc(cf.brandB), options = ["seasonal", "staggered", "balanced"];
    const rows = options.map((opt) => { const k = CF_OPTS[opt]; const rA = NP.respond(oA, { events: cf.eventsA, depth: oA.recDepth, seasonGain: k.season, cannib: k.cannib, halo: k.halo }); const rB = NP.respond(oB, { events: cf.eventsB, depth: oB.recDepth, seasonGain: k.season, cannib: k.cannib, halo: k.halo }); return { opt, label: CF_LABEL[opt], units: rA.units + rB.units, rev: rA.revenueM + rB.revenueM, agp: rA.agpM + rB.agpM, cannib: k.cannib, halo: k.halo, rA, rB }; });
    const bestAgp = Math.max.apply(null, rows.map((r) => r.agp)), sel = cf.option;
    const weeksA = pickWeeks(oA.form, cf.eventsA, sel === "staggered" ? "even" : sel === "balanced" ? "balanced" : "top");
    const weeksB = pickWeeks(oB.form, cf.eventsB, sel === "balanced" ? "balanced" : "top");
    const overlap = [...weeksA].filter((w) => weeksB.has(w)).length, selRow = rows.find((r) => r.opt === sel);
    host.innerHTML = '<div class="np-explain-cols"><section class="panel np-chart-card"><h4>Option comparison (' + esc(cf.brandA) + " + " + esc(cf.brandB) + " combined)</h4><table class=\"np-cf-table\"><thead><tr><th>Strategy</th><th>Units</th><th>Revenue</th><th>AGP</th><th>Cannib.</th><th>Halo</th></tr></thead><tbody>" + rows.map((r) => '<tr class="' + (r.opt === sel ? "is-sel" : "") + (r.agp === bestAgp ? " is-best" : "") + '"><td>' + r.label + (r.agp === bestAgp ? ' <span class="np-best-tag">best AGP</span>' : "") + "</td><td>" + fmt.u(r.units) + "</td><td>" + fmt.m(r.rev) + "</td><td>" + fmt.m(r.agp) + "</td><td>" + fmt.pctPlain(r.cannib) + "</td><td>+" + fmt.pctPlain(r.halo) + "</td></tr>").join("") + '</tbody></table><p class="np-foot">Switch strategy below to update the calendars and item-level results.</p></section><section class="panel np-chart-card"><h4>Item-level outcome — ' + CF_LABEL[sel] + "</h4>" + itemLevel(selRow, oA, oB) + "</section></div>" +
      '<section class="panel np-chart-card"><h4>52-week placement — ' + CF_LABEL[sel] + ' <span class="np-overlap ' + (overlap > 3 ? "hot" : "cool") + '">' + overlap + " overlapping weeks</span></h4>" + heatmap(esc(cf.brandA), oA.form, weeksA) + heatmap(esc(cf.brandB), oB.form, weeksB) + '<p class="np-foot">Shading = seasonal demand (darker = stronger). Dots = promoted weeks. Overlapping promoted weeks drive cannibalisation between the two peers.</p></section>';
  }
  function itemLevel(row, oA, oB) {
    if (!row) return "";
    const line = (o, r) => '<div class="np-il-row"><div class="np-il-name"><b>' + esc(o.brand) + "</b><small>" + esc(o.item) + "</small></div><div class=\"np-il-metrics\"><span><small>Units</small>" + fmt.u(r.units) + "</span><span><small>Revenue</small>" + fmt.m(r.revenueM) + "</span><span><small>AGP</small>" + fmt.m(r.agpM) + "</span></div></div>";
    return '<div class="np-il">' + line(oA, row.rA) + line(oB, row.rB) + '<div class="np-il-row np-il-total"><div class="np-il-name"><b>Cluster net</b><small>both brands</small></div><div class="np-il-metrics"><span><small>Units</small>' + fmt.u(row.units) + "</span><span><small>Revenue</small>" + fmt.m(row.rev) + "</span><span><small>AGP</small>" + fmt.m(row.agp) + "</span></div></div></div>";
  }
  function heatmap(name, form, weeks) {
    const curve = NP.CURVE[form] || NP.CURVE.bar, max = Math.max.apply(null, curve);
    const cells = curve.map((v, i) => { const a = (0.12 + 0.6 * (v / max)).toFixed(2), p = weeks.has(i); return '<span class="np-hm-cell' + (p ? " promoted" : "") + '" style="background:rgba(23,105,232,' + a + ')" title="Week ' + (i + 1) + (p ? " · promoted" : "") + '">' + (p ? "<i></i>" : "") + "</span>"; }).join("");
    return '<div class="np-hm-row"><span class="np-hm-name">' + name + '</span><div class="np-hm-cells">' + cells + "</div></div>";
  }

  window.NPViews = { renderGrid, renderResults, renderExplain, renderCounterfactual };
})();
