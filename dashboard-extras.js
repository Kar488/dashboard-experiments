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
    expandedPeriod: null,         // 1..13 when a period is expanded inline (P&L slide)
    weekMode: "fiscal",           // "fiscal" | "promo" — week scheme labels
    searchKind: "cig",            // "cig" | "upc" | "ncrc"
    searchValue: "",              // typed search value (narrows table data)
    slide: 0,                     // active deck slide: 0 KPI Trends · 1 P&L · 2 Store Analysis
    kpi: {                        // KPI Trends slide — hierarchy scope + time scale
      depts: [],                  // seeded with the owned departments below
      asms: [], groups: [], cats: [], classes: [], subs: [],
      scale: "period",            // "week" | "period" | "quarter"
      expandedPeriod: null,       // 1..13 → 4 weeks inline
      expandedQuarter: null,      // 0..3 → its periods inline
      sortBy: "",                 // "" chronological, else a KPI label — reorders the time columns
      sortDir: "desc"
    },
    sa: {                         // Store Analysis slide — filters + column sort
      depts: [], districts: [], stores: [],
      sortBy: "num",              // "num" | "loc" | "district" | a KPI label
      sortDir: "asc"
    },
    heatPalette: "sage",          // diverging cell-tint palette, shared by all 3 slides
    openMsel: null,               // which multi-select popup is open, e.g. "kpi.depts"
    mselQ: ""                     // its type-ahead query
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

  // ---- merch hierarchy + store dimensions for the KPI Trends / Store Analysis slides.
  // Everything carries a code AND a name (mirrors the real hierarchy); departments run
  // past 50 so the picker defaults to the 1–2 you own and type-aheads the rest — same
  // UX as the 52-week plan constraints page.
  const WPL_DEPTS = (() => {
    const names = [
      "Grocery", "Frozen Foods", "Dairy", "Produce", "Meat", "Seafood", "Service Deli",
      "Floral", "Liquor", "Beer & Wine", "General Merchandise", "Health & Beauty",
      "Pharmacy", "Candy", "Snacks", "Beverages", "Water & Sparkling", "Coffee & Tea",
      "Cereal & Breakfast", "Baking", "Spices & Seasonings", "Canned Goods",
      "Condiments & Sauces", "Pasta & Grains", "International Foods", "Natural & Organic",
      "Baby Care", "Pet Care", "Paper Goods", "Cleaning Supplies", "Laundry",
      "Personal Care", "Cosmetics", "Vitamins & Supplements", "First Aid", "Kitchenware",
      "Small Appliances", "Seasonal", "Toys", "Stationery", "Automotive", "Hardware",
      "Garden", "Sporting Goods", "Electronics", "Books & Magazines", "Greeting Cards",
      "Party Supplies", "Ice Cream", "Cheese Shop", "Sushi", "Salad Bar", "Hot Foods", "Catering"
    ];
    const list = [
      { code: "370", name: "Deli/Prepared Foods", owned: true },
      { code: "380", name: "Bakery", owned: true }
    ];
    let code = 100;
    names.forEach((n) => { code += 5; while (code === 370 || code === 380) code += 5; list.push({ code: String(code), name: n }); });
    return list.sort((a, b) => Number(a.code) - Number(b.code));
  })();
  const WPL_OWNED_DEPTS = WPL_DEPTS.filter((d) => d.owned).map((d) => d.code);
  wplState.kpi.depts = WPL_OWNED_DEPTS.slice();
  wplState.sa.depts = WPL_OWNED_DEPTS.slice();

  const WPL_ASMS = [
    { code: "A01", name: "Maria Gonzalez" }, { code: "A02", name: "Derek Holt" },
    { code: "A03", name: "Priya Natarajan" }, { code: "A04", name: "Sam Whitfield" },
    { code: "A05", name: "Elaine Cho" }, { code: "A06", name: "Marcus Reed" },
    { code: "A07", name: "Anna Kowalski" }, { code: "A08", name: "Jordan Ellis" },
    { code: "A09", name: "Tom Delgado" }, { code: "A10", name: "Rachel Kim" },
    { code: "A11", name: "Victor Osei" }, { code: "A12", name: "Dana Brooks" }
  ];
  const dim = ([code, name]) => ({ code, name });
  // Linked hierarchy: department → category → class → sub-class. The owned
  // departments carry curated category names; every other department gets a
  // deterministic generated tree so the cascade always resolves. Each child
  // picker only offers options under the levels selected above it.
  const WPL_HIER = (() => {
    const groups = [], cats = [], classes = [], subs = [];
    // department → groups (same level the Performance Explorer drills, e.g. "35 · Eggs") → categories
    const CURATED = {
      "370": [
        ["Hot Case", ["Rotisserie", "Fried Chicken", "Hot Sides", "Soups"]],
        ["Meals & Sandwiches", ["Sandwiches", "Prepared Meals"]],
        ["Entertaining", ["Party Trays", "Sushi"]]
      ],
      "380": [
        ["Fresh Bakery", ["Artisan Bread", "Bagels & Rolls"]],
        ["Sweet Goods", ["Cakes & Cupcakes", "Donuts & Pastries", "Seasonal Bakery"]]
      ]
    };
    const GEN_GROUPS = [["Core Range", ["Core", "Value"]], ["Specialty Range", ["Specialty", "Seasonal"]]];
    const CLASS_POOL = ["Core", "Specialty", "Organic", "Premium", "Value", "Private Label", "National Brand", "Local"];
    const SUB_POOL = ["Everyday", "Multipack", "Club Pack", "Single Serve", "Grab & Go", "Limited Time", "New Item", "Family Pack"];
    let gSeq = 10;
    WPL_DEPTS.forEach((d) => {
      const tree = CURATED[d.code] || GEN_GROUPS.map(([gn, cs]) => [gn, cs.map((n) => `${d.name} ${n}`)]);
      let ci = 0;
      tree.forEach(([gName, catNames]) => {
        const gCode = String(gSeq++);
        groups.push({ code: gCode, name: gName, dept: d.code });
        catNames.forEach((nm) => {
          ci++;
          const cCode = d.code + String(ci);
          cats.push({ code: cCode, name: nm, dept: d.code, group: gCode });
          const nCls = 2 + (hashCode(cCode) % 2);
          for (let k = 0; k < nCls; k++) {
            const clCode = cCode + String(k + 1);
            classes.push({ code: clCode, name: CLASS_POOL[(hashCode(cCode) + k * 3) % CLASS_POOL.length], cat: cCode });
            const nSub = 2 + (hashCode(clCode) % 2);
            for (let s = 0; s < nSub; s++) {
              subs.push({ code: clCode + String(s + 1), name: SUB_POOL[(hashCode(clCode) + s * 5) % SUB_POOL.length], cls: clCode });
            }
          }
        });
      });
    });
    return { groups, cats, classes, subs };
  })();
  function kpiGroupOptions() {
    return WPL_HIER.groups.filter((g) => wplState.kpi.depts.indexOf(g.dept) >= 0);
  }
  function kpiCatOptions() {
    const sel = wplState.kpi.groups;
    const avail = sel.length ? sel : kpiGroupOptions().map((g) => g.code);
    const ok = {};
    avail.forEach((g) => { ok[g] = 1; });
    return WPL_HIER.cats.filter((c) => ok[c.group]);
  }
  function kpiClassOptions() {
    const sel = wplState.kpi.cats;
    const avail = sel.length ? sel : kpiCatOptions().map((c) => c.code);
    const ok = {};
    avail.forEach((c) => { ok[c] = 1; });
    return WPL_HIER.classes.filter((c) => ok[c.cat]);
  }
  function kpiSubOptions() {
    const sel = wplState.kpi.classes;
    const avail = sel.length ? sel : kpiClassOptions().map((c) => c.code);
    const ok = {};
    avail.forEach((c) => { ok[c] = 1; });
    return WPL_HIER.subs.filter((s) => ok[s.cls]);
  }
  // parent selection changed → drop child picks that fell out of scope
  function pruneKpiHierarchy() {
    const grpOk = {};
    kpiGroupOptions().forEach((g) => { grpOk[g.code] = 1; });
    wplState.kpi.groups = wplState.kpi.groups.filter((g) => grpOk[g]);
    const catOk = {};
    kpiCatOptions().forEach((c) => { catOk[c.code] = 1; });
    wplState.kpi.cats = wplState.kpi.cats.filter((c) => catOk[c]);
    const clsOk = {};
    kpiClassOptions().forEach((c) => { clsOk[c.code] = 1; });
    wplState.kpi.classes = wplState.kpi.classes.filter((c) => clsOk[c]);
    const subOk = {};
    kpiSubOptions().forEach((s) => { subOk[s.code] = 1; });
    wplState.kpi.subs = wplState.kpi.subs.filter((s) => subOk[s]);
  }
  const WPL_DISTRICTS = [
    ["D-01", "Chicago North"], ["D-02", "Chicago South"], ["D-03", "Chicago West"], ["D-04", "North Shore"],
    ["D-05", "Northwest Suburbs"], ["D-06", "West Suburbs"], ["D-07", "South Suburbs"], ["D-08", "Northwest Indiana"]
  ].map(dim);
  const WPL_STORES = [
    ["0018", "Lincoln Park, IL", "D-01"], ["0022", "Lakeview, IL", "D-01"], ["0034", "Evanston, IL", "D-04"],
    ["0041", "Skokie, IL", "D-04"], ["0049", "Wilmette, IL", "D-04"], ["0058", "Naperville, IL", "D-06"],
    ["0063", "Aurora, IL", "D-06"], ["0071", "Wheaton, IL", "D-06"], ["0077", "Oak Park, IL", "D-03"],
    ["0084", "Cicero, IL", "D-03"], ["0092", "Berwyn, IL", "D-03"], ["0103", "Orland Park, IL", "D-07"],
    ["0111", "Tinley Park, IL", "D-07"], ["0118", "Oak Lawn, IL", "D-07"], ["0125", "Hammond, IN", "D-08"],
    ["0132", "Merrillville, IN", "D-08"], ["0139", "Schererville, IN", "D-08"], ["0146", "Arlington Heights, IL", "D-05"],
    ["0153", "Palatine, IL", "D-05"], ["0160", "Schaumburg, IL", "D-05"], ["0167", "Des Plaines, IL", "D-05"],
    ["0174", "Mount Prospect, IL", "D-05"], ["0181", "Downers Grove, IL", "D-06"], ["0188", "Lombard, IL", "D-06"],
    ["0195", "Elmhurst, IL", "D-03"], ["0202", "Hyde Park, IL", "D-02"], ["0209", "Beverly, IL", "D-02"],
    ["0216", "Bridgeport, IL", "D-02"]
  ].map(([num, loc, district]) => ({ num, loc, district }));

  // Retail calendar quarters over the 13 periods (Q4 carries the 13th).
  const WPL_QUARTERS = [
    { label: "Q1", periods: [1, 2, 3] }, { label: "Q2", periods: [4, 5, 6] },
    { label: "Q3", periods: [7, 8, 9] }, { label: "Q4", periods: [10, 11, 12, 13] }
  ];

  const WPL_SLIDES = [
    { key: "kpi", title: "KPI Trends", tag: "Hierarchy scope · weekly / period / quarter", sub: "KPIs across your merch hierarchy. Filter department, ASM, category, class and sub-class; switch the time scale, sort by any KPI, and expand periods to weeks." },
    { key: "pl", title: "Weekly P&L", tag: "P&L by period · expand weeks", sub: "P&L by period. Click a period column header to expand its 4 weeks inline, or swipe to the other views." },
    { key: "stores", title: "Store Analysis", tag: "Same KPIs by store · district view", sub: "The KPI Trends measures by store, with store number, location and district. Filter by department, district and store; click a column header to sort." }
  ];

  // Store picker options — scoped to the selected districts, like the hierarchy cascade.
  function saStoreOptions() {
    const districts = wplState.sa.districts;
    return WPL_STORES
      .filter((s) => !districts.length || districts.indexOf(s.district) >= 0)
      .map((s) => ({ code: s.num, name: s.loc }));
  }
  function pruneSaStores() {
    const ok = {};
    saStoreOptions().forEach((s) => { ok[s.code] = 1; });
    wplState.sa.stores = wplState.sa.stores.filter((c) => ok[c]);
  }

  // Multi-select registry — one config per type-ahead picker on the KPI / Store slides.
  // `items` is a function so the cascaded pickers resolve against the current parent picks.
  const WPL_MSELS = {
    "kpi.depts":     { label: "Department", noun: "departments", owned: true, items: () => WPL_DEPTS, min: 1, allLabel: "", get: () => wplState.kpi.depts, set: (v) => { wplState.kpi.depts = v; pruneKpiHierarchy(); } },
    "kpi.asms":      { label: "ASM", noun: "ASMs", items: () => WPL_ASMS, min: 0, allLabel: "All ASMs", get: () => wplState.kpi.asms, set: (v) => { wplState.kpi.asms = v; } },
    "kpi.groups":    { label: "Group", noun: "groups in scope", items: kpiGroupOptions, min: 0, allLabel: "All groups", get: () => wplState.kpi.groups, set: (v) => { wplState.kpi.groups = v; pruneKpiHierarchy(); } },
    "kpi.cats":      { label: "Category", noun: "categories in scope", items: kpiCatOptions, min: 0, allLabel: "All categories", get: () => wplState.kpi.cats, set: (v) => { wplState.kpi.cats = v; pruneKpiHierarchy(); } },
    "kpi.classes":   { label: "Class", noun: "classes in scope", items: kpiClassOptions, min: 0, allLabel: "All classes", get: () => wplState.kpi.classes, set: (v) => { wplState.kpi.classes = v; pruneKpiHierarchy(); } },
    "kpi.subs":      { label: "Sub-class", noun: "sub-classes in scope", items: kpiSubOptions, min: 0, allLabel: "All sub-classes", get: () => wplState.kpi.subs, set: (v) => { wplState.kpi.subs = v; } },
    "sa.depts":      { label: "Department", noun: "departments", owned: true, items: () => WPL_DEPTS, min: 1, allLabel: "", get: () => wplState.sa.depts, set: (v) => { wplState.sa.depts = v; } },
    "sa.districts":  { label: "District", noun: "districts", items: () => WPL_DISTRICTS, min: 0, allLabel: "All districts", get: () => wplState.sa.districts, set: (v) => { wplState.sa.districts = v; pruneSaStores(); } },
    "sa.stores":     { label: "Store", noun: "stores in scope", items: saStoreOptions, min: 0, allLabel: "All stores", get: () => wplState.sa.stores, set: (v) => { wplState.sa.stores = v; } }
  };

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
    // KPI items — mirrors the Performance Explorer column set
    { label: "Sales",                  kind: "money",  group: "kpi" },
    { label: "Units",                  kind: "units",  group: "kpi" },
    { label: "AIV",                    kind: "dollar", group: "kpi" },
    { label: "AGP %",                  kind: "pct",    group: "kpi" },
    { label: "AGP $",                  kind: "money",  group: "kpi" },
    { label: "COGS",                   kind: "money",  group: "kpi" },
    { label: "Allowances",             kind: "money",  group: "kpi" },
    { label: "Deadnet Cost",           kind: "money",  group: "kpi" },
    { label: "Sales Mix",              kind: "pct",    group: "kpi" },
    { label: "BOG %",                  kind: "pct",    group: "kpi" },
    { label: "Markdown %",             kind: "pct",    group: "kpi", negative: true },
    { label: "MKT Share MULO+",        kind: "pct",    group: "kpi" },
    { label: "MKT Share Food",         kind: "pct",    group: "kpi" },
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
      // small, sign-mixed LY offsets so the vs-LY tint field reads like the
      // Performance Explorer (mostly light, both directions)
      const lyBase = cur + ((seed % 5) - 2) * 0.6;
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
    // relative deltas −4%…+4%, mixed sign — matches the explorer's tint spread
    const lyBase = cur * (1 + ((seed % 9) - 4) / 100);
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
  // Four data lines per cell, exactly like the Performance Explorer heat grid:
  // CY value · LY value · relative Δ% · (absolute Δ in the metric's unit).
  function formatPeriodCell(metric, cell) {
    const fmtVal = (v) => metric.kind === "pct" ? `${v.toFixed(1)}%`
      : metric.kind === "dollar" ? `$${v.toFixed(2)}`
      : metric.kind === "units" ? `${v.toFixed(0)}K`
      : fmtMoney(v);
    const diff = cell.current - cell.ly;
    const relPct = cell.ly ? (diff / Math.abs(cell.ly)) * 100 : 0;
    const pctStr = `${relPct < 0 ? "−" : ""}${Math.abs(relPct).toFixed(1)}%`;
    const sign = diff >= 0 ? "+" : "−";
    const absStr = metric.kind === "pct" ? `${sign}${Math.abs(diff).toFixed(1)}pp`
      : metric.kind === "dollar" ? `${sign}$${Math.abs(diff).toFixed(2)}`
      : metric.kind === "units" ? `${sign}${fmtUnits(Math.abs(diff) * 1000)}`
      : `${sign}${fmtMoney(Math.abs(diff))}`;
    const dir = diff >= 0 ? "positive" : "negative";
    return `
      <div class="wpl-cell">
        <span class="wpl-value">${fmtVal(cell.current)}</span>
        <span class="wpl-ly">${fmtVal(cell.ly)}</span>
        <span class="wpl-delta ${dir}">${pctStr}</span>
        <span class="wpl-dabs ${dir}">(${absStr})</span>
      </div>
    `;
  }

  // Soft diverging heat tint per cell — same palettes + alpha formula as the
  // Performance Explorer heat grid: alpha grows with |Δ vs LY|, capped so it
  // never glares. Returns an inline style for the td.
  const WPL_PALETTES = {
    none:     { label: "None — clean table" },
    sage:     { pos: "96,150,120",  neg: "198,132,116", label: "Sage / Clay" },
    teal:     { pos: "90,158,150",  neg: "205,123,102", label: "Teal / Terracotta" },
    bluamber: { pos: "86,132,190",  neg: "206,154,86",  label: "Blue / Amber (colour-blind safe)" },
    indigo:   { pos: "108,128,196", neg: "214,124,120", label: "Indigo / Coral" },
    emerald:  { pos: "88,156,118",  neg: "190,110,80",  label: "Emerald / Rust" },
    steel:    { pos: "104,146,152", neg: "186,138,140", label: "Muted steel / Rose" },
    slate:    { pos: "118,140,172", neg: "198,168,96",  label: "Slate / Gold (colour-blind safe)" },
    ocean:    { pos: "92,150,168",  neg: "202,140,110", label: "Ocean / Sand" },
    classic:  { pos: "110,160,110", neg: "200,110,105", label: "Classic green / red (muted)" },
    mono:     { pos: "120,150,178", neg: "150,158,168", label: "Mono blue (single-hue)" }
  };
  function wplHeatStyle(cell) {
    const p = WPL_PALETTES[wplState.heatPalette] || WPL_PALETTES.sage;
    if (!p.pos) return "";
    // Magnitude is the RELATIVE % change vs LY for every metric kind — the same
    // basis the Performance Explorer uses, so equal palettes render equal colours
    // (tinting rate metrics by raw pp made them read far darker than the explorer).
    const d = cell.ly != null
      ? (cell.ly ? ((cell.current - cell.ly) / Math.abs(cell.ly)) * 100 : 0)
      : (Number(cell.deltaPct) || 0);
    const mag = Math.min(1, Math.abs(d) / 9);
    const rgb = d >= 0 ? p.pos : p.neg;
    return `background:rgba(${rgb},${(0.05 + mag * 0.5).toFixed(3)});`;
  }
  function wplPaletteHTML() {
    return `
      <label class="wpl-heat-picker"><span>Palette</span>
        <select data-wpl-palette>
          ${Object.keys(WPL_PALETTES).map((k) => `<option value="${k}" ${wplState.heatPalette === k ? "selected" : ""}>${WPL_PALETTES[k].label}</option>`).join("")}
        </select>
      </label>`;
  }
  function wplHeatLegendHTML() {
    if (!(WPL_PALETTES[wplState.heatPalette] || WPL_PALETTES.sage).pos) {
      return `<div class="wpl-heat-legend"><span class="wpl-heat-note">Clean table — no heat colouring.</span></div>`;
    }
    const stops = Array.from({ length: 11 }, (_, i) => {
      const d = ((i - 5) / 5) * 9;
      return `<span style="${wplHeatStyle({ deltaPct: d })}"></span>`;
    }).join("");
    return `<div class="wpl-heat-legend"><span>Worse</span><div class="wpl-heat-scale">${stops}</div><span>Better vs ${compareLabel()}</span><span class="wpl-heat-note">Every cell is tinted by its change vs last year.</span></div>`;
  }

  function renderWeeklyPLPanel() {
    const host = document.getElementById("weeklyPLPanel");
    if (!host) return;
    const slide = WPL_SLIDES[wplState.slide] || WPL_SLIDES[0];
    host.innerHTML = `
      <!-- Hidden legacy stubs so the original app.js render calls still find their targets without throwing. -->
      <div id="weeklyTrend" hidden></div>
      <div id="weekRows" hidden></div>
      <div class="panel-heading promo-exec-heading">
        <div>
          <h2>Weekly P&amp;L and KPI Trends</h2>
          <p id="trendSubtitle">${slide.sub}</p>
        </div>
        <div class="detail-actions trend-search">
          <button class="export-button" type="button" data-wpl-export>Export weekly data</button>
          <button class="ghost-button promo-exec-toggle" type="button" id="wplToggle" aria-expanded="${!wplCollapsed}" aria-controls="wplBody">${wplCollapsed ? "Expand" : "Collapse"}</button>
        </div>
      </div>

      <div class="promo-exec-summary" id="wplSummary" ${wplCollapsed ? "" : "hidden"}>${wplCollapsed ? renderWplSummary() : ""}</div>

      <div id="wplBody" ${wplCollapsed ? "hidden" : ""}>
      <!-- Swipeable deck: P&L, KPI Trends and Store Analysis are separate slides. The tab
           cards show every available view; drag / trackpad-swipe the deck (no scrollbar) or
           click a tab. Inside a slide the wide table pans first — the deck takes over at
           the table's edge, same feel as the 52-week plan grid. -->
      <div class="wpl-deck-navrow">
        <div class="wpl-deck-nav" role="tablist" aria-label="Weekly P&L views">
          ${WPL_SLIDES.map((s, i) => `
            <button type="button" role="tab" class="wpl-deck-tab ${i === wplState.slide ? "is-active" : ""}" data-wpl-slide="${i}" aria-selected="${i === wplState.slide}" title="${escapeAttr(s.tag)}">
              <span class="wpl-deck-tab-num">${i + 1}</span>
              <span class="wpl-deck-tab-title">${s.title}</span>
            </button>`).join("")}
        </div>
        <span class="wpl-deck-swipehint">Swipe or drag sideways to switch views</span>
        ${wplPaletteHTML()}
      </div>
      <div class="wpl-deck" id="wplDeck">
        <div class="wpl-deck-track">
          <section class="wpl-slide" aria-label="KPI Trends">${renderKpiSlideHTML()}</section>
          <section class="wpl-slide" aria-label="Weekly P&L">${renderPlSlideHTML()}</section>
          <section class="wpl-slide" aria-label="Store Analysis">${renderStoreSlideHTML()}</section>
        </div>
      </div>
      ${wplHeatLegendHTML()}
      </div><!-- /#wplBody -->
    `;
    if (!wplCollapsed) {
      mountWplChart();
      bindWplDeck();
      snapWplDeck(false);   // restore the active slide instantly (scroll-based, no transform)
      if (!window.__wplDeckResizeBound) {
        window.__wplDeckResizeBound = true;
        window.addEventListener("resize", () => snapWplDeck(false));
      }
      // pin the store Total row directly under the (sticky) header, like the
      // Performance Explorer's rolled-up top row
      const storeHead = host.querySelector(".wpl-store-table thead");
      if (storeHead) {
        const h = Math.max(0, Math.round(storeHead.getBoundingClientRect().height) - 1);
        host.querySelectorAll(".wpl-store-totalrow th, .wpl-store-totalrow td").forEach((el) => { el.style.top = h + "px"; });
      }
      // keep the open type-ahead usable across full re-renders (checkbox picks re-render the panel)
      if (wplState.openMsel) {
        const inp = host.querySelector(`[data-wpl-msel-search="${wplState.openMsel}"]`);
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      }
    }
  }

  // ------------------------------------------ slide 1 — Weekly P&L
  function plColumnPlan() {
    // When a period is expanded, replace its single column with 4 sub-week
    // columns inline. Other periods stay visible.
    const plan = [];
    for (let p = 1; p <= 13; p++) {
      if (wplState.expandedPeriod === p) for (let w = 0; w < 4; w++) plan.push({ kind: "week", periodIdx: p, weekIdx: w });
      else plan.push({ kind: "period", periodIdx: p });
    }
    return plan;
  }
  function renderPlSlideHTML() {
    const columnPlan = plColumnPlan();
    const expanded = wplState.expandedPeriod;
    return `
      <div class="wpl-table-filters" aria-label="P&L table filters">
        <span class="wpl-table-filters-label">Filter table by:</span>
        <label class="wpl-field"><span>Category</span><select data-wpl-filter="category">${categoryOptions.map((v) => `<option ${wplState.category === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      </div>
      <div class="wpl-table-wrap">
        <table class="wpl-period-table">
          <thead>
            <tr>
              <th class="wpl-rowname">P&amp;L</th>
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
            ${metricRowsHTML(wplMetrics.filter((m) => m.group === "pl"), columnPlan, null, "wpl-row-pl")}
          </tbody>
        </table>
      </div>`;
  }

  // ------------------------------------------ slide 2 — KPI Trends
  function kpiSig() {
    const k = wplState.kpi;
    return [k.asms.join(","), k.depts.join(","), k.groups.join(","), k.cats.join(","), k.classes.join(","), k.subs.join(",")].join("|");
  }
  function kpiColumnPlan() {
    const k = wplState.kpi, plan = [];
    if (k.scale === "week") {
      for (let p = 1; p <= 13; p++) for (let w = 0; w < 4; w++) plan.push({ kind: "week", periodIdx: p, weekIdx: w });
      return plan;
    }
    if (k.scale === "period") {
      for (let p = 1; p <= 13; p++) {
        if (k.expandedPeriod === p) for (let w = 0; w < 4; w++) plan.push({ kind: "week", periodIdx: p, weekIdx: w });
        else plan.push({ kind: "period", periodIdx: p });
      }
      return plan;
    }
    // quarter scale: an expanded quarter shows its periods; a period inside it can
    // expand further into its 4 weeks (same drill as the 52-week plan grid).
    WPL_QUARTERS.forEach((q, qi) => {
      if (k.expandedQuarter !== qi) { plan.push({ kind: "quarter", qIdx: qi }); return; }
      q.periods.forEach((p, pj) => {
        if (k.expandedPeriod === p) for (let w = 0; w < 4; w++) plan.push({ kind: "week", periodIdx: p, weekIdx: w, qFirst: pj === 0 && w === 0 });
        else plan.push({ kind: "period", periodIdx: p, qFirst: pj === 0 });
      });
    });
    return plan;
  }
  function kpiHeaderCells(plan) {
    const k = wplState.kpi;
    return plan.map((col) => {
      if (col.kind === "quarter") {
        return `<th class="wpl-period-th"><button type="button" class="wpl-period-btn" data-wpl-kpi-quarter="${col.qIdx}" title="Expand ${WPL_QUARTERS[col.qIdx].label} into its periods">${WPL_QUARTERS[col.qIdx].label}</button></th>`;
      }
      if (col.kind === "period") {
        return `<th class="wpl-period-th ${col.qFirst ? "wpl-week-first" : ""}">
            <button type="button" class="wpl-period-btn ${k.expandedPeriod === col.periodIdx ? "is-expanded" : ""}" data-wpl-kpi-period="${col.periodIdx}" title="Expand P${col.periodIdx} into its 4 weeks">P${col.periodIdx}</button>
            ${col.qFirst ? `<button type="button" class="wpl-week-close" data-wpl-kpi-quarter-close aria-label="Collapse quarter">&times;</button>` : ""}
          </th>`;
      }
      const close = col.qFirst
        ? `<button type="button" class="wpl-week-close" data-wpl-kpi-quarter-close aria-label="Collapse quarter">&times;</button>`
        : (col.weekIdx === 0 && k.scale !== "week" ? `<button type="button" class="wpl-week-close" data-wpl-kpi-period-close aria-label="Collapse P${col.periodIdx}">&times;</button>` : "");
      return `<th class="wpl-week-col ${col.weekIdx === 3 ? "wpl-week-last" : ""} ${col.weekIdx === 0 ? "wpl-week-first" : ""}">
          <span class="wpl-week-label">${weekLabel(col)}</span>
          ${close}
        </th>`;
    }).join("");
  }
  function renderKpiSlideHTML() {
    const k = wplState.kpi;
    let plan = kpiColumnPlan();
    // Sort the time columns by the chosen KPI (best → worst), instead of
    // chronologically. Expanding a period/quarter resets to chronological.
    const sortMetric = k.sortBy ? wplMetrics.find((m) => m.group === "kpi" && m.label === k.sortBy) : null;
    if (sortMetric) {
      const sig = kpiSig();
      const periodCells = Array.from({ length: 13 }, (_, pi) => scaledCell(sortMetric, periodCellValue(sortMetric, pi), sig));
      const valFor = (col) => col.kind === "quarter" ? quarterCellValue(sortMetric, col.qIdx, periodCells).current
        : col.kind === "period" ? periodCells[col.periodIdx - 1].current
        : weekCellValue(sortMetric, periodCells[col.periodIdx - 1], col.periodIdx, col.weekIdx).current;
      plan = plan.slice().sort((a, b) => (valFor(b) - valFor(a)) * (k.sortDir === "asc" ? -1 : 1));
    }
    const scales = [["week", "Weekly"], ["period", "Period"], ["quarter", "Quarter"]];
    const scaleNoun = k.scale === "week" ? "weeks" : k.scale === "quarter" ? "quarters" : "periods";
    return `
      <div class="wpl-table-filters wpl-kpi-filters" aria-label="KPI trend filters">
        <span class="wpl-table-filters-label">Scope:</span>
        ${renderWplMsel("kpi.asms")}
        ${renderWplMsel("kpi.depts")}
        ${renderWplMsel("kpi.groups")}
        ${renderWplMsel("kpi.cats")}
        ${renderWplMsel("kpi.classes")}
        ${renderWplMsel("kpi.subs")}
        <div class="wpl-field wpl-scale-field"><span>Time scale</span>
          <div class="wpl-metric-capsule wpl-metric-capsule-sm">
            ${scales.map(([key, label]) => `<button type="button" class="wpl-capsule-opt ${wplState.kpi.scale === key ? "active" : ""}" data-wpl-kpi-scale="${key}">${label}</button>`).join("")}
          </div>
        </div>
        <label class="wpl-field wpl-sort-field"><span>Sort ${scaleNoun} by</span>
          <div class="wpl-sort-control">
            <select data-wpl-kpi-sort>
              <option value="" ${k.sortBy ? "" : "selected"}>Chronological</option>
              ${wplMetrics.filter((m) => m.group === "kpi").map((m) => `<option value="${escapeAttr(m.label)}" ${k.sortBy === m.label ? "selected" : ""}>${m.label}</option>`).join("")}
            </select>
            <button type="button" class="wpl-sort-dir" data-wpl-kpi-sortdir ${k.sortBy ? "" : "disabled"} title="${k.sortDir === "asc" ? "Lowest first — click for highest first" : "Highest first — click for lowest first"}">${k.sortDir === "asc" ? "&#8593;" : "&#8595;"}</button>
          </div>
        </label>
      </div>
      <div class="wpl-table-wrap">
        <table class="wpl-period-table wpl-kpi-table">
          <thead>
            <tr><th class="wpl-rowname">KPI</th>${kpiHeaderCells(plan)}<th class="total-col">Total</th></tr>
          </thead>
          <tbody>
            ${metricRowsHTML(wplMetrics.filter((m) => m.group === "kpi"), plan, kpiSig(), "wpl-row-kpi")}
          </tbody>
        </table>
      </div>`;
  }

  // ------------------------------------------ slide 3 — Store Analysis
  function storeCellValue(metric, store, sig) {
    const base = periodCellValue(metric, hashCode(store.num + metric.label) % 13);
    if (metric.kind === "pct") {
      const shift = ((hashCode(sig + store.num + metric.label) % 11) - 5) * 0.5;
      const cur = base.current + shift, ly = base.ly + shift * 0.7;
      return { current: cur, ly, deltaPct: cur - ly, isPp: true };
    }
    if (metric.kind === "dollar") {
      // rate-style metric (AIV): a store varies around the division number — never share-scaled
      const shift = ((hashCode(sig + store.num + metric.label) % 11) - 5) * 0.05;
      const cur = base.current + shift, ly = base.ly + shift * 0.6;
      return { current: cur, ly, deltaDollar: cur - ly, deltaPct: ly ? ((cur - ly) / Math.abs(ly)) * 100 : 0 };
    }
    // each store carries a 2–5% share of the division-level number, then the
    // department scope scales it — deterministic, so filters re-query stably.
    const share = 0.02 + (hashCode(store.num + metric.label) % 30) / 1000;
    const f = 0.3 + (hashCode(sig) % 60) / 100;
    const cur = base.current * share * f, ly = base.ly * share * f;
    return { current: cur, ly, deltaDollar: cur - ly, deltaPct: ly ? ((cur - ly) / Math.abs(ly)) * 100 : 0 };
  }
  function renderStoreSlideHTML() {
    const sa = wplState.sa;
    const kpiCols = wplMetrics.filter((m) => m.group === "kpi");
    const districtName = {};
    WPL_DISTRICTS.forEach((d) => { districtName[d.code] = d.name; });
    const sig = "sa|" + sa.depts.join(",");
    // filter → compute cells once → sort by the active column
    let rows = WPL_STORES
      .filter((s) => !sa.districts.length || sa.districts.indexOf(s.district) >= 0)
      .filter((s) => !sa.stores.length || sa.stores.indexOf(s.num) >= 0)
      .map((s) => ({ s, cells: kpiCols.map((m) => storeCellValue(m, s, sig)) }));
    const metricIdx = kpiCols.findIndex((m) => m.label === sa.sortBy);
    const keyFor = (r) => sa.sortBy === "num" ? r.s.num
      : sa.sortBy === "loc" ? r.s.loc
      : sa.sortBy === "district" ? r.s.district
      : metricIdx >= 0 ? r.cells[metricIdx].current
      : r.s.num;
    rows = rows.slice().sort((a, b) => {
      const ka = keyFor(a), kb = keyFor(b);
      const cmp = typeof ka === "number" ? ka - kb : String(ka).localeCompare(String(kb));
      return sa.sortDir === "asc" ? cmp : -cmp;
    });
    const arrow = (key) => sa.sortBy === key ? `<span class="wpl-sa-arrow">${sa.sortDir === "asc" ? "&#9650;" : "&#9660;"}</span>` : "";
    const sortTh = (key, label, cls) => `<th class="${cls || ""}"><button type="button" class="wpl-sa-sort ${sa.sortBy === key ? "is-sorted" : ""}" data-wpl-sa-sort="${escapeAttr(key)}" title="Sort by ${escapeAttr(label)}">${label}${arrow(key)}</button></th>`;
    // Rollup across the visible stores — summed for $/unit KPIs, sales-weighted
    // average for rates (same convention as the Performance Explorer total row).
    const totalCells = kpiCols.map((m, i) => {
      const salesW = rows.map((r) => r.cells[0].current);
      const wSum = salesW.reduce((a, v) => a + v, 0) || 1;
      if (m.kind === "pct") {
        const cur = rows.reduce((a, r, ri) => a + r.cells[i].current * salesW[ri], 0) / wSum;
        const ly = rows.reduce((a, r, ri) => a + r.cells[i].ly * salesW[ri], 0) / wSum;
        return { current: cur, ly, deltaPct: cur - ly, isPp: true };
      }
      const cur = rows.reduce((a, r) => a + r.cells[i].current, 0);
      const ly = rows.reduce((a, r) => a + r.cells[i].ly, 0);
      return { current: cur, ly, deltaDollar: cur - ly, deltaPct: ly ? ((cur - ly) / Math.abs(ly)) * 100 : 0 };
    });
    return `
      <div class="wpl-table-filters wpl-kpi-filters" aria-label="Store analysis filters">
        <span class="wpl-table-filters-label">Scope:</span>
        ${renderWplMsel("sa.depts")}
        ${renderWplMsel("sa.districts")}
        ${renderWplMsel("sa.stores")}
        <span class="wpl-store-count">${rows.length} of ${WPL_STORES.length} stores</span>
      </div>
      <div class="wpl-table-wrap wpl-store-wrap">
        <table class="wpl-period-table wpl-store-table">
          <thead>
            <tr>
              ${sortTh("num", "Store #", "wpl-rowname")}
              ${sortTh("loc", "Location", "wpl-store-loc")}
              ${sortTh("district", "District", "wpl-store-dist")}
              ${kpiCols.map((m) => sortTh(m.label, m.label, "wpl-store-kpi-th")).join("")}
            </tr>
          </thead>
          <tbody>
            <tr class="wpl-store-totalrow">
              <th class="wpl-rowname wpl-store-num">Total</th>
              <td class="wpl-store-loc">${rows.length} store${rows.length === 1 ? "" : "s"}</td>
              <td class="wpl-store-dist">${sa.districts.length ? sa.districts.join(", ") : "All districts"}</td>
              ${kpiCols.map((m, i) => `<td>${formatPeriodCell(m, totalCells[i])}</td>`).join("")}
            </tr>
            ${rows.map(({ s, cells }) => `
              <tr class="wpl-row" data-wpl-store="${s.num}">
                <th class="wpl-rowname wpl-store-num">${s.num}</th>
                <td class="wpl-store-loc">${s.loc}</td>
                <td class="wpl-store-dist">${s.district} · ${districtName[s.district] || ""}</td>
                ${kpiCols.map((m, i) => `<td style="${wplHeatStyle(cells[i])}">${formatPeriodCell(m, cells[i])}</td>`).join("")}
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  // ------------------------------------------ shared type-ahead multi-select
  // Chips-in-field + searchable checkbox popup, same UX as the 52-week plan
  // constraints category picker (np-msel). Configured via WPL_MSELS.
  function wplMselListHTML(key) {
    const cfg = WPL_MSELS[key], items = cfg.items(), sel = cfg.get();
    const q = (wplState.openMsel === key ? wplState.mselQ : "").trim().toLowerCase();
    const row = (it) => `<label class="wpl-msel-row"><input type="checkbox" data-wpl-msel-opt="${key}" data-code="${escapeAttr(it.code)}" ${sel.indexOf(it.code) >= 0 ? "checked" : ""}><span class="wpl-msel-code">${it.code}</span><span class="wpl-msel-name">${escapeHtml(it.name)}</span>${it.owned ? '<em class="wpl-msel-badge">Yours</em>' : ""}</label>`;
    if (!q) {
      if (cfg.owned) {
        const owned = items.filter((i) => i.owned);
        const extraSel = items.filter((i) => !i.owned && sel.indexOf(i.code) >= 0);
        return `<div class="wpl-msel-sect">Your departments · ${owned.length}</div>` + owned.map(row).join("") +
          (extraSel.length ? `<div class="wpl-msel-sect">Also selected</div>` + extraSel.map(row).join("") : "") +
          `<div class="wpl-msel-hint">Type above to search all ${items.length} departments by code or name</div>`;
      }
      const shown = items.slice(0, 14);
      return shown.map(row).join("") + (items.length > shown.length ? `<div class="wpl-msel-hint">+${items.length - shown.length} more — type to search</div>` : "");
    }
    const hits = items.filter((i) => (i.code + " " + i.name).toLowerCase().indexOf(q) >= 0);
    const shown = hits.slice(0, 40);
    return `<div class="wpl-msel-sect">Matches · ${hits.length}</div>` +
      (shown.map(row).join("") || `<div class="wpl-msel-hint">No ${cfg.noun} match your search</div>`) +
      (hits.length > shown.length ? `<div class="wpl-msel-hint">+${hits.length - shown.length} more — keep typing to narrow</div>` : "");
  }
  function renderWplMsel(key) {
    const cfg = WPL_MSELS[key], sel = cfg.get(), items = cfg.items();
    const byCode = {};
    items.forEach((i) => { byCode[i.code] = i; });
    const open = wplState.openMsel === key;
    const chips = sel.length
      ? sel.slice(0, 2).map((code) => {
          const nm = byCode[code] ? byCode[code].name : code;
          const removable = sel.length > cfg.min;
          return `<span class="wpl-msel-chip">${escapeHtml(nm)}${removable ? `<button type="button" class="wpl-msel-x" data-wpl-msel-x="${key}" data-code="${escapeAttr(code)}" aria-label="Remove ${escapeAttr(nm)}">&times;</button>` : ""}</span>`;
        }).join("") + (sel.length > 2 ? `<span class="wpl-msel-morechip">+${sel.length - 2}</span>` : "")
      : `<span class="wpl-msel-all">${cfg.allLabel}</span>`;
    return `
      <div class="wpl-field wpl-msel" data-wpl-msel="${key}">
        <span>${cfg.label}</span>
        <div class="wpl-msel-field" role="button" tabindex="0" data-wpl-msel-toggle="${key}" aria-haspopup="listbox" aria-expanded="${open}">${chips}<span class="wpl-msel-caret">&#9662;</span></div>
        <div class="wpl-msel-pop" ${open ? "" : "hidden"}>
          <input type="text" class="wpl-msel-search" data-wpl-msel-search="${key}" placeholder="Search ${items.length} ${cfg.noun} — code or name…" value="${escapeAttr(open ? wplState.mselQ : "")}" autocomplete="off" />
          <div class="wpl-msel-list" data-wpl-msel-list="${key}">${wplMselListHTML(key)}</div>
          <div class="wpl-msel-foot"><span>${sel.length ? `${sel.length} selected` : cfg.allLabel}</span>${sel.length > cfg.min ? `<button type="button" class="wpl-link-btn" data-wpl-msel-clear="${key}">${cfg.min ? "Reset to yours" : "Clear"}</button>` : ""}</div>
        </div>
      </div>`;
  }

  // ------------------------------------------ deck: tabs + drag/trackpad swipe
  // The deck is positioned via scrollLeft, NEVER via transform: a persistent
  // transform puts the whole deck on a compositing layer and Chrome then drops
  // subpixel antialiasing for every glyph inside — text goes soft/thin compared
  // to the Performance Explorer table. Scrolling keeps native crisp rendering.
  const WPL_DECK_GAP = 28;   // px of daylight between cards mid-swipe (matches .wpl-deck-track gap)
  function wplDeckStep() {
    const deck = document.getElementById("wplDeck");
    return (deck ? deck.clientWidth : 0) + WPL_DECK_GAP;
  }
  function snapWplDeck(smooth) {
    const deck = document.getElementById("wplDeck");
    if (deck) deck.scrollTo({ left: wplState.slide * wplDeckStep(), behavior: smooth ? "smooth" : "auto" });
  }
  function goToWplSlide(i) {
    i = Math.max(0, Math.min(WPL_SLIDES.length - 1, i));
    wplState.slide = i;
    snapWplDeck(true);
    document.querySelectorAll("[data-wpl-slide]").forEach((b) => {
      const on = Number(b.dataset.wplSlide) === i;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    const sub = document.getElementById("trendSubtitle");
    if (sub) sub.textContent = WPL_SLIDES[i].sub;
  }
  function bindWplDeck() {
    const deck = document.getElementById("wplDeck");
    if (!deck) return;
    let down = false, drag = false, sx = 0, sy = 0, pid = null, startSlide = 0, width = 1, tableEl = null, tsl = 0, leftover = 0;
    deck.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input, select, button, a, .wpl-msel-pop")) return;
      down = true; drag = false; leftover = 0;
      sx = e.clientX; sy = e.clientY; pid = e.pointerId;
      width = deck.clientWidth || 1; startSlide = wplState.slide;
      tableEl = e.target.closest(".wpl-table-wrap");
      tsl = tableEl ? tableEl.scrollLeft : 0;
    });
    deck.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!drag) {
        if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) return;   // vertical intent → native scroll
        drag = true; deck.classList.add("is-grab");
        try { deck.setPointerCapture(pid); } catch (_) { /* ignore */ }
      }
      e.preventDefault();
      // pan the inner table first; only the spill past its edge moves the deck
      leftover = dx;
      if (tableEl) {
        const max = tableEl.scrollWidth - tableEl.clientWidth;
        const want = tsl - dx;
        const clamped = Math.max(0, Math.min(max, want));
        tableEl.scrollLeft = clamped;
        leftover = dx - (tsl - clamped);
      }
      const step = width + WPL_DECK_GAP;
      const base = startSlide * step;
      deck.scrollLeft = Math.max(0, Math.min((WPL_SLIDES.length - 1) * step, base - leftover));
    });
    const end = () => {
      if (drag) {
        deck.classList.remove("is-grab");
        deck.__suppressClick = true;
        goToWplSlide(Math.abs(leftover) > width * 0.18 ? startSlide - Math.sign(leftover) : startSlide);
      }
      down = false; drag = false; tableEl = null;
    };
    deck.addEventListener("pointerup", end);
    deck.addEventListener("pointercancel", end);
    deck.addEventListener("click", (e) => { if (deck.__suppressClick) { e.stopPropagation(); e.preventDefault(); deck.__suppressClick = false; } }, true);
    // horizontal trackpad swipe advances the deck; inside a table the table pans
    // natively first and the deck only takes over once the table hits its edge.
    let wheelAcc = 0, wheelLock = 0;
    deck.addEventListener("wheel", (e) => {
      if (!e.deltaX || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      const wrap = e.target.closest(".wpl-table-wrap");
      if (wrap) {
        const max = wrap.scrollWidth - wrap.clientWidth;
        const atEdge = e.deltaX > 0 ? wrap.scrollLeft >= max - 1 : wrap.scrollLeft <= 1;
        if (!atEdge) { wheelAcc = 0; return; }
      }
      e.preventDefault();
      const now = Date.now();
      if (now < wheelLock) return;
      wheelAcc += e.deltaX;
      if (Math.abs(wheelAcc) > 160) {
        goToWplSlide(wplState.slide + Math.sign(wheelAcc));
        wheelAcc = 0; wheelLock = now + 650;
      }
    }, { passive: false });
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

  // Deterministic re-query effect for the KPI hierarchy scope: money/units scale,
  // percentages shift a little. sig is the joined filter selections.
  function scaledCell(metric, cell, sig) {
    if (sig == null) return cell;
    if (metric.kind === "pct") {
      const shift = ((hashCode(sig + metric.label) % 9) - 4) * 0.35;
      const cur = cell.current + shift, ly = cell.ly + shift * 0.8;
      return { current: cur, ly, deltaPct: cur - ly, isPp: true };
    }
    const f = 0.3 + (hashCode(sig + metric.label) % 60) / 100;
    const cur = cell.current * f, ly = cell.ly * f;
    return { current: cur, ly, deltaDollar: cur - ly, deltaPct: ly ? ((cur - ly) / Math.abs(ly)) * 100 : 0, isPp: false };
  }
  // synthesised week cell — vary the period cell by ±5% per sub-week; the LY
  // side gets its own small wobble so each week tints individually instead of
  // the whole period rendering as one uniform colour block
  function weekCellValue(metric, base, periodIdx, weekIdx) {
    const weekSeed = hashCode(metric.label + "w" + periodIdx + weekIdx);
    const factor = (metric.kind === "pct" ? 1 : 0.25) + (weekSeed % 5) * 0.02;
    const cur = base.current * factor;
    const ly = base.ly * factor * (1 + (((weekSeed >> 2) % 7) - 3) / 150);
    return {
      current: cur, ly,
      deltaDollar: cur - ly,
      deltaPct: ly ? ((cur - ly) / Math.abs(ly)) * 100 : 0,
      isPp: metric.kind === "pct"
    };
  }
  // quarter = its periods summed (averaged for percentages)
  function quarterCellValue(metric, qIdx, periodCells) {
    const cells = WPL_QUARTERS[qIdx].periods.map((p) => periodCells[p - 1]);
    if (metric.kind === "pct") {
      const cur = cells.reduce((a, c) => a + c.current, 0) / cells.length;
      const ly = cells.reduce((a, c) => a + c.ly, 0) / cells.length;
      return { current: cur, ly, deltaPct: cur - ly, isPp: true };
    }
    const cur = cells.reduce((a, c) => a + c.current, 0);
    const ly = cells.reduce((a, c) => a + c.ly, 0);
    return { current: cur, ly, deltaDollar: cur - ly, deltaPct: ly ? ((cur - ly) / Math.abs(ly)) * 100 : 0 };
  }
  // Shared row builder for the P&L and KPI slides: one row per metric across a
  // column plan of quarter / period / week columns, plus the Total column.
  function metricRowsHTML(metrics, columnPlan, sig, rowClassExtra) {
    return metrics.map((metric) => {
      const periodCells = Array.from({ length: 13 }, (_, pi) => scaledCell(metric, periodCellValue(metric, pi), sig));
      const totalCurrent = periodCells.reduce((acc, c) => acc + (metric.kind === "pct" ? c.current / 13 : c.current), 0);
      const totalLy = periodCells.reduce((acc, c) => acc + (metric.kind === "pct" ? c.ly / 13 : c.ly), 0);
      const totalCell = {
        current: totalCurrent,
        ly: totalLy,
        deltaDollar: totalCurrent - totalLy,
        deltaPct: ((totalCurrent - totalLy) / Math.max(Math.abs(totalLy), 1)) * 100,
        isPp: metric.kind === "pct"
      };
      // Emphasis rows (Gross Profit, Real GP + Other Revenue) are totals — they
      // keep their flat sky-blue shading and never take the heat tint.
      const tint = metric.emphasis ? () => "" : wplHeatStyle;
      const cellsHtml = columnPlan.map((col) => {
        if (col.kind === "quarter") {
          const qc = quarterCellValue(metric, col.qIdx, periodCells);
          return `<td class="wpl-quarter-cell" style="${tint(qc)}">${formatPeriodCell(metric, qc)}</td>`;
        }
        const base = periodCells[col.periodIdx - 1];
        if (col.kind === "period") {
          return `<td${col.qFirst ? ' class="wpl-week-first"' : ""} style="${tint(base)}">${formatPeriodCell(metric, base)}</td>`;
        }
        const wc = weekCellValue(metric, base, col.periodIdx, col.weekIdx);
        return `<td class="wpl-week-cell ${col.weekIdx === 0 ? "wpl-week-first" : ""} ${col.weekIdx === 3 ? "wpl-week-last" : ""}" style="${tint(wc)}">${formatPeriodCell(metric, wc)}</td>`;
      }).join("");
      const rowClass = [
        "wpl-row",
        metric.indent ? "wpl-row-indent" : "",
        metric.emphasis ? "wpl-row-emphasis" : "",
        rowClassExtra || ""
      ].join(" ");
      return `<tr class="${rowClass}" data-wpl-metric="${escapeAttr(metric.label)}"><th class="wpl-rowname">${metric.label}</th>${cellsHtml}<td class="total-col">${formatPeriodCell(metric, totalCell)}</td></tr>`;
    }).join("");
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
      // Multi-select checkbox pick (KPI / Store slide type-aheads)
      const mselOpt = event.target.closest("[data-wpl-msel-opt]");
      if (mselOpt) {
        const cfg = WPL_MSELS[mselOpt.dataset.wplMselOpt];
        const code = mselOpt.dataset.code;
        const sel = cfg.get().slice();
        const ix = sel.indexOf(code);
        if (ix >= 0) { if (sel.length <= cfg.min) { renderWeeklyPLPanel(); return; } sel.splice(ix, 1); }
        else sel.push(code);
        cfg.set(sel);
        renderWeeklyPLPanel();
        return;
      }
      // Heat palette — shared across all three slides
      const palette = event.target.closest("[data-wpl-palette]");
      if (palette) {
        wplState.heatPalette = palette.value;
        renderWeeklyPLPanel();
        return;
      }
      // KPI Trends: sort the time columns by a KPI (clears any expansion)
      const kpiSort = event.target.closest("[data-wpl-kpi-sort]");
      if (kpiSort) {
        wplState.kpi.sortBy = kpiSort.value;
        wplState.kpi.expandedPeriod = null;
        wplState.kpi.expandedQuarter = null;
        renderWeeklyPLPanel();
        return;
      }
      const filter = event.target.closest("[data-wpl-filter]");
      if (filter) {
        const key = filter.dataset.wplFilter;
        wplState[key] = filter.value;
        renderWeeklyPLPanel();
      }
    });
    // Close any open multi-select popup when clicking outside it
    document.addEventListener("mousedown", (event) => {
      if (wplState.openMsel && !event.target.closest(".wpl-msel")) {
        wplState.openMsel = null;
        wplState.mselQ = "";
        renderWeeklyPLPanel();
      }
    });
    // Live search-value input: debounce-light, re-render the table on input.
    let searchTimer = null;
    document.addEventListener("input", (event) => {
      // Type-ahead inside a multi-select popup — refresh just the list so the
      // input keeps focus and caret.
      const mselSearch = event.target.closest("[data-wpl-msel-search]");
      if (mselSearch) {
        const key = mselSearch.dataset.wplMselSearch;
        wplState.mselQ = mselSearch.value;
        const list = document.querySelector(`[data-wpl-msel-list="${key}"]`);
        if (list) list.innerHTML = wplMselListHTML(key);
        return;
      }
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
      // Deck tab — slide between P&L, KPI Trends and Store Analysis
      const tab = event.target.closest("[data-wpl-slide]");
      if (tab) { goToWplSlide(Number(tab.dataset.wplSlide)); return; }
      // Multi-select: chip remove, clear/reset, field open/close
      const mselX = event.target.closest("[data-wpl-msel-x]");
      if (mselX) {
        const cfg = WPL_MSELS[mselX.dataset.wplMselX];
        const sel = cfg.get().filter((c) => c !== mselX.dataset.code);
        if (sel.length >= cfg.min) { cfg.set(sel); renderWeeklyPLPanel(); }
        return;
      }
      const mselClear = event.target.closest("[data-wpl-msel-clear]");
      if (mselClear) {
        const cfg = WPL_MSELS[mselClear.dataset.wplMselClear];
        cfg.set(cfg.min ? WPL_OWNED_DEPTS.slice() : []);
        renderWeeklyPLPanel();
        return;
      }
      const mselToggle = event.target.closest("[data-wpl-msel-toggle]");
      if (mselToggle) {
        const key = mselToggle.dataset.wplMselToggle;
        wplState.openMsel = wplState.openMsel === key ? null : key;
        wplState.mselQ = "";
        renderWeeklyPLPanel();
        return;
      }
      // KPI Trends slide: sort direction, time scale + quarter/period drill
      const kpiSortDir = event.target.closest("[data-wpl-kpi-sortdir]");
      if (kpiSortDir) {
        wplState.kpi.sortDir = wplState.kpi.sortDir === "asc" ? "desc" : "asc";
        renderWeeklyPLPanel();
        return;
      }
      const scaleBtn = event.target.closest("[data-wpl-kpi-scale]");
      if (scaleBtn) {
        wplState.kpi.scale = scaleBtn.dataset.wplKpiScale;
        wplState.kpi.expandedPeriod = null;
        wplState.kpi.expandedQuarter = null;
        renderWeeklyPLPanel();
        return;
      }
      // Store Analysis: column-header sort (click again to flip direction)
      const saSort = event.target.closest("[data-wpl-sa-sort]");
      if (saSort) {
        const key = saSort.dataset.wplSaSort;
        if (wplState.sa.sortBy === key) {
          wplState.sa.sortDir = wplState.sa.sortDir === "asc" ? "desc" : "asc";
        } else {
          wplState.sa.sortBy = key;
          // identity columns read naturally ascending; KPI columns biggest-first
          wplState.sa.sortDir = (key === "num" || key === "loc" || key === "district") ? "asc" : "desc";
        }
        renderWeeklyPLPanel();
        return;
      }
      const kpiQuarter = event.target.closest("[data-wpl-kpi-quarter]");
      if (kpiQuarter) {
        wplState.kpi.expandedQuarter = Number(kpiQuarter.dataset.wplKpiQuarter);
        wplState.kpi.expandedPeriod = null;
        wplState.kpi.sortBy = "";
        renderWeeklyPLPanel();
        return;
      }
      const kpiQuarterClose = event.target.closest("[data-wpl-kpi-quarter-close]");
      if (kpiQuarterClose) {
        wplState.kpi.expandedQuarter = null;
        wplState.kpi.expandedPeriod = null;
        renderWeeklyPLPanel();
        return;
      }
      const kpiPeriod = event.target.closest("[data-wpl-kpi-period]");
      if (kpiPeriod) {
        const p = Number(kpiPeriod.dataset.wplKpiPeriod);
        wplState.kpi.expandedPeriod = wplState.kpi.expandedPeriod === p ? null : p;
        wplState.kpi.sortBy = "";
        renderWeeklyPLPanel();
        return;
      }
      const kpiPeriodClose = event.target.closest("[data-wpl-kpi-period-close]");
      if (kpiPeriodClose) {
        wplState.kpi.expandedPeriod = null;
        renderWeeklyPLPanel();
        return;
      }
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
