const selectedPeriod = "Last 52 Weeks Completed";
const comparisonPeriod = selectedPeriod.replace("Completed", "").trim().replace("Last", "Last Year");
const CACHE_PREFIX = "merch-dashboard-cache:";
let dashboardApiData = null;
let offlineMode = false;
let pendingAssistantContext = null;
let comparisonMode = "ly";
let comparisonDivision = "Mountain West Division";

// The page used to define every dataset inline. Those constants now
// live in data/dashboardStore.js on the server and are fetched via
// /api/dashboard/bootstrap. We keep this seeded copy as a fallback so
// the first paint never blanks out if the API fails — but every
// renderer reads from the API result the moment it lands.
let primaryMetrics = [
  { label: "Total Sales", icon: "$", value: "$820.39M", previous: "$824.06M", change: "-0.45% (-$3.68M)", accent: "green", trend: [62, 61, 63, 60, 64, 66, 67, 70, 68, 69, 72, 71], split: ["Store $704.8M", "Ecom $115.6M"], drivers: ["Top: Citrus +$3.5M", "Watch: Snacking -$1.3M"], modal: "sales" },
  { label: "Total Units", icon: "U", value: "357.79M", previous: "348.90M", change: "+2.55% (+8.88M)", accent: "blue", trend: [44, 47, 43, 50, 48, 55, 57, 62, 60, 63, 61, 64], split: ["Store 302.1M", "Ecom 55.7M"], drivers: ["Top: Avocado +8.48M", "Watch: Onions -818K"], modal: "units" },
  { label: "AGP", icon: "%", value: "34.02%", previous: "34.30%", change: "-0.25pp (-$2.44M)", accent: "purple", trend: [35, 34, 36, 33, 38, 35, 37, 36, 35, 34, 35, 34], split: ["Store 34.4%", "Ecom 31.8%"], drivers: ["Top: Tropical Fruit +$2.46M", "Watch: Cherries -$2.63M"], modal: "agp" },
  { label: "AIV", icon: "A", value: "$2.29", previous: "$2.36", change: "-2.92% (-$0.07)", accent: "teal", trend: [2.36, 2.34, 2.33, 2.31, 2.29, 2.30, 2.28, 2.27, 2.29, 2.28, 2.30, 2.29], split: ["Store $2.24", "Ecom $2.61"], drivers: ["Top: Premium Beverages +$0.16", "Watch: Apples -$0.11"], modal: "sales" },
  { label: "AGP Dollar", icon: "G", value: "$279.97M", previous: "$282.41M", change: "-0.86% (-$2.44M)", accent: "violet", trend: [40, 42, 41, 39, 43, 44, 42, 45, 44, 43, 41, 40], split: ["Store $239.6M", "Ecom $40.4M"], drivers: ["Top: Bananas +$1.88M", "Watch: Berries -$3.43M"], modal: "agp" },
  { label: "Household Penetration", icon: "H", value: "42.7%", previous: "40.8%", change: "+4.7% (+1.9pp)", accent: "blue", trend: [33, 35, 34, 36, 38, 39, 40, 39, 41, 42, 41, 43], split: [], drivers: ["Top: Organic Veg +0.0pp", "Watch: Fresh Cut -45.4pp"], modal: "household" },
  { label: "Market Share", icon: "M", value: "25.88%", previous: "26.20%", change: "-0.3pp (-$4.88M)", accent: "orange", trend: [27, 26.9, 26.7, 26.6, 26.2, 26.1, 25.9, 26.0, 25.8, 25.9, 25.7, 25.88], split: [], drivers: ["Outperforming: 17 categories", "At risk: 19 categories"], modal: "share" }
];

let secondaryMetrics = [
  ["Avg Basket Spend", "$47.82", "$45.67", "+3.2%", "green"],
  ["Items per Basket", "12.4", "13.5", "-1.1%", "red"],
  ["Household Trips/Week", "2.8", "2.6", "+5.3%", "green"],
  ["% Items in Basket (Produce)", "34.2%", "33.5%", "+1.8%", "green"],
  ["$ Value in Basket (Produce)", "$16.35", "$15.20", "+4.1%", "green"],
  ["% Households buying at least once/week", "42.7%", "40.8%", "+4.7%", "green"],
  ["% Revenue from Top 100 Items", "67.8%", "68.3%", "-0.5%", "red"]
];

let detailViews = {
  top: [
    ["King's Hawaiian Rolls 12 OZ", "3257 / King's Hawaiian / NCRC 913 / UPC 073210003257", "OWN BRANDS", "BG", "$2.42M", "+13.1%", "918.3K", "+11.4%", "49.8%", "+1.8pp", "$2.11M", "+15.5%", "43.2%", "+2.2pp", "31.2%", "+0.6pp", "$352.0K", "+42.7%", "$1.13M", "+57.7%"],
    ["Boar's Head Turkey Breast 1 LB", "6708 / Boar's Head / NCRC 159 / UPC 0200006708", "BOAR'S HEAD", "FG", "$1.15M", "-2.4%", "487.8K", "-15.1%", "57.6%", "+1.1pp", "$661.1K", "+6.2%", "14.5%", "-0.6pp", "25.7%", "-0.3pp", "$24.7K", "-49.0%", "$66.1K", "-50.5%"],
    ["Private Label Deli Ham 1 LB", "PL101 / Own Brands / NCRC 943 / UPC 073210101001", "OWN BRANDS", "BG", "$982.1K", "+8.6%", "376.4K", "+9.8%", "48.1%", "+0.9pp", "$472.3K", "+10.1%", "12.3%", "+0.8pp", "22.4%", "+0.4pp", "$212.4K", "+15.3%", "$48.2K", "+22.1%"],
    ["Tyson Grilled Chicken Strips 22 OZ", "TY205 / Tyson Foods / NCRC 245 / UPC 023000245205", "TYSON FOODS", "BG", "$756.2K", "+6.4%", "288.7K", "+7.3%", "43.2%", "+1.2pp", "$326.7K", "+8.8%", "9.5%", "+0.5pp", "18.1%", "+0.2pp", "$95.1K", "+10.8%", "$31.6K", "+18.6%"]
  ],
  under: [
    ["Sara Lee Oven Roasted Turkey 1 LB", "SL114 / Sara Lee / NCRC 214", "SARA LEE", "FG", "$872.0K", "-3.6%", "318.2K", "-6.8%", "42.4%", "-1.4pp", "$369.7K", "-7.2%", "10.4%", "-1.1pp", "17.0%", "-0.8pp", "$119.1K", "+8.9%", "$41.5K", "-18.2%"],
    ["Kretschmar Turkey 1 LB", "KR130 / Kretschmar / NCRC 327", "KRETSCHMAR", "FG", "$681.0K", "-5.2%", "231.8K", "-9.1%", "39.8%", "-2.0pp", "$271.0K", "-10.4%", "7.2%", "-0.8pp", "14.1%", "-1.3pp", "$88.0K", "+12.4%", "$29.2K", "-23.4%"]
  ],
  funding: [
    ["Boar's Head Turkey Breast 1 LB", "6708 / Boar's Head / NCRC 159 / UPC 0200006708", "BOAR'S HEAD", "FG", "$1.15M", "-2.4%", "487.8K", "-15.1%", "57.6%", "+1.1pp", "$661.1K", "+6.2%", "14.5%", "-0.6pp", "25.7%", "-0.3pp", "$24.7K", "-49.0%", "$66.1K", "-50.5%"],
    ["Kretschmar Ham Off The Bone 1 LB", "KR101 / Kretschmar / NCRC 37", "KRETSCHMAR", "FG", "$1.08M", "+6.3%", "412.1K", "+3.2%", "60.2%", "+1.8pp", "$651.6K", "+9.4%", "13.6%", "+1.1pp", "20.5%", "+0.1pp", "$842.8K", "+20.7%", "$63.0K", "+38.8%"]
  ],
  healthy: [
    ["Private Label Deli Ham 1 LB", "PL101 / Own Brands / NCRC 943", "OWN BRANDS", "BG", "$982.1K", "+8.6%", "376.4K", "+9.8%", "48.1%", "+0.9pp", "$472.3K", "+10.1%", "12.3%", "+0.8pp", "22.4%", "+0.4pp", "$212.4K", "+15.3%", "$48.2K", "+22.1%"],
    ["Tyson Grilled Chicken Strips 22 OZ", "TY205 / Tyson Foods / NCRC 245", "TYSON FOODS", "BG", "$756.2K", "+6.4%", "288.7K", "+7.3%", "43.2%", "+1.2pp", "$326.7K", "+8.8%", "9.5%", "+0.5pp", "18.1%", "+0.2pp", "$95.1K", "+10.8%", "$31.6K", "+18.6%"]
  ]
};

let performanceTables = {
  sales: [
    ["Boar's Head Turkey Breast 1 LB", "$1.15M", "$1.27M", "-$120K", "-9.4%", "-2.4%"],
    ["Private Label Deli Ham 1 LB", "$982K", "$904K", "+$78K", "+8.6%", "+8.6%"],
    ["Sara Lee Oven Roasted Turkey 1 LB", "$872K", "$905K", "-$33K", "-3.6%", "-6.2%"],
    ["Kretschmar Ham Off The Bone 1 LB", "$1.08M", "$1.02M", "+$64K", "+6.3%", "+10.9%"]
  ],
  units: [
    ["Boar's Head Turkey Breast 1 LB", "487.8K", "574.5K", "-86.7K", "-15.1%", "-7.3%"],
    ["Private Label Deli Ham 1 LB", "376.4K", "342.8K", "+33.6K", "+9.8%", "+8.2%"],
    ["Sara Lee Oven Roasted Turkey 1 LB", "318.2K", "341.4K", "-23.2K", "-6.8%", "-6.1%"]
  ],
  agp: [
    ["Kretschmar Ham Off The Bone 1 LB", "$651.6K", "$595.6K", "+$56K", "+9.4%", "+12.1%"],
    ["Boar's Head Turkey Breast 1 LB", "$661.1K", "$622.5K", "+$38.6K", "+6.2%", "+1.1%"],
    ["Sara Lee Oven Roasted Turkey 1 LB", "$369.7K", "$398.4K", "-$28.7K", "-7.2%", "-8.0%"]
  ]
};

let promoRows = [
  ["Feature", "42", "$1.24M", "+15.6%", "612K", "+11.1%", "$422K", "+7.4%"],
  ["Digital Coupon", "18", "$882K", "+12.3%", "344K", "+7.2%", "$301K", "+4.1%"],
  ["BOGO", "25", "$714K", "+5.4%", "286K", "+2.1%", "$245K", "+1.8%"],
  ["In-Store Display", "31", "$506K", "-2.1%", "194K", "-6.0%", "$171K", "-2.7%"],
  ["Price Discount", "27", "$439K", "-5.8%", "181K", "-1.9%", "$141K", "-4.6%"]
];

let circularRows = [
  ["Boar's Head Turkey Breast 1 LB", "$661K", "287K", "$381K"],
  ["Kretschmar Ham Off The Bone 1 LB", "$652K", "241K", "$393K"],
  ["Private Label Deli Ham 1 LB", "$472K", "199K", "$227K"],
  ["Sara Lee Oven Roasted Turkey 1 LB", "$381K", "158K", "$162K"],
  ["TopLat", "$210K", "91K", "$74K"]
];

let modalDrivers = {
  sales: ["8408 - CITRUS|Promo growth offset base declines to lift sales 8.07%.|+8.1%|+$3.5M", "8404 - AVOCADO|Sales up 6.63% on 73.08% promo unit surge.|+6.6%|+$1.6M", "8406 - BANANAS|Sales up 5.58% despite units down 4.98%.|+5.6%|+$1.6M", "8472 - SNACKING|Sales declined on weaker promotions.|-4.0%|-$1.3M"],
  units: ["8404 - AVOCADO|Units up 48% on 73% stronger promo volume.|+48.4%|+8.48M", "8408 - CITRUS|Double-digit units from promo volume.|+11.3%|+3.96M", "8445 - ONIONS|Promos and base both declined.|-7.0%|818K"],
  agp: ["8415 - TROPICAL FRUIT|AGP up on lower COGS and higher sales.|+620.4%|$2.46M", "8406 - BANANAS|Sales and AGP improved with AIV gains.|+16.3%|$1.88M", "8419 - CHERRIES|COGS pressure reduced AGP dollars.|-64.6%|-$2.63M"],
  household: ["8476 - FRESH CUT|Penetration dropped as HH count fell.|-45.4pp|0.0%", "8406 - BANANAS|Penetration fell with HH count dropping.|-43.4pp|0.0%", "8408 - CITRUS|Penetration decreased as repeat fell.|-42.9pp|0.0%"],
  share: ["Outperforming|17 categories are gaining faster than competitors.|+12.75pp|$71.0K", "At Risk|19 categories declining faster than market.|-4.30pp|-$2.9K", "Contracting Market|Fresh cut outperforming in shrinking category.|+0.03pp|$61.0K"]
};

let currentTrend = [28, 26, 30, 25, 29, 24, 21, 28, 29, 32, 35, 29, 31, 28, 33, 28, 58, 76, 59, 64, 31, 29, 32, 34, 31, 29, 28, 33, 31, 42, 37, 66, 39, 24, 20, 22, 18, 17, 15, 14, 16, 15, 17, 16, 18, 19, 20, 11, 14, 15];
let lastTrend = [41, 36, 32, 35, 34, 39, 31, 29, 31, 30, 34, 32, 29, 31, 27, 28, 39, 55, 51, 61, 52, 39, 38, 32, 34, 28, 29, 31, 29, 36, 32, 52, 64, 27, 28, 31, 27, 26, 22, 18, 19, 17, 21, 26, 24, 27, 23, 20, 22, 24];

function pointClass(value) {
  return String(value).trim().startsWith("-") ? "negative" : "positive";
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function stripHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value);
  return template.content.textContent.trim();
}

function renderPrimaryMetrics() {
  document.getElementById("comparisonText").textContent = comparisonPeriod;
  const metrics = dashboardApiData?.primaryMetrics || primaryMetrics;
  document.getElementById("primaryMetrics").innerHTML = metrics.map((m) => `
    <article class="kpi-card" data-accent="${m.accent}" data-context-type="kpi" data-context-title="${escapeAttr(m.label)}" data-context-current="${escapeAttr(m.value)}" data-context-previous="${escapeAttr(m.previous)}" data-context-change="${escapeAttr(m.change)}" data-context-drivers="${escapeAttr(m.drivers.join(" | "))}">
      <div class="kpi-top">
        <div>
          <div class="kpi-heading"><span class="metric-icon">${m.icon}</span><span>${m.label}</span></div>
          <div class="kpi-value">${m.value}</div>
          <div class="kpi-sub">vs ${m.previous} ${comparisonPeriod}</div>
          <div class="kpi-change ${pointClass(m.change)}">${m.change}</div>
        </div>
        <svg class="sparkline" data-points="${m.trend.join(",")}"></svg>
      </div>
      <div class="channel-split ${m.split.length ? "" : "is-empty"}">${m.split.length ? m.split.map((item) => `<span>${item}</span>`).join("") : "<span></span><span></span>"}</div>
      <div class="inline-drivers">
        <span class="positive">${m.drivers[0]}</span>
        <span class="${m.drivers[1].includes("risk") ? "negative" : pointClass(m.drivers[1].replace("Watch:", "-"))}">${m.drivers[1]}</span>
      </div>
      <button class="driver-link" data-driver-modal="${m.modal}">Explain drivers</button>
    </article>`).join("");
}

function renderSecondaryMetrics() {
  const metrics = dashboardApiData?.secondaryMetrics || secondaryMetrics;
  document.getElementById("secondaryMetrics").innerHTML = metrics.map(([label, value, previous, change, tone]) => `
    <article class="secondary-card" data-accent="${tone === "red" ? "red" : "blue"}">
      <div class="label"><span class="metric-icon">${label[0]}</span><span>${label}</span></div>
      <div class="value">${value}</div>
      <div class="previous">${previous}</div>
      <div class="change ${tone === "red" ? "negative" : "positive"}">vs LY: ${change}</div>
      <div class="tiny-trend">${tone === "red" ? "-\\" : "+/"}</div>
    </article>`).join("");
}

function renderTable(target, headers, rows) {
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((cell) => {
    const value = String(cell).trim();
    const klass = /^[+-]/.test(value) ? pointClass(value) : "";
    return `<td class="${klass}">${cell}</td>`;
  }).join("")}</tr>`).join("");
  document.getElementById(target).innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderSummaryTables(metric = "sales") {
  renderTable("performanceTable", ["Item Description", "Actual", "Plan", "$ Delta", "% Delta", "vs LY Period"], performanceTables[metric]);
  renderTable("promoTable", ["Promotion Type", "# Items", "Sales", "Sales Delta", "Units", "Unit Delta", "AGP", "AGP Delta"], promoRows);
  renderTable("circularTable", ["Item Description", "Sales", "Units", "AGP"], circularRows);
}

function renderItemRows(view = "top") {
  const header = document.querySelector(".wide-table thead tr");
  if (view === "funding") {
    header.innerHTML = ["Vendor", "Health", "Sales", "Units", "AIV", "AGP %", "AGP $", "COGS", "Allowances", "Deadnet Cost", "Sales Mix %", "BOG %", "Markdown %", "Primary Driver"].map((h) => `<th>${h}</th>`).join("");
    document.getElementById("itemRows").innerHTML = [
      ["OWN BRANDS<br><small>913 NCRCs</small>", "On Track", "$24.51M<br><small class='positive'>+10.1%</small>", "39.57M<br><small class='positive'>+1.8%</small>", "$6.18<br><small class='negative'>-1.7%</small>", "48.4%<br><small class='positive'>+1.5pp</small>", "$11.83M<br><small class='positive'>+14.1%</small>", "$135.45M<br><small class='negative'>-0.0%</small>", "$9.31M<br><small class='positive'>+85.3%</small>", "$126.17M<br><small class='negative'>-3.4%</small>", "52.2%<br><small class='negative'>-0.57pp</small>", "61.7%<br><small class='positive'>+1.5pp</small>", "10.4%<br><small class='positive'>+0.90pp</small>", "Private Label Growth"],
      ["BOAR'S HEAD<br><small>159 NCRCs</small>", "Needs review", "$31.09M<br><small class='positive'>+10.9%</small>", "4.41M<br><small class='positive'>+2.1%</small>", "$7.04<br><small class='positive'>+8.5%</small>", "41.9%<br><small class='positive'>+2.57pp</small>", "$13.01M<br><small class='positive'>+18.0%</small>", "$18.08M<br><small class='positive'>+6.1%</small>", "$31.7M<br><small class='negative'>-59.2%</small>", "$18.08M<br><small class='positive'>+6.1%</small>", "6.6%<br><small class='positive'>+0.54pp</small>", "57.7%<br><small class='negative'>-0.66pp</small>", "3.5%<br><small class='negative'>-3.26pp</small>", "Funding Decline"],
      ["KRETSCHMAR<br><small>37 NCRCs</small>", "Needs review", "$10.76M<br><small class='positive'>+17.0%</small>", "1.49M<br><small class='positive'>+8.8%</small>", "$7.21<br><small class='positive'>+7.5%</small>", "60.2%<br><small class='positive'>+1.54pp</small>", "$6.48M<br><small class='positive'>+20.7%</small>", "$4.28M<br><small class='positive'>+10.9%</small>", "$842.8K<br><small class='positive'>+6.3%</small>", "$4.28M<br><small class='positive'>+11.8%</small>", "2.3%<br><small class='positive'>+0.30pp</small>", "0.0%<br><small>0.00pp</small>", "8.4%<br><small class='positive'>+0.80pp</small>", "Volume Growth"]
    ].map((row, index) => `<tr data-row-index="${index}" data-context-type="vendor" data-context-title="${escapeAttr(stripHtml(row[0]))}" data-context-health="${escapeAttr(row[1])}" data-context-sales="${escapeAttr(stripHtml(row[2]))}" data-context-agp="${escapeAttr(stripHtml(row[5]))}" data-context-allowances="${escapeAttr(stripHtml(row[8]))}" data-context-driver="${escapeAttr(row[13])}">${row.map((cell, cellIndex) => `<td${cellIndex === 1 ? `><span class="health ${cell.includes("Needs") ? "needs" : "ok"}">${cell}</span>` : `>${cell}`}</td>`).join("")}</tr>`).join("");
    return;
  }
  header.innerHTML = ["Item / CIG / NCRC / UPC", "Vendor", "Role", "Sales", "Units", "AGP %", "AGP $", "Allowances", "Deadnet Cost", "Sales Mix", "CPI (P-U)", "Markdown $", "Driver"].map((h) => `<th>${h}</th>`).join("");
  const target = document.getElementById("itemRows");
  target.innerHTML = detailViews[view].map((row, index) => {
    const [name, sub, vendor, role, sales, salesChg, units, unitsChg, agp, agpChg, agpDollar, agpDollarChg, household, householdChg, share, shareChg, allowances, allowancesChg, driver, driverChg] = row;
    const deadnet = vendor === "BOAR'S HEAD" ? "$487.6K" : vendor === "KRETSCHMAR" ? "$478.9K" : "$510.2K";
    const cpi = vendor === "BOAR'S HEAD" ? "+1.30" : vendor === "SARA LEE" ? "+1.40" : "+1.10";
    const markdown = vendor === "BOAR'S HEAD" ? "$66.1K" : vendor === "SARA LEE" ? "$72.4K" : "$48.2K";
    return `
      <tr data-row-index="${index}" data-context-type="item" data-context-title="${escapeAttr(name)}" data-context-sub="${escapeAttr(sub)}" data-context-vendor="${escapeAttr(vendor)}" data-context-sales="${escapeAttr(`${sales} ${salesChg}`)}" data-context-units="${escapeAttr(`${units} ${unitsChg}`)}" data-context-agp="${escapeAttr(`${agp} ${agpChg}`)}" data-context-driver="${escapeAttr(`${driver} ${driverChg}`)}">
        <td><div class="item-title">${name}</div><div class="item-sub">${sub}</div></td>
        <td>${vendor}</td><td>${role}</td>
        <td><strong>${sales}</strong><div class="${pointClass(salesChg)}">${salesChg}</div></td>
        <td><strong>${units}</strong><div class="${pointClass(unitsChg)}">${unitsChg}</div></td>
        <td><strong>${agp}</strong><div class="${pointClass(agpChg)}">${agpChg}</div></td>
        <td><strong>${agpDollar}</strong><div class="${pointClass(agpDollarChg)}">${agpDollarChg}</div></td>
        <td><strong>${allowances}</strong><div class="${pointClass(allowancesChg)}">${allowancesChg}</div></td>
        <td><strong>${deadnet}</strong><div class="${pointClass(shareChg)}">${shareChg}</div></td>
        <td><strong>${household}</strong><div class="${pointClass(householdChg)}">${householdChg}</div></td>
        <td><strong>${cpi}</strong><div>flat</div></td>
        <td><strong>${markdown}</strong><div class="${pointClass(driverChg)}">${driverChg}</div></td>
        <td><strong>${driver}</strong><div class="${pointClass(driverChg)}">${driverChg}</div></td>
      </tr>`;
  }).join("");
}

function drawChart(svg, data, options = {}) {
  const width = 900;
  const height = options.height || 260;
  const pad = options.pad || 28;
  const values = data.map(Number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xStep = (width - pad * 2) / (values.length - 1);
  const y = (value) => height - pad - ((value - min) / Math.max(max - min, 1)) * (height - pad * 2);
  const points = values.map((value, index) => [pad + index * xStep, y(value)]);
  const line = smoothPath(points);
  const area = `${line} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`;
  const grid = [0.25, 0.5, 0.75].map((ratio) => `<line class="grid-line" x1="${pad}" x2="${width - pad}" y1="${pad + (height - pad * 2) * ratio}" y2="${pad + (height - pad * 2) * ratio}" />`).join("");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.innerHTML = `${grid}<path class="area" d="${area}"></path><path d="${line}"></path>`;
}

function smoothPath(points) {
  if (points.length < 2) return "";
  const commands = [`M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`];
  for (let index = 0; index < points.length - 1; index++) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current[0] + next[0]) / 2;
    commands.push(`C ${midX.toFixed(1)} ${current[1].toFixed(1)}, ${midX.toFixed(1)} ${next[1].toFixed(1)}, ${next[0].toFixed(1)} ${next[1].toFixed(1)}`);
  }
  return commands.join(" ");
}

function drawDualChart(svg, actual, compare, options = {}) {
  const width = 900;
  const height = options.height || 260;
  const pad = options.pad || 28;
  const values = [...actual, ...compare].map(Number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pathFor = (series) => series.map(Number).map((value, index) => {
    const x = pad + index * ((width - pad * 2) / (series.length - 1));
    const y = height - pad - ((value - min) / Math.max(max - min, 1)) * (height - pad * 2);
    return [x, y];
  });
  const grid = [0.25, 0.5, 0.75].map((ratio) => `<line class="grid-line" x1="${pad}" x2="${width - pad}" y1="${pad + (height - pad * 2) * ratio}" y2="${pad + (height - pad * 2) * ratio}" />`).join("");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.innerHTML = `${grid}<path class="compare" d="${smoothPath(pathFor(compare))}"></path><path d="${smoothPath(pathFor(actual))}"></path><text class="axis-text" x="${width - 180}" y="22">Actual</text><text class="axis-text" x="${width - 105}" y="22">Forecast / LY</text>`;
}

function renderCharts() {
  document.querySelectorAll(".sparkline").forEach((svg) => drawChart(svg, svg.dataset.points.split(","), { height: 64, pad: 8 }));
  document.querySelectorAll(".dual-chart").forEach((svg) => drawDualChart(svg, svg.dataset.actual.split(","), svg.dataset.compare.split(","), { height: 230, pad: 24 }));
  drawDualChart(document.getElementById("weeklyTrend"), currentTrend, lastTrend, { height: 300, pad: 34 });
}

function renderWeekRows() {
  const weeklyDeltas = [
    ["+$718.1K", "+18.4%"],
    ["+$283.6K", "+13.3%"],
    ["+$215.0K", "+11.4%"],
    ["+$441.4K", "+46.6%"],
    ["+$550.3K", "+73.0%"],
    ["+$115.7K", "+12.1%"],
    ["+$89.4K", "+8.3%"],
    ["+$272.3K", "+49.6%"],
    ["+$2.20M", "+6.1%"]
  ];
  const lyValues = ["$3.91M", "$2.13M", "$1.88M", "$947.4K", "$753.8K", "$958.7K", "$1.08M", "$548.7K", "$56.66M"];
  const comparisonLabel = comparisonMode === "division" ? comparisonDivision.replace(" Division", "") : "LY";
  const comparisonMultiplier = comparisonMode === "division" ? 0.82 : 1;
  const adjustDelta = (delta) => {
    if (comparisonMode !== "division" || !delta.startsWith("+")) return delta;
    return delta.replace("+$", "+$").replace(/([\d.]+)(M|K)/, (_, number, suffix) => `${(Number(number) * comparisonMultiplier).toFixed(suffix === "M" ? 2 : 1)}${suffix}`);
  };
  const comparisonPrefix = comparisonMode === "division" ? "Division" : "LY";
  const weekCell = (week, index, rowIndex, isTotal = false) => {
    const [delta, pct] = weeklyDeltas[(index + rowIndex) % weeklyDeltas.length];
    const ly = lyValues[(index + rowIndex) % lyValues.length];
    const shownDelta = adjustDelta(delta);
    const shownPct = comparisonMode === "division" ? pct.replace("+", "+").replace(/([\d.]+)%/, (_, number) => `${(Number(number) * 0.7).toFixed(1)}%`) : pct;
    const klass = pointClass(shownDelta);
    return `<td class="${isTotal ? "total-cell" : ""}">${week}<small>${comparisonPrefix} ${ly}<br><span class="${klass}">${shownDelta} / ${shownPct}</span></small></td>`;
  };
  const rows = [
    ["Sales to Public", "$58.87M", "$56.66M", "+$2.20M", "+3.9%", "$4.63M", "$4.21M", "$4.08M", "$4.44M", "$4.11M", "$4.35M", "$4.55M", "$4.50M", "$58.87M"],
    ["Cost of Sales", "$45.97M", "$43.77M", "+$2.20M", "+5.0%", "$2.38M", "$3.02M", "$3.18M", "$3.12M", "$3.04M", "$3.20M", "$3.28M", "$3.34M", "$45.97M"],
    ["Book Gross", "$24.26M", "$22.31M", "+$1.95M", "+8.7%", "$2.25M", "$1.98M", "$1.91M", "$2.04M", "$1.88M", "$1.97M", "$2.06M", "$2.10M", "$24.26M"],
    ["Markdown", "($10.78M)", "($9.79M)", "-$998K", "-10.2%", "$1.06M", "$974K", "$907K", "$848K", "$842K", "$875K", "$901K", "$930K", "($10.78M)"],
    ["Shrink", "($580.7K)", "($534.4K)", "-$46K", "-8.7%", "$52K", "$48K", "$44K", "$49K", "$51K", "$47K", "$43K", "$45K", "($580.7K)"],
    ["Gross Profit", "$12.89M", "$11.92M", "+$971K", "+8.1%", "$846K", "$921K", "$991K", "$1.02M", "$1.08M", "$1.10M", "$1.14M", "$1.18M", "$12.89M"],
    ["Packaging", "$0", "$0", "$0", "0.0%", "$0", "$0", "$0", "$0", "$0", "$0", "$0", "$0", "$0"],
    ["Retail Allowances", "$5.02M", "$4.61M", "+$407K", "+8.8%", "$29K", "$64K", "$118K", "$96K", "$112K", "$105K", "$109K", "$121K", "$5.02M"],
    ["Real Gross Profit + Other Revenue", "$17.91M", "$16.53M", "+$1.38M", "+8.4%", "$1.34M", "$1.41M", "$1.50M", "$1.52M", "$1.57M", "$1.61M", "$1.66M", "$1.72M", "$17.91M"],
    ["Units", "9.22M", "8.66M", "+560K", "+6.5%", "903K", "778K", "692K", "538K", "494K", "376K", "356K", "378K", "9.22M"],
    ["AIV", "$3.67", "$3.61", "+$0.06", "+1.7%", "$5.13", "$5.03", "$3.03", "$2.58", "$2.64", "$2.86", "$6.76", "$1.82", "$3.67"],
    ["AGP %", "43.8%", "46.5%", "-2.7pp", "-5.8%", "48.6%", "52.7%", "40.3%", "52.1%", "48.2%", "49.4%", "41.1%", "24.5%", "43.8%"],
    ["Sales Mix %", "100.0%", "100.0%", "0.0pp", "flat", "13.7%", "10.9%", "6.2%", "4.1%", "3.9%", "3.2%", "7.1%", "2.0%", "100.0%"],
    ["BOG", "62.7%", "64.0%", "-1.3pp", "-2.0%", "0.0%", "0.0%", "0.0%", "71.3%", "0.0%", "0.0%", "55.6%", "0.0%", "62.7%"],
    ["Discount Depth", "-44.0%", "-45.9%", "+1.9pp", "+4.1%", "-18.6%", "-20.0%", "-30.2%", "-26.1%", "-30.1%", "-20.4%", "-15.3%", "-54.4%", "-44.0%"]
  ];
  document.getElementById("weekRows").innerHTML = rows.map((row) => {
    const [metric, current, previous, amountChange, percentChange, ...weeks] = row;
    const shownAmountChange = adjustDelta(amountChange);
    const shownPercentChange = comparisonMode === "division" && percentChange.includes("%")
      ? percentChange.replace(/([\d.]+)%/, (_, number) => `${(Number(number) * 0.7).toFixed(1)}%`)
      : percentChange;
    const klass = pointClass(shownAmountChange);
    const currentCell = `<td><strong>${current}</strong><small>${comparisonPrefix} ${previous}<br><span class="${klass}">${shownAmountChange} / ${shownPercentChange}</span></small></td>`;
    return `<tr data-metric="${escapeAttr(metric.toLowerCase())}"><th>${metric}</th>${currentCell}${weeks.map((week, index) => weekCell(week, index, rows.indexOf(row), index === weeks.length - 1)).join("")}</tr>`;
  }).join("");
  const header = document.getElementById("currentCompareHeader");
  if (header) header.innerHTML = `Current<br><small>vs ${comparisonMode === "division" ? comparisonLabel : "LY period"}</small>`;
}

function openScorecard(type = "item", row) {
  const overlay = document.getElementById("scoreOverlay");
  const rowTitle = row?.dataset.contextTitle || "Boar's Head Turkey Breast 1 LB";
  const title = type === "vendor" ? "BOAR'S HEAD" : rowTitle;
  const sub = type === "vendor" ? "159 NCRCs - Deli Meats & Cheeses" : (row?.dataset.contextSub || "NCRC 159 - UPC 0200006708 - Deli Meat");
  const vendorLine = row?.dataset.contextVendor ? `<p class="score-sub">Vendor: ${row.dataset.contextVendor}</p>` : "";
  const heading = type === "vendor"
    ? `<div class="score-title-row"><div><h2 id="scoreTitle">Selected Vendor Detail</h2><h3>${title}</h3><p class="score-sub">${sub}</p></div><span class="score-link">View Full Vendor Profile -></span></div>`
    : `<div class="score-title-row"><div><h2 id="scoreTitle">Selected Detail</h2><h3>${title}</h3><p class="score-sub">${sub}</p>${vendorLine}</div><button class="driver-link" type="button" onclick="closeScorecard()">Clear</button></div>`;
  const itemMetrics = `
      <div><span>Sales</span><strong>$1.15M</strong><em class="negative">-2.4%</em></div>
      <div><span>AGP %</span><strong>57.6%</strong><em class="positive">+1.1pp</em></div>
      <div><span>AGP $</span><strong>$661K</strong><em class="positive">+6.2%</em></div>
      <div><span>Sales Mix</span><strong>14.5%</strong><em class="negative">-0.6pp</em></div>`;
  const vendorMetrics = `
      <div><span>Sales</span><strong>$31.09M</strong><em class="positive">+10.8%</em></div>
      <div><span>AGP %</span><strong>41.9%</strong><em class="positive">+2.57pp</em></div>
      <div><span>AGP $</span><strong>$13.01M</strong><em class="positive">+18.0%</em></div>
      <div><span>Allowances</span><strong>$31.7M</strong><em class="negative">-59.2%</em></div>
      <div><span>Deadnet Cost</span><strong>$18.08M</strong><em class="positive">+6.1%</em></div>
      <div><span>Sales Mix</span><strong>6.6%</strong><em class="positive">+0.54pp</em></div>`;
  document.getElementById("scoreContent").innerHTML = `
    ${heading}
    <span class="status-pill">Needs Review</span>
    <div class="score-metrics">
      ${type === "vendor" ? vendorMetrics : itemMetrics}
    </div>
    <h3>52-Week Sales Trend</h3>
    <svg class="score-chart" id="scoreChart"></svg>
    <h3>${type === "vendor" ? "Why this vendor needs attention" : "Why this needs attention"}</h3>
    <ul>
      <li>${type === "vendor" ? "Funding down sharply vs LY period (-59.2%)." : "Funding down 11.5% vs LY period, causing margin pressure."}</li>
      <li>${type === "vendor" ? "Cost inflation is not fully offset by vendor support." : "Unit cost up 7.8% while support is not fully funded."}</li>
      <li>${type === "vendor" ? "Deli Meat category is the largest exposure in the vendor mix." : "Sales down 2.4% while category is up 1.2%."}</li>
      <li>${type === "vendor" ? "Several NCRCs are underfunded or declining." : "Low allowance rate versus category average."}</li>
    </ul>
    <div class="score-actions"><button>Review Vendor Funding</button><button>${type === "vendor" ? "View Full Vendor Detail" : "View item detail ->"}</button></div>`;
  overlay.hidden = false;
  const actual = type === "vendor" ? [88, 90, 108, 101, 111, 96, 90, 104, 108, 120, 136, 128, 122, 131, 118, 94, 76, 84, 72, 92, 96, 107, 74, 61] : [34, 31, 32, 30, 35, 31, 39, 27, 25, 22, 24, 21, 18, 22, 26, 25];
  const compare = type === "vendor" ? [52, 50, 48, 42, 39, 41, 44, 40, 36, 33, 31, 62, 70, 76, 80, 66, 70, 62, 52, 45, 40, 55, 43, 52] : [42, 38, 35, 36, 45, 40, 52, 44, 41, 43, 51, 48, 52, 46, 49, 34];
  drawDualChart(document.getElementById("scoreChart"), actual, compare, { height: 210, pad: 24 });
}

function openDriverModal(kind) {
  const rows = modalDrivers[kind] || modalDrivers.sales;
  const titles = { sales: "Sales Drivers Analysis", units: "Unit Drivers Analysis", agp: "AGP Drivers Analysis", household: "Household Penetration Drivers", share: "Market Share Buckets" };
  const subtitles = { sales: "Category-level drivers of sales change", units: "Category-level drivers of unit change", agp: "Category-level drivers of AGP change", household: "Category-level drivers of household penetration change", share: "Buckets of market share movement" };
  document.getElementById("scoreContent").innerHTML = `
    <div class="drivers-modal">
      <header class="drivers-head">
        <div>
          <h2 id="scoreTitle">${titles[kind] || "Drivers Analysis"}</h2>
          <p>${subtitles[kind] || "Category-level drivers"}</p>
        </div>
      </header>
      <div class="drivers-list">
        ${rows.map((entry) => {
          const [name, impact, change, dollars] = entry.split("|");
          const positive = !String(change).trim().startsWith("-");
          const arrow = positive ? "&uarr;" : "&darr;";
          return `
            <div class="drivers-row ${positive ? "is-positive" : "is-negative"}">
              <div class="drivers-row-text">
                <h3>${name} <button type="button" class="drivers-info" aria-label="More about this driver">i</button></h3>
                <p>Impact: ${impact}</p>
              </div>
              <div class="drivers-row-delta">
                <span class="drivers-delta-pct ${positive ? "positive" : "negative"}">${arrow} ${change}</span>
                <span class="drivers-delta-dollar">${dollars}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <footer class="drivers-foot">
        <div class="drivers-foot-note">
          <p>Analysis for <strong>JEWEL</strong> based on <strong>${selectedPeriod}</strong> performance vs <strong>${comparisonPeriod}</strong>.</p>
          <p><em>* Data reflects Same Stores only.</em></p>
        </div>
        <button type="button" class="drivers-close" id="modalCloseInline">Close</button>
      </footer>
    </div>`;
  document.getElementById("scoreOverlay").hidden = false;
  document.getElementById("modalCloseInline").addEventListener("click", closeScorecard);
}

function closeScorecard() {
  document.getElementById("scoreOverlay").hidden = true;
}

function setLoading(isLoading) {
  [
    "primaryMetrics",
    "secondaryMetrics",
    "performanceTable",
    "promoTable",
    "circularTable",
    "itemRows",
    "weekRows"
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.classList.toggle("loading", isLoading);
  });
}

function cacheKey(name, request) {
  return `${CACHE_PREFIX}${name}:${JSON.stringify(request || {})}`;
}

function readCache(name, request) {
  try {
    const raw = localStorage.getItem(cacheKey(name, request));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(name, request, response) {
  try {
    localStorage.setItem(cacheKey(name, request), JSON.stringify({
      storedAt: new Date().toISOString(),
      response
    }));
  } catch {
    // Local storage may be disabled; the static fallback still renders.
  }
}

async function localApi(name, request) {
  if (offlineMode) {
    const cached = readCache(name, request);
    if (cached?.response) return { ...cached.response, cache_status: "loaded from browser offline cache" };
  }

  const fixture = await fetch("data/dashboard-fixtures.json", { cache: "no-store" }).then((response) => response.json());
  const response = fixture.responses[name] || { cache_status: "empty local fixture", data: [] };
  writeCache(name, request, response);
  return response;
}

async function realApiPlaceholder(name, request) {
  const endpointMap = {
    categoryOverview: { method: "POST", url: "/dashboard-ui/api/category-sales" },
    upcPerformance: { method: "POST", url: "/dashboard-ui/api/category-sales" },
    vendorPerformance: { method: "POST", url: "/dashboard-ui/api/category-sales" },
    categories: { method: "GET", url: "/dashboard-ui/api/get-categories?department_name=Produce&division_name=JEWEL" }
  };
  const endpoint = endpointMap[name];

  try {
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: endpoint.method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: endpoint.method === "POST" ? JSON.stringify(request) : undefined,
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`API ${name} failed with ${response.status}`);
    const payload = await response.json();
    writeCache(name, request, payload);
    return payload;
  } catch (error) {
    const cached = readCache(name, request);
    if (cached?.response) return { ...cached.response, cache_status: "loaded from browser fallback cache" };
    return localApi(name, request);
  }
}

function adaptApiData(responses) {
  const categoryRows = responses.categoryOverview?.data || [];
  const top = categoryRows[0]?.Category || "CITRUS";
  const watch = categoryRows[1]?.Category || "SNACKING";
  return {
    primaryMetrics: primaryMetrics.map((metric) => {
      if (metric.label !== "Total Sales") return metric;
      return {
        ...metric,
        drivers: [`Top: ${titleCase(top)} +$3.5M`, `Watch: ${titleCase(watch)} -$1.3M`]
      };
    }),
    secondaryMetrics
  };
}

function titleCase(value) {
  return String(value).toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

async function loadDashboardData() {
  setLoading(true);
  document.getElementById("dataMode").textContent = offlineMode ? "Loading cached local data" : "Loading real-time data";
  const request = {
    DIVISION: "JEWEL",
    department: "Produce",
    time_period: "last_52_weeks",
    comparison: "previous_52weeks"
  };
  const loader = offlineMode ? localApi : realApiPlaceholder;
  try {
    const [categoryOverview, upcPerformance, vendorPerformance, categories] = await Promise.all([
      loader("categoryOverview", { ...request, screen_name: "cat_insight_and_act_overview", kpi_card_name: "Category Performance Heatmap" }),
      loader("upcPerformance", { ...request, screen_name: "product_trends_upc_performance_data", kpi_card_name: "UPC_performance_data", toggle: "cig" }),
      loader("vendorPerformance", { ...request, screen_name: "fiscal_vendor_level_display", CATEGORY: "ALL" }),
      loader("categories", { department_name: "Produce", division_name: "JEWEL" })
    ]);
    dashboardApiData = adaptApiData({ categoryOverview, upcPerformance, vendorPerformance, categories });
    const statuses = [categoryOverview, upcPerformance, vendorPerformance, categories]
      .map((response) => response.cache_status || "loaded")
      .filter(Boolean);
    document.getElementById("dataMode").textContent = offlineMode
      ? `Offline: ${statuses[0] || "browser cache"}`
      : "Real-time: 4 local API calls completed";
  } catch (error) {
    const cached = readCache("categoryOverview", request);
    document.getElementById("dataMode").textContent = cached ? "Offline fallback cache" : "Static fallback data";
  }
  renderPrimaryMetrics();
  renderSecondaryMetrics();
  renderSummaryTables();
  renderItemRows(document.querySelector("#detailTabs .active")?.dataset.view || "top");
  renderWeekRows();
  renderCharts();
  setLoading(false);
}

function getAppliedFiltersText() {
  return [
    "Division: JEWEL",
    "Department: Produce",
    "Category: APPLIES / Deli Prepared Foods",
    "Time Period: last_52_weeks",
    "Date Range: May 11, 2024 - May 9, 2025",
    "Comparison: previous_52weeks"
  ].join("\n");
}

function rowCells(row) {
  return Array.from(row.cells || []).map((cell) => cell.textContent.replace(/\s+/g, " ").trim());
}

function buildAssistantContext(target) {
  const kpi = target.closest(".kpi-card");
  if (kpi) {
    return {
      component: "Top KPI Card",
      path: "Dashboard > Top KPI Card",
      entity: "KPI",
      value: kpi.dataset.contextTitle,
      metric: kpi.dataset.contextTitle,
      current: kpi.dataset.contextCurrent,
      previous: kpi.dataset.contextPrevious,
      additional: `${kpi.dataset.contextChange} | ${kpi.dataset.contextDrivers}`,
      measures: [
        `${kpi.dataset.contextTitle} | Current: ${kpi.dataset.contextCurrent} | Previous: ${kpi.dataset.contextPrevious}`,
        `Drivers: ${kpi.dataset.contextDrivers}`
      ]
    };
  }

  const detailRow = target.closest("#itemRows tr");
  if (detailRow) {
    const cells = rowCells(detailRow);
    const type = detailRow.dataset.contextType || "item";
    return {
      component: type === "vendor" ? "Vendor Performance Table" : "Item Performance Table",
      path: `Dashboard > ${type === "vendor" ? "Vendor Funding Issues" : "Top and Bottom Performing Items"}`,
      entity: type === "vendor" ? "Vendor" : "Item",
      value: detailRow.dataset.contextTitle || cells[0],
      metric: "Sales",
      current: type === "vendor" ? cells[2] : cells[3],
      previous: "LY / planned comparison in row",
      additional: detailRow.dataset.contextDriver || "Performance row with sales, units, AGP, allowances and funding context",
      measures: type === "vendor"
        ? [`Health: ${cells[1]}`, `Sales: ${cells[2]}`, `Units: ${cells[3]}`, `AGP %: ${cells[5]}`, `AGP $: ${cells[6]}`, `Allowances: ${cells[8]}`, `Primary Driver: ${cells[13]}`]
        : [`Vendor: ${cells[1]}`, `Sales: ${cells[3]}`, `Units: ${cells[4]}`, `AGP %: ${cells[5]}`, `AGP $: ${cells[6]}`, `Allowances: ${cells[7]}`, `Deadnet Cost: ${cells[8]}`, `Driver: ${cells[12]}`]
    };
  }

  const summaryRow = target.closest("#performanceTable tbody tr");
  if (summaryRow) {
    const cells = rowCells(summaryRow);
    return {
      component: "Top and Bottom Performing Items vs Plan",
      path: "Dashboard > Promotion Execution > Item vs Plan",
      entity: "Item",
      value: cells[0],
      metric: document.querySelector("[data-table-tabs='performance'] .active")?.textContent || "Sales",
      current: cells[1],
      previous: `Plan ${cells[2]}`,
      additional: `$ Delta ${cells[3]} | % Delta ${cells[4]} | vs LY Period ${cells[5]}`,
      measures: [`Actual: ${cells[1]}`, `Plan: ${cells[2]}`, `$ Delta: ${cells[3]}`, `% Delta: ${cells[4]}`, `vs LY Period: ${cells[5]}`]
    };
  }

  return null;
}

function assistantPayload(context) {
  return `UI DATA PAYLOAD (RIGHT-CLICK) -- ROUTE VIA TOOLS -- DO NOT ANSWER DIRECTLY

Event Type: RIGHT_CLICK

Component Type: ${context.component}

Context Path: ${context.path}

Entity: ${context.entity}
Entity Value: ${context.value}

Measures:
${context.measures.map((item) => `- ${item}`).join("\n")}

Analyze Metric: ${context.metric}

Current Value: ${context.current}

Previous Value: ${context.previous}

Additional Context: ${context.additional}

[APPLIED FILTERS]
${getAppliedFiltersText()}

[END UI DATA PAYLOAD]`;
}

function assistantAnswer(context) {
  const declining = String(context.additional).includes("-") || String(context.current).includes("-");
  const action = context.entity === "Vendor"
    ? "Call the vendor on allowance coverage and confirm which NCRCs need funding before the next promo window."
    : context.entity === "KPI"
      ? "Use the driver split to decide whether this is a growth lever to protect or a watch item that needs funding, retail, or promo correction."
      : "Review the item funding, plan variance, and promo setup before changing the next circular or display commitment.";
  return `
    <h3>${context.value}</h3>
    <p><strong>${context.metric}</strong> is ${declining ? "showing pressure" : "moving favorably"} against the selected comparison period. The important read is ${context.current} versus ${context.previous}, with ${context.additional}.</p>
    <ol>
      <li>Start with the largest variance and confirm whether it is price, units, allowance support, or mix driven.</li>
      <li>Check whether the same pattern appears in the related vendor or NCRC detail before taking action.</li>
      <li>${action}</li>
    </ol>`;
}

function showContextMenu(event, context) {
  pendingAssistantContext = context;
  const menu = document.getElementById("contextMenu");
  menu.hidden = false;
  const left = Math.min(event.clientX, window.innerWidth - 210);
  const top = Math.min(event.clientY, window.innerHeight - 70);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function closeContextMenu() {
  document.getElementById("contextMenu").hidden = true;
}

function openAssistant(context) {
  const body = document.getElementById("assistantBody");
  body.innerHTML = `<div class="assistant-payload">${assistantPayload(context)}</div><div class="assistant-answer">${assistantAnswer(context)}</div>`;
  document.getElementById("assistantPanel").hidden = false;
}

function updateTrendFilterContext() {
  const searchType = document.getElementById("trendSearchType")?.value || "CIG";
  const searchValue = document.getElementById("trendSearch")?.value.trim();
  const label = searchValue ? `${searchType} ${searchValue}` : "8402 - Apples";
  const compareText = comparisonMode === "division" ? `compared against ${comparisonDivision}` : "compared against LY period";
  document.getElementById("trendSubtitle").textContent = `Filtered P&L and KPI view: ${label}, ${compareText}. Period follows the top page filters.`;
}

function bindEvents() {
  document.getElementById("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    document.getElementById("themeToggle").textContent = document.body.classList.contains("dark") ? "Light Mode" : "Dark Mode";
  });
  document.getElementById("offlineToggle").addEventListener("change", (event) => {
    offlineMode = event.target.checked;
    loadDashboardData();
  });
  document.getElementById("primaryMetrics").addEventListener("click", (event) => {
    const button = event.target.closest("[data-driver-modal]");
    if (button) openDriverModal(button.dataset.driverModal);
  });
  document.querySelector("[data-table-tabs='performance']").addEventListener("click", (event) => {
    if (!event.target.matches("button")) return;
    document.querySelectorAll("[data-table-tabs='performance'] button").forEach((button) => button.classList.remove("active"));
    event.target.classList.add("active");
    renderSummaryTables(event.target.dataset.metric);
  });
  document.getElementById("detailTabs").addEventListener("click", (event) => {
    if (!event.target.matches("button")) return;
    document.querySelectorAll("#detailTabs button").forEach((button) => button.classList.remove("active"));
    event.target.classList.add("active");
    renderItemRows(event.target.dataset.view);
  });
  document.getElementById("itemRows").addEventListener("click", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const row = event.target.closest("tr");
    if (!row) return;
    openScorecard(row.dataset.contextType === "vendor" ? "vendor" : "item", row);
  });
  document.getElementById("performanceTable").addEventListener("click", (event) => {
    if (event.button !== 0) return;
    const row = event.target.closest("tbody tr");
    if (!row) return;
    row.dataset.contextTitle = row.cells[0]?.textContent.trim() || "Selected Item";
    row.dataset.contextSub = "NCRC 159 - UPC 0200006708 - Deli Meat";
    row.dataset.contextVendor = row.dataset.contextTitle.includes("Boar") ? "BOAR'S HEAD" : "Selected Vendor";
    openScorecard("item", row);
  });
  document.querySelector("[data-open-scorecard='vendor']")?.addEventListener("click", () => openScorecard("vendor"));
  document.getElementById("trendSearch")?.addEventListener("input", updateTrendFilterContext);
  document.getElementById("trendSearchType")?.addEventListener("change", updateTrendFilterContext);
  document.getElementById("comparisonMode")?.addEventListener("change", (event) => {
    comparisonMode = event.target.value;
    document.getElementById("divisionCompareLabel").hidden = comparisonMode !== "division";
    renderWeekRows();
    updateTrendFilterContext();
  });
  document.getElementById("divisionCompare")?.addEventListener("change", (event) => {
    comparisonDivision = event.target.value;
    renderWeekRows();
    updateTrendFilterContext();
  });
  document.getElementById("closeScorecard").addEventListener("click", closeScorecard);
  document.getElementById("scoreOverlay").addEventListener("click", (event) => {
    if (event.target.id === "scoreOverlay") closeScorecard();
  });
  document.addEventListener("contextmenu", (event) => {
    const context = buildAssistantContext(event.target);
    if (!context) return;
    event.preventDefault();
    showContextMenu(event, context);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#contextMenu")) closeContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeContextMenu();
      document.getElementById("assistantPanel").hidden = true;
    }
  });
  document.getElementById("askAssistantFromContext").addEventListener("click", () => {
    if (pendingAssistantContext) openAssistant(pendingAssistantContext);
    closeContextMenu();
  });
  document.getElementById("closeAssistant").addEventListener("click", () => {
    document.getElementById("assistantPanel").hidden = true;
  });
}

window.detailViews = detailViews;

// Pull every static dataset from /api/dashboard/bootstrap (served by
// data/dashboardStore.js) and overwrite the locals before first paint.
// On failure we fall back to whatever was seeded inline at the top of
// this file so the page is never blank.
async function bootstrapDashboardData() {
  try {
    const response = await fetch("/api/dashboard/bootstrap", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const data = payload && payload.data;
    if (!data) return;
    if (Array.isArray(data.primaryMetrics))   primaryMetrics = data.primaryMetrics;
    if (Array.isArray(data.secondaryMetrics)) secondaryMetrics = data.secondaryMetrics;
    if (data.detailViews)                     { detailViews = data.detailViews; window.detailViews = detailViews; }
    if (data.performanceTables)               performanceTables = data.performanceTables;
    if (Array.isArray(data.promoRows))        promoRows = data.promoRows;
    if (Array.isArray(data.circularRows))     circularRows = data.circularRows;
    if (data.modalDrivers)                    modalDrivers = data.modalDrivers;
    if (Array.isArray(data.currentTrend))     currentTrend = data.currentTrend;
    if (Array.isArray(data.lastTrend))        lastTrend = data.lastTrend;
    // Expose the rest of the payload for dashboard-extras.js to read.
    window.__dashboardBootstrap = data;
    // Notify other scripts so they can re-render their widgets.
    document.dispatchEvent(new CustomEvent("dashboard:bootstrap-ready", { detail: data }));
  } catch (error) {
    console.warn("Dashboard bootstrap failed; using seeded fallback values.", error);
  }
}

(async () => {
  await bootstrapDashboardData();
  renderSummaryTables();
  renderItemRows();
  renderWeekRows();
  bindEvents();
})();
loadDashboardData();
