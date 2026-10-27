// Registers Gauntlet's two datasources (crm_analyst, crm_admin) in local Zetaris,
// one statement per REST call (Lightning: one statement, no trailing semicolon).
//   node --experimental-strip-types scripts/zetaris-register.ts            run it
//   node --experimental-strip-types scripts/zetaris-register.ts --dry-run  print statements (creds masked)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config, loadEnv } from "../src/config.ts";
import { zetarisRun } from "../src/data/zetaris.ts";

loadEnv();
const dry = process.argv.includes("--dry-run");
const pg = config().postgres;

export function registrationStatements(): string[] {
  const text = readFileSync(join(process.cwd(), "zetaris", "register.sql"), "utf8")
    .replaceAll("{{PGHOST}}", pg.hostForZetaris)
    .replaceAll("{{PGPORT}}", String(pg.port))
    .replaceAll("{{ANALYST_USER}}", pg.analyst.user)
    .replaceAll("{{ANALYST_PASSWORD}}", pg.analyst.password)
    .replaceAll("{{ADMIN_USER}}", pg.admin.user)
    .replaceAll("{{ADMIN_PASSWORD}}", pg.admin.password);
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  if (process.argv.includes("--reset")) {
    for (const ds of ["crm_analyst", "crm_admin"]) {
      for (const sql of [`DROP DATASOURCE ${ds}`, `DROP DATASOURCE IF EXISTS ${ds}`]) {
        try { await zetarisRun(sql, 5); console.log(`  dropped ${ds} (${sql})`); break; }
        catch (e) { console.log(`  drop attempt failed: ${sql} :: ${(e as Error).message.slice(0, 160)}`); }
      }
    }
  }
  const stmts = registrationStatements();
  console.log(`${stmts.length} statements${dry ? " (dry run)" : ""}`);
  let ok = 0, skipped = 0;
  const failed: string[] = [];
  for (const [i, s] of stmts.entries()) {
    const label = s.split("\n")[0].replace(/password\s+"[^"]*"/i, 'password "***"').slice(0, 90);
    if (dry) { console.log(`[${i + 1}] ${label}`); continue; }
    try {
      await zetarisRun(s, 10);
      ok++; console.log(`  ok   [${i + 1}] ${label}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (/already exist/i.test(msg)) { skipped++; console.log(`  skip [${i + 1}] ${label} (already exists)`); continue; }
      failed.push(`[${i + 1}] ${label}: ${msg.slice(0, 240)}`);
      console.log(`  FAIL [${i + 1}] ${label}\n       ${msg.slice(0, 240)}`);
    }
  }
  if (dry) return;
  console.log(`\n${ok} ok, ${skipped} already existed, ${failed.length} failed`);
  for (const ds of ["crm_analyst", "crm_admin"]) {
    try { const r = await zetarisRun(`SHOW TABLES IN ${ds}`, 50); console.log(`  tables in ${ds}: ${JSON.stringify(r.rows)}`); }
    catch (e) { console.log(`  SHOW TABLES ${ds} failed: ${(e as Error).message.slice(0, 120)}`); }
  }
  process.exit(failed.length ? 1 : 0);
}

if (process.argv[1]?.includes("zetaris-register")) main().catch((e) => { console.error(e.message); process.exit(1); });
