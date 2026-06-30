/* National Merchandising — 52-Week Plan Optimiser (super-merchant view)
   Self-contained prototype. Mirrors the real optimiser guide:
   grounded candidate menu, repair-and-score (not re-optimise), learned guardrails,
   AGP = revenue - (units x dead-net cost per unit).                               */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- utils */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round = (v, d = 0) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  const fmtM = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2) + "M";
  const fmtU = (vK) => (vK >= 1000 ? (vK / 1000).toFixed(2) + "M" : Math.round(vK).toLocaleString() + "K");
  const fmtPrice = (v) => "$" + v.toFixed(2);
  const fmtPct = (v, d = 1) => (v >= 0 ? "+" : "") + (v * 100).toFixed(d) + "%";
  const fmtPctPlain = (v, d = 1) => (v * 100).toFixed(d) + "%";

  const CURRENT_WEEK = 7;

  /* ---------------------------------------------------------- seasonality */
  const SEASON = {
    bar: [0.82, 0.80, 0.92, 1.02, 1.12, 1.22, 1.28, 1.24, 1.06, 1.00, 0.96, 1.10],
    bag: [0.86, 0.84, 1.04, 1.16, 1.00, 0.96, 0.94, 0.92, 0.98, 1.30, 1.18, 1.40],
    tub: [0.42, 0.38, 0.46, 0.50, 0.52, 0.54, 0.56, 0.60, 0.78, 1.36, 1.92, 2.66]
  };
  function weeklyCurve(form) { const m = SEASON[form] || SEASON.bar; const wk = []; for (let w = 0; w < 52; w++) { const p = (w / 52) * 12, i = Math.floor(p), f = p - i; wk.push(m[i % 12] + (m[(i + 1) % 12] - m[i % 12]) * f); } return wk; }
  const CURVE = { bar: weeklyCurve("bar"), bag: weeklyCurve("bag"), tub: weeklyCurve("tub") };

  /* ----------------------------------------------------------- catalogue */
  const CONFECTIONERY = [
    { v: "MARS WRIGLEY", n: "SNICKERS SINGLE", brand: "Snickers", form: "bar", pack: "48G", cluster: "singles", bin: 1, hero: true },
    { v: "MARS WRIGLEY", n: "MARS BAR SINGLE", brand: "Mars", form: "bar", pack: "51G", cluster: "singles", bin: 1, hero: true },
    { v: "MARS WRIGLEY", n: "TWIX TWIN", brand: "Twix", form: "bar", pack: "50G", cluster: "singles", bin: 2 },
    { v: "MARS WRIGLEY", n: "BOUNTY", brand: "Bounty", form: "bar", pack: "57G", cluster: "singles", bin: 3 },
    { v: "MARS WRIGLEY", n: "MALTESERS POUCH", brand: "Maltesers", form: "bag", pack: "102G", cluster: "sharingbag", bin: 2 },
    { v: "MARS WRIGLEY", n: "MALTESERS TUB", brand: "Maltesers", form: "tub", pack: "440G", cluster: "tubs", bin: 2 },
    { v: "MARS WRIGLEY", n: "CELEBRATIONS TUB", brand: "Celebrations", form: "tub", pack: "600G", cluster: "tubs", bin: 1 },
    { v: "MARS WRIGLEY", n: "M&M'S PEANUT", brand: "M&M's", form: "bag", pack: "139G", cluster: "sharingbag", bin: 2 },
    { v: "MONDELEZ", n: "CADBURY DAIRY MILK", brand: "Cadbury", form: "bar", pack: "45G", cluster: "singles", bin: 1 },
    { v: "MONDELEZ", n: "CADBURY WISPA", brand: "Cadbury", form: "bar", pack: "36G", cluster: "singles", bin: 3 },
    { v: "MONDELEZ", n: "TOBLERONE", brand: "Toblerone", form: "bar", pack: "100G", cluster: "singles", bin: 3 },
    { v: "MONDELEZ", n: "CADBURY ROSES TUB", brand: "Roses", form: "tub", pack: "600G", cluster: "tubs", bin: 1 },
    { v: "MONDELEZ", n: "CADBURY HEROES TUB", brand: "Heroes", form: "tub", pack: "600G", cluster: "tubs", bin: 1 },
    { v: "NESTLE", n: "KITKAT 4 FINGER", brand: "KitKat", form: "bar", pack: "41G", cluster: "singles", bin: 1 },
    { v: "NESTLE", n: "AERO MILK", brand: "Aero", form: "bar", pack: "36G", cluster: "singles", bin: 3 },
    { v: "NESTLE", n: "SMARTIES", brand: "Smarties", form: "bag", pack: "120G", cluster: "sharingbag", bin: 3 },
    { v: "NESTLE", n: "QUALITY STREET TUB", brand: "Quality Street", form: "tub", pack: "600G", cluster: "tubs", bin: 1 },
    { v: "HERSHEY", n: "REESE'S CUPS", brand: "Reese's", form: "bar", pack: "42G", cluster: "singles", bin: 2 },
    { v: "HERSHEY", n: "HERSHEY'S MILK BAR", brand: "Hershey's", form: "bar", pack: "43G", cluster: "singles", bin: 3 },
    { v: "OWN BRANDS", n: "OWN LABEL MILK BAR", brand: "Own Label", form: "bar", pack: "100G", cluster: "singles", bin: 2 },
    { v: "OWN BRANDS", n: "OWN LABEL SHARING BAG", brand: "Own Label", form: "bag", pack: "180G", cluster: "sharingbag", bin: 2 }
  ];
  const SOFTDRINKS = [
    { v: "COCA COLA CO", n: "COCA COLA CLASSIC 12PK", brand: "Coca-Cola", form: "bag", pack: "12-12FZ", cluster: "cola", bin: 1, hero: true },
    { v: "COCA COLA CO", n: "COCA COLA ZERO 12PK", brand: "Coca-Cola", form: "bag", pack: "12-12FZ", cluster: "cola", bin: 1 },
    { v: "COCA COLA CO", n: "SPRITE 2L", brand: "Sprite", form: "bar", pack: "2L PET", cluster: "lemonlime", bin: 3 },
    { v: "PEPSICO INC", n: "PEPSI MAX 12PK", brand: "Pepsi", form: "bag", pack: "12-12FZ", cluster: "cola", bin: 1 },
    { v: "PEPSICO INC", n: "MOUNTAIN DEW 2L", brand: "Mtn Dew", form: "bar", pack: "2L PET", cluster: "lemonlime", bin: 2 },
    { v: "KEURIG DR PEPPER", n: "DR PEPPER 12PK", brand: "Dr Pepper", form: "bag", pack: "12-12FZ", cluster: "cola", bin: 2 },
    { v: "OWN BRANDS", n: "REFRESHE COLA 2L", brand: "Own Label", form: "bar", pack: "2L PET", cluster: "cola", bin: 3 }
  ];
  const CATEGORIES = [
    { id: "confectionery", name: "Confectionery — Bars, Bags & Tubs", items: CONFECTIONERY, seed: 4021 },
    { id: "softdrinks", name: "Carbonated Soft Drinks", items: SOFTDRINKS, seed: 7720 }
  ];
  const CLUSTER_LABEL = { singles: "Singles / impulse bars", sharingbag: "Sharing bags & pouches", tubs: "Sharing tubs", cola: "Cola & dark sodas", lemonlime: "Lemon-lime & flavours" };

  /* Divisions — the national plan is built for a division (or the national roll-up).
     Each division is a share of national demand; selecting one scopes every forecast
     proportionally (bins, deltas and tactics are unchanged — only the absolute scale). */
  const DIVISIONS = [
    { id: "national", name: "National roll-up (all divisions)", short: "National", factor: 1.0 },
    { id: "northeast", name: "Northeast Division", short: "Northeast", factor: 0.225 },
    { id: "southeast", name: "Southeast Division", short: "Southeast", factor: 0.205 },
    { id: "midwest", name: "Midwest Division", short: "Midwest", factor: 0.24 },
    { id: "southwest", name: "Southwest Division", short: "Southwest", factor: 0.155 },
    { id: "west", name: "West Division", short: "West", factor: 0.205 }
  ];

  // ROG = Receiver of Goods — 4-letter receiving-location codes (a filter peer to vendor).
  const ROGS = ["NCAL", "SCAL", "PNWE", "INMT", "DNVR", "EAST"];

  const BIN_UNITS = { 1: 1180, 2: 690, 3: 380, 4: 210 };
  const FORM_LIFT = { bar: 0.62, bag: 0.74, tub: 1.55 };
  const FORM_HHRATE = { bar: 0.34, bag: 0.52, tub: 0.78 };

  // allowance ladder build-up (fractions of VLC): VLC = Σ allowances + dead-net.
  const BUY_KEYS = ["offInvoice", "billBack", "priceBreak"];
  const FREIGHT_KEYS = ["freight"];
  const RETAIL_KEYS = ["scan", "shipToStore", "newItem"];   // header flat is NOT here — it's a separate flat fee, not part of the per-unit promo cost
  const LADDER_KEYS = BUY_KEYS.concat(FREIGHT_KEYS, RETAIL_KEYS);

  function enrich(cat) {
    const rng = mulberry32(cat.seed); let ncrcSeq = 30000;
    const items = cat.items.map((it, idx) => {
      const baseUnitsK = BIN_UNITS[it.bin] * (0.85 + rng() * 0.3);
      const basePrice = it.form === "tub" ? round(4.2 + rng() * 3.4, 2) : it.form === "bag" ? round(2.1 + rng() * 1.6, 2) : round(0.99 + rng() * 0.9, 2);
      const vlc = round(basePrice * (0.52 + rng() * 0.12), 2);
      const lyDepth = round(0.28 + rng() * 0.14, 3);
      const recDepth = round(clamp(lyDepth - (0.02 + rng() * 0.06), 0.12, 0.38), 3);
      const lyEvents = Math.round(it.form === "tub" ? 6 + rng() * 4 : 10 + rng() * 10);
      const recEvents = Math.round(clamp(lyEvents - (it.form === "tub" ? 0 : 2) + (rng() * 4 - 2), it.form === "tub" ? 4 : 6, it.form === "tub" ? 12 : 22));
      const ladder = { offInvoice: round(0.22 + rng() * 0.12, 3), billBack: round(0.015 + rng() * 0.02, 3), priceBreak: round(rng() * 0.02, 3), freight: round(0.012 + rng() * 0.008, 3), scan: round(0.03 + rng() * 0.03, 3), shipToStore: round(0.01 + rng() * 0.02, 3), newItem: round(0.005 + rng() * 0.015, 3) };
      const headerFlat = round(0.5 + rng() * 2, 2);   // flat $ per store/week — separate from the per-unit promo cost
      return { uid: cat.id + "-" + idx, ncrc: "NCRC " + (ncrcSeq += 7 + Math.floor(rng() * 5)), item: it.n, brand: it.brand, vendor: it.v, rog: ROGS[hashStr(cat.id + "-" + idx) % ROGS.length], form: it.form, pack: it.pack, cluster: it.cluster, hero: !!it.hero, bin: it.bin, baseUnitsK, basePrice, vlc, lyDepth, recDepth, lyEvents, recEvents, ladder, headerFlat, liftCoef: FORM_LIFT[it.form] * (0.85 + rng() * 0.3), hhRate: FORM_HHRATE[it.form] * (0.9 + rng() * 0.2) };
    });
    return { id: cat.id, name: cat.name, items };
  }
  const DATA = {}; CATEGORIES.forEach((c) => { DATA[c.id] = enrich(c); });

  /* --------------------------------------------------------- response model */
  function deadNetOf(o) { const l = o.ladder; return round(o.vlc * (1 - LADDER_KEYS.reduce((s, k) => s + (l[k] || 0), 0)), 3); }
  function promoPriceOf(o, depth) { return round(o.basePrice * (1 - depth), 2); }
  function respond(o, opts) {
    const events = clamp(opts.events, 0, 40), depth = clamp(opts.depth, 0, 0.6);
    const deadNet = opts.deadNet != null ? opts.deadNet : deadNetOf(o);
    const seasonGain = opts.seasonGain != null ? opts.seasonGain : 1.0, cannib = opts.cannib != null ? opts.cannib : 0, halo = opts.halo != null ? opts.halo : 0;
    const baseWeeklyK = o.baseUnitsK / 52 * divisionFactor(), pull = 1 - 0.004 * events, dip = 1 - 0.0032 * events;
    const lift = o.liftCoef * depth * pull * seasonGain;
    const promoUnits = events * baseWeeklyK * (1 + lift), baseUnits = (52 - events) * baseWeeklyK * dip;
    const units = (promoUnits + baseUnits) * (1 - cannib) * (1 + halo);
    const promoPrice = promoPriceOf(o, depth);
    const revenue = (baseUnits * (1 - cannib) * o.basePrice + promoUnits * (1 - cannib) * promoPrice) * (1 + halo);
    const agp = revenue - units * deadNet;
    return { units, revenueM: revenue / 1000, agpM: agp / 1000, hhK: units * o.hhRate, promoPrice, deadNet };
  }
  function applyLadder(o, ov) { if (!ov || (!ov.ladder && ov.vlc == null)) return o; return Object.assign({}, o, { vlc: ov.vlc != null ? ov.vlc : o.vlc, ladder: Object.assign({}, o.ladder, ov.ladder) }); }
  function defDigEvents(o) { return Math.round(o.recEvents * 0.65); }
  function defBothEvents(o) { return Math.round(o.recEvents * 0.40); }
  function defDeepEvents(o) { return Math.round(o.recEvents * 0.35); }
  function defDeepDigEvents(o) { return Math.round(defDigEvents(o) * 0.5); }
  function defDeepBothEvents(o) { return Math.round(defBothEvents(o) * 0.5); }
  function effective(o, map) {
    const ov = (map && map[o.uid]) || {}; const merged = applyLadder(o, ov);
    const deadNet = ov.deadNetTouched ? ov.deadNet : deadNetOf(merged);
    return {
      events: ov.events != null ? ov.events : o.recEvents, digEvents: ov.digEvents != null ? ov.digEvents : defDigEvents(o), bothEvents: ov.bothEvents != null ? ov.bothEvents : defBothEvents(o),
      deepEvents: ov.deepEvents != null ? ov.deepEvents : defDeepEvents(o), deepDigEvents: ov.deepDigEvents != null ? ov.deepDigEvents : defDeepDigEvents(o), deepBothEvents: ov.deepBothEvents != null ? ov.deepBothEvents : defDeepBothEvents(o),
      deadNet: deadNet, deepDeadNet: ov.deepDeadNet != null ? ov.deepDeadNet : round(deadNet * 0.86, 3),
      headerFlat: ov.headerFlat != null ? ov.headerFlat : o.headerFlat,
      depth: o.recDepth, vlc: merged.vlc, ladder: merged.ladder
    };
  }
  function resultFor(o, map) { const e = effective(o, map); return respond(o, { events: e.events, depth: e.depth, deadNet: e.deadNet, seasonGain: 1.06, cannib: 0.05, halo: 0.064 }); }
  function lyResult(o) { return respond(o, { events: o.lyEvents, depth: o.lyDepth, seasonGain: 0.93, cannib: 0.14, halo: 0 }); }
  function noPromoResult(o) { return respond(o, { events: 0, depth: 0, seasonGain: 1.0, cannib: 0, halo: 0 }); }

  /* ----------------------------------------------------- tactics / offers */
  const STORE_TACTICS = { ID: { name: "Item Discount", code: "ID", className: "item" }, BXGX: { name: "Buy X Get X", code: "BXGX", className: "bxgx" }, MB: { name: "Must Buy", code: "MB", className: "mb" }, NONE: { name: "No store promo", code: "~", className: "none" } };
  const DIGITAL_NAMES = { ID: "Item Discount", MB: "Must Buy", BXGX: "Buy X Get X", BXGY: "Buy X Get Y", F5: "Fab 5", MD: "Meal Deal", WOD: "WOD/POD", CONT: "Continuity", PERS: "Personalized" };
  // offer "mechanic" = how the deal is expressed. Per tactic (a→d order matches the legend):
  //   ID:   $ off, % off, $ price point        BXGX/MB: % off, $ off, free, $ price point
  const MECH_LABEL = { poff: "% off", doff: "$ off", pp: "price point", free: "Free" };
  const OFFERS = [
    { id: "id-doff", label: "$1 Off", store: "ID", mech: "doff", digital: "ID", depth: 0.18 },
    { id: "id-poff", label: "20% Off", store: "ID", mech: "poff", digital: "PERS", depth: 0.20 },
    { id: "id-pp", label: "2 for $5", store: "ID", mech: "pp", digital: "MD", depth: 0.20 },
    { id: "bxgx-poff", label: "BOGO 50%", store: "BXGX", mech: "poff", digital: "MB", depth: 0.25 },
    { id: "bxgx-free", label: "B1G1 Free", store: "BXGX", mech: "free", digital: "F5", depth: 0.40 },
    { id: "bxgx-doff", label: "B1G1 $1 Off", store: "BXGX", mech: "doff", digital: null, depth: 0.30 },
    { id: "mb-poff", label: "Buy 2 Save 20%", store: "MB", mech: "poff", digital: "MB", depth: 0.22 },
    { id: "mb-doff", label: "Buy 2 Save $2", store: "MB", mech: "doff", digital: null, depth: 0.24 },
    { id: "mb-pp", label: "3 for $6", store: "MB", mech: "pp", digital: "CONT", depth: 0.20 }
  ];
  const DEPTH_LADDER = [0, 0.05, 0.10, 0.15, 0.20, 0.30, 0.40];
  function snapDepth(d) { let best = DEPTH_LADDER[0], bd = 9; DEPTH_LADDER.forEach((x) => { const e = Math.abs(x - d); if (e < bd) { bd = e; best = x; } }); return best; }
  function displayTactic(code) { return code === "ID" ? "Id" : code === "BXGX" ? "BxGx" : code === "MB" ? "MB" : ""; }
  // compact in-cell token for an offer's mechanic (full label lives in the tooltip / drawer)
  function offerValueShort(o, offer, depth) {
    if (!offer) return "";
    if (offer.mech === "poff") return Math.round(depth * 100) + "%";
    if (offer.mech === "free") return "FREE";
    if (offer.mech === "doff") { const d = o.basePrice * depth; return d < 1 ? Math.round(d * 100) + "¢" : "$" + (d < 3 ? d.toFixed(1) : Math.round(d)); }
    if (offer.mech === "pp") { const p = promoPriceOf(o, depth); return p < 1 ? "@$" + p.toFixed(1).slice(1) : "@$" + Math.round(p); }
    return "";
  }

  function rankedWeeks(form) { const c = CURVE[form] || CURVE.bar; return c.map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).map((p) => p[0]); }
  function pickWeeks(form, events, phase) {
    const order = rankedWeeks(form);
    if (phase === "even") { const out = []; for (let i = 1; i < order.length && out.length < events; i += 2) out.push(order[i]); for (let i = 0; i < order.length && out.length < events; i += 2) out.push(order[i]); return new Set(out); }
    if (phase === "shift") { const shifted = order.map((w) => (w + 5) % 52); return new Set(shifted.slice(0, events)); }
    return new Set(order.slice(0, events));
  }

  /* -------- interaction-aware 52-week scheduling (the optimiser's real placement) --------
     Models the two learned effects directly in the plan:
       • Cannibalisation — items in the SAME cluster are rivals, so they are staggered onto
         different weeks. The one unavoidable seasonal peak they both want is shared with
         offset depths (deepen the lead item, soften the rival).
       • Halo — complementary items (same priority rank across DIFFERENT clusters) are
         co-promoted on shared anchor weeks (key retail events) to capture attach lift.
     The interactions panel reads this same plan, so it is a literal readout of the grid. */
  function clusterSort(members) {
    return members.slice().sort((a, b) => (a.hero !== b.hero ? (a.hero ? -1 : 1) : (a.bin - b.bin || a.uid.localeCompare(b.uid))));
  }
  function rankedClustersOf(cat) {
    const m = {}; cat.items.forEach((o) => { (m[o.cluster] = m[o.cluster] || []).push(o); });
    Object.keys(m).forEach((k) => { m[k] = clusterSort(m[k]); });
    return m;
  }
  function coPromoAnchors() {
    const out = [], seen = {};
    RETAIL_EVENTS.map((e) => e.wk - 1).concat(rankedWeeks("bar")).forEach((w) => { if (!seen[w]) { seen[w] = 1; out.push(w); } });
    return out;
  }
  function buildSchedule(cat, map) {
    const ranked = rankedClustersOf(cat), clusters = Object.keys(ranked);
    const nRanks = Math.max.apply(null, clusters.map((k) => ranked[k].length));
    const anchors = coPromoAnchors(), HALO_PER = 2, sched = {};
    const evOf = (m) => effective(m, map).events;
    // 1. halo anchors aligned by rank → same rank in different clusters co-promotes; different rank never collides
    clusters.forEach((k) => ranked[k].forEach((m, r) => {
      const ev = evOf(m), s = sched[m.uid] = { weeks: new Set(), offset: {}, rank: r, cluster: k };
      for (let j = 0; j < HALO_PER; j++) { const idx = r + j * nRanks; if (idx < anchors.length && s.weeks.size < ev) s.weeks.add(anchors[idx]); }
    }));
    // 2. within each cluster: one shared seasonal peak (depths offset), then stagger the rest
    clusters.forEach((k) => {
      const members = ranked[k], order = rankedWeeks(members[0].form);
      if (members.length >= 2) {
        const peak = order[0], t = members[0], s2 = members[1];
        sched[t.uid].weeks.add(peak); sched[t.uid].offset[peak] = 0.38;
        sched[s2.uid].weeks.add(peak); sched[s2.uid].offset[peak] = 0.12;
      }
      const used = new Set(); members.forEach((m) => sched[m.uid].weeks.forEach((w) => used.add(w)));
      let oi = 0;
      while (members.some((m) => sched[m.uid].weeks.size < evOf(m)) && oi < order.length) {
        const w = order[oi++];
        if (used.has(w)) continue; // keep rivals on different weeks
        const cand = members.filter((m) => sched[m.uid].weeks.size < evOf(m));
        if (!cand.length) break;
        cand.sort((a, b) => (evOf(a) - sched[a.uid].weeks.size) - (evOf(b) - sched[b.uid].weeks.size));
        const target = cand[cand.length - 1]; // greatest remaining need
        sched[target.uid].weeks.add(w); used.add(w);
      }
    });
    return sched;
  }
  let _schedCache = null;
  function scheduleFor(cat, map) {
    const key = cat.id + "|" + cat.items.map((o) => effective(o, map).events).join(",");
    if (_schedCache && _schedCache.key === key) return _schedCache.sched;
    _schedCache = { key, sched: buildSchedule(cat, map) };
    return _schedCache.sched;
  }
  function rankedClusters(catId) { return rankedClustersOf(DATA[catId || state.categoryId]); }

  // 52-week tactic plan for an NCRC (optimised). 'ly' => last-year placement/posture.
  function weekPlan(o, map, ly) {
    const e = ly ? { events: o.lyEvents, depth: o.lyDepth } : effective(o, map);
    const h = hashStr(o.uid);
    let weeks, offset = {};
    if (ly) { weeks = pickWeeks(o.form, e.events, "shift"); }
    else { const s = scheduleFor(DATA[o.uid.split("-")[0]], map)[o.uid] || { weeks: new Set(), offset: {} }; weeks = s.weeks; offset = s.offset; }
    const arr = [];
    for (let w = 0; w < 52; w++) {
      const promoted = weeks.has(w), locked = w < CURRENT_WEEK;
      let store = STORE_TACTICS.NONE, digital = [], offer = null, depth = 0;
      if (promoted) {
        offer = OFFERS[(w + h) % OFFERS.length];
        store = STORE_TACTICS[offer.store];
        depth = offset[w] != null ? offset[w] : snapDepth((offer.depth + e.depth) / 2);
        if (!ly && offer.digital && ((w + o.bin) % 2 === 0)) { digital = [offer.digital]; if ((w + h) % 3 === 0) digital.push("PERS"); }
        if (ly && (w % 2 === 0)) digital = ["ID"];
      }
      arr.push({ week: w + 1, locked, promoted, store, digital, offer, depth, mech: promoted && offer ? offer.mech : null, val: promoted ? offerValueShort(o, offer, depth) : "" });
    }
    return arr;
  }
  // weekly allowance + metric trend for flip card
  function weeklyTrend(o, map) {
    const e = effective(o, map), l = e.ladder, vlc = e.vlc;
    const curve = CURVE[o.form] || CURVE.bar, sumC = curve.reduce((a, b) => a + b, 0);
    const plan = resultFor(o, map), ly = lyResult(o);
    const rows = [];
    for (let w = 0; w < 52; w++) {
      const wob = 1 + Math.sin((w / 52) * Math.PI * 4 + hashStr(o.uid)) * 0.06;
      rows.push({
        week: w + 1,
        offInvoice: l.offInvoice * wob, totalBuying: (l.offInvoice + l.billBack + l.priceBreak) * wob, totalRetail: RETAIL_KEYS.reduce((s, k) => s + (l[k] || 0), 0) * wob,
        deadNet: deadNetOf(applyLadder(o, { vlc, ladder: { offInvoice: l.offInvoice * wob } })),
        units: plan.units * (curve[w] / sumC), lyUnits: ly.units * (curve[w] / sumC)
      });
    }
    return rows;
  }

  // key retail/seasonal events (week index 0-51) — drives confectionery demand
  const RETAIL_EVENTS = [
    { wk: 4, label: "Super Bowl", short: "SB" },
    { wk: 6, label: "Valentine's", short: "VAL" },
    { wk: 13, label: "Easter", short: "EAS" },
    { wk: 20, label: "Memorial Day", short: "MEM" },
    { wk: 26, label: "July 4th", short: "JUL4" },
    { wk: 35, label: "Labor Day", short: "LAB" },
    { wk: 39, label: "Back to School", short: "BTS" },
    { wk: 43, label: "Halloween", short: "HALLO" },
    { wk: 46, label: "Thanksgiving", short: "THX" },
    { wk: 50, label: "Christmas", short: "XMAS" }
  ];

  // quintile bins (1 = top) per metric, across the category
  function binsFor(catId) {
    const c = DATA[catId || state.categoryId], items = c.items, n = items.length, res = {};
    items.forEach((o) => { res[o.uid] = {}; });
    const assign = (key, valFn) => { items.slice().sort((a, b) => valFn(b) - valFn(a)).forEach((o, i) => { res[o.uid][key] = Math.min(5, Math.floor(i / (n / 5)) + 1); }); };
    const base = (o) => resultFor(o, {});
    assign("sales", (o) => base(o).revenueM); assign("units", (o) => base(o).units); assign("agp", (o) => base(o).agpM); assign("velocity", (o) => base(o).units / 52);
    return res;
  }

  // per-week series (this plan vs LY) for the flip-card sparklines
  function weeklySeries(o, map) {
    const curve = CURVE[o.form] || CURVE.bar, sumC = curve.reduce((a, b) => a + b, 0);
    const plan = resultFor(o, map), ly = lyResult(o), e = effective(o, map), l = e.ladder, wk = weekPlan(o, map, false), wkLy = weekPlan(o, null, true);
    const pU = [], pS = [], pA = [], lU = [], lS = [], lA = [], al = [], vc = [], dc = [];
    for (let w = 0; w < 52; w++) {
      const frac = curve[w] / sumC, ph = hashStr(o.uid);
      pU.push(plan.units * frac * (wk[w].promoted ? 1.7 : 0.82));
      pS.push(plan.revenueM * frac * (wk[w].promoted ? 1.55 : 0.86));
      pA.push(plan.agpM * frac * (wk[w].promoted ? 1.4 : 0.9));
      lU.push(ly.units * frac * (wkLy[w].promoted ? 1.5 : 0.9));
      lS.push(ly.revenueM * frac * (wkLy[w].promoted ? 1.45 : 0.92));
      lA.push(ly.agpM * frac * (wkLy[w].promoted ? 1.3 : 0.94));
      al.push(LADDER_KEYS.reduce((s, k) => s + (l[k] || 0), 0) * (1 + Math.sin((w / 52) * Math.PI * 4 + ph) * 0.06));
      vc.push(e.vlc * (1 + Math.sin((w / 52) * Math.PI * 3 + ph) * 0.03 + Math.sin(w * 0.6) * 0.012));
      dc.push(e.deadNet * (1 + Math.sin((w / 52) * Math.PI * 3.5 + ph) * 0.04 + Math.sin(w * 0.5) * 0.014));
    }
    const norm = (a, t) => { const s = a.reduce((x, y) => x + y, 0) || 1; return a.map((x) => x * t / s); };
    return { plan, ly, units: norm(pU, plan.units), sales: norm(pS, plan.revenueM), agp: norm(pA, plan.agpM), lyUnits: norm(lU, ly.units), lySales: norm(lS, ly.revenueM), lyAgp: norm(lA, ly.agpM), allow: al, vlc: vc, dnc: dc };
  }

  /* ------------------------------------------------------------- guardrails */
  const GUARDRAIL_GROUPS = [
    { group: "Profit & margin", items: [
      { key: "profitFloor", name: "Profit Protection Floor", charge: "Promos whose profit rate drops below the category's learnt floor", in: "$", cat: true, danger: "Chasing units, the optimiser slashes a staple so deep it sells volume at a loss.", value: "Floor 22.5% AGP" },
      { key: "allowanceFloor", name: "Allowance Floor", charge: "Promos where vendor allowance covers too little of the deal", in: "$", danger: "Deep promos with thin trade support — the store carries the margin.", value: "≥ 55% deal funded" },
      { key: "bleeder", name: "Bleeder Protection", charge: "Projected profit drop on items that drain profit when promoted", in: "$", danger: "'Bleeder' items get promoted and leak profit unnoticed.", value: "drained-profit items" }
    ] },
    { group: "Vendor funding", items: [
      { key: "funding", name: "Funding Guardrail", charge: "The unfunded markdown — deal cost the vendor does not cover", in: "$", danger: "The store pays for discounts the vendor was meant to fund (e.g. $0.70/unit).", value: "$0.00 unfunded target" },
      { key: "minCommit", name: "Vendor Min Commitment", charge: "Spend below the vendor's committed minimum", in: "$", danger: "We under-deliver agreed vendor programs.", value: "≥ committed minimum" },
      { key: "fundingBand", name: "Vendor Funding Band", charge: "Spend that strays outside the vendor's normal band", in: "$", danger: "Trade spend swings far above or below plan.", value: "within ±15% of plan" },
      { key: "fundingRamp", name: "Vendor Funding Ramp", charge: "Big week-over-week jumps in vendor spend", in: "$", danger: "Lumpy, hard-to-manage trade spend.", value: "≤ 20% wk/wk" }
    ] },
    { group: "Price image & shopper trust", items: [
      { key: "priceImage", name: "Price Image Corridor", charge: "When a key-value item's price leaves its expected band", in: "Points", danger: "KVI prices wander, eroding the 'low price' perception shoppers rely on.", value: "KVI ±8%" },
      { key: "promoPacing", name: "Promo Pacing", charge: "A steady charge that grows with discount depth", in: "Points", formula: "depth × 5", danger: "Items promoted constantly and deeply — shoppers learn to only buy on deal.", value: "depth × 5" },
      { key: "deepWeekGap", name: "Deep-Week Gap", charge: "Deep weeks placed too close together", in: "Points", danger: "Back-to-back deep weeks pull demand forward and erode the baseline.", value: "≥ 3 wks apart" },
      { key: "depthVol", name: "Depth Volatility", charge: "Big swings in depth week to week", in: "Points", formula: "depth² × 8", danger: "Prices whipsaw (10%, 40%, 5%…), confusing shoppers.", value: "depth² × 8" },
      { key: "deepRisk", name: "Deep Discount Risk", charge: "A sharp brake on discounts past ~35%", in: "Points", danger: "Very deep discounts that rarely pay back.", value: "brake past 35%" }
    ] },
    { group: "Category & ad space", items: [
      { key: "catIntensity", name: "Category Intensity", charge: "When too much of a category is on deal in one week", in: "$", cat: true, danger: "A whole category on promo at once — it cannibalises itself and trains shoppers.", value: "≤ 32% on deal / wk" },
      { key: "adCapacity", name: "Ad Capacity", charge: "When the circular / front page is over capacity", in: "Points", danger: "More features than the ad can physically hold.", value: "per price area / wk" },
      { key: "crossPacing", name: "Cross-Item Pacing", charge: "Many deep items crowded into the same window", in: "Points", danger: "Too many deep deals stacked in the same week.", value: "spacing applied" }
    ] },
    { group: "Item interaction effects", items: [
      { key: "subPacing", name: "Substitute Pacing", charge: "Too many deep weeks within a group of substitutes", in: "Points", off: true, danger: "Close substitutes all run deep at once.", value: "off by default" },
      { key: "complement", name: "Complement Control", charge: "Deep stacking of items bought together", in: "$", off: true, danger: "Margin given away on complementary items at the same time.", value: "off by default" },
      { key: "leader", name: "Leader Protection", charge: "Projected revenue drop on a category leader", in: "$", danger: "The item that anchors the category gets eroded.", value: "leaders protected" }
    ] },
    { group: "Protecting the other goals", items: [
      { key: "crossUnits", name: "Cross-Units Floor", charge: "Projected drop in units vs. no-promo", in: "Units", danger: "A profit or sales plan that quietly sheds unit volume.", value: "≥ no-promo units" },
      { key: "crossRev", name: "Cross-Revenue Floor", charge: "Projected drop in revenue vs. no-promo", in: "$", danger: "A units or profit plan that quietly sheds sales dollars.", value: "≥ no-promo revenue" },
      { key: "crossAgp", name: "Cross-AGP Floor", charge: "Projected drop in profit vs. no-promo", in: "$", danger: "A units or sales plan that bleeds margin.", value: "≥ no-promo AGP" },
      { key: "painBudget", name: "Pain Budget", charge: "Excessive revenue loss on items allowed to be loss-leaders", in: "$", danger: "Too much sacrificed on loss-leaders.", value: "capped per item" }
    ] }
  ];
  function guardrailCount() { return GUARDRAIL_GROUPS.reduce((n, g) => n + g.items.length, 0); }
  function findGuardrail(key) { for (const g of GUARDRAIL_GROUPS) for (const it of g.items) if (it.key === key) return it; return null; }

  // flagged NCRCs per guardrail (drill-down). Deterministic, value depends on charge unit.
  function flaggedFor(key) {
    const items = cat().items.slice();
    const margin = (o) => 1 - deadNetOf(o) / o.basePrice;
    const byMarginAsc = items.slice().sort((a, b) => margin(a) - margin(b));
    const heroes = items.filter((o) => o.hero || o.bin === 1);
    const deep = items.slice().sort((a, b) => b.recDepth - a.recDepth);
    const mk = (o, value) => ({ ncrc: o.ncrc, vendor: o.vendor, item: o.item, value });
    switch (key) {
      case "bleeder": return byMarginAsc.slice(0, 7).map((o) => mk(o, "$" + (0.05 + (1 - margin(o)) * 0.4).toFixed(2) + "/unit drain"));
      case "profitFloor": return byMarginAsc.slice(0, 5).map((o) => mk(o, fmtPctPlain(margin(o)) + " AGP (floor 22.5%)"));
      case "leader": return heroes.slice(0, 4).map((o) => mk(o, fmtM(resultFor(o, displayMap()).revenueM) + " anchored"));
      case "priceImage": return heroes.slice(0, 5).map((o) => mk(o, "KVI ±" + (5 + (hashStr(o.uid) % 5)) + "%"));
      case "allowanceFloor": case "funding": return items.filter((o) => o.ladder.offInvoice < 0.26).slice(0, 6).map((o) => mk(o, "$" + (0.04 + (0.26 - o.ladder.offInvoice)).toFixed(2) + "/unit gap"));
      case "promoPacing": case "deepRisk": case "depthVol": return deep.slice(0, 6).map((o) => mk(o, fmtPctPlain(o.recDepth, 0) + " depth · " + o.recEvents + " events"));
      case "deepWeekGap": case "crossPacing": return deep.slice(0, 5).map((o) => mk(o, o.recEvents + " events / yr"));
      case "minCommit": case "fundingBand": case "fundingRamp": return items.filter((o, i) => i % 4 === 1).slice(0, 5).map((o) => mk(o, "$" + (resultFor(o, displayMap()).revenueM * 0.12).toFixed(2) + "M spend"));
      case "subPacing": case "complement": { const cl = {}; items.forEach((o) => { (cl[o.cluster] = cl[o.cluster] || []).push(o); }); const big = Object.keys(cl).sort((a, b) => cl[b].length - cl[a].length)[0]; return (cl[big] || []).slice(0, 6).map((o) => mk(o, CLUSTER_LABEL[o.cluster])); }
      case "crossUnits": return items.slice(0, 4).map((o) => mk(o, fmtU(noPromoResult(o).units) + " floor"));
      case "crossRev": return items.slice(2, 6).map((o) => mk(o, fmtM(noPromoResult(o).revenueM) + " floor"));
      case "crossAgp": return items.slice(1, 5).map((o) => mk(o, fmtM(noPromoResult(o).agpM) + " floor"));
      case "painBudget": return byMarginAsc.slice(0, 3).map((o) => mk(o, "loss-leader cap"));
      default: return []; // plan-level (adCapacity, catIntensity) — no per-NCRC list
    }
  }

  /* --------------------------------------------------------------- state */
  const OBJECTIVES = [
    { id: "sales", label: "Sales", short: "Sales", metric: "revenueM", fmtName: "Sales" },
    { id: "units", label: "Units", short: "Units", metric: "units", fmtName: "Units" },
    { id: "agp", label: "AGP", short: "AGP", metric: "agpM", fmtName: "AGP" },
    { id: "hh", label: "HHs", short: "HHs", metric: "hhK", fmtName: "Households" }
  ];
  const STEPS = [
    { n: 1, title: "Scope & objective" },
    { n: 2, title: "Constraints" },
    { n: 3, title: "Deal inputs" },
    { n: 4, title: "52-week plan" },
    { n: 6, title: "Why it beats LY" }
  ];
  const state = {
    step: 1, generated: false, division: "national", categoryId: "confectionery", objective: "sales",
    draft: {}, scenarios: [], scnSeq: 0, activeScenario: "base",
    showAllow: false, deadNetVersion: "v1", flip: {}, v2: true, v2plan: false, v2period: null, v2ix: false, v2evMode: "reg", v2allowMode: "reg",
    grid: { vendor: "all", rog: "all" },
    res: { vendor: "all", rog: "all", binBy: null, bin: "all" },
    ix: { binBy: "sales", bin: "1", ncrc: "", open: false },
    explain: { m: null, b: "plan", scope: "all" },
    cf: { strategy: "optimized", clustersOpen: false, expanded: {}, tab: {}, approved: {}, molOpen: false, focal: null }
  };
  function cat() { return DATA[state.categoryId]; }
  function divMeta() { return DIVISIONS.find((d) => d.id === state.division) || DIVISIONS[0]; }
  function divisionFactor() { return divMeta().factor; }
  function draftOf(uid) { return state.draft[uid] || (state.draft[uid] = {}); }
  function activeOv() { if (state.activeScenario === "base") return {}; const s = state.scenarios.find((x) => x.id === state.activeScenario); return s ? s.ov : {}; }
  function displayMap() { return activeOv(); }
  function isDirty() { return JSON.stringify(state.draft) !== JSON.stringify(activeOv()); }
  function objMeta() { return OBJECTIVES.find((o) => o.id === state.objective) || OBJECTIVES[0]; }
  function objVal(res, obj) { return res[(OBJECTIVES.find((x) => x.id === (obj || state.objective)) || OBJECTIVES[0]).metric]; }

  function isEdited(o, field) {
    const ov = state.draft[o.uid]; if (!ov) return false;
    if (field === "events") return ov.events != null && ov.events !== o.recEvents;
    if (field === "digEvents") return ov.digEvents != null && ov.digEvents !== defDigEvents(o);
    if (field === "bothEvents") return ov.bothEvents != null && ov.bothEvents !== defBothEvents(o);
    if (field === "deepEvents") return ov.deepEvents != null && ov.deepEvents !== defDeepEvents(o);
    if (field === "deepDigEvents") return ov.deepDigEvents != null && ov.deepDigEvents !== defDeepDigEvents(o);
    if (field === "deepBothEvents") return ov.deepBothEvents != null && ov.deepBothEvents !== defDeepBothEvents(o);
    if (field === "deepDeadNet") return ov.deepDeadNet != null;
    if (field === "headerFlat") return ov.headerFlat != null && Math.abs(ov.headerFlat - o.headerFlat) > 1e-9;
    if (field === "vlc") return ov.vlc != null && Math.abs(ov.vlc - o.vlc) > 1e-9;
    if (field === "deadNet") return ov.deadNetTouched || (ov.ladder && Object.keys(ov.ladder).length > 0);
    if (field === "deepDeadNet") return ov.deepLadder && Object.keys(ov.deepLadder).length > 0;
    if (field.indexOf("alw:") === 0) { const k = field.slice(4); return ov.ladder && ov.ladder[k] != null && Math.abs(ov.ladder[k] - o.ladder[k]) > 1e-9; }
    return false;
  }

  // discovered ranges + defaults per editable cell
  function ranges(o) {
    const dn = deadNetOf(o);
    return {
      vlc: { def: o.vlc, lo: round(o.vlc * 0.93, 2), hi: round(o.vlc * 1.07, 2), unit: "$" },
      deadNet: { def: dn, lo: round(dn * 0.90, 2), hi: round(dn * 1.08, 2), unit: "$" },
      events: { def: o.recEvents, lo: Math.max(o.form === "tub" ? 4 : 6, o.recEvents - 3), hi: Math.min(o.form === "tub" ? 14 : 24, o.recEvents + 4), unit: "" },
      digEvents: { def: defDigEvents(o), lo: Math.max(0, defDigEvents(o) - 3), hi: defDigEvents(o) + 4, unit: "" },
      bothEvents: { def: defBothEvents(o), lo: Math.max(0, defBothEvents(o) - 2), hi: defBothEvents(o) + 3, unit: "" },
      deepEvents: { def: defDeepEvents(o), lo: Math.max(0, defDeepEvents(o) - 2), hi: defDeepEvents(o) + 4, unit: "" },
      deepDigEvents: { def: defDeepDigEvents(o), lo: Math.max(0, defDeepDigEvents(o) - 2), hi: defDeepDigEvents(o) + 3, unit: "" },
      deepBothEvents: { def: defDeepBothEvents(o), lo: Math.max(0, defDeepBothEvents(o) - 1), hi: defDeepBothEvents(o) + 3, unit: "" },
      deepDeadNet: { def: round(dn * 0.86, 2), lo: round(dn * 0.78, 2), hi: round(dn * 0.95, 2), unit: "$" }
    };
  }

  // Ask-Assistant context (vs LY)
  function askContext(o) {
    const plan = resultFor(o, displayMap()), ly = lyResult(o), e = effective(o, displayMap());
    const dU = (plan.units - ly.units) / ly.units, dR = (plan.revenueM - ly.revenueM) / ly.revenueM, dA = (plan.agpM - ly.agpM) / ly.agpM;
    const reasons = [];
    const evDelta = e.events - o.lyEvents;
    if (evDelta !== 0) reasons.push((evDelta < 0 ? Math.abs(evDelta) + " fewer events" : evDelta + " more events") + " (" + o.lyEvents + " LY → " + e.events + ")" + (evDelta < 0 ? ", cutting promo fatigue" : ", more on-deal weeks"));
    reasons.push("events timed into higher-demand weeks for " + o.form + "s (LY timing was looser)");
    const depthDelta = o.recDepth - o.lyDepth;
    if (Math.abs(depthDelta) > 0.005) reasons.push((depthDelta < 0 ? "shallower" : "deeper") + " avg depth (" + fmtPctPlain(o.lyDepth, 0) + " → " + fmtPctPlain(o.recDepth, 0) + ")" + (depthDelta < 0 ? ", protecting margin" : ""));
    reasons.push("cannibalisation curbed (14% → 5%) and category halo credited (+6.4%)");
    const dnDelta = e.deadNet - deadNetOf(o);
    if (Math.abs(dnDelta) > 0.001) reasons.push("dead-net cost " + (dnDelta < 0 ? "improved" : "rose") + " to " + fmtPrice(e.deadNet) + " (your edit)");
    return { o, plan, ly, e, dU, dR, dA, reasons };
  }

  window.NP = {
    state, DATA, CATEGORIES, DIVISIONS, ROGS, OBJECTIVES, STEPS, GUARDRAIL_GROUPS, CLUSTER_LABEL, CURVE, SEASON, OFFERS, STORE_TACTICS, DIGITAL_NAMES, DEPTH_LADDER, CURRENT_WEEK, LADDER_KEYS, BUY_KEYS, RETAIL_KEYS,
    cat, divMeta, divisionFactor, draftOf, displayMap, isDirty, isEdited, objMeta, objVal, ranges, askContext,
    effective, resultFor, lyResult, noPromoResult, respond, deadNetOf, promoPriceOf, applyLadder,
    weekPlan, weeklyTrend, weeklySeries, binsFor, displayTactic, snapDepth, offerValueShort, MECH_LABEL, RETAIL_EVENTS, rankedClusters,
    guardrailCount, findGuardrail, flaggedFor,
    fmt: { m: fmtM, u: fmtU, price: fmtPrice, pct: fmtPct, pctPlain: fmtPctPlain },
    util: { clamp, round, clone, hashStr },
    goStep, generate, rerun, revert, setScenario, deleteScenario, renderAll, renderStepper, openGuardModal, closeOverlays, openAsk,
    applyEdit, applyAllow, inBand
  };

  /* --------------------------------------------------------------- stepper */
  function renderStepper() {
    const host = document.getElementById("npStepper");
    // V2 grid folds Deal inputs into the pinned area (hide the step); but when the
    // swipe-up V1 52-week view is on, the V1 table has no inputs — so bring it back.
    const steps = (state.v2 && !state.v2plan) ? STEPS.filter((s) => s.n !== 3) : STEPS;
    // Circle numbers are positional (1,2,3,4) — the underlying step ids (s.n) are
    // non-contiguous now that Deal inputs is folded in and Counterfactuals removed.
    const tabs = steps.map((s, i) => {
      const disabled = s.n === 6; // "Why it beats LY" — greyed out / not selectable for now
      const locked = !disabled && s.n > 1 && !state.generated, active = state.step === s.n, done = state.generated && s.n < state.step;
      return '<button type="button" class="np-step-tab' + (active ? " is-active" : "") + (locked ? " is-locked" : "") + (disabled ? " is-disabled" : "") + (done ? " is-done" : "") + '" data-step="' + s.n + '"' + (locked || disabled ? " disabled" : "") + '>' +
        '<span class="np-step-circ">' + (locked ? "🔒" : done ? "✓" : (i + 1)) + '</span><span class="np-step-name">' + s.title + "</span></button>";
    }).join('<span class="np-step-line" aria-hidden="true"></span>');
    const obj = objMeta();
    host.innerHTML = '<div class="np-stepper-inner">' + tabs + "</div>" +
      '<div class="np-stepper-obj">' + (state.generated ? '<span>Division</span><b>' + divMeta().short + "</b><span class=\"np-obj-sep\"></span><span>Category</span><b>" + cat().name.split(" — ")[0] + "</b><span class=\"np-obj-sep\"></span><span>Optimising for</span><b class=\"np-obj-pill\">" + obj.fmtName + "</b>" : '<span class="np-stepper-hint">Pick a division, category &amp; objective to begin</span>') + "</div>";
    host.querySelectorAll("[data-step]").forEach((b) => b.onclick = () => { const n = +b.dataset.step; if (n === 1 || state.generated) goStep(n); });
  }
  function goStep(n) { if (state.v2 && !state.v2plan && n === 3) n = 4; state.step = n; closeOverlays(); renderAll(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function generate() { state.generated = true; state.draft = {}; state.scenarios = []; state.scnSeq = 0; state.activeScenario = "base"; state.grid = { vendor: "all", rog: "all" }; state.v2period = null; state.step = 2; renderAll(); }
  function rerun() { state.scnSeq++; const id = "scn" + state.scnSeq; state.scenarios.push({ id: id, name: "Scenario " + state.scnSeq, ov: clone(state.draft) }); state.activeScenario = id; renderAll(); }
  /* edit a single input into the draft (same field semantics as the V1 deal grid),
     so V2's editable summary strip drives the identical scenario / reforecast flow. */
  function distributeDeadNet(o, target) {
    const e = effective(o, state.draft), vlc = e.vlc; if (vlc <= 0) return;
    const keys = LADDER_KEYS, cur = keys.reduce((s, k) => s + (e.ladder[k] || 0), 0);
    const targetSum = clamp(1 - target / vlc, 0.02, 0.9), scale = cur > 0 ? targetSum / cur : 0;
    const ov = draftOf(o.uid); ov.ladder = ov.ladder || {}; ov.deadNetTouched = false;
    keys.forEach((k) => { ov.ladder[k] = (e.ladder[k] || 0) * scale; });
  }
  function applyEdit(uid, field, raw) {
    const o = cat().items.find((x) => x.uid === uid); if (!o) return;
    const ov = draftOf(uid); let val = parseFloat(raw); if (isNaN(val)) val = 0;
    if (field === "events") ov.events = Math.round(clamp(val, 0, 40));
    else if (field === "digEvents") ov.digEvents = Math.round(clamp(val, 0, 40));
    else if (field === "bothEvents") ov.bothEvents = Math.round(clamp(val, 0, 40));
    else if (field === "deepEvents") ov.deepEvents = Math.round(clamp(val, 0, 40));
    else if (field === "deepDigEvents") ov.deepDigEvents = Math.round(clamp(val, 0, 40));
    else if (field === "deepBothEvents") ov.deepBothEvents = Math.round(clamp(val, 0, 40));
    else if (field === "vlc") { ov.vlc = val; ov.deadNetTouched = false; }
    else if (field === "deadNet") { distributeDeadNet(o, val); }
    else if (field === "deepDeadNet") { ov.deepDeadNet = round(clamp(val, 0.02, o.vlc), 3); }
  }
  // edit one allowance ($/u) that builds the promo cost — regular (ov.ladder) or deep (ov.deepLadder)
  function applyAllow(uid, key, raw, deep) {
    const o = cat().items.find((x) => x.uid === uid); if (!o) return;
    const ov = draftOf(uid); let val = parseFloat(raw); if (isNaN(val)) val = 0;
    const vlc = ov.vlc != null ? ov.vlc : o.vlc;
    const pct = vlc > 0 ? clamp(val / vlc, 0, 0.9) : 0;
    if (deep) { ov.deepLadder = ov.deepLadder || {}; ov.deepLadder[key] = pct; }
    else { ov.ladder = ov.ladder || {}; ov.ladder[key] = pct; ov.deadNetTouched = false; }
  }
  // is a candidate value inside the discovered band for this field? (band edits don't need a reforecast)
  function inBand(o, field, raw) {
    const r = ranges(o)[field]; if (!r) return true;
    const v = parseFloat(raw); if (isNaN(v)) return true;
    return v >= r.lo - 1e-9 && v <= r.hi + 1e-9;
  }
  function revert() { state.draft = clone(activeOv()); renderAll(); }
  function setScenario(which) { state.activeScenario = which; state.draft = clone(activeOv()); renderAll(); }
  function deleteScenario(id) { state.scenarios = state.scenarios.filter((s) => s.id !== id); if (state.activeScenario === id) { state.activeScenario = state.scenarios.length ? state.scenarios[state.scenarios.length - 1].id : "base"; state.draft = clone(activeOv()); } renderAll(); }

  /* --------------------------------------------------------------- scope */
  function renderScope() {
    const dsel = document.getElementById("npDivision");
    if (dsel) {
      dsel.innerHTML = DIVISIONS.map((d) => '<option value="' + d.id + '"' + (d.id === state.division ? " selected" : "") + ">" + d.name + "</option>").join("");
      dsel.onchange = () => { state.division = dsel.value; state.generated = false; state.draft = {}; state.scenarios = []; state.scnSeq = 0; state.activeScenario = "base"; state.step = 1; renderAll(); };
    }
    const sel = document.getElementById("npCategory");
    sel.innerHTML = CATEGORIES.map((c) => '<option value="' + c.id + '"' + (c.id === state.categoryId ? " selected" : "") + ">" + c.name + "</option>").join("");
    sel.onchange = () => { state.categoryId = sel.value; state.generated = false; state.draft = {}; state.scenarios = []; state.scnSeq = 0; state.activeScenario = "base"; state.step = 1; renderAll(); };
    const obj = document.getElementById("npObjective");
    obj.innerHTML = OBJECTIVES.map((o) => '<button type="button" class="plan-obj-opt ' + (o.id === state.objective ? "active" : "") + '" data-obj="' + o.id + '">' + o.label + "</button>").join("");
    obj.querySelectorAll("button").forEach((b) => b.onclick = () => { state.objective = b.dataset.obj; renderAll(); });
    document.getElementById("npGenerate").onclick = generate;
  }

  /* ------------------------------------------------------ guardrail ribbon */
  function renderGuardRibbon() {
    const cnt = document.getElementById("npGuardCount"); if (cnt) cnt.textContent = guardrailCount();
    const mini = document.getElementById("npGuardMini"); if (mini) mini.textContent = "Profit floor · funding · price image · pacing · cannibalisation · cross-goal floors …";
    const body = document.getElementById("npGuardBody");
    if (body) body.innerHTML = GUARDRAIL_GROUPS.map((g) =>
      '<div class="np-gr-group"><div class="np-gr-group-head">' + g.group + "</div><div class=\"np-gr-list\">" + g.items.map((it) => {
        const flagged = flaggedFor(it.key);
        const countBtn = flagged.length ? '<button class="np-gr-count" data-gr="' + it.key + '">' + flagged.length + " NCRCs ›</button>" : '<span class="np-gr-planlevel">plan-level</span>';
        return '<div class="np-gr"><div class="np-gr-top"><h5>' + it.name + (it.off ? ' <span class="np-gr-off">off by default</span>' : "") + (it.cat ? ' <span class="np-gr-cat">category-specific</span>' : "") + "</h5>" +
          '<span class="np-gr-in np-gr-in-' + (it.in === "$" ? "money" : it.in === "Units" ? "units" : "points") + '">' + it.in + "</span></div>" +
          '<p class="np-gr-charge">' + it.charge + (it.formula ? ' <code>' + it.formula + "</code>" : "") + "</p>" +
          '<div class="np-gr-foot"><span class="np-gr-value">' + it.value + "</span>" + countBtn + "</div>" +
          '<p class="np-gr-danger">⚠ ' + it.danger + "</p></div>";
      }).join("") + "</div></div>").join("") +
      '<p class="np-foot">Around twenty guardrails, learned from your data and locked. Each adds a charge the solver must overcome; the displayed Units / Sales / AGP stay the raw forecast — charges only steer which tactic is recommended.</p>';
    const btn = document.getElementById("npGuardToggle");
    // "what the optimiser solved for" expansion is hidden — ribbon is a static summary.
    if (btn) { btn.classList.add("is-static"); btn.onclick = null; btn.setAttribute("aria-expanded", "false"); }
    if (body) { body.setAttribute("hidden", ""); body.querySelectorAll("[data-gr]").forEach((b) => b.onclick = () => openGuardModal(b.dataset.gr)); }
  }

  /* --------------------------------------------------- guardrail drilldown */
  function openGuardModal(key) {
    const g = findGuardrail(key), flagged = flaggedFor(key);
    const modal = document.getElementById("npModal"), scrim = document.getElementById("npModalScrim");
    modal.innerHTML = '<div class="np-modal-head"><div><h3>' + g.name + '</h3><p>' + g.charge + (g.formula ? " · charge " + g.formula : "") + "</p></div>" +
      '<button class="np-modal-close" type="button">×</button></div>' +
      '<div class="np-modal-meta"><span>Charged in <b>' + g.in + "</b></span><span>Learned value <b>" + g.value + "</b></span>" + (g.cat ? "<span>category-specific</span>" : "") + (g.off ? "<span>off by default</span>" : "") + "</div>" +
      '<table class="np-modal-table"><thead><tr><th>NCRC</th><th>Vendor</th><th>Item</th><th>Discovered value</th></tr></thead><tbody>' +
      flagged.map((f) => "<tr><td class=\"np-ss-mono\">" + f.ncrc + "</td><td>" + f.vendor + "</td><td>" + f.item + "</td><td><b>" + f.value + "</b></td></tr>").join("") + "</tbody></table>" +
      '<p class="np-foot">⚠ ' + g.danger + "</p>";
    modal.hidden = false; scrim.hidden = false; document.body.classList.add("np-noscroll");
    modal.querySelector(".np-modal-close").onclick = closeOverlays;
    scrim.onclick = closeOverlays;
  }

  /* ---------------------------------------------------- Ask Assistant drawer */
  function openAsk(uid) {
    const o = cat().items.find((x) => x.uid === uid); if (!o) return;
    const ctx = askContext(o);
    const drawer = document.getElementById("npDrawer"), scrim = document.getElementById("npDrawerScrim");
    const m = NP.fmt;
    const row3 = (lab, plan, ly, pct) => '<div class="np-ask-metric"><span class="np-ask-mlabel">' + lab + '</span><span class="np-ask-this">' + plan + '</span><span class="np-ask-ly">LY ' + ly + '</span><span class="np-ask-delta ' + (pct >= 0 ? "np-pos" : "np-neg") + '">' + m.pct(pct) + "</span></div>";
    drawer.innerHTML = '<div class="np-ask-head"><div><span class="np-ask-eyebrow">Ask Assistant · ' + ctx.o.ncrc + '</span><h3>' + o.item + "</h3><small>" + o.vendor + " · " + o.brand + " · " + o.pack + "</small></div><button class=\"np-ask-close\" type=\"button\">×</button></div>" +
      '<div class="np-ask-metrics"><div class="np-ask-metric np-ask-mhead"><span>Metric</span><span>This plan</span><span>Last year</span><span>Δ</span></div>' +
      row3("Units", m.u(ctx.plan.units), m.u(ctx.ly.units), ctx.dU) + row3("Revenue", m.m(ctx.plan.revenueM), m.m(ctx.ly.revenueM), ctx.dR) + row3("AGP", m.m(ctx.plan.agpM), m.m(ctx.ly.agpM), ctx.dA) + "</div>" +
      '<div class="np-ask-why"><h4>Why we\'re ' + (ctx.dA >= 0 ? "up" : "down") + " vs last year</h4><ul>" + ctx.reasons.map((r) => "<li>" + r + "</li>").join("") + "</ul></div>" +
      '<div class="np-ask-chips"><button class="np-ask-chip">Compare tactic mix vs LY</button><button class="np-ask-chip">What if I add 2 events?</button><button class="np-ask-chip">Show cannibalisation peers</button></div>' +
      '<div class="np-ask-input"><input type="text" placeholder="Ask a follow-up about ' + o.item + '…" /><button class="primary-button" type="button">Ask</button></div>';
    drawer.hidden = false; scrim.hidden = false; drawer.classList.add("is-open"); document.body.classList.add("np-noscroll");
    drawer.querySelector(".np-ask-close").onclick = closeOverlays;
    scrim.onclick = closeOverlays;
  }

  function closeOverlays() {
    ["npDrawer", "npDrawerScrim", "npModal", "npModalScrim", "npCtxMenu", "npCellHint", "npFcPop"].forEach((id) => { const e = document.getElementById(id); if (e) e.hidden = true; });
    const d = document.getElementById("npDrawer"); if (d) d.classList.remove("is-open");
    document.body.classList.remove("np-noscroll");
  }

  /* ------------------------------------------------------------- render all */
  function renderAll() {
    renderStepper(); renderScope();
    if (window.NPV2 && NPV2.renderToggle) NPV2.renderToggle();

    // V2 layout — the frozen-pane grid lives on step 4 (and on step 3 too while the
    // grid integrates deal inputs). When the swipe-up V1 52-week view is active
    // (v2plan), the "Deal inputs" step reappears and opens the classic spreadsheet,
    // so step 3 falls through to the V1 deal-input grid instead of the V2 shell.
    if (state.v2 && window.NPV2 && state.generated && (state.step === 4 || (state.step === 3 && !state.v2plan))) {
      for (let i = 1; i <= 6; i++) { const el = document.getElementById("npStep" + i); if (el) el.toggleAttribute("hidden", true); }
      NPV2.mount();
      syncTopbar();
      return;
    }
    if (window.NPV2 && NPV2.unmount) NPV2.unmount();

    for (let i = 1; i <= 6; i++) { const el = document.getElementById("npStep" + i); if (el) el.toggleAttribute("hidden", state.step !== i); }
    if (state.step === 2) { if (window.NPViews) window.NPViews.renderConstraints(); }
    else if (state.step === 3) { renderGuardRibbon(); if (window.NPViews) window.NPViews.renderGrid(); }
    else if (state.step === 4 && window.NPViews) window.NPViews.renderResults();
    else if (state.step === 6 && window.NPViews) window.NPViews.renderExplain();
    if (state.generated && state.step >= 2) appendStepNav(state.step);
    syncTopbar();
  }

  function appendStepNav(n) {
    const host = document.getElementById("npStep" + n); if (!host) return;
    host.querySelectorAll(".np-stepnav").forEach((e) => e.remove());
    // Derive prev/next from the navigable steps (same filter as the stepper, and
    // never auto-advance into the disabled "Why it beats LY"), so the flow ends on
    // the 52-week plan now that Counterfactuals is folded in.
    const nav0 = ((state.v2 && !state.v2plan) ? STEPS.filter((s) => s.n !== 3) : STEPS).filter((s) => s.n !== 6);
    const idx = nav0.findIndex((s) => s.n === n);
    const prev = idx > 0 ? nav0[idx - 1] : null, next = (idx >= 0 && idx < nav0.length - 1) ? nav0[idx + 1] : null;
    const nav = document.createElement("div");
    nav.className = "np-stepnav";
    nav.innerHTML = (prev ? '<button class="np-nav-back" data-go="' + prev.n + '">← ' + prev.title + "</button>" : "<span></span>") +
      (next ? '<button class="np-nav-next" data-go="' + next.n + '">Continue to ' + next.title + " →</button>" : '<span class="np-nav-done">End of flow — choose &amp; finalise the plan</span>');
    host.appendChild(nav);
    nav.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => goStep(+b.dataset.go));
  }

  /* theme + global */
  function syncTopbar() {
    const tb = document.querySelector(".topbar"), st = document.querySelector(".np-stepper");
    const tbh = tb ? tb.offsetHeight : 56, sth = st ? st.offsetHeight : 44;
    document.documentElement.style.setProperty("--np-topbar", tbh + "px");
    document.documentElement.style.setProperty("--np-headtop", (tbh + sth) + "px");
  }
  function initGlobal() {
    syncTopbar(); window.addEventListener("resize", syncTopbar);
    const t = document.getElementById("themeToggle");
    if (t) t.addEventListener("click", () => { const dark = !document.body.classList.contains("dark"); document.body.classList.toggle("dark", dark); document.body.setAttribute("data-theme", dark ? "dark" : "light"); t.textContent = dark ? "Light Mode" : "Dark Mode"; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeOverlays(); });
    document.addEventListener("click", (e) => {
      const m = document.getElementById("npCtxMenu"); if (m && !m.hidden && !m.contains(e.target)) m.hidden = true;
      const fp = document.getElementById("npFcPop"); if (fp && !fp.hidden && !fp.contains(e.target) && !e.target.closest("[data-fc]")) fp.hidden = true;
    });
  }
  // Land on the Scope & objective step with nothing generated yet, so the downstream steps
  // (Constraints, 52-week plan, Counterfactuals) stay locked until the merchant confirms scope
  // & objective via "Generate plan". generate() is what unlocks them.
  function boot() { initGlobal(); renderAll(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
