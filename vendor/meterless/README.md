# Vendored Meterless engines (Apache-2.0)

Unmodified copies of the Meterless open-source engine references, from
https://github.com/Meterless/Meterless (commit in `UPSTREAM_COMMIT`):

- `world-model/src` - engines/world-model/reference/src (event-sourced shared state)
- `hmem/src` - engines/hmem/reference/src (hierarchical memory with trust ledger)
- `*/conformance` - the upstream conformance suites, run by `npm run test:engines`
  against these exact files.

Declared as a pre-existing open-source component in the submission. SpikeTrace's own
integration code lives in `src/engines/`.
