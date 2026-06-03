/* eslint-disable no-restricted-syntax */
// Mock provider for the 52-week promotional plan + promotion-detail screen.
//
// Provider abstraction: a future "real" provider plugs in by setting
// PROMO_PLAN_PROVIDER=real in the environment. The shape returned from each
// method below is the contract; see ./promoPlanRealStore.js for the stub.
//
// For the 52-week table:
//   - Weeks 1..currentWeek-1 are LOCKED actuals: cost/price/allowance values
//     are absolutes (a fixed snapshot from "now").
//   - Weeks currentWeek..52 are FUTURE: values come from LY actuals lifted by
//     a deterministic trend slope so the planner sees prefilled projections
//     they can override later.
//
// Everything is deterministic. Seed = hash(division, week) so the same UI
// state on reload renders identical numbers.

const CURRENT_WEEK = 7; // first 6 weeks are locked actuals, week 7+ is future

const divisions = [
  "DENVER", "HAGGEN", "PORTLAND", "SEATTLE", "NORCAL", "SOCAL",
  "SOUTHWEST", "MOUNTAIN", "JEWEL", "TEXAS", "MID-ATLANTIC", "UNITED"
];

const storeTactics = [
  { name: "Item Discount", code: "ID", className: "item" },
  { name: "Buy X Get X", code: "BXGX", className: "bxgx" },
  { name: "No store promo", code: "~", className: "none" }
];

const digitalTactics = [
  { name: "Item Discount", code: "ID" },
  { name: "Must Buy", code: "MB" },
  { name: "Buy X Get X", code: "BXGX" },
  { name: "Buy X Get Y", code: "BXGY" },
  { name: "Fab 5", code: "F5" },
  { name: "Meal Deal", code: "MD" },
  { name: "WOD/POD", code: "WOD" },
  { name: "Continuity", code: "CONT" },
  { name: "Personalized Deals", code: "PERS" }
];

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}

// --- 52-week plan ----------------------------------------------------------

function lyBaseline(groupIndex, week) {
  // Synthetic last-year actuals: smooth seasonal curve + division offset.
  // Real provider would replace this with a historical query.
  const seasonal = Math.sin((week / 52) * Math.PI * 2 + groupIndex * 0.4) * 0.18;
  const lyVlc = 1.92 + groupIndex * 0.012 + seasonal * 0.08;
  const lyNet = lyVlc - 0.18 - ((week + groupIndex) % 4) * 0.011;
  const lyDead = lyNet - 0.11 - ((week + 2 * groupIndex) % 3) * 0.009;
  const lyBase = 5.15 + groupIndex * 0.030 + seasonal * 0.20;
  const lyPromo = lyBase - (1.78 + ((week + groupIndex) % 5) * 0.07);
  const lyCpiBase = 96 + groupIndex * 1.6 + seasonal * 12;
  const lyCpiPromo = 122 + groupIndex * 2.0 + seasonal * 18;
  return { vlc: lyVlc, net: lyNet, dead: lyDead, base: lyBase, promo: lyPromo, cpiBase: lyCpiBase, cpiPromo: lyCpiPromo };
}

function lockedActuals(groupIndex, week) {
  // Locked-actual snapshot for weeks before the current planning cursor.
  // Real provider would return audited historical values from the data warehouse.
  const ly = lyBaseline(groupIndex, week);
  // Small inflationary lift vs LY so the locked actuals are visibly different
  // from the LY baseline once the user opens the popover.
  return {
    vlc: ly.vlc * 1.034,
    net: ly.net * 1.030,
    dead: ly.dead * 1.026,
    base: ly.base * 1.022,
    promo: ly.promo * 1.018,
    cpiBase: ly.cpiBase + 4,
    cpiPromo: ly.cpiPromo + 6
  };
}

function trendProjection(groupIndex, week) {
  // Future-week projection: LY actuals lifted by a per-week trend slope.
  // Real provider would call into an econometric forecaster.
  const ly = lyBaseline(groupIndex, week);
  const weeksAhead = Math.max(0, week - CURRENT_WEEK + 1);
  const trendLift = 1 + weeksAhead * 0.0021; // ~10.9% over 52 weeks at the long edge
  const noise = Math.cos((week + groupIndex) / 4.2) * 0.012;
  return {
    vlc: ly.vlc * trendLift + noise,
    net: ly.net * trendLift + noise * 0.92,
    dead: ly.dead * trendLift + noise * 0.85,
    base: ly.base * (1 + weeksAhead * 0.0018) + noise * 0.6,
    promo: ly.promo * (1 + weeksAhead * 0.0016) + noise * 0.5,
    cpiBase: ly.cpiBase + weeksAhead * 0.42,
    cpiPromo: ly.cpiPromo + weeksAhead * 0.51
  };
}

function dealValues(groupIndex, week, isLocked) {
  return isLocked ? lockedActuals(groupIndex, week) : trendProjection(groupIndex, week);
}

function readPromoCell(groupIndex, week) {
  const isLocked = week < CURRENT_WEEK;
  const noStore = (week + groupIndex) % 9 === 0;
  const store = noStore ? storeTactics[2] : storeTactics[(week + groupIndex) % 2];
  const digitalCount = noStore
    ? ((week + groupIndex) % 4 === 0 ? 1 : 0)
    : ((week + groupIndex) % 5 === 0 ? 3 : ((week + groupIndex) % 3 === 0 ? 2 : 0));
  const digital = Array.from({ length: digitalCount }, (_, i) =>
    digitalTactics[(week + groupIndex * 2 + i * 3) % digitalTactics.length]
  );
  const digitalSalesLift = digital.length ? digital.length * 0.045 : 0;
  const digitalUnitLift = digital.length ? digital.length * 5.5 : 0;
  const digitalAgpLift = digital.length ? digital.length * 0.008 - (digital.length > 1 ? 0.012 : 0) : 0;
  const sales = (0.72 + groupIndex * 0.05 + week * 0.012 + (store.code === "BXGX" ? 0.05 : 0) + digitalSalesLift);
  const units = (86 + groupIndex * 7 + week * 1.9 + (store.code === "BXGX" ? 12 : 0) + digitalUnitLift);
  const agp = (0.18 + groupIndex * 0.018 + week * 0.004 + digitalAgpLift);
  const retailAllowance = 52 + ((week + groupIndex) % 7) * 3;
  const buyingAllowance = Math.max(18, 78 - retailAllowance);
  const deal = dealValues(groupIndex, week, isLocked);
  const allowancePerUnit = deal.promo * ((retailAllowance + buyingAllowance) / 100);
  return {
    week,
    isLocked,
    store,
    digital,
    sales,
    units,
    agp,
    retailAllowance,
    buyingAllowance,
    vlc: deal.vlc,
    netCost: deal.net,
    deadNetCost: deal.dead,
    basePrice: deal.base,
    promoPrice: deal.promo,
    cpiBase: deal.cpiBase,
    cpiPromo: deal.cpiPromo,
    allowancePerUnit
  };
}

const vendors = [
  "COCA COLA CO",
  "PEPSICO INC",
  "KEURIG DR PEPPER",
  "OWN BRANDS",
  "BOAR'S HEAD",
  "KRETSCHMAR",
  "TYSON FOODS",
  "SARA LEE"
];

function getPromoPlan(filters = {}) {
  const requestedDivisions = Array.isArray(filters.divisions) && filters.divisions.length
    ? divisions.filter((d) => filters.divisions.includes(d))
    : divisions;
  const cells = {};
  requestedDivisions.forEach((division) => {
    const gi = divisions.indexOf(division);
    cells[division] = Array.from({ length: 52 }, (_, i) => readPromoCell(gi, i + 1));
  });
  // Synthesise vendor-keyed cells too so the Vendors toggle has data to
  // render. Same shape as divisions; the seed shifts so the values differ.
  vendors.forEach((vendor, i) => {
    cells[vendor] = Array.from({ length: 52 }, (_, w) => readPromoCell(divisions.length + i, w + 1));
  });
  return {
    source: "synthetic-ly-trend",
    divisions: requestedDivisions,
    vendors,
    currentWeek: CURRENT_WEEK,
    cells
  };
}

// --- Promotion detail (catalog, worklist, offer table, ladder, runs, scatter)

const promoVendorCatalog = [
  {
    vendor: "COCA COLA CO",
    priceAreas: ["PA01", "PA02", "PA03", "PA04"],
    ncrcs: [
      { ncrc: "NCRC 30043", item: "COCA COLA ZERO SUGAR", packSize: "12-12FZ", upc: "012345670043", salesBin: 1, agpBin: 1 },
      { ncrc: "NCRC 30044", item: "COCA COLA CLASSIC", packSize: "12-12FZ", upc: "012345670044", salesBin: 1, agpBin: 1 },
      { ncrc: "NCRC 30045", item: "COCA COLA CHERRY", packSize: "8-12FZ", upc: "012345670045", salesBin: 3, agpBin: 2 },
      { ncrc: "NCRC 30046", item: "COCA COLA DIET", packSize: "2L PET", upc: "012345670046", salesBin: 2, agpBin: 3 },
      { ncrc: "NCRC 30047", item: "SPRITE", packSize: "12-12FZ", upc: "012345670047", salesBin: 2, agpBin: 2 },
      { ncrc: "NCRC 30048", item: "FANTA ORANGE", packSize: "12-12FZ", upc: "012345670048", salesBin: 4, agpBin: 4 }
    ]
  },
  {
    vendor: "PEPSICO INC",
    priceAreas: ["PA01", "PA02", "PA03", "PA05"],
    ncrcs: [
      { ncrc: "NCRC 30101", item: "PEPSI ZERO SUGAR", packSize: "12-12FZ", upc: "012345670101", salesBin: 1, agpBin: 2 },
      { ncrc: "NCRC 30102", item: "PEPSI WILD CHERRY", packSize: "8-12FZ", upc: "012345670102", salesBin: 3, agpBin: 3 },
      { ncrc: "NCRC 30103", item: "MOUNTAIN DEW", packSize: "12-12FZ", upc: "012345670103", salesBin: 1, agpBin: 1 },
      { ncrc: "NCRC 30104", item: "PEPSI ORIGINAL", packSize: "2L PET", upc: "012345670104", salesBin: 2, agpBin: 3 }
    ]
  },
  {
    vendor: "KEURIG DR PEPPER",
    priceAreas: ["PA01", "PA02", "PA03"],
    ncrcs: [
      { ncrc: "NCRC 30201", item: "DR PEPPER", packSize: "12-12FZ", upc: "012345670201", salesBin: 2, agpBin: 1 },
      { ncrc: "NCRC 30202", item: "7UP", packSize: "12-12FZ", upc: "012345670202", salesBin: 3, agpBin: 3 },
      { ncrc: "NCRC 30203", item: "DR PEPPER ZERO", packSize: "8-12FZ", upc: "012345670203", salesBin: 4, agpBin: 4 }
    ]
  },
  {
    vendor: "OWN BRANDS",
    priceAreas: ["PA01", "PA02", "PA03", "PA04", "PA05"],
    ncrcs: [
      { ncrc: "NCRC 30301", item: "SIGNATURE COLA", packSize: "12-12FZ", upc: "012345670301", salesBin: 2, agpBin: 1 },
      { ncrc: "NCRC 30302", item: "REFRESHE LEMON LIME", packSize: "12-12FZ", upc: "012345670302", salesBin: 4, agpBin: 4 },
      { ncrc: "NCRC 30303", item: "SIGNATURE DIET COLA", packSize: "2L PET", upc: "012345670303", salesBin: 5, agpBin: 4 }
    ]
  }
];

const promoOfferLibrary = [
  { id: "id-1off", label: "$1 Off", storeTactic: { name: "Item Discount", code: "ID", className: "item" }, digitalTactic: "4U Item Discount", digitalSave: 1.50, storeSave: 1.00, mbStore: 1, mbDigital: 1, limitStore: 6, limitDigital: 8, hasAd: true, hasDisplay: true, adPage: "A2", displayLoc: "Island", category: "Price discount" },
  { id: "bxgx-bogo50", label: "BOGO 50%", storeTactic: { name: "Buy X Get X", code: "BXGX", className: "bxgx" }, digitalTactic: "4U Must Buy", digitalSave: 2.20, storeSave: 1.80, mbStore: 2, mbDigital: 2, limitStore: 8, limitDigital: 8, hasAd: true, hasDisplay: true, adPage: "Front", displayLoc: "Wing", category: "Multi-buy" },
  { id: "bxgx-b1g1", label: "Buy 1 Get 1", storeTactic: { name: "Buy X Get X", code: "BXGX", className: "bxgx" }, digitalTactic: "4U Fab 5", digitalSave: 2.50, storeSave: 2.00, mbStore: 2, mbDigital: 2, limitStore: 6, limitDigital: 6, hasAd: true, hasDisplay: true, adPage: "A2", displayLoc: "Island", category: "Multi-buy" },
  { id: "id-2for5", label: "2 for $5", storeTactic: { name: "Item Discount", code: "ID", className: "item" }, digitalTactic: "4U Meal Deal", digitalSave: 1.80, storeSave: 1.50, mbStore: 2, mbDigital: 2, limitStore: 10, limitDigital: 10, hasAd: true, hasDisplay: false, adPage: "Back", displayLoc: "Endcap", category: "Price point" },
  { id: "bxgx-bogofree", label: "BOGO Free", storeTactic: { name: "Buy X Get X", code: "BXGX", className: "bxgx" }, digitalTactic: null, digitalSave: 0, storeSave: 2.60, mbStore: 2, mbDigital: 0, limitStore: 4, limitDigital: 0, hasAd: true, hasDisplay: true, adPage: "Front", displayLoc: "Island", category: "Multi-buy" }
];

const weeklyRunTemplates = [
  { tactic: "Item Discount", digital: "4U Item Discount", adPage: "A2", display: "Island" },
  { tactic: "Buy X Get X", digital: "4U Must Buy", adPage: "Front", display: "Wing" },
  { tactic: "Item Discount", digital: null, adPage: "Back", display: "Endcap" },
  { tactic: "Buy X Get X", digital: "4U Fab 5", adPage: "Front", display: "Island" },
  { tactic: "Item Discount", digital: "4U Personalized Deals", adPage: "Digital", display: "Digital only" }
];

function getPromotionDetailOptions(filters = {}) {
  const vendors = promoVendorCatalog.map((row) => row.vendor);
  const vendorRow = filters.vendor ? promoVendorCatalog.find((row) => row.vendor === filters.vendor) : null;
  const priceAreas = vendorRow ? vendorRow.priceAreas : [];
  const ncrcs = vendorRow ? vendorRow.ncrcs : [];
  // Flat lists across all vendors so the selectors are independent of each
  // other — vendor and price area can be picked in any order.
  const allPriceAreasSet = new Set();
  promoVendorCatalog.forEach((row) => row.priceAreas.forEach((area) => allPriceAreasSet.add(area)));
  const allPriceAreas = Array.from(allPriceAreasSet).sort();
  const allNcrcs = [];
  promoVendorCatalog.forEach((row) => {
    row.ncrcs.forEach((nc) => {
      allNcrcs.push({ ...nc, vendor: row.vendor });
    });
  });
  return {
    vendors,
    priceAreas,
    ncrcs,
    allPriceAreas,
    allNcrcs,
    selected: {
      vendor: filters.vendor || null,
      priceArea: filters.priceArea || null,
      ncrc: filters.ncrc || null
    }
  };
}

function findCatalogEntry(vendor, ncrc) {
  if (!vendor || !ncrc) return null;
  const vendorRow = promoVendorCatalog.find((row) => row.vendor === vendor);
  if (!vendorRow) return null;
  const ncrcRow = vendorRow.ncrcs.find((row) => row.ncrc === ncrc);
  if (!ncrcRow) return null;
  return { vendorRow, ncrcRow };
}

function recommendedOfferShortLabel(seed) {
  return promoOfferLibrary[seed % promoOfferLibrary.length].label;
}

function getPromotionDetailWorklist(filters = {}) {
  const velocityKind = filters.velocityKind === "agp" ? "agp" : "sales";
  const bin = filters.bin ? Math.max(1, Math.min(5, Number(filters.bin))) : 1;
  const week = Number(filters.week || 7);
  const vendorFilter = filters.vendor || "";
  const priceAreaFilter = filters.priceArea || "";

  const items = [];
  promoVendorCatalog.forEach((vendorRow) => {
    if (vendorFilter && vendorRow.vendor !== vendorFilter) return;
    const priceAreas = priceAreaFilter
      ? vendorRow.priceAreas.filter((area) => area === priceAreaFilter)
      : vendorRow.priceAreas;
    vendorRow.ncrcs.forEach((ncrcRow) => {
      const itemBin = velocityKind === "agp" ? ncrcRow.agpBin : ncrcRow.salesBin;
      if (itemBin !== bin) return;
      priceAreas.forEach((area) => {
        const seed = hashString(`${vendorRow.vendor}-${area}-${ncrcRow.ncrc}-${week}`);
        items.push({
          vendor: vendorRow.vendor,
          priceArea: area,
          ncrc: ncrcRow.ncrc,
          item: ncrcRow.item,
          packSize: ncrcRow.packSize,
          salesBin: ncrcRow.salesBin,
          agpBin: ncrcRow.agpBin,
          recommendedOfferLabel: recommendedOfferShortLabel(seed)
        });
      });
    });
  });
  items.sort((a, b) => hashString(a.ncrc + a.priceArea) - hashString(b.ncrc + b.priceArea));

  const binCounts = { sales: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, agp: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  promoVendorCatalog.forEach((vendorRow) => {
    if (vendorFilter && vendorRow.vendor !== vendorFilter) return;
    const areas = priceAreaFilter ? vendorRow.priceAreas.filter((a) => a === priceAreaFilter) : vendorRow.priceAreas;
    vendorRow.ncrcs.forEach((ncrcRow) => {
      const multiplier = areas.length;
      binCounts.sales[ncrcRow.salesBin] = (binCounts.sales[ncrcRow.salesBin] || 0) + multiplier;
      binCounts.agp[ncrcRow.agpBin] = (binCounts.agp[ncrcRow.agpBin] || 0) + multiplier;
    });
  });

  return {
    velocityKind,
    bin,
    week,
    vendor: vendorFilter || null,
    priceArea: priceAreaFilter || null,
    binCounts,
    items,
    total: items.length
  };
}

function buildForecastSummary(seed, plan, halo, cannibalization) {
  // With Promo (current plan)
  const lift = 1 + (seed % 7) * 0.014;
  const wpUnits = Math.round(plan.units * lift);
  const wpSales = Math.round(plan.sales * lift);
  const wpAgp = Math.round(plan.agp * lift);
  const wpAgpPct = (wpAgp / wpSales) * 100;
  const wpAiv = wpSales / wpUnits;
  const wpHhs = Math.round(wpUnits * (0.62 + (seed % 5) * 0.02));

  // No Promo baseline — sells less but margin per unit is higher.
  const npUnits = Math.round(wpUnits * 0.31);
  const npSales = Math.round(npUnits * (wpSales / wpUnits) * 1.65); // higher AIV at full retail
  const npAgp = Math.round(npSales * 0.51);
  const npAgpPct = (npAgp / npSales) * 100;
  const npAiv = npSales / npUnits;
  const npHhs = Math.round(npUnits * 0.78);

  // Halo + cannibalization, expressed relative to With Promo.
  const haloUnits = Math.round(wpUnits * halo);
  const haloSales = Math.round(wpSales * halo);
  const haloAgp = Math.round(wpAgp * halo);
  const cannUnits = Math.round(wpUnits * cannibalization);
  const cannSales = Math.round(wpSales * cannibalization);
  const cannAgp = Math.round(wpAgp * cannibalization);
  const netInterUnits = haloUnits + cannUnits;
  const netInterSales = haloSales + cannSales;
  const netInterAgp = haloAgp + cannAgp;

  // LY comparison vs With Promo.
  const lyUnits = Math.round(wpUnits * (0.93 + (seed % 7) * 0.004));
  const lySales = Math.round(wpSales * (0.94 + (seed % 5) * 0.005));
  const lyAgp = Math.round(wpAgp * (0.91 + (seed % 6) * 0.006));
  const lyAgpPct = (lyAgp / lySales) * 100;
  const lyAiv = lySales / lyUnits;
  const lyHhs = Math.round(wpHhs * (0.95 + (seed % 4) * 0.006));

  // Markdown + transaction allowance (ROI view)
  const markdownDollar = Math.round(wpSales * (0.18 + (seed % 5) * 0.014));
  const markdownPct = (markdownDollar / (wpSales + markdownDollar)) * 100;
  const transactionAllowance = Math.round(markdownDollar * (0.42 + (seed % 4) * 0.04));
  const netMarkdown = markdownDollar - transactionAllowance;
  const markdownRoiPct = (transactionAllowance / markdownDollar) * 100;

  return {
    // New richer shape. The legacy `metrics` array still appears for any
    // older consumers that read it.
    metrics: [
      { key: "sales", label: "Sales", isCurrency: true, displayAs: "compactDollar", current: wpSales, ly: lySales, rolling: Math.round(wpSales * 0.97), halo: haloSales, cannibalization: cannSales, net: wpSales + haloSales + cannSales },
      { key: "units", label: "Units", isCurrency: false, displayAs: "compact", current: wpUnits, ly: lyUnits, rolling: Math.round(wpUnits * 0.97), halo: haloUnits, cannibalization: cannUnits, net: wpUnits + haloUnits + cannUnits },
      { key: "agp", label: "AGP", isCurrency: true, displayAs: "compactDollar", current: wpAgp, ly: lyAgp, rolling: Math.round(wpAgp * 0.95), halo: haloAgp, cannibalization: cannAgp, net: wpAgp + haloAgp + cannAgp }
    ],
    grid: {
      withPromo: { sales: wpSales, units: wpUnits, agpDollar: wpAgp, agpPct: wpAgpPct, aiv: wpAiv, hhs: wpHhs },
      noPromo:   { sales: npSales, units: npUnits, agpDollar: npAgp, agpPct: npAgpPct, aiv: npAiv, hhs: npHhs },
      netInteractions: {
        halo:  { sales: haloSales, units: haloUnits, agpDollar: haloAgp },
        cannib: { sales: cannSales, units: cannUnits, agpDollar: cannAgp },
        net:   { sales: netInterSales, units: netInterUnits, agpDollar: netInterAgp }
      },
      ly:        { sales: lySales, units: lyUnits, agpDollar: lyAgp, agpPct: lyAgpPct, aiv: lyAiv, hhs: lyHhs },
      markdown:  { markdownDollar, markdownPct, transactionAllowance, netMarkdown, roiPct: markdownRoiPct }
    },
    narrative: `Plan delivers $${(wpSales / 1000).toFixed(0)}K sales vs no-promo baseline of $${(npSales / 1000).toFixed(0)}K. Net halo + cannibalization: $${((netInterSales) / 1000).toFixed(0)}K. Markdown $${(markdownDollar / 1000).toFixed(0)}K (${markdownPct.toFixed(1)}%), offset by transaction allowance $${(transactionAllowance / 1000).toFixed(0)}K (ROI ${markdownRoiPct.toFixed(0)}%).`
  };
}

function fmtMoney(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) >= 1000000) return `$${(numeric / 1000000).toFixed(2)}M`;
  if (Math.abs(numeric) >= 1000) return `${numeric < 0 ? "-" : ""}$${Math.abs(numeric / 1000).toFixed(2)}K`;
  return `${numeric < 0 ? "-" : ""}$${Math.abs(numeric).toFixed(2)}`;
}

function buildOfferRow(offer, seed, index, vlc, basePrice, currentPlanIndex, paFundingZero) {
  const localSeed = seed + index * 13;
  const promoPrice = Number((basePrice - offer.storeSave).toFixed(2));
  const digitalPromoPrice = offer.digitalTactic ? Number((basePrice - offer.digitalSave).toFixed(2)) : null;
  // When the PA has no live NOPA the merchant sees no off-invoice
  // allowance and no vendor funding — net cost equals VLC, dead net
  // collapses to net cost. We still let the row exist so the planner
  // can pick a tactic, but the UI now flags it as unfunded.
  const offInvoice = paFundingZero
    ? 0
    : Number((vlc * (0.22 + ((localSeed % 5) * 0.04))).toFixed(2));
  const netCost = Number((vlc - offInvoice).toFixed(2));
  const vendorFunding = paFundingZero
    ? 0
    : Number((vlc * (0.32 + ((localSeed % 4) * 0.03))).toFixed(2));
  const forecastUnits = Math.round(140000 + (localSeed % 23) * 5200 + index * 9000);
  const forecastSales = Math.round(forecastUnits * promoPrice);
  const forecastAgp = Math.round(forecastSales * (0.18 + ((localSeed % 5) * 0.018)));
  const lyUnits = Math.round(forecastUnits * (0.84 + (localSeed % 7) * 0.012));
  const lySales = Math.round(forecastSales * (0.88 + (localSeed % 5) * 0.014));
  const lyAgp = Math.round(forecastAgp * (0.90 + (localSeed % 6) * 0.011));
  const unitDeltaPct = ((forecastUnits - lyUnits) / lyUnits) * 100;
  const salesDeltaPct = ((forecastSales - lySales) / lySales) * 100;
  const agpDeltaPct = ((forecastAgp - lyAgp) / lyAgp) * 100;
  const guardrail = Math.min(100, 58 + ((localSeed % 11) * 3) + (offer.category === "Multi-buy" ? 8 : 0));
  const reliability = Math.min(100, 52 + ((localSeed % 9) * 4) + (offer.digitalTactic ? 9 : 0));
  const totalScore = Math.round(guardrail * 0.45 + reliability * 0.45 + (index === 0 ? 10 : 5));
  const winLoss = forecastAgp > 35000 && forecastUnits > 150000 ? "WIN-WIN" : forecastAgp > 30000 ? "AGP win" : "Volume win";
  return {
    id: offer.id,
    rank: index + 1,
    label: offer.label,
    category: offer.category,
    isRecommended: index === 0,
    isCurrentPlan: index === currentPlanIndex,
    storeTactic: offer.storeTactic,
    digitalTactic: offer.digitalTactic,
    netCost,
    regPrice: basePrice,
    promoStorePrice: promoPrice,
    promoDigitalPrice: digitalPromoPrice,
    storeSave: offer.storeSave,
    digitalSave: offer.digitalSave,
    mbStore: offer.mbStore,
    limitStore: offer.limitStore,
    mbDigital: offer.mbDigital,
    limitDigital: offer.limitDigital,
    hasAd: offer.hasAd,
    hasDisplay: offer.hasDisplay,
    adPage: offer.adPage,
    displayLoc: offer.displayLoc,
    forecastUnits,
    forecastSales,
    forecastAgp,
    lyUnits,
    lySales,
    lyAgp,
    unitDeltaPct: Number(unitDeltaPct.toFixed(1)),
    salesDeltaPct: Number(salesDeltaPct.toFixed(1)),
    agpDeltaPct: Number(agpDeltaPct.toFixed(1)),
    vendorFunding,
    guardrailScore: guardrail,
    reliabilityScore: reliability,
    totalScore,
    winLoss,
    allowancePerUnit: Number((offInvoice + (vlc * 0.06) + (vlc * 0.18)).toFixed(2))
  };
}

function buildNarrative(target, recommended, context) {
  const item = context.item;
  const upc = item.upc || "";
  const subjectName = `${target.storeTactic.name}${target.digitalTactic ? ` (store) + ${target.digitalTactic.replace(/^4U /, "")} (digital)` : " (store only)"}`;
  const isSameOffer = target.id === recommended.id;
  const salesDelta = target.forecastSales - recommended.forecastSales;
  const unitsDelta = target.forecastUnits - recommended.forecastUnits;
  const agpDelta = target.forecastAgp - recommended.forecastAgp;
  const halo = Math.round(target.forecastSales * 0.012);
  const cannibSales = Math.round(target.forecastSales * -0.038);

  if (isSameOffer) {
    return {
      title: `${target.label} (${target.storeTactic.code})`,
      subtitle: `${upc} ${item.description}_${item.packSize || ""} in ${String(context.priceArea || "").replace(/^PA0?/, "0")} for Week ${context.week}`,
      recommendation: `${target.label} (store only)`,
      shortVersion: `This is the model's pick. Protected profit at ${fmtMoney(target.forecastAgp)} AGP, predictable execution (store-only), strong historical fit.`,
      whySafeCall: {
        title: `Why ${target.label} (store only) is the safe call`,
        bullets: [
          `Last year ran a similar store-only tactic with no digital promotion; this stays in that same shape.`,
          `Protects profit: ${fmtMoney(target.forecastAgp)} AGP vs last year's $${(target.lyAgp / 1000).toFixed(2)}K.`,
          `Months of history on this offer; confidence band is tight.`
        ]
      },
      crossItemEffects: {
        title: "Cross-item effects",
        bullets: [
          `Net halo + cannibalization roughly neutral: +${fmtMoney(halo)} halo, ${fmtMoney(cannibSales)} cannibalization.`,
          `Cannibalization concentrates on adjacent flavor; small relative to lift.`,
          `Halo on adjacent same-brand items is small but positive.`
        ]
      },
      whatWeTested: `We tested five options across channel mixes. ${target.label} (store only) cleared all five guardrails with the highest reliability score.`,
      wouldReconsiderIf: {
        title: `Would re-evaluate if...`,
        text: `Vendor opens up funding to support a store + digital combination, or competitor parity gap widens beyond +4% on this NCRC.`
      }
    };
  }
  return {
    title: `${target.label} (${target.storeTactic.code})`,
    subtitle: `${upc} ${item.description}_${item.packSize || ""} in ${String(context.priceArea || "").replace(/^PA0?/, "0")} for Week ${context.week}`,
    recommendation: `${recommended.label} (store only)`,
    shortVersion: `${subjectName} looks better on sales (${fmtMoney(target.forecastSales)} vs ${fmtMoney(recommended.forecastSales)}) and volume, but ${agpDelta < 0 ? "flips AGP negative" : "holds AGP only modestly positive"}. Pick ${recommended.label} (store only) and avoid paying for sales that don't hold profit.`,
    onSurface: {
      title: `What ${subjectName} looks like on the surface`,
      bullets: [
        `${salesDelta > 0 ? "Higher" : "Lower"} sales: ${fmtMoney(target.forecastSales)} vs ${fmtMoney(recommended.forecastSales)}.`,
        `${unitsDelta > 0 ? "More" : "Fewer"} units: ${(target.forecastUnits / 1000).toFixed(0)}K vs ${(recommended.forecastUnits / 1000).toFixed(0)}K.`,
        target.digitalTactic ? `Uses both store and digital.` : `Store-only.`
      ]
    },
    whyNotPicking: {
      title: "Why we're not picking it",
      bullets: [
        { label: "Profit give-up.", detail: `AGP ${agpDelta < 0 ? "drops" : "barely moves"} relative to the pick.` },
        { label: "Heavier funding need.", detail: `Vendor support: $${target.vendorFunding.toFixed(2)} vs $${recommended.vendorFunding.toFixed(2)} per unit.` },
        { label: "Execution spread.", detail: target.digitalTactic ? "Adds complexity without enough payoff." : "Heavier ad+display footprint required." }
      ]
    },
    whySafeCall: {
      title: `Why ${recommended.label} (store only) is the safe call`,
      bullets: [
        `Last year was store-only with no digital; this stays in shape.`,
        `Protects profit: ${fmtMoney(recommended.forecastAgp)} AGP vs LY $${(recommended.lyAgp / 1000).toFixed(2)}K.`,
        `Months of history on this offer.`
      ]
    },
    crossItemEffects: {
      title: "Cross-item effects",
      bullets: [
        `Halo +${fmtMoney(halo)}, cannibalization ${fmtMoney(cannibSales)}.`,
        `Biggest pull from adjacent flavor.`,
        `Small halo on size-family adjacent items.`
      ]
    },
    whatWeTested: `We tested five options across channel mixes. Pattern: store+digital chased sales/units, but economics broke on AGP.`,
    wouldReconsiderIf: {
      title: `Would reconsider if...`,
      text: `Store+digital lands positive AGP, or vendor support comes down.`
    }
  };
}

function buildOffersTable(seed, vlc, basePrice, context) {
  const currentPlanIndex = 2 + (seed % 3);
  // Allowance is an NCRC-level decision — either every PA for this NCRC
  // is covered by a NOPA or none of them are. The caller passes
  // `context.noFunding === true` to flip the whole NCRC unfunded.
  const paFundingZero = !!context.noFunding;
  const top = promoOfferLibrary.slice(0, 5).map((offer, index) => buildOfferRow(offer, seed, index, vlc, basePrice, currentPlanIndex, paFundingZero));
  const recommended = top.find((o) => o.isRecommended) || top[0];
  top.forEach((offer) => {
    offer.narrative = buildNarrative(offer, recommended, context);
  });
  const lyRow = {
    kind: "ly",
    label: "LY Actual",
    tacticLabel: "Buy 5 Get 3",
    netCost: Number((vlc * 1.04).toFixed(2)),
    regPrice: basePrice,
    promoStorePrice: Number((basePrice * 0.52).toFixed(2)),
    units: Math.round(280),
    sales: Number(953.38),
    agp: Number(6.98),
    note: "Last year same week"
  };
  const noPromoRow = {
    kind: "noPromo",
    label: "No Promo",
    tacticLabel: "Plan baseline",
    netCost: Number((vlc * 1.0).toFixed(2)),
    regPrice: basePrice,
    promoStorePrice: basePrice,
    forecastUnits: Math.round(top[0].forecastUnits * 0.31),
    forecastSales: Math.round(top[0].forecastSales * 0.51),
    forecastAgp: Math.round(top[0].forecastAgp * 1.22),
    vendorFunding: Number((vlc * 0.32).toFixed(2)),
    guardrailScore: 85,
    reliabilityScore: 85,
    totalScore: 78,
    note: "Baseline if we skip the promotion"
  };
  return { ly: lyRow, top, noPromo: noPromoRow };
}

function buildCostLadder(seed, vlc) {
  const offInvoice = Number((vlc * 0.28).toFixed(2));
  const billBack = Number((vlc * 0.02).toFixed(2));
  const priceBreak = Number(((seed % 4) * 0.005).toFixed(2));
  const totalBuying = Number((offInvoice + billBack + priceBreak).toFixed(2));
  const freight = Number((vlc * 0.015).toFixed(2));
  const other = 0;
  const netCost = Number((vlc - totalBuying - freight - other).toFixed(2));
  const shipToStore = 0;
  const transaction = Number((((seed + 3) % 5) * 0.09 + 0.18).toFixed(2));
  const totalRetail = Number((shipToStore + transaction).toFixed(2));
  const deadNet = Number((netCost - totalRetail).toFixed(2));
  const flat = Number((1.50 + ((seed % 7) * 0.16)).toFixed(2));
  const newItem = 0;
  return {
    weeks: [
      { key: "w1", label: "W1", isActive: true },
      { key: "w2", label: "W2", isActive: false },
      { key: "w3", label: "W3", isActive: false }
    ],
    activeWeekIndex: 0,
    rows: [
      { row: "a. Vendor List Cost", values: [vlc, vlc, vlc], emphasis: "primary", sign: "+" },
      { group: "Allowances (Buying):", subRows: [
        { row: "Off Invoice Allowance", values: [offInvoice, offInvoice, offInvoice], sign: "-" },
        { row: "Bill Back Allowance", values: [billBack, billBack, billBack], sign: "-" },
        { row: "Price Break Allowance", values: [priceBreak, priceBreak, priceBreak], sign: "-" }
      ] },
      { row: "b. Total Buying Allowances", values: [totalBuying, totalBuying, totalBuying], emphasis: "subtotal", sign: "-" },
      { row: "c. Freight Allowance", values: [freight, freight, freight], sign: "-" },
      { row: "Other Allowance", values: [other, other, other], sign: "-" },
      { row: "d. Net Cost (a-b-c)", values: [netCost, netCost, netCost], emphasis: "subtotal", sign: "=" },
      { group: "Allowances (Retail):", subRows: [
        { row: "Ship to Store Allowance", values: [shipToStore, shipToStore, shipToStore], sign: "-" },
        { row: "Transaction Allowance", values: [transaction, transaction, transaction * 0.6], sign: "-" }
      ] },
      { row: "e. Total Retail Allowances", values: [totalRetail, totalRetail, totalRetail * 0.6], emphasis: "subtotal", sign: "-" },
      { row: "f. Dead Net Cost (d-e)", values: [deadNet, deadNet, deadNet + totalRetail * 0.4], emphasis: "total", sign: "=" },
      { row: "Flat Allowance", values: [flat, flat, flat + 1.45], sign: "info" },
      { row: "New Item Allowance", values: [newItem, newItem, newItem], sign: "info" }
    ]
  };
}

function buildWeeklyRuns(seed, basePrice, baseUnits, ncrc) {
  // Build the most-recent 6 ad break dates working backwards from "today",
  // monthly cadence-ish. Each entry mirrors the canonical Promo History row.
  return Array.from({ length: 6 }, (_, index) => {
    const localSeed = seed + index * 17 + hashString(ncrc + index);
    const liftPct = 33 + (localSeed % 41);
    const actualUnits = Math.round(baseUnits * (1 + liftPct / 100));
    const tacticKey = ["PP", "Digital", "BxGx", "PP", "Digital", "BxGx"][index];
    // Promo retail: PP = base discount, Digital deeper, BxGx is a B1G1 marker
    let promoPriceNum;
    let promoRetailLabel;
    if (tacticKey === "Digital") {
      promoPriceNum = Number((basePrice * (0.55 + ((localSeed % 4) * 0.02))).toFixed(2));
      promoRetailLabel = `$${promoPriceNum.toFixed(2)}`;
    } else if (tacticKey === "BxGx") {
      promoPriceNum = basePrice;
      promoRetailLabel = "B1G1";
    } else {
      promoPriceNum = Number((basePrice * (0.78 + ((localSeed % 4) * 0.02))).toFixed(2));
      promoRetailLabel = `$${promoPriceNum.toFixed(2)}`;
    }
    const effectivePrice = tacticKey === "BxGx" ? basePrice * 0.5 : promoPriceNum;
    const actualSales = Math.round(actualUnits * effectivePrice);
    const actualAgp = Math.round(actualSales * 0.22);
    const aiv = Number(((actualSales / actualUnits) || 0).toFixed(2));
    const adPage = (localSeed % 4 === 0) ? 0 : (1 + (localSeed % 3));
    const display = tacticKey === "Digital" && adPage === 0 ? "-" : (["Dairy", "Front End", "Endcap", "Wing", "Island"][localSeed % 5]);
    const month = ["10", "09", "08", "07", "07", "06"][index];
    const day = ["22", "24", "27", "30", "02", "04"][index];
    return {
      adBreakDate: `${month}/${day}/2025`,
      week: 44 - index * 4,
      baseUnits,
      actualUnits,
      actualSales,
      actualAgp,
      aiv,
      promoTactic: tacticKey,
      promoRetail: promoRetailLabel,
      adPage: adPage === 0 ? "-" : String(adPage),
      display,
      storeCount: 245
    };
  });
}

function buildScatterPoints(seed, vendors, week, vendorFilter) {
  const pool = [];
  const seedVendors = (vendors && vendors.length ? vendors : promoVendorCatalog).map((v) => v.vendor || v.name || v);
  for (let i = 0; i < 42; i += 1) {
    const vendor = seedVendors[i % seedVendors.length];
    if (vendorFilter && vendorFilter !== "All Vendors" && vendor !== vendorFilter) continue;
    const localSeed = seed + i * 7;
    const cluster = localSeed % 9;
    const units = cluster < 2 ? 20000 + (localSeed % 28000) : cluster < 5 ? 80000 + (localSeed % 60000) : cluster < 8 ? 140000 + (localSeed % 80000) : 220000 + (localSeed % 80000);
    const revenue = Math.round(units * (3.6 + ((localSeed % 9) * 0.3)));
    const agpRate = cluster < 2 ? 0.04 + (localSeed % 5) * 0.005 : cluster < 5 ? 0.10 + (localSeed % 7) * 0.006 : cluster < 8 ? 0.18 + (localSeed % 8) * 0.008 : 0.26 + (localSeed % 6) * 0.01;
    const agp = Math.round(revenue * agpRate);
    pool.push({
      id: `ncrc-${30000 + i}`,
      ncrc: `NCRC ${30000 + i}`,
      vendor,
      units,
      revenue,
      agp,
      agpRate: Number(agpRate.toFixed(3)),
      isInWeek: i % 3 === (week % 3)
    });
  }
  return pool;
}

function getPromotionDetail(filters = {}) {
  const options = getPromotionDetailOptions(filters);
  if (!filters.vendor || !filters.priceArea || !filters.ncrc) {
    return { options, item: null };
  }
  const entry = findCatalogEntry(filters.vendor, filters.ncrc);
  if (!entry) return { options, item: null, error: "NCRC not found for vendor" };
  const week = Number(filters.week || 7);
  const period = Number(filters.period || Math.floor((week - 1) / 4) + 1);
  const seed = hashString(`${filters.vendor}-${filters.priceArea}-${filters.ncrc}-${week}`);
  const vlc = Number((1.96 + ((seed % 17) * 0.04)).toFixed(2));
  const basePrice = Number((5.20 + ((seed % 11) * 0.06)).toFixed(2));
  const baseUnits = 1500 + (seed % 11) * 220;
  const plan = {
    units: 180000 + (seed % 7) * 8000,
    sales: 760000 + (seed % 5) * 32000,
    agp: 190000 + (seed % 6) * 9000
  };
  const halo = 0.035 + ((seed % 5) * 0.004);
  const cannibalization = -0.028 - ((seed % 4) * 0.005);
  const item = {
    vendor: filters.vendor,
    priceArea: filters.priceArea,
    ncrc: filters.ncrc,
    description: entry.ncrcRow.item,
    packSize: entry.ncrcRow.packSize,
    upc: entry.ncrcRow.upc,
    week,
    period,
    weekLabel: `Week ${week} (P${period})`,
    selectedPlan: "Default"
  };
  // Synthetic: NCRCs whose number ends with certain digits represent
  // items with NO live NOPA under the active scenario, regardless of
  // PA. We use that signal to flip every PA in the offers table to
  // unfunded so the empty-badge state is visible on the demo without
  // editing fixtures by hand. (Trigger: NCRC numbers ending in 8.)
  const ncrcStr = String(filters.ncrc || "");
  const ncrcAllUnfunded = /8$/.test(ncrcStr);

  const offers = buildOffersTable(seed, vlc, basePrice, { item, week, priceArea: filters.priceArea, noFunding: ncrcAllUnfunded });

  // NEW: build one offers table per price area the vendor sells in. The
  // financials vary slightly by PA (different vlc / base price) so the
  // ranking can differ. UI shows the rank-1 offer per PA with a drilldown.
  const vendorPriceAreas = (entry.vendorRow && entry.vendorRow.priceAreas) || [filters.priceArea];
  const offersByPriceArea = vendorPriceAreas.map((pa, paIdx) => {
    const paSeed = hashString(`${filters.vendor}-${pa}-${filters.ncrc}-${week}`);
    const paVlc = Number((vlc * (0.96 + ((paSeed % 8) * 0.01))).toFixed(2));
    const paBase = Number((basePrice * (0.98 + ((paSeed % 6) * 0.012))).toFixed(2));
    const paTable = buildOffersTable(paSeed, paVlc, paBase, { item: { ...item, priceArea: pa }, week, priceArea: pa, noFunding: ncrcAllUnfunded });
    return {
      priceArea: pa,
      vlc: paVlc,
      basePrice: paBase,
      offers: paTable.top,
      // Each Price Area gets its own cost ladder, seeded with that PA's
      // VLC. So when the user clicks PA01 vs PA02, the right-rail cost
      // ladder visibly changes — different VLC, different allowances,
      // different net cost, different dead-net.
      costLadder: buildCostLadder(paSeed, paVlc),
      recommendedOfferId: (paTable.top.find((o) => o.isRecommended) || paTable.top[0]).id
    };
  });

  return {
    options,
    item,
    pricing: { vlc, basePrice },
    forecastSummary: buildForecastSummary(seed, plan, halo, cannibalization),
    offers,
    offersByPriceArea,
    costLadder: buildCostLadder(seed, vlc),
    weeklyRuns: buildWeeklyRuns(seed, basePrice, baseUnits, filters.ncrc),
    scatter: {
      week,
      points: buildScatterPoints(seed, promoVendorCatalog, week, filters.vendor === "All Vendors" ? null : filters.vendor),
      xLabel: "Delta AGP (pp)",
      yLabel: "Delta Units"
    }
  };
}

// Apply a custom override to a (vendor, ncrc, priceArea, week) — returns the
// forecasted units/sales/agp without any scoring or guardrail validation.
// Real provider would call into the forecasting service; mock provider just
// scales the recommended offer's forecast by the user-specified delta.
function overrideForecast(payload = {}) {
  const seed = hashString(`override-${payload.vendor}-${payload.priceArea}-${payload.ncrc}-${payload.week}-${payload.tactic}-${payload.discountType}-${payload.promoPrice}`);
  const baseUnits = 140000 + (seed % 23) * 5200;
  const promoPrice = Number(payload.promoPrice) || 4.0;
  const minBuy = Number(payload.minBuy) || 1;
  const limit = Number(payload.limit) || 6;
  // Heuristic: deeper discount + multi-buy gates lift units; flat dollar
  // discount lifts AGP. Linked-items guardrail is left to the caller.
  const discountIntensity = Math.max(0, 1 - (promoPrice / 5.5));
  const unitLift = 1 + discountIntensity * 1.4 + (minBuy >= 2 ? 0.18 : 0) + (limit >= 8 ? 0.05 : 0);
  const units = Math.round(baseUnits * unitLift);
  const sales = Math.round(units * promoPrice);
  const agp = Math.round(sales * (0.16 + (seed % 6) * 0.012));
  return {
    units,
    sales,
    agp,
    disclaimer: "Override result — not optimised. May impact linked items in store. Guardrail and reliability checks not applied."
  };
}

function confirmPromotion(payload = {}) {
  // Mock acceptance — always succeeds. A real provider would persist the
  // selection to APP/WIMS/Apex/OMS/SSIMS and return the publish receipt.
  return {
    ok: true,
    publishedAt: new Date().toISOString(),
    receipt: {
      vendor: payload.vendor,
      priceArea: payload.priceArea,
      ncrc: payload.ncrc,
      week: payload.week,
      offerId: payload.offerId,
      storeTactic: payload.storeTactic,
      digitalTactic: payload.digitalTactic
    }
  };
}

module.exports = {
  source: "mock",
  getPromoPlan,
  getPromotionDetail,
  getPromotionDetailOptions,
  getPromotionDetailWorklist,
  confirmPromotion,
  overrideForecast
};
