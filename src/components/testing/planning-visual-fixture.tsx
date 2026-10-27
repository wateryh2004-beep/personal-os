"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";
import type { ProjectPresentation } from "@/components/projects/project-progress";
import { CalendarFullView } from "@/components/calendar/calendar-full-view";
import { CalendarPendingTasks } from "@/components/calendar/calendar-pending-tasks";
import { calendarDragPreview } from "@/components/calendar/calendar-drag-preview";
import calendarStyles from "@/components/calendar/calendar-native.module.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CalendarEventRecord } from "@/features/calendar/types";
import type { CalendarCategory } from "@/features/calendar/categories/types";
import { useFixtureTextScale } from "./use-fixture-text-scale";

const projects: ProjectPresentation[] = [
  { id: "80000000-0000-4000-8000-000000000001", name: "把学习记录变成清楚的知识脉络", description: "整理本月学习记录，保留原文与来源。\n完成标准：每条关键判断都能找到依据，后续行动明确。", status: "active", due_date: "2026-11-08", updated_at: "2026-10-26T01:00:00Z" },
  { id: "80000000-0000-4000-8000-000000000002", name: "完成一次有依据的项目复盘", description: "核对问题、判断、结果和限制，整理相关笔记与文件。", status: "active", due_date: "2026-11-02", updated_at: "2026-10-25T01:00:00Z" },
  { id: "80000000-0000-4000-8000-000000000003", name: "旅行资料与票据归档", description: "保留原件、目的地和实际出行记录。", status: "completed", due_date: null, updated_at: "2026-10-24T01:00:00Z" },
  { id: "80000000-0000-4000-8000-000000000004", name: "等待补充信息的长期阅读计划", description: null, status: "on_hold", due_date: null, updated_at: "2026-10-22T01:00:00Z" },
];
const event = (id: string, subject: string, start: string, end: string): CalendarEventRecord => ({ id, provider_event_id: id, subject, body_text: null, starts_at: `2026-10-26T${start}:00Z`, ends_at: `2026-10-26T${end}:00Z`, is_all_day: false, location_name: null, categories: [], importance: "normal", show_as: "busy", last_synced_at: "2026-10-26T00:00:00Z" });
const events = [event("80000000-0000-4000-8000-000000000011", "核对项目资料", "01:00", "02:00"), event("80000000-0000-4000-8000-000000000012", "项目讨论", "03:00", "04:00")];
const initialDate = new Date("2026-10-26T01:00:00Z");
const categories: CalendarCategory[] = [];
type Preview = { title: string; startsAt: string; endsAt: string; eventId?: string };

/** Gated synthetic composition only. It performs no provider or database mutation. */
export function PlanningVisualFixture({ mode = "projects", textScale }: { mode?: string; textScale?: "200" }) {
  useFixtureTextScale(textScale);
  const [records, setRecords] = useState(projects);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewCount, setPreviewCount] = useState(0);
  const openPreview = (next: Preview) => { setPreview(next); setPreviewCount(count => count + 1); };
  const hint = preview ? calendarDragPreview(events, preview) : null;
  return <WorkspaceIdentityBoundary ownerId="synthetic-planning-owner" revision="planning-visual-fixture-v1"><AppShell presentationPathname={mode === "calendar" ? "/calendar" : "/projects"}>
    <div data-testid="planning-visual-fixture" className="mx-auto min-w-0 max-w-6xl p-4 sm:p-6">
      <p className="mb-4 text-xs text-[var(--text-secondary)]">合成场景 · 不连接个人资料或 Outlook</p>
      {mode === "calendar" ? <>
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--separator)]" style={{ height: "max(580px, calc(100dvh - 210px))" }}>
          <CalendarPendingTasks onSchedule={task => openPreview({ title: task.title, startsAt: "2026-10-26T02:00:00Z", endsAt: "2026-10-26T02:45:00Z" })} />
          <CalendarFullView events={events} categories={categories} timezone="Asia/Shanghai" initialView="timeGridDay" initialDate={initialDate} onOpen={record => openPreview({ title: record.subject, startsAt: record.starts_at, endsAt: record.ends_at, eventId: record.id })} onCreate={range => openPreview({ title: "新日程", ...range })} onMove={async (record, range) => openPreview({ title: record.subject, ...range, eventId: record.id })} onTaskDrop={(task, startsAt) => { if (task.minutes !== null) openPreview({ title: task.title, startsAt, endsAt: new Date(Date.parse(startsAt) + task.minutes * 60_000).toISOString() }); }} onRangeChange={() => {}} loadingRange={false} />
        </div>
        <output data-testid="planning-preview-count" className="sr-only">{previewCount}</output>
        <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent><DialogHeader><DialogTitle>拖放预览</DialogTitle><DialogDescription>合成场景；取消不会创建或移动日程。</DialogDescription></DialogHeader>{preview ? <><p>{preview.title}</p><p data-testid="planning-preview-range">{preview.startsAt} — {preview.endsAt}</p><p>已载入日程重叠 {hint?.overlaps.length ?? 0} 项</p><div className={calendarStyles.moveActions}><Button variant="outline" onClick={() => setPreview(null)}>取消</Button></div></> : null}</DialogContent></Dialog>
      </> : <>
        <ProjectsWorkspace projects={records} />
        <div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--separator)] pt-4"><Button variant="outline" onClick={() => setRecords(value => value.map((record, index) => index === 0 ? { ...record, status: record.status === "completed" ? "active" : "completed" } : record))}>模拟已确认的项目状态更新</Button><p className="text-xs text-[var(--text-secondary)]">仅修改此合成场景的输入，用于验证状态过渡。</p></div>
      </>}
    </div>
  </AppShell></WorkspaceIdentityBoundary>;
}
