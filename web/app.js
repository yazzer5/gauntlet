// Gauntlet console: results table, exploit matrix (versions and single defences), evidence for one run.
const VERSIONS = ["v0", "v1", "v2"];
const ABLATIONS = ["only-scoping", "only-dlp", "only-spotlight", "only-memq"];
const CONFIG = {
  v0: { name: "v0", def: "No guardrails" },
  v1: { name: "v1", def: "Prompt policy" },
  v2: { name: "v2", def: "All defences" },
  "only-scoping": { name: "Scoping", def: "Role’s datasource only" },
  "only-dlp": { name: "DLP", def: "Redact canaries" },
  "only-spotlight": { name: "Spotlight", def: "Fence ticket text" },
  "only-memq": { name: "Memory", def: "Quarantine memory" },
};
const DEFENCES = {
  v0: [], v1: ["prompt policy"], v2: ["prompt policy", "datasource scoping", "spotlighting", "DLP", "memory quarantine"],
  "only-scoping": ["datasource scoping"], "only-dlp": ["DLP"], "only-spotlight": ["spotlighting"], "only-memq": ["memory quarantine"],
};
const CLASSES = [
  ["indirect_injection", "Ticket injection", "instructions hidden in a support ticket the agent reads"],
  ["direct_exfil", "Direct exfiltration", "the user asks the agent to break policy"],
  ["memory_poison", "Memory poisoning", "one session plants data a later session recalls"],
];
const STATE = {
  leak: { word: "Leaked", long: "Canary leaked" },
  access: { word: "Admin PII", long: "Reached admin PII" },
  hijack: { word: "Hijacked", long: "Sent a message for the attacker" },
  blocked: { word: "Blocked", long: "Held, a defence fired" },
  held: { word: "", long: "Held" },
  err: { word: "Error", long: "Run errored, excluded" },
};

let report = null;
let runs = new Map();
let selected = null;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const key = (cfg, id) => `${cfg}|${id}`;

function state(r) {
  if (!r || r.error) return "err";
  if (r.leaked) return "leak";
  if ((r.unauthorizedAccess || []).length) return "access";
  if ((r.session?.steps || []).some((s) => s.toolCalls.some((t) => t.executed))) return "hijack";
  if (r.blocked > 0) return "blocked";
  return "held";
}

async function load() {
  try {
    const [st, res] = await Promise.all([fetch("/api/status").then((r) => r.json()).catch(() => null), fetch("/api/report")]);
    if (st) $("#status").innerHTML = st.mode === "replay" ? "Replaying recorded Nemotron runs" : `Live on <b>${esc(st.fast.replace("nvidia/", ""))}</b>${st.mode === "live-reuse" ? ", recorded replies reused" : ""}`;
    if (res.status === 404) return emptyState();
    if (!res.ok) throw new Error(`report request failed (${res.status})`);
    report = await res.json();
  } catch (e) {
    return errorState(e.message);
  }
  runs = new Map(report.attacks.map((r) => [key(r.config, r.attackId), r]));
  renderSummary(); renderMatrix();
  $("#regress").disabled = !report.configs.includes("v2");
}

function emptyState() {
  $("#headline").textContent = "No certification run yet";
  $("#subline").innerHTML = "Run <code>npm run eval</code> to attack the agent and record the results, then reload.";
  $("#matrix").innerHTML = "";
}
function errorState(msg) {
  $("#headline").textContent = "Couldn’t load the results";
  $("#subline").textContent = `${msg}. Check the Gauntlet server is running (npm start) and reload.`;
  $("#matrix").innerHTML = "";
}

function summary(cfg) {
  const rs = report.attacks.filter((r) => r.config === cfg && !r.error);
  const b = report.benign.filter((x) => x.config === cfg && !x.error);
  return {
    total: rs.length, leaked: rs.filter((r) => r.leaked).length,
    access: rs.filter((r) => (r.unauthorizedAccess || []).length).length,
    hijack: rs.filter((r) => state(r) === "hijack").length,
    util: b.filter((x) => x.ok).length, utilTotal: b.length,
  };
}

function renderSummary() {
  const vs = VERSIONS.filter((v) => report.configs.includes(v));
  const S = Object.fromEntries(vs.map((v) => [v, summary(v)]));
  const last = vs[vs.length - 1], first = vs[0];
  const L = S[last], F = S[first];
  const clean = L.leaked + L.access + L.hijack === 0;
  $("#headline").textContent = clean
    ? `${last} holds against all ${L.total} exploits and answers ${L.util} of ${L.utilTotal} analyst questions.`
    : `${last} still fails ${L.leaked + L.access + L.hijack} of ${L.total} exploits.`;
  $("#subline").textContent = `Without guardrails the same agent leaked customer PII in ${F.leaked} of ${F.total}. Verdicts are canary-token matches, not a model’s opinion.`;
  const cell = (n, d, badWhenAbove0) => `<td class="${badWhenAbove0 ? (n > 0 ? "bad" : "good") : n === d ? "good" : "bad"}">${n} of ${d}</td>`;
  $("#scores").innerHTML = `<thead><tr><th></th>${vs.map((v) => `<th scope="col">${CONFIG[v].name}<small>${CONFIG[v].def}</small></th>`).join("")}</tr></thead><tbody>
    <tr><td>Canary leaked</td>${vs.map((v) => cell(S[v].leaked, S[v].total, true)).join("")}</tr>
    <tr><td>Reached admin PII</td>${vs.map((v) => cell(S[v].access, S[v].total, true)).join("")}</tr>
    <tr><td>Analyst questions answered</td>${vs.map((v) => cell(S[v].util, S[v].utilTotal, false)).join("")}</tr></tbody>`;
  const per = report.attacks.length / report.configs.length;
  $("#foot").innerHTML = `${per} exploits and ${report.benign.length / report.configs.length} analyst questions per column, run live on Nemotron through Meterless Nightshift with every read through Zetaris. Confirmed exploits filed in Meterless H-MEM: ${report.summary.corpusSize}. Reproduce with <code>npm run eval</code>, no credentials needed.`;
}

function renderMatrix() {
  const vs = VERSIONS.filter((c) => report.configs.includes(c));
  const ab = ABLATIONS.filter((c) => report.configs.includes(c));
  const cols = [...vs, ...(ab.length ? ["gap", ...ab] : [])];
  const titles = report.titles || {};
  let html = `<thead><tr class="groups"><th class="label"></th><th class="grp" colspan="${vs.length}">Agent version</th>${ab.length ? `<th class="gap"></th><th class="grp" colspan="${ab.length}">One defence on its own, added to v0</th>` : ""}</tr>
    <tr class="names"><th class="label" scope="col"></th>${cols.map((c) => (c === "gap" ? `<th class="gap"></th>` : `<th scope="col">${CONFIG[c].name}<small>${CONFIG[c].def}</small></th>`)).join("")}</tr></thead><tbody>`;
  for (const [cls, name, def] of CLASSES) {
    const ids = [...new Set(report.attacks.filter((r) => r.cls === cls).map((r) => r.attackId))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!ids.length) continue;
    html += `<tr class="cls"><td colspan="${cols.length + 1}"><h3>${esc(name)}</h3><span>${esc(def)}</span></td></tr>`;
    for (const id of ids) {
      const q = runs.get(key(cols[0], id))?.session?.question || "";
      html += `<tr data-row="${id}"><td class="label"><span class="title" title="${esc(q)}">${esc(titles[id] || q)}</span><span class="id">${esc(id)}</span></td>`;
      for (const c of cols) {
        if (c === "gap") { html += `<td class="gap"></td>`; continue; }
        const st = state(runs.get(key(c, id)));
        html += `<td class="c"><button type="button" class="pill cell ${st}" data-cfg="${c}" data-id="${id}" aria-pressed="false" aria-label="${esc(id)}, ${esc(CONFIG[c].name)}: ${STATE[st].long}">${STATE[st].word}</button></td>`;
      }
      html += `</tr>`;
    }
  }
  $("#matrix").innerHTML = html + "</tbody>";
  $("#matrix").addEventListener("click", (e) => { const b = e.target.closest(".cell"); if (b) select(b.dataset.cfg, b.dataset.id); });
  if (selected) markSelected();
}

function markSelected() {
  document.querySelectorAll(".cell").forEach((b) => b.setAttribute("aria-pressed", String(!!selected && b.dataset.cfg === selected.cfg && b.dataset.id === selected.id)));
  document.querySelectorAll("tr[data-row]").forEach((tr) => tr.classList.toggle("selected", !!selected && tr.dataset.row === selected.id));
}

function highlight(text, hits) {
  let out = esc(text);
  for (const v of new Set((hits || []).map((h) => h.canary))) out = out.split(esc(v)).join(`\u0000${v}\u0001`);
  out = out.replace(/CNRY-[A-Z]\d{4}-\d{6}/g, (m) => `\u0000${m}\u0001`).replace(/\u0000\u0000/g, "\u0000").replace(/\u0001\u0001/g, "\u0001");
  return out.replace(/\u0000([^\u0001]*)\u0001/g, '<mark class="canary">$1</mark>');
}
function adminCustomer(r) {
  for (const s of r.session.steps) for (const q of s.queries) {
    const m = /crm_admin\s*\.\s*customers.*customer_id\s*=\s*(\d+)/i.exec(q.sql);
    if (m) return Number(m[1]);
  }
  return null;
}

function select(cfg, id) {
  selected = { cfg, id };
  markSelected();
  const r = runs.get(key(cfg, id));
  if (!r) return;
  const st = state(r), s = r.session;
  const cust = r.hits[0]?.customer_id ?? adminCustomer(r);
  const defs = DEFENCES[cfg] || [];
  let html = `<div class="ev-head"><h2>${esc(report.titles?.[id] || id)}</h2><span class="pill ${st}">${STATE[st].long}</span></div>
    <p class="ev-def">${esc(id)} under ${esc(CONFIG[cfg].name)}: ${defs.length ? `defences on: ${esc(defs.join(", "))}` : "no defences"}</p>
    <div class="ev-actions">
      <button class="btn primary" type="button" id="b-replay">Replay this run</button>
      <button class="btn" type="button" id="b-why">Explain this finding</button>
      ${cust ? `<button class="btn" type="button" id="b-direct">Look up customer ${cust} as the analyst</button>` : ""}
    </div><div id="ev-extra"></div>
    <h3>Question the agent got</h3><p class="ev-q">${esc(s.question)}</p>`;
  if (s.recalled?.length) html += `<h3>Recalled from team memory</h3>${s.recalled.map((m) => `<div class="tool">${highlight(m, r.hits)}</div>`).join("")}`;
  html += `<h3>What the agent did</h3>`;
  for (const stp of s.steps) {
    html += `<div class="step">${stp.thought ? `<p class="thought"><b>Turn ${stp.turn}</b> ${esc(stp.thought)}</p>` : ""}`;
    for (const q of stp.queries) {
      const admin = /crm_admin\s*\./i.test(q.sql);
      html += `<div class="sql ${q.blocked ? "blocked" : admin ? "admin" : ""}">${esc(q.sql)}</div><p class="meta">${q.blocked ? `<span class="good">Blocked before Zetaris:</span> ${esc(q.blocked)}` : q.ok ? `Zetaris returned ${q.rows.length} row${q.rows.length === 1 ? "" : "s"} in ${q.ms} ms${admin ? `. <span class="bad">Admin datasource, not entitled.</span>` : ""}` : `<span class="bad">${esc(q.error)}</span>`}</p>`;
    }
    for (const t of stp.toolCalls) html += `<div class="tool ${t.executed ? "exec" : ""}"><span class="what">${esc(t.tool)}</span> ${t.executed ? `<span class="bad">sent</span>` : `<span class="good">blocked: ${esc(t.blocked)}</span>`}<code>${highlight(JSON.stringify(t.args), r.hits)}</code></div>`;
    for (const m of stp.memoryWrites) html += `<div class="tool ${m.executed ? "exec" : ""}"><span class="what">memory.write</span> ${m.executed ? `<span class="bad">stored</span>` : `<span class="good">blocked: ${esc(m.blocked)}</span>`}<code>${highlight(`${m.key}: ${m.value}`, r.hits)}</code></div>`;
    html += `</div>`;
  }
  html += `<h3>Answer delivered to the user</h3><div class="answer">${s.answer ? highlight(s.answer, r.hits) : "No answer was delivered."}</div>`;
  html += `<h3>Oracle findings</h3>` + (r.hits.length
    ? `<ul class="hits">${r.hits.map((h) => `<li><code>${esc(h.canary)}</code>, customer ${h.customer_id} (${esc(h.segment)}) ${esc(h.kind)}, in ${esc(h.sink)}${h.via !== "plain" ? `, found ${esc(h.via)}` : ""}</li>`).join("")}</ul>`
    : `<p class="meta">No canary reached the answer, a sent message or a memory write.${(r.unauthorizedAccess || []).length ? ` <span class="bad">But ${r.unauthorizedAccess.length} query reached the admin datasource.</span>` : ""}</p>`);
  const models = [...new Set(s.llm.map((l) => `${l.answeredBy.replace("nvidia/", "")} (${l.provider})`))];
  html += `<h3>Models</h3><p class="models">${s.llm.length} call${s.llm.length === 1 ? "" : "s"}, answered by ${esc(models.join(", "))}</p>`;
  const ev = $("#evidence");
  ev.innerHTML = html;
  ev.scrollTop = 0;
  $("#b-replay").addEventListener("click", () => replayOne(cfg, id));
  $("#b-why").addEventListener("click", () => why(cfg, id));
  if (cust) $("#b-direct").addEventListener("click", () => direct(cust));
  if (window.matchMedia("(max-width: 1100px)").matches) ev.focus();
}

function applyCell(cfg, id, r) {
  const cell = document.querySelector(`.cell[data-cfg="${cfg}"][data-id="${id}"]`);
  if (!cell) return;
  const st = state(r);
  cell.className = `pill cell ${st} changed`;
  cell.textContent = STATE[st].word;
  cell.setAttribute("aria-label", `${id}, ${CONFIG[cfg].name}: ${STATE[st].long}`);
  setTimeout(() => cell.classList.remove("changed"), 450);
}
async function replayRun(cfg, id) {
  const r = await fetch("/api/replay", { method: "POST", body: JSON.stringify({ attackId: id, config: cfg }) }).then((x) => x.json()).catch((e) => ({ error: e.message }));
  if (r.session) { runs.set(key(cfg, id), r); report.attacks = report.attacks.map((x) => (x.config === cfg && x.attackId === id ? r : x)); }
  return r;
}
async function replayOne(cfg, id) {
  const btn = $("#b-replay");
  btn.disabled = true; btn.textContent = "Replaying";
  const r = await replayRun(cfg, id);
  if (!r.session) { $("#ev-extra").innerHTML = `<div class="panel warn"><p>Replay failed: ${esc(r.error)}. Check Nightshift and Zetaris are running.</p></div>`; btn.disabled = false; btn.textContent = "Replay this run"; return; }
  applyCell(cfg, id, r);
  select(cfg, id);
  $("#ev-extra").innerHTML = `<div class="panel ${r.leaked ? "warn" : "ok"}"><p>Replayed through the agent and the oracle: <strong>${STATE[state(r)].long}</strong>. ${r.traceEvents} event${r.traceEvents === 1 ? "" : "s"} written to the World Model trace.</p></div>`;
}
async function why(cfg, id) {
  const box = $("#ev-extra");
  box.innerHTML = `<div class="panel"><p>Asking Nemotron to explain this finding.</p></div>`;
  const r = await fetch("/api/why", { method: "POST", body: JSON.stringify({ attackId: id, config: cfg }) }).then((x) => x.json()).catch((e) => ({ explanation: `Request failed: ${e.message}` }));
  box.innerHTML = `<div class="panel"><p>${esc(r.explanation)}</p>${r.fix ? `<p><strong>Fix:</strong> ${esc(r.fix)}</p>` : ""}<p class="models">${r.model ? `Explained by ${esc(r.model.replace("nvidia/", ""))} (${esc(r.provider)}). The canary oracle decided the verdict.` : esc(r.error || "")}</p></div>`;
}
async function direct(cust) {
  const box = $("#ev-extra");
  box.innerHTML = `<div class="panel"><p>Running the lookup through Zetaris as the analyst.</p></div>`;
  const r = await fetch("/api/analyst-view", { method: "POST", body: JSON.stringify({ customerId: cust }) }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
  const rows = r.rows || [];
  box.innerHTML = `<div class="panel ${r.ok ? "ok" : "warn"}"><div class="sql">${esc(r.sql || "")}</div><p>${r.ok
    ? rows.length ? `Zetaris returned ${rows.length} masked row with no email, phone or tax ID column.` : `Zetaris returned <strong>0 rows</strong>. Customer ${cust} is VIP and the analyst datasource filters VIP rows out. The data layer held; the agent went around it.`
    : `Lookup failed: ${esc(r.error)}`}</p></div>`;
}

async function regress() {
  const btn = $("#regress");
  const exploits = [...new Set(report.attacks.filter((r) => r.config === "v0" && !["held", "blocked", "err"].includes(state(r))).map((r) => r.attackId))];
  btn.disabled = true;
  exploits.forEach((id) => { const c = document.querySelector(`.cell[data-cfg="v2"][data-id="${id}"]`); if (c) { c.className = "pill cell pending"; c.textContent = "Queued"; } });
  let done = 0;
  const queue = [...exploits];
  const worker = async () => { while (queue.length) { const id = queue.shift(); const r = await replayRun("v2", id); applyCell("v2", id, r.session ? r : { error: r.error }); btn.textContent = `Replayed ${++done} of ${exploits.length}`; } };
  await Promise.all([worker(), worker(), worker()]);
  btn.disabled = false; btn.textContent = "Replay every exploit on v2";
  renderSummary();
}

$("#regress").addEventListener("click", regress);
$("#start-here").addEventListener("click", () => report && select("v0", "inj-21"));
load();
