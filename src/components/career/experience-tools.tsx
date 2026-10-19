"use client";
import dynamic from "next/dynamic";
import { Activity, useState } from "react";
import { DisclosureSummary } from "@/components/ui/disclosure";
import type { getExperienceGraph } from "@/features/graph/queries";

const RelatedPanel = dynamic(() => import("./related-panel").then(module => module.RelatedPanel));
const CareerAssistant = dynamic(() => import("./career-assistant").then(module => module.CareerAssistant));
export function ExperienceTools({ experienceId, graph }: { experienceId: string; graph: Awaited<ReturnType<typeof getExperienceGraph>> }) {
  const [opened, setOpened] = useState(false);
  const [active, setActive] = useState(false);
  return <details className="border-t border-[var(--separator)] pt-5" onToggle={event => { const next = event.currentTarget.open; if (next) setOpened(true); setActive(next); }}><DisclosureSummary>关联内容与辅助整理</DisclosureSummary>{opened ? <Activity mode={active ? "visible" : "hidden"}><RelatedPanel experienceId={experienceId} related={graph.related} suggestions={graph.suggestions} /><CareerAssistant experienceId={experienceId} /></Activity> : null}</details>;
}
