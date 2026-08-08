"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";

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
  const sources = steps.flatMap((step) => {
    const output = step.output_json;
    const values = output && Array.isArray(output.sources) ? output.sources : [];
    return values.filter((value): value is { id: string; title: string; domain: string; href?: string | null } => Boolean(value && typeof value === "object" && "id" in value && "title" in value && "domain" in value));
  });
  const unique = [...new Map(sources.map((source) => [`${source.domain}:${source.id}`, source])).values()];
  if (!steps.length) return null;
  return <details className="rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 py-2 text-xs text-[var(--text-secondary)]"><summary className="flex cursor-pointer list-none items-center justify-between font-medium"><span>已检查 {steps.filter((step) => step.step_type !== "context").length || steps.length} 项</span><ChevronDown className="size-3.5" aria-hidden="true" /></summary><div className="mt-2 space-y-1.5">{steps.map((step) => <p key={step.id} className="flex gap-2"><span aria-hidden="true">{step.status === "failed" ? "!" : "✓"}</span><span>{step.title}{step.summary ? ` · ${step.summary}` : ""}</span></p>)}</div>{unique.length ? <div className="mt-3 border-t pt-2"><p className="mb-1.5 font-medium">Sources</p><div className="flex flex-wrap gap-1.5">{unique.map((source) => source.href ? <Link key={`${source.domain}:${source.id}`} href={source.href} className="rounded bg-[var(--surface-canvas)] px-2 py-1 hover:text-[var(--accent)]">{source.title}</Link> : <span key={`${source.domain}:${source.id}`} className="rounded bg-[var(--surface-canvas)] px-2 py-1">{source.title}</span>)}</div></div> : null}</details>;
}
