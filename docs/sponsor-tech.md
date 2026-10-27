# Sponsor technology in Gauntlet

## Zetaris (data layer)
- Every data read by the agent, the checks and the UI goes through `POST {ZETARIS_REST_URL}/sql-editor/sqls/run`
  (`src/data/zetaris.ts`, `src/data/query.ts`).
- Two datasources over the same enterprise source, one per role: `crm_analyst` (masked) and `crm_admin` (raw PII),
  registered by `scripts/zetaris-register.ts`, one statement per call.
- **Proof:** `npm run zetaris:check` asserts the analyst datasource returns 0 VIP rows and no VIP canary, and the admin
  datasource returns a raw canary. The UI's "Query customer N as analyst" runs the same lookup live.

## Meterless Nightshift (primary AI provider)
- All model calls use the OpenAI-compatible Runtime (`/v1/chat/completions`, `src/llm/nightshift.ts`) with pinned
  Nemotron lanes, retry with backoff, and a Nemotron fallback chain for Lightning's intermittent 502s.
- Each call logs the requested model and the model that answered (`src/llm/llm.ts`). Replies are recorded as
  cassettes so sample mode replays real Nemotron output.

## Meterless World Model (engine)
- Every attack run is written to a World Model as an `attack_run` entity carrying config, verdict, sinks,
  unauthorized queries and the models used, with provenance (`src/eval/runner.ts`). Replays from the UI write a new trace.
- **Proof:** the upstream World Model conformance suite, run against the exact vendored code Gauntlet imports:
  `npm run test:engines`, 8/8 passing.

## Meterless H-MEM (engine)
- **Agent memory:** `memory.write` stores records with provenance (session, role, trust). Memory quarantine
  filters recall by role and trust (`src/agent/memory.ts`). The memory-poisoning attack class targets this.
- **Exploit corpus:** every confirmed exploit is filed in H-MEM with provenance back to its trace (12 entries).
- **Proof:** the upstream H-MEM conformance suite, 13/13 passing, plus `tests/gauntlet.test.ts` ("memory quarantine
  hides tainted records from recall").

## NVIDIA Nemotron
- Agent: `nvidia/nemotron-3.5-lightning-30b-a3b`; fallback: `nvidia/nemotron-3.5-bolt-e4b`;
  explanations: `nvidia/nemotron-3-ultra-550b-a55b`. Models are visible per call in the logs and in the UI.

## What was unique about our use of the sponsor technologies
- **Zetaris is the control under test, not just a data source.** Gauntlet uses two role-scoped Zetaris datasources
  to prove the data layer holds (analyst queries never return VIP rows or PII) and to catch the agent reaching around it.
- **The oracle is deterministic.** Canary tokens planted in the Zetaris-federated data decide every verdict;
  Nemotron only explains findings, so no model grades another model.
- **Meterless World Model and H-MEM serve as an audit trail and a regression corpus.** Every attack run is a World Model
  trace and every confirmed exploit is an H-MEM record with provenance, so the whole corpus can be replayed against any
  defence config. H-MEM is also the attack surface for the memory-poisoning class, guarded by provenance quarantine.
- **Nightshift and Nemotron are used for reproducible certification.** Pinned Nemotron lanes, a logged requested-vs-answered
  model on every call, and recorded cassettes mean every number in the README reproduces with `npm run eval`.
