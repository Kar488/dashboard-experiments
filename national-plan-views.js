/* National 52-Week Plan — views. Relies on window.NP. Exposes window.NPViews. */
(function () {
  "use strict";
  const NP = window.NP;
  const { fmt, util } = NP;
  const clamp = util.clamp;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function objShort(obj) { const o = NP.OBJECTIVES.find((x) => x.id === (obj || NP.state.objective)); return o ? o.short : "Sales"; }
  const ALW_GROUPS = [
    { group: "Buying allowances", cls: "buy", items: [["offInvoice", "Off-inv"], ["billBack", "B/back"], ["priceBreak", "P/brk"]] },
    { group: "Freight", cls: "frt", items: [["freight", "Frt"]] },
    { group: "Retail allowances", cls: "ret", items: [["scan", "Scan"], ["shipToStore", "Ship-to-store"], ["headerFlat", "Hdr flat"], ["newItem", "New item"]] }
  ];
  const ALW = ALW_GROUPS.reduce((a, g) => a.concat(g.items), []);
  const RETAIL_LABEL = { scan: "Scan", shipToStore: "Ship to store", headerFlat: "Header flat", newItem: "New item" };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let compareHidden = false;

  /* Dead-net versions — the allowance breakup can be viewed against two negotiated
     postures of the same deal:
       v1 "Standard"  — the optimised base ladder (editable).
       v2 "Deep-deal" — a second, more deeply funded version (richer off-invoice,
                        bill-back & price-break) → a lower dead-net per unit. Read-only;
                        it is an alternative the optimiser also priced, not your scenario. */
  const DEEP_BUY_MULT = { offInvoice: 1.22, billBack: 1.18, priceBreak: 1.15 };
  function isDeep() { return NP.state.deadNetVersion === "v2"; }
  function deepLadder(l) { const o = Object.assign({}, l); Object.keys(DEEP_BUY_MULT).forEach((k) => { o[k] = util.round((l[k] || 0) * DEEP_BUY_MULT[k], 4); }); return o; }
  function deadNetFrom(vlc, l) { return util.round(vlc * (1 - NP.LADDER_KEYS.reduce((s, k) => s + (l[k] || 0), 0)), 3); }
  function deepView(e) { const dl = deepLadder(e.ladder); return Object.assign({}, e, { ladder: dl, deadNet: deadNetFrom(e.vlc, dl) }); }
  // the editable Deep-deal posture: defaults to the deeper-funded ladder, overlaid with
  // any user edits stored in ov.deepLadder (driven by the "Dead-net · deep" main-grid column).
  function deepEffective(o, map) {
    const e = NP.effective(o, map), base = deepLadder(e.ladder);
    const ov = (map && map[o.uid]) || {};
    const dl = ov.deepLadder ? Object.assign({}, base, ov.deepLadder) : base;
    return { vlc: e.vlc, events: e.events, ladder: dl, deadNet: deadNetFrom(e.vlc, dl) };
  }

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
    renderScenarioStrip(); bindTools(); renderCompare(); renderGridFilter(); renderSpreadsheet(); updateDirtyUI();
  }
  /* vendor filter — right-aligned above the grid header */
  function renderGridFilter() {
    const host = document.getElementById("npGridFilter"); if (!host) return;
    const vendors = [...new Set(NP.cat().items.map((o) => o.vendor))].sort();
    const rogs = [...new Set(NP.cat().items.map((o) => o.rog))].sort();
    if (NP.state.grid.vendor !== "all" && !vendors.includes(NP.state.grid.vendor)) NP.state.grid.vendor = "all";
    if (NP.state.grid.rog !== "all" && !rogs.includes(NP.state.grid.rog)) NP.state.grid.rog = "all";
    host.innerHTML = '<label class="np-grid-vfilter">Vendor <select id="npGridVendor" class="np-res-select"><option value="all">All vendors</option>' +
      vendors.map((v) => '<option' + (NP.state.grid.vendor === v ? " selected" : "") + ">" + esc(v) + "</option>").join("") + "</select></label>" +
      '<label class="np-grid-vfilter">ROG <select id="npGridRog" class="np-res-select np-rog-select"><option value="all">All ROGs</option>' +
      rogs.map((r) => '<option' + (NP.state.grid.rog === r ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select></label>";
    const sel = document.getElementById("npGridVendor");
    sel.onchange = () => { NP.state.grid.vendor = sel.value; renderGrid(); };
    const rsel = document.getElementById("npGridRog");
    rsel.onchange = () => { NP.state.grid.rog = rsel.value; renderGrid(); };
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
    const cols = [["Sales", (t) => fmt.m(t.revenueM), "revenueM"], ["Units", (t) => fmt.u(t.units), "units"], ["AGP", (t) => fmt.m(t.agpM), "agpM"], ["HHs", (t) => fmt.u(t.hhK), "hhK"]];
    const tots = scs.map((s) => totals(s.ov)), best = {};
    cols.forEach(([, , k]) => { best[k] = Math.max.apply(null, tots.map((t) => t[k])); });
    const head = '<div class="plan-compare-corner"></div>' + cols.map(([l, , k]) => '<div class="plan-compare-col-head' + (objM.metric === k ? " is-obj" : "") + '">' + l + "</div>").join("");
    const rows = scs.map((s, i) => '<div class="plan-compare-row-name ' + (NP.state.activeScenario === s.id ? "is-active" : "is-context") + '"><strong>' + esc(s.name) + "</strong><small>" + s.sub + "</small></div>" +
      cols.map(([, f, k]) => '<div class="plan-compare-cell' + (best[k] === tots[i][k] && scs.length > 1 ? " is-best" : "") + '">' + f(tots[i]) + "</div>").join("")).join("");
    wrap.innerHTML = '<section class="plan-compare np-compare-inline"><header class="plan-compare-head"><strong>Compare scenarios</strong><button class="plan-compare-close" type="button" id="npCompareClose">×</button></header><div class="plan-compare-grid">' + head + rows + '</div><footer class="plan-compare-foot">Bold = leader on each metric · each <b>Rerun forecast</b> adds a scenario · objective: ' + objShort() + "</footer></section>";
    const cl = document.getElementById("npCompareClose"); if (cl) cl.onclick = () => { compareHidden = true; renderCompare(); };
  }

  /* pinned totals footer — sums across the (filtered) rows + average Δ vs LY */
  function gridTotals(items, map) {
    let units = 0, revenueM = 0, agpM = 0, dsum = 0;
    items.forEach((o) => {
      const res = NP.resultFor(o, map), ly = NP.lyResult(o), lyv = NP.objVal(ly);
      units += res.units; revenueM += res.revenueM; agpM += res.agpM;
      dsum += lyv ? (NP.objVal(res) - lyv) / lyv : 0;
    });
    return { units, revenueM, agpM, avgDelta: items.length ? dsum / items.length : 0 };
  }
  function footRow(cols, items, map) {
    const t = gridTotals(items, map);
    const metricKeys = ["units", "revenue", "agp", "delta"];
    const lead = cols.filter((c) => metricKeys.indexOf(c.k) === -1).length;
    const n = items.length;
    let html = '<td class="np-ss-foot-label" colspan="' + lead + '">Total · ' + n + " NCRC" + (n === 1 ? "" : "s") + (NP.state.grid.vendor !== "all" ? " · " + esc(NP.state.grid.vendor) : "") + (NP.state.grid.rog !== "all" ? " · ROG " + esc(NP.state.grid.rog) : "") + "</td>";
    html += '<td class="np-ss-res np-ss-res-start np-ss-foot-val">' + fmt.u(t.units) + "</td>";
    html += '<td class="np-ss-res np-ss-foot-val">' + fmt.m(t.revenueM) + "</td>";
    html += '<td class="np-ss-res np-ss-foot-val">' + fmt.m(t.agpM) + "</td>";
    html += '<td class="np-ss-res np-ss-foot-val ' + (t.avgDelta >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(t.avgDelta) + "</td>";
    return '<tfoot class="np-ss-foot"><tr>' + html + "</tr></tfoot>";
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
      g.items.forEach(([key, label]) => { cols.push({ k: "alwusd:" + key, label: label, edit: "money", group: "alw" }); });
      if (g.group === "Freight") cols.push({ k: "netCost", label: "Net cost", cls: "np-ss-net" });
    });
    cols.push({ k: "deadNet", label: "Promo cost", edit: "money" });
    if (!allow) {
      cols.push({ k: "deepDeadNet", label: "Promo cost deep", edit: "money" });
      // events columns sit under ONE "Events" group header carrying the Regular↔Deep
      // toggle (so the toggle clearly governs all three) — same logic as the V2 grid
      const deepEv = NP.state.v2evMode === "deep";
      const evToggle = ' <button type="button" class="np-evtoggle" data-evtoggle title="Editing events for regular or deep-discount weeks — click to switch">' + (deepEv ? "DEEP" : "REG") + " ⇄</button>";
      const evHead = "Events" + evToggle;
      cols.push({ k: deepEv ? "deepEvents" : "events", label: "Store", edit: "int", evgroup: true, evhead: evHead });
      cols.push({ k: deepEv ? "deepDigEvents" : "digEvents", label: "Digital", edit: "int", evgroup: true });
      cols.push({ k: deepEv ? "deepBothEvents" : "bothEvents", label: "Store & digital", edit: "int", evgroup: true });
      cols.push({ k: "units", label: "Units", cls: "np-ss-res np-ss-res-start" });
      cols.push({ k: "revenue", label: "Sales", cls: "np-ss-res" });
      cols.push({ k: "agp", label: "AGP", cls: "np-ss-res" });
      cols.push({ k: "delta", label: "Δ " + objShort(), cls: "np-ss-res" });
    }
    return cols;
  }
  function renderSpreadsheet() {
    const wrap = document.getElementById("npGridWrap");
    let items = NP.cat().items.slice().sort((a, b) => a.vendor === b.vendor ? a.item.localeCompare(b.item) : a.vendor.localeCompare(b.vendor));
    if (NP.state.grid.vendor !== "all") items = items.filter((o) => o.vendor === NP.state.grid.vendor);
    if (NP.state.grid.rog !== "all") items = items.filter((o) => o.rog === NP.state.grid.rog);
    const cols = columns(), map = NP.displayMap();
    const thead = buildHead(cols);
    let rows = "", lastVendor = null;
    const deepAllow = NP.state.showAllow && isDeep();
    items.forEach((o, i) => {
      const eRaw = NP.effective(o, NP.state.draft), e = deepAllow ? deepEffective(o, NP.state.draft) : eRaw;
      const res = NP.resultFor(o, map), ly = NP.lyResult(o);
      const vstart = o.vendor !== lastVendor && i; lastVendor = o.vendor;
      rows += '<tr class="np-ss-row' + (vstart ? " np-ss-vstart" : "") + '" data-uid="' + o.uid + '">' + cols.map((c) => cell(c, o, e, res, ly, i)).join("") + "</tr>";
    });
    if (NP.state.showAllow) wrap.innerHTML = allowHeader();
    else wrap.innerHTML = "";
    const foot = NP.state.showAllow ? "" : footRow(cols, items, map);
    wrap.insertAdjacentHTML("beforeend", '<table class="projection-table np-ss' + (NP.state.showAllow ? " np-ss-compact" : "") + '"><thead>' + thead + "</thead><tbody>" + rows + "</tbody>" + foot + "</table>");
    wrap.querySelectorAll("input.np-cell-input").forEach((inp) => {
      inp.addEventListener("input", onGridInput);
      const uid = inp.dataset.uid, o = NP.cat().items.find((x) => x.uid === uid);
      inp.addEventListener("focus", () => showHint(inp, o));
      inp.addEventListener("blur", hideHint);
    });
    wrap.querySelectorAll(".np-ss-row").forEach((tr) => bindCtx(tr, tr.dataset.uid));
    wrap.querySelectorAll("[data-fc]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); openForecast(b.dataset.fc, b); });
    wrap.querySelectorAll("[data-dnver]").forEach((b) => b.onclick = () => { NP.state.deadNetVersion = b.dataset.dnver; renderGrid(); });
    // events Regular↔Deep toggle (shared state with the V2 grid)
    wrap.querySelectorAll("[data-evtoggle]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); NP.state.v2evMode = NP.state.v2evMode === "deep" ? "reg" : "deep"; renderGrid(); });
  }
  /* allowance-view header: dead-net version selector + contextual note */
  function allowHeader() {
    const deep = isDeep();
    const seg = '<div class="np-dnver">' +
      '<span class="np-dnver-lab">Promo cost version</span>' +
      '<div class="np-dnver-seg">' +
        '<button type="button" class="np-dnver-opt' + (!deep ? " is-active" : "") + '" data-dnver="v1">Standard<small>negotiated base</small></button>' +
        '<button type="button" class="np-dnver-opt' + (deep ? " is-active" : "") + '" data-dnver="v2">Deep-deal<small>deeper funding</small></button>' +
      "</div>" + allowDelta() + "</div>";
    const note = deep
      ? '<div class="np-allow-note np-allow-note-deep">Editing the <b>Deep-deal</b> promo cost — a second, more deeply funded version (richer off-invoice, bill-back &amp; price-break). Edit any allowance or the promo cost; changes save to <b>Your scenario</b> and carry over to the deal-inputs grid (VLC &amp; <b>Promo cost deep</b>).</div>'
      : '<div class="np-allow-note">Editing <b>Promo cost</b> redistributes the allowance breakup automatically; edit any allowance to override. Switch to <b>Deep-deal</b> to edit the deeper-funded version. Other columns hidden to focus on cost build-up.</div>';
    return seg + note;
  }
  // average dead-net under each version, to quantify how much deeper the deep deal runs
  function allowDelta() {
    const items = NP.cat().items; if (!items.length) return "";
    let s = 0, d = 0;
    items.forEach((o) => { const e = NP.effective(o, NP.state.draft); s += e.deadNet; d += deadNetFrom(e.vlc, deepLadder(e.ladder)); });
    s /= items.length; d /= items.length;
    const pct = s ? (d - s) / s : 0;
    return '<span class="np-dnver-delta">avg promo cost <b>' + fmt.price(d) + '</b> vs Standard <b>' + fmt.price(s) + '</b> <i class="np-pos">' + fmt.pct(pct) + "</i></span>";
  }
  const FC_ICON = (m, uid) => '<button class="np-fc-btn" type="button" data-fc="' + m + '" data-uid="' + uid + '" title="Model vs actual & 52-week forecast for this NCRC"><svg viewBox="0 0 16 12" width="12" height="9"><polyline points="1,9 5,5 8,7 12,2 15,4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  function buildHead(cols) {
    if (!NP.state.showAllow) {
      const evCols = cols.filter((c) => c.evgroup);
      if (!evCols.length) return "<tr>" + cols.map((c) => '<th class="' + (c.cls || "") + (c.edit ? " np-ss-edithead" : "") + '">' + esc(c.label) + "</th>").join("") + "</tr>";
      // 2-row header: the events trio spans a single "Events" group (carrying the toggle)
      let r0 = "<tr>", r1 = "<tr>", evDone = false;
      cols.forEach((c) => {
        if (c.evgroup) {
          if (!evDone) { evDone = true; r0 += '<th class="np-ss-edithead np-ss-evgrp" colspan="' + evCols.length + '">' + (cols.find((x) => x.evhead) || {}).evhead + "</th>"; }
          r1 += '<th class="np-ss-edithead np-ss-evsub">' + esc(c.label) + "</th>";
        } else {
          r0 += '<th class="' + (c.cls || "") + (c.edit ? " np-ss-edithead" : "") + '" rowspan="2">' + esc(c.label) + "</th>";
        }
      });
      return r0 + "</tr>" + r1 + "</tr>";
    }
    // 2-row grouped header: top group (Buying / Freight / Retail) → allowance ($ only)
    let r0 = "<tr>" +
      '<th class="np-ss-rownum" rowspan="2"></th>' +
      '<th class="np-ss-l np-ss-mono" rowspan="2">NCRC</th>' +
      '<th class="np-ss-l" rowspan="2">Item</th>' +
      '<th class="np-ss-edithead" rowspan="2">VLC</th>';
    ALW_GROUPS.forEach((g) => {
      r0 += '<th class="np-ss-grp np-grp-' + g.cls + '" colspan="' + g.items.length + '">' + esc(g.group) + "</th>";
      if (g.group === "Freight") r0 += '<th class="np-ss-net np-ss-nethead" rowspan="2">Net cost</th>';
    });
    r0 += '<th class="np-ss-edithead" rowspan="2">Promo cost</th></tr>';
    const r1 = "<tr>" + ALW.map(([k, l]) => '<th class="np-ss-alwhead">' + esc(l) + " $</th>").join("") + "</tr>";
    return r0 + r1;
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
    const s = fcSeries(metric, o), label = (metric === "vlc" ? "VLC" : "Promo cost") + " · " + o.item;
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
    if (k === "item") return '<td class="np-ss-l">' + esc(o.item) + "</td>";
    if (k === "aws") return '<td class="np-ss-ro">$' + Math.round(o.baseUnitsK * 1000 / 52 * o.basePrice).toLocaleString() + "</td>";
    if (k === "price") return '<td class="np-ss-ro">' + fmt.price(o.basePrice) + "</td>";
    if (k === "vlc") return editCell(o, "vlc", e.vlc.toFixed(2));
    if (k === "netCost") { const l = e.ladder; return '<td class="np-ss-net np-ss-ro" id="nc-' + o.uid + '">' + fmt.price(e.vlc * (1 - l.offInvoice - l.billBack - l.priceBreak - l.freight)) + "</td>"; }
    if (k === "deadNet") return editCell(o, "deadNet", e.deadNet.toFixed(2));
    if (k === "deepDeadNet") return editCell(o, "deepDeadNet", deepEffective(o, NP.state.draft).deadNet.toFixed(2));
    if (k === "events") return editCell(o, "events", String(e.events));
    if (k === "digEvents") return editCell(o, "digEvents", String(e.digEvents));
    if (k === "bothEvents") return editCell(o, "bothEvents", String(e.bothEvents));
    if (k === "deepEvents") return editCell(o, "deepEvents", String(e.deepEvents));
    if (k === "deepDigEvents") return editCell(o, "deepDigEvents", String(e.deepDigEvents));
    if (k === "deepBothEvents") return editCell(o, "deepBothEvents", String(e.deepBothEvents));
    if (k.indexOf("alwusd:") === 0) { const key = k.slice(7); return editAlw(o, key, "usd", (e.ladder[key] * e.vlc).toFixed(2)); }
    if (k === "units") return '<td class="np-ss-res np-ss-res-start">' + fmt.u(res.units) + "</td>";
    if (k === "revenue") return '<td class="np-ss-res">' + fmt.m(res.revenueM) + "</td>";
    if (k === "agp") return '<td class="np-ss-res">' + fmt.m(res.agpM) + "</td>";
    if (k === "delta") { const d = NP.objVal(res) - NP.objVal(ly), p = NP.objVal(ly) ? d / NP.objVal(ly) : 0; return '<td class="np-ss-res ' + (d >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(p) + "</td>"; }
    return "<td></td>";
  }
  // Both Standard and Deep allowance views are fully editable; which ladder an edit
  // targets (ov.ladder vs ov.deepLadder) is decided in onGridInput by the active version.
  function editCell(o, field, val) {
    const isInt = ["events", "digEvents", "bothEvents", "deepEvents", "deepDigEvents", "deepBothEvents"].indexOf(field) !== -1;
    const input = '<input class="np-cell-input" type="text" inputmode="' + (isInt ? "numeric" : "decimal") + '" data-uid="' + o.uid + '" data-field="' + field + '" value="' + val + '">';
    const inner = (field === "vlc" || field === "deadNet") ? '<div class="np-cellrow">' + FC_ICON(field, o.uid) + input + "</div>" : input;
    return '<td class="np-ss-edit' + (NP.isEdited(o, field) ? " is-edited" : "") + '" data-cell="' + o.uid + ":" + field + '">' + inner + "</td>";
  }
  function editAlw(o, key, kind, val) {
    return '<td class="np-ss-edit np-ss-alw' + (NP.isEdited(o, "alw:" + key) ? " is-edited" : "") + '" data-cell="' + o.uid + ":alw:" + key + ":" + kind + '"><input class="np-cell-input" type="text" inputmode="decimal" data-uid="' + o.uid + '" data-alw="' + key + '" data-kind="' + kind + '" value="' + val + '"></td>'; }

  function onGridInput(ev) {
    const inp = ev.target, uid = inp.dataset.uid, o = NP.cat().items.find((x) => x.uid === uid); if (!o) return;
    const ov = NP.draftOf(uid), deep = NP.state.showAllow && isDeep();
    if (inp.dataset.alw) {
      const key = inp.dataset.alw, kind = inp.dataset.kind, val = parseFloat(inp.value) || 0;
      const vlc = ov.vlc != null ? ov.vlc : o.vlc;
      const pct = kind === "pct" ? val / 100 : (vlc > 0 ? val / vlc : 0);
      if (deep) { ov.deepLadder = ov.deepLadder || {}; ov.deepLadder[key] = pct; }
      else { ov.ladder = ov.ladder || {}; ov.ladder[key] = pct; ov.deadNetTouched = false; }
      syncRow(o);
    } else {
      const field = inp.dataset.field; let val = parseFloat(inp.value) || 0;
      if (field === "events") { ov.events = Math.round(clamp(val, 0, 40)); }
      else if (field === "digEvents") { ov.digEvents = Math.round(clamp(val, 0, 40)); }
      else if (field === "bothEvents") { ov.bothEvents = Math.round(clamp(val, 0, 40)); }
      else if (field === "deepEvents") { ov.deepEvents = Math.round(clamp(val, 0, 40)); }
      else if (field === "deepDigEvents") { ov.deepDigEvents = Math.round(clamp(val, 0, 40)); }
      else if (field === "deepBothEvents") { ov.deepBothEvents = Math.round(clamp(val, 0, 40)); }
      else if (field === "deadNet") { deep ? distributeDeepDeadNet(o, val) : distributeDeadNet(o, val); }
      else if (field === "deepDeadNet") { distributeDeepDeadNet(o, val); }
      else if (field === "vlc") { ov.vlc = val; ov.deadNetTouched = false; syncRow(o); }
    }
    showHint(inp, o); markEdited(o); updateDirtyUI();
  }
  function distributeDeadNet(o, target) {
    const e = NP.effective(o, NP.state.draft), vlc = e.vlc; if (vlc <= 0) return;
    const keys = NP.LADDER_KEYS;
    const cur = keys.reduce((s, k) => s + (e.ladder[k] || 0), 0);
    const targetSum = clamp(1 - target / vlc, 0.02, 0.9), scale = cur > 0 ? targetSum / cur : 0;
    const ov = NP.draftOf(o.uid); ov.ladder = ov.ladder || {}; ov.deadNetTouched = false;
    keys.forEach((k) => { ov.ladder[k] = (e.ladder[k] || 0) * scale; });
    syncRow(o);
  }
  // editing the Deep dead-net redistributes the (current) deeper-funded ladder to hit the target
  function distributeDeepDeadNet(o, target) {
    const ed = deepEffective(o, NP.state.draft), vlc = ed.vlc; if (vlc <= 0) return;
    const keys = NP.LADDER_KEYS, cur = keys.reduce((s, k) => s + (ed.ladder[k] || 0), 0);
    const targetSum = clamp(1 - target / vlc, 0.02, 0.95), scale = cur > 0 ? targetSum / cur : 0;
    const ov = NP.draftOf(o.uid); ov.deepLadder = ov.deepLadder || {};
    keys.forEach((k) => { ov.deepLadder[k] = (ed.ladder[k] || 0) * scale; });
    syncRow(o);
  }
  function syncRow(o) {
    const active = document.activeElement, deep = NP.state.showAllow && isDeep();
    const eStd = NP.effective(o, NP.state.draft), eDeep = deepEffective(o, NP.state.draft), eDisp = deep ? eDeep : eStd;
    // dead-net column reflects the active version (deep in Deep view, standard otherwise)
    const dn = document.querySelector('input[data-uid="' + o.uid + '"][data-field="deadNet"]');
    if (dn && dn !== active) dn.value = eDisp.deadNet.toFixed(2);
    const ddn = document.querySelector('input[data-uid="' + o.uid + '"][data-field="deepDeadNet"]');
    if (ddn && ddn !== active) ddn.value = eDeep.deadNet.toFixed(2);
    const nc = document.getElementById("nc-" + o.uid); if (nc) { const l = eDisp.ladder; nc.textContent = fmt.price(eDisp.vlc * (1 - l.offInvoice - l.billBack - l.priceBreak - l.freight)); }
    if (NP.state.showAllow) ALW.forEach(([key]) => {
      const usd = document.querySelector('input[data-uid="' + o.uid + '"][data-alw="' + key + '"][data-kind="usd"]');
      if (usd && usd !== active) usd.value = (eDisp.ladder[key] * eDisp.vlc).toFixed(2);
    });
  }
  function markEdited(o) {
    ["vlc", "deadNet", "deepDeadNet", "events", "digEvents", "bothEvents", "deepEvents", "deepDigEvents", "deepBothEvents"].forEach((f) => { const td = document.querySelector('[data-cell="' + o.uid + ":" + f + '"]'); if (td) td.classList.toggle("is-edited", NP.isEdited(o, f)); });
    ALW.forEach(([key]) => ["pct", "usd"].forEach((kind) => { const td = document.querySelector('[data-cell="' + o.uid + ":alw:" + key + ":" + kind + '"]'); if (td) td.classList.toggle("is-edited", NP.isEdited(o, "alw:" + key)); }));
  }

  /* ===================================================== VIEW 3: RESULTS ===== */
  const BIN_BASIS = { sales: "Sales", units: "Units", agp: "AGP" };
  function renderResults() {
    const host = document.getElementById("npStep4"), map = NP.displayMap(), res = NP.state.res;
    const bins = NP.binsFor(), objId = NP.state.objective;
    const binBy = res.binBy || (["sales", "units", "agp"].includes(objId) ? objId : "sales");
    const all = NP.cat().items, vendors = [...new Set(all.map((o) => o.vendor))];
    let items = all.slice().sort((a, b) => a.vendor === b.vendor ? a.item.localeCompare(b.item) : a.vendor.localeCompare(b.vendor));
    if (res.vendor !== "all") items = items.filter((o) => o.vendor === res.vendor);
    if (res.rog !== "all") items = items.filter((o) => o.rog === res.rog);
    if (res.bin !== "all") items = items.filter((o) => bins[o.uid][binBy] === +res.bin);
    let lastVendor = null, body = "";
    if (!items.length) body = '<div class="np-empty">No NCRCs match these filters.</div>';
    items.forEach((o) => { if (o.vendor !== lastVendor) { lastVendor = o.vendor; body += '<div class="np-rc-vendor">' + esc(o.vendor) + "</div>"; } body += resultCard(o, map, bins, binBy); });
    const sd = exSummaryData(items, map);
    host.innerHTML = exBandHTML(sd) + interactionsPanel(NP.cat()) +
      '<section class="panel np-results-panel">' +
      '<div class="np-results-head">' +
        '<div class="np-rhead-top"><h2 class="np-rhead-title">52-week plan — store &amp; digital tactics</h2>' +
          resultsControls(vendors, binBy) + '<div class="np-legend">' + legend() + "</div></div>" +
        exPinStrip(sd) +
        resultsSummary(map) +
        '<div class="np-rhead-cal">' + monthScale() + eventBand() + "</div>" +
      "</div>" +
      mlegend() + '<div class="np-rc-list">' + body + "</div></section>";
    bindResults(host, binBy);
  }
  function bindResults(host, binBy) {
    host.querySelectorAll(".np-rc-card").forEach((card) => { const uid = card.dataset.uid; bindCtx(card, uid); card.querySelectorAll("[data-flip]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); card.classList.toggle("is-flipped"); }); });
    bindScenarioChips(host);
    const v = host.querySelector("#npResVendor"); if (v) v.onchange = () => { NP.state.res.vendor = v.value; NP.renderAll(); };
    const rg = host.querySelector("#npResRog"); if (rg) rg.onchange = () => { NP.state.res.rog = rg.value; NP.renderAll(); };
    host.querySelectorAll("[data-binby]").forEach((b) => b.onclick = () => { NP.state.res.binBy = b.dataset.binby; NP.renderAll(); });
    host.querySelectorAll("[data-bin]").forEach((b) => b.onclick = () => { NP.state.res.bin = b.dataset.bin; NP.renderAll(); });
    bindInteractions(host);
    bindMonthZoom(host);
    host.querySelectorAll("[data-week]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const p = el.dataset.week.split("|"); openWeek(p[0], p[1], +p[2]); });
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
    return '<span class="np-lg"><i class="np-lg-sw tactic-item"></i>Item Discount</span>' +
      '<span class="np-lg"><i class="np-lg-sw tactic-bxgx"></i>Buy X Get X</span>' +
      '<span class="np-lg"><i class="np-lg-sw tactic-mb"></i>Must Buy</span>' +
      '<span class="np-lg np-lg-mech">Offer <b>%</b> off · <b>$</b> off · <b>@$</b> price point · <b>FREE</b></span>' +
      '<span class="np-lg"><i class="np-lg-d">D</i>digital</span>' +
      '<span class="np-lg"><i class="np-lg-sw np-lg-locked"></i>locked actual</span>';
  }
  function resultsControls(vendors, binBy) {
    const res = NP.state.res;
    const vsel = '<label class="np-res-ctl">Vendor <select id="npResVendor" class="np-res-select"><option value="all">All vendors</option>' + vendors.map((v) => '<option' + (res.vendor === v ? " selected" : "") + ">" + esc(v) + "</option>").join("") + "</select></label>";
    const rogs = [...new Set(NP.cat().items.map((o) => o.rog))].sort();
    const rsel = '<label class="np-res-ctl">ROG <select id="npResRog" class="np-res-select np-rog-select"><option value="all">All ROGs</option>' + rogs.map((r) => '<option' + (res.rog === r ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select></label>";
    const binByCap = '<span class="np-res-ctl">Bin by <span class="plan-obj-capsule">' + Object.keys(BIN_BASIS).map((k) => '<button type="button" class="plan-obj-opt' + (binBy === k ? " active" : "") + '" data-binby="' + k + '">' + BIN_BASIS[k] + "</button>").join("") + "</span></span>";
    const binCap = '<span class="np-res-ctl">Velocity <span class="plan-obj-capsule np-bincap">' + ["all", "1", "2", "3", "4", "5"].map((b) => '<button type="button" class="plan-obj-opt' + (String(res.bin) === b ? " active" : "") + '" data-bin="' + b + '">' + (b === "all" ? "All" : b) + "</button>").join("") + "</span></span>";
    return '<div class="np-rhead-controls">' + vsel + rsel + binByCap + binCap + "</div>";
  }
  function resultsSummary(map) {
    if (!NP.state.scenarios.length) return "";
    const base = totals({}), cur = totals(map), view = NP.state.activeScenario === "base" ? "Base plan" : (NP.state.scenarios.find((s) => s.id === NP.state.activeScenario) || { name: "scenario" }).name;
    const pill = (lab, b, c, money) => { const d = b ? (c - b) / b : 0; return '<span class="np-res-pill"><small>' + lab + '</small><b>' + (money ? fmt.m(c) : fmt.u(c)) + '</b><i class="' + (d >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(d) + "</i></span>"; };
    return '<div class="np-res-summary"><div class="scenario-strip np-res-scen">' + scenarioChips() + '</div><span class="np-res-viewing">Viewing <b>' + view + "</b> · vs base:</span>" + pill("Sales", base.revenueM, cur.revenueM, 1) + pill("Units", base.units, cur.units, 0) + pill("AGP", base.agpM, cur.agpM, 1) + "</div>";
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
    const stats = oc("sales", "Sales", fmt.m(plan.r), plan.r, ly.r) + oc("units", "Units", fmt.u(plan.u), plan.u, ly.u) + oc("agp", "AGP", fmt.m(plan.a), plan.a, ly.a);
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
    return '<div class="np-pin-out" id="npPinOut">' + m("sales", "Sales", fmt.m(sd.plan.r), sd.plan.r, sd.ly.r) + m("units", "Units", fmt.u(sd.plan.u), sd.plan.u, sd.ly.u) + m("agp", "AGP", fmt.m(sd.plan.a), sd.plan.a, sd.ly.a) + '<span class="np-pin-vs">vs last year</span></div>';
  }
  function eventBand() {
    let cells = "";
    for (let w = 0; w < 52; w++) { const ev = NP.RETAIL_EVENTS.find((e) => e.wk === w); cells += ev ? '<span class="np-ev" title="' + esc(ev.label) + '"><i></i><b>' + ev.short + "</b></span>" : '<span class="np-ev-empty"></span>'; }
    return '<div class="np-ev-band">' + cells + "</div>";
  }
  function monthScale() { return '<div class="np-rc-months"><div class="np-rc-monthrow">' + MONTHS.map((mo, i) => '<span class="np-rc-month" data-month="' + i + '" role="button" tabindex="0" title="Zoom into ' + mo + '">' + mo + "</span>").join("") + "</div></div>"; }

  /* ===== month zoom overlay (click a month label) — self-contained; remove the
     [data-month] bindings in bindResults/bindCounterfactual to turn it off ===== */
  function monthWeeks(m) { const a = [], s = Math.round(m * 52 / 12), e = Math.round((m + 1) * 52 / 12); for (let w = s; w < e; w++) a.push(w); return { weeks: a, start: s, end: e }; }
  let _zoom = { m: 0, vendor: "all" };
  function zoomItems() {
    const res = NP.state.res;
    let items = NP.cat().items.slice().sort((a, b) => a.vendor === b.vendor ? a.item.localeCompare(b.item) : a.vendor.localeCompare(b.vendor));
    if (res.rog !== "all") items = items.filter((o) => o.rog === res.rog);
    if (_zoom.vendor !== "all") items = items.filter((o) => o.vendor === _zoom.vendor);
    return items;
  }
  function zoomGridHTML() {
    const map = NP.displayMap(), mw = monthWeeks(_zoom.m), weeks = mw.weeks, items = zoomItems();
    const evOf = (w) => { const e = NP.RETAIL_EVENTS.find((x) => x.wk === w); return e ? '<small>' + esc(e.short) + "</small>" : ""; };
    const km = (vM) => { const k = vM * 1000; return Math.abs(k) >= 1000 ? "$" + (k / 1000).toFixed(2) + "M" : "$" + Math.round(k) + "K"; };
    const head = '<tr><th class="np-zm-ncrch">NCRC</th>' + weeks.map((w) => '<th class="np-zm-wkh">Wk ' + (w + 1) + evOf(w) + "</th>").join("") + "</tr>";
    const metric = (lab, ty, ly, f) => { const d = ty - ly, p = ly ? d / ly : 0; return '<span class="np-zm-l">' + lab + '</span><b class="np-zm-v">' + f(ty) + '</b><span class="np-zm-d">LY ' + f(ly) + " · " + (d >= 0 ? "+" : "") + f(d) + " / " + fmt.pctPlain(p) + "</span>"; };
    // a couple of exception NCRCs hold allowance but no promo is planned — flag those
    const wasted = new Set(NP.cat().items.slice().sort((a, b) => a.recEvents - b.recEvents).slice(0, 2).map((o) => o.uid));
    const cardCell = (s, wk, w, alwU, isWasted) => {
      const c = wk[w], alw = "alw " + fmt.price(alwU) + "/u";
      let tac, cls;
      if (c.promoted) { tac = '<span class="np-zoom-tac tactic-' + c.store.className + '">' + NP.displayTactic(c.store.code) + "</span>" + (c.offer ? " " + esc(c.offer.label) : "") + (c.digital && c.digital.length ? ' <span class="np-zoom-d">D</span>' : "") + " · " + fmt.pctPlain(c.depth, 0) + " off · " + alw; cls = ""; }
      else if (isWasted) { tac = '<span class="np-zm-warn" title="Allowance committed but no promotion planned">⚠</span> <span class="np-zm-na">no promo</span> · ' + alw; cls = " np-zm-warncell"; }
      else { tac = '<span class="np-zm-na">no promo</span>'; cls = " np-zm-off"; }
      return '<td class="np-zm-cell' + cls + '"><div class="np-zm-card">' + metric("Sales", s.sales[w], s.lySales[w], km) + metric("Units", s.units[w], s.lyUnits[w], fmt.u) + metric("AGP", s.agp[w], s.lyAgp[w], km) + '<div class="np-zm-tac">' + tac + "</div></div></td>";
    };
    const rows = items.map((o) => {
      const s = NP.weeklySeries(o, map), wk = NP.weekPlan(o, map, false), e = NP.effective(o, map), alwU = e.vlc - e.deadNet, iw = wasted.has(o.uid);
      return '<tr><th class="np-zm-ncrch"><b>' + esc(o.item) + '</b><span class="np-rc-size">' + esc(o.pack) + '</span><span class="np-rc-id">' + o.ncrc + "</span></th>" + weeks.map((w) => cardCell(s, wk, w, alwU, iw)).join("") + "</tr>";
    }).join("");
    return '<table class="np-zm-grid"><thead>' + head + "</thead><tbody>" + rows + "</tbody></table>";
  }
  function renderZoomBody() { const b = document.querySelector("#npZoom .np-zoom-body"); if (b) b.innerHTML = zoomGridHTML(); }
  function openMonthZoom(m) {
    _zoom = { m: m, vendor: NP.state.res.vendor || "all" };
    const mw = monthWeeks(m), vendors = [...new Set(NP.cat().items.map((o) => o.vendor))].sort();
    const vsel = '<label class="np-zoom-vfilter">Vendor <select id="npZoomVendor"><option value="all">All vendors</option>' +
      vendors.map((v) => "<option" + (_zoom.vendor === v ? " selected" : "") + ">" + esc(v) + "</option>").join("") + "</select></label>";
    let scrim = document.getElementById("npZoomScrim"), panel = document.getElementById("npZoom");
    if (!scrim) { scrim = document.createElement("div"); scrim.id = "npZoomScrim"; scrim.className = "np-zoom-scrim"; document.body.appendChild(scrim); }
    if (!panel) { panel = document.createElement("div"); panel.id = "npZoom"; panel.className = "np-zoom"; document.body.appendChild(panel); }
    panel.innerHTML = '<header class="np-zoom-head"><div><h3>' + MONTHS[m] + ' — zoom</h3><small>Weeks ' + (mw.start + 1) + "–" + mw.end + " · primary tactic, week by week</small></div>" +
      '<div class="np-zoom-head-r">' + vsel + '<button class="np-zoom-close" type="button" aria-label="Close">×</button></div></header>' +
      '<div class="np-zoom-body">' + zoomGridHTML() + "</div>";
    scrim.hidden = false; panel.hidden = false; document.body.classList.add("np-noscroll");
    requestAnimationFrame(() => panel.classList.add("is-open"));
    panel.querySelector(".np-zoom-close").onclick = closeMonthZoom;
    panel.querySelector("#npZoomVendor").onchange = (e) => { _zoom.vendor = e.target.value; renderZoomBody(); };
    scrim.onclick = closeMonthZoom;
    document.addEventListener("keydown", zoomKey);
  }
  function zoomKey(e) { if (e.key === "Escape") closeMonthZoom(); }
  function closeMonthZoom() {
    const scrim = document.getElementById("npZoomScrim"), panel = document.getElementById("npZoom");
    if (panel) { panel.classList.remove("is-open"); panel.hidden = true; }
    if (scrim) scrim.hidden = true;
    document.body.classList.remove("np-noscroll");
    document.removeEventListener("keydown", zoomKey);
  }
  function bindMonthZoom(host) { host.querySelectorAll("[data-month]").forEach((el) => el.onclick = () => openMonthZoom(+el.dataset.month)); }
  function binBadge(o, bins, binBy) { const b = bins[o.uid][binBy]; return '<span class="np-bin np-bin-' + b + '" title="' + BIN_BASIS[binBy] + " bin " + b + ' (1 = top)">Bin ' + b + "</span>"; }
  function roleOf(o) { if (o.hero) return ["Headline", "head"]; if (o.form === "tub") return ["Seasonal", "seas"]; if (o.bin === 1) return ["KVI", "kvi"]; if (o.bin === 2) return ["Traffic", "traf"]; if (o.bin === 3) return ["Profit", "prof"]; return ["Background", "bg"]; }
  function roleBadge(o) { const r = roleOf(o); return '<span class="np-role np-role-' + r[1] + '" title="Item role">' + r[0] + "</span>"; }
  function nameBlock(o, bins, binBy, trailing, mid) { return '<div class="np-rc-name"><b class="np-rc-item">' + esc(o.item) + '</b><span class="np-rc-size">' + esc(o.pack) + '</span><span class="np-rc-id">' + o.ncrc + "</span>" + (mid || "") + binBadge(o, bins, binBy) + roleBadge(o) + (trailing || "") + "</div>"; }
  // inline Units / Revenue / AGP values (order fixed; labels shown once via mlegend()).
  // Each: value (LY value · Δ#/$ / Δ%) — no "+" signs, "/" divides the Δ amount and Δ%.
  function inlineMetrics(plan, ly) {
    const u = fmt.u, m = fmt.m, pp = fmt.pctPlain;
    const dU = plan.units - ly.units, dR = plan.revenueM - ly.revenueM, dA = plan.agpM - ly.agpM;
    const pU = ly.units ? dU / ly.units : 0, pR = ly.revenueM ? dR / ly.revenueM : 0, pA = ly.agpM ? dA / ly.agpM : 0;
    const cell = (val, lyv, dStr, p) => '<span class="np-rc-m"><b class="np-rc-m-v">' + val + '</b> <span class="np-rc-m-ly">(LY ' + lyv + " · " + dStr + " / " + pp(p) + ")</span></span>";
    return '<div class="np-rc-inline">' +
      cell(u(plan.units), u(ly.units), u(dU), pU) +
      cell(m(plan.revenueM), m(ly.revenueM), m(dR), pR) +
      cell(m(plan.agpM), m(ly.agpM), m(dA), pA) + "</div>";
  }
  // labels shown once above the list (not repeated per card)
  function mlegend() {
    return '<div class="np-rc-mlegend">Per NCRC vs LY · <b>Units</b> · <b>Sales</b> · <b>AGP</b> — value <span class="np-rc-mleg-mut">(LY · Δ / Δ%)</span></div>';
  }
  // single column header — Units/Revenue/AGP labels once, aligned over the card totals
  function colHead() {
    return '<div class="np-rc-colhead"><span class="np-rc-colhead-name"></span>' +
      '<div class="np-rc-totals"><span class="np-rc-kv-h">Units</span><span class="np-rc-kv-h">Revenue</span><span class="np-rc-kv-h">AGP</span><span class="np-rc-flip-sp" aria-hidden="true"></span></div></div>';
  }
  function resultCard(o, map, bins, binBy) {
    const plan = NP.resultFor(o, map), ly = NP.lyResult(o);
    const wk = NP.weekPlan(o, map, false), evWeeks = new Set(NP.RETAIL_EVENTS.map((e) => e.wk));
    const cells = wk.map((c, w) => weekCell(c, evWeeks.has(w), o.uid, "plan")).join("");
    return '<div class="np-rc-card" data-uid="' + o.uid + '"><div class="np-rc-inner">' +
      '<div class="np-rc-face np-rc-front"><div class="np-rc-info"><div class="np-rc-headline">' + nameBlock(o, bins, binBy, apprBadge(o, wk), inlineMetrics(plan, ly)) +
      '</div><button class="np-flip-btn" type="button" data-flip title="Flip — sparklines vs last year" aria-label="Flip card">⟳</button></div>' +
      '<div class="np-rc-ribbon">' + cells + "</div></div>" +
      '<div class="np-rc-face np-rc-back"><div class="np-rc-info">' + nameBlock(o, bins, binBy, '<span class="np-rc-backlbl">vs last year</span>') + '<button class="np-flip-btn" type="button" data-flip title="Back to plan" aria-label="Flip back">⟲</button></div>' +
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
      block("sales", "Sales", s.sales, s.lySales, "money", s.plan.revenueM, s.ly.revenueM, SPARK_COLOR.sales) +
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
    const base = NP.LADDER_KEYS.reduce((s, k) => s + (l[k] || 0), 0), wob = base ? total / base : 1;
    const pf = (v) => v > 0.0005 ? (v * 100).toFixed(1) + "%" : "—";
    const grp = (title, rows) => '<div class="np-tip-g">' + title + "</div>" + rows.map(([n, v]) => '<div class="np-tip-row"><span>' + n + "</span><span>" + pf(v * wob) + "</span></div>").join("");
    return '<div class="np-tip-h">Wk ' + (idx + 1) + " · allowance % of VLC</div>" +
      grp("Buying", [["Off-invoice", l.offInvoice], ["Bill back", l.billBack], ["Price break", l.priceBreak], ["Freight", l.freight]]) +
      grp("Retail", NP.RETAIL_KEYS.map((k) => [RETAIL_LABEL[k], l[k] || 0])) +
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
    const host = document.getElementById("npStep6"), ds = window.NP_EXPLAIN;
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

  /* ============================================== VIEW 4: COUNTERFACTUAL ===== */
  function clustersOf(c) { const m = {}; c.items.forEach((o) => { (m[o.cluster] = m[o.cluster] || []).push(o); }); return m; }
  function tcase(s) { return (s || "").replace(/\w\S*/g, (t) => t.charAt(0) + t.slice(1).toLowerCase()); }
  // vendor share of the category (by the optimised plan), sorted high→low by sales
  function vendorStats() {
    const map = NP.displayMap(), byV = {}; let totS = 0, totU = 0;
    NP.cat().items.forEach((o) => { const r = NP.resultFor(o, map), v = byV[o.vendor] || (byV[o.vendor] = { vendor: o.vendor, sales: 0, units: 0 }); v.sales += r.revenueM; v.units += r.units; totS += r.revenueM; totU += r.units; });
    return Object.keys(byV).map((k) => { const v = byV[k]; return { vendor: k, sales: v.sales, units: v.units, salesPct: totS ? v.sales / totS : 0, unitsPct: totU ? v.units / totU : 0 }; }).sort((a, b) => b.sales - a.sales);
  }
  function ownVendor(vs) { return vs.find((v) => /OWN/i.test(v.vendor)); }
  function favouredVendors(strategy) {
    const vs = vendorStats();
    if (strategy === "top1") return vs[0] ? [vs[0].vendor] : [];
    if (strategy === "top2") return vs.slice(0, 2).map((v) => v.vendor);
    if (strategy === "ownbrands") { const o = ownVendor(vs); return o ? [o.vendor] : []; }
    return [];
  }
  function cfStrategies() {
    const vs = vendorStats(), top1 = vs[0], top2 = vs.slice(0, 2), own = ownVendor(vs);
    const share = (label, sp, up) => label + " · " + Math.round(sp * 100) + "% of sales · " + Math.round(up * 100) + "% of units";
    const t2s = top2.reduce((s, v) => s + v.salesPct, 0), t2u = top2.reduce((s, v) => s + v.unitsPct, 0);
    return [
      { id: "optimized", name: "Optimised", tag: "recommended", desc: "Best {obj} across all vendors — demand, key weeks, halo & cannibalisation balanced inside the 22 guardrails. The Step-3 plan." },
      { id: "top1", name: top1 ? "Favour " + tcase(top1.vendor) : "Favour top vendor", desc: top1 ? share(tcase(top1.vendor), top1.salesPct, top1.unitsPct) : "" },
      { id: "top2", name: "Favour top 2 vendors", desc: top2.length ? share(top2.map((v) => tcase(v.vendor)).join(" + "), t2s, t2u) : "" },
      { id: "ownbrands", name: "Push own brands", desc: own ? share(tcase(own.vendor), own.salesPct, own.unitsPct) : "No own-brand vendor in this category." },
      { id: "matchly", name: "Last year", desc: "Same weeks & event count as last year — the comparison floor, so the lift from Optimised is obvious." }
    ];
  }
  function cfStratName(id) { const s = cfStrategies().find((x) => x.id === id); return s ? s.name : id; }
  // 52-week placement cells for an NCRC under a strategy
  function cfWeeks(o, strategy) {
    if (strategy === "matchly") return NP.weekPlan(o, null, true);
    const wk = NP.weekPlan(o, NP.displayMap(), false);
    if (strategy === "optimized") return wk;
    // favour strategies: favoured vendors keep the full optimised cadence; others are thinned out
    if (favouredVendors(strategy).indexOf(o.vendor) >= 0) return wk;
    const promo = []; wk.forEach((c, i) => { if (c.promoted) promo.push(i); });
    const drop = new Set(); promo.forEach((idx, k) => { if (k % 5 < 2) drop.add(idx); });
    return wk.map((c, i) => drop.has(i) ? Object.assign({}, c, { promoted: false, store: NP.STORE_TACTICS.NONE, digital: [], offer: null, depth: 0 }) : c);
  }
  function cfResult(o, strategy) {
    if (strategy === "optimized") return NP.resultFor(o, NP.displayMap());
    if (strategy === "matchly") return NP.lyResult(o);
    const isFav = favouredVendors(strategy).indexOf(o.vendor) >= 0, e = NP.effective(o, NP.displayMap());
    if (isFav) return NP.respond(o, { events: Math.min(e.events + 3, 26), depth: e.depth + 0.02, deadNet: e.deadNet, seasonGain: 1.07, cannib: 0.04, halo: 0.085 });
    const ev = cfWeeks(o, strategy).filter((c) => c.promoted).length;
    return NP.respond(o, { events: ev, depth: e.depth, deadNet: e.deadNet, seasonGain: 1.02, cannib: 0.10, halo: 0.03 });
  }
  function cfTotals(strategy) { const t = { units: 0, revenueM: 0, agpM: 0 }; NP.cat().items.forEach((o) => { const r = cfResult(o, strategy); t.units += r.units; t.revenueM += r.revenueM; t.agpM += r.agpM; }); return t; }
  function totObj(t) { const m = NP.objMeta().id; return m === "units" ? t.units : m === "agp" ? t.agpM : t.revenueM; }

  function renderCounterfactual() {
    const host = document.getElementById("npStep5"), c = NP.cat(), cf = NP.state.cf;
    host.innerHTML =
      '<section class="panel"><div class="panel-heading"><div><h2>Counterfactuals — how events distribute across the year</h2>' +
      '<p>Pick a distribution strategy: see its category outcome and where every vendor/NCRC promotes. Items in a cluster <strong>cannibalise</strong> and share <strong>halo</strong>, so timing changes the result.</p></div></div>' +
      stratCards(cf) + "</section>" +
      (cf.strategy === "optimized" ? interactionsPanel(c) : "") +
      placementSection(c, cf);
    bindCounterfactual(host);
  }
  function clustersCollapsible(c, cf) {
    const clusters = clustersOf(c), open = cf.clustersOpen;
    const grid = open ? '<div class="np-cluster-grid">' + Object.keys(clusters).map((k) => { const m = clusters[k]; return '<div class="np-cluster"><div class="np-cluster-head"><b>' + (NP.CLUSTER_LABEL[k] || k) + "</b><span>" + m.length + " NCRCs</span></div><div class=\"np-cluster-members\">" + m.map((o) => '<span class="np-chip np-chip-' + o.form + '">' + esc(o.brand) + "</span>").join("") + "</div></div>"; }).join("") + "</div>" : "";
    return '<div class="np-cf-clusters"><button type="button" class="np-collapse-btn" data-clust>' + (open ? "▾" : "▸") + " NCRC clusters — grouped by learned halo &amp; cannibalisation</button>" + grid + "</div>";
  }
  function stratCards(cf) {
    const objS = NP.objMeta().short, strategies = cfStrategies(), tot = {};
    strategies.forEach((s) => { tot[s.id] = cfTotals(s.id); });
    const floorObj = totObj(tot.matchly);
    const cards = strategies.map((s) => {
      const t = tot[s.id], lift = floorObj ? (totObj(t) - floorObj) / floorObj : 0;
      const badge = s.id === "matchly" ? '<span class="np-strat-lift" style="color:var(--muted)">Comparison floor</span>' : '<span class="np-strat-lift ' + (lift >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(lift) + " " + objS + " vs LY</span>";
      return '<button type="button" class="np-strat-card' + (cf.strategy === s.id ? " is-active" : "") + '" data-strat="' + s.id + '">' +
        '<div class="np-strat-name">' + s.name + (s.tag ? ' <span class="np-strat-tag">' + s.tag + "</span>" : "") + "</div>" +
        "<p>" + s.desc.replace("{obj}", objS) + "</p>" +
        '<div class="np-strat-metrics"><div class="np-strat-orow"><span>Revenue</span><b>' + fmt.m(t.revenueM) + '</b></div><div class="np-strat-orow"><span>Units</span><b>' + fmt.u(t.units) + '</b></div><div class="np-strat-orow"><span>AGP</span><b>' + fmt.m(t.agpM) + "</b></div></div>" + badge + "</button>";
    }).join("");
    return '<div class="np-strat-cards">' + cards + '</div>' +
      '<p class="np-cf-vendnote">Strategies tilt the plan toward vendors from this category’s line-up. For categories like produce, vendors are replaced by supply types — <strong>Organic · Conventional · Local</strong>.</p>';
  }
  // item-level proof of learned interactions, read straight off the optimised 52-week plan below
  function ixController() {
    const ix = NP.state.ix;
    const cap = (label, opts, attr, cur) => '<span class="np-ix-ctl"><span class="np-ix-ctl-lbl">' + label + '</span><span class="wpl-metric-capsule wpl-metric-capsule-sm">' +
      opts.map((o) => '<button type="button" class="wpl-capsule-opt' + (String(cur) === o[0] ? " active" : "") + '" ' + attr + '="' + o[0] + '">' + o[1] + "</button>").join("") + "</span></span>";
    const velocity = cap("Velocity", [["sales", "Sales"], ["units", "Units"]], "data-ixbinby", ix.binBy);
    const bin = cap("Bin", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["all", "All"]], "data-ixbin", ix.bin);
    const search = '<span class="np-ix-search"><svg viewBox="0 0 24 24" class="np-ix-searchicon" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>' +
      '<input id="npIxSearch" type="text" placeholder="Find an NCRC or item…" value="' + esc(ix.ncrc || "") + '">' +
      (ix.ncrc ? '<button type="button" class="np-ix-clear" data-ixclear aria-label="Clear">×</button>' : "") + "</span>";
    return '<div class="np-ix-controls">' + velocity + bin + search + "</div>";
  }
  function interactionsPanel(c) {
    const map = NP.displayMap(), ix = NP.state.ix, bins = NP.binsFor(), ranked = NP.rankedClusters(), keys = Object.keys(ranked);
    const rankOf = {}; keys.forEach((k) => ranked[k].forEach((o, r) => (rankOf[o.uid] = r)));
    const q = (ix.ncrc || "").trim().toLowerCase();
    // focal items: an NCRC/item search wins; otherwise the chosen velocity bin
    const focal = q
      ? c.items.filter((o) => (o.ncrc + "").toLowerCase().includes(q) || o.item.toLowerCase().includes(q) || o.brand.toLowerCase().includes(q))
      : c.items.filter((o) => ix.bin === "all" || bins[o.uid][ix.binBy] === +ix.bin);
    // pair each focal item with its halo complement (same rank, different cluster — they share anchor
    // weeks in the real plan) and its cannibalisation rival (same cluster). Lanes read the plan directly.
    const halo = [], cann = [], seenH = {}, seenC = {};
    focal.forEach((o) => {
      const r = rankOf[o.uid];
      const others = keys.filter((k) => k !== o.cluster && ranked[k].length);
      if (others.length) { const ck = others[NP.util.hashStr(o.uid) % others.length], cm = ranked[ck], comp = cm[Math.min(r, cm.length - 1)]; const key = [o.uid, comp.uid].sort().join("|"); if (comp.uid !== o.uid && !seenH[key]) { seenH[key] = 1; halo.push({ a: o, b: comp }); } }
      const mates = (ranked[o.cluster] || []).filter((x) => x.uid !== o.uid);
      if (mates.length) { const rv = mates[NP.util.hashStr(o.uid + "r") % mates.length], key = [o.uid, rv.uid].sort().join("|"); if (!seenC[key]) { seenC[key] = 1; cann.push({ a: o, b: rv }); } }
    });
    const haloRows = halo.map((p) => ixPair(p.a, p.b, "halo", map)).join("");
    const cannRows = cann.map((p) => ixPair(p.a, p.b, "cann", map)).join("");
    const scope = q ? '<b>' + focal.length + '</b> item' + (focal.length === 1 ? "" : "s") + ' matching “' + esc(ix.ncrc) + '”'
      : '<b>' + focal.length + '</b> item' + (focal.length === 1 ? "" : "s") + ' · ' + BIN_BASIS[ix.binBy] + ' velocity · ' + (ix.bin === "all" ? "all bins" : "bin&nbsp;" + ix.bin + " (top = 1)");
    const open = !!NP.state.ix.open;
    return '<section class="panel np-ix-panel"><div class="np-ix"><div class="np-ix-top">' +
        '<div class="np-ix-titlewrap"><div><h2 class="np-ix-h">How the optimiser handled item interactions</h2>' +
        '<p class="np-ix-sub">Read across the same items in the plan below — <b>bar height = discount depth</b>. See where the plan co-promotes complements and where it separates rivals or offsets their depths.</p></div></div>' +
        '<div class="np-ix-headline"><div class="np-ix-stat np-ix-stat-h"><b>' + halo.length + '</b><small>complement pairs co-promoted for halo</small></div>' +
        '<div class="np-ix-stat np-ix-stat-c"><b>' + cann.length + '</b><small>rival pairs depth-balanced &amp; separated</small></div>' +
        '<button type="button" class="np-ix-toggle" data-ixtoggle aria-expanded="' + open + '">' + (open ? "Hide details ▴" : "Show details ▾") + "</button></div></div>" +
      '<div class="np-ix-body"' + (open ? "" : " hidden") + ">" +
      '<div class="np-ix-bar"><p class="np-ix-scope">Showing ' + scope + ' · ' + esc(c.name || "category") + "</p>" + ixController() + "</div>" +
      '<div class="np-ix-cols"><div class="np-ix-col np-ix-halo"><h5>Paired up to capture halo</h5>' + (haloRows || '<p class="np-foot">No complement pairs for this filter.</p>') + "</div>" +
        '<div class="np-ix-col np-ix-cann"><h5>Managed to avoid cannibalisation</h5>' + (cannRows || '<p class="np-foot">No rival pairs for this filter.</p>') + "</div></div>" +
        '<div class="np-ix-key"><span><i class="np-ix-dot a"></i>top band = first item</span><span><i class="np-ix-dot b"></i>bottom band = second item</span><span><i class="np-ix-keybar"></i>taller bar = deeper discount</span><span><i class="np-ix-keyboth"></i>shared week (depths offset)</span></div>' +
      "</div></div></section>";
  }
  function bindInteractions(host) {
    host.querySelectorAll("[data-ixtoggle]").forEach((b) => b.onclick = () => { NP.state.ix.open = !NP.state.ix.open; NP.renderAll(); });
    host.querySelectorAll("[data-ixbinby]").forEach((b) => b.onclick = () => { NP.state.ix.binBy = b.dataset.ixbinby; NP.state.ix.ncrc = ""; NP.renderAll(); });
    host.querySelectorAll("[data-ixbin]").forEach((b) => b.onclick = () => { NP.state.ix.bin = b.dataset.ixbin; NP.state.ix.ncrc = ""; NP.renderAll(); });
    host.querySelectorAll("[data-ixclear]").forEach((b) => b.onclick = () => { NP.state.ix.ncrc = ""; NP.renderAll(); });
    const s = host.querySelector("#npIxSearch");
    if (s) s.oninput = () => { NP.state.ix.ncrc = s.value; NP.renderAll(); const n = document.getElementById("npIxSearch"); if (n) { n.focus(); const v = n.value; try { n.setSelectionRange(v.length, v.length); } catch (e) {} } };
  }
  function ixItemLbl(o) { return '<span class="np-ix-item"><b>' + esc(o.item) + '</b><span class="np-ix-ncrc">' + o.ncrc + "</span></span>"; }
  // reads the REAL optimised plan for both items — a literal readout of the grid below
  function ixPair(a, b, kind, map) {
    const wa = NP.weekPlan(a, map, false), wb = NP.weekPlan(b, map, false);
    const dA = {}, dB = {};
    let shared = 0, offset = false;
    for (let w = 0; w < 52; w++) {
      if (wa[w].promoted) dA[w] = wa[w].depth;
      if (wb[w].promoted) dB[w] = wb[w].depth;
      if (wa[w].promoted && wb[w].promoted) { shared++; if (Math.abs(wa[w].depth - wb[w].depth) > 0.12) offset = true; }
    }
    const eff = (kind === "halo" ? 1.6 : 0.9) + (NP.util.hashStr(a.uid + b.uid) % 24) / 10;
    const effTxt = kind === "halo" ? "+" + eff.toFixed(1) + "% attach lift" : "−" + eff.toFixed(1) + "% switch loss";
    const verdict = kind === "halo"
      ? (shared ? shared + " weeks co-promoted" : "different windows")
      : (shared ? shared + " shared wk" + (shared > 1 ? "s" : "") + (offset ? " · depths offset" : "") : "fully separated");
    return '<div class="np-ix-pair"><div class="np-ix-pinfo">' +
      '<i class="np-ix-dot a"></i>' + ixItemLbl(a) +
      '<span class="np-ix-op">' + (kind === "halo" ? "+" : "⇔") + "</span>" +
      '<i class="np-ix-dot b"></i>' + ixItemLbl(b) +
      '<span class="np-ix-eff ' + (kind === "halo" ? "np-pos" : "np-ix-avoid") + '">' + effTxt + "</span>" +
      '<span class="np-ix-verdict">' + verdict + "</span></div>" + ixLane(dA, dB) + "</div>";
  }
  function ixLane(dA, dB) {
    let cells = "";
    for (let w = 0; w < 52; w++) {
      const da = dA[w] || 0, db = dB[w] || 0;
      const ha = da ? Math.round(Math.max(0.4, Math.min(1, da / 0.4)) * 50) : 0;
      const hb = db ? Math.round(Math.max(0.4, Math.min(1, db / 0.4)) * 50) : 0;
      const tip = "Wk " + (w + 1) + (da ? " · top " + Math.round(da * 100) + "% off" : "") + (db ? " · bottom " + Math.round(db * 100) + "% off" : "");
      cells += '<span class="np-ix-c' + (da && db ? " both" : "") + '" style="--ha:' + ha + "%;--hb:" + hb + '%" title="' + esc(tip) + '"></span>';
    }
    return '<div class="np-ix-lane">' + cells + "</div>";
  }
  // shared clickable week cell for both the 52-week plan (ctx 'plan') and counterfactual (ctx 'cf')
  function weekCell(c, isEv, uid, ctx) {
    const ev = isEv ? " np-wk-ev" : "";
    if (!c.promoted) return '<span class="np-wk np-wk-none' + (c.locked ? " np-wk-locked" : "") + ev + '" title="Wk ' + c.week + ' · no promo"></span>';
    const ap = NP.state.cf.approved[uid + ":" + c.week] ? " np-wk-lock" : "", lk = c.locked ? " np-wk-locked" : "";
    const mechL = c.mech ? NP.MECH_LABEL[c.mech] : "";
    const tip = "Wk " + c.week + " · " + c.store.name + " · " + c.offer.label + (mechL ? " (" + mechL + " " + c.val + ")" : "") + " · " + (c.depth * 100).toFixed(0) + "% off" + (c.digital.length ? " · digital" : "") + (c.locked ? " · actual" : ap ? " · locked into plan" : "") + " · click for detail";
    return '<span class="np-wk np-wk-click tactic-' + c.store.className + lk + ev + ap + '" data-week="' + ctx + "|" + uid + "|" + c.week + '" title="' + esc(tip) + '">' + (c.val ? '<span class="np-wk-val">' + esc(c.val) + "</span>" : "") + (c.digital.length ? '<i class="np-wk-d">D</i>' : "") + "</span>";
  }
  function apprBadge(o, wk) {
    const events = wk.filter((c) => c.promoted).length, n = wk.filter((c) => c.promoted && NP.state.cf.approved[o.uid + ":" + c.week]).length;
    return n ? '<span class="np-cw-rowlock' + (n === events ? " all" : "") + '" title="Locked weeks">' + (n === events ? "🔒 all locked" : "🔒 " + n + "/" + events + " locked") + "</span>" : "";
  }
  function placementSection(c, cf) {
    const stratName = cfStratName(cf.strategy), tot = cfTotals(cf.strategy);
    const evWeeks = new Set(NP.RETAIL_EVENTS.map((e) => e.wk));
    const items = c.items.slice().sort((a, b) => a.vendor === b.vendor ? a.item.localeCompare(b.item) : a.vendor.localeCompare(b.vendor));
    let body = "", lastVendor = null;
    items.forEach((o) => { if (o.vendor !== lastVendor) { lastVendor = o.vendor; body += '<div class="np-rc-vendor">' + esc(o.vendor) + "</div>"; } body += cfRow(o, cf.strategy, evWeeks); });
    const stat = (l, v) => '<span class="np-cf-stat"><small>' + l + "</small>" + v + "</span>";
    return '<section class="panel np-results-panel"><div class="np-results-head np-cf-head">' +
      '<div class="np-rhead-top"><h3 class="np-rhead-title">52-week placement — ' + stratName + "</h3>" +
        '<div class="np-cf-headtot">' + stat("Sales", fmt.m(tot.revenueM)) + stat("Units", fmt.u(tot.units)) + stat("AGP", fmt.m(tot.agpM)) + "</div>" +
        '<div class="np-legend">' + legend() + "</div></div>" +
        '<p class="np-cf-subnote">Click any week to see — and approve — its deal.</p>' +
        '<div class="np-rhead-cal">' + monthScale() + eventBand() + "</div></div>" +
      mlegend() + '<div class="np-rc-list">' + body + "</div></section>";
  }
  function cfRow(o, strategy, evWeeks) {
    const wk = cfWeeks(o, strategy), res = cfResult(o, strategy), ly = NP.lyResult(o);
    const cells = wk.map((c, w) => weekCell(c, evWeeks.has(w), o.uid, "cf")).join("");
    const appr = apprBadge(o, wk), sizeTag = '<span class="np-rc-size">' + esc(o.pack) + "</span>";
    const nameFront = '<div class="np-rc-name"><b class="np-rc-item">' + esc(o.item) + "</b>" + sizeTag + '<span class="np-rc-id">' + o.ncrc + "</span>" + inlineMetrics(res, ly) + appr + "</div>";
    const nameBack = '<div class="np-rc-name"><b class="np-rc-item">' + esc(o.item) + "</b>" + sizeTag + '<span class="np-rc-id">' + o.ncrc + '</span><span class="np-rc-backlbl">vs last year</span></div>';
    return '<div class="np-rc-card np-cf-rowcard" data-uid="' + o.uid + '"><div class="np-rc-inner">' +
      '<div class="np-rc-face np-rc-front"><div class="np-rc-info"><div class="np-rc-headline">' + nameFront +
      '</div><button class="np-flip-btn" type="button" data-flip title="Flip — sparklines vs last year" aria-label="Flip card">⟳</button></div>' +
      '<div class="np-rc-ribbon">' + cells + "</div></div>" +
      '<div class="np-rc-face np-rc-back"><div class="np-rc-info">' + nameBack + '<button class="np-flip-btn" type="button" data-flip title="Back to plan" aria-label="Flip back">⟲</button></div>' +
      backFace(o, NP.displayMap()) + "</div></div></div>";
  }
  // per-NCRC, per-week unified detail — works for both the 52-week plan (ctx 'plan') and counterfactual (ctx 'cf')
  function openWeek(ctx, uid, week) {
    const o = NP.cat().items.find((x) => x.uid === uid); if (!o) return;
    const isCf = ctx === "cf";
    const planLabel = isCf ? cfStratName(NP.state.cf.strategy)
      : (NP.state.activeScenario === "base" ? "Optimised plan" : (NP.state.scenarios.find((s) => s.id === NP.state.activeScenario) || { name: "scenario" }).name);
    const wk = isCf ? cfWeeks(o, NP.state.cf.strategy) : NP.weekPlan(o, NP.displayMap(), false);
    const c = wk[week - 1]; if (!c || !c.promoted) return;
    const locked = !!c.locked, akey = uid + ":" + week;
    const e = NP.effective(o, NP.displayMap()), l = e.ladder, vlc = e.vlc;
    const f = 1 + Math.sin((week / 52) * Math.PI * 3 + NP.util.hashStr(o.uid)) * 0.03 + Math.sin(week * 0.5) * 0.01;
    const off = vlc * l.offInvoice * f, bb = vlc * l.billBack * f, pb = vlc * l.priceBreak * f, fr = vlc * l.freight * f;
    const retRows = NP.RETAIL_KEYS.map((k) => [RETAIL_LABEL[k], vlc * (l[k] || 0) * f]);
    const totBuy = off + bb + pb, net = vlc * f - totBuy - fr, totRet = retRows.reduce((s, r) => s + r[1], 0), dead = net - totRet;
    const res = isCf ? cfResult(o, NP.state.cf.strategy) : NP.resultFor(o, NP.displayMap());
    const lyR = NP.lyResult(o), curve = NP.CURVE[o.form] || NP.CURVE.bar, psum = wk.filter((x) => x.promoted).reduce((s, x) => s + curve[x.week - 1], 0) || 1, share = curve[week - 1] / psum;
    const dig = c.digital && c.digital.length ? c.digital.map((d) => NP.DIGITAL_NAMES[d]).join(", ") : "—", m = (v) => "$" + v.toFixed(2);
    const base = o.basePrice, promo = NP.promoPriceOf(o, c.depth), mb = (c.offer && c.offer.store === "BXGX") ? "1/2" : "1/6";
    const dpresent = c.digital && c.digital.length, digName = dpresent ? dig : "—", digDepth = Math.min(0.5, c.depth + 0.06), digPromo = NP.promoPriceOf(o, digDepth);
    const trow = (lab, s, d) => '<tr><td class="np-l">' + lab + "</td><td>" + s + "</td><td>" + d + "</td></tr>";
    const kU = (v) => Math.round(v).toLocaleString() + "K", kM = (v) => "$" + Math.round(v * 1000).toLocaleString() + "K";
    const lrow = (a, v, cls) => '<div class="np-cw-lrow' + (cls ? " " + cls : "") + '"><span>' + a + "</span><span>" + m(v) + "</span></div>";
    const d2 = (p, suf) => '<span class="np-cw-d ' + (p >= 0 ? "np-pos" : "np-neg") + '">' + fmt.pct(p) + " " + suf + "</span>";
    const card = (a, big, s1, s2) => '<div class="np-cw-stat"><small>' + a + '</small><b>' + big + "</b>" + s1 + s2 + "</div>";
    const noise = (k) => ((NP.util.hashStr(o.uid) + week * 13 + k) % 7 - 3) / 100;
    const uF = res.units * share, sF = res.revenueM * share, aF = res.agpM * share, uL = lyR.units * share, sL = lyR.revenueM * share, aL = lyR.agpM * share;
    let fc;
    if (locked) {
      const uA = uF * (1 + noise(1)), sA = sF * (1 + noise(2)), aA = aF * (1 + noise(3));
      fc = card("Units", kU(uA), d2(uF ? (uA - uF) / uF : 0, "vs forecast"), d2(uL ? (uA - uL) / uL : 0, "vs LY")) +
        card("Sales", kM(sA), d2(sF ? (sA - sF) / sF : 0, "vs forecast"), d2(sL ? (sA - sL) / sL : 0, "vs LY")) +
        card("AGP", kM(aA), d2(aF ? (aA - aF) / aF : 0, "vs forecast"), d2(aL ? (aA - aL) / aL : 0, "vs LY"));
    } else {
      fc = card("Units", kU(uF), d2(uL ? (uF - uL) / uL : 0, "vs LY"), '<span class="np-cw-ly">LY ' + kU(uL) + "</span>") +
        card("Sales", kM(sF), d2(sL ? (sF - sL) / sL : 0, "vs LY"), '<span class="np-cw-ly">LY ' + kM(sL) + "</span>") +
        card("AGP", kM(aF), d2(aL ? (aF - aL) / aL : 0, "vs LY"), '<span class="np-cw-ly">LY ' + kM(aL) + "</span>");
    }
    const foot = locked
      ? '<div class="np-cw-foot np-cw-foot-locked"><span class="np-cw-lockmsg">🔒 Locked actual — already run, can’t be changed</span></div>'
      : '<div class="np-cw-foot">' + (NP.state.cf.approved[akey]
        ? '<span class="np-cw-lockedmsg">🔒 Week ' + week + ' locked into the plan</span><button class="np-cw-undo" type="button" data-cfapprove>Unlock</button>'
        : '<span class="np-cw-foothint">Lock week ' + week + " into the plan?</span><button class=\"np-cw-lock-btn\" type=\"button\" data-cfapprove>Lock deal</button>") + "</div>";
    const drawer = document.getElementById("npDrawer"), scrim = document.getElementById("npDrawerScrim");
    drawer.innerHTML =
      '<div class="np-ask-head"><div><span class="np-ask-eyebrow">' + o.ncrc + " · " + planLabel + (locked ? " · ACTUALS" : "") + '</span><h3>' + esc(o.item) + " — Week " + week + '</h3><small>' + esc(o.vendor) + " · " + c.offer.label + '</small></div><button class="np-ask-close" type="button">×</button></div>' +
      '<div class="np-cw-sec np-cw-forecast"><div class="np-cw-out">' + fc + "</div></div>" +
      '<div class="np-cw-sec np-cw-ladder-sec"><h4>Cost ladder</h4><div class="np-cw-ladder">' +
        lrow("Vendor list cost", vlc * f, "head") + '<div class="np-cw-grp">Buying allowances</div>' + lrow("Off-invoice", off) + lrow("Bill back", bb) + lrow("Price break", pb) + lrow("Total buying", totBuy, "sub") + lrow("Freight", fr) + lrow("Net cost", net, "sub") +
        '<div class="np-cw-grp">Retail allowances</div>' + retRows.map((r) => lrow(r[0], r[1])).join("") + lrow("Total retail", totRet, "sub") + lrow("Dead-net cost", dead, "tot") + "</div></div>" +
      '<div class="np-cw-sec np-cw-tactic"><h4>Tactic</h4><table class="np-cw-tactbl"><thead><tr><th class="np-l"></th><th>Store</th><th>Digital</th></tr></thead><tbody>' +
        trow("Tactic", c.store.name, digName) + trow("Base price", m(base), m(base)) + trow("Promo price", m(promo), dpresent ? m(digPromo) : "—") +
        trow("Depth", (c.depth * 100).toFixed(0) + "%", dpresent ? (digDepth * 100).toFixed(0) + "%" : "—") + trow("MB / limit", mb, dpresent ? mb : "—") + trow("Ad / display", "Y / Y", dpresent ? "Y / N" : "—") +
        "</tbody></table></div>" +
      '<div class="np-cw-sec np-cw-history"><h4>Promo history</h4>' + promoHistory(o) + "</div>" + foot;
    drawer.hidden = false; scrim.hidden = false; drawer.classList.add("is-open"); document.body.classList.add("np-noscroll");
    drawer.querySelector(".np-ask-close").onclick = NP.closeOverlays; scrim.onclick = NP.closeOverlays;
    const ab = drawer.querySelector("[data-cfapprove]"); if (ab) ab.onclick = () => { NP.state.cf.approved[akey] = !NP.state.cf.approved[akey]; NP.renderAll(); openWeek(ctx, uid, week); };
  }
  function cfDetail(o) {
    const tab = NP.state.cf.tab[o.uid] || "ladder";
    const tabs = [["ladder", "Cost ladder"], ["tactic", "Promo plan"], ["history", "Promo history"]];
    const nav = '<div class="np-cf-tabs">' + tabs.map((t) => '<button type="button" class="np-cf-tab' + (tab === t[0] ? " is-active" : "") + '" data-cftab="' + o.uid + ":" + t[0] + '">' + t[1] + "</button>").join("") + "</div>";
    const body = tab === "tactic" ? promoPlanTable(o) : tab === "history" ? promoHistory(o) : costLadder(o);
    return nav + '<div class="np-cf-detbody">' + body + "</div>";
  }
  function promoPlanTable(o) {
    const strat = NP.state.cf.strategy, wk = cfWeeks(o, strat).filter((c) => c.promoted), res = cfResult(o, strat);
    if (!wk.length) return '<p class="np-foot">No promoted weeks under this strategy.</p>';
    const curve = NP.CURVE[o.form] || NP.CURVE.bar, sum = wk.reduce((s, c) => s + curve[c.week - 1], 0) || 1;
    const kM = (v) => "$" + Math.round(v * 1000).toLocaleString() + "K", kU = (v) => Math.round(v).toLocaleString() + "K";
    const rows = wk.map((c) => { const share = curve[c.week - 1] / sum, dig = c.digital && c.digital.length ? c.digital.map((d) => NP.DIGITAL_NAMES[d]).join(", ") : "—";
      return '<tr><td class="np-l">Wk ' + c.week + '</td><td class="np-l">' + (c.offer ? c.offer.label : "—") + '</td><td class="np-l">' + c.store.name + '</td><td class="np-l">' + dig + "</td><td>" + (c.depth * 100).toFixed(0) + "%</td><td>" + kM(res.revenueM * share) + "</td><td>" + kU(res.units * share) + "</td><td>" + kM(res.agpM * share) + "</td></tr>"; }).join("");
    return '<div class="np-cf-scroll"><table class="np-cf-mini"><thead><tr><th class="np-l">Week</th><th class="np-l">Offer</th><th class="np-l">Store tactic</th><th class="np-l">Digital</th><th>Depth</th><th>Sales</th><th>Units</th><th>AGP</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }
  function promoHistory(o) {
    const dates = ["10/22/25", "09/24/25", "08/27/25", "07/30/25", "07/02/25", "06/04/25"], tac = ["PP", "Digital", "BxGx", "PP", "Digital", "BxGx"];
    const h = NP.util.hashStr(o.uid), base = Math.round(o.baseUnitsK * 1000 / 52);
    const rows = dates.map((d, i) => { const r = ((h + i * 37) % 50) / 100, units = Math.round(base * (1.35 + r)), aiv = o.basePrice * (0.7 + (i % 3) * 0.18), sales = Math.round(units * aiv);
      return '<tr><td class="np-l">' + d + "</td><td>" + units.toLocaleString() + "</td><td>$" + sales.toLocaleString() + '</td><td class="np-l">' + tac[i] + "</td><td>$" + aiv.toFixed(2) + "</td></tr>"; }).join("");
    return '<table class="np-cf-mini np-cw-hist"><thead><tr><th class="np-l">Ad break</th><th>Units</th><th>Sales</th><th class="np-l">Tactic</th><th>AIV</th></tr></thead><tbody>' + rows + "</tbody></table>";
  }
  function costLadder(o) {
    const e = NP.effective(o, NP.displayMap()), l = e.ladder, vlc = e.vlc;
    const wk = cfWeeks(o, NP.state.cf.strategy).filter((c) => c.promoted);
    if (!wk.length) return '<p class="np-foot">No promoted weeks under this strategy.</p>';
    const wob = (w) => 1 + Math.sin((w / 52) * Math.PI * 3 + NP.util.hashStr(o.uid)) * 0.03 + Math.sin(w * 0.5) * 0.01, m = (v) => "$" + v.toFixed(2);
    const rows = wk.map((c) => { const w = c.week, f = wob(w), off = vlc * l.offInvoice * f, bb = vlc * l.billBack * f, pb = vlc * l.priceBreak * f, fr = vlc * l.freight * f, ret = NP.RETAIL_KEYS.reduce((s, k) => s + vlc * (l[k] || 0) * f, 0), net = vlc * f - off - bb - pb - fr, dead = net - ret;
      return '<tr><td class="np-l">Wk ' + w + "</td><td>" + m(vlc * f) + "</td><td>" + m(off) + "</td><td>" + m(bb) + "</td><td>" + m(pb) + "</td><td>" + m(fr) + '</td><td class="np-cf-subc">' + m(net) + "</td><td>" + m(ret) + '</td><td class="np-cf-totc">' + m(dead) + "</td></tr>"; }).join("");
    return '<div class="np-cf-scroll"><table class="np-cf-mini"><thead><tr><th class="np-l">Week</th><th>VLC</th><th>Off-inv</th><th>Bill back</th><th>P/brk</th><th>Freight</th><th>Net cost</th><th>Retail</th><th>Dead-net</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }
  function bindCounterfactual(host) {
    host.querySelectorAll("[data-clust]").forEach((b) => b.onclick = () => { NP.state.cf.clustersOpen = !NP.state.cf.clustersOpen; renderCounterfactual(); });
    host.querySelectorAll("[data-strat]").forEach((b) => b.onclick = () => { NP.state.cf.strategy = b.dataset.strat; renderCounterfactual(); });
    host.querySelectorAll("[data-week]").forEach((el) => el.onclick = () => { const p = el.dataset.week.split("|"); openWeek(p[0], p[1], +p[2]); });
    host.querySelectorAll(".np-rc-card").forEach((card) => card.querySelectorAll("[data-flip]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); card.classList.toggle("is-flipped"); }));
    bindInteractions(host);
    bindMonthZoom(host);
    host.addEventListener("mousemove", exTip); host.addEventListener("mouseleave", clearSpark);
  }

  /* ============================================== VIEW: CONSTRAINTS (step 2) ===
     Reframes the "constraints requested" list into how the optimiser actually works:
     agreed-once global locks · learned values · per-category inputs · scenarios ·
     pruned tactics — with the original asks answered, in grey, "below the line". */
  function conRow(title, desc, right) {
    return '<div class="np-c3-row"><div class="np-c3-rmain"><span class="np-c3-rt">' + title + "</span>" + (desc ? '<span class="np-c3-rd">' + desc + "</span>" : "") + "</div>" + (right ? '<span class="np-c3-rv">' + right + "</span>" : "") + "</div>";
  }
  function conSec(label, blurb, rows, foot) {
    return '<section class="np-c3-sec"><header class="np-c3-head"><span class="np-c3-label">' + label + "</span>" + (blurb ? '<span class="np-c3-blurb">' + blurb + "</span>" : "") + "</header>" + rows + (foot || "") + "</section>";
  }
  function tolItem(title, value, desc) {
    return '<div class="np-c3-tol"><div class="np-c3-tol-h"><span class="np-c3-tol-t">' + title + '</span><span class="np-c3-tol-v">' + value + "</span></div><p class=\"np-c3-tol-d\">" + desc + "</p></div>";
  }
  // highlighted, clickable reference to another step (like the Deal inputs treatment)
  function glink(step, label) { return '<a class="np-c3-glink" data-goto="' + step + '">' + label + "</a>"; }
  // last-year promotion discipline (store / digital / overall) — same basis as the results LY column
  function disciplineLYTable() {
    const D = { store: { n: 0, ds: 0, deep: 0 }, dig: { n: 0, ds: 0, deep: 0 } };
    NP.cat().items.forEach((o) => NP.weekPlan(o, null, true).forEach((c) => {
      if (!c.promoted) return; const sd = c.depth;
      D.store.n++; D.store.ds += sd; if (sd >= 0.3) D.store.deep++;
      if (c.digital && c.digital.length) { const dd = Math.min(0.5, c.depth + 0.06); D.dig.n++; D.dig.ds += dd; if (dd >= 0.3) D.dig.deep++; }
    }));
    const all = { n: D.store.n + D.dig.n, ds: D.store.ds + D.dig.ds, deep: D.store.deep + D.dig.deep };
    const pct = (x) => (x * 100).toFixed(1) + "%";
    const active = activeNCRCsCount();
    const c = (g, k) => k === "n" ? Math.round(g.n) + ' <span class="np-c3-pct">· ' + (active ? Math.round(g.n / active * 100) : 0) + "%</span>" : g.n ? pct((k === "ds" ? g.ds : g.deep) / g.n) : "—";
    const row = (lab, k) => "<tr><td>" + lab + "</td><td>" + c(D.store, k) + "</td><td>" + c(D.dig, k) + "</td><td>" + c(all, k) + "</td></tr>";
    return '<table class="np-c3-floors np-c3-disc"><thead><tr><th>Promotion discipline · LY</th><th>Store</th><th>Digital</th><th>Overall</th></tr></thead><tbody>' +
      row("Items on promo", "n") + row("Avg discount", "ds") + row("Items &gt; 30% off", "deep") + "</tbody></table>" +
      '<p class="np-c3-active">Active NCRCs: <b>' + activeNCRCsCount().toLocaleString() + "</b>.</p>";
  }
  // illustrative active-NCRC count for the scope (the on-screen sample rolls up to the full active set)
  const ACTIVE_NCRC = { confectionery: 433, softdrinks: 156 };
  function activeNCRCsCount() {
    const base = ACTIVE_NCRC[NP.state.categoryId] || NP.cat().items.length;
    return Math.round(base * NP.divisionFactor());
  }
  function renderConstraints() {
    const host = document.getElementById("npStep2"); if (!host) return;
    const div = NP.divMeta().short, cn = NP.cat().name.split(" — ")[0];

    // the only hard, agreed-once rules — tolerances beside the protection floors
    const tols =
      tolItem("Over-funding tolerance", "+5%", "Up to 5% over plan — never below committed.") +
      tolItem("Promo-intensity headroom", "±20% / wk", "How much more / less promotional than LY.") +
      tolItem("Depth headroom", "±20% / wk", "How far average discount depth may drift.");
    const floors = '<table class="np-c3-floors"><thead><tr><th>Protection floor vs LY</th><th>Non-holiday</th><th>Holiday</th></tr></thead><tbody>' +
      '<tr><td>Units</td><td>≥ 80%</td><td>≥ 70%</td></tr>' +
      '<tr><td>Sales</td><td>≥ 85%</td><td>≥ 78%</td></tr>' +
      '<tr><td>Margin (AGP)</td><td>≥ 85%</td><td>≥ 75%</td></tr></tbody></table>';
    const secA = conSec("Agreed globally · locked at design",
      "Set once with your team, applied to every category.",
      '<div class="np-c3-split"><div class="np-c3-split-l">' + tols + '</div><div class="np-c3-split-r">' + floors + '</div><div class="np-c3-split-r">' + disciplineLYTable() + "</div></div>");

    // everything else: their asks, answered with where / how it's handled (grey, soft)
    const asks = [
      ["Maximum margin $ investment vs LY", "You enter this as allowances by sub-type on " + glink(3, "Deal inputs") + " — it's an input, not a cap, so the spend stays visible."],
      ["Units ID % vs LY floor (e.g. −2%)", "Not a goal-seek. Held as the learned holiday / non-holiday <b>floors above</b>, which shift as forecasting variance falls."],
      ["LY promo cost &amp; frequency to negotiate", "Cost buckets plus per-NCRC store / digital / combined event counts live on " + glink(3, "Deal inputs") + "."],
      ["Min deep-promo frequency · front-cover (4 retail buckets)", "Front cover is a gap today; deep-promo frequency shows as learned and output values on the " + glink(4, "52-week plan") + "."],
      ["Complex promotions allowed (yes / no)", "Learned digital caps that flex weekly with seasonality — not an on / off switch, or the forecast breaks."],
      ["Hard-lock off double hoops", "Exposed as a <b>pruned</b> tactic — digital won't stack on a must-buy."],
      ["Own Brands shielding &amp; exceptions", "Run as an OB-specific scenario on " + glink(5, "Counterfactuals") + ", not a hard constraint."],
      ["Promoted minimum discount % vs white tag", "Covered with deep-promo frequency — learned and output values on the " + glink(4, "52-week plan") + " above."],
      ["Overall plan confidence score", "Reported after the run on the " + glink(4, "52-week plan") + " — the optimiser maximises it; you can't set a target like 89.5%."]
    ];
    const choices = '<div class="np-c3-choices"><h4>On the constraints you asked for</h4>' +
      '<p class="np-c3-choices-intro">Everything you raised is here — most are handled as inputs, learned values or scenarios rather than hard limits, so the plan stays grounded in the forecast. Where each one lives:</p><dl>' +
      asks.map((a) => "<dt>" + a[0] + "</dt><dd>" + a[1] + "</dd>").join("") + "</dl></div>";

    host.innerHTML =
      '<section class="panel np-c3">' +
        '<div class="panel-heading"><div><h2>Constraints &amp; guardrails</h2>' +
          "<p>For <b>" + esc(div) + " · " + esc(cn) + "</b>, the only hard rules are the globally-agreed tolerances below. Everything else you asked for is handled as an input, a learned value, or a scenario.</p></div></div>" +
        secA + choices +
      "</section>";
    host.querySelectorAll("[data-goto]").forEach((b) => b.onclick = () => NP.goStep(+b.dataset.goto));
  }

  window.NPViews = { renderGrid, renderResults, renderExplain, renderCounterfactual, renderConstraints, openWeek, cfWeeks, cfResult, cfStrategies, cfStratName, cfTotals };
})();
