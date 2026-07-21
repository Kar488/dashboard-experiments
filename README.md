# dashboard-experiments

## Merchant Q&A chat prototype (`chat.html`)

Run `npm install && npm start`, then open `http://localhost:5173/chat.html`.

### Tier-3 live LLM inference

The intent cascade is T1 registry exact-match → T2 nearest-neighbor → T3 fast-model
contract inference. T1/T2 are deterministic registry lookups. **T3 is a real LLM
call** made server-side (`/api/llm/t3-resolve`): the question, the 3 nearest registry
questions (few-shot), and the archetype catalog go to Claude with a structured-output
JSON schema; the model returns the archetype choice, entity hints, uncovered concepts,
and clarification holds.

- Enable it (either provider — keys stay server-side, never in the browser).
  **Easiest: create a `.env` file next to `server.js`** (one-time; copy
  `.env.example` and paste your key) — the server auto-loads it on `npm start`:
  - `OPENAI_API_KEY=sk-proj-...` → `gpt-5.4-mini` (reasoning_effort none)
  - `ANTHROPIC_API_KEY=sk-ant-...` → `claude-haiku-4-5`
  - `.env` is gitignored — NEVER commit keys (GitHub secret scanning
    auto-reports pushed OpenAI keys for revocation). Environment variables
    still work and take precedence over `.env`.
- Override with `T3_MODEL=...` and/or `T3_PROVIDER=anthropic|openai` (Anthropic
  wins when both keys are set)
- Without a key the tier falls back to a deterministic simulation, labeled
  **SIMULATED** in the pipeline stages and the lineage/debug panel — it never
  pretends to be a live call.
- Never commit keys; pass them as environment variables only.

### NL2SQL hint

Every contract's `data_plan` now carries a `sql_hint`: a SQL skeleton generated
**deterministically** (no model) from the archetype's lineage — join predicates on
shared keys verified against `table_schema_1.json`, metric expressions from the
metric dictionary, fiscal predicates from the time registry, entity filters from
the resolved hints. Metrics/tables with `not_traceable` status render as
`-- NOT TRACEABLE YET` comments instead of silently disappearing. It renders in
the lineage/debug panel and is a *pre-scope hint* for the custom NL2SQL layer's
table+join resolver (§22), which remains authoritative.

Deterministic guards (compound-question decomposition, concept-coverage,
clarification hold) run before the LLM and stay code-side: they are policy, not
inference. Response *data* is seeded mock throughout — in production the data plan
executes through the custom NL2SQL pipeline (§22), not this layer.

### Evals

`evals/pressure-test.js` renders all 133 canonical questions + adversarial
variations through the live page and applies the deterministic judge
(`evals/report.md` is the scorecard). It runs key-less (simulated T3), so results
are deterministic in CI.
