"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteCalendarEvent, updateCalendarEvent, type CalendarCreateState } from "@/features/calendar/actions";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { CalendarCategoryPicker } from "@/components/calendar/calendar-category-picker";
import { dateTimeInputValue, instantToDate, shiftCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";
import type { CalendarCategory } from "@/features/calendar/categories/types";
import { resolveCalendarEventVisual } from "@/features/calendar/categories/visual";

type EditableEvent = { provider_event_id: string; subject: string; body_text: string | null; starts_at: string; ends_at: string; is_all_day: boolean; location_name: string | null; categories: string[]; importance: "low" | "normal" | "high"; show_as: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown"; last_synced_at: string };
const initial: CalendarCreateState = { status: "idle", message: "" };

export function CalendarEventEditForm({ event, timezone, calendarCategories, categoriesEnabled = true, onReconcile }: { event: EditableEvent; timezone: string; calendarCategories: CalendarCategory[]; categoriesEnabled?: boolean; onReconcile?: (kind: "update" | "delete") => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [allDay, setAllDay] = useState(event.is_all_day);
  const [description, setDescription] = useState(event.body_text ?? "");
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const updateHandledRef = useRef(false);
  const deleteHandledRef = useRef(false);
  const [state, action, pending] = useActionState(updateCalendarEvent, initial);
  const [deleteState, deleteAction, deleting] = useActionState(deleteCalendarEvent, initial);
  const visual = resolveCalendarEventVisual(event.categories, calendarCategories);
  useEffect(() => {
    if (state.status !== "success" || updateHandledRef.current) return;
    updateHandledRef.current = true;
    void onReconcile?.("update");
  }, [onReconcile, state.status]);
  useEffect(() => {
    if (deleteState.status !== "success" || deleteHandledRef.current) return;
    deleteHandledRef.current = true;
    void onReconcile?.("delete");
  }, [deleteState.status, onReconcile]);
  const startDate = instantToDate(event.starts_at, timezone);
  const endDate = instantToDate(event.ends_at, timezone);
  const inclusiveEndDate = event.is_all_day ? shiftCalendarDate(endDate, -1) : endDate;
  const allDayEndDate = event.is_all_day ? endDate : shiftCalendarDate(startDate, 1);
  const keepEndAfterStart = () => {
    const start = startRef.current?.value;
    const endInput = endRef.current;
    const end = endInput?.value;
    if (!start || !endInput || !end || end > start) return;
    if (allDay) {
      endInput.value = shiftCalendarDate(start as `${number}-${number}-${number}`, 1);
      return;
    }
    const next = new Date(`${start}:00.000Z`);
    next.setUTCMinutes(next.getUTCMinutes() + 60);
    endInput.value = next.toISOString().slice(0, 16);
  };
  if (!editing || state.status === "success") return <div className="grid gap-4"><section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3.5"><h3 className="text-base font-semibold text-[var(--text-primary)]">{event.subject}</h3><p className="mt-2 text-sm text-zinc-600">{event.is_all_day ? `${startDate}${startDate === inclusiveEndDate ? "" : ` – ${inclusiveEndDate}`}` : `${dateTimeInputValue(event.starts_at, timezone).replace("T", " ")} – ${dateTimeInputValue(event.ends_at, timezone).slice(11)}`}</p>{event.location_name ? <p className="mt-1 text-sm text-zinc-500">{event.location_name}</p> : null}</section>{event.body_text ? <EntityMarkdown body={event.body_text} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-canvas)] px-4 py-3.5 text-sm leading-6 text-[var(--text-secondary)]" /> : null}<div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-canvas)] px-3.5 py-3"><p className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]"><span className="size-2 rounded-full" style={{ background: visual.dot }}/>{visual.primaryCategory?.display_name ?? "未分类"}</p><p className="mt-1 text-[11px] text-[var(--text-tertiary)]">Outlook 已同步 · {new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.last_synced_at))}</p></div>{state.status === "success" ? <p role="status" className="text-sm text-[var(--accent)]">{state.message}</p> : <button onClick={() => { setDescription(event.body_text ?? ""); setEditing(true); }} className="justify-self-start rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">编辑</button>}<form action={deleteAction} onSubmit={(submitEvent) => { if (!window.confirm("确认从 Outlook 删除这条日程？")) submitEvent.preventDefault(); }} className="rounded-[var(--radius-lg)] border border-red-100 bg-red-50/45 px-3.5 py-3"><input type="hidden" name="provider_event_id" value={event.provider_event_id}/><input type="hidden" name="subject" value={event.subject}/><input type="hidden" name="starts_at" value={event.starts_at}/><input type="hidden" name="ends_at" value={event.ends_at}/><input type="hidden" name="is_all_day" value={event.is_all_day ? "on" : ""}/><button disabled={deleting} className="text-sm font-medium text-red-700 hover:underline disabled:opacity-60">{deleting ? "正在删除…" : "删除这条日程"}</button>{deleteState.status === "error" ? <p role="status" className="mt-2 text-sm text-red-700">{deleteState.message}</p> : null}</form></div>;
  return <div className="grid gap-5"><form action={action} onSubmit={(submitEvent) => { const form = submitEvent.currentTarget; const start = form.elements.namedItem("starts_at"); const end = form.elements.namedItem("ends_at"); if (!(start instanceof HTMLInputElement) || !(end instanceof HTMLInputElement) || !startRef.current?.value || !endRef.current?.value) return; start.value = wallTimeToIso(allDay ? `${startRef.current.value}T00:00` : startRef.current.value, timezone); end.value = wallTimeToIso(allDay ? `${endRef.current.value}T00:00` : endRef.current.value, timezone); }} className="grid gap-4"><input type="hidden" name="provider_event_id" value={event.provider_event_id}/><input type="hidden" name="original_subject" value={event.subject}/><input type="hidden" name="original_starts_at" value={event.starts_at}/><input type="hidden" name="original_ends_at" value={event.ends_at}/><input type="hidden" name="starts_at"/><input type="hidden" name="ends_at"/><input type="hidden" name="preserve_categories" value={categoriesEnabled ? "false" : "true"}/><input type="hidden" name="is_all_day_present" value="true"/>
    <label className="grid gap-1 text-xs text-[var(--text-secondary)]">标题<input name="subject" autoFocus required maxLength={500} defaultValue={event.subject} className="h-10 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] px-3 text-sm outline-none focus-visible:border-[var(--accent)] focus-visible:ring-3 focus-visible:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_all_day" checked={allDay} onChange={(input) => setAllDay(input.target.checked)}/> 全天</label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-[var(--text-secondary)]">{allDay ? "开始日期" : "开始"}<input key={`start-${allDay}`} ref={startRef} type={allDay ? "date" : "datetime-local"} required onChange={keepEndAfterStart} defaultValue={allDay ? startDate : dateTimeInputValue(event.starts_at, timezone)} className="h-10 min-w-0 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] px-3 text-sm outline-none focus-visible:border-[var(--accent)] focus-visible:ring-3 focus-visible:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]"/></label><label className="grid gap-1 text-xs text-[var(--text-secondary)]">{allDay ? "结束日期（不含）" : "结束"}<input key={`end-${allDay}`} ref={endRef} type={allDay ? "date" : "datetime-local"} required defaultValue={allDay ? allDayEndDate : dateTimeInputValue(event.ends_at, timezone)} className="h-10 min-w-0 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] px-3 text-sm outline-none focus-visible:border-[var(--accent)] focus-visible:ring-3 focus-visible:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]"/></label></div><label className="grid gap-1 text-xs text-[var(--text-secondary)]">地点<input name="location_name" maxLength={500} defaultValue={event.location_name ?? ""} className="h-10 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] px-3 text-sm outline-none focus-visible:border-[var(--accent)] focus-visible:ring-3 focus-visible:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)]"/></label><label className="grid gap-1 text-xs text-[var(--text-secondary)]">说明<MentionTextarea value={description} onChange={setDescription} name="description" maxLength={10000} rows={4} placeholder="输入 @ 引用笔记/任务/日程/文件" className="min-h-20 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] px-3 py-2 text-sm"/></label><CalendarCategoryPicker defaultCategories={event.categories} enabled={categoriesEnabled} /><details className="rounded-[var(--radius-lg)] border bg-[var(--surface-hover)] p-3.5"><summary className="cursor-pointer text-sm text-[var(--text-secondary)]">更多选项</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-[var(--text-secondary)]">显示为<select name="show_as" defaultValue={event.show_as === "unknown" ? "busy" : event.show_as} className="h-9 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] px-2.5 text-sm"><option value="busy">忙碌</option><option value="free">空闲</option><option value="tentative">暂定</option><option value="workingElsewhere">在其他地点工作</option><option value="oof">外出</option></select></label><label className="grid gap-1 text-xs text-[var(--text-secondary)]">重要性<select name="importance" defaultValue={event.importance} className="h-9 rounded-[var(--radius-md)] border bg-[var(--surface-canvas)] px-2.5 text-sm"><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label></div></details><div className="flex gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-hover)]">取消</button><button disabled={pending} className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60">{pending ? "正在保存…" : "保存更改"}</button></div>{state.status === "error" ? <p role="status" className="text-sm text-[var(--danger)]">{state.message}</p> : null}</form></div>;
}
