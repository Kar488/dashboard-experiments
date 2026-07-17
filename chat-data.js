// ============================================================================
// Merchant Q&A — Best-Response Layer data
// ----------------------------------------------------------------------------
// This file is the demo's stand-in for the production "answer contract"
// artifact: ~25 answer archetypes (one per question intent family), each
// carrying the response template, the data lineage (tables / columns /
// derived metrics from table_schema + time & metric registries), the
// reasoning recipe, and the known gaps. All 133 merchant questions map to
// an archetype + extracted entities. In production the same artifact feeds
// tier 1 (registry exact match), tier 2 (embedding retrieval) and tier 3
// (fast-LLM contract inference) of the best-response cascade.
// ============================================================================

window.ChatData = (() => {

  // ---- Shared lineage fragments (real tables/columns from table_schema_1.json)
  const T = {
    sca: { table: "sales_cost_allowances", grain: "UPC x store x day" },
    item: { table: "item_hierarchy", grain: "UPC x division" },
    fcal: { table: "fiscal_calendar", grain: "calendar day" },
    pcal: { table: "promo_calendar", grain: "calendar day x division" },
    promo: { table: "master_promo_genie_discount_depth", grain: "offer x UPC x store" },
    ppromo: { table: "master_primary_promo_data", grain: "UPC x store x promo week" },
    redeem: { table: "master_promo_redemption", grain: "offer x UPC x store x day" },
    ads: { table: "master_ads", grain: "UPC x store x ad version" },
    line7: { table: "line7_nopa", grain: "offer x vendor x category x week" },
    apm: { table: "allowance_promo_map", grain: "NOPA x UPC x promo" },
    bog: { table: "master_bill_out_gross", grain: "UPC x facility x day (TY/LY paired)" },
    comp: { table: "competitor_price", grain: "UPC x competitor x check date" },
    share: { table: "market_share", grain: "dept x group x category x class x week" },
    store: { table: "store_hierarchy", grain: "facility" },
    price: { table: "item_store_price", grain: "UPC x store x price-change window" },
    ipg: { table: "item_price_group", grain: "UPC x price group (NCRC)" },
    clip: { table: "master_promo_clip", grain: "offer x day" }
  };

  // ---- Derived metrics; status: registry = defined in metric_registry_dev,
  //      computed = derivable from base columns, gap = not derivable today.
  const M = {
    sales: { name: "Sales $", formula: "SUM(sca.NET_AMT)", status: "registry" },
    units: { name: "Units", formula: "SUM(sca.ITEM_QTY)", status: "registry" },
    agp: { name: "AGP $", formula: "SUM(sca.AGP_AMT)", status: "registry" },
    agpRate: { name: "AGP %", formula: "SUM(AGP_AMT) / SUM(NET_AMT)", status: "registry" },
    agpUnit: { name: "AGP per Unit", formula: "SUM(AGP_AMT) / SUM(ITEM_QTY)", status: "registry" },
    aiv: { name: "AIV", formula: "SUM(NET_AMT) / SUM(ITEM_QTY)", status: "registry" },
    cogs: { name: "COGS", formula: "SUM(sca.COST_OF_GOODS_AMT)", status: "registry" },
    cogsUnit: { name: "COGS per Unit", formula: "SUM(COST_OF_GOODS_AMT) / SUM(ITEM_QTY)", status: "registry" },
    deadnet: { name: "Deadnet Cost per Unit", formula: "SUM(sca.DEADNET_COST) / SUM(ITEM_QTY)", status: "registry" },
    vlc: { name: "Vendor List Cost (VLC)", formula: "SUM(sca.VENDOR_LIST_COST)", status: "registry" },
    markdown: { name: "Markdown $", formula: "SUM(sca.TOTAL_MARKDOWN_AMT) — stored negative; more negative = more spend (POL_014)", status: "registry" },
    allowTotal: { name: "Total Allowances", formula: "SUM(sca.TOTAL_ALLOWANCES)", status: "registry" },
    allowBuckets: { name: "Allowance buckets", formula: "OFF_INVOICE / BILLBACK / SCAN / REDEMPTION / HEADER_FLAT+ITEM_FLAT / TRADE_DISCOUNT / PRICE_BREAK ...", status: "registry" },
    spendRate: { name: "Spend Rate", formula: "SUM(TOTAL_ALLOWANCES) / SUM(VENDOR_LIST_COST)", status: "registry" },
    line7: { name: "Line 7 $", formula: "SUM(line7_nopa.Line7_AMT) by Final_Allowance_Type", status: "registry" },
    takeRate: { name: "Take Rate", formula: "SUM(redeem.REDEMPTION_COUNT) / SUM(sca.ITEM_QTY) over promo window", status: "computed" },
    baseline: { name: "Baseline Units", formula: "AVG weekly ITEM_QTY over non-promo weeks (promo_calendar anti-join on offer window), seasonality-adjusted", status: "computed" },
    lift: { name: "Incremental Units / % Lift", formula: "promo-week units − baseline units; lift = incremental / baseline", status: "computed" },
    roi: { name: "ROI on Funding", formula: "(incremental AGP + vendor funding) / vendor funding", status: "computed" },
    depth: { name: "Discount Depth", formula: "promo.Discount_Depth or (regular_price − promo price) / regular_price", status: "registry" },
    cpi: { name: "CPI (Competitive Price Index)", formula: "Σ(WEIGHT_SHELF_BASE_CPI × SHELF_PRC) / Σ(WEIGHT_CMP_SHELF_BASE_CPI × CMP_SHELF_PRC)", status: "registry" },
    shareD: { name: "MULO+ Dollar Share", formula: "Circana_DOLLAR_SALES / (Circana_DOLLAR_SALES + Circana_ROM_DOLLARS_MULO_PLUS)", status: "registry" },
    shareBps: { name: "Share Change (bps)", formula: "(share TY − share YA) × 10 000 — bps reserved for share metrics only (POL_007/008)", status: "registry" },
    bogGross: { name: "Bill-Out Gross", formula: "SUM(bog.RETAIL_TY − bog.COST_TY) vs LY pair columns", status: "registry" },
    offInvUnit: { name: "Off-Invoice per Unit", formula: "SUM(sca.OFF_INVOICE_ALLOWANCES) / SUM(ITEM_QTY)", status: "computed" },
    storeCount: { name: "Selling-store count", formula: "COUNT(DISTINCT sca.FACILITY_INTEGRATION_ID WHERE ITEM_QTY > 0)", status: "computed" }
  };

  // ---- Recurring gap statements
  const G = {
    baseline: { sev: "med", text: "No stored promo baseline or incremental-units column. Baseline must be modeled from non-promo weeks in sales_cost_allowances at query time (or pre-computed nightly). Until then, lift figures are estimates." },
    fundingJoin: { sev: "med", text: "Vendor funding at offer grain needs line7_nopa ⋈ allowance_promo_map (Offer_No ↔ NOPA_ID ↔ PROMOTION_ID). Join keys exist but referential completeness is unverified — some offers will not map to a NOPA." },
    holidayAttrib: { sev: "low", text: "Holiday flags exist in fiscal/promo calendars, but there is no causal attribution of lift to holiday vs tactic. Recommendation language should hedge on seasonality." },
    desk: { sev: "high", text: "\"Desk\" is not a schema entity. Closest proxy is ASM (item_hierarchy.ASM). Contract substitutes ASM and flags the substitution to the merchant." },
    quad: { sev: "med", text: "Quad labels are derivable (Sales Δ × Profit Δ quadrant: Q1 +/+, Q2 +/−, Q3 −/−, Q4 −/+) but not stored — signing each offer's quadrant needs incremental sales and incremental AGP vs baseline, so the baseline model is the dependency. Recommend pre-computing quad per offer nightly." },
    slu: { sev: "med", text: "The SLU (Store-Level Unit) build sheet — the store execution document with display construction and pricing — is not onboarded (merch execution system source). The component half IS answerable: item-group member UPCs with retail and cost by division come from item_hierarchy + sales_cost_allowances." },
    arrival: { sev: "high", text: "Arrival dates live on PO (purchase order) receiving records; the WHS/DSD PO/receiving tables are not onboarded. master_bill_out_gross carries shipped quantity only — no arrival date, and no PO-level linkage to which units carried an off-invoice allowance." },
    scanEst: { sev: "med", text: "Historical scans/Copients actuals exist (line7_nopa, master_promo_redemption), but planned/estimated values from AIM are not onboarded — actual-vs-estimate needs the AIM feed." },
    slotCycle: { sev: "med", text: "Slotting cycles are inferred from line7_nopa Final_Allowance_Type = slotting/new-item plus allowance windows — there is no explicit slotting-cycle calendar table." },
    cigWeekly: { sev: "low", text: "CIG-level weekly results require sales_cost_allowances ⋈ item_hierarchy on UPC + division, then GROUP BY COMMON_ITEM_GROUP_CD. Registry has no CIG-grain pre-aggregate, so expect heavier query cost." },
    compCoverage: { sev: "low", text: "competitor_price coverage varies by week — Walmart checks are not collected for every UPC every week. Response reports the checked-item coverage % alongside the comparison." },
    nlpPeriod: { sev: "low", text: "Time phrase resolves via time_registry_dev → fiscal_calendar predicate (all divisions share the fiscal calendar; promo weeks resolve per division via promo_calendar)." }
  };

  // ============================================================================
  // ARCHETYPES
  // ============================================================================
  const ARCHETYPES = {

    driver_decomp: {
      name: "Driver decomposition (what is driving X)",
      style: "diagnostic",
      intent: "Explain what moved a headline metric vs prior year, per General Diagnostic Framework v18: metrics table first, COGS-vs-Deadnet before any cost claim, drivers with numbers, follow-up block.",
      lineage: [
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT", "COST_OF_GOODS_AMT", "DEADNET_COST", "TOTAL_ALLOWANCES", "TOTAL_MARKDOWN_AMT", "VENDOR_LIST_COST"], why: "All headline + driver measures TY and LY" },
        { ...T.item, cols: ["CATEGORY", "VENDOR_NM", "DIVISION_NM", "ASM"], why: "Scope filter + drill entities" },
        { ...T.fcal, cols: ["FISCAL_QTR", "FISCAL_YEAR_NBR", "calendarDate_prior_year"], why: "Period + same-period-LY alignment" }
      ],
      derived: [M.agpRate, M.agpUnit, M.aiv, M.cogsUnit, M.deadnet, M.markdown, M.allowTotal],
      recipe: [
        "Resolve period via time registry; align LY with calendarDate_prior_year.",
        "Compute headline metric TY vs LY at the requested grain.",
        "Rule 3: compare COGS/unit vs Deadnet/unit movement to classify cost vs allowance problem.",
        "Rule 4: surface AGP per unit whenever AGP rate is the headline.",
        "Test remaining levers: units, AIV, markdown spend, total allowances, mix.",
        "Rank material drivers; suppress non-drivers from bullets (Rule 12/27).",
        "Emit follow-up question per material driver (Rule 22)."
      ],
      gaps: [G.nlpPeriod]
    },

    yoy_rank: {
      name: "YoY change ranking (top decliners / growers)",
      style: "list",
      intent: "Rank entities (vendor / CIG / UPC / SMIC / NCRC) by year-over-year change in a metric, decline or growth, with TY / LY / change columns.",
      lineage: [
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT", "TOTAL_ALLOWANCES", "TOTAL_FLAT_ALLOWANCES", "BILLBACK_ALLOWANCES", "OFF_INVOICE_ALLOWANCES", "VENDOR_LIST_COST"], why: "Metric TY/LY at transaction grain" },
        { ...T.item, cols: ["VENDOR_NM", "COMMON_ITEM_GROUP_CD", "NATIONAL_COMMON_RETAIL_CD", "CATEGORY", "CATEGORY_ID", "ASM", "DEPARTMENT_NM", "GROUP_ID"], why: "Ranking entity + scope" },
        { ...T.fcal, cols: ["FISCAL_QTR", "FISCAL_YEAR_NBR", "calendarDate_prior_year"], why: "Period alignment" }
      ],
      derived: [M.agp, M.agpRate, M.spendRate, M.allowBuckets, M.offInvUnit],
      recipe: [
        "Resolve scope (division / dept / category / ASM) and period.",
        "Aggregate metric TY and LY per entity; compute change and % change (Rule 17).",
        "Rank by absolute change in the requested direction (Rule 19).",
        "Cut at requested N, or contribution stop-threshold when no N given (POL_016).",
        "Attach one-line cause where a secondary metric explains the move."
      ],
      gaps: [G.nlpPeriod]
    },

    allowance_breakdown: {
      name: "Allowance investigation (totals vs PY, by type / category / vendor)",
      style: "report",
      intent: "Total allowance or Line 7 investment vs prior year with the decline located by allowance type, category, vendor or NOPA — the 'go get my money back' view.",
      lineage: [
        { ...T.line7, cols: ["Line7_AMT", "Final_Allowance_Type", "Parent_Vendor_NM", "Category_NM", "ASM", "Offer_No", "Offer_Desc", "Week", "Year"], why: "Offer-level vendor funding by allowance type" },
        { ...T.sca, cols: ["TOTAL_ALLOWANCES", "TOTAL_FLAT_ALLOWANCES", "TOTAL_BUYING_ALLOWANCES", "SCAN_ALLOWANCES", "REDEMPTION_ALLOWANCES"], why: "Transaction-side allowance actuals for cross-check" },
        { ...T.apm, cols: ["NOPA_ID", "VENDOR_NM", "FLAT_ALLOWANCE_AMT", "ALLOWANCE_TYPE_CD", "PROMO_START_DT", "PROMO_END_DT"], why: "NOPA linkage for deal-level recovery" },
        { ...T.fcal, cols: ["FISCAL_PERIOD_NBR", "FISCAL_QTR", "FISCAL_YEAR_NBR"], why: "Period alignment" }
      ],
      derived: [M.line7, M.allowBuckets, M.spendRate],
      recipe: [
        "Pull Line7_AMT TY vs LY at the requested scope.",
        "Break the net change by Final_Allowance_Type, then by category / vendor.",
        "Apply materiality threshold when the question sets one (e.g., >$10K in both years).",
        "Map declining offers to NOPA_IDs via allowance_promo_map for follow-up with the vendor.",
        "Flag offers present LY with no TY counterpart — lapsed programs are the usual recovery target."
      ],
      gaps: [G.fundingJoin, G.nlpPeriod]
    },

    promo_effectiveness: {
      name: "Promo effectiveness (best tactic / optimal price)",
      style: "exemplar",
      intent: "Which tactic or promoted price won on incremental units / KPI, with full promo metadata, funding and an action recommendation — the flagship template.",
      lineage: [
        { ...T.ppromo, cols: ["PRIMARY_PROMO_TACTIC_CIG", "PRIMARY_PROMO_DESC_CIG", "PRIMARY_DISCOUNT_DEPTH_CIG", "PRIMARY_PROMO_MIN_BUY_CIG", "PROMOTION_WEEK_NBR"], why: "One primary tactic per item-week (removes overlap ambiguity)" },
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT", "TOTAL_MARKDOWN_AMT"], why: "Promo-week and baseline-week actuals" },
        { ...T.redeem, cols: ["REDEMPTION_COUNT", "ACTUAL_MARKDOWN", "PROMO_NET_AMT", "PROMO_MARGIN", "DISCOUNT_DEPTH"], why: "Offer-level results" },
        { ...T.ads, cols: ["PAGE_NBR", "PROMOTION_VEHICLE_NM", "PROMOTION_PRICE_AMT", "REG_RETAIL_PRICE_AMT"], why: "Ad support (feature/page) per tactic" },
        { ...T.line7, cols: ["Line7_AMT", "Final_Allowance_Type", "Offer_No"], why: "Vendor funding behind each tactic" },
        { ...T.pcal, cols: ["PROMOTION_WEEK_NBR", "DIVISION_ID"], why: "Division-specific promo weeks" }
      ],
      derived: [M.baseline, M.lift, M.roi, M.depth, M.takeRate],
      recipe: [
        "Enumerate promo weeks for the item/CIG scope from master_primary_promo_data (primary tactic per week).",
        "Group weeks by tactic + effective price point.",
        "Model baseline units from non-promo weeks (seasonality-adjusted).",
        "Incremental units = promo actuals − baseline; lift % = incremental / baseline.",
        "Attach markdown cost, vendor funding (line7 ⋈ allowance_promo_map) and ad support per tactic.",
        "Rank tactics on incremental units; compute funding rate and ROI for the winner.",
        "Recommend repeat/adjust with margin-efficiency caveats."
      ],
      gaps: [G.baseline, G.fundingJoin, G.holidayAttrib]
    },

    promo_detail: {
      name: "Promo detail lookup (what ran, week by week)",
      style: "report",
      intent: "List promotions for a CIG / UPC / NCRC over a period: tactic, description, discount, min buy, weekly sales / margin / take-rate.",
      lineage: [
        { ...T.promo, cols: ["PROMO_TACTIC", "PROMO_DESC", "DISCOUNT_TYPE", "DISCOUNT_TIER_AMT", "PROMO_MIN_BUY", "Discount_Depth", "PROMO_START_DATE", "PROMO_END_DATE"], why: "Offer mechanics" },
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT"], why: "Weekly results" },
        { ...T.redeem, cols: ["REDEMPTION_COUNT", "PROMO_NET_AMT"], why: "Redemptions for take rate" },
        { ...T.item, cols: ["COMMON_ITEM_GROUP_CD", "NATIONAL_COMMON_RETAIL_CD", "ITEM_DSC"], why: "CIG/NCRC → UPC expansion" },
        { ...T.pcal, cols: ["PROMOTION_WEEK_NBR", "DIVISION_ID"], why: "Promo-week bucketing per division" }
      ],
      derived: [M.takeRate, M.aiv, M.depth],
      recipe: [
        "Expand CIG/NCRC to UPC list via item_hierarchy for the division.",
        "Join offers overlapping the period; bucket by division promo week.",
        "Aggregate weekly sales / units / AGP; compute AIV and take rate where asked.",
        "Return one row per promo week × offer with mechanics + results."
      ],
      gaps: [G.cigWeekly, G.nlpPeriod]
    },

    promo_week_top: {
      name: "Best promo week / biggest promo-tied result",
      style: "exemplar",
      intent: "Which single promo week (or which CIG in a given week) delivered the most sales/units tied to a promotion.",
      lineage: [
        { ...T.ppromo, cols: ["PROMOTION_WEEK_NBR", "PRIMARY_PROMO_TACTIC_CIG", "PRIMARY_PROMO_DESC_CIG", "COMMON_ITEM_GROUP_CD", "COMMON_ITEM_GROUP_DSC"], why: "Promo weeks + tactic per CIG" },
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT"], why: "Weekly revenue/units" },
        { ...T.pcal, cols: ["PROMOTION_WEEK_NBR", "PROMOTION_YEAR"], why: "Week windows per division" }
      ],
      derived: [M.sales, M.units, M.lift],
      recipe: [
        "Aggregate promo-flagged sales by CIG × promo week over the period.",
        "Rank and take top week(s); attach tactic metadata and timeframe dates.",
        "Compare against the item's average promo week for context."
      ],
      gaps: [G.cigWeekly]
    },

    market_share: {
      name: "Market share (Circana MULO+)",
      style: "list",
      intent: "Share level, share change, or ranked categories on MULO+/Food, TY vs YA — Circana syndicated table only, never joined to internal tables.",
      lineage: [
        { ...T.share, cols: ["Circana_DOLLAR_SALES", "Circana_DOLLAR_SALES_YA", "Circana_ROM_DOLLARS_MULO_PLUS", "Circana_ROM_DOLLARS_MULO_PLUS_YA", "Circana_UNIT_SALES", "CATEGORY_NM", "DEPARTMENT_NM", "FISCAL_WEEK_NBR", "FISCAL_YEAR_NBR", "ASM"], why: "Albertsons vs rest-of-market panel data (do-not-join table)" }
      ],
      derived: [M.shareD, M.shareBps],
      recipe: [
        "Filter division / category / ASM scope and period weeks.",
        "Share = ACI $ / (ACI $ + ROM MULO+ $); same for YA.",
        "Change expressed in basis points (share metrics only, POL_007/008).",
        "Rank categories by share change when the ask is a ranking."
      ],
      gaps: [{ sev: "low", text: "market_share is a standalone Circana feed — cannot be joined to internal sales for reconciliation; totals will differ from POS." }]
    },

    price_compare: {
      name: "Competitive price / CPI comparison",
      style: "list",
      intent: "Shelf price vs a named competitor (typically Walmart) or CPI positioning vs primary competitor, per item or category.",
      lineage: [
        { ...T.comp, cols: ["SHELF_PRC", "CMP_SHELF_PRC", "REG_RTL_PRC", "CMP_REG_RTL_PRC", "COMPETITOR_NM", "COMP_TYPE", "PRIMARY_COMPETITOR_IND", "CHECK_DATE", "WEIGHT_SHELF_BASE_CPI", "WEIGHT_CMP_SHELF_BASE_CPI"], why: "Price checks + CPI weights" },
        { ...T.item, cols: ["ITEM_DSC", "CATEGORY", "CLASS", "OWN_BRANDS_IND"], why: "Scope + own-brand split" }
      ],
      derived: [M.cpi],
      recipe: [
        "Filter checks to the period and competitor (COMP_TYPE = Walmart when asked).",
        "Latest check per UPC × facility within the window.",
        "Compute item-level gap and weighted CPI; split Own Brand vs National Brand when asked.",
        "Report coverage (% of class UPCs with a valid competitor check)."
      ],
      gaps: [G.compCoverage]
    },

    price_cost_change: {
      name: "Price / cost change detection",
      style: "list",
      intent: "Items or CIGs where retail price, list cost, VLC or COGS moved in a window; price-area detail; cost-change reports.",
      lineage: [
        { ...T.price, cols: ["all price-change windows (start/end dates)"], why: "Retail price changes by item × store" },
        { ...T.sca, cols: ["VENDOR_LIST_COST", "COST_OF_GOODS_AMT", "ITEM_QTY"], why: "VLC / COGS per unit TY vs LY" },
        { ...T.item, cols: ["ITEM_DSC", "CATEGORY", "NATIONAL_COMMON_RETAIL_CD"], why: "Scope + NCRC rollup" },
        { ...T.comp, cols: ["PRICE_AREA_CD", "PRICE_AREA_301"], why: "Price-area splits" }
      ],
      derived: [M.vlc, M.cogsUnit, { name: "Reg Retail", formula: "item_store_price effective window; distinct per division (schema note)", status: "registry" }],
      recipe: [
        "Detect price-change events in the window from item_store_price.",
        "Compute VLC/unit and COGS/unit deltas vs LY from sales_cost_allowances.",
        "Roll to the asked grain (item / CIG / NCRC / price area).",
        "Flag items where cost rose but retail did not follow (margin exposure)."
      ],
      gaps: [G.nlpPeriod]
    },

    store_perf: {
      name: "Store-level performance",
      style: "list",
      intent: "Sales by store (optionally within a district / department / category), TY vs LY, thresholds and counts.",
      lineage: [
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "FACILITY_INTEGRATION_ID"], why: "Store-grain sales" },
        { ...T.store, cols: ["district", "city", "store id"], why: "District filter + display attributes" },
        { ...T.item, cols: ["CATEGORY", "DEPARTMENT_NM"], why: "Merch scope" },
        { ...T.fcal, cols: ["FISCAL_WEEK_NBR", "FISCAL_QTR", "FISCAL_YEAR_NBR"], why: "Period" }
      ],
      derived: [M.sales],
      recipe: [
        "Filter stores to division/district via store_hierarchy.",
        "Aggregate TY and LY sales per store; compute variance.",
        "Apply threshold filter if given; sort descending; count qualifiers."
      ],
      gaps: []
    },

    store_list: {
      name: "Store roster lookup",
      style: "list",
      intent: "Plain retrieval: which stores belong to a district, with IDs and cities.",
      lineage: [{ ...T.store, cols: ["FACILITY id", "district", "city", "state"], why: "Direct dimension read" }],
      derived: [],
      recipe: ["Filter store_hierarchy by division + district; return ID and city."],
      gaps: []
    },

    upc_rank: {
      name: "UPC / item ranked list",
      style: "list",
      intent: "Top or bottom items by a metric, with optional filters (own brand, KVI, distribution < N stores, sales threshold).",
      lineage: [
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT", "FACILITY_INTEGRATION_ID"], why: "Metric + selling-store count" },
        { ...T.item, cols: ["ITEM_DSC", "OWN_BRANDS_IND", "ITEM_ROLE", "CATEGORY", "ASM"], why: "Filters (own brand, KVI = ITEM_ROLE) + labels" },
        { ...T.fcal, cols: ["period columns"], why: "Window" }
      ],
      derived: [M.agp, M.agpRate, M.storeCount],
      recipe: [
        "Apply scope + attribute filters (OWN_BRANDS_IND, ITEM_ROLE = KVI, etc.).",
        "Aggregate metric per UPC; add selling-store count when distribution-filtered.",
        "Sort, cut at N, return with descriptions."
      ],
      gaps: []
    },

    ad_content: {
      name: "Ad content & placement lookup",
      style: "report",
      intent: "What ran in the ad: front-page (PAGE_NBR = 1) items, CIGs on a given ad date, ad counts, front-page vs rest splits of sales / markdown.",
      lineage: [
        { ...T.ads, cols: ["PAGE_NBR", "AD_FIRST_EFFECTIVE_DT", "PROMOTION_VEHICLE_NM", "PROMOTION_PRICE_AMT", "REG_RETAIL_PRICE_AMT", "PROMOTION_ID", "UPC_NBR"], why: "Placement + mechanics; front page = PAGE_NBR 1" },
        { ...T.sca, cols: ["NET_AMT", "TOTAL_MARKDOWN_AMT"], why: "Sales / markdown attribution during ad window" },
        { ...T.item, cols: ["COMMON_ITEM_GROUP_CD", "COMMON_ITEM_GROUP_DSC", "DEPARTMENT_NM"], why: "CIG rollup + dept filter" },
        { ...T.pcal, cols: ["PROMOTION_WEEK_NBR"], why: "Ad week alignment" }
      ],
      derived: [M.sales, M.markdown],
      recipe: [
        "Locate ad version(s) by AD_FIRST_EFFECTIVE_DT and division.",
        "Front page = PAGE_NBR = 1; split placements front vs rest.",
        "Join sales/markdown for the ad window at the asked grain (CIG / group).",
        "For counts: DISTINCT ad vehicles in the calendar month."
      ],
      gaps: [{ sev: "low", text: "Digital-only placements share the ads table but have no PAGE_NBR; they are excluded from front-page math and called out separately." }]
    },

    markdown_by_cat: {
      name: "Markdown spend by category / week",
      style: "list",
      intent: "Weekly markdown dollars by category for an ASM scope.",
      lineage: [
        { ...T.sca, cols: ["TOTAL_MARKDOWN_AMT"], why: "Markdown actuals (negative = spend)" },
        { ...T.item, cols: ["CATEGORY", "ASM"], why: "ASM scope" },
        { ...T.fcal, cols: ["FISCAL_WEEK_NBR"], why: "Weekly buckets" }
      ],
      derived: [M.markdown],
      recipe: ["Aggregate TOTAL_MARKDOWN_AMT by category × fiscal week for the ASM; display as positive spend with sign convention noted (POL_014)."],
      gaps: []
    },

    bog_drill: {
      name: "Bill-Out Gross loss drill (SMIC → vendor → NCRC)",
      style: "diagnostic",
      intent: "Where BOG is eroding, drilled SMIC → vendor → NCRC, with reg retail, list cost, off-invoice per unit and BOG TY vs LY; isolate the off-invoice decliners.",
      lineage: [
        { ...T.bog, cols: ["RETAIL_TY/LY", "COST_TY/LY", "COST_TY_IB/LY_IB", "SHIPPED_QTY_TY/LY"], why: "BOG KPIs with paired TY/LY (BOG-only per schema note)" },
        { ...T.sca, cols: ["OFF_INVOICE_ALLOWANCES", "VENDOR_LIST_COST", "ITEM_QTY"], why: "Off-invoice per unit and list cost" },
        { ...T.item, cols: ["CATEGORY_ID (SMIC)", "VENDOR_NM", "NATIONAL_COMMON_RETAIL_CD", "ASM", "DEPARTMENT_NM"], why: "Drill path SMIC → vendor → NCRC" },
        { ...T.price, cols: ["regular retail"], why: "Reg retail display" }
      ],
      derived: [M.bogGross, M.offInvUnit, M.deadnet],
      recipe: [
        "Compute BOG (retail − cost) TY vs LY at SMIC level; keep decliners.",
        "Drill declining SMICs to vendor, then vendor to NCRC.",
        "For flagged NCRCs pull reg retail, unit list cost, off-invoice per unit, BOG both years.",
        "Rank by off-invoice-per-unit decline — that is the vendor-conversation list."
      ],
      gaps: [{ sev: "med", text: "master_bill_out_gross must not be mixed with actual sales/cost — cross-checking BOG vs POS margin requires a deliberate two-table presentation, not a join." }]
    },

    ncrc_detail: {
      name: "NCRC / price-group detail",
      style: "report",
      intent: "Contents and performance of a price group: member UPCs, sales vs YA, deadnet by division, own-brand vs national splits.",
      lineage: [
        { ...T.ipg, cols: ["price group id", "description", "start/end dates"], why: "NCRC membership windows" },
        { ...T.item, cols: ["NATIONAL_COMMON_RETAIL_CD", "NATIONAL_COMMON_RETAIL_CD_DSC", "ITEM_DSC", "OWN_BRANDS_IND", "VENDOR_NM"], why: "Members + attributes" },
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "DEADNET_COST", "AGP_AMT"], why: "Performance + deadnet" }
      ],
      derived: [M.deadnet, M.sales],
      recipe: [
        "Expand NCRC to member UPCs (division-filtered).",
        "Aggregate the asked measures per UPC or per division.",
        "For deadnet-by-division: MIN(deadnet per unit) per division with the division label."
      ],
      gaps: []
    },

    canned_report: {
      name: "Named operational report",
      style: "report",
      intent: "Pre-shaped reports the desk already knows by name: Vendor Performance, Vendor Scorecard, Cost Change, Price Change, CIG BOG Compression.",
      lineage: [
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT", "TOTAL_ALLOWANCES", "VENDOR_LIST_COST"], why: "Core measures" },
        { ...T.item, cols: ["VENDOR_NM", "ASM", "CATEGORY"], why: "Report scope" },
        { ...T.bog, cols: ["RETAIL_TY/LY", "COST_TY/LY"], why: "BOG compression variants" },
        { ...T.price, cols: ["price-change windows"], why: "Price/Cost change variants" }
      ],
      derived: [M.agpRate, M.spendRate, M.bogGross],
      recipe: [
        "Resolve the named report to its stored layout (columns + sort are fixed by report id).",
        "Fill the layout for the asked scope/week.",
        "These are template plays: the contract pins report_id so NL2SQL is bypassed entirely."
      ],
      gaps: [{ sev: "med", text: "Named-report layouts live in BI today, not in the registry. Porting each layout into the archetype library makes these zero-ambiguity fast paths." }]
    },

    cannibalization: {
      name: "Cannibalization check (promo vs category)",
      style: "diagnostic",
      intent: "Did promoting brand X degrade total category/SMIC units in any promoted week — promo item lift vs rest-of-category response.",
      lineage: [
        { ...T.ppromo, cols: ["PROMOTION_WEEK_NBR", "PRIMARY_PROMO_TACTIC_CIG"], why: "Promoted weeks for the brand" },
        { ...T.sca, cols: ["ITEM_QTY", "NET_AMT"], why: "Brand + category units by week" },
        { ...T.item, cols: ["CATEGORY_ID (SMIC)", "BRAND_NM", "VENDOR_NM"], why: "Brand vs rest-of-SMIC split" }
      ],
      derived: [M.baseline, M.lift, { name: "Net category effect", formula: "Σ category units promo week − category baseline; negative while promoted brand lifts ⇒ cannibalization", status: "computed" }],
      recipe: [
        "Find weeks where the brand was on promo.",
        "Compute brand lift vs baseline AND rest-of-SMIC units vs their baseline for the same weeks.",
        "Net effect = brand incremental + rest-of-SMIC delta; flag weeks where net < 0."
      ],
      gaps: [G.baseline]
    },

    promo_frequency: {
      name: "Promo frequency loss (>depth weeks vs LY)",
      style: "list",
      intent: "NCRCs with fewer weeks above a promo-depth threshold than last year — lost frequency the vendor should re-fund.",
      lineage: [
        { ...T.promo, cols: ["Discount_Depth", "PROMO_START_DATE", "PROMO_END_DATE"], why: "Depth per offer week" },
        { ...T.item, cols: ["NATIONAL_COMMON_RETAIL_CD", "NATIONAL_COMMON_RETAIL_CD_DSC"], why: "NCRC rollup" },
        { ...T.sca, cols: ["NET_AMT", "AGP_AMT"], why: "Sales/AGP decline to sort by" },
        { ...T.pcal, cols: ["PROMOTION_WEEK_NBR"], why: "Week counting" }
      ],
      derived: [M.depth, { name: "Deep-promo week count", formula: "COUNT(DISTINCT promo weeks WHERE Discount_Depth > threshold) TY vs LY", status: "computed" }],
      recipe: [
        "Count weeks at depth > threshold per NCRC, TY and LY.",
        "Keep NCRCs where TY count < LY count.",
        "Sort by sales $ or AGP $ decline; attach lost-week counts."
      ],
      gaps: []
    },

    margin_compression: {
      name: "Margin-rate compression + like-tactic rate erosion",
      style: "report",
      intent: "NCRCs with rate compression AND AGP $ decline; week-by-week promos and margins side-by-side; like-for-like tactics dropping in gross rate (e.g., BOGO 30% → 26%).",
      lineage: [
        { ...T.sca, cols: ["AGP_AMT", "NET_AMT", "ITEM_QTY"], why: "Rate + dollars TY/LY by week" },
        { ...T.ppromo, cols: ["PRIMARY_PROMO_TACTIC_NCRC", "PRIMARY_DISCOUNT_DEPTH_NCRC", "PROMOTION_WEEK_NBR"], why: "Tactic per week for like-tactic pairing" },
        { ...T.item, cols: ["NATIONAL_COMMON_RETAIL_CD", "ASM"], why: "NCRC scope" },
        { ...T.line7, cols: ["Line7_AMT", "Final_Allowance_Type"], why: "Funding behind the rate change" }
      ],
      derived: [M.agpRate, { name: "Like-tactic rate delta", formula: "promo-week AGP% TY − AGP% LY, matched on identical PROMO_TACTIC", status: "computed" }],
      recipe: [
        "Screen NCRCs: AGP% down AND AGP $ down (both conditions).",
        "Lay out promo weeks TY vs LY side-by-side with tactic + margin rate.",
        "Match identical tactics across years; compute rate delta.",
        "Rank by rate erosion on like tactics — that is the renegotiation list."
      ],
      gaps: [G.fundingJoin]
    },

    aiv_erosion: {
      name: "AIV erosion (racing to the bottom)",
      style: "report",
      intent: "Vendors / NCRCs declining in AIV and AGP $ together, TY vs LY by week — price-and-profit erosion watchlist.",
      lineage: [
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT"], why: "AIV = NET/QTY and AGP by week" },
        { ...T.item, cols: ["VENDOR_NM", "NATIONAL_COMMON_RETAIL_CD", "ASM"], why: "Scope" },
        { ...T.fcal, cols: ["FISCAL_WEEK_NBR"], why: "Weekly series" }
      ],
      derived: [M.aiv, M.agp],
      recipe: [
        "Compute AIV and AGP $ per entity per week, TY and LY.",
        "Keep entities where both decline.",
        "Emit week-by-week side-by-side table for visual scan (per AIV diagnostic 4E: separate mix vs promo-depth vs base-price causes)."
      ],
      gaps: []
    },

    supply_chain: {
      name: "Shipped vs sold / arrival dates",
      style: "gap",
      intent: "Sell-through by store (shipped vs sold), distro arrival dates, PO-level off-invoice units.",
      lineage: [
        { ...T.bog, cols: ["SHIPPED_QTY_TY", "SHIPPED_QTY_LY"], why: "Shipped units (ordered × pack) — the only shipment measure in scope" },
        { ...T.sca, cols: ["ITEM_QTY", "NET_AMT"], why: "Sold units by store for sell-through" },
        { ...T.store, cols: ["store id", "city"], why: "By-store layout" }
      ],
      derived: [{ name: "Sell-through %", formula: "sold units / shipped units by store", status: "computed" }],
      recipe: [
        "Shipped from master_bill_out_gross; sold from sales_cost_allowances; ratio by store.",
        "AIV by store from NET/QTY to spot store-link pricing activity.",
        "Arrival dates + PO off-invoice: NOT ANSWERABLE — source not onboarded; say so and return the sell-through half."
      ],
      gaps: [G.arrival]
    },

    slotting: {
      name: "Slotting / placement-allowance cycles",
      style: "report",
      intent: "Upcoming slotting cycles vs last year by desk / SMIC / vendor, to hold vendors at-or-ahead of LY plans.",
      lineage: [
        { ...T.line7, cols: ["Final_Allowance_Type (slotting / new-item / placement)", "Parent_Vendor_NM", "Category_NM", "Week", "Year", "Line7_AMT"], why: "Slotting-type allowance earnings by week" },
        { ...T.apm, cols: ["NOPA_ID", "ALLOWANCE_TYPE_START_DT", "ALLOWANCE_TYPE_END_DT"], why: "Cycle windows" }
      ],
      derived: [M.line7],
      recipe: [
        "Filter Line 7 to slotting/placement allowance types.",
        "Project LY's next-quarter cycles forward; compare committed TY NOPAs.",
        "Rank vendors behind LY pace."
      ],
      gaps: [G.slotCycle, G.desk]
    },

    scans_copients: {
      name: "Scan & Copient history vs estimate",
      style: "gap",
      intent: "Historical scan/Copient performance for a CSD + tactic, then post-event actual vs estimate.",
      lineage: [
        { ...T.line7, cols: ["Allowance_Type (Scan, Copient/J4U)", "Line7_AMT", "Offer_No"], why: "Historical scan/Copient earnings" },
        { ...T.redeem, cols: ["REDEMPTION_COUNT", "ACTUAL_MARKDOWN"], why: "Actual redemptions" }
      ],
      derived: [M.takeRate],
      recipe: [
        "Pull historical events for the CSD + tactic; summarize scans and Copient redemptions per event.",
        "ACTUALS are answerable; the ESTIMATE side needs the AIM plan feed (gap).",
        "Post-event: compare actual redemptions vs the plan when the feed lands."
      ],
      gaps: [G.scanEst]
    },

    build_sheet: {
      name: "SLU build sheet (store execution doc)",
      style: "report",
      intent: "The store execution document for a promotional display / item group: component items and pricing, vs 2YA, across divisions. Component + pricing half is answerable; the construction-instruction document is the gap.",
      lineage: [
        { ...T.item, cols: ["COMMON_ITEM_GROUP_CD", "ITEM_DSC", "UPC_NBR"], why: "Display/item-group component expansion" },
        { ...T.sca, cols: ["VENDOR_LIST_COST", "COST_OF_GOODS_AMT", "DEADNET_COST", "ITEM_QTY"], why: "Component costs, TY and 2YA" },
        { ...T.price, cols: ["retail price windows"], why: "Component retails per division" }
      ],
      derived: [M.vlc, M.deadnet],
      recipe: [
        "Expand the SLU's item group to component UPCs per division.",
        "Attach component retail and cost (VLC / deadnet), TY vs 2YA.",
        "Repeat per division for the sister-banner comparison.",
        "The execution-document fields (fixture, placement, signage) come from the merch execution source once onboarded."
      ],
      gaps: [G.slu]
    },

    quad_review: {
      name: "Quad 2–4 promo review",
      style: "list",
      intent: "Classify last ad week's promotions into performance quadrants (Sales Δ × Profit Δ) and rank the correction targets — Quad 2 (Sales +, Profit −) and Quad 3 (Sales −, Profit −) — by negative AGP impact.",
      lineage: [
        { ...T.redeem, cols: ["PROMO_MARGIN", "ACTUAL_MARKDOWN", "PROMO_NET_AMT"], why: "Per-offer sales and margin actuals" },
        { ...T.ppromo, cols: ["PROMOTION_WEEK_NBR", "PRIMARY_PROMO_TACTIC_UPC"], why: "Last-ad-week offers + tactics" },
        { ...T.sca, cols: ["NET_AMT", "AGP_AMT", "ITEM_QTY"], why: "Baseline weeks for incremental signing" },
        { ...T.line7, cols: ["Line7_AMT", "Offer_No"], why: "Funding behind each offer" }
      ],
      derived: [
        { name: "Quad classification", formula: "Q1: incr Sales + / incr AGP + · Q2: Sales + / AGP − · Q3: Sales − / AGP − · Q4: Sales − / AGP +", status: "computed" },
        M.baseline, M.lift
      ],
      recipe: [
        "Enumerate last ad week's offers with sales and AGP actuals.",
        "Compute incremental sales and incremental AGP vs baseline for each offer.",
        "Sign the quadrant: Q2 (Sales +, Profit −) and Q3 (Sales −, Profit −) are the correction set; Q4 (Sales −, Profit +) reviewed for volume risk.",
        "Rank Quad 2–4 by most negative AGP $ impact — that is the do-not-repeat list."
      ],
      gaps: [G.quad, G.baseline]
    },

    dept_agg: {
      name: "Hierarchy aggregate / division ranking",
      style: "list",
      intent: "Straight aggregates and rankings at department / division grain (sales for dept 311; rank divisions by AGP%; depts units-down-AGP-up).",
      lineage: [
        { ...T.sca, cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT"], why: "Measures" },
        { ...T.item, cols: ["DEPARTMENT_ID", "DEPARTMENT_NM", "CATEGORY", "DIVISION_NM"], why: "Grain" },
        { ...T.fcal, cols: ["FISCAL_QTR", "FISCAL_YEAR_NBR", "FISCAL_WEEK_NBR"], why: "Window incl. first-26-weeks style ranges" }
      ],
      derived: [M.agpRate],
      recipe: ["Aggregate at the asked grain; apply the comparison filter (e.g., units down AND AGP up); rank or list."],
      gaps: []
    },

    household_exclusivity: {
      name: "Household overlap / exclusivity (promo-removal risk)",
      style: "diagnostic",
      intent: "For grouped categories, quantify how exclusive buying households are to each NCRC within its group, and derive the risk of removing an overlapping promotion — NCRC level, group roll-up, division roll-up.",
      lineage: [
        { table: "loyalty_household_transactions", grain: "household x UPC x transaction", cols: ["HOUSEHOLD_ID", "UPC_NBR", "TXN_DT"], why: "Household-grain purchases — REQUIRED and NOT ONBOARDED (see gaps)" },
        { table: "item_hierarchy", grain: "UPC x division", cols: ["CATEGORY_ID", "NATIONAL_COMMON_RETAIL_CD"], why: "Category (SMIC) → NCRC → UPC mapping; 2-digit group = leading digits of CATEGORY_ID" },
        { table: "promo_calendar", grain: "calendar day x division", cols: ["PROMOTION_WEEK_NBR", "PROMOTION_YEAR"], why: "Promo-week window filter (cross-year ranges supported)" },
        { table: "sales_cost_allowances", grain: "UPC x store x day", cols: ["NET_AMT", "ITEM_QTY"], why: "Store-grain fallback context only — cannot substitute for household grain" }
      ],
      derived: [
        { name: "Buying households (NCRC)", formula: "COUNT(DISTINCT household) purchasing any UPC of the NCRC in the window", status: "gap" },
        { name: "Exclusive households", formula: "households buying this NCRC and NO other NCRC within the same 2-digit category group in the window", status: "gap" },
        { name: "Exclusivity %", formula: "exclusive HH ÷ buying HH", status: "computed" },
        { name: "Promo-removal risk", formula: "threshold rule (configurable): >30% High · 15–30% Medium · <15% Low", status: "computed" }
      ],
      recipe: [
        "Parse category groups from the leading 2 digits of the 4-digit category ids; expand each category to NCRCs via item_hierarchy.",
        "Resolve the promo-week window (supports cross-fiscal-year ranges like PW49 FY25 → PW8 FY26).",
        "Per NCRC: distinct buying households; exclusive households (no other NCRC in the group); exclusivity %.",
        "Roll up to group level (households buying 1 vs 2+ NCRCs) and to division.",
        "Apply the risk thresholds and state them explicitly in the response."
      ],
      gaps: [
        { sev: "high", text: "Household/loyalty transaction data is NOT in the current 19-table scope — no table carries a household id. This analysis requires the loyalty feed; every household figure in the mock is illustrative until it lands." },
        { sev: "low", text: "Risk thresholds (30%/15%) are proposed defaults — governance should confirm before merchants act on the labels." }
      ]
    },

    novel_analysis: {
      name: "Novel analysis — no existing contract",
      style: "clarify",
      intent: "The question's core concepts are not covered by any archetype. Rather than force-fitting the nearest pattern, the layer states this and proposes the contract it would construct, for confirmation.",
      lineage: [],
      derived: [],
      recipe: [
        "Concept-coverage check: core nouns/metrics of the question are matched against every archetype's derived metrics and lineage.",
        "Below the coverage bar, DO NOT route to nearest-pattern — emit a constructed-contract proposal instead.",
        "The proposal names the analysis stages, required sources (onboarded or not), and the formulas to be defined.",
        "User confirmation (or a governance sign-off) promotes the constructed contract into the archetype library."
      ],
      gaps: [{ sev: "high", text: "By definition: the intent has no data plan yet. The proposal identifies which required sources are missing from scope." }]
    },

    complex_diagnostic: {
      name: "Complex multi-part diagnostic",
      style: "diagnostic",
      intent: "Multi-question investigative asks (premise + many sub-questions). The layer extracts stated facts as premise constraints, reconciles the headline metric with a quantified bridge, answers the answerable subset, and maps every remaining sub-question to its archetype or blocking gap — never silently substituting a generic pattern.",
      lineage: [
        { table: "sales_cost_allowances", grain: "UPC x store x day", cols: ["NET_AMT", "ITEM_QTY", "AGP_AMT", "COST_OF_GOODS_AMT", "DEADNET_COST", "TOTAL_ALLOWANCES", "TOTAL_MARKDOWN_AMT"], why: "P&L reconciliation + bridge" },
        { table: "master_primary_promo_data", grain: "UPC x store x promo week", cols: ["PRIMARY_PROMO_TACTIC_UPC", "PROMOTION_WEEK_NBR"], why: "Promo/incrementality sub-questions" },
        { table: "item_hierarchy", grain: "UPC x division", cols: ["OWN_BRANDS_IND", "VENDOR_NM", "CATEGORY"], why: "Private-label / vendor cuts" }
      ],
      derived: [
        { name: "Premise facts", formula: "figures stated in the question, extracted into the contract; response must use them or flag the mismatch — never silently contradict", status: "computed" },
        { name: "AGP $ bridge", formula: "volume = ΔUnits × LY AGP/unit; rate = TY units × ΔAGP/unit; must reconcile to total AGP change", status: "computed" },
        { name: "Incrementality / cannibalization", formula: "needs promo baseline model", status: "computed" }
      ],
      recipe: [
        "Extract premise facts; seed the metrics view from them (or flag data-vs-premise conflict explicitly).",
        "Bridge the headline metric change into quantified volume and rate components.",
        "Decompose the question into sub-questions; classify each answerable-now / needs-source.",
        "Answer the answerable subset with evidence-bounded language.",
        "State explicitly what cannot yet be concluded and the next diagnostic cut."
      ],
      gaps: [
        { sev: "high", text: "SLU execution compliance, build quantities, and store-level display verification live in the merch execution system — not onboarded; execution sub-questions return mapped-but-blocked." },
        { sev: "high", text: "APEX/OMS/POS configuration mismatch checks need the pricing-config feeds side-by-side; only OMS/CMS promo config is in scope today." },
        { sev: "med", text: "Incrementality and cannibalization need the promo baseline model (same dependency as promo effectiveness)." },
        { sev: "med", text: "Residual inventory and shrink require the inventory/shrink feed — not onboarded." }
      ]
    },

    clarify: {
      name: "Clarification required",
      style: "clarify",
      intent: "The question is missing a value the answer depends on. The layer returns a clarification contract instead of guessing.",
      lineage: [],
      derived: [],
      recipe: ["Detect the unresolvable slot during contract fill; return the candidate interpretations + a targeted question. Downstream layers are never invoked on a guess."],
      gaps: []
    }
  };

  // ============================================================================
  // 133 QUESTIONS → archetype + entities
  // e: { div, period, cat, smic, vendor, cig, upc, ncrc, asm, dept, group,
  //      district, metric, n, week, dir, extra... }
  // ============================================================================
  const Q = [
    { id: 1, a: "driver_decomp", e: { metric: "AGP rate", cat: "Sour Cream", div: "Jewel", period: "Q1 2025" } },
    { id: 2, a: "driver_decomp", e: { metric: "COGS & allowances", cat: "Sour Cream", div: "Jewel", period: "Q3 2025", flavor: "cost" } },
    { id: 3, a: "yoy_rank", e: { entity: "vendor", metric: "margin rate", dir: "decline", n: 5, cat: "Sour Cream", div: "Jewel", period: "Q3 2025", domain: "dairy" } },
    { id: 4, a: "yoy_rank", e: { entity: "CIG", metric: "Billback allowances", vendor: "FAGE USA DAIRY IND INC", vendors: ["FAGE USA DAIRY IND INC"], div: "Jewel", period: "Q2 2025", dir: "decline", domain: "dairy", n: 6 } },
    { id: 5, a: "yoy_rank", e: { entity: "vendor", metric: "total allowance investment", n: 5, div: "Southern", period: "Q3 2025", dir: "decline", domain: "grocery" } },
    { id: 6, a: "allowance_breakdown", e: { vendor: "KEURIG DR PEPPER", div: "Jewel Osco", period: "P08 2025", by: "category", domain: "beverage" } },
    { id: 7, a: "market_share", e: { cat: "Frozen Meals Single Serve", div: "Jewel Osco", period: "Q1 2025", mode: "level" } },
    { id: 8, a: "promo_detail", e: { cig: "179588", div: "Division 32", period: "Q2 2025", weekly: true, withResults: true, domain: "grocery" } },
    { id: 9, a: "ad_content", e: { group: "Group 08", div: "Southern", week: "Promo Week 38, 2025", mode: "frontpage-split", measure: "sales & markdown" } },
    { id: 10, a: "ad_content", e: { div: "Jewel", week: "Promo Week 01, 2026", mode: "frontpage-yoy" } },
    { id: 11, a: "upc_rank", e: { n: 50, cat: "Salty Snacks", div: "Jewel", period: "Q2 2025", metric: "AGP decline YoY", dir: "decline", domain: "snack", showN: 10 } },
    { id: 12, a: "store_perf", e: { district: "J3", div: "Jewel", cat: "Ketchup", period: "Q2 2025", vsYA: true } },
    { id: 13, a: "promo_detail", e: { cig: "47155", div: "Jewel", period: "Q2 2025", takeRate: true, domain: "grocery" } },
    { id: 14, a: "price_cost_change", e: { cat: "Coffee", div: "Jewel", period: "P10 2025", mode: "vlc-cogs-up", entity: "CIG", domain: "coffee" } },
    { id: 15, a: "promo_detail", e: { cig: "6340", div: "Jewel", period: "Q3 2025", weekly: true, domain: "grocery" } },
    { id: 16, a: "yoy_rank", e: { entity: "vendor", dept: "Grocery Food", metric: "flat allowances", dir: "decline", period: "Q2 2025", div: "Jewel", domain: "grocery", n: 8 } },
    { id: 17, a: "price_compare", e: { cls: "Salty Snack Bag", div: "Jewel", period: "P10 2025", competitor: "Walmart", domain: "snack" } },
    { id: 18, a: "allowance_breakdown", e: { vendor: "SARGENTO FOOD CO", group: "Group 37", period: "Q3 2025", by: "allowance type", div: "Jewel", domain: "dairy" } },
    { id: 19, a: "driver_decomp", e: { metric: "margin", cat: "Frozen Meals Single Serve", div: "Southern", period: "Q3 2025" } },
    { id: 20, a: "allowance_breakdown", e: { vendor: "FERRERO", cat: "Cookies", div: "Jewel", period: "Q3 2025", by: "allowance type", profitability: true, domain: "grocery" } },
    { id: 21, a: "yoy_rank", e: { entity: "vendor", cat: "Coffee", div: "Southern", period: "Q2 2025", metric: "unit growth", dir: "growth", domain: "coffee", n: 6 } },
    { id: 22, a: "markdown_by_cat", e: { asm: "Richard Stephens", div: "Southern", period: "Q3 2025", weekly: true } },
    { id: 23, a: "ad_content", e: { asm: "Richard Stephens", div: "Southern", week: "Promo Week 37, 2025", mode: "frontpage-split", by: "CIG", measure: "ad markdown" } },
    { id: 24, a: "yoy_rank", e: { entity: "vendor", group: "Group 08", div: "Southern", period: "Q3 2025", metric: "margin erosion", n: 5, dir: "decline", withDrivers: true, domain: "grocery" } },
    { id: 25, a: "promo_effectiveness", e: { smic: "Cheese Shreds", div: "Jewel", period: "Q3 2025", measure: "incremental units", withFunding: true, domain: "dairy" } },
    { id: 26, a: "promo_week_top", e: { cig: "102", div: "Jewel", period: "Q3 2025", measure: "sales", single: true } },
    { id: 27, a: "price_cost_change", e: { dept: "Grocery Food", div: "Jewel", period: "P8 2025", mode: "price-up", entity: "item", domain: "grocery" } },
    { id: 28, a: "ncrc_detail", e: { cat: "Refrigerated Yogurt", div: "Southern", period: "FY 2024", mode: "ob-vs-nb", domain: "dairy" } },
    { id: 29, a: "price_compare", e: { cat: "Crackers", div: "Southern", period: "Q3 2025", mode: "ob-cpi", domain: "snack" } },
    { id: 30, a: "ncrc_detail", e: { ncrc: "68118902225", div: "Jewel", period: "P10 2025", mode: "upc-list", domain: "dairy" } },
    { id: 31, a: "yoy_rank", e: { entity: "vendor", metric: "spend rate", cat: "Shredded Cheese", div: "Southern", period: "P11 2025", dir: "change", extraCols: ["AGP %", "Total ACI avg"], domain: "dairy", n: 7 } },
    { id: 32, a: "upc_rank", e: { n: 10, ownBrand: true, metric: "AGP dollars", period: "P3–P10 2025", div: "Jewel", dir: "top", domain: "grocery" } },
    { id: 33, a: "upc_rank", e: { n: 15, cat: "Eggs", div: "Southern", period: "P11 2025", metric: "lowest AGP %", dir: "bottom", domain: "dairy", showN: 8 } },
    { id: 34, a: "dept_agg", e: { cat: "Take Home Candy, Gum & Mints", period: "Q3 2025", mode: "rank-divisions" } },
    { id: 35, a: "dept_agg", e: { div: "Jewel Osco", period: "first 26 weeks FY25", mode: "units-down-agp-up", entity: "department" } },
    { id: 36, a: "upc_rank", e: { cat: "Salty Snacks", div: "Jewel Osco", period: "Q2 2025", metric: "AGP decline YoY", dir: "decline", cols: ["TY AGP", "LY AGP", "Variance"], domain: "snack", showN: 10 } },
    { id: 37, a: "store_perf", e: { district: "J3", div: "Jewel", cat: "Ketchup", period: "Q2 2025", vsYA: true } },
    { id: 38, a: "store_list", e: { district: "J3", div: "Jewel Osco", period: "FY 2024" } },
    { id: 39, a: "upc_rank", e: { div: "Jewel Osco", period: "Q3 2025", mode: "low-distribution", filter: "<100 stores", metric: "sales", domain: "grocery", showN: 10 } },
    { id: 40, a: "yoy_rank", e: { entity: "vendor", div: "Jewel Osco", period: "FY 2025", dept: "Grocery Food", metric: "flat allowances", dir: "decline", domain: "grocery", n: 8 } },
    { id: 41, a: "market_share", e: { div: "Jewel Osco", period: "FY 2025", mode: "rank-decline" } },
    { id: 42, a: "market_share", e: { div: "Jewel Osco", period: "Q3 2025", mode: "rank-growth" } },
    { id: 43, a: "price_compare", e: { cat: "Salty Snacks", div: "Jewel Osco", period: "Q2 2025", competitor: "Walmart", allFields: true, domain: "snack" } },
    { id: 44, a: "ncrc_detail", e: { cat: "Packaged Ice Cream", vendor: "THE MAGNUM ICE CREAM CO", div: "Jewel", period: "Q4 2025", n: 5, metric: "units", mode: "top-ncrc", domain: "dairy" } },
    { id: 45, a: "store_perf", e: { div: "Jewel", dept: "Produce", week: "Fiscal Week 40, 2025", n: 5, metric: "sales % growth", vsYA: true } },
    { id: 46, a: "promo_week_top", e: { div: "Jewel Osco", week: "Promo Week 40, 2025", entity: "CIG", measure: "promo-tied sales" } },
    { id: 47, a: "promo_effectiveness", e: { cat: "Cheese", div: "Jewel", period: "FY 2025", entity: "CIG", n: 5, measure: "units in a promo week", mode: "top-cig-weeks", domain: "dairy" } },
    { id: 48, a: "ad_content", e: { div: "Jewel", adDate: "09/10/2025", page: 1, entity: "CIG", mode: "page-list" } },
    { id: 49, a: "ad_content", e: { div: "Jewel Osco", period: "April 2025", mode: "ad-count" } },
    { id: 50, a: "cannibalization", e: { vendor: "SARGENTO FOOD CO", smic: "Cheese Shreds", div: "Jewel", period: "Q3 2025", domain: "dairy" } },
    { id: 51, a: "promo_effectiveness", e: { item: "Angel Soft 16 MR", div: "Division 32", period: "FY25", measure: "KPI by promoted price", mode: "price-ladder", domain: "grocery" } },
    { id: 52, a: "upc_rank", e: { ownBrand: true, div: "Jewel", period: "FY25", metric: "AGP dollars", n: 1, dir: "top", domain: "grocery" } },
    { id: 53, a: "promo_effectiveness", e: { cig: "31106", div: "Division 25", period: "FY25", n: 5, measure: "optimal promo retail", mode: "price-ladder", domain: "grocery" } },
    { id: 54, a: "dept_agg", e: { dept: "311", div: "Jewel", period: "Q1 FY25", mode: "dept-sales" } },
    { id: 55, a: "upc_rank", e: { asm: "Stephanie Diliberto", week: "Promo Week 38, 2025", div: "Jewel", metric: "sales", n: 1, dir: "top", domain: "grocery" } },
    { id: 56, a: "price_compare", e: { asm: "Stephanie Diliberto", period: "Q2 2025", mode: "highest-cpi", entity: "category", domain: "grocery" } },
    { id: 57, a: "yoy_rank", e: { dept: "Dairy", div: "Jewel", period: "Q3 2025", entity: "SMIC", metric: "AGP $", dir: "decline", domain: "dairy", n: 8 } },
    { id: 58, a: "driver_decomp", e: { vendor: "SARGENTO FOOD CO", div: "Jewel", period: "Q3 2025", metric: "AGP" } },
    { id: 59, a: "yoy_rank", e: { smic: "Cheese Shreds", entity: "vendor", metric: "AGP $", dir: "decline", period: "Q3 2025", div: "Jewel", domain: "dairy", n: 6 } },
    { id: 60, a: "promo_detail", e: { upc: "4610040012", period: "FY 2025", mode: "agp-decline-weeks", withMeta: true, div: "Jewel", domain: "grocery" } },
    { id: 61, a: "store_perf", e: { div: "Jewel", week: "Fiscal Week 34, 2025", threshold: 1000000, mode: "all-stores-threshold", count: true } },
    { id: 62, a: "clarify", e: { div: "Jewel", week: "Fiscal Week 34, 2025", missing: "revenue threshold", context: "store_perf" } },
    { id: 63, a: "ad_content", e: { div: "Jewel Osco", adDate: "01/14/2026", page: 1, entity: "CIG", dept: "Grocery Food", extraCol: "Q3 2025 sales", mode: "page-list" } },
    { id: 64, a: "yoy_rank", e: { cat: "Cream Cheese", entity: "vendor", metric: "AGP $", dir: "decline", period: "Q3 2025", div: "Jewel", domain: "dairy", n: 6 } },
    { id: 65, a: "promo_week_top", e: { cig: "102", div: "Jewel", period: "FY 2025", measure: "sales", single: true } },
    { id: 66, a: "dept_agg", e: { cat: "Candy", period: "Q3 2025", mode: "rank-divisions" } },
    { id: 67, a: "yoy_rank", e: { asm: "Timothy Antor", metric: "Ad Placement Coop", entity: "SMIC+vendor", period: "Q3 2025", div: "Jewel", byWeek: true, dir: "decline", domain: "dairy", n: 6 } },
    { id: 68, a: "bog_drill", e: { dept: "Dairy", period: "Q3 2025", div: "Jewel", depth: "SMIC→vendor→NCRC", cols: ["Reg price", "Unit list cost", "Off-invoice/unit", "BOG"], domain: "dairy" } },
    { id: 69, a: "allowance_breakdown", e: { asm: "Timothy Antor", metric: "Line 7", period: "Q2 2025", by: "allowance type", threshold: "$10K both years", div: "Jewel", domain: "dairy" } },
    { id: 70, a: "margin_compression", e: { asm: "Timothy Antor", div: "Jewel", period: "Q3 2025", byPromoWeek: true, domain: "dairy" } },
    { id: 71, a: "yoy_rank", e: { metric: "Ad Placement Coop", entity: "SMIC+vendor+NCRC", period: "YTD vs LY", byWeek: true, dir: "decline", domain: "dairy", n: 6, div: "Jewel" } },
    { id: 72, a: "bog_drill", e: { desk: "Desk X", depth: "SMIC→vendor→NCRC", vs: "LY & 2YA", domain: "grocery", div: "Jewel" } },
    { id: 73, a: "allowance_breakdown", e: { metric: "Line 7", by: "allowance type", threshold: "$10K", withNOPA: true, period: "FY 2025", div: "Jewel", domain: "grocery" } },
    { id: 74, a: "margin_compression", e: { desk: "Desk X", byWeek: true, likeTactics: true, period: "FY 2025", div: "Jewel", domain: "grocery" } },
    { id: 75, a: "price_cost_change", e: { mode: "bog-vs-cost", vs: "2YA", entity: "NCRC", byWeek: true, period: "FY 2025", div: "Jewel", domain: "grocery" } },
    { id: 76, a: "supply_chain", e: { item: "1234", measure: "shipped vs sold by store", aiv: true, div: "Jewel" } },
    { id: 77, a: "supply_chain", e: { ncrc: "1234", allowance: "1234", measure: "arrival dates + PO off-invoice units", div: "Jewel" } },
    { id: 78, a: "promo_frequency", e: { period: "2H 2025", threshold: "5%", sort: "Sales $ / AGP $ decline", div: "Jewel", domain: "grocery" } },
    { id: 79, a: "quad_review", e: { week: "past ad week", rank: "negative AGP $ impact", div: "Jewel", domain: "grocery" } },
    { id: 80, a: "scans_copients", e: { csd: "1234", tactic: "XYZ", period: "holidays", div: "Jewel" } },
    { id: 81, a: "slotting", e: { period: "next quarter (from LY)", by: "desk → SMIC → vendor", div: "Jewel", domain: "grocery" } },
    { id: 82, a: "aiv_erosion", e: { desk: "Desk X", entity: "vendor+NCRC", period: "FY 2025", byWeek: true, div: "Jewel", domain: "snack" } },
    { id: 83, a: "build_sheet", e: { slu: "1234", vs: "2YA", allDivisions: true } },
    { id: 84, a: "allowance_breakdown", e: { group: "Skin Care", div: "Jewel Osco", period: "P13 2025", by: "Line 7 NOPA + category", domain: "grocery" } },
    { id: 85, a: "yoy_rank", e: { cat: "Apples", div: "Jewel", period: "Q2 2025", entity: "vendor", metric: "unit growth", dir: "growth", domain: "produce", n: 5 } },
    { id: 86, a: "yoy_rank", e: { cat: "Apples", div: "Jewel", period: "Q3 2025", entity: "vendor", metric: "AGP $", dir: "decline", domain: "produce", n: 5 } },
    { id: 87, a: "canned_report", e: { report: "Vendor Performance", asm: "Timothy Antor", div: "Jewel", week: "Fiscal Week 45, 2025", domain: "dairy" } },
    { id: 88, a: "market_share", e: { mode: "circana-report", asm: "Timothy Antor", div: "Jewel", period: "week range 4" } },
    { id: 89, a: "allowance_breakdown", e: { asm: "Timothy Antor", div: "Jewel", period: "P3 2025", by: "category & vendor", totalRow: true, domain: "dairy" } },
    { id: 90, a: "canned_report", e: { report: "CIG BOG Compression", asm: "Chris Means", div: "Jewel", week: "Fiscal Week 42, 2025", domain: "grocery" } },
    { id: 91, a: "ncrc_detail", e: { vendor: "EVANS FRUIT CO INC", cat: "Apples", period: "last 4 weeks FY 2026", div: "Jewel", mode: "id-list", domain: "produce" } },
    { id: 92, a: "price_cost_change", e: { ncrc: "498068140173", div: "Jewel", period: "FY 2025", mode: "price-area", domain: "grocery" } },
    { id: 93, a: "canned_report", e: { report: "Cost Change", asm: "Annie Michalik", div: "Jewel", week: "Fiscal Week 03, 2026", domain: "grocery" } },
    { id: 94, a: "price_cost_change", e: { cat: "Apples", div: "Jewel", week: "Promo Week 8, 2025", mode: "vlc-cogs-up", entity: "CIG", domain: "produce" } },
    { id: 95, a: "allowance_breakdown", e: { asm: "Timothy Antor", div: "Jewel", period: "Q2 2025", metric: "Line 7", by: "category & allowance type", threshold: "$10K both years", domain: "dairy" } },
    { id: 96, a: "upc_rank", e: { asm: "Monica Meyer", week: "Promo Week 38, 2025", div: "Jewel", n: 1, metric: "sales", dir: "top", domain: "grocery" } },
    { id: 97, a: "ncrc_detail", e: { ncrc: "498068140173", mode: "deadnet-by-division", domain: "grocery" } },
    { id: 98, a: "upc_rank", e: { div: "Jewel", period: "YTD 2026", mode: "kvi", metric: "Sales, Units, AGP", n: 1, dir: "top", domain: "grocery" } },
    { id: 99, a: "canned_report", e: { report: "Vendor Scorecard", vendor: "COCA COLA CO", asm: "Timothy Antor", div: "Jewel", domain: "beverage" } },
    { id: 100, a: "upc_rank", e: { div: "Jewel", period: "FY 2025", mode: "low-distribution", filter: "<100 stores & >$100K", metric: "sales", domain: "grocery", showN: 8 } },
    { id: 101, a: "allowance_breakdown", e: { div: "Jewel", asm: "Timothy Antor", period: "Q2 2025", by: "category", mode: "declining-weeks", domain: "dairy" } },
    { id: 102, a: "bog_drill", e: { dept: "Produce", div: "Jewel", period: "Q3 2025", depth: "category→vendor", domain: "produce" } },
    { id: 103, a: "yoy_rank", e: { entity: "NCRC", dept: "Dairy", asm: "Timothy Antor", metric: "off-invoice per unit", dir: "decline", period: "FY 2026", listGiven: 29, domain: "dairy", n: 8, div: "Jewel" } },
    { id: 104, a: "yoy_rank", e: { entity: "SMIC", perVendor: true, listGiven: 30, metric: "Line 7 investment", dir: "decline", period: "FY 2026", domain: "grocery", n: 8, div: "Jewel" } },
    { id: 105, a: "yoy_rank", e: { entity: "NCRC", asm: "Timothy Antor", metric: "AGP $", dir: "decline", period: "FY 2026", listGiven: 29, domain: "dairy", n: 8, div: "Jewel" } },
    { id: 106, a: "promo_detail", e: { ncrcList: 26, asm: "Timothy Antor", period: "FY 2026 vs PY", byWeek: true, withMargins: true, div: "Jewel", domain: "dairy" } },
    { id: 107, a: "margin_compression", e: { ncrcs: ["1013051540001", "108557050041"], likeTactics: true, asm: "Timothy Antor", period: "FY 2026", div: "Jewel", domain: "dairy" } },
    { id: 108, a: "yoy_rank", e: { entity: "NCRC", div: "Jewel", period: "Q3+Q4 FY 2025", metric: "Sales $", dir: "decline", listGiven: 30, domain: "dairy", n: 8 } },
    { id: 109, a: "yoy_rank", e: { smics: ["Cheese Shreds", "Cheese Chunks", "Cheese International", "Cheese Slices"], entity: "vendor", metric: "Ad Placement Coop", asm: "Timothy Antor", div: "Jewel", period: "Q3 2025", dir: "decline", domain: "dairy", n: 6 } },
    { id: 110, a: "yoy_rank", e: { entity: "NCRC", metric: "AGP $", period: "Q3+Q4 FY 2025", div: "Jewel", dir: "decline", listGiven: 30, domain: "dairy", n: 8 } },
    { id: 111, a: "aiv_erosion", e: { vendorList: 15, vendors: ["DAIYA FOODS INC", "LYRICAL FOODS INC", "CLIO SNACKS", "PAINTERLAND SISTERS LLC", "THE HAPPY EGG CO", "EGGLANDS BEST LLC", "ALCAM CREAMERY CO", "LIFEWAY FOODS INC"], entity: "NCRC", metric: "AIV", asm: "Timothy Antor", period: "FY 2026", div: "Jewel", domain: "dairy" } },
    { id: 112, a: "aiv_erosion", e: { ncrcList: 27, cats: ["EGGS", "REFRIGERATED YOGURT", "CREAM CHEESE"], metric: "AIV & AGP $ by week", asm: "Timothy Antor", period: "FY 2026", div: "Jewel", domain: "dairy", byWeek: true } },
    { id: 113, a: "yoy_rank", e: { vendorList: 7, vendors: ["SARGENTO FOOD CO", "CACIQUE FOODS LLC", "CABOT CREAMERY INC", "LACTALIS USA", "DAIYA FOODS INC", "LIFEWAY FOODS INC"], entity: "NCRC", metric: "Ad Placement Coop", div: "Jewel", asm: "Timothy Antor", period: "Q3 2025", dir: "decline", domain: "dairy", n: 7 } },
    { id: 114, a: "yoy_rank", e: { ncrcList: 22, entity: "NCRC", vendors: ["SARGENTO FOOD CO", "CABOT CREAMERY INC", "DAIYA FOODS INC", "KRAFT HEINZ CO"], smic: "Cheese Shreds", metric: "Ad Placement Coop", byWeek: true, period: "Q3 2025", div: "Jewel", asm: "Timothy Antor", dir: "decline", domain: "dairy", n: 6 } },
    { id: 115, a: "bog_drill", e: { dept: "Dairy", asm: "Timothy Antor", smicList: 27, entity: "vendor", metric: "Bill-Out Gross", period: "FY 2026", div: "Jewel", domain: "dairy" } },
    { id: 116, a: "bog_drill", e: { dept: "Dairy", asm: "Timothy Antor", vendorList: 30, entity: "NCRC", metric: "Bill-Out Gross", period: "FY 2026", div: "Jewel", domain: "dairy" } },
    { id: 117, a: "price_cost_change", e: { ncrcList: 29, mode: "reg-retail-list-cost", period: "FY 2026 vs PY", div: "Jewel", domain: "dairy" } },
    { id: 118, a: "yoy_rank", e: { entity: "SMIC", metric: "Ad Placement Coop", asm: "Timothy Antor", div: "Jewel", period: "Q3 2025", dir: "decline", domain: "dairy", n: 6 } },
    { id: 119, a: "yoy_rank", e: { entity: "vendor", metric: "Line 7 investment", period: "FY 2026", dir: "decline", domain: "grocery", n: 8, div: "Jewel" } },
    { id: 120, a: "margin_compression", e: { entity: "NCRC", asm: "Timothy Antor", period: "FY 2026", div: "Jewel", domain: "dairy" } },
    { id: 121, a: "slotting", e: { entity: "SMIC", asm: "Timothy Antor", period: "next quarter, FY 2025 vs PY", div: "Jewel", domain: "dairy" } },
    { id: 122, a: "aiv_erosion", e: { entity: "vendor", metric: "AIV", asm: "Timothy Antor", period: "FY 2026", div: "Jewel", domain: "dairy" } },
    { id: 123, a: "bog_drill", e: { dept: "Dairy", asm: "Timothy Antor", entity: "SMIC", metric: "Bill-Out Gross", period: "FY 2026", div: "Jewel", domain: "dairy" } },
    { id: 124, a: "market_share", e: { cat: "Apples", div: "Jewel", period: "Q4 2025", mode: "level" } },
    { id: 125, a: "canned_report", e: { report: "Price Change", asm: "Annie Michalik", div: "Jewel", week: "Fiscal Week 02, 2026", domain: "grocery" } },
    { id: 126, a: "upc_rank", e: { cat: "Apples", div: "Jewel", period: "latest 4 weeks", metric: "dollar sales", dir: "top", domain: "produce", showN: 10 } },
    { id: 127, a: "market_share", e: { dept: "Produce", div: "Jewel", period: "FY 2025", mode: "rank-level" } },
    { id: 128, a: "allowance_breakdown", e: { div: "Jewel", asm: "Timothy Antor", period: "Q2 2025", by: "allowance type", mode: "declining-weeks", domain: "dairy" } },
    { id: 129, a: "allowance_breakdown", e: { vendorList: 30, smicList: 30, metric: "NOPA by allowance type", threshold: "$10K", period: "FY 2026", by: "allowance type", div: "Jewel", domain: "grocery" } },
    { id: 130, a: "slotting", e: { smics: ["Refrigerated Drinks Singles", "Refrigerated Yogurt", "Refrigerated Juice Blends"], entity: "vendor", asm: "Timothy Antor", period: "next quarter, FY 2025 vs PY", div: "Jewel", domain: "dairy" } },
    { id: 131, a: "yoy_rank", e: { vendorList: 29, metric: "AGP $", asm: "Timothy Antor", period: "FY 2026", dir: "decline", crossFilter: "also declined in AIV", entity: "vendor", domain: "dairy", n: 7, div: "Jewel" } },
    { id: 132, a: "bog_drill", e: { ncrcList: 29, measure: "off-invoice/unit & BOG", period: "FY 2026", div: "Jewel", domain: "dairy", entity: "NCRC" } },
    { id: 133, a: "promo_frequency", e: { div: "Jewel", period: "Q3+Q4 FY 2025", threshold: "5%", domain: "dairy" } }
  ];

  // Raw question text (index = id) — loaded for match + display.
  const QUESTION_TEXT = {
    1: "What are the drivers impacting AGP rate for the sour cream category Q1 2025 in the Jewel division?",
    2: "Were there changes in cost of goods sold or allowances for sour cream in Jewel division Quarter 3 2025, compared to last year?",
    3: "What are the top 5 vendors had the largest margin rate decline in Q3 2025 in the sour cream category for Jewel?",
    4: "Which CIGs within FAGE experienced the largest decline in Billback allowances in Quarter 2 2025 compared to last year in Jewel?",
    5: "What are the top 5 largest vendor declines in total allowance investment in Quarter 3 2025 vs Prior Year in Southern?",
    6: "What are the total allowance investments for P08 2025 versus prior year for Keurig Dr Pepper at Jewel Osco? Provide details on where the declines occurred by category.",
    7: "What is the market share MULO+ of Jewel Osco in the Frozen Meals Single Serve category for the Q1 2025?",
    8: "For the CIG 179588 in Division 32 provide all promo tactics by promo week Q2 2025. Include weekly sales and margin results.",
    9: "Within Group 08 in Southern division, how much sales and markdown was driven by front-page items versus non–front-page items during Promo Week 38, 2025?",
    10: "How does front-page dollar sales in Promo Week 01, 2026 compare to the same week year ago in Jewel?",
    11: "For Jewel in Q2 2025, what are the top 50 UPCs in the salty snack category that saw the highest AGP declines year over year.",
    12: "What are sales by store in Jewel district J3 for the ketchup category for Q2 2025 compared to year ago?",
    13: "For CIG 47155 in Jewel, provide take rate for each promotion in Q2 2025. Include promo tactic, description, sales, units, AIV, and take rate.",
    14: "For the Coffee category in the Jewel division, identify CIGs where VLC and COGS increased in P10 2025 compared to last year.",
    15: "What promotions ran for CIG 6340 in Jewel division, Quarter 3 2025? Include the promo tactic, description, discount details, and minimum buy for each week.",
    16: "What Vendors in Grocery Food department have decline in flat allowances in Q2 2025. Provide current, year ago, and change.",
    17: "Provide shelf price for P10 2025 for Jewel compared to Walmart for salty snack bag class.",
    18: "What is the change in total allowances for Sargento in Group 37 for Q3 2025 vs Year Ago by allowance type and total?",
    19: "What is driving margin declines in single serve frozen meals in Southern division for Q3 2025?",
    20: "Within cookies, how are allowance dollars for Ferrero structured by type in Jewel for Q3 2025? How is the current mix impacting profitability?",
    21: "What vendors in Coffee category are contributing to unit growth in Southern division for Q2 2025?",
    22: "What are weekly markdown dollars by category for Quarter 3 2025 for ASM Richard Stephens in Southern?",
    23: "Show ad markdown dollars by CIG for ASM Richard Stephens in Southern for Promo Week 37 2025. Include how much of that spend is coming from front-page ads versus the rest of the ad?",
    24: "Provide the top 5 vendors in Group 08 that are contributing most to margin erosion in Southern for Quarter 3 2025. What is driving the decline?",
    25: "What promo tactic within Cheese Shreds in jewel for Q3 2025 provided the most incremental units? Include the promotional metadetail and funding associated with it.",
    26: "What promotion tactic had the greatest sales for CIG 102 at Jewel in Q3 2025 for a single promo week?",
    27: "Within Grocery Food, which items had price increases during the period 8 2025 in Jewel?",
    28: "What are the Own Brand and National Brand NCRC within the Refrigerated Yogurt category in Southern division for FY 2024?",
    29: "In Southern, within Cracker Category, how does our Own Brand shelf price CPI compare to National Brand competitors in Q3 2025?",
    30: "For NCRC 68118902225, show all UPCs which are included, and provide dollar sales and chang vs YA for P10 2025 in Jewel.",
    31: "Show spend rate by vendor for Shredded Cheese Category in Southern for P11 2025 vs. year ago, with change, AGP %, and Total ACI average.",
    32: "What are the top 10 own brand UPCs which provided the highest AGP dollars for P3 2025 thru P10 2025 in Jewel?",
    33: "In the Southern division, what are the top 15 UPCs within the Egg category which has the lowest AGP % for P11 2025?",
    34: "Within the Take Home Candy, Gum & Mints category, for Q3 2025, Rank divisions for AGP %",
    35: "Which departments decreased in units but increased in AGP $ in first 26 weeks of FY25 Jewel Osco in compared to same period in FY24?",
    36: "For Jewel Osco in Q2 2025, what UPCs in the salty snack category saw AGP declines year over year. Provide the output with UPCs as the rows, this year AGP. last year AGP, and the variance. Sorted by the most negative variance.",
    37: "Provide the stores sales in Jewel's J3 district by store for the ketchup category during Q2 2025 with year over year sales metrics (This year sales, last year sales, and variance)",
    38: "What stores are in district J3 in Jewel Osco FY 2024? Provide the store ID and city",
    39: "What UPCs in Jewel Osco for Q3 2025 only sold in less than 100 stores? Provide the list of the UPCs with their description and sales sorted by the highest sellers.",
    40: "Provide the vendors in Jewel Osco that see negative growth Fiscal Year 2025 Grocery Food for Flat allowances. Sort by the largest declines in vendor funding with column for this year, last year, and the change",
    41: "For Fiscal Year 2025 in Jewel Osco, what categories saw the largest dollar share decline in the MULO+ segment",
    42: "What categories in Jewel Osco grew market share in Q3 2025?",
    43: "Can you provide the shelf price for Jewel Osco compared to Walmart in Quarter 2 2025 with all data fields provided from the dataset for the items in the salty snack category",
    44: "In the Jewel division for Q4 2025, what are the top 5 NCRCs by units within the Packaged Ice Cream Category for Magnum Ice Cream vendor",
    45: "Can you provide the 5 Jewel stores that grew produce sales the most by dollar % change in fiscal week 40 of 2025? Provide a table with sales this year, sales last year, and variance with the store ID and city",
    46: "What CIG had the largest sales tied to a promotion during promo week 40 in 2025 at Jewel Osco? Provide the revenue too with the CIG and its name.",
    47: "What cheese promo by common item group sold the most units during a promo week? Provide the top five common item groups and promo weeks that sold the most units in 2025 at Jewel.",
    48: "Provide me with every common item group on the front cover (page 1) of the ad for the ad that released on 09/10/2025 for Jewel.",
    49: "How many ads were released at Jewel Osco during April 2025?",
    50: "In Jewel Quarter 3 2025, did promoting Sargento shredded cheese degrade total shredded cheese units for any single promoted week?",
    51: "What promoted price resulted in the best KPI performance for Angel Soft 16 MR in Division 32 across FY25?",
    52: "What own brand item provide the highest AGP dollars for FY25 in Jewel division?",
    53: "What are the top 5 optimal promotional retail for CIG 31106 in Division 25 for FY25? Consider units sold in promotion periods vs. non promotion periods to calculate performance",
    54: "What are the sales for Department 311 for Jewel division for Q1 FY25?",
    55: "What was ASM Stephanie Diliberto highest selling UPC in promo week 38 2025 in Jewel division",
    56: "Which category owned by Stephanie Dilberto has the highest CPI (competitive positioning index) against primary competitor for fiscal Q2 2025?",
    57: "In the Jewel dairy department, in Quarter 3 2025, what are my SMICs furthest down in AGP $ YoY?",
    58: "What is causing the AGP decline for Jewel Sargento in Quarter 3 2025?",
    59: "What vendors in Cheese Shreds are causing the AGP $ decline in Quarter 3 2025?",
    60: "Which promo weeks in fiscal year 2025 have caused AGP $ YoY declines on UPC 4610040012? Return promotion metadata and item description.",
    61: "For Jewel store, list all stores, their district, and store name along with sales for fiscal week 34 in the year 2025 in a table. Sort by the largest revenue to the smallest and only provides stores with over $1000000 in revenue for the fiscal week. In text below the prompt, tell me how many stores meet this criteria.",
    62: "For Jewel store, list all stores, their district, and store name along with sales for fiscal week 34 in the year 2025 in a table. Sort by the largest revenue to the smallest and only provides stores with over  in revenue for the fiscal week. In text below the prompt, tell me how many stores meet this criteria.",
    63: "Provide me all the grocery food CIG on page 1 of the ad for Jewel Osco for the ad that released on 01/14/2026. Include the CIG, the description, and the CIGs Q3 2025 sales at Jewel for a three column table.",
    64: "What vendors in Cream Cheese Category are causing the AGP $ decline in Quarter 3 2025 in Jewel?",
    65: "Which promo week provided the most sales for CIG 102 at Jewel during FY 2025 in a one-week period. Provide the timeframe and revenue info.",
    66: "Within the Candy category, for Q3 2025, Rank divisions for AGP %",
    67: "Give me the SMICs, vendors within those SMIC declining in Q3 2025 vs YoY in Ad Placement Coop for ASM Timothy Antor. Show me that comparison by-week side-by-side in a table of which weeks were missed or under LY.",
    68: "Where are we losing Bill-Out Gross in Dairy Department for Q3 2025 vs YA. What SMICs? What vendors within those SMIC? What NCRCs within those vendors? Provide me with the regular price, unit list cost, offinvoice per unit, and Bill-Out Gross for those identified NCRCs this year and last year. Isolate those with the most significant decline in off-invoice per unit versus LY.",
    69: "Provide me with the vendors and SMICs within each vendor where we have declines in Line 7 investment dollars for ASM Timothy Antor in Q2 2025 vs YoY. Breakout the declines within those vendors by-allowance type so I can go back to the vendor for my money owed. Isolate the allowances that are over $10K in both the years.",
    70: "Provide me with the NCRCs for ASM Timothy Antor in Jewel, where we have margin rate compression AND the largest AGP Dollars declines in Q3 2025 vs year ago by Promo Week. For those opportunity NCRCs, provide me with the promo tactic, margins rate and agp dollar of both TY and LY",
    71: "Give me the SMICs, vendors within those SMIC, and NCRCs within those vendors declining YoY today in Ad Placement Coop. Show me that comparison by-week side-by-side in a table of which weeks were missed or under LY.",
    72: "Where are we losing Bill-Out Gross on Desk X. What SMICs? What vendors within those SMIC? What NCRCs within those vendors? Provide me with the regular retail, list cost, offinvoice per unit, and Bill-Out Gross for those identified NCRCs this year and last year. Isolate those with the most significant decline in off-invoice per unit versus LY, versus 2YA.",
    73: "Provide me with the vendors and SMICs within each vendor where we have declines in Line 7 investment dollars YoY. Breakout the declines within those vendors by-allowance type so I can go back to the vendor for my money owed. Isolate the allowances that are over $10K this year and last year and show me those NOPAs for both years to identify which ones I blew past in my Periscope planning this year (ex: marketing page, big book, etc.).",
    74: "Provide me with the NCRCs on Desk X where we have margin rate compression AND the largest AGP Dollars declines YoY. For those opportunity NCRCs, provide me with the promotions and margins by-week side-by-side. Identify those where like-tactics are dropping in rate – ex: Bacon BOGO last year was a 30% gross and is now a 26% gross.",
    75: "Identify the NCRCs that have declined in BOG versus 2YA who have also taken a List Cost increase. Show me the list cost and reg retail by-week the biggest opportunity NCRCs during that timeframe to identify when each went up in cost and how my desk reacted during/before/after that time (or didn't react at all).",
    76: "Show me the number of units shipped v number of units sold for Item 1234 during X time. Break that out by-store to-date so I can see sell-through by-store. Include AIV by-store so I can see any Store Link activity already going on out there and manage accordingly.",
    77: "When did distros for NCRC 1234 actually arrive (Arrival Date) in Stores for the ad week? In the WHS/DSD shipment tables… for Allowance 1234 how many units were purchased on a PO with this off-invoice included? Identifying shoulder-deal totally missed.",
    78: "Give me every NCRC since the start of 2H 2025 that has less weeks at >5% promo depth than last year (lost frequency). Sort based on the NCRCs with the largest Sales Dollar or AGP $ decline. Those vendors owe more investment & activity around those NCRCs asap.",
    79: "Identify for me all the Quad 2-4 promotions over the past ad week ranked by the largest negative AGP Dollar impacts to the smallest. I can quickly learn and not do those again.",
    80: "Provide me with the historical Scans and Copients for CSD 1234 when we run the tactic XYZ for the holidays. Don't have to go hunt around AIM before making P&L estimates. After conclusion of event, provide me with the actual scans & copients versus our estimate.",
    81: "Provide me with the upcoming slotting cycles from last year for next quarter by-desk, bySMIC with each desk. Include by-vendor within each SMIC where that slotting came from, so I can share with the SM to make sure we're at-or-ahead of LY plans.",
    82: "A lot of vendors are racing to the bottom on price & profitability (ex: Frito). Provide me with the vendors and NCRCs within those vendors for Desk X that are declining the most in AIV and also declining AGP Dollars vs. LY. Show me this year & last year by-week side-by-side so I can visually understand in a table what is going on.",
    83: "Provide me the build sheet for SLU 1234 that includes costs by-component and provide me with that same build sheet from 2YA. Include that same look for every single division so I can compare between my sister banners.",
    84: "What are the total allowance investments for P13 2025 versus prior year for group skin care at Jewel Osco? Provide details on where the declines occurred in Line 7 NOPA values and break down by category.",
    85: "What vendors in APPLES category are contributing to unit growth in JEWEL division for Quarter Q2 year 2025?",
    86: "What vendors in APPLES Category are causing the AGP $ decline in Quarter Q3 year 2025 in JEWEL division?",
    87: "Provide Vendor Performance by ASM TIMOTHY ANTOR in JEWEL division for fiscal week 45 year 2025",
    88: "Get the Circana Market share report by Category for ASM TIMOTHY ANTOR in Division JEWEL for week range 4",
    89: "Analyze how allowances are distributed across categories and vendors for ASM TIMOTHY ANTOR in division JEWEL during period P3 year 2025, including a total row.",
    90: "Get the CIG BOG Compression Report for ASM CHRIS MEANS in Division JEWEL for fiscal week 42 year 2025",
    91: "For Vendor EVANS FRUIT CO INC in the APPLES category, provide NCRC and CIG identifiers with sales for the last 4 weeks of FY 2026 in JEWEL division",
    92: "Price changes on NCRC 498068140173 within JEWEL division across FY 2025? Return one row per price area.",
    93: "Cost Change Report for ASM ANNIE MICHALIK in the JEWEL Division for fiscal week 03 in year 2026",
    94: "For the APPLES category in the JEWEL division, identify CIGs where VLC and COGS increased in promo week 8 in year 2025 compared to last year.",
    95: "For ASM TIMOTHY ANTOR in Division JEWEL during quarter Q2 year 2025 vs year ago, identify vendors with declines in Line 7 investment dollars, including categories and allowance types within those declining vendors. Only cases where both years exceed $ 10000.",
    96: "What was ASM MONICA MEYER highest selling UPC in promo week 38 year 2025 in JEWEL division?",
    97: "Division wise minimum deadnet cost per unit for NCRC 498068140173",
    98: "Within the JEWEL division, which KVI item drove the most Sales, Units, and AGP dollars YTD 2026?",
    99: "Provide Vendor Scorecard for Vendor COCA COLA CO under ASM TIMOTHY ANTOR in division JEWEL",
    100: "What UPCs in JEWEL division for FY 2025 only sold in less than 100 stores but had sales of over 100K?",
    101: "For division JEWEL and ASM TIMOTHY ANTOR during quarter Q2 year 2025, identify weeks with year-over-year declines in Allowance dollars by category?",
    102: "Where are we losing Bill-Out Gross in Produce Department for Quarter Q3 in year 2025 vs YA in JEWEL division. What Categories are declining in bill out gross? What vendors within those Categories are declining in bill out gross?",
    103: "Within Dairy Department for ASM Timothy Antor, for each NCRC (list of 29), which had a decline in off-invoice per unit in Fiscal Year 2026 vs previous year? Sort by decline descending.",
    104: "For each vendor (PepsiCo, General Mills, Coca-Cola, Kraft Heinz + 26 more), which SMICs had a decline in Line 7 investment dollars in Fiscal Year 2026 vs previous year? Sort by decline descending.",
    105: "Among each NCRC (list of 29), which had a decline in AGP Dollars for ASM Timothy in Fiscal Year 2026 vs previous year? Sort by decline descending.",
    106: "For each NCRC (list of 26), what were promotions and margins by fiscal week for ASM Timothy in Fiscal Year 2026 vs previous year?",
    107: "For each NCRC 1013051540001, 108557050041, which like-tactics had a decline in rate for ASM Timothy in Fiscal Year 2026 vs previous year?",
    108: "For each NCRC (list of 30) in Jewel, return Sales Dollar decline in Q3 Fiscal Year 2025 and Q4 Fiscal Year 2025 vs previous year. Sort by decline descending.",
    109: "Among each SMIC CHEESE SHREDS, CHEESE CHUNKS, CHEESE INTERNATIONAL, CHEESE SLICES, which vendors had a decline in Ad Placement Coop for Jewel for ASM Timothy Antor in Q3 2025 vs previous year? Sort by decline descending.",
    110: "Among each NCRC (list of 30), which had the largest decline in AGP $ in Q3 Fiscal Year 2025 and Q4 Fiscal Year 2025 vs previous year for Jewel? Sort by decline descending.",
    111: "For each vendor (Alcam Creamery, Clio Snacks, Daiya Foods + 12 more), which NCRCs had a decline in AIV for ASM Timothy Antor in Fiscal Year 2026 vs previous year? Sort by decline descending.",
    112: "For each NCRC (eggs / yogurt / cream cheese list of 27), show AIV and AGP Dollars by fiscal week for ASM Timothy Antor in Fiscal Year 2026 vs previous year.",
    113: "Among each vendor SARGENTO FOOD CO, CACIQUE FOODS LLC, CABOT CREAMERY INC, LACTALIS USA, KOHLBERG KRAVIS ROBERTS, DAIYA FOODS INC, LIFEWAY FOODS INC, which NCRCs had a decline in Ad Placement Coop for Jewel for ASM Timothy Antor in Q3 2025 vs previous year? Sort by decline descending.",
    114: "For each NCRC (cheese shreds/chunks/slices list of 22), show Ad Placement Coop by fiscal week for Jewel for ASM Timothy Antor in Q3 2025 vs previous year.",
    115: "Within Dairy Department for ASM Timothy Antor, for each SMIC (list of 27), which vendors had a decline in Bill-Out Gross in Fiscal Year 2026 vs previous year? Sort by decline descending.",
    116: "Within Dairy Department for ASM Timothy Antor, for each vendor (list of 30), which NCRCs had a decline in Bill-Out Gross in Fiscal Year 2026 vs previous year? Sort by decline descending.",
    117: "What were regular retail and list cost for each NCRC (list of 29 dairy price groups) in Fiscal Year 2026 vs previous year?",
    118: "Which SMICs had a decline in Ad Placement Coop for Jewel for ASM Timothy Antor in Q3 2025 vs previous year? Sort by decline descending.",
    119: "Which vendors had a decline in Line 7 investment dollars in Fiscal Year 2026 vs previous year? Sort by decline descending.",
    120: "Which NCRCs had margin rate compression for ASM Timothy in Fiscal Year 2026 vs previous year?",
    121: "Which SMICs had a change in placement allowance cycles for ASM Timothy for next quarter in Fiscal Year 2025 vs previous year? Sort by change descending.",
    122: "Which vendors had a decline in AIV for ASM Timothy Antor in Fiscal Year 2026 vs previous year? Sort by decline descending.",
    123: "Within Dairy Department for ASM Timothy Antor, which SMICs had a decline in Bill-Out Gross in Fiscal Year 2026 vs previous year? Sort by decline descending.",
    124: "What is the market share MULO+ of APPLES category in JEWEL division for Quarter Q4 year 2025?",
    125: "Get the Price change report for ASM ANNIE MICHALIK in Division JEWEL for fiscal week 02 in year 2026",
    126: "For APPLES Category in JEWEL division, provide the list of the UPCs with their description and dollar sales sorted by the highest sellers for latest 4 weeks",
    127: "Which Categories in the Produce Department had the highest market Share MULO+/Food in JEWEL division across year 2025?",
    128: "For division JEWEL and ASM TIMOTHY ANTOR during quarter Q2 year 2025, identify weeks with year-over-year declines in Allowance dollars by allowance type",
    129: "For each vendor (list of 30) and for each SMIC (list of 30), show NOPAs by allowance type for allowances over $10K in Fiscal Year 2026 vs previous year.",
    130: "For each SMIC REFRIGERATED DRINKS SINGLES, REFRIGERATED YOGURT, REFRIGERATED JUICE BLENDS, which vendors had a change in placement allowance cycles for ASM Timothy for next quarter in Fiscal Year 2025 vs previous year? Sort by change descending.",
    131: "For each vendor (list of 29 specialty dairy vendors), which vendors also had a decline in AGP Dollars for ASM Timothy Antor in Fiscal Year 2026 vs previous year?",
    132: "What were off-invoice per unit and Bill-Out Gross for each NCRC (list of 29 dairy price groups) in Fiscal Year 2026 vs previous year?",
    133: "Which NCRCs in Jewel had fewer weeks at >5% promo depth in Q3 Fiscal Year 2025 and Q4 Fiscal Year 2025 vs previous year?"
  };

  // ---- Name pools for mock generation
  const POOLS = {
    vendors: {
      dairy: ["SARGENTO FOOD CO", "LACTALIS USA", "KRAFT HEINZ CO", "GRP DANONE S A", "CHOBANI INC", "DAISY BRAND", "LAND O LAKES INC", "TILLAMOOK COUNTY CREAMERY", "CABOT CREAMERY INC", "FAGE USA DAIRY IND INC", "DUTCH FARMS", "EGGLANDS BEST LLC", "V&V SUPREMO FOODS INC", "SAPUTO CHEESE USA INC", "OWN BRANDS", "DAIYA FOODS INC", "CACIQUE FOODS LLC"],
      snack: ["PEPSICO INC", "MONDELEZ INTL INC", "THE HERSHEY CO", "GENERAL MILLS INC", "KELLANOVA", "CONAGRA BRANDS", "UTZ BRANDS INC", "THE CAMPBELLS CO", "OWN BRANDS", "MARS INC"],
      coffee: ["KEURIG DR PEPPER", "NESTLE S A SWITZERLAND", "JAB HOLDING JOH A BENCKISER", "THE J M SMUCKER CO", "KRAFT HEINZ CO", "OWN BRANDS", "STARBUCKS CORP"],
      beverage: ["COCA COLA CO", "PEPSICO INC", "KEURIG DR PEPPER", "PRIMO BRANDS CORP", "NESTLE S A SWITZERLAND"],
      produce: ["EVANS FRUIT CO INC", "RAINIER FRUIT CO", "WASHINGTON FRUIT & PRODUCE", "CMI ORCHARDS", "STEMILT GROWERS", "SAGE FRUIT CO", "OWN BRANDS"],
      grocery: ["PEPSICO INC", "GENERAL MILLS INC", "COCA COLA CO", "KRAFT HEINZ CO", "THE CAMPBELLS CO", "NESTLE S A SWITZERLAND", "PROCTER & GAMBLE", "KEURIG DR PEPPER", "MARS INC", "MCCORMICK & CO INC", "MONDELEZ INTL INC", "HORMEL FOODS LLC", "CONAGRA BRANDS", "WK KELLOGG CO", "UNILEVER", "OWN BRANDS", "THE J M SMUCKER CO", "THE HERSHEY CO", "GRUPO BIMBO", "TYSON FOODS INC"]
    },
    smics: {
      dairy: ["CHEESE SHREDS", "CHEESE CHUNKS", "CHEESE SLICES", "CHEESE INTERNATIONAL", "REFRIGERATED YOGURT", "SOUR CREAM", "CREAM CHEESE", "EGGS SHELL", "BUTTER/MARGARINE & SPREADS", "CREAMERS & CREAM", "COTTAGE CHEESE", "REFRIGERATED ORANGE JUICE", "REFRIGERATED DIPS", "CHEESE SNACKING"],
      snack: ["SALTY SNACK BAG/CANISTER", "CRACKERS", "COOKIES", "TAKE HOME CANDY, GUM & MINTS", "INSTANT CONSUMABLE CANDY"],
      grocery: ["CARBONATED SOFT DRINKS", "READY TO EAT CEREAL", "COFFEE", "READY TO SERVE SOUPS", "SHELF STABLE PASTA & PIZZA SAUCE", "MAYONNAISE", "BATH TISSUE", "PAPER TOWELS", "LAUNDRY DETERGENT", "HOT CEREAL", "BREAKFAST BREAD"],
      produce: ["APPLES", "BERRIES", "CITRUS", "GRAPES", "SALAD BLENDS", "TOMATOES"],
      coffee: ["COFFEE", "REFRIGERATED COFFEE", "COFFEE PODS", "COFFEE WHOLE BEAN"],
      beverage: ["CARBONATED SOFT DRINKS", "SPORTS DRINKS", "BOTTLED WATER CONVENIENCE", "SPARKLING WATER"]
    },
    items: {
      dairy: ["SARGENTO SHREDDED CHEESE 8OZ", "LUCERNE CHEESE SHREDS 8OZ", "PHILADELPHIA CREAM CHEESE BRICK 8OZ", "DAISY SOUR CREAM 16OZ", "CHOBANI GREEK YOGURT 5.3OZ", "FAGE TOTAL 0% 5.3OZ", "JEWEL EGGS LARGE GRADE A 12CT", "LAND O LAKES BUTTER QTR 16OZ", "TILLAMOOK CHEDDAR CHUNK 8OZ", "CABOT SERIOUSLY SHARP 8OZ", "DUTCH FARMS EGGS LARGE A 18CT", "LUCERNE CREAM CHEESE TUB 8OZ"],
      snack: ["LAYS CLASSIC 8OZ", "DORITOS NACHO CHEESE 9.25OZ", "CHEEZ-IT ORIGINAL 12.4OZ", "RITZ CRACKERS 13.7OZ", "TOSTITOS SCOOPS 10OZ", "SIGNATURE SELECT KETTLE CHIPS 8OZ", "PRINGLES ORIGINAL 5.2OZ", "OREO FAMILY SIZE 19.1OZ", "SNYDERS PRETZEL PIECES 11.25OZ", "SMARTFOOD WHITE CHEDDAR 6.75OZ"],
      grocery: ["HEINZ TOMATO KETCHUP 32OZ", "FOLGERS CLASSIC ROAST 25.9OZ", "CHEERIOS 18OZ", "CAMPBELLS CHICKEN NOODLE 10.75OZ", "SIGNATURE SELECT PASTA SAUCE 24OZ", "ANGEL SOFT 16 MEGA ROLL", "TIDE PODS 42CT", "JIF CREAMY PEANUT BUTTER 16OZ", "BOUNTY PAPER TOWELS 6CT", "COCA COLA 12PK 12OZ"],
      produce: ["HONEYCRISP APPLES LB", "GALA APPLES 3LB BAG", "FUJI APPLES LB", "GRANNY SMITH APPLES LB", "COSMIC CRISP APPLES LB", "ORGANIC HONEYCRISP 2LB", "ENVY APPLES LB", "PINK LADY APPLES 3LB BAG"],
      coffee: ["FOLGERS CLASSIC ROAST 25.9OZ", "STARBUCKS PIKE PLACE K-CUP 22CT", "PEETS MAJOR DICKASONS 12OZ", "SIGNATURE SELECT COFFEE 30.6OZ", "DUNKIN ORIGINAL 20OZ", "CAFE BUSTELO ESPRESSO 10OZ"],
      beverage: ["COCA COLA 12PK", "PEPSI 12PK", "DR PEPPER 12PK", "GATORADE 8PK", "SPARKLING ICE VARIETY 12PK"]
    },
    ncrcs: {
      dairy: ["SARGENTO SHREDDED CHEESE 5-8 OZ.", "LUCERNE CHEESE SHREDS", "PHILADELPHIA CREAM CHEESE BRICK", "DAISY SOUR CREAM", "CHOBANI YOGURT", "JEWEL EGGS LARGE GRADE A", "LAND O LAKES BUTTER QTR", "CABOT CHEESE SHREDS", "LUCERNE BUTTER QUARTERS", "FAIRLIFE MILK", "YOPLAIT YOGURT", "NESTLE COFFEE-MATE CREAMER", "DUTCH FARMS EGGS LARGE A", "SARGENTO CHEESE SLICES", "LUCERNE CREAM CHEESE TUB"],
      snack: ["LAYS CORE SALTY 7.75-8 OZ", "DORITOS 9.25 OZ", "CHEEZ-IT 12.4 OZ", "RITZ CORE CRACKERS", "TOSTITOS CHIPS & DIPS", "PRINGLES CORE CANS", "OREO FAMILY SIZE"],
      grocery: ["HEINZ KETCHUP 32-38 OZ", "FOLGERS LARGE CANS", "CHEERIOS CORE CEREAL", "ANGEL SOFT 16 MR", "TIDE PODS CORE", "CAMPBELLS CONDENSED CORE", "COCA COLA 12PK CANS"],
      produce: ["HONEYCRISP APPLES BULK", "GALA APPLES BAGGED", "FUJI APPLES BULK", "ORGANIC APPLES BAGGED", "COSMIC CRISP BULK"],
      coffee: ["FOLGERS LARGE CANS", "STARBUCKS K-CUP 22-24CT", "SIGNATURE SELECT COFFEE CANS", "PEETS BAGGED 10-12OZ"],
      beverage: ["COCA COLA 12PK CANS", "PEPSI 12PK CANS", "GATORADE MULTIPACKS"]
    },
    cities: {
      jewel: ["Chicago", "Naperville", "Evanston", "Oak Park", "Schaumburg", "Skokie", "Arlington Heights", "Downers Grove", "Elmhurst", "Wheaton", "Joliet", "Aurora", "Palatine", "Des Plaines", "Orland Park", "Tinley Park", "Niles", "Berwyn", "Melrose Park", "Glenview"],
      southern: ["Houston", "Dallas", "Fort Worth", "Austin", "San Antonio", "Baton Rouge", "New Orleans", "Shreveport", "Lafayette", "Tyler", "Beaumont", "Plano"]
    },
    tactics: ["Buy 2 for $6", "BOGO Free", "$1.00 Off Digital Coupon (J4U)", "25% Off", "2 for $5", "$2.99 Each with Card", "Buy 5 Save $5 Mix & Match", "3 for $10", "Buy 2 Get 1 Free", "$1.49 Each Limit 4"],
    allowTypes: ["Scan", "Copient/J4U", "Off-Invoice", "Billback", "Header Flat", "Item Flat", "Ad Placement Coop", "Price Break", "Trade Discount", "New Item"],
    reports: {
      "Vendor Performance": ["Vendor", "Sales TY", "Sales LY", "Units TY", "AGP % TY", "AGP % LY", "Total Allow TY", "Spend Rate"],
      "Vendor Scorecard": ["Measure", "TY", "LY", "Change", "vs Division Avg"],
      "Cost Change": ["UPC", "Description", "Old VLC", "New VLC", "Change", "Effective Week", "Retail Reaction"],
      "Price Change": ["UPC", "Description", "Old Retail", "New Retail", "Change", "Price Area", "Effective Date"],
      "CIG BOG Compression": ["CIG", "Description", "BOG TY", "BOG LY", "Compression", "Off-Inv/Unit Δ", "List Cost Δ"]
    }
  };

  const GLOSSARY = {
    AGP: "Adjusted Gross Profit — sales minus cost of goods after allowances (sca.AGP_AMT).",
    AIV: "Average Item Value — Sales ÷ Units; blended price/mix signal (INT_MET_0018).",
    BOG: "Bill-Out Gross — retail minus cost on the billing side (master_bill_out_gross; never mixed with POS sales).",
    CIG: "Common Item Group — merch grouping of UPCs (item_hierarchy.COMMON_ITEM_GROUP_CD).",
    NCRC: "National Common Retail Code — national price group of UPCs (NATIONAL_COMMON_RETAIL_CD).",
    SMIC: "3-digit category code — CATEGORY_ID level of the item hierarchy.",
    "Line 7": "Vendor allowance earnings line (line7_nopa.Line7_AMT) by offer / allowance type.",
    NOPA: "Allowance deal document ID linking offers to vendor agreements (allowance_promo_map.NOPA_ID).",
    "Take rate": "Redemptions ÷ units sold during the offer window.",
    "Spend rate": "Total Allowances ÷ Vendor List Cost (INT_MET_0072).",
    Deadnet: "Cost after all vendor funding — the true landed cost (sca.DEADNET_COST).",
    Copient: "Digital coupon platform (J4U) — an allowance/redemption type.",
    ACI: "Albertsons Companies Inc — 'Total ACI average' = enterprise benchmark.",
    MULO_PLUS: "Circana multi-outlet+ market universe used for share.",
    KVI: "Known Value Item (item_hierarchy.ITEM_ROLE).",
    Quad: "Promo performance quadrant on Sales Δ × Profit Δ: Q1 +/+, Q2 +/− (correct), Q3 −/− (correct), Q4 −/+ (watch volume).",
    SLU: "Store-Level Unit — the store execution document for constructing and pricing a promotional display or item group.",
    PO: "Purchase Order — arrival dates and off-invoice unit linkage live on PO receiving records (not yet onboarded)."
  };

  return { ARCHETYPES, QUESTIONS: Q, QUESTION_TEXT, POOLS, GLOSSARY };
})();
