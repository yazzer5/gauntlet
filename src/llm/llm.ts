// Gauntlet's model gateway. Live: Meterless Nightshift (OpenAI-compatible Runtime) with pinned
// Nemotron lanes + retry/fallback chain, recording every reply into cassettes/llm.json.
// SAMPLE_MODE: replays the exact recorded reply for the exact prompt (keyed by hash), no network.
// Every call is logged with the lane, the model requested and the model that actually answered.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.ts";
import { chat, extractJson, type ChatMessage, type Lane } from "./nightshift.ts";

export interface LlmLog {
  tag: string; lane: Lane; requested: string; answeredBy: string; provider: "nightshift" | "cassette";
  ms: number; promptTokens?: number; completionTokens?: number; hops?: number; error?: string;
}
interface Entry { model: string; text: string; ms: number; usage?: { prompt_tokens?: number; completion_tokens?: number } }

const file = () => join(process.cwd(), process.env.GAUNTLET_CASSETTE_DIR ?? "cassettes", "llm.json");
let store: Record<string, Entry> | undefined;
let dirty = false;
function load(): Record<string, Entry> {
  if (!store) store = existsSync(file()) ? JSON.parse(readFileSync(file(), "utf8")) : {};
  return store!;
}
export function isLive(): boolean {
  const c = config();
  return !c.sampleMode && !!c.meterless.token;
}
export function saveLlmCassette(): void {
  if (!dirty) return;
  mkdirSync(join(file(), ".."), { recursive: true });
  writeFileSync(file(), JSON.stringify(load()));
  dirty = false;
}
function key(lane: Lane, messages: ChatMessage[]): string {
  const c = config().meterless;
  const model = lane === "deep" ? c.deepModel : c.fastModel;
  return createHash("sha256").update(JSON.stringify({ model, lane, messages })).digest("hex").slice(0, 32);
}

export class CassetteMiss extends Error {}

/** Ask for a JSON object. Throws on unrecoverable failure (caller marks the run as errored). */
export async function askJson<T>(tag: string, lane: Lane, messages: ChatMessage[], validate: (v: T) => string | null, logs: LlmLog[]): Promise<T> {
  const k = key(lane, messages);
  const requested = config().meterless[lane === "deep" ? "deepModel" : "fastModel"];
  if (!isLive()) {
    const hit = load()[k];
    if (!hit) throw new CassetteMiss(`no recorded reply for ${tag} (run live once to record)`);
    logs.push({ tag, lane, requested: hit.model, answeredBy: hit.model, provider: "cassette", ms: hit.ms, promptTokens: hit.usage?.prompt_tokens, completionTokens: hit.usage?.completion_tokens });
    return extractJson<T>(hit.text);
  }
  if (process.env.GAUNTLET_REUSE === "1" && load()[k]) {
    const hit = load()[k];
    logs.push({ tag, lane, requested: hit.model, answeredBy: hit.model, provider: "cassette", ms: hit.ms, promptTokens: hit.usage?.prompt_tokens, completionTokens: hit.usage?.completion_tokens });
    return extractJson<T>(hit.text);
  }
  const convo = [...messages];
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await chat(convo, lane, { maxTokens: 1200, temperature: 0.2 });
    logs.push({ tag, lane, requested, answeredBy: r.model, provider: "nightshift", ms: r.ms, promptTokens: r.usage?.prompt_tokens, completionTokens: r.usage?.completion_tokens, hops: r.hops });
    console.log(`  [llm] ${tag} lane=${lane} requested=${requested} answeredBy=${r.model} ${r.ms}ms hops=${r.hops}`);
    try {
      const v = extractJson<T>(r.text);
      const err = validate(v);
      if (!err) {
        load()[k] = { model: r.model, text: r.text, ms: r.ms, usage: r.usage };
        dirty = true;
        return v;
      }
      lastErr = err;
    } catch (e) { lastErr = (e as Error).message; }
    convo.push({ role: "assistant", content: r.text.slice(0, 3000) });
    convo.push({ role: "user", content: `That reply was unusable (${lastErr}). Return ONLY the corrected JSON object.` });
  }
  throw new Error(`model reply unusable after repair: ${lastErr}`);
}
