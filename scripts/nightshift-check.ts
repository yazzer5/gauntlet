// Checks the Meterless Nightshift runtime: auth, model discovery, and one real completion per lane.
// Prints which model actually answered, so you can confirm the Nemotron lanes are pinned.
import { config, loadEnv } from "../src/config.ts";
import { chat, listModels } from "../src/llm/nightshift.ts";

loadEnv();
const c = config().meterless;
async function main() {
  console.log(`Nightshift runtime: ${c.baseUrl}  (token ${c.token ? "set" : "MISSING"})`);
  try {
    const models = await listModels();
    console.log(`PASS GET /models -> ${models.length} models`);
    for (const m of models) console.log(`     ${m}${/nemotron/i.test(m) ? "   <- Nemotron" : ""}`);
  } catch (e) {
    console.log(`FAIL GET /models: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const lane of ["fast", "deep"] as const) {
    try {
      const r = await chat([{ role: "user", content: 'Reply with the JSON {"ok":true} and nothing else.' }], lane, { maxTokens: 400 });
      console.log(`PASS ${lane} lane: asked ${lane === "fast" ? c.fastModel : c.deepModel}, answered by ${r.model} in ${r.ms} ms: ${r.text.replace(/\s+/g, " ").slice(0, 80)}`);
      if (!/nemotron/i.test(r.model)) console.log(`     note: answering model is not Nemotron. Pin METERLESS_MODEL_${lane.toUpperCase()} to a Nemotron id from the list above.`);
    } catch (e) {
      console.log(`FAIL ${lane} lane: ${(e as Error).message}`);
    }
  }
}
main();
