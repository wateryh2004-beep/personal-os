"use client";

import dynamic from "next/dynamic";
import type { GlobalSearchResult } from "@/features/search/types";
import { workbenchRefSchema, type WorkbenchRef } from "@/features/workbench/contracts";

const WorkbenchEntityView = dynamic(() => import("@/components/workbench/workbench-entity-view").then((module) => module.WorkbenchEntityView), { loading: () => <p role="status" className="command-preview-loading">正在读取预览…</p> });

export function searchResultReference(result: GlobalSearchResult): WorkbenchRef | null {
  const kinds: Record<string, WorkbenchRef["kind"]> = {
    note: "note", document: "document", todo_task: "task", calendar_event: "event", project: "project", career_opportunity: "opportunity", purchase_item: "shopping", trip: "trip", leisure_experience: "leisure",
  };
  const investmentTypes = { investment_account: "account", investment_strategy_version: "strategy", investment_research_run: "research" } as const;
  const investmentType = investmentTypes[result.entityType as keyof typeof investmentTypes];
  const value = workbenchRefSchema.safeParse({ kind: investmentType ? "investment" : kinds[result.entityType], id: result.entityId, ...(investmentType ? { investmentType } : {}) });
  return value.success ? value.data : null;
}

/** Mounted only after explicit preview; all bodies use the existing owner-guarded reader. */
export function SearchResultPreview({ result, onNavigate }: { result: GlobalSearchResult; onNavigate: (event: { preventDefault(): void }) => void }) {
  const reference = searchResultReference(result);
  return reference ? <WorkbenchEntityView key={result.id} entityRef={reference} onNavigate={onNavigate} /> : <div className="command-result-excerpt"><h3>{result.title}</h3>{result.subtitle ? <p>{result.subtitle}</p> : null}<p>{result.snippet || "打开记录查看完整内容。"}</p></div>;
}
