"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { blockAiSource, submitAiFeedback } from "@/features/ai/actions";

type Step = {
  id: string;
  step_type: string;
  title: string;
  summary: string;
  tool_name?: string | null;
  status: string;
  output_json?: Record<string, unknown> | null;
};

export function AgentSources({ steps }: { steps: Step[] }) {
  const contextOutput = steps.findLast((step) => step.step_type === "context")?.output_json;
  const sourceSummary = contextOutput?.sourceSummary as { modules?: string[]; entitiesByModule?: Record<string, number>; timeRange?: { from?: string | null; to?: string | null }; reasons?: string[]; sourceCount?: number } | undefined;
  const sources = steps.flatMap((step) => {
    const output = step.output_json;
    const values = output && Array.isArray(output.sources) ? output.sources : [];
    return values.filter((value): value is { id: string; title: string; domain: string; href?: string | null } => Boolean(value && typeof value === "object" && "id" in value && "title" in value && "domain" in value));
  });
  const unique = [...new Map(sources.map((source) => [`${source.domain}:${source.id}`, source])).values()];
  if (!steps.length) return null;
  const moduleSummary = sourceSummary?.modules?.map((module) => `${module} ${sourceSummary.entitiesByModule?.[module] ?? 0} 项`).join(" · ") || "未使用 Personal OS 数据";
  const timeRange = sourceSummary?.timeRange?.from || sourceSummary?.timeRange?.to ? `${sourceSummary.timeRange?.from?.slice(0, 10) ?? "未记录"} 至 ${sourceSummary.timeRange?.to?.slice(0, 10) ?? "未记录"}` : "无时间范围";
  const auditId = typeof contextOutput?.auditId === "string" ? contextOutput.auditId : null;
  return <details className="rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 py-2 text-xs text-[var(--text-secondary)]"><summary className="flex cursor-pointer list-none items-center justify-between font-medium"><span>本次 AI 来源 · {sourceSummary?.sourceCount ?? 0} 项</span><ChevronDown className="size-3.5" aria-hidden="true" /></summary><div className="mt-2 space-y-1"><p>模块与实体：{moduleSummary}</p><p>时间范围：{timeRange}</p><p>检索理由：{sourceSummary?.reasons?.join("；") || String(contextOutput?.retrievalReason ?? "当前请求不需要个人数据。")}</p></div><div className="mt-3 space-y-1.5 border-t pt-2">{steps.map((step) => <p key={step.id} className="flex gap-2"><span aria-hidden="true">{step.status === "failed" ? "!" : "✓"}</span><span>{step.title}{step.summary ? ` · ${step.summary}` : ""}</span></p>)}</div>{unique.length ? <div className="mt-3 border-t pt-2"><p className="mb-1.5 font-medium">实际使用的来源</p><div className="flex flex-wrap gap-1.5">{unique.map((source) => <span key={`${source.domain}:${source.id}`} className="inline-flex items-center gap-1 rounded bg-[var(--surface-canvas)] px-2 py-1">{source.href ? <Link href={source.href} className="hover:text-[var(--accent)]">{source.title}</Link> : source.title}{source.domain === "notes" || source.domain === "files" ? <form action={blockAiSource}><input type="hidden" name="source_id" value={source.id}/><input type="hidden" name="domain" value={source.domain}/><button title="以后不再把此来源发送给 AI" className="text-[10px] text-[#365F78] hover:underline">不再使用</button></form> : null}</span>)}</div></div> : null}{auditId ? <form action={submitAiFeedback} className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2"><input type="hidden" name="audit_id" value={auditId}/><span>这次回答有帮助吗？</span><button name="feedback" value="up" className="rounded bg-[var(--surface-canvas)] px-2 py-1 hover:text-[var(--accent)]">有帮助</button><button name="feedback" value="down" className="rounded bg-[var(--surface-canvas)] px-2 py-1 hover:text-[var(--accent)]">需要改进</button><input name="source_correction" maxLength={500} className="min-w-40 flex-1 rounded border bg-[var(--surface-canvas)] px-2 py-1" placeholder="来源不该使用/还缺什么？"/></form> : null}</details>;
}
