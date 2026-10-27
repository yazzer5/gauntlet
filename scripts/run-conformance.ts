// Runs the upstream Meterless conformance suites against the exact engine code Gauntlet imports.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const suites = [
  { name: "World Model (evidence board)", runner: "vendor/meterless/world-model/conformance/runner.ts", env: "WORLD_MODEL_IMPL", impl: "vendor/meterless/world-model/src/index.ts" },
  { name: "H-MEM (investigation memory)", runner: "vendor/meterless/hmem/conformance/runner.ts", env: "HMEM_IMPL", impl: "vendor/meterless/hmem/src/index.ts" },
];
let failed = 0;
for (const s of suites) {
  console.log(`\n=== Meterless conformance: ${s.name}`);
  const impl = join(root, s.impl).replace(/\\/g, "/");
  const r = spawnSync(process.execPath, ["--import", "tsx", join(root, s.runner)], { stdio: "inherit", env: { ...process.env, [s.env]: impl } });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} conformance suite(s) FAILED` : "\nAll Meterless conformance suites passed");
process.exit(failed ? 1 : 0);
