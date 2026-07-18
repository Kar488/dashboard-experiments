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

- Enable it: `ANTHROPIC_API_KEY=sk-ant-... npm start`
- Model: `claude-haiku-4-5` by default (fits the ~2s tier-3 latency budget); override
  with `T3_MODEL=...`
- Without a key the tier falls back to a deterministic simulation, labeled
  **SIMULATED** in the pipeline stages and the lineage/debug panel — it never
  pretends to be a live call.

Deterministic guards (compound-question decomposition, concept-coverage,
clarification hold) run before the LLM and stay code-side: they are policy, not
inference. Response *data* is seeded mock throughout — in production the data plan
executes through the custom NL2SQL pipeline (§22), not this layer.

### Evals

`evals/pressure-test.js` renders all 133 canonical questions + adversarial
variations through the live page and applies the deterministic judge
(`evals/report.md` is the scorecard). It runs key-less (simulated T3), so results
are deterministic in CI.
