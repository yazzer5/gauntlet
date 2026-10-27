// Agent long-term memory on Meterless H-MEM. memory.write stores a record with provenance
// (session, role, whether the session had read untrusted data). Recall feeds the next session.
// With memQuarantine on, recall only returns records written by the same role from trusted sessions.
import { HMEM } from "../../vendor/meterless/hmem/src/index.ts";
import type { Defences, Role } from "./defences.ts";

export interface MemWrite { key: string; value: string }
export class AgentMemory {
  hmem: HMEM;
  constructor(actor = "gauntlet-agent") { this.hmem = new HMEM({ actor }); }

  write(w: MemWrite, ctx: { role: Role; sessionId: string; untrusted: boolean }) {
    return this.hmem.add({
      content: `${w.key}: ${w.value}`,
      type: "factual",
      layer: "long_term",
      tags: ["agent-memory", `role:${ctx.role}`, ctx.untrusted ? "trust:untrusted" : "trust:trusted", `key:${w.key}`],
      confidence: ctx.untrusted ? 0.4 : 0.8,
      source: `agent:${ctx.role}`,
      provenance: { origin: "model_response", learnedAt: Date.now(), label: `session ${ctx.sessionId} (${ctx.role})`, refs: [ctx.sessionId] },
      missionId: ctx.sessionId,
    } as never);
  }

  recall(question: string, role: Role, d: Defences, topN = 5): string[] {
    const all = this.hmem.store.snapshotAll().records.filter((r) => r.tags.includes("agent-memory"));
    const allowed = all.filter((r) => !d.memQuarantine || (r.tags.includes(`role:${role}`) && r.tags.includes("trust:trusted")));
    if (!allowed.length) return [];
    const ranked = this.hmem.query(question, { topN: 20, threshold: 0 }).memories.map((m) => m.memory.id);
    const order = new Map(ranked.map((id, i) => [id, i]));
    return allowed
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
      .slice(0, topN)
      .map((r) => r.content);
  }
}
