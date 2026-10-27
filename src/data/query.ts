// Every agent data read goes through Zetaris: POST {ZETARIS_REST_URL}/sql-editor/sqls/run.
// Live results (and errors) are recorded to cassettes/zetaris.json so SAMPLE_MODE replays the
// exact rows Zetaris returned, with no stack. Repeated identical SQL within a process is served
// from an in-process cache and labelled "zetaris-cache" (the data is static).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.ts";
import { zetarisRun } from "./zetaris.ts";

export interface QueryOut { sql: string; ok: boolean; rows: unknown[]; error?: string; ms: number; source: "zetaris" | "zetaris-cache" | "cassette"; requestId?: string }
interface Entry { ok: boolean; rows: unknown[]; error?: string; ms: number }

const file = () => join(process.cwd(), process.env.GAUNTLET_CASSETTE_DIR ?? "cassettes", "zetaris.json");
let store: Record<string, Entry> | undefined;
let dirty = false;
const inflight = new Map<string, Promise<Entry>>();
function load() {
  if (!store) store = existsSync(file()) ? JSON.parse(readFileSync(file(), "utf8")) : {};
  return store!;
}
export function saveZetarisCassette(): void {
  if (!dirty) return;
  mkdirSync(join(file(), ".."), { recursive: true });
  writeFileSync(file(), JSON.stringify(load()));
  dirty = false;
}
const norm = (sql: string) => sql.trim().replace(/;\s*$/, "").replace(/\s+/g, " ");

export async function runSql(sql: string, maxRows = 60): Promise<QueryOut> {
  const k = norm(sql);
  const live = !config().sampleMode && !!config().zetaris.apiKey;
  if (!live) {
    const hit = load()[k];
    if (!hit) return { sql: k, ok: false, rows: [], error: "not in Zetaris cassette (sample mode)", ms: 0, source: "cassette" };
    return { sql: k, ...hit, source: "cassette" };
  }
  if (load()[k]) return { sql: k, ...load()[k], source: "zetaris-cache" };
  let p = inflight.get(k);
  const first = !p;
  if (!p) {
    p = (async (): Promise<Entry> => {
      const t0 = Date.now();
      try {
        const r = await zetarisRun(k, maxRows);
        return { ok: true, rows: (r.rows as unknown[]).slice(0, maxRows), ms: r.ms };
      } catch (e) {
        return { ok: false, rows: [], error: (e as Error).message.slice(0, 300), ms: Date.now() - t0 };
      }
    })();
    inflight.set(k, p);
  }
  const e = await p;
  if (first) {
    load()[k] = e; dirty = true;
    console.log(`  [zetaris] ${e.ok ? "ok" : "ERR"} ${e.ms}ms rows=${e.rows.length} :: ${k.slice(0, 110)}`);
  }
  return { sql: k, ...e, source: first ? "zetaris" : "zetaris-cache" };
}
