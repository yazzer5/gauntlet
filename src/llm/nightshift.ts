// Meterless Nightshift client: Gauntlet's primary AI provider.
// OpenAI-compatible Runtime contract (from the Meterless POWER prompt):
//   Authorization: Bearer <runtime token>, meterless-app, meterless-scope: user,
//   GET /v1/models for discovery, POST /v1/chat/completions for inference.
// Every call is logged with the lane, the model we asked for and the model that actually answered.
import { config } from "../config.ts";

export type Lane = "fast" | "deep";

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

export interface LlmCallLog {
  tag: string; // e.g. planner, investigator:wind_drought#1, critic#1
  lane: Lane;
  requestedModel: string;
  answeredBy: string; // model id returned by Nightshift (or cassette/heuristic)
  provider: "nightshift" | "cassette" | "heuristic";
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
  attempt: number;
  error?: string;
}

export class NightshiftError extends Error {}

function headers(): Record<string, string> {
  const c = config().meterless;
  return {
    Authorization: `Bearer ${c.token}`,
    "Content-Type": "application/json",
    "meterless-app": c.app,
    "meterless-scope": "user",
  };
}

export async function listModels(): Promise<string[]> {
  const c = config().meterless;
  if (!c.token) throw new NightshiftError("METERLESS_RUNTIME_TOKEN is not set (.env)");
  const res = await fetch(`${c.baseUrl}/models`, { headers: headers(), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new NightshiftError(`GET /models -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  return (body.data ?? []).map((m) => m.id);
}

export function modelForLane(lane: Lane): string {
  const c = config().meterless;
  return lane === "deep" ? c.deepModel : c.fastModel;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nemotron fallback chain per lane: pinned model first, then smaller Nemotron models. */
export function modelChain(lane: Lane): string[] {
  const c = config().meterless;
  const fallback = (process.env.METERLESS_MODEL_FALLBACK ?? "nvidia/nemotron-3.5-bolt-e4b").split(",").map((x) => x.trim()).filter(Boolean);
  return [...new Set([modelForLane(lane), ...(lane === "deep" ? [c.fastModel] : []), ...fallback])];
}

async function callOnce(model: string, messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number }) {
  const c = config().meterless;
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.2, max_tokens: opts.maxTokens ?? 1500, stream: false }),
      signal: AbortSignal.timeout(c.timeoutMs),
    });
  } catch (e) {
    throw Object.assign(new NightshiftError(`Cannot reach Nightshift at ${c.baseUrl}: ${(e as Error).message}`), { retryable: true });
  }
  const raw = await res.text();
  if (!res.ok) throw Object.assign(new NightshiftError(`Nightshift HTTP ${res.status} (${model}): ${raw.slice(0, 200)}`), { retryable: res.status === 429 || res.status >= 500 });
  let body: { model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  try {
    body = JSON.parse(raw);
  } catch {
    throw Object.assign(new NightshiftError(`Nightshift returned non-JSON: ${raw.slice(0, 200)}`), { retryable: true });
  }
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw Object.assign(new NightshiftError(`Nightshift returned an empty completion (${model})`), { retryable: true });
  return { text, model: body.model ?? model, ms: Date.now() - t0, usage: body.usage };
}

/**
 * One logical model call. Transient failures (429/5xx/timeouts) are retried with backoff on the pinned
 * Nemotron model, then fall through the lane's Nemotron fallback chain. `onRetry` reports each failed hop.
 */
export async function chat(
  messages: ChatMessage[],
  lane: Lane,
  opts: { maxTokens?: number; temperature?: number; onRetry?: (model: string, error: string) => void } = {},
): Promise<{ text: string; model: string; ms: number; usage?: { prompt_tokens?: number; completion_tokens?: number }; hops: number }> {
  const c = config().meterless;
  if (!c.token) throw new NightshiftError("METERLESS_RUNTIME_TOKEN is not set (.env)");
  let hops = 0;
  let last: unknown;
  for (const model of modelChain(lane)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await callOnce(model, messages, opts);
        return { ...r, hops };
      } catch (e) {
        last = e;
        hops++;
        opts.onRetry?.(model, (e as Error).message);
        if (!(e as { retryable?: boolean }).retryable) break;
        await sleep(1500 * (attempt + 1) + Math.random() * 500);
      }
    }
  }
  throw last instanceof Error ? last : new NightshiftError(String(last));
}

/** Strip reasoning blocks and pull the first balanced JSON object out of a model reply. */
export function extractJson<T = unknown>(text: string): T {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) throw new Error("no JSON object in model reply");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1)) as T;
    }
  }
  throw new Error("unbalanced JSON object in model reply");
}
