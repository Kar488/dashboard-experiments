const statusData = [
  ["Approved", 47, "var(--green)"],
  ["Submitted", 29, "#60a5fa"],
  ["Pending", 18, "#cbd5e1"],
  ["Rejected", 6, "var(--red)"]
];

const compositionData = [
  ["Units Plan", 34, "var(--blue)"],
  ["Revenue Plan", 27, "#60a5fa"],
  ["AGP Plan", 21, "#93c5fd"],
  ["Household Plan", 8, "var(--purple)"],
  ["Mixed / Customized", 10, "#cbd5e1"]
];

const planCards = [
  { title: "Units Plan", tag: "Source Plan", tone: "green", sub: "Optimized for unit lift", ncrc: "312 NCRCs", revenue: "$5.8M", agp: "$2.1M", units: "5.86M", rate: "38.2%", rateLy: "36.1% LY", rateDelta: "+2.1pp", depth: "22.0%", depthLy: "20.5% LY", depthDelta: "+1.5pp", discount: "14.5%", discountLy: "13.2% LY", discountDelta: "+1.3pp" },
  { title: "Revenue Plan", tag: "Source Plan", tone: "green", sub: "Optimized for revenue", ncrc: "248 NCRCs", revenue: "$5.6M", agp: "$2.0M", units: "5.52M", rate: "37.1%", rateLy: "36.1% LY", rateDelta: "+1.0pp", depth: "21.0%", depthLy: "20.5% LY", depthDelta: "+0.5pp", discount: "13.8%", discountLy: "13.2% LY", discountDelta: "+0.6pp" },
  { title: "AGP Plan", tag: "Source Plan", tone: "green", sub: "Optimized for AGP", ncrc: "193 NCRCs", revenue: "$5.5M", agp: "$1.95M", units: "5.34M", rate: "36.4%", rateLy: "36.1% LY", rateDelta: "+0.3pp", depth: "20.0%", depthLy: "20.5% LY", depthDelta: "-0.5pp", discount: "13.1%", discountLy: "13.2% LY", discountDelta: "-0.1pp" },
  { title: "Revised Mixed Plan", tag: "Final Plan", tone: "blue", selected: true, sub: "Merchant revised selection", ncrc: "918 NCRCs", revenue: "$5.4M", agp: "$1.9M", units: "5.17M", rate: "35.7%", rateLy: "36.1% LY", rateDelta: "-0.4pp", depth: "19.0%", depthLy: "20.5% LY", depthDelta: "-1.5pp", discount: "11.2%", discountLy: "13.2% LY", discountDelta: "-2.0pp" },
  { title: "Pending Plan Submission", tag: "No Submitted", tone: "gray", sub: "To be submitted to APEX / OMS", notEvaluated: true, ncrc: "124 NCRCs", revenue: "124", agp: "18", units: "11", rate: "NCRCs", depth: "Categories", discount: "Vendors" }
];

const coverage = [
  ["NCRC", "918", "76% complete", "NCRCs"],
  ["CIG", "143", "81% complete", "CIGs"],
  ["CIC", "327", "74% complete", "CICs"],
  ["UPC", "2,840", "69% complete", "UPCs"],
  ["Vendors", "126", "72% complete"],
  ["Allowance $", "$1.25M", "9.6% of promo sales"],
  ["Markdown $", "$514.7K", "net investment"]
];

const rollups = [
  ["Dairy & Refrigerated", "department", "219 NCRCs", "$1.78M", "284K", "$498K", "32.1%", "14.6K", "$168K", "$49K", "29%", "watch", "74%"],
  ["Yogurt", "category", "33 NCRCs", "$257K", "39.6K", "$72K", "35.2%", "2.6K", "$20K", "$5.8K", "30%", "ok", "82%"],
  ["Milk", "category", "24 NCRCs", "$221K", "34.0K", "$62K", "32.1%", "2.2K", "$27K", "$8.0K", "30%", "ok", "79%"],
  ["Cheese", "category", "43 NCRCs", "$243K", "37.4K", "$68K", "28.9%", "2.4K", "$20K", "$5.9K", "30%", "watch", "68%"],
  ["Fresh Produce", "department", "326 NCRCs", "$1.25M", "188K", "$350K", "30.2%", "12.8K", "$131K", "$39K", "30%", "watch", "71%"],
  ["Apples", "category", "31 NCRCs", "$33K", "5.1K", "$9K", "27.9%", "0.3K", "$3K", "$0.6K", "22%", "bad", "61%"],
  ["Bananas", "category", "32 NCRCs", "$33K", "5.1K", "$9K", "28.2%", "0.3K", "$3K", "$0.6K", "22%", "ok", "88%"],
  ["Berries", "category", "6 NCRCs", "$33K", "5.1K", "$9K", "31.2%", "0.3K", "$3K", "$0.6K", "22%", "ok", "83%"],
  ["Prepared Foods", "department", "154 NCRCs", "$581K", "89K", "$164K", "33.4%", "5.8K", "$60K", "$18K", "30%", "bad", "64%"],
  ["Total", "total", "918 NCRCs", "$5.21M", "802K", "$1.46M", "28.0%", "52K", "$515K", "$154K", "30%", "watch", "76%"]
];

const notEvaluated = [
  ["NCRC-0041", "Organic Fuji Apples - Bulk Display", "40 lb", "72 ct"],
  ["NCRC-0078", "Seedless Green Grapes - Clamshell", "12/2 lb", "2 lb"],
  ["NCRC-0113", "Navel Oranges - Mesh Bag", "8/5 lb", "5 lb"],
  ["NCRC-0156", "Roma Tomatoes - Bulk", "25 lb", "Loose"],
  ["NCRC-0189", "Broccoli Crown - Pre-Pack", "12 ct", "~1.5 lb"],
  ["NCRC-0204", "Russet Potatoes - Bag", "6/5 lb", "5 lb"],
  ["NCRC-0237", "Yellow Onions - Net Bag", "10/3 lb", "3 lb"],
  ["NCRC-0261", "Honeycrisp Apples - Tray Pack", "12 ct", "~0.5 lb"]
];

const scopeLists = {
  NCRC: [
    ["Bin 1", "NCRC-0041", "Banana Protein 24oz", "Siggi's", "$381.9K"],
    ["Bin 1", "NCRC-0078", "Raspberry Protein 32oz", "Tillamook", "$369.2K"],
    ["Bin 1", "NCRC-0113", "Mixed Berry Protein 4pk", "Chobani", "$366.8K"],
    ["Bin 2", "NCRC-0156", "Caramel Protein 12pk", "Stonyfield", "$361.0K"],
    ["Bin 2", "NCRC-0189", "Coffee Probiotic 16oz", "Lifeway", "$360.2K"]
  ],
  CIG: [
    ["Core", "CIG-8402", "Apples", "Produce", "$1.24M"],
    ["Core", "CIG-8415", "Tropical Fruit", "Produce", "$982K"],
    ["Core", "CIG-8406", "Bananas", "Produce", "$892K"],
    ["Watch", "CIG-8476", "Fresh Cut", "Produce", "$724K"]
  ],
  CIC: [
    ["Class A", "CIC-304", "Pharmacy Support", "Jewel", "$612K"],
    ["Class A", "CIC-309", "Delicatessen", "Jewel", "$534K"],
    ["Class B", "CIC-314", "Dairy", "Jewel", "$423K"]
  ],
  UPC: [
    ["Bin 1", "0200006708", "Boar's Head Turkey Breast 1 LB", "BOAR'S HEAD", "$1.15M"],
    ["Bin 1", "073210101001", "Private Label Deli Ham 1 LB", "OWN BRANDS", "$982K"],
    ["Bin 2", "02700002011", "Sara Lee Oven Roasted Turkey 1 LB", "SARA LEE", "$872K"]
  ]
};

const allowanceLadder = [
  ["Base Cost", "+ $3.16", "+ $3.22", "base"],
  ["Off Invoice Allowance", "- $0.10", "- $0.08", "allowance"],
  ["Bill Back Allowance", "- $0.00", "- $0.02", "allowance"],
  ["Price Break Allowance", "- $0.00", "- $0.01", "allowance"],
  ["Freight Allowance", "- $0.00", "- $0.00", "allowance"],
  ["Other Allowance", "- $0.00", "- $0.01", "allowance"],
  ["a. Net Cost (Bill Out cost)", "$3.06", "$3.10", "subtotal"],
  ["Ship to Store Allowance", "- $0.04", "- $0.05", "allowance"],
  ["Transaction Allowance", "- $0.00", "- $0.01", "allowance"],
  ["Flat Allowance", "- $0.17", "- $0.18", "allowance"],
  ["New Item Allowance", "- $0.00", "- $0.00", "allowance"],
  ["b. Total Retail Allowances", "- $0.21", "- $0.25", "subtotal"],
  ["c. Dead Net Cost", "$2.85", "$2.85", "subtotal"],
  ["d. Retail (Regular)", "$5.84", "$5.89", "base"],
  ["Promotional Retail", "$4.96", "$5.02", "allowance"],
  ["Bill-Out Gross", "$1.90", "$1.92", "base"],
  ["Dead Net Gross", "$2.11", "$2.17", "base"],
  ["Bill-Out Gross Compression", "+ $0.21", "+ $0.25", "compression"]
];

const interactions = [
  ["NCRC-0041", "68118885973", "Cannibalize", "-5.2%", "2,418", "1,026", "W2, W3, W5", "-21 units / -$135.63 / +$7.25 AGP"],
  ["NCRC-0041", "189689051551", "Cannibalize", "-2.8%", "884", "411", "W3, W6", "-2 units / -$9.80 / -$1.40 AGP"],
  ["NCRC-0078", "68118885974", "Cannibalize", "-1.7%", "612", "285", "W1, W4", "-1 unit / -$3.44 / -$0.96 AGP"],
  ["NCRC-0113", "NCRC-0204", "Complement", "+7.4%", "3,921", "1,642", "W1, W2, W4", "+42 units / +$8.8K / +$2.1K AGP"],
  ["NCRC-0113", "NCRC-0237", "Complement", "+5.9%", "2,780", "1,204", "W2, W5", "+31 units / +$6.4K / +$1.5K AGP"]
];

const weeks = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"];
const statuses = ["Approved", "Submitted", "Pending", "Rejected"];

function pointClass(value) {
  return String(value).trim().startsWith("-") ? "negative" : "positive";
}

function renderPlanCards() {
  document.getElementById("planCards").innerHTML = planCards.map((card) => `
    <article class="plan-card ${card.selected ? "selected" : ""}">
      <div class="plan-title"><h2>${card.title}</h2><span class="pill ${card.tone}">${card.tag}</span></div>
      <p>${card.sub}</p>
      <div class="plan-count">${card.ncrc}</div>
      <div class="plan-metrics">
        <div><span>${card.notEvaluated ? "NCRCs" : "Revenue"}</span><strong>${card.revenue}</strong></div>
        <div><span>${card.notEvaluated ? "Categories" : "AGP"}</span><strong>${card.agp}</strong></div>
        <div><span>${card.notEvaluated ? "Vendors" : "Units"}</span><strong>${card.units}</strong></div>
      </div>
      <div class="plan-kpis">
        <div><span>${card.notEvaluated ? "" : "Promo Rate"}</span><strong>${card.rate}</strong>${card.rateLy ? `<small>${card.rateLy}</small><em class="${pointClass(card.rateDelta)}">${card.rateDelta}</em>` : ""}</div>
        <div><span>${card.notEvaluated ? "" : "Avg Depth"}</span><strong>${card.depth}</strong>${card.depthLy ? `<small>${card.depthLy}</small><em class="${pointClass(card.depthDelta)}">${card.depthDelta}</em>` : ""}</div>
        <div><span>${card.notEvaluated ? "" : "Deep Disc."}</span><strong>${card.discount}</strong>${card.discountLy ? `<small>${card.discountLy}</small><em class="${pointClass(card.discountDelta)}">${card.discountDelta}</em>` : ""}</div>
      </div>
      ${card.notEvaluated ? `<button class="not-evaluated-link" data-open-not-evaluated>View 124 NCRCs</button>` : ""}
    </article>`).join("");
}

function renderStackedBar(target, legendTarget, data) {
  document.getElementById(target).innerHTML = data.map(([label, value, color]) => `<span style="width:${value}%;background:${color}" title="${label} ${value}%"></span>`).join("");
  document.getElementById(legendTarget).innerHTML = data.map(([label, value, color]) => `<div><span class="dot" style="background:${color}"></span><span>${label}</span><strong>${value}%</strong></div>`).join("");
}

function renderCoverage() {
  document.getElementById("coverageCards").innerHTML = coverage.map(([label, value, sub, listLabel], index) => `
    <article class="coverage-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${sub}</p>
      ${index < 4 ? `<button data-open-scope="${label}">View ${listLabel}</button><button data-open-detail="${label}">Status by week</button>` : ""}
    </article>`).join("");
}

function statusPill(status) {
  const klass = status === "Approved" ? "ok" : status === "Rejected" ? "bad" : "warn";
  return `<span class="status-pill ${klass}">${status}</span>`;
}

function renderRollups() {
  document.getElementById("rollupRows").innerHTML = rollups.map((row, index) => {
    const [name, level, ncrc, sales, units, agp, agpRate, hhs, markdown, allowances, recovery, status, approved] = row;
    return `<tr class="${level}-row" data-row-index="${index}" data-category="${name}">
      <td><div class="row-title">${level === "category" ? "&nbsp;&nbsp;- " : ""}${name}</div><div class="row-sub">${level === "total" ? "Desk subtotal" : level === "department" ? "Department subtotal" : "Category rollup"}</div></td>
      <td><button class="ncrc-link" data-open-detail="${name}">${ncrc}</button><div class="mini-status"><div style="--approved:47%;--submitted:76%;--pending:94%;--rejected:100%"></div><small>47% approved · 29% submitted</small></div></td>
      <td>${sales}<small class="positive">+$86K</small></td>
      <td>${units}<small class="positive">+13.3K</small></td>
      <td>${agp}<small class="positive">+$24K</small></td>
      <td>${agpRate}</td>
      <td>${hhs}<small class="positive">+0.9K</small></td>
      <td>${markdown}</td>
      <td><button class="ladder-button" data-open-ladder="${name}" aria-label="Open allowance ladder"><span></span></button>${allowances}</td>
      <td>${recovery}</td>
      <td><strong>${approved}</strong></td>
    </tr>`;
  }).join("");
}

function renderNotEvaluated() {
  document.getElementById("notEvaluatedRows").innerHTML = notEvaluated.map((row) => `<tr>${row.map((cell, index) => `<td>${index === 0 ? `<a href="#">${cell}</a>` : cell}</td>`).join("")}</tr>`).join("");
}

function openScope(kind = "NCRC") {
  const rows = scopeLists[kind] || scopeLists.NCRC;
  document.getElementById("scopeTitle").textContent = `${kind} Scope`;
  document.getElementById("scopeSub").textContent = `${rows.length} representative ${kind} records in this desk.`;
  document.getElementById("scopeRows").innerHTML = rows.map((row, index) => {
    const metrics = [`${(42.1 + index * 7).toFixed(1)}K`, `$${(18.6 + index * 4).toFixed(1)}K`, `${(1.2 + index * 0.3).toFixed(1)}K`];
    return `<tr>${row.map((cell, cellIndex) => `<td>${cellIndex === 1 ? `<a href="#">${cell}</a>` : cell}</td>`).join("")}${metrics.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
  }).join("");
  document.getElementById("scopeOverlay").hidden = false;
}

function buildNcrcRow(weekIndex, itemIndex) {
  const status = statuses[(weekIndex + itemIndex) % statuses.length];
  const region = ["East", "West", "North", "South", "Central"][(weekIndex + itemIndex) % 5];
  const upc = String(670000 + weekIndex * 37 + itemIndex * 111).padStart(8, "0");
  const cig = `CIG-${8400 + ((weekIndex + itemIndex) % 5)}`;
  return {
    week: `Week ${weekIndex + 1}`,
    cig,
    region,
    status,
    item: `Apples Item ${itemIndex + 1}`,
    ncrc: `NCRC-${String(410 + weekIndex * 12 + itemIndex).padStart(4, "0")}`,
    upc,
    revenue: `$${(28 + weekIndex * 3 + itemIndex * 1.6).toFixed(1)}K`,
    units: `${(4.2 + itemIndex * 0.4).toFixed(1)}K`,
    agp: `$${(8.4 + itemIndex * 0.7).toFixed(1)}K`,
    hhs: `${(0.3 + itemIndex * 0.1).toFixed(1)}K`,
    apex: `MI-${7400 + weekIndex * 18 + itemIndex}`,
    oms: `PM-${9100 + weekIndex * 21 + itemIndex}`,
    issue: status === "Rejected" ? "Downstream error" : status === "Pending" ? "Not submitted" : "Ready"
  };
}

function detailRows() {
  return weeks.flatMap((_, weekIndex) => Array.from({ length: weekIndex === 2 ? 2 : 6 }, (_, itemIndex) => buildNcrcRow(weekIndex, itemIndex)));
}

function renderDetailRows(statusFilter = "All", collapsed = false) {
  const rows = detailRows().filter((row) => statusFilter === "All" || row.status === statusFilter);
  if (collapsed) {
    const groups = rows.reduce((acc, row) => {
      acc[row.cig] ||= { count: 0, revenue: 0, approved: 0 };
      acc[row.cig].count += 1;
      acc[row.cig].revenue += Number(row.revenue.replace("$", "").replace("K", ""));
      if (row.status === "Approved") acc[row.cig].approved += 1;
      return acc;
    }, {});
    return Object.entries(groups).map(([cig, data]) => `<tr class="cig-row"><td>${cig}</td><td colspan="3">${data.count} NCRCs collapsed</td><td>$${data.revenue.toFixed(1)}K</td><td colspan="3">${Math.round((data.approved / data.count) * 100)}% approved</td><td colspan="3"><button data-cig-toggle>Expand NCRCs</button></td></tr>`).join("");
  }
  return rows.map((row) => `<tr>
    <td>${row.week}</td>
    <td>${row.cig}</td>
    <td><strong>${row.item}</strong><small>${row.ncrc} / UPC ${row.upc}</small></td>
    <td>${row.region}</td>
    <td>${statusPill(row.status)}</td>
    <td>${row.revenue}</td>
    <td>${row.units}</td>
    <td>${row.agp}</td>
    <td>${row.hhs}</td>
    <td><a href="#">APEX ${row.apex}</a><small>${row.issue}</small></td>
    <td><a href="#">OMS ${row.oms}</a></td>
  </tr>`).join("");
}

function openDetail(category = "Fresh Produce - Fruits") {
  const content = document.getElementById("detailContent");
  content.innerHTML = `
    <h2>${category} - NCRC Execution Details</h2>
    <p>31 NCRCs across 6 weeks. APEX and OMS links open downstream plans populated with promotion data.</p>
    <div class="detail-toolbar">
      <button class="active" data-detail-status="All">All</button>
      <button data-detail-status="Approved">Approved</button>
      <button data-detail-status="Submitted">Submitted</button>
      <button data-detail-status="Pending">Pending</button>
      <button data-detail-status="Rejected">Rejected</button>
      <button data-cig-toggle>Aggregate by CIG</button>
    </div>
    <div class="drawer-summary compact">
      <div><span>Approved</span><strong class="positive">47%</strong></div>
      <div><span>Submitted</span><strong>29%</strong></div>
      <div><span>Pending</span><strong>18%</strong></div>
      <div><span>Rejected</span><strong class="negative">6%</strong></div>
    </div>
    <div class="detail-table-wrap">
      <table class="detail-table">
        <thead><tr><th>Week</th><th>CIG</th><th>NCRC / Item</th><th>Region</th><th>Status</th><th>Revenue</th><th>Units</th><th>AGP</th><th>HHs</th><th>APEX</th><th>OMS</th></tr></thead>
        <tbody id="detailRows">${renderDetailRows()}</tbody>
      </table>
    </div>`;
  content.dataset.statusFilter = "All";
  content.dataset.collapsed = "false";
  document.getElementById("detailOverlay").hidden = false;
}

function openLadder(category = "Yogurt") {
  const benchmark = document.getElementById("benchmarkDivision").value;
  document.getElementById("ladderContent").innerHTML = `
    <h2>Allowance Ladder</h2>
    <p>${category} - Revised mixed plan - benchmarked against ${benchmark}</p>
    <div class="ladder-list ladder-table">
      <div class="ladder-head"><span>Cost element</span><strong>This plan</strong><strong>${benchmark}</strong></div>
      ${allowanceLadder.map(([label, value, bench, type]) => `<div class="${type}"><span>${label}</span><strong>${value}</strong><strong>${bench}</strong></div>`).join("")}
    </div>
    <section class="allowance-impact">
      <h3>Allowance Impact</h3>
      <div><span>Customer take rate</span><strong>42.5%</strong></div>
      <div><span>Allowance per unit</span><strong>$0.21</strong></div>
      <div><span>Projected promo units</span><strong>5,249</strong></div>
      <div class="impact-total"><span>Projected allowance gain</span><strong>$468.47</strong></div>
      <p>${benchmark} recovery is 34%; this plan recovers 30%, leaving a 4pp funding gap to close.</p>
    </section>`;
  document.getElementById("ladderOverlay").hidden = false;
}

function openInteractions() {
  document.getElementById("interactionRows").innerHTML = interactions.map((row) => `<tr>${row.map((cell, index) => {
    const klass = cell === "Complement" ? "positive" : cell === "Cannibalize" ? "negative" : "";
    return `<td class="${index === 2 ? klass : ""}">${cell}</td>`;
  }).join("")}</tr>`).join("");
  document.getElementById("interactionsOverlay").hidden = false;
}

function updateScope() {
  const scope = document.getElementById("scopeSelect").value;
  const benchmark = document.getElementById("benchmarkDivision").value;
  document.getElementById("scopeLabel").textContent = scope === "division" ? "Total division: all departments and categories" : "Desk view: Dairy & Refrigerated categories";
  document.getElementById("benchmarkText").textContent = `Allowance collection vs ${benchmark}.`;
  document.getElementById("heroTitle").textContent = scope === "division" ? "Total division revised mixed plan protects $38.6M revenue" : "Revised mixed plan protects $5.4M revenue and 5.17M units";
  document.getElementById("completionScore").textContent = scope === "division" ? "1.31x" : "1.42x";
  document.getElementById("recoveryScore").textContent = benchmark.includes("California") ? "Good" : "Fair";
}

function bindEvents() {
  document.getElementById("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    document.getElementById("themeToggle").textContent = document.body.classList.contains("dark") ? "Light Mode" : "Dark Mode";
  });
  document.getElementById("scopeSelect").addEventListener("change", updateScope);
  document.getElementById("benchmarkDivision").addEventListener("change", updateScope);
  document.body.addEventListener("click", (event) => {
    const notEvaluatedButton = event.target.closest("[data-open-not-evaluated]");
    if (notEvaluatedButton) document.getElementById("notEvaluatedOverlay").hidden = false;
    const detailButton = event.target.closest("[data-open-detail]");
    if (detailButton) openDetail(detailButton.dataset.openDetail);
    const scopeButton = event.target.closest("[data-open-scope]");
    if (scopeButton) openScope(scopeButton.dataset.openScope);
    const ladderButton = event.target.closest("[data-open-ladder]");
    if (ladderButton) openLadder(ladderButton.dataset.openLadder);
    const detailStatus = event.target.closest("[data-detail-status]");
    if (detailStatus) {
      document.querySelectorAll("[data-detail-status]").forEach((button) => button.classList.remove("active"));
      detailStatus.classList.add("active");
      document.getElementById("detailContent").dataset.statusFilter = detailStatus.dataset.detailStatus;
      document.getElementById("detailRows").innerHTML = renderDetailRows(detailStatus.dataset.detailStatus, document.getElementById("detailContent").dataset.collapsed === "true");
    }
    const cigToggle = event.target.closest("[data-cig-toggle]");
    if (cigToggle && document.getElementById("detailRows")) {
      const content = document.getElementById("detailContent");
      content.dataset.collapsed = content.dataset.collapsed === "true" ? "false" : "true";
      cigToggle.textContent = content.dataset.collapsed === "true" ? "Expand NCRCs" : "Aggregate by CIG";
      document.getElementById("detailRows").innerHTML = renderDetailRows(content.dataset.statusFilter || "All", content.dataset.collapsed === "true");
    }
    const row = event.target.closest("#rollupRows tr");
    if (row && !event.target.closest("button")) openDetail(row.dataset.category);
  });
  document.getElementById("openInteractions").addEventListener("click", openInteractions);
  document.getElementById("closeDetail").addEventListener("click", () => document.getElementById("detailOverlay").hidden = true);
  document.getElementById("closeNotEvaluated").addEventListener("click", () => document.getElementById("notEvaluatedOverlay").hidden = true);
  document.getElementById("closeNotEvaluatedBottom").addEventListener("click", () => document.getElementById("notEvaluatedOverlay").hidden = true);
  document.getElementById("closeScope").addEventListener("click", () => document.getElementById("scopeOverlay").hidden = true);
  document.getElementById("closeScopeBottom").addEventListener("click", () => document.getElementById("scopeOverlay").hidden = true);
  document.getElementById("closeLadder").addEventListener("click", () => document.getElementById("ladderOverlay").hidden = true);
  document.getElementById("closeInteractions").addEventListener("click", () => document.getElementById("interactionsOverlay").hidden = true);
  document.getElementById("closeInteractionsBottom").addEventListener("click", () => document.getElementById("interactionsOverlay").hidden = true);
  document.querySelectorAll(".overlay").forEach((overlay) => overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.hidden = true;
  }));
}

renderPlanCards();
renderStackedBar("statusBar", "statusLegend", statusData);
renderStackedBar("compositionBar", "compositionLegend", compositionData);
renderCoverage();
renderRollups();
renderNotEvaluated();
bindEvents();
updateScope();
