"use client";
import { useRef, type ReactNode } from "react";
import { useDomainViewAdapter, waitForViewLayout } from "@/features/workbench/domain-adapters/use-domain-view-adapter";
/** Only known tag IDs and disclosure geometry are captured, never practice text. */
export function InsightDisclosures({ tags, contextId, children }: { tags: string[]; contextId: string | null; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const permitted = new Set(["trends", ...tags]);
  const nodes = () => [...root.current?.querySelectorAll<HTMLDetailsElement>("details[data-insight-tag]") ?? []].filter(node => permitted.has(node.dataset.insightTag ?? ""));
  useDomainViewAdapter({ kind: "career", pathname: "/career/interview/insights", ready: true,
    capture: () => ({ kind: "career", pathname: "/career/interview/insights", contextId, expandedIds: [], selectedId: null, scroll: {}, insightTags: nodes().filter(node => node.open).map(node => node.dataset.insightTag!).slice(0, 20) }),
    restore: async (state, context) => {
      if (!context.current()) return { status: "cancelled" };
      const wanted = new Set(state.insightTags ?? []), live = nodes();
      live.forEach(node => { node.open = wanted.has(node.dataset.insightTag!); });
      if (!await waitForViewLayout(context)) return { status: "cancelled" };
      return [...wanted].every(tag => live.some(node => node.dataset.insightTag === tag)) ? { status: "applied" } : { status: "partial", reason: "missing-record" };
    },
  });
  return <div ref={root} className="contents">{children}</div>;
}
