// Single source of truth for everything the dashboard widgets need.
// The previous wiring had this data hardcoded directly inside the
// browser-side JS (app.js, dashboard-extras.js) — meaning the views
// owned the data. Now the views fetch from /api/dashboard/bootstrap
// and this module is the only place to change it.
//
// In production this is where the real provider would live (calling
// into Redshift / a dataservice / wherever). For now everything is
// returned as fixtures.

const primaryMetrics = [
  { label: "Total Sales", icon: "$", value: "$820.39M", previous: "$824.06M", change: "-0.45% (-$3.68M)", accent: "green", trend: [62, 61, 63, 60, 64, 66, 67, 70, 68, 69, 72, 71], split: ["Store $704.8M", "Ecom $115.6M"], drivers: ["Top: Citrus +$3.5M", "Watch: Snacking -$1.3M"], modal: "sales" },
  { label: "Total Units", icon: "U", value: "357.79M", previous: "348.90M", change: "+2.55% (+8.88M)", accent: "blue",  trend: [44, 47, 43, 50, 48, 55, 57, 62, 60, 63, 61, 64], split: ["Store 302.1M", "Ecom 55.7M"], drivers: ["Top: Avocado +8.48M", "Watch: Onions -818K"], modal: "units" },
  { label: "AGP",         icon: "%", value: "34.02%",   previous: "34.30%",   change: "-0.25pp (-$2.44M)", accent: "purple", trend: [35, 34, 36, 33, 38, 35, 37, 36, 35, 34, 35, 34], split: ["Store 34.4%", "Ecom 31.8%"], drivers: ["Top: Tropical Fruit +$2.46M", "Watch: Cherries -$2.63M"], modal: "agp" },
  { label: "AIV",         icon: "A", value: "$2.29",    previous: "$2.36",    change: "-2.92% (-$0.07)",   accent: "teal",   trend: [2.36, 2.34, 2.33, 2.31, 2.29, 2.30, 2.28, 2.27, 2.29, 2.28, 2.30, 2.29], split: ["Store $2.24", "Ecom $2.61"], drivers: ["Top: Premium Beverages +$0.16", "Watch: Apples -$0.11"], modal: "sales" },
  { label: "AGP Dollar",  icon: "G", value: "$279.97M", previous: "$282.41M", change: "-0.86% (-$2.44M)",  accent: "violet", trend: [40, 42, 41, 39, 43, 44, 42, 45, 44, 43, 41, 40], split: ["Store $239.6M", "Ecom $40.4M"], drivers: ["Top: Bananas +$1.88M", "Watch: Berries -$3.43M"], modal: "agp" },
  { label: "Household Penetration", icon: "H", value: "42.7%", previous: "40.8%", change: "+4.7% (+1.9pp)", accent: "blue",   trend: [33, 35, 34, 36, 38, 39, 40, 39, 41, 42, 41, 43], split: [], drivers: ["Top: Organic Veg +0.0pp", "Watch: Fresh Cut -45.4pp"], modal: "household" },
  { label: "Market Share", icon: "M", value: "25.88%", previous: "26.20%", change: "-0.3pp (-$4.88M)", accent: "orange", trend: [27, 26.9, 26.7, 26.6, 26.2, 26.1, 25.9, 26.0, 25.8, 25.9, 25.7, 25.88], split: [], drivers: ["Outperforming: 17 categories", "At risk: 19 categories"], modal: "share" }
];

const secondaryMetrics = [
  ["Avg Basket Spend", "$47.82", "$45.67", "+3.2%", "green"],
  ["Items per Basket", "12.4", "13.5", "-1.1%", "red"],
  ["Household Trips/Week", "2.8", "2.6", "+5.3%", "green"],
  ["% Items in Basket (Produce)", "34.2%", "33.5%", "+1.8%", "green"],
  ["$ Value in Basket (Produce)", "$16.35", "$15.20", "+4.1%", "green"],
  ["% Households buying at least once/week", "42.7%", "40.8%", "+4.7%", "green"],
  ["% Revenue from Top 100 Items", "67.8%", "68.3%", "-0.5%", "red"]
];

const detailViews = {
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

const performanceTables = {
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

const promoRows = [
  ["Feature", "42", "$1.24M", "+15.6%", "612K", "+11.1%", "$422K", "+7.4%"],
  ["Digital Coupon", "18", "$882K", "+12.3%", "344K", "+7.2%", "$301K", "+4.1%"],
  ["BOGO", "25", "$714K", "+5.4%", "286K", "+2.1%", "$245K", "+1.8%"],
  ["In-Store Display", "31", "$506K", "-2.1%", "194K", "-6.0%", "$171K", "-2.7%"],
  ["Price Discount", "27", "$439K", "-5.8%", "181K", "-1.9%", "$141K", "-4.6%"]
];

const circularRows = [
  ["Boar's Head Turkey Breast 1 LB", "$661K", "287K", "$381K"],
  ["Kretschmar Ham Off The Bone 1 LB", "$652K", "241K", "$393K"],
  ["Private Label Deli Ham 1 LB", "$472K", "199K", "$227K"],
  ["Sara Lee Oven Roasted Turkey 1 LB", "$381K", "158K", "$162K"],
  ["TopLat", "$210K", "91K", "$74K"]
];

const modalDrivers = {
  sales: ["8408 - CITRUS|Promo growth offset base declines to lift sales 8.07%.|+8.1%|+$3.5M", "8404 - AVOCADO|Sales up 6.63% on 73.08% promo unit surge.|+6.6%|+$1.6M", "8406 - BANANAS|Sales up 5.58% despite units down 4.98%.|+5.6%|+$1.6M", "8472 - SNACKING|Sales declined on weaker promotions.|-4.0%|-$1.3M"],
  units: ["8404 - AVOCADO|Units up 48% on 73% stronger promo volume.|+48.4%|+8.48M", "8408 - CITRUS|Double-digit units from promo volume.|+11.3%|+3.96M", "8445 - ONIONS|Promos and base both declined.|-7.0%|818K"],
  agp:   ["8415 - TROPICAL FRUIT|AGP up on lower COGS and higher sales.|+620.4%|$2.46M", "8406 - BANANAS|Sales and AGP improved with AIV gains.|+16.3%|$1.88M", "8419 - CHERRIES|COGS pressure reduced AGP dollars.|-64.6%|-$2.63M"],
  household: ["8476 - FRESH CUT|Penetration dropped as HH count fell.|-45.4pp|0.0%", "8406 - BANANAS|Penetration fell with HH count dropping.|-43.4pp|0.0%", "8408 - CITRUS|Penetration decreased as repeat fell.|-42.9pp|0.0%"],
  share: ["Outperforming|17 categories are gaining faster than competitors.|+12.75pp|$71.0K", "At Risk|19 categories declining faster than market.|-4.30pp|-$2.9K", "Contracting Market|Fresh cut outperforming in shrinking category.|+0.03pp|$61.0K"]
};

const currentTrend = [28, 26, 30, 25, 29, 24, 21, 28, 29, 32, 35, 29, 31, 28, 33, 28, 58, 76, 59, 64, 31, 29, 32, 34, 31, 29, 28, 33, 31, 42, 37, 66, 39, 24, 20, 22, 18, 17, 15, 14, 16, 15, 17, 16, 18, 19, 20, 11, 14, 15];
const lastTrend    = [41, 36, 32, 35, 34, 39, 31, 29, 31, 30, 34, 32, 29, 31, 27, 28, 39, 55, 51, 61, 52, 39, 38, 32, 34, 28, 29, 31, 29, 36, 32, 52, 64, 27, 28, 31, 27, 26, 22, 18, 19, 17, 21, 26, 24, 27, 23, 20, 22, 24];

// Department / Category Mix -------------------------------------------------
const deptMix = [
  { dept: "370 - Deli/Prepared Foods",
    sales: { dollar: "$232.8M", pct: 28.3, lyDollar: "$229.9M", lyPct: 27.9 },
    units: { dollar: "79.0M",  pct: 22.1, lyDollar: "78.5M",  lyPct: 22.5 },
    agp:   { dollar: "$93.5M", pct: 33.4, lyDollar: "$92.7M", lyPct: 32.8 },
    categories: [
      { name: "8478 - DELI MEATS",     sales: { dollar: "$81.2M", pct: 9.9, lyDollar: "$79.6M", lyPct: 9.7 }, units: { dollar: "26.5M", pct: 7.4, lyDollar: "25.9M", lyPct: 7.4 }, agp: { dollar: "$33.4M", pct: 11.9, lyDollar: "$32.1M", lyPct: 11.4 } },
      { name: "8479 - DELI CHEESES",   sales: { dollar: "$54.3M", pct: 6.6, lyDollar: "$53.8M", lyPct: 6.5 }, units: { dollar: "17.6M", pct: 4.9, lyDollar: "17.4M", lyPct: 5.0 }, agp: { dollar: "$22.0M", pct: 7.9, lyDollar: "$21.8M", lyPct: 7.7 } },
      { name: "8480 - HOT FOODS",      sales: { dollar: "$38.1M", pct: 4.6, lyDollar: "$37.5M", lyPct: 4.5 }, units: { dollar: "11.2M", pct: 3.1, lyDollar: "11.0M", lyPct: 3.2 }, agp: { dollar: "$15.6M", pct: 5.6, lyDollar: "$15.4M", lyPct: 5.4 } },
      { name: "8481 - SUSHI",          sales: { dollar: "$28.4M", pct: 3.5, lyDollar: "$27.8M", lyPct: 3.4 }, units: { dollar: "8.3M",  pct: 2.3, lyDollar: "8.1M",  lyPct: 2.3 }, agp: { dollar: "$11.3M", pct: 4.0,  lyDollar: "$10.9M", lyPct: 3.9 } },
      { name: "8482 - PREPARED MEALS", sales: { dollar: "$22.5M", pct: 2.7, lyDollar: "$22.7M", lyPct: 2.8 }, units: { dollar: "7.1M",  pct: 2.0, lyDollar: "7.4M",  lyPct: 2.1 }, agp: { dollar: "$8.9M",  pct: 3.2,  lyDollar: "$9.2M",  lyPct: 3.3 } },
      { name: "8483 - SALAD BAR",      sales: { dollar: "$8.3M",  pct: 1.0, lyDollar: "$8.5M",  lyPct: 1.0 }, units: { dollar: "2.8M",  pct: 0.8, lyDollar: "2.9M",  lyPct: 0.8 }, agp: { dollar: "$2.3M",  pct: 0.8,  lyDollar: "$2.3M",  lyPct: 0.8 } }
    ]
  },
  { dept: "200 - Produce",
    sales: { dollar: "$176.5M", pct: 21.5, lyDollar: "$172.4M", lyPct: 20.9 },
    units: { dollar: "84.1M",  pct: 23.5, lyDollar: "82.6M",  lyPct: 23.7 },
    agp:   { dollar: "$61.8M", pct: 22.1, lyDollar: "$60.6M", lyPct: 21.5 },
    categories: [
      { name: "8404 - AVOCADO",   sales: { dollar: "$24.6M", pct: 3.0, lyDollar: "$22.8M", lyPct: 2.8 }, units: { dollar: "9.2M",  pct: 2.6, lyDollar: "8.5M",  lyPct: 2.4 }, agp: { dollar: "$8.9M", pct: 3.2, lyDollar: "$8.0M", lyPct: 2.8 } },
      { name: "8408 - CITRUS",    sales: { dollar: "$36.1M", pct: 4.4, lyDollar: "$33.6M", lyPct: 4.1 }, units: { dollar: "13.4M", pct: 3.8, lyDollar: "12.6M", lyPct: 3.6 }, agp: { dollar: "$12.7M", pct: 4.5, lyDollar: "$11.8M", lyPct: 4.2 } },
      { name: "8406 - BANANAS",   sales: { dollar: "$28.2M", pct: 3.4, lyDollar: "$26.7M", lyPct: 3.2 }, units: { dollar: "15.1M", pct: 4.2, lyDollar: "15.9M", lyPct: 4.6 }, agp: { dollar: "$10.4M", pct: 3.7, lyDollar: "$8.5M", lyPct: 3.0 } },
      { name: "8402 - APPLES",    sales: { dollar: "$22.1M", pct: 2.7, lyDollar: "$22.0M", lyPct: 2.7 }, units: { dollar: "8.4M",  pct: 2.3, lyDollar: "8.5M",  lyPct: 2.4 }, agp: { dollar: "$7.7M",  pct: 2.8, lyDollar: "$7.5M", lyPct: 2.7 } },
      { name: "8419 - CHERRIES",  sales: { dollar: "$13.4M", pct: 1.6, lyDollar: "$15.1M", lyPct: 1.8 }, units: { dollar: "4.1M",  pct: 1.1, lyDollar: "4.6M",  lyPct: 1.3 }, agp: { dollar: "$4.6M",  pct: 1.6, lyDollar: "$5.4M", lyPct: 1.9 } },
      { name: "8445 - ONIONS",    sales: { dollar: "$8.3M",  pct: 1.0, lyDollar: "$8.5M",  lyPct: 1.0 }, units: { dollar: "5.2M",  pct: 1.5, lyDollar: "5.5M",  lyPct: 1.6 }, agp: { dollar: "$3.1M",  pct: 1.1, lyDollar: "$3.2M", lyPct: 1.1 } }
    ]
  },
  { dept: "150 - Meat & Seafood",
    sales: { dollar: "$148.2M", pct: 18.1, lyDollar: "$146.7M", lyPct: 17.8 },
    units: { dollar: "42.8M",  pct: 11.9, lyDollar: "42.1M",  lyPct: 12.1 },
    agp:   { dollar: "$45.5M", pct: 16.3, lyDollar: "$45.9M", lyPct: 16.3 },
    categories: [
      { name: "5012 - BEEF",    sales: { dollar: "$58.1M", pct: 7.1, lyDollar: "$57.4M", lyPct: 7.0 }, units: { dollar: "12.6M", pct: 3.5, lyDollar: "12.3M", lyPct: 3.5 }, agp: { dollar: "$17.4M", pct: 6.2, lyDollar: "$17.7M", lyPct: 6.3 } },
      { name: "5013 - PORK",    sales: { dollar: "$28.4M", pct: 3.5, lyDollar: "$28.6M", lyPct: 3.5 }, units: { dollar: "8.7M",  pct: 2.4, lyDollar: "8.6M",  lyPct: 2.5 }, agp: { dollar: "$8.6M", pct: 3.1, lyDollar: "$8.7M", lyPct: 3.1 } },
      { name: "5014 - POULTRY", sales: { dollar: "$32.6M", pct: 4.0, lyDollar: "$31.9M", lyPct: 3.9 }, units: { dollar: "11.5M", pct: 3.2, lyDollar: "11.2M", lyPct: 3.2 }, agp: { dollar: "$9.9M", pct: 3.5, lyDollar: "$9.6M", lyPct: 3.4 } },
      { name: "5018 - SEAFOOD", sales: { dollar: "$29.1M", pct: 3.6, lyDollar: "$28.8M", lyPct: 3.5 }, units: { dollar: "10.0M", pct: 2.8, lyDollar: "10.0M", lyPct: 2.9 }, agp: { dollar: "$9.6M", pct: 3.4, lyDollar: "$9.9M", lyPct: 3.5 } }
    ]
  },
  { dept: "300 - Frozen",
    sales: { dollar: "$98.4M", pct: 12.0, lyDollar: "$96.1M", lyPct: 11.7 },
    units: { dollar: "65.2M", pct: 18.2, lyDollar: "62.9M", lyPct: 18.0 },
    agp:   { dollar: "$31.4M", pct: 11.2, lyDollar: "$30.6M", lyPct: 10.8 },
    categories: [
      { name: "7101 - ICE CREAM",   sales: { dollar: "$28.2M", pct: 3.4, lyDollar: "$27.0M", lyPct: 3.3 }, units: { dollar: "12.7M", pct: 3.6, lyDollar: "12.0M", lyPct: 3.4 }, agp: { dollar: "$9.4M", pct: 3.4, lyDollar: "$8.8M", lyPct: 3.1 } },
      { name: "7202 - PIZZA",       sales: { dollar: "$24.6M", pct: 3.0, lyDollar: "$24.0M", lyPct: 2.9 }, units: { dollar: "15.4M", pct: 4.3, lyDollar: "15.1M", lyPct: 4.3 }, agp: { dollar: "$7.6M", pct: 2.7, lyDollar: "$7.4M", lyPct: 2.6 } },
      { name: "7303 - FROZEN MEALS",sales: { dollar: "$20.1M", pct: 2.4, lyDollar: "$19.7M", lyPct: 2.4 }, units: { dollar: "14.4M", pct: 4.0, lyDollar: "13.6M", lyPct: 3.9 }, agp: { dollar: "$6.7M", pct: 2.4, lyDollar: "$6.5M", lyPct: 2.3 } }
    ]
  },
  { dept: "100 - Bakery",
    sales: { dollar: "$72.6M", pct: 8.8, lyDollar: "$71.2M", lyPct: 8.6 },
    units: { dollar: "38.4M", pct: 10.7, lyDollar: "37.5M", lyPct: 10.7 },
    agp:   { dollar: "$26.7M", pct: 9.5, lyDollar: "$26.0M", lyPct: 9.2 },
    categories: [
      { name: "4001 - FRESH BREAD", sales: { dollar: "$22.1M", pct: 2.7, lyDollar: "$21.4M", lyPct: 2.6 }, units: { dollar: "10.5M", pct: 2.9, lyDollar: "10.3M", lyPct: 2.9 }, agp: { dollar: "$7.5M", pct: 2.7, lyDollar: "$7.1M", lyPct: 2.5 } },
      { name: "4002 - CAKES",       sales: { dollar: "$15.4M", pct: 1.9, lyDollar: "$15.0M", lyPct: 1.8 }, units: { dollar: "4.2M",  pct: 1.2, lyDollar: "4.1M",  lyPct: 1.2 }, agp: { dollar: "$6.7M", pct: 2.4, lyDollar: "$6.5M", lyPct: 2.3 } }
    ]
  },
  { dept: "450 - Beverages",
    sales: { dollar: "$54.9M", pct: 6.7, lyDollar: "$56.1M", lyPct: 6.8 },
    units: { dollar: "32.1M", pct: 9.0, lyDollar: "33.2M", lyPct: 9.5 },
    agp:   { dollar: "$13.5M", pct: 4.8, lyDollar: "$14.0M", lyPct: 5.0 }
  },
  { dept: "500 - Snacks",
    sales: { dollar: "$38.2M", pct: 4.7, lyDollar: "$39.6M", lyPct: 4.8 },
    units: { dollar: "16.2M", pct: 4.5, lyDollar: "16.9M", lyPct: 4.8 },
    agp:   { dollar: "$7.5M",  pct: 2.7, lyDollar: "$7.8M", lyPct: 2.8 }
  }
];

// 3-column performance / promo / circular summaries -------------------------
const performance3col = {
  title: "Top & Bottom Performing Items vs Plan",
  rows: [
    { name: "Boar's Head Turkey Breast 1 LB", sales: { value: "$1.15M", delta: "-2.4%",  deltaDollar: "-$28K" }, units: { value: "487.8K", delta: "-15.1%", deltaDollar: "-86.7K" }, agp: { value: "$661K", delta: "+6.2%",  deltaDollar: "+$38.6K" } },
    { name: "Private Label Deli Ham 1 LB",   sales: { value: "$982K",  delta: "+8.6%",  deltaDollar: "+$78K" }, units: { value: "376.4K", delta: "+9.8%",  deltaDollar: "+33.6K" }, agp: { value: "$472K", delta: "+10.1%", deltaDollar: "+$43K" } },
    { name: "Sara Lee Oven Roasted Turkey",   sales: { value: "$872K",  delta: "-3.6%",  deltaDollar: "-$33K" }, units: { value: "318.2K", delta: "-6.8%",  deltaDollar: "-23.2K" }, agp: { value: "$370K", delta: "-7.2%",  deltaDollar: "-$29K" } },
    { name: "Kretschmar Ham Off The Bone",    sales: { value: "$1.08M", delta: "+6.3%",  deltaDollar: "+$64K" }, units: { value: "412.1K", delta: "+3.2%",  deltaDollar: "+12.7K" }, agp: { value: "$652K", delta: "+9.4%",  deltaDollar: "+$56K" } },
    { name: "King's Hawaiian Rolls 12 OZ",    sales: { value: "$2.42M", delta: "+13.1%", deltaDollar: "+$280K" }, units: { value: "918.3K", delta: "+11.4%", deltaDollar: "+93.9K" }, agp: { value: "$1.05M", delta: "+15.5%", deltaDollar: "+$141K" } }
  ],
  overflow: [
    { name: "Tyson Grilled Chicken Strips",   sales: { value: "$756K", delta: "+6.4%", deltaDollar: "+$46K" }, units: { value: "288.7K", delta: "+7.3%", deltaDollar: "+19.7K" }, agp: { value: "$326K", delta: "+8.8%", deltaDollar: "+$26K" } },
    { name: "Hillshire Farm Smoked Turkey",   sales: { value: "$634K", delta: "-1.8%", deltaDollar: "-$11K" }, units: { value: "236.4K", delta: "-4.1%", deltaDollar: "-10.1K" }, agp: { value: "$291K", delta: "+0.9%", deltaDollar: "+$3K" } },
    { name: "Applegate Naturals Ham",         sales: { value: "$415K", delta: "+12.6%", deltaDollar: "+$46K" }, units: { value: "152.7K", delta: "+8.4%", deltaDollar: "+11.8K" }, agp: { value: "$208K", delta: "+18.2%", deltaDollar: "+$32K" } }
  ]
};

const promoWorking = {
  title: "Promotions Working vs Not Working",
  rows: [
    { name: "Feature",         sales: { value: "$1.24M", delta: "+15.6%", deltaDollar: "+$167K" }, units: { value: "612K",   delta: "+11.1%", deltaDollar: "+61K" }, agp: { value: "$422K", delta: "+7.4%",  deltaDollar: "+$29K" } },
    { name: "Digital Coupon",  sales: { value: "$882K",  delta: "+12.3%", deltaDollar: "+$97K" },  units: { value: "344K",   delta: "+7.2%",  deltaDollar: "+23K" }, agp: { value: "$301K", delta: "+4.1%",  deltaDollar: "+$12K" } },
    { name: "BOGO",            sales: { value: "$714K",  delta: "+5.4%",  deltaDollar: "+$37K" },  units: { value: "286K",   delta: "+2.1%",  deltaDollar: "+6K" },  agp: { value: "$245K", delta: "+1.8%",  deltaDollar: "+$4K" } },
    { name: "In-Store Display",sales: { value: "$506K",  delta: "-2.1%",  deltaDollar: "-$11K" },  units: { value: "194K",   delta: "-6.0%",  deltaDollar: "-13K" }, agp: { value: "$171K", delta: "-2.7%",  deltaDollar: "-$5K" } },
    { name: "Price Discount",  sales: { value: "$439K",  delta: "-5.8%",  deltaDollar: "-$27K" },  units: { value: "181K",   delta: "-1.9%",  deltaDollar: "-3K" },  agp: { value: "$141K", delta: "-4.6%",  deltaDollar: "-$7K" } }
  ],
  overflow: [
    { name: "Mailer Coupon",   sales: { value: "$298K",  delta: "+3.4%", deltaDollar: "+$10K" }, units: { value: "118K", delta: "+1.7%", deltaDollar: "+2K" }, agp: { value: "$99K", delta: "+0.8%", deltaDollar: "+$1K" } },
    { name: "Loyalty Reward",  sales: { value: "$219K",  delta: "+7.5%", deltaDollar: "+$15K" }, units: { value: "86K",  delta: "+4.2%", deltaDollar: "+3K" }, agp: { value: "$75K", delta: "+5.1%", deltaDollar: "+$4K" } }
  ]
};

const circular = {
  title: "Front Page Circular Performance",
  rows: [
    { name: "Boar's Head Turkey Breast 1 LB",   sales: { value: "$661K", delta: "+9.4%",  deltaDollar: "+$57K" }, units: { value: "287K", delta: "+6.2%", deltaDollar: "+17K" }, agp: { value: "$381K", delta: "+4.1%", deltaDollar: "+$15K" } },
    { name: "Kretschmar Ham Off The Bone 1 LB", sales: { value: "$652K", delta: "+10.9%", deltaDollar: "+$64K" }, units: { value: "241K", delta: "+8.1%", deltaDollar: "+18K" }, agp: { value: "$393K", delta: "+12.1%", deltaDollar: "+$43K" } },
    { name: "Private Label Deli Ham 1 LB",      sales: { value: "$472K", delta: "+8.6%",  deltaDollar: "+$37K" }, units: { value: "199K", delta: "+9.8%", deltaDollar: "+18K" }, agp: { value: "$227K", delta: "+10.1%", deltaDollar: "+$21K" } },
    { name: "Sara Lee Oven Roasted Turkey",     sales: { value: "$381K", delta: "-6.2%",  deltaDollar: "-$25K" }, units: { value: "158K", delta: "-6.1%", deltaDollar: "-10K" }, agp: { value: "$162K", delta: "-8.0%", deltaDollar: "-$14K" } }
  ],
  overflow: []
};

// Plan-screen filter options ------------------------------------------------
const planCategoryOptions = [
  "Carbonated Soft Drinks",
  "Energy Drinks",
  "Sports & Performance Drinks",
  "Bottled Water",
  "Juice & Smoothies",
  "Ready-to-Drink Coffee",
  "Ready-to-Drink Tea"
];

// Plan-objective comparison rows (the speech-bubble callout). ---------------
const planCompare = [
  { key: "units", label: "Units plan",   sales: 3480000, units: 807880, agp: 1070000, scope: [28.49, 18.79, 25.28] },
  { key: "sales", label: "Sales plan",   sales: 3520000, units: 774330, agp: 1140000, scope: [25.56, 18.07, 26.18] },
  { key: "agp",   label: "AGP plan",     sales: 3310000, units: 666100, agp: 1240000, scope: [20.29, 17.85, 26.16] },
  { key: "np",    label: "No promo",     sales: 3020000, units: 549620, agp: 1210000, scope: [0, 0, 0] },
  { key: "ly",    label: "LY actuals",   sales: 2850000, units: 673190, agp:  835470, scope: [37.93, 18.55, 18.65] }
];

function getDashboardBootstrap() {
  return {
    primaryMetrics,
    secondaryMetrics,
    detailViews,
    performanceTables,
    promoRows,
    circularRows,
    modalDrivers,
    currentTrend,
    lastTrend,
    deptMix,
    performance3col,
    promoWorking,
    circular,
    planCategoryOptions,
    planCompare
  };
}

module.exports = {
  source: "mock-dashboard",
  getDashboardBootstrap
};
