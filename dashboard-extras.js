/* Dashboard layout enhancements that run after app.js has rendered its
 * initial markup. Adds:
 *   - Department / Category mix card before the Promotion Execution charts
 *   - 3-column Sales/Units/AGP layout for the summary subpanels
 *   - Show-all overlay for any of the above (mix, performance, promo, circular)
 *
 * Keeps the new behaviour out of app.js so the original dashboard logic stays
 * readable. The overlay is shared with promo-plan.js's plan-cell popover by
 * having its own #showAllOverlay container.
 */

(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ------------------------------------------------------------------ data

  // Datasets used by this script are seeded inline as a fallback only;
  // app.js fetches /api/dashboard/bootstrap and dispatches
  // "dashboard:bootstrap-ready" with the real payload, which overwrites
  // these and re-renders the affected widgets.
  let deptMix = [
    {
      dept: "370 - Deli/Prepared Foods",
      sales: { dollar: "$232.8M", pct: 28.3, lyDollar: "$229.9M", lyPct: 27.9 },
      units: { dollar: "79.0M", pct: 22.1, lyDollar: "78.5M", lyPct: 22.5 },
      agp:   { dollar: "$93.5M",  pct: 33.4, lyDollar: "$92.7M",  lyPct: 32.8 },
      categories: [
        { name: "8478 - DELI MEATS", sales: { dollar: "$81.2M", pct: 9.9, lyDollar: "$79.6M", lyPct: 9.7 }, units: { dollar: "26.5M", pct: 7.4, lyDollar: "25.9M", lyPct: 7.4 }, agp: { dollar: "$33.4M", pct: 11.9, lyDollar: "$32.1M", lyPct: 11.4 } },
        { name: "8479 - DELI CHEESES", sales: { dollar: "$54.3M", pct: 6.6, lyDollar: "$53.8M", lyPct: 6.5 }, units: { dollar: "17.6M", pct: 4.9, lyDollar: "17.4M", lyPct: 5.0 }, agp: { dollar: "$22.0M", pct: 7.9, lyDollar: "$21.8M", lyPct: 7.7 } },
        { name: "8480 - HOT FOODS", sales: { dollar: "$38.1M", pct: 4.6, lyDollar: "$37.5M", lyPct: 4.5 }, units: { dollar: "11.2M", pct: 3.1, lyDollar: "11.0M", lyPct: 3.2 }, agp: { dollar: "$15.6M", pct: 5.6, lyDollar: "$15.4M", lyPct: 5.4 } },
        { name: "8481 - SUSHI", sales: { dollar: "$28.4M", pct: 3.5, lyDollar: "$27.8M", lyPct: 3.4 }, units: { dollar: "8.3M", pct: 2.3, lyDollar: "8.1M", lyPct: 2.3 }, agp: { dollar: "$11.3M", pct: 4.0, lyDollar: "$10.9M", lyPct: 3.9 } },
        { name: "8482 - PREPARED MEALS", sales: { dollar: "$22.5M", pct: 2.7, lyDollar: "$22.7M", lyPct: 2.8 }, units: { dollar: "7.1M", pct: 2.0, lyDollar: "7.4M", lyPct: 2.1 }, agp: { dollar: "$8.9M", pct: 3.2, lyDollar: "$9.2M", lyPct: 3.3 } },
        { name: "8483 - SALAD BAR", sales: { dollar: "$8.3M", pct: 1.0, lyDollar: "$8.5M", lyPct: 1.0 }, units: { dollar: "2.8M", pct: 0.8, lyDollar: "2.9M", lyPct: 0.8 }, agp: { dollar: "$2.3M", pct: 0.8, lyDollar: "$2.3M", lyPct: 0.8 } }
      ]
    },
    {
      dept: "200 - Produce",
      sales: { dollar: "$176.5M", pct: 21.5, lyDollar: "$172.4M", lyPct: 20.9 },
      units: { dollar: "84.1M", pct: 23.5, lyDollar: "82.6M", lyPct: 23.7 },
      agp:   { dollar: "$61.8M",  pct: 22.1, lyDollar: "$60.6M",  lyPct: 21.5 },
      categories: [
        { name: "8404 - AVOCADO", sales: { dollar: "$24.6M", pct: 3.0, lyDollar: "$22.8M", lyPct: 2.8 }, units: { dollar: "9.2M", pct: 2.6, lyDollar: "8.5M", lyPct: 2.4 }, agp: { dollar: "$8.9M", pct: 3.2, lyDollar: "$8.0M", lyPct: 2.8 } },
        { name: "8408 - CITRUS", sales: { dollar: "$36.1M", pct: 4.4, lyDollar: "$33.6M", lyPct: 4.1 }, units: { dollar: "13.4M", pct: 3.8, lyDollar: "12.6M", lyPct: 3.6 }, agp: { dollar: "$12.7M", pct: 4.5, lyDollar: "$11.8M", lyPct: 4.2 } },
        { name: "8406 - BANANAS", sales: { dollar: "$28.2M", pct: 3.4, lyDollar: "$26.7M", lyPct: 3.2 }, units: { dollar: "15.1M", pct: 4.2, lyDollar: "15.9M", lyPct: 4.6 }, agp: { dollar: "$10.4M", pct: 3.7, lyDollar: "$8.5M", lyPct: 3.0 } },
        { name: "8402 - APPLES", sales: { dollar: "$22.1M", pct: 2.7, lyDollar: "$22.0M", lyPct: 2.7 }, units: { dollar: "8.4M", pct: 2.3, lyDollar: "8.5M", lyPct: 2.4 }, agp: { dollar: "$7.7M", pct: 2.8, lyDollar: "$7.5M", lyPct: 2.7 } },
        { name: "8419 - CHERRIES", sales: { dollar: "$13.4M", pct: 1.6, lyDollar: "$15.1M", lyPct: 1.8 }, units: { dollar: "4.1M", pct: 1.1, lyDollar: "4.6M", lyPct: 1.3 }, agp: { dollar: "$4.6M", pct: 1.6, lyDollar: "$5.4M", lyPct: 1.9 } },
        { name: "8445 - ONIONS", sales: { dollar: "$8.3M", pct: 1.0, lyDollar: "$8.5M", lyPct: 1.0 }, units: { dollar: "5.2M", pct: 1.5, lyDollar: "5.5M", lyPct: 1.6 }, agp: { dollar: "$3.1M", pct: 1.1, lyDollar: "$3.2M", lyPct: 1.1 } }
      ]
    },
    {
      dept: "150 - Meat & Seafood",
      sales: { dollar: "$148.2M", pct: 18.1, lyDollar: "$146.7M", lyPct: 17.8 },
      units: { dollar: "42.8M", pct: 11.9, lyDollar: "42.1M", lyPct: 12.1 },
      agp:   { dollar: "$45.5M",  pct: 16.3, lyDollar: "$45.9M",  lyPct: 16.3 },
      categories: [
        { name: "5012 - BEEF", sales: { dollar: "$58.1M", pct: 7.1, lyDollar: "$57.4M", lyPct: 7.0 }, units: { dollar: "12.6M", pct: 3.5, lyDollar: "12.3M", lyPct: 3.5 }, agp: { dollar: "$17.4M", pct: 6.2, lyDollar: "$17.7M", lyPct: 6.3 } },
        { name: "5013 - PORK", sales: { dollar: "$28.4M", pct: 3.5, lyDollar: "$28.6M", lyPct: 3.5 }, units: { dollar: "8.7M", pct: 2.4, lyDollar: "8.6M", lyPct: 2.5 }, agp: { dollar: "$8.6M", pct: 3.1, lyDollar: "$8.7M", lyPct: 3.1 } },
        { name: "5014 - POULTRY", sales: { dollar: "$32.6M", pct: 4.0, lyDollar: "$31.9M", lyPct: 3.9 }, units: { dollar: "11.5M", pct: 3.2, lyDollar: "11.2M", lyPct: 3.2 }, agp: { dollar: "$9.9M", pct: 3.5, lyDollar: "$9.6M", lyPct: 3.4 } },
        { name: "5018 - SEAFOOD", sales: { dollar: "$29.1M", pct: 3.6, lyDollar: "$28.8M", lyPct: 3.5 }, units: { dollar: "10.0M", pct: 2.8, lyDollar: "10.0M", lyPct: 2.9 }, agp: { dollar: "$9.6M", pct: 3.4, lyDollar: "$9.9M", lyPct: 3.5 } }
      ]
    },
    {
      dept: "300 - Frozen",
      sales: { dollar: "$98.4M", pct: 12.0, lyDollar: "$96.1M", lyPct: 11.7 },
      units: { dollar: "65.2M", pct: 18.2, lyDollar: "62.9M", lyPct: 18.0 },
      agp:   { dollar: "$31.4M",  pct: 11.2, lyDollar: "$30.6M",  lyPct: 10.8 },
      categories: [
        { name: "7101 - ICE CREAM", sales: { dollar: "$28.2M", pct: 3.4, lyDollar: "$27.0M", lyPct: 3.3 }, units: { dollar: "12.7M", pct: 3.6, lyDollar: "12.0M", lyPct: 3.4 }, agp: { dollar: "$9.4M", pct: 3.4, lyDollar: "$8.8M", lyPct: 3.1 } },
        { name: "7202 - PIZZA", sales: { dollar: "$24.6M", pct: 3.0, lyDollar: "$24.0M", lyPct: 2.9 }, units: { dollar: "15.4M", pct: 4.3, lyDollar: "15.1M", lyPct: 4.3 }, agp: { dollar: "$7.6M", pct: 2.7, lyDollar: "$7.4M", lyPct: 2.6 } },
        { name: "7303 - FROZEN MEALS", sales: { dollar: "$20.1M", pct: 2.4, lyDollar: "$19.7M", lyPct: 2.4 }, units: { dollar: "14.4M", pct: 4.0, lyDollar: "13.6M", lyPct: 3.9 }, agp: { dollar: "$6.7M", pct: 2.4, lyDollar: "$6.5M", lyPct: 2.3 } }
      ]
    },
    {
      dept: "100 - Bakery",
      sales: { dollar: "$72.6M", pct: 8.8, lyDollar: "$71.2M", lyPct: 8.6 },
      units: { dollar: "38.4M", pct: 10.7, lyDollar: "37.5M", lyPct: 10.7 },
      agp:   { dollar: "$26.7M",  pct: 9.5, lyDollar: "$26.0M",  lyPct: 9.2 },
      categories: [
        { name: "4001 - FRESH BREAD", sales: { dollar: "$22.1M", pct: 2.7, lyDollar: "$21.4M", lyPct: 2.6 }, units: { dollar: "10.5M", pct: 2.9, lyDollar: "10.3M", lyPct: 2.9 }, agp: { dollar: "$7.5M", pct: 2.7, lyDollar: "$7.1M", lyPct: 2.5 } },
        { name: "4002 - CAKES", sales: { dollar: "$15.4M", pct: 1.9, lyDollar: "$15.0M", lyPct: 1.8 }, units: { dollar: "4.2M", pct: 1.2, lyDollar: "4.1M", lyPct: 1.2 }, agp: { dollar: "$6.7M", pct: 2.4, lyDollar: "$6.5M", lyPct: 2.3 } }
      ]
    },
    {
      dept: "450 - Beverages",
      sales: { dollar: "$54.9M", pct: 6.7, lyDollar: "$56.1M", lyPct: 6.8 },
      units: { dollar: "32.1M", pct: 9.0, lyDollar: "33.2M", lyPct: 9.5 },
      agp:   { dollar: "$13.5M",  pct: 4.8, lyDollar: "$14.0M",  lyPct: 5.0 }
    },
    {
      dept: "500 - Snacks",
      sales: { dollar: "$38.2M", pct: 4.7, lyDollar: "$39.6M", lyPct: 4.8 },
      units: { dollar: "16.2M", pct: 4.5, lyDollar: "16.9M", lyPct: 4.8 },
      agp:   { dollar: "$7.5M",  pct: 2.7, lyDollar: "$7.8M",  lyPct: 2.8 }
    }
  ];

  // 3-column performance data — values match (or approximate) the existing
  // tabs in app.js. Each row carries Sales / Units / AGP with LY comparisons.
  let performance3col = {
    title: "Top & Bottom Performing Items vs Plan",
    rows: [
      { name: "Boar's Head Turkey Breast 1 LB",
        sales: { value: "$1.15M", delta: "-2.4%", deltaDollar: "-$28K" },
        units: { value: "487.8K", delta: "-15.1%", deltaDollar: "-86.7K" },
        agp:   { value: "$661K",  delta: "+6.2%",  deltaDollar: "+$38.6K" } },
      { name: "Private Label Deli Ham 1 LB",
        sales: { value: "$982K",  delta: "+8.6%",  deltaDollar: "+$78K" },
        units: { value: "376.4K", delta: "+9.8%",  deltaDollar: "+33.6K" },
        agp:   { value: "$472K",  delta: "+10.1%", deltaDollar: "+$43K" } },
      { name: "Sara Lee Oven Roasted Turkey",
        sales: { value: "$872K",  delta: "-3.6%",  deltaDollar: "-$33K" },
        units: { value: "318.2K", delta: "-6.8%",  deltaDollar: "-23.2K" },
        agp:   { value: "$370K",  delta: "-7.2%",  deltaDollar: "-$29K" } },
      { name: "Kretschmar Ham Off The Bone",
        sales: { value: "$1.08M", delta: "+6.3%",  deltaDollar: "+$64K" },
        units: { value: "412.1K", delta: "+3.2%",  deltaDollar: "+12.7K" },
        agp:   { value: "$652K",  delta: "+9.4%",  deltaDollar: "+$56K" } },
      { name: "King's Hawaiian Rolls 12 OZ",
        sales: { value: "$2.42M", delta: "+13.1%", deltaDollar: "+$280K" },
        units: { value: "918.3K", delta: "+11.4%", deltaDollar: "+93.9K" },
        agp:   { value: "$1.05M", delta: "+15.5%", deltaDollar: "+$141K" } }
    ],
    overflow: [
      { name: "Tyson Grilled Chicken Strips",
        sales: { value: "$756K",  delta: "+6.4%",  deltaDollar: "+$46K" },
        units: { value: "288.7K", delta: "+7.3%",  deltaDollar: "+19.7K" },
        agp:   { value: "$326K",  delta: "+8.8%",  deltaDollar: "+$26K" } },
      { name: "Hillshire Farm Smoked Turkey",
        sales: { value: "$634K",  delta: "-1.8%",  deltaDollar: "-$11K" },
        units: { value: "236.4K", delta: "-4.1%",  deltaDollar: "-10.1K" },
        agp:   { value: "$291K",  delta: "+0.9%",  deltaDollar: "+$3K" } },
      { name: "Applegate Naturals Ham",
        sales: { value: "$415K",  delta: "+12.6%", deltaDollar: "+$46K" },
        units: { value: "152.7K", delta: "+8.4%",  deltaDollar: "+11.8K" },
        agp:   { value: "$208K",  delta: "+18.2%", deltaDollar: "+$32K" } }
    ]
  };

  let promoWorking = {
    title: "Promotions Working vs Not Working",
    rows: [
      { name: "Feature",
        sales: { value: "$1.24M", delta: "+15.6%", deltaDollar: "+$167K" },
        units: { value: "612K",   delta: "+11.1%", deltaDollar: "+61K" },
        agp:   { value: "$422K",  delta: "+7.4%",  deltaDollar: "+$29K" } },
      { name: "Digital Coupon",
        sales: { value: "$882K",  delta: "+12.3%", deltaDollar: "+$97K" },
        units: { value: "344K",   delta: "+7.2%",  deltaDollar: "+23K" },
        agp:   { value: "$301K",  delta: "+4.1%",  deltaDollar: "+$12K" } },
      { name: "BOGO",
        sales: { value: "$714K",  delta: "+5.4%",  deltaDollar: "+$37K" },
        units: { value: "286K",   delta: "+2.1%",  deltaDollar: "+6K" },
        agp:   { value: "$245K",  delta: "+1.8%",  deltaDollar: "+$4K" } },
      { name: "In-Store Display",
        sales: { value: "$506K",  delta: "-2.1%",  deltaDollar: "-$11K" },
        units: { value: "194K",   delta: "-6.0%",  deltaDollar: "-13K" },
        agp:   { value: "$171K",  delta: "-2.7%",  deltaDollar: "-$5K" } },
      { name: "Price Discount",
        sales: { value: "$439K",  delta: "-5.8%",  deltaDollar: "-$27K" },
        units: { value: "181K",   delta: "-1.9%",  deltaDollar: "-3K" },
        agp:   { value: "$141K",  delta: "-4.6%",  deltaDollar: "-$7K" } }
    ],
    overflow: [
      { name: "Mailer Coupon",
        sales: { value: "$298K",  delta: "+3.4%",  deltaDollar: "+$10K" },
        units: { value: "118K",   delta: "+1.7%",  deltaDollar: "+2K" },
        agp:   { value: "$99K",   delta: "+0.8%",  deltaDollar: "+$1K" } },
      { name: "Loyalty Reward",
        sales: { value: "$219K",  delta: "+7.5%",  deltaDollar: "+$15K" },
        units: { value: "86K",    delta: "+4.2%",  deltaDollar: "+3K" },
        agp:   { value: "$75K",   delta: "+5.1%",  deltaDollar: "+$4K" } }
    ]
  };

  let circular = {
    title: "Front Page Circular Performance",
    rows: [
      { name: "Boar's Head Turkey Breast 1 LB",
        sales: { value: "$661K", delta: "+9.4%", deltaDollar: "+$57K" },
        units: { value: "287K",  delta: "+6.2%", deltaDollar: "+17K" },
        agp:   { value: "$381K", delta: "+4.1%", deltaDollar: "+$15K" } },
      { name: "Kretschmar Ham Off The Bone 1 LB",
        sales: { value: "$652K", delta: "+10.9%", deltaDollar: "+$64K" },
        units: { value: "241K",  delta: "+8.1%",  deltaDollar: "+18K" },
        agp:   { value: "$393K", delta: "+12.1%", deltaDollar: "+$43K" } },
      { name: "Private Label Deli Ham 1 LB",
        sales: { value: "$472K", delta: "+8.6%", deltaDollar: "+$37K" },
        units: { value: "199K",  delta: "+9.8%", deltaDollar: "+18K" },
        agp:   { value: "$227K", delta: "+10.1%", deltaDollar: "+$21K" } },
      { name: "Sara Lee Oven Roasted Turkey",
        sales: { value: "$381K", delta: "-6.2%", deltaDollar: "-$25K" },
        units: { value: "158K",  delta: "-6.1%", deltaDollar: "-10K" },
        agp:   { value: "$162K", delta: "-8.0%", deltaDollar: "-$14K" } }
    ],
    overflow: []
  };

  // -------------------------------------------------- delta cell formatting

  function deltaClass(text) {
    return String(text || "").trim().startsWith("-") ? "negative" : "positive";
  }

  function valueCell(metric) {
    if (!metric) return `<div class="metric-cell"><strong>-</strong></div>`;
    const klass = deltaClass(metric.delta);
    return `
      <div class="metric-cell">
        <strong>${metric.value || "-"}</strong>
        <div class="metric-sub ${klass}">${metric.deltaDollar || ""} <span class="metric-sub-sep">/</span> ${metric.delta || ""}</div>
        ${metric.lyValue ? `<div class="metric-sub muted">LY ${metric.lyValue}</div>` : ""}
      </div>
    `;
  }

  // ----------------------------------------------- mix card render

  function dollarPctCell(block) {
    if (!block) return `<div class="mix-cell">-</div>`;
    const lyDeltaPct = block.lyPct ? (block.pct - block.lyPct) : 0;
    const dir = lyDeltaPct >= 0 ? "positive" : "negative";
    return `
      <div class="mix-cell">
        <strong>${block.dollar}</strong>
        <span class="mix-pct">${block.pct.toFixed(1)}%</span>
        <span class="mix-ly">LY ${block.lyDollar} <span class="mix-sep">/</span> ${block.lyPct.toFixed(1)}% <span class="${dir}">(${lyDeltaPct >= 0 ? "+" : ""}${lyDeltaPct.toFixed(1)}pp)</span></span>
      </div>
    `;
  }

  function renderDeptMix() {
    const host = document.getElementById("deptMixCard");
    if (!host) return;
    // Common case is "one department, many categories" — anchor on the
    // primary department and show its top categories indented underneath.
    // To the right of the table, render four mini trend tiles in a 2x2 grid
    // so the user gets at-a-glance trajectories per metric without leaving
    // the row.
    const primary = deptMix[0];
    const others = deptMix.slice(1);
    const primaryCats = (primary.categories || []).slice(0, 4);
    host.innerHTML = `
      <header class="mix-header">
        <div>
          <h3>Department / Category Mix</h3>
          <p>Where sales, units and AGP land for your primary department. LY in grey under each value.</p>
        </div>
        <button class="show-all-link" type="button" data-show-all="mix">Show all departments/categories &rarr;</button>
      </header>
      <div class="mix-layout">
        <div class="mix-grid mix-grid-narrow">
          <div class="mix-row mix-row-head">
            <span class="mix-name-col">Department / Category</span>
            <span class="mix-metric-col">Sales</span>
            <span class="mix-metric-col">Units</span>
            <span class="mix-metric-col">AGP</span>
          </div>
          <div class="mix-row mix-row-dept">
            <span class="mix-name-col"><strong>${primary.dept}</strong></span>
            <span class="mix-metric-col">${dollarPctCell(primary.sales)}</span>
            <span class="mix-metric-col">${dollarPctCell(primary.units)}</span>
            <span class="mix-metric-col">${dollarPctCell(primary.agp)}</span>
          </div>
          ${primaryCats.map((cat) => `
            <div class="mix-row mix-row-cat">
              <span class="mix-name-col"><span class="mix-cat-rule"></span>${cat.name}</span>
              <span class="mix-metric-col">${dollarPctCell(cat.sales)}</span>
              <span class="mix-metric-col">${dollarPctCell(cat.units)}</span>
              <span class="mix-metric-col">${dollarPctCell(cat.agp)}</span>
            </div>
          `).join("")}
          ${others.length ? `
            <div class="mix-row mix-row-others">
              <span class="mix-name-col"><em>${others.length} other ${others.length === 1 ? "department" : "departments"}</em></span>
              <span class="mix-metric-col">${dollarPctCell(rollupBlock(others, "sales"))}</span>
              <span class="mix-metric-col">${dollarPctCell(rollupBlock(others, "units"))}</span>
              <span class="mix-metric-col">${dollarPctCell(rollupBlock(others, "agp"))}</span>
            </div>
          ` : ""}
        </div>
        <div class="mix-tile-grid" id="forecastTileGrid" aria-label="Forecast vs Actual"></div>
      </div>
    `;
    renderMixTiles();
  }

  // The 4 mini tiles next to Dept Mix mirror the existing prediction cards
  // (Sales / Units / AGP / Household forecast vs actual), driven from the
  // same data-actual / data-compare attributes so a real API only needs to
  // hydrate those.
  const mixTileRoots = new Map();
  function renderMixTiles() {
    const grid = document.getElementById("forecastTileGrid");
    if (!grid || !window.React || !window.Recharts) return;
    const sources = Array.from(document.querySelectorAll(".prediction-card")).slice(0, 4);
    if (!sources.length) return;
    grid.innerHTML = sources.map((card) => {
      const title = (card.querySelector("h3") && card.querySelector("h3").textContent) || "Forecast vs actual";
      const sub = (card.querySelector(".prediction-header p") && card.querySelector(".prediction-header p").textContent) || "";
      const delta = (card.querySelector(".prediction-header strong") && card.querySelector(".prediction-header strong").innerHTML) || "";
      const svg = card.querySelector("svg.dual-chart") || card.querySelector(".prediction-chart-host");
      const dataActual = svg && svg.dataset ? (svg.dataset.actual || "") : "";
      const dataCompare = svg && svg.dataset ? (svg.dataset.compare || "") : "";
      return `
        <article class="mix-tile mix-tile-forecast">
          <header>
            <span class="mix-tile-title">${title}</span>
            <span class="mix-tile-delta">${delta}</span>
          </header>
          <p class="mix-tile-sub">${sub}</p>
          <div class="mix-tile-chart" data-actual="${dataActual}" data-compare="${dataCompare}"></div>
        </article>
      `;
    }).join("");
    const h = window.React.createElement;
    const { ResponsiveContainer, ComposedChart, Area, Line, Tooltip, XAxis, YAxis, ReferenceLine } = window.Recharts;
    const tilePalette = [
      { stroke: "#1f6feb", fill: "rgba(31, 111, 235, 0.14)" },
      { stroke: "#f36b12", fill: "rgba(243, 107, 18, 0.14)" },
      { stroke: "#4a8a5d", fill: "rgba(74, 138, 93, 0.16)" },
      { stroke: "#7c4dcc", fill: "rgba(124, 77, 204, 0.14)" }
    ];
    grid.querySelectorAll(".mix-tile-chart").forEach((host, idx) => {
      const actualRaw = (host.dataset.actual || "").split(",").map(Number).filter((n) => !isNaN(n));
      const compareRaw = (host.dataset.compare || "").split(",").map(Number).filter((n) => !isNaN(n));
      if (!actualRaw.length) return;
      // The chart's job is to show the recent past + a measurement window
      // where we compare prediction vs actual. We mark a vertical divider
      // at the boundary between the two:
      //   weeks 0..measurementStart-1 → past period (plan was running)
      //   weeks measurementStart..end → measurement window (3 weeks)
      //   actuals exist for past + first 2 measurement weeks; the 3rd
      //   measurement week has only forecast data.
      const len = actualRaw.length;
      const measurementWeeks = 3;
      const measurementStart = Math.max(1, len - measurementWeeks);
      const lastActualIdx = len - 2; // actuals available for first 2 of 3 measurement weeks
      const data = actualRaw.map((v, i) => ({
        i,
        actual: i <= lastActualIdx ? v : null,
        forecast: i >= measurementStart ? (compareRaw[i] != null ? compareRaw[i] : v) : null,
        compareLy: compareRaw[i] != null ? compareRaw[i] : 0
      }));
      const palette = tilePalette[idx % tilePalette.length];
      const card = host.closest(".mix-tile");
      if (card) {
        card.style.borderColor = palette.stroke + "44";
        card.style.background = palette.fill.replace(/, 0\.\d+\)/, ", 0.03)");
      }
      const chart = h(ResponsiveContainer, { width: "100%", height: "100%" },
        h(ComposedChart, { data, margin: { top: 4, right: 4, bottom: 4, left: 4 } },
          h(XAxis, { dataKey: "i", hide: true }),
          h(YAxis, { hide: true }),
          h(Tooltip, { contentStyle: { fontSize: 10, padding: "4px 8px", border: "1px solid #dfe5ef", borderRadius: 4 } }),
          // Divider where the measurement window begins (plan-to-actual comparison starts here).
          h(ReferenceLine, {
            x: measurementStart,
            stroke: "#94a3b8",
            strokeDasharray: "3 3",
            strokeWidth: 1.2,
            label: { value: "Current plan weeks", position: "insideTopRight", fill: "#64748b", fontSize: 9 }
          }),
          // Long-run LY/baseline across the full window in dashed grey.
          h(Line, { type: "monotone", dataKey: "compareLy", stroke: "#9aa6b8", strokeDasharray: "4 4", strokeWidth: 1.4, isAnimationActive: false, dot: false, name: "LY / baseline" }),
          // Actual area: past period + first 2 of 3 measurement weeks.
          h(Area, { type: "monotone", dataKey: "actual", stroke: palette.stroke, fill: palette.fill, strokeWidth: 1.8, isAnimationActive: false, dot: false, name: "Actual", connectNulls: false }),
          // Forecast (prediction) line inside the measurement window only — dashed in the accent colour so the user reads it as the plan-to-beat.
          h(Line, { type: "monotone", dataKey: "forecast", stroke: palette.stroke, strokeDasharray: "5 4", strokeWidth: 1.6, isAnimationActive: false, dot: false, name: "Forecast", connectNulls: false })
        )
      );
      let root = mixTileRoots.get(host);
      if (!root) {
        root = window.ReactDOM.createRoot(host);
        mixTileRoots.set(host, root);
      }
      root.render(chart);
    });
    // Hide the original full-size prediction cards row — we now show the
    // condensed tiles up top instead.
    const layout = document.querySelector(".promo-panel .promo-layout");
    if (layout) layout.hidden = true;
  }

  function rollupBlock(rows, key) {
    // Synthesise a single rolled-up block from a set of departments.
    const sumPct = rows.reduce((a, r) => a + (r[key] && r[key].pct || 0), 0);
    const sumLyPct = rows.reduce((a, r) => a + (r[key] && r[key].lyPct || 0), 0);
    // Crude $ sum — pull numeric prefix from each "$X.XM" string.
    const parseDollar = (s) => {
      if (!s) return 0;
      const m = String(s).match(/([\d.]+)([MK]?)/);
      if (!m) return 0;
      const n = Number(m[1]);
      return m[2] === "M" ? n : m[2] === "K" ? n / 1000 : n / 1e6;
    };
    const sum$ = rows.reduce((a, r) => a + parseDollar(r[key] && r[key].dollar), 0);
    const sumLy$ = rows.reduce((a, r) => a + parseDollar(r[key] && r[key].lyDollar), 0);
    const fmtDollar = (mUnits) => mUnits >= 1 ? `${key === "units" ? "" : "$"}${mUnits.toFixed(1)}M` : `${key === "units" ? "" : "$"}${(mUnits * 1000).toFixed(0)}K`;
    return { dollar: fmtDollar(sum$), pct: sumPct, lyDollar: fmtDollar(sumLy$), lyPct: sumLyPct };
  }

  // ---------------------- 3-column performance / promo / circular tables

  function render3ColTable(targetId, dataset, limit = 4) {
    const host = document.getElementById(targetId);
    if (!host) return;
    const rows = dataset.rows.slice(0, limit);
    const totalRows = (dataset.rows.length || 0) + (dataset.overflow ? dataset.overflow.length : 0);
    const linkLabel = dataset.linkLabel
      ? `${dataset.linkLabel} &rarr;`
      : `Show all ${totalRows} &rarr;`;
    host.innerHTML = `
      <table class="three-col-summary">
        <thead>
          <tr>
            <th>${dataset.firstColLabel || "Item"}</th>
            <th>Sales</th>
            <th>Units</th>
            <th>AGP</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td class="three-col-name">${row.name}</td>
              <td>${valueCell(row.sales)}</td>
              <td>${valueCell(row.units)}</td>
              <td>${valueCell(row.agp)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <button class="show-all-link" type="button" data-show-all="${dataset.key}">${linkLabel}</button>
    `;
  }

  function applySummaryReplacements() {
    // Wipe out the table-tabs strip — we no longer toggle, all 3 metrics are visible.
    const tabs = document.querySelector("[data-table-tabs='performance']");
    if (tabs) tabs.style.display = "none";

    // Each card knows the shape of its own list so the show-all label can
    // be specific ("Show top 50 items" reads as a deliberate action; "Show
    // all →" reads as boilerplate).
    const perfTotal = performance3col.rows.length + performance3col.overflow.length;
    const promoTotal = promoWorking.rows.length + promoWorking.overflow.length;
    const circularTotal = circular.rows.length + (circular.overflow ? circular.overflow.length : 0);
    render3ColTable("performanceTable", { ...performance3col, key: "performance", linkLabel: `Show top &amp; bottom ${perfTotal} items` }, 4);
    render3ColTable("promoTable",       { ...promoWorking,    key: "promo",       firstColLabel: "Promotion type", linkLabel: `Show all ${promoTotal} promotion types` }, 5);
    render3ColTable("circularTable",    { ...circular,        key: "circular",    linkLabel: `Show all ${circularTotal} circular items` }, 4);
  }

  // ---------------------------------------------------------------- overlay

  function openShowAllOverlay(kind, opts) {
    const overlay = document.getElementById("showAllOverlay");
    const content = document.getElementById("showAllContent");
    if (!overlay || !content) return;
    let titleText = "";
    let subText = "Full list. LY comparison in grey under each value.";
    let pillText = "";
    let bodyHtml = "";
    let toolbarHtml = "";
    if (kind === "mix") {
      titleText = "Department & Category Mix";
      bodyHtml = renderMixOverlay();
      subText = "";
      pillText = "";
    } else if (kind === "performance") {
      titleText = performance3col.title;
      const all = [...performance3col.rows, ...performance3col.overflow];
      pillText = `${all.length} items`;
      bodyHtml = renderRowsOverlay(all);
    } else if (kind === "promo") {
      titleText = promoWorking.title;
      const all = [...promoWorking.rows, ...promoWorking.overflow];
      pillText = `${all.length} promotion types`;
      bodyHtml = renderRowsOverlay(all, "Promotion type");
    } else if (kind === "circular") {
      titleText = circular.title;
      const all = [...circular.rows, ...circular.overflow];
      pillText = `${all.length} items`;
      bodyHtml = renderRowsOverlay(all);
    } else if (kind && kind.indexOf("items-") === 0) {
      const view = (opts && opts.view) || kind.replace("items-", "");
      const meta = wideTableViewMeta[view] || wideTableViewMeta.top;
      titleText = meta.title;
      subText = meta.sub;
      const rows = (window.detailViews && window.detailViews[view]) || [];
      pillText = `${rows.length} items`;
      bodyHtml = renderItemsOverlay(rows);
      toolbarHtml = `
        <label class="show-all-search">
          <span>Find</span>
          <input type="search" placeholder="Search by item, vendor, NCRC, CIG..." data-show-all-filter="${escapeAttr(view)}" />
        </label>
      `;
    }
    if (kind === "mix") {
      // Mix overlay brings its own hero header — render body directly.
      content.innerHTML = bodyHtml;
    } else {
      content.innerHTML = `
        <header class="show-all-head v2">
          <div class="show-all-head-text">
            ${pillText ? `<span class="show-all-pill">${pillText}</span>` : ""}
            <h2 id="showAllTitle">${titleText}</h2>
            ${subText ? `<p>${subText}</p>` : ""}
          </div>
          ${toolbarHtml ? `<div class="show-all-toolbar">${toolbarHtml}</div>` : ""}
        </header>
        ${bodyHtml}
      `;
    }
    overlay.hidden = false;
  }

  function renderItemsOverlay(rows) {
    if (!rows.length) {
      return `<div class="show-all-body"><p class="show-all-empty">No items match.</p></div>`;
    }
    return `
      <div class="show-all-body show-all-items">
        <table class="wide-table show-all-wide-table">
          <thead>
            <tr>${wideTableHeaderCells.map((h) => `<th>${h}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row, idx) => buildItemRowHtml(row, idx)).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // Track which departments are expanded inside the show-all overlay.
  const expandedMixDepts = new Set();

  // Department accent palette — cycles through 7 colors for visual variety.
  const deptPalette = [
    { stroke: "#1f6feb", tint: "rgba(31,111,235,0.10)" },   // blue
    { stroke: "#4a8a5d", tint: "rgba(74,138,93,0.10)" },    // green
    { stroke: "#f36b12", tint: "rgba(243,107,18,0.10)" },   // orange
    { stroke: "#7c4dcc", tint: "rgba(124,77,204,0.10)" },   // purple
    { stroke: "#0aa985", tint: "rgba(10,169,133,0.10)" },   // teal
    { stroke: "#b25a55", tint: "rgba(178,90,85,0.10)" },    // red
    { stroke: "#d29c2f", tint: "rgba(210,156,47,0.10)" }    // amber
  ];

  function bar(pct, accent) {
    const width = Math.max(2, Math.min(100, pct));
    return `<span class="mix-bar"><span class="mix-bar-fill" style="width:${width.toFixed(1)}%; background:${accent};"></span></span>`;
  }

  function mixMetricCell(block, accent) {
    if (!block) return `<span class="mix-metric-rich">-</span>`;
    const deltaPp = block.lyPct != null ? (block.pct - block.lyPct) : 0;
    const dir = deltaPp >= 0 ? "positive" : "negative";
    return `
      <span class="mix-metric-rich">
        <span class="mix-metric-headline">
          <strong>${block.dollar}</strong>
          <small>${block.pct.toFixed(1)}%</small>
        </span>
        ${bar(block.pct, accent)}
        <span class="mix-metric-foot">
          <span>LY ${block.lyDollar} · ${block.lyPct.toFixed(1)}%</span>
          <span class="mix-metric-delta ${dir}">${deltaPp >= 0 ? "+" : ""}${deltaPp.toFixed(1)}pp</span>
        </span>
      </span>
    `;
  }

  function renderMixOverlay() {
    const total = {
      sales: { dollar: "$899.0M", pct: 100.0, lyDollar: "$881.9M", lyPct: 100.0 },
      units: { dollar: "357.8M",  pct: 100.0, lyDollar: "351.2M",  lyPct: 100.0 },
      agp:   { dollar: "$279.7M", pct: 100.0, lyDollar: "$277.5M", lyPct: 100.0 }
    };
    const totalCategories = deptMix.reduce((a, d) => a + ((d.categories || []).length), 0);
    const totalDelta = {
      sales: (((parseFloat(total.sales.dollar.replace(/[^\d.]/g, "")) - parseFloat(total.sales.lyDollar.replace(/[^\d.]/g, ""))) / parseFloat(total.sales.lyDollar.replace(/[^\d.]/g, ""))) * 100).toFixed(1),
      units: (((parseFloat(total.units.dollar.replace(/[^\d.]/g, "")) - parseFloat(total.units.lyDollar.replace(/[^\d.]/g, ""))) / parseFloat(total.units.lyDollar.replace(/[^\d.]/g, ""))) * 100).toFixed(1),
      agp:   (((parseFloat(total.agp.dollar.replace(/[^\d.]/g, "")) - parseFloat(total.agp.lyDollar.replace(/[^\d.]/g, ""))) / parseFloat(total.agp.lyDollar.replace(/[^\d.]/g, ""))) * 100).toFixed(1)
    };
    return `
      <div class="show-all-body mix-overlay">
        <div class="mix-hero">
          <div class="mix-hero-headline">
            <span class="mix-hero-pill">${deptMix.length} departments &middot; ${totalCategories} categories</span>
            <h3>How your assignment is distributed</h3>
            <p>Click any department to expand its categories.</p>
          </div>
          <div class="mix-hero-totals">
            <div class="mix-hero-tot">
              <span>Total Sales</span>
              <strong>${total.sales.dollar}</strong>
              <em class="${Number(totalDelta.sales) >= 0 ? "positive" : "negative"}">${Number(totalDelta.sales) >= 0 ? "+" : ""}${totalDelta.sales}% vs LY</em>
              <small>LY ${total.sales.lyDollar}</small>
            </div>
            <div class="mix-hero-tot">
              <span>Total Units</span>
              <strong>${total.units.dollar}</strong>
              <em class="${Number(totalDelta.units) >= 0 ? "positive" : "negative"}">${Number(totalDelta.units) >= 0 ? "+" : ""}${totalDelta.units}% vs LY</em>
              <small>LY ${total.units.lyDollar}</small>
            </div>
            <div class="mix-hero-tot">
              <span>Total AGP</span>
              <strong>${total.agp.dollar}</strong>
              <em class="${Number(totalDelta.agp) >= 0 ? "positive" : "negative"}">${Number(totalDelta.agp) >= 0 ? "+" : ""}${totalDelta.agp}% vs LY</em>
              <small>LY ${total.agp.lyDollar}</small>
            </div>
          </div>
        </div>
        <div class="mix-overlay-scroll mix-overlay-cards">
          <div class="mix-col-head">
            <span>Department / Category</span>
            <span>Sales</span>
            <span>Units</span>
            <span>AGP</span>
          </div>
          ${deptMix.map((dept, idx) => {
            const palette = deptPalette[idx % deptPalette.length];
            const isExpanded = expandedMixDepts.has(dept.dept);
            const catCount = (dept.categories || []).length;
            // Strip the leading "370 - " for a cleaner display; keep code in badge.
            const m = String(dept.dept).match(/^(\d+)\s*[-—]\s*(.*)$/);
            const code = m ? m[1] : "•";
            const name = m ? m[2] : dept.dept;
            return `
              <article class="mix-dept-card ${isExpanded ? "is-expanded" : ""}" data-mix-dept-toggle="${escapeAttr(dept.dept)}">
                <div class="mix-dept-row" style="--mix-accent: ${palette.stroke};">
                  <div class="mix-dept-id">
                    <span class="mix-dept-badge" style="background: ${palette.tint}; color: ${palette.stroke}; border-color: ${palette.stroke}40;">${escapeHtml(code)}</span>
                    <div class="mix-dept-name">
                      <strong>${escapeHtml(name)}</strong>
                      <small>${catCount} categor${catCount === 1 ? "y" : "ies"}</small>
                    </div>
                    <button type="button" class="mix-dept-chevron ${isExpanded ? "is-open" : ""}" aria-expanded="${isExpanded}" aria-label="${isExpanded ? "Collapse" : "Expand"} ${escapeHtml(dept.dept)} categories">&#9656;</button>
                  </div>
                  <div class="mix-dept-metric">${mixMetricCell(dept.sales, palette.stroke)}</div>
                  <div class="mix-dept-metric">${mixMetricCell(dept.units, palette.stroke)}</div>
                  <div class="mix-dept-metric">${mixMetricCell(dept.agp, palette.stroke)}</div>
                </div>
                ${isExpanded && catCount ? `
                  <div class="mix-cat-grid">
                    <div class="mix-cat-grid-head">
                      <span>Category</span>
                      <span>Sales</span>
                      <span>Units</span>
                      <span>AGP</span>
                    </div>
                    ${(dept.categories || []).map((cat) => `
                      <div class="mix-cat-row">
                        <div class="mix-cat-name">
                          <span class="mix-cat-tick" style="background: ${palette.stroke};"></span>
                          ${escapeHtml(cat.name)}
                        </div>
                        <div class="mix-cat-metric">${mixMetricCell(cat.sales, palette.stroke)}</div>
                        <div class="mix-cat-metric">${mixMetricCell(cat.units, palette.stroke)}</div>
                        <div class="mix-cat-metric">${mixMetricCell(cat.agp, palette.stroke)}</div>
                      </div>
                    `).join("")}
                  </div>
                ` : ""}
              </article>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  // Parse a formatted value string like "$1.15M", "487.8K", "-$28K".
  function parseMetricValue(s) {
    if (!s) return 0;
    const m = String(s).match(/(-?)\s*\$?\s*(\d+\.?\d*)\s*([MK]?)/i);
    if (!m) return 0;
    const sign = m[1] === "-" ? -1 : 1;
    const n = Number(m[2]);
    const u = (m[3] || "").toUpperCase();
    const mult = u === "M" ? 1e6 : u === "K" ? 1e3 : 1;
    return sign * n * mult;
  }
  function fmtDollar(n) {
    const sign = n < 0 ? "-" : "";
    const v = Math.abs(n);
    if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}K`;
    return `${sign}$${v.toFixed(0)}`;
  }
  function fmtUnits(n) {
    const sign = n < 0 ? "-" : "";
    const v = Math.abs(n);
    if (v >= 1e6) return `${sign}${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${sign}${(v / 1e3).toFixed(0)}K`;
    return `${sign}${v.toFixed(0)}`;
  }
  function chevronDelta(s) {
    if (!s) return "";
    const cls = deltaClass(s);
    const sym = cls === "positive" ? "&#9650;" : cls === "negative" ? "&#9660;" : "&#9679;";
    return `<span class="show-all-chev ${cls}">${sym} ${s}</span>`;
  }

  function renderRowsOverlay(rows, firstColLabel = "Item") {
    // Compute totals across all rows so the overlay opens with a "what
    // does this whole list add up to" answer instead of plain data dump.
    const totals = rows.reduce((acc, r) => {
      acc.sales += parseMetricValue(r.sales && r.sales.value);
      acc.units += parseMetricValue(r.units && r.units.value);
      acc.agp   += parseMetricValue(r.agp && r.agp.value);
      acc.salesD += parseMetricValue(r.sales && r.sales.deltaDollar);
      acc.unitsD += parseMetricValue(r.units && r.units.deltaDollar);
      acc.agpD   += parseMetricValue(r.agp && r.agp.deltaDollar);
      return acc;
    }, { sales: 0, units: 0, agp: 0, salesD: 0, unitsD: 0, agpD: 0 });
    const pct = (delta, total) => {
      const base = total - delta;
      return base ? ((delta / base) * 100) : 0;
    };
    const fmtPct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
    const totalsPills = [
      { label: "Total Sales", val: fmtDollar(totals.sales), delta: totals.salesD, deltaPct: pct(totals.salesD, totals.sales), fmt: fmtDollar },
      { label: "Total Units", val: fmtUnits(totals.units), delta: totals.unitsD, deltaPct: pct(totals.unitsD, totals.units), fmt: fmtUnits },
      { label: "Total AGP",   val: fmtDollar(totals.agp),  delta: totals.agpD,   deltaPct: pct(totals.agpD, totals.agp),     fmt: fmtDollar }
    ];

    // Max sales value used as the denominator for the in-row contribution
    // bar. Each row gets a slim horizontal bar showing how much it
    // contributes relative to the leader — quick visual ranking without a
    // separate chart.
    const maxSales = rows.reduce((m, r) => Math.max(m, parseMetricValue(r.sales && r.sales.value)), 0);

    return `
      <div class="show-all-body show-all-rows">
        <div class="show-all-summary-band">
          ${totalsPills.map((p) => `
            <div class="show-all-kpi">
              <span class="show-all-kpi-label">${p.label}</span>
              <strong class="show-all-kpi-value">${p.val}</strong>
              <span class="show-all-kpi-delta ${p.delta >= 0 ? "positive" : "negative"}">${p.delta >= 0 ? "+" : ""}${p.fmt(p.delta)} <em>${fmtPct(p.deltaPct)} vs LY</em></span>
            </div>
          `).join("")}
        </div>

        <div class="show-all-table-card">
          <table class="show-all-overlay-table">
            <thead>
              <tr>
                <th class="show-all-rank-col" aria-label="Rank">#</th>
                <th class="show-all-name-col">${firstColLabel}</th>
                <th class="show-all-metric-col">Sales</th>
                <th class="show-all-metric-col">Units</th>
                <th class="show-all-metric-col">AGP</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, idx) => {
                const salesNum = parseMetricValue(row.sales && row.sales.value);
                const barPct = maxSales ? Math.max(2, (salesNum / maxSales) * 100) : 0;
                return `
                  <tr>
                    <td class="show-all-rank"><span>${idx + 1}</span></td>
                    <td class="show-all-name">
                      <div class="show-all-name-text">${row.name}</div>
                      <div class="show-all-contribution" aria-label="Sales contribution"><span style="width:${barPct.toFixed(1)}%;"></span></div>
                    </td>
                    <td class="show-all-metric">
                      <strong>${(row.sales && row.sales.value) || "-"}</strong>
                      ${chevronDelta(row.sales && row.sales.delta)}
                      ${row.sales && row.sales.deltaDollar ? `<small class="show-all-metric-sub">${row.sales.deltaDollar}</small>` : ""}
                    </td>
                    <td class="show-all-metric">
                      <strong>${(row.units && row.units.value) || "-"}</strong>
                      ${chevronDelta(row.units && row.units.delta)}
                      ${row.units && row.units.deltaDollar ? `<small class="show-all-metric-sub">${row.units.deltaDollar}</small>` : ""}
                    </td>
                    <td class="show-all-metric">
                      <strong>${(row.agp && row.agp.value) || "-"}</strong>
                      ${chevronDelta(row.agp && row.agp.delta)}
                      ${row.agp && row.agp.deltaDollar ? `<small class="show-all-metric-sub">${row.agp.deltaDollar}</small>` : ""}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>

        <div class="show-all-foot">
          Showing <strong>${rows.length}</strong> ${rows.length === 1 ? "item" : "items"} &middot; ranked by Sales &middot; contribution bar relative to the leader
        </div>
      </div>
    `;
  }

  // ------------------------------------------------- items detail table

  // Replace the current items table rendering with a layout that puts LY
  // delta ($ and %) in small grey text below each value with a slim 0.5 row
  // top padding. We listen for tab clicks and re-render in our format.
  // Map each tab key to the matching show-all kind, plus a friendly label
  // used in the overlay header and the inline "show all" link. Labels
  // are written for the production volume the planner will actually see
  // (50 top, 50 bottom, 20 healthy, etc.), not the size of the mock
  // sample currently in the page — that 4-item preview is just to give
  // a sense of the shape.
  const wideTableViewMeta = {
    top:     { kind: "items-top",     title: "Top performing items",  sub: "Highest sales contribution this period.",   linkLabel: () => `Show top 50 items` },
    under:   { kind: "items-under",   title: "Underperforming items", sub: "Items trending below plan or LY.",          linkLabel: () => `Show bottom 50 items` },
    funding: { kind: "items-funding", title: "Vendor funding issues", sub: "Items with allowance or funding gaps.",     linkLabel: () => `Navigate to detailed vendor insights` },
    healthy: { kind: "items-healthy", title: "Healthy vendors",       sub: "Vendors meeting funding + margin targets.", linkLabel: () => `Show top 20 healthy vendors` }
  };
  const wideTablePreviewLimit = 5;

  function buildItemRowHtml(row, index) {
    const [name, sub, vendor, role, sales, salesChg, units, unitsChg, agp, agpChg, agpDollar, agpDollarChg, household, householdChg, share, shareChg, allowances, allowancesChg, driver, driverChg] = row;
    const deadnet = vendor === "BOAR'S HEAD" ? "$487.6K" : vendor === "KRETSCHMAR" ? "$478.9K" : "$510.2K";
    const cpi = vendor === "BOAR'S HEAD" ? "+1.30" : vendor === "SARA LEE" ? "+1.40" : "+1.10";
    const markdown = vendor === "BOAR'S HEAD" ? "$66.1K" : vendor === "SARA LEE" ? "$72.4K" : "$48.2K";
    const dual = (val, pct) => `<strong>${val}</strong><div class="item-delta ${deltaClass(pct)}">${pct}</div>`;
    return `
      <tr data-row-index="${index}" data-context-type="item" data-context-title="${escapeAttr(name)}" data-context-sub="${escapeAttr(sub)}" data-context-vendor="${escapeAttr(vendor)}">
        <td><div class="item-title">${name}</div><div class="item-sub">${sub}</div></td>
        <td>${vendor}</td><td>${role}</td>
        <td>${dual(sales, salesChg)}</td>
        <td>${dual(units, unitsChg)}</td>
        <td>${dual(agp, agpChg)}</td>
        <td>${dual(agpDollar, agpDollarChg)}</td>
        <td>${dual(allowances, allowancesChg)}</td>
        <td>${dual(deadnet, shareChg)}</td>
        <td>${dual(household, householdChg)}</td>
        <td><strong>${cpi}</strong><div class="item-delta muted">flat</div></td>
        <td>${dual(markdown, driverChg)}</td>
        <td>${dual(driver, driverChg)}</td>
      </tr>`;
  }

  const wideTableHeaderCells = ["Item / CIG / NCRC / UPC", "Vendor", "Role", "Sales", "Units", "AGP %", "AGP $", "Allowances", "Deadnet Cost", "Sales Mix", "CPI (P-U)", "Markdown $", "Driver"];

  function renderItemRowsCompact(view) {
    const target = document.getElementById("itemRows");
    if (!target) return;
    const detailViews = window.detailViews || null;
    if (!detailViews || !detailViews[view]) return;
    const headerRow = document.querySelector(".wide-table thead tr");
    if (headerRow) {
      headerRow.innerHTML = wideTableHeaderCells.map((h) => `<th>${h}</th>`).join("");
    }
    const rows = detailViews[view];
    const visibleRows = rows.slice(0, wideTablePreviewLimit);
    target.innerHTML = visibleRows.map((row, index) => buildItemRowHtml(row, index)).join("");

    // Drop the "Show more" footer link into the panel sitting just below
    // the wide table. Append once; re-render replaces innerHTML so we add
    // it every time.
    const wrap = document.querySelector(".wide-table-wrap");
    if (wrap) {
      let footer = wrap.parentElement.querySelector(".wide-table-footer");
      if (!footer) {
        footer = document.createElement("div");
        footer.className = "wide-table-footer";
        wrap.parentElement.insertBefore(footer, wrap.nextSibling);
      }
      const meta = wideTableViewMeta[view] || wideTableViewMeta.top;
      // Always render the show-all link so the affordance is consistent
      // across tabs, even when the mock data happens to fit inside the
      // preview window. Real data will run into the hundreds and the
      // user wants the "Show top N" CTA to live here regardless.
      footer.innerHTML = rows.length
        ? `<button type="button" class="show-all-link" data-show-all="${meta.kind}" data-view="${view}">${meta.linkLabel(rows.length)} &rarr;</button>`
        : "";
    }
  }

  // ----------------------------------------------------- wiring

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const showAll = event.target.closest("[data-show-all]");
      if (showAll) {
        event.preventDefault();
        openShowAllOverlay(showAll.dataset.showAll, { view: showAll.dataset.view });
        return;
      }
      // Expand / collapse a department row inside the show-all overlay
      const deptToggle = event.target.closest("[data-mix-dept-toggle]");
      if (deptToggle) {
        const dept = deptToggle.dataset.mixDeptToggle;
        if (expandedMixDepts.has(dept)) expandedMixDepts.delete(dept);
        else expandedMixDepts.add(dept);
        // Re-render the overlay body only
        const content = document.getElementById("showAllContent");
        if (content) {
          const header = content.querySelector(".show-all-head");
          const bodyHtml = renderMixOverlay();
          if (header) content.innerHTML = header.outerHTML + bodyHtml;
          else content.innerHTML = bodyHtml;
        }
        return;
      }
      const closeBtn = event.target.closest("[data-close='showAllOverlay']");
      if (closeBtn) {
        document.getElementById("showAllOverlay").hidden = true;
        return;
      }
      if (event.target.id === "showAllOverlay") {
        event.target.hidden = true;
        return;
      }
      const execToggle = event.target.closest("#promoExecToggle");
      if (execToggle) {
        promoExecCollapsed = !promoExecCollapsed;
        renderPromoExecCollapsible();
        return;
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const overlay = document.getElementById("showAllOverlay");
        if (overlay && !overlay.hidden) overlay.hidden = true;
      }
    });
    // Hook the detail tabs so the items table re-renders in compact format.
    const detailTabs = document.getElementById("detailTabs");
    if (detailTabs) {
      detailTabs.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-view]");
        if (!btn) return;
        // Defer so app.js's own listener runs first, then we overwrite.
        window.setTimeout(() => renderItemRowsCompact(btn.dataset.view), 0);
      });
    }
  }

  // ------------------ Promotion Execution: collapsible panel -----------
  let promoExecCollapsed = false;
  // Headline values that survive the collapse. Real provider would feed
  // these from the same source as the prediction cards.
  const promoExecSnapshot = {
    revenue:    { actual: "$5.41M", pred: "$6.02M",  predDelta: "-10.2%", ly: "$5.04M", lyDelta: "+7.3%" },
    units:      { actual: "2.22M",  pred: "2.47M",   predDelta: "-10.0%", ly: "2.06M",  lyDelta: "+7.6%" },
    agp:        { actual: "$1.84M", pred: "$1.79M",  predDelta: "+2.8%",  ly: "$1.71M", lyDelta: "+7.6%" },
    household:  { actual: "42.7%",  pred: "43.9%",   predDelta: "-1.2pp", ly: "40.8%",  lyDelta: "+1.9pp" },
    aiv:        { actual: "$2.44",  pred: "$2.44",   predDelta: "+0.0%",  ly: "$2.45",  lyDelta: "-0.4%" }
  };
  function deltaSignClass(text) {
    const t = String(text || "").trim();
    if (t.startsWith("+")) return "positive";
    if (t.startsWith("-")) return "negative";
    return "";
  }
  function renderPromoExecCollapsible() {
    const summary = document.getElementById("promoExecSummary");
    const body = document.getElementById("promoExecBody");
    const toggle = document.getElementById("promoExecToggle");
    if (!summary || !body || !toggle) return;
    toggle.textContent = promoExecCollapsed ? "Expand" : "Collapse";
    toggle.setAttribute("aria-expanded", String(!promoExecCollapsed));
    body.hidden = promoExecCollapsed;
    summary.hidden = !promoExecCollapsed;
    if (!promoExecCollapsed) return;
    const cells = [
      ["Revenue",    promoExecSnapshot.revenue],
      ["Units",      promoExecSnapshot.units],
      ["AGP",        promoExecSnapshot.agp],
      ["Household %",promoExecSnapshot.household],
      ["AIV",        promoExecSnapshot.aiv]
    ];
    summary.innerHTML = `
      <div class="promo-exec-summary-grid">
        ${cells.map(([label, v]) => `
          <article class="exec-summary-card">
            <span class="exec-summary-label">${label}</span>
            <strong class="exec-summary-value">${v.actual}</strong>
            <div class="exec-summary-row">
              <span class="exec-summary-cmp">vs forecast ${v.pred}</span>
              <span class="exec-summary-delta ${deltaSignClass(v.predDelta)}">${v.predDelta}</span>
            </div>
            <div class="exec-summary-row">
              <span class="exec-summary-cmp">vs LY ${v.ly}</span>
              <span class="exec-summary-delta ${deltaSignClass(v.lyDelta)}">${v.lyDelta}</span>
            </div>
          </article>
        `).join("")}
      </div>
    `;
  }

  // -------------------------------------------------- weekly P&L panel

  // Filter state. Chart-area filter is just the metric chip. Table-area
  // filters are Category / Class / Vendor / Store / Compare-to-Division.
  const wplState = {
    category: "8402 - Apples",
    klass: "All",
    vendor: "All",
    store: "All Stores",
    compareDivision: "",          // "" means compare to LY (default)
    selectedMetric: "sales",      // active chart metric chip
    expandedPeriod: null,         // 1..13 when a period is expanded inline
    weekMode: "fiscal",           // "fiscal" | "promo" — week scheme labels
    searchKind: "cig",            // "cig" | "upc" | "ncrc"
    searchValue: ""               // typed search value (narrows table data)
  };
  let wplCollapsed = false;

  const categoryOptions = ["8402 - Apples", "8404 - Avocado", "8406 - Bananas", "8408 - Citrus"];
  const classOptions = ["All", "Apples Core", "Apples Specialty"];
  const vendorOptions = ["All", "Stemilt", "Lil Snappers", "Sage Fruit"];
  const storeOptions = ["All Stores", "Bay Area", "Pacific Northwest", "Mountain West"];
  const divisionOptions = [
    "", // empty = compare to LY (the default)
    "Mountain West Division", "Northern California Division", "Southern California Division",
    "Seattle Division", "Portland Division", "Southwest Division", "Texas Division",
    "Jewel-Osco Division", "Shaw's and Star Market Division", "Mid-Atlantic Division",
    "United Division"
  ];

  // Metric chips that drive the trend chart. Each metric has its own data
  // shape (e.g. Sales = $M, Units = K, AGP% = %). Real provider would map
  // each chip onto a server-side timeseries query.
  const chartMetrics = [
    { key: "sales",       label: "Sales",              kind: "money" },
    { key: "units",       label: "Units",              kind: "units" },
    { key: "aiv",         label: "AIV",                kind: "dollar" },
    { key: "agpPct",      label: "AGP %",              kind: "pct" },
    { key: "agpDollar",   label: "AGP $",              kind: "money" },
    { key: "cogs",        label: "COGS",               kind: "money" },
    { key: "allowances",  label: "Allowances",         kind: "money" },
    { key: "deadnet",     label: "Deadnet Cost",       kind: "money" },
    { key: "deadnetUnit", label: "Deadnet Cost per unit", kind: "dollar" },
    { key: "salesMix",    label: "Sales Mix %",        kind: "pct" },
    { key: "bog",         label: "BOG",                kind: "pct" },
    { key: "markdown",    label: "Markdown $",         kind: "money" },
    { key: "cpiP",        label: "CPI - P",            kind: "pct" },
    { key: "cpiW",        label: "CPI - W",            kind: "pct" }
  ];

  // Synthesised 52-week trend data, per metric chip. Real provider would
  // replace each metric's series with a server-side timeseries query.
  function trendSeries(metricKey) {
    const baseShape = [
      28,26,30,25,29,24,21,28,29,32,35,29,31,28,33,28,
      58,76,59,64,31,29,32,34,31,29,28,33,31,42,37,66,
      39,24,20,22,18,17,15,14,16,15,17,16,18,19,20,11,
      14,15,13,16,18,20
    ];
    const lyShape = [
      41,36,32,35,34,39,31,29,31,30,34,32,29,31,27,28,
      39,55,51,61,52,39,38,32,34,28,29,31,29,36,32,52,
      64,27,28,31,27,26,22,18,19,17,21,26,24,27,23,20,
      22,24,22,25,28,30
    ];
    const scaleFor = (k) => {
      switch (k) {
        case "sales":       return { mult: 0.18, offset: 3.4 };   // $M
        case "units":       return { mult: 18,   offset: 480 };   // K units
        case "aiv":         return { mult: 0.012, offset: 2.4 };  // $
        case "agpPct":      return { mult: 0.18, offset: 44 };    // %
        case "agpDollar":   return { mult: 0.06, offset: 1.4 };   // $M
        case "cogs":        return { mult: 0.12, offset: 2.6 };   // $M
        case "allowances":  return { mult: 0.04, offset: 0.7 };   // $M
        case "deadnet":     return { mult: 0.10, offset: 2.1 };   // $M
        case "deadnetUnit": return { mult: 0.04, offset: 4.2 };   // $ / unit
        case "salesMix":    return { mult: 0.06, offset: 12 };    // %
        case "bog":         return { mult: 0.4,  offset: 56 };    // %
        case "markdown":    return { mult: 0.05, offset: 0.9 };   // $M
        case "cpiP":        return { mult: 1.6,  offset: 100 };   // bps-style %
        case "cpiW":        return { mult: 1.4,  offset: 96 };
        default:            return { mult: 0.18, offset: 3.4 };
      }
    };
    const { mult, offset } = scaleFor(metricKey);
    return Array.from({ length: 52 }, (_, i) => ({
      week: `W${i + 1}`,
      actual: Number(((baseShape[i] || 0) * mult + offset).toFixed(2)),
      ly: Number(((lyShape[i] || 0) * mult + offset).toFixed(2))
    }));
  }

  function activeMetric() {
    return chartMetrics.find((m) => m.key === wplState.selectedMetric) || chartMetrics[0];
  }
  function formatChartTick(value) {
    const m = activeMetric();
    if (m.kind === "money") return `$${value < 10 ? value.toFixed(1) : value.toFixed(0)}M`;
    if (m.kind === "units") return `${value.toFixed(0)}K`;
    if (m.kind === "pct") return `${value.toFixed(0)}%`;
    return `$${value.toFixed(2)}`;
  }

  // P&L vs KPI groupings. P&L rows are NOT indented; Gross Profit and
  // Real GP + Other Revenue are emphasized (subtle blue fill on the row).
  const wplMetrics = [
    // P&L items (no indent on any row)
    { label: "Sales to Public",        kind: "money",  group: "pl" },
    { label: "Cost of Sales",          kind: "money",  group: "pl" },
    { label: "Book Gross",             kind: "money",  group: "pl" },
    { label: "Markdown",               kind: "money",  group: "pl", negative: true },
    { label: "Shrink",                 kind: "money",  group: "pl", negative: true },
    { label: "Gross Profit",           kind: "money",  group: "pl", emphasis: true },
    { label: "Retail Allowances",      kind: "money",  group: "pl" },
    { label: "Real GP + Other Revenue",kind: "money",  group: "pl", emphasis: true },
    // KPI items — per user spec
    { label: "Sales",                  kind: "money",  group: "kpi" },
    { label: "Units",                  kind: "units",  group: "kpi" },
    { label: "AGP %",                  kind: "pct",    group: "kpi" },
    { label: "AGP $",                  kind: "money",  group: "kpi" },
    { label: "COGS",                   kind: "money",  group: "kpi" },
    { label: "Allowances",             kind: "money",  group: "kpi" },
    { label: "Deadnet Cost",           kind: "money",  group: "kpi" },
    { label: "Sales Mix",              kind: "pct",    group: "kpi" },
    { label: "BOG",                    kind: "pct",    group: "kpi" },
    { label: "Markdown",               kind: "money",  group: "kpi", negative: true },
    { label: "Discount Depth",         kind: "pct",    group: "kpi", negative: true },
    { label: "CPI - P",                kind: "pct",    group: "kpi" },
    { label: "CPI - W",                kind: "pct",    group: "kpi" }
  ];

  function searchScopeFactor() {
    // Typing a CIG/UPC/NCRC value narrows the table to that subset. We
    // synthesise the effect by scaling cell values by a deterministic factor
    // based on the typed string. Real provider would re-query.
    if (!wplState.searchValue) return 1;
    return 0.15 + (hashCode(wplState.searchValue) % 35) / 100; // 0.15..0.49
  }
  function periodCellValue(metric, periodIndex) {
    const seed = hashCode(metric.label) + periodIndex * 17;
    // Compare-to-division multiplier: shifts the comparison value so it
    // reads as the picked division rather than LY. Each division gets a
    // deterministic factor based on its name.
    const compareFactor = wplState.compareDivision
      ? 0.85 + (hashCode(wplState.compareDivision) % 30) / 100  // 0.85 .. 1.14
      : 1;
    const searchF = searchScopeFactor();
    if (metric.kind === "pct") {
      const cur = 40 + ((seed % 26) - 8);
      const lyBase = cur + ((seed % 5) - 2);
      const ly = wplState.compareDivision ? Number((lyBase * compareFactor).toFixed(1)) : lyBase;
      return { current: cur, ly, deltaPct: cur - ly, isPp: true };
    }
    if (metric.kind === "dollar") {
      const cur = Number((2.5 + ((seed % 40) - 20) / 40).toFixed(2));
      const lyBase = Number((cur + ((seed % 5) - 2) / 20).toFixed(2));
      const ly = wplState.compareDivision ? Number((lyBase * compareFactor).toFixed(2)) : lyBase;
      return { current: cur, ly, deltaPct: ((cur - ly) / ly) * 100, deltaDollar: cur - ly };
    }
    if (metric.kind === "units") {
      const cur = Math.round((700 + (seed % 320)) * searchF);
      const lyBase = cur - 30 + (seed % 60);
      const ly = wplState.compareDivision ? Math.round(lyBase * compareFactor) : Math.round(lyBase);
      return { current: cur, ly, deltaPct: ly ? ((cur - ly) / ly) * 100 : 0, deltaDollar: (cur - ly) * 1000 };
    }
    const cur = (3.5 + ((seed % 38) - 10) / 10) * searchF;
    const lyBase = (cur - 0.18 + ((seed % 5) - 2) / 40);
    const ly = wplState.compareDivision ? lyBase * compareFactor : lyBase;
    return { current: cur * 1e6, ly: ly * 1e6, deltaPct: ly ? ((cur - ly) / ly) * 100 : 0, deltaDollar: (cur - ly) * 1e6 };
  }

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  function fmtMoney(value) {
    const n = Math.abs(Number(value) || 0);
    if (n >= 1e6) return `${value < 0 ? "-" : ""}$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${value < 0 ? "-" : ""}$${(n / 1e3).toFixed(0)}K`;
    return `${value < 0 ? "-" : ""}$${n.toFixed(2)}`;
  }
  function fmtUnits(value) {
    const n = Math.abs(Number(value) || 0);
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toFixed(0);
  }
  function fmtPct(value, isPp) {
    if (value == null) return "-";
    const n = Number(value);
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}${isPp ? "pp" : "%"}`;
  }

  function compareLabel() {
    // When comparing to another division we abbreviate to DIV so the
    // division name doesn't clutter every cell; the user already picked it
    // from the dropdown and a single header chip would suffice if needed.
    return wplState.compareDivision ? "DIV" : "LY";
  }
  function formatPeriodCell(metric, cell) {
    let primary = "-";
    if (metric.kind === "pct") primary = `${cell.current.toFixed(1)}%`;
    else if (metric.kind === "dollar") primary = `$${cell.current.toFixed(2)}`;
    else if (metric.kind === "units") primary = `${cell.current.toFixed(0)}K`;
    else primary = fmtMoney(cell.current);
    const dir = cell.deltaPct >= 0 ? "positive" : "negative";
    const deltaText = cell.isPp ? fmtPct(cell.deltaPct, true)
      : cell.deltaDollar != null ? `${cell.deltaDollar >= 0 ? "+" : ""}${metric.kind === "units" ? fmtUnits(cell.deltaDollar) : fmtMoney(cell.deltaDollar)}`
      : fmtPct(cell.deltaPct);
    const lyText = metric.kind === "pct" ? `${cell.ly.toFixed(1)}%`
      : metric.kind === "dollar" ? `$${cell.ly.toFixed(2)}`
      : metric.kind === "units" ? `${cell.ly.toFixed(0)}K`
      : fmtMoney(cell.ly);
    return `
      <div class="wpl-cell">
        <span class="wpl-value">${primary}</span>
        <span class="wpl-delta ${dir}">${deltaText}</span>
        <span class="wpl-ly">${compareLabel()} ${lyText}</span>
      </div>
    `;
  }

  function renderWeeklyPLPanel() {
    const host = document.getElementById("weeklyPLPanel");
    if (!host) return;
    const periodCount = 13;
    const expanded = wplState.expandedPeriod;
    // When a period is expanded, replace its single column with 4 sub-week
    // columns inline. Other periods stay visible.
    // columnPlan is the ordered set of {kind:"period"|"week", periodIdx, weekIdx?}
    const columnPlan = [];
    for (let p = 1; p <= periodCount; p++) {
      if (expanded === p) {
        for (let w = 0; w < 4; w++) {
          columnPlan.push({ kind: "week", periodIdx: p, weekIdx: w });
        }
      } else {
        columnPlan.push({ kind: "period", periodIdx: p });
      }
    }
    const currentMetric = activeMetric();
    host.innerHTML = `
      <!-- Hidden legacy stubs so the original app.js render calls still find their targets without throwing. -->
      <div id="weeklyTrend" hidden></div>
      <div id="weekRows" hidden></div>
      <div class="panel-heading promo-exec-heading">
        <div>
          <h2>Weekly P&amp;L and KPI Trends</h2>
          <p id="trendSubtitle">Weekly P&amp;L and KPI by period. Click a period column header to expand its 4 weeks inline.</p>
        </div>
        <div class="detail-actions trend-search">
          <button class="export-button" type="button" data-wpl-export>Export weekly data</button>
          <button class="ghost-button promo-exec-toggle" type="button" id="wplToggle" aria-expanded="${!wplCollapsed}" aria-controls="wplBody">${wplCollapsed ? "Expand" : "Collapse"}</button>
        </div>
      </div>

      <div class="promo-exec-summary" id="wplSummary" ${wplCollapsed ? "" : "hidden"}>${wplCollapsed ? renderWplSummary() : ""}</div>

      <div id="wplBody" ${wplCollapsed ? "hidden" : ""}>
      <!-- The big 52-week trend chart was removed: each KPI card in #kpiBoard now carries its own
           per-metric trend, so this chart was a duplicate. The P&L / KPI period table below stays. -->

      <div class="wpl-table-filters" aria-label="Period table filters">
        <span class="wpl-table-filters-label">Filter table by:</span>
        <label class="wpl-field"><span>Category</span><select data-wpl-filter="category">${categoryOptions.map((v) => `<option ${wplState.category === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="wpl-field"><span>Class</span><select data-wpl-filter="klass">${classOptions.map((v) => `<option ${wplState.klass === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="wpl-field"><span>Vendor</span><select data-wpl-filter="vendor">${vendorOptions.map((v) => `<option ${wplState.vendor === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="wpl-field"><span>Store</span><select data-wpl-filter="store">${storeOptions.map((v) => `<option ${wplState.store === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="wpl-field"><span>Compare to</span><select data-wpl-filter="compareDivision">${divisionOptions.map((v) => `<option value="${v}" ${wplState.compareDivision === v ? "selected" : ""}>${v || "LY period"}</option>`).join("")}</select></label>
        <div class="wpl-search-field">
          <label class="wpl-field">
            <span>Search</span>
            <div class="wpl-search-control">
              <select data-wpl-filter="searchKind">
                <option value="cig" ${wplState.searchKind === "cig" ? "selected" : ""}>CIG</option>
                <option value="upc" ${wplState.searchKind === "upc" ? "selected" : ""}>UPC</option>
                <option value="ncrc" ${wplState.searchKind === "ncrc" ? "selected" : ""}>NCRC</option>
              </select>
              <input type="search" placeholder="Type ${wplState.searchKind ? wplState.searchKind.toUpperCase() : "id"}..." value="${escapeAttr(wplState.searchValue || "")}" data-wpl-filter="searchValue" />
            </div>
          </label>
        </div>
      </div>

      <div class="wpl-table-wrap">
        <table class="wpl-period-table">
          <thead>
            <tr>
              <th class="wpl-rowname">P&amp;L / KPI</th>
              ${columnPlan.map((col) => col.kind === "period"
                ? `<th class="wpl-period-th"><button type="button" class="wpl-period-btn ${expanded === col.periodIdx ? "is-expanded" : ""}" data-wpl-period="${col.periodIdx}">P${col.periodIdx}</button></th>`
                : `<th class="wpl-week-col ${col.weekIdx === 3 ? "wpl-week-last" : ""} ${col.weekIdx === 0 ? "wpl-week-first" : ""}">
                    <span class="wpl-week-label">${weekLabel(col)}</span>
                    ${col.weekIdx === 0 ? `<button type="button" class="wpl-week-close" data-wpl-period-close="${col.periodIdx}" aria-label="Collapse P${col.periodIdx}">&times;</button>` : ""}
                  </th>`
              ).join("")}
              <th class="total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            ${renderWplBody(columnPlan)}
          </tbody>
        </table>
      </div>
      </div><!-- /#wplBody -->
    `;
    if (!wplCollapsed) mountWplChart();
  }

  // Collapsed summary for the Weekly P&L panel. Deliberately avoids the
  // row-1 KPI cards (Sales / Units / AGP / AIV / Household / Share) and
  // surfaces P&L-specific items (Gross Profit, Markdown, Shrink, Allowances,
  // Deadnet) plus the filter scope and best/worst period for the chart metric.
  function renderWplSummary() {
    const fmtFor = (metric, value) => {
      if (metric.kind === "pct") return `${value.toFixed(1)}%`;
      if (metric.kind === "units") return `${fmtUnits(value * 1000)}`;
      if (metric.kind === "dollar") return `$${value.toFixed(2)}`;
      return fmtMoney(value);
    };
    const summarise = (label) => {
      const metric = wplMetrics.find((m) => m.label === label);
      if (!metric) return null;
      const cells = Array.from({ length: 13 }, (_, pi) => periodCellValue(metric, pi));
      const totalCurrent = cells.reduce((acc, c) => acc + (metric.kind === "pct" ? c.current / 13 : c.current), 0);
      const totalLy = cells.reduce((acc, c) => acc + (metric.kind === "pct" ? c.ly / 13 : c.ly), 0);
      const deltaPct = totalLy ? ((totalCurrent - totalLy) / Math.abs(totalLy)) * 100 : 0;
      const deltaText = metric.kind === "pct"
        ? fmtPct(totalCurrent - totalLy, true)
        : fmtPct(deltaPct);
      // For "negative" P&L items (markdown / shrink) a higher value is bad,
      // so flip the sign class to colour them correctly.
      const isGood = metric.negative ? deltaPct <= 0 : deltaPct >= 0;
      return {
        label: metric.label,
        value: fmtFor(metric, totalCurrent),
        ly: fmtFor(metric, totalLy),
        deltaText,
        sign: isGood ? "positive" : "negative"
      };
    };
    const cards = ["Gross Profit", "Markdown", "Shrink", "Retail Allowances", "Deadnet Cost"]
      .map(summarise)
      .filter(Boolean);

    // Best / worst period for the currently selected chart metric — a signal
    // unique to this panel that doesn't appear in the row 1 cards.
    const currentMetric = activeMetric();
    const wplMetric = wplMetrics.find((m) => m.label.toLowerCase() === currentMetric.label.toLowerCase())
      || wplMetrics.find((m) => m.label === "Sales");
    let periodSignal = "";
    if (wplMetric) {
      const cells = Array.from({ length: 13 }, (_, pi) => ({ p: pi + 1, ...periodCellValue(wplMetric, pi) }));
      const best = cells.reduce((a, b) => (b.deltaPct > a.deltaPct ? b : a));
      const worst = cells.reduce((a, b) => (b.deltaPct < a.deltaPct ? b : a));
      periodSignal = `
        <div class="wpl-summary-signal">
          <span class="wpl-summary-signal-label">${currentMetric.label} by period &mdash;</span>
          <span class="wpl-summary-signal-item">Best <strong>P${best.p}</strong> <span class="exec-summary-delta positive">${fmtPct(best.deltaPct)}</span></span>
          <span class="wpl-summary-signal-item">Worst <strong>P${worst.p}</strong> <span class="exec-summary-delta negative">${fmtPct(worst.deltaPct)}</span></span>
        </div>
      `;
    }

    const scopeChips = [
      ["Category", wplState.category],
      ["Class", wplState.klass],
      ["Vendor", wplState.vendor],
      ["Store", wplState.store],
      ["Compare", wplState.compareDivision || "LY period"]
    ].map(([k, v]) => `<span class="wpl-summary-chip"><span class="wpl-summary-chip-k">${k}</span><span class="wpl-summary-chip-v">${escapeHtml(String(v))}</span></span>`).join("");

    return `
      <div class="wpl-summary-scope">${scopeChips}</div>
      <div class="promo-exec-summary-grid wpl-summary-grid">
        ${cards.map((c) => `
          <article class="exec-summary-card">
            <span class="exec-summary-label">${c.label}</span>
            <strong class="exec-summary-value">${c.value}</strong>
            <div class="exec-summary-row">
              <span class="exec-summary-cmp">vs ${compareLabel()} ${c.ly}</span>
              <span class="exec-summary-delta ${c.sign}">${c.deltaText}</span>
            </div>
          </article>
        `).join("")}
      </div>
      ${periodSignal}
    `;
  }

  function weekLabel(col) {
    // weekIdx 0..3 within periodIdx 1..13. Fiscal: continuous W1..W52.
    // Promo: P{N}W{1..4} (1-indexed within the period).
    if (wplState.weekMode === "promo") return `P${col.periodIdx}W${col.weekIdx + 1}`;
    return `W${(col.periodIdx - 1) * 4 + col.weekIdx + 1}`;
  }

  function renderWplBody(columnPlan) {
    let html = "";
    let lastGroup = null;
    wplMetrics.forEach((metric) => {
      if (metric.group !== lastGroup) {
        html += `<tr class="wpl-section-row"><th colspan="${columnPlan.length + 2}">${metric.group === "pl" ? "P&L" : "KPI"}</th></tr>`;
        lastGroup = metric.group;
      }
      const periodCells = Array.from({ length: 13 }, (_, pi) => periodCellValue(metric, pi));
      const totalCurrent = periodCells.reduce((acc, c) => acc + (metric.kind === "pct" ? c.current / 13 : c.current), 0);
      const totalLy = periodCells.reduce((acc, c) => acc + (metric.kind === "pct" ? c.ly / 13 : c.ly), 0);
      const totalCell = {
        current: totalCurrent,
        ly: totalLy,
        deltaDollar: totalCurrent - totalLy,
        deltaPct: ((totalCurrent - totalLy) / Math.max(Math.abs(totalLy), 1)) * 100,
        isPp: metric.kind === "pct"
      };
      const cellsHtml = columnPlan.map((col) => {
        if (col.kind === "period") {
          return `<td>${formatPeriodCell(metric, periodCells[col.periodIdx - 1])}</td>`;
        }
        // synthesised week cell — vary period cell by ±5% per sub-week
        const weekSeed = hashCode(metric.label + "w" + col.periodIdx + col.weekIdx);
        const base = periodCells[col.periodIdx - 1];
        const factor = (metric.kind === "pct" ? 1 : 0.25) + (weekSeed % 5) * 0.02;
        const cur = base.current * factor / (metric.kind === "pct" ? 1 : 1);
        const ly  = base.ly * factor / (metric.kind === "pct" ? 1 : 1);
        const weekCell = {
          current: metric.kind === "pct" ? cur : cur,
          ly: metric.kind === "pct" ? ly : ly,
          deltaDollar: cur - ly,
          deltaPct: ly ? ((cur - ly) / Math.abs(ly)) * 100 : 0,
          isPp: metric.kind === "pct"
        };
        return `<td class="wpl-week-cell ${col.weekIdx === 0 ? "wpl-week-first" : ""} ${col.weekIdx === 3 ? "wpl-week-last" : ""}">${formatPeriodCell(metric, weekCell)}</td>`;
      }).join("");
      const rowClass = [
        "wpl-row",
        metric.indent ? "wpl-row-indent" : "",
        metric.emphasis ? "wpl-row-emphasis" : "",
        metric.group === "pl" ? "wpl-row-pl" : "wpl-row-kpi"
      ].join(" ");
      html += `<tr class="${rowClass}" data-wpl-metric="${escapeAttr(metric.label)}"><th class="wpl-rowname">${metric.label}</th>${cellsHtml}<td class="total-col">${formatPeriodCell(metric, totalCell)}</td></tr>`;
    });
    return html;
  }

  function escapeAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  let wplChartRoot = null;
  let wplChartHost = null;
  function mountWplChart() {
    const host = document.getElementById("wplChartHost");
    if (!host || !window.React || !window.Recharts) return;
    // Panel innerHTML re-renders detach the previous host. Re-bind the root
    // to the fresh host whenever it changes.
    if (wplChartHost !== host) {
      if (wplChartRoot) { try { wplChartRoot.unmount(); } catch (_) { /* ignore */ } }
      wplChartHost = host;
      wplChartRoot = null;
    }
    const h = window.React.createElement;
    const { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } = window.Recharts;
    const series = trendSeries(wplState.selectedMetric);
    const lyLabel = wplState.compareMode === "division" ? wplState.compareDivision : "Forecast / LY";
    const chart = h(ResponsiveContainer, { width: "100%", height: "100%" },
      h(ComposedChart, { data: series, margin: { top: 8, right: 16, bottom: 18, left: 8 } },
        h(CartesianGrid, { strokeDasharray: "3 4", stroke: "rgba(110,127,150,0.18)" }),
        h(XAxis, {
          dataKey: "week",
          tick: { fill: "#66758c", fontSize: 10 },
          tickLine: false,
          axisLine: { stroke: "rgba(102,117,140,0.24)" },
          interval: 3
        }),
        h(YAxis, {
          tick: { fill: "#66758c", fontSize: 10 },
          tickLine: false,
          axisLine: { stroke: "rgba(102,117,140,0.24)" },
          width: 48,
          tickFormatter: formatChartTick
        }),
        h(Tooltip, {
          contentStyle: { fontSize: 11, borderRadius: 6, border: "1px solid #dfe5ef" },
          labelStyle: { fontWeight: 600, color: "#0f172a" },
          formatter: (v) => [formatChartTick(v), ""]
        }),
        h(Area, {
          type: "monotone",
          dataKey: "actual",
          stroke: "#1f6feb",
          fill: "rgba(31, 111, 235, 0.12)",
          strokeWidth: 2.2,
          isAnimationActive: false,
          name: "Actual",
          dot: false
        }),
        h(Line, {
          type: "monotone",
          dataKey: "ly",
          stroke: "#9aa6b8",
          strokeDasharray: "5 5",
          strokeWidth: 1.6,
          isAnimationActive: false,
          name: lyLabel,
          dot: false
        })
      )
    );
    if (!wplChartRoot) {
      wplChartRoot = window.ReactDOM.createRoot(host);
    }
    wplChartRoot.render(chart);
  }

  // Right-click context menu on Weekly P&L rows — wires into the existing
  // Ask Assistant flow from app.js by setting pendingAssistantContext (a
  // global var owned by app.js) before opening the same context menu.
  function wireWplContextMenu() {
    document.addEventListener("contextmenu", (event) => {
      if (event.defaultPrevented) return; // app.js already handled
      const row = event.target.closest(".wpl-period-table tbody tr[data-wpl-metric]");
      if (!row) return;
      event.preventDefault();
      const metricName = row.dataset.wplMetric;
      const firstCell = row.querySelector(".wpl-cell .wpl-value");
      const firstDelta = row.querySelector(".wpl-cell .wpl-delta");
      const context = {
        component: "Weekly P&L and KPI Trends",
        path: `Dashboard > Weekly P&L > ${metricName}`,
        entity: "Metric",
        value: metricName,
        metric: metricName,
        current: firstCell ? firstCell.textContent : "-",
        previous: row.querySelector(".wpl-ly") ? row.querySelector(".wpl-ly").textContent : "-",
        additional: `Active chart metric: ${activeMetric().label}. Compare: ${wplState.compareDivision || "LY period"}.`,
        measures: [
          `Metric: ${metricName}`,
          `Selected division: ${wplState.compareDivision || "LY period"}`,
          `Filtered category: ${wplState.category}`,
          `Filtered vendor: ${wplState.vendor}`,
          `First-period delta: ${firstDelta ? firstDelta.textContent : "-"}`
        ]
      };
      window.pendingAssistantContext = context;
      const menu = document.getElementById("contextMenu");
      if (!menu) return;
      menu.hidden = false;
      const left = Math.min(event.clientX, window.innerWidth - 210);
      const top = Math.min(event.clientY, window.innerHeight - 70);
      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${Math.max(8, top)}px`;
    });
  }

  function bindWplEvents() {
    wireWplContextMenu();
    document.addEventListener("change", (event) => {
      const filter = event.target.closest("[data-wpl-filter]");
      if (filter) {
        const key = filter.dataset.wplFilter;
        wplState[key] = filter.value;
        renderWeeklyPLPanel();
      }
    });
    // Live search-value input: debounce-light, re-render the table on input.
    let searchTimer = null;
    document.addEventListener("input", (event) => {
      const filter = event.target.closest("[data-wpl-filter='searchValue']");
      if (filter) {
        wplState.searchValue = filter.value;
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
          // Re-render but preserve focus on the search input.
          const activeId = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.wplFilter;
          renderWeeklyPLPanel();
          if (activeId === "searchValue") {
            const next = document.querySelector("[data-wpl-filter='searchValue']");
            if (next) {
              next.focus();
              const v = next.value;
              next.value = "";
              next.value = v;
            }
          }
        }, 150);
        return;
      }
      // Show-all overlay items filter — narrow the rendered rows without
      // re-rendering the rest of the overlay so focus + caret stay put.
      const showAllFilter = event.target.closest("[data-show-all-filter]");
      if (showAllFilter) {
        const view = showAllFilter.dataset.showAllFilter;
        const q = showAllFilter.value.trim().toLowerCase();
        const rows = (window.detailViews && window.detailViews[view]) || [];
        const filtered = q
          ? rows.filter((row) => row.slice(0, 4).some((cell) => String(cell || "").toLowerCase().indexOf(q) >= 0))
          : rows;
        const body = document.querySelector("#showAllContent .show-all-items");
        if (body) {
          body.innerHTML = `
            <table class="wide-table show-all-wide-table">
              <thead>
                <tr>${wideTableHeaderCells.map((h) => `<th>${h}</th>`).join("")}</tr>
              </thead>
              <tbody>${filtered.map((row, idx) => buildItemRowHtml(row, idx)).join("") || `<tr><td colspan="${wideTableHeaderCells.length}" class="show-all-empty-row">No items match &ldquo;${escapeHtml(showAllFilter.value)}&rdquo;.</td></tr>`}</tbody>
            </table>
          `;
        }
        return;
      }
    });
    document.addEventListener("click", (event) => {
      // Chart metric chip
      const chartChip = event.target.closest("[data-wpl-chart-metric]");
      if (chartChip) {
        wplState.selectedMetric = chartChip.dataset.wplChartMetric;
        renderWeeklyPLPanel();
        return;
      }
      // Period column toggle (inline expand 4 weeks)
      const periodBtn = event.target.closest("[data-wpl-period]");
      if (periodBtn) {
        const p = Number(periodBtn.dataset.wplPeriod);
        wplState.expandedPeriod = wplState.expandedPeriod === p ? null : p;
        renderWeeklyPLPanel();
        return;
      }
      // Close expanded period
      const closeP = event.target.closest("[data-wpl-period-close]");
      if (closeP) {
        wplState.expandedPeriod = null;
        renderWeeklyPLPanel();
        return;
      }
      // Fiscal / promo week toggle
      const weekMode = event.target.closest("[data-wpl-week-mode]");
      if (weekMode) {
        wplState.weekMode = weekMode.dataset.wplWeekMode;
        renderWeeklyPLPanel();
        return;
      }
      // Export weekly data — synthesises a CSV from the current filtered set.
      const exportBtn = event.target.closest("[data-wpl-export]");
      if (exportBtn) {
        exportWplWeekly();
        return;
      }
      // Collapse / expand the whole panel — matches the Promotion Execution pattern.
      const wplToggleBtn = event.target.closest("#wplToggle");
      if (wplToggleBtn) {
        wplCollapsed = !wplCollapsed;
        renderWeeklyPLPanel();
        return;
      }
    });
  }

  function exportWplWeekly() {
    const header = ["Metric", "Group", ...Array.from({ length: 52 }, (_, i) => `W${i + 1}`)];
    const lines = [header.join(",")];
    wplMetrics.forEach((metric) => {
      const row = [metric.label, metric.group === "pl" ? "P&L" : "KPI"];
      for (let week = 1; week <= 52; week++) {
        const periodIdx = Math.floor((week - 1) / 4);
        const subIdx = (week - 1) % 4;
        const seed = hashCode(metric.label + "w" + (periodIdx + 1) + subIdx);
        const base = periodCellValue(metric, periodIdx);
        const factor = (metric.kind === "pct" ? 1 : 0.25) + (seed % 5) * 0.02;
        const v = base.current * factor;
        row.push(String((Number(v) || 0).toFixed(2)));
      }
      lines.push(row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-pl-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --------------- Recharts for the top KPI sparklines -----------------
  // Each .kpi-card has an svg.sparkline with data-points="..,..,..". Replace
  // it with a Recharts AreaChart driven off the same numbers so future API
  // wiring just needs to populate the data-points attribute server-side.
  const sparkRoots = new Map();
  function renderSparklines() {
    if (!window.React || !window.Recharts) return;
    const cards = document.querySelectorAll(".kpi-card");
    cards.forEach((card) => {
      let host = card.querySelector(".sparkline-host");
      let svg = card.querySelector("svg.sparkline");
      const accentEl = card.closest("[data-accent]") || card;
      const accent = getComputedStyle(accentEl).getPropertyValue("--accent").trim() || "#1f6feb";
      // Source of truth for data: either the existing svg.sparkline's data-points,
      // or — if the host already exists — the host's stored data-points.
      let raw = "";
      if (svg && svg.dataset && svg.dataset.points) raw = svg.dataset.points;
      else if (host && host.dataset && host.dataset.points) raw = host.dataset.points;
      const pts = raw.split(",").map(Number).filter((n) => Number.isFinite(n));
      if (!pts.length) return;
      if (!host) {
        host = document.createElement("div");
        host.className = "sparkline-host";
        host.dataset.points = raw;
        // Try to insert at the original SVG's position; otherwise append to .kpi-top.
        const kpiTop = card.querySelector(".kpi-top");
        if (svg) {
          svg.replaceWith(host);
        } else if (kpiTop) {
          kpiTop.appendChild(host);
        } else {
          card.appendChild(host);
        }
      } else if (svg) {
        // Both host and SVG present (app.js re-rendered). Drop the SVG.
        svg.remove();
      }
      const width = Math.max(80, host.clientWidth || host.getBoundingClientRect().width || 120);
      const height = Math.max(30, host.clientHeight || 38);
      const data = pts.map((v, i) => ({ i, v }));
      const h = window.React.createElement;
      const { AreaChart, Area, Tooltip, XAxis, YAxis } = window.Recharts;
      const chart = h(AreaChart, {
        data,
        width,
        height,
        margin: { top: 4, right: 2, bottom: 4, left: 2 }
      },
        h(XAxis, { dataKey: "i", hide: true }),
        h(YAxis, { hide: true, domain: ["auto", "auto"] }),
        h(Tooltip, {
          contentStyle: { fontSize: 10, padding: "4px 8px", border: "1px solid #dfe5ef", borderRadius: 4 },
          formatter: (v) => [v, ""]
        }),
        h(Area, {
          type: "monotone", dataKey: "v",
          stroke: accent, strokeWidth: 1.6,
          fill: accent + "22",
          isAnimationActive: false, dot: false
        })
      );
      let root = sparkRoots.get(host);
      if (!root) {
        root = window.ReactDOM.createRoot(host);
        sparkRoots.set(host, root);
      }
      root.render(chart);
    });
  }

  // --------------- Recharts for the 4 prediction cards -----------------
  // Replace each `svg.dual-chart` (drawn by app.js's old SVG renderer) with
  // a Recharts ComposedChart driven off the original data-* attrs so the
  // numbers stay consistent.
  const predictionChartRoots = new Map();
  function renderPredictionCharts() {
    if (!window.React || !window.Recharts) return;
    const cards = document.querySelectorAll(".prediction-card");
    cards.forEach((card) => {
      const svg = card.querySelector("svg.dual-chart");
      if (!svg) return;
      const actual = (svg.dataset.actual || "").split(",").map(Number);
      const compare = (svg.dataset.compare || "").split(",").map(Number);
      // Replace the svg with a div host the first time.
      let host = card.querySelector(".prediction-chart-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "prediction-chart-host";
        svg.replaceWith(host);
      }
      const data = actual.map((v, i) => ({ wk: i + 1, actual: v, compare: compare[i] || 0 }));
      const h = window.React.createElement;
      const { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } = window.Recharts;
      const chart = h(ResponsiveContainer, { width: "100%", height: "100%" },
        h(ComposedChart, { data, margin: { top: 4, right: 6, bottom: 4, left: 0 } },
          h(CartesianGrid, { strokeDasharray: "3 4", stroke: "rgba(110,127,150,0.18)", vertical: false }),
          h(XAxis, { dataKey: "wk", hide: true }),
          h(YAxis, { hide: true }),
          h(Tooltip, {
            contentStyle: { fontSize: 11, borderRadius: 6, border: "1px solid #dfe5ef" },
            labelStyle: { fontWeight: 600 }
          }),
          h(Area, {
            type: "monotone",
            dataKey: "actual",
            stroke: "#1f6feb",
            fill: "rgba(31, 111, 235, 0.14)",
            strokeWidth: 2,
            isAnimationActive: false,
            name: "Actual",
            dot: false
          }),
          h(Line, {
            type: "monotone",
            dataKey: "compare",
            stroke: "#9aa6b8",
            strokeDasharray: "5 5",
            strokeWidth: 1.6,
            isAnimationActive: false,
            name: "Forecast / LY",
            dot: false
          })
        )
      );
      let root = predictionChartRoots.get(host);
      if (!root) {
        root = window.ReactDOM.createRoot(host);
        predictionChartRoots.set(host, root);
      }
      root.render(chart);
    });
  }

  // Run after app.js has populated the dashboard. Each step is wrapped so a
  // single render error doesn't prevent event handlers from binding.
  function safeRun(label, fn) {
    try { fn(); } catch (err) { console.warn(`[dashboard-extras] ${label} failed`, err); }
  }
  function init() {
    safeRun("renderDeptMix", renderDeptMix);
    safeRun("applySummaryReplacements", applySummaryReplacements);
    safeRun("renderItemRowsCompact", () => renderItemRowsCompact("top"));
    safeRun("renderWeeklyPLPanel", renderWeeklyPLPanel);
    safeRun("renderPredictionCharts", renderPredictionCharts);
    safeRun("renderSparklines", renderSparklines);
    safeRun("renderPromoExecCollapsible", renderPromoExecCollapsible);
    safeRun("bindEvents", bindEvents);
    safeRun("bindWplEvents", bindWplEvents);
  }

  // app.js fetches /api/dashboard/bootstrap and dispatches this event
  // with the payload. Replace the local fallbacks and re-render the
  // widgets that depend on them. Charts, sparklines and bindings don't
  // care about the data swap; only the deptMix / 3-col / wide-table
  // widgets need a redraw.
  function applyBootstrap(data) {
    if (!data) return;
    if (Array.isArray(data.deptMix))    deptMix = data.deptMix;
    if (data.performance3col)           performance3col = data.performance3col;
    if (data.promoWorking)              promoWorking = data.promoWorking;
    if (data.circular)                  circular = data.circular;
    safeRun("renderDeptMix (post-bootstrap)", renderDeptMix);
    safeRun("applySummaryReplacements (post-bootstrap)", applySummaryReplacements);
    safeRun("renderItemRowsCompact (post-bootstrap)", () => {
      const active = document.querySelector("#detailTabs .active");
      renderItemRowsCompact(active ? active.dataset.view : "top");
    });
  }
  document.addEventListener("dashboard:bootstrap-ready", (event) => applyBootstrap(event && event.detail));
  if (window.__dashboardBootstrap) applyBootstrap(window.__dashboardBootstrap);

  // app.js calls loadDashboardData() asynchronously, which renders the tables.
  // Run on next tick so our overrides apply after the initial render.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(init, 50));
  } else {
    window.setTimeout(init, 50);
  }

  // Re-apply overrides once dashboard data finishes loading — app.js
  // re-renders rows after the API call resolves, which would wipe out our
  // compact items table, sparklines, and prediction charts. Suppress
  // re-entry so our own innerHTML writes don't retrigger the observer.
  let suppressObserver = false;
  function withObserverSuppressed(fn) {
    suppressObserver = true;
    try { fn(); }
    finally {
      // Defer so any micro-batched mutation records from this frame still
      // fire under the suppressed flag.
      window.setTimeout(() => { suppressObserver = false; }, 0);
    }
  }
  const observer = new MutationObserver((mutations) => {
    if (suppressObserver) return;
    for (const m of mutations) {
      const id = m.target && m.target.id;
      if (id === "performanceTable" || id === "promoTable" || id === "circularTable") {
        withObserverSuppressed(applySummaryReplacements);
        return;
      }
      if (id === "itemRows") {
        const active = document.querySelector("#detailTabs .active");
        withObserverSuppressed(() => renderItemRowsCompact(active ? active.dataset.view : "top"));
        return;
      }
      if (id === "primaryMetrics") {
        withObserverSuppressed(renderSparklines);
        return;
      }
    }
  });
  // Attach the observer ASAP — app.js's API call can resolve in <50ms so any
  // delay risks missing the re-render that wipes our Recharts hosts.
  function attachObserver() {
    let allFound = true;
    ["performanceTable", "promoTable", "circularTable", "itemRows", "primaryMetrics"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el, { childList: true });
      else allFound = false;
    });
    if (!allFound) window.setTimeout(attachObserver, 16);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachObserver);
  } else {
    attachObserver();
  }

  // Backup: poll until every KPI sparkline SVG has been replaced with a
  // Recharts host. Keep polling even when there are no SVGs yet (the API may
  // be in flight). Stops only once we've found AND converted at least one
  // sparkline and no SVGs remain.
  let sparklinePollAttempts = 0;
  let sparklinesEverFound = false;
  function pollForUnconvertedSparklines() {
    sparklinePollAttempts += 1;
    if (sparklinePollAttempts > 200) return; // give up after ~20s
    const remaining = document.querySelectorAll(".kpi-card svg.sparkline");
    if (remaining.length > 0) {
      sparklinesEverFound = true;
      withObserverSuppressed(renderSparklines);
    } else if (sparklinesEverFound) {
      // We've replaced everything we ever saw; nothing more to do.
      return;
    }
    window.setTimeout(pollForUnconvertedSparklines, 100);
  }
  window.setTimeout(pollForUnconvertedSparklines, 150);
})();
