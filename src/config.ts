// Minimal .env loader (no dependency) plus typed config.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

export function loadEnv(file = join(process.cwd(), ".env")): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export interface Config {
  sampleMode: boolean;
  port: number;
  zetaris: { url: string; orgId: string; apiKey: string; timeoutMs: number };
  meterless: { baseUrl: string; token: string; app: string; fastModel: string; deepModel: string; timeoutMs: number };
  postgres: { hostForZetaris: string; port: number; user: string; password: string; analyst: { user: string; password: string }; admin: { user: string; password: string } };
}

function isPlaceholder(v: string | undefined): boolean {
  return !v || v.startsWith("your-");
}

export function config(): Config {
  loadEnv();
  const e = process.env;
  return {
    sampleMode: (e.SAMPLE_MODE ?? "true").toLowerCase() !== "false",
    port: Number(e.PORT ?? 5178),
    zetaris: {
      url: (e.ZETARIS_REST_URL ?? "http://localhost:8888/api/v1.0").replace(/\/$/, ""),
      orgId: e.ZETARIS_ORG_ID ?? "1",
      apiKey: isPlaceholder(e.ZETARIS_API_KEY) ? "" : e.ZETARIS_API_KEY!,
      timeoutMs: Number(e.ZETARIS_TIMEOUT_MS ?? 60000),
    },
    meterless: {
      baseUrl: (e.METERLESS_BASE_URL ?? "http://127.0.0.1:8088/v1").replace(/\/$/, ""),
      token: isPlaceholder(e.METERLESS_RUNTIME_TOKEN) ? "" : e.METERLESS_RUNTIME_TOKEN!,
      app: e.METERLESS_APP ?? "gauntlet",
      fastModel: e.METERLESS_MODEL_FAST ?? "meterless/auto",
      deepModel: e.METERLESS_MODEL_DEEP ?? "meterless/auto",
      timeoutMs: Number(e.METERLESS_TIMEOUT_MS ?? 120000),
    },
    postgres: {
      hostForZetaris: e.PGHOST_FOR_ZETARIS ?? "host.docker.internal",
      port: Number(e.PGPORT ?? 5434),
      user: e.PGUSER ?? "gauntlet_owner",
      password: e.PGPASSWORD ?? "gauntlet_owner_local_only",
      analyst: { user: e.PG_ANALYST_USER ?? "gauntlet_analyst", password: e.PG_ANALYST_PASSWORD ?? "analyst_local_only" },
      admin: { user: e.PG_ADMIN_USER ?? "gauntlet_admin", password: e.PG_ADMIN_PASSWORD ?? "admin_local_only" },
    },
  };
}
