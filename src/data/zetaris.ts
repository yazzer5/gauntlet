// Zetaris REST client. Every agent data access goes through here (live mode):
// POST {ZETARIS_REST_URL}/sql-editor/sqls/run, one statement per call.
import { randomUUID } from "node:crypto";
import { config } from "../config.ts";

export class ZetarisError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface ZetarisResult {
  rows: unknown[][] | Record<string, unknown>[];
  ms: number;
  requestId: string;
}

export async function zetarisRun(sql: string, limit = 5000): Promise<ZetarisResult> {
  const c = config().zetaris;
  if (!c.apiKey) throw new ZetarisError("ZETARIS_API_KEY is not set (.env)");
  const statement = sql.trim().replace(/;\s*$/, ""); // Lightning: no trailing semicolon
  const requestId = randomUUID();
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${c.url}/sql-editor/sqls/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.apiKey}`,
        "X-Org-ID": c.orgId,
        "X-Request-ID": requestId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ queryId: randomUUID(), sql: statement, source: "SqlEditor", limit }),
      signal: AbortSignal.timeout(c.timeoutMs),
    });
  } catch (e) {
    throw new ZetarisError(`Cannot reach Zetaris at ${c.url}: ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 ? " (bad or expired API key)" : res.status === 400 ? " (check X-Org-ID / SQL syntax)" : "";
    throw new ZetarisError(`Zetaris HTTP ${res.status}${hint}: ${text.slice(0, 300)}`, res.status);
  }
  let body: unknown;
  try {
    body = JSON.parse(text || "null");
  } catch {
    throw new ZetarisError(`Zetaris returned non-JSON: ${text.slice(0, 200)}`);
  }
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    const msg = (body as { message?: string; error?: string })?.message ?? (body as { error?: string })?.error;
    throw new ZetarisError(`Zetaris query returned no data array${msg ? `: ${msg}` : ""}`);
  }
  return { rows: data as ZetarisResult["rows"], ms: Date.now() - t0, requestId };
}

/** Map Zetaris rows (arrays or objects) onto the column names we selected, in order. */
export function toObjects(rows: ZetarisResult["rows"], columns: string[]): Record<string, unknown>[] {
  return rows.map((r) => {
    if (Array.isArray(r)) {
      const o: Record<string, unknown> = {};
      columns.forEach((c, i) => (o[c] = r[i]));
      return o;
    }
    const lower = new Map(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]));
    const o: Record<string, unknown> = {};
    for (const c of columns) o[c] = lower.get(c.toLowerCase());
    return o;
  });
}

/** Normalise a timestamp value from Zetaris (string or epoch ms) to "YYYY-MM-DDTHH:MM:SS". */
export function normTs(v: unknown): string {
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 19);
  const s = String(v).trim().replace(" ", "T");
  return s.length >= 19 ? s.slice(0, 19) : s.padEnd(19, ":00").slice(0, 19);
}
