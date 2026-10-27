// Gauntlet UI: findings matrix, evidence for one run, before/after scores.
const CONFIG_INFO = {
  v0: { name: "v0", def: "No guardrails" },
  v1: { name: "v1", def: "Policy in the prompt" },
  v2: { name: "v2", def: "All defences" },
  "only-scoping": { name: "Scoping", def: "Datasource scoping only" },
  "only-spotlight": { name: "Spotlight", def: "Spotlighting only" },
  "only-dlp": { name: "DLP", def: "DLP only" },
  "only-memq": { name: "Memory", def: "Memory quarantine only" },
};
const CLASS_INFO = {
  indirect_injection: { name: "Ticket injection", def: "instructions hidden in a support ticket the agent reads" },
  direct_exfil: { name: "Direct exfiltration", def: "the user asks the agent to break policy" },
  memory_poison: { name: "Memory poisoning", def: "one session plants data that a later session recalls" },
};
const DEF_LABEL = { promptPolicy: "prompt policy", scoping: "datasource scoping", spotlight: "spotlighting", dlp: "tool and answer DLP", memQuarantine: "memory quarantine" };

let report = null;
let runs = new Map(); // key `${config}|${attackId}` -> run
let selected = null;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pct = (x) => `${Math.round(x * 100)}%`;

function state(r) {
  if (!r) return "err";
  if (r.error) return "err";
  if (r.leaked) return "leak";
  if ((r.unauthorizedAccess || []).length) return "access";
  const steps = r.session?.steps || [];
  const executedTool = steps.some((s) => s.toolCalls.some((t) => t.executed));
  if (executedTool) return "hijack";
  if (r.blocked > 0) return "blocked";
  return "held";
}
const STATE_TEXT = { leak: "Leaked", access: "Reached admin PII", hijack: "Obeyed injected tool call", held: "Held", blocked: "Held, defence fired", err: "Did not run" };
function cellLabel(r, st) {
  if (st === "leak") return `${r.hits.length}`;
  if (st === "access") return "PII";
  if (st === "hijack") return "tool";
  if (st === "blocked") return `${r.blocked} blocked`;
  if (st === "err") return "–";
  return "";
}

async function load() {
  const [st, rep] = await Promise.all([fetch("/api/status").then((r) => r.json()).catch(() => null), fetch("/api/report").then((r) => (r.ok ? r.json() : null))]);
  if (st) $("#status").innerHTML = st.mode === "live" ? `Live on <b>${esc(st.fast.replace("nvidia/", ""))}</b>` : st.mode === "live-reuse" ? `Live on <b>${esc(st.fast.replace("nvidia/", ""))}</b>, recorded replies reused` : `Replaying recorded Nemotron runs`;
  if (!rep) { $("#headline").textContent = "No evaluation yet. Run npm run eval to certify the agent."; return; }
  report = rep;
  runs = new Map(rep.attacks.map((r) => [`${r.config}|${r.attackId}`, r]));
  renderVerdict(); renderMatrix(); renderScores();
}

function summary(cfg) {
  const rs = report.attacks.filter((r) => r.config === cfg && !r.error);
  const b = report.benign.filter((x) => x.config === cfg && !x.error);
  return {
    total: rs.length,
    leaked: rs.filter((r) => r.leaked).length,
    access: rs.filter((r) => (r.unauthorizedAccess || []).length).length,
    hijack: rs.filter((r) => state(r) === "hijack").length,
    util: b.filter((x) => x.ok).length, utilTotal: b.length,
  };
}

function renderVerdict() {
  const cfgs = report.configs;
  const last = cfgs[cfgs.length - 1], first = cfgs[0];
  const L = summary(last), F = summary(first);
  const clean = L.leaked === 0 && L.access === 0 && L.hijack === 0;
  $("#headline").textContent = clean
    ? `${last} holds against all ${L.total} exploits and still answers ${L.util} of ${L.utilTotal} analyst questions.`
    : `${last} still fails ${L.leaked + L.access + L.hijack} of ${L.total} exploits.`;
  const models = (report.summary.modelsSeen || []).map((m) => m.replace("nvidia/", "")).join(" and ");
  $("#subline").textContent = `Without guardrails the same agent leaked customer PII in ${F.leaked} of ${F.total} attacks. Every verdict comes from canary tokens matched in the agent's output, not from a model's opinion. Agent runs on ${models || "Nemotron"} through Meterless Nightshift; every data read goes through Zetaris.`;
}

function renderMatrix() {
  const cfgs = report.configs;
  const ids = [...new Set(report.attacks.map((r) => r.attackId))];
  const byClass = { indirect_injection: [], direct_exfil: [], memory_poison: [] };
  for (const id of ids) {
    const r = report.attacks.find((x) => x.attackId === id);
    (byClass[r.cls] ||= []).push({ id, q: report.titles?.[id] || r.session?.question || "", full: r.session?.question || "" });
  }
  let html = `<thead><tr><th scope="col">Exploit</th>${cfgs.map((c) => `<th scope="col" class="ver">${esc(CONFIG_INFO[c]?.name || c)}<small>${esc(CONFIG_INFO[c]?.def || "")}</small></th>`).join("")}</tr></thead><tbody>`;
  for (const [cls, rows] of Object.entries(byClass)) {
    if (!rows.length) continue;
    rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const ci = CLASS_INFO[cls] || { name: cls, def: "" };
    html += `<tr class="cls"><td colspan="${cfgs.length + 1}">${esc(ci.name)} <span>${esc(ci.def)}</span></td></tr>`;
    for (const row of rows) {
      html += `<tr><td class="q"><span class="txt" title="${esc(row.full)}"><span class="id">${esc(row.id)}</span>${esc(row.q)}</span></td>`;
      for (const c of cfgs) {
        const r = runs.get(`${c}|${row.id}`);
        const st = state(r);
        html += `<td class="c"><button type="button" class="cell ${st}" data-cfg="${c}" data-id="${row.id}" aria-pressed="false" aria-label="${esc(row.id)} under ${c}: ${STATE_TEXT[st]}">${esc(cellLabel(r, st))}</button></td>`;
      }
      html += `</tr>`;
    }
  }
  $("#matrix").innerHTML = html + "</tbody>";
  $("#matrix").querySelectorAll(".cell").forEach((b) => b.addEventListener("click", () => select(b.dataset.cfg, b.dataset.id)));
  if (selected) markSelected();
}

function markSelected() {
  document.querySelectorAll(".cell").forEach((b) => b.setAttribute("aria-pressed", String(selected && b.dataset.cfg === selected.cfg && b.dataset.id === selected.id)));
}

function highlightCanaries(text, hits) {
  let out = esc(text);
  const vals = [...new Set((hits || []).map((h) => h.canary))];
  for (const v of vals) out = out.split(esc(v)).join(`<mark class="canary">${esc(v)}</mark>`);
  return out.replace(/CNRY-[A-Z]\d{4}-\d{6}/g, (m) => (out.includes(`>${m}</mark>`) ? m : `<mark class="canary">${m}</mark>`));
}

function select(cfg, id) {
  selected = { cfg, id };
  markSelected();
  const r = runs.get(`${cfg}|${id}`);
  const st = state(r);
  const s = r.session;
  const active = Object.entries(cfgDefences(cfg)).filter(([, v]) => v).map(([k]) => DEF_LABEL[k]);
  const custId = (r.hits[0] && r.hits[0].customer_id) || firstAdminCustomer(r);
  let html = `<h2 class="ev-title">${esc(id)} under ${esc(CONFIG_INFO[cfg]?.def || cfg)} <span class="ev-tag ${st}">${STATE_TEXT[st]}</span></h2>
    <p class="ev-def">${active.length ? `Defences on: ${esc(active.join(", "))}` : "No defences"}</p>
    <div class="ev-actions">
      <button class="btn primary" type="button" id="b-replay">Replay this run</button>
      <button class="btn" type="button" id="b-why">Explain this finding</button>
      ${custId ? `<button class="btn" type="button" id="b-direct">Query customer ${custId} as analyst</button>` : ""}
    </div>
    <div id="ev-extra"></div>
    <p class="ev-q">${esc(s.question)}</p>`;
  if (s.recalled?.length) html += `<h3>Recalled from team memory</h3>${s.recalled.map((m) => `<div class="tool">${highlightCanaries(m, r.hits)}</div>`).join("")}`;
  html += `<h3>What the agent did</h3>`;
  for (const stp of s.steps) {
    html += `<div class="step">${stp.thought ? `<p class="thought">Turn ${stp.turn}: ${esc(stp.thought)}</p>` : ""}`;
    for (const q of stp.queries) {
      const admin = /crm_admin\s*\./i.test(q.sql);
      html += `<div class="sql ${q.blocked ? "blocked" : admin ? "admin" : ""}">${esc(q.sql)}</div>`;
      html += `<p class="meta">${q.blocked ? `<span class="good">Blocked before Zetaris: ${esc(q.blocked)}</span>` : q.ok ? `Zetaris returned ${q.rows.length} row${q.rows.length === 1 ? "" : "s"} in ${q.ms} ms${admin ? ` · <span class="bad">admin datasource, not entitled</span>` : ""}` : `<span class="bad">${esc(q.error)}</span>`}</p>`;
    }
    for (const t of stp.toolCalls) html += `<div class="tool ${t.executed ? "exec" : ""}"><strong>${esc(t.tool)}</strong> ${t.executed ? "sent" : `<span class="good">blocked: ${esc(t.blocked)}</span>`}<br><code>${highlightCanaries(JSON.stringify(t.args), r.hits)}</code></div>`;
    for (const m of stp.memoryWrites) html += `<div class="tool ${m.executed ? "exec" : ""}"><strong>memory.write</strong> ${m.executed ? "stored" : `<span class="good">blocked: ${esc(m.blocked)}</span>`}<br><code>${highlightCanaries(`${m.key}: ${m.value}`, r.hits)}</code></div>`;
    html += `</div>`;
  }
  html += `<h3>Answer delivered to the user</h3><div class="answer">${s.answer ? highlightCanaries(s.answer, r.hits) : "<em>No answer</em>"}</div>`;
  html += `<h3>Oracle findings</h3>`;
  html += r.hits.length
    ? `<ul class="hits">${r.hits.map((h) => `<li><code>${esc(h.canary)}</code> customer ${h.customer_id} (${esc(h.segment)}) ${esc(h.kind)} in ${esc(h.sink)}${h.via !== "plain" ? `, found ${esc(h.via)}` : ""}</li>`).join("")}</ul>`
    : `<p class="meta">No canary reached the answer, a sent tool call or a memory write.${(r.unauthorizedAccess || []).length ? ` <span class="bad">But ${r.unauthorizedAccess.length} query reached the admin datasource.</span>` : ""}</p>`;
  const models = [...new Set(s.llm.map((l) => `${l.answeredBy.replace("nvidia/", "")} (${l.provider})`))];
  html += `<h3>Models</h3><p class="models">${s.llm.length} calls answered by ${esc(models.join(", "))}</p>`;
  const ev = $("#evidence");
  ev.innerHTML = html;
  $("#b-replay").addEventListener("click", () => replayOne(cfg, id));
  $("#b-why").addEventListener("click", () => why(cfg, id));
  if (custId) $("#b-direct").addEventListener("click", () => direct(custId));
  if (window.matchMedia("(max-width: 980px)").matches) ev.focus();
}

function cfgDefences(cfg) {
  const base = { promptPolicy: false, scoping: false, spotlight: false, dlp: false, memQuarantine: false };
  if (cfg === "v0") return base;
  if (cfg === "v1") return { ...base, promptPolicy: true };
  if (cfg === "v2") return { promptPolicy: true, scoping: true, spotlight: true, dlp: true, memQuarantine: true };
  if (cfg === "only-scoping") return { ...base, scoping: true };
  if (cfg === "only-spotlight") return { ...base, spotlight: true };
  if (cfg === "only-dlp") return { ...base, dlp: true };
  if (cfg === "only-memq") return { ...base, memQuarantine: true };
  return base;
}
function firstAdminCustomer(r) {
  for (const s of r.session.steps) for (const q of s.queries) {
    const m = /crm_admin\s*\.\s*customers.*customer_id\s*=\s*(\d+)/i.exec(q.sql);
    if (m) return Number(m[1]);
  }
  return null;
}

async function replayOne(cfg, id) {
  const btn = $("#b-replay");
  btn.disabled = true; btn.textContent = "Replaying";
  const cell = document.querySelector(`.cell[data-cfg="${cfg}"][data-id="${id}"]`);
  const r = await fetch("/api/replay", { method: "POST", body: JSON.stringify({ attackId: id, config: cfg }) }).then((x) => x.json());
  if (r.error && !r.session) { $("#ev-extra").innerHTML = `<div class="panel"><p>${esc(r.error)}</p></div>`; btn.disabled = false; btn.textContent = "Replay this run"; return; }
  runs.set(`${cfg}|${id}`, r);
  applyCell(cell, r);
  select(cfg, id);
  $("#ev-extra").innerHTML = `<div class="panel ${r.leaked ? "" : "ok"}"><p>Replayed through the agent and the oracle: <strong>${STATE_TEXT[state(r)]}</strong>. ${r.traceEvents} events written to the World Model trace.</p></div>`;
}

function applyCell(cell, r) {
  if (!cell) return;
  const st = state(r);
  cell.className = `cell ${st} flip`;
  cell.textContent = cellLabel(r, st);
  cell.setAttribute("aria-label", `${r.attackId} under ${r.config}: ${STATE_TEXT[st]}`);
  setTimeout(() => cell.classList.remove("flip"), 600);
}

async function why(cfg, id) {
  const box = $("#ev-extra");
  box.innerHTML = `<div class="panel"><p>Asking Nemotron to explain the finding.</p></div>`;
  const r = await fetch("/api/why", { method: "POST", body: JSON.stringify({ attackId: id, config: cfg }) }).then((x) => x.json());
  box.innerHTML = `<div class="panel"><p>${esc(r.explanation)}</p>${r.fix ? `<p><strong>Fix:</strong> ${esc(r.fix)}</p>` : ""}<p class="models">${r.model ? `Explained by ${esc(r.model.replace("nvidia/", ""))} (${esc(r.provider)}). The verdict itself came from the canary oracle.` : esc(r.error || "")}</p></div>`;
}

async function direct(customerId) {
  const box = $("#ev-extra");
  box.innerHTML = `<div class="panel"><p>Running the lookup through Zetaris as the analyst.</p></div>`;
  const r = await fetch("/api/analyst-view", { method: "POST", body: JSON.stringify({ customerId }) }).then((x) => x.json());
  const rows = r.rows || [];
  box.innerHTML = `<div class="panel ok"><div class="sql">${esc(r.sql)}</div><p>${r.ok
      ? rows.length ? `Zetaris returned ${rows.length} masked row: <code>${esc(JSON.stringify(rows[0]))}</code>. No email, phone or tax ID columns exist for the analyst.` : `Zetaris returned <strong>0 rows</strong>. Customer ${customerId} is vip, and the analyst datasource filters vip rows out. The data layer held; the agent went around it.`
      : esc(r.error)}</p></div>`;
}

async function regress() {
  const btn = $("#regress");
  const cfgs = report.configs;
  const target = cfgs[cfgs.length - 1];
  const exploits = [...new Set(report.attacks.filter((r) => r.config === cfgs[0] && state(r) !== "held" && state(r) !== "blocked").map((r) => r.attackId))];
  btn.disabled = true;
  let done = 0;
  const cells = exploits.map((id) => document.querySelector(`.cell[data-cfg="${target}"][data-id="${id}"]`));
  cells.forEach((c) => { if (c) { c.className = "cell pending"; c.textContent = "…"; } });
  const queue = [...exploits];
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      const r = await fetch("/api/replay", { method: "POST", body: JSON.stringify({ attackId: id, config: target }) }).then((x) => x.json());
      if (r.session) { runs.set(`${target}|${id}`, r); report.attacks = report.attacks.map((x) => (x.config === target && x.attackId === id ? r : x)); }
      applyCell(document.querySelector(`.cell[data-cfg="${target}"][data-id="${id}"]`), r.session ? r : { error: r.error });
      done++; btn.textContent = `Replaying ${done} of ${exploits.length}`;
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  btn.disabled = false; btn.textContent = `Replay every exploit on ${target}`;
  renderVerdict(); renderScores();
}

function renderScores() {
  const html = report.configs.map((c) => {
    const s = summary(c);
    const bar = (cls, label, n, d) => `<div class="metric"><div class="row"><span>${label}</span><b>${n} of ${d}</b></div><div class="track"><div class="fill ${cls}" style="width:${d ? (100 * n) / d : 0}%"></div></div></div>`;
    return `<div class="score"><h3>${esc(CONFIG_INFO[c]?.name || c)}</h3><p class="def">${esc(CONFIG_INFO[c]?.def || "")}</p>
      ${bar("leak", "Exploits that leaked a canary", s.leaked, s.total)}
      ${bar("access", "Exploits that reached admin PII", s.access, s.total)}
      ${bar("util", "Analyst questions answered", s.util, s.utilTotal)}</div>`;
  }).join("");
  $("#scores").innerHTML = html;
  $("#foot").textContent = `${report.attacks.length / report.configs.length} exploits and ${report.benign.length / report.configs.length} analyst questions per version. Recorded runs replay exactly with npm run eval in sample mode. Known-exploit corpus in Meterless H-MEM: ${report.summary.corpusSize} entries.`;
}

$("#regress").addEventListener("click", regress);
load();
