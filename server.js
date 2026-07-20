const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 5173);
const root = __dirname;

// --- .env config file (gitignored) --------------------------------------
// Put API keys in a `.env` file next to server.js — one KEY=value per line:
//   OPENAI_API_KEY=sk-proj-...
//   ANTHROPIC_API_KEY=sk-ant-...
//   T3_MODEL=gpt-5.4-mini        (optional)
// Loaded at startup; real environment variables take precedence. The file
// is gitignored on purpose — never commit keys (GitHub secret scanning
// auto-reports pushed OpenAI keys for revocation).
try {
  const envFile = fs.readFileSync(path.join(root, ".env"), "utf8");
  envFile.split("\n").forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !m[1].startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
  console.log("Loaded .env config");
} catch { /* no .env file — env vars only */ }
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

// Provider selection: PROMO_PLAN_PROVIDER=real will load the (currently
// not-implemented) real provider; default is mock. Keeps a developer hook
// to switch to true forecasting / persistence without touching the routes.
const promoPlanProvider = process.env.PROMO_PLAN_PROVIDER === "real"
  ? require("./data/promoPlanRealStore")
  : require("./data/promoPlanStore");
const dashboardProvider = require("./data/dashboardStore");

// --- Tier-3 LLM contract inference ------------------------------------
// The T1/T2 tiers are deterministic registry lookups and stay in the
// browser. Tier-3 (no registry hit) is a real fast-model call made here,
// server-side, so the API key never reaches the client. With no
// ANTHROPIC_API_KEY the endpoint reports live:false and the client falls
// back to its deterministic simulation, labeled SIMULATED in the UI.
// Provider: T3_PROVIDER=anthropic|openai, else auto-detected from which key
// is present (Anthropic preferred when both are set).
const T3_PROVIDER = process.env.T3_PROVIDER
  || (process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.OPENAI_API_KEY ? "openai" : null);
const T3_MODEL = process.env.T3_MODEL || (T3_PROVIDER === "openai" ? "gpt-5.4-mini" : "claude-haiku-4-5");
let anthropicClient = null;
let anthropicLoadError = null;
function getAnthropic() {
  if (anthropicClient || anthropicLoadError) return anthropicClient;
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    anthropicClient = new Anthropic();
  } catch (error) {
    anthropicLoadError = "@anthropic-ai/sdk not installed — run `npm install` (" + error.message + ")";
  }
  return anthropicClient;
}

function llmStatus() {
  if (!T3_PROVIDER) {
    return { live: false, provider: null, model: T3_MODEL, reason: "no ANTHROPIC_API_KEY or OPENAI_API_KEY set — tier-3 falls back to deterministic simulation" };
  }
  if (T3_PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) return { live: false, provider: T3_PROVIDER, model: T3_MODEL, reason: "T3_PROVIDER=anthropic but ANTHROPIC_API_KEY not set" };
  if (T3_PROVIDER === "openai" && !process.env.OPENAI_API_KEY) return { live: false, provider: T3_PROVIDER, model: T3_MODEL, reason: "T3_PROVIDER=openai but OPENAI_API_KEY not set" };
  if (T3_PROVIDER === "anthropic" && !getAnthropic()) return { live: false, provider: T3_PROVIDER, model: T3_MODEL, reason: anthropicLoadError };
  return { live: true, provider: T3_PROVIDER, model: T3_MODEL, reason: null };
}

// Structured-output schema for the T3 decision. The model picks an
// archetype from the registry catalog and emits entity HINTS — the
// NL2SQL pipeline's trained NER remains the entity authority downstream.
function t3Schema(archetypeIds) {
  return {
    type: "object",
    properties: {
      archetype: { type: "string", enum: archetypeIds, description: "Best-matching response archetype from the registry catalog" },
      question_class: {
        type: "string",
        enum: ["data_lookup", "diagnostic", "compound", "strategy_program", "methodology", "novel_concept"],
        description: "The NATURE of the question, judged before template choice: data_lookup = a concrete retrieval/ranking; diagnostic = asks WHY a metric moved; compound = several distinct asks; strategy_program = ONLY for enterprise-wide asks spanning MANY UNRELATED decision domains at once (pricing AND inventory AND labor AND assortment..., every SKU/store, many simultaneous objectives) — a big complex question within ONE domain is NOT a strategy_program; methodology = asks HOW TO KNOW something (causal separation, whether a decision was right) rather than for data; novel_concept = a concrete analytical ask (even a complex, constraint-laden single-domain optimization) whose core concept NO catalog template covers — the catalog includes runtime-constructed templates, so if ANY entry (e.g. a previously constructed shelf-space template) covers the concept, choose that archetype and classify by its nature (data_lookup or diagnostic), NOT novel_concept. Prefer novel_concept over strategy_program for single-domain asks"
      },
      confidence: { type: "number", description: "0-1 confidence that the chosen archetype's response template answers the question's intent" },
      entities: {
        type: "object",
        description: "Entity hints extracted from the question; null when absent",
        properties: {
          vendor: { type: ["string", "null"] },
          smic: { type: ["string", "null"] },
          division: { type: ["string", "null"] },
          period: { type: ["string", "null"], description: "Fiscal period phrase as written, e.g. 'Q3 2025', 'P4 2026', 'Promo Week 12'" },
          item: { type: ["string", "null"] },
          ncrc: { type: ["string", "null"] }
        },
        required: ["vendor", "smic", "division", "period", "item", "ncrc"],
        additionalProperties: false
      },
      needs_clarification: { type: "boolean", description: "True when a required slot cannot be resolved and guessing would risk a wrong filter" },
      clarification_question: { type: ["string", "null"], description: "The one question to ask the merchant when needs_clarification is true" },
      uncovered_concepts: {
        type: "array", items: { type: "string" },
        description: "Concepts in the question that NO archetype's data plan covers (e.g. household exclusivity, basket affinity) — these render with lineage marked not-traceable"
      }
    },
    required: ["archetype", "question_class", "confidence", "entities", "needs_clarification", "clarification_question", "uncovered_concepts"],
    additionalProperties: false
  };
}

// --- Runtime template construction -------------------------------------
// When a question falls outside every registered template, the model
// CONSTRUCTS a new one (mapped to the known tables, untraceable parts
// marked) and it is REGISTERED so subsequent similar questions resolve
// via T1/T2 instead of re-constructing. Registry grows at runtime.
const CONSTRUCTED_PATH = path.join(root, "data", "constructed-templates.json");
function readConstructed() {
  try { return JSON.parse(fs.readFileSync(CONSTRUCTED_PATH, "utf8")); } catch { return []; }
}
function writeConstructed(list) {
  fs.writeFileSync(CONSTRUCTED_PATH, JSON.stringify(list, null, 2));
}

function constructSchema(knownTables) {
  return {
    type: "object",
    properties: {
      id: { type: "string", description: "snake_case slug for the new template, e.g. shelf_space_optimization" },
      name: { type: "string", description: "Human-readable template name" },
      style: { type: "string", enum: ["list", "diagnostic", "report"] },
      intent: { type: "string", description: "One-paragraph statement of the intent family this template answers" },
      canonical_question: { type: "string", description: "A clean canonical phrasing of this question for future registry matching" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["headline", "table", "bullets", "note"] },
            title: { type: "string" },
            columns: { type: "array", items: { type: "string" }, description: "Table sections only: 3-7 column headers; first column is the row entity" },
            row_entity: { type: ["string", "null"], enum: ["item", "vendor", "store", "division", "ncrc", "category", null], description: "Table sections: what each row represents" },
            purpose: { type: "string", description: "What this section must convey (used by the narration stage and the lineage panel — never shown to the merchant)" },
            example: { type: ["string", "null"], description: "headline/bullets/note sections: the ACTUAL merchant-facing text, written as the final answer with illustrative values (e.g. 'NorCal refrigerated dairy shows 3 items at elevated out-of-stock risk...') — NEVER instructions like 'State the division...'" },
            example_rows: { type: ["array", "null"], items: { type: "array", items: { type: "string" } }, description: "table sections: 3-5 illustrative rows matching columns EXACTLY. Each row internally consistent (a recommended action must match its rationale: 'Expedite' pairs with 'projected stockout before next receipt'); impact values labeled with direction ('lost sales avoided: $73K', 'waste reduced: $12K') never bare signed numbers; entities distinct (disambiguate with pack size / flavor / UPC); no placeholder dashes" }
          },
          required: ["type", "title", "columns", "row_entity", "purpose", "example", "example_rows"],
          additionalProperties: false
        }
      },
      lineage: {
        type: "array",
        items: {
          type: "object",
          properties: {
            table: { type: "string", enum: knownTables.concat(["NOT_TRACEABLE"]), description: "One of the onboarded tables, or NOT_TRACEABLE when no onboarded table carries the concept" },
            needed_for: { type: "string" },
            columns: { type: "array", items: { type: "string" } },
            missing_feed: { type: ["string", "null"], description: "When NOT_TRACEABLE: name the feed/system that would carry this (e.g. planogram system, inventory positions)" }
          },
          required: ["table", "needed_for", "columns", "missing_feed"],
          additionalProperties: false
        }
      },
      derived: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            formula: { type: "string" },
            status: { type: "string", enum: ["registry", "computed", "gap"], description: "gap = not derivable from onboarded tables" }
          },
          required: ["name", "formula", "status"],
          additionalProperties: false
        }
      },
      gaps: {
        type: "array",
        items: {
          type: "object",
          properties: { severity: { type: "string", enum: ["low", "med", "high"] }, text: { type: "string" } },
          required: ["severity", "text"], additionalProperties: false
        }
      }
    },
    required: ["id", "name", "style", "intent", "canonical_question", "sections", "lineage", "derived", "gaps"],
    additionalProperties: false
  };
}

async function constructTemplate(body) {
  const question = String(body.question || "").slice(0, 3000);
  const knownTables = Array.isArray(body.known_tables) ? body.known_tables : [];
  const existing = Array.isArray(body.existing_templates) ? body.existing_templates : [];
  if (!question || !knownTables.length) throw new Error("question and known_tables are required");

  const system = [
    "You are the template CONSTRUCTOR for a merchant Q&A response-contract layer (grocery merchandising: divisions, vendors, SMIC categories, NCRCs, fiscal periods, promotions, allowances, AGP).",
    "A question has fallen outside every registered response template. Construct a NEW template for its intent family — not a one-off answer: the template will be REGISTERED and reused for future questions of this kind.",
    "Rules: sections define the target answer shape (headline first; 2-4 tables max; concrete column headers a merchant would act on). Lineage maps ONLY to the onboarded tables listed below — any concept they don't carry (planograms, inventory positions, labor, household data...) must be a NOT_TRACEABLE lineage row naming the missing feed, and its derived metrics must have status 'gap'. Never invent tables. The template must still render a full target-shape answer; honesty lives in the status marks.",
    "CRITICAL — the merchant sees example/example_rows, not purpose: every headline/bullets/note section MUST carry `example` written as the finished merchant answer with illustrative values (a real sentence like 'NorCal refrigerated dairy shows 3 items at elevated out-of-stock risk and 2 at overstock risk over the next 4 weeks'), never writing instructions. Every table section MUST carry `example_rows` that are internally coherent: actions match their rationales, risk tables actually rank (include rank/severity/risk-type columns when the ask is a risk ranking), impacts carry explicit direction labels, entities are distinct. purpose is for the pipeline; example is for the merchant.",
    "",
    "Onboarded tables: " + knownTables.join(", "),
    "Existing template ids (do not duplicate their intents): " + existing.join(", ")
  ].join("\n");

  const started = Date.now();
  if (T3_PROVIDER === "openai") {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: T3_MODEL,
        reasoning_effort: "low",
        max_completion_tokens: 4500,
        messages: [{ role: "system", content: system }, { role: "user", content: "Construct the template for:\n" + question }],
        response_format: { type: "json_schema", json_schema: { name: "constructed_template", strict: true, schema: constructSchema(knownTables) } }
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(data.error && data.error.message) || "request failed"}`);
    const parsed = JSON.parse(data.choices[0].message.content);
    return { ...parsed, _meta: { provider: "openai", model: data.model, latency_ms: Date.now() - started, input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens } };
  }
  const response = await getAnthropic().messages.create({
    model: T3_MODEL,
    max_tokens: 3000,
    system,
    output_config: { format: { type: "json_schema", schema: constructSchema(knownTables) } },
    messages: [{ role: "user", content: "Construct the template for:\n" + question }]
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const parsed = JSON.parse(textBlock ? textBlock.text : "{}");
  return { ...parsed, _meta: { provider: "anthropic", model: response.model, latency_ms: Date.now() - started, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } };
}

async function t3Resolve(body) {
  const question = String(body.question || "").slice(0, 2000);
  const catalog = Array.isArray(body.archetype_catalog) ? body.archetype_catalog : [];
  const fewShot = Array.isArray(body.few_shot) ? body.few_shot.slice(0, 3) : [];
  if (!question || !catalog.length) throw new Error("question and archetype_catalog are required");
  const archetypeIds = catalog.map((a) => String(a.id));

  const system = [
    "You are the tier-3 intent-inference stage of a merchant Q&A response-contract layer for a grocery merchandising intelligence platform (divisions, vendors, SMIC categories, fiscal periods, promotions, allowances, AGP profit).",
    "The question missed the exact-match and nearest-neighbor registry tiers. Your job: pick the ONE archetype from the catalog whose response template best answers the question's intent, extract entity hints, and flag any concepts no archetype covers.",
    "Rules: never force-fit — classify question_class FIRST. A strategy_program (broad multi-domain optimization: 'every SKU in every store', many simultaneous objectives, long horizons) or a methodology question ('how do we know…', 'was it the right decision', separating causal effects) must NOT be mapped onto a data template as if it were a lookup — the router will send those to honest scope/measurement-design templates. If core concepts (household/loyalty analysis, basket affinity, penetration, switching) are outside every archetype's data plan, list them in uncovered_concepts. If a required slot (e.g. which vendor, which period) is genuinely unresolvable and matters, set needs_clarification. Entities are HINTS only — a downstream NER pipeline is authoritative.",
    "",
    "Archetype catalog:",
    ...catalog.map((a) => `- ${a.id}: ${a.intent || a.name || ""}`)
  ].join("\n");

  const examples = fewShot.length
    ? "Nearest registry questions (few-shot context — these resolved to the archetypes shown):\n" +
      fewShot.map((f) => `Q: ${f.question}\n→ archetype: ${f.archetype}`).join("\n\n") + "\n\n"
    : "";

  const userContent = examples + "Merchant question:\n" + question;
  const started = Date.now();

  if (T3_PROVIDER === "openai") {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: T3_MODEL,
        reasoning_effort: "none",
        max_completion_tokens: 1024,
        messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
        response_format: { type: "json_schema", json_schema: { name: "t3_decision", strict: true, schema: t3Schema(archetypeIds) } }
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(data.error && data.error.message) || "request failed"}`);
    const parsed = JSON.parse(data.choices[0].message.content);
    return {
      ...parsed,
      _meta: {
        provider: "openai",
        model: data.model,
        latency_ms: Date.now() - started,
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
        stop_reason: data.choices[0].finish_reason
      }
    };
  }

  const response = await getAnthropic().messages.create({
    model: T3_MODEL,
    max_tokens: 1024,
    system,
    output_config: { format: { type: "json_schema", schema: t3Schema(archetypeIds) } },
    messages: [{ role: "user", content: userContent }]
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const parsed = JSON.parse(textBlock ? textBlock.text : "{}");
  return {
    ...parsed,
    _meta: {
      provider: "anthropic",
      model: response.model,
      latency_ms: Date.now() - started,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      stop_reason: response.stop_reason
    }
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function loadFixture() {
  const fixturePath = path.join(root, "data", "dashboard-fixtures.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function searchToObject(url) {
  const out = {};
  for (const [k, v] of url.searchParams.entries()) out[k] = v;
  return out;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/llm/status" && request.method === "GET") {
    sendJson(response, 200, llmStatus());
    return;
  }

  if (url.pathname === "/api/llm/t3-resolve" && request.method === "POST") {
    const status = llmStatus();
    if (!status.live) {
      sendJson(response, 503, { error: status.reason });
      return;
    }
    readJsonBody(request).then(async (body) => {
      try {
        sendJson(response, 200, await t3Resolve(body));
      } catch (error) {
        sendJson(response, 502, { error: error.message });
      }
    });
    return;
  }

  if (url.pathname === "/api/registry/constructed" && request.method === "GET") {
    sendJson(response, 200, readConstructed());
    return;
  }

  if (url.pathname === "/api/registry/constructed" && request.method === "POST") {
    readJsonBody(request).then((body) => {
      try {
        if (!body || !body.id || !body.name || !Array.isArray(body.sections)) throw new Error("invalid template shape");
        // UPSERT by id: first registration appends; a re-post with the same id
        // replaces the stored spec (schema-evolution upgrades re-construct old
        // specs under their original id — the registry must accept the newer
        // version, keeping the original registration timestamp).
        const list = readConstructed();
        const at = list.findIndex((t) => t.id === body.id);
        if (at >= 0) list[at] = { ...body, registered_at: list[at].registered_at, upgraded_at: new Date().toISOString() };
        else list.push({ ...body, registered_at: new Date().toISOString() });
        writeConstructed(list);
        sendJson(response, 200, { registered: true, count: list.length });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
    });
    return;
  }

  if (url.pathname === "/api/llm/construct-template" && request.method === "POST") {
    const status = llmStatus();
    if (!status.live) {
      sendJson(response, 503, { error: status.reason });
      return;
    }
    readJsonBody(request).then(async (body) => {
      try {
        sendJson(response, 200, await constructTemplate(body));
      } catch (error) {
        sendJson(response, 502, { error: error.message });
      }
    });
    return;
  }

  if (url.pathname === "/dashboard-ui/api/get-categories" && request.method === "GET") {
    const fixture = loadFixture();
    sendJson(response, 200, fixture.responses.categories);
    return;
  }

  if (url.pathname === "/dashboard-ui/api/category-sales" && request.method === "POST") {
    readJsonBody(request).then((body) => {
      const fixture = loadFixture();
      const screenName = body.screen_name || "";
      const cardName = body.kpi_card_name || "";
      let responseKey = "categoryOverview";

      if (screenName === "product_trends_upc_performance_data" || cardName === "UPC_performance_data") {
        responseKey = "upcPerformance";
      } else if (screenName === "fiscal_vendor_level_display") {
        responseKey = "vendorPerformance";
      }

      sendJson(response, 200, {
        ...fixture.responses[responseKey],
        cache_status: "loaded from local API endpoint",
        request_echo: body
      });
    });
    return;
  }

  // --- 52-week promotional plan -----------------------------------------
  // Dashboard bootstrap — everything the dashboard's static widgets
  // need in one call. Moved out of inline constants in the browser-side
  // JS so the views render purely from API output.
  if (url.pathname === "/api/dashboard/bootstrap" && request.method === "GET") {
    try {
      const data = dashboardProvider.getDashboardBootstrap();
      sendJson(response, 200, { data });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/promo-plan" && request.method === "GET") {
    try {
      const filters = searchToObject(url);
      if (filters.divisions) filters.divisions = filters.divisions.split(",").map((s) => s.trim()).filter(Boolean);
      const data = promoPlanProvider.getPromoPlan(filters);
      sendJson(response, 200, { data });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  // --- Promotion Detail Screen endpoints --------------------------------
  if (url.pathname === "/api/promotion-detail/options" && request.method === "GET") {
    try {
      const data = promoPlanProvider.getPromotionDetailOptions(searchToObject(url));
      sendJson(response, 200, { data });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/promotion-detail/worklist" && request.method === "GET") {
    try {
      const data = promoPlanProvider.getPromotionDetailWorklist(searchToObject(url));
      sendJson(response, 200, { data });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/promotion-detail" && request.method === "GET") {
    try {
      const data = promoPlanProvider.getPromotionDetail(searchToObject(url));
      sendJson(response, 200, { data });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/promotion-detail/confirm" && request.method === "POST") {
    readJsonBody(request).then((body) => {
      try {
        const data = promoPlanProvider.confirmPromotion(body);
        sendJson(response, 200, { data });
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
    });
    return;
  }

  if (url.pathname === "/api/promotion-detail/override" && request.method === "POST") {
    readJsonBody(request).then((body) => {
      try {
        const data = promoPlanProvider.overrideForecast(body);
        sendJson(response, 200, { data });
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
    });
    return;
  }

  const requestPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestPath).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  });
});

server.listen(port, () => {
  console.log(`Merchandising dashboard running at http://localhost:${port} (promo-plan provider: ${promoPlanProvider.source})`);
});
