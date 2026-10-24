import { AgentSources } from "@/components/assistant/agent-sources";
import { AssistantStreamSources } from "@/components/assistant/assistant-stream-sources";

export function AgentComplianceFixture() {
  const id = "10000000-0000-4000-8000-000000000001";
  return <main className="mx-auto max-w-3xl space-y-6 p-5 sm:p-8">
    <h1 className="font-serif text-3xl text-[var(--text-primary)]">AI 来源控制 · 合成验证</h1>
    <section aria-label="即时来源"><h2 className="mb-2 text-base font-medium">即时回答</h2><AssistantStreamSources sources={[{ entityId: id, title: "合成笔记：一次选择的复盘", domain: "notes", href: `/notes/${id}` }]} /></section>
    <section aria-label="历史来源"><h2 className="mb-2 text-base font-medium">历史回答</h2><AgentSources steps={[{ id: "synthetic-step", step_type: "context", title: "本次实际来源", summary: "只使用合成内容", status: "succeeded", output_json: { auditId: null, sourceSummary: { modules: ["notes"], entitiesByModule: { notes: 1 }, sourceCount: 1, timeRange: { from: "2026-10-24", to: "2026-10-24" }, reasons: ["本轮明确请求检索"] }, sources: [{ id: "S1", entityId: id, title: "合成笔记：一次选择的复盘", domain: "notes", href: `/notes/${id}` }] } }]} /></section>
  </main>;
}
