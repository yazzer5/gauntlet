# Pre-existing components

Built during the hackathon: the Gauntlet data plane (schema, canaries, planted injections, role-separated
databases), the agent under test and its defences, the canary oracle, the attack library, the evaluation runner,
the server and the UI.

Reused:
- `vendor/meterless/` — upstream Meterless World Model and H-MEM reference implementations and their conformance
  suites, unmodified (see `vendor/meterless/UPSTREAM_COMMIT` and `LICENSE`).
- From the author's own SpikeTrace entry (same hackathon): `src/config.ts` (env loader), `src/data/zetaris.ts`
  (Zetaris REST client), `src/llm/nightshift.ts` (Nightshift client with retries and Nemotron fallback),
  `scripts/run-conformance.ts`, `scripts/nightshift-check.ts`, and the Zetaris registration script pattern.
- Third-party: Postgres 16 (Docker), tsx, TypeScript, Vitest.
