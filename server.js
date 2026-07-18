const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 5173);
const root = __dirname;
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
const T3_MODEL = process.env.T3_MODEL || "claude-haiku-4-5";
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
  if (!process.env.ANTHROPIC_API_KEY) {
    return { live: false, model: T3_MODEL, reason: "ANTHROPIC_API_KEY not set — tier-3 falls back to deterministic simulation" };
  }
  if (!getAnthropic()) return { live: false, model: T3_MODEL, reason: anthropicLoadError };
  return { live: true, model: T3_MODEL, reason: null };
}

// Structured-output schema for the T3 decision. The model picks an
// archetype from the registry catalog and emits entity HINTS — the
// NL2SQL pipeline's trained NER remains the entity authority downstream.
function t3Schema(archetypeIds) {
  return {
    type: "object",
    properties: {
      archetype: { type: "string", enum: archetypeIds, description: "Best-matching response archetype from the registry catalog" },
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
    required: ["archetype", "confidence", "entities", "needs_clarification", "clarification_question", "uncovered_concepts"],
    additionalProperties: false
  };
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
    "Rules: never force-fit — if core concepts (household/loyalty-level analysis, basket affinity, penetration, switching) are outside every archetype's data plan, list them in uncovered_concepts and pick the closest structural archetype anyway. If a required slot (e.g. which vendor, which period) is genuinely unresolvable and matters to the answer, set needs_clarification. Entities are HINTS only — a downstream NER pipeline is authoritative.",
    "",
    "Archetype catalog:",
    ...catalog.map((a) => `- ${a.id}: ${a.intent || a.name || ""}`)
  ].join("\n");

  const examples = fewShot.length
    ? "Nearest registry questions (few-shot context — these resolved to the archetypes shown):\n" +
      fewShot.map((f) => `Q: ${f.question}\n→ archetype: ${f.archetype}`).join("\n\n") + "\n\n"
    : "";

  const started = Date.now();
  const response = await getAnthropic().messages.create({
    model: T3_MODEL,
    max_tokens: 1024,
    system,
    output_config: { format: { type: "json_schema", schema: t3Schema(archetypeIds) } },
    messages: [{ role: "user", content: examples + "Merchant question:\n" + question }]
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const parsed = JSON.parse(textBlock ? textBlock.text : "{}");
  return {
    ...parsed,
    _meta: {
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
