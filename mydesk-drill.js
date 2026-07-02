/* ============================================================================
 * MyDesk drill — Group ▸ Category ▸ Vendor ▸ Item explorer.
 *
 * One left→right read: pick a Group → its Categories → its Items/Vendors →
 * the focused row's full KPIs in the last column. A vendor drills one more
 * level into its items. The KPI-detail column follows whatever you select.
 *
 * DATA: the dashboard fixtures (/api/dashboard/bootstrap → deptMix) only carry
 * Department → Category with sales/units/agp. This explorer needs the full
 * Group→Category→Vendor→Item tree with 14 KPIs, which the backend does not yet
 * expose, so the tree below is generated deterministically from a realistic
 * seed. To wire real data later, set `window.__DX_DRILL_DATA__ = <DEPTS-shaped
 * array>` before this script runs (or call DxDrill.load(depts)); everything
 * else — render, drill, KPI detail — stays the same.
 * ========================================================================== */
(function () {
  "use strict";
  const ROOT = document.getElementById("dxDrill");
  if (!ROOT) return;

  /* ---------- KPI definitions ---------- */
  const KPIS = [
    { key: "sales",   label: "Sales",           fmt: "moneyM", unit: "%",  up: true },
    { key: "units",   label: "Units",           fmt: "numM",   unit: "%",  up: true },
    { key: "aiv",     label: "AIV",             fmt: "money2", unit: "%",  up: true },
    { key: "agpPct",  label: "AGP %",           fmt: "pct",    unit: "pp", up: true },
    { key: "agpDol",  label: "AGP $",           fmt: "moneyM", unit: "%",  up: true },
    { key: "cogs",    label: "COGS",            fmt: "moneyM", unit: "%",  up: false },
    { key: "allow",   label: "Allowances",      fmt: "moneyM", unit: "%",  up: true },
    { key: "deadnet", label: "Deadnet Cost",    fmt: "moneyM", unit: "%",  up: false },
    { key: "mix",     label: "Sales Mix %",     fmt: "pct",    unit: "pp", up: true },
    { key: "bog",     label: "BOG %",           fmt: "pct",    unit: "pp", up: true },
    { key: "markdown",label: "Markdown %",      fmt: "pct",    unit: "pp", up: false },
    { key: "msMulo",  label: "Mkt Share MULO+", fmt: "pct",    unit: "pp", up: true },
    { key: "msFood",  label: "Mkt Share Food",  fmt: "pct",    unit: "pp", up: true },
    { key: "cpi",     label: "CPI-P",           fmt: "idx",    unit: "pt", up: false },
  ];
  const KPI = Object.fromEntries(KPIS.map((k) => [k.key, k]));

  /* ---------- deterministic RNG ---------- */
  function rng(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }

  /* ---------- hierarchy seed (Dairy has groups; Bakery is single-group → skips the Group pane) ---------- */
  const DEFAULT_DEPTS = [
    { id: "314 · Dairy", groups: [
      { name: "36 · Refrigerated Dairy", sales: 292.3, tilt: 0.10,  cats: ["Yogurt", "Fluid Milk", "Butter", "Creamers", "Cottage Cheese", "Sour Cream"] },
      { name: "35 · Eggs",               sales: 72.4,  tilt: -0.75, cats: ["Shell Eggs", "Specialty Eggs", "Egg Substitutes"] },
      { name: "37 · Cheese",             sales: 121.7, tilt: 0.18,  cats: ["Natural Chunk", "Shredded", "Slices", "Cream Cheese", "Snack Cheese"] },
      { name: "38 · Refrigerated Foods", sales: 72.9,  tilt: 0.55,  cats: ["Lunchmeat", "Hot Dogs", "Dough", "Dips", "Pasta"] },
    ] },
    { id: "375 · Bakery", groups: [
      { name: "Bakery", sales: 140.0, tilt: -0.20, cats: ["Bread", "Rolls", "Cakes", "Donuts", "Cookies", "Pies"] },
    ] },
  ];
  const VENDORS = ["Danone", "General Mills", "Chobani", "Kraft Heinz", "Land O'Lakes", "Tillamook", "Private Label", "Sargento", "Cargill", "Hormel"];

  /* ---------- KPI value generation ---------- */
  function baseVal(k, node, r) {
    const s = node.sales;
    switch (k.key) {
      case "sales":   return s;
      case "units":   return s / (3 + r() * 2);
      case "aiv":     return 3 + r() * 3;
      case "agpPct":  return 35 + r() * 12;
      case "agpDol":  return s * (0.28 + r() * 0.12);
      case "cogs":    return s * (0.6 + r() * 0.1);
      case "allow":   return s * (0.07 + r() * 0.06);
      case "deadnet": return s * (0.5 + r() * 0.12);
      case "mix":     return node.mix != null ? node.mix : 2 + r() * 22;
      case "bog":     return 28 + r() * 28;
      case "markdown":return 10 + r() * 26;
      case "msMulo":  return 17 + r() * 9;
      case "msFood":  return 29 + r() * 9;
      case "cpi":     return 0.98 + r() * 0.09;
    }
  }
  function buildKpis(node) {
    const r = rng(node.name + "|" + node.sales.toFixed(2));
    node.kpi = {};
    KPIS.forEach((k) => {
      const noise = (r() - 0.5) * 11;
      const fm = node.tilt * 8 + noise;                 // favourable magnitude
      const favorable = fm >= 0;
      const dir = k.up ? Math.sign(fm) : -Math.sign(fm);
      let d = Math.abs(fm) * dir;                        // signed change
      if (k.unit === "pt") d *= 0.01;                    // index points move in hundredths
      const value = baseVal(k, node, r);
      let ly, changeAbs;
      if (k.unit === "%") { ly = value / (1 + d / 100); changeAbs = value - ly; }
      else { ly = value - d; changeAbs = d; }
      node.kpi[k.key] = { value, ly, changeAbs, fm, favorable, deltaNum: d };
    });
  }

  /* ---------- build node tree ---------- */
  let NODE_ID = 0;
  function mkNode(name, sales, tilt, kind, mix) { const n = { id: "dx" + NODE_ID++, name, sales, tilt, kind, mix }; buildKpis(n); return n; }
  function splitSales(total, n, seedStr) { const r = rng(seedStr); const w = Array.from({ length: n }, () => 0.5 + r()); const sum = w.reduce((a, b) => a + b, 0); return w.map((x) => +(total * x / sum).toFixed(1)); }
  const clampT = (t) => Math.max(-0.95, Math.min(0.95, t));

  function buildTree(depts) {
    NODE_ID = 0;
    return depts.map((d) => {
      const groups = d.groups.map((g) => {
        const gn = mkNode(g.name, g.sales, g.tilt, "group");
        const cs = splitSales(g.sales, g.cats.length, g.name);
        gn.children = g.cats.map((c, ci) => {
          const ct = clampT(g.tilt * 0.55 + (rng(c)() - 0.5) * 0.9);
          const cn = mkNode(c, cs[ci], ct, "category", +(100 * cs[ci] / g.sales).toFixed(1));
          // items directly under the category (Items mode)
          const isales = splitSales(cs[ci], 6, c + "|i");
          cn.items = isales.map((sv, ii) => {
            const it = clampT(ct * 0.7 + (rng(c + ii + "i")() - 0.5) * 0.95);
            const nm = c + " — " + ["Core", "Value", "Premium", "Organic", "Family", "Snack"][ii] + " SKU";
            const v = VENDORS[Math.floor(rng(nm)() * VENDORS.length)];
            const n = mkNode(nm, sv, it, "item");
            n.sub = "NCRC " + (100000 + Math.floor(rng(nm)() * 899999)) + " · " + v;
            n.vendor = v; return n;
          });
          // vendors, each carrying its OWN items (Vendor → Item drill)
          const vsales = splitSales(cs[ci], 4, c + "|v");
          cn.vendors = vsales.map((sv, vi) => {
            const vt = clampT(ct * 0.6 + (rng(c + vi + "v")() - 0.5) * 0.95);
            const nm = VENDORS[(vi * 3 + ci) % VENDORS.length];
            const n = mkNode(nm, sv, vt, "vendor");
            const cnt = 8 + Math.floor(rng(nm + vi + "cnt")() * 27); // 8..34 items
            n.sub = cnt + " items · " + (vt < 0 ? "funding gap" : "on plan");
            const vis = splitSales(sv, cnt, nm + "|vi" + vi + ci);
            const tag = nm.split(" ")[0];
            n.items = vis.map((iv, ii) => {
              const it = clampT(vt * 0.7 + (rng(nm + ii + ci + "vit")() - 0.5) * 0.95);
              const inm = c + " — " + tag + " " + ["Core", "Value", "Premium", "Organic", "Family", "Snack", "Light", "Classic"][ii % 8] + " " + (Math.floor(ii / 8) + 1);
              const node2 = mkNode(inm, iv, it, "item");
              node2.sub = "NCRC " + (100000 + Math.floor(rng(inm + ii)() * 899999)) + " · " + nm;
              node2.vendor = nm; return node2;
            });
            return n;
          });
          return cn;
        });
        return gn;
      });
      const droot = mkNode(d.id.split(" ·")[0] + " aggregate", d.groups.reduce((a, g) => a + g.sales, 0),
        d.groups.reduce((a, g) => a + g.tilt, 0) / d.groups.length, "dept");
      droot.children = groups;
      return { id: d.id, root: droot, groups, single: groups.length === 1 };
    });
  }

  let TREE = buildTree(window.__DX_DRILL_DATA__ || DEFAULT_DEPTS);

  /* ---------- state ---------- */
  const state = { deptIdx: 0, rankBy: "sales", path: [], inspect: null, leafMode: "items" };

  /* ---------- formatting ---------- */
  function fmtVal(k, v) {
    switch (k.fmt) {
      case "moneyM": return "$" + v.toFixed(1) + "M";
      case "numM":   return v.toFixed(1) + "M";
      case "money2": return "$" + v.toFixed(2);
      case "pct":    return v.toFixed(1) + "%";
      case "idx":    return v.toFixed(2);
    }
  }
  function fmtDelta(k, kp) {
    const sign = kp.deltaNum >= 0 ? "+" : "−";
    const a = Math.abs(kp.deltaNum);
    const u = k.unit === "pp" ? "pp" : (k.unit === "pt" ? "" : "%");
    return sign + a.toFixed(k.unit === "pt" ? 2 : 1) + u;
  }
  function fmtAbsChange(k, kp) {
    const s = kp.changeAbs >= 0 ? "+" : "−", a = Math.abs(kp.changeAbs);
    if (k.fmt === "moneyM") return s + "$" + a.toFixed(1) + "M";
    if (k.fmt === "numM")   return s + a.toFixed(1) + "M";
    if (k.fmt === "money2") return s + "$" + a.toFixed(2);
    return "";
  }
  /* Colour + sign always agree: a positive change is green, a negative change is red. */
  const favClass = (kp) => (kp.deltaNum >= 0 ? "pos" : "neg");
  const arrow = (kp) => (kp.deltaNum >= 0 ? "▲" : "▼");

  /* ---------- sorting + accents ---------- */
  function sortNodes(nodes) {
    const key = state.rankBy;
    return nodes.slice().sort((a, b) => a.kpi[key].deltaNum - b.kpi[key].deltaNum); // biggest drops first
  }
  function accentClass(node) { const d = node.kpi[state.rankBy].deltaNum; return d > 3 ? "win" : (d < -3 ? "lose" : "mid"); }

  /* ---------- pulse ---------- */
  function pulseSVG(node, w) {
    const n = KPIS.length, gap = 2, bw = Math.max(3, (w - (n - 1) * gap) / n), h = 30, mid = 15, cap = 12;
    let bars = "";
    KPIS.forEach((k, i) => {
      const kp = node.kpi[k.key];
      const up = kp.deltaNum >= 0;
      const bh = Math.max(2, Math.min(cap, Math.abs(kp.deltaNum)) / cap * 13);
      const x = (i * (bw + gap)).toFixed(1);
      const y = up ? mid - bh : mid;
      const cls = up ? "p" : "n";
      const tip = k.label + ": " + fmtVal(k, kp.value) + " (" + fmtDelta(k, kp) + ", " + (up ? "up" : "down") + ")";
      bars += `<rect class="${cls}" x="${x}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}"><title>${tip}</title></rect>`;
    });
    return `<svg class="dx-pulse" data-pulse="${node.id}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line class="mid" x1="0" y1="${mid}" x2="${w}" y2="${mid}"/>${bars}</svg>`;
  }
  const redCount = (node) => KPIS.filter((k) => node.kpi[k.key].deltaNum < 0).length;

  /* ---------- row ---------- */
  function rowHTML(node, pulseW, showPulse) {
    const rb = KPI[state.rankBy], kp = node.kpi[state.rankBy];
    const drill = state.path.includes(node) ? "drill" : "";
    const rc = redCount(node);
    const pulse = showPulse ? pulseSVG(node, pulseW)
      : `<span class="dx-badge ${rc === 0 ? "zero" : ""}" data-pulse="${node.id}">${rc === 0 ? "✓ all up" : "▼ " + rc}</span>`;
    const drillable = node.kind === "group" || node.kind === "category" || node.kind === "vendor";
    const abs = fmtAbsChange(rb, kp);
    return `<div class="dx-row ${drill}" data-node="${node.id}">
      <span class="dx-accent ${accentClass(node)}"></span>
      <div class="dx-main"><div class="dx-nm">${node.name}</div>${node.sub ? `<div class="dx-sub">${node.sub}</div>` : ""}</div>
      ${pulse}
      <div class="dx-rt">
        <span class="dx-val">${fmtVal(rb, kp.value)}</span>
        <span class="dx-ly">LY ${fmtVal(rb, kp.ly)}</span>
        <span class="dx-delta ${favClass(kp)}">${arrow(kp)} ${fmtDelta(rb, kp)}${abs ? ` · ${abs}` : ""}</span>
      </div>
      ${drillable ? '<span class="dx-chev">›</span>' : ""}
    </div>`;
  }

  /* ---------- helpers ---------- */
  const $ = (sel) => ROOT.querySelector(sel);
  const currentDept = () => TREE[state.deptIdx];
  function nodeById(id) {
    let f = null;
    (function walk(n) { if (n.id === id) f = n; (n.children || []).forEach(walk); (n.items || []).forEach(walk); (n.vendors || []).forEach(walk); })(currentDept().root);
    return f;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- render ---------- */
  function render() {
    const dept = currentDept();
    const panes = [];
    if (!dept.single) panes.push({ title: "Group · " + dept.id, nodes: dept.groups, pulse: true });
    const selGroup = dept.single ? dept.groups[0] : state.path.find((n) => n.kind === "group");
    if (selGroup) panes.push({ title: "Category · in " + selGroup.name, nodes: selGroup.children, pulse: true });
    const selCat = state.path.find((n) => n.kind === "category");
    if (selCat) {
      const mode = state.leafMode || "items";
      panes.push({ title: "in " + selCat.name, nodes: mode === "items" ? selCat.items : selCat.vendors, pulse: false, leaf: true, mode });
      if (mode === "vendors") {
        const selVendor = state.path.find((n) => n.kind === "vendor");
        if (selVendor) panes.push({ title: selVendor.name + " · items", nodes: selVendor.items, pulse: false });
      }
    }

    const H = panes.length;
    const pulseW = H >= 3 ? 94 : 116;
    const detailNode = state.inspect || state.path[state.path.length - 1] || dept.root;
    state.inspect = detailNode;

    $("#dxMiller").style.gridTemplateColumns = Array(H).fill("minmax(208px,1fr)").join(" ") + " minmax(232px,250px)";

    const paneHTML = panes.map((p) => {
      const sorted = sortNodes(p.nodes);
      const head = p.leaf
        ? `<div class="dx-pane-head"><span class="dx-ttl">${p.title}</span>
             <div class="dx-toggle" id="dxLeafToggle">
               <button data-mode="items" class="${p.mode === "items" ? "active" : ""}">Items</button>
               <button data-mode="vendors" class="${p.mode === "vendors" ? "active" : ""}">Vendors</button>
             </div></div>`
        : `<div class="dx-pane-head"><span class="dx-ttl">${p.title}</span><span class="dx-cnt">${p.nodes.length} ${p.nodes[0].kind}s</span></div>`;
      return `<div class="dx-pane">${head}<div class="dx-body">${sorted.map((n) => rowHTML(n, pulseW, p.pulse)).join("")}</div></div>`;
    }).join("");

    $("#dxMiller").innerHTML = paneHTML + detailPaneHTML(detailNode);
    renderCrumbs();
  }

  function detailPaneHTML(node) {
    const up = KPIS.filter((k) => node.kpi[k.key].deltaNum >= 0).length, dn = KPIS.length - up;
    const acc = accentClass(node);
    const kindLabel = node.kind === "dept" ? "Department total" : cap(node.kind);
    const sorted = KPIS.slice().sort((a, b) => node.kpi[a.key].deltaNum - node.kpi[b.key].deltaNum);
    const rows = sorted.map((k) => {
      const kp = node.kpi[k.key];
      const abs = fmtAbsChange(k, kp);
      return `<div class="dx-kpirow ${state.rankBy === k.key ? "ranked" : ""}" data-kpi="${k.key}">
        <span class="kl">${k.label}<small>LY ${fmtVal(k, kp.ly)}</small></span>
        <span class="kr"><span class="kv">${fmtVal(k, kp.value)}</span><span class="kd ${favClass(kp)}">${arrow(kp)} ${fmtDelta(k, kp)}</span>${abs ? `<span class="kabs">${abs}</span>` : ""}</span>
      </div>`;
    }).join("");
    return `<div class="dx-pane dpane">
      <div class="dx-pane-head dx-dhead"><span class="dx-ttl">KPI detail</span><span class="dx-tally"><span class="up">▲ ${up}</span><span class="dn">▼ ${dn}</span></span></div>
      <div class="dx-dscope"><span class="acc ${acc}"></span><span><b>${node.name}</b> · ${kindLabel} · biggest drops first</span></div>
      <div class="dx-body">${rows}</div>
    </div>`;
  }

  function renderCrumbs() {
    const dept = currentDept();
    const parts = [`<span class="dx-crumb home clickable" data-crumb="__root">${dept.id}</span>`];
    state.path.forEach((n) => {
      parts.push('<span class="dx-sep">▸</span>');
      parts.push(`<span class="dx-crumb clickable" data-crumb="${n.id}">${cap(n.kind)} · ${n.name}</span>`);
    });
    $("#dxCrumbs").innerHTML = parts.join("");
  }

  /* ---------- interactions ---------- */
  function drillTo(node) {
    const k = node.kind;
    const g = state.path.find((n) => n.kind === "group"), c = state.path.find((n) => n.kind === "category"), v = state.path.find((n) => n.kind === "vendor");
    const keep = [];
    if (k === "group") keep.push(node);
    else if (k === "category") { if (g) keep.push(g); keep.push(node); }
    else if (k === "vendor") { if (g) keep.push(g); if (c) keep.push(c); keep.push(node); }
    else if (k === "item") { if (g) keep.push(g); if (c) keep.push(c); if (v) keep.push(v); keep.push(node); }
    state.path = keep; state.inspect = node; render();
  }

  function mount() {
    ROOT.innerHTML =
      `<div class="dx-crumbs-row"><div class="dx-crumbs" id="dxCrumbs"></div>` +
      `<div class="dx-rankby"><span>Rank by</span><select id="dxRank"></select></div></div>` +
      `<div class="dx-miller" id="dxMiller"></div>` +
      `<p class="dx-modhint">One left→right read: pick a Group → its Categories → its Items/Vendors → the focused row's full KPIs in the last column. A vendor drills into its items. Hover a pulse bar to name a KPI; click a KPI to rank everything by it.</p>`;

    $("#dxRank").innerHTML = KPIS.map((k) => `<option value="${k.key}">${k.label}</option>`).join("");

    $("#dxMiller").addEventListener("click", (e) => {
      const kpi = e.target.closest("[data-kpi]");
      if (kpi) { state.rankBy = kpi.dataset.kpi; $("#dxRank").value = kpi.dataset.kpi; render(); return; }
      const tog = e.target.closest("[data-mode]");
      if (tog) {
        state.leafMode = tog.dataset.mode;
        const g = state.path.find((n) => n.kind === "group"), c = state.path.find((n) => n.kind === "category");
        state.path = [g, c].filter(Boolean);
        state.inspect = c || g || null;
        render(); return;
      }
      const pulse = e.target.closest("[data-pulse]");
      if (pulse) { state.inspect = nodeById(pulse.dataset.pulse); render(); e.stopPropagation(); return; }
      const row = e.target.closest("[data-node]");
      if (!row) return;
      drillTo(nodeById(row.dataset.node));
    });

    $("#dxCrumbs").addEventListener("click", (e) => {
      const c = e.target.closest("[data-crumb]"); if (!c) return;
      if (c.dataset.crumb === "__root") { state.path = []; state.inspect = null; render(); return; }
      const node = nodeById(c.dataset.crumb);
      const idx = state.path.indexOf(node);
      state.path = state.path.slice(0, idx + 1);
      state.inspect = node; render();
    });

    $("#dxRank").addEventListener("change", (e) => { state.rankBy = e.target.value; render(); });

    render();
  }

  /* Public hook to feed real hierarchy data later. */
  window.DxDrill = {
    load(depts) { TREE = buildTree(depts); state.deptIdx = 0; state.path = []; state.inspect = null; state.leafMode = "items"; render(); },
  };

  mount();
})();
