// ============================================================================
// Pressure-test harness for the Merchant Q&A best-response layer.
//
// Renders every question in the VARIATION bank (plus all 133 canonical
// questions) against the live chat page, runs the same deterministic judge
// the inference path uses (sort order, arithmetic, disclosure, sign
// convention, premise honored, ASK COVERAGE), and writes a scorecard to
// evals/report.md. Add a new attack with one line in VARIATIONS.
//
// Run:  node server.js  (in one shell)
//       node evals/pressure-test.js   (PW_CHROMIUM=/path/to/chromium to override)
//
// This is the automated stand-in for manual LLM grading: the deterministic
// checks run on every variation in seconds. Periodically, feed evals/dump.json
// (written by this script) to an LLM judge with the audit rubric for the
// semantic layer the mechanical checks can't see.
// ============================================================================
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const VARIATIONS = [
  // -- focal-vendor contribution with abbreviation + trailing window
  //    (field miss 2026-07-20: generic decliner rank omitted P&G, used food
  //    vendors in LAUNDRY DETERGENT, replaced "last 12wks" with Q3 2025)
  { cls: "focal", q: "how much is P&G makes up the decline in Laundry Detergent in the last 12wks?" },
  // -- imperative mega-diagnostic, zero question marks (field miss 2026-07-20:
  //    routed to shallow compound path, claimed full coverage falsely, division
  //    rows failed the units×AIV≈sales identity, no executive diagnosis)
  { cls: "mega", q: "For Carbonated Soft Drinks in fiscal periods 202601–202613, determine why net sales increased 4.8% while units declined 3.1%, AGP dollars grew only 0.9%, and market share fell 70 bps, and identify where the apparent growth is economically misleading. Decompose performance by division, brand, vendor, item, package type, pack size, regular versus zero-sugar, price tier, promotional mechanic, and ad support. Separate the impact of: base volume versus incremental promotional volume; list-price inflation versus realized unit-price improvement; mix shifts versus true item-level growth; distribution gains or losses; vendor-funded versus retailer-funded promotions; cannibalization within brands; promo timing, depth, frequency, and post-promotion dips; out-of-stocks and display compliance; private-label substitution; competitive price-index movement. Identify the smallest set of divisions and materially sized items explaining at least 80% of the unit decline. Then determine whether growth is concentrated in structurally attractive segments such as zero-sugar, multipacks, or mini-cans, or is mainly the result of inflation. Finally, rank the top five corrective opportunities by recoverable units, sales, AGP, market-share impact, vendor-funding availability, execution difficulty, and confidence, while explicitly identifying where increasing volume would destroy profit." },
  // -- out-of-scope classes (field miss 2026-07-20: strategy program force-fit
  //    to a share table; methodology question force-fit to a P&L card)
  { cls: "scope", q: "How should a national retailer dynamically determine the optimal selling price, promotional calendar, inventory allocation, vendor funding strategy, assortment, replenishment, and procurement timing for every SKU in every store over the next 52 weeks, while maximizing long-term enterprise value under uncertainty? Subject to simultaneously optimizing: Sales Gross Margin AGP Cash Flow Inventory Turns Working Capital Vendor Funding Market Share Customer Lifetime Value Basket Size Category Roles Supply Constraints Labor Capacity Shelf Space Digital Fulfillment Competitive Pricing Inflation Tariffs Weather Cannibalization Halo Effects Stock-outs Elasticity Changes Consumer Behavior Drift while ensuring every business rule is respected." },
  { cls: "scope", q: "If we decide to lower prices, how do we know whether the resulting increase in sales is because customers truly value the lower price, or because competitors didn't respond—and if we can't separate those effects, how can we know whether lowering prices was actually the right decision?" },
  // -- promo-exclusion + named division/id resolution (field miss 2026-07-20:
  //    NorCal answered as Jewel, NCRC id dropped, member-UPC list force-fit)
  { cls: "exclusion", q: "When promoting NCRC 1000088190067, which NCRCs should not be included in the promotion for the Northern California Division?" },
  // -- paraphrases of canonical questions (should hit Tier 1/2, right archetype)
  { cls: "paraphrase", q: "which vendors are dragging down cheese shreds profit this quarter in jewel?" },
  { cls: "paraphrase", q: "top decliners in sour cream margin rate for jewel q3 2025, give me five vendors" },
  { cls: "paraphrase", q: "how did our shelf pricing stack up against walmart on salty snacks in P10 2025 for jewel" },
  { cls: "paraphrase", q: "biggest promo week ever for CIG 102 at jewel in fiscal 2025 — what was the revenue and when" },
  { cls: "paraphrase", q: "show me stores in jewel district J3 with their ketchup sales vs last year for q2 2025" },
  { cls: "paraphrase", q: "what own brand items made the most AGP dollars in jewel this fiscal year" },
  { cls: "paraphrase", q: "did sargento shredded cheese promos cannibalize the rest of shreds in jewel q3 2025" },
  { cls: "paraphrase", q: "where is dairy losing bill-out gross in jewel q3 — smic then vendor then ncrc please" },
  { cls: "paraphrase", q: "market share for frozen single serve meals at jewel osco in q1 2025 mulo+" },
  { cls: "paraphrase", q: "rank the divisions on AGP percent for candy in q3 2025" },
  // -- compound multi-clause asks (must decompose, not collapse to one card)
  { cls: "compound", q: "For category SHRIMP in fiscal period 202604, review performance by division across net sales, units, AGP, AIV, and market share; compare versus prior year and prior trend, identify the main growth drivers, and rank the winning materially-sized items in each division. can you give me common attributes of the growth categories and decline categories is there a package size or variety growing" },
  { cls: "compound", q: "For category BACON in fiscal period 202602, review by division net sales, units, AGP and market share; compare vs prior year and prior trend, identify growth drivers, rank the winning items in each division, and give me common attributes of growth vs decline items — is a pack size winning?" },
  { cls: "compound", q: "Review COFFEE for Q2 2025 across divisions: compare sales and AGP vs prior year, identify which divisions are growing, rank the top items by division, and analyze whether pod counts or bagged sizes are driving growth" },
  // -- premise-bearing diagnostics (stated facts must be honored)
  { cls: "premise", q: "Last quarter, Frozen Foods delivered 6.2% sales growth, but gross profit declined 3.8%. Promotions generated strong unit lifts, and most stores reported high SLU build-sheet compliance. Why did profitability deteriorate despite apparently successful execution? Analyze the prior 13 weeks across stores, items, promotions and display events to determine: How much of the sales growth was truly incremental versus transferred from non-promoted weeks, other SKUs or higher-margin private-label products? Which SLU builds produced incremental gross profit, and which generated unit growth but destroyed margin? Which vendors, categories, items, stores and event types accounted for most of the profit shortfall? Reconcile the total gross-profit decline into quantified drivers and identify the three issues with the largest financial impact." },
  { cls: "premise", q: "Dairy sales grew 4.1% last period but AGP fell 2.2%. Why did margin deteriorate while sales grew? Which vendors drove it? Was it funding or cost? Reconcile the AGP change into quantified drivers." },
  // -- novel concepts (must route to constructed contract, never force-fit)
  { cls: "novel", q: "I am running three groups of categories through a planning process, use the two lead digits of the four digit category number to group the categories together. 0201 - COOKIES 0204 - ON THE GO LUNCHBOX 0210 - CRACKERS 3001 - BATH TISSUE 3002 - PAPER TOWELS 3004 - FACIAL TISSUE 4201 - PACKAGED ICE CREAM 4205 - NOVELTIES I need to understand how exclusive households are, inside each group of categories. I want to establish a risk factor for removing overlapping promotions inside a group. For each group of categories go down to the NCRC level and identify total households buying the NCRC and how many of those households are exclusive to that NCRC only in that group of categories. Use promo week 49 2025 to promo week 8 2026 as the time frame to evaluate. I will also need to understand this at the group of categories level. I will also need to know this at a Division level." },
  { cls: "novel", q: "what is the basket affinity between chips and salsa at jewel — when households buy one how often do they buy the other in the same trip" },
  { cls: "novel", q: "show me household penetration for greek yogurt in jewel and how it trends vs last year" },
  // -- causal treated-vs-comparison asks (field miss 2026-07-21: SNAP offer
  //    incrementality answered with a single-concept penetration card and a
  //    phantom HOUSEHOLD CLEANERS category from an 8-char prefix match)
  { cls: "causal", q: "Did households that redeemed the digital yogurt coupon make purchases that would not otherwise have occurred, compared with matched households that did not redeem, and what was the incremental impact on trips, basket size, and retention?" },
  // -- clarification traps (missing values must trigger a hold, not a guess)
  { cls: "clarify", q: "For Jewel store, list all stores, their district, and store name along with sales for fiscal week 34 in the year 2025 in a table. Sort by the largest revenue to the smallest and only provides stores with over  in revenue for the fiscal week. In text below the prompt, tell me how many stores meet this criteria." }
];

// ?simulate=1 forces the deterministic tier-3 fallback even when an API key
// is configured — evals must be reproducible and cost-free.
const BASE = process.env.EVAL_URL || "http://localhost:5173/chat.html?simulate=1";

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(BASE);
  await page.waitForTimeout(400);

  const results = await page.evaluate(async (variations) => {
    const input = document.querySelector("#chatInput"), btn = document.querySelector("#sendBtn");
    const bank = window.ChatData.QUESTIONS.map((q) => ({ cls: "canonical", id: q.id, q: window.ChatData.QUESTION_TEXT[q.id] }))
      .concat(variations.map((v, i) => ({ ...v, id: "V" + (i + 1) })));
    for (const item of bank) { input.value = item.q; btn.click(); await new Promise((r) => setTimeout(r, 25)); }
    await new Promise((r) => setTimeout(r, 16000));
    const tags = document.querySelectorAll(".mock-tag");
    const stages = document.querySelectorAll(".stages");
    const panels = document.querySelectorAll(".debug-panel");
    return bank.map((item, i) => {
      const tag = tags[i] ? tags[i].textContent : "MISSING";
      const fails = panels[i] ? [...panels[i].querySelectorAll("table")].flatMap((t) => [...t.querySelectorAll("tr")].filter((tr) => tr.textContent.includes("FAIL")).map((tr) => tr.textContent.replace(/\s+/g, " ").trim())) : [];
      return { id: item.id, cls: item.cls, tier: stages[i] ? (stages[i].textContent.match(/registry exact|nearest neighbor|fast-LLM|concept-coverage/) || ["?"])[0] : "?", pass: tag.includes("✓"), fails, q: item.q.slice(0, 90) };
    });
  }, VARIATIONS);

  const failed = results.filter((r) => !r.pass);
  const byCls = {};
  results.forEach((r) => { (byCls[r.cls] = byCls[r.cls] || { n: 0, ok: 0 }); byCls[r.cls].n++; if (r.pass) byCls[r.cls].ok++; });

  let md = `# Pressure-test report — ${results.length} questions\n\n| Class | Pass | Total |\n|---|---|---|\n`;
  Object.entries(byCls).forEach(([c, s]) => { md += `| ${c} | ${s.ok} | ${s.n} |\n`; });
  md += `\n## Failures (${failed.length})\n\n`;
  failed.forEach((f) => { md += `- **${f.id}** (${f.cls}, ${f.tier}): ${f.fails.join(" | ") || "no judge detail"}\n  - “${f.q}…”\n`; });
  if (pageErrors.length) md += `\n## Page errors\n${pageErrors.join("\n")}\n`;
  fs.writeFileSync(path.join(__dirname, "report.md"), md);
  console.log(md);
  await browser.close();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})();
