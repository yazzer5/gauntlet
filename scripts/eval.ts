// Runs the full Gauntlet evaluation and writes runs/eval-<ts>.json + a console summary.
// Live (SAMPLE_MODE=false): hits Zetaris + Nemotron and records cassettes. Sample: replays them.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, config } from "../src/config.ts";
import { runEval } from "../src/eval/runner.ts";
import { saveLlmCassette } from "../src/llm/llm.ts";
import { saveZetarisCassette } from "../src/data/query.ts";

loadEnv();
const names = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const configs = names.length ? names : ["v0", "v1", "v2"];

function pct(x: number) { return `${(x * 100).toFixed(0)}%`; }

async function main() {
  const c = config();
  console.log(`Gauntlet eval — mode=${c.sampleMode ? "SAMPLE (replay)" : "LIVE"} configs=${configs.join(",")}`);
  const rep = await runEval(configs);
  saveLlmCassette(); saveZetarisCassette();

  console.log("\n================ RESULTS ================");
  console.log("Attack success rate (lower is better):");
  for (const cls of Object.keys(rep.summary.asrByClassConfig)) {
    const row = rep.summary.asrByClassConfig[cls];
    console.log(`  ${cls.padEnd(20)} ` + configs.map((n) => `${n}=${row[n].leaked}/${row[n].total} (${pct(row[n].rate)})${(row[n] as any).errors ? ` [${(row[n] as any).errors} err]` : ""}`).join("   "));
  }
  console.log("  " + "OVERALL".padEnd(20) + " " + configs.map((n) => `${n}=${rep.summary.asrByConfig[n].leaked}/${rep.summary.asrByConfig[n].total} (${pct(rep.summary.asrByConfig[n].rate)})${(rep.summary.asrByConfig[n] as any).errors ? ` [${(rep.summary.asrByConfig[n] as any).errors} err]` : ""}`).join("   "));
  console.log("\nUnauthorized access (executed query on a non-entitled datasource; lower is better):");
  console.log("  " + configs.map((n) => { const x = rep.summary.asrByConfig[n] as any; return `${n}=${x.unauthorized}/${x.total} (${pct(x.unauthorizedRate)})`; }).join("   "));
  console.log("\nBenign-task utility (higher is better):");
  console.log("  " + configs.map((n) => `${n}=${rep.summary.utilityByConfig[n].ok}/${rep.summary.utilityByConfig[n].total} (${pct(rep.summary.utilityByConfig[n].rate)})${(rep.summary.utilityByConfig[n] as any).errors ? ` [${(rep.summary.utilityByConfig[n] as any).errors} err]` : ""}`).join("   "));
  console.log(`\nNemotron models seen: ${rep.summary.modelsSeen.join(", ") || "(none — cassette/replay)"}`);
  console.log(`Known-exploit corpus: ${rep.summary.corpusSize}`);

  mkdirSync(join(process.cwd(), "runs"), { recursive: true });
  const file = join(process.cwd(), "runs", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(rep, null, 2));
  writeFileSync(join(process.cwd(), "runs", "latest.json"), JSON.stringify(rep, null, 2));
  console.log(`\nWrote ${file}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
