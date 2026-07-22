/* 52 Week Promotional Plan + NCRC popover + Promotion Detail Screen.
 *
 * Self-contained module that mounts itself once the DOM is ready and the
 * server's /api/promo-plan endpoint responds. All data goes through the
 * provider abstraction in data/promoPlanStore.js — swap providers via the
 * PROMO_PLAN_PROVIDER env var when starting server.js.
 *
 * Major surfaces:
 *   - 52-week table (.weekly-promo-table) — weeks 1..currentWeek-1 are
 *     visibly locked actuals; weeks currentWeek..52 are forecast-prefilled.
 *   - NCRC cell popover (.plan-callout) — VLC / net / dead net / base /
 *     promo / CPI / allowance per unit + outcome basis rollup.
 *   - Promotion Detail drawer (#promoDetailOverlay) — worklist rail, Forecast
 *     for selected plan, Top 5 candidates, Cost ladder / NCRC scatter / Explain.
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------- state

  // The 52-week plan is always scoped to one category — a planner never
  // looks at "all categories at once". The dropdown picks which one drives
  // the displayed rollups; we always have a default selected.
  const planCategoryOptions = [
    "Carbonated Soft Drinks",
    "Energy Drinks",
    "Sports & Performance Drinks",
    "Bottled Water",
    "Juice & Smoothies",
    "Ready-to-Drink Coffee",
    "Ready-to-Drink Tea"
  ];

  const planState = {
    data: null,            // cached /api/promo-plan response
    promoView: "division", // "division" | "vendor" (vendor view not wired yet)
    promoMode: "plan",     // "plan" | "metrics" — toggles cell contents
    isPromoPlanExpanded: false,
    expandedPlanPeriod: null, // 1..13 when a period is expanded in metrics view
    accessibleDivisions: null,
    category: planCategoryOptions[0], // always one category selected
    objective: "sales",  // "sales" | "units" | "agp" — drives the table
    comparePlans: false, // when true, the inline comparison panel is shown
    compareScope: "scenarios", // "scenarios" | "plans" — what the compare panel shows
    // Scenario state. The "default" scenario is the plan as planned today —
    // same cost / allowance / price for the whole year. The "forecast"
    // scenario is the same plan with forecasted cost / allowance / price
    // changes (the merchant's forward look). Custom scenarios live below.
    activeScenario: "default",
    scenarios: [
      {
        id: "default",
        name: "Default",
        builtIn: true,
        description: "Same cost, price, allowances as currently planned for the year.",
        // Levers are stored as actual values; the cell-level multipliers
        // are derived in scenarioFactors() relative to the default levers.
        // Values snap to the slider's discrete step (VLC 0.05, CPI 5,
        // Depth 5, Freq 1).
        levers: { vlc: 2.10, cpi: 120, depth: 20, freq: 12 },
        vendor: "All Vendors",
        objective: "sales"
      },
      {
        id: "forecast",
        name: "Cost / price / allowance forecast",
        builtIn: true,
        description: "Same plan, but cost / price / allowances forecasted to drift through the year.",
        // Tighter inputs: VLC up ~3%, CPI 5 bps higher, depth -5pt, freq -1wk.
        levers: { vlc: 2.15, cpi: 125, depth: 15, freq: 11 },
        vendor: "All Vendors",
        objective: "sales"
      }
    ]
  };

  // Defaults the recommended-range and scenario math anchor on. The
  // popover sliders reset to these values; the resulting Sales/Units/AGP
  // multipliers in scenarioFactors() are 1.0 for the default scenario.
  const SCENARIO_DEFAULTS = { vlc: 2.10, cpi: 120, depth: 20, freq: 12 };
  // Recommended-range (the green band on the slider) per lever.
  const SCENARIO_RECS = {
    vlc:   { min: 2.05, max: 2.26, lo: 1.80, hi: 2.60 },
    cpi:   { min: 88,   max: 138,  lo: 0,    hi: 250  },
    depth: { min: 12,   max: 30,   lo: 0,    hi: 70   },
    freq:  { min: 8,    max: 19,   lo: 1,    hi: 52   }
  };
  // Popover form state. Cleared when the popover opens.
  const scenarioFormState = {
    open: false,
    name: "",
    objective: "sales",
    vendor: "All Vendors",
    levers: { ...SCENARIO_DEFAULTS },
    custom: false
  };

  const promoDetailState = {
    context: null,
    data: null,
    options: null,
    selectedOfferId: null,
    selectedPriceArea: null,
    vendor: "",
    vendorInput: "",
    priceArea: "",
    priceAreaInput: "",
    ncrc: "",
    ncrcInput: "",
    ncrcLabel: "",
    rightTab: "cost",
    scatterScope: "week",
    openTypeahead: null,
    confirmedSelections: {},
    publishing: false,
    velocityKind: "sales",
    bin: 1,
    worklist: null,
    worklistIndex: 0,
    worklistSearch: "",
    binCounts: null,
    loadingWorklist: false,
    pendingCart: [],
    finalizing: false,
    finalizeResult: null,
    // When true, the user clicked the action footer's "Review &
    // finalize" button. Drawer shows a full review table; the explicit
    // "Finalise promotions" button on that screen does the actual API
    // publish. Lets the user verify the full slate before committing.
    reviewing: false,
    // Per-NCRC/PA scratch values the user types on the review screen
    // (ad page, display text). Kept here so they survive re-renders
    // and so a future Finalize call can carry them in the payload.
    reviewEdits: { adPage: {}, displayText: {}, adDetails: {}, tagDetails: {},
      // Default ad/tag copy keyed by NCRC (applies to every price area)
      // plus per-(NCRC|PA) exceptions. adExceptions[ncrc] is the ordered
      // list of price areas the planner has broken out from the default.
      adDefaults: {}, tagDefaults: {}, adExceptions: {} },
    // Per-row expand state on the review screen — keyed by `${ncrc}|${pa}`.
    // When true, the Ad details + Tag details sub-rows are visible
    // underneath the priced row.
    reviewExpanded: {},
    // Recommendations-by-price-area UI
    expandedPriceAreas: {},   // map of priceArea -> true when row is expanded
    // Per-Price-Area offer pick. Defaults to the recommended offer for
    // each PA when data first loads; user can switch via the radio
    // button in the alternates panel. This drives the bottom totals row
    // and the right-panel drill-down for the currently focused PA.
    priceAreaSelections: {},  // { "PA01": "offer-id-X", ... }
    // Planning flow: "recommended" shows the scored per-PA recommendations
    // (system picks); "manual" flips to a build-your-own promo where the
    // user sets one default tactic across every price area and overrides
    // individual PAs as exceptions. Manual hides the cost ladder / promo
    // history and skips guardrail + reliability scoring.
    planMode: "recommended",
    // Manual-mode default tactic (offer-shaped) applied to every price
    // area that hasn't been individually overridden. Null until the user
    // clicks "Apply & forecast" on the default card.
    manualDefault: null,
    // Inline per-PA edit in the manual builder: the PA name currently
    // being edited in-row, plus its scratch form. Saving turns it into a
    // customOverride; there is no popup.
    manualEditPa: null,
    manualEditForm: null,
    overrideMode: false,      // when true, recommendations section flips to override form
    // Override scope: "all" applies one custom promo to every price area,
    // "single" targets one PA. Mirrors form.priceArea ("" == all).
    overrideScope: "all",
    // Custom-promo form. Holds BOTH the APEX and OMS field sets (authored
    // together, linked to the price area). priceArea "" == apply to all.
    overrideForm: {
      priceArea: "",
      apexDiscount: "PP", apexFactor: "0", apexAmount: "", apexUom: "E", apexMinBuy: "1", apexLimit: "6", apexInAd: false, apexAllowanceId: "4379527",
      omsChannel: "Store Only", omsTactic: "Item Discount", omsUom: "E", omsMinBuy: "0", omsDiscount: "PP Ea", omsAmount: "", omsLim: "6", omsLimLb: "0"
    },
    overrideResult: null,     // { units, sales, agp, disclaimer }
    overrideSubmitting: false,
    // When the user clicks "Use this promotion" after a custom forecast,
    // we snapshot the form + result into customOverrides[paName] so the
    // override survives navigation and shows up in the alternates list
    // for that PA. Keys are Price Area names; values are offer-shaped
    // objects (same fields the renderer expects).
    customOverrides: {},
    // Right rail collapses into an overlay on smaller screens.
    sidePanelOpen: false
  };

  let promoScatterReactRoot = null;
  let promoScatterReactHost = null;

  // ---------------------------------------------------------------- utils

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function escapeAttr(value) { return escapeHtml(value); }
  // Corporate Item Group id — a stable 9-digit system id derived from the NCRC. Execution shows
  // CIG as the identifier (not NCRC); the NCRC stays the internal value/search key.
  function cigForNcrc(ncrc) { const s = String(ncrc == null ? "" : ncrc); let h = 0; for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0; return "CIG " + (100000000 + (h % 900000000)); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function displayTacticCode(code) {
    if (code === "ID") return "Id";
    if (code === "BXGX") return "BxGx";
    return code;
  }

  function promoColumns() {
    // Plan mode: weekly (52) on wide screens, period (13) on narrower, quarter (4) on phone.
    // Metrics mode: always period (13) because each cell stacks ~5 metric values.
    const width = window.innerWidth;
    if (planState.promoMode === "metrics") {
      return periodColumnsWithExpansion();
    }
    if (width < 760) return Array.from({ length: 4 }, (_, i) => ({ label: `Q${i + 1}`, weeks: Array.from({ length: 13 }, (__, j) => i * 13 + j + 1) }));
    if (width < 1180) return Array.from({ length: 13 }, (_, i) => ({ label: `P${i + 1}`, weeks: Array.from({ length: 4 }, (__, j) => i * 4 + j + 1).filter((w) => w <= 52) }));
    return Array.from({ length: 52 }, (_, i) => ({ label: `${i + 1}`, weeks: [i + 1] }));
  }

  function periodColumnsWithExpansion() {
    // Period mode for metrics view. Click a period to expand into 4 weekly
    // sub-columns inline (same UX as the Weekly P&L panel).
    const cols = [];
    const expanded = planState.expandedPlanPeriod;
    for (let p = 1; p <= 13; p += 1) {
      if (expanded === p) {
        for (let w = 0; w < 4; w += 1) {
          const wk = (p - 1) * 4 + w + 1;
          cols.push({ label: `W${wk}`, weeks: [wk], isExpandedWeek: true, periodIdx: p, isFirstInExpansion: w === 0, isLastInExpansion: w === 3 });
        }
      } else {
        cols.push({ label: `P${p}`, weeks: Array.from({ length: 4 }, (_, w) => (p - 1) * 4 + w + 1), isPeriod: true, periodIdx: p });
      }
    }
    return cols;
  }

  function readCell(division, week) {
    const cells = planState.data && planState.data.cells && planState.data.cells[division];
    if (!cells) return null;
    return cells[week - 1];
  }

  function readAggregateCell(division, weeks) {
    const items = weeks.map((w) => readCell(division, w)).filter(Boolean);
    if (!items.length) return null;
    const primary = items.find((item) => item.store.code !== "~") || items[0];
    const digital = items.flatMap((item) => item.digital).slice(0, 4);
    const isLocked = items.every((item) => item.isLocked);
    const baseCell = {
      store: primary.store,
      digital,
      sales: items.reduce((acc, item) => acc + item.sales, 0),
      units: items.reduce((acc, item) => acc + item.units, 0),
      agp: items.reduce((acc, item) => acc + item.agp, 0),
      retailAllowance: Math.round(items.reduce((acc, item) => acc + item.retailAllowance, 0) / items.length),
      buyingAllowance: Math.round(items.reduce((acc, item) => acc + item.buyingAllowance, 0) / items.length),
      vlc: items.reduce((acc, item) => acc + item.vlc, 0) / items.length,
      netCost: items.reduce((acc, item) => acc + item.netCost, 0) / items.length,
      deadNetCost: items.reduce((acc, item) => acc + item.deadNetCost, 0) / items.length,
      basePrice: items.reduce((acc, item) => acc + item.basePrice, 0) / items.length,
      promoPrice: items.reduce((acc, item) => acc + item.promoPrice, 0) / items.length,
      cpiBase: items.reduce((acc, item) => acc + item.cpiBase, 0) / items.length,
      cpiPromo: items.reduce((acc, item) => acc + item.cpiPromo, 0) / items.length,
      allowancePerUnit: items.reduce((acc, item) => acc + item.allowancePerUnit, 0) / items.length,
      isLocked,
      firstWeek: weeks[0]
    };
    return applyObjectiveToCell(baseCell, isLocked);
  }

  // Each objective is a different optimiser, so it gives back a
  // different (tactic, sales, units, agp) blend per cell:
  // - Sales-optimised → baseline (data as-returned from the API)
  // - Units-optimised → tilts toward volume tactics (BxGx) at the
  //   expense of margin: sales +7%, units +14%, AGP -9%
  // - AGP-optimised  → tilts toward margin tactics (Item Discount)
  //   at the expense of volume: sales -6%, units -12%, AGP +15%
  // We don't touch locked-actuals weeks (those are real numbers).
  function applyObjectiveToCell(cell, isLocked) {
    if (isLocked || !cell) return cell;
    const obj = planState.objective || "sales";
    let store = cell.store;
    let scale = { sales: 1, units: 1, agp: 1 };
    if (obj === "units") {
      scale = { sales: 1.07, units: 1.14, agp: 0.91 };
      if (store.code === "Id") store = { ...store, code: "BxGx", className: "bxgx" };
    } else if (obj === "agp") {
      scale = { sales: 0.94, units: 0.88, agp: 1.15 };
      if (store.code === "BxGx") store = { ...store, code: "Id", className: "item" };
    }
    // Layer the active scenario's factors on top of the objective scale.
    // Default scenario is a no-op (factors == 1). Forecast & custom
    // scenarios bend cost/price/allowance/sales/units/agp around it.
    const sf = activeScenarioFactors();
    return {
      ...cell,
      store,
      sales: cell.sales * scale.sales * sf.sales,
      units: cell.units * scale.units * sf.units,
      agp:   cell.agp   * scale.agp   * sf.agp,
      vlc:              cell.vlc              * sf.vlc,
      netCost:          cell.netCost          * sf.netCost,
      deadNetCost:      cell.deadNetCost      * sf.deadNet,
      basePrice:        cell.basePrice        * sf.price,
      promoPrice:       cell.promoPrice       * sf.price,
      retailAllowance:  cell.retailAllowance  * sf.allowance,
      buyingAllowance:  cell.buyingAllowance  * sf.allowance,
      allowancePerUnit: cell.allowancePerUnit * sf.allowance
    };
  }

  // -------------------------------------------------------- scenarios

  function currentScenario() {
    return planState.scenarios.find((s) => s.id === planState.activeScenario)
      || planState.scenarios[0];
  }

  // Reduces a scenario's levers to a small bundle of multiplicative
  // factors used by applyObjectiveToCell. Default scenario → all 1.0.
  // The math is intentionally simple — the user wants the table to react
  // visibly to lever changes but the absolute numbers stay believable.
  function scenarioFactorsForLevers(levers) {
    const d = SCENARIO_DEFAULTS;
    const vlcMove   = (levers.vlc   - d.vlc)   / d.vlc;        // -ish ±15%
    const cpiMove   = (levers.cpi   - d.cpi)   / 100;          // 100 bps ≈ 1.0
    const depthMove = (levers.depth - d.depth) / 100;          // 1pp = 0.01
    const freqMove  = (levers.freq  - d.freq)  / 26;           // half-year norm
    // Cell-level shifts.
    const vlc       = 1 + vlcMove;
    const netCost   = 1 + vlcMove * 0.92;
    const allowance = 1 - vlcMove * 0.20 + cpiMove * 0.05;     // higher VLC → leans on allowance
    const deadNet   = 1 + vlcMove * 0.78 - (allowance - 1) * 0.30;
    const price     = 1 + cpiMove * 0.04 + Math.max(0, vlcMove) * 0.35;
    // Volume & margin reactions.
    const sales = 1 - cpiMove * 0.06 + depthMove * 0.18 + freqMove * 0.07;
    const units = 1 - cpiMove * 0.04 + depthMove * 0.32 + freqMove * 0.11;
    const agp   = 1 - vlcMove * 0.55 + cpiMove * 0.08 - depthMove * 0.22 - freqMove * 0.04;
    return {
      vlc, netCost, deadNet, price, allowance,
      sales: clamp(sales, 0.55, 1.55),
      units: clamp(units, 0.5, 1.7),
      agp:   clamp(agp,   0.4, 1.7)
    };
  }
  function activeScenarioFactors() {
    return scenarioFactorsForLevers(currentScenario().levers);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function renderScenarioStrip() {
    const strip = document.getElementById("scenarioStrip");
    if (!strip) return;
    if (!planState.data) { strip.innerHTML = ""; return; }
    const active = planState.activeScenario;
    const objective = planState.objective || "sales";

    const categoryOptions = planCategoryOptions
      .map((cat) => `<option value="${escapeAttr(cat)}" ${planState.category === cat ? "selected" : ""}>${escapeHtml(cat)}</option>`)
      .join("");

    const chipsHtml = planState.scenarios.map((s) => {
      const isActive = s.id === active;
      const removable = !s.builtIn;
      const objLabel = s.objective ? ` · ${objectiveTitleCase(s.objective)}` : "";
      const removeBtn = removable
        ? `<button class="scenario-chip-remove" type="button" data-scenario-remove="${s.id}" aria-label="Remove ${escapeAttr(s.name)}">×</button>`
        : "";
      return `<button type="button" class="scenario-chip ${isActive ? "is-active" : ""}" data-scenario-id="${s.id}" title="${escapeAttr(s.description || "")}">
        ${escapeHtml(s.name)}<small>${escapeHtml(s.vendor || "All Vendors")}${objLabel}</small>${removeBtn}
      </button>`;
    }).join("");

    strip.innerHTML = `
      <div class="plan-step-row plan-step-row-single plan-step-row-objective">
        <span class="plan-step-group">
          <span class="plan-step-num">1.</span>
          <span class="plan-step-label">Category</span>
          <select class="plan-category-select" aria-label="Category" data-plan-category>${categoryOptions}</select>
        </span>
        <span class="plan-step-sep" aria-hidden="true"></span>
        <span class="plan-step-group">
          <span class="plan-step-num">2.</span>
          <span class="plan-step-label">Scenario</span>
          ${chipsHtml}
        </span>
        <span class="plan-step-sep" aria-hidden="true"></span>
        <span class="plan-step-group">
          <span class="plan-step-num">3.</span>
          <span class="plan-step-label">Objective</span>
          <div class="plan-obj-capsule" role="tablist" aria-label="Plan objective">
            <button type="button" class="plan-obj-opt ${objective === "sales" ? "active" : ""}" data-plan-objective="sales">Sales</button>
            <button type="button" class="plan-obj-opt ${objective === "units" ? "active" : ""}" data-plan-objective="units">Units</button>
            <button type="button" class="plan-obj-opt ${objective === "agp" ? "active" : ""}" data-plan-objective="agp">AGP</button>
          </div>
        </span>
        <span class="plan-compare-anchor">
          <button type="button" class="plan-compare-toggle ${planState.comparePlans ? "is-open" : ""}" data-plan-compare-toggle title="Compare scenarios and the three objective plans side by side">
            ${planState.comparePlans ? "&minus;" : "+"} Compare scenarios
          </button>
          ${planState.comparePlans ? renderPlanComparePanel(objective) : ""}
        </span>
      </div>
    `;
  }
  function objectiveTitleCase(o) {
    return o === "units" ? "Units" : o === "agp" ? "AGP" : "Sales";
  }

  // ------------------------------------------------ render: 52-week table

  function renderPromoTable() {
    const target = document.getElementById("weeklyPlanTable");
    if (!target) return;
    if (!planState.data) {
      target.innerHTML = `<div class="promo-detail-loader"><span></span>Loading 52 week plan&hellip;</div>`;
      return;
    }
    const inVendorView = planState.promoView === "vendor";
    const sourceGroups = inVendorView
      ? (planState.data.vendors || [])
      : (planState.data.divisions || []);
    // Apply user-role restriction. If the user has access to only a subset
    // of divisions, the rest are not shown at all (no "show all" link either).
    const allowedRaw = (!inVendorView && planState.accessibleDivisions && planState.accessibleDivisions.length)
      ? sourceGroups.filter((d) => planState.accessibleDivisions.includes(d))
      : sourceGroups;
    // Sort the divisions/vendors by the chosen objective so flipping
    // Sales / Units / AGP visibly re-orders the table — top performers
    // for THAT metric float to the preview.
    const objKey = planState.objective === "units" ? "units" : planState.objective === "agp" ? "agp" : "sales";
    const allWeeks52 = Array.from({ length: 52 }, (_, i) => i + 1);
    const allowed = [...allowedRaw].sort((a, b) => {
      const ta = readAggregateCell(a, allWeeks52) || {};
      const tb = readAggregateCell(b, allWeeks52) || {};
      return (tb[objKey] || 0) - (ta[objKey] || 0);
    });
    const hasMultiAccess = allowed.length > 1;
    const visible = (planState.isPromoPlanExpanded || !hasMultiAccess) ? allowed : allowed.slice(0, 2);
    const currentWeek = planState.data.currentWeek || 1;
    const columns = promoColumns();
    syncPromoPlanHeader(allowed.length, hasMultiAccess);

    // Toggle UI hint about which mode is in effect.
    const inMetrics = planState.promoMode === "metrics";

    const headerCells = columns.map((col) => {
      const isLocked = col.weeks.every((w) => w < currentWeek);
      const classes = [isLocked ? "col-locked-week" : ""];
      if (col.isExpandedWeek) classes.push("col-expanded-week");
      if (col.isFirstInExpansion) classes.push("col-week-first");
      if (col.isLastInExpansion) classes.push("col-week-last");
      // Period columns are clickable in metrics view to expand into 4 weeks.
      if (inMetrics && col.isPeriod) {
        return `<th class="${classes.join(" ")}"><button type="button" class="plan-period-btn ${planState.expandedPlanPeriod === col.periodIdx ? "is-open" : ""}" data-plan-period="${col.periodIdx}">${col.label}</button></th>`;
      }
      if (col.isFirstInExpansion) {
        return `<th class="${classes.join(" ")} col-expanded-first"><button type="button" class="wpl-week-close" data-plan-period-close aria-label="Collapse period">&times;</button><span class="wpl-week-label">${col.label}</span></th>`;
      }
      return `<th class="${classes.join(" ")}"><span>${col.label}</span></th>`;
    }).join("");

    function stackedMetrics(item) {
      // 5 metric rows stacked vertically in each cell when in metrics mode.
      return `
        <div class="cell-metric-stack">
          <span><small>Sales</small>$${item.sales.toFixed(1)}M</span>
          <span><small>Units</small>${item.units.toFixed(0)}K</span>
          <span><small>AGP</small>$${item.agp.toFixed(1)}M</span>
          <span><small>VLC</small>$${item.vlc.toFixed(2)}</span>
          <span><small>Deadnet</small>$${item.deadNetCost.toFixed(2)}</span>
        </div>
      `;
    }

    const renderCells = (division, isTotalRow) => columns.map((col) => {
      const item = isTotalRow
        ? totalsByPeriod(allowed, col.weeks)
        : readAggregateCell(division, col.weeks);
      if (!item) return `<td></td>`;
      const lockedClass = item.isLocked ? "cell-locked" : "";
      const tdClass = [
        item.isLocked ? "cell-locked-week" : "",
        col.isExpandedWeek ? "cell-expanded-week" : "",
        col.isFirstInExpansion ? "cell-week-first" : "",
        col.isLastInExpansion ? "cell-week-last" : ""
      ].filter(Boolean).join(" ");
      if (inMetrics) {
        return `<td class="${tdClass} cell-metric">${stackedMetrics(item)}</td>`;
      }
      const digitalNames = item.digital.map((d) => d.name).join("|");
      return `<td class="${tdClass}"><button class="promo-cell tactic-${item.store.className} ${lockedClass}" data-promo-cell data-group="${escapeAttr(division)}" data-group-index="${allowed.indexOf(division)}" data-period="${escapeAttr(col.label)}" data-weeks="${col.weeks.join(",")}" data-store="${escapeAttr(item.store.name)}" data-store-code="${escapeAttr(item.store.code)}" data-digital="${escapeAttr(digitalNames)}" data-units="${item.units.toFixed(0)}" data-sales="${item.sales.toFixed(2)}" data-agp="${item.agp.toFixed(2)}" data-retail="${item.retailAllowance}" data-buying="${item.buyingAllowance}" data-vlc="${item.vlc.toFixed(4)}" data-net="${item.netCost.toFixed(4)}" data-dead="${item.deadNetCost.toFixed(4)}" data-base="${item.basePrice.toFixed(4)}" data-promo="${item.promoPrice.toFixed(4)}" data-cpi-base="${item.cpiBase.toFixed(2)}" data-cpi-promo="${item.cpiPromo.toFixed(2)}" data-allowance-unit="${item.allowancePerUnit.toFixed(4)}" data-is-locked="${item.isLocked ? "1" : "0"}">
        <span>${displayTacticCode(item.store.code)}</span>${item.digital.length ? `<i class="digital-stack-icon" aria-label="Digital promos attached"></i>` : ""}
      </button></td>`;
    }).join("");

    // Format the row's total column so the chosen objective is the
    // headline figure (e.g. AGP-optimised → AGP total on top, sales
    // shown small underneath).
    const formatTotalForObjective = (total) => {
      const sales = total.sales || 0;
      const units = total.units || 0;
      const agp   = total.agp || 0;
      if (objKey === "units") {
        return `<span class="plan-current">${(units / 1000).toFixed(1)}M units</span><span class="plan-ly">$${sales.toFixed(1)}M sales</span>`;
      }
      if (objKey === "agp") {
        return `<span class="plan-current">$${agp.toFixed(2)}M AGP</span><span class="plan-ly">$${sales.toFixed(1)}M sales</span>`;
      }
      return `<span class="plan-current">$${sales.toFixed(1)}M</span><span class="plan-ly">${(units / 1000).toFixed(1)}M units</span>`;
    };
    const bodyRows = visible.map((division) => {
      const cells = renderCells(division, false);
      const total = readAggregateCell(division, allWeeks52) || { sales: 0, units: 0, agp: 0 };
      return `<tr><td><strong>${escapeHtml(division)}</strong></td>${cells}<td class="total-col">${formatTotalForObjective(total)}</td></tr>`;
    }).join("");

    // Marker row: when we're collapsed AND multi-division/vendor access exists,
    // show a "+ Show all N divisions/vendors" row before the totals row.
    const groupLabel = inVendorView ? "vendors" : "divisions";
    const collapsedMarkerRow = (!planState.isPromoPlanExpanded && hasMultiAccess && allowed.length > visible.length) ? `
      <tr class="plan-show-all-row">
        <td colspan="${columns.length + 2}">
          <button type="button" class="plan-show-all-btn" data-toggle-promo-expand>
            <span>+</span> Show all ${allowed.length} ${groupLabel}
          </button>
        </td>
      </tr>
    ` : "";

    // Total row across the visible (or all-allowed) divisions — only in
    // metrics mode; plan mode doesn't aggregate tactics meaningfully.
    let totalRow = "";
    if (inMetrics) {
      const grandTotal = totalsByPeriod(allowed, Array.from({ length: 52 }, (_, i) => i + 1));
      const totalCells = renderCells("", true);
      const totalLabelUnit = inVendorView
        ? `${allowed.length} vendor${allowed.length === 1 ? "" : "s"}`
        : `${allowed.length} division${allowed.length === 1 ? "" : "s"}`;
      totalRow = `
        <tr class="plan-total-row">
          <td><strong>TOTAL</strong><small>${totalLabelUnit}</small></td>
          ${totalCells}
          <td class="total-col">${formatTotalForObjective(grandTotal)}</td>
        </tr>
      `;
    }

    const objective = planState.objective || "sales";
    target.innerHTML = `
      ${inMetrics ? `<p class="plan-mode-note">Showing Sales · Units · AGP · VLC · Deadnet per cell. Switch to <em>View plan</em> to see promo tactics.</p>` : ""}
      ${!inMetrics ? `
        <div class="promo-legend" aria-label="Promotional tactic legend">
          <span><i class="legend-chip item">Id</i> Item Discount</span>
          <span><i class="legend-chip bxgx">BxGx</i> Buy X Get X</span>
          <span><i class="digital-stack-icon"></i> Digital promos attached</span>
          <span><i class="cell-locked-indicator"></i> Locked actuals (weeks 1-${currentWeek - 1})</span>
        </div>
      ` : ""}
      <div class="promo-table-scroll">
        <table class="projection-table period-table promo-table weekly-promo-table">
          <thead><tr><th>${planState.promoView === "division" ? "Division" : "Vendor"}</th>${headerCells}<th class="total-col">Total</th></tr></thead>
          <tbody>${bodyRows}${collapsedMarkerRow}${totalRow}</tbody>
        </table>
      </div>
    `;
    document.querySelectorAll("[data-promo-view]").forEach((item) => {
      item.classList.toggle("active", item.dataset.promoView === planState.promoView);
    });
    document.querySelectorAll("[data-plan-mode]").forEach((item) => {
      item.classList.toggle("active", item.dataset.planMode === planState.promoMode);
    });
    renderScenarioStrip();
  }

  // Inline panel under the "+ Compare scenarios" toggle. Two scopes:
  //  - "scenarios" — totals for every scenario the planner has saved,
  //    so they can sanity-check the forecast / what-ifs against today's
  //    plan. Numbers come from the same baseline as the within-scenario
  //    plan comparison, scaled by each scenario's scenarioFactors().
  //  - "plans"     — the original Sales / Units / AGP / no-promo / LY
  //    rollup, but for the active scenario rather than the default.
  function renderPlanComparePanel(activeObjective) {
    const scope = planState.compareScope === "plans" ? "plans" : "scenarios";
    // Baseline numbers for "default" scenario / Sales-optimised plan.
    const basePlans = [
      { key: "units", label: "Units plan",   sales: 3480000, units: 807880, agp: 1070000, scope: [28.49, 18.79, 25.28] },
      { key: "sales", label: "Sales plan",   sales: 3520000, units: 774330, agp: 1140000, scope: [25.56, 18.07, 26.18] },
      { key: "agp",   label: "AGP plan",     sales: 3310000, units: 666100, agp: 1240000, scope: [20.29, 17.85, 26.16] },
      { key: "np",    label: "No promo",     sales: 3020000, units: 549620, agp: 1210000, scope: [0, 0, 0] },
      { key: "ly",    label: "LY actuals",   sales: 2850000, units: 673190, agp:  835470, scope: [37.93, 18.55, 18.65] }
    ];
    const fmtM = (n) => `$${(n / 1e6).toFixed(2)}M`;
    const fmtU = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${(n / 1e3).toFixed(2)}K`;
    const fmtA = (n) => `$${(n / 1e6).toFixed(2)}M`;

    const tabs = `
      <div class="compare-scope-tabs" role="tablist" aria-label="Compare scope">
        <button type="button" class="${scope === "scenarios" ? "is-active" : ""}" data-compare-scope="scenarios">Across scenarios</button>
        <button type="button" class="${scope === "plans" ? "is-active" : ""}" data-compare-scope="plans">Plans within scenario</button>
      </div>
    `;
    const closeBtn = `<button type="button" class="plan-compare-close" data-plan-compare-toggle aria-label="Close">&times;</button>`;
    const activeScenario = currentScenario();

    if (scope === "scenarios") {
      const rows = planState.scenarios.map((s) => {
        const f = scenarioFactorsForLevers(s.levers);
        const sales = basePlans.find((p) => p.key === "sales").sales * f.sales;
        const units = basePlans.find((p) => p.key === "sales").units * f.units;
        const agp   = basePlans.find((p) => p.key === "sales").agp   * f.agp;
        const subtitle = `VLC $${s.levers.vlc.toFixed(2)} · CPI ${s.levers.cpi} · Depth ${s.levers.depth}% · Freq ${s.levers.freq}w`;
        return { key: s.id, label: s.name, sales, units, agp, subtitle, isActive: s.id === planState.activeScenario };
      });
      const maxSales = Math.max(...rows.map((r) => r.sales));
      const maxUnits = Math.max(...rows.map((r) => r.units));
      const maxAgp   = Math.max(...rows.map((r) => r.agp));
      return `
        <section class="plan-compare compare-scenarios">
          <header class="plan-compare-head">
            <strong>Compare scenarios</strong>
            ${tabs}
            ${closeBtn}
          </header>
          <div class="plan-compare-grid">
            <div class="plan-compare-corner"></div>
            <div class="plan-compare-col-head">Sales</div>
            <div class="plan-compare-col-head">Units</div>
            <div class="plan-compare-col-head">AGP</div>
            ${rows.map((r) => `
              <div class="plan-compare-row-name scenario-compare-row-name ${r.isActive ? "is-active" : ""}">
                <strong>${escapeHtml(r.label)}</strong>
                <small>${r.subtitle}</small>
              </div>
              <div class="plan-compare-cell ${r.sales === maxSales ? "is-best" : ""}">${fmtM(r.sales)}</div>
              <div class="plan-compare-cell ${r.units === maxUnits ? "is-best" : ""}">${fmtU(r.units)}</div>
              <div class="plan-compare-cell ${r.agp   === maxAgp   ? "is-best" : ""}">${fmtA(r.agp)}</div>
            `).join("")}
          </div>
          <footer class="plan-compare-foot">
            <span><strong>Active scenario:</strong> ${escapeHtml(activeScenario.name)} &middot; bold cells mark the leader on each metric</span>
          </footer>
        </section>
      `;
    }

    // Plans within the active scenario — the original 3-plan compare,
    // scaled so it reflects the active scenario's cost/price/allowance
    // levers (default scenario → unchanged from before).
    const f = scenarioFactorsForLevers(activeScenario.levers);
    const plans = basePlans.map((p) => p.key === "np" || p.key === "ly" ? p : ({
      ...p,
      sales: p.sales * f.sales,
      units: p.units * f.units,
      agp:   p.agp   * f.agp
    }));
    const optimising = plans.filter((p) => p.key === "units" || p.key === "sales" || p.key === "agp");
    const maxSales = Math.max(...optimising.map((p) => p.sales));
    const maxUnits = Math.max(...optimising.map((p) => p.units));
    const maxAgp   = Math.max(...optimising.map((p) => p.agp));
    return `
      <section class="plan-compare compare-scenarios">
        <header class="plan-compare-head">
          <strong>Plans within ${escapeHtml(activeScenario.name)}</strong>
          ${tabs}
          ${closeBtn}
        </header>
        <div class="plan-compare-grid">
          <div class="plan-compare-corner"></div>
          <div class="plan-compare-col-head">Sales</div>
          <div class="plan-compare-col-head">Units</div>
          <div class="plan-compare-col-head">AGP</div>
          ${plans.map((p) => {
            const isActive = p.key === activeObjective;
            const isContext = p.key === "np" || p.key === "ly";
            const bestSales = !isContext && p.sales === maxSales;
            const bestUnits = !isContext && p.units === maxUnits;
            const bestAgp   = !isContext && p.agp   === maxAgp;
            const scopeText = isContext && p.key === "np" ? "Skip every promo"
              : `Promo items / Avg depth / Items &gt;30% &middot; ${p.scope.map((s) => s.toFixed(2)).join(" / ")}`;
            return `
              <div class="plan-compare-row-name ${isActive ? "is-active" : ""} ${isContext ? "is-context" : ""}">
                <strong>${p.label}</strong>
                <small>${scopeText}</small>
              </div>
              <div class="plan-compare-cell ${bestSales ? "is-best" : ""}">${fmtM(p.sales)}</div>
              <div class="plan-compare-cell ${bestUnits ? "is-best" : ""}">${fmtU(p.units)}</div>
              <div class="plan-compare-cell ${bestAgp ? "is-best" : ""}">${fmtA(p.agp)}</div>
            `;
          }).join("")}
        </div>
        <footer class="plan-compare-foot">
          <span><strong>Active plan:</strong> ${activeObjective === "sales" ? "Sales" : activeObjective === "units" ? "Units" : "AGP"} optimised in <strong>${escapeHtml(activeScenario.name)}</strong> &middot; bold cells mark the leader on each metric</span>
        </footer>
      </section>
    `;
  }

  function totalsByPeriod(divisions, weeks) {
    let sales = 0, units = 0, agp = 0, vlc = 0, dead = 0, net = 0, base = 0, promo = 0;
    let cpiBase = 0, cpiPromo = 0, retail = 0, buying = 0, allowanceUnit = 0, isLocked = true;
    let primary = null;
    const digital = [];
    let count = 0;
    divisions.forEach((d) => {
      const cell = readAggregateCell(d, weeks);
      if (!cell) return;
      count += 1;
      sales += cell.sales;
      units += cell.units;
      agp += cell.agp;
      vlc += cell.vlc;
      dead += cell.deadNetCost;
      net += cell.netCost;
      base += cell.basePrice;
      promo += cell.promoPrice;
      cpiBase += cell.cpiBase;
      cpiPromo += cell.cpiPromo;
      retail += cell.retailAllowance;
      buying += cell.buyingAllowance;
      allowanceUnit += cell.allowancePerUnit;
      if (!cell.isLocked) isLocked = false;
      if (!primary && cell.store && cell.store.code !== "~") primary = cell.store;
      cell.digital.forEach((x) => digital.push(x));
    });
    const c = count || 1;
    return {
      store: primary || { name: "Mixed", code: "~", className: "none" },
      digital: digital.slice(0, 4),
      sales, units, agp,
      vlc: vlc / c, deadNetCost: dead / c, netCost: net / c, basePrice: base / c, promoPrice: promo / c,
      cpiBase: cpiBase / c, cpiPromo: cpiPromo / c,
      retailAllowance: Math.round(retail / c), buyingAllowance: Math.round(buying / c),
      allowancePerUnit: allowanceUnit / c, isLocked
    };
  }

  function syncPromoPlanHeader(groupCount, hasMultiAccess) {
    const helper = document.getElementById("promoPlanHelper");
    const toggle = document.getElementById("togglePromoPlan");
    if (helper) {
      const groupLabel = planState.promoView === "division" ? "divisions" : "vendors";
      const catSuffix = planState.category ? ` · ${planState.category}` : "";
      const objWord = planState.objective === "units" ? "Units" : planState.objective === "agp" ? "AGP" : "Sales";
      const objSuffix = ` · ${objWord}-optimised`;
      if (!hasMultiAccess) {
        helper.textContent = `Store tactic by week${catSuffix}${objSuffix}. You have access to ${groupCount} ${groupCount === 1 ? "division" : "divisions"}; all rows below.`;
      } else if (planState.isPromoPlanExpanded) {
        helper.textContent = `Store tactic by week${catSuffix}${objSuffix}. Showing all ${groupCount} ${groupLabel} you can access.`;
      } else {
        helper.textContent = `Store tactic by week${catSuffix}${objSuffix}. Preview of 2 of ${groupCount} ${groupLabel} — click "+ Show all" below for the rest.`;
      }
    }
    if (toggle) {
      if (!hasMultiAccess) {
        toggle.hidden = true;
      } else {
        const groupLabel = planState.promoView === "division" ? "divisions" : "vendors";
        toggle.hidden = false;
        toggle.textContent = planState.isPromoPlanExpanded ? "Collapse" : `+ Show all ${groupCount} ${groupLabel}`;
        toggle.setAttribute("aria-expanded", String(planState.isPromoPlanExpanded));
      }
    }
  }

  // ----------------------------------------------- render: NCRC popover

  function renderPromoOverlay(target) {
    const digital = target.dataset.digital ? target.dataset.digital.split("|").filter(Boolean) : [];
    const hasDigital = digital.length > 0;
    const metricRows = promoDetailMetricsFromCell(target);
    const outcomeBasis = hasDigital ? "Store + digital" : "Store tactic";
    const popover = document.getElementById("planCellPopover");
    if (!popover) return;
    popover.innerHTML = `
      <aside class="plan-callout promo-callout" role="dialog" aria-label="${escapeAttr(target.dataset.group)} ${escapeAttr(target.dataset.period)} promotional detail">
        <button class="callout-close" type="button" data-close-plan-popover aria-label="Close">x</button>
        <header>
          <strong>${escapeHtml(target.dataset.group)} - ${escapeHtml(target.dataset.period)}</strong>
          <a href="#" class="promo-detail-link" data-launch-promo-detail data-launch-group="${escapeAttr(target.dataset.group)}" data-launch-group-index="${escapeAttr(target.dataset.groupIndex || 0)}" data-launch-view="${planState.promoView}" data-launch-period="${escapeAttr(target.dataset.period)}" data-launch-weeks="${escapeAttr(target.dataset.weeks || "")}" data-launch-store="${escapeAttr(target.dataset.store || "")}" data-launch-retail="${escapeAttr(target.dataset.retail || "")}" data-launch-buying="${escapeAttr(target.dataset.buying || "")}" data-launch-digital="${escapeAttr(target.dataset.digital || "")}">Launch Promotion Detail Screen</a>
        </header>
        <div class="promo-detail-metrics" aria-label="Promo cost and price metrics">
          ${metricRows.map((m) => `<span><small>${escapeHtml(m.label)}</small><b>${escapeHtml(m.value)}</b></span>`).join("")}
        </div>
        <table class="callout-table">
          <thead><tr><th>Outcome basis</th><th>Sales</th><th>Units</th><th>AGP</th></tr></thead>
          <tbody>
            <tr>
              <td>
                <span class="promo-outcome-basis">${outcomeBasis}</span>
                <span class="promo-outcome-subtext">Store: ${escapeHtml(target.dataset.store)}</span>
              </td>
              <td><span class="plan-current">$${escapeHtml(target.dataset.sales)}M</span></td>
              <td><span class="plan-current">${escapeHtml(target.dataset.units)}K</span></td>
              <td><span class="plan-current">$${escapeHtml(target.dataset.agp)}M</span></td>
            </tr>
            <tr>
              <td>Allowance mix</td>
              <td colspan="3"><span class="plan-current">Retail ${escapeHtml(target.dataset.retail)}%</span><span class="plan-ly">Buying ${escapeHtml(target.dataset.buying)}%</span></td>
            </tr>
            <tr>
              <td>Digital promos</td>
              <td colspan="3">${digital.length ? digital.map((item) => `<span class="digital-detail-chip">${escapeHtml(item)}</span>`).join("") : `<span class="plan-ly">None attached</span>`}</td>
            </tr>
            ${target.dataset.isLocked === "1" ? `
              <tr>
                <td>Status</td>
                <td colspan="3"><span class="promo-combined-note">Locked actuals — week has already occurred.</span></td>
              </tr>
            ` : ""}
            ${hasDigital ? `
              <tr>
                <td>Metric note</td>
                <td colspan="3"><span class="promo-combined-note">Sales, Units, and AGP show the combined store + digital plan outcome.</span></td>
              </tr>
            ` : ""}
          </tbody>
        </table>
      </aside>
    `;
    const rect = target.getBoundingClientRect();
    const width = Math.min(500, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
    const estimatedHeight = 360;
    const openAbove = window.innerHeight - rect.bottom < estimatedHeight + 16 && rect.top > estimatedHeight + 16;
    popover.style.width = `${width}px`;
    popover.style.left = `${left}px`;
    popover.style.top = `${openAbove ? Math.max(8, rect.top - estimatedHeight - 8) : rect.bottom + 8}px`;
    popover.classList.toggle("open-above", openAbove);
    popover.hidden = false;
  }

  function promoDetailMetricsFromCell(target) {
    const num = (key) => Number(target.dataset[key] || 0);
    return [
      { label: "VLC", value: `$${num("vlc").toFixed(2)}` },
      { label: "Net cost", value: `$${num("net").toFixed(2)}` },
      { label: "Dead net cost", value: `$${num("dead").toFixed(2)}` },
      { label: "Base price", value: `$${num("base").toFixed(2)}` },
      { label: "Promo price", value: `$${num("promo").toFixed(2)}` },
      { label: "CPI Base", value: `${Math.round(num("cpiBase"))} bps` },
      { label: "CPI Promo", value: `${Math.round(num("cpiPromo"))} bps` },
      { label: "Allowance/unit excl. flats", value: `$${num("allowanceUnit").toFixed(2)}` }
    ];
  }

  // --------------------------------------- Promotion Detail Screen state

  function promoSelectionKey() {
    const item = (promoDetailState.data && promoDetailState.data.item) || null;
    const vendor = (item && item.vendor) || promoDetailState.vendor || "";
    const priceArea = (item && item.priceArea) || promoDetailState.priceArea || "";
    const ncrc = (item && item.ncrc) || promoDetailState.ncrc || "";
    const week = (item && item.week) || (promoDetailState.context && promoDetailState.context.weeks && promoDetailState.context.weeks[0]) || "";
    return `${vendor}|${priceArea}|${ncrc}|W${week}`;
  }

  function openPromoDetailScreen(context) {
    const overlay = document.getElementById("promoDetailOverlay");
    if (!overlay) return;
    promoDetailState.context = context;
    promoDetailState.selectedOfferId = null;
    promoDetailState.priceArea = "";
    promoDetailState.priceAreaInput = "";
    promoDetailState.ncrc = "";
    promoDetailState.ncrcInput = "";
    promoDetailState.ncrcLabel = "";
    promoDetailState.rightTab = "cost";
    promoDetailState.scatterScope = "week";
    promoDetailState.openTypeahead = null;
    promoDetailState.options = null;
    promoDetailState.data = null;
    // Carry the planning objective the user picked on the 52-week page
    // (Sales / Units / AGP) into the detail screen. "agp" / "sales" map
    // to existing velocity kinds; "units" we accept too.
    promoDetailState.velocityKind = planState.objective || "sales";
    promoDetailState.bin = 1;
    promoDetailState.worklist = null;
    promoDetailState.worklistIndex = 0;
    promoDetailState.binCounts = null;
    promoDetailState.pendingCart = [];
    promoDetailState.finalizing = false;
    promoDetailState.finalizeResult = null;
    const launchVendor = (context && context.view === "vendor" && context.group) ? context.group : "";
    promoDetailState.vendor = launchVendor;
    promoDetailState.vendorInput = launchVendor;
    overlay.hidden = false;
    promoScatterReactRoot = null;
    promoScatterReactHost = null;
    primePromoDetailOptions().then(() => reloadWorklist({ autoSelect: true }));
  }

  async function primePromoDetailOptions() {
    try {
      const params = new URLSearchParams();
      if (promoDetailState.vendor) params.set("vendor", promoDetailState.vendor);
      const response = await fetch(`/api/promotion-detail/options?${params.toString()}`, { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const payload = await response.json();
      const data = payload.data || payload;
      if (promoDetailState.vendor && Array.isArray(data.vendors) && !data.vendors.includes(promoDetailState.vendor)) {
        // Division-named vendor — clear it so the user can pick from the catalog.
        promoDetailState.vendor = "";
        promoDetailState.vendorInput = "";
      }
      promoDetailState.options = data;
    } catch (error) {
      console.warn("Failed to prime promotion-detail options", error);
    }
  }

  async function reloadWorklist(options = {}) {
    const context = promoDetailState.context || {};
    const week = (context.weeks && context.weeks[0]) || 7;
    promoDetailState.loadingWorklist = true;
    try {
      const params = new URLSearchParams({
        velocityKind: promoDetailState.velocityKind,
        bin: String(promoDetailState.bin),
        week: String(week)
      });
      if (promoDetailState.vendor) params.set("vendor", promoDetailState.vendor);
      if (promoDetailState.priceArea) params.set("priceArea", promoDetailState.priceArea);
      const response = await fetch(`/api/promotion-detail/worklist?${params.toString()}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Worklist API failed ${response.status}`);
      const payload = await response.json();
      const worklist = payload.data || payload;
      promoDetailState.worklist = worklist.items || [];
      promoDetailState.binCounts = worklist.binCounts || null;
      if (options.autoSelect && promoDetailState.worklist.length) {
        promoDetailState.worklistIndex = 0;
        applyWorklistSelection(promoDetailState.worklist[0]);
        return;
      }
      if (!promoDetailState.worklist.length) {
        promoDetailState.worklistIndex = 0;
        promoDetailState.data = { item: null, options: promoDetailState.options || { vendors: [], priceAreas: [], ncrcs: [] } };
        renderPromoDetailScreen();
        return;
      }
      if (promoDetailState.worklistIndex >= promoDetailState.worklist.length) {
        promoDetailState.worklistIndex = promoDetailState.worklist.length - 1;
      }
      applyWorklistSelection(promoDetailState.worklist[promoDetailState.worklistIndex]);
    } catch (error) {
      console.warn("Failed to load worklist", error);
      const content = document.getElementById("promoDetailContent");
      if (content) content.innerHTML = `<div class="promo-detail-error"><strong>Could not load worklist.</strong><p>${escapeHtml(error.message)}</p></div>`;
    } finally {
      promoDetailState.loadingWorklist = false;
    }
  }

  function applyWorklistSelection(item) {
    promoDetailState.ncrcInput = `${item.ncrc} - ${item.item} ${item.packSize || ""}`.trim();
    promoDetailState.ncrcLabel = promoDetailState.ncrcInput;
    promoDetailState.selectedOfferId = null;
    reloadPromoDetail({ vendor: item.vendor, priceArea: item.priceArea, ncrc: item.ncrc });
  }

  function setVelocityScope({ velocityKind, bin }) {
    if (velocityKind && velocityKind !== promoDetailState.velocityKind) {
      promoDetailState.velocityKind = velocityKind;
      promoDetailState.bin = 1;
    }
    if (bin != null) promoDetailState.bin = bin;
    reloadWorklist({ autoSelect: true });
  }

  function gotoWorklistIndex(index) {
    if (!promoDetailState.worklist) return;
    if (index < 0 || index >= promoDetailState.worklist.length) return;
    promoDetailState.worklistIndex = index;
    applyWorklistSelection(promoDetailState.worklist[index]);
  }

  function advanceWorklist() {
    const next = promoDetailState.worklistIndex + 1;
    if (next < (promoDetailState.worklist || []).length) {
      gotoWorklistIndex(next);
    } else {
      showPromoConfirmToast(`All ${promoDetailState.worklist.length} NCRCs in this bin reviewed.`);
    }
  }

  async function reloadPromoDetail(overrides = {}) {
    const content = document.getElementById("promoDetailContent");
    if (!content) return;
    const context = promoDetailState.context || {};
    promoDetailState.data = { item: null, options: promoDetailState.options || { vendors: [], priceAreas: [], ncrcs: [] } };
    renderPromoDetailScreen();
    try {
      const vendor = overrides.vendor || promoDetailState.vendor;
      const priceArea = overrides.priceArea || promoDetailState.priceArea;
      const ncrc = overrides.ncrc || promoDetailState.ncrc;
      const params = new URLSearchParams();
      if (vendor) params.set("vendor", vendor);
      if (priceArea) params.set("priceArea", priceArea);
      if (ncrc) params.set("ncrc", ncrc);
      if (context.weeks && context.weeks[0]) params.set("week", String(context.weeks[0]));
      const response = await fetch(`/api/promotion-detail?${params.toString()}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`API failed ${response.status}`);
      const payload = await response.json();
      const data = payload.data || payload;
      promoDetailState.data = data;
      promoDetailState.options = data.options || null;
      if (data.item && data.offers && Array.isArray(data.offers.top) && data.offers.top.length && !promoDetailState.selectedOfferId) {
        const stored = promoDetailState.confirmedSelections[promoSelectionKey()];
        const storedOffer = stored ? data.offers.top.find((offer) => offer.id === stored) : null;
        const recommended = data.offers.top.find((offer) => offer.isRecommended) || data.offers.top[0];
        promoDetailState.selectedOfferId = (storedOffer || recommended).id;
      }
      // Seed the per-PA selections with the recommended offer for each
      // Price Area. The user can change them via the radio in each row.
      if (data.offers && Array.isArray(data.offersByPriceArea)) {
        promoDetailState.priceAreaSelections = {};
        data.offersByPriceArea.forEach((pa) => {
          const rec = (pa.offers || []).find((o) => o.isRecommended) || (pa.offers || [])[0];
          if (rec) promoDetailState.priceAreaSelections[pa.priceArea] = rec.id;
        });
      }
      renderPromoDetailScreen();
    } catch (error) {
      console.warn("Failed to load promotion detail", error);
      content.innerHTML = `<div class="promo-detail-error"><strong>Could not load promotion detail.</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  function selectPromoDetailOffer(offerId) {
    promoDetailState.selectedOfferId = offerId;
    renderPromoDetailScreen();
  }

  function togglePromoOfferExplain(offerId) {
    promoDetailState.selectedOfferId = offerId;
    promoDetailState.rightTab = "explain";
    renderPromoDetailScreen();
  }

  // Resolve the offer the user has picked for a given Price Area. Falls
  // back to that PA's recommended offer if no override is set yet. Also
  // looks in customOverrides so a "Use this promotion" pick wins over
  // the standard offers.
  function chosenOfferForPa(pa) {
    if (!pa || !Array.isArray(pa.offers)) return null;
    const selId = promoDetailState.priceAreaSelections[pa.priceArea];
    const custom = promoDetailState.customOverrides[pa.priceArea];
    if (selId) {
      if (custom && custom.id === selId) return custom;
      const sel = pa.offers.find((o) => o.id === selId);
      if (sel) return sel;
    }
    return pa.offers.find((o) => o.isRecommended) || pa.offers[0];
  }

  function selectedPromoOffer() {
    const data = promoDetailState.data;
    if (!data || !data.offers) return null;
    const paName = promoDetailState.selectedPriceArea;
    // The right-panel drill-down should reflect whichever offer is
    // currently chosen for the focused Price Area.
    if (paName && Array.isArray(data.offersByPriceArea)) {
      const pa = data.offersByPriceArea.find((p) => p.priceArea === paName);
      if (pa) {
        const chosen = chosenOfferForPa(pa);
        if (chosen) return chosen;
      }
    }
    // Top-level recommendations fallback (no PA context).
    const id = promoDetailState.selectedOfferId;
    if (Array.isArray(data.offers.top) && id) {
      const hit = data.offers.top.find((offer) => offer.id === id);
      if (hit) return hit;
    }
    if (Array.isArray(data.offers.top) && data.offers.top.length) return data.offers.top[0];
    if (Array.isArray(data.offersByPriceArea) && data.offersByPriceArea.length) {
      const pa = data.offersByPriceArea[0];
      return chosenOfferForPa(pa);
    }
    return null;
  }

  function promoConfirmedSelectionId() {
    return promoDetailState.confirmedSelections[promoSelectionKey()] || null;
  }

  function addCurrentSelectionToCart(options = {}) {
    const offer = selectedPromoOffer();
    const data = promoDetailState.data;
    if (!offer || !data || !data.item) return;
    const key = promoSelectionKey();
    const entry = {
      key,
      vendor: data.item.vendor,
      priceArea: data.item.priceArea,
      ncrc: data.item.ncrc,
      description: data.item.description,
      packSize: data.item.packSize,
      week: data.item.week,
      offerId: offer.id,
      offerLabel: offer.label,
      storeTactic: offer.storeTactic.code,
      storeTacticName: offer.storeTactic.name,
      digitalTactic: offer.digitalTactic || null,
      addedAt: new Date().toISOString()
    };
    const existingIndex = promoDetailState.pendingCart.findIndex((row) => row.key === key);
    if (existingIndex >= 0) promoDetailState.pendingCart[existingIndex] = entry;
    else promoDetailState.pendingCart.push(entry);
    promoDetailState.confirmedSelections[key] = offer.id;
    const advancing = options.andAdvance && (promoDetailState.worklistIndex < (promoDetailState.worklist || []).length - 1);
    if (advancing) {
      showPromoConfirmToast(`${offer.label} added to cart for ${data.item.ncrc}. Moving to next. ${promoDetailState.pendingCart.length} in cart.`);
      advanceWorklist();
    } else {
      showPromoConfirmToast(`${offer.label} added to cart for ${data.item.ncrc}, Week ${data.item.week}. ${promoDetailState.pendingCart.length} in cart.`);
      renderPromoDetailScreen();
    }
  }

  function removeFromCart(key) {
    promoDetailState.pendingCart = promoDetailState.pendingCart.filter((entry) => entry.key !== key);
    delete promoDetailState.confirmedSelections[key];
    renderPromoDetailScreen();
  }

  async function finalizePromoCart() {
    if (promoDetailState.finalizing) return;
    const cart = promoDetailState.pendingCart.slice();
    if (!cart.length) return;
    promoDetailState.finalizing = true;
    renderPromoDetailScreen();
    const published = [];
    const failed = [];
    for (const entry of cart) {
      try {
        const payload = {
          vendor: entry.vendor,
          priceArea: entry.priceArea,
          ncrc: entry.ncrc,
          week: entry.week,
          offerId: entry.offerId,
          offerLabel: entry.offerLabel,
          storeTactic: entry.storeTactic,
          digitalTactic: entry.digitalTactic
        };
        const response = await fetch("/api/promotion-detail/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        promoDetailState.pendingCart = promoDetailState.pendingCart.filter((row) => row.key !== entry.key);
        published.push(entry);
      } catch (error) {
        failed.push({ entry, error: error.message });
      }
    }
    promoDetailState.finalizing = false;
    promoDetailState.finalizeResult = { publishedAt: new Date().toISOString(), published, failed };
    renderPromoDetailScreen();
  }

  // -------- Promotion systems (APEX vs OMS) -------------------------
  // A custom/manual promo can be authored against either downstream promo
  // system. Each exposes a different field set + option list (extracted
  // from the APEX and OMS entry screens).
  const PROMO_SYSTEM_OPTIONS = {
    apexDiscount: ["PP", "%", "Cents", "BXG1"],
    omsDiscount: ["PP Ea", "% Ea", "Cents Ea", "Free Ea", "PP lb", "% lb", "Cents lb", "Free lb"],
    uom: [["E", "E — Each"], ["W", "W — Weighted"]],
    channel: ["Store Only", "Print Only", "Clip Click", "Digital Only"],
    omsTactic: ["Item Discount", "BXGX", "MB"]
  };

  // Allowances the APEX promo can be funded from — the planner picks one.
  // (Mocked; a real integration would return live NOPAs for the NCRC.)
  const APEX_ALLOWANCES = [
    { id: "4379527", name: "Buying allowance", tag: "PRIMARY", status: "Active", amount: 11550 },
    { id: "4381002", name: "Off-invoice allowance", tag: "", status: "Active", amount: 8200 },
    { id: "4390115", name: "Bill-back allowance", tag: "", status: "Pending", amount: 4300 }
  ];

  // A blank promo form carrying BOTH the APEX and OMS field sets — both
  // systems are authored side by side and linked to the price area (no
  // either/or toggle), so every field is namespaced by system.
  function freshPromoForm(extra) {
    return Object.assign({
      // APEX
      apexDiscount: "PP", apexFactor: "0", apexAmount: "", apexUom: "E", apexMinBuy: "1", apexLimit: "6", apexInAd: false, apexAllowanceId: "4379527",
      // OMS
      omsChannel: "Store Only", omsTactic: "Item Discount", omsUom: "E", omsMinBuy: "0", omsDiscount: "PP Ea", omsAmount: "", omsLim: "6", omsLimLb: "0"
    }, extra || {});
  }

  // Collapse the fields to what the mock forecaster understands. APEX is
  // the price-point/store promo, so it drives the forecast; the OMS tactic
  // is surfaced in the label.
  function promoSystemToForecast(f) {
    f = f || {};
    const opt = f.apexDiscount || "";
    let discountType = "dollar_off";
    if (/^PP/.test(opt)) discountType = "set_price";
    else if (/^%/.test(opt)) discountType = "percent_off";
    else if (/^Cents/.test(opt)) discountType = "dollar_off";
    else if (/^(BXG1|Free)/.test(opt)) discountType = "set_price";
    const tactic = f.omsTactic || (/^BXG1/.test(opt) ? "Buy X Get X" : "Item Discount");
    return {
      tactic, discountType,
      promoPrice: f.apexAmount,
      minBuy: Number(f.apexMinBuy) || 1,
      limit: Number(f.apexLimit) || 6
    };
  }

  // Compact per-system summaries for the manual builder table.
  function promoSystemSummary(f) {
    f = f || {};
    const amtStr = (opt, amt) => {
      if (amt === "" || amt == null) return "";
      if (/^%/.test(opt)) return `${amt}%`;
      if (/^Cents/.test(opt)) return `${amt}¢`;
      return `$${Number(amt).toFixed(2)}`;
    };
    const aA = amtStr(f.apexDiscount, f.apexAmount);
    const aO = amtStr(f.omsDiscount, f.omsAmount);
    return {
      apex: `${f.apexDiscount || "—"}${aA ? ` ${aA}` : ""}`,
      oms: `${f.omsChannel || ""}${f.omsDiscount ? ` · ${f.omsDiscount}` : ""}${aO ? ` ${aO}` : ""}`.replace(/^ · /, "")
    };
  }

  // APEX allowance picker — a radio list of funding allowances. `attr`
  // routes the pick into the right form; the radio group name is derived
  // from it so the default card and per-PA panel don't cross-select.
  function renderApexAllowanceList(selectedId, attr) {
    const groupName = `apexAllow-${attr.replace(/[^a-z]/gi, "")}`;
    const sel = selectedId || APEX_ALLOWANCES[0].id;
    return `
      <div class="pd-allow">
        <span class="pd-of-label">Allowance</span>
        <div class="pd-allow-list">
          ${APEX_ALLOWANCES.map((a) => `
            <label class="pd-allow-item ${sel === a.id ? "is-sel" : ""}">
              <input type="radio" name="${groupName}" ${attr}="apexAllowanceId" value="${escapeAttr(a.id)}" ${sel === a.id ? "checked" : ""} />
              <span class="pd-allow-id">${escapeHtml(a.id)}</span>
              <span class="pd-allow-name">${escapeHtml(a.name)}</span>
              ${a.tag ? `<span class="pd-allow-badge">${escapeHtml(a.tag)}</span>` : ""}
              <span class="pd-allow-meta">${escapeHtml(a.status)} &middot; $${a.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;
  }

  // Both promotion systems side by side (no toggle): APEX + OMS field
  // cards, all bound to a form via `attr`.
  function renderPromoSystemsPair(f, attr) {
    const O = PROMO_SYSTEM_OPTIONS;
    const sel = (name, options, cur) => `
      <select ${attr}="${name}">
        ${options.map((o) => { const v = Array.isArray(o) ? o[0] : o; const l = Array.isArray(o) ? o[1] : o; return `<option value="${escapeAttr(v)}" ${cur === v ? "selected" : ""}>${escapeHtml(l)}</option>`; }).join("")}
      </select>`;
    const num = (name, val) => `<input type="number" step="1" min="0" ${attr}="${name}" value="${escapeAttr(val == null ? "" : val)}" />`;
    const money = (name, val) => `<div class="pd-money"><span>$</span><input type="number" step="0.01" min="0" ${attr}="${name}" value="${escapeAttr(val == null ? "" : val)}" placeholder="-" /></div>`;
    const field = (label, inner, cls) => `<label class="pd-of-field ${cls || ""}"><span>${escapeHtml(label)}</span>${inner}</label>`;
    return `
      <div class="pd-promo-systems">
        <section class="pd-promo-sys-card">
          <header><span class="pd-sys-tag pd-sys-apex">APEX</span> <span>Price-point promotion</span></header>
          <div class="pd-override-fields">
            ${field("Discount", sel("apexDiscount", O.apexDiscount, f.apexDiscount))}
            ${field("Factor", num("apexFactor", f.apexFactor), "pd-of-field-sm")}
            ${field("Amount", money("apexAmount", f.apexAmount))}
            ${field("UOM", sel("apexUom", O.uom, f.apexUom), "pd-of-field-sm")}
            ${field("Min buy", num("apexMinBuy", f.apexMinBuy), "pd-of-field-sm")}
            ${field("Limit", num("apexLimit", f.apexLimit), "pd-of-field-sm")}
            <label class="pd-of-field pd-of-check"><input type="checkbox" ${attr}="apexInAd" ${f.apexInAd ? "checked" : ""} /> <span>In Ad</span></label>
          </div>
          ${renderApexAllowanceList(f.apexAllowanceId, attr)}
        </section>
        <section class="pd-promo-sys-card">
          <header><span class="pd-sys-tag pd-sys-oms">OMS</span> <span>Multi-channel promotion</span></header>
          <div class="pd-override-fields">
            ${field("Channel", sel("omsChannel", O.channel, f.omsChannel))}
            ${field("Tactic", sel("omsTactic", O.omsTactic, f.omsTactic))}
            ${field("UOM", sel("omsUom", O.uom, f.omsUom), "pd-of-field-sm")}
            ${field("Min buy", num("omsMinBuy", f.omsMinBuy), "pd-of-field-sm")}
            ${field("Discount", sel("omsDiscount", O.omsDiscount, f.omsDiscount))}
            ${field("Amount", money("omsAmount", f.omsAmount))}
            ${field("Lim", num("omsLim", f.omsLim), "pd-of-field-sm")}
            ${field("Lim Lb", num("omsLimLb", f.omsLimLb), "pd-of-field-sm")}
          </div>
        </section>
      </div>
    `;
  }

  // Snapshot the current override form + forecast into an offer-shaped
  // object for a given Price Area. The renderer treats it like any other
  // alternate offer (radio, click-to-pick) — it just carries a Custom
  // pill instead of a rank number.
  function buildCustomOfferFromOverride(paName) {
    const form = promoDetailState.overrideForm;
    const result = promoDetailState.overrideResult;
    if (!result) return null;
    const data = promoDetailState.data;
    const pa = (data && data.offers && data.offersByPriceArea || []).find((p) => p.priceArea === paName);
    const regPrice = (pa && pa.basePrice) || (pa && pa.offers && pa.offers[0] && pa.offers[0].regPrice) || 5.5;
    const vlc = (pa && pa.vlc) || (pa && pa.offers && pa.offers[0] && pa.offers[0].netCost) || 2;
    const fc = promoSystemToForecast(form);
    const v = Number(fc.promoPrice) || 0;
    let promoPrice = regPrice;
    if (fc.discountType === "set_price") promoPrice = v || regPrice;
    else if (fc.discountType === "percent_off") promoPrice = Math.max(0.1, regPrice * (1 - v / 100));
    else promoPrice = Math.max(0.1, regPrice - v);
    const storeSave = Math.max(0, regPrice - promoPrice);
    return {
      id: `custom-${paName}-${Date.now()}`,
      rank: "C",
      label: `APEX+OMS · ${fc.tactic}`,
      category: "Custom",
      isRecommended: false,
      isCurrentPlan: false,
      isCustom: true,
      storeTactic: { code: "CUSTOM", name: fc.tactic, className: "custom" },
      digitalTactic: null,
      netCost: vlc,
      regPrice,
      promoStorePrice: Number(promoPrice.toFixed(2)),
      promoDigitalPrice: null,
      storeSave: Number(storeSave.toFixed(2)),
      digitalSave: 0,
      forecastUnits: result.units || 0,
      forecastSales: result.sales || 0,
      forecastAgp: result.agp || 0,
      salesDeltaPct: 0,
      unitDeltaPct: 0,
      agpDeltaPct: 0,
      vendorFunding: 0,
      mbStore: fc.minBuy,
      limitStore: fc.limit,
      hasAd: false,
      hasDisplay: false,
      guardrailScore: 0,
      reliabilityScore: 0,
      totalScore: 0,
      // Snapshot the source form so the row can show a useful description.
      _formSnapshot: { ...form }
    };
  }

  // Build a custom offer for a PA from explicit inline-edit values (no
  // forecaster round-trip). Forecast is estimated from the PA's
  // recommended offer, nudged by the discount depth so deeper cuts read
  // as a bit more volume — enough to feel responsive in the builder.
  function buildCustomOfferFromValues(paName, vals) {
    const data = promoDetailState.data;
    const pa = (data && data.offersByPriceArea || []).find((p) => p.priceArea === paName);
    const rec = (pa && (pa.offers || []).find((o) => o.isRecommended)) || (pa && pa.offers && pa.offers[0]) || {};
    const regPrice = (pa && pa.basePrice) || rec.regPrice || 5.5;
    const vlc = (pa && pa.vlc) || rec.netCost || 2;
    const fc = promoSystemToForecast(vals);
    const v = Number(fc.promoPrice) || 0;
    let promoPrice = regPrice;
    if (fc.discountType === "set_price") promoPrice = v || regPrice;
    else if (fc.discountType === "percent_off") promoPrice = Math.max(0.1, regPrice * (1 - v / 100));
    else promoPrice = Math.max(0.1, regPrice - v);
    const storeSave = Math.max(0, regPrice - promoPrice);
    const depth = regPrice > 0 ? storeSave / regPrice : 0;
    const units = Math.round((rec.forecastUnits || 0) * (1 + depth * 0.6));
    const sales = Math.round(units * promoPrice);
    const agp = Math.round((rec.forecastAgp || 0) * (1 + depth * 0.15));
    return {
      id: `custom-${paName}-${Date.now()}`,
      rank: "C", label: `APEX+OMS · ${fc.tactic}`, category: "Custom",
      isRecommended: false, isCurrentPlan: false, isCustom: true,
      storeTactic: { code: "CUSTOM", name: fc.tactic, className: "custom" },
      digitalTactic: null, netCost: vlc, regPrice,
      promoStorePrice: Number(promoPrice.toFixed(2)), promoDigitalPrice: null,
      storeSave: Number(storeSave.toFixed(2)), digitalSave: 0,
      forecastUnits: units, forecastSales: sales, forecastAgp: agp,
      salesDeltaPct: 0, unitDeltaPct: 0, agpDeltaPct: 0, vendorFunding: 0,
      mbStore: fc.minBuy, limitStore: fc.limit,
      minBuy: fc.minBuy, limit: fc.limit,
      discountType: fc.discountType, promoPrice: fc.promoPrice,
      hasAd: false, hasDisplay: false,
      guardrailScore: 0, reliabilityScore: 0, totalScore: 0,
      _formSnapshot: { ...vals }
    };
  }

  function useOverrideAsCustom() {
    const data = promoDetailState.data;
    const form = promoDetailState.overrideForm;
    const result = promoDetailState.overrideResult;
    if (!data || !result) return;
    const targetPas = form.priceArea
      ? [form.priceArea]
      : (data.offers && data.offersByPriceArea || []).map((p) => p.priceArea);
    if (!targetPas.length) return;
    targetPas.forEach((paName) => {
      const offer = buildCustomOfferFromOverride(paName);
      if (offer) {
        promoDetailState.customOverrides[paName] = offer;
        promoDetailState.priceAreaSelections[paName] = offer.id;
        promoDetailState.expandedPriceAreas[paName] = true;
      }
    });
    // Pop out of override mode, focus the first target PA so the user
    // sees the new custom row at the top of the alternates.
    promoDetailState.overrideMode = false;
    promoDetailState.overrideResult = null;
    promoDetailState.selectedPriceArea = targetPas[0];
    promoDetailState.selectedOfferId = promoDetailState.customOverrides[targetPas[0]].id;
    renderPromoDetailScreen();
  }

  function clearCustomOverride(paName) {
    if (!paName) return;
    const custom = promoDetailState.customOverrides[paName];
    delete promoDetailState.customOverrides[paName];
    // If the cleared offer was the chosen one for this PA, revert to the
    // recommended offer.
    if (custom && promoDetailState.priceAreaSelections[paName] === custom.id) {
      const data = promoDetailState.data;
      const pa = (data && data.offers && data.offersByPriceArea || []).find((p) => p.priceArea === paName);
      const rec = pa && (pa.offers || []).find((o) => o.isRecommended);
      promoDetailState.priceAreaSelections[paName] = rec ? rec.id : null;
    }
    renderPromoDetailScreen();
  }

  async function submitOverrideForecast() {
    const data = promoDetailState.data;
    if (!data || !data.item) return;
    const form = promoDetailState.overrideForm;
    promoDetailState.overrideSubmitting = true;
    renderPromoDetailScreen();
    try {
      // Translate form fields to a promo price the mock forecaster expects.
      // For dollar/percent off we approximate from the offers table's reg price.
      const regPrice = (data.offersByPriceArea && data.offersByPriceArea[0] && data.offersByPriceArea[0].basePrice) || (data.pricing && data.pricing.basePrice) || 5.5;
      const fc = promoSystemToForecast(form);
      let promoPrice = regPrice;
      const v = Number(fc.promoPrice) || 0;
      if (fc.discountType === "set_price") promoPrice = v || regPrice;
      else if (fc.discountType === "percent_off") promoPrice = Math.max(0.1, regPrice * (1 - v / 100));
      else promoPrice = Math.max(0.1, regPrice - v);
      const payload = {
        vendor: data.item.vendor,
        priceArea: form.priceArea || data.item.priceArea,
        ncrc: data.item.ncrc,
        week: data.item.week,
        tactic: fc.tactic,
        discountType: fc.discountType,
        promoPrice,
        minBuy: fc.minBuy,
        limit: fc.limit
      };
      const response = await fetch("/api/promotion-detail/override", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      promoDetailState.overrideResult = json.data || json;
    } catch (error) {
      console.warn("Override forecast failed", error);
      promoDetailState.overrideResult = { units: 0, sales: 0, agp: 0, disclaimer: `Forecaster error: ${error.message}` };
    } finally {
      promoDetailState.overrideSubmitting = false;
      renderPromoDetailScreen();
    }
  }

  function showReliabilityPopover(anchorEl, offer) {
    let pop = document.getElementById("pdReliabilityPopover");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "pdReliabilityPopover";
      pop.className = "pd-reliab-popover";
      document.body.appendChild(pop);
      // Close on outside click / escape.
      document.addEventListener("click", (e) => {
        if (pop.hidden) return;
        if (e.target === pop || pop.contains(e.target)) return;
        if (e.target.closest("[data-pd-score-info]")) return;
        pop.hidden = true;
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") pop.hidden = true;
      });
    }
    if (!offer) {
      pop.hidden = true;
      return;
    }
    const rel = offer.reliabilityScore;
    const grd = offer.guardrailScore;
    const data = promoDetailState.data;
    const item = (data && data.item) || {};
    const hasDigital = !!offer.digitalTactic;
    // Synthetic evidence — real provider would return arrays for each axis.
    const categoryNcrcs = [
      "COCA COLA CHERRY 8-12FZ (NCRC 30045)",
      "COCA COLA DIET 2L PET (NCRC 30046)",
      "SPRITE 12-12FZ (NCRC 30047)",
      "FANTA ORANGE 12-12FZ (NCRC 30048)",
      "PEPSI ZERO SUGAR 12-12FZ (NCRC 30101)",
      "MOUNTAIN DEW 12-12FZ (NCRC 30103)"
    ];
    const weeksList = ["2025-05-21", "2025-05-28", "2025-06-04", "2025-06-11", "2025-06-18", "2025-06-25", "2025-07-02", "2025-07-09"];
    // Per-axis (Store / Digital) evidence summary. We mock booleans based on
    // the offer code so the structure is realistic.
    const storeEvidence = {
      ranBefore: "-",
      itemStoreWeeks: "-",
      itemStoreWeekCount: "-",
      ranInCategory: "Yes",
      categoryNcrcs: categoryNcrcs.slice(0, 6),
      categoryWeeks: weeksList,
      categoryWeekCount: weeksList.length
    };
    const digitalEvidence = hasDigital ? {
      ranBefore: "-",
      itemStoreWeeks: "-",
      itemStoreWeekCount: "-",
      ranInCategory: "-",
      categoryNcrcs: [],
      categoryWeeks: [],
      categoryWeekCount: "-"
    } : null;
    function evidenceCell(axis) {
      if (!axis) return `<td class="pd-reliab-empty">No digital component on this offer</td>`;
      return `
        <td>
          <ul class="pd-reliab-list">
            <li><span>Ran before for same item/store?</span><strong>${axis.ranBefore}</strong></li>
            <li><span>Weeks run for same item/store</span><strong>${axis.itemStoreWeeks}</strong></li>
            <li><span>Same item/store week count</span><strong>${axis.itemStoreWeekCount}</strong></li>
            <li><span>Ran elsewhere in category?</span><strong>${axis.ranInCategory}</strong></li>
            <li class="pd-reliab-list-block">
              <span>Category NCRCs (${axis.categoryNcrcs.length})</span>
              ${axis.categoryNcrcs.length ? `<p>${axis.categoryNcrcs.join(", ")}</p>` : `<p class="pd-reliab-empty">—</p>`}
            </li>
            <li class="pd-reliab-list-block">
              <span>Category weeks (${axis.categoryWeekCount})</span>
              ${axis.categoryWeeks.length ? `<p>${axis.categoryWeeks.join(", ")}</p>` : `<p class="pd-reliab-empty">—</p>`}
            </li>
          </ul>
        </td>
      `;
    }
    pop.innerHTML = `
      <header>
        <div>
          <span class="pd-reliab-eyebrow">RELIABILITY EVIDENCE</span>
          <strong class="${scoreTone(rel)}">${rel}%</strong>
        </div>
        <button type="button" class="pd-reliab-close" aria-label="Close">&times;</button>
      </header>
      <div class="pd-reliab-body">
        <div class="pd-reliab-row"><span>Reliability</span><strong class="${scoreTone(rel)}">${rel}%</strong></div>
        <div class="pd-reliab-row"><span>Guardrail</span><strong class="${scoreTone(grd)}">${grd}</strong></div>
        <div class="pd-reliab-row"><span>Similar runs (52w)</span><strong>${14 + (rel % 8)}</strong></div>
        <div class="pd-reliab-row"><span>Correlation r</span><strong>0.${rel}</strong></div>
        <div class="pd-reliab-row"><span>Median abs error</span><strong>&plusmn;${(4 + (rel % 5) * 0.4).toFixed(1)}%</strong></div>
        <table class="pd-reliab-evidence">
          <thead>
            <tr>
              <th>Evidence question</th>
              <th>Store promo</th>
              <th>Digital promo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Run history vs same item / same store</td>
              ${evidenceCell(storeEvidence)}
              ${evidenceCell(digitalEvidence)}
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const rect = anchorEl.getBoundingClientRect();
    pop.hidden = false;
    const popWidth = 560;
    const left = Math.min(window.innerWidth - popWidth - 16, Math.max(8, rect.left + rect.width / 2 - popWidth / 2));
    pop.style.left = `${left}px`;
    pop.style.top = `${rect.bottom + 6}px`;
    pop.style.width = `${popWidth}px`;
    pop.style.maxHeight = `${Math.max(280, window.innerHeight - rect.bottom - 24)}px`;
    pop.style.overflow = "auto";
    pop.querySelector(".pd-reliab-close").addEventListener("click", () => { pop.hidden = true; });
  }

  function dismissFinalizeResult() {
    promoDetailState.finalizeResult = null;
    const overlay = document.getElementById("promoDetailOverlay");
    if (overlay) overlay.hidden = true;
  }

  function showPromoConfirmToast(message, tone = "success") {
    let toast = document.getElementById("promoConfirmToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "promoConfirmToast";
      toast.className = "pd-toast";
      document.body.appendChild(toast);
    }
    toast.className = `pd-toast tone-${tone}`;
    toast.innerHTML = `<span class="pd-toast-icon">${tone === "success" ? "&#10003;" : "!"}</span><span class="pd-toast-text">${escapeHtml(message)}</span>`;
    toast.classList.add("is-visible");
    window.clearTimeout(showPromoConfirmToast._timer);
    showPromoConfirmToast._timer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 4000);
  }

  function setPromoTypeahead(kind, value, options = {}) {
    if (kind === "vendor") {
      promoDetailState.vendor = value;
      promoDetailState.vendorInput = value;
      promoDetailState.priceArea = "";
      promoDetailState.priceAreaInput = "";
      promoDetailState.ncrc = "";
      promoDetailState.ncrcInput = "";
      promoDetailState.ncrcLabel = "";
      promoDetailState.openTypeahead = null;
      promoDetailState.selectedOfferId = null;
      // Need fresh options for the new vendor (so price areas + NCRCs populate).
      primePromoDetailOptions().then(() => reloadWorklist({ autoSelect: true }));
      return;
    }
    if (kind === "priceArea") {
      promoDetailState.priceArea = value;
      promoDetailState.priceAreaInput = value;
      promoDetailState.ncrc = "";
      promoDetailState.ncrcInput = "";
      promoDetailState.ncrcLabel = "";
      promoDetailState.openTypeahead = null;
      promoDetailState.selectedOfferId = null;
      reloadWorklist({ autoSelect: true });
      return;
    }
    if (kind === "ncrc") {
      promoDetailState.ncrc = value;
      promoDetailState.ncrcLabel = options.label || value;
      promoDetailState.ncrcInput = promoDetailState.ncrcLabel;
      promoDetailState.openTypeahead = null;
      promoDetailState.selectedOfferId = null;
      // If the user picked an NCRC directly (without picking vendor first),
      // infer the vendor from the catalog so price-area + detail load.
      const fullNcrc = (promoDetailState.options && promoDetailState.options.allNcrcs || []).find((n) => n.ncrc === value);
      if (fullNcrc && !promoDetailState.vendor) {
        promoDetailState.vendor = fullNcrc.vendor;
        promoDetailState.vendorInput = fullNcrc.vendor;
      }
      const idx = (promoDetailState.worklist || []).findIndex((item) => item.ncrc === value);
      if (idx >= 0) {
        promoDetailState.worklistIndex = idx;
        applyWorklistSelection(promoDetailState.worklist[idx]);
      } else {
        // Need to re-prime options because vendor may have just been set, then load detail.
        primePromoDetailOptions().then(() => reloadPromoDetail());
      }
    }
  }

  // ----------------------------- Promotion Detail Screen render functions

  function renderPromoDetailScreen() {
    const content = document.getElementById("promoDetailContent");
    if (!content) return;
    const data = promoDetailState.data;
    if (promoDetailState.finalizeResult) {
      content.innerHTML = renderBaselinedScreen(promoDetailState.finalizeResult);
      return;
    }
    if (promoDetailState.reviewing) {
      content.innerHTML = renderReviewScreen();
      return;
    }
    const options = (data && data.options) || promoDetailState.options || { vendors: [], priceAreas: [], ncrcs: [] };
    content.innerHTML = `
      ${renderPdHeader(data || {}, options)}
      ${renderPdShell(data)}
    `;
    if (data && data.item) renderPromoScatter();
    setupWorklistScroll();
  }

  // -------- Review & finalise screen --------------------------------
  // Shown after the user clicks "Review & finalize" in the action footer.
  // Lists every NCRC the planner has touched (priced or skipped) with
  // full economic context, then offers a "Finalise promotions" button
  // that commits the API publish.
  function renderReviewScreen() {
    const data = promoDetailState.data || {};
    const cart = promoDetailState.pendingCart || [];
    const worklist = promoDetailState.worklist || [];
    const finalizing = promoDetailState.finalizing;
    const category = planState.category || "Carbonated Soft Drinks";
    const objective = promoDetailState.velocityKind === "agp" ? "AGP velocity"
      : promoDetailState.velocityKind === "units" ? "Units velocity"
      : "Sales velocity";
    const week = (cart[0] && cart[0].week) || (data.item && data.item.week) || "";
    const period = (data.item && data.item.period) || "";
    const division = "All accessible divisions";
    const deptDesk = "Carbonated Soft Drinks · Desk 12";

    // Quick index of cart entries by NCRC + PA + week so we can
    // resolve "priced" rows. The worklist tells us every NCRC in scope.
    const cartByKey = new Map();
    cart.forEach((e) => cartByKey.set(`${e.ncrc}|${e.priceArea}|${e.week}`, e));

    // Build review rows: every worklist row × every PA the vendor sells
    // in. For the mock, the worklist itself is the row count — each
    // entry is a (NCRC, PA) pairing.
    const rows = worklist.map((item, idx) => {
      const key = `${item.ncrc}|${item.priceArea}|${week}`;
      const inCart = cartByKey.get(key);
      // If priced, find the offer in this PA's offer list. If not in
      // cart, we just mark as skipped and leave the metric cells blank.
      let offer = null;
      if (inCart) {
        const pa = (data.offersByPriceArea || []).find((p) => p.priceArea === item.priceArea);
        if (pa) {
          offer = (pa.offers || []).find((o) => o.id === inCart.offerId);
          if (!offer && promoDetailState.customOverrides[item.priceArea]) {
            const cu = promoDetailState.customOverrides[item.priceArea];
            if (cu.id === inCart.offerId) offer = cu;
          }
        }
      }
      return { index: idx, item, inCart: !!inCart, cartEntry: inCart, offer, paName: item.priceArea };
    });

    // Sum totals across priced rows for the summary footer, including
    // the LY baseline numbers so the totals row can show vs-LY deltas.
    const totals = rows.reduce((acc, r) => {
      if (!r.offer) return acc;
      const o = r.offer;
      const sales = o.forecastSales || 0;
      const units = o.forecastUnits || 0;
      const agp   = o.forecastAgp   || 0;
      const allow = (o.vendorFunding || 0) * units;
      const promoGp = agp + allow;
      acc.sales     += sales;
      acc.units     += units;
      acc.agp       += agp;
      acc.allowance += allow;
      acc.promoGp   += promoGp;
      acc.lySales   += sales / (1 + (o.salesDeltaPct || 0) / 100);
      acc.lyUnits   += units / (1 + (o.unitDeltaPct  || 0) / 100);
      acc.lyAgp     += agp   / (1 + (o.agpDeltaPct   || 0) / 100);
      acc.lyAllow   += allow * 0.92;
      acc.lyPromoGp += (agp / (1 + (o.agpDeltaPct || 0) / 100)) + (allow * 0.92);
      return acc;
    }, { sales: 0, units: 0, agp: 0, allowance: 0, promoGp: 0, lySales: 0, lyUnits: 0, lyAgp: 0, lyAllow: 0, lyPromoGp: 0 });

    const fmtK = (n) => {
      const sign = n < 0 ? "-" : "";
      const v = Math.abs(n);
      if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(2)}M`;
      if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}K`;
      return `${sign}$${v.toFixed(0)}`;
    };
    const fmtUnits = (n) => {
      const v = Math.abs(n);
      if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
      if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
      return v.toFixed(0);
    };

    // Classify every worklist row into one of three buckets so the
    // review screen reads as: what you're promoting · what you decided
    // not to · what doesn't even have a promotion option.
    const offersByPa = new Map();
    (data.offersByPriceArea || []).forEach((p) => offersByPa.set(p.priceArea, p));
    const classify = (r) => {
      if (r.inCart && r.offer) return "promoted";
      // Synthetic split for the skipped pile so the third section is
      // visible in the demo: hash NCRC → ~one in three has no available
      // promo. A real provider would return this from the worklist row.
      const paOffers = (offersByPa.get(r.item.priceArea) || {}).offers || [];
      const hash = (r.item.ncrc || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
      if (paOffers.length === 0 || hash % 3 === 0) return "no_available";
      return "decided_skipped";
    };
    const buckets = { promoted: [], decided_skipped: [], no_available: [] };
    rows.forEach((r) => { buckets[classify(r)].push(r); });

    // Section 1 sort key — reuse the same Sales / Units / AGP velocity
    // toggle the recommendations side uses so the user only learns one
    // sort affordance across screens.
    const sortKey = promoDetailState.velocityKind || "sales";
    const sortField = sortKey === "agp" ? "forecastAgp"
      : sortKey === "units" ? "forecastUnits" : "forecastSales";
    buckets.promoted.sort((a, b) => ((b.offer && b.offer[sortField]) || 0) - ((a.offer && a.offer[sortField]) || 0));

    const priced = buckets.promoted.length;
    const skipped = buckets.decided_skipped.length;
    const unavailable = buckets.no_available.length;

    // Manual override carries through: a manual plan only publishes the
    // tactics the planner set, so the plan-summary roll-up and the two
    // non-promoted sections are dropped, and forecast metrics are hidden.
    const manual = promoDetailState.planMode === "manual";
    return `
      <div class="pd-review ${manual ? "pd-review-manual" : ""}">
        <header class="pd-review-head">
          <div>
            <span class="pd-eyebrow">REVIEW &amp; FINALISE</span>
            <h2>${escapeHtml(category)}</h2>
            <div class="pd-review-meta">
              <span><em>Week</em> <strong>W${escapeHtml(String(week))}${period ? ` (P${escapeHtml(String(period))})` : ""}</strong></span>
              <span class="dot">&middot;</span>
              <span><em>Objective</em> <strong>${escapeHtml(objective)}</strong></span>
              <span class="dot">&middot;</span>
              <span><em>Division</em> <strong>${escapeHtml(division)}</strong></span>
              <span class="dot">&middot;</span>
              <span><em>Department / Desk</em> <strong>${escapeHtml(deptDesk)}</strong></span>
            </div>
          </div>
          <div class="pd-review-counts">
            ${manual ? `<span class="pd-review-manual-badge"><i></i>MANUAL OVERRIDE</span>` : ""}
            <span class="pd-review-count priced">${priced} promoted</span>
            ${manual ? "" : `
              <span class="pd-review-count skipped">${skipped} skipped</span>
              <span class="pd-review-count unavailable">${unavailable} no promo available</span>
            `}
          </div>
        </header>

        ${manual ? `
          <div class="pd-review-manual-note">
            <strong>Manual override.</strong> Plan summary and the non-promoted sections are hidden &mdash; a manual plan only publishes the tactics you set.
          </div>
        ` : renderReviewGrandTotal({
          section1: totals,
          section2: baselineSectionTotals(buckets.decided_skipped, data.offers && data.offers.noPromo),
          section3: baselineSectionTotals(buckets.no_available,    data.offers && data.offers.noPromo)
        }, fmtK, fmtUnits)}

        ${renderReviewUnifiedTable({
          promoted: buckets.promoted,
          skipped:  manual ? [] : buckets.decided_skipped,
          unavailable: manual ? [] : buckets.no_available,
          baseline: data.offers && data.offers.noPromo,
          sortKey, fmtK, fmtUnits, totals, priced, manual
        })}

        <footer class="pd-review-footer">
          <button type="button" class="pd-btn-secondary" data-pd-action="review-cancel">&larr; Back to recommendations</button>
          <button type="button" class="pd-btn-primary pd-btn-finalize" data-pd-action="review-publish" ${cart.length === 0 || finalizing ? "disabled" : ""}>
            ${finalizing ? `<span class="pd-btn-spinner"></span>Publishing...` : `Finalise promotions (${cart.length})`}
          </button>
        </footer>
      </div>
    `;
  }

  // One table covers all three sections so the columns line up exactly.
  // Section transitions are marked by a full-width divider row instead of
  // a fresh <thead>; the section sort/totals rows live in the same body.
  function renderReviewUnifiedTable({ promoted, skipped, unavailable, baseline, sortKey, fmtK, fmtUnits, totals, priced, manual }) {
    // Manual override: a slimmer table with only the promoting section and
    // no forecast/allowance columns (there are none for a manual plan).
    if (manual) return renderManualReviewTable(promoted);
    const sortBtn = (key, label) => `
      <button type="button" class="pd-bin-chip pd-sort-chip ${sortKey === key ? "active" : ""}" data-pd-review-sort="${key}">
        <i class="pd-bin-dot pd-sort-dot-${key}"></i>
        <span class="pd-bin-label">${escapeHtml(label)}</span>
      </button>
    `;
    const dividerRow = ({ klass, title, blurb, count, controls }) => `
      <tr class="pd-review-section-divider ${klass}">
        <td colspan="20">
          <div class="pd-rev-div-row">
            <div class="pd-rev-div-text">
              <strong>${escapeHtml(title)}</strong>
              <span class="pd-rev-div-count">${count}</span>
              <small>${blurb}</small>
            </div>
            ${controls || ""}
          </div>
        </td>
      </tr>
    `;
    const sortControls = `
      <div class="pd-rev-div-controls">
        <span class="pd-scope-label">Sort by</span>
        <div class="pd-bin-chips" role="group" aria-label="Sort priced rows">
          ${sortBtn("sales", "Sales velocity")}
          ${sortBtn("units", "Units velocity")}
          ${sortBtn("agp",   "AGP velocity")}
        </div>
      </div>
    `;
    // Section 1 totals row (full metric coverage including Allow/Promo GP).
    const section1TotalsRow = (() => {
      const dlt = (cur, base) => {
        const d = cur - base;
        const pct = base ? (d / base) * 100 : 0;
        return { d, pct, klass: d >= 0 ? "positive" : "negative" };
      };
      const dSales = dlt(totals.sales, totals.lySales);
      const dUnits = dlt(totals.units, totals.lyUnits);
      const dAgp   = dlt(totals.agp, totals.lyAgp);
      const dAllow = dlt(totals.allowance, totals.lyAllow);
      const dPromoGp = dlt(totals.promoGp, totals.lyPromoGp);
      const cell = (val, d, fmtFn) => `
        <td class="r">
          <strong>${val}</strong>
          <div class="pd-review-sub ${d.klass}">${d.d >= 0 ? "+" : ""}${fmtFn(d.d)} <span>/</span> ${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}% vs LY</div>
        </td>
      `;
      return `
        <tr class="pd-review-totals pd-review-section-totals">
          <td colspan="12"><strong>Section total &middot; ${priced} promoted ${priced === 1 ? "item" : "items"}</strong></td>
          <td class="r">&mdash;</td>
          ${cell(fmtK(totals.sales), dSales, fmtK)}
          ${cell(fmtUnits(totals.units), dUnits, fmtUnits)}
          ${cell(fmtK(totals.agp), dAgp, fmtK)}
          <td class="r">&mdash;</td>
          ${cell(fmtK(totals.allowance), dAllow, fmtK)}
          ${cell(fmtK(totals.promoGp), dPromoGp, fmtK)}
          <td class="c pd-rev-more-col"></td>
        </tr>
      `;
    })();
    const baselineTotalsRow = (rows, label) => {
      const t = baselineSectionTotals(rows, baseline);
      return `
        <tr class="pd-review-totals pd-review-section-totals">
          <td colspan="13"><strong>${escapeHtml(label)} &middot; ${rows.length} ${rows.length === 1 ? "item" : "items"}</strong></td>
          <td class="r"><strong>${fmtK(t.sales)}</strong></td>
          <td class="r"><strong>${fmtUnits(t.units)}</strong></td>
          <td class="r"><strong>${fmtK(t.agp)}</strong></td>
          <td class="r">&mdash;</td>
          <td class="pd-rev-na-cell"><span class="pd-rev-na">&mdash;</span></td>
          <td class="pd-rev-na-cell"><span class="pd-rev-na">&mdash;</span></td>
          <td class="c pd-rev-more-col"></td>
        </tr>
      `;
    };
    const colgroup = `
      <colgroup>
        <col class="col-priced" />
        <col class="col-vendor" />
        <col class="col-ncrc" />
        <col class="col-desc" />
        <col class="col-yn" />
        <col class="col-ad" />
        <col class="col-yn" />
        <col class="col-disp" />
        <col class="col-stores" />
        <col class="col-yn" />
        <col class="col-tactic" />
        <col class="col-tactic" />
        <col class="col-vlc" />
        <col class="col-metric" />
        <col class="col-metric" />
        <col class="col-metric" />
        <col class="col-aiv" />
        <col class="col-metric" />
        <col class="col-metric" />
        <col class="col-more" />
      </colgroup>
    `;
    return `
      <div class="pd-review-table-wrap pd-review-table-wrap-unified">
        <table class="pd-review-table pd-review-table-unified">
          ${colgroup}
          <thead>
            <tr>
              <th class="pd-rev-priced">Priced</th>
              <th class="l">Vendor</th>
              <th class="l">NCRC</th>
              <th class="l">NCRC description</th>
              <th class="c">In circ.</th>
              <th class="l">Ad page</th>
              <th class="c">In disp.</th>
              <th class="l">Display</th>
              <th class="r">Stores</th>
              <th class="c">NOPA</th>
              <th class="l">Store tactic</th>
              <th class="l">Digital tactic</th>
              <th class="r">VLC</th>
              <th class="r">Sales</th>
              <th class="r">Units</th>
              <th class="r">AGP $</th>
              <th class="r">AIV</th>
              <th class="r">Allow. $</th>
              <th class="r">Promo GP</th>
              <th class="c pd-rev-more-col"></th>
            </tr>
          </thead>
          <tbody class="pd-section-body pd-section-body-promoted">
            ${dividerRow({
              klass: "pd-rev-div-promoted",
              title: "Items you're promoting",
              blurb: "Edit ad &amp; mod details below. Use the <em>More</em> button on any row for the full ad / tag form.",
              count: promoted.length,
              controls: sortControls
            })}
            ${promoted.map((r) => renderReviewRow(r, fmtK, fmtUnits)).join("")}
            ${section1TotalsRow}
          </tbody>
          ${skipped.length ? `
          <tbody class="pd-section-body pd-section-body-skipped">
            ${dividerRow({
              klass: "pd-rev-div-skipped",
              title: "Items you decided not to promote",
              blurb: "The recommendation existed; the planner stepped past it. Metrics use the <strong>no-promo baseline</strong>.",
              count: skipped.length
            })}
            ${skipped.map((r) => renderBaselineRow(r, baseline, "decided")).join("")}
            ${baselineTotalsRow(skipped, "Section total")}
          </tbody>` : ""}
          ${unavailable.length ? `
          <tbody class="pd-section-body pd-section-body-unavailable">
            ${dividerRow({
              klass: "pd-rev-div-unavailable",
              title: "Items with no promotion available",
              blurb: "No live offer in the selected price area &mdash; metrics use the <strong>no-promo baseline</strong>.",
              count: unavailable.length
            })}
            ${unavailable.map((r) => renderBaselineRow(r, baseline, "unavailable")).join("")}
            ${baselineTotalsRow(unavailable, "Section total")}
          </tbody>` : ""}
        </table>
      </div>
    `;
  }

  // Per-NCRC variation so rows derived from the same no-promo baseline
  // don't render as identical clones. Deterministic from the NCRC string.
  function baselineVariationFor(item) {
    const hash = (item.ncrc || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    return 0.82 + ((hash % 36) / 100); // 0.82 .. 1.17
  }

  function baselineMetricsFor(item, baseline) {
    if (!baseline) return null;
    const v = baselineVariationFor(item);
    return {
      sales: (baseline.forecastSales || 0) * v,
      units: (baseline.forecastUnits || 0) * v,
      agp:   (baseline.forecastAgp   || 0) * v,
      aiv:   baseline.regPrice || 0,
      vlc:   baseline.netCost || (baseline.regPrice || 0) * 0.45
    };
  }

  function baselineSectionTotals(rows, baseline) {
    return rows.reduce((acc, r) => {
      const m = baselineMetricsFor(r.item, baseline);
      if (!m) return acc;
      acc.sales += m.sales;
      acc.units += m.units;
      acc.agp   += m.agp;
      return acc;
    }, { sales: 0, units: 0, agp: 0 });
  }

  // Shared renderer for the two non-promoted sections. Keeps the same
  // 20-column layout as Section 1 so the eye can track Sales / Units /
  // AGP straight down the page; cells that don't apply show a shaded
  // read-only dash. No More button (only Section 1 is editable).
  function renderBaselineRow(r, baseline, mode) {
    const m = baselineMetricsFor(r.item, baseline);
    const dash = `<span class="pd-rev-na">&mdash;</span>`;
    const fmt = (n) => `${n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`}`;
    const fmtU = (n) => n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n.toFixed(0)}`;
    const pill = mode === "decided"
      ? `<span class="pd-rev-pill pd-rev-pill-skip">Skipped</span>`
      : `<span class="pd-rev-pill pd-rev-pill-warn">No live offer</span>`;
    const rowKlass = mode === "decided" ? "pd-review-row-skipped" : "pd-review-row-unavailable";
    return `
      <tr class="pd-review-row ${rowKlass}">
        <td class="pd-rev-priced">${pill}</td>
        <td>${escapeHtml(r.item.vendor)}</td>
        <td>${escapeHtml(r.item.ncrc)}</td>
        <td>${escapeHtml(r.item.item || "")} <em>${escapeHtml(r.item.packSize || "")}</em></td>
        <td class="c">N</td>
        <td class="pd-rev-na-cell">${dash}</td>
        <td class="c">N</td>
        <td class="pd-rev-na-cell">${dash}</td>
        <td class="r">${m ? 245 : dash}</td>
        <td class="c">N</td>
        <td><div class="pd-review-stack"><span>No promo</span><small>${mode === "decided" ? "Planner stepped past" : "No live offer"}</small></div></td>
        <td class="pd-rev-na-cell">${dash}</td>
        <td class="r">${m ? `$${m.vlc.toFixed(2)}` : dash}</td>
        <td class="r">${m ? fmt(m.sales) : dash}</td>
        <td class="r">${m ? fmtU(m.units) : dash}</td>
        <td class="r">${m ? fmt(m.agp) : dash}</td>
        <td class="r">${m ? `$${m.aiv.toFixed(2)}` : dash}</td>
        <td class="pd-rev-na-cell">${dash}</td>
        <td class="pd-rev-na-cell">${dash}</td>
        <td class="pd-rev-na-cell c">${dash}</td>
      </tr>
    `;
  }

  // Lightweight summary card at the TOP of the review screen — Sales /
  // Units / AGP across every section so the planner sees the whole-
  // plan number in one place, not just the promoted slice.
  function renderReviewGrandTotal(totalsByKey, fmtK, fmtUnits) {
    const s1 = totalsByKey.section1 || { sales: 0, units: 0, agp: 0 };
    const s2 = totalsByKey.section2 || { sales: 0, units: 0, agp: 0 };
    const s3 = totalsByKey.section3 || { sales: 0, units: 0, agp: 0 };
    const total = {
      sales: s1.sales + s2.sales + s3.sales,
      units: s1.units + s2.units + s3.units,
      agp:   s1.agp   + s2.agp   + s3.agp
    };
    return `
      <section class="pd-review-grand">
        <div class="pd-review-grand-head">
          <span class="pd-eyebrow">Plan summary &middot; all sections</span>
          <p>Every promoted, skipped and no-offer NCRC rolled up so you can sanity-check the plan before publishing.</p>
        </div>
        <div class="pd-review-grand-grid">
          <article class="pd-grand-metric">
            <span class="pd-grand-label">Sales</span>
            <strong class="pd-grand-value">${fmtK(total.sales)}</strong>
            <div class="pd-grand-split">
              <span><em>Promoted</em> ${fmtK(s1.sales)}</span>
              <span><em>Skipped</em> ${fmtK(s2.sales)}</span>
              <span><em>No offer</em> ${fmtK(s3.sales)}</span>
            </div>
          </article>
          <article class="pd-grand-metric">
            <span class="pd-grand-label">Units</span>
            <strong class="pd-grand-value">${fmtUnits(total.units)}</strong>
            <div class="pd-grand-split">
              <span><em>Promoted</em> ${fmtUnits(s1.units)}</span>
              <span><em>Skipped</em> ${fmtUnits(s2.units)}</span>
              <span><em>No offer</em> ${fmtUnits(s3.units)}</span>
            </div>
          </article>
          <article class="pd-grand-metric">
            <span class="pd-grand-label">AGP $</span>
            <strong class="pd-grand-value">${fmtK(total.agp)}</strong>
            <div class="pd-grand-split">
              <span><em>Promoted</em> ${fmtK(s1.agp)}</span>
              <span><em>Skipped</em> ${fmtK(s2.agp)}</span>
              <span><em>No offer</em> ${fmtK(s3.agp)}</span>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  // Totals row with LY net deltas under each metric so the user sees
  // not just the absolute total but how it compares to last year, in
  // the same "value / delta" shape the body rows use.
  function renderTotalsRow(totals, priced, fmtK, fmtUnits) {
    const dlt = (cur, base) => {
      const d = cur - base;
      const pct = base ? (d / base) * 100 : 0;
      return { d, pct, klass: d >= 0 ? "positive" : "negative" };
    };
    const dSales = dlt(totals.sales, totals.lySales);
    const dUnits = dlt(totals.units, totals.lyUnits);
    const dAgp   = dlt(totals.agp, totals.lyAgp);
    const dAllow = dlt(totals.allowance, totals.lyAllow);
    const dPromoGp = dlt(totals.promoGp, totals.lyPromoGp);
    const cell = (val, d, fmtFn) => `
      <td class="r">
        <strong>${val}</strong>
        <div class="pd-review-sub ${d.klass}">${d.d >= 0 ? "+" : ""}${fmtFn(d.d)} <span>/</span> ${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}% vs LY</div>
      </td>
    `;
    return `
      <tr class="pd-review-totals">
        <td colspan="12"><strong>Totals across ${priced} priced ${priced === 1 ? "item" : "items"}</strong></td>
        <td class="r">&mdash;</td>
        ${cell(fmtK(totals.sales), dSales, fmtK)}
        ${cell(fmtUnits(totals.units), dUnits, fmtUnits)}
        ${cell(fmtK(totals.agp), dAgp, fmtK)}
        <td class="r">&mdash;</td>
        ${cell(fmtK(totals.allowance), dAllow, fmtK)}
        ${cell(fmtK(totals.promoGp), dPromoGp, fmtK)}
        <td class="c pd-rev-more-col"></td>
      </tr>
    `;
  }

  function renderReviewRow(r, fmtK, fmtUnits) {
    const { item, inCart, offer } = r;
    const priced = inCart && !!offer;
    const yn = (b) => b ? "Y" : "N";
    if (!priced) {
      // Should not happen now that Section 1 is filtered to priced
      // rows, but keep the fallback so we don't crash on stray callers.
      return `
        <tr class="pd-review-row pd-review-row-skipped">
          <td class="pd-rev-priced"><span class="pd-rev-pill pd-rev-pill-skip">Skipped</span></td>
          <td>${escapeHtml(item.vendor)}</td>
          <td>${escapeHtml(String(item.ncrc).replace(/^NCRC\s+/i, ""))}</td>
          <td>${escapeHtml(item.item || "")} <em>${escapeHtml(item.packSize || "")}</em></td>
          <td colspan="16" class="pd-review-skip-msg">No promo selected for this NCRC.</td>
        </tr>
      `;
    }
    const inCircular = !!offer.hasAd;
    const inDisplay  = !!offer.hasDisplay;
    // Persist user edits in cartEntry so they survive re-render.
    const adPageKey  = `${item.ncrc}|${item.priceArea}`;
    const adPage     = (promoDetailState.reviewEdits && promoDetailState.reviewEdits.adPage && promoDetailState.reviewEdits.adPage[adPageKey]) || "";
    const displayText = (promoDetailState.reviewEdits && promoDetailState.reviewEdits.displayText && promoDetailState.reviewEdits.displayText[adPageKey]) || "";
    const storeCount = 245;
    const hasFunding = (offer.vendorFunding || 0) > 0;
    const vlc = offer.netCost || 0;
    const sales = offer.forecastSales || 0;
    const units = offer.forecastUnits || 0;
    const agp = offer.forecastAgp || 0;
    const aiv = offer.promoStorePrice || 0;
    const allowance = (offer.vendorFunding || 0) * units;
    const promoGp = agp + allowance;
    const lySales = sales / (1 + (offer.salesDeltaPct || 0) / 100);
    const lyUnits = units / (1 + (offer.unitDeltaPct  || 0) / 100);
    const lyAgp   = agp   / (1 + (offer.agpDeltaPct   || 0) / 100);
    const lyAllow = allowance * 0.92;
    const lyPromoGp = lyAgp + lyAllow;
    const dlt = (cur, base) => {
      const d = cur - base;
      const pct = base ? (d / base) * 100 : 0;
      return { d, pct, klass: d >= 0 ? "positive" : "negative" };
    };
    const dSales = dlt(sales, lySales);
    const dUnits = dlt(units, lyUnits);
    const dAgp   = dlt(agp, lyAgp);
    const dPromoGp = dlt(promoGp, lyPromoGp);
    const cell = (val, d, fmtFn) => `
      <td class="r">
        <strong>${val}</strong>
        <div class="pd-review-sub ${d.klass}">${d.d >= 0 ? "+" : ""}${fmtFn(d.d)} <span>/</span> ${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(1)}%</div>
      </td>
    `;
    // Stacked cell: name on top + discount type below in muted text,
    // mirroring the recommendations table.
    const storeStack = `
      <div class="pd-review-stack">
        <span>${escapeHtml((offer.storeTactic && offer.storeTactic.name) || "")}</span>
        <small>${escapeHtml(discountTypeLabel(offer))}</small>
      </div>
    `;
    const digitalStack = offer.digitalTactic
      ? `
        <div class="pd-review-stack">
          <span>${escapeHtml(offer.digitalTactic)}</span>
          <small>$${(offer.promoDigitalPrice || 0).toFixed(2)}</small>
        </div>
      `
      : `<span class="pd-faint">No digital</span>`;
    const expandKey = adPageKey;
    const expanded = !!(promoDetailState.reviewExpanded && promoDetailState.reviewExpanded[expandKey]);
    return `
      <tr class="pd-review-row pd-review-row-priced">
        <td class="pd-rev-priced">
          <span class="pd-rev-pill pd-rev-pill-priced">Priced</span>
          ${offer.isCustom ? `<span class="pd-rev-pill pd-rev-pill-custom">Custom</span>` : ""}
        </td>
        <td>${escapeHtml(item.vendor)}</td>
        <td>${escapeHtml(item.ncrc)}</td>
        <td>${escapeHtml(item.item || "")} <em>${escapeHtml(item.packSize || "")}</em></td>
        <td class="c">${yn(inCircular)}</td>
        <td>${inCircular
          ? `<input type="text" class="pd-rev-input" maxlength="6" placeholder="PG-#" value="${escapeAttr(adPage)}" data-pd-review-field="adPage" data-pd-review-key="${escapeAttr(adPageKey)}" />`
          : `<span class="pd-faint">&mdash;</span>`}</td>
        <td class="c">${yn(inDisplay)}</td>
        <td>${inDisplay
          ? `<input type="text" class="pd-rev-input pd-rev-input-wide" maxlength="10" placeholder="Endcap" value="${escapeAttr(displayText)}" data-pd-review-field="displayText" data-pd-review-key="${escapeAttr(adPageKey)}" />`
          : `<span class="pd-faint">&mdash;</span>`}</td>
        <td class="r">${storeCount}</td>
        <td class="c">${yn(hasFunding)}</td>
        <td>${storeStack}</td>
        <td>${digitalStack}</td>
        <td class="r">$${vlc.toFixed(2)}</td>
        ${cell(fmtK(sales), dSales, fmtK)}
        ${cell(fmtUnits(units), dUnits, fmtUnits)}
        ${cell(fmtK(agp), dAgp, fmtK)}
        <td class="r">$${aiv.toFixed(2)}</td>
        <td class="r"><strong>${fmtK(allowance)}</strong></td>
        ${cell(fmtK(promoGp), dPromoGp, fmtK)}
        <td class="c pd-rev-more-col">
          <button type="button" class="pd-pa-toggle-btn pd-rev-more-btn ${expanded ? "is-open" : ""}" data-pd-review-expand="${escapeAttr(expandKey)}" aria-expanded="${expanded}" title="${expanded ? "Hide" : "Edit"} ad &amp; tag details">
            <span>${expanded ? "Hide" : "More"}</span>
            <span class="pd-pa-toggle-arrow">&#9662;</span>
          </button>
        </td>
      </tr>
      ${expanded ? renderReviewExpandedRow(expandKey, item) : ""}
    `;
  }

  // Slimmer review table for the manual flow: only the promoting section,
  // no forecast/allowance columns. Ad/tag "More" opens the same default +
  // per-price-area exceptions form used in the system flow.
  function renderManualReviewTable(promoted) {
    return `
      <div class="pd-review-table-wrap">
        <table class="pd-review-table pd-review-table-manual">
          <thead>
            <tr>
              <th class="pd-rev-priced">Priced</th>
              <th class="l">Vendor</th>
              <th class="l">NCRC</th>
              <th class="l">NCRC description</th>
              <th class="c">In circ.</th>
              <th class="l">Ad page</th>
              <th class="c">In disp.</th>
              <th class="l">Display</th>
              <th class="r">Stores</th>
              <th class="l">Store tactic</th>
              <th class="l">Digital tactic</th>
              <th class="r">VLC</th>
              <th class="c pd-rev-more-col"></th>
            </tr>
          </thead>
          <tbody class="pd-section-body pd-section-body-promoted">
            <tr class="pd-review-section-divider pd-rev-div-promoted">
              <td colspan="13">
                <div class="pd-rev-div-row"><div class="pd-rev-div-text">
                  <strong>Items you're promoting</strong>
                  <span class="pd-rev-div-count">${promoted.length}</span>
                  <small>Set the store &amp; digital tactic per row. Use <em>More</em> for ad / tag details.</small>
                </div></div>
              </td>
            </tr>
            ${promoted.map(renderManualReviewRow).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderManualReviewRow(r) {
    const { item, offer } = r;
    if (!offer) return "";
    const yn = (b) => b ? "Y" : "N";
    const inCircular = !!offer.hasAd;
    const inDisplay = !!offer.hasDisplay;
    const adPageKey = `${item.ncrc}|${item.priceArea}`;
    const adPage = (promoDetailState.reviewEdits.adPage && promoDetailState.reviewEdits.adPage[adPageKey]) || "";
    const displayText = (promoDetailState.reviewEdits.displayText && promoDetailState.reviewEdits.displayText[adPageKey]) || "";
    const vlc = offer.netCost || 0;
    // Toggle key is per-row (NCRC|PA) so only the clicked row expands, but
    // the ad/tag form inside is keyed by NCRC (copy is per NCRC).
    const expandKey = `${item.ncrc}|${item.priceArea}`;
    const expanded = !!(promoDetailState.reviewExpanded && promoDetailState.reviewExpanded[expandKey]);
    const storeStack = `<div class="pd-review-stack"><span>${escapeHtml((offer.storeTactic && offer.storeTactic.name) || "")}</span><small>${escapeHtml(discountTypeLabel(offer))}</small></div>`;
    const digitalStack = offer.digitalTactic
      ? `<div class="pd-review-stack"><span>${escapeHtml(offer.digitalTactic)}</span><small>$${(offer.promoDigitalPrice || 0).toFixed(2)}</small></div>`
      : `<span class="pd-faint">No digital</span>`;
    return `
      <tr class="pd-review-row pd-review-row-priced">
        <td class="pd-rev-priced"><span class="pd-rev-pill pd-rev-pill-priced">Priced</span>${offer.isCustom ? `<span class="pd-rev-pill pd-rev-pill-custom">Custom</span>` : ""}</td>
        <td>${escapeHtml(item.vendor)}</td>
        <td>${escapeHtml(item.ncrc)}</td>
        <td>${escapeHtml(item.item || "")} <em>${escapeHtml(item.packSize || "")}</em></td>
        <td class="c">${yn(inCircular)}</td>
        <td>${inCircular ? `<input type="text" class="pd-rev-input" maxlength="6" placeholder="PG-#" value="${escapeAttr(adPage)}" data-pd-review-field="adPage" data-pd-review-key="${escapeAttr(adPageKey)}" />` : `<span class="pd-faint">&mdash;</span>`}</td>
        <td class="c">${yn(inDisplay)}</td>
        <td>${inDisplay ? `<input type="text" class="pd-rev-input pd-rev-input-wide" maxlength="10" placeholder="Endcap" value="${escapeAttr(displayText)}" data-pd-review-field="displayText" data-pd-review-key="${escapeAttr(adPageKey)}" />` : `<span class="pd-faint">&mdash;</span>`}</td>
        <td class="r">245</td>
        <td>${storeStack}</td>
        <td>${digitalStack}</td>
        <td class="r">$${vlc.toFixed(2)}</td>
        <td class="c pd-rev-more-col">
          <button type="button" class="pd-pa-toggle-btn pd-rev-more-btn ${expanded ? "is-open" : ""}" data-pd-review-expand="${escapeAttr(expandKey)}" aria-expanded="${expanded}">
            <span>${expanded ? "Hide" : "More"}</span><span class="pd-pa-toggle-arrow">&#9662;</span>
          </button>
        </td>
      </tr>
      ${expanded ? renderReviewExpandedRow(expandKey, item, 13) : ""}
    `;
  }

  // Ad/tag "More details": one default set of copy applied to every price
  // area, plus an optional list of per-price-area exceptions the planner
  // adds only where a store group genuinely differs. Same pattern used in
  // both the system and manual review flows.
  function renderReviewExpandedRow(key, item, colspan) {
    colspan = colspan || 20;
    const ncrc = item.ncrc;
    const allPas = (promoDetailState.data && promoDetailState.data.offersByPriceArea || []).map((p) => p.priceArea);
    const exceptions = (promoDetailState.reviewEdits.adExceptions && promoDetailState.reviewEdits.adExceptions[ncrc]) || [];
    const adBugOptions = [
      "None", "1x rewards", "2x rewards", "3x rewards", "4x rewards",
      "5x rewards", "6x rewards", "Limit 2", "Limit 4", "Limit 6"
    ];
    const dad = (promoDetailState.reviewEdits.adDefaults && promoDetailState.reviewEdits.adDefaults[ncrc]) || {};
    const dtag = (promoDetailState.reviewEdits.tagDefaults && promoDetailState.reviewEdits.tagDefaults[ncrc]) || {};
    // Default fields are keyed by NCRC (adDefaults / tagDefaults).
    const af = (field, label, placeholder = "", maxlength = "") => `
      <label class="pd-rev-field">
        <span>${escapeHtml(label)}</span>
        <input type="text" ${maxlength ? `maxlength="${maxlength}"` : ""} placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(dad[field] || "")}"
               data-pd-review-section="adDefaults" data-pd-review-field="${field}" data-pd-review-key="${escapeAttr(ncrc)}" />
      </label>
    `;
    const at = (field, label, placeholder = "") => `
      <label class="pd-rev-field">
        <span>${escapeHtml(label)}</span>
        <input type="text" maxlength="8" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(dtag[field] || "")}"
               data-pd-review-section="tagDefaults" data-pd-review-field="${field}" data-pd-review-key="${escapeAttr(ncrc)}" />
      </label>
    `;
    return `
      <tr class="pd-review-row-expanded">
        <td colspan="${colspan}">
          <div class="pd-rev-detail-bar">
            <span class="pd-rev-detail-eyebrow">More details</span>
            <span class="pd-rev-detail-context">${escapeHtml(ncrc)} &middot; ${escapeHtml(item.vendor || "")}</span>
          </div>
          <div class="pd-rev-scope">
            <span class="pd-rev-scope-t"><span class="pd-md-badge">DEFAULT</span> Ad &amp; tag details</span>
            <span class="pd-rev-scope-applies">Applies to <b>all ${allPas.length} price area${allPas.length === 1 ? "" : "s"}</b> unless overridden below</span>
          </div>
          <div class="pd-rev-2tables">
            <div class="pd-rev-table1">
              <div class="pd-rev-adtag">
                <section class="pd-rev-detail-card">
                  <header><strong>Ad details</strong></header>
                  <div class="pd-rev-detail-fields">
                    ${af("headline", "Headline", "Cool down with...", "40")}
                    ${af("bodyCopy", "Body copy", "Short marketing line", "60")}
                    ${af("imageUpc", "Image UPC", "049000028911", "20")}
                    ${af("adInstructions", "Ad instructions", "Reverse type, blue chip", "40")}
                    ${af("pricingComments", "Pricing comments", "BOGO restriction on size", "40")}
                    <label class="pd-rev-field">
                      <span>Ad bug</span>
                      <select data-pd-review-section="adDefaults" data-pd-review-field="adBug" data-pd-review-key="${escapeAttr(ncrc)}">
                        ${adBugOptions.map((opt) => `<option value="${escapeAttr(opt)}" ${dad.adBug === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`).join("")}
                      </select>
                    </label>
                    ${af("couponPlu", "Coupon PLU", "70432", "8")}
                  </div>
                </section>
                <section class="pd-rev-detail-card pd-rev-detail-card-tags">
                  <header><strong>Tag details</strong></header>
                  <div class="pd-rev-detail-fields pd-rev-detail-fields-tags">
                    ${at("bib", "BIB", "EC15")}
                    ${at("sign", "SIGN", "SC15")}
                    ${at("talker", "Talker", "1")}
                    ${at("molding", "Molding", "0")}
                  </div>
                </section>
              </div>
              ${renderReviewPaList(ncrc, allPas, exceptions)}
            </div>
            <div class="pd-rev-table2">
              <div class="pd-tagprev-head"><strong>Tag &amp; digital preview</strong><span class="pd-soon-badge">Coming soon</span></div>
              ${renderShelfFigure()}
              ${renderDigitalFigure(dad)}
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  // Physical shelf tag preview (row 1 of the preview column) — placeholder.
  function renderShelfFigure() {
    return `
      <figure class="pd-tagprev-card pd-tagprev-shelf">
        <div class="pd-tagprev-canvas pd-shelf">
          <div class="pd-shelf-member">Member Price!</div>
          <div class="pd-shelf-rule"></div>
          <div class="pd-shelf-prices">
            <div class="pd-shelf-p"><b>3<sup>99</sup></b><em>ea</em></div>
            <div class="pd-shelf-bar"></div>
            <div class="pd-shelf-p"><b>3<sup>49</sup></b><em>ea</em><span class="pd-shelf-mm">Mix &amp; Match<br>Limit 4</span></div>
          </div>
          <div class="pd-shelf-save">SAVE $1.50</div>
          <div class="pd-shelf-foot"><span>$5.32<br><i>PER QUART</i></span><span class="pd-shelf-thru">Thru Tue Oct 22</span><span>$4.66<br><i>PER QUART</i></span></div>
        </div>
        <span class="pd-tagprev-overlay">Coming soon</span>
      </figure>
    `;
  }

  // Digital coupon preview (row 2 of the preview column) — placeholder.
  function renderDigitalFigure(dad) {
    const name = (dad && dad.headline) || "Signature SELECT";
    const plu = (dad && dad.couponPlu) || "70432";
    return `
      <figure class="pd-tagprev-card pd-tagprev-digital">
        <div class="pd-tagprev-canvas pd-digital">
          <div class="pd-digital-top"><span class="pd-digital-foru">for U</span><b class="pd-digital-price">$3.49</b><span class="pd-digital-each">Each</span></div>
          <div class="pd-digital-instore">In-store: $4.99</div>
          <div class="pd-digital-name">${escapeHtml(name)} 12-12FZ</div>
          <a class="pd-digital-offer">Offer Details</a>
          <div class="pd-digital-row">
            <button type="button" class="pd-digital-clip">Clip Coupon</button>
            <span class="pd-digital-exp">Unlimited use<br>Expires soon</span>
          </div>
          <div class="pd-digital-plu">PLU ${escapeHtml(plu)}</div>
        </div>
        <span class="pd-tagprev-overlay">Coming soon</span>
      </figure>
    `;
  }

  // Per-price-area ad/tag list: every PA shows as a row that either
  // inherits the default or is overridden with its own copy edited inline
  // — the same default+exceptions model as the tactic builder, no dropdown.
  function renderReviewPaList(ncrc, allPas, exceptions) {
    if (!allPas.length) return "";
    const adBugOptions = [
      "None", "1x rewards", "2x rewards", "3x rewards", "4x rewards",
      "5x rewards", "6x rewards", "Limit 2", "Limit 4", "Limit 6"
    ];
    const exField = (pa, section, field, label, placeholder, maxlength) => {
      const key = `${ncrc}|${pa}`;
      const store = (promoDetailState.reviewEdits[section] && promoDetailState.reviewEdits[section][key]) || {};
      return `
        <label class="pd-rev-field">
          <span>${escapeHtml(label)}</span>
          <input type="text" ${maxlength ? `maxlength="${maxlength}"` : ""} placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(store[field] || "")}"
                 data-pd-review-section="${section}" data-pd-review-field="${field}" data-pd-review-key="${escapeAttr(key)}" />
        </label>
      `;
    };
    const exAdBug = (pa) => {
      const key = `${ncrc}|${pa}`;
      const store = (promoDetailState.reviewEdits.adDetails && promoDetailState.reviewEdits.adDetails[key]) || {};
      return `
        <label class="pd-rev-field">
          <span>Ad bug</span>
          <select data-pd-review-section="adDetails" data-pd-review-field="adBug" data-pd-review-key="${escapeAttr(key)}">
            ${adBugOptions.map((opt) => `<option value="${escapeAttr(opt)}" ${store.adBug === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`).join("")}
          </select>
        </label>
      `;
    };
    return `
      <div class="pd-rev-pa-list">
        <div class="pd-rev-pa-list-head">
          <strong>Price areas</strong>
          <span class="pd-rev-pa-list-sub">${exceptions.length} of ${allPas.length} overridden &middot; the rest inherit the default above</span>
        </div>
        ${allPas.map((pa) => {
          const isCustom = exceptions.includes(pa);
          return `
            <div class="pd-rev-pa-item ${isCustom ? "is-custom" : "is-inherit"}">
              <div class="pd-rev-pa-item-top">
                <span class="pd-rev-pa-name">${escapeHtml(pa)}</span>
                <span class="pd-status-badge ${isCustom ? "pd-status-custom" : "pd-status-inherit"}">${isCustom ? "Custom" : "Inherits default"}</span>
                <span class="pd-rev-pa-actions">
                  ${isCustom
                    ? `<a href="#" class="pd-override-link pd-override-link-clear" data-pd-adexc-remove="${escapeAttr(ncrc)}|${escapeAttr(pa)}">Reset to default</a>`
                    : `<a href="#" class="pd-override-link" data-pd-adexc-add="${escapeAttr(ncrc)}|${escapeAttr(pa)}">&#9998; Override</a>`}
                </span>
              </div>
              ${isCustom ? `
                <div class="pd-rev-pa-fields">
                  ${exField(pa, "adDetails", "headline", "Headline", "Cool down with...", "40")}
                  ${exField(pa, "adDetails", "bodyCopy", "Body copy", "Short marketing line", "60")}
                  ${exField(pa, "adDetails", "imageUpc", "Image UPC", "049000028911", "20")}
                  ${exField(pa, "adDetails", "adInstructions", "Ad instructions", "Reverse type", "40")}
                  ${exField(pa, "adDetails", "pricingComments", "Pricing comments", "BOGO on size", "40")}
                  ${exAdBug(pa)}
                  ${exField(pa, "adDetails", "couponPlu", "Coupon PLU", "70432", "8")}
                  ${exField(pa, "tagDetails", "bib", "BIB", "EC15", "8")}
                  ${exField(pa, "tagDetails", "sign", "SIGN", "SC15", "8")}
                  ${exField(pa, "tagDetails", "talker", "Talker", "1", "8")}
                  ${exField(pa, "tagDetails", "molding", "Molding", "0", "8")}
                </div>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderBaselinedScreen(result) {
    const published = result.published || [];
    const failed = result.failed || [];
    const total = published.length + failed.length;
    const hasFailures = failed.length > 0;
    return `
      <div class="pd-baselined">
        <div class="pd-baselined-icon ${hasFailures ? "warn" : "ok"}">${hasFailures ? "!" : "&#10003;"}</div>
        <h2 class="pd-baselined-title">${hasFailures ? "Partially baselined" : "Promotions baselined"}</h2>
        <p class="pd-baselined-sub">${hasFailures
          ? `${published.length} of ${total} selections were added to the baseline plan. ${failed.length} failed and remain in the cart for retry.`
          : `${published.length} ${published.length === 1 ? "selection has" : "selections have"} been added to the baseline plan. APP, WIMS, Apex, OMS &amp; SSIMS will pick up the change on the next publish.`}
        </p>
        <section class="pd-baselined-list">
          <header><strong>Baselined</strong><span>${published.length}</span></header>
          ${published.length === 0 ? `<p class="pd-baselined-empty">None published.</p>` : `
            <ul>${published.map((entry) => `
              <li>
                <span class="pd-baselined-ncrc">${escapeHtml(entry.ncrc)}</span>
                <span class="pd-baselined-desc">${escapeHtml(entry.description || "")} <em>${escapeHtml(entry.packSize || "")}</em></span>
                <span class="pd-baselined-context">${escapeHtml(entry.vendor)} &middot; ${escapeHtml(entry.priceArea)} &middot; W${entry.week}</span>
                <span class="pd-baselined-offer">${escapeHtml(entry.offerLabel)}</span>
              </li>
            `).join("")}</ul>`}
        </section>
        ${failed.length ? `
          <section class="pd-baselined-list failed">
            <header><strong>Failed</strong><span>${failed.length}</span></header>
            <ul>${failed.map(({ entry, error }) => `
              <li>
                <span class="pd-baselined-ncrc">${escapeHtml(entry.ncrc)}</span>
                <span class="pd-baselined-desc">${escapeHtml(entry.description || "")}</span>
                <span class="pd-baselined-context">${escapeHtml(entry.vendor)} &middot; ${escapeHtml(entry.priceArea)}</span>
                <span class="pd-baselined-offer error">${escapeHtml(error)}</span>
              </li>
            `).join("")}</ul>
          </section>
        ` : ""}
        <footer class="pd-baselined-footer">
          <button type="button" class="pd-btn-primary" data-pd-action="dismiss-baselined">Done</button>
        </footer>
      </div>
    `;
  }

  function renderPdHeader(data, options) {
    const item = data && data.item;
    const category = planState.category || "Carbonated Soft Drinks";
    // velocityKind is the optimisation objective the launching page sent
    // through ("sales" or "agp"). Surface it next to the category so the
    // planner reads the screen as "optimising <category> for <metric>".
    const objectiveLabel = promoDetailState.velocityKind === "agp" ? "AGP velocity"
      : promoDetailState.velocityKind === "units" ? "Units velocity"
      : "Sales velocity";
    return `
      <header class="pd-header">
        <div class="pd-header-top">
          <div class="pd-title-block">
            <span class="pd-eyebrow">PROMOTION PLANNING</span>
            <h2 id="promoDetailTitle">
              ${escapeHtml(category)}
              <span class="pd-objective-chip" title="Objective passed in from the 52-week plan">
                Optimising for <strong>${escapeHtml(objectiveLabel)}</strong>
              </span>
            </h2>
          </div>
          ${item && promoDetailState.planMode !== "manual" ? renderPdHeaderForecast(data) : ""}
        </div>
        ${renderPlanModeToggle()}
        <div class="pd-header-row pd-header-row-filters">
          <div class="pd-header-filters-left">
            ${renderPdSelectors(options)}
          </div>
          ${promoDetailState.planMode === "manual" ? "" : renderVelocityScopeBar()}
        </div>
      </header>
    `;
  }

  // Primary flow switch: system-scored recommendations vs. a manual
  // build-your-own promo. Manual hides the cost ladder + promo history
  // and swaps the recommendations table for the default-tactic builder.
  function renderPlanModeToggle() {
    const manual = promoDetailState.planMode === "manual";
    return `
      <div class="pd-header-row pd-planmode-row">
        <div class="pd-planmode" role="group" aria-label="Planning flow">
          <button type="button" class="${manual ? "" : "active"}" data-pd-plan-mode="recommended">
            <i class="pd-planmode-dot"></i> System recommended
          </button>
          <button type="button" class="${manual ? "active" : ""}" data-pd-plan-mode="manual">
            <i class="pd-planmode-dot"></i> Manual override
          </button>
        </div>
        <span class="pd-planmode-note">${manual
          ? "Manual mode &mdash; set one tactic across all price areas, override PAs as exceptions. Cost ladder &amp; promo history hidden; no guardrail scoring."
          : "System-scored recommendations, one per price area. Switch to manual to build your own promo."}</span>
      </div>
    `;
  }

  function renderPdHeaderForecast(data) {
    const grid = data && data.forecastSummary && data.forecastSummary.grid;
    if (!grid) return "";
    const fmtD = (n) => {
      if (n == null) return "-";
      const v = Number(n);
      if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
      if (Math.abs(v) >= 1e3) return `${v < 0 ? "-" : ""}$${Math.abs(v / 1e3).toFixed(0)}K`;
      return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(0)}`;
    };
    const fmtU = (n) => {
      if (n == null) return "-";
      const v = Number(n);
      if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
      if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
      return `${v.toFixed(0)}`;
    };
    const fmtPct = (n) => n == null ? "-" : `${Number(n).toFixed(1)}%`;
    const wp = grid.withPromo;
    const np = grid.noPromo;
    const ly = grid.ly;
    const netInter = grid.netInteractions.net;
    const m = grid.markdown;
    const wpNet = {
      sales: wp.sales + netInter.sales,
      units: wp.units + netInter.units,
      agp:   wp.agpDollar + netInter.agpDollar
    };
    function hfMetric(label, val, netVal, lyVal, npVal, kind) {
      const fmt = kind === "units" ? fmtU : fmtD;
      const vsLy = lyVal ? ((val - lyVal) / lyVal) * 100 : 0;
      const vsNp = npVal ? ((val - npVal) / npVal) * 100 : 0;
      return `
        <article class="pd-hf-metric">
          <header>
            <span class="pd-hf-label">${label}</span>
            <strong class="pd-hf-value">${fmt(val)}</strong>
          </header>
          <span class="pd-hf-net">Net of halo + cannib &middot; ${fmt(netVal)}</span>
          <div class="pd-hf-bench">
            <span class="pd-hf-bench-row">
              <em>vs LY</em>
              <span class="pd-hf-bench-val">${fmt(lyVal)}</span>
              <span class="pd-hf-bench-delta ${vsLy >= 0 ? "positive" : "negative"}">${vsLy >= 0 ? "+" : ""}${vsLy.toFixed(1)}%</span>
            </span>
            <span class="pd-hf-bench-row">
              <em>vs No promo</em>
              <span class="pd-hf-bench-val">${fmt(npVal)}</span>
              <span class="pd-hf-bench-delta ${vsNp >= 0 ? "positive" : "negative"}">${vsNp >= 0 ? "+" : ""}${vsNp.toFixed(1)}%</span>
            </span>
          </div>
        </article>
      `;
    }
    return `
      <div class="pd-header-forecast">
        ${hfMetric("Sales", wp.sales, wpNet.sales, ly.sales, np.sales, "money")}
        ${hfMetric("Units", wp.units, wpNet.units, ly.units, np.units, "units")}
        ${hfMetric("AGP",   wp.agpDollar, wpNet.agp, ly.agpDollar, np.agpDollar, "money")}
        <div class="pd-hf-roi">
          <span class="pd-hf-roi-label">Markdown ROI</span>
          <div class="pd-hf-roi-equation">
            <span class="pd-roi-chip negative">-${fmtD(m.markdownDollar)}</span>
            <span class="pd-roi-op">+</span>
            <span class="pd-roi-chip positive">+${fmtD(m.transactionAllowance)}</span>
            <span class="pd-roi-op">=</span>
            <span class="pd-roi-chip neutral">ROI ${fmtPct(m.roiPct)}</span>
          </div>
          <span class="pd-hf-roi-note">Net markdown -${fmtD(m.netMarkdown)}</span>
        </div>
      </div>
    `;
  }

  function renderVelocityScopeBar() {
    const counts = promoDetailState.binCounts || { sales: {}, agp: {} };
    const kindCounts = counts[promoDetailState.velocityKind] || {};
    const binShades = ["#1e3a8a", "#3b5fd2", "#6388eb", "#9bb5f5", "#cfdefe"];
    return `
      <div class="pd-scope-bar">
        <div class="pd-velocity-kind" role="group" aria-label="Velocity dimension">
          <span class="pd-scope-label">FOCUS BY</span>
          <div class="pd-segmented">
            <button type="button" class="${promoDetailState.velocityKind === "sales" ? "active" : ""}" data-pd-velocity-kind="sales">Sales velocity</button>
            <button type="button" class="${promoDetailState.velocityKind === "agp" ? "active" : ""}" data-pd-velocity-kind="agp">AGP velocity</button>
          </div>
        </div>
        <div class="pd-bin-chips" role="group" aria-label="Velocity bin">
          ${[1, 2, 3, 4, 5].map((bin) => `
            <button type="button" class="pd-bin-chip ${promoDetailState.bin === bin ? "active" : ""}" data-pd-bin="${bin}">
              <i class="pd-bin-dot" style="background:${binShades[bin - 1]}"></i>
              <span class="pd-bin-label">Bin ${bin}</span>
              <span class="pd-bin-count">${kindCounts[bin] != null ? kindCounts[bin] : "-"}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderPdSelectors(options) {
    // Price-area filter dropped — every PA already shows as its own row in
    // the recommendations table, so a top-level PA filter just duplicates
    // navigation the user already has.
    const allNcrcs = options.allNcrcs || options.ncrcs || [];
    // CIG is the identifier only in manual-override mode; system-recommended stays on NCRC.
    const idManual = promoDetailState.planMode === "manual";
    return `
      <div class="pd-selector-row" role="group" aria-label="Optional filters">
        ${renderTypeaheadField("vendor", "VENDOR", promoDetailState.vendorInput, options.vendors || [], (vendor) => ({ value: vendor, label: vendor }), { placeholder: "Search vendor..." })}
        ${renderTypeaheadField("ncrc", idManual ? "CIG" : "NCRC", promoDetailState.ncrcInput, allNcrcs, (row) => ({ value: row.ncrc, label: `${idManual ? cigForNcrc(row.ncrc) : row.ncrc} - ${row.item} ${row.packSize || ""}`.trim(), sub: row.packSize, matchText: `${cigForNcrc(row.ncrc)} ${row.ncrc} ${row.item} ${row.packSize || ""} ${row.vendor || ""}` }), { placeholder: idManual ? "Search CIG..." : "Search NCRC..." })}
      </div>
    `;
  }

  function renderPdShell(data) {
    const hasItem = data && data.item;
    const worklist = promoDetailState.worklist || [];
    const offer = hasItem ? selectedPromoOffer() : null;
    // The cost-ladder side panel (and its mobile trigger/overlay) only
    // belong to the system-recommended flow — manual override hides them.
    const showSide = promoDetailState.planMode !== "manual";
    return `
      <div class="pd-shell">
        ${renderWorklistRail()}
        <div class="pd-shell-main">
          ${hasItem ? renderPdBody(data) : worklist.length ? `<div class="pd-detail-loader"><span></span>Loading NCRC detail...</div>` : renderPdEmptyState()}
        </div>
      </div>
      ${showSide && hasItem && offer ? `
        <button type="button" class="pd-side-trigger" data-pd-action="open-side" aria-label="Open selected offer details">
          <span class="pd-side-trigger-eyebrow">SELECTED OFFER</span>
          <span class="pd-side-trigger-label">${escapeHtml(offer.label)}</span>
          <span class="pd-side-trigger-arrow">&lsaquo;</span>
        </button>
      ` : ""}
      ${showSide && hasItem && promoDetailState.sidePanelOpen ? `
        <div class="pd-side-overlay" data-pd-action="close-side">
          <aside class="pd-side-overlay-panel" data-pd-stop-propagation>
            <button type="button" class="pd-side-overlay-close" data-pd-action="close-side" aria-label="Close">&times;</button>
            ${renderRightPanel(data)}
          </aside>
        </div>
      ` : ""}
      ${hasItem ? renderPdActionFooter(data) : ""}
    `;
  }

  function renderWorklistRail() {
    const worklist = promoDetailState.worklist || [];
    const loading = promoDetailState.loadingWorklist;
    const idx = promoDetailState.worklistIndex;
    const total = worklist.length;
    const cart = promoDetailState.pendingCart || [];
    const week = (promoDetailState.context && promoDetailState.context.weeks && promoDetailState.context.weeks[0]) || (promoDetailState.data && promoDetailState.data.item && promoDetailState.data.item.week) || "";
    const submittedCount = worklist.filter((item) => {
      const key = `${item.vendor}|${item.priceArea}|${item.ncrc}|W${week}`;
      return cart.some((entry) => entry.key === key);
    }).length;
    const pctFull = total === 0 ? 0 : Math.round((submittedCount / total) * 100);
    // Search filter + group by vendor so 274 NCRCs stay navigable without
    // pagination — jump via search, orient via sticky vendor headers.
    const q = (promoDetailState.worklistSearch || "").trim().toLowerCase();
    const filtered = worklist.map((item, index) => ({ item, index }))
      .filter(({ item }) => !q || `${cigForNcrc(item.ncrc)} ${item.ncrc} ${item.item} ${item.vendor}`.toLowerCase().indexOf(q) >= 0);
    const groupOrder = [];
    const byVendor = {};
    filtered.forEach((e) => { const v = e.item.vendor || "—"; if (!byVendor[v]) { byVendor[v] = []; groupOrder.push(v); } byVendor[v].push(e); });
    const scopeSub = promoDetailState.planMode === "manual"
      ? `All CIGs${promoDetailState.vendor ? ` &middot; ${escapeHtml(promoDetailState.vendor)}` : ""}`
      : `${escapeHtml(promoDetailState.velocityKind === "sales" ? "Sales" : "AGP")} velocity, Bin ${promoDetailState.bin}${promoDetailState.vendor ? ` &middot; ${escapeHtml(promoDetailState.vendor)}` : ""}`;
    return `
      <aside class="pd-worklist">
        <header class="pd-worklist-head">
          <strong>Worklist</strong>
          <span class="pd-worklist-progress">
            ${submittedCount} <small>of ${total} submitted</small>
          </span>
        </header>
        <div class="pd-worklist-progressbar" aria-label="Worklist progress: ${submittedCount} of ${total} submitted">
          <span style="width: ${pctFull}%"></span>
        </div>
        <p class="pd-worklist-sub">${scopeSub}</p>
        <div class="pd-worklist-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>
          <input type="text" placeholder="Search ${promoDetailState.planMode === "manual" ? "CIG" : "NCRC"}, item or vendor&hellip;" value="${escapeAttr(promoDetailState.worklistSearch || "")}" data-pd-worklist-search />
          ${q ? `<button type="button" class="pd-worklist-search-clear" data-pd-worklist-search-clear aria-label="Clear search">&times;</button>` : ""}
        </div>
        <div class="pd-worklist-viewport">
          <span class="pd-worklist-count" data-pd-worklist-count></span>
          <span class="pd-worklist-vp-arrows">
            <button type="button" class="pd-worklist-scroll-btn" data-pd-worklist-scroll="up" aria-label="Scroll up">&#9650;</button>
            <button type="button" class="pd-worklist-scroll-btn" data-pd-worklist-scroll="down" aria-label="Scroll down">&#9660;</button>
          </span>
        </div>
        <div class="pd-worklist-list" role="listbox">
          ${loading ? `<div class="pd-worklist-loading"><span></span>Loading worklist&hellip;</div>`
            : total === 0 ? `<div class="pd-worklist-empty">No NCRCs in this slice. Try a different bin or clear filters.</div>`
            : filtered.length === 0 ? `<div class="pd-worklist-empty">No matches for &ldquo;${escapeHtml(q)}&rdquo;.</div>`
            : groupOrder.map((v) => `
                <div class="pd-wl-group">
                  <div class="pd-wl-group-head">${escapeHtml(v)} <span>${byVendor[v].length}</span></div>
                  ${byVendor[v].map(({ item, index }) => renderWorklistItem(item, index, index === idx)).join("")}
                </div>
              `).join("")}
        </div>
        ${renderCartSummary()}
      </aside>
    `;
  }

  // Live "X–Y of N in view" indicator + arrow enable/disable for the
  // scrollbar-less worklist. Called after each render and on scroll.
  function updateWorklistViewport() {
    const list = document.querySelector(".pd-worklist-list");
    const label = document.querySelector("[data-pd-worklist-count]");
    if (!list || !label) return;
    const items = Array.prototype.slice.call(list.querySelectorAll(".pd-worklist-item"));
    const total = items.length;
    if (!total) { label.textContent = ""; return; }
    const lr = list.getBoundingClientRect();
    let first = -1, last = -1;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > lr.top + 6 && r.top < lr.bottom - 6) { if (first < 0) first = i; last = i; }
    });
    if (first < 0) { first = 0; last = 0; }
    label.innerHTML = `<strong>${first + 1}&ndash;${last + 1}</strong> of ${total} in view`;
    const up = document.querySelector('[data-pd-worklist-scroll="up"]');
    const down = document.querySelector('[data-pd-worklist-scroll="down"]');
    if (up) up.disabled = list.scrollTop <= 1;
    if (down) down.disabled = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
  }

  function setupWorklistScroll() {
    const list = document.querySelector(".pd-worklist-list");
    if (!list) return;
    // Idempotent property assignment — safe to call on every render.
    list.onscroll = updateWorklistViewport;
    ["up", "down"].forEach((dir) => {
      const btn = document.querySelector(`[data-pd-worklist-scroll="${dir}"]`);
      if (btn) btn.onclick = () => {
        const l = document.querySelector(".pd-worklist-list");
        if (!l) return;
        const step = Math.max(140, l.clientHeight * 0.85);
        l.scrollTop += (dir === "up" ? -step : step);
        updateWorklistViewport();
      };
    });
    updateWorklistViewport();
  }

  function renderCartSummary() {
    const cart = promoDetailState.pendingCart || [];
    if (!cart.length) {
      return `<div class="pd-cart-summary empty">Cart is empty. Add selections as you go; nothing publishes until you click Finalize.</div>`;
    }
    return `
      <div class="pd-cart-summary">
        <header><strong>Cart (${cart.length})</strong><span>not published yet</span></header>
        <ul>
          ${cart.slice(-6).reverse().map((entry) => `
            <li>
              <span class="pd-cart-ncrc">${escapeHtml(entry.ncrc)}</span>
              <span class="pd-cart-pa">${escapeHtml(entry.priceArea)}</span>
              <span class="pd-cart-offer">${escapeHtml(entry.offerLabel)}</span>
              <button type="button" class="pd-cart-remove" data-pd-action="remove-cart" data-cart-key="${escapeAttr(entry.key)}" aria-label="Remove from cart">&times;</button>
            </li>
          `).join("")}
          ${cart.length > 6 ? `<li class="pd-cart-more">+${cart.length - 6} more...</li>` : ""}
        </ul>
      </div>
    `;
  }

  function renderWorklistItem(item, index, isActive) {
    const week = (promoDetailState.context && promoDetailState.context.weeks && promoDetailState.context.weeks[0]) || (promoDetailState.data && promoDetailState.data.item && promoDetailState.data.item.week) || "";
    const key = `${item.vendor}|${item.priceArea}|${item.ncrc}|W${week}`;
    const inCart = (promoDetailState.pendingCart || []).some((entry) => entry.key === key);
    return `
      <button type="button" role="option" class="pd-worklist-item ${isActive ? "active" : ""} ${inCart ? "confirmed" : ""}" data-pd-worklist-index="${index}">
        <span class="pd-wl-status" aria-hidden="true">${inCart ? "&#10003;" : (index + 1)}</span>
        <span class="pd-wl-body">
          <span class="pd-wl-ncrc">${escapeHtml(promoDetailState.planMode === "manual" ? cigForNcrc(item.ncrc) : item.ncrc)}</span>
          <span class="pd-wl-name">${escapeHtml(item.item)} <em>${escapeHtml(item.packSize || "")}</em></span>
          <span class="pd-wl-rec">Rec: ${escapeHtml(item.recommendedOfferLabel || "-")}</span>
        </span>
        <span class="pd-wl-caret" aria-hidden="true"></span>
      </button>
    `;
  }

  function renderTypeaheadField(kind, labelText, currentValue, items, mapItem, opts = {}) {
    const disabled = !!opts.disabled;
    const wide = opts.wide ? "wide" : "";
    const placeholder = opts.placeholder || `Search ${labelText.toLowerCase()}…`;
    const filled = !!currentValue && !disabled;
    const isOpen = promoDetailState.openTypeahead === kind && !disabled;
    const normalized = (items || []).map(mapItem);
    const filter = (currentValue || "").trim().toLowerCase();
    const filtered = filter
      ? normalized.filter((item) => (item.matchText || item.label).toLowerCase().includes(filter))
      : normalized;
    return `
      <div class="pd-typeahead ${wide} ${filled ? "filled" : ""} ${disabled ? "disabled" : ""}" data-pd-typeahead="${kind}">
        <label>
          <span>${escapeHtml(labelText)}</span>
          <div class="pd-typeahead-control">
            <input type="text" value="${escapeAttr(currentValue || "")}" placeholder="${escapeAttr(placeholder)}" autocomplete="off" data-pd-typeahead-input="${kind}" ${disabled ? "disabled" : ""} />
            <button type="button" class="pd-typeahead-chev" data-pd-typeahead-toggle="${kind}" ${disabled ? "disabled" : ""} aria-label="Show ${escapeHtml(labelText)} options">&#9662;</button>
          </div>
        </label>
        ${isOpen ? `
          <div class="pd-typeahead-list" role="listbox">
            ${filtered.length === 0 ? `<div class="pd-typeahead-empty">No matches</div>` : filtered.slice(0, 60).map((item) => `
              <button type="button" role="option" class="pd-typeahead-option" data-pd-typeahead-pick="${kind}" data-value="${escapeAttr(item.value)}" data-label="${escapeAttr(item.label)}">
                ${highlightTypeaheadMatch(item.label, filter)}
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  function highlightTypeaheadMatch(label, filter) {
    if (!filter) return escapeHtml(label);
    const lower = label.toLowerCase();
    const idx = lower.indexOf(filter);
    if (idx < 0) return escapeHtml(label);
    return `${escapeHtml(label.slice(0, idx))}<mark>${escapeHtml(label.slice(idx, idx + filter.length))}</mark>${escapeHtml(label.slice(idx + filter.length))}`;
  }

  function renderPdEmptyState() {
    const vendor = promoDetailState.vendor;
    const priceArea = promoDetailState.priceArea;
    let next = "vendor";
    if (vendor && !priceArea) next = "price area";
    else if (vendor && priceArea) next = "NCRC";
    return `
      <div class="pd-empty-state">
        <div class="pd-empty-card">
          <div class="pd-empty-icon">i</div>
          <h3>Pick a ${next} above to continue</h3>
          <p>Start typing to filter; pick from the suggestions. Promotional candidates, cost economics, prior-week performance, and the NCRC balance grid load once an item is selected.</p>
          <ol class="pd-empty-steps">
            <li class="${vendor ? "done" : "active"}"><span>1</span> Vendor</li>
            <li class="${priceArea ? "done" : vendor ? "active" : ""}"><span>2</span> Price area</li>
            <li class="${promoDetailState.ncrc ? "done" : priceArea ? "active" : ""}"><span>3</span> NCRC (item)</li>
          </ol>
        </div>
      </div>
    `;
  }

  function renderPdBody(data) {
    // Manual override drops the cost-ladder rail and the promo-history
    // block, giving the builder the full width.
    const manual = promoDetailState.planMode === "manual";
    if (manual) {
      return `
        <div class="pd-layout pd-layout-manual">
          <div class="pd-main">
            ${renderOffersBlock(data)}
          </div>
        </div>
      `;
    }
    return `
      <div class="pd-layout">
        <div class="pd-main">
          ${renderOffersBlock(data)}
          ${renderWeeklyRunsBlock(data)}
        </div>
        <aside class="pd-side">
          ${renderRightPanel(data)}
        </aside>
      </div>
    `;
  }

  function renderPdActionFooter(data) {
    const offer = selectedPromoOffer();
    if (!offer || !data || !data.item) return "";
    const inCart = promoDetailState.pendingCart.some((entry) => entry.key === promoSelectionKey());
    const cartSize = promoDetailState.pendingCart.length;
    const finalizing = promoDetailState.finalizing;
    const worklist = promoDetailState.worklist || [];
    const worklistTotal = worklist.length;
    const worklistPos = promoDetailState.worklistIndex + 1;
    const hasMore = promoDetailState.worklistIndex < worklistTotal - 1;
    const skipDisabled = !hasMore;
    return `
      <footer class="pd-action-footer">
        <div class="pd-action-summary">
          <span class="pd-action-eyebrow">${inCart ? "IN CART" : "PENDING"}</span>
          <span class="pd-action-pick">
            <strong>${escapeHtml(offer.label)}</strong>
            <span class="pd-action-sub">${escapeHtml(offer.storeTactic.name)}${offer.digitalTactic ? ` / ${escapeHtml(offer.digitalTactic)}` : ""}</span>
          </span>
          <span class="pd-action-meta">
            for <strong>${escapeHtml(data.item.ncrc)}</strong> in <strong>${escapeHtml(data.item.priceArea)}</strong>, Week <strong>${data.item.week}</strong>
          </span>
          ${worklistTotal ? `<span class="pd-action-progress">${worklistPos} of ${worklistTotal} in this bin</span>` : ""}
        </div>
        <div class="pd-action-buttons">
          <button type="button" class="pd-btn-secondary" data-pd-action="cancel">Close</button>
          <button type="button" class="pd-btn-secondary" data-pd-action="skip" ${skipDisabled ? "disabled" : ""}>Skip &rarr;</button>
          ${hasMore ? `
            <button type="button" class="pd-btn-primary" data-pd-action="add-next">
              ${inCart ? "Update &amp; next &rarr;" : "Add &amp; next &rarr;"}
            </button>
          ` : `
            <button type="button" class="pd-btn-primary" data-pd-action="add">
              ${inCart ? "Update in cart" : "Add to cart"}
            </button>
          `}
          <button type="button" class="pd-btn-finalize" data-pd-action="finalize" ${cartSize === 0 || finalizing ? "disabled" : ""}>
            ${finalizing ? `<span class="pd-btn-spinner"></span>Publishing...` : `Review &amp; finalize${cartSize ? ` (${cartSize})` : ""}`}
          </button>
        </div>
      </footer>
    `;
  }

  function renderForecastBlock(data) {
    const grid = data.forecastSummary && data.forecastSummary.grid;
    if (!grid) {
      // Fall back to legacy 3-card layout if a real provider returns the
      // old shape.
      return `
        <section class="pd-section">
          <div class="pd-section-head">
            <h3>Forecast for selected plan</h3>
            <p>${escapeHtml(data.forecastSummary.narrative)}</p>
          </div>
          <div class="pd-metric-row">
            ${data.forecastSummary.metrics.map((metric) => renderMetricCard(metric)).join("")}
          </div>
        </section>
      `;
    }
    const fmtD = (n) => {
      if (n == null) return "-";
      const v = Number(n);
      if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
      if (Math.abs(v) >= 1e3) return `${v < 0 ? "-" : ""}$${Math.abs(v / 1e3).toFixed(0)}K`;
      return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(0)}`;
    };
    const fmtU = (n) => {
      if (n == null) return "-";
      const v = Number(n);
      if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
      if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
      return `${v.toFixed(0)}`;
    };
    const fmtPct = (n) => n == null ? "-" : `${Number(n).toFixed(1)}%`;
    const fmtAiv = (n) => n == null ? "-" : `$${Number(n).toFixed(2)}`;
    const deltaSign = (n) => n >= 0 ? "+" : "";
    const deltaPct = (cur, ly) => ly ? ((cur - ly) / ly) * 100 : 0;
    const deltaClass = (n) => n >= 0 ? "positive" : "negative";

    const wp = grid.withPromo;
    const np = grid.noPromo;
    const ly = grid.ly;
    const netInter = grid.netInteractions.net;
    const m = grid.markdown;
    const wpNet = {
      sales: wp.sales + netInter.sales,
      units: wp.units + netInter.units,
      agp: wp.agpDollar + netInter.agpDollar
    };
    function metricCard(label, val, netVal, lyVal, npVal, kind) {
      const fmt = kind === "units" ? fmtU : fmtD;
      const vsLy = lyVal ? ((val - lyVal) / lyVal) * 100 : 0;
      const vsNp = npVal ? ((val - npVal) / npVal) * 100 : 0;
      return `
        <article class="pd-fc-metric">
          <span class="pd-fc-metric-label">${label}</span>
          <strong class="pd-fc-metric-value">${fmt(val)}</strong>
          <span class="pd-fc-metric-net">Net of halo + cannib · ${fmt(netVal)}</span>
          <div class="pd-fc-metric-bench">
            <span class="pd-fc-bench-row">
              <span class="pd-fc-bench-key">vs LY</span>
              <span class="pd-fc-bench-val">${fmt(lyVal)}</span>
              <span class="pd-fc-bench-delta ${vsLy >= 0 ? "positive" : "negative"}">${vsLy >= 0 ? "+" : ""}${vsLy.toFixed(1)}%</span>
            </span>
            <span class="pd-fc-bench-row">
              <span class="pd-fc-bench-key">vs No promo</span>
              <span class="pd-fc-bench-val">${fmt(npVal)}</span>
              <span class="pd-fc-bench-delta ${vsNp >= 0 ? "positive" : "negative"}">${vsNp >= 0 ? "+" : ""}${vsNp.toFixed(1)}%</span>
            </span>
          </div>
        </article>
      `;
    }
    return `
      <section class="pd-section pd-forecast">
        <div class="pd-section-head">
          <h3>Forecast for selected plan &middot; <span class="pd-fc-item-ref">${escapeHtml(data.item.ncrc)} &middot; ${escapeHtml(data.item.description)} <em>${escapeHtml(data.item.packSize || "")}</em></span></h3>
          <p>${escapeHtml(data.forecastSummary.narrative)}</p>
        </div>
        <div class="pd-fc-metric-row">
          ${metricCard("Sales", wp.sales, wpNet.sales, ly.sales, np.sales, "money")}
          ${metricCard("Units", wp.units, wpNet.units, ly.units, np.units, "units")}
          ${metricCard("AGP",   wp.agpDollar, wpNet.agp, ly.agpDollar, np.agpDollar, "money")}
        </div>
        <div class="pd-fc-roi-strip">
          <span class="pd-fc-roi-label">Markdown ROI</span>
          <span class="pd-roi-chip negative">-${fmtD(m.markdownDollar)}</span>
          <span class="pd-roi-op">+</span>
          <span class="pd-roi-chip positive">+${fmtD(m.transactionAllowance)}</span>
          <span class="pd-roi-op">=</span>
          <span class="pd-roi-chip neutral">ROI ${fmtPct(m.roiPct)}</span>
          <span class="pd-fc-roi-note">Net markdown -${fmtD(m.netMarkdown)}</span>
        </div>
      </section>
    `;
  }

  function renderMetricCard(metric) {
    const current = metric.current || 0;
    const ly = metric.ly || 0;
    const rolling = metric.rolling || 0;
    const halo = metric.halo || 0;
    const cannib = metric.cannibalization || 0;
    const net = metric.net != null ? metric.net : current + halo + cannib;
    const lyPct = ly ? ((current - ly) / ly) * 100 : 0;
    const rollingPct = rolling ? ((current - rolling) / rolling) * 100 : 0;
    return `
      <article class="pd-metric-card">
        <header><span>${escapeHtml(metric.label)}</span></header>
        <strong class="pd-metric-value">${formatPdMetric(metric, current)}</strong>
        <div class="pd-metric-deltas">
          <div class="pd-delta-row">
            <span class="pd-delta-label">vs LY plan</span>
            <span class="pd-delta-value">${formatPdMetric(metric, ly)}</span>
            <span class="pd-delta-chip ${lyPct >= 0 ? "positive" : "negative"}">${lyPct >= 0 ? "+" : ""}${lyPct.toFixed(1)}%</span>
          </div>
          <div class="pd-delta-row">
            <span class="pd-delta-label">vs 52-wk rolling</span>
            <span class="pd-delta-value">${formatPdMetric(metric, rolling)}</span>
            <span class="pd-delta-chip ${rollingPct >= 0 ? "positive" : "negative"}">${rollingPct >= 0 ? "+" : ""}${rollingPct.toFixed(1)}%</span>
          </div>
        </div>
        <div class="pd-halo-block">
          <div class="pd-halo-row">
            <span>+ Halo</span>
            <strong class="positive">${halo >= 0 ? "+" : ""}${formatPdMetric(metric, halo)}</strong>
          </div>
          <div class="pd-halo-row">
            <span>- Cannibalization</span>
            <strong class="negative">${formatPdMetric(metric, cannib)}</strong>
          </div>
          <div class="pd-halo-net">
            <span>Net of halo &amp; cannib.</span>
            <strong>${formatPdMetric(metric, net)}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function formatPdMetric(metric, value) {
    const numeric = Number(value) || 0;
    if (metric.displayAs === "compactDollar") {
      if (Math.abs(numeric) >= 1000000) return `$${(numeric / 1000000).toFixed(2)}M`;
      if (Math.abs(numeric) >= 1000) return `${numeric < 0 ? "-" : ""}$${Math.abs(numeric / 1000).toFixed(0)}K`;
      return `${numeric < 0 ? "-" : ""}$${Math.abs(numeric).toFixed(0)}`;
    }
    if (metric.displayAs === "compact") {
      if (Math.abs(numeric) >= 1000000) return `${(numeric / 1000000).toFixed(2)}M`;
      if (Math.abs(numeric) >= 1000) return `${(numeric / 1000).toFixed(0)}K`;
      return numeric.toFixed(0);
    }
    return numeric.toLocaleString();
  }

  function renderOffersBlock(data) {
    const byPa = data.offersByPriceArea || [];
    if (!byPa.length && !(data.offers && data.offers.top && data.offers.top.length)) return "";

    // "Override the recommendation" (system flow) now uses the same
    // builder as manual override — default card + per-PA inline override.
    if (promoDetailState.overrideMode && byPa.length) {
      return renderManualBuilder(data, byPa);
    }

    // Manual override flow: default tactic card + per-PA inheritance table
    if (promoDetailState.planMode === "manual" && byPa.length) {
      return renderManualBuilder(data, byPa);
    }

    // Default by-price-area recommendations view
    if (byPa.length) return renderByPriceAreaView(data, byPa);

    // Legacy fallback: render the old top-5 table if no per-PA breakdown exists.
    return renderLegacyTop5(data);
  }

  // ---- Manual override builder -------------------------------------
  // One default tactic set once, applied to every price area, with the
  // ability to override individual PAs as exceptions.
  function manualDiscountLabel(f) {
    const v = Number(f.promoPrice) || 0;
    if (f.discountType === "set_price") return `Set $${v.toFixed(2)}`;
    if (f.discountType === "percent_off") return `${v.toFixed(0)}% off`;
    return `$${v.toFixed(2)} off`;
  }

  // Resolve what a PA is currently running under the manual builder:
  // its own custom override if it has one, otherwise the shared default.
  function manualRowForPa(pa) {
    const custom = promoDetailState.customOverrides[pa.priceArea] || null;
    const rec = pa.offers.find((o) => o.isRecommended) || pa.offers[0] || {};
    const def = promoDetailState.manualDefault || promoDetailState.overrideForm;
    if (custom) {
      const s = promoSystemSummary(custom._formSnapshot || {});
      return {
        isCustom: true, apex: s.apex, oms: s.oms,
        sales: custom.forecastSales || rec.forecastSales || 0,
        units: custom.forecastUnits || rec.forecastUnits || 0,
        agp: custom.forecastAgp || rec.forecastAgp || 0
      };
    }
    const s = promoSystemSummary(def);
    return {
      isCustom: false, apex: s.apex, oms: s.oms,
      // Inheriting rows preview the recommender's per-PA volume as the
      // expected outcome for the default tactic in that price area.
      sales: rec.forecastSales || 0,
      units: rec.forecastUnits || 0,
      agp: rec.forecastAgp || 0
    };
  }

  function renderManualBuilder(data, byPa) {
    // The same builder backs both the Manual-override flow and the
    // "Override the recommendation" action in the System-recommended flow;
    // in the latter we show a back link + override disclaimer.
    const override = promoDetailState.overrideMode;
    const customCount = byPa.filter((pa) => promoDetailState.customOverrides[pa.priceArea]).length;
    const editingPa = (promoDetailState.manualEditPa && byPa.some((p) => p.priceArea === promoDetailState.manualEditPa))
      ? promoDetailState.manualEditPa : null;
    return `
      <section class="pd-section pd-manual">
        ${override ? `
          <div class="pd-manual-topbar">
            <div>
              <h3>Override recommendation</h3>
              <p>Build a custom promo across every price area, or override individual price areas below.</p>
            </div>
            <button type="button" class="pd-override-flip" data-pd-override-toggle="close">&larr; Back to recommendations</button>
          </div>
        ` : ""}
        <div class="pd-manual-default">
          <div class="pd-manual-default-head">
            <div class="pd-md-title">
              <span class="pd-md-badge">DEFAULT</span>
              <strong>Promo tactic &mdash; applies to all ${byPa.length} price area${byPa.length === 1 ? "" : "s"}</strong>
              <p>Set once here. Every price area inherits this unless you override it below.</p>
            </div>
            <span class="pd-md-count">${customCount} of ${byPa.length} price areas customised</span>
          </div>
          <div class="pd-manual-fields">
            ${renderPromoSystemsPair(promoDetailState.overrideForm, "data-pd-override-field")}
            <div class="pd-manual-default-actions">
              <button type="button" class="pd-btn-secondary" data-pd-manual-reset ${customCount ? "" : "disabled"}>Reset all exceptions</button>
              <button type="button" class="pd-btn-primary" data-pd-manual-apply>Apply &amp; forecast</button>
            </div>
          </div>
        </div>
        ${override ? `<p class="pd-override-disclaimer"><strong>Override mode.</strong> Results are not optimised by the recommender. Linked items in store may be impacted. No guardrail or reliability scores will be shown.</p>` : ""}
        ${editingPa ? renderManualEditPanel(editingPa) : ""}
        <p class="pd-manual-cascade">&#8627; Changes to the default cascade to every <b>Inherits default</b> row automatically. Customised rows keep their own values.</p>

        <div class="pd-section-head pd-rec-head">
          <div>
            <h3>Price areas</h3>
            <p>One row per price area for ${escapeHtml(cigForNcrc(data.item.ncrc))}. Override a row to break from the default; reset to snap it back.</p>
          </div>
        </div>
        <div class="pd-pa-table-wrap">
          <table class="pd-pa-cols-table pd-manual-table">
            <thead>
              <tr>
                <th>PA</th>
                <th>APEX promo</th>
                <th>OMS promo</th>
                <th>Status</th>
                <th class="r"></th>
              </tr>
            </thead>
            <tbody>
              ${byPa.map((pa) => {
                const isEditing = editingPa === pa.priceArea;
                const r = manualRowForPa(pa);
                return `
                  <tr class="pd-manual-row ${isEditing ? "is-editing-row" : r.isCustom ? "is-custom" : "is-inherit"}">
                    <td class="pa-col"><strong>${escapeHtml(pa.priceArea)}</strong></td>
                    <td class="pd-manual-promo"><span class="pd-sys-tag pd-sys-apex">APEX</span> ${escapeHtml(r.apex)}</td>
                    <td class="pd-manual-promo"><span class="pd-sys-tag pd-sys-oms">OMS</span> ${escapeHtml(r.oms)}</td>
                    <td>${isEditing
                      ? `<span class="pd-status-badge pd-status-custom">Editing&hellip;</span>`
                      : r.isCustom
                      ? `<span class="pd-status-badge pd-status-custom">Custom</span>`
                      : `<span class="pd-status-badge pd-status-inherit">Inherits default</span>`}</td>
                    <td class="r pd-manual-actions">
                      ${isEditing ? "" : r.isCustom
                        ? `<a href="#" class="pd-override-link pd-override-link-clear" data-pd-override-clear="${escapeAttr(pa.priceArea)}">Reset</a>
                           <a href="#" class="pd-override-link" data-pd-manual-edit="${escapeAttr(pa.priceArea)}">&#9998; Edit</a>`
                        : `<a href="#" class="pd-override-link" data-pd-manual-edit="${escapeAttr(pa.priceArea)}">&#9998; Override</a>`}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
            <tfoot>
              <tr class="pd-pa-totals-row">
                <td class="pa-col"><strong>Total</strong><span class="pd-totals-sub">${byPa.length} price areas &middot; ${customCount} customised</span></td>
                <td></td><td></td><td></td><td class="r"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    `;
  }

  // Per-PA override editor — a full-width card styled like the default
  // card so the fields line up (no cramped in-table layout).
  function renderManualEditPanel(paName) {
    const f = promoDetailState.manualEditForm || {};
    return `
      <div class="pd-manual-default pd-manual-editpanel">
        <div class="pd-manual-default-head">
          <div class="pd-md-title">
            <span class="pd-md-badge pd-md-badge-edit">OVERRIDE</span>
            <strong>Overriding ${escapeHtml(paName)}</strong>
            <p>Break this price area out from the default. Forecast recalculates on save.</p>
          </div>
        </div>
        <div class="pd-manual-fields">
          ${renderPromoSystemsPair(f, "data-pd-manual-edit-field")}
          <div class="pd-manual-default-actions">
            <button type="button" class="pd-btn-secondary" data-pd-manual-edit-cancel>Cancel</button>
            <button type="button" class="pd-btn-primary" data-pd-manual-edit-save>Save override</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderByPriceAreaView(data, byPa) {
    const lyOffer = data.offers && data.offers.ly;
    const noPromoOffer = data.offers && data.offers.noPromo;
    // Roll up the CHOSEN offer for each price area (recommended if the
    // user hasn't overridden) into a single bottom-of-table total. As
    // the user picks alternates via the radio button, this total
    // updates live so they see the impact of their slate.
    const totals = byPa.reduce((acc, pa) => {
      const rec = chosenOfferForPa(pa);
      if (!rec) return acc;
      acc.sales += rec.forecastSales || 0;
      acc.units += rec.forecastUnits || 0;
      acc.agp   += rec.forecastAgp   || 0;
      acc.funding += rec.vendorFunding || 0;
      return acc;
    }, { sales: 0, units: 0, agp: 0, funding: 0 });
    const fmtK = (n) => `${(n / 1000).toFixed(0)}K`;
    // Allowance is an NCRC-level call — either there's a live NOPA
    // covering this NCRC or there isn't. We probe any offer to decide
    // the binary state because every PA shares the same answer.
    const hasFunding = byPa.some((pa) => (pa.offers || []).some((o) => (o.vendorFunding || 0) > 0));
    const allowanceBadge = hasFunding
      ? `<span class="pd-allowance-badge pd-allowance-badge-full" title="A NOPA covers this NCRC under the selected scenario"><span class="pd-allowance-tick">&#10003;</span> Allowance linked</span>`
      : `<span class="pd-allowance-badge pd-allowance-badge-empty" title="No active NOPA covers this NCRC under the selected scenario"><span class="pd-funding-warn pd-funding-warn-inline">!</span> No allowance under this scenario</span>`;
    return `
      <section class="pd-section pd-rec-section">
        <div class="pd-section-head pd-rec-head">
          <div>
            <h3>Promo recommendations ${allowanceBadge}</h3>
            <p>One row per price area for ${escapeHtml(data.item.ncrc)}. Expand a price area to see alternate tactics, last-year actual and the no-promo baseline for that PA.</p>
          </div>
        </div>
        <div class="pd-pa-table-wrap">
          <table class="pd-pa-cols-table">
            <thead>
              <tr>
                <th>PA</th>
                <th class="r">VLC</th>
                <th class="r">DNC</th>
                <th class="r">Base $</th>
                <th class="r">Promo $</th>
                <th>Store tactic</th>
                <th>Digital tactic</th>
                <th class="c">MB/Lim</th>
                <th class="c">Ad/Disp</th>
                <th class="r">Funding $</th>
                <th class="r">Sales</th>
                <th class="r">Units</th>
                <th class="r">AGP</th>
                <th class="r">Total<br /><span class="th-sub">score</span></th>
                <th class="alt-col"></th>
              </tr>
            </thead>
            <tbody>
              ${byPa.map((pa) => renderPriceAreaRows(pa, lyOffer, noPromoOffer)).join("")}
            </tbody>
            <tfoot>
              <tr class="pd-pa-totals-row">
                <td class="pa-col"><strong>Total</strong><span class="pd-totals-sub">${byPa.length} price area${byPa.length === 1 ? "" : "s"}</span></td>
                <td class="r"></td>
                <td class="r"></td>
                <td class="r"></td>
                <td class="r"></td>
                <td></td>
                <td></td>
                <td class="c"></td>
                <td class="c"></td>
                <td class="r"><strong>$${totals.funding.toFixed(2)}</strong></td>
                <td class="r"><strong>$${fmtK(totals.sales)}</strong></td>
                <td class="r"><strong>${fmtK(totals.units)}</strong></td>
                <td class="r"><strong>$${fmtK(totals.agp)}</strong></td>
                <td class="r"></td>
                <td class="alt-col"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    `;
  }

  function renderPriceAreaRows(pa, lyOffer, noPromoOffer) {
    const recommended = pa.offers.find((o) => o.isRecommended) || pa.offers[0];
    const alternates = pa.offers.filter((o) => o.id !== recommended.id);
    // A saved custom override (from the "Use this promotion" flow) is
    // pinned to the top of the alternates so the user sees it first
    // when they return to this NCRC + PA later.
    const custom = promoDetailState.customOverrides[pa.priceArea] || null;
    const allAlternates = custom ? [custom, ...alternates] : alternates;
    const expanded = !!promoDetailState.expandedPriceAreas[pa.priceArea];
    const isActive = promoDetailState.selectedPriceArea === pa.priceArea && promoDetailState.selectedOfferId === recommended.id;
    return `
      ${renderSummaryRow(pa, recommended, isActive, expanded, allAlternates.length)}
      ${expanded ? `
        ${renderExpandedHeader(pa)}
        ${allAlternates.map((alt) => renderAltRow(pa, alt)).join("")}
        ${lyOffer ? renderLyRowExpanded(pa, lyOffer) : ""}
        ${noPromoOffer ? renderNoPromoRowExpanded(pa, noPromoOffer) : ""}
        <tr class="pd-pa-override-row">
          <td colspan="15">
            ${custom
              ? `Custom override saved for <strong>${escapeHtml(pa.priceArea)}</strong>. <a href="#" class="pd-override-link" data-pd-override-toggle="open" data-pa="${escapeAttr(pa.priceArea)}">Edit</a> or <a href="#" class="pd-override-link pd-override-link-clear" data-pd-override-clear="${escapeAttr(pa.priceArea)}">Clear</a>.`
              : `None of these fit? <a href="#" class="pd-override-link" data-pd-override-toggle="open" data-pa="${escapeAttr(pa.priceArea)}">Override the recommendation &rarr;</a>`
            }
          </td>
        </tr>
      ` : ""}
    `;
  }

  function discountTypeLabel(offer) {
    if (offer.storeTactic.code === "BXGX") return offer.label;
    return `Save $${(offer.storeSave || 0).toFixed(2)}`;
  }

  function offerColumnsHtml(pa, offer) {
    const adDisp = `${offer.hasAd ? "Y" : "N"}/${offer.hasDisplay ? "Y" : "N"}`;
    const deadNet = (offer.netCost - (offer.allowancePerUnit || 0) * 0.1) || (offer.netCost * 0.92);
    const vlc = pa.vlc != null ? pa.vlc : offer.netCost;
    const storeTacticHtml = `
      <div class="pd-cell-stack">
        <span class="pd-cell-line">${escapeHtml(offer.storeTactic.name)}</span>
        <span class="pd-cell-sub">${escapeHtml(discountTypeLabel(offer))}</span>
      </div>
    `;
    const digitalHtml = offer.digitalTactic ? `
      <div class="pd-cell-stack">
        <span class="pd-cell-line">${escapeHtml(offer.digitalTactic)}</span>
        <span class="pd-cell-sub">$${(offer.promoDigitalPrice || 0).toFixed(2)}</span>
      </div>
    ` : `<span class="pd-cell-sub pd-cell-none">No digital</span>`;
    return `
      <td class="r">$${vlc.toFixed(2)}</td>
      <td class="r">$${deadNet.toFixed(2)}</td>
      <td class="r pd-col-base">$${offer.regPrice.toFixed(2)}</td>
      <td class="r pd-col-promo">$${offer.promoStorePrice.toFixed(2)}</td>
      <td>${storeTacticHtml}</td>
      <td>${digitalHtml}</td>
      <td class="c">${offer.mbStore}/${offer.limitStore}</td>
      <td class="c">${adDisp}</td>
      <td class="r">$${offer.vendorFunding.toFixed(2)}</td>
      <td class="r">$${(offer.forecastSales / 1000).toFixed(0)}K<br /><span class="pd-pct ${offer.salesDeltaPct >= 0 ? "positive" : "negative"}">${offer.salesDeltaPct >= 0 ? "+" : ""}${offer.salesDeltaPct.toFixed(1)}%</span></td>
      <td class="r">${(offer.forecastUnits / 1000).toFixed(0)}K<br /><span class="pd-pct ${offer.unitDeltaPct >= 0 ? "positive" : "negative"}">${offer.unitDeltaPct >= 0 ? "+" : ""}${offer.unitDeltaPct.toFixed(1)}%</span></td>
      <td class="r">$${(offer.forecastAgp / 1000).toFixed(0)}K<br /><span class="pd-pct ${offer.agpDeltaPct >= 0 ? "positive" : "negative"}">${offer.agpDeltaPct >= 0 ? "+" : ""}${offer.agpDeltaPct.toFixed(1)}%</span></td>
      <td class="r pd-total-cell">
        <span class="pd-score-num total ${scoreTone(offer.totalScore)}">${offer.totalScore}</span>
        <span class="pd-score-breakdown">R ${offer.reliabilityScore}% · G ${offer.guardrailScore}
          <button type="button" class="pd-score-info" data-pd-score-info="${escapeAttr(offer.id)}" title="Reliability evidence" aria-label="Reliability evidence">i</button>
        </span>
      </td>
    `;
  }

  function renderSummaryRow(pa, offer, isActive, expanded, altCount) {
    // No radio on the PA summary row — each Price Area is a distinct
    // selection bucket (always picked), the radio only exists to pick
    // among alternates inside one PA. Clicking the row still focuses
    // it on the right panel. Allowance is an NCRC-level decision so we
    // don't decorate per-PA rows; the badge near the section header
    // already conveys that signal for the whole NCRC.
    return `
      <tr class="pd-pa-summary-row ${isActive ? "is-selected" : ""} ${expanded ? "is-expanded" : ""}"
          data-promo-offer-id="${escapeAttr(offer.id)}"
          data-pd-price-area="${escapeAttr(pa.priceArea)}">
        <td class="pa-col">
          <strong>${escapeHtml(pa.priceArea)}</strong>${offer.isCurrentPlan ? `<span class="pd-tag-pill planned">PL</span>` : ""}
        </td>
        ${offerColumnsHtml(pa, offer)}
        <td class="alt-col">
          <button type="button" class="pd-pa-toggle-btn ${expanded ? "is-open" : ""}" data-pd-pa-toggle="${escapeAttr(pa.priceArea)}" aria-expanded="${expanded}" title="${expanded ? "Hide" : "Show"} ${altCount} alternates + LY + No Promo">
            <span>${expanded ? "Hide" : `+${altCount}`}</span>
            <span class="pd-pa-toggle-arrow">&#9662;</span>
          </button>
        </td>
      </tr>
    `;
  }

  function renderExpandedHeader(pa) {
    return `
      <tr class="pd-pa-expanded-header">
        <td colspan="15">Alternates &middot; LY actual &middot; No promo baseline for <strong>${escapeHtml(pa.priceArea)}</strong></td>
      </tr>
    `;
  }

  function renderAltRow(pa, offer) {
    const chosen = chosenOfferForPa(pa);
    const isChosen = chosen && chosen.id === offer.id;
    const isActive = promoDetailState.selectedPriceArea === pa.priceArea && promoDetailState.selectedOfferId === offer.id;
    const rankBadge = offer.isCustom
      ? `<span class="pd-alt-rank pd-alt-rank-custom">CUSTOM</span>`
      : `<span class="pd-alt-rank">#${offer.rank}</span>`;
    return `
      <tr class="pd-pa-alt-row ${isChosen ? "is-chosen" : ""} ${isActive ? "is-selected" : ""} ${offer.isCustom ? "is-custom" : ""}"
          data-promo-offer-id="${escapeAttr(offer.id)}"
          data-pd-price-area="${escapeAttr(pa.priceArea)}">
        <td class="pa-col">
          <span class="pd-pa-radio ${isChosen ? "is-checked" : ""}" aria-hidden="true"></span>
          ${rankBadge}${offer.isCurrentPlan ? `<span class="pd-tag-pill planned">PL</span>` : ""}
        </td>
        ${offerColumnsHtml(pa, offer)}
        <td class="alt-col"></td>
      </tr>
    `;
  }

  function renderLyRowExpanded(pa, ly) {
    return `
      <tr class="pd-pa-ref-row pd-pa-ly-row">
        <td class="pa-col"><span class="pd-ref-pill pd-ref-ly">LY</span></td>
        <td class="r">-</td>
        <td class="r">-</td>
        <td class="r pd-col-base">-</td>
        <td class="r pd-col-promo">$${ly.promoStorePrice.toFixed(2)}</td>
        <td><div class="pd-cell-stack"><span class="pd-cell-line">${escapeHtml(ly.tacticLabel)}</span><span class="pd-cell-sub">Last year</span></div></td>
        <td><span class="pd-cell-sub pd-cell-none">-</span></td>
        <td class="c">-</td>
        <td class="c">-</td>
        <td class="r">-</td>
        <td class="r">$${ly.sales.toFixed(0)}</td>
        <td class="r">${(ly.units || 0).toLocaleString()}</td>
        <td class="r">$${ly.agp.toFixed(0)}</td>
        <td class="r pd-total-cell"><span class="pd-score-breakdown">actual</span></td>
        <td class="alt-col"></td>
      </tr>
    `;
  }

  function renderNoPromoRowExpanded(pa, noPromo) {
    return `
      <tr class="pd-pa-ref-row pd-pa-nopromo-row">
        <td class="pa-col"><span class="pd-ref-pill pd-ref-nopromo">NP</span></td>
        <td class="r">-</td>
        <td class="r">-</td>
        <td class="r pd-col-base">$${noPromo.regPrice.toFixed(2)}</td>
        <td class="r pd-col-promo">-</td>
        <td><div class="pd-cell-stack"><span class="pd-cell-line">${escapeHtml(noPromo.label)}</span><span class="pd-cell-sub">Skip promo</span></div></td>
        <td><span class="pd-cell-sub pd-cell-none">-</span></td>
        <td class="c">-</td>
        <td class="c">-</td>
        <td class="r">$${noPromo.vendorFunding.toFixed(2)}</td>
        <td class="r">$${(noPromo.forecastSales / 1000).toFixed(0)}K</td>
        <td class="r">${(noPromo.forecastUnits / 1000).toFixed(0)}K</td>
        <td class="r">$${(noPromo.forecastAgp / 1000).toFixed(0)}K</td>
        <td class="r pd-total-cell">
          <span class="pd-score-num total ${scoreTone(noPromo.totalScore)}">${noPromo.totalScore}</span>
          <span class="pd-score-breakdown">R ${noPromo.reliabilityScore}% · G ${noPromo.guardrailScore}</span>
        </td>
        <td class="alt-col"></td>
      </tr>
    `;
  }

  function renderOverrideView(data) {
    const form = promoDetailState.overrideForm;
    const result = promoDetailState.overrideResult;
    const submitting = promoDetailState.overrideSubmitting;
    const vendorPriceAreas = (data.offersByPriceArea || []).map((p) => p.priceArea);
    return `
      <section class="pd-section pd-rec-section pd-override-section">
        <div class="pd-section-head pd-rec-head">
          <div>
            <h3>Override recommendation</h3>
            <p>Build a custom promo and choose whether it applies to <strong>every price area</strong> or just <strong>one</strong>. The forecaster returns units, sales and AGP for your override, but skips guardrail and reliability scoring.</p>
          </div>
          <button type="button" class="pd-override-flip" data-pd-override-toggle="close">&larr; Back to recommendations</button>
        </div>
        <form class="pd-override-form" data-pd-override-submit>
          <div class="pd-override-scope">
            <span class="pd-of-label">Apply to</span>
            <div class="pd-segmented pd-override-scope-seg" role="group" aria-label="Override scope">
              <button type="button" class="${!form.priceArea ? "active" : ""}" data-pd-override-scope="all">All price areas</button>
              <button type="button" class="${form.priceArea ? "active" : ""}" data-pd-override-scope="single">One price area</button>
            </div>
            ${form.priceArea ? `
              <select name="priceArea" class="pd-override-scope-pa" data-pd-override-field="priceArea">
                ${vendorPriceAreas.map((p) => `<option value="${escapeAttr(p)}" ${form.priceArea === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
              </select>
            ` : `<span class="pd-override-scope-hint">One custom promo applies to every price area. Switch to &ldquo;One price area&rdquo; to target a single PA.</span>`}
          </div>
          ${renderPromoSystemsPair(form, "data-pd-override-field")}
          <div class="pd-override-actions">
            <button type="button" class="pd-btn-secondary" data-pd-override-reset>Reset</button>
            <button type="submit" class="pd-btn-primary" ${submitting ? "disabled" : ""}>
              ${submitting ? `<span class="pd-btn-spinner"></span>Forecasting...` : "Get override forecast"}
            </button>
          </div>
          <p class="pd-override-disclaimer">
            <strong>Override mode.</strong> Results are not optimised by the recommender. Linked items in store may be impacted. No guardrail or reliability scores will be shown.
          </p>
        </form>
        ${result ? `
          <div class="pd-override-result">
            <header><strong>Forecast for override</strong></header>
            <div class="pd-override-result-grid">
              <div><span>Units</span><strong>${result.units.toLocaleString()}</strong></div>
              <div><span>Sales</span><strong>$${(result.sales / 1000).toFixed(1)}K</strong></div>
              <div><span>AGP</span><strong>$${(result.agp / 1000).toFixed(1)}K</strong></div>
            </div>
            <p class="pd-override-disclaimer">${escapeHtml(result.disclaimer)}</p>
            <div class="pd-override-use-row">
              <button type="button" class="pd-btn-primary" data-pd-override-use>Use this promotion &rarr;</button>
              <small>This becomes the chosen pick for ${form.priceArea ? escapeHtml(form.priceArea) : "every price area"}. Add &amp; next will save it to the cart.</small>
            </div>
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderLegacyTop5(data) {
    const offers = data.offers || { top: [] };
    const top = offers.top || [];
    return `
      <section class="pd-section">
        <div class="pd-section-head">
          <h3>Top ${top.length} promotional candidates</h3>
        </div>
        <div class="pd-offers-wrap">
          <table class="pd-offers-table">
            <tbody>
              ${offers.ly ? renderLyRow(offers.ly) : ""}
              ${top.map((offer) => renderOfferRow(offer)).join("")}
              ${offers.noPromo ? renderNoPromoRow(offers.noPromo) : ""}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderLyRow(row) {
    return `
      <tr class="pd-row-ly">
        <td class="pick-col"></td>
        <td class="rank-col"><span class="pd-row-pill ly">LY</span></td>
        <td class="tactic-col">
          <div class="pd-tactic-stack">
            <span class="pd-tactic-name">${escapeHtml(row.tacticLabel)}</span>
            <span class="pd-tactic-sub">${escapeHtml(row.note)}</span>
          </div>
        </td>
        <td class="r">$${row.netCost.toFixed(2)}</td>
        <td class="r">$${row.regPrice.toFixed(2)}</td>
        <td class="r">$${row.promoStorePrice.toFixed(2)}</td>
        <td class="r">-</td>
        <td class="c">-</td>
        <td class="r">${row.units.toLocaleString()}</td>
        <td class="r">$${row.sales.toFixed(2)}</td>
        <td class="r">$${row.agp.toFixed(2)}</td>
        <td class="r">-</td>
        <td class="r">-</td>
        <td class="r">-</td>
        <td class="r">-</td>
      </tr>
    `;
  }

  function renderNoPromoRow(row) {
    return `
      <tr class="pd-row-nopromo">
        <td class="pick-col"></td>
        <td class="rank-col"><span class="pd-row-pill nopromo">NP</span></td>
        <td class="tactic-col">
          <div class="pd-tactic-stack">
            <span class="pd-tactic-name">${escapeHtml(row.label)}</span>
            <span class="pd-tactic-sub">${escapeHtml(row.note)}</span>
          </div>
        </td>
        <td class="r">$${row.netCost.toFixed(2)}</td>
        <td class="r">$${row.regPrice.toFixed(2)}</td>
        <td class="r">$${row.promoStorePrice.toFixed(2)}</td>
        <td class="r">-</td>
        <td class="c">N/N</td>
        <td class="r">${(row.forecastUnits / 1000).toFixed(0)}K</td>
        <td class="r">$${(row.forecastSales / 1000).toFixed(0)}K</td>
        <td class="r">$${(row.forecastAgp / 1000).toFixed(0)}K</td>
        <td class="r">$${row.vendorFunding.toFixed(2)}</td>
        <td class="r">${row.reliabilityScore}%</td>
        <td class="r">${row.guardrailScore}</td>
        <td class="r">${row.totalScore}</td>
      </tr>
    `;
  }

  function renderOfferRow(offer) {
    const isSelected = offer.id === promoDetailState.selectedOfferId;
    const isConfirmed = offer.id === promoConfirmedSelectionId();
    const digitalPromo = offer.promoDigitalPrice != null ? `$${offer.promoDigitalPrice.toFixed(2)}` : "-";
    const adDisp = `${offer.hasAd ? "Y" : "N"}/${offer.hasDisplay ? "Y" : "N"}`;
    return `
      <tr class="pd-offer-row ${isSelected ? "is-selected" : ""} ${isConfirmed ? "is-confirmed" : ""}" data-promo-offer-id="${escapeAttr(offer.id)}">
        <td class="pick-col">
          <span class="pd-radio ${isSelected ? "checked" : ""} ${isConfirmed ? "confirmed" : ""}" aria-checked="${isSelected}" role="radio"><i></i></span>
        </td>
        <td class="rank-col"><span class="pd-row-pill rank">${offer.rank}</span></td>
        <td class="tactic-col">
          <div class="pd-tactic-stack">
            <div class="pd-tactic-name-row">
              <span class="pd-tactic-name">${escapeHtml(offer.label)}</span>
              ${offer.isRecommended ? `<span class="pd-tag-pill recommended">RECOMMENDED</span>` : ""}
              ${offer.isCurrentPlan ? `<span class="pd-tag-pill planned">PL</span>` : ""}
            </div>
            <span class="pd-tactic-sub">${escapeHtml(offer.storeTactic.name)}${offer.digitalTactic ? ` / ${escapeHtml(offer.digitalTactic)}` : " / no digital"}</span>
          </div>
        </td>
        <td class="r">$${offer.netCost.toFixed(2)}</td>
        <td class="r">$${offer.regPrice.toFixed(2)}</td>
        <td class="r">$${offer.promoStorePrice.toFixed(2)}<br /><span class="th-sub">${digitalPromo}</span></td>
        <td class="r">${offer.mbStore}/${offer.limitStore}<br /><span class="th-sub">${offer.mbDigital || "-"}/${offer.limitDigital || "-"}</span></td>
        <td class="c">${adDisp}</td>
        <td class="r">${(offer.forecastUnits / 1000).toFixed(0)}K<br /><span class="pd-pct ${offer.unitDeltaPct >= 0 ? "positive" : "negative"}">${offer.unitDeltaPct >= 0 ? "+" : ""}${offer.unitDeltaPct.toFixed(1)}%</span></td>
        <td class="r">$${(offer.forecastSales / 1000).toFixed(0)}K<br /><span class="pd-pct ${offer.salesDeltaPct >= 0 ? "positive" : "negative"}">${offer.salesDeltaPct >= 0 ? "+" : ""}${offer.salesDeltaPct.toFixed(1)}%</span></td>
        <td class="r">$${(offer.forecastAgp / 1000).toFixed(0)}K<br /><span class="pd-pct ${offer.agpDeltaPct >= 0 ? "positive" : "negative"}">${offer.agpDeltaPct >= 0 ? "+" : ""}${offer.agpDeltaPct.toFixed(1)}%</span></td>
        <td class="r">$${offer.vendorFunding.toFixed(2)}</td>
        <td class="r"><span class="pd-score-num ${scoreTone(offer.reliabilityScore)}">${offer.reliabilityScore}%</span></td>
        <td class="r"><span class="pd-score-num ${scoreTone(offer.guardrailScore)}">${offer.guardrailScore}</span></td>
        <td class="r"><span class="pd-score-num total ${scoreTone(offer.totalScore)}">${offer.totalScore}</span></td>
      </tr>
    `;
  }

  function scoreTone(score) {
    if (score >= 75) return "tone-good";
    if (score >= 60) return "tone-neutral";
    return "tone-warn";
  }

  function renderWeeklyRunsBlock(data) {
    const runs = data.weeklyRuns || [];
    if (!runs.length) return "";
    return `
      <section class="pd-section">
        <div class="pd-section-head">
          <h3>Promo history - last ${runs.length} weeks</h3>
          <p>How this NCRC has run recently. Each row is one ad-break.</p>
        </div>
        <div class="pd-runs-wrap">
          <table class="pd-runs-table">
            <thead>
              <tr>
                <th>Ad Break Date</th>
                <th class="r">Base Units</th>
                <th class="r">Actual Units</th>
                <th class="r">Actual Sales</th>
                <th class="r">AIV</th>
                <th>Promo Tactic</th>
                <th class="r">Promo Retail</th>
                <th class="c">Ad Page</th>
                <th>Display</th>
                <th class="r">Store Count</th>
              </tr>
            </thead>
            <tbody>${runs.map((row) => renderWeeklyRunRow(row)).join("")}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderWeeklyRunRow(row) {
    return `
      <tr>
        <td>${escapeHtml(row.adBreakDate)}</td>
        <td class="r">${(row.baseUnits || 0).toLocaleString()}</td>
        <td class="r">${(row.actualUnits || 0).toLocaleString()}</td>
        <td class="r">$${(row.actualSales || 0).toLocaleString()}</td>
        <td class="r">$${(row.aiv || 0).toFixed(2)}</td>
        <td>${escapeHtml(row.promoTactic || "-")}</td>
        <td class="r">${escapeHtml(row.promoRetail || "-")}</td>
        <td class="c">${escapeHtml(row.adPage || "-")}</td>
        <td>${escapeHtml(row.display || "-")}</td>
        <td class="r">${(row.storeCount || 0).toLocaleString()}</td>
      </tr>
    `;
  }

  function renderRightPanel(data) {
    const offer = selectedPromoOffer();
    if (!offer) return `<div class="pd-side-empty">Select an offer to see its drill-down.</div>`;
    const tab = promoDetailState.rightTab;
    // The offer name is already visible in the table row the user just
    // clicked AND in each sub-section's own header ("$1 Off - 3-week
    // ladder", "Explain $1 Off", etc.) so the side card header doesn't
    // need to repeat it. Just lead straight into the tabs.
    return `
      <div class="pd-side-card">
        <nav class="pd-tabs" role="tablist">
          <button type="button" role="tab" class="${tab === "cost" ? "active" : ""}" data-promo-detail-tab="cost">Cost ladder</button>
          <button type="button" role="tab" class="${tab === "grid" ? "active" : ""}" data-promo-detail-tab="grid">NCRC grid</button>
          <button type="button" role="tab" class="${tab === "explain" ? "active" : ""}" data-promo-detail-tab="explain">Explain</button>
        </nav>
        <div class="pd-side-body">
          ${tab === "cost" ? renderCostLadderPanel(data, offer) : ""}
          ${tab === "grid" ? renderScatterPanel(data) : ""}
          ${tab === "explain" ? renderExplainPanel(offer) : ""}
        </div>
      </div>
    `;
  }

  function renderCostLadderPanel(data, offer) {
    // Prefer the focused PA's cost ladder so clicking PA01 vs PA02
    // shows different VLC / allowance numbers. Falls back to the global
    // ladder if no PA is focused (e.g., for the legacy top-5 view).
    const paName = promoDetailState.selectedPriceArea;
    const pa = paName && Array.isArray(data.offersByPriceArea)
      ? data.offersByPriceArea.find((p) => p.priceArea === paName)
      : null;
    const ladder = (pa && pa.costLadder) || data.costLadder;
    if (!ladder || !Array.isArray(ladder.rows)) return `<p class="pd-empty">No cost ladder.</p>`;
    const activeIndex = ladder.activeWeekIndex || 0;
    const paLabel = paName ? ` &middot; ${paName}` : "";
    return `
      <div class="pd-ladder">
        <header class="pd-ladder-head">
          <strong>${escapeHtml(offer.label)}${paLabel} - 3-week ladder</strong>
          <span>YOU ARE IN WEEK ${activeIndex + 1}</span>
        </header>
        <table class="pd-ladder-table">
          <thead>
            <tr>
              <th>Cost / allowance</th>
              ${ladder.weeks.map((week, idx) => `<th class="r ${idx === activeIndex ? "is-active" : ""}">W${idx + 1}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${ladder.rows.map((row) => renderLadderRow(row, ladder.weeks.length, activeIndex)).join("")}
          </tbody>
        </table>
      </div>
      ${renderNopaPanel(data, paName)}
    `;
  }

  // Small panel under the cost ladder listing the NOPAs (Net Of
  // Promotional Allowances agreements) that fund the allowances rolled
  // into the ladder above. Each entry is a hyperlink that would deep
  // link to the agreement record in the funding tool.
  function renderNopaPanel(data, paName) {
    const item = data && data.item;
    if (!item) return "";
    // If the focused PA has no funding under the active scenario, show
    // an explicit empty state rather than synthetic NOPAs — this is
    // what the user sees when a promo is being run without an allowance.
    const paOffers = paName && Array.isArray(data.offersByPriceArea)
      ? (data.offersByPriceArea.find((p) => p.priceArea === paName) || {}).offers || []
      : [];
    const paHasFunding = paOffers.some((o) => (o.vendorFunding || 0) > 0);
    if (paName && !paHasFunding) {
      return `
        <section class="pd-nopa pd-nopa-empty">
          <header class="pd-nopa-head">
            <strong>NOPAs linked to</strong>
            <span>${escapeHtml(item.ncrc)} &middot; ${escapeHtml(item.description || "")} <em>${escapeHtml(item.packSize || "")}</em></span>
            <span class="pd-nopa-pa">${escapeHtml(paName)}</span>
          </header>
          <p class="pd-nopa-none">
            <span class="pd-funding-warn pd-funding-warn-inline">!</span>
            No linked NOPAs under this scenario. Promoting <strong>${escapeHtml(paName)}</strong> without funding leaves the AGP exposed.
          </p>
        </section>
      `;
    }
    // Mock NOPA list. A real provider would return per-(NCRC, PA, week)
    // funding agreements. We synthesise a couple based on the NCRC so
    // the rendering is realistic; the hash makes the list stable.
    const seed = (item.ncrc || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const nopas = [
      { id: `NOPA-${1000 + (seed % 9000)}`,  label: "Off-Invoice MD", window: "W48 – W52", amount: "$0.57 / unit" },
      { id: `NOPA-${2000 + ((seed + 17) % 9000)}`, label: "Bill-Back FY26 Q1", window: "P11 – P13", amount: "$0.05 / unit" },
      { id: `NOPA-${3000 + ((seed + 41) % 9000)}`, label: "Retail transaction", window: "Always-on", amount: "$0.45 / txn" }
    ];
    return `
      <section class="pd-nopa">
        <header class="pd-nopa-head">
          <strong>NOPAs linked to</strong>
          <span>${escapeHtml(item.ncrc)} &middot; ${escapeHtml(item.description || "")} <em>${escapeHtml(item.packSize || "")}</em></span>
          ${paName ? `<span class="pd-nopa-pa">${escapeHtml(paName)}</span>` : ""}
        </header>
        <ul class="pd-nopa-list">
          ${nopas.map((n) => `
            <li>
              <a href="#" class="pd-nopa-link" data-pd-nopa="${escapeAttr(n.id)}">
                <strong>${escapeHtml(n.id)}</strong>
                <span>${escapeHtml(n.label)}</span>
              </a>
              <span class="pd-nopa-meta">${escapeHtml(n.window)} &middot; ${escapeHtml(n.amount)}</span>
            </li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  function renderLadderRow(row, weekCount, activeIndex) {
    if (row.group) {
      return `
        <tr class="pd-ladder-group"><td colspan="${weekCount + 1}">${escapeHtml(row.group)}</td></tr>
        ${(row.subRows || []).map((sub) => renderLadderRow(sub, weekCount, activeIndex)).join("")}
      `;
    }
    const emphasis = row.emphasis === "total" ? "pd-ladder-total"
      : row.emphasis === "subtotal" ? "pd-ladder-subtotal"
      : row.emphasis === "primary" ? "pd-ladder-primary" : "";
    const signClass = row.sign === "+" ? "sign-plus" : row.sign === "-" ? "sign-minus" : row.sign === "=" ? "sign-eq" : "sign-info";
    return `
      <tr class="${emphasis}">
        <td><span class="pd-sign ${signClass}">${row.sign === "info" ? "" : row.sign || ""}</span>${escapeHtml(row.row)}</td>
        ${(row.values || []).map((value, idx) => `<td class="r ${idx === activeIndex ? "is-active" : ""}">${value === 0 || value == null ? "$0.00" : `$${Number(value).toFixed(2)}`}</td>`).join("")}
      </tr>
    `;
  }

  function renderScatterPanel(data) {
    const week = data.scatter ? data.scatter.week : "";
    return `
      <div class="pd-grid-panel">
        <header class="pd-grid-head">
          <strong>NCRC balance grid</strong>
          <div class="pd-scope-toggle">
            <label><input type="radio" name="scatterScope" value="week" data-scatter-week-scope ${promoDetailState.scatterScope === "week" ? "checked" : ""} /> W${week}</label>
            <label><input type="radio" name="scatterScope" value="all" data-scatter-week-scope ${promoDetailState.scatterScope === "all" ? "checked" : ""} /> All weeks</label>
          </div>
        </header>
        <p class="pd-grid-help">Each dot is an NCRC. X = revenue, Y = units. Darker dot = higher AGP rate. Split into 4 quads by median revenue &amp; units.</p>
        <div class="pd-scatter-shell">
          <span class="pd-quad-label top-right">Hi rev &middot; Hi units</span>
          <span class="pd-quad-label top-left">Lo rev &middot; Hi units</span>
          <span class="pd-quad-label bottom-right">Hi rev &middot; Lo units</span>
          <span class="pd-quad-label bottom-left">Lo rev &middot; Lo units</span>
          <div id="promoDetailScatter" class="pd-scatter"></div>
        </div>
        <div class="pd-agp-legend">
          <span>Low AGP</span>
          <span class="pd-agp-gradient"></span>
          <span>High AGP</span>
        </div>
      </div>
    `;
  }

  function renderPromoScatter() {
    const host = document.getElementById("promoDetailScatter");
    const data = promoDetailState.data;
    if (!host || !data || !window.React || !window.Recharts) return;
    const h = window.React.createElement;
    const { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ReferenceLine, Tooltip } = window.Recharts;
    const all = (data.scatter.points || []);
    const points = all.filter((p) => promoDetailState.scatterScope === "all" ? true : p.isInWeek);
    if (!points.length) {
      host.innerHTML = `<p class="pd-empty">No NCRC points for the current filter.</p>`;
      promoScatterReactRoot = null;
      promoScatterReactHost = null;
      return;
    }
    const sortedRevenue = points.map((p) => p.revenue).sort((a, b) => a - b);
    const sortedUnits = points.map((p) => p.units).sort((a, b) => a - b);
    const medianRevenue = sortedRevenue[Math.floor(sortedRevenue.length / 2)];
    const medianUnits = sortedUnits[Math.floor(sortedUnits.length / 2)];
    const agpMin = Math.min(...points.map((p) => p.agpRate || 0));
    const agpMax = Math.max(...points.map((p) => p.agpRate || 0));
    const agpRange = agpMax - agpMin || 1;
    const shadeFor = (rate) => {
      const ratio = ((rate || 0) - agpMin) / agpRange;
      const r = Math.round(184 - ratio * 152);
      const g = Math.round(214 - ratio * 162);
      const b = Math.round(243 - ratio * 144);
      return `rgb(${r}, ${g}, ${b})`;
    };
    const dotShape = (props) => {
      const { cx, cy, payload } = props;
      if (cx == null || cy == null) return null;
      return h("circle", { cx, cy, r: 4, fill: shadeFor(payload.agpRate), fillOpacity: 0.92, stroke: "rgba(15,23,42,0.18)", strokeWidth: 0.5 });
    };
    const Tip = (props) => {
      if (!props.active || !props.payload || !props.payload[0]) return null;
      const point = props.payload[0].payload;
      return h("div", { className: "pd-scatter-tip" },
        h("strong", null, point.ncrc),
        h("span", null, point.vendor),
        h("span", null, `Rev $${(point.revenue / 1000).toFixed(0)}K / Units ${(point.units / 1000).toFixed(0)}K`),
        h("span", null, `AGP $${(point.agp / 1000).toFixed(0)}K (${(point.agpRate * 100).toFixed(1)}%)`)
      );
    };
    const chart = h(ResponsiveContainer, { width: "100%", height: "100%" },
      h(ScatterChart, { margin: { top: 8, right: 10, bottom: 22, left: 8 } },
        h(CartesianGrid, { stroke: "rgba(110,127,150,0.16)", strokeDasharray: "3 4" }),
        h(XAxis, { type: "number", dataKey: "revenue", tick: { fill: "#66758c", fontSize: 9 }, tickLine: false, axisLine: { stroke: "rgba(102,117,140,0.24)" }, tickFormatter: (value) => `$${(value / 1000).toFixed(0)}K` }),
        h(YAxis, { type: "number", dataKey: "units", tick: { fill: "#66758c", fontSize: 9 }, tickLine: false, width: 38, axisLine: { stroke: "rgba(102,117,140,0.24)" }, tickFormatter: (value) => `${(value / 1000).toFixed(0)}K` }),
        h(ZAxis, { type: "number", dataKey: "agp", range: [40, 40] }),
        h(ReferenceLine, { x: medianRevenue, stroke: "#94a3b8", strokeDasharray: "4 4" }),
        h(ReferenceLine, { y: medianUnits, stroke: "#94a3b8", strokeDasharray: "4 4" }),
        h(Tooltip, { content: Tip, cursor: { stroke: "rgba(102,117,140,0.28)", strokeDasharray: "3 4" } }),
        h(Scatter, { data: points, shape: dotShape, isAnimationActive: false })
      )
    );
    if (!promoScatterReactRoot || promoScatterReactHost !== host) {
      promoScatterReactHost = host;
      promoScatterReactRoot = window.ReactDOM.createRoot(host);
    }
    promoScatterReactRoot.render(chart);
  }

  function renderExplainPanel(offer) {
    const n = offer.narrative || {};
    return `
      <article class="pd-narrative">
        <span class="pd-narrative-eyebrow">WHY THIS PROMOTION?</span>
        <h2 class="pd-narrative-title">${escapeHtml(n.title || offer.label)}</h2>
        <p class="pd-narrative-subtitle">${escapeHtml(n.subtitle || "")}</p>
        ${n.recommendation ? `<p class="pd-narrative-recommendation"><strong>Recommendation:</strong> ${escapeHtml(n.recommendation)}</p>` : ""}
        <h3 class="pd-narrative-heading">The short version</h3>
        <p class="pd-narrative-body">${escapeHtml(n.shortVersion || "")}</p>
        ${n.onSurface ? `
          <h3 class="pd-narrative-heading">${escapeHtml(n.onSurface.title)}</h3>
          <ul class="pd-narrative-list">${n.onSurface.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
        ` : ""}
        ${n.whyNotPicking ? `
          <h3 class="pd-narrative-heading">${escapeHtml(n.whyNotPicking.title)}</h3>
          <ul class="pd-narrative-list">${n.whyNotPicking.bullets.map((b) => typeof b === "string" ? `<li>${escapeHtml(b)}</li>` : `<li><strong>${escapeHtml(b.label)}</strong> ${escapeHtml(b.detail)}</li>`).join("")}</ul>
        ` : ""}
        ${n.whySafeCall ? `
          <h3 class="pd-narrative-heading">${escapeHtml(n.whySafeCall.title)}</h3>
          <ul class="pd-narrative-list">${n.whySafeCall.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
        ` : ""}
        ${n.crossItemEffects ? `
          <h3 class="pd-narrative-heading">${escapeHtml(n.crossItemEffects.title)}</h3>
          <ul class="pd-narrative-list">${n.crossItemEffects.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
        ` : ""}
        ${n.whatWeTested ? `<h3 class="pd-narrative-heading">What we tested</h3><p class="pd-narrative-body">${escapeHtml(n.whatWeTested)}</p>` : ""}
        ${n.wouldReconsiderIf ? `<h3 class="pd-narrative-heading">${escapeHtml(n.wouldReconsiderIf.title)}</h3><p class="pd-narrative-body">${escapeHtml(n.wouldReconsiderIf.text)}</p>` : ""}
      </article>
    `;
  }

  // ----------------------------------------------------------- event wiring

  function closePlanPopover() {
    const popover = document.getElementById("planCellPopover");
    if (popover) popover.hidden = true;
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      // Period click in metrics view — expand into 4 weekly columns inline.
      const planPeriodBtn = event.target.closest("[data-plan-period]");
      if (planPeriodBtn) {
        const p = Number(planPeriodBtn.dataset.planPeriod);
        planState.expandedPlanPeriod = planState.expandedPlanPeriod === p ? null : p;
        renderPromoTable();
        return;
      }
      // Close expanded period
      if (event.target.closest("[data-plan-period-close]")) {
        planState.expandedPlanPeriod = null;
        renderPromoTable();
        return;
      }
      // Toggle view (Divisions / Vendors)
      const viewBtn = event.target.closest("[data-promo-view]");
      if (viewBtn) {
        planState.promoView = viewBtn.dataset.promoView;
        renderPromoTable();
        return;
      }
      // Toggle plan / metrics mode
      const modeBtn = event.target.closest("[data-plan-mode]");
      if (modeBtn) {
        planState.promoMode = modeBtn.dataset.planMode;
        renderPromoTable();
        return;
      }
      // Plan objective (Sales / Units / AGP) — drives the displayed plan.
      const objBtn = event.target.closest("[data-plan-objective]");
      if (objBtn) {
        planState.objective = objBtn.dataset.planObjective;
        renderPromoTable();
        return;
      }
      // "+ Compare scenarios" toggle (and the close × inside the panel).
      if (event.target.closest("[data-plan-compare-toggle]")) {
        planState.comparePlans = !planState.comparePlans;
        renderPromoTable();
        return;
      }
      // Within-compare-panel scope switch (Across scenarios / Within scenario).
      const scopeBtn = event.target.closest("[data-compare-scope]");
      if (scopeBtn) {
        planState.compareScope = scopeBtn.dataset.compareScope;
        renderPromoTable();
        return;
      }
      // Scenario chip click → switch the active scenario.
      const scenarioChip = event.target.closest("[data-scenario-id]");
      if (scenarioChip && !event.target.closest("[data-scenario-remove]")) {
        planState.activeScenario = scenarioChip.dataset.scenarioId;
        renderPromoTable();
        return;
      }
      // Scenario chip remove (custom scenarios only).
      const scenarioRemove = event.target.closest("[data-scenario-remove]");
      if (scenarioRemove) {
        event.stopPropagation();
        const id = scenarioRemove.dataset.scenarioRemove;
        planState.scenarios = planState.scenarios.filter((s) => s.id !== id);
        if (planState.activeScenario === id) planState.activeScenario = "default";
        renderPromoTable();
        return;
      }
      // "Create additional scenarios +" — opens / closes the popover.
      if (event.target.closest("#openScenarioBuilder")) {
        toggleScenarioPopover();
        return;
      }
      // Popover close button + outside-click are wired separately.
      if (event.target.closest("[data-close-scenario]")) {
        closeScenarioPopover();
        return;
      }
      // "Enter custom values" — toggles between sliders and number inputs.
      if (event.target.closest("#scenarioCustomToggle")) {
        scenarioFormState.custom = !scenarioFormState.custom;
        syncScenarioForm();
        return;
      }
      // Download Spreadsheet button.
      if (event.target.closest("[data-download-sheet]")) {
        downloadScenarioSpreadsheet();
        return;
      }
      // Expand/collapse divisions (either external button or inline marker row)
      if (event.target.closest("#togglePromoPlan") || event.target.closest("[data-toggle-promo-expand]")) {
        planState.isPromoPlanExpanded = !planState.isPromoPlanExpanded;
        renderPromoTable();
        return;
      }
      // Promo cell click → popover
      const promoCell = event.target.closest("[data-promo-cell]");
      if (promoCell) {
        event.stopPropagation();
        renderPromoOverlay(promoCell);
        return;
      }
      // Popover close
      if (event.target.closest("[data-close-plan-popover]")) {
        closePlanPopover();
        return;
      }
      // Launch promotion detail screen
      const launchLink = event.target.closest("[data-launch-promo-detail]");
      if (launchLink) {
        event.preventDefault();
        const ds = launchLink.dataset;
        closePlanPopover();
        openPromoDetailScreen({
          group: ds.launchGroup,
          groupIndex: Number(ds.launchGroupIndex || 0),
          view: ds.launchView,
          period: ds.launchPeriod,
          weeks: (ds.launchWeeks || "").split(",").map(Number).filter(Boolean),
          store: ds.launchStore,
          retail: Number(ds.launchRetail || 0),
          buying: Number(ds.launchBuying || 0),
          digital: ds.launchDigital
        });
        return;
      }
      // Override flip toggle
      const overrideToggle = event.target.closest("[data-pd-override-toggle]");
      if (overrideToggle) {
        event.preventDefault();
        promoDetailState.overrideMode = overrideToggle.dataset.pdOverrideToggle === "open";
        // If the user is opening override from a specific PA's link,
        // pre-fill the form with that PA so the affordance is contextual.
        if (promoDetailState.overrideMode && overrideToggle.dataset.pa) {
          promoDetailState.overrideForm = {
            ...promoDetailState.overrideForm,
            priceArea: overrideToggle.dataset.pa
          };
        }
        if (!promoDetailState.overrideMode) {
          promoDetailState.overrideResult = null;
        }
        renderPromoDetailScreen();
        return;
      }
      // "Use this promotion" — snapshot the override into a custom offer
      // for the targeted PA(s) and exit override mode.
      if (event.target.closest("[data-pd-override-use]")) {
        useOverrideAsCustom();
        return;
      }
      // Clear a saved custom override for a PA.
      const clearBtn = event.target.closest("[data-pd-override-clear]");
      if (clearBtn) {
        event.preventDefault();
        clearCustomOverride(clearBtn.dataset.pdOverrideClear);
        return;
      }
      // Reset override form
      if (event.target.closest("[data-pd-override-reset]")) {
        event.preventDefault();
        promoDetailState.overrideForm = freshPromoForm({ priceArea: promoDetailState.overrideForm.priceArea });
        promoDetailState.overrideResult = null;
        renderPromoDetailScreen();
        return;
      }
      // Reliability info icon — show small popover
      const infoBtn = event.target.closest("[data-pd-score-info]");
      if (infoBtn) {
        event.stopPropagation();
        const offerId = infoBtn.dataset.pdScoreInfo;
        const data = promoDetailState.data;
        const offer = data && data.offers && (data.offersByPriceArea || [])
          .flatMap((pa) => pa.offers)
          .find((o) => o.id === offerId)
          || (data && data.offers && data.offers.top && data.offers.top.find((o) => o.id === offerId));
        showReliabilityPopover(infoBtn, offer);
        return;
      }
      // Expand / collapse alternate tactics for a price area
      const paToggle = event.target.closest("[data-pd-pa-toggle]");
      if (paToggle) {
        event.stopPropagation();
        const pa = paToggle.dataset.pdPaToggle;
        promoDetailState.expandedPriceAreas[pa] = !promoDetailState.expandedPriceAreas[pa];
        renderPromoDetailScreen();
        return;
      }
      // Review screen: "More" toggle on a priced row reveals the inline
      // Ad details + Tag details sub-rows for that NCRC|PA.
      const reviewExpand = event.target.closest("[data-pd-review-expand]");
      if (reviewExpand) {
        event.stopPropagation();
        const key = reviewExpand.dataset.pdReviewExpand;
        if (!promoDetailState.reviewExpanded) promoDetailState.reviewExpanded = {};
        promoDetailState.reviewExpanded[key] = !promoDetailState.reviewExpanded[key];
        renderPromoDetailScreen();
        return;
      }
      // Review screen: sort capsule (Sales / Units / AGP velocity)
      // re-orders the promoted-items section. Reuses velocityKind so the
      // recommendations and review screens share the sort affordance.
      const reviewSort = event.target.closest("[data-pd-review-sort]");
      if (reviewSort) {
        event.stopPropagation();
        promoDetailState.velocityKind = reviewSort.dataset.pdReviewSort;
        renderPromoDetailScreen();
        return;
      }
      // Promo detail offer row — clicking a row picks that offer as the
      // chosen one for its Price Area. Updates both the per-PA selection
      // (drives totals + right panel) and the focus markers used to
      // highlight the active row.
      const offerRow = event.target.closest("[data-promo-offer-id]");
      if (offerRow && !event.target.closest("[data-promo-offer-toggle]")) {
        const offerId = offerRow.dataset.promoOfferId;
        const priceArea = offerRow.dataset.pdPriceArea;
        if (priceArea) {
          promoDetailState.priceAreaSelections[priceArea] = offerId;
        }
        promoDetailState.selectedOfferId = offerId;
        promoDetailState.selectedPriceArea = priceArea || promoDetailState.selectedPriceArea;
        renderPromoDetailScreen();
        return;
      }
      // Promo detail right-tab
      const promoTab = event.target.closest("[data-promo-detail-tab]");
      if (promoTab) {
        promoDetailState.rightTab = promoTab.dataset.promoDetailTab;
        renderPromoDetailScreen();
        return;
      }
      // Plan-mode flow toggle: system recommended vs manual override.
      const planModeBtn = event.target.closest("[data-pd-plan-mode]");
      if (planModeBtn) {
        promoDetailState.planMode = planModeBtn.dataset.pdPlanMode;
        // Leaving/entering manual resets any open override + side panel so
        // the flow starts clean.
        promoDetailState.overrideMode = false;
        promoDetailState.overrideResult = null;
        promoDetailState.sidePanelOpen = false;
        // Seed a sensible default depth so the builder doesn't preview
        // "$0.00 off" before the planner types a discount.
        if (promoDetailState.planMode === "manual" && promoDetailState.overrideForm.promoPrice === "") {
          promoDetailState.overrideForm.promoPrice = "1.00";
        }
        renderPromoDetailScreen();
        return;
      }
      // Override scope segmented (all price areas vs one).
      const ovrScopeBtn = event.target.closest("[data-pd-override-scope]");
      if (ovrScopeBtn) {
        if (ovrScopeBtn.dataset.pdOverrideScope === "all") {
          promoDetailState.overrideForm.priceArea = "";
        } else {
          const d = promoDetailState.data;
          promoDetailState.overrideForm.priceArea =
            (d && d.offersByPriceArea && d.offersByPriceArea[0] && d.offersByPriceArea[0].priceArea) || "";
        }
        renderPromoDetailScreen();
        return;
      }
      // Manual builder: stamp the default tactic across every price area.
      if (event.target.closest("[data-pd-manual-apply]")) {
        promoDetailState.manualDefault = { ...promoDetailState.overrideForm, priceArea: "" };
        renderPromoDetailScreen();
        return;
      }
      // Manual builder: clear every per-PA exception.
      if (event.target.closest("[data-pd-manual-reset]")) {
        promoDetailState.customOverrides = {};
        renderPromoDetailScreen();
        return;
      }
      // Manual builder: open the inline editor for a PA (seed from its
      // current custom values, else the shared default).
      const manualEdit = event.target.closest("[data-pd-manual-edit]");
      if (manualEdit) {
        event.preventDefault();
        const pa = manualEdit.dataset.pdManualEdit;
        const custom = promoDetailState.customOverrides[pa];
        const def = promoDetailState.manualDefault || promoDetailState.overrideForm;
        promoDetailState.manualEditPa = pa;
        promoDetailState.manualEditForm = custom && custom._formSnapshot
          ? { ...freshPromoForm(), ...custom._formSnapshot }
          : { ...freshPromoForm(), ...def };
        renderPromoDetailScreen();
        return;
      }
      // Manual builder: cancel inline edit.
      if (event.target.closest("[data-pd-manual-edit-cancel]")) {
        promoDetailState.manualEditPa = null;
        promoDetailState.manualEditForm = null;
        renderPromoDetailScreen();
        return;
      }
      // Manual builder: save inline edit as this PA's custom override.
      if (event.target.closest("[data-pd-manual-edit-save]")) {
        const pa = promoDetailState.manualEditPa;
        if (pa) {
          const offer = buildCustomOfferFromValues(pa, promoDetailState.manualEditForm || {});
          promoDetailState.customOverrides[pa] = offer;
          promoDetailState.priceAreaSelections[pa] = offer.id;
        }
        promoDetailState.manualEditPa = null;
        promoDetailState.manualEditForm = null;
        renderPromoDetailScreen();
        return;
      }
      // Review ad/tag: override a specific price area (break it out from
      // the default). The PA is encoded on the button as "NCRC|PA".
      const adexcAdd = event.target.closest("[data-pd-adexc-add]");
      if (adexcAdd) {
        event.preventDefault();
        const parts = adexcAdd.dataset.pdAdexcAdd.split("|");
        const ncrc = parts[0];
        const pa = parts[1];
        if (pa) {
          if (!promoDetailState.reviewEdits.adExceptions[ncrc]) promoDetailState.reviewEdits.adExceptions[ncrc] = [];
          if (!promoDetailState.reviewEdits.adExceptions[ncrc].includes(pa)) {
            promoDetailState.reviewEdits.adExceptions[ncrc].push(pa);
          }
          renderPromoDetailScreen();
        }
        return;
      }
      // Review ad/tag: remove a per-price-area exception.
      const adexcRemove = event.target.closest("[data-pd-adexc-remove]");
      if (adexcRemove) {
        event.preventDefault();
        const parts = adexcRemove.dataset.pdAdexcRemove.split("|");
        const ncrc = parts[0];
        const pa = parts[1];
        const list = promoDetailState.reviewEdits.adExceptions[ncrc] || [];
        promoDetailState.reviewEdits.adExceptions[ncrc] = list.filter((p) => p !== pa);
        const k = `${ncrc}|${pa}`;
        if (promoDetailState.reviewEdits.adDetails) delete promoDetailState.reviewEdits.adDetails[k];
        if (promoDetailState.reviewEdits.tagDetails) delete promoDetailState.reviewEdits.tagDetails[k];
        renderPromoDetailScreen();
        return;
      }
      // Velocity scope buttons
      const velocityBtn = event.target.closest("[data-pd-velocity-kind]");
      if (velocityBtn) {
        setVelocityScope({ velocityKind: velocityBtn.dataset.pdVelocityKind });
        return;
      }
      const binBtn = event.target.closest("[data-pd-bin]");
      if (binBtn) {
        setVelocityScope({ bin: Number(binBtn.dataset.pdBin) });
        return;
      }
      // Worklist item
      const worklistItem = event.target.closest("[data-pd-worklist-index]");
      if (worklistItem) {
        gotoWorklistIndex(Number(worklistItem.dataset.pdWorklistIndex));
        return;
      }
      // Clear the worklist search.
      if (event.target.closest("[data-pd-worklist-search-clear]")) {
        promoDetailState.worklistSearch = "";
        renderPromoDetailScreen();
        const inp = document.querySelector("[data-pd-worklist-search]");
        if (inp) inp.focus();
        return;
      }
      // Worklist scroll arrows (scrollbar is hidden).
      const wlScroll = event.target.closest("[data-pd-worklist-scroll]");
      if (wlScroll) {
        const list = document.querySelector(".pd-worklist-list");
        if (list) {
          const step = Math.max(120, list.clientHeight * 0.8);
          list.scrollBy({ top: wlScroll.dataset.pdWorklistScroll === "up" ? -step : step, behavior: "smooth" });
        }
        return;
      }
      // Typeahead toggle / pick
      const typeaheadToggle = event.target.closest("[data-pd-typeahead-toggle]");
      if (typeaheadToggle) {
        const kind = typeaheadToggle.dataset.pdTypeaheadToggle;
        promoDetailState.openTypeahead = promoDetailState.openTypeahead === kind ? null : kind;
        renderPromoDetailScreen();
        return;
      }
      const typeaheadPick = event.target.closest("[data-pd-typeahead-pick]");
      if (typeaheadPick) {
        setPromoTypeahead(typeaheadPick.dataset.pdTypeaheadPick, typeaheadPick.dataset.value, { label: typeaheadPick.dataset.label });
        return;
      }
      // Click outside typeahead closes it
      if (promoDetailState.openTypeahead && !event.target.closest("[data-pd-typeahead]")) {
        promoDetailState.openTypeahead = null;
        renderPromoDetailScreen();
      }
      // Action buttons
      const actionBtn = event.target.closest("[data-pd-action]");
      if (actionBtn) {
        // The overlay backdrop carries data-pd-action="close-side" but the
        // inner panel does not — so a click inside the panel never resolves
        // to the close action because closest() walks up from the actual
        // click target. The panel marker guards against future nesting that
        // might break this assumption.
        if (event.target.closest("[data-pd-stop-propagation]") && !event.target.closest("button[data-pd-action]")) {
          return;
        }
        const action = actionBtn.dataset.pdAction;
        if (action === "open-side") {
          promoDetailState.sidePanelOpen = true;
          renderPromoDetailScreen();
          return;
        }
        if (action === "close-side") {
          promoDetailState.sidePanelOpen = false;
          renderPromoDetailScreen();
          return;
        }
        if (action === "cancel") {
          const overlay = document.getElementById("promoDetailOverlay");
          if (overlay) overlay.hidden = true;
        } else if (action === "skip") {
          advanceWorklist();
        } else if (action === "add") {
          addCurrentSelectionToCart({ andAdvance: false });
        } else if (action === "add-next") {
          addCurrentSelectionToCart({ andAdvance: true });
        } else if (action === "finalize") {
          // Enter review mode — show the full review table. The user
          // commits the publish from the review screen's button.
          promoDetailState.reviewing = true;
          renderPromoDetailScreen();
        } else if (action === "review-cancel") {
          promoDetailState.reviewing = false;
          renderPromoDetailScreen();
        } else if (action === "review-publish") {
          promoDetailState.reviewing = false;
          finalizePromoCart();
        } else if (action === "remove-cart") {
          removeFromCart(actionBtn.dataset.cartKey);
        } else if (action === "dismiss-baselined") {
          dismissFinalizeResult();
        }
        return;
      }
      // Drawer overlay close
      const closeBtn = event.target.closest("[data-close='promoDetailOverlay']");
      if (closeBtn) {
        const overlay = document.getElementById("promoDetailOverlay");
        if (overlay) overlay.hidden = true;
        return;
      }
      // Click on backdrop closes drawer
      if (event.target.id === "promoDetailOverlay") {
        event.target.hidden = true;
      }
    });

    document.addEventListener("input", (event) => {
      // Worklist search — filters the list live; re-render then restore
      // focus + caret so typing stays smooth.
      const wlSearch = event.target.closest("[data-pd-worklist-search]");
      if (wlSearch) {
        promoDetailState.worklistSearch = wlSearch.value;
        renderPromoDetailScreen();
        const inp = document.querySelector("[data-pd-worklist-search]");
        if (inp) { inp.focus(); const v = inp.value; try { inp.setSelectionRange(v.length, v.length); } catch (e) {} }
        return;
      }
      const ti = event.target.closest("[data-pd-typeahead-input]");
      if (ti) {
        const kind = ti.dataset.pdTypeaheadInput;
        const value = ti.value;
        if (kind === "vendor") promoDetailState.vendorInput = value;
        else if (kind === "priceArea") promoDetailState.priceAreaInput = value;
        else if (kind === "ncrc") promoDetailState.ncrcInput = value;
        if (!promoDetailState.openTypeahead) promoDetailState.openTypeahead = kind;
        renderPromoDetailScreen();
        return;
      }
      const ovrField = event.target.closest("[data-pd-override-field]");
      if (ovrField) {
        const field = ovrField.dataset.pdOverrideField;
        promoDetailState.overrideForm[field] = ovrField.type === "checkbox" ? ovrField.checked : ovrField.value;
        if (field === "apexAllowanceId") renderPromoDetailScreen();
        return;
      }
      // Manual builder inline-edit fields (scratch form, no popup).
      const meField = event.target.closest("[data-pd-manual-edit-field]");
      if (meField) {
        if (!promoDetailState.manualEditForm) promoDetailState.manualEditForm = {};
        const field = meField.dataset.pdManualEditField;
        promoDetailState.manualEditForm[field] = meField.type === "checkbox" ? meField.checked : meField.value;
        if (field === "apexAllowanceId") renderPromoDetailScreen();
        return;
      }
      // Review-screen inline edits. Supports both flat keys
      // (data-pd-review-field="adPage") used for ad page / display text
      // and nested sections (data-pd-review-section="adDetails" +
      // data-pd-review-field="headline") used for the More-row form.
      const reviewField = event.target.closest("[data-pd-review-field]");
      if (reviewField) {
        const field = reviewField.dataset.pdReviewField;
        const key = reviewField.dataset.pdReviewKey;
        const section = reviewField.dataset.pdReviewSection;
        if (section) {
          if (!promoDetailState.reviewEdits[section]) promoDetailState.reviewEdits[section] = {};
          if (!promoDetailState.reviewEdits[section][key]) promoDetailState.reviewEdits[section][key] = {};
          promoDetailState.reviewEdits[section][key][field] = reviewField.value;
        } else {
          if (!promoDetailState.reviewEdits[field]) promoDetailState.reviewEdits[field] = {};
          promoDetailState.reviewEdits[field][key] = reviewField.value;
        }
        // Don't re-render — that would blow away focus on the input.
        return;
      }
    });

    document.addEventListener("change", (event) => {
      const ovrField = event.target.closest("[data-pd-override-field]");
      if (ovrField) {
        const field = ovrField.dataset.pdOverrideField;
        promoDetailState.overrideForm[field] = ovrField.type === "checkbox" ? ovrField.checked : ovrField.value;
        if (field === "apexAllowanceId") renderPromoDetailScreen();
        return;
      }
      const meField = event.target.closest("[data-pd-manual-edit-field]");
      if (meField) {
        if (!promoDetailState.manualEditForm) promoDetailState.manualEditForm = {};
        const field = meField.dataset.pdManualEditField;
        promoDetailState.manualEditForm[field] = meField.type === "checkbox" ? meField.checked : meField.value;
        if (field === "apexAllowanceId") renderPromoDetailScreen();
        return;
      }
      const planCat = event.target.closest("[data-plan-category]");
      if (planCat) {
        planState.category = planCat.value;
        renderPromoTable();
        return;
      }
    });

    document.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-pd-override-submit]");
      if (!form) return;
      event.preventDefault();
      submitOverrideForecast();
    });

    document.addEventListener("change", (event) => {
      const scatterToggle = event.target.closest("[data-scatter-week-scope]");
      if (scatterToggle) {
        promoDetailState.scatterScope = scatterToggle.value;
        renderPromoScatter();
        return;
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePlanPopover();
        if (promoDetailState.openTypeahead) {
          promoDetailState.openTypeahead = null;
          renderPromoDetailScreen();
        }
      }
    });

    // Re-render on resize (column layout depends on viewport width).
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (planState.data) renderPromoTable();
      }, 180);
    });

    // Close popover when clicking outside it.
    document.addEventListener("click", (event) => {
      const popover = document.getElementById("planCellPopover");
      if (!popover || popover.hidden) return;
      if (event.target.closest(".plan-callout") || event.target.closest("[data-promo-cell]")) return;
      closePlanPopover();
    });

    // Close scenario popover when clicking outside it (or the launcher).
    document.addEventListener("click", (event) => {
      const popover = document.getElementById("scenarioPopover");
      if (!popover || popover.hidden) return;
      if (event.target.closest("#scenarioPopover")) return;
      if (event.target.closest("#openScenarioBuilder")) return;
      closeScenarioPopover();
    });

    // Sliders + number inputs in the scenario popover. We delegate
    // 'input' rather than per-lever wiring so the form survives re-render.
    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!target || !target.closest("#scenarioForm")) return;
      if (target.id === "scenarioName") { scenarioFormState.name = target.value; return; }
      if (target.id === "scenarioObjective") { scenarioFormState.objective = target.value; return; }
      if (target.id === "scenarioVendor") { scenarioFormState.vendor = target.value; return; }
      const leverIds = { vlcLever: "vlc", cpiLever: "cpi", depthLever: "depth", freqLever: "freq",
                         vlcCustom: "vlc", cpiCustom: "cpi", depthCustom: "depth", freqCustom: "freq" };
      const key = leverIds[target.id];
      if (!key) return;
      const value = Number(target.value);
      if (Number.isFinite(value)) {
        scenarioFormState.levers[key] = value;
        syncScenarioForm();
      }
    });

    // Form submit — persist the scenario, switch to it, close popover.
    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!form || form.id !== "scenarioForm") return;
      event.preventDefault();
      addScenarioFromForm();
    });

    // Re-anchor the scenario popover on resize so it follows its button.
    window.addEventListener("resize", () => {
      const popover = document.getElementById("scenarioPopover");
      if (popover && !popover.hidden) positionScenarioPopover();
    });
  }

  // ------------------------------------------------- scenario popover helpers

  function toggleScenarioPopover() {
    const popover = document.getElementById("scenarioPopover");
    if (!popover) return;
    if (popover.hidden) openScenarioPopover();
    else closeScenarioPopover();
  }
  function openScenarioPopover() {
    const popover = document.getElementById("scenarioPopover");
    const launcher = document.getElementById("openScenarioBuilder");
    if (!popover) return;
    scenarioFormState.open = true;
    scenarioFormState.name = "";
    scenarioFormState.objective = planState.objective || "sales";
    scenarioFormState.vendor = "All Vendors";
    scenarioFormState.levers = { ...SCENARIO_DEFAULTS };
    scenarioFormState.custom = false;
    populateScenarioVendorOptions();
    syncScenarioForm();
    popover.hidden = false;
    if (launcher) launcher.setAttribute("aria-expanded", "true");
    positionScenarioPopover();
    // Focus the name field once the popover is visible.
    requestAnimationFrame(() => {
      const nameInput = document.getElementById("scenarioName");
      if (nameInput) nameInput.focus();
    });
  }
  function closeScenarioPopover() {
    const popover = document.getElementById("scenarioPopover");
    const launcher = document.getElementById("openScenarioBuilder");
    if (popover) popover.hidden = true;
    if (launcher) launcher.setAttribute("aria-expanded", "false");
    scenarioFormState.open = false;
  }
  function positionScenarioPopover() {
    const popover = document.getElementById("scenarioPopover");
    const launcher = document.getElementById("openScenarioBuilder");
    if (!popover || !launcher) return;
    const rect = launcher.getBoundingClientRect();
    // Anchor below the button, right-aligned. Keep on-screen.
    const popWidth = popover.offsetWidth || 380;
    const right = Math.max(16, window.innerWidth - rect.right);
    popover.style.top = `${rect.bottom + 10}px`;
    popover.style.right = `${right}px`;
    popover.style.left = "auto";
    const arrow = popover.querySelector(".scenario-popover-arrow");
    if (arrow) {
      const desiredArrowRight = Math.min(Math.max(20, rect.width / 2 - 7), popWidth - 28);
      arrow.style.right = `${desiredArrowRight}px`;
    }
  }
  function populateScenarioVendorOptions() {
    const select = document.getElementById("scenarioVendor");
    if (!select) return;
    const vendors = (planState.data && planState.data.vendors) || [];
    const current = scenarioFormState.vendor || "All Vendors";
    select.innerHTML = `<option value="All Vendors">All Vendors</option>` +
      vendors.map((v) => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join("");
    select.value = current;
  }
  function syncScenarioForm() {
    const popover = document.getElementById("scenarioPopover");
    if (!popover || popover.hidden) return;
    const f = scenarioFormState;
    setInputValue("scenarioName", f.name);
    setInputValue("scenarioObjective", f.objective);
    setInputValue("scenarioVendor", f.vendor);
    const customToggle = document.getElementById("scenarioCustomToggle");
    if (customToggle) customToggle.setAttribute("aria-pressed", String(f.custom));
    [["vlc", "vlcOutput", "vlcCustom", "vlcLever"],
     ["cpi", "cpiOutput", "cpiCustom", "cpiLever"],
     ["depth", "depthOutput", "depthCustom", "depthLever"],
     ["freq", "freqOutput", "freqCustom", "freqLever"]].forEach(([key, outId, custId, rangeId]) => {
      const out = document.getElementById(outId);
      const cust = document.getElementById(custId);
      const range = document.getElementById(rangeId);
      const value = f.levers[key];
      if (out) out.textContent = key === "vlc" ? value.toFixed(2) : String(Math.round(value));
      if (cust) { cust.value = value; cust.hidden = !f.custom; }
      if (out) out.hidden = f.custom;
      if (range) {
        range.value = value;
        const rec = SCENARIO_RECS[key];
        const lever = range.closest(".scenario-lever");
        if (rec && lever) {
          const minPct = ((rec.min - rec.lo) / (rec.hi - rec.lo)) * 100;
          const maxPct = ((rec.max - rec.lo) / (rec.hi - rec.lo)) * 100;
          lever.style.setProperty("--rec-min", `${minPct}%`);
          lever.style.setProperty("--rec-max", `${maxPct}%`);
        }
      }
    });
  }
  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el && el.value !== String(value)) el.value = value;
  }
  function addScenarioFromForm() {
    const f = scenarioFormState;
    const trimmedName = (f.name || "").trim();
    const fallbackIdx = planState.scenarios.filter((s) => !s.builtIn).length + 1;
    const name = trimmedName || `Scenario ${fallbackIdx}`;
    const id = `scenario-${Date.now().toString(36)}`;
    planState.scenarios.push({
      id, name, builtIn: false,
      description: `Custom scenario · VLC $${f.levers.vlc.toFixed(2)} · CPI ${f.levers.cpi} bps`,
      levers: { ...f.levers },
      vendor: f.vendor,
      objective: f.objective
    });
    planState.activeScenario = id;
    closeScenarioPopover();
    renderPromoTable();
  }

  // ---------------------------------------------- download spreadsheet

  // Generates a CSV deal-sheet for the active scenario.
  //
  // Layout:
  //   Row 1   — context labels (Start Period, End Period, Department,
  //             Desk, Vendor, Category, NCRC Count, Optimization × 5)
  //   Row 2   — context values
  //   Row 3   — blank separator
  //   Row 4   — data table headers (Division first, then a–g, then for
  //             every allowance a "<name> %" column followed by a
  //             "<name> $" column with the calculated value)
  //   Row 5+  — one row per NCRC across every in-scope division/vendor
  //
  // The merchant edits only VLC and Dead Net Cost. Every allowance % is
  // assumed identical across NCRCs in the scope so we don't need a logic
  // sub-row; the column header itself + the % cell carry the assumption.
  //
  // Buying allowance % split (vs VLC):
  //   Off Invoice 28% · Bill Back 2% · Price Break 0%      → Total Buying 30%
  //   Freight 1.5% · Other 0%
  // Retail allowance % split (vs VLC):
  //   Ship to Store 0% · Transaction 8%                    → Total Retail 8%
  // Other:
  //   Flat 2% · New Item 0% (both % of VLC)
  function downloadScenarioSpreadsheet() {
    if (!planState.data) { window.alert("Plan data hasn't finished loading yet."); return; }
    const scenario = currentScenario();
    const inVendorView = planState.promoView === "vendor";
    const groups = inVendorView ? (planState.data.vendors || []) : (planState.data.divisions || []);

    const categoryLabel = planState.category || "All";
    const objectiveKey = scenario.objective || planState.objective || "sales";
    // Map our internal objective → the optimization checkbox row.
    const optimisationFlags = {
      "Sales":   objectiveKey === "sales",
      "Units":   objectiveKey === "units",
      "Gross $": objectiveKey === "agp",
      "Gross %": false,
      "HHs":     false
    };
    const optimisationNames = Object.keys(optimisationFlags);

    // Tally NCRCs across scope for the context block's "NCRC Count".
    let totalNcrcCount = 0;
    groups.forEach((g) => { totalNcrcCount += inferNcrcCount(g); });

    // We hand-render a styled Excel-flavoured HTML workbook so the
    // download opens in Excel / Sheets with proper column widths,
    // header chrome, currency / percent formats, and a yellow tint on
    // the three editable fields (VLC, Promo freq, Dead Net Cost). Plain
    // CSV would lose all of that — the file looks bare and the user
    // can't tell at a glance which cells they're supposed to touch.
    const html = buildScenarioWorkbookHtml({
      scenario,
      categoryLabel,
      optimisationFlags,
      optimisationNames,
      totalNcrcCount,
      inVendorView
    });
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel" });
    const filename = `52wk-plan_${scenario.name.replace(/[^A-Za-z0-9._-]+/g, "-")}_${new Date().toISOString().slice(0, 10)}.xls`;
    triggerDownload(blob, filename);
  }

  // Excel-as-HTML workbook. The `mso-number-format` declarations tell
  // Excel to display the stored number as currency / percent without
  // distorting the underlying value, so the user can keep editing.
  function buildScenarioWorkbookHtml(ctx) {
    const { scenario, categoryLabel, optimisationFlags, optimisationNames, totalNcrcCount, inVendorView } = ctx;

    // Column widths in px — Division / NCRC desc on the left are wide,
    // editable cluster (VLC / Promo freq / Dead Net Cost) sits right
    // after the identifiers, then allowance %/ $ pairs run to the right.
    const widths = [
      120, /* A  Division */
      95,  /* B  NCRC ID */
      210, /* C  NCRC desc */
      100, /* D  AWS $ */
      90,  /* E  VLC (editable) */
      80,  /* F  Price */
      90,  /* G  Promo freq (editable) */
      120, /* H  Vendor */
      100, /* I  Dead Net Cost (editable) */
      72, 90,   /* J K  Off Invoice % / $ */
      72, 90,   /* L M  Bill Back % / $ */
      72, 90,   /* N O  Price Break % / $ */
      80, 100,  /* P Q  Total Buying % / $ */
      72, 90,   /* R S  Freight % / $ */
      72, 90,   /* T U  Other % / $ */
      100,      /* V    Net Cost */
      72, 90,   /* W X  Ship to Store % / $ */
      72, 90,   /* Y Z  Transaction % / $ */
      80, 100,  /* AA AB  Total Retail % / $ */
      72, 90,   /* AC AD  Flat % / $ */
      72, 90    /* AE AF  New Item % / $ */
    ];
    const colgroup = widths.map((w) => `<col style="width:${w}px" />`).join("");

    // ---- context block ----
    const ctxLabels = [
      "Start Period", "End Period", "Department", "Desk",
      "Vendor", "Category", "NCRC Count"
    ];
    const ctxValues = [
      "2026 P1", "2026 P13",
      "370 - Deli/Prepared Foods", "Promo Desk",
      inVendorView ? "Per row" : "All Vendors",
      categoryLabel, totalNcrcCount
    ];

    const optimisationLabelCells = optimisationNames
      .map((n) => `<th class="opt-label">${escapeHtml(n)}</th>`).join("");
    const optimisationValueCells = optimisationNames
      .map((n) => optimisationFlags[n]
        ? `<td class="opt-on">&#10003;</td>`
        : `<td class="opt-off">&nbsp;</td>`).join("");

    // ---- data table headers ----
    // Column 0-31 in order. Editable cluster lives early (positions 4, 6, 8).
    const dataHeader = [
      "Division", "a. NCRC ID", "b. NCRC desc", "c. NCRC AWS $",
      "d. Cost (VLC)", "e. Price", "f. Promo frequency", "g. Vendor",
      "Dead Net Cost",
      "Off Invoice %", "Off Invoice $",
      "Bill Back %",   "Bill Back $",
      "Price Break %", "Price Break $",
      "Total Buying %", "Total Buying $",
      "Freight %",     "Freight $",
      "Other %",       "Other $",
      "Net Cost",
      "Ship to Store %", "Ship to Store $",
      "Transaction %",   "Transaction $",
      "Total Retail %", "Total Retail $",
      "Flat %", "Flat $",
      "New Item %", "New Item $"
    ];
    // Editable columns (yellow): VLC=4, Promo freq=6, Dead Net Cost=8.
    const editableCols = new Set([4, 6, 8]);
    // Subtotal columns (blue tint): Total Buying %/ $ (15,16),
    // Net Cost (21), Total Retail %/ $ (26,27).
    const subtotalCols = new Set([15, 16, 21, 26, 27]);

    const dataHeaderRow = dataHeader
      .map((h, idx) => {
        const klass = editableCols.has(idx)
          ? "th-editable"
          : subtotalCols.has(idx) ? "th-subtotal" : "th-data";
        return `<th class="${klass}">${escapeHtml(h)}</th>`;
      }).join("");

    // ---- data rows ----
    const scenarioFreq = Math.round(scenario.levers.freq);
    const inVendorView_ = inVendorView; // capture for closures
    const PCT = {
      offInvoice: 0.28, billBack: 0.02, priceBreak: 0.00,
      freight: 0.015,   other: 0.00,
      shipToStore: 0.00, transaction: 0.08,
      flat: 0.02,        newItem: 0.00
    };
    // Pre-computed subtotal % since the splits are the same for every
    // NCRC in scope (per the merchant: assume identical for now).
    const PCT_BUYING_TOTAL = PCT.offInvoice + PCT.billBack + PCT.priceBreak;
    const PCT_RETAIL_TOTAL = PCT.shipToStore + PCT.transaction;

    const rowsHtml = (planState.promoView === "vendor"
      ? (planState.data.vendors || [])
      : (planState.data.divisions || []))
      .map((groupName, gIdx) => {
        const cell = readAggregateCell(groupName, Array.from({ length: 52 }, (_, i) => i + 1));
        if (!cell) return "";
        const ncrcCount = inferNcrcCount(groupName);
        const aws = cell.sales * 1e6 / 52;
        const vlc = cell.vlc;
        const price = cell.basePrice;
        const offInv = vlc * PCT.offInvoice;
        const billBack = vlc * PCT.billBack;
        const priceBreak = vlc * PCT.priceBreak;
        const totalBuying = offInv + billBack + priceBreak;
        const freight = vlc * PCT.freight;
        const other = vlc * PCT.other;
        const netCost = vlc - totalBuying - freight - other;
        const shipToStore = vlc * PCT.shipToStore;
        const transaction = vlc * PCT.transaction;
        const totalRetail = shipToStore + transaction;
        const deadNet = netCost - totalRetail;
        const flat = vlc * PCT.flat;
        const newItem = vlc * PCT.newItem;
        const vendorLabel = inVendorView_ ? groupName : "All Vendors";
        let inner = "";
        for (let i = 1; i <= ncrcCount; i++) {
          const ncrcId = `NC${(groupName.length * 7 + i * 137).toString(36).toUpperCase().slice(-4)}${i.toString().padStart(2, "0")}`;
          const ncrcDesc = `${groupName} item ${i}`;
          const awsItem = aws / ncrcCount;
          const altKlass = ((gIdx + i) % 2) ? "row-alt" : "";
          const cells = [
            cellText(groupName, "c-div " + altKlass),
            cellText(ncrcId, "c-ncrc " + altKlass),
            cellText(ncrcDesc, "c-desc " + altKlass),
            cellMoney(awsItem, "c-readonly " + altKlass),
            cellMoney(vlc, "c-editable " + altKlass),
            cellMoney(price, "c-readonly " + altKlass),
            cellNumber(scenarioFreq, "c-editable " + altKlass),
            cellText(vendorLabel, "c-readonly " + altKlass),
            cellMoney(deadNet, "c-editable " + altKlass),
            cellPct(PCT.offInvoice, "c-pct " + altKlass),
            cellMoney(offInv, "c-calc " + altKlass),
            cellPct(PCT.billBack, "c-pct " + altKlass),
            cellMoney(billBack, "c-calc " + altKlass),
            cellPct(PCT.priceBreak, "c-pct " + altKlass),
            cellMoney(priceBreak, "c-calc " + altKlass),
            cellPct(PCT_BUYING_TOTAL, "c-sub-pct " + altKlass),
            cellMoney(totalBuying, "c-sub-money " + altKlass),
            cellPct(PCT.freight, "c-pct " + altKlass),
            cellMoney(freight, "c-calc " + altKlass),
            cellPct(PCT.other, "c-pct " + altKlass),
            cellMoney(other, "c-calc " + altKlass),
            cellMoney(netCost, "c-sub-money " + altKlass),
            cellPct(PCT.shipToStore, "c-pct " + altKlass),
            cellMoney(shipToStore, "c-calc " + altKlass),
            cellPct(PCT.transaction, "c-pct " + altKlass),
            cellMoney(transaction, "c-calc " + altKlass),
            cellPct(PCT_RETAIL_TOTAL, "c-sub-pct " + altKlass),
            cellMoney(totalRetail, "c-sub-money " + altKlass),
            cellPct(PCT.flat, "c-pct " + altKlass),
            cellMoney(flat, "c-calc " + altKlass),
            cellPct(PCT.newItem, "c-pct " + altKlass),
            cellMoney(newItem, "c-calc " + altKlass)
          ];
          inner += `<tr>${cells.join("")}</tr>`;
        }
        return inner;
      }).join("");

    const styles = `
      body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; }
      table { border-collapse: collapse; }
      td, th {
        padding: 6px 8px;
        border: 1px solid #cdd6e5;
        vertical-align: middle;
        white-space: nowrap;
      }

      /* ---------------- Top context block (rows 1-2) ---------------- */
      th.ctx-label,
      th.opt-label {
        background: #1e3a8a; color: #ffffff;
        font-weight: 700; font-size: 10pt;
        letter-spacing: 0.02em;
        padding: 7px 10px;
      }
      th.ctx-label { text-align: left; }
      th.opt-label { text-align: center; }
      td.ctx-value {
        background: #ffffff; color: #0f172a;
        font-weight: 600; font-size: 10pt;
        padding: 7px 10px;
      }
      td.opt-on  { background: #d1fadf; color: #14532d; text-align: center; font-weight: 700; }
      td.opt-off { background: #f6f8fc; color: #94a3b8; text-align: center; }

      /* ---------------- Yellow instruction strip (row 3) ---------------- */
      td.intro {
        background: #fff7d6; color: #6b4d00;
        font-size: 9.5pt; font-weight: 600;
        padding: 8px 12px; border: 1px solid #e3c970;
      }
      td.intro b { color: #4a3300; }

      /* ---------------- Data table headers (row 4) ---------------- */
      th.th-data,
      th.th-editable,
      th.th-subtotal {
        font-weight: 700; font-size: 9pt;
        text-align: center;
        padding: 8px 6px;
        letter-spacing: 0.01em;
      }
      th.th-data {
        background: #0f1e3a; color: #ffffff;
        border-color: #0a1428;
      }
      th.th-editable {
        background: #f4b400; color: #1a1300;
        border-color: #c98f00;
      }
      th.th-subtotal {
        background: #3b5fd2; color: #ffffff;
        border-color: #2944a2;
      }

      /* ---------------- Data body cells ---------------- */
      td.c-div   { font-weight: 700; color: #0f172a; background: #f6f8fc; }
      td.c-ncrc  { font-weight: 600; color: #1e3a8a; background: #ffffff; }
      td.c-desc  { color: #0f172a; background: #ffffff; }
      td.c-readonly {
        color: #475569; background: #ffffff; text-align: right;
        mso-number-format: "\\$#\\,##0.00";
      }
      td.c-editable {
        background: #fff4c2;
        color: #1a1300;
        font-weight: 700;
        text-align: right;
        border: 1px solid #f4b400;
        mso-number-format: "\\$#\\,##0.00";
      }
      td.c-pct {
        color: #475569; background: #f6f8fc;
        text-align: right;
        font-size: 9.5pt;
        mso-number-format: "0.0%";
      }
      td.c-calc {
        color: #1f2937; background: #ffffff;
        text-align: right;
        font-size: 9.5pt;
        mso-number-format: "\\$#\\,##0.00";
      }
      /* Subtotal pair (Total Buying % / $, Net Cost, Total Retail % / $). */
      td.c-sub-pct,
      td.c-sub-money {
        background: #d8e3f7;
        color: #0f1e3a;
        font-weight: 700;
        text-align: right;
        border: 1px solid #9eb4e0;
      }
      td.c-sub-pct   { mso-number-format: "0.0%"; }
      td.c-sub-money { mso-number-format: "\\$#\\,##0.00"; }

      /* Alternating row tint for readability across the wide table */
      .row-alt.c-div { background: #eef2f8; }
      .row-alt.c-ncrc, .row-alt.c-desc, .row-alt.c-readonly,
      .row-alt.c-editable, .row-alt.c-calc { background: #f9fafd; }
      .row-alt.c-editable { background: #ffeebb; }
      .row-alt.c-pct { background: #eef2f8; }
      .row-alt.c-sub-pct, .row-alt.c-sub-money { background: #c8d6f1; }
    `;
    const introCols = widths.length;
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="application/vnd.ms-excel; charset=utf-8" />
<title>52 Week Promotional Plan — ${escapeHtml(scenario.name)}</title>
<!--[if gte mso 9]><xml>
  <x:ExcelWorkbook>
    <x:ExcelWorksheets>
      <x:ExcelWorksheet>
        <x:Name>Plan</x:Name>
        <x:WorksheetOptions>
          <x:DisplayGridlines/>
          <x:FreezePanes/>
          <x:FrozenNoSplit/>
          <x:SplitHorizontal>4</x:SplitHorizontal>
          <x:TopRowBottomPane>4</x:TopRowBottomPane>
          <x:ActivePane>2</x:ActivePane>
        </x:WorksheetOptions>
      </x:ExcelWorksheet>
    </x:ExcelWorksheets>
  </x:ExcelWorkbook>
</xml><![endif]-->
<style>${styles}</style>
</head>
<body>
<table>
  <colgroup>${colgroup}</colgroup>

  <tr>${ctxLabels.map((l) => `<th class="ctx-label">${escapeHtml(l)}</th>`).join("")}${optimisationLabelCells}</tr>
  <tr>${ctxValues.map((v) => `<td class="ctx-value">${escapeHtml(String(v))}</td>`).join("")}${optimisationValueCells}</tr>

  <tr><td class="intro" colspan="${introCols}"><b>Editable cells</b> are tinted yellow: <b>d. Cost (VLC)</b>, <b>f. Promo frequency</b>, and <b>Dead Net Cost</b>. Everything else is provided for context — % columns show the assumed split (same for all NCRCs in this scope), $ columns are calculated from VLC × %.</td></tr>

  <tr>${dataHeaderRow}</tr>

  ${rowsHtml}
</table>
</body>
</html>`;
  }

  // Cell helpers — keep the mso-number-format inline so Excel applies
  // the right display format on each cell type.
  function cellText(value, klass) {
    return `<td class="${klass}">${escapeHtml(String(value))}</td>`;
  }
  function cellNumber(value, klass) {
    return `<td class="${klass}" style="mso-number-format:'0'">${Number(value)}</td>`;
  }
  function cellMoney(value, klass) {
    return `<td class="${klass}" style="mso-number-format:'$#,##0.00'">${Number(value).toFixed(2)}</td>`;
  }
  function cellPct(value, klass) {
    // Value is stored as a fraction (0.28). Excel renders as "28.0%"
    // via the percent format, and keeps the underlying 0.28 for math.
    return `<td class="${klass}" style="mso-number-format:'0.0%'">${value}</td>`;
  }
  function csvCell(value) {
    const s = value == null ? "" : String(value);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    requestAnimationFrame(() => { document.body.removeChild(a); URL.revokeObjectURL(url); });
  }
  // Group → rough NCRC count. The plan API doesn't expose this directly,
  // so we synthesise a stable count from the group name length so each
  // row in the CSV is reproducible (handy for spreadsheet diffing).
  function inferNcrcCount(groupName) {
    const base = 4 + (groupName ? groupName.length % 5 : 0);
    return Math.max(3, Math.min(8, base));
  }

  // ----------------------------------------------------------------- init

  async function loadPromoPlan() {
    try {
      const response = await fetch("/api/promo-plan", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      planState.data = payload.data || payload;
    } catch (error) {
      console.warn("Failed to load 52-week plan", error);
      const target = document.getElementById("weeklyPlanTable");
      if (target) target.innerHTML = `<div class="promo-detail-error"><strong>Could not load 52-week plan.</strong><p>${escapeHtml(error.message)}</p></div>`;
      return;
    }
    renderPromoTable();
  }

  function init() {
    bindEvents();
    loadPromoPlan();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
