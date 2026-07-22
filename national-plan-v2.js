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
  const ff = { cat: "all", vendor: "all", rog: "all", cls: "all", sub: "all", sortBy: null, bin: "all" };   // front-grid filters + sort
  // Week-by-week view (step 5) — which NCRC + which of the 52 weeks is open. uid resolves
  // to the first filtered worklist item when null (or when the current pick is filtered out).
  const WEEKSEL = { uid: null, week: NP.CURRENT_WEEK };   // first plannable week (locked actuals are excluded)
  // sub-class — a finer split under class, derived from the item's demand form
  const SUBCLASS_LABEL = { bar: "Core / everyday", bag: "Multipack", tub: "Club & seasonal" };
  const mfilter = { vendor: "all", cls: "all" };           // month-detail filters
  let stratExpanded = false;                               // view-level "Other scenarios" disclosure (NOT the build-time multiScenario gate)
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
    { k: "sales", label: "Sales", money: true, get: (r) => r.revenueM },
    { k: "units", label: "Units", money: false, get: (r) => r.units },
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
    { k: "redemption", label: 'Redem<i class="npv2-fg-soonb">soon</i>', soon: true },   // redemption allowance — placeholder, coming later
    { k: "shipToStore", label: "Ship", edit: true }
  ];
  const ALWTITLE = { offInvoice: "off-invoice", scan: "scan", redemption: "redemption", shipToStore: "ship-to-store" };
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
    if (c.soon) return '<div class="npv2-fg-cell npv2-fg-inc npv2-fg-soon" title="Redemption allowance ($/u) — coming later"><input class="npv2-fg-input" type="text" value="—" disabled></div>';
    const deep = NP.state.v2allowMode === "deep";
    const lad = deep ? deepLadderOf(o) : eDraft.ladder;
    const dollar = (lad[c.k] || 0) * eDraft.vlc;
    return '<div class="npv2-fg-cell npv2-fg-inc npv2-fg-edit" data-cell="' + o.uid + ":alw:" + c.k + '" title="' + esc((deep ? "Deep" : "Regular") + " " + (ALWTITLE[c.k] || c.k) + " allowance ($/u) — builds the promo cost") + '">' +
      '<input class="npv2-fg-input npv2-fg-alwin" type="text" inputmode="decimal" data-uid="' + o.uid + '" data-alw="' + c.k + '" value="' + dollar.toFixed(2) + '"></div>';
  }
  // events — the merchant enters ONE total; the learnt store/digital/combined split
  // is shown underneath and edits are distributed proportionally to that split.
  function evSplitOf(e, deep) { return deep ? [e.deepEvents, e.deepDigEvents, e.deepBothEvents] : [e.events, e.digEvents, e.bothEvents]; }
  function evFields(deep) { return deep ? ["deepEvents", "deepDigEvents", "deepBothEvents"] : ["events", "digEvents", "bothEvents"]; }
  function evCols() {
    const deep = NP.state.v2evMode === "deep";
    return [{ k: deep ? "deepEvTotal" : "evTotal", label: "Total / yr", edit: true, val: (o, e) => { const s = evSplitOf(e, deep); return String(s[0] + s[1] + s[2]); } }];
  }
  function evCellHTML(o, eDraft) {
    const deep = NP.state.v2evMode === "deep";
    const sp = evSplitOf(eDraft, deep), tot = sp[0] + sp[1] + sp[2], k = deep ? "deepEvTotal" : "evTotal";
    const edited = evFields(deep).some((f) => NP.isEdited(o, f));
    return '<div class="npv2-fg-cell npv2-fg-inc npv2-fg-edit npv2-fg-evc' + (edited ? " is-edited" : "") + '" data-cell="' + o.uid + ":" + k + '" title="' + esc((deep ? "Deep-discount" : "Regular") + " promo events / yr — enter the total; the learnt store · digital · combined split underneath is kept proportional") + '">' +
      '<input class="npv2-fg-input" type="text" inputmode="numeric" data-uid="' + o.uid + '" data-field="' + k + '" value="' + tot + '">' +
      '<span class="npv2-fg-evsplit" data-evsplit="' + o.uid + '">S ' + sp[0] + " · D " + sp[1] + " · S+D " + sp[2] + "</span></div>";
  }
  function distributeEvents(o, raw, deep) {
    let t = Math.round(parseFloat(raw)); if (isNaN(t)) t = 0; t = Math.max(0, Math.min(60, t));
    const cur = evSplitOf(NP.effective(o, NP.state.draft), deep), sum = cur[0] + cur[1] + cur[2];
    const w = sum > 0 ? cur.map((x) => x / sum) : [0.5, 0.3, 0.2];
    const s = Math.round(t * w[0]), d = Math.round(t * w[1]);
    const parts = [s, d, Math.max(0, t - s - d)];
    evFields(deep).forEach((f, i) => NP.applyEdit(o.uid, f, parts[i]));
    return parts;
  }
  const INTITLE = { vlc: "Vendor list cost / unit", deadNet: "Promo cost — regular weeks", deepDeadNet: "Promo cost — deep-discount weeks", events: "Regular store events / yr", digEvents: "Regular digital events / yr", bothEvents: "Regular store & digital / yr", deepEvents: "Deep store events / yr", deepDigEvents: "Deep digital events / yr", deepBothEvents: "Deep store & digital / yr" };
  // events column header doubles as the Regular↔Deep toggle (events are coupled to the cost columns)
  function evCap() {
    const deep = NP.state.v2evMode === "deep";
    return 'Events · <button type="button" class="npv2-evtoggle" data-evtoggle title="Editing events &amp; cost for regular or deep-discount weeks — click to switch">' + (deep ? "D" : "R") + " ⇄</button>";
  }
  function frontItems() {
    let items = NP.cat().items.slice();
    if (ff.cat !== "all") items = items.filter((o) => o.catId === ff.cat);
    if (ff.vendor !== "all") items = items.filter((o) => o.vendor === ff.vendor);
    if (ff.rog !== "all") items = items.filter((o) => o.rog === ff.rog);
    if (ff.cls !== "all") items = items.filter((o) => o.cluster === ff.cls);
    if (ff.sub !== "all") items = items.filter((o) => o.form === ff.sub);
    const metric = ff.sortBy || "sales";
    if (ff.bin !== "all") { const bins = NP.binsFor(); items = items.filter((o) => bins[o.uid][metric] === +ff.bin); }
    if (ff.sortBy) {
      const map = NP.displayMap(), v = (o) => { const r = NP.resultFor(o, map); return ff.sortBy === "units" ? r.units : ff.sortBy === "agp" ? r.agpM : r.revenueM; };
      items.sort((a, b) => v(b) - v(a)); // highest → lowest
    } else items.sort((a, b) => (a.vendor === b.vendor ? a.item.localeCompare(b.item) : a.vendor.localeCompare(b.vendor)));
    return items;
  }
  // subtle Sort-by-velocity-bin pills (Sales/Units/AGP × 1..5 quintiles)
  function sortControlsHTML(includePlan) {
    if (includePlan === undefined) includePlan = true;   // the week-by-week view drops the swipe-up 52-week toggle
    const pill = (label, active, attr) => '<button type="button" class="npv2-sort-pill' + (active ? " is-active" : "") + '" ' + attr + ">" + label + "</button>";
    const sortPills = [["sales", "Sales"], ["units", "Units"], ["agp", "AGP"]].map(([m, l]) => pill(l, ff.sortBy === m, 'data-sortby="' + m + '"')).join("");
    const binsPresent = [...new Set((NP.cat().items || []).map((o) => o.bin).filter((b) => b != null))].sort();
    const binPills = ["all"].concat(binsPresent.map(String)).map((b) => pill(b === "all" ? "All" : b, (ff.bin || "all") === b, 'data-bin="' + b + '"')).join("");
    const planOn = !!NP.state.v2plan;
    const planPills = pill("Off", !planOn, 'data-planview="0"') + pill("On", planOn, 'data-planview="1"');
    return '<span class="npv2-sort"><span class="npv2-sort-l">Sort by</span><span class="npv2-pillgroup">' + sortPills + "</span></span>" +
      '<span class="npv2-divider"></span>' +
      '<span class="npv2-sort"><span class="npv2-sort-l">Velocity</span><span class="npv2-pillgroup">' + binPills + "</span></span>" +
      (includePlan ? '<span class="npv2-divider"></span>' +
        '<span class="npv2-sort"><span class="npv2-sort-l">52-week</span><span class="npv2-pillgroup">' + planPills + "</span></span>" : "");
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
  function inputsOn() { return NP.state.v2inputs !== false; }
  function idCell(o, res, ly, eDraft) {
    return '<th class="npv2-fg-id"><div class="npv2-fg-idin">' +
      '<div class="npv2-fg-name"><b>' + esc(o.item) + " " + esc(o.pack) + '</b><span class="np-rc-id">' + esc(String(o.ncrc).replace(/^NCRC\s*/i, "")) + '</span><span class="np-rc-id npv2-fg-base">Base ' + NP.fmt.price(o.basePrice) + "</span></div>" +
      grpBody("out", OUTCOLS.map((c) => outCellHTML(c, res, ly)).join("")) +
      (inputsOn()
        ? grpBody("vlc", inCellHTML(VLCCOL, o, eDraft)) +
          grpBody("cost", costCellHTML(o, false) + costCellHTML(o, true)) +
          grpBody("alw", ALLOWCOLS.map((c) => allowCellHTML(c, o, eDraft)).join("")) +
          grpBody("ev", evCellHTML(o, eDraft))
        : "") +
      "</div></th>";
  }
  function idHead() {
    return '<th class="npv2-fg-id npv2-fg-idhead npv2-fg-snap" rowspan="2"><div class="npv2-fg-idin">' +
      '<div class="npv2-fg-name npv2-fg-nameh">NCRC · item</div>' +
      grpHead("out", "Outputs vs LY", OUTCOLS) +
      (inputsOn()
        ? grpHead("vlc", "List", [VLCCOL]) +
          grpHead("cost", "Promo cost $/u", COSTCOLS) +
          grpHead("alw", allowCap(), ALLOWCOLS) +
          grpHead("ev", evCap(), evCols())
        : "") +
      "</div></th>";
  }
  // Tactic code shown in the cell, keyed by the store tactic className
  // (national-plan.js STORE_TACTICS). This is the PROMO TACTIC, not the discount
  // type — the discount type is carried separately by c.val (offerValueShort)
  // and c.mech. STORE_TACTICS only ever produces item/bxgx/mb here.
  const TAC_LABEL = { item: "ID", bxgx: "BXGX", mb: "MB" };
  function ribbonCell(o, c, isEv, ixf, lyset, noAlw) {
    // holiday is indicated on the week-number header only — no bar on every body cell
    const ev = "";
    const lock = NP.state.cf.approved && NP.state.cf.approved[o.uid + ":" + c.week] ? " is-lock" : "";
    if (!c.promoted) return '<td class="npv2-fg-wk npv2-fg-none' + (c.locked ? " is-locked" : "") + ev + '" title="Wk ' + c.week + ' · no promo"></td>';
    const mechL = c.mech ? NP.MECH_LABEL[c.mech] : "", w = c.week - 1;
    const tac = TAC_LABEL[c.store.className];
    const ixc = ixf === "cann" ? " is-cann" : ixf === "halo" ? " is-halo" : "";
    const noal = noAlw ? " is-noalw" : "";
    // depth vs LY: ▲ deeper / ▼ shallower / = equal
    const lyd = o.lyDepth || 0, over = c.depth - lyd, eq = Math.abs(over) < 0.012;
    const arr = '<i class="npv2-wk-ar ' + (eq ? "is-eq" : over > 0 ? "is-deeper" : "is-shallower") + '">' + (eq ? "=" : over > 0 ? "▲" : "▼") + "</i>";
    // LY status: repeats last year's week (show LY depth) vs a new/optimized placement
    const repeat = !!(lyset && lyset.has(w));
    const stHtml = repeat ? '<span class="npv2-wk-st st-rep">LY ' + (lyd * 100).toFixed(0) + "%</span>" : '<span class="npv2-wk-st st-new">new</span>';
    const ixt = ixf === "cann" ? " · ⚠ cluster rival also on deal (cannibalisation)" : ixf === "halo" ? " · ✦ co-promoted with a complement (halo)" : "";
    // promo prices: store at this week's depth; digital a touch deeper; plus the LY price
    const hasDig = c.digital.length > 0, digDepth = Math.min(0.5, c.depth + 0.06);
    // Family tint (Option B): item discount running store-only = SIMPLE (blue);
    // any complex tactic OR any digital cell = COMPLEX (amber). Reads the same
    // per-cell digital signal (c.digital.length) the price block already uses.
    const fam = (c.store.className === "item" && !hasDig) ? "simple" : "complex";
    const mechLabel = tac ? '<div class="npv2-wk-mech">' + tac + "</div>" : "";
    // tooltip: the four facts once each — week · promotion type · tactic ·
    // discount type · offer label — then the existing depth/LY/digital/lock detail.
    const tip = "Wk " + c.week + " · " + (fam === "simple" ? "Simple" : "Complex") + " · " + c.store.name + (mechL ? " · " + mechL : "") + (c.offer ? " · " + c.offer.label : "") + " · depth " + (c.depth * 100).toFixed(0) + "% vs LY " + (lyd * 100).toFixed(0) + "% (" + (eq ? "≈ same" : over > 0 ? "deeper" : "shallower") + ")" + (repeat ? " · repeats last year" : " · new / optimized placement") + (noAlw ? " · ⚠ on promo with no vendor allowance" : "") + (c.digital.length ? " · digital" : "") + (c.locked ? " · actual" : "") + (lock ? " · locked into plan" : "") + ixt + " — click for week detail";
    const sp = NP.fmt.price(NP.promoPriceOf(o, c.depth)), dp = NP.fmt.price(NP.promoPriceOf(o, digDepth));
    const lySp = NP.fmt.price(NP.promoPriceOf(o, lyd)), lyDp = NP.fmt.price(NP.promoPriceOf(o, Math.min(0.5, lyd + 0.06)));
    // optimized-placement indicator: new vs a repeat of last year
    const optIcon = repeat
      ? '<i class="npv2-wk-opt is-rep" title="repeats last year">↺</i>'
      : '<i class="npv2-wk-opt is-opt" title="optimized — new placement vs last year">✦</i>';
    const lockI = lock ? '<i class="npv2-wk-lk" title="locked into plan"></i>' : "";
    const warnI = noAlw ? '<i class="npv2-wk-warn" title="on promo, no vendor allowance">⚠</i>' : "";
    return '<td class="npv2-fg-wk tactic-' + c.store.className + " npv2-fam-" + fam + (c.locked ? " is-locked" : "") + ev + ixc + lock + noal + '" data-mweek="' + o.uid + "|" + c.week + '" role="button" tabindex="0" title="' + esc(tip) + '">' +
      '<div class="npv2-wk-c npv2-wk-pc">' +
        mechLabel +
        (c.val ? '<div class="npv2-wk-tok">' + esc(c.val) + "</div>" : "") +
        '<div class="npv2-wk-pr"><span class="npv2-wk-ch">S</span><b>' + sp + "</b></div>" +
        (repeat ? '<div class="npv2-wk-lp">LY ' + lySp + "</div>" : "") +
        (hasDig ? '<div class="npv2-wk-pr npv2-wk-prd"><span class="npv2-wk-ch npv2-wk-chd">D</span><b>' + dp + "</b></div>" + (repeat ? '<div class="npv2-wk-lp">LY ' + lyDp + "</div>" : "") : "") +
        (!repeat ? '<div class="npv2-wk-lp"><span class="npv2-wk-newt">new</span></div>' : "") +
        '<div class="npv2-wk-tags">' + arr + optIcon + lockI + warnI + "</div>" +
      "</div></td>";
  }
  function sel(label, id, opts, cur, allLab) {
    const options = opts.map((o) => { const v = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (cur === v ? " selected" : "") + ">" + esc(lab) + "</option>"; }).join("");
    return '<label class="npv2-fg-filter">' + label + ' <select id="' + id + '"><option value="all">' + (allLab || "All " + label.toLowerCase() + "s") + "</option>" + options + "</select></label>";
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
    // focused period → show only its 4 weeks (the pinned block is unchanged).
    // Otherwise honour the scope-row period filter (NP.state.periods); empty = all 52.
    const focus = NP.state.v2period;
    const selRaw = NP.state.periods || [];
    const selP = (focus == null && selRaw.length && selRaw.length < 13) ? selRaw.slice().sort((a, b) => a - b) : null;
    const plist = selP || Array.from({ length: 13 }, (_, p) => p);
    const weeks = focus == null ? plist.reduce((arr, p) => { for (let i = 0; i < 4; i++) { const w = p * 4 + i; if (w < 52) arr.push(w); } return arr; }, [])
                                : [0, 1, 2, 3].map((i) => focus * 4 + i).filter((w) => w < 52);
    let periodHead;
    if (focus == null) {
      periodHead = "";
      plist.forEach((p, i) => { periodHead += '<th class="npv2-fg-period' + (i === 0 ? " npv2-fg-snap" : "") + '" colspan="4" data-period="' + p + '" role="button" tabindex="0" title="Zoom into period ' + (p + 1) + ' (4 weeks)">P' + (p + 1) + "</th>"; });
    } else {
      const backLbl = (selRaw.length && selRaw.length < 13) ? "‹ selected periods" : "‹ all 52 weeks";
      periodHead = '<th class="npv2-fg-period npv2-fg-periodback npv2-fg-snap" colspan="' + weeks.length + '" data-zoomout role="button" tabindex="0" title="Zoom back out">' +
        '<span class="npv2-fg-zback">' + backLbl + '</span><b>Period ' + (focus + 1) + '</b><span class="npv2-fg-zwk">wks ' + (weeks[0] + 1) + "–" + (weeks[weeks.length - 1] + 1) + "</span></th>";
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
    return '<table class="npv2-fg' + (focus != null ? " is-period" : "") + (inputsOn() ? "" : " is-noinputs") + '">' + head + "<tbody>" + body + "</tbody>" + totFootHTML(items, map, weeks) + "</table>";
  }
  // sticky weekly-totals footer — per visible week: Sales / Units / AGP. Hovering a week
  // shows the rolling (cumulative-to-date) totals; the pinned label carries the plan-level
  // secondary metrics: AIV, list cost per unit, funding per unit and spend rate.
  function totFootHTML(items, map, weeks) {
    if (!items.length) return "";
    const per = weeks.map(() => ({ u: 0, s: 0, a: 0 }));
    items.forEach((o) => { const ser = NP.weeklySeries(o, map); weeks.forEach((w, i) => { per[i].u += ser.units[w]; per[i].s += ser.sales[w]; per[i].a += ser.agp[w]; }); });
    // filtered grand totals (current + LY) — the same res/ly the item rows sum, so
    // the pinned Units/Sales/AGP footer cells reconcile to the visible rows.
    let u = 0, r = 0, a = 0, lu = 0, lr = 0, la = 0, listS = 0, fundS = 0;
    items.forEach((o) => {
      const res = NP.resultFor(o, map), e = NP.effective(o, map), ly = NP.lyResult(o);
      u += res.units; r += res.revenueM; a += res.agpM;
      lu += ly.units; lr += ly.revenueM; la += ly.agpM;
      listS += e.vlc * res.units; fundS += (e.vlc - e.deadNet) * res.units;
    });
    const aiv = u ? (r * 1000) / u : 0, listU = u ? listS / u : 0, fundU = u ? fundS / u : 0, rate = r ? (fundS / 1000) / r : 0;
    const totRes = { units: u, revenueM: r, agpM: a }, totLy = { units: lu, revenueM: lr, agpM: la };
    let cu = 0, cs = 0, ca = 0;
    const cells = weeks.map((w, i) => {
      cu += per[i].u; cs += per[i].s; ca += per[i].a;
      const tip = "Wk " + (w + 1) + " — Sales " + km(per[i].s) + " · Units " + NP.fmt.u(per[i].u) + " · AGP " + km(per[i].a) +
        "   ·   rolling to date: Sales " + km(cs) + " · Units " + NP.fmt.u(cu) + " · AGP " + km(ca);
      return '<td class="npv2-fg-tot" title="' + esc(tip) + '"><b>' + km(per[i].s) + "</b><span>" + NP.fmt.u(per[i].u) + "</span><span>" + km(per[i].a) + "</span></td>";
    }).join("");
    // keep this cell's content NARROW — the pinned column is width: max-content, so a
    // long single line here would widen the whole frozen block (the width-0 wrapper
    // stops the cell contributing to the auto column width at all).
    // pinned footer: label + the Units/Sales/AGP grand totals under OUTPUTS VS LY,
    // built with the same grpBody("out")/outCellHTML the item rows use so they line
    // up. No cells for the List/Promo-cost/Allowance/Events groups — the <th>
    // simply stretches across the (body-set) pinned width, leaving that area blank
    // rather than painting empty tinted columns. Works the same Inputs on or off.
    const lab = '<th class="npv2-fg-id npv2-fg-totlab" title="Plan-level: AIV $' + aiv.toFixed(2) + " · List $" + listU.toFixed(2) + "/u · Funding $" + fundU.toFixed(2) + "/u · Spend rate " + (rate * 100).toFixed(1) + '%"><div class="npv2-fg-idin">' +
      '<div class="npv2-fg-name npv2-fg-totname">Totals <span class="npv2-fg-totinfo" title="Hover any week for the rolling total to date." role="img" aria-label="Hover any week for the rolling total to date."><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="8" y1="7.2" x2="8" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="4.8" r="1" fill="currentColor"/></svg></span></div>' +
      grpBody("out", OUTCOLS.map((c) => outCellHTML(c, totRes, totLy)).join("")) +
      "</div></th>";
    return "<tfoot><tr>" + lab + cells + "</tr></tfoot>";
  }
  function lyTotals() { let r = 0, u = 0, a = 0, h = 0; NP.cat().items.forEach((o) => { const x = NP.lyResult(o); r += x.revenueM; u += x.units; a += x.agpM; h += x.hhK; }); return { r: r, u: u, a: a, h: h }; }
  // ROW 1 — distribution strategies as selectable cards, each with its Sales/Units/AGP + Δ vs LY
  function stratCardsHTML() {
    const cfV = window.NPViews; if (!cfV || !cfV.cfStrategies) return "";
    const cur = NP.state.cf.strategy || "optimized", ly = lyTotals();
    const met = (lab, cv, lv, money) => { const f = money ? km : NP.fmt.u, d = lv ? (cv - lv) / lv : 0, dd = cv - lv; return '<div class="npv2-strat-m"><span class="npv2-strat-ml">' + lab + '</span><span class="npv2-strat-mv">' + f(cv) + '</span><span class="npv2-strat-mly">LY ' + f(lv) + '</span><span class="npv2-strat-md ' + (d >= 0 ? "np-pos" : "np-neg") + '">' + NP.fmt.pct(d) + " · " + (dd >= 0 ? "+" : "") + f(dd) + "</span></div>"; };
    // Secondary metrics — derived, more compact (value + LY + delta only)
    const met2 = (lab, cvS, lvS, dcls, dtxt) => '<div class="npv2-strat-m2"><span class="npv2-strat-m2l">' + lab + '</span><span class="npv2-strat-m2v">' + cvS + '</span><span class="npv2-strat-m2ly">LY ' + lvS + '</span><span class="npv2-strat-m2d ' + dcls + '">' + dtxt + '</span></div>';
    // secondary metrics: AIV · list cost / unit · funding / unit · spend rate
    const pc = (() => { let u = 0, listS = 0, fundS = 0; const map = NP.displayMap(); NP.cat().items.forEach((o) => { const res = NP.resultFor(o, map), e = NP.effective(o, map); u += res.units; listS += e.vlc * res.units; fundS += (e.vlc - e.deadNet) * res.units; }); return { listU: u ? listS / u : 0, fundU: u ? fundS / u : 0, fundM: fundS / 1000 }; })();
    const secondary = (t) => {
      const aiv = t.units ? (t.revenueM * 1000) / t.units : 0, lyAiv = ly.u ? (ly.r * 1000) / ly.u : 0, aivD = lyAiv ? (aiv - lyAiv) / lyAiv : 0;
      const lyListU = pc.listU * 0.985, listD = lyListU ? (pc.listU - lyListU) / lyListU : 0;
      const lyFundU = pc.fundU * 0.94, fundD = lyFundU ? (pc.fundU - lyFundU) / lyFundU : 0;
      const rate = t.revenueM ? pc.fundM / t.revenueM : 0, lyRate = ly.r ? (pc.fundM * 0.94) / ly.r : 0, ppd = (rate - lyRate) * 100;
      return '<div class="npv2-strat-grid2">' +
        met2("AIV", "$" + aiv.toFixed(2), "$" + lyAiv.toFixed(2), aivD >= 0 ? "np-pos" : "np-neg", NP.fmt.pct(aivD)) +
        met2("List $/u", "$" + pc.listU.toFixed(2), "$" + lyListU.toFixed(2), listD >= 0 ? "np-pos" : "np-neg", NP.fmt.pct(listD)) +
        met2("Funding $/u", "$" + pc.fundU.toFixed(2), "$" + lyFundU.toFixed(2), fundD >= 0 ? "np-pos" : "np-neg", NP.fmt.pct(fundD)) +
        met2("Spend rate", (rate * 100).toFixed(1) + "%", (lyRate * 100).toFixed(1) + "%", ppd >= 0 ? "np-pos" : "np-neg", (ppd >= 0 ? "+" : "") + ppd.toFixed(1) + "pp") +
        "</div>";
    };
    // one card's markup — shared by the single-card (collapsed) and all-cards paths
    const cardHTML = (s) => {
      const t = cfV.cfTotals(s.id);
      return '<button type="button" class="npv2-strat' + (cur === s.id ? " is-active" : "") + '" data-strat="' + s.id + '">' +
        '<span class="npv2-strat-name">' + esc(s.name) + (s.tag ? ' <em>' + esc(s.tag) + "</em>" : "") + "</span>" +
        '<span class="npv2-strat-sub">vs last year</span>' +
        '<div class="npv2-strat-grid">' + met("Sales", t.revenueM, ly.r, true) + met("Units", t.units, ly.u, false) + met("AGP", t.agpM, ly.a, true) + "</div>" +
        '<div class="npv2-strat-sep"></div>' +
        secondary(t) + "</button>";
    };
    // multiScenario is a BUILD-TIME gate: true = the original five-card row, no
    // disclosure. false (default) = only the active card + a quiet disclosure that
    // expands the rest inline via the view-level stratExpanded flag. cfStrategies()
    // still computes all five in every mode.
    const strategies = cfV.cfStrategies();
    // Always render ALL five cards. multiScenario === true → full row, no
    // disclosure. Otherwise the row carries `is-collapsed` (CSS hides the four
    // non-active cards; the active one keeps its natural one-card width) plus a
    // quiet disclosure. Expand/collapse just flips that class in place — no
    // renderFront — so nothing on the page jumps.
    const allCards = strategies.map(cardHTML).join("");
    if (NP.state.cf.multiScenario === true) {
      return '<div class="npv2-strat-row" id="npV2Strats">' + allCards + '</div><div class="npv2-rule"></div>';
    }
    const collapsed = !stratExpanded, others = strategies.length - 1;
    const disclosure = '<button type="button" class="npv2-strat-more" id="npV2StratMore" aria-expanded="' + (!collapsed) + '">' +
      (collapsed ? "Other scenarios (" + others + ")" : "Hide other scenarios") + "</button>";
    // COLLAPSED (default) = the condensed one-line header (same as step 4) for the active
    // scenario + a quiet disclosure. EXPANDED = the full tall cards for all scenarios.
    if (collapsed) {
      return '<div class="npv2-strat-row is-condensed" id="npV2Strats">' + wkStratBarHTML() + disclosure + '</div><div class="npv2-rule"></div>';
    }
    return '<div class="npv2-strat-row" id="npV2Strats">' + allCards + disclosure + '</div><div class="npv2-rule"></div>';
  }
  // heatmap legend — same gentle colours as the ribbon
  function legendHTML() {
    return '<div class="npv2-legend">' +
      '<span class="npv2-lg"><i class="npv2-sw npv2-fam-simple"></i>Simple</span>' +
      '<span class="npv2-lg"><i class="npv2-sw npv2-fam-complex"></i>Complex</span>' +
      '<span class="npv2-lg-div"></span>' +
      '<span class="npv2-lg npv2-lg-mechkey">ID = Item Discount · BXGX = Buy X Get X · MB = Must Buy</span>' +
      '<span class="npv2-lg npv2-lg-mech">offer <b>%</b> · <b>$</b> · <b>@$</b> · <b>FREE</b></span>' +
      '<span class="npv2-lg"><i class="npv2-lg-dg">D</i>digital</span>' +
      '<span class="npv2-lg"><i class="npv2-sw npv2-sw-lock"></i>locked</span>' +
      '<span class="npv2-lg"><i class="npv2-wk-warn">⚠</i>on promo · no allowance</span>' +
      '<span class="npv2-lg"><i class="npv2-sw npv2-sw-ev"></i>holiday wk</span>' +
      '<span class="npv2-lg"><i class="npv2-sw npv2-fg-none"></i>no promo</span>' +
      '<span class="npv2-lg"><i class="npv2-wk-opt is-opt">✦</i>optimized placement <i class="npv2-wk-opt is-rep">↺</i>repeats LY</span>' +
      '<span class="npv2-lg-div"></span>' +
      '<span class="npv2-lg">depth vs LY <i class="npv2-wk-ar is-deeper">▲</i> deeper <i class="npv2-wk-ar is-shallower">▼</i> shallower <i class="npv2-wk-ar is-eq">=</i> same · <span class="npv2-wk-ly">LY %</span> = repeats LY</span>' +
      "</div>";
  }
  // exact V1 compare panel (Sales/Units/AGP/HHs, objective highlighted, leader bold)
  function compareGridHTML() {
    const obj = NP.objMeta ? NP.objMeta() : { metric: "revenueM", short: "Sales" };
    const fieldOf = { revenueM: "r", units: "u", agpM: "a", hhK: "h" };
    const cols = [["Sales", "revenueM", (t) => NP.fmt.m(t.r)], ["Units", "units", (t) => NP.fmt.u(t.u)], ["AGP", "agpM", (t) => NP.fmt.m(t.a)], ["HHs", "hhK", (t) => NP.fmt.u(t.h)]];
    const scs = [{ id: "base", name: "Optimized — LY inputs", sub: "optimized, no edits", ov: {} }].concat(NP.state.scenarios.map((s) => ({ id: s.id, name: s.name.replace("Scenario ", "S") + " — Edited", sub: "your edits", ov: s.ov })));
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
    let html = '<button type="button" class="npv2-chip' + (st.activeScenario === "base" ? " is-active" : "") + '" data-scn="base" title="Optimized — last-year inputs">Optimized</button>';
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
    if (field === "evTotal" || field === "deepEvTotal") {
      const deep = field === "deepEvTotal";
      const parts = distributeEvents(o, inp.value, deep);
      const cell = inp.closest(".npv2-fg-inc");
      if (cell) {
        cell.classList.toggle("is-edited", evFields(deep).some((f) => NP.isEdited(o, f)));
        const spEl = cell.querySelector("[data-evsplit]"); if (spEl) spEl.textContent = "S " + parts[0] + " · D " + parts[1] + " · S+D " + parts[2];
      }
      updateScenarioUI(); return;
    }
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
    if (field === "evTotal" || field === "deepEvTotal") { const sp = evSplitOf(d, field === "deepEvTotal"); inp.value = String(sp[0] + sp[1] + sp[2]); hideBand(); return; }
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
    const cats = (NP.state.categoryIds || [NP.state.categoryId]).map((id) => [id, (NP.DATA[id] ? NP.DATA[id].name : id).split(" — ")[0]]);
    const vendors = [...new Set(all.map((o) => o.vendor))].sort();
    const rogs = [...new Set(all.map((o) => o.rog))].sort();
    const clusters = [...new Set(all.map((o) => o.cluster))].map((c) => [c, NP.CLUSTER_LABEL[c] || c]);
    const subs = [...new Set(all.map((o) => o.form))].map((f) => [f, SUBCLASS_LABEL[f] || f]);
    if (ff.cat !== "all" && !cats.some((c) => c[0] === ff.cat)) ff.cat = "all";
    if (ff.vendor !== "all" && !vendors.includes(ff.vendor)) ff.vendor = "all";
    if (ff.rog !== "all" && !rogs.includes(ff.rog)) ff.rog = "all";
    const items = frontItems();
    front.innerHTML =
      '<div class="npv2-fg-tools">' +
        stratCardsHTML() +   // step 3 keeps its full strategy cards (bigger, condense-on-scroll, hide/show others)
        // row 2 — scenario (left) · interactions (right)
        '<div class="npv2-fg-trow">' +
          '<div class="npv2-fg-gl">' +
            '<span class="npv2-fg-scenlab">Scenario</span><div class="npv2-scen-seg" id="npV2Scen"></div>' +
            '<span class="npv2-divider"></span>' +
            '<button type="button" class="npv2-fg-btn" id="npV2Cmp">Compare</button>' +
          "</div>" +
          '<div class="npv2-fg-gr">' +
            '<button type="button" class="npv2-ix-cap' + (inputsOn() ? " is-on" : "") + '" id="npV2InputsT" title="Show or hide the pinned deal-input columns (list, promo cost, allowances, events) to focus on the calendar"><span class="npv2-ix-dot"></span>Inputs ' + (inputsOn() ? "on" : "off") + "</button>" +
            '<button type="button" class="npv2-ix-cap' + (NP.state.v2ix ? " is-on" : "") + '" id="npV2Ix" title="Highlight where the optimizer separates cluster rivals (cannibalisation) and co-promotes complements (halo)"><span class="npv2-ix-dot"></span>Interactions ' + (NP.state.v2ix ? "on" : "off") + "</button>" +
            '<span class="npv2-fg-ixkey"' + (NP.state.v2ix ? "" : " hidden") + '><i class="npv2-ixk npv2-ixk-h"></i>halo <i class="npv2-ixk npv2-ixk-c"></i>cannib.</span>' +
          "</div>" +
        "</div>" +
        // row 3 — filters (left) · sort (right)
        '<div class="npv2-fg-trow">' +
          '<div class="npv2-fg-gl">' + sel("Category", "npV2FgCat", cats, ff.cat, "All selected categories") + sel("Vendor", "npV2FgVendor", vendors, ff.vendor) + sel("ROG", "npV2FgRog", rogs, ff.rog) + sel("Class", "npV2FgClass", clusters, ff.cls, "All classes") + sel("Sub-class", "npV2FgSub", subs, ff.sub, "All sub-classes") + "</div>" +
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
    const moreBtn = front.querySelector("#npV2StratMore"), stratRow = front.querySelector("#npV2Strats");
    if (moreBtn && stratRow) moreBtn.onclick = () => {
      // condensed header ↔ full cards swap different markup, so re-render the step
      stratExpanded = !stratExpanded;
      renderFront();
    };
    const kts = front.querySelector("#npV2FgCat"); if (kts) kts.onchange = () => { ff.cat = kts.value; renderFront(); };
    const vs = front.querySelector("#npV2FgVendor"); vs.onchange = () => { ff.vendor = vs.value; renderFront(); };
    const rs = front.querySelector("#npV2FgRog"); rs.onchange = () => { ff.rog = rs.value; renderFront(); };
    const cs = front.querySelector("#npV2FgClass"); cs.onchange = () => { ff.cls = cs.value; renderFront(); };
    const sbs = front.querySelector("#npV2FgSub"); if (sbs) sbs.onchange = () => { ff.sub = sbs.value; renderFront(); };
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
    const inb = front.querySelector("#npV2InputsT"); if (inb) inb.onclick = () => { NP.state.v2inputs = NP.state.v2inputs === false; renderFront(); };
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
    let down = false, drag = false, sx = 0, sy = 0, sl = 0, st = 0, pid = null;
    wrap.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input, select, button, a")) return;
      down = true; drag = false; sx = e.clientX; sy = e.clientY; sl = wrap.scrollLeft; st = wrap.scrollTop; pid = e.pointerId;
    });
    wrap.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!drag && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) { drag = true; wrap.classList.add("is-grab"); try { wrap.setPointerCapture(pid); } catch (x) {} }
      if (drag) { wrap.scrollLeft = sl - dx; wrap.scrollTop = st - dy; e.preventDefault(); }
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
      const idh = '<th class="npv2-mg-ncrc"><b>' + esc(o.item) + " " + esc(o.pack) + '</b><span class="np-rc-id">' + esc(String(o.ncrc).replace(/^NCRC\s*/i, "")) + "</span>" +
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

  /* ============================================ WEEK-BY-WEEK VIEW (step 5)
     The my-desk "Promo recommendations" screen, folded into the national plan:
     the SAME header + filter toolbar as the 52-week grid, plus a week selector,
     a worklist rail of NCRCs for the active velocity bin, and the per-price-area
     recommendation table for the selected NCRC/week. Reached from the Promotional
     Calendar step (openWeekView) or by advancing the stepper. Price areas are
     derived deterministically from each NCRC's week plan (same basis as the
     single-week drawer), so the numbers are stable and tie back to the drawer. */
  const round = NP.util.round, clampN = NP.util.clamp;
  const FIRST_PLAN_WEEK = NP.CURRENT_WEEK;   // weeks before this are locked actuals — not plannable / not navigable
  const RLBL = { scan: "Scan", shipToStore: "Ship to store", newItem: "New item" };
  function wkNoise(o, seed, k) { return ((NP.util.hashStr(o.uid) + seed * 13 + k * 101) % 1000) / 1000; }
  function weekEvent(w) { return NP.RETAIL_EVENTS.find((e) => e.wk === w - 1) || null; }
  function weekLabel(w) { const ev = weekEvent(w); return "Week " + w + (ev ? " · " + ev.label : ""); }
  const wkU = (v) => Math.round(v).toLocaleString() + "K";
  const wkM = (v) => "$" + Math.round(v * 1000).toLocaleString() + "K";
  function scoreTone(s) { return s >= 80 ? "np-pos" : s >= 62 ? "" : "np-neg"; }

  // step-5 interaction state (kept in-session, like the original promo builder)
  const WKST = { expanded: {}, chosen: {}, custom: {}, selPa: null, tab: "cost", override: false, oform: null, manualEditPa: null, manualEditForm: null, review: false, reviewExpanded: {}, finalized: null, defaultOpen: true };
  const WKCART = {};                                 // key `${uid}:${week}` -> committed NCRC plan
  function paKey(o, week, pa) { return o.uid + ":" + week + ":" + pa; }
  function cartKey(o, week) { return o.uid + ":" + week; }
  function isLocked(week) { return week < FIRST_PLAN_WEEK; }

  // week-level metrics + LY/NP baselines, shared by every PA of this NCRC
  function weekBaseMetrics(o, week) {
    const map = NP.displayMap(), wk = NP.weekPlan(o, map, false), c = wk[week - 1];
    const promoted = !!(c && c.promoted), curve = NP.CURVE[o.form] || NP.CURVE.bar;
    const psum = wk.filter((x) => x.promoted).reduce((s, x) => s + curve[x.week - 1], 0) || 1;
    const share = promoted ? curve[week - 1] / psum : 1 / 52;
    const res = NP.resultFor(o, map), lyR = NP.lyResult(o), npR = NP.noPromoResult(o);
    return {
      c: c, promoted: promoted, share: share,
      recDepth: promoted ? c.depth : 0.18, recOfferId: promoted && c.offer ? c.offer.id : "id-doff",
      wkUnits: res.units * share, wkSales: res.revenueM * share, wkAgp: res.agpM * share,
      lyUnits: lyR.units * share, lySales: lyR.revenueM * share, lyAgp: lyR.agpM * share,
      npUnits: npR.units * share, npSales: npR.revenueM * share, npAgp: npR.agpM * share
    };
  }
  function paFractions(o, week, n) {
    const w = []; let s = 0;
    for (let i = 0; i < n; i++) { const wi = 0.72 + wkNoise(o, week, i + 1) * 0.56; w.push(wi); s += wi; }
    return w.map((x) => x / s);
  }
  // one offer's metrics for a PA. depth vs the recommended depth drives the units/sales/AGP spread.
  function buildOffer(o, week, paIdx, frac, bm, offer, rank, isRec) {
    const e = NP.effective(o, NP.displayMap()), l = e.ladder;
    const nz = (k) => wkNoise(o, week * 7 + paIdx, k) - 0.5;
    const depth = NP.snapDepth(offer.depth);
    const paVlc = round(e.vlc * (1 + nz(1) * 0.06), 2);
    const paBase = round(o.basePrice * (1 + nz(3) * 0.03), 2);
    const paPromo = round(paBase * (1 - depth), 2);
    const dnc = round(NP.deadNetOf(o) * (1 + nz(2) * 0.08), 2);
    const funding = round((l.offInvoice + (l.scan || 0)) * paVlc * (0.85 + nz(5) * 0.35), 2);
    const dd = depth - bm.recDepth;
    const um = clampN(1 + dd * 1.4, 0.55, 1.85), sm = clampN(um * (1 - dd * 0.35), 0.5, 1.9), am = clampN(um * (1 - dd * 1.05), 0.35, 1.8);
    const R = Math.round(clampN(74 + wkNoise(o, week * 11 + paIdx, rank + 2) * 18 - rank * 3, 40, 97));
    const G = Math.round(clampN(66 + wkNoise(o, week * 13 + paIdx, rank + 5) * 24 - rank * 4, 40, 96));
    const digName = offer.digital ? NP.DIGITAL_NAMES[offer.digital] : null;
    return {
      id: offer.id, label: offer.label, rank: rank, isRec: isRec, isCustom: !!offer.isCustom,
      storeName: NP.STORE_TACTICS[offer.store].name, storeCode: offer.store, digName: digName,
      depth: depth, vlc: paVlc, dnc: dnc, base: paBase, promo: paPromo, save: Math.max(0, paBase - paPromo),
      digPromo: digName ? round(paPromo * 0.985, 2) : null,
      mb: offer.store === "BXGX" ? "2 / 8" : "1 / 6", ad: "Y / Y", funding: funding,
      units: bm.wkUnits * frac * um, sales: bm.wkSales * frac * sm, agp: bm.wkAgp * frac * am,
      R: R, G: G, total: Math.round((R + G) / 2) + (isRec ? 3 : 0)
    };
  }
  function paOffers(o, week, paIdx, frac, bm) {
    const rec = NP.OFFERS.find((x) => x.id === bm.recOfferId) || NP.OFFERS[0];
    const others = NP.OFFERS.filter((x) => x.id !== rec.id).slice(0, 4);
    const list = [buildOffer(o, week, paIdx, frac, bm, rec, 1, true)];
    others.forEach((of, i) => list.push(buildOffer(o, week, paIdx, frac, bm, of, i + 2, false)));
    const cust = WKST.custom[paKey(o, week, "PA0" + (paIdx + 1))];
    if (cust) list.unshift(cust);
    return list;
  }
  function paData(o, week) {
    const bm = weekBaseMetrics(o, week), fr = paFractions(o, week, 4);
    return fr.map((frac, i) => ({
      pa: "PA0" + (i + 1), frac: frac, offers: paOffers(o, week, i, frac, bm),
      ly: { promo: round(o.basePrice * 0.62, 2), label: "Buy 5 Get 3", units: bm.lyUnits * frac, sales: bm.lySales * frac, agp: bm.lyAgp * frac },
      np: { base: round(o.basePrice, 2), units: bm.npUnits * frac, sales: bm.npSales * frac, agp: bm.npAgp * frac, R: 85, G: 70, total: 60 }
    }));
  }
  function chosenFor(o, week, pd) {
    const id = WKST.chosen[paKey(o, week, pd.pa)];
    return pd.offers.find((x) => x.id === id) || pd.offers.find((x) => x.isRec) || pd.offers[0];
  }

  // --- table cell groups ---
  function offerCells(of) {
    const digCell = of.digName ? '<div class="npv2-wk-tac"><b>' + esc(of.digName) + '</b><small>$' + of.digPromo.toFixed(2) + "</small></div>" : '<span class="npv2-wk-mut">No digital</span>';
    return '<td class="r">$' + of.vlc.toFixed(2) + '</td><td class="r">$' + of.dnc.toFixed(2) + '</td><td class="r">$' + of.base.toFixed(2) + "</td>" +
      '<td class="r npv2-wk-promo">$' + of.promo.toFixed(2) + "</td>" +
      '<td class="l"><div class="npv2-wk-tac"><b>' + esc(of.storeName) + "</b><small>" + (of.storeCode === "BXGX" ? esc(of.label) : "Save $" + of.save.toFixed(2)) + "</small></div></td>" +
      '<td class="l">' + digCell + "</td>" +
      '<td class="c">' + of.mb + '</td><td class="c">' + of.ad + "</td>" +
      '<td class="r">$' + of.funding.toFixed(2) + "</td>" +
      '<td class="r"><b>' + wkM(of.sales) + "</b></td>" +
      '<td class="r"><b>' + wkU(of.units) + "</b></td>" +
      '<td class="r"><b>' + wkM(of.agp) + "</b></td>" +
      '<td class="r npv2-wk-score">' + (of.isCustom || of.total == null ? '<b class="npv2-wk-mut">—</b><small>custom</small>' : '<b class="' + scoreTone(of.total) + '">' + of.total + "</b><small>R " + of.R + " · G " + of.G + "</small>") + "</td>";
  }
  function dashCells(n) { let s = ""; for (let i = 0; i < n; i++) s += '<td class="c npv2-wk-mut">–</td>'; return s; }
  function paBlockHTML(o, week, pd, selPa) {
    const chosen = chosenFor(o, week, pd), expanded = !!WKST.expanded[pd.pa], alts = pd.offers.length;
    let h = '<tr class="npv2-wk-parow' + (selPa === pd.pa ? " is-sel" : "") + (expanded ? " is-exp" : "") + '" data-pa="' + pd.pa + '">' +
      '<td class="l npv2-wk-pa">' + pd.pa + (chosen.isCustom ? ' <span class="npv2-wk-pl">CUSTOM</span>' : "") + "</td>" +
      offerCells(chosen) +
      '<td class="c npv2-wk-altc"><button type="button" class="npv2-wk-toggle' + (expanded ? " is-open" : "") + '" data-toggle="' + pd.pa + '">' + (expanded ? "Hide" : "+" + (alts - 1)) + " ▾</button></td></tr>";
    if (!expanded) return h;
    h += '<tr class="npv2-wk-exphead npv2-wk-nest"><td colspan="15" class="l"><span class="npv2-wk-nestcap">Options for ' + pd.pa + "</span> — alternates · LY actual · no-promo baseline</td></tr>";
    pd.offers.forEach((of) => {
      const isC = chosen.id === of.id;
      h += '<tr class="npv2-wk-altrow npv2-wk-nest' + (isC ? " is-chosen" : "") + '" data-pick="' + pd.pa + "|" + esc(of.id) + '">' +
        '<td class="l npv2-wk-pa"><span class="npv2-wk-radio' + (isC ? " on" : "") + '"></span>' + (of.isCustom ? '<span class="npv2-wk-pl">CUSTOM</span>' : of.isRec ? '<span class="npv2-wk-rec">#1 REC</span>' : "#" + of.rank) + "</td>" +
        offerCells(of) + "<td></td></tr>";
    });
    // LY row
    h += '<tr class="npv2-wk-refrow npv2-wk-nest"><td class="l npv2-wk-pa"><span class="npv2-wk-refpill ly">LY</span></td>' +
      dashCells(3) + '<td class="r npv2-wk-promo">$' + pd.ly.promo.toFixed(2) + "</td>" +
      '<td class="l"><div class="npv2-wk-tac"><b>' + esc(pd.ly.label) + "</b><small>Last year</small></div></td>" + dashCells(4) +
      '<td class="r">' + wkM(pd.ly.sales) + '</td><td class="r">' + wkU(pd.ly.units) + '</td><td class="r">' + wkM(pd.ly.agp) + "</td>" +
      '<td class="r npv2-wk-score"><small>actual</small></td><td></td></tr>';
    // NP baseline row
    h += '<tr class="npv2-wk-refrow npv2-wk-nest"><td class="l npv2-wk-pa"><span class="npv2-wk-refpill np">NP</span></td>' +
      dashCells(2) + '<td class="r">$' + pd.np.base.toFixed(2) + '</td><td class="c npv2-wk-mut">–</td>' +
      '<td class="l"><div class="npv2-wk-tac"><b>No promo</b><small>Skip promo</small></div></td>' + dashCells(4) +
      '<td class="r">' + wkM(pd.np.sales) + '</td><td class="r">' + wkU(pd.np.units) + '</td><td class="r">' + wkM(pd.np.agp) + "</td>" +
      '<td class="r npv2-wk-score"><b>' + pd.np.total + "</b><small>R " + pd.np.R + " · G " + pd.np.G + "</small></td><td></td></tr>";
    // override link
    const cust = WKST.custom[paKey(o, week, pd.pa)];
    h += '<tr class="npv2-wk-ovrow npv2-wk-nest"><td colspan="15">' + (cust
      ? "Custom override saved for <strong>" + pd.pa + '</strong>. <a href="#" class="npv2-wk-ovlink" data-override="' + pd.pa + '">Edit</a> · <a href="#" class="npv2-wk-ovlink npv2-wk-ovclear" data-ovclear="' + pd.pa + '">Clear</a>.'
      : 'None of these fit? <a href="#" class="npv2-wk-ovlink" data-override="' + pd.pa + '">Override the recommendation →</a>') + "</td></tr>";
    return h;
  }
  function recTableHTML(o, week, pds, selPa) {
    const tot = pds.reduce((t, pd) => { const c = chosenFor(o, week, pd); return { funding: t.funding + c.funding, sales: t.sales + c.sales, units: t.units + c.units, agp: t.agp + c.agp }; }, { funding: 0, sales: 0, units: 0, agp: 0 });
    return '<div class="npv2-wk-tablewrap"><table class="npv2-wk-table"><thead><tr>' +
      '<th class="l">PA</th><th class="r">VLC</th><th class="r">DNC</th><th class="r">Base $</th><th class="r">Promo $</th><th class="l">Store tactic</th><th class="l">Digital tactic</th>' +
      '<th class="c">MB / Lim</th><th class="c">Ad / Disp</th><th class="r">Funding $</th>' +
      '<th class="r">Sales</th><th class="r">Units</th><th class="r">AGP</th><th class="r">Total score</th><th class="c npv2-wk-altc"></th>' +
      "</tr></thead><tbody>" + pds.map((pd) => paBlockHTML(o, week, pd, selPa)).join("") + "</tbody><tfoot>" +
      '<tr class="npv2-wk-tot"><td class="l">Total</td><td colspan="8" class="l"><small>' + pds.length + " price areas</small></td>" +
      '<td class="r">$' + tot.funding.toFixed(2) + '</td><td class="r">' + wkM(tot.sales) + '</td><td class="r">' + wkU(tot.units) + '</td><td class="r">' + wkM(tot.agp) + "</td><td></td><td></td></tr>" +
      "</tfoot></table></div>";
  }

  // --- right side panel: Cost ladder / NCRC grid ---
  function ladderHTML(o, chosen) {
    const e = NP.effective(o, NP.displayMap()), l = e.ladder, vlc = chosen ? chosen.vlc : e.vlc;
    const off = vlc * l.offInvoice, bb = vlc * l.billBack, pb = vlc * l.priceBreak, fr = vlc * l.freight;
    const totBuy = off + bb + pb, ret = NP.RETAIL_KEYS.map((k) => [RLBL[k] || k, vlc * (l[k] || 0)]);
    const totRet = ret.reduce((s, r) => s + r[1], 0), net = vlc - totBuy - fr, dead = net - totRet;
    const row = (a, v, cls) => '<div class="npv2-wk-lrow' + (cls ? " " + cls : "") + '"><span>' + a + "</span><b>$" + v.toFixed(2) + "</b></div>";
    return '<div class="npv2-wk-ladder">' + row("Vendor list cost", vlc, "head") +
      '<div class="npv2-wk-lgrp">Buying allowances</div>' + row("Off-invoice", off) + row("Bill back", bb) + row("Price break", pb) + row("Total buying", totBuy, "sub") + row("Freight", fr) + row("Net cost", net, "sub") +
      '<div class="npv2-wk-lgrp">Retail allowances</div>' + ret.map((r) => row(r[0], r[1])).join("") + row("Total retail", totRet, "sub") + row("Dead-net cost", dead, "tot") + "</div>";
  }
  function gridPanelHTML(o, week, pds) {
    const rows = pds.map((pd) => { const c = chosenFor(o, week, pd); return '<tr><td class="npv2-wk-l">' + pd.pa + "</td><td>" + esc(c.storeName) + '</td><td class="npv2-wk-r">' + wkM(c.sales) + '</td><td class="npv2-wk-r">' + wkU(c.units) + '</td><td class="npv2-wk-r">' + wkM(c.agp) + "</td></tr>"; }).join("");
    return '<table class="npv2-wk-gridtbl"><thead><tr><th class="npv2-wk-l">PA</th><th>Tactic</th><th class="npv2-wk-r">Sales</th><th class="npv2-wk-r">Units</th><th class="npv2-wk-r">AGP</th></tr></thead><tbody>' + rows + "</tbody></table>";
  }
  // NOPAs (funding agreements) linked to this NCRC / PA — ported from the exec screen's cost-ladder panel
  function nopaPanelHTML(o, pa) {
    const seed = (o.ncrc || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const nopas = [
      { id: "NOPA-" + (1000 + seed % 9000), label: "Off-Invoice MD", window: "W48 – W52", amount: "$0.57 / unit" },
      { id: "NOPA-" + (2000 + (seed + 17) % 9000), label: "Bill-Back FY26 Q1", window: "P11 – P13", amount: "$0.05 / unit" },
      { id: "NOPA-" + (3000 + (seed + 41) % 9000), label: "Retail transaction", window: "Always-on", amount: "$0.45 / txn" }
    ];
    return '<section class="pd-nopa">' +
      '<header class="pd-nopa-head"><strong>NOPAs linked to</strong><span>' + esc(o.ncrc) + " · " + esc(o.item) + " <em>" + esc(o.pack) + "</em></span>" + (pa ? '<span class="pd-nopa-pa">' + esc(pa) + "</span>" : "") + "</header>" +
      '<ul class="pd-nopa-list">' + nopas.map((n) => '<li><a href="#" class="pd-nopa-link"><strong>' + esc(n.id) + "</strong><span>" + esc(n.label) + '</span></a><span class="pd-nopa-meta">' + esc(n.window) + " · " + esc(n.amount) + "</span></li>").join("") + "</ul></section>";
  }
  // Promotion history — this NCRC's last 6 ad-breaks (side-panel tab)
  function promoHistoryHTML(o) {
    const dates = ["10/22/25", "09/24/25", "08/27/25", "07/30/25", "07/02/25", "06/04/25"], tac = ["PP", "Digital", "BxGx", "PP", "Digital", "BxGx"];
    const h = NP.util.hashStr(o.uid), base = Math.round(o.baseUnitsK * 1000 / 52);
    const rows = dates.map((d, i) => { const r = ((h + i * 37) % 50) / 100, units = Math.round(base * (1.35 + r)), aiv = o.basePrice * (0.7 + (i % 3) * 0.18), sales = Math.round(units * aiv);
      return '<tr><td class="npv2-wk-l">' + d + '</td><td class="r">' + units.toLocaleString() + '</td><td class="r">$' + sales.toLocaleString() + '</td><td class="npv2-wk-l">' + tac[i] + '</td><td class="r">$' + aiv.toFixed(2) + "</td></tr>"; }).join("");
    return '<table class="npv2-wk-gridtbl"><thead><tr><th class="npv2-wk-l">Ad break</th><th class="r">Units</th><th class="r">Sales</th><th class="npv2-wk-l">Tactic</th><th class="r">AIV</th></tr></thead><tbody>' + rows + "</tbody></table>";
  }
  function sidePanelHTML(o, week, pds) {
    const selPa = WKST.selPa || pds[0].pa, pd = pds.find((p) => p.pa === selPa) || pds[0], chosen = chosenFor(o, week, pd);
    const tab = WKST.tab;
    const phead = tab === "cost" ? esc(chosen.label) + " · " + esc(pd.pa) : tab === "hist" ? esc(o.ncrc) + " · last 6 ad-breaks" : "";
    return '<aside class="npv2-wk-panel">' +
      '<div class="npv2-wk-ptabs"><button type="button" data-ptab="cost" class="' + (tab === "cost" ? "is-on" : "") + '">Cost ladder</button><button type="button" data-ptab="hist" class="' + (tab === "hist" ? "is-on" : "") + '">Promotion History</button><button type="button" data-ptab="explain" class="' + (tab === "explain" ? "is-on" : "") + '">Explain</button></div>' +
      (phead ? '<div class="npv2-wk-phead">' + phead + "</div>" : "") +
      (tab === "hist" ? promoHistoryHTML(o) : tab === "explain" ? explainPanelHTML(o) : ladderHTML(o, chosen) + nopaPanelHTML(o, pd.pa)) + "</aside>";
  }

  // ============================ OVERRIDE RECOMMENDATION (ported: default + per-PA exceptions,
  // APEX/OMS dual system). Uses the original promo-plan.css pd-* classes for pixel parity.
  const PROMO_OPTS = {
    apexDiscount: ["PP", "%", "Cents", "BXG1"],
    omsDiscount: ["PP Ea", "% Ea", "Cents Ea", "Free Ea", "PP lb", "% lb", "Cents lb", "Free lb"],
    uom: [["E", "E — Each"], ["W", "W — Weighted"]],
    channel: ["Store Only", "Print Only", "Clip Click", "Digital Only"],
    omsTactic: ["Item Discount", "BXGX", "MB"]
  };
  const APEX_ALLOWANCES = [
    { id: "4379527", name: "Buying allowance", tag: "PRIMARY", status: "Active", amount: 11550 },
    { id: "4381002", name: "Off-invoice allowance", tag: "", status: "Active", amount: 8200 },
    { id: "4390115", name: "Bill-back allowance", tag: "", status: "Pending", amount: 4300 }
  ];
  function freshPromoForm(extra) {
    return Object.assign({
      apexDiscount: "PP", apexFactor: "0", apexAmount: "", apexUom: "E", apexMinBuy: "1", apexLimit: "6", apexInAd: false, apexAllowanceId: "4379527",
      omsChannel: "Store Only", omsTactic: "Item Discount", omsUom: "E", omsMinBuy: "0", omsDiscount: "PP Ea", omsAmount: "", omsLim: "6", omsLimLb: "0"
    }, extra || {});
  }
  function promoSummary(f) {
    f = f || {};
    const amtStr = (opt, amt) => { if (amt === "" || amt == null) return ""; if (/^%/.test(opt)) return amt + "%"; if (/^Cents/.test(opt)) return amt + "¢"; return "$" + Number(amt).toFixed(2); };
    const aA = amtStr(f.apexDiscount, f.apexAmount), aO = amtStr(f.omsDiscount, f.omsAmount);
    return { apex: (f.apexDiscount || "—") + (aA ? " " + aA : ""), oms: ((f.omsChannel || "") + (f.omsDiscount ? " · " + f.omsDiscount : "") + (aO ? " " + aO : "")).replace(/^ · /, "") };
  }
  function promoDepth(f) {
    const opt = f.apexDiscount, amt = parseFloat(f.apexAmount) || 0;
    if (/^%/.test(opt)) return clampN(amt / 100, 0, 0.6);
    if (/^Cents/.test(opt)) return clampN((amt / 100) / 3, 0, 0.6);
    if (/^BXG1/.test(opt)) return 0.5;
    if (/^PP/.test(opt)) return 0.2;
    return clampN(amt / 5, 0, 0.6);
  }
  function customOfferFrom(o, week, pa, f) {
    const bm = weekBaseMetrics(o, week), pds = paData(o, week), pd = pds.find((p) => p.pa === pa) || pds[0];
    const rec = pd.offers.find((x) => x.isRec) || pd.offers[0];
    const depth = promoDepth(f), base = rec.base, promo = round(base * (1 - depth), 2), dd = depth - bm.recDepth;
    const um = clampN(1 + dd * 1.4, 0.55, 1.85), sm = clampN(um * (1 - dd * 0.35), 0.5, 1.9), am = clampN(um * (1 - dd * 1.05), 0.35, 1.8);
    const sum = promoSummary(f);
    return {
      id: "custom-" + pa, label: "APEX+OMS · " + f.omsTactic, rank: 0, isRec: false, isCustom: true,
      storeName: f.omsTactic, storeCode: "CUSTOM", digName: (f.omsChannel && f.omsChannel !== "Store Only") ? f.omsChannel : null,
      depth: depth, vlc: rec.vlc, dnc: rec.dnc, base: base, promo: promo, save: Math.max(0, base - promo),
      digPromo: null, mb: (f.apexMinBuy || "1") + " / " + (f.apexLimit || "6"), ad: (f.apexInAd ? "Y / N" : "N / N"), funding: rec.funding,
      units: rec.units * um, sales: rec.sales * sm, agp: rec.agp * am, R: 0, G: 0, total: null,
      _form: Object.assign({}, f), _apex: sum.apex, _oms: sum.oms
    };
  }
  function apexAllowanceListHTML(selectedId, attr) {
    const groupName = "apexAllow-" + attr.replace(/[^a-z]/gi, ""), sel = selectedId || APEX_ALLOWANCES[0].id;
    return '<div class="pd-allow"><span class="pd-of-label">Allowance</span><div class="pd-allow-list">' +
      APEX_ALLOWANCES.map((a) => '<label class="pd-allow-item ' + (sel === a.id ? "is-sel" : "") + '"><input type="radio" name="' + groupName + '" ' + attr + '="apexAllowanceId" value="' + esc(a.id) + '" ' + (sel === a.id ? "checked" : "") + ' /><span class="pd-allow-id">' + esc(a.id) + '</span><span class="pd-allow-name">' + esc(a.name) + "</span>" + (a.tag ? '<span class="pd-allow-badge">' + esc(a.tag) + "</span>" : "") + '<span class="pd-allow-meta">' + esc(a.status) + " · $" + a.amount.toLocaleString("en-US", { minimumFractionDigits: 2 }) + "</span></label>").join("") +
      "</div></div>";
  }
  function promoSystemsPairHTML(f, attr) {
    const O = PROMO_OPTS;
    const sel = (name, options, cur) => "<select " + attr + '="' + name + '">' + options.map((o) => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (cur === v ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("") + "</select>";
    const num = (name, val) => '<input type="number" step="1" min="0" ' + attr + '="' + name + '" value="' + esc(val == null ? "" : val) + '" />';
    const money = (name, val) => '<div class="pd-money"><span>$</span><input type="number" step="0.01" min="0" ' + attr + '="' + name + '" value="' + esc(val == null ? "" : val) + '" placeholder="-" /></div>';
    const field = (label, inner, cls) => '<label class="pd-of-field ' + (cls || "") + '"><span>' + esc(label) + "</span>" + inner + "</label>";
    return '<div class="pd-promo-systems">' +
      '<section class="pd-promo-sys-card"><header><span class="pd-sys-tag pd-sys-apex">APEX</span> <span>Price-point promotion</span></header>' +
        '<div class="pd-override-fields">' +
          field("Discount", sel("apexDiscount", O.apexDiscount, f.apexDiscount)) +
          field("Factor", num("apexFactor", f.apexFactor), "pd-of-field-sm") +
          field("Amount", money("apexAmount", f.apexAmount)) +
          field("UOM", sel("apexUom", O.uom, f.apexUom), "pd-of-field-sm") +
          field("Min buy", num("apexMinBuy", f.apexMinBuy), "pd-of-field-sm") +
          field("Limit", num("apexLimit", f.apexLimit), "pd-of-field-sm") +
          '<label class="pd-of-field pd-of-check"><input type="checkbox" ' + attr + '="apexInAd" ' + (f.apexInAd ? "checked" : "") + " /> <span>In Ad</span></label>" +
        "</div>" + apexAllowanceListHTML(f.apexAllowanceId, attr) +
      "</section>" +
      '<section class="pd-promo-sys-card"><header><span class="pd-sys-tag pd-sys-oms">OMS</span> <span>Multi-channel promotion</span></header>' +
        '<div class="pd-override-fields">' +
          field("Channel", sel("omsChannel", O.channel, f.omsChannel)) +
          field("Tactic", sel("omsTactic", O.omsTactic, f.omsTactic)) +
          field("UOM", sel("omsUom", O.uom, f.omsUom), "pd-of-field-sm") +
          field("Min buy", num("omsMinBuy", f.omsMinBuy), "pd-of-field-sm") +
          field("Discount", sel("omsDiscount", O.omsDiscount, f.omsDiscount)) +
          field("Amount", money("omsAmount", f.omsAmount)) +
          field("Lim", num("omsLim", f.omsLim), "pd-of-field-sm") +
          field("Lim Lb", num("omsLimLb", f.omsLimLb), "pd-of-field-sm") +
        "</div>" +
      "</section>" +
    "</div>";
  }
  function editPanelHTML(paName) {
    const f = WKST.manualEditForm || freshPromoForm();
    return '<div class="pd-manual-default pd-manual-editpanel"><div class="pd-manual-default-head"><div class="pd-md-title"><span class="pd-md-badge pd-md-badge-edit">OVERRIDE</span><strong>Overriding ' + esc(paName) + '</strong><p>Break this price area out from the default. Forecast recalculates on save.</p></div></div>' +
      '<div class="pd-manual-fields">' + promoSystemsPairHTML(f, "data-of2") +
        '<div class="pd-manual-default-actions"><button type="button" class="pd-btn-secondary" data-ovcancel>Cancel</button><button type="button" class="pd-btn-primary" data-ovsave>Save override</button></div>' +
      "</div></div>";
  }
  // Corporate Item Group id — a stable 9-digit system id per item (no NCRCs in override mode).
  function cigId(o) { const h = Math.abs(NP.util.hashStr(o.uid + "|cig")); return "CIG " + (100000000 + (h % 900000000)); }
  function overrideHTML(o, week) {
    const pds = paData(o, week), f = WKST.oform || (WKST.oform = freshPromoForm());
    const customCount = pds.filter((pd) => WKST.custom[paKey(o, week, pd.pa)]).length;
    const editPa = WKST.manualEditPa;
    const rows = pds.map((pd) => {
      const cust = WKST.custom[paKey(o, week, pd.pa)], isEditing = editPa === pd.pa;
      const sum = (cust && cust._form) ? promoSummary(cust._form) : promoSummary(f);
      const status = isEditing ? '<span class="pd-status-badge pd-status-custom">Editing…</span>' : cust ? '<span class="pd-status-badge pd-status-custom">Custom</span>' : '<span class="pd-status-badge pd-status-inherit">Inherits default</span>';
      const actions = isEditing ? "" : cust
        ? '<a href="#" class="pd-override-link pd-override-link-clear" data-ovclear="' + pd.pa + '">Reset</a> <a href="#" class="pd-override-link" data-ovedit="' + pd.pa + '">✎ Edit</a>'
        : '<a href="#" class="pd-override-link" data-ovedit="' + pd.pa + '">✎ Override</a>';
      return '<tr class="pd-manual-row ' + (isEditing ? "is-editing-row" : cust ? "is-custom" : "is-inherit") + '"><td class="pa-col"><strong>' + pd.pa + "</strong></td>" +
        '<td class="pd-manual-promo"><span class="pd-sys-tag pd-sys-apex">APEX</span> ' + esc(sum.apex) + "</td>" +
        '<td class="pd-manual-promo"><span class="pd-sys-tag pd-sys-oms">OMS</span> ' + esc(sum.oms) + "</td>" +
        "<td>" + status + '</td><td class="r pd-manual-actions">' + actions + "</td></tr>";
    }).join("");
    return '<section class="pd-section pd-manual">' +
      '<div class="pd-manual-topbar"><div><h3>Override recommendation</h3><p><strong>' + esc(o.item) + "</strong> · " + cigId(o) + " · " + esc(o.vendor) + " — build a custom promo across every price area, or override individual price areas below.</p></div>" +
        '<button type="button" class="pd-override-flip" data-ovback>← Back to recommendations</button></div>' +
      '<div class="pd-manual-default' + (WKST.defaultOpen ? "" : " is-collapsed") + '"><div class="pd-manual-default-head" data-oftoggle role="button" tabindex="0" aria-expanded="' + (WKST.defaultOpen ? "true" : "false") + '"><div class="pd-md-title"><span class="pd-md-badge">DEFAULT</span><strong>Promo tactic — applies to all ' + pds.length + " price area" + (pds.length === 1 ? "" : "s") + "</strong><p>Set once here. Every price area inherits this unless you override it below.</p></div>" +
        '<span class="pd-md-count">' + customCount + " of " + pds.length + ' price areas customised</span><span class="pd-md-caret" aria-hidden="true">' + (WKST.defaultOpen ? "▾" : "▸") + "</span></div>" +
        (WKST.defaultOpen ? '<div class="pd-manual-fields">' + promoSystemsPairHTML(f, "data-of") +
          '<div class="pd-manual-default-actions"><button type="button" class="pd-btn-secondary" data-ovresetall' + (customCount ? "" : " disabled") + ">Reset all exceptions</button><button type=\"button\" class=\"pd-btn-primary\" data-ovapply>Apply &amp; forecast</button></div>" +
        "</div>" : "") + "</div>" +
      '<p class="pd-override-disclaimer"><strong>Override mode.</strong> Results are not optimised by the recommender. Linked items in store may be impacted. No guardrail or reliability scores will be shown.</p>' +
      (editPa ? editPanelHTML(editPa) : "") +
      '<p class="pd-manual-cascade">↳ Changes to the default cascade to every <b>Inherits default</b> row automatically. Customised rows keep their own values.</p>' +
      '<div class="pd-section-head pd-rec-head"><div><h3>Price areas</h3><p>One row per price area for ' + cigId(o) + ". Override a row to break from the default; reset to snap it back.</p></div></div>" +
      '<div class="pd-pa-table-wrap"><table class="pd-pa-cols-table pd-manual-table"><thead><tr><th>PA</th><th>APEX promo</th><th>OMS promo</th><th>Status</th><th class="r"></th></tr></thead><tbody>' + rows + "</tbody>" +
      '<tfoot><tr class="pd-pa-totals-row"><td class="pa-col"><strong>Total</strong><span class="pd-totals-sub">' + pds.length + " price areas · " + customCount + ' customised</span></td><td></td><td></td><td></td><td class="r"></td></tr></tfoot></table></div>' +
      "</section>";
  }

  // --- worklist rail (basket of completed promos) ---
  function worklistHTML(items, active, week) {
    const done = items.filter((x) => WKCART[cartKey(x, week)]).length;
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    // group by vendor so each header can carry its own count (matches the original rail)
    const byV = {}, order = [];
    items.forEach((o) => { if (!byV[o.vendor]) { byV[o.vendor] = []; order.push(o.vendor); } byV[o.vendor].push(o); });
    // pinned header (title/progress/context) — stays put while only the item list scrolls
    let html = '<div class="npv2-wk-wlhead"><h4>Worklist</h4><span class="npv2-wk-wlprog">' + done + ' <small>of ' + items.length + " added</small></span></div>" +
      '<div class="npv2-wk-wlbar" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
      '<p class="npv2-wk-wlsub">' + esc(weekLabel(week)) + " · " + items.length + " NCRCs in view</p>";
    // scrollable item list (its own scroll area, no visible scrollbar)
    html += '<div class="npv2-wk-wlscroll">';
    order.forEach((v) => {
      html += '<div class="npv2-wk-wlvendor">' + esc(v) + "<span>" + byV[v].length + "</span></div>";
      byV[v].forEach((o) => {
        const n = items.indexOf(o) + 1;
        const inCart = !!WKCART[cartKey(o, week)];
        const c = NP.weekPlan(o, NP.displayMap(), false)[week - 1];
        const rec = inCart ? "✓ Added — " + WKCART[cartKey(o, week)].offer : (c && c.promoted && c.offer ? "Rec: " + c.offer.label : "No promo rec");
        html += '<button type="button" class="npv2-wk-wlitem' + (o.uid === active ? " is-active" : "") + (inCart ? " is-done" : "") + '" data-wl="' + o.uid + '">' +
          '<span class="npv2-wk-wlnum">' + (inCart ? "✓" : n) + "</span>" +
          '<span class="npv2-wk-wlbody"><span class="npv2-wk-wlcode">' + esc(o.ncrc) + '</span><span class="npv2-wk-wlname">' + esc(o.item) + " <i>" + esc(o.pack) + '</i></span><span class="npv2-wk-wlrec">' + esc(rec) + "</span></span></button>";
      });
    });
    html += "</div>";
    // pinned basket footer
    const cart = Object.keys(WKCART).map((k) => WKCART[k]);
    html += '<div class="npv2-wk-cart"><div class="npv2-wk-carthead">Basket (' + cart.length + ") · not published yet</div>" +
      (cart.length ? cart.slice(-6).map((c) => '<div class="npv2-wk-cartrow"><span>' + esc(c.ncrc) + " · W" + c.week + '</span><b>' + esc(c.offer) + "</b></div>").join("") : '<div class="npv2-wk-cartempty">Basket is empty. Add selections as you go; nothing publishes until you finalize.</div>') + "</div>";
    return html;
  }

  // "Explain" side-panel tab — why the optimizer picked this promo (ported pd-narrative)
  function explainPanelHTML(o) {
    const ctx = NP.askContext(o), reasons = ctx.reasons || [];
    return '<article class="pd-narrative">' +
      '<span class="pd-narrative-eyebrow">WHY THIS PROMOTION?</span>' +
      '<h2 class="pd-narrative-title">' + esc(o.item) + "</h2>" +
      '<p class="pd-narrative-subtitle">' + esc(o.ncrc + " · " + o.vendor) + "</p>" +
      '<p class="pd-narrative-recommendation"><strong>Recommendation:</strong> promote at the optimized depth — it beats last year on sales (' + NP.fmt.pct(ctx.dR) + "), units (" + NP.fmt.pct(ctx.dU) + ") and AGP (" + NP.fmt.pct(ctx.dA) + ").</p>" +
      '<h3 class="pd-narrative-heading">The short version</h3>' +
      '<p class="pd-narrative-body">The optimizer chose this tactic and depth because it maximizes ' + esc(NP.objMeta().short) + " within the learned guardrails while holding margin.</p>" +
      '<h3 class="pd-narrative-heading">Why the optimizer favours it</h3>' +
      '<ul class="pd-narrative-list">' + reasons.map((r) => "<li>" + r + "</li>").join("") + "</ul>" +
      '<h3 class="pd-narrative-heading">What we tested</h3>' +
      '<p class="pd-narrative-body">Every eligible tactic × depth for this NCRC was scored; the pick is the top of that set after guardrail and reliability penalties.</p>' +
      "</article>";
  }

  // "More" row on a promoted NCRC — Ad &amp; tag details + per-PA overrides + tag/digital preview (ported)
  function shelfFigureHTML() {
    return '<figure class="pd-tagprev-card pd-tagprev-shelf"><div class="pd-tagprev-canvas pd-shelf">' +
      '<div class="pd-shelf-member">Member Price!</div><div class="pd-shelf-rule"></div>' +
      '<div class="pd-shelf-prices"><div class="pd-shelf-p"><b>3<sup>99</sup></b><em>ea</em></div><div class="pd-shelf-bar"></div><div class="pd-shelf-p"><b>3<sup>49</sup></b><em>ea</em><span class="pd-shelf-mm">Mix &amp; Match<br>Limit 4</span></div></div>' +
      '<div class="pd-shelf-save">SAVE $1.50</div>' +
      '<div class="pd-shelf-foot"><span>$5.32<br><i>PER QUART</i></span><span class="pd-shelf-thru">Thru Tue Oct 22</span><span>$4.66<br><i>PER QUART</i></span></div>' +
      '</div><span class="pd-tagprev-overlay">Coming soon</span></figure>';
  }
  function digitalFigureHTML(o) {
    return '<figure class="pd-tagprev-card pd-tagprev-digital"><div class="pd-tagprev-canvas pd-digital">' +
      '<div class="pd-digital-top"><span class="pd-digital-foru">for U</span><b class="pd-digital-price">$3.49</b><span class="pd-digital-each">Each</span></div>' +
      '<div class="pd-digital-instore">In-store: $4.99</div>' +
      '<div class="pd-digital-name">' + esc(o.item) + "</div>" +
      '<a class="pd-digital-offer">Offer Details</a>' +
      '<div class="pd-digital-row"><button type="button" class="pd-digital-clip">Clip Coupon</button><span class="pd-digital-exp">Unlimited use<br>Expires soon</span></div>' +
      '<div class="pd-digital-plu">PLU 70432</div>' +
      '</div><span class="pd-tagprev-overlay">Coming soon</span></figure>';
  }
  function reviewExpandedRow(o, week) {
    const pas = paData(o, week).map((p) => p.pa);
    const af = (label, ph) => '<label class="pd-rev-field"><span>' + label + '</span><input type="text" placeholder="' + esc(ph) + '" /></label>';
    const at = (label, ph) => '<label class="pd-rev-field"><span>' + label + '</span><input type="text" maxlength="8" placeholder="' + esc(ph) + '" /></label>';
    const paList = '<div class="pd-rev-pa-list"><div class="pd-rev-pa-list-head"><strong>Price areas</strong><span class="pd-rev-pa-list-sub">0 of ' + pas.length + " overridden · the rest inherit the default above</span></div>" +
      pas.map((pa) => '<div class="pd-rev-pa-item is-inherit"><div class="pd-rev-pa-item-top"><span class="pd-rev-pa-name">' + pa + '</span><span class="pd-status-badge pd-status-inherit">Inherits default</span><span class="pd-rev-pa-actions"><a href="#" class="pd-override-link">✎ Override</a></span></div></div>').join("") + "</div>";
    return '<tr class="pd-review-row-expanded"><td colspan="20">' +
      '<div class="pd-rev-detail-bar"><span class="pd-rev-detail-eyebrow">More details</span><span class="pd-rev-detail-context">' + esc(o.ncrc) + " · " + esc(o.vendor) + "</span></div>" +
      '<div class="pd-rev-scope"><span class="pd-rev-scope-t"><span class="pd-md-badge">DEFAULT</span> Ad &amp; tag details</span><span class="pd-rev-scope-applies">Applies to <b>all ' + pas.length + " price area" + (pas.length === 1 ? "" : "s") + "</b> unless overridden below</span></div>" +
      '<div class="pd-rev-2tables"><div class="pd-rev-table1"><div class="pd-rev-adtag">' +
        '<section class="pd-rev-detail-card"><header><strong>Ad details</strong></header><div class="pd-rev-detail-fields">' +
          af("Headline", "Cool down with...") + af("Body copy", "Short marketing line") + af("Image UPC", "049000028911") + af("Ad instructions", "Reverse type, blue chip") + af("Pricing comments", "BOGO restriction on size") +
          '<label class="pd-rev-field"><span>Ad bug</span><select><option>None</option><option>1x rewards</option><option>2x rewards</option><option>Limit 4</option></select></label>' + af("Coupon PLU", "70432") +
        "</div></section>" +
        '<section class="pd-rev-detail-card pd-rev-detail-card-tags"><header><strong>Tag details</strong></header><div class="pd-rev-detail-fields pd-rev-detail-fields-tags">' + at("BIB", "EC15") + at("SIGN", "SC15") + at("Talker", "1") + at("Molding", "0") + "</div></section>" +
      "</div>" + paList + "</div>" +
      '<div class="pd-rev-table2"><div class="pd-tagprev-head"><strong>Tag &amp; digital preview</strong><span class="pd-soon-badge">Coming soon</span></div>' + shelfFigureHTML() + digitalFigureHTML(o) + "</div></div>" +
      "</td></tr>";
  }

  // finalise CONFIRMATION screen (real screen, not an alert) — shown after publish
  function finalizeScreenHTML() {
    const f = WKST.finalized;
    return '<div class="pd-review pd-review-done">' +
      '<div class="pd-finalize-receipt"><div class="pd-finalize-check">✓</div>' +
        "<h2>Plan published</h2>" +
        "<p>" + f.count + " promotion" + (f.count === 1 ? "" : "s") + " for <strong>" + esc(f.category) + "</strong> · Week <strong>W" + f.week + "</strong> " + (f.count === 1 ? "was" : "were") + " committed to the plan.</p>" +
        '<div class="pd-finalize-totals"><div><span>Sales</span><strong>' + f.sales + '</strong></div><div><span>Units</span><strong>' + f.units + '</strong></div><div><span>AGP</span><strong>' + f.agp + "</strong></div></div>" +
        '<div class="pd-finalize-actions"><button type="button" class="pd-btn-secondary" data-revback>← Back to worklist</button><button type="button" class="pd-btn-primary" data-findone>Done</button></div>' +
      "</div></div>";
  }

  // ======================= REVIEW & FINALISE (ported: 3 sections — promoting / skipped /
  // no-offer — with the original 20-column table + grand-total summary. pd-* classes.)
  function reviewHTML() {
    if (WKST.finalized) return finalizeScreenHTML();
    const week = WEEKSEL.week, worklist = frontItems();
    const money = (vM) => wkM(vM), unitsF = (uK) => wkU(uK);
    const sortKey = ff.sortBy || "sales";
    const objective = sortKey === "agp" ? "AGP velocity" : sortKey === "units" ? "Units velocity" : "Sales velocity";
    const category = NP.cat().name.split(" — ")[0];
    // classify worklist rows for the selected week
    const promoted = [], skipped = [], unavail = [];
    worklist.forEach((o) => {
      if (WKCART[cartKey(o, week)]) { promoted.push(o); return; }
      const hash = (o.ncrc || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
      (hash % 3 === 0 ? unavail : skipped).push(o);
    });
    const promoMetrics = (o) => {
      const pds = paData(o, week), chosen = pds.map((pd) => chosenFor(o, week, pd)), first = chosen[0];
      const sales = chosen.reduce((s, c) => s + c.sales, 0), units = chosen.reduce((s, c) => s + c.units, 0), agp = chosen.reduce((s, c) => s + c.agp, 0);
      const allow = chosen.reduce((s, c) => s + c.funding * c.units, 0) / 1000, promoGp = agp + allow;
      const lySales = pds.reduce((s, pd) => s + pd.ly.sales, 0), lyUnits = pds.reduce((s, pd) => s + pd.ly.units, 0), lyAgp = pds.reduce((s, pd) => s + pd.ly.agp, 0);
      return { o, first, sales, units, agp, allow, promoGp, lySales, lyUnits, lyAgp, lyAllow: allow * 0.92, lyPromoGp: lyAgp + allow * 0.92, isCustom: first.isCustom };
    };
    const baseMetrics = (o) => { const bm = weekBaseMetrics(o, week); return { o, sales: bm.npSales, units: bm.npUnits, agp: bm.npAgp, vlc: NP.deadNetOf(o), aiv: o.basePrice }; };
    const pm = promoted.map(promoMetrics);
    const sortField = sortKey === "agp" ? "agp" : sortKey === "units" ? "units" : "sales";
    pm.sort((a, b) => b[sortField] - a[sortField]);
    const sk = skipped.map(baseMetrics), un = unavail.map(baseMetrics);
    // section totals
    const sum = (arr, k) => arr.reduce((s, r) => s + r[k], 0);
    const s1 = { sales: sum(pm, "sales"), units: sum(pm, "units"), agp: sum(pm, "agp"), allow: sum(pm, "allow"), promoGp: sum(pm, "promoGp"), lySales: sum(pm, "lySales"), lyUnits: sum(pm, "lyUnits"), lyAgp: sum(pm, "lyAgp"), lyAllow: sum(pm, "lyAllow"), lyPromoGp: sum(pm, "lyPromoGp") };
    const s2 = { sales: sum(sk, "sales"), units: sum(sk, "units"), agp: sum(sk, "agp") };
    const s3 = { sales: sum(un, "sales"), units: sum(un, "units"), agp: sum(un, "agp") };
    const grand = { sales: s1.sales + s2.sales + s3.sales, units: s1.units + s2.units + s3.units, agp: s1.agp + s2.agp + s3.agp };
    const dlt = (cur, base) => { const d = cur - base, pct = base ? d / base * 100 : 0; return { d, pct, klass: d >= 0 ? "positive" : "negative" }; };
    const mcell = (val, d, f) => '<td class="r"><strong>' + val + '</strong><div class="pd-review-sub ' + d.klass + '">' + (d.d >= 0 ? "+" : "") + f(d.d) + " <span>/</span> " + (d.pct >= 0 ? "+" : "") + d.pct.toFixed(1) + "% vs LY</div></td>";
    const yn = (b) => b ? "Y" : "N", dash = '<span class="pd-rev-na">—</span>';
    // promoted row
    const promoRow = (r) => {
      const inCirc = r.first.ad && r.first.ad.charAt(0) === "Y", inDisp = r.first.ad && r.first.ad.slice(-1) === "Y", hasFund = r.allow > 0;
      const dS = dlt(r.sales, r.lySales), dU = dlt(r.units, r.lyUnits), dA = dlt(r.agp, r.lyAgp), dG = dlt(r.promoGp, r.lyPromoGp);
      const dig = r.first.digName ? '<div class="pd-review-stack"><span>' + esc(r.first.digName) + "</span><small>$" + (r.first.digPromo || r.first.promo).toFixed(2) + "</small></div>" : '<span class="pd-faint">No digital</span>';
      return '<tr class="pd-review-row pd-review-row-priced"><td class="pd-rev-priced"><span class="pd-rev-pill pd-rev-pill-priced">Priced</span>' + (r.isCustom ? '<span class="pd-rev-pill pd-rev-pill-custom">Custom</span>' : "") + "</td>" +
        "<td>" + esc(r.o.vendor) + "</td><td>" + esc(r.o.ncrc) + "</td><td>" + esc(r.o.item) + " <em>" + esc(r.o.pack) + "</em></td>" +
        '<td class="c">' + yn(inCirc) + '</td><td>' + (inCirc ? '<input type="text" class="pd-rev-input" maxlength="6" placeholder="PG-#" />' : '<span class="pd-faint">—</span>') + "</td>" +
        '<td class="c">' + yn(inDisp) + '</td><td>' + (inDisp ? '<input type="text" class="pd-rev-input pd-rev-input-wide" maxlength="10" placeholder="Endcap" />' : '<span class="pd-faint">—</span>') + "</td>" +
        '<td class="r">245</td><td class="c">' + yn(hasFund) + "</td>" +
        '<td><div class="pd-review-stack"><span>' + esc(r.first.storeName) + "</span><small>Save $" + r.first.save.toFixed(2) + "</small></div></td><td>" + dig + "</td>" +
        '<td class="r">$' + r.first.vlc.toFixed(2) + "</td>" +
        mcell(money(r.sales), dS, money) + mcell(unitsF(r.units), dU, unitsF) + mcell(money(r.agp), dA, money) +
        '<td class="r">$' + r.first.promo.toFixed(2) + '</td><td class="r"><strong>' + money(r.allow) + "</strong></td>" +
        mcell(money(r.promoGp), dG, money) +
        '<td class="c pd-rev-more-col"><button type="button" class="pd-pa-toggle-btn pd-rev-more-btn' + (WKST.reviewExpanded[r.o.uid] ? " is-open" : "") + '" data-revmore="' + r.o.uid + '"><span>' + (WKST.reviewExpanded[r.o.uid] ? "Hide" : "More") + '</span><span class="pd-pa-toggle-arrow">▾</span></button></td></tr>' +
        (WKST.reviewExpanded[r.o.uid] ? reviewExpandedRow(r.o, week) : "");
    };
    // baseline row (skipped / no-offer)
    const baseRow = (r, mode) => {
      const pill = mode === "decided" ? '<span class="pd-rev-pill pd-rev-pill-skip">Skipped</span>' : '<span class="pd-rev-pill pd-rev-pill-warn">No live offer</span>';
      const klass = mode === "decided" ? "pd-review-row-skipped" : "pd-review-row-unavailable";
      return '<tr class="pd-review-row ' + klass + '"><td class="pd-rev-priced">' + pill + "</td><td>" + esc(r.o.vendor) + "</td><td>" + esc(r.o.ncrc) + "</td><td>" + esc(r.o.item) + " <em>" + esc(r.o.pack) + "</em></td>" +
        '<td class="c">N</td><td class="pd-rev-na-cell">' + dash + '</td><td class="c">N</td><td class="pd-rev-na-cell">' + dash + '</td><td class="r">245</td><td class="c">N</td>' +
        '<td><div class="pd-review-stack"><span>No promo</span><small>' + (mode === "decided" ? "Planner stepped past" : "No live offer") + '</small></div></td><td class="pd-rev-na-cell">' + dash + "</td>" +
        '<td class="r">$' + r.vlc.toFixed(2) + '</td><td class="r">' + money(r.sales) + '</td><td class="r">' + unitsF(r.units) + '</td><td class="r">' + money(r.agp) + '</td><td class="r">$' + r.aiv.toFixed(2) + '</td><td class="pd-rev-na-cell">' + dash + '</td><td class="pd-rev-na-cell">' + dash + '</td><td class="pd-rev-na-cell c">' + dash + "</td></tr>";
    };
    const divider = (klass, title, count, blurb, controls) => '<tr class="pd-review-section-divider ' + klass + '"><td colspan="20"><div class="pd-rev-div-row"><div class="pd-rev-div-text"><strong>' + title + '</strong><span class="pd-rev-div-count">' + count + "</span><small>" + blurb + "</small></div>" + (controls || "") + "</div></td></tr>";
    const sortChip = (k, l) => '<button type="button" class="pd-bin-chip pd-sort-chip ' + (sortKey === k ? "active" : "") + '" data-revsort="' + k + '"><i class="pd-bin-dot pd-sort-dot-' + k + '"></i><span class="pd-bin-label">' + l + "</span></button>";
    const sortControls = '<div class="pd-rev-div-controls"><span class="pd-scope-label">Sort by</span><div class="pd-bin-chips">' + sortChip("sales", "Sales velocity") + sortChip("units", "Units velocity") + sortChip("agp", "AGP velocity") + "</div></div>";
    const s1TotalsRow = (() => {
      const dS = dlt(s1.sales, s1.lySales), dU = dlt(s1.units, s1.lyUnits), dA = dlt(s1.agp, s1.lyAgp), dAl = dlt(s1.allow, s1.lyAllow), dG = dlt(s1.promoGp, s1.lyPromoGp);
      return '<tr class="pd-review-totals pd-review-section-totals"><td colspan="12"><strong>Section total · ' + pm.length + " promoted " + (pm.length === 1 ? "item" : "items") + '</strong></td><td class="r">—</td>' +
        mcell(money(s1.sales), dS, money) + mcell(unitsF(s1.units), dU, unitsF) + mcell(money(s1.agp), dA, money) + '<td class="r">—</td>' + mcell(money(s1.allow), dAl, money) + mcell(money(s1.promoGp), dG, money) + '<td class="c pd-rev-more-col"></td></tr>';
    })();
    const baseTotalsRow = (rows, tot) => '<tr class="pd-review-totals pd-review-section-totals"><td colspan="13"><strong>Section total · ' + rows.length + " " + (rows.length === 1 ? "item" : "items") + '</strong></td><td class="r"><strong>' + money(tot.sales) + '</strong></td><td class="r"><strong>' + unitsF(tot.units) + '</strong></td><td class="r"><strong>' + money(tot.agp) + '</strong></td><td class="r">—</td><td class="pd-rev-na-cell"><span class="pd-rev-na">—</span></td><td class="pd-rev-na-cell"><span class="pd-rev-na">—</span></td><td class="c pd-rev-more-col"></td></tr>';
    const gcard = (label, val, sp, sk2, un2) => '<article class="pd-grand-metric"><span class="pd-grand-label">' + label + '</span><strong class="pd-grand-value">' + val + '</strong><div class="pd-grand-split"><span><em>Promoted</em> ' + sp + "</span><span><em>Skipped</em> " + sk2 + "</span><span><em>No offer</em> " + un2 + "</span></div></article>";
    return '<div class="pd-review">' +
      '<header class="pd-review-head"><div class="pd-review-head-l"><span class="pd-eyebrow">REVIEW &amp; FINALISE</span><h2>' + esc(category) + '</h2>' +
        '<div class="pd-review-meta"><span><em>Week</em> <strong>W' + week + '</strong></span><span class="dot">·</span><span><em>Objective</em> <strong>' + objective + '</strong></span><span class="dot">·</span><span><em>Division</em> <strong>' + esc(NP.divMeta().short) + "</strong></span></div>" +
        // plan totals live in the header (no separate summary section)
        '<div class="npv2-rev-totals"><span><em>Sales</em><b>' + money(grand.sales) + "</b></span><span><em>Units</em><b>" + unitsF(grand.units) + "</b></span><span><em>AGP</em><b>" + money(grand.agp) + "</b></span></div></div>" +
        '<div class="pd-review-counts"><span class="pd-review-count priced">' + pm.length + ' promoted</span><span class="pd-review-count skipped">' + sk.length + ' skipped</span><span class="pd-review-count unavailable">' + un.length + ' no promo available</span></div></header>' +
      '<div class="pd-review-table-wrap pd-review-table-wrap-unified"><table class="pd-review-table pd-review-table-unified"><thead><tr>' +
        '<th class="pd-rev-priced">Priced</th><th class="l">Vendor</th><th class="l">NCRC</th><th class="l">NCRC description</th><th class="c">In circ.</th><th class="l">Ad page</th><th class="c">In disp.</th><th class="l">Display</th><th class="r">Stores</th><th class="c">NOPA</th><th class="l">Store tactic</th><th class="l">Digital tactic</th><th class="r">VLC</th><th class="r">Sales</th><th class="r">Units</th><th class="r">AGP $</th><th class="r">AIV</th><th class="r">Allow. $</th><th class="r">Promo GP</th><th class="c pd-rev-more-col"></th>' +
        "</tr></thead>" +
        '<tbody class="pd-section-body pd-section-body-promoted">' + divider("pd-rev-div-promoted", "Items you're promoting", pm.length, "Use <em>More</em> on any row for the full ad / tag form.") + (pm.length ? pm.map(promoRow).join("") + s1TotalsRow : '<tr><td colspan="20" class="pd-review-skip-msg">Nothing added for this week yet — add promotions from the worklist.</td></tr>') + "</tbody>" +
        (sk.length ? '<tbody class="pd-section-body pd-section-body-skipped">' + divider("pd-rev-div-skipped", "Items you decided not to promote", sk.length, "The recommendation existed; the planner stepped past it. Metrics use the <strong>no-promo baseline</strong>.") + sk.map((r) => baseRow(r, "decided")).join("") + baseTotalsRow(sk, s2) + "</tbody>" : "") +
        (un.length ? '<tbody class="pd-section-body pd-section-body-unavailable">' + divider("pd-rev-div-unavailable", "Items with no promotion available", un.length, "No live offer in the selected price area — metrics use the <strong>no-promo baseline</strong>.") + un.map((r) => baseRow(r, "unavailable")).join("") + baseTotalsRow(un, s3) + "</tbody>" : "") +
        "</table></div>" +
      '<footer class="pd-review-footer"><button type="button" class="pd-btn-secondary" data-revback>← Back to worklist</button>' +
        '<button type="button" class="pd-btn-primary pd-btn-finalize" data-publish' + (pm.length ? "" : " disabled") + ">Finalise promotions (" + pm.length + ")</button></footer>" +
      "</div>";
  }

  // condensed, full-width plan header for step 5 — the SELECTED strategy only, with the
  // optimized metrics (Sales/Units/AGP) separated from the informational ones (AIV etc.).
  function wkStratBarHTML() {
    const cfV = window.NPViews; if (!cfV || !cfV.cfStrategies) return "";
    const cur = NP.state.cf.strategy || "optimized", ly = lyTotals(), strategies = cfV.cfStrategies();
    const s = strategies.find((x) => x.id === cur) || strategies[0], t = cfV.cfTotals(s.id);
    // PRIMARY uses step-3's exact strat-card classes → identical font sizes/weights/background.
    const met = (lab, cv, lv, money) => { const f = money ? km : NP.fmt.u, d = lv ? (cv - lv) / lv : 0, dd = cv - lv; return '<div class="npv2-strat-m"><span class="npv2-strat-ml">' + lab + '</span><span class="npv2-strat-mv">' + f(cv) + '</span><span class="npv2-strat-md ' + (d >= 0 ? "np-pos" : "np-neg") + '">' + NP.fmt.pct(d) + " · " + (dd >= 0 ? "+" : "") + f(dd) + "</span></div>"; };
    // SECONDARY = smaller focus (own classes).
    const met2 = (lab, cvS, lvS, dcls, dtxt) => '<div class="npv2-hb-m npv2-hb-m2"><span class="npv2-hb-l">' + lab + '</span><span class="npv2-hb-data"><b class="npv2-hb-v2">' + cvS + '</b><span class="npv2-hb-ly">LY ' + lvS + '</span><span class="npv2-hb-d ' + dcls + '">' + dtxt + "</span></span></div>";
    const pc = (() => { let u = 0, listS = 0, fundS = 0; const map = NP.displayMap(); NP.cat().items.forEach((o) => { const res = NP.resultFor(o, map), e = NP.effective(o, map); u += res.units; listS += e.vlc * res.units; fundS += (e.vlc - e.deadNet) * res.units; }); return { listU: u ? listS / u : 0, fundU: u ? fundS / u : 0, fundM: fundS / 1000 }; })();
    const aiv = t.units ? (t.revenueM * 1000) / t.units : 0, lyAiv = ly.u ? (ly.r * 1000) / ly.u : 0, aivD = lyAiv ? (aiv - lyAiv) / lyAiv : 0;
    const lyListU = pc.listU * 0.985, listD = lyListU ? (pc.listU - lyListU) / lyListU : 0;
    const lyFundU = pc.fundU * 0.94, fundD = lyFundU ? (pc.fundU - lyFundU) / lyFundU : 0;
    const rate = t.revenueM ? pc.fundM / t.revenueM : 0, lyRate = ly.r ? (pc.fundM * 0.94) / ly.r : 0, ppd = (rate - lyRate) * 100;
    return '<div class="npv2-hb">' +
      '<div class="npv2-strat is-active npv2-hb-card">' +
        '<span class="npv2-strat-name">' + esc(s.name) + (s.tag ? ' <em>' + esc(s.tag) + "</em>" : "") + "</span>" +
        '<div class="npv2-strat-grid">' + met("Sales", t.revenueM, ly.r, true) + met("Units", t.units, ly.u, false) + met("AGP", t.agpM, ly.a, true) + "</div>" +
      "</div>" +
      '<div class="npv2-hb-pipe"></div>' +
      '<div class="npv2-hb-grp npv2-hb-grp2">' + met2("AIV", "$" + aiv.toFixed(2), "$" + lyAiv.toFixed(2), aivD >= 0 ? "np-pos" : "np-neg", NP.fmt.pct(aivD)) + met2("List $/u", "$" + pc.listU.toFixed(2), "$" + lyListU.toFixed(2), listD >= 0 ? "np-pos" : "np-neg", NP.fmt.pct(listD)) + met2("Funding $/u", "$" + pc.fundU.toFixed(2), "$" + lyFundU.toFixed(2), fundD >= 0 ? "np-pos" : "np-neg", NP.fmt.pct(fundD)) + met2("Spend rate", (rate * 100).toFixed(1) + "%", (lyRate * 100).toFixed(1) + "%", ppd >= 0 ? "np-pos" : "np-neg", (ppd >= 0 ? "+" : "") + ppd.toFixed(1) + "pp") + "</div>" +
      "</div>";
  }

  // --- toolbar (plan header + filter bar with the Week filter inline) ---
  function wkToolsHTML(all) {
    const cats = (NP.state.categoryIds || [NP.state.categoryId]).map((id) => [id, (NP.DATA[id] ? NP.DATA[id].name : id).split(" — ")[0]]);
    const vendors = [...new Set(all.map((o) => o.vendor))].sort();
    const rogs = [...new Set(all.map((o) => o.rog))].sort();
    const clusters = [...new Set(all.map((o) => o.cluster))].map((c) => [c, NP.CLUSTER_LABEL[c] || c]);
    const subs = [...new Set(all.map((o) => o.form))].map((f) => [f, SUBCLASS_LABEL[f] || f]);
    let weekOpts = "";
    for (let w = FIRST_PLAN_WEEK; w <= 52; w++) weekOpts += '<option value="' + w + '"' + (WEEKSEL.week === w ? " selected" : "") + ">" + esc(weekLabel(w)) + "</option>";
    const weekFilter = '<label class="npv2-fg-filter npv2-wk-weekfilter">Week ' +
      '<span class="npv2-wk-wkctl"><button type="button" class="npv2-wk-wknav" data-wkstep="-1"' + (WEEKSEL.week <= FIRST_PLAN_WEEK ? " disabled" : "") + ">‹</button>" +
      '<select id="npV2WkSel">' + weekOpts + "</select>" +
      '<button type="button" class="npv2-wk-wknav" data-wkstep="1"' + (WEEKSEL.week >= 52 ? " disabled" : "") + ">›</button></span></label>";
    // inline flex-nowrap + horizontal scroll is forced here so the filter row can never
    // wrap into extra lines that float over the content (belt-and-suspenders vs CSS specificity).
    return '<div class="npv2-fg-tools npv2-wk-tools">' +
      wkStratBarHTML() +
      '<div class="npv2-fg-trow" style="display:flex!important;flex-wrap:wrap;align-items:center;gap:8px 10px;padding-bottom:2px;">' +
        '<div class="npv2-fg-gl" style="display:flex!important;flex-wrap:nowrap!important;flex:0 1 auto!important;gap:8px;align-items:center;">' + weekFilter + sel("Category", "npV2FgCat", cats, ff.cat, "All categories") + sel("Vendor", "npV2FgVendor", vendors, ff.vendor) + sel("ROG", "npV2FgRog", rogs, ff.rog) + sel("Class", "npV2FgClass", clusters, ff.cls, "All classes") + sel("Sub-class", "npV2FgSub", subs, ff.sub, "All sub-classes") + "</div>" +
        '<div class="npv2-fg-gr" style="display:flex!important;flex-wrap:nowrap!important;flex:0 0 auto!important;gap:8px;align-items:center;margin-left:auto;">' + sortControlsHTML(false) + "</div>" +
      "</div>" +
      '<div class="npv2-rule"></div>' +
      "</div>";
  }

  function renderWeekView() {
    const front = document.getElementById(FRONT); if (!front) return;
    const all = NP.cat().items;
    if (ff.cat !== "all" && !(NP.state.categoryIds || []).includes(ff.cat)) ff.cat = "all";
    if (WEEKSEL.week < FIRST_PLAN_WEEK) WEEKSEL.week = FIRST_PLAN_WEEK;
    const items = frontItems();
    // Review & finalise takes over the whole screen — no strat header / filter bar here.
    if (WKST.review) { front.innerHTML = '<div class="npv2-wk-scroll npv2-wk-takeover">' + reviewHTML() + "</div>"; bindReview(front, items); return; }
    if (!items.length) { front.innerHTML = wkToolsHTML(all) + '<div class="npv2-wk-scroll"><div class="npv2-wk-empty">No NCRCs match the current filters.</div></div>'; bindWkTools(front, items); return; }
    let o = items.find((x) => x.uid === WEEKSEL.uid); if (!o) { o = items[0]; WEEKSEL.uid = o.uid; }
    const week = WEEKSEL.week, pds = paData(o, week), selPa = WKST.selPa || pds[0].pa;
    // Override recommendation also takes over the whole screen — no strat header / filter bar.
    if (WKST.override) { front.innerHTML = '<div class="npv2-wk-scroll npv2-wk-takeover">' + overrideHTML(o, week) + "</div>"; bindOverride(front, o, week, items); return; }
    const tot = pds.reduce((t, pd) => { const c = chosenFor(o, week, pd); return { sales: t.sales + c.sales, units: t.units + c.units, agp: t.agp + c.agp, lsales: t.lsales + pd.ly.sales, lunits: t.lunits + pd.ly.units, lagp: t.lagp + pd.ly.agp }; }, { sales: 0, units: 0, agp: 0, lsales: 0, lunits: 0, lagp: 0 });
    const kpi = (lab, big, cur, ly, money) => '<div class="npv2-wk-kpi"><span class="npv2-wk-kl">' + lab + '</span><b class="npv2-wk-kv">' + big + '</b><span class="npv2-wk-kd ' + (cur >= ly ? "np-pos" : "np-neg") + '">' + NP.fmt.pct(ly ? (cur - ly) / ly : 0) + " vs LY · LY " + (money ? wkM(ly) : wkU(ly)) + "</span></div>";
    const stratName = (window.NPViews && NPViews.cfStratName) ? NPViews.cfStratName(NP.state.cf.strategy) : "Optimized";
    const bm = weekBaseMetrics(o, week), inCart = !!WKCART[cartKey(o, week)];
    const center = '<div class="npv2-wk-recs"><div class="npv2-wk-recshead"><h4>Promo recommendations by price area</h4>' + (bm.promoted ? '<span class="npv2-wk-chip is-ok">✓ Allowance linked</span>' : '<span class="npv2-wk-chip is-off">No promo recommended</span>') + '<span class="npv2-wk-recshint">expand a PA for its alternates, LY actual &amp; no-promo baseline</span></div>' +
        recTableHTML(o, week, pds, selPa) + "</div>";
    front.innerHTML =
      wkToolsHTML(all) +
      '<div class="npv2-wk-scroll"><div class="npv2-wk-body">' +
        '<aside class="npv2-wk-worklist">' + worklistHTML(items, o.uid, week) + "</aside>" +
        '<div class="npv2-wk-center">' +
          '<div class="npv2-wk-mhead">' +
            '<div class="npv2-wk-mtitle"><span class="npv2-wk-eyebrow">' + esc(o.ncrc) + " · " + esc(stratName) + " plan" + (isLocked(week) ? " · LOCKED ACTUAL" : "") + "</span><h3>" + esc(o.item) + " <i>" + esc(o.pack) + "</i></h3><span class=\"npv2-wk-msub\">" + esc(o.vendor) + " · " + esc(weekLabel(week)) + "</span></div>" +
            '<div class="npv2-wk-kpis">' + kpi("Sales", wkM(tot.sales), tot.sales, tot.lsales, true) + kpi("Units", wkU(tot.units), tot.units, tot.lunits, false) + kpi("AGP", wkM(tot.agp), tot.agp, tot.lagp, true) + "</div>" +
          "</div>" + center + "</div>" +
        sidePanelHTML(o, week, pds) +
      "</div></div>" +
      '<footer class="npv2-wk-footer">' +
        '<div class="npv2-wk-fsummary"><span class="npv2-wk-feyebrow">' + (inCart ? "IN BASKET" : "PENDING") + '</span>' +
          "<span><b>" + esc(chosenFor(o, week, pds[0]).label) + "</b> + " + (pds.length - 1) + " more PAs for <b>" + esc(o.ncrc) + "</b>, " + esc(weekLabel(week)) + '</span><span class="npv2-wk-fbin">' + (items.indexOf(o) + 1) + " of " + items.length + " in this view</span></div>" +
        '<div class="npv2-wk-fbtns"><button type="button" class="npv2-wk-fbtn" id="npV2WkSkip">Skip →</button><button type="button" class="npv2-wk-fbtn is-primary" id="npV2WkAdd">' + (inCart ? "Update &amp; next →" : "Add &amp; next →") + '</button><button type="button" class="npv2-wk-fbtn is-finalize" id="npV2WkFinalize"' + (Object.keys(WKCART).length ? "" : " disabled") + ">Review &amp; finalize (" + Object.keys(WKCART).length + ")</button></div>" +
      "</footer>";
    bindWkTools(front, items);
    bindWeekMain(front, items, o, week, pds);
  }

  function bindWeekMain(front, items, o, week, pds) {
    front.querySelectorAll("[data-wl]").forEach((b) => (b.onclick = () => { WEEKSEL.uid = b.dataset.wl; WKST.selPa = null; WKST.override = null; renderWeekView(); }));
    // expand / collapse a PA
    front.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const pa = b.dataset.toggle; WKST.expanded[pa] = !WKST.expanded[pa]; WKST.selPa = pa; renderWeekView(); }));
    // pick an offer (radio)
    front.querySelectorAll("[data-pick]").forEach((tr) => (tr.onclick = () => { const p = tr.dataset.pick.split("|"); WKST.chosen[paKey(o, week, p[0])] = p[1]; WKST.selPa = p[0]; renderWeekView(); }));
    // click a PA summary row → focus it in the side panel
    front.querySelectorAll(".npv2-wk-parow[data-pa]").forEach((tr) => (tr.onclick = (e) => { if (e.target.closest("[data-toggle]")) return; WKST.selPa = tr.dataset.pa; renderWeekView(); }));
    // open the Override recommendation builder (full-screen), jumping to the clicked PA
    front.querySelectorAll("[data-override]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const pa = a.dataset.override; const cust = WKST.custom[paKey(o, week, pa)]; WKST.oform = WKST.oform || freshPromoForm(); WKST.override = true; WKST.manualEditPa = pa; WKST.defaultOpen = false; WKST.manualEditForm = (cust && cust._form) ? Object.assign({}, cust._form) : Object.assign({}, WKST.oform); renderWeekView(); }));
    front.querySelectorAll("[data-ovclear]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const pa = a.dataset.ovclear; delete WKST.custom[paKey(o, week, pa)]; if (WKST.chosen[paKey(o, week, pa)] === "custom-" + pa) delete WKST.chosen[paKey(o, week, pa)]; renderWeekView(); }));
    // side-panel tabs
    front.querySelectorAll("[data-ptab]").forEach((b) => (b.onclick = () => { WKST.tab = b.dataset.ptab; renderWeekView(); }));
    // footer
    const skip = front.querySelector("#npV2WkSkip"); if (skip) skip.onclick = () => advanceWorklist(items, o, week);
    const add = front.querySelector("#npV2WkAdd"); if (add) add.onclick = () => addToCart(o, week, items);
    const fin = front.querySelector("#npV2WkFinalize"); if (fin) fin.onclick = () => { WKST.review = true; renderWeekView(); };
  }

  function bindOverride(front, o, week, items) {
    const back = front.querySelector("[data-ovback]"); if (back) back.onclick = () => { WKST.override = false; WKST.manualEditPa = null; WKST.manualEditForm = null; renderWeekView(); };
    // collapse / expand the DEFAULT (all-price-areas) section
    const defToggle = front.querySelector("[data-oftoggle]"); if (defToggle) defToggle.onclick = () => { WKST.defaultOpen = !WKST.defaultOpen; renderWeekView(); };
    // live-bind a form's fields (default card → WKST.oform; edit panel → WKST.manualEditForm)
    const bindForm = (attr, get) => front.querySelectorAll("[" + attr + "]").forEach((el) => {
      const key = el.getAttribute(attr);
      const h = () => { const f = get(); f[key] = (el.type === "checkbox") ? el.checked : el.value; };
      el.onchange = h;
      if (el.tagName === "INPUT" && el.type !== "checkbox" && el.type !== "radio") el.oninput = h;
    });
    bindForm("data-of", () => (WKST.oform = WKST.oform || freshPromoForm()));
    bindForm("data-of2", () => (WKST.manualEditForm = WKST.manualEditForm || freshPromoForm()));
    // apply the default to every price area that isn't individually customised
    const apply = front.querySelector("[data-ovapply]"); if (apply) apply.onclick = () => {
      paData(o, week).forEach((pd) => { const k = paKey(o, week, pd.pa); if (!WKST.custom[k]) { WKST.custom[k] = customOfferFrom(o, week, pd.pa, WKST.oform); WKST.chosen[k] = "custom-" + pd.pa; } });
      WKST.override = false; WKST.manualEditPa = null; renderWeekView();
    };
    const resetAll = front.querySelector("[data-ovresetall]"); if (resetAll) resetAll.onclick = () => {
      paData(o, week).forEach((pd) => { const k = paKey(o, week, pd.pa); delete WKST.custom[k]; if (WKST.chosen[k] === "custom-" + pd.pa) delete WKST.chosen[k]; });
      renderWeekView();
    };
    // per-PA override / edit / reset from the price-areas table
    front.querySelectorAll("[data-ovedit]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const pa = a.dataset.ovedit, cust = WKST.custom[paKey(o, week, pa)]; WKST.manualEditPa = pa; WKST.manualEditForm = (cust && cust._form) ? Object.assign({}, cust._form) : Object.assign({}, WKST.oform || freshPromoForm()); renderWeekView(); }));
    front.querySelectorAll("[data-ovclear]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const pa = a.dataset.ovclear, k = paKey(o, week, pa); delete WKST.custom[k]; if (WKST.chosen[k] === "custom-" + pa) delete WKST.chosen[k]; renderWeekView(); }));
    const save = front.querySelector("[data-ovsave]"); if (save) save.onclick = () => { const pa = WKST.manualEditPa; if (pa) { const k = paKey(o, week, pa); WKST.custom[k] = customOfferFrom(o, week, pa, WKST.manualEditForm || WKST.oform); WKST.chosen[k] = "custom-" + pa; } WKST.manualEditPa = null; WKST.manualEditForm = null; renderWeekView(); };
    const cancel = front.querySelector("[data-ovcancel]"); if (cancel) cancel.onclick = () => { WKST.manualEditPa = null; WKST.manualEditForm = null; renderWeekView(); };
  }

  function bindReview(front, items) {
    const back = front.querySelector("[data-revback]"); if (back) back.onclick = () => { WKST.review = false; WKST.finalized = null; renderWeekView(); };
    const done = front.querySelector("[data-findone]"); if (done) done.onclick = () => { WKST.review = false; WKST.finalized = null; renderWeekView(); };
    front.querySelectorAll("[data-revmore]").forEach((b) => (b.onclick = () => { const uid = b.dataset.revmore; WKST.reviewExpanded[uid] = !WKST.reviewExpanded[uid]; renderWeekView(); }));
    const pub = front.querySelector("[data-publish]"); if (pub) pub.onclick = () => {
      const keys = Object.keys(WKCART); if (!keys.length) return;
      const t = keys.reduce((a, k) => { const c = WKCART[k]; return { s: a.s + c.sales, u: a.u + c.units, a: a.a + c.agp }; }, { s: 0, u: 0, a: 0 });
      WKST.finalized = { count: keys.length, category: NP.cat().name.split(" — ")[0], week: WEEKSEL.week, sales: wkM(t.s), units: wkU(t.u), agp: wkM(t.a) };
      keys.forEach((k) => delete WKCART[k]);
      renderWeekView();
    };
  }

  function addToCart(o, week, items) {
    const pds = paData(o, week), chosen = pds.map((pd) => chosenFor(o, week, pd));
    const t = chosen.reduce((a, c) => ({ sales: a.sales + c.sales, units: a.units + c.units, agp: a.agp + c.agp }), { sales: 0, units: 0, agp: 0 });
    WKCART[cartKey(o, week)] = { uid: o.uid, week: week, ncrc: o.ncrc, item: o.item, vendor: o.vendor, offer: chosen[0].label, store: chosen[0].storeName, paCount: pds.length, sales: t.sales, units: t.units, agp: t.agp };
    advanceWorklist(items, o, week);
  }
  function advanceWorklist(items, o, week) {
    const idx = items.findIndex((x) => x.uid === o.uid);
    const next = items.slice(idx + 1).find((x) => !WKCART[cartKey(x, week)]) || items[idx + 1] || items[idx];
    WEEKSEL.uid = next.uid; WKST.selPa = null; WKST.override = null; renderWeekView();
  }

  function bindWkTools(front, items) {
    front.querySelectorAll("[data-strat]").forEach((b) => (b.onclick = () => { NP.state.cf.strategy = b.dataset.strat; renderWeekView(); }));
    const moreBtn = front.querySelector("#npV2StratMore"), stratRow = front.querySelector("#npV2Strats");
    if (moreBtn && stratRow) moreBtn.onclick = () => { stratExpanded = !stratExpanded; stratRow.classList.toggle("is-collapsed", !stratExpanded); const others = stratRow.querySelectorAll(".npv2-strat").length - 1; moreBtn.textContent = stratExpanded ? "Hide other scenarios" : "Other scenarios (" + others + ")"; moreBtn.setAttribute("aria-expanded", String(stratExpanded)); };
    const bindSel = (id, key) => { const s = front.querySelector("#" + id); if (s) s.onchange = () => { ff[key] = s.value; renderWeekView(); }; };
    bindSel("npV2FgCat", "cat"); bindSel("npV2FgVendor", "vendor"); bindSel("npV2FgRog", "rog"); bindSel("npV2FgClass", "cls"); bindSel("npV2FgSub", "sub");
    front.querySelectorAll("[data-sortby]").forEach((b) => (b.onclick = () => { ff.sortBy = ff.sortBy === b.dataset.sortby ? null : b.dataset.sortby; renderWeekView(); }));
    front.querySelectorAll("[data-bin]").forEach((b) => (b.onclick = () => { ff.bin = b.dataset.bin; renderWeekView(); }));
    const ws = front.querySelector("#npV2WkSel"); if (ws) ws.onchange = () => { WEEKSEL.week = +ws.value; WKST.selPa = null; WKST.override = null; renderWeekView(); };
    front.querySelectorAll("[data-wkstep]").forEach((b) => (b.onclick = () => { const w = WEEKSEL.week + (+b.dataset.wkstep); if (w >= FIRST_PLAN_WEEK && w <= 52) { WEEKSEL.week = w; WKST.selPa = null; WKST.override = null; renderWeekView(); } }));
  }

  // entry point from the Promotional Calendar week drawer — select the NCRC + week, jump to step 5
  function openWeekView(uid, week) {
    WEEKSEL.uid = uid; WKST.review = false; WKST.override = null; WKST.selPa = null;
    if (week) WEEKSEL.week = Math.max(FIRST_PLAN_WEEK, week);
    if (NP.closeOverlays) NP.closeOverlays();
    NP.goStep(5);
  }

  /* ================================================================ mount / unmount */
  function mount() {
    ensureShell();
    renderToggle();
    renderFront();
    syncFlip();
  }
  function mountWeek() {
    ensureShell();
    renderToggle();
    const back = document.getElementById(MFACE); if (back) back.hidden = true;
    const flipEl = document.getElementById(FLIPEL); if (flipEl) flipEl.classList.remove("is-flipped");
    renderWeekView();
  }
  function unmount() {
    if (!shellExists()) return;
    document.getElementById(SHELL).remove();
    flip = { open: false, m: 0, animating: false };
  }

  window.NPV2 = { mount, mountWeek, unmount, renderToggle, openWeekView };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderToggle);
  else renderToggle();
})();
