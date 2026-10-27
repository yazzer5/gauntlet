// Shows what Zetaris actually registered for crm_analyst / crm_admin, and which naming works.
import { config, loadEnv } from "../src/config.ts";
import { zetarisRun } from "../src/data/zetaris.ts";
loadEnv();
const c = config().zetaris;
const H = { Authorization: `Bearer ${c.apiKey}`, "X-Org-ID": c.orgId };
async function rest(path: string) {
  try { const r = await fetch(`${c.url}${path}`, { headers: H }); const t = await r.text(); console.log(`GET ${path} -> ${r.status}\n${t.slice(0, 1500)}\n`); }
  catch (e) { console.log(`GET ${path} ERR ${(e as Error).message}`); }
}
const qs = [
  "SHOW DATASOURCES",
  "SHOW TABLES IN crm_analyst",
  "SHOW TABLES FROM crm_analyst",
  "SHOW TABLES IN crm_admin",
  "SELECT count(*) FROM crm_analyst.analyst.customers",
  "SELECT count(*) FROM crm_analyst.public.customers",
  "SELECT count(*) FROM crm_analyst.CUSTOMERS",
  "SELECT count(*) FROM CRM_ANALYST.customers",
  "DESCRIBE DATASOURCE crm_analyst",
];
async function main() {
  await rest("/datasource/datasources");
  for (const q of qs) {
    try { const r = await zetarisRun(q, 50); console.log(`OK   ${q}\n     ${JSON.stringify(r.rows).slice(0, 600)}`); }
    catch (e) { console.log(`FAIL ${q}\n     ${(e as Error).message.slice(0, 250)}`); }
  }
}
main();
