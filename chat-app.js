// ============================================================================
// Merchant Q&A chat — best-response layer demo engine
// Cascade: T1 registry exact-match → T2 nearest-neighbor → T3 fast-LLM
// contract inference (simulated). All numbers are seeded mock data.
// ============================================================================
(() => {
  const { ARCHETYPES, QUESTIONS, QUESTION_TEXT, POOLS, GLOSSARY } = window.ChatData;

  // ---------------------------------------------------------------- utilities
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const fmt = {
    money: (n) => (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US"),
    moneyC: (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2),
    k: (n) => {
      const a = Math.abs(n), s = n < 0 ? "-$" : "$";
      if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
      if (a >= 1e3) return s + Math.round(a / 1e3) + "K";
      return s + Math.round(a);
    },
    units: (n) => Math.round(n).toLocaleString("en-US"),
    pct: (n, d = 1) => (n * 100).toFixed(d) + "%",
    spct: (n, d = 1) => (n >= 0 ? "+" : "") + (n * 100).toFixed(d) + "%",
    sk: (n) => (n >= 0 ? "+" : "") + fmt.k(n).replace("$-", "-$"),
    bps: (n) => (n >= 0 ? "+" : "") + Math.round(n * 10000) + " bps",
    pts: (n) => (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + " pts"
  };
  function rngFor(id, salt = 0) { return mulberry32(id * 2654435761 + salt * 97); }
  function pickN(rng, arr, n) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, Math.min(n, a.length));
  }
  const rr = (rng, lo, hi) => lo + rng() * (hi - lo);
  const domainOf = (e) => e.domain || "grocery";
  const vend = (e) => POOLS.vendors[domainOf(e)] || POOLS.vendors.grocery;
  const smicsOf = (e) => POOLS.smics[domainOf(e)] || POOLS.smics.grocery;
  const itemsOf = (e) => POOLS.items[domainOf(e)] || POOLS.items.grocery;
  const ncrcsOf = (e) => POOLS.ncrcs[domainOf(e)] || POOLS.ncrcs.grocery;
  const citiesOf = (e) => (String(e.div || "").toLowerCase().includes("southern") ? POOLS.cities.southern : POOLS.cities.jewel);
  const scope = (e) => [e.div, e.dept && e.dept + " Dept", e.group, e.cat || e.smic || e.cls, e.asm && "ASM " + e.asm].filter(Boolean).join(" · ");
  const per = (e) => e.period || e.week || "the period";
  const mockUpc = (rng) => String(Math.floor(rr(rng, 1.1e9, 9.9e9)));

  // ------------------------------------------------------------ block helpers
  const H = (text) => ({ t: "h", text });
  const P = (text) => ({ t: "p", text });
  const TB = (title, cols, rows) => ({ t: "table", title, cols, rows });
  const KV = (title, rows) => ({ t: "kv", title, rows });
  const BU = (items) => ({ t: "bullets", items });
  const RECO = (text) => ({ t: "reco", text });
  const WHY = (text) => ({ t: "why", text });
  const FU = (items) => ({ t: "fu", items });
  const GAPBOX = (items) => ({ t: "gap", items });
  const NOTE = (text) => ({ t: "note", text });

  function yoyRows(rng, names, base, declRatio, fmtFn, extra) {
    return names.map((nm, i) => {
      const ly = base * rr(rng, 0.6, 1.5) * (1 - i * 0.09);
      const chg = -ly * declRatio * rr(rng, 0.5, 1.2);
      const row = [nm, fmtFn(ly + chg), fmtFn(ly), fmt.sk(chg), fmt.spct(chg / ly)];
      if (extra) row.push(extra(rng, i));
      return row;
    });
  }

  // --------------------------------------------------------------- renderers
  const R = {};

  R.driver_decomp = (id, e) => {
    const rng = rngFor(id);
    const sTY = rr(rng, 2.2e6, 6.5e6), sChg = -rr(rng, 0.04, 0.11), sLY = sTY / (1 + sChg);
    const uTY = sTY / rr(rng, 2.8, 4.6), uChg = -rr(rng, 0.05, 0.10), uLY = uTY / (1 + uChg);
    const rateTY = rr(rng, 0.24, 0.31), rateChg = -rr(rng, 0.012, 0.028), rateLY = rateTY - rateChg;
    const cogsU = rr(rng, 2.1, 3.4), cogsChg = rr(rng, 0.02, 0.06);
    const allowanceSide = rng() > 0.45;
    const dnChg = allowanceSide ? cogsChg + rr(rng, 0.04, 0.09) : cogsChg + rr(rng, -0.005, 0.01);
    const allowTY = sTY * rr(rng, 0.055, 0.09), allowChg = allowanceSide ? -rr(rng, 0.12, 0.22) : -rr(rng, 0.01, 0.04);
    const mdTY = sTY * rr(rng, 0.06, 0.1), mdChg = rr(rng, 0.03, 0.12);
    const agpU_TY = rateTY * (sTY / uTY), agpU_LY = rateLY * (sLY / uLY);
    const blocks = [];
    blocks.push(TB(`${scope(e)} — ${per(e)} vs same period LY`,
      ["Metric", "TY", "LY", "Change"],
      [
        ["Sales $", fmt.k(sTY), fmt.k(sLY), fmt.spct(sChg)],
        ["Units", fmt.units(uTY), fmt.units(uLY), fmt.spct(uChg)],
        ["AIV", fmt.moneyC(sTY / uTY), fmt.moneyC(sLY / uLY), fmt.spct((sTY / uTY) / (sLY / uLY) - 1)],
        ["AGP $", fmt.k(sTY * rateTY), fmt.k(sLY * rateLY), fmt.sk(sTY * rateTY - sLY * rateLY)],
        ["AGP %", fmt.pct(rateTY), fmt.pct(rateLY), fmt.pts(rateChg)],
        ["AGP per Unit", fmt.moneyC(agpU_TY), fmt.moneyC(agpU_LY), fmt.moneyC(agpU_TY - agpU_LY).replace("$", agpU_TY - agpU_LY >= 0 ? "+$" : "-$").replace("--", "-")],
        ["COGS per Unit", fmt.moneyC(cogsU), fmt.moneyC(cogsU / (1 + cogsChg)), fmt.spct(cogsChg)],
        ["Deadnet per Unit", fmt.moneyC(cogsU * 0.93 * (1 + dnChg - cogsChg)), fmt.moneyC(cogsU * 0.93 / (1 + cogsChg)), fmt.spct(dnChg)],
        ["Total Allowances", fmt.k(allowTY), fmt.k(allowTY / (1 + allowChg)), fmt.spct(allowChg)],
        ["Markdown $ (spend)", fmt.k(mdTY), fmt.k(mdTY / (1 + mdChg)), fmt.spct(mdChg)]
      ]));
    if (allowanceSide) {
      blocks.push(H(`${e.metric || "AGP rate"} is down ${fmt.pts(rateChg).replace("+", "")} in ${per(e)}, mainly from vendor funding that did not repeat — COGS is roughly flat while Deadnet per unit rose ${fmt.spct(dnChg)}.`));
      blocks.push(BU([
        `Total allowances fell ${fmt.sk(allowTY - allowTY / (1 + allowChg))} (${fmt.spct(allowChg)}), concentrated in scan and billback programs.`,
        `Deadnet per unit rose ${fmt.spct(dnChg)} while COGS per unit rose only ${fmt.spct(cogsChg)} — the classic allowance-side pattern.`,
        `Markdown spend increased ${fmt.spct(mdChg)}, deepening the rate pressure on promoted weeks.`
      ]));
      blocks.push(FU([
        "Which allowance types dropped versus last year, and which vendors own them?",
        "Which offers ran last year with no TY counterpart (lapsed NOPAs)?",
        "Is the markdown increase tied to deeper depth or more promoted weeks?"
      ]));
    } else {
      blocks.push(H(`${e.metric || "AGP rate"} is down ${fmt.pts(rateChg).replace("+", "")} in ${per(e)}, mainly from a vendor cost increase that retail has not fully recovered — COGS and Deadnet per unit are rising together (${fmt.spct(cogsChg)} / ${fmt.spct(dnChg)}).`));
      blocks.push(BU([
        `COGS per unit up ${fmt.spct(cogsChg)} with allowances keeping pace — a true cost increase, not a funding gap.`,
        `Units down ${fmt.spct(uChg)} while AIV is up — volume is paying for the partial retail pass-through.`,
        `Markdown spend up ${fmt.spct(mdChg)}, compounding the rate impact in promoted weeks.`
      ]));
      blocks.push(FU([
        "Which items took the cost increase without a matching retail change?",
        "Is the unit decline concentrated in promoted or non-promoted weeks?",
        "Which vendors have a pending cost-change with no negotiated offset?"
      ]));
    }
    return blocks;
  };

  R.yoy_rank = (id, e) => {
    const rng = rngFor(id);
    const n = Math.min(e.n || 5, 8);
    const pool = e.entity === "vendor" ? vend(e)
      : e.entity === "SMIC" ? smicsOf(e)
      : e.entity === "NCRC" ? ncrcsOf(e)
      : e.entity === "CIG" ? pickN(rng, ncrcsOf(e), n).map((x, i) => `CIG ${Math.floor(rr(rngFor(id, 3 + i), 10000, 99999))} — ${x}`)
      : (e.entity || "").includes("SMIC") ? smicsOf(e) : vend(e);
    const names = Array.isArray(pool) ? pickN(rng, pool, n) : pool;
    const isRate = /rate/i.test(e.metric || "");
    const isGrowth = e.dir === "growth";
    const base = /allowance|line 7|coop|flat/i.test(e.metric || "") ? rr(rng, 6e4, 2.4e5) : rr(rng, 4e5, 1.6e6);
    let rows, cols;
    if (isRate && !/margin rate/i.test(e.metric)) {
      cols = ["Vendor", "Spend Rate TY", "Spend Rate LY", "Change", "AGP % TY", "Total ACI Avg"];
      rows = names.map((nm) => {
        const ly = rr(rng, 0.14, 0.26), chg = rr(rng, -0.05, 0.02);
        return [nm, fmt.pct(ly + chg), fmt.pct(ly), fmt.pts(chg), fmt.pct(rr(rng, 0.22, 0.34)), fmt.pct(0.212, 1)];
      });
    } else if (/margin rate/i.test(e.metric || "")) {
      cols = [cap(e.entity || "Vendor"), "AGP % TY", "AGP % LY", "Rate Change", "AGP $ Change"];
      rows = names.map((nm, i) => {
        const ly = rr(rng, 0.24, 0.33), chg = -rr(rng, 0.015, 0.045) * (1 - i * 0.08);
        return [nm, fmt.pct(ly + chg), fmt.pct(ly), fmt.pts(chg), fmt.sk(-base * rr(rng, 0.05, 0.2))];
      });
    } else {
      cols = [cap(e.entity || "Vendor"), `${e.metric || "Metric"} TY`, "LY", "Change", "% Change"];
      rows = yoyRows(rng, names, base, isGrowth ? -rr(rng, 0.08, 0.2) : rr(rng, 0.1, 0.3), fmt.k);
    }
    const totChg = rows.reduce((s, r) => s + parseK(r[3]), 0);
    const blocks = [];
    blocks.push(H(isGrowth
      ? `${names[0]} leads ${e.metric || "growth"} in ${scope(e)} for ${per(e)}, with the top ${rows.length} contributors adding ${fmt.k(Math.abs(totChg))} versus last year.`
      : `${rows.length} ${e.entity || "vendor"}s account for ${fmt.k(Math.abs(totChg))} of the ${e.metric || ""} decline in ${scope(e)} for ${per(e)} — the top two alone are ${fmt.pct(Math.abs((parseK(rows[0][3]) + parseK(rows[1][3])) / totChg))} of it.`));
    blocks.push(TB(`${e.metric || "Change"} — ${per(e)} vs prior year${e.listGiven ? ` (screened from the ${e.listGiven} you listed; decliners only)` : ""}`, cols, rows));
    if (e.byWeek) {
      const wrng = rngFor(id, 7);
      blocks.push(TB(`${names[0]} — week-by-week vs LY (missed weeks flagged)`,
        ["Fiscal Week", "TY", "LY", "Δ", "Status"],
        Array.from({ length: 6 }, (_, i) => {
          const ly = base / 12 * rr(wrng, 0.6, 1.3), ty = i === 1 || i === 4 ? 0 : ly * rr(wrng, 0.55, 1.05);
          return [`W${27 + i}`, ty === 0 ? "—" : fmt.k(ty), fmt.k(ly), fmt.sk(ty - ly), ty === 0 ? "MISSED" : ty < ly ? "Under LY" : "OK"];
        })));
    }
    if (e.crossFilter) blocks.push(NOTE(`Filtered to entities that ${e.crossFilter} — both conditions must hold.`));
    blocks.push(FU(isGrowth
      ? ["Is the growth base demand or heavier promo support?", "Which allowance types increased versus last year behind the leaders?"]
      : ["Which offers behind the top decliner lapsed versus last year?", `Does the decline concentrate in specific ${e.entity === "vendor" ? "NCRCs" : "vendors"} within the top entity?`]));
    return blocks;
  };

  R.allowance_breakdown = (id, e) => {
    const rng = rngFor(id);
    const totLY = rr(rng, 4e5, 1.8e6), decl = -rr(rng, 0.08, 0.2), totTY = totLY * (1 + decl);
    const types = pickN(rng, POOLS.allowTypes, 5);
    let rem = totTY - totLY;
    const typeRows = types.map((tp, i) => {
      const ly = totLY * rr(rng, 0.1, 0.3);
      const chg = i < 2 ? rem * rr(rng, 0.3, 0.5) : (i === types.length - 1 ? rem : rem * rr(rng, 0.1, 0.4));
      rem -= chg;
      return [tp, fmt.k(ly + chg), fmt.k(ly), fmt.sk(chg)];
    });
    const worst = typeRows[0];
    const blocks = [];
    blocks.push(H(`${e.metric === "Line 7" ? "Line 7 investment" : "Total allowance investment"} for ${scope(e)} is ${fmt.k(totTY)} in ${per(e)}, down ${fmt.k(Math.abs(totTY - totLY))} (${fmt.spct(decl)}) versus prior year — ${worst[0]} drives the biggest share of the decline.`));
    blocks.push(TB(`By ${e.by || "allowance type"} — TY vs LY`, [cap(e.by || "Allowance type"), "TY", "LY", "Change"],
      typeRows.concat([["TOTAL", fmt.k(totTY), fmt.k(totLY), fmt.sk(totTY - totLY)]])));
    const byCat = /categor/i.test(e.by || "") || e.totalRow;
    if (byCat) {
      const cats = pickN(rngFor(id, 2), smicsOf(e), 4);
      blocks.push(TB("Decline located by category", ["Category (SMIC)", "TY", "LY", "Change"],
        yoyRows(rngFor(id, 3), cats, totLY / 5, 0.18, fmt.k).map((r) => r.slice(0, 4))));
    }
    if (e.withNOPA || /10K/i.test(e.threshold || "")) {
      const nrng = rngFor(id, 4);
      blocks.push(TB(`Lapsed / reduced offers over $10K in both years — vendor conversation list`,
        ["NOPA", "Offer", "Allowance Type", "LY $", "TY $", "Owed Gap"],
        Array.from({ length: 4 }, (_, i) => {
          const ly = rr(nrng, 1.4e4, 6e4), ty = i < 2 ? rr(nrng, 1e4, ly * 0.6) : rr(nrng, 1.05e4, ly * 0.85);
          return [String(Math.floor(rr(nrng, 3.1e6, 3.9e6))), pickN(nrng, ["Marketing Page", "Big Book", "Holiday Scan", "Feature Ad Coop", "New Item Intro"], 1)[0], pickN(nrng, POOLS.allowTypes, 1)[0], fmt.k(ly), fmt.k(ty), fmt.k(ty - ly)];
        })));
      blocks.push(BU([`Four NOPAs cover ${fmt.pct(0.62)} of the recovery opportunity — lead with the two lapsed marketing-page deals when you go back to the vendor.`]));
    }
    if (e.mode === "declining-weeks") {
      const wrng = rngFor(id, 5);
      blocks.push(TB("Weeks with YoY allowance declines", ["Fiscal Week", "TY", "LY", "Δ"],
        Array.from({ length: 5 }, (_, i) => {
          const ly = totLY / 13 * rr(wrng, 0.7, 1.3), ty = ly * rr(wrng, 0.6, 0.92);
          return [`W${14 + i * 2}`, fmt.k(ty), fmt.k(ly), fmt.sk(ty - ly)];
        })));
    }
    if (e.profitability) blocks.push(BU([`Mix note: flat dollars are shifting to performance-based scan — good for units, but the flat-funding gap lands straight on AGP rate (${fmt.pts(-0.008)} in the period).`]));
    blocks.push(FU(["Which of these deals are in Periscope for next quarter?", "Do the declining types match a change in the vendor's national trade strategy?"]));
    return blocks;
  };

  R.promo_effectiveness = (id, e) => {
    const rng = rngFor(id);
    if (e.mode === "price-ladder") {
      const reg = rr(rng, 3.5, 8);
      const baseU = rr(rng, 9000, 15000);
      const cost = reg * 0.52;
      const pts = [0.78, 0.7, 0.62, 0.56, 0.5].map((f, i) => {
        const price = Math.max(0.99, Math.round(reg * f * 4) / 4);
        const lift = 0.1 + (0.78 - f) * rr(rng, 2.0, 2.8) - (i === 4 ? rr(rng, 0.08, 0.15) : 0);
        const wUnits = baseU * (1 + lift);
        return { price, lift, wUnits, agpU: price - cost };
      });
      const best = pts.reduce((a, b) => (b.wUnits * b.agpU > a.wUnits * a.agpU ? b : a));
      const blocks = [];
      blocks.push(H(`${fmt.moneyC(best.price)} is the optimal promoted retail for ${e.item || "CIG " + e.cig} in ${e.div} across ${per(e)} — it maximizes weekly AGP dollars while still delivering a ${fmt.spct(best.lift, 0)} unit lift versus non-promo weeks.`));
      blocks.push(P(`Promoted weeks were compared against non-promo baseline weeks at each price point. Deeper pricing kept adding units but gave the gains back in margin below ${fmt.moneyC(best.price)}.`));
      blocks.push(TB("Price ladder — promo weeks vs baseline", ["Promoted price", "Weekly units", "Lift vs baseline", "AGP/unit", "Weekly AGP $"],
        pts.map((p) => [fmt.moneyC(p.price) + (p.price === best.price ? "  ◀ best" : ""), fmt.units(p.wUnits), fmt.spct(p.lift, 0), fmt.moneyC(p.agpU), fmt.k(p.wUnits * p.agpU)])));
      blocks.push(RECO(`Anchor future events at ${fmt.moneyC(best.price)} (reg ${fmt.moneyC(reg)}). Reserve the deepest point for traffic-driving holiday weeks only — below ${fmt.moneyC(best.price)} the incremental units no longer pay for the depth.`));
      blocks.push(FU(["Should we validate the ladder against elasticity on the top 3 UPCs in the group?", "Does vendor funding step up at the deeper price points to change the math?"]));
      return blocks;
    }
    const tactic = pickN(rng, POOLS.tactics, 1)[0];
    const reg = rr(rng, 3.5, 5.5), eff = reg * rr(rng, 0.68, 0.8);
    const inc = Math.round(rr(rng, 9e4, 2.2e5) / 1000) * 1000;
    const lift = rr(rng, 0.24, 0.4);
    const incSales = inc * eff, incGP = incSales * rr(rng, 0.15, 0.2);
    const fund = incSales * rr(rng, 0.18, 0.25);
    const nextGap = Math.round(inc * rr(rng, 0.18, 0.3) / 1000) * 1000;
    return [
      H(`The strongest promo tactic for ${e.smic || e.cat || e.item} in ${e.div} during ${per(e)} was ${tactic}, supported by a feature ad and digital coupon.`),
      P(`It generated an estimated +${fmt.units(inc)} incremental units, the highest of all tactics tested, with a ${fmt.pct(lift, 0)} unit lift versus baseline.`),
      KV("Promo detail", [
        ["Tactic", tactic],
        ["Regular retail", fmt.moneyC(reg) + " each"],
        ["Effective promo price", fmt.moneyC(eff) + " each"],
        ["Discount depth", fmt.pct(1 - eff / reg, 0)],
        ["Support", "Feature ad + digital coupon (J4U)"],
        ["Duration", Math.round(rr(rng, 2, 4)) + " promotional weeks"],
        ["Incremental units", fmt.units(inc)],
        ["Incremental sales", fmt.money(incSales)],
        ["Incremental gross profit", fmt.money(incGP)],
        ["Vendor funding", fmt.money(fund)],
        ["Funding rate", fmt.moneyC(fund / inc) + " per incremental unit"],
        ["ROI on funding", (1 + incGP / fund).toFixed(2) + "×"]
      ]),
      RECO(`Repeat ${tactic} as the lead ${e.smic || e.cat || "category"} event, particularly during high-traffic holiday weeks. Retain the feature-ad support, but test narrowing the digital coupon to targeted households — it contributed volume, yet the broad offer reduced margin efficiency among customers who would likely have purchased anyway.`),
      WHY(`Why it won: it delivered ${fmt.units(nextGap)} more incremental units than the next-best tactic, while remaining profitable after discount and funding.`),
      FU(["Should the follow-up event test the same tactic without the coupon overlay?", "Does the vendor fund a fourth week at the same rate?"])
    ];
  };

  R.promo_detail = (id, e) => {
    const rng = rngFor(id);
    const n = e.mode === "agp-decline-weeks" ? 4 : 6;
    const cols = ["Promo Week", "Tactic", "Description", "Depth", "Min Buy", "Sales", "Units"];
    if (e.takeRate) cols.push("AIV", "Take Rate");
    if (e.withResults || e.withMargins) cols.push("AGP %");
    const rows = Array.from({ length: n }, (_, i) => {
      const tac = pickN(rngFor(id, i + 1), POOLS.tactics, 1)[0];
      const sales = rr(rng, 4e4, 1.7e5), units = sales / rr(rng, 2.5, 4.5);
      const row = [`PW ${13 + i * 2}`, tac, `${tac} — with card`, fmt.pct(rr(rng, 0.15, 0.35), 0), String(1 + Math.floor(rng() * 2)), fmt.k(sales), fmt.units(units)];
      if (e.takeRate) row.push(fmt.moneyC(sales / units), fmt.pct(rr(rng, 0.3, 0.7), 0));
      if (e.withResults || e.withMargins) row.push(fmt.pct(rr(rng, 0.18, 0.3)));
      return row;
    });
    const subject = e.cig ? `CIG ${e.cig}` : e.upc ? `UPC ${e.upc}` : `${e.ncrcList || ""} NCRCs`;
    const blocks = [];
    blocks.push(H(e.mode === "agp-decline-weeks"
      ? `${subject} (SIGNATURE SELECT PASTA SAUCE 24OZ) had ${n} promo weeks in ${per(e)} where AGP $ ran below last year — all four paired a deeper depth with a lower funding rate than the LY event.`
      : `${subject} ran ${n} promotions in ${scope(e)} during ${per(e)} — mechanics and weekly results below.`));
    blocks.push(TB(`Promotions — ${per(e)}`, cols, rows));
    if (e.byWeek) blocks.push(NOTE("Weekly view is shown for the first NCRC; the export contains the full list side-by-side TY vs LY."));
    blocks.push(FU(["Which of these tactics is funded below its LY rate?", "Do any weeks overlap two offers on the same items (stacked depth)?"]));
    return blocks;
  };

  R.promo_week_top = (id, e) => {
    const rng = rngFor(id);
    const tac = pickN(rng, POOLS.tactics, 1)[0];
    const wk = Math.floor(rr(rng, 27, 40)), sales = rr(rng, 2.4e5, 6.5e5);
    const blocks = [];
    if (e.entity === "CIG") {
      blocks.push(H(`CIG ${Math.floor(rr(rng, 100, 9999))} — SIGNATURE SELECT WATER 24PK — had the largest promo-tied sales in ${e.week}: ${fmt.money(sales)} on ${tac}.`));
      blocks.push(TB("Top 5 CIGs by promo-tied sales — " + (e.week || per(e)), ["CIG", "Description", "Tactic", "Promo Sales", "Units"],
        pickN(rng, ncrcsOf(e), 5).map((nm, i) => [String(Math.floor(rr(rngFor(id, i), 100, 9999))), nm, pickN(rngFor(id, i + 9), POOLS.tactics, 1)[0], fmt.k(sales * (1 - i * 0.14)), fmt.units(sales * (1 - i * 0.14) / 3.2)])));
    } else {
      blocks.push(H(`Promo week ${wk} ${per(e).includes("FY") ? "FY 2025" : "2025"} (${dateOfWeek(wk)}) was the biggest single week for CIG ${e.cig} at ${e.div}: ${fmt.money(sales)} on ${tac}.`));
      blocks.push(KV("Winning week detail", [
        ["Promo week", `PW ${wk} (${dateOfWeek(wk)})`],
        ["Tactic", tac],
        ["Sales", fmt.money(sales)],
        ["Units", fmt.units(sales / rr(rng, 2.6, 4))],
        ["vs avg promo week", fmt.spct(rr(rng, 0.3, 0.8), 0)]
      ]));
    }
    blocks.push(FU(["Was the winning week supported by a front-page placement?", "Can the same tactic be secured for the equivalent week next year?"]));
    return blocks;
  };

  function dateOfWeek(wk) {
    const d = new Date(2025, 0, 4 + (wk - 1) * 7);
    const end = new Date(d.getTime() + 6 * 864e5);
    const f = (x) => (x.getMonth() + 1) + "/" + x.getDate();
    return f(d) + "–" + f(end) + "/2025";
  }

  R.market_share = (id, e) => {
    const rng = rngFor(id);
    if (e.mode === "level") {
      const sh = rr(rng, 0.09, 0.24), chg = rr(rng, -0.012, 0.012);
      return [
        H(`${e.div} holds ${fmt.pct(sh)} MULO+ dollar share in ${e.cat} for ${per(e)}, ${chg >= 0 ? "up" : "down"} ${fmt.bps(chg).replace("+", "")} versus a year ago.`),
        TB("Share detail (Circana)", ["Measure", "TY", "YA", "Change"], [
          ["MULO+ $ share", fmt.pct(sh), fmt.pct(sh - chg), fmt.bps(chg)],
          ["ACI $ sales", fmt.k(rr(rng, 2e6, 8e6)), fmt.k(rr(rng, 2e6, 8e6)), fmt.spct(rr(rng, -0.05, 0.06))],
          ["ROM MULO+ $", fmt.k(rr(rng, 2e7, 6e7)), fmt.k(rr(rng, 2e7, 6e7)), fmt.spct(rr(rng, -0.02, 0.05))],
          ["Unit share", fmt.pct(sh * rr(rng, 0.9, 1.1)), fmt.pct(sh * rr(rng, 0.9, 1.1)), fmt.bps(chg * rr(rng, 0.6, 1.2))]
        ]),
        NOTE("Circana panel — standalone table; totals will not reconcile to POS sales. Basis points used for share change only (POL_007/008)."),
        FU(["Is the share change price-driven (check CPI vs primary competitor) or distribution-driven?"])
      ];
    }
    const growth = e.mode !== "rank-decline";
    const cats = pickN(rng, (POOLS.smics[e.dept === "Produce" ? "produce" : "grocery"]).concat(POOLS.smics.dairy), 6);
    return [
      H(growth
        ? `${cats[0]} leads MULO+ share gains in ${e.div} for ${per(e)} at ${fmt.bps(rr(rng, 0.004, 0.011))} — six categories grew share in the period.`
        : `${cats[0]} shows the largest MULO+ dollar-share decline in ${e.div} for ${per(e)} at ${fmt.bps(-rr(rng, 0.004, 0.012))} — the top decliners below.`),
      TB(`Categories ranked by MULO+ share change — ${per(e)}${e.mode === "circana-report" ? " (Circana report, ASM scope)" : ""}`,
        ["Category", "Share TY", "Share YA", "Change (bps)"],
        cats.map((c, i) => {
          const sh = rr(rng, 0.08, 0.25), ch = (growth ? 1 : -1) * rr(rng, 0.002, 0.011) * (1 - i * 0.13);
          return [c, fmt.pct(sh), fmt.pct(sh - ch), fmt.bps(ch)];
        })),
      FU(["Which of these categories also moved on internal units (real demand vs market contraction)?"])
    ];
  };

  R.price_compare = (id, e) => {
    const rng = rngFor(id);
    if (e.mode === "ob-cpi") {
      return [
        H(`Own Brand crackers in ${e.div} price at a ${fmt.pct(0.88, 0)} shelf CPI versus National Brand competitors in ${per(e)} — a ${fmt.pct(0.12, 0)} advantage, wider than the ${fmt.pct(0.08, 0)} target corridor.`),
        TB("Shelf CPI — Own Brand vs National Brand", ["Class", "OB Shelf CPI", "NB Shelf CPI", "Gap", "Coverage"],
          pickN(rng, ["Snack Crackers", "Saltines", "Entertainment Crackers", "Graham"], 4).map((c) => {
            const ob = rr(rng, 0.82, 0.94), nb = rr(rng, 0.97, 1.08);
            return [c, fmt.pct(ob, 0), fmt.pct(nb, 0), fmt.pts(ob - nb), fmt.pct(rr(rng, 0.7, 0.95), 0)];
          })),
        BU(["The OB gap exceeds the corridor in two classes — room to take price without ceding the value position."]),
        FU(["Should OB retails move up in the two over-gapped classes, and by how much per price area?"])
      ];
    }
    if (e.mode === "highest-cpi") {
      const cats = pickN(rng, POOLS.smics.grocery, 5);
      return [
        H(`${cats[0]} carries the highest CPI versus its primary competitor in ${per(e)} at ${fmt.pct(1.09)} — we price ${fmt.pct(0.09, 0)} above the primary on a weighted shelf basis.`),
        TB("Categories by CPI vs primary competitor", ["Category", "Shelf CPI", "Retail CPI", "Primary Competitor"],
          cats.map((c, i) => [c, fmt.pct(rr(rng, 1.0, 1.1) - i * 0.015), fmt.pct(rr(rng, 0.98, 1.08)), i % 2 ? "Walmart" : "Mariano's"])),
        FU(["Is the high-CPI category also losing unit share (urgency check per CPI framework)?"])
      ];
    }
    const items = pickN(rng, itemsOf(e), 6);
    const rows = items.map((it) => {
      const ours = rr(rng, 2.5, 7), gap = rr(rng, -0.4, 1.1);
      return [mockUpc(rng), it, fmt.moneyC(ours), fmt.moneyC(ours - gap), fmt.moneyC(gap).replace("$", gap >= 0 ? "+$" : "-$").replace("--", "-"), fmt.spct(gap / ours, 0)];
    });
    return [
      H(`Across checked ${e.cls || e.cat} items in ${per(e)}, ${e.div} shelves average ${fmt.pct(1.06, 0)} of Walmart — we are premium on ${Math.round(rows.length * 0.66)} of ${rows.length} items, with the widest gaps on national-brand large packs.`),
      TB(`Shelf price vs Walmart — ${per(e)} (latest check per item)`, ["UPC", "Item", "Our Shelf", "Walmart", "Gap $", "Gap %"], rows),
      NOTE(`Coverage: ${fmt.pct(rr(rng, 0.62, 0.85), 0)} of class UPCs had a valid Walmart check in the window — unchecked items are excluded, not assumed.`),
      FU(["Do the widest-gap items overlap our KVI list (priority for corridor repair)?"])
    ];
  };

  R.price_cost_change = (id, e) => {
    const rng = rngFor(id);
    if (e.mode === "price-area") {
      return [
        H(`NCRC ${e.ncrc} took two retail moves in ${e.div} across ${per(e)} — one row per price area below.`),
        TB("Price changes by price area", ["Price Area", "Old Retail", "New Retail", "Change", "Effective"],
          [1, 2, 3, 4].map((pa) => {
            const old = rr(rng, 3, 6), chg = rr(rng, 0.1, 0.5);
            return [`PA ${pa}0${pa}`, fmt.moneyC(old), fmt.moneyC(old + chg), "+" + fmt.moneyC(chg), `FW ${Math.floor(rr(rng, 5, 40))} 2025`];
          })),
        FU(["Did unit velocity react differently by price area after the move?"])
      ];
    }
    if (e.mode === "vlc-cogs-up") {
      const cigs = pickN(rng, itemsOf(e), 5);
      return [
        H(`${cigs.length} CIGs in ${e.cat} took both a VLC and COGS increase in ${per(e)} versus last year — combined cost exposure ${fmt.k(rr(rng, 8e4, 2.5e5))}.`),
        TB("CIGs with VLC and COGS increases", ["CIG", "Description", "VLC/Unit TY", "VLC/Unit LY", "COGS/Unit TY", "COGS/Unit LY"],
          cigs.map((c, i) => {
            const vlc = rr(rng, 2, 4.5), cg = vlc * rr(rng, 0.95, 1.05);
            return [String(Math.floor(rr(rngFor(id, i), 10000, 99999))), c, fmt.moneyC(vlc), fmt.moneyC(vlc * rr(rng, 0.9, 0.97)), fmt.moneyC(cg), fmt.moneyC(cg * rr(rng, 0.9, 0.97))];
          })),
        BU(["Two of the five have no retail change on file since the cost took effect — direct margin leak until repriced."]),
        FU(["Which of these have a pending price recommendation in the pricing queue?"])
      ];
    }
    if (e.mode === "reg-retail-list-cost" || e.mode === "bog-vs-cost") {
      const rows = pickN(rng, ncrcsOf(e), 6).map((nm) => {
        const lc = rr(rng, 2, 5), reg = lc * rr(rng, 1.4, 1.8);
        return [nm, fmt.moneyC(reg), fmt.moneyC(reg * rr(rng, 0.93, 0.99)), fmt.moneyC(lc), fmt.moneyC(lc * rr(rng, 0.9, 0.97))];
      });
      const blocks = [
        H(e.mode === "bog-vs-cost"
          ? `Six NCRCs declined in BOG versus 2YA while taking a list-cost increase — the retail response lagged the cost by 4–9 weeks on the worst four.`
          : `Regular retail and list cost, TY vs PY, for the listed NCRCs — cost is outrunning retail on ${Math.round(rows.length / 2)} of ${rows.length}.`),
        TB(e.mode === "bog-vs-cost" ? "NCRCs: BOG decline + list cost increase" : "Reg retail & list cost — TY vs PY",
          ["NCRC", "Reg Retail TY", "Reg Retail LY", "List Cost TY", "List Cost LY"], rows)
      ];
      if (e.byWeek) blocks.push(NOTE("Week-by-week cost/retail timeline for the top opportunity NCRCs is in the export — the response shows the screen; the timeline demonstrates when the desk did (or did not) react."));
      blocks.push(FU(["Which NCRCs show no retail reaction within 4 weeks of the cost effective date?"]));
      return blocks;
    }
    const items = pickN(rng, itemsOf(e), 7);
    return [
      H(`${items.length} ${e.dept || ""} items took retail price increases in ${per(e)} in ${e.div} — median move +${fmt.moneyC(0.3)}.`),
      TB("Items with price increases", ["UPC", "Description", "Old Retail", "New Retail", "Change", "Effective"],
        items.map((it) => {
          const old = rr(rng, 2, 8), chg = rr(rng, 0.1, 0.6);
          return [mockUpc(rng), it, fmt.moneyC(old), fmt.moneyC(old + chg), "+" + fmt.moneyC(chg), `P8 W${1 + Math.floor(rng() * 4)}`];
        })),
      FU(["Which increases were cost-justified vs margin-mix moves?"])
    ];
  };

  R.store_perf = (id, e) => {
    const rng = rngFor(id);
    const cities = citiesOf(e);
    const n = e.mode === "all-stores-threshold" ? 10 : (e.n || 8);
    const rows = pickN(rng, cities, n).map((city, i) => {
      const ly = e.mode === "all-stores-threshold" ? rr(rng, 1.0e6, 1.9e6) * (1 - i * 0.05) : rr(rng, 3e4, 9e4);
      const chg = rr(rng, -0.08, 0.14);
      const base = [String(3000 + Math.floor(rng() * 999)), city, fmt.k(ly * (1 + chg)), fmt.k(ly), fmt.sk(ly * chg)];
      if (e.mode === "all-stores-threshold") base.splice(2, 0, "J" + (1 + Math.floor(rng() * 5)));
      return base;
    }).sort((a, b) => parseK(b[e.mode === "all-stores-threshold" ? 3 : 2]) - parseK(a[e.mode === "all-stores-threshold" ? 3 : 2]));
    const blocks = [];
    if (e.mode === "all-stores-threshold") {
      blocks.push(H(`${rows.length} Jewel stores cleared ${fmt.money(e.threshold)} in ${e.week} — full ranked list below.`));
      blocks.push(TB(`Stores over ${fmt.k(e.threshold)} — ${e.week}`, ["Store ID", "City", "District", "Sales TY", "Sales LY", "Δ"], rows));
      blocks.push(P(`${rows.length} stores meet the criteria.`));
    } else if (e.n) {
      blocks.push(H(`${rows[0][1]} (store ${rows[0][0]}) grew ${e.dept || e.cat} sales the most in ${e.week || per(e)} at ${rows[0][4]} — top ${e.n} below.`));
      blocks.push(TB(`Top ${e.n} stores by growth — ${e.week || per(e)}`, ["Store ID", "City", "Sales TY", "Sales LY", "Variance"], rows.slice(0, e.n)));
    } else {
      blocks.push(H(`${e.cat} sales across district ${e.district}: ${fmt.k(rows.reduce((s, r) => s + parseK(r[2]), 0))} in ${per(e)}, ${fmt.spct(rr(rng, -0.03, 0.05))} vs LY — store detail below.`));
      blocks.push(TB(`District ${e.district} — ${e.cat} by store, ${per(e)}`, ["Store ID", "City", "Sales TY", "Sales LY", "Variance"], rows));
    }
    blocks.push(FU(["Do the lagging stores share a common price area or competitive opening?"]));
    return blocks;
  };

  R.store_list = (id, e) => {
    const rng = rngFor(id);
    const rows = pickN(rng, POOLS.cities.jewel, 12).map((c) => [String(3000 + Math.floor(rng() * 999)), c]);
    return [
      H(`District ${e.district} in ${e.div} carried ${rows.length} stores in ${per(e)}.`),
      TB(`District ${e.district} roster`, ["Store ID", "City"], rows)
    ];
  };

  R.upc_rank = (id, e) => {
    const rng = rngFor(id);
    const showN = Math.min(e.showN || e.n || 8, 10);
    const items = pickN(rng, itemsOf(e), showN);
    const isDecl = e.dir === "decline";
    const blocks = [];
    if (e.n === 1) {
      const s = rr(rng, 1.5e5, 6e5);
      blocks.push(H(`${items[0]} is the ${e.mode === "kvi" ? "top KVI" : "leader"} for ${scope(e)} in ${e.week || per(e)} — ${fmt.k(s)} sales, ${fmt.units(s / 3.1)} units, ${fmt.k(s * 0.27)} AGP.`));
      blocks.push(KV("Detail", [["UPC", mockUpc(rng)], ["Sales", fmt.money(s)], ["Units", fmt.units(s / 3.1)], ["AGP $", fmt.money(s * 0.27)], ["AGP %", fmt.pct(0.27)]]));
      return blocks.concat([FU(["How does this item's velocity compare to its NCRC peers?"])]);
    }
    let cols, rows;
    if (isDecl) {
      cols = ["UPC", "Description", "AGP TY", "AGP LY", "Variance"];
      rows = items.map((it, i) => {
        const ly = rr(rng, 1.5e4, 8e4) * (1 - i * 0.06), chg = -ly * rr(rng, 0.15, 0.45);
        return [mockUpc(rng), it, fmt.k(ly + chg), fmt.k(ly), fmt.sk(chg)];
      });
    } else if (e.mode === "low-distribution") {
      cols = ["UPC", "Description", "Sales", "Selling Stores"];
      rows = items.map((it, i) => [mockUpc(rng), it, fmt.k(rr(rng, 1e5, 4e5) * (1 - i * 0.08)), String(Math.floor(rr(rng, 22, 99)))]);
    } else {
      cols = ["UPC", "Description", e.metric && /sales/i.test(e.metric) ? "Sales $" : "AGP $"];
      rows = items.map((it, i) => [mockUpc(rng), it, fmt.k(rr(rng, 5e4, 4e5) * (1 - i * 0.08))]);
    }
    blocks.push(H(isDecl
      ? `${e.n || rows.length} ${e.cat || ""} UPCs declined in AGP year over year in ${scope(e)} for ${per(e)} — the worst ${rows.length} account for ${fmt.pct(rr(rng, 0.5, 0.7), 0)} of the total decline.`
      : e.mode === "low-distribution"
        ? `${rows.length + Math.floor(rr(rng, 8, 30))} UPCs in ${e.div} sold in fewer than 100 stores in ${per(e)}${/100K/.test(e.filter || "") ? " while clearing $100K in sales — distribution upside candidates" : ""} — top sellers below.`
        : `Top ${rows.length} ${e.ownBrand ? "Own Brand " : ""}UPCs by ${e.metric || "AGP $"} for ${scope(e)}, ${per(e)}.`));
    blocks.push(TB(`${e.metric || "Ranking"} — ${per(e)}${e.n > showN ? ` (showing ${showN} of ${e.n}; full list in export)` : ""}`, cols, rows));
    blocks.push(FU(isDecl
      ? ["Are the declines promo-week concentrated or base-velocity erosion?"]
      : e.mode === "low-distribution" ? ["Which of these clear the velocity bar for a distribution push?"] : ["What share of the leaders' AGP is promo-week dependent?"]));
    return blocks;
  };

  R.ad_content = (id, e) => {
    const rng = rngFor(id);
    if (e.mode === "ad-count") {
      return [
        H(`${e.div} released 5 ad vehicles during ${e.period}: 4 weekly circulars plus 1 mid-week digital flyer.`),
        TB("Ads released — " + e.period, ["Vehicle", "Release", "Pages", "Front-page items"],
          Array.from({ length: 5 }, (_, i) => [i === 4 ? "Digital Mid-Week Flyer" : `Weekly Circular W${i + 1}`, `04/${(2 + i * 7).toString().padStart(2, "0")}/2025`, i === 4 ? "—" : String(Math.floor(rr(rng, 8, 16))), String(Math.floor(rr(rng, 8, 14)))]))
      ];
    }
    if (e.mode === "frontpage-yoy") {
      const ty = rr(rng, 1.8e6, 3.2e6), chg = rr(rng, -0.12, 0.1);
      return [
        H(`Front-page dollar sales in ${e.week} came in at ${fmt.k(ty)}, ${fmt.spct(chg)} versus the same week last year — ${chg < 0 ? "fewer front-page slots went to top-velocity CIGs than LY" : "stronger slot mix than LY"}.`),
        TB("Front page vs same week LY", ["Measure", "TY", "LY", "Change"], [
          ["Front-page sales", fmt.k(ty), fmt.k(ty / (1 + chg)), fmt.spct(chg)],
          ["Front-page items", "12", "14", "-2"],
          ["Avg $ per slot", fmt.k(ty / 12), fmt.k(ty / (1 + chg) / 14), fmt.spct((ty / 12) / (ty / (1 + chg) / 14) - 1)]
        ]),
        FU(["Which LY front-page CIGs lost their slot this year, and what did they do off-page?"])
      ];
    }
    if (e.mode === "frontpage-split") {
      const fp = rr(rng, 8e5, 1.6e6), rest = fp * rr(rng, 1.8, 2.6);
      const blocks = [
        H(`Front-page items drove ${fmt.k(fp)} of ${e.measure || "sales"} in ${e.week} for ${scope(e)} — ${fmt.pct(fp / (fp + rest), 0)} of the ad total from ${fmt.pct(0.18, 0)} of the placements.`),
        TB(`Front page vs rest of ad — ${e.week}`, ["Placement", "Sales", "Markdown $ (spend)", "Items", "$ per item"], [
          ["Front page (PAGE_NBR = 1)", fmt.k(fp), fmt.k(fp * 0.22), "11", fmt.k(fp / 11)],
          ["Rest of ad", fmt.k(rest), fmt.k(rest * 0.16), "148", fmt.k(rest / 148)],
          ["TOTAL", fmt.k(fp + rest), fmt.k(fp * 0.22 + rest * 0.16), "159", ""]
        ])
      ];
      if (e.by === "CIG") blocks.push(TB("Top CIGs by ad markdown — front page flagged", ["CIG", "Description", "Ad Markdown", "Placement"],
        pickN(rng, ncrcsOf(e), 5).map((nm, i) => [String(Math.floor(rr(rngFor(id, i), 1000, 9999))), nm, fmt.k(rr(rng, 2e4, 9e4)), i < 2 ? "Front page" : "Inside page"])));
      blocks.push(FU(["Is the front-page markdown rate justified by its incremental lift vs inside pages?"]));
      return blocks;
    }
    // page-list
    const items = pickN(rng, (e.dept === "Grocery Food" ? POOLS.ncrcs.grocery : ncrcsOf(e)).concat(POOLS.ncrcs.snack), 8);
    const cols = ["CIG", "Description"]; if (e.extraCol) cols.push(e.extraCol);
    return [
      H(`The ${e.div} ad released ${e.adDate} carried ${items.length} ${e.dept ? e.dept + " " : ""}CIGs on page 1 (front cover).`),
      TB(`Page 1 CIGs — ad of ${e.adDate}`, cols, items.map((nm, i) => {
        const row = [String(Math.floor(rr(rngFor(id, i), 1000, 9999))), nm];
        if (e.extraCol) row.push(fmt.k(rr(rng, 1.5e5, 8e5)));
        return row;
      })),
      FU(["How did page-1 CIGs perform vs their trailing 4-week baseline during the ad week?"])
    ];
  };

  R.markdown_by_cat = (id, e) => {
    const rng = rngFor(id);
    const cats = pickN(rng, POOLS.smics.grocery, 5);
    const wks = ["W27", "W28", "W29", "W30", "Qtr Total"];
    return [
      H(`Markdown spend for ASM ${e.asm} ran ${fmt.k(rr(rng, 1.2e6, 2.4e6))} across ${per(e)} — ${cats[0]} is the heaviest category at ${fmt.pct(0.31, 0)} of total.`),
      TB(`Weekly markdown $ by category — ${per(e)} (first 4 of 13 weeks shown; full grid in export)`,
        ["Category"].concat(wks),
        cats.map((c) => {
          const w = Array.from({ length: 4 }, () => rr(rng, 2e4, 9e4));
          return [c].concat(w.map(fmt.k)).concat([fmt.k(w.reduce((a, b) => a + b) * 3.1)]);
        })),
      NOTE("Markdowns are stored negative (more negative = more spend); displayed here as positive spend per POL_014."),
      FU(["Which categories' markdown is growing faster than their promo-week sales?"])
    ];
  };

  R.bog_drill = (id, e) => {
    const rng = rngFor(id);
    const smics = pickN(rng, smicsOf(e), 4);
    const vendors = pickN(rng, vend(e), 3);
    const ncrcs = pickN(rng, ncrcsOf(e), 4);
    const blocks = [];
    if (e.desk) blocks.push(NOTE(`"${e.desk}" is not a data entity — results below use the closest proxy, the ASM desk assignment (item_hierarchy.ASM). Flagged as a gap in lineage.`));
    blocks.push(H(`${scope(e) || e.div} is losing ${fmt.k(rr(rng, 2.5e5, 7e5))} of Bill-Out Gross in ${per(e)} vs ${e.vs || "LY"} — concentrated in ${smics[0]} and driven by off-invoice-per-unit erosion at ${vendors[0]}.`));
    blocks.push(TB("Step 1 — SMICs declining in BOG", ["SMIC", "BOG TY", "BOG LY", "Change"],
      yoyRows(rng, smics, rr(rng, 2e5, 5e5), 0.16, fmt.k).map((r) => r.slice(0, 4))));
    blocks.push(TB(`Step 2 — vendors within ${smics[0]}`, ["Vendor", "BOG TY", "BOG LY", "Change"],
      yoyRows(rngFor(id, 2), vendors, rr(rng, 1e5, 2.5e5), 0.18, fmt.k).map((r) => r.slice(0, 4))));
    blocks.push(TB(`Step 3 — NCRCs within ${vendors[0]} (worst off-invoice decline first)`,
      ["NCRC", "Reg Retail", "Unit List Cost", "Off-Inv/Unit TY", "Off-Inv/Unit LY", "BOG TY", "BOG LY"],
      ncrcs.map((nm) => {
        const lc = rr(rng, 2, 5), oiLY = lc * rr(rng, 0.08, 0.14);
        return [nm, fmt.moneyC(lc * rr(rng, 1.4, 1.8)), fmt.moneyC(lc), fmt.moneyC(oiLY * rr(rng, 0.4, 0.8)), fmt.moneyC(oiLY), fmt.k(rr(rng, 2e4, 8e4)), fmt.k(rr(rng, 3e4, 1e5))];
      })));
    blocks.push(BU([`${ncrcs[0]} shows the sharpest off-invoice cut — the vendor moved funding off-invoice to scan without a compensating rate. That is the first renegotiation target.`]));
    blocks.push(FU(["Did the off-invoice decline coincide with a list-cost increase on the same NCRCs?", "Is the lost off-invoice showing up in scan/billback instead (net-neutral check)?"]));
    return blocks;
  };

  R.ncrc_detail = (id, e) => {
    const rng = rngFor(id);
    if (e.mode === "deadnet-by-division") {
      return [
        H(`Minimum deadnet cost per unit for NCRC ${e.ncrc} ranges from ${fmt.moneyC(2.61)} (Jewel) to ${fmt.moneyC(3.08)} (Southern) — a ${fmt.moneyC(0.47)} spread across divisions.`),
        TB("Min deadnet per unit by division", ["Division", "Min Deadnet/Unit", "vs Best"],
          ["JEWEL", "SO CALIFORNIA", "SEATTLE", "DENVER", "SOUTHERN"].map((d, i) => [d, fmt.moneyC(2.61 + i * rr(rng, 0.05, 0.15)), i === 0 ? "—" : "+" + fmt.moneyC(i * rr(rng, 0.05, 0.15))])),
        FU(["What funding difference explains the widest-division gap — can it be nationalized?"])
      ];
    }
    if (e.mode === "id-list") {
      const rows = pickN(rng, POOLS.ncrcs.produce, 5).map((nm, i) => [String(Math.floor(rr(rngFor(id, i), 1e11, 9e11))), String(Math.floor(rr(rngFor(id, i + 5), 10000, 99999))), nm, fmt.k(rr(rng, 4e4, 2e5))]);
      return [
        H(`${e.vendor} maps to ${rows.length} NCRCs / CIGs in ${e.cat} for ${e.div} — sales for ${per(e)} below.`),
        TB("Identifiers + sales — " + per(e), ["NCRC", "CIG", "Description", "Sales"], rows)
      ];
    }
    if (e.mode === "ob-vs-nb") {
      const rows = pickN(rng, POOLS.ncrcs.dairy, 6).map((nm, i) => [nm, i % 2 ? "National Brand" : "Own Brand", fmt.k(rr(rng, 2e5, 9e5)), fmt.pct(rr(rng, 0.2, 0.42))]);
      return [
        H(`${e.cat} in ${e.div} splits into ${rows.filter((r) => r[1] === "Own Brand").length} Own Brand and ${rows.filter((r) => r[1] !== "Own Brand").length} National Brand NCRCs for ${per(e)}.`),
        TB("NCRCs — Own Brand vs National Brand", ["NCRC", "Brand Type", "Sales " + per(e), "AGP %"], rows),
        FU(["Where is the OB share of the category vs a year ago?"])
      ];
    }
    if (e.mode === "top-ncrc") {
      const rows = pickN(rng, ["MAGNUM MINI CLASSIC 6CT", "MAGNUM DOUBLE CARAMEL 3CT", "MAGNUM ICE CREAM TUBS", "MAGNUM MINI ALMOND 6CT", "MAGNUM BARS SINGLES"], 5)
        .map((nm, i) => [nm, fmt.units(rr(rng, 3e4, 9e4) * (1 - i * 0.12)), fmt.k(rr(rng, 1.2e5, 4e5) * (1 - i * 0.12))]);
      return [
        H(`Top ${e.n} ${e.vendor} NCRCs by units in ${e.cat}, ${e.div} ${per(e)} — ${rows[0][0]} leads with ${rows[0][1]} units.`),
        TB(`Top NCRCs — ${per(e)}`, ["NCRC", "Units", "Sales"], rows)
      ];
    }
    const rows = pickN(rng, POOLS.items.dairy, 6).map((it, i) => {
      const ly = rr(rng, 2e4, 9e4), chg = rr(rng, -0.15, 0.12);
      return [mockUpc(rngFor(id, i)), it, fmt.k(ly * (1 + chg)), fmt.k(ly), fmt.spct(chg)];
    });
    return [
      H(`NCRC ${e.ncrc} (LUCERNE CREAM CHEESE TUB) contains ${rows.length} UPCs in ${e.div} — sales for ${per(e)} vs YA below.`),
      TB(`Member UPCs — ${per(e)}`, ["UPC", "Description", "Sales TY", "Sales LY", "vs YA"], rows),
      FU(["Are the declining members losing distribution or velocity?"])
    ];
  };

  R.canned_report = (id, e) => {
    const rng = rngFor(id);
    const layout = POOLS.reports[e.report] || ["Measure", "TY", "LY", "Change"];
    let rows;
    if (e.report === "Vendor Performance") {
      rows = pickN(rng, vend(e), 6).map((v) => [v, fmt.k(rr(rng, 2e5, 9e5)), fmt.k(rr(rng, 2e5, 9e5)), fmt.units(rr(rng, 4e4, 2e5)), fmt.pct(rr(rng, 0.2, 0.34)), fmt.pct(rr(rng, 0.2, 0.34)), fmt.k(rr(rng, 2e4, 9e4)), fmt.pct(rr(rng, 0.14, 0.26))]);
    } else if (e.report === "Vendor Scorecard") {
      rows = ["Sales $", "Units", "AGP $", "AGP %", "Total Allowances", "Spend Rate", "Promo Sales Share"].map((m) => {
        const isPct = /%|Rate|Share/.test(m);
        const ty = isPct ? rr(rng, 0.1, 0.35) : rr(rng, 3e5, 3e6);
        const chg = rr(rng, -0.08, 0.08);
        return [m, isPct ? fmt.pct(ty) : fmt.k(ty), isPct ? fmt.pct(ty - ty * chg) : fmt.k(ty / (1 + chg)), isPct ? fmt.pts(ty * chg) : fmt.spct(chg), rng() > 0.5 ? "Above" : "Below"];
      });
    } else if (e.report === "CIG BOG Compression") {
      rows = pickN(rng, ncrcsOf(e), 6).map((nm, i) => {
        const ly = rr(rng, 3e4, 1.2e5);
        return [String(Math.floor(rr(rngFor(id, i), 1000, 9999))), nm, fmt.k(ly * rr(rng, 0.75, 0.95)), fmt.k(ly), fmt.pts(-rr(rng, 0.01, 0.04)), "-" + fmt.moneyC(rr(rng, 0.05, 0.3)), "+" + fmt.moneyC(rr(rng, 0.05, 0.25))];
      });
    } else {
      rows = pickN(rng, itemsOf(e), 6).map((it) => {
        const old = rr(rng, 2, 6), chg = rr(rng, 0.1, 0.5);
        return [mockUpc(rng), it, fmt.moneyC(old), fmt.moneyC(old + chg), "+" + fmt.moneyC(chg), e.report === "Cost Change" ? `FW ${e.week ? e.week.match(/\d+/)[0] : "03"}` : "PA 101", e.report === "Cost Change" ? (rng() > 0.4 ? "Repriced" : "No decision") : (e.week || "")];
      });
    }
    return [
      H(`${e.report} report for ${scope(e)}${e.week ? " — " + e.week : ""}. Pinned layout; no interpretation applied unless a threshold trips.`),
      TB(e.report + " — " + (e.week || per(e)), layout, rows),
      NOTE("Named reports resolve to a stored layout (report_id in the contract) — the NL→SQL layer is bypassed entirely for these."),
      FU(e.report === "Cost Change" ? ["Which no-decision items have promo exposure in the next 4 weeks?"] : ["Want this scoped to a single category or week range?"])
    ];
  };

  R.cannibalization = (id, e) => {
    const rng = rngFor(id);
    const weeks = [28, 31, 35, 38].map((wk, i) => {
      const brandLift = rr(rng, 8000, 22000);
      const restDelta = i === 2 ? -brandLift * rr(rng, 1.05, 1.3) : -brandLift * rr(rng, 0.3, 0.7);
      return { wk, brandLift, restDelta, net: brandLift + restDelta };
    });
    const bad = weeks.find((w) => w.net < 0);
    return [
      H(`Yes — one promoted week degraded total ${e.smic} units: PW ${bad.wk}, where ${e.vendor.split(" ")[0]} lifted ${fmt.units(bad.brandLift)} units but the rest of the SMIC gave back ${fmt.units(Math.abs(bad.restDelta))}, for a net ${fmt.units(bad.net)}.`),
      TB(`${e.vendor.split(" ")[0]} promo weeks vs rest of ${e.smic} — ${per(e)}`,
        ["Promo Week", "Brand Incremental Units", "Rest-of-SMIC Δ Units", "Net SMIC Effect", "Verdict"],
        weeks.map((w) => [`PW ${w.wk}`, "+" + fmt.units(w.brandLift), fmt.units(w.restDelta), (w.net >= 0 ? "+" : "") + fmt.units(w.net), w.net < 0 ? "CANNIBALIZED" : "Accretive"])),
      BU([
        `PW ${bad.wk} ran a deep BOGO while two competing brands sat at full price with no ad support — switchers, not new category trips.`,
        "The three accretive weeks paired moderate depth with feature-ad support, growing the whole SMIC."
      ]),
      RECO("Keep Sargento events at moderate depth with feature support; avoid solo deep-discount weeks unless the vendor funds a category-level display that grows total trips."),
      FU(["Did household penetration grow in the accretive weeks (or was all volume from existing buyers)?"])
    ];
  };

  R.promo_frequency = (id, e) => {
    const rng = rngFor(id);
    const rows = pickN(rng, ncrcsOf(e), 6).map((nm, i) => {
      const lyW = Math.floor(rr(rng, 8, 16)), tyW = lyW - Math.floor(rr(rng, 2, 6));
      return [nm, String(tyW), String(lyW), String(tyW - lyW), fmt.sk(-rr(rng, 3e4, 2e5) * (1 - i * 0.1)), fmt.sk(-rr(rng, 8e3, 5e4) * (1 - i * 0.1))];
    });
    return [
      H(`${rows.length} NCRCs lost promo frequency since ${per(e)} — fewer weeks above ${e.threshold || "5%"} depth than last year, worth ${fmt.k(rows.reduce((s, r) => s + Math.abs(parseK(r[4])), 0))} in sales decline.`),
      TB(`Lost-frequency NCRCs (weeks at >${e.threshold || "5%"} depth)`,
        ["NCRC", "Deep Weeks TY", "Deep Weeks LY", "Lost Weeks", "Sales $ Δ", "AGP $ Δ"], rows),
      RECO("These vendors owe re-investment: take the lost-week count and the sales decline into the next vendor line review — the ask is restored frequency, not deeper one-off events."),
      FU(["Which lost weeks map to lapsed NOPAs (funding pulled) vs desk scheduling choices?"])
    ];
  };

  R.margin_compression = (id, e) => {
    const rng = rngFor(id);
    const ncrcs = e.ncrcs ? e.ncrcs.map((n, i) => `${ncrcsOf(e)[i % ncrcsOf(e).length]} (${n})`) : pickN(rng, ncrcsOf(e), 5);
    const blocks = [];
    if (e.desk) blocks.push(NOTE(`"${e.desk}" resolved to the ASM desk proxy — see lineage gap.`));
    blocks.push(H(`${ncrcs.length} NCRCs show margin-rate compression AND AGP $ declines for ${scope(e)} in ${per(e)} — combined AGP impact ${fmt.sk(-rr(rng, 1.5e5, 4e5))}.`));
    blocks.push(TB("Opportunity NCRCs — both conditions hold", ["NCRC", "AGP % TY", "AGP % LY", "Rate Δ", "AGP $ Δ"],
      ncrcs.map((nm, i) => {
        const ly = rr(rng, 0.24, 0.34), d = -rr(rng, 0.015, 0.05) * (1 - i * 0.1);
        return [nm, fmt.pct(ly + d), fmt.pct(ly), fmt.pts(d), fmt.sk(-rr(rng, 2e4, 9e4) * (1 - i * 0.1))];
      })));
    if (e.likeTactics) {
      blocks.push(TB("Like-tactic rate erosion (same tactic, both years)", ["NCRC", "Tactic", "Gross % LY", "Gross % TY", "Rate Δ"],
        ncrcs.slice(0, 3).map((nm, i) => {
          const ly = rr(rng, 0.27, 0.33), d = -rr(rng, 0.02, 0.05);
          return [nm, pickN(rngFor(id, i + 4), POOLS.tactics, 1)[0], fmt.pct(ly), fmt.pct(ly + d), fmt.pts(d)];
        })));
      blocks.push(BU(["Same tactic, worse rate = the funding or cost moved underneath the event. That is a vendor conversation, not a tactic change."]));
    }
    if (e.byPromoWeek || e.byWeek) {
      const w = rngFor(id, 8);
      blocks.push(TB(`${ncrcs[0].split(" (")[0]} — promo weeks TY vs LY`, ["Promo Week", "Tactic TY", "AGP % TY", "Tactic LY", "AGP % LY"],
        Array.from({ length: 4 }, (_, i) => [`PW ${28 + i * 3}`, pickN(rngFor(id, i + 11), POOLS.tactics, 1)[0], fmt.pct(rr(w, 0.2, 0.27)), pickN(rngFor(id, i + 17), POOLS.tactics, 1)[0], fmt.pct(rr(w, 0.26, 0.32))])));
    }
    blocks.push(FU(["Which compressed NCRCs share a vendor — bundle them into one renegotiation?", "Did list cost move on these NCRCs in the same window?"]));
    return blocks;
  };

  R.aiv_erosion = (id, e) => {
    const rng = rngFor(id);
    const names = e.entity === "vendor" ? pickN(rng, vend(e), 6) : pickN(rng, ncrcsOf(e), 6);
    const blocks = [];
    if (e.desk) blocks.push(NOTE(`"${e.desk}" resolved to the ASM desk proxy — see lineage gap.`));
    blocks.push(H(`${names.length} ${e.entity === "vendor" ? "vendors" : "NCRCs"} are declining in both AIV and AGP $ for ${scope(e)} in ${per(e)} — the race-to-the-bottom watchlist.`));
    blocks.push(TB("AIV + AGP $ double-decliners", [cap(e.entity || "NCRC"), "AIV TY", "AIV LY", "AIV Δ", "AGP $ Δ"],
      names.map((nm, i) => {
        const ly = rr(rng, 2.8, 5.2), d = -rr(rng, 0.08, 0.35) * (1 - i * 0.1);
        return [nm, fmt.moneyC(ly + d), fmt.moneyC(ly), "-" + fmt.moneyC(Math.abs(d)), fmt.sk(-rr(rng, 1.5e4, 8e4) * (1 - i * 0.1))];
      })));
    if (e.byWeek) {
      const w = rngFor(id, 6);
      blocks.push(TB(`${names[0]} — weekly AIV / AGP, TY vs LY (first 5 weeks shown)`,
        ["Fiscal Week", "AIV TY", "AIV LY", "AGP $ TY", "AGP $ LY"],
        Array.from({ length: 5 }, (_, i) => [`W${i + 1}`, fmt.moneyC(rr(w, 2.6, 3.4)), fmt.moneyC(rr(w, 3.0, 3.9)), fmt.k(rr(w, 8e3, 2e4)), fmt.k(rr(w, 1.2e4, 2.6e4))])));
    }
    blocks.push(BU(["Per the AIV diagnostic, separate the three causes before acting: item-mix shift, deeper promo depth, or base-price cuts — each implies a different response."]));
    blocks.push(FU(["Is the AIV decline mix, promo depth, or base price (Section 4E three-step)?"]));
    return blocks;
  };

  R.supply_chain = (id, e) => {
    const rng = rngFor(id);
    const blocks = [];
    if (/arrival/i.test(e.measure || "")) {
      blocks.push(H(`Arrival-date and PO-level off-invoice tracking is not answerable from the current data scope — here is the half we can serve, and exactly what is missing for the rest.`));
      blocks.push(GAPBOX([
        "WHS/DSD shipment tables with store arrival dates are not onboarded — master_bill_out_gross carries shipped quantity only.",
        "PO-level allowance linkage (which units were bought on a PO carrying allowance " + e.allowance + ") requires the procurement feed — the shoulder-deal miss cannot be quantified until it lands."
      ]));
      blocks.push(TB(`What we CAN answer now — NCRC ${e.ncrc} shipped vs sold, ad week`, ["Store", "Shipped", "Sold", "Sell-through"],
        pickN(rng, POOLS.cities.jewel, 5).map((c) => {
          const sh = rr(rng, 300, 900), so = sh * rr(rng, 0.5, 0.95);
          return [c, fmt.units(sh), fmt.units(so), fmt.pct(so / sh, 0)];
        })));
      return blocks;
    }
    const rows = pickN(rng, POOLS.cities.jewel, 7).map((c) => {
      const sh = rr(rng, 400, 1200), so = sh * rr(rng, 0.45, 0.98);
      return [c, fmt.units(sh), fmt.units(so), fmt.pct(so / sh, 0), fmt.moneyC(rr(rng, 2.6, 3.6))];
    });
    blocks.push(H(`Item ${e.item}: chain sell-through is ${fmt.pct(0.74, 0)} for the window — three stores sit under 55% with AIV noticeably below chain, consistent with local Store Link activity.`));
    blocks.push(TB("Shipped vs sold by store", ["Store", "Units Shipped", "Units Sold", "Sell-through", "AIV"], rows));
    blocks.push(FU(["Should the low-sell-through stores stop-ship until inventory normalizes?"]));
    return blocks;
  };

  R.slotting = (id, e) => {
    const rng = rngFor(id);
    const rows = (e.smics ? e.smics : pickN(rng, smicsOf(e), 4)).map((s, i) => {
      const ly = rr(rng, 3e4, 1.2e5);
      const ty = ly * rr(rng, 0.5, 1.15);
      return [s, pickN(rngFor(id, i + 3), vend(e), 1)[0], `FW ${Math.floor(rr(rng, 1, 8))}–${Math.floor(rr(rng, 9, 13))}`, fmt.k(ly), fmt.k(ty), ty < ly * 0.95 ? "BEHIND LY" : "On pace"];
    });
    return [
      H(`Next quarter's slotting picture vs LY for ${scope(e)}: ${rows.filter((r) => r[5] === "BEHIND LY").length} of ${rows.length} SMIC/vendor cycles are running behind last year's committed dollars.`),
      TB("Slotting / placement cycles — LY plan vs TY committed", ["SMIC", "Vendor", "LY Cycle Window", "LY $", "TY Committed $", "Status"], rows),
      RECO("Share the BEHIND-LY rows with the SM ahead of vendor line reviews — the ask is commitment to at-or-ahead of LY before the cycle window opens."),
      FU(["Which behind-pace vendors have new-item activity that should carry slotting this cycle?"])
    ];
  };

  R.scans_copients = (id, e) => {
    const rng = rngFor(id);
    return [
      H(`Historical scan & Copient performance for CSD ${e.csd} on tactic "${e.tactic}" during holiday events — four prior events below; the estimate-vs-actual half needs the AIM feed.`),
      TB("Historical events — scans & Copients", ["Event", "Promo Week", "Scan Units", "Copient Redemptions", "Markdown $"],
        ["Memorial Day 2024", "July 4th 2024", "Labor Day 2024", "Memorial Day 2025"].map((ev) => [ev, `PW ${Math.floor(rr(rng, 20, 40))}`, fmt.units(rr(rng, 2e4, 6e4)), fmt.units(rr(rng, 4e3, 1.6e4)), fmt.k(rr(rng, 2e4, 7e4))])),
      GAPBOX(["Planned/estimated scans from AIM are not onboarded — post-event actual-vs-estimate cannot be produced until the AIM plan feed lands. Actuals above are complete."]),
      FU(["Use the 4-event average as the P&L planning baseline for the next holiday event?"])
    ];
  };

  R.build_sheet = (id, e) => [
    H(`SLU build sheets are not answerable from the current data scope — component-level cost builds are not onboarded. Here is the nearest answerable view while that source is added.`),
    GAPBOX([
      "No component/build-sheet source exists in the schema (gap: manufacturing-cost feed).",
      "Cross-division comparison of the finished item IS answerable — shown below as the interim proxy."
    ]),
    TB(`Interim proxy — SLU ${e.slu} finished-item cost by division, TY vs 2YA`,
      ["Division", "VLC/Unit TY", "VLC/Unit 2YA", "Deadnet/Unit TY", "Deadnet/Unit 2YA"],
      ["JEWEL", "SO CALIFORNIA", "SEATTLE", "SOUTHERN", "DENVER"].map((d, i) => {
        const rng = rngFor(100 + i, 9);
        const v = rr(rng, 2.4, 3.2);
        return [d, fmt.moneyC(v), fmt.moneyC(v * rr(rng, 0.82, 0.94)), fmt.moneyC(v * 0.93), fmt.moneyC(v * 0.93 * rr(rng, 0.82, 0.94))];
      })),
    FU(["Should we scope the build-sheet feed (components + conversion costs) into the next data onboarding cycle?"])
  ];

  R.quad_review = (id, e) => {
    const rng = rngFor(id);
    return [
      H(`Last ad week's promotions ranked by negative AGP $ impact — the ranking is answerable today; the Quad 2–4 labels are not, until a quadrant rule is defined.`),
      TB("Promotions by AGP $ impact — last ad week", ["Offer", "Tactic", "AGP $ Impact", "Units Lift", "Funded %"],
        pickN(rng, ncrcsOf(e), 5).map((nm, i) => [nm, pickN(rngFor(id, i + 2), POOLS.tactics, 1)[0], fmt.sk(-rr(rng, 8e3, 4e4) * (1 - i * 0.15)), fmt.spct(rr(rng, 0.05, 0.3), 0), fmt.pct(rr(rng, 0.3, 0.8), 0)])),
      GAPBOX(["'Quad 2–4' has no definition in any table or registry. Proposal: classify offers on a lift% × funded% quadrant and pre-compute nightly; until governance signs that off, this response ranks by AGP impact without quad labels."]),
      FU(["Approve lift × funding as the quadrant rule so this report can be labeled?"])
    ];
  };

  R.dept_agg = (id, e) => {
    const rng = rngFor(id);
    if (e.mode === "rank-divisions") {
      const divs = ["JEWEL", "SO CALIFORNIA", "SEATTLE", "DENVER", "SOUTHERN", "MID-ATLANTIC"];
      return [
        H(`${divs[0]} leads AGP % in ${e.cat} for ${per(e)} at ${fmt.pct(0.335)} — divisions ranked below.`),
        TB(`Divisions ranked by AGP % — ${e.cat}, ${per(e)}`, ["Rank", "Division", "AGP %", "AGP $", "Sales"],
          divs.map((d, i) => [String(i + 1), d, fmt.pct(0.335 - i * rr(rng, 0.005, 0.012)), fmt.k(rr(rng, 8e5, 3e6)), fmt.k(rr(rng, 3e6, 9e6))])),
        FU(["What separates the top division — rate structure, mix, or funding?"])
      ];
    }
    if (e.mode === "units-down-agp-up") {
      const depts = ["GROCERY", "DAIRY", "FROZEN", "GM/HBC", "BAKERY"];
      const rows = depts.slice(0, 3).map((d) => [d, fmt.spct(-rr(rng, 0.02, 0.06)), fmt.sk(rr(rng, 1e5, 6e5)), fmt.pts(rr(rng, 0.005, 0.02))]);
      return [
        H(`${rows.length} departments in ${e.div} decreased units but increased AGP $ over the ${per(e)} — pricing/mix carried profit while volume gave ground.`),
        TB("Departments: units down, AGP $ up — " + per(e), ["Department", "Units Δ", "AGP $ Δ", "AGP % Δ"], rows),
        BU(["Profit-on-shrinking-volume is sustainable only while elasticity holds — watch share in these departments."]),
        FU(["Is unit decline in these departments broad-based or concentrated in a few categories?"])
      ];
    }
    const s = rr(rng, 1.2e7, 2.8e7);
    return [
      H(`Department ${e.dept} sales for ${e.div} in ${per(e)}: ${fmt.k(s)}, ${fmt.spct(rr(rng, -0.02, 0.05))} versus prior year.`),
      TB("Department summary — " + per(e), ["Measure", "TY", "LY", "Change"], [
        ["Sales $", fmt.k(s), fmt.k(s * 0.972), fmt.spct(0.029)],
        ["Units", fmt.units(s / 3.4), fmt.units(s / 3.32), fmt.spct(-0.006)],
        ["AGP $", fmt.k(s * 0.283), fmt.k(s * 0.279), fmt.spct(0.043)]
      ])
    ];
  };

  R.clarify = (id, e) => [
    H(`One value is missing before this can run: the ${e.missing}.`),
    P(`The request filters stores by revenue ("over ___ in revenue for the fiscal week") but the threshold didn't come through. Rather than guess, the best-response layer holds the query and asks — downstream layers are never invoked on a guessed filter.`),
    BU([
      "Reply with a number (e.g., $1,000,000) and I'll run the full ranked list immediately.",
      "Common choices for weekly store revenue cuts: $500K · $750K · $1M.",
      "Everything else is already resolved: Jewel, all stores + district + name, fiscal week 34 2025, sorted descending, count below the table."
    ]),
    NOTE("Contract status: HOLD_FOR_CLARIFICATION — entities resolved except threshold; identical question with the threshold present (Q61) runs straight through.")
  ];

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function parseK(s) {
    if (typeof s !== "string") return 0;
    const m = s.replace(/[+,$]/g, "").match(/(-?)([\d.]+)(M|K)?/);
    if (!m) return 0;
    return (m[1] === "-" ? -1 : 1) * parseFloat(m[2]) * (m[3] === "M" ? 1e6 : m[3] === "K" ? 1e3 : 1);
  }

  // ------------------------------------------------------------- matching
  // Light synonym folding so paraphrases land on the same tokens the
  // canonical questions use (mirrors the metric registry's synonym map).
  const SYN = { profit: "agp", margin: "agp", margins: "agp", revenue: "sales", dollars: "sales", declining: "decline", dropping: "decline", falling: "decline", causing: "decline", tanking: "decline", worst: "decline", supplier: "vendor", suppliers: "vendors" };
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9$%\s]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2).map((w) => SYN[w] || w));
  const QINDEX = QUESTIONS.map((q) => ({ id: q.id, a: q.a, e: q.e, text: QUESTION_TEXT[q.id], norm: norm(QUESTION_TEXT[q.id]), toks: tokens(QUESTION_TEXT[q.id]) }));

  function similarity(aToks, b) {
    let inter = 0;
    aToks.forEach((t) => { if (b.toks.has(t)) inter++; });
    const uni = aToks.size + b.toks.size - inter;
    const jaccard = uni ? inter / uni : 0;
    // containment handles short paraphrases of long canonical questions
    const containment = aToks.size ? inter / aToks.size : 0;
    return Math.max(jaccard, containment * 0.9);
  }

  const T3_KEYWORDS = [
    [/driv|caus|why is|what.*explain|diagnos/, "driver_decomp"],
    [/market share|mulo|circana/, "market_share"],
    [/shelf price|walmart|cpi|competitor/, "price_compare"],
    [/bill.?out|bog\b/, "bog_drill"],
    [/line 7|nopa|allowance/, "allowance_breakdown"],
    [/incremental|best.*(tactic|price)|optimal.*(retail|price)|kpi perform/, "promo_effectiveness"],
    [/take rate|promotions ran|promo tactics by|minimum buy/, "promo_detail"],
    [/front.?page|page 1|ad releas|circular/, "ad_content"],
    [/markdown/, "markdown_by_cat"],
    [/store.*(sales|list|district)|district/, "store_perf"],
    [/upc|top \d+|highest selling|kvi/, "upc_rank"],
    [/ncrc|price group|deadnet/, "ncrc_detail"],
    [/margin rate compression|like.?tactic/, "margin_compression"],
    [/aiv/, "aiv_erosion"],
    [/shipped|arrival|sell.?through|distro/, "supply_chain"],
    [/slotting|placement allowance/, "slotting"],
    [/scan|copient/, "scans_copients"],
    [/build sheet|slu/, "build_sheet"],
    [/quad/, "quad_review"],
    [/promo depth|frequency/, "promo_frequency"],
    [/cannibal|degrade/, "cannibalization"],
    [/vendor (performance|scorecard)|cost change report|price change report|compression report/, "canned_report"],
    [/rank division|department \d+|departments/, "dept_agg"],
    [/vendors|decline|growth/, "yoy_rank"]
  ];

  function t3Entities(text) {
    const e = { domain: "grocery" };
    const t = text.toLowerCase();
    if (/southern/.test(t)) e.div = "Southern"; else e.div = "Jewel";
    const q = t.match(/q([1-4])\s*(fy)?\s*(20\d\d|\d\d)?/); if (q) e.period = `Q${q[1]} ${q[3] ? (q[3].length === 2 ? "20" + q[3] : q[3]) : "2025"}`;
    const p = t.match(/p(\d{1,2})\s*(20\d\d)?/); if (!e.period && p) e.period = `P${p[1]} ${p[2] || "2025"}`;
    const fy = t.match(/fy\s?(20)?(\d\d)/); if (!e.period && fy) e.period = `FY 20${fy[2]}`;
    if (!e.period) e.period = "Q3 2025";
    for (const [dom, smics] of Object.entries(POOLS.smics)) {
      if (smics.some((s) => t.includes(s.toLowerCase().slice(0, 8)))) { e.domain = dom; e.cat = smics.find((s) => t.includes(s.toLowerCase().slice(0, 8))); break; }
    }
    for (const list of Object.values(POOLS.vendors)) {
      const v = list.find((v) => t.includes(v.toLowerCase().split(" ")[0]) && v.split(" ")[0].length > 3);
      if (v) { e.vendor = v; break; }
    }
    const asm = text.match(/ASM\s+([A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+)/); if (asm) e.asm = asm[1];
    return e;
  }

  function matchQuestion(input) {
    const nIn = norm(input);
    const exact = QINDEX.find((q) => q.norm === nIn);
    if (exact) return { tier: 1, score: 1, q: exact, arch: exact.a, e: exact.e, latency: 2 };
    const toks = tokens(input);
    let best = null, bestScore = 0;
    for (const q of QINDEX) {
      const s = similarity(toks, q);
      if (s > bestScore) { bestScore = s; best = q; }
    }
    if (bestScore >= 0.92) return { tier: 1, score: bestScore, q: best, arch: best.a, e: best.e, latency: 3 };
    if (bestScore >= 0.40) return { tier: 2, score: bestScore, q: best, arch: best.a, e: best.e, latency: 140 + Math.floor(bestScore * 60) };
    // Tier 3: simulated fast-LLM inference
    let arch = "yoy_rank";
    for (const [re, a] of T3_KEYWORDS) { if (re.test(nIn)) { arch = a; break; } }
    const near = QINDEX.map((q) => ({ q, s: similarity(toks, q) })).sort((a, b) => b.s - a.s).slice(0, 3);
    return { tier: 3, score: bestScore, q: null, arch, e: t3Entities(input), latency: 1600 + Math.floor(Math.random() * 500), near };
  }

  // ------------------------------------------------------------- contract
  function buildContract(match, inputText) {
    const A = ARCHETYPES[match.arch];
    return {
      version: "br-1.0",
      intent: { archetype: match.arch, name: A.name, style: A.style, description: A.intent },
      match: {
        tier: match.tier,
        method: match.tier === 1 ? "registry_exact" : match.tier === 2 ? "embedding_ann" : "fast_llm_inference",
        similarity: Number(match.score.toFixed(3)),
        matched_question_id: match.q ? match.q.id : null,
        few_shot_injected: match.tier === 3 ? (match.near || []).map((n) => ({ question_id: n.q.id, archetype: n.q.a, similarity: Number(n.s.toFixed(3)) })) : undefined,
        latency_ms: match.latency
      },
      entities: match.e,
      response_template: {
        sections: A.style === "exemplar" ? ["headline", "evidence_stat", "detail_table", "recommendation", "why_it_won", "follow_ups"]
          : A.style === "diagnostic" ? ["metrics_table", "headline", "driver_bullets", "follow_ups"]
          : A.style === "clarify" ? ["clarification_request", "resolved_entities", "options"]
          : A.style === "gap" ? ["gap_disclosure", "answerable_subset", "follow_ups"]
          : ["headline", "ranked_table", "insight_bullets", "follow_ups"]
      },
      data_plan: {
        tables: A.lineage.map((l) => ({ table: l.table, grain: l.grain, columns: l.cols, purpose: l.why })),
        derived_metrics: A.derived.map((d) => ({ metric: d.name, formula: d.formula, status: d.status })),
        recipe: A.recipe
      },
      gaps: A.gaps.map((g) => ({ severity: g.sev, gap: g.text })),
      constraints: { latency_budget_ms: 30000, this_layer_budget_ms: 2000, comparison_default: "same_period_prior_year", style_rules: ["POL_014 markdown sign", "POL_007/008 bps for share only", "no closing summary (Rule 25)"] },
      downstream: { next: "entity_resolution → NL2SQL", note: "Template + data_plan pin the SQL surface; NL2SQL fills predicates only.", input_question: inputText }
    };
  }

  // ------------------------------------------------------------- rendering
  const $ = (sel, el = document) => el.querySelector(sel);
  const thread = () => $("#thread");
  let debugOn = false;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function blockEl(b) {
    if (b.t === "h") return el("div", "blk headline", esc(b.text));
    if (b.t === "p") return el("div", "blk para", esc(b.text));
    if (b.t === "note") return el("div", "blk note", esc(b.text));
    if (b.t === "why") return el("div", "blk why", "<strong>Why it won:</strong> " + esc(b.text.replace(/^Why it won:\s*/i, "")));
    if (b.t === "reco") { const d = el("div", "blk reco"); d.appendChild(el("div", "reco-title", "Recommendation")); d.appendChild(el("div", "", esc(b.text))); return d; }
    if (b.t === "bullets" || b.t === "fu") {
      const d = el("div", "blk " + (b.t === "fu" ? "followups" : "bullets"));
      if (b.t === "fu") d.appendChild(el("div", "fu-title", "Follow-up questions"));
      const ul = el("ul"); b.items.forEach((it) => ul.appendChild(el("li", "", esc(it)))); d.appendChild(ul); return d;
    }
    if (b.t === "gap") {
      const d = el("div", "blk gapbox");
      d.appendChild(el("div", "gap-title", "⚠ Data gap — cannot fully answer yet"));
      const ul = el("ul"); b.items.forEach((it) => ul.appendChild(el("li", "", esc(it)))); d.appendChild(ul); return d;
    }
    if (b.t === "kv") {
      const d = el("div", "blk");
      if (b.title) d.appendChild(el("div", "tbl-title", esc(b.title)));
      const t = el("table", "kv-table");
      b.rows.forEach(([k, v]) => { const tr = el("tr"); tr.appendChild(el("td", "kv-k", esc(k))); tr.appendChild(el("td", "kv-v", esc(v))); t.appendChild(tr); });
      d.appendChild(wrapScroll(t)); return d;
    }
    if (b.t === "table") {
      const d = el("div", "blk");
      if (b.title) d.appendChild(el("div", "tbl-title", esc(b.title)));
      const t = el("table", "data-table");
      const thr = el("tr"); b.cols.forEach((c) => thr.appendChild(el("th", "", esc(c)))); t.appendChild(thr);
      b.rows.forEach((r) => {
        const tr = el("tr");
        r.forEach((c, i) => {
          const td = el("td", i === 0 ? "first" : "", esc(c));
          const s = String(c);
          if (/^[-−]|^\(|MISSED|CANNIBALIZED|BEHIND/.test(s) && i > 0) td.classList.add("neg");
          else if (/^\+/.test(s) && i > 0) td.classList.add("pos");
          tr.appendChild(td);
        });
        t.appendChild(tr);
      });
      d.appendChild(wrapScroll(t)); return d;
    }
    return el("div", "blk", esc(JSON.stringify(b)));
  }
  function wrapScroll(t) { const w = el("div", "tbl-scroll"); w.appendChild(t); return w; }

  function debugPanel(match, contract) {
    const A = ARCHETYPES[match.arch];
    const d = el("div", "debug-panel" + (debugOn ? "" : " hidden"));
    const tierLabel = match.tier === 1 ? "Tier 1 · Registry exact match" : match.tier === 2 ? "Tier 2 · Nearest-neighbor retrieval" : "Tier 3 · Fast-LLM contract inference";
    const head = el("div", "dbg-head");
    head.appendChild(el("span", "dbg-tier t" + match.tier, tierLabel));
    head.appendChild(el("span", "dbg-meta", `similarity ${match.score.toFixed(2)} · ${match.latency} ms · archetype: ${match.arch}`));
    d.appendChild(head);
    if (match.tier === 3 && match.near) {
      d.appendChild(el("div", "dbg-sub", "Few-shot injected into the fast-LLM call (nearest known intents): " +
        match.near.map((n) => `#${n.q.id} (${n.q.a}, ${n.s.toFixed(2)})`).join(" · ")));
    }
    if (match.q && match.tier === 2) d.appendChild(el("div", "dbg-sub", `Matched canonical question #${match.q.id}: “${esc(match.q.text.slice(0, 120))}${match.q.text.length > 120 ? "…" : ""}”`));

    const sec = (title) => { const s = el("div", "dbg-sec-title", title); d.appendChild(s); };

    sec("Tables & columns");
    const lt = el("table", "dbg-table");
    lt.appendChild(rowEls("th", ["Table", "Grain", "Columns", "Purpose"]));
    A.lineage.forEach((l) => lt.appendChild(rowEls("td", [l.table, l.grain, (l.cols || []).join(", "), l.why])));
    d.appendChild(wrapScroll(lt));

    if (A.derived.length) {
      sec("Derived metrics");
      const mt = el("table", "dbg-table");
      mt.appendChild(rowEls("th", ["Metric", "Formula / logic", "Status"]));
      A.derived.forEach((m) => {
        const tr = rowEls("td", [m.name, m.formula, ""]);
        const chip = el("span", "chip " + m.status, m.status === "registry" ? "in registry" : m.status === "computed" ? "computed" : "GAP");
        tr.lastChild.appendChild(chip);
        mt.appendChild(tr);
      });
      d.appendChild(wrapScroll(mt));
    }

    sec("Reasoning recipe");
    const ol = el("ol", "dbg-recipe");
    A.recipe.forEach((s) => ol.appendChild(el("li", "", esc(s))));
    d.appendChild(ol);

    sec("Gaps to surface the best response");
    if (A.gaps.length) {
      const ul = el("ul", "dbg-gaps");
      A.gaps.forEach((g) => {
        const li = el("li");
        li.appendChild(el("span", "sev " + g.sev, g.sev.toUpperCase()));
        li.appendChild(document.createTextNode(" " + g.text));
        ul.appendChild(li);
      });
      d.appendChild(ul);
    } else d.appendChild(el("div", "dbg-sub", "No gaps — fully answerable from current scope."));

    sec("Downstream contract (entity-extraction → NL2SQL input)");
    const pre = el("pre", "dbg-json", esc(JSON.stringify(contract, null, 2)));
    d.appendChild(pre);
    return d;
  }
  function rowEls(tag, cells) { const tr = el("tr"); cells.forEach((c) => tr.appendChild(el(tag, "", esc(c)))); return tr; }

  // ------------------------------------------------------------- chat flow
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function addUserMsg(text) {
    const m = el("div", "msg user");
    m.appendChild(el("div", "bubble", esc(text)));
    thread().appendChild(m);
    scrollDown();
  }

  async function answer(text) {
    const match = matchQuestion(text);
    const contract = buildContract(match, text);
    const m = el("div", "msg bot");
    const bubble = el("div", "bubble");
    m.appendChild(bubble);
    thread().appendChild(m);

    // staged pipeline
    const stages = el("div", "stages");
    bubble.appendChild(stages);
    scrollDown();
    const stageDefs = [
      match.tier === 1 ? { label: `Intent matched — registry exact hit`, ms: 240 }
        : match.tier === 2 ? { label: `Intent matched — nearest neighbor (${match.score.toFixed(2)})`, ms: 380 }
          : { label: `No direct hit — inferring contract via fast-LLM (3 nearest archetypes injected)`, ms: 900 },
      { label: `Answer contract built — ${ARCHETYPES[match.arch].name}`, ms: 320 },
      { label: "Fetching data (mock)", ms: 620 },
      { label: "Composing response", ms: 300 }
    ];
    let elapsed = match.latency;
    for (const s of stageDefs) {
      const row = el("div", "stage running", `<span class="dot"></span>${esc(s.label)}`);
      stages.appendChild(row);
      scrollDown();
      await sleep(s.ms);
      elapsed += s.ms;
      row.classList.remove("running"); row.classList.add("done");
      row.innerHTML = `<span class="dot"></span>${esc(s.label)} <span class="stage-ms">${s === stageDefs[0] ? match.latency : s.ms} ms</span>`;
    }
    await sleep(150);
    stages.classList.add("collapsed");
    stages.title = "Pipeline stages (click to expand)";
    stages.onclick = () => stages.classList.toggle("collapsed");

    // stream blocks
    const qid = match.q ? match.q.id : 900 + (text.length % 97);
    let blocks;
    try { blocks = R[match.arch](qid, match.e || {}); }
    catch (err) { blocks = [H("Could not render this archetype — " + err.message)]; }
    const body = el("div", "answer-body");
    bubble.appendChild(body);
    for (const b of blocks) {
      const node = blockEl(b);
      node.classList.add("reveal");
      body.appendChild(node);
      scrollDown();
      await sleep(b.t === "table" || b.t === "kv" ? 240 : 140);
      node.classList.add("shown");
    }
    bubble.appendChild(el("div", "mock-tag", `mock data · answered in ${(elapsed / 1000).toFixed(1)}s simulated (budget 30s)`));
    bubble.appendChild(debugPanel(match, contract));
    scrollDown();
  }

  function scrollDown() { const t = $("#threadWrap"); t.scrollTop = t.scrollHeight; }

  async function submit(text) {
    text = text.trim();
    if (!text) return;
    $("#chatInput").value = "";
    addUserMsg(text);
    await answer(text);
  }

  // ------------------------------------------------------------- boot
  document.addEventListener("DOMContentLoaded", () => {
    const input = $("#chatInput");
    $("#sendBtn").addEventListener("click", () => submit(input.value));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input.value); } });

    const tog = $("#lineageToggle");
    tog.addEventListener("change", () => {
      debugOn = tog.checked;
      document.body.classList.toggle("debug-on", debugOn);
      document.querySelectorAll(".debug-panel").forEach((p) => p.classList.toggle("hidden", !debugOn));
    });

    // sample chips
    const samples = [51, 25, 58, 68, 7, 13, 61, 62, 83];
    const chips = $("#chips");
    samples.forEach((id) => {
      const c = el("button", "chip-btn", esc(QUESTION_TEXT[id].slice(0, 74) + (QUESTION_TEXT[id].length > 74 ? "…" : "")));
      c.title = QUESTION_TEXT[id];
      c.addEventListener("click", () => submit(QUESTION_TEXT[id]));
      chips.appendChild(c);
    });

    // browse-all drawer
    const drawer = $("#qDrawer"), list = $("#qList");
    QUESTIONS.forEach((q) => {
      const row = el("button", "q-row");
      row.appendChild(el("span", "q-id", "#" + q.id));
      row.appendChild(el("span", "q-arch", q.a));
      row.appendChild(el("span", "q-text", esc(QUESTION_TEXT[q.id])));
      row.addEventListener("click", () => { drawer.classList.remove("open"); submit(QUESTION_TEXT[q.id]); });
      list.appendChild(row);
    });
    $("#browseBtn").addEventListener("click", () => drawer.classList.toggle("open"));
    $("#drawerClose").addEventListener("click", () => drawer.classList.remove("open"));
    $("#qFilter").addEventListener("input", (e) => {
      const f = e.target.value.toLowerCase();
      document.querySelectorAll(".q-row").forEach((r) => { r.style.display = r.textContent.toLowerCase().includes(f) ? "" : "none"; });
    });

    // greeting
    const g = el("div", "msg bot");
    g.appendChild(el("div", "bubble", `<div class="blk para">Ask any of the 133 merchant questions (or a paraphrase, or something new). Every answer is generated from the <strong>best-response archetype library</strong> with mock data — flip <strong>Data lineage</strong> in the header to see the tables, derived metrics, gaps, and the downstream contract behind each response.</div>`));
    thread().appendChild(g);
  });
})();
