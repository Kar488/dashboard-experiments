/* National 52-Week Plan — V2 experience (one-screen grid + flip). window.NPV2.
   Additive over V1 — toggled by the V1/V2 control in the top bar (NP.state.v2).

   ONE continuous frozen-pane grid (replaces the old two-slide swiper):
     • FROZEN left  — identity (NCRC / item) + Units / Sales / AGP, each vs LY. Always visible.
     • Summary strip — read-only deal-input columns (VLC, base, dead-net, AWS$, events, depth).
     • 52-week ribbon — the store/digital tactic plan, week by week.
   You drag / scroll horizontally; it follows the finger and softly snaps between the
   "deal summary" and "pure 52-week" ends (CSS scroll-snap proximity), so the pinned
   identity+metrics never leave — "input and output on one screen", with a real scrollbar.

   Clicking a month flips the whole grid into a per-NCRC month detail (Vendor + Class
   filters); clicking a promoted week opens the V1 single-week drawer.                  */
(function () {
  "use strict";
  const NP = window.NP;
  if (!NP) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const km = (vM) => { const k = vM * 1000; return Math.abs(k) >= 1000 ? "$" + (k / 1000).toFixed(2) + "M" : "$" + Math.round(k) + "K"; };

  let flip = { open: false, m: 0, animating: false };
  const ff = { vendor: "all", rog: "all", cls: "all", sortBy: null, bin: "all" };   // front-grid filters + sort
  const mfilter = { vendor: "all", cls: "all" };           // month-detail filters
  const SHELL = "npV2Shell", MFACE = "npV2MonthFace", FLIPEL = "npV2Flip", FRONT = "npV2Front", WRAP = "npV2FgWrap";

  function shellExists() { return !!document.getElementById(SHELL); }
  function canSwipe() { return NP.state.v2 && shellExists() && (NP.state.step === 3 || NP.state.step === 4); }

  /* ===================================================== layout flag (toggle retired)
     V2 is the only layout now — the old V1/V2 top-bar toggle was removed. This just
     keeps the body flag on so the V2 styles apply, and clears the (now empty) host. */
  function renderToggle() {
    document.body.classList.add("np-v2");
    const host = document.getElementById("npV2Toggle");
    if (host) host.innerHTML = "";
  }

  /* ==================================================================== shell */
  function ensureShell() {
    if (shellExists()) return;
    const main = document.querySelector("main.national-plan");
    const step3 = document.getElementById("npStep3");
    if (!main || !step3) return;
    const shell = document.createElement("section");
    shell.id = SHELL;
    shell.className = "npv2-shell";
    shell.innerHTML =
      '<div class="npv2-flip" id="' + FLIPEL + '">' +
        '<div class="npv2-face npv2-face-front" id="' + FRONT + '"></div>' +
        '<div class="npv2-face npv2-face-back" id="' + MFACE + '" hidden></div>' +
      "</div>";
    main.insertBefore(shell, step3);
  }

  /* ============================================================ front grid
     The PINNED block (sticky left) holds, side by side: identity · the outputs
     (Units/Sales/AGP vs LY) · the editable deal inputs (yellow). Only the 52-week
     ribbon scrolls — so a merchant edits an input and sees the output right beside it. */
  const OUTCOLS = [
    { k: "units", label: "Units", money: false, get: (r) => r.units },
    { k: "sales", label: "Sales", money: true, get: (r) => r.revenueM },
    { k: "agp", label: "AGP", money: true, get: (r) => r.agpM }
  ];
  // pinned inputs: VLC · Promo cost (Reg / Deep) · Events (Store / Dig / S+D, toggled Reg↔Deep)
  const VLCCOL = { k: "vlc", label: "$/u", edit: true, dec: true, val: (o, e) => e.vlc.toFixed(2) };
  // Promo cost (Reg / Deep) is now the DERIVED result of the allowance breakup — read-only
  const COSTCOLS = [
    { k: "deadNet", label: "Reg" },
    { k: "deepDeadNet", label: "Deep" }
  ];
  // the allowances that BUILD the promo cost — editable, toggled Regular↔Deep (like events)
  const ALLOWCOLS = [
    { k: "offInvoice", label: "Off-inv", edit: true },
    { k: "scan", label: "Scan", edit: true },
    { k: "shipToStore", label: "Ship", edit: true }
  ];
  const ALWTITLE = { offInvoice: "off-invoice", scan: "scan", shipToStore: "ship-to-store" };
  // allowance group header doubles as the Regular↔Deep toggle (which promo cost you're breaking up)
  function allowCap() {
    const deep = NP.state.v2allowMode === "deep";
    return 'Allowances · <button type="button" class="npv2-evtoggle" data-allowtoggle title="Enter the allowances for the regular or the deep-discount promo cost — click to switch">' + (deep ? "D" : "R") + " ⇄</button>";
  }
  function deepLadderOf(o) { return window.NPViews && NPViews.deepEffective ? NPViews.deepEffective(o, NP.state.draft).ladder : NP.effective(o, NP.state.draft).ladder; }
  function deepCostOf(o) { return window.NPViews && NPViews.deepEffective ? NPViews.deepEffective(o, NP.state.draft).deadNet : NP.effective(o, NP.state.draft).deadNet; }
  // read-only derived promo-cost cell + editable allowance cell
  function costCellHTML(o, deep) {
    const v = deep ? deepCostOf(o) : NP.effective(o, NP.state.draft).deadNet;
    return '<div class="npv2-fg-cell npv2-fg-costc" data-cost="' + o.uid + ":" + (deep ? "deep" : "reg") + '" title="Promo cost $/u — ' + (deep ? "deep-discount" : "regular") + ' weeks (built from the allowances)"><b>' + NP.fmt.price(v) + "</b></div>";
  }
  function allowCellHTML(c, o, eDraft) {
    const deep = NP.state.v2allowMode === "deep";
    const lad = deep ? deepLadderOf(o) : eDraft.ladder;
    const dollar = (lad[c.k] || 0) * eDraft.vlc;
    return '<div class="npv2-fg-cell npv2-fg-inc npv2-fg-edit" data-cell="' + o.uid + ":alw:" + c.k + '" title="' + esc((deep ? "Deep" : "Regular") + " " + (ALWTITLE[c.k] || c.k) + " allowance ($/u) — builds the promo cost") + '">' +
      '<input class="npv2-fg-input npv2-fg-alwin" type="text" inputmode="decimal" data-uid="' + o.uid + '" data-alw="' + c.k + '" value="' + dollar.toFixed(2) + '"></div>';
  }
  function evCols() {
    const deep = NP.state.v2evMode === "deep";
    return [
      { k: deep ? "deepEvents" : "events", label: "Store", edit: true, val: (o, e) => String(deep ? e.deepEvents : e.events) },
      { k: deep ? "deepDigEvents" : "digEvents", label: "Dig", edit: true, val: (o, e) => String(deep ? e.deepDigEvents : e.digEvents) },
      { k: deep ? "deepBothEvents" : "bothEvents", label: "S+D", edit: true, val: (o, e) => String(deep ? e.deepBothEvents : e.bothEvents) }
    ];
  }
  const INTITLE = { vlc: "Vendor list cost / unit", deadNet: "Promo cost — regular weeks", deepDeadNet: "Promo cost — deep-discount weeks", events: "Regular store events / yr", digEvents: "Regular digital events / yr", bothEvents: "Regular store & digital / yr", deepEvents: "Deep store events / yr", deepDigEvents: "Deep digital events / yr", deepBothEvents: "Deep store & digital / yr" };
  // events column header doubles as the Regular↔Deep toggle (events are coupled to the cost columns)
  function evCap() {
    const deep = NP.state.v2evMode === "deep";
    return 'Events · <button type="button" class="npv2-evtoggle" data-evtoggle title="Editing events &amp; cost for regular or deep-discount weeks — click to switch">' + (deep ? "D" : "R") + " ⇄</button>";
  }
  function frontItems() {
    let items = NP.cat().items.slice();
    if (ff.vendor !== "all") items = items.filter((o) => o.vendor === ff.vendor);
    if (ff.rog !== "all") items = items.filter((o) => o.rog === ff.rog);
    if (ff.cls !== "all") items = items.filter((o) => o.cluster === ff.cls);
    const metric = ff.sortBy || "sales";
    if (ff.bin !== "all") { const bins = NP.binsFor(); items = items.filter((o) => bins[o.uid][metric] === +ff.bin); }
    if (ff.sortBy) {
      const map = NP.displayMap(), v = (o) => { const r = NP.resultFor(o, map); return ff.sortBy === "units" ? r.units : ff.sortBy === "agp" ? r.agpM : r.revenueM; };
      items.sort((a, b) => v(b) - v(a)); // highest → lowest
    } else items.sort((a, b) => (a.vendor === b.vendor ? a.item.localeCompare(b.item) : a.vendor.localeCompare(b.vendor)));
    return items;
  }
  // subtle Sort-by-velocity-bin pills (Sales/Units/AGP × 1..5 quintiles)
  function sortControlsHTML() {
    const pill = (label, active, attr) => '<button type="button" class="npv2-sort-pill' + (active ? " is-active" : "") + '" ' + attr + ">" + label + "</button>";
    const sortPills = [["sales", "Sales"], ["units", "Units"], ["agp", "AGP"]].map(([m, l]) => pill(l, ff.sortBy === m, 'data-sortby="' + m + '"')).join("");
    const binPills = ["all", "1", "2", "3", "4", "5"].map((b) => pill(b === "all" ? "All" : b, (ff.bin || "all") === b, 'data-bin="' + b + '"')).join("");
    const planOn = !!NP.state.v2plan;
    const planPills = pill("Off", !planOn, 'data-planview="0"') + pill("On", planOn, 'data-planview="1"');
    return '<span class="npv2-sort"><span class="npv2-sort-l">Sort by</span><span class="npv2-pillgroup">' + sortPills + "</span></span>" +
      '<span class="npv2-divider"></span>' +
      '<span class="npv2-sort"><span class="npv2-sort-l">Velocity</span><span class="npv2-pillgroup">' + binPills + "</span></span>" +
      '<span class="npv2-divider"></span>' +
      '<span class="npv2-sort"><span class="npv2-sort-l">52-week</span><span class="npv2-pillgroup">' + planPills + "</span></span>";
  }
  // skinny whole-table total: Sales / Units / AGP with LY value + % and $ deltas
  function totalsStripHTML(items, map) {
    let cy = { r: 0, u: 0, a: 0 }, ly = { r: 0, u: 0, a: 0 };
    items.forEach((o) => { const r = NP.resultFor(o, map), l = NP.lyResult(o); cy.r += r.revenueM; cy.u += r.units; cy.a += r.agpM; ly.r += l.revenueM; ly.u += l.units; ly.a += l.agpM; });
    const stat = (lab, c, l, money) => { const f = money ? km : NP.fmt.u, d = l ? (c - l) / l : 0, dd = c - l; return '<span class="npv2-tot-stat"><span class="npv2-tot-l">' + lab + '</span><b class="npv2-tot-v">' + f(c) + '</b><span class="npv2-tot-ly">LY ' + f(l) + '</span><i class="npv2-tot-d ' + (d >= 0 ? "np-pos" : "np-neg") + '">' + NP.fmt.pct(d) + " · " + (dd >= 0 ? "+" : "") + f(dd) + "</i></span>"; };
    return '<div class="npv2-totstrip"><span class="npv2-tot-cap">Table total · ' + items.length + " NCRC" + (items.length === 1 ? "" : "s") + "</span>" +
      stat("Sales", cy.r, ly.r, true) + stat("Units", cy.u, ly.u, false) + stat("AGP", cy.a, ly.a, true) + "</div>";
  }
  function outCellHTML(c, res, ly) {
    const cy = c.get(res), lyv = c.get(ly), d = lyv ? (cy - lyv) / lyv : 0, f = c.money ? km : NP.fmt.u;
    return '<div class="npv2-fg-cell npv2-fg-outc"><b>' + f(cy) + '</b><small>LY ' + f(lyv) + '</small><i class="' + (d >= 0 ? "np-pos" : "np-neg") + '">' + NP.fmt.pct(d) + "</i></div>";
  }
  function inCellHTML(c, o, eDraft) {
    const edited = NP.isEdited(o, c.k), outband = edited && !NP.inBand(o, c.k, c.val(o, eDraft));
    return '<div class="npv2-fg-cell npv2-fg-inc npv2-fg-edit' + (edited ? " is-edited" : "") + (outband ? " is-outband" : "") + '" data-cell="' + o.uid + ":" + c.k + '" title="' + esc(INTITLE[c.k] || c.k) + '">' +
      '<input class="npv2-fg-input" type="text" inputmode="' + (c.dec ? "decimal" : "numeric") + '" data-uid="' + o.uid + '" data-field="' + c.k + '" value="' + c.val(o, eDraft) + '"></div>';
  }
  function grpHead(cls, cap, cols) {
    return '<div class="npv2-fg-grp npv2-fg-' + cls + '"><div class="npv2-fg-gcap">' + cap + "</div><div class=\"npv2-fg-gcells\">" + cols.map((c) => '<span class="npv2-fg-colh' + (c.edit ? " npv2-fg-colh-in" : "") + '">' + c.label + "</span>").join("") + "</div></div>";
  }
  function grpBody(cls, cellsHTML) {
    return '<div class="npv2-fg-grp npv2-fg-' + cls + '"><div class="npv2-fg-gcap"></div><div class="npv2-fg-gcells">' + cellsHTML + "</div></div>";
  }
  function idCell(o, res, ly, eDraft) {
    return '<th class="npv2-fg-id"><div class="npv2-fg-idin">' +
      '<div class="npv2-fg-name"><b>' + esc(o.item) + '</b><span class="np-rc-size">' + esc(o.pack) + '</span><span class="np-rc-id">' + o.ncrc + '</span><span class="np-rc-id npv2-fg-base">Base ' + NP.fmt.price(o.basePrice) + "</span></div>" +
      grpBody("out", OUTCOLS.map((c) => outCellHTML(c, res, ly)).join("")) +
      grpBody("vlc", inCellHTML(VLCCOL, o, eDraft)) +
      grpBody("cost", costCellHTML(o, false) + costCellHTML(o, true)) +
      grpBody("alw", ALLOWCOLS.map((c) => allowCellHTML(c, o, eDraft)).join("")) +
      grpBody("ev", evCols().map((c) => inCellHTML(c, o, eDraft)).join("")) +
      "</div></th>";
  }
  function idHead() {
    return '<th class="npv2-fg-id npv2-fg-idhead npv2-fg-snap" rowspan="2"><div class="npv2-fg-idin">' +
      '<div class="npv2-fg-name npv2-fg-nameh">NCRC · item</div>' +
      grpHead("out", "Outputs vs LY", OUTCOLS) +
      grpHead("vlc", "List", [VLCCOL]) +
      grpHead("cost", "Promo cost $/u", COSTCOLS) +
      grpHead("alw", allowCap(), ALLOWCOLS) +
      grpHead("ev", evCap(), evCols()) +
      "</div></th>";
  }
  function ribbonCell(o, c, isEv, ixf, lyset, noAlw) {
    // holiday is indicated on the week-number header only — no bar on every body cell
    const ev = "";
    const lock = NP.state.cf.approved && NP.state.cf.approved[o.uid + ":" + c.week] ? " is-lock" : "";
    if (!c.promoted) return '<td class="npv2-fg-wk npv2-fg-none' + (c.locked ? " is-locked" : "") + ev + '" title="Wk ' + c.week + ' · no promo"></td>';
    const mechL = c.mech ? NP.MECH_LABEL[c.mech] : "", w = c.week - 1;
    const ixc = ixf === "cann" ? " is-cann" : ixf === "halo" ? " is-halo" : "";
    const noal = noAlw ? " is-noalw" : "";
    // depth vs LY: ▲ deeper / ▼ shallower / = equal
    const lyd = o.lyDepth || 0, over = c.depth - lyd, eq = Math.abs(over) < 0.012;
    const arr = '<i class="npv2-wk-ar ' + (eq ? "is-eq" : over > 0 ? "is-deeper" : "is-shallower") + '">' + (eq ? "=" : over > 0 ? "▲" : "▼") + "</i>";
    // LY status: repeats last year's week (show LY depth) vs a new/optimised placement
    const repeat = !!(lyset && lyset.has(w));
    const stHtml = repeat ? '<span class="npv2-wk-st st-rep">LY ' + (lyd * 100).toFixed(0) + "%</span>" : '<span class="npv2-wk-st st-new">new</span>';
    const ixt = ixf === "cann" ? " · ⚠ cluster rival also on deal (cannibalisation)" : ixf === "halo" ? " · ✦ co-promoted with a complement (halo)" : "";
    const tip = "Wk " + c.week + " · " + c.store.name + (c.offer ? " · " + c.offer.label : "") + (mechL ? " (" + mechL + ")" : "") + " · depth " + (c.depth * 100).toFixed(0) + "% vs LY " + (lyd * 100).toFixed(0) + "% (" + (eq ? "≈ same" : over > 0 ? "deeper" : "shallower") + ")" + (repeat ? " · repeats last year" : " · new / optimised placement") + (noAlw ? " · ⚠ on promo with no vendor allowance" : "") + (c.digital.length ? " · digital" : "") + (c.locked ? " · actual" : "") + (lock ? " · locked into plan" : "") + ixt + " — click for week detail";
    // promo prices: store at this week's depth; digital a touch deeper; plus the LY price
    const hasDig = c.digital.length > 0, digDepth = Math.min(0.5, c.depth + 0.06);
    const sp = NP.fmt.price(NP.promoPriceOf(o, c.depth)), dp = NP.fmt.price(NP.promoPriceOf(o, digDepth));
    const lySp = NP.fmt.price(NP.promoPriceOf(o, lyd)), lyDp = NP.fmt.price(NP.promoPriceOf(o, Math.min(0.5, lyd + 0.06)));
    // optimised-placement indicator: new vs a repeat of last year
    const optIcon = repeat
      ? '<i class="npv2-wk-opt is-rep" title="repeats last year">↺</i>'
      : '<i class="npv2-wk-opt is-opt" title="optimised — new placement vs last year">✦</i>';
    const lockI = lock ? '<i class="npv2-wk-lk" title="locked into plan"></i>' : "";
    const warnI = noAlw ? '<i class="npv2-wk-warn" title="on promo, no vendor allowance">⚠</i>' : "";
    return '<td class="npv2-fg-wk tactic-' + c.store.className + (c.locked ? " is-locked" : "") + ev + ixc + lock + noal + '" data-mweek="' + o.uid + "|" + c.week + '" role="button" tabindex="0" title="' + esc(tip) + '">' +
      '<div class="npv2-wk-c npv2-wk-pc">' +
        (c.val ? '<div class="npv2-wk-tok">' + esc(c.val) + "</div>" : "") +
        '<div class="npv2-wk-pr"><span class="npv2-wk-ch">S</span><b>' + sp + "</b></div>" +
        (repeat ? '<div class="npv2-wk-lp">LY ' + lySp + "</div>" : "") +
        (hasDig ? '<div class="npv2-wk-pr npv2-wk-prd"><span class="npv2-wk-ch npv2-wk-chd">D</span><b>' + dp + "</b></div>" + (repeat ? '<div class="npv2-wk-lp">LY ' + lyDp + "</div>" : "") : "") +
        (!repeat ? '<div class="npv2-wk-lp"><span class="npv2-wk-newt">new</span></div>' : "") +
        '<div class="npv2-wk-tags">' + arr + optIcon + lockI + warnI + "</div>" +
      "</div></td>";
  }
  function sel(label, id, opts, cur) {
    const options = opts.map((o) => { const v = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (cur === v ? " selected" : "") + ">" + esc(lab) + "</option>"; }).join("");
    return '<label class="npv2-fg-filter">' + label + ' <select id="' + id + '"><option value="all">All ' + label.toLowerCase() + "s</option>" + options + "</select></label>";
  }
  // interactions: for each week, which items promote (with cluster + rank) → flag a promoted
  // cell as cannibalisation (a same-cluster rival is also on deal that week) or halo (a
  // complement — same rank, different cluster — co-promotes that week). Literal plan readout.
  function buildIxMap(items, wkByUid) {
    const ranked = NP.rankedClusters(), rankOf = {};
    Object.keys(ranked).forEach((k) => ranked[k].forEach((o, r) => (rankOf[o.uid] = r)));
    const byWeek = Array.from({ length: 52 }, () => []);
    items.forEach((o) => { wkByUid[o.uid].forEach((c, w) => { if (c.promoted) byWeek[w].push({ uid: o.uid, cluster: o.cluster, rank: rankOf[o.uid] }); }); });
    return { byWeek: byWeek, rankOf: rankOf };
  }
  function ixFlag(ixMap, o, w) {
    const list = ixMap.byWeek[w]; if (!list || list.length < 2) return null;
    if (list.some((x) => x.uid !== o.uid && x.cluster === o.cluster)) return "cann";
    const r = ixMap.rankOf[o.uid];
    if (list.some((x) => x.cluster !== o.cluster && x.rank === r)) return "halo";
    return null;
  }
  function tableHTML(items, map) {
    const cfV = window.NPViews, strat = NP.state.cf.strategy || "optimized", ixOn = !!NP.state.v2ix;
    const stratWk = (o) => (strat === "optimized" || !cfV || !cfV.cfWeeks ? NP.weekPlan(o, map, false) : cfV.cfWeeks(o, strat));
    const stratRes = (o) => (strat === "optimized" || !cfV || !cfV.cfResult ? NP.resultFor(o, map) : cfV.cfResult(o, strat));
    const wkByUid = {}; items.forEach((o) => (wkByUid[o.uid] = stratWk(o)));
    const ixMap = ixOn ? buildIxMap(items, wkByUid) : null;
    // focused period → show only its 4 weeks (the pinned block is unchanged); else all 52
    const focus = NP.state.v2period;
    const weeks = focus == null ? Array.from({ length: 52 }, (_, w) => w)
                                : [0, 1, 2, 3].map((i) => focus * 4 + i).filter((w) => w < 52);
    let periodHead;
    if (focus == null) {
      periodHead = "";
      for (let p = 0; p < 13; p++) periodHead += '<th class="npv2-fg-period' + (p === 0 ? " npv2-fg-snap" : "") + '" colspan="4" data-period="' + p + '" role="button" tabindex="0" title="Zoom into period ' + (p + 1) + ' (4 weeks)">P' + (p + 1) + "</th>";
    } else {
      periodHead = '<th class="npv2-fg-period npv2-fg-periodback npv2-fg-snap" colspan="' + weeks.length + '" data-zoomout role="button" tabindex="0" title="Zoom back out to all 52 weeks">' +
        '<span class="npv2-fg-zback">‹ all 52 weeks</span><b>Period ' + (focus + 1) + '</b><span class="npv2-fg-zwk">wks ' + (weeks[0] + 1) + "–" + (weeks[weeks.length - 1] + 1) + "</span></th>";
    }
    let wkHead = "";
    weeks.forEach((w) => {
      const ev = NP.RETAIL_EVENTS.find((x) => x.wk === w);
      if (focus == null) { wkHead += '<th class="npv2-fg-wkh' + (ev ? " npv2-fg-holi" : "") + '">' + (w + 1) + (ev ? "<small>" + esc(ev.short) + "</small>" : "") + "</th>"; }
      else { wkHead += '<th class="npv2-fg-wkh npv2-fg-wkh-p' + (ev ? " npv2-fg-holi" : "") + '"><div class="npv2-pwk"><b>Wk ' + (w + 1) + "</b>" + (ev ? "<small>" + esc(ev.short) + "</small>" : "") + '<div class="npv2-pwk-cols"><span></span><span>Sales</span><span>Units</span><span>AGP</span></div></div></th>'; }
    });
    const head = "<thead><tr>" + idHead() + periodHead + "</tr><tr>" + wkHead + "</tr></thead>";
    const span = 1 + weeks.length, evWeeks = new Set(NP.RETAIL_EVENTS.map((e) => e.wk));
    // items promoting with little/no vendor allowance (VLC − dead-net) → flag (like V1)
    const alwU = (o) => { const e = NP.effective(o, map); return e.vlc - e.deadNet; };
    const noAlwSet = new Set(items.slice().sort((a, b) => alwU(a) - alwU(b)).slice(0, Math.max(1, Math.round(items.length * 0.12))).map((o) => o.uid));
    let lastV = null, body = "";
    items.forEach((o) => {
      const eDraft = NP.effective(o, NP.state.draft), res = stratRes(o), ly = NP.lyResult(o), wk = wkByUid[o.uid], noAlw = noAlwSet.has(o.uid);
      const lyset = new Set(); NP.weekPlan(o, null, true).forEach((c, w) => { if (c.promoted) lyset.add(w); });
      if (!ff.sortBy && o.vendor !== lastV) { lastV = o.vendor; body += '<tr class="npv2-fg-vrow"><td colspan="' + span + '"><span>' + esc(o.vendor) + "</span></td></tr>"; }
      const cells = focus == null
        ? weeks.map((w) => ribbonCell(o, wk[w], evWeeks.has(w), ixMap ? ixFlag(ixMap, o, w) : null, lyset, noAlw)).join("")
        : (function () { const s = NP.weeklySeries(o, map); return weeks.map((w, i) => periodCell(o, s, wk, w, noAlw, i === 0)).join(""); })();
      body += "<tr>" + idCell(o, res, ly, eDraft) + cells + "</tr>";
    });
    if (!items.length) body = '<tr><td class="npv2-empty" colspan="' + span + '">No NCRCs match these filters.</td></tr>';
    return '<table class="npv2-fg' + (focus != null ? " is-period" : "") + '">' + head + "<tbody>" + body + "</tbody></table>";
  }
  function lyTotals() { let r = 0, u = 0, a = 0; NP.cat().items.forEach((o) => { const x = NP.lyResult(o); r += x.revenueM; u += x.units; a += x.agpM; }); return { r: r, u: u, a: a }; }
  // ROW 1 — distribution strategies as selectable cards, each with its Sales/Units/AGP + Δ vs LY
  function stratCardsHTML() {
    const cfV = window.NPViews; if (!cfV || !cfV.cfStrategies) return "";
    const cur = NP.state.cf.strategy || "optimized", ly = lyTotals();
    const met = (lab, cv, lv, money) => { const f = money ? km : NP.fmt.u, d = lv ? (cv - lv) / lv : 0, dd = cv - lv; return '<div class="npv2-strat-m"><span class="npv2-strat-ml">' + lab + '</span><span class="npv2-strat-mv">' + f(cv) + '</span><span class="npv2-strat-mly">LY ' + f(lv) + '</span><span class="npv2-strat-md ' + (d >= 0 ? "np-pos" : "np-neg") + '">' + NP.fmt.pct(d) + " · " + (dd >= 0 ? "+" : "") + f(dd) + "</span></div>"; };
    return '<div class="npv2-strat-row" id="npV2Strats">' + cfV.cfStrategies().map((s) => {
      const t = cfV.cfTotals(s.id);
      return '<button type="button" class="npv2-strat' + (cur === s.id ? " is-active" : "") + '" data-strat="' + s.id + '">' +
        '<span class="npv2-strat-name">' + esc(s.name) + (s.tag ? ' <em>' + esc(s.tag) + "</em>" : "") + "</span>" +
        '<span class="npv2-strat-sub">vs last year</span>' +
        '<div class="npv2-strat-grid">' + met("Sales", t.revenueM, ly.r, true) + met("Units", t.units, ly.u, false) + met("AGP", t.agpM, ly.a, true) + "</div></button>";
    }).join("") + '</div><div class="npv2-rule"></div>';
  }
  // heatmap legend — same gentle colours as the ribbon
  function legendHTML() {
    return '<div class="npv2-legend">' +
      '<span class="npv2-lg"><i class="npv2-sw tactic-item"></i>Item Discount</span>' +
      '<span class="npv2-lg"><i class="npv2-sw tactic-bxgx"></i>Buy X Get X</span>' +
      '<span class="npv2-lg"><i class="npv2-sw tactic-mb"></i>Must Buy</span>' +
      '<span class="npv2-lg npv2-lg-mech">offer <b>%</b> · <b>$</b> · <b>@$</b> · <b>FREE</b></span>' +
      '<span class="npv2-lg"><i class="npv2-lg-dg">D</i>digital</span>' +
      '<span class="npv2-lg"><i class="npv2-sw npv2-sw-lock"></i>locked</span>' +
      '<span class="npv2-lg"><i class="npv2-wk-warn">⚠</i>on promo · no allowance</span>' +
      '<span class="npv2-lg"><i class="npv2-sw npv2-sw-ev"></i>holiday wk</span>' +
      '<span class="npv2-lg"><i class="npv2-sw npv2-fg-none"></i>no promo</span>' +
      '<span class="npv2-lg"><i class="npv2-wk-opt is-opt">✦</i>optimised placement <i class="npv2-wk-opt is-rep">↺</i>repeats LY</span>' +
      '<span class="npv2-lg-div"></span>' +
      '<span class="npv2-lg">depth vs LY <i class="npv2-wk-ar is-deeper">▲</i> deeper <i class="npv2-wk-ar is-shallower">▼</i> shallower <i class="npv2-wk-ar is-eq">=</i> same · <span class="npv2-wk-ly">LY %</span> = repeats LY</span>' +
      "</div>";
  }
  // exact V1 compare panel (Sales/Units/AGP/HHs, objective highlighted, leader bold)
  function compareGridHTML() {
    const obj = NP.objMeta ? NP.objMeta() : { metric: "revenueM", short: "Sales" };
    const fieldOf = { revenueM: "r", units: "u", agpM: "a", hhK: "h" };
    const cols = [["Sales", "revenueM", (t) => NP.fmt.m(t.r)], ["Units", "units", (t) => NP.fmt.u(t.u)], ["AGP", "agpM", (t) => NP.fmt.m(t.a)], ["HHs", "hhK", (t) => NP.fmt.u(t.h)]];
    const scs = [{ id: "base", name: "Optimised — LY inputs", sub: "optimised, no edits", ov: {} }].concat(NP.state.scenarios.map((s) => ({ id: s.id, name: s.name.replace("Scenario ", "S") + " — Edited", sub: "your edits", ov: s.ov })));
    const tots = scs.map((s) => totalsOf(s.ov)), best = {};
    cols.forEach(([, k]) => { best[k] = Math.max.apply(null, tots.map((t) => t[fieldOf[k]])); });
    const head = '<div class="plan-compare-corner"></div>' + cols.map(([l, k]) => '<div class="plan-compare-col-head' + (obj.metric === k ? " is-obj" : "") + '">' + l + "</div>").join("");
    const rows = scs.map((s, i) => '<div class="plan-compare-row-name ' + (NP.state.activeScenario === s.id ? "is-active" : "is-context") + '"><strong>' + esc(s.name) + "</strong><small>" + s.sub + "</small></div>" +
      cols.map(([, k, f]) => '<div class="plan-compare-cell' + (best[k] === tots[i][fieldOf[k]] && scs.length > 1 ? " is-best" : "") + '">' + f(tots[i]) + "</div>").join("")).join("");
    return '<section class="plan-compare"><header class="plan-compare-head"><strong>Compare scenarios</strong><button class="plan-compare-close" type="button">×</button></header>' +
      '<div class="plan-compare-grid">' + head + rows + "</div>" +
      '<footer class="plan-compare-foot">Bold = leader on each metric · each <strong>Rerun forecast</strong> adds a scenario · objective: ' + esc(obj.short || "Sales") + "</footer></section>";
  }
  function openCompareOverlay() {
    closeCompareOverlay();
    const btn = document.getElementById("npV2Cmp"); if (!btn) return;
    const pop = document.createElement("div"); pop.id = "npV2CmpPop"; pop.className = "np-compare-wrap npv2-cmp-pop";
    pop.innerHTML = compareGridHTML();
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    pop.style.left = (window.scrollX + Math.min(r.left, window.innerWidth - 560)) + "px";
    pop.style.top = (window.scrollY + r.bottom + 9) + "px";
    pop.querySelector(".plan-compare-close").onclick = closeCompareOverlay;
    setTimeout(() => document.addEventListener("mousedown", cmpOutside, true), 0);
  }
  function cmpOutside(e) { const p = document.getElementById("npV2CmpPop"); if (p && !p.contains(e.target) && !e.target.closest("#npV2Cmp")) closeCompareOverlay(); }
  function closeCompareOverlay() { const p = document.getElementById("npV2CmpPop"); if (p) p.remove(); document.removeEventListener("mousedown", cmpOutside, true); }

  /* ---- scenarios (same model as V1: edit → dirty → Rerun creates a scenario) ---- */
  function totalsOf(ov) { let r = 0, u = 0, a = 0, h = 0; NP.cat().items.forEach((o) => { const x = NP.resultFor(o, ov); r += x.revenueM; u += x.units; a += x.agpM; h += x.hhK; }); return { r: r, u: u, a: a, h: h }; }
  function scnShort(s) { return s.name.replace("Scenario ", "S"); }
  function scenarioChips() {
    const st = NP.state;
    let html = '<button type="button" class="npv2-chip' + (st.activeScenario === "base" ? " is-active" : "") + '" data-scn="base" title="Optimised — last-year inputs">Optimised</button>';
    st.scenarios.forEach((s) => { html += '<button type="button" class="npv2-chip' + (st.activeScenario === s.id ? " is-active" : "") + '" data-scn="' + s.id + '" title="' + esc(scnShort(s)) + ' — edited">' + esc(scnShort(s)) + '<span class="npv2-chip-x" data-del="' + s.id + '" title="Delete">×</span></button>'; });
    return html;
  }
  function compareHTML() {
    const scs = [{ id: "base", name: "Base plan", ov: {} }].concat(NP.state.scenarios.map((s) => ({ id: s.id, name: s.name, ov: s.ov })));
    const tots = scs.map((s) => totalsOf(s.ov));
    const best = { r: Math.max.apply(null, tots.map((t) => t.r)), u: Math.max.apply(null, tots.map((t) => t.u)), a: Math.max.apply(null, tots.map((t) => t.a)) };
    const rows = scs.map((s, i) => { const t = tots[i], act = NP.state.activeScenario === s.id; return '<div class="npv2-cmp-row' + (act ? " is-active" : "") + '"><span class="npv2-cmp-name">' + esc(s.name) + '</span><span class="' + (best.r === t.r ? "is-best" : "") + '">' + km(t.r) + '</span><span class="' + (best.u === t.u ? "is-best" : "") + '">' + NP.fmt.u(t.u) + '</span><span class="' + (best.a === t.a ? "is-best" : "") + '">' + km(t.a) + "</span></div>"; }).join("");
    return '<div class="npv2-cmp"><div class="npv2-cmp-row npv2-cmp-head"><span>Scenario</span><span>Sales</span><span>Units</span><span>AGP</span></div>' + rows + "</div>";
  }
  let cmpOpen = false, distCmpOpen = false;
  function bindScen(host) {
    host.querySelectorAll("[data-del]").forEach((x) => (x.onclick = (e) => { e.stopPropagation(); NP.deleteScenario(x.dataset.del); }));
    host.querySelectorAll(".npv2-chip").forEach((b) => (b.onclick = () => NP.setScenario(b.dataset.scn)));
  }
  // an edit needs a reforecast only when it lands outside the discovered band
  function hasOutOfBand() {
    const draft = NP.state.draft, fields = ["vlc", "deadNet", "deepDeadNet", "events", "digEvents", "bothEvents", "deepEvents", "deepDigEvents", "deepBothEvents"];
    for (const o of NP.cat().items) {
      if (!draft[o.uid]) continue;
      const e = NP.effective(o, draft);
      for (const f of fields) { if (NP.isEdited(o, f) && !NP.inBand(o, f, e[f])) return true; }
    }
    return false;
  }
  function updateScenarioUI() {
    const scen = document.getElementById("npV2Scen"); if (scen) { scen.innerHTML = scenarioChips(); bindScen(scen); }
    const db = document.getElementById("npV2Dirty"); if (db) db.hidden = !(NP.isDirty() && hasOutOfBand());
  }

  /* ---- inline editing of the pinned inputs (band-aware, like V1) ---- */
  function onEditInput(e) {
    const inp = e.target, uid = inp.dataset.uid, field = inp.dataset.field, o = NP.cat().items.find((x) => x.uid === uid);
    NP.applyEdit(uid, field, inp.value);
    const cell = inp.closest(".npv2-fg-inc");
    if (cell) { const edited = NP.isEdited(o, field); cell.classList.toggle("is-edited", edited); cell.classList.toggle("is-outband", edited && !NP.inBand(o, field, inp.value)); }
    if (field === "vlc") updateCostCells(o);   // promo cost is derived from VLC × (1 − allowances)
    showBand(inp, o); updateScenarioUI();
  }
  // allowance edits build the (read-only) promo cost — update the derived cost cells live
  function onAllowInput(e) {
    const inp = e.target, uid = inp.dataset.uid, key = inp.dataset.alw, deep = NP.state.v2allowMode === "deep";
    NP.applyAllow(uid, key, inp.value, deep);
    const o = NP.cat().items.find((x) => x.uid === uid);
    updateCostCells(o);
    const cell = inp.closest(".npv2-fg-inc"); if (cell) cell.classList.add("is-edited");
    updateScenarioUI();
  }
  function onAllowBlur(e) {
    const inp = e.target, key = inp.dataset.alw, deep = NP.state.v2allowMode === "deep";
    const o = NP.cat().items.find((x) => x.uid === inp.dataset.uid), eDraft = NP.effective(o, NP.state.draft);
    const lad = deep ? deepLadderOf(o) : eDraft.ladder;
    inp.value = ((lad[key] || 0) * eDraft.vlc).toFixed(2);
  }
  function updateCostCells(o) {
    const reg = document.querySelector('[data-cost="' + o.uid + ':reg"]');
    if (reg) reg.innerHTML = "<b>" + NP.fmt.price(NP.effective(o, NP.state.draft).deadNet) + "</b>";
    const deep = document.querySelector('[data-cost="' + o.uid + ':deep"]');
    if (deep) deep.innerHTML = "<b>" + NP.fmt.price(deepCostOf(o)) + "</b>";
  }
  function onEditBlur(e) {
    const inp = e.target, field = inp.dataset.field, o = NP.cat().items.find((x) => x.uid === inp.dataset.uid), d = NP.effective(o, NP.state.draft);
    const dec = field === "vlc" || field === "deadNet" || field === "deepDeadNet";
    if (d[field] != null) inp.value = dec ? Number(d[field]).toFixed(2) : String(d[field]);
    hideBand();
  }
  function showBand(inp, o) {
    const hint = document.getElementById("npCellHint"); if (!hint) return;
    const field = inp.dataset.field, r = NP.ranges(o)[field]; if (!r) return;
    const f = (v) => (r.unit === "$" ? "$" + v.toFixed(2) : Math.round(v)), within = NP.inBand(o, field, inp.value);
    hint.innerHTML = "Discovered band <b>" + f(r.lo) + "–" + f(r.hi) + "</b> · " + (within ? '<span class="np-pos">within band — no reforecast needed</span>' : '<span class="np-neg">outside band — Rerun to reforecast</span>');
    const rect = inp.getBoundingClientRect();
    hint.style.left = Math.min(rect.left, window.innerWidth - 340) + "px"; hint.style.top = (rect.bottom + 4) + "px"; hint.hidden = false;
  }
  function hideBand() { const h = document.getElementById("npCellHint"); if (h) h.hidden = true; }

  function renderFront() {
    const front = document.getElementById(FRONT); if (!front) return;
    const map = NP.displayMap(), all = NP.cat().items;
    const vendors = [...new Set(all.map((o) => o.vendor))].sort();
    const rogs = [...new Set(all.map((o) => o.rog))].sort();
    const clusters = [...new Set(all.map((o) => o.cluster))].map((c) => [c, NP.CLUSTER_LABEL[c] || c]);
    if (ff.vendor !== "all" && !vendors.includes(ff.vendor)) ff.vendor = "all";
    if (ff.rog !== "all" && !rogs.includes(ff.rog)) ff.rog = "all";
    const items = frontItems();
    front.innerHTML =
      '<div class="npv2-fg-tools">' +
        stratCardsHTML() +
        // row 2 — scenario (left) · interactions (right)
        '<div class="npv2-fg-trow">' +
          '<div class="npv2-fg-gl">' +
            '<span class="npv2-fg-scenlab">Scenario</span><div class="npv2-scen-seg" id="npV2Scen"></div>' +
            '<span class="npv2-divider"></span>' +
            '<button type="button" class="npv2-fg-btn" id="npV2Cmp">Compare</button>' +
          "</div>" +
          '<div class="npv2-fg-gr">' +
            '<button type="button" class="npv2-ix-cap' + (NP.state.v2ix ? " is-on" : "") + '" id="npV2Ix" title="Highlight where the optimiser separates cluster rivals (cannibalisation) and co-promotes complements (halo)"><span class="npv2-ix-dot"></span>Interactions ' + (NP.state.v2ix ? "on" : "off") + "</button>" +
            '<span class="npv2-fg-ixkey"' + (NP.state.v2ix ? "" : " hidden") + '><i class="npv2-ixk npv2-ixk-h"></i>halo <i class="npv2-ixk npv2-ixk-c"></i>cannib.</span>' +
          "</div>" +
        "</div>" +
        // row 3 — filters (left) · sort (right)
        '<div class="npv2-fg-trow">' +
          '<div class="npv2-fg-gl">' + sel("Vendor", "npV2FgVendor", vendors, ff.vendor) + sel("ROG", "npV2FgRog", rogs, ff.rog) + sel("Class", "npV2FgClass", clusters, ff.cls) + "</div>" +
          '<div class="npv2-fg-gr">' + sortControlsHTML() + "</div>" +
        "</div>" +
        '<div class="npv2-fg-dirty" id="npV2Dirty" hidden><span>You have unsaved edits.</span><button type="button" class="npv2-fg-dlink" id="npV2RerunB">Rerun forecast to see the impact →</button><button type="button" class="npv2-fg-dlink npv2-fg-dmut" id="npV2Discard">Discard edits</button></div>' +
        '<div class="npv2-rule"></div>' +
        // row 4 — legend
        '<div class="npv2-legend-row">' + legendHTML() + "</div>" +
        '<div class="npv2-rule"></div>' +
      "</div>" +
      '<div class="npv2-stage' + (NP.state.v2plan ? " is-plan" : "") + '" id="npV2Stage">' +
        '<div class="npv2-fg-wrap" id="' + WRAP + '">' + tableHTML(items, map) + "</div>" +
        '<div class="npv2-planpanel" id="npV2PlanPanel" aria-label="V1 52-week plan"></div>' +
      "</div>";
    front.querySelectorAll("[data-strat]").forEach((b) => (b.onclick = () => { NP.state.cf.strategy = b.dataset.strat; renderFront(); }));
    const vs = front.querySelector("#npV2FgVendor"); vs.onchange = () => { ff.vendor = vs.value; renderFront(); };
    const rs = front.querySelector("#npV2FgRog"); rs.onchange = () => { ff.rog = rs.value; renderFront(); };
    const cs = front.querySelector("#npV2FgClass"); cs.onchange = () => { ff.cls = cs.value; renderFront(); };
    // editable pinned inputs (VLC, events) — allowance inputs are handled separately below
    front.querySelectorAll(".npv2-fg-input:not(.npv2-fg-alwin)").forEach((inp) => {
      inp.addEventListener("input", onEditInput);
      inp.addEventListener("focus", (e) => showBand(e.target, NP.cat().items.find((x) => x.uid === e.target.dataset.uid)));
      inp.addEventListener("blur", onEditBlur);
    });
    // allowance inputs build the (read-only) promo cost — write to the regular/deep ladder live
    front.querySelectorAll(".npv2-fg-alwin").forEach((inp) => {
      inp.addEventListener("input", onAllowInput);
      inp.addEventListener("blur", onAllowBlur);
    });
    front.querySelectorAll("[data-allowtoggle]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); NP.state.v2allowMode = NP.state.v2allowMode === "deep" ? "reg" : "deep"; renderFront(); }));
    // click a period header → zoom the ribbon into that period's 4 weeks (pinned block stays)
    front.querySelectorAll("[data-period]").forEach((el) => (el.onclick = (e) => { e.stopPropagation(); zoomPeriod(+el.dataset.period); }));
    front.querySelectorAll("[data-zoomout]").forEach((el) => (el.onclick = (e) => { e.stopPropagation(); zoomOut(); }));
    // click a promoted week → single-week drawer
    front.querySelectorAll("[data-mweek]").forEach((el) => (el.onclick = () => { const p = el.dataset.mweek.split("|"); if (window.NPViews && NPViews.openWeek) NPViews.openWeek("plan", p[0], +p[1]); }));
    // scenario controls
    front.querySelector("#npV2RerunB").onclick = () => NP.rerun();
    front.querySelector("#npV2Discard").onclick = () => NP.revert();
    front.querySelector("#npV2Cmp").onclick = openCompareOverlay;
    const ixb = front.querySelector("#npV2Ix"); if (ixb) ixb.onclick = () => { NP.state.v2ix = !NP.state.v2ix; renderFront(); };
    front.querySelectorAll("[data-evtoggle]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); NP.state.v2evMode = NP.state.v2evMode === "deep" ? "reg" : "deep"; renderFront(); }));
    front.querySelectorAll("[data-breakup]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); openBreakup(); }));
    front.querySelectorAll("[data-sortby]").forEach((b) => (b.onclick = () => { ff.sortBy = ff.sortBy === b.dataset.sortby ? null : b.dataset.sortby; renderFront(); }));
    front.querySelectorAll("[data-bin]").forEach((b) => (b.onclick = () => { ff.bin = b.dataset.bin; renderFront(); }));
    front.querySelectorAll("[data-planview]").forEach((b) => (b.onclick = () => togglePlanView(b.dataset.planview === "1")));
    updateScenarioUI();
    const wrap = front.querySelector("#" + WRAP);
    bindDrag(wrap);
    // condense the strategy cards to just the selected one once the table is scrolled
    const tools = front.querySelector(".npv2-fg-tools");
    wrap.addEventListener("scroll", () => { if (tools) tools.classList.toggle("is-scrolled", wrap.scrollTop > 14); }, { passive: true });
    // if the swipe-up 52-week (V1) view is active, (re)fill it so it tracks toolbar changes
    if (NP.state.v2plan) renderPlanPanel();
  }

  /* ============================================ swipe-up V1 52-week plan table
     A toolbar toggle reveals the classic V1 52-week plan table (the deal-input
     columns already live in the V2 pinned area, so this is purely the plan grid).
     It slides up while the V2 grid slides off; period headers flip to the same
     per-NCRC 4-week detail as the V2 grid, and week cells open the V1 drawer. */
  function renderPlanPanel() {
    const panel = document.getElementById("npV2PlanPanel"); if (!panel) return;
    const NV = window.NPViews, step4 = document.getElementById("npStep4");
    if (!NV || !NV.renderResults || !step4) { panel.innerHTML = '<div class="npv2-empty">52-week view unavailable.</div>'; return; }
    // drive the V1 table from the V2 toolbar filters (so they stay in sync)
    NP.state.res.vendor = ff.vendor; NP.state.res.rog = ff.rog; NP.state.res.bin = ff.bin;
    NV.renderResults();
    const src = step4.querySelector(".np-results-panel");
    if (!src) { panel.innerHTML = '<div class="npv2-empty">No plan to show.</div>'; return; }
    // strip what the V2 toolbar already owns (filters, scenario summary, pinned KPI strip)
    src.querySelectorAll(".np-rhead-controls, .np-res-summary, .np-pin-out").forEach((el) => el.remove());
    // months → 13 periods (4 weeks each), aligned 1:1 to the 52-week ribbon
    const mrow = src.querySelector(".np-rc-monthrow");
    if (mrow) {
      mrow.style.gridTemplateColumns = "repeat(13, 1fr)";
      mrow.innerHTML = Array.from({ length: 13 }, (_, p) => '<span class="np-rc-month" data-period="' + p + '" role="button" tabindex="0" title="Flip into period ' + (p + 1) + ' detail (4 weeks)">P' + (p + 1) + "</span>").join("");
    }
    panel.innerHTML = "";
    panel.appendChild(src);
    // period header → same 4-week flip as the V2 grid (week-cell clicks keep their V1 drawer binding)
    panel.querySelectorAll("[data-period]").forEach((el) => (el.onclick = (e) => { e.stopPropagation(); flipToMonth(+el.dataset.period); }));
    // condense the KPI/strategy cards once the V1 table scrolls — this panel is its own
    // scroll container (the V2 wrap is off-screen), so it needs its own scroll listener
    const tools = document.querySelector(".npv2-fg-tools");
    if (tools && !panel.__condenseBound) {
      panel.__condenseBound = true;
      panel.addEventListener("scroll", () => { tools.classList.toggle("is-scrolled", panel.scrollTop > 14); }, { passive: true });
    }
    if (tools) tools.classList.toggle("is-scrolled", panel.scrollTop > 14);
  }
  function togglePlanView(on) {
    on = !!on;
    if (!!NP.state.v2plan === on) return;
    NP.state.v2plan = on;
    // the V1 table has no integrated inputs → the "Deal inputs" step reappears (and hides again when off)
    if (NP.renderStepper) NP.renderStepper();
    const front = document.getElementById(FRONT);
    if (front) front.querySelectorAll("[data-planview]").forEach((b) => b.classList.toggle("is-active", (b.dataset.planview === "1") === on));
    const stage = document.getElementById("npV2Stage");
    if (!stage) { renderFront(); return; }
    if (on) {
      renderPlanPanel();
      requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.add("is-plan")));
    } else {
      stage.classList.remove("is-plan");
      setTimeout(() => { if (!NP.state.v2plan) { const p = document.getElementById("npV2PlanPanel"); if (p) p.innerHTML = ""; } }, 480);
    }
  }

  /* ========================================== period zoom (in/out, same grid)
     Clicking a period zooms the ribbon down to that period's 4 weeks while the
     pinned identity/outputs/inputs stay put; the zoom-out header returns to 52. */
  // drill into the allowance breakup behind the promo cost (the classic deal-input
  // allowance view, with its Regular/Deep selector + Hdr-flat-separate column)
  function openBreakup() {
    NP.state.v2plan = true;     // makes the Deal-inputs step reachable + stops the 3→4 remap
    NP.state.showAllow = true;  // open the allowance breakup
    if (NP.renderStepper) NP.renderStepper();
    NP.goStep(3);
  }
  function zoomPeriod(p) { if (NP.state.v2period === p) return zoomOut(); NP.state.v2period = p; renderFront(); playZoom("in"); }
  function zoomOut() { if (NP.state.v2period == null) return; NP.state.v2period = null; renderFront(); playZoom("out"); }
  function playZoom(dir) {
    const wrap = document.getElementById(WRAP); if (!wrap) return;
    const cls = dir === "in" ? "npv2-zin" : "npv2-zout";
    wrap.classList.add(cls);
    setTimeout(() => wrap.classList.remove(cls), 340);
  }

  /* horizontal drag-to-pan — the "swipe" gesture; capture only after a real drag so taps on
     week cells still open the detail. CSS scroll-snap + overscroll-behavior do the rest. */
  function bindDrag(wrap) {
    let down = false, drag = false, sx = 0, sl = 0, pid = null;
    wrap.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input, select, button, a")) return;
      down = true; drag = false; sx = e.clientX; sl = wrap.scrollLeft; pid = e.pointerId;
    });
    wrap.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (!drag && Math.abs(dx) > 5) { drag = true; wrap.classList.add("is-grab"); try { wrap.setPointerCapture(pid); } catch (x) {} }
      if (drag) { wrap.scrollLeft = sl - dx; e.preventDefault(); }
    });
    const end = () => { if (drag) { wrap.classList.remove("is-grab"); wrap.__suppressClick = true; } down = false; drag = false; };
    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", end);
    wrap.addEventListener("click", (e) => { if (wrap.__suppressClick) { e.stopPropagation(); e.preventDefault(); wrap.__suppressClick = false; } }, true);
    // wheel/trackpad: overflow-x is hidden (no scrollbar by design) so a sideways
    // trackpad swipe or Shift+wheel won't pan natively — translate it to scrollLeft.
    // Apply ANY horizontal delta (not just the dominant axis) so soft/diagonal swipes
    // pan reliably; on a diagonal we also move vertically so native scroll isn't lost.
    wrap.addEventListener("wheel", (e) => {
      if (e.shiftKey && (e.deltaX || e.deltaY)) { wrap.scrollLeft += (e.deltaX || e.deltaY); e.preventDefault(); return; }
      if (e.deltaX) { wrap.scrollLeft += e.deltaX; if (e.deltaY) wrap.scrollTop += e.deltaY; e.preventDefault(); }
      // pure vertical (deltaX === 0) falls through to native overflow-y scrolling
    }, { passive: false });
  }

  /* ===================================================================== the flip */
  function flipToMonth(m) {
    if (flip.animating) return;
    flip.m = m; mfilter.vendor = ff.vendor; mfilter.cls = ff.cls;
    buildMonthFace(m);
    doFlip(true);
  }
  function flipBack() { if (!flip.animating) doFlip(false); }
  // Zoom transition (replaces the old rotateY flip): the current view scales+fades out
  // while the incoming view scales+fades in, so it reads as zooming INTO a period and
  // back OUT to the 52-week grid. The two faces overlap (absolute) only during the anim.
  function doFlip(toBack) {
    const fl = document.getElementById(FLIPEL); if (!fl) return;
    const front = document.getElementById(FRONT), back = document.getElementById(MFACE);
    flip.animating = true; flip.open = toBack;
    const oldFace = toBack ? front : back, newFace = toBack ? back : front;
    const newFrom = toBack ? 0.9 : 1.1, oldTo = toBack ? 1.1 : 0.9; // in: grow from small; out: shrink away
    fl.classList.add("is-zooming");
    newFace.hidden = false; oldFace.hidden = false;
    newFace.style.transition = "none";
    newFace.style.transform = "scale(" + newFrom + ")";
    newFace.style.opacity = "0";
    void fl.offsetWidth; // commit the start state before transitioning
    requestAnimationFrame(() => {
      newFace.style.transition = "";
      newFace.style.transform = "scale(1)";
      newFace.style.opacity = "1";
      oldFace.style.transform = "scale(" + oldTo + ")";
      oldFace.style.opacity = "0";
    });
    setTimeout(() => {
      oldFace.hidden = true;
      [front, back].forEach((f) => { f.style.transition = ""; f.style.transform = ""; f.style.opacity = ""; });
      fl.classList.remove("is-zooming");
      flip.animating = false;
    }, 300);
  }
  function syncFlip() {
    const fl = document.getElementById(FLIPEL); if (!fl) return;
    const front = document.getElementById(FRONT), back = document.getElementById(MFACE);
    if (flip.open) { buildMonthFace(flip.m); front.hidden = true; back.hidden = false; }
    else { front.hidden = false; back.hidden = true; }
  }

  /* ====================================================== month detail (back face) */
  // periods are 13 × 4 weeks (the period header the user clicks)
  function monthWeeks(p) { const s = p * 4, e = Math.min(52, s + 4), a = []; for (let w = s; w < e; w++) a.push(w); return { weeks: a, start: s, end: e }; }
  function monthItems() {
    let items = NP.cat().items.slice().sort((a, b) => (a.vendor === b.vendor ? a.item.localeCompare(b.item) : a.vendor.localeCompare(b.vendor)));
    if (ff.rog !== "all") items = items.filter((o) => o.rog === ff.rog);
    if (mfilter.vendor !== "all") items = items.filter((o) => o.vendor === mfilter.vendor);
    if (mfilter.cls !== "all") items = items.filter((o) => o.cluster === mfilter.cls);
    return items;
  }
  // compact CY / LY / Δ mini-table — Sales/Units/AGP labelled once (column heads), not per value
  // showLabels (default true) prints the CY/LY/Δ row labels; the in-grid period detail
  // passes false on all but the first week so the labels aren't repeated across the row.
  function miniTable(cy, ly, showLabels) {
    const dCell = (c, l, f) => { const d = c - l, p = l ? d / l : 0, pos = d >= 0; return '<span class="npv2-mc-dc"><b class="' + (pos ? "np-pos" : "np-neg") + '">' + (d >= 0 ? "+" : "-") + f(Math.abs(d)) + '</b><i class="' + (pos ? "np-pos" : "np-neg") + '">' + NP.fmt.pct(p) + "</i></span>"; };
    const L = (t) => '<span class="npv2-mc-rl">' + (showLabels === false ? "" : t) + "</span>";
    return '<div class="npv2-mc-mt">' +
      '<div class="npv2-mc-row">' + L("CY") + "<span>" + km(cy.s) + "</span><span>" + NP.fmt.u(cy.u) + "</span><span>" + km(cy.a) + "</span></div>" +
      '<div class="npv2-mc-row npv2-mc-ly">' + L("LY") + "<span>" + km(ly.s) + "</span><span>" + NP.fmt.u(ly.u) + "</span><span>" + km(ly.a) + "</span></div>" +
      '<div class="npv2-mc-row npv2-mc-d">' + L("Δ") + dCell(cy.s, ly.s, km) + dCell(cy.u, ly.u, NP.fmt.u) + dCell(cy.a, ly.a, km) + "</div></div>";
  }
  function promoBlock(o, c) {
    // "locked" is only for promoted weeks locked into the plan — never on non-promoted weeks
    if (!c.promoted) return '<div class="npv2-mc-promo npv2-mc-nopromo">no promo planned</div>';
    const mech = c.mech ? NP.MECH_LABEL[c.mech] : "", depthPct = (d) => (d * 100).toFixed(0) + "%";
    const hasDig = c.digital && c.digital.length, digDepth = Math.min(0.5, c.depth + 0.06);
    const locked = !!(NP.state.cf.approved && NP.state.cf.approved[o.uid + ":" + c.week]);
    const prow = (lab, chip, disc, price, off) => '<div class="npv2-mc-prow' + (off ? " npv2-mc-prow-off" : "") + '"><span class="npv2-mc-pl">' + lab + "</span>" +
      (off ? '<span class="npv2-mc-na">— none</span>' : '<span class="npv2-mc-ptac">' + chip + '</span><span class="npv2-mc-pdisc">' + disc + '</span><span class="npv2-mc-pprice">' + price + "</span>") + "</div>";
    const storeChip = '<span class="npv2-tac tactic-' + c.store.className + '">' + NP.displayTactic(c.store.code) + "</span>";
    const store = prow("Store", storeChip, mech + " · " + depthPct(c.depth), NP.fmt.price(NP.promoPriceOf(o, c.depth)), false);
    const dig = hasDig
      ? prow("Digital", '<span class="npv2-tac npv2-tac-dig">' + esc(NP.DIGITAL_NAMES[c.digital[0]] || "Digital") + "</span>", mech + " · " + depthPct(digDepth), NP.fmt.price(NP.promoPriceOf(o, digDepth)), false)
      : prow("Digital", "", "", "", true);
    return '<div class="npv2-mc-promo">' + (locked ? '<div class="npv2-mc-locked">🔒 locked into plan</div>' : "") + store + dig + "</div>";
  }
  function monthCell(o, s, wk, w, noAlw) {
    const c = wk[w];
    let cls = " npv2-mg-off", attr = "";
    if (c.promoted) { cls = " npv2-mg-on" + (noAlw ? " npv2-mg-noalw" : ""); attr = ' data-mweek="' + o.uid + "|" + c.week + '" role="button" tabindex="0" title="Open week ' + c.week + ' detail"'; }
    else if (c.locked) cls = " npv2-mg-locked";
    const cy = { s: s.sales[w], u: s.units[w], a: s.agp[w] }, ly = { s: s.lySales[w], u: s.lyUnits[w], a: s.lyAgp[w] };
    const warn = c.promoted && noAlw ? '<div class="npv2-mc-warn"><span>⚠</span> on promo · no vendor allowance</div>' : "";
    return '<td class="npv2-mg-cell' + cls + '"' + attr + '><div class="npv2-mc">' + miniTable(cy, ly) + promoBlock(o, c) + warn + "</div></td>";
  }
  // in-grid period detail cell — the SAME rich content as the flip face's monthCell, but
  // rendered as a column of the frozen-pane grid so the pinned identity + editable deal
  // inputs stay on screen (the complaint with the old flip was it hid the inputs).
  function periodCell(o, s, wk, w, noAlw, isFirst) {
    const c = wk[w];
    const cy = { s: s.sales[w], u: s.units[w], a: s.agp[w] }, ly = { s: s.lySales[w], u: s.lyUnits[w], a: s.lyAgp[w] };
    let cls = "npv2-fg-pcell", attr = "";
    if (c.promoted) { cls += " is-promo" + (noAlw ? " is-noalw" : ""); attr = ' data-mweek="' + o.uid + "|" + c.week + '" role="button" tabindex="0" title="Open week ' + c.week + ' detail"'; }
    else if (c.locked) cls += " is-locked";
    if (isFirst) cls += " is-first";
    const warn = c.promoted && noAlw ? '<div class="npv2-mc-warn"><span>⚠</span> on promo · no vendor allowance</div>' : "";
    return '<td class="' + cls + '"' + attr + '><div class="npv2-mc">' + miniTable(cy, ly, isFirst) + promoBlock(o, c) + warn + "</div></td>";
  }
  function monthGrid(m) {
    const map = NP.displayMap(), mw = monthWeeks(m), weeks = mw.weeks, items = monthItems();
    if (!items.length) return '<div class="npv2-empty">No NCRCs match these filters.</div>';
    const evOf = (w) => { const e = NP.RETAIL_EVENTS.find((x) => x.wk === w); return e ? "<small>" + esc(e.short) + "</small>" : ""; };
    const head = '<tr><th class="npv2-mg-ncrc">NCRC</th>' + weeks.map((w) => '<th class="npv2-mg-wkh">Wk ' + (w + 1) + evOf(w) + "</th>").join("") + '<th class="npv2-mg-roll">P' + (m + 1) + " roll-up</th></tr>";
    const alwU = (o) => { const e = NP.effective(o, map); return e.vlc - e.deadNet; };
    const noAlwSet = new Set(items.slice().sort((a, b) => alwU(a) - alwU(b)).slice(0, Math.max(1, Math.round(items.length * 0.12))).map((o) => o.uid));
    let lastVendor = null, rows = "";
    items.forEach((o) => {
      const s = NP.weeklySeries(o, map), wk = NP.weekPlan(o, map, false), e = NP.effective(o, map), noAlw = noAlwSet.has(o.uid);
      if (o.vendor !== lastVendor) { lastVendor = o.vendor; rows += '<tr class="npv2-mg-vrow"><td colspan="' + (weeks.length + 2) + '">' + esc(o.vendor) + "</td></tr>"; }
      let rS = 0, rU = 0, rA = 0, lS = 0, lU = 0, lA = 0, nP = 0;
      weeks.forEach((w) => { rS += s.sales[w]; rU += s.units[w]; rA += s.agp[w]; lS += s.lySales[w]; lU += s.lyUnits[w]; lA += s.lyAgp[w]; if (wk[w].promoted) nP++; });
      const cells = weeks.map((w) => monthCell(o, s, wk, w, noAlw)).join("");
      const roll = '<td class="npv2-mg-rollcell"><div class="npv2-mc">' + miniTable({ s: rS, u: rU, a: rA }, { s: lS, u: lU, a: lA }) + '<div class="npv2-mg-rollp">' + nP + " / " + weeks.length + " wks on promo</div></div></td>";
      const idh = '<th class="npv2-mg-ncrc"><b>' + esc(o.item) + '</b><span class="np-rc-size">' + esc(o.pack) + '</span><span class="np-rc-id">' + o.ncrc + "</span>" +
        '<div class="npv2-mg-vlc"><span>VLC <b>' + NP.fmt.price(e.vlc) + '</b></span><span>Base <b>' + NP.fmt.price(o.basePrice) + "</b></span></div></th>";
      rows += "<tr>" + idh + cells + roll + "</tr>";
    });
    return '<table class="npv2-mg"><thead>' + head + "</thead><tbody>" + rows + "</tbody></table>";
  }
  function buildMonthFace(m) {
    const back = document.getElementById(MFACE); if (!back) return;
    const mw = monthWeeks(m), all = NP.cat().items;
    const vendors = [...new Set(all.map((o) => o.vendor))].sort();
    const clusters = [...new Set(all.map((o) => o.cluster))];
    if (mfilter.vendor !== "all" && !vendors.includes(mfilter.vendor)) mfilter.vendor = "all";
    if (mfilter.cls !== "all" && !clusters.includes(mfilter.cls)) mfilter.cls = "all";
    const vsel = '<label class="npv2-mfilter">Vendor <select id="npV2MVendor"><option value="all">All vendors</option>' +
      vendors.map((v) => "<option" + (mfilter.vendor === v ? " selected" : "") + ">" + esc(v) + "</option>").join("") + "</select></label>";
    const csel = '<label class="npv2-mfilter">Class <select id="npV2MClass"><option value="all">All classes</option>' +
      clusters.map((c) => '<option value="' + c + '"' + (mfilter.cls === c ? " selected" : "") + ">" + esc(NP.CLUSTER_LABEL[c] || c) + "</option>").join("") + "</select></label>";
    back.innerHTML =
      '<header class="npv2-mhead">' +
        '<button type="button" class="npv2-back">‹ Deal plan</button>' +
        '<div class="npv2-mtitle"><h3>Period ' + (m + 1) + ' — week by week</h3><small>Weeks ' + (mw.start + 1) + "–" + mw.end + " · per-NCRC detail · vs last year</small></div>" +
        '<div class="npv2-mfilters">' + vsel + csel + '<span class="npv2-mflip" aria-hidden="true">⟳ flipped from the plan</span></div>' +
      "</header>" +
      totalsStripHTML(monthItems(), NP.displayMap()) +
      '<div class="npv2-mkey">Each week cell — rows <b>CY</b> / <b>LY</b> / <b>Δ</b> · columns <b>Sales</b> · <b>Units</b> · <b>AGP</b></div>' +
      '<div class="npv2-mbody">' + monthGrid(m) + "</div>";
    back.querySelector(".npv2-back").onclick = flipBack;
    const vs = back.querySelector("#npV2MVendor"); vs.onchange = () => { mfilter.vendor = vs.value; refreshMonthBody(m); };
    const cs = back.querySelector("#npV2MClass"); cs.onchange = () => { mfilter.cls = cs.value; refreshMonthBody(m); };
    bindMonthGrid(back);
  }
  function refreshMonthBody(m) {
    const b = document.querySelector("#" + MFACE + " .npv2-mbody");
    if (b) { b.innerHTML = monthGrid(m); bindMonthGrid(document.getElementById(MFACE)); }
  }
  function bindMonthGrid(root) {
    root.querySelectorAll("[data-mweek]").forEach((el) => (el.onclick = () => {
      const p = el.dataset.mweek.split("|");
      if (window.NPViews && NPViews.openWeek) NPViews.openWeek("plan", p[0], +p[1]);
    }));
  }

  /* ================================================================ mount / unmount */
  function mount() {
    ensureShell();
    renderToggle();
    renderFront();
    syncFlip();
  }
  function unmount() {
    if (!shellExists()) return;
    document.getElementById(SHELL).remove();
    flip = { open: false, m: 0, animating: false };
  }

  window.NPV2 = { mount, unmount, renderToggle };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderToggle);
  else renderToggle();
})();
