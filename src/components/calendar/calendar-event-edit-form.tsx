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
const control = "h-9 min-w-0 rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]";

export function CalendarEventEditForm({ event, timezone, calendarCategories, categoriesEnabled = true, onReconcile }: { event: EditableEvent; timezone: string; calendarCategories: CalendarCategory[]; categoriesEnabled?: boolean; onReconcile?: (kind: "update" | "delete") => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [allDay, setAllDay] = useState(event.is_all_day);
  const [description, setDescription] = useState(event.body_text ?? "");
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const updateHandledRef = useRef(false);
  const deleteHandledRef = useRef(false);
  const [state, action, pending] = useActionState(updateCalendarEvent, initial);
  const [deleteState, deleteAction, deleting] = useActionState(deleteCalendarEvent, initial);
  const visual = resolveCalendarEventVisual(event.categories, calendarCategories);

  useEffect(() => {
    if (!editing || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    subjectInputRef.current?.focus({ preventScroll: true });
  }, [editing]);

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

  if (!editing || state.status === "success") {
    const dateLabel = event.is_all_day
      ? `${startDate}${startDate === inclusiveEndDate ? "" : ` – ${inclusiveEndDate}`}`
      : `${dateTimeInputValue(event.starts_at, timezone).replace("T", " ")} – ${dateTimeInputValue(event.ends_at, timezone).slice(11)}`;
    return (
      <div className="grid gap-0">
        <section className="border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-2 size-2 shrink-0 rounded-full" style={{ background: visual.dot }} />
            <div className="min-w-0">
              <h3 className="text-[19px] font-semibold leading-7 tracking-[-0.025em] text-[var(--text-primary)]">{event.subject || "未命名日程"}</h3>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{dateLabel}</p>
              {event.location_name ? <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{event.location_name}</p> : null}
            </div>
          </div>
        </section>

        {event.body_text ? <section className="border-b border-[var(--border-subtle)] py-4"><p className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">说明</p><EntityMarkdown body={event.body_text} className="text-sm leading-6 text-[var(--text-secondary)]" /></section> : null}

        <section className="border-b border-[var(--border-subtle)] py-4 text-[12px]">
          <div className="flex items-center justify-between gap-3"><span className="text-[var(--text-tertiary)]">分类</span><span className="font-medium text-[var(--text-primary)]">{visual.primaryCategory?.display_name ?? "未分类"}</span></div>
          <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[var(--text-tertiary)]">Outlook</span><span className="text-right text-[var(--text-secondary)]">{new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.last_synced_at))} 同步</span></div>
        </section>

        <div className="flex items-center justify-between py-4">
          {state.status === "success" ? <p role="status" className="text-[11px] text-[var(--success)]">{state.message}</p> : <button onClick={() => { setDescription(event.body_text ?? ""); setEditing(true); }} className="rounded-[7px] px-2 py-1.5 text-[12px] font-medium text-[var(--accent)] transition-colors ui-transition hover:bg-[var(--accent-soft)]">编辑日程</button>}
          <form action={deleteAction} onSubmit={(submitEvent) => { if (!window.confirm("确认从 Outlook 删除这条日程？")) submitEvent.preventDefault(); }}>
            <input type="hidden" name="provider_event_id" value={event.provider_event_id}/><input type="hidden" name="subject" value={event.subject}/><input type="hidden" name="starts_at" value={event.starts_at}/><input type="hidden" name="ends_at" value={event.ends_at}/><input type="hidden" name="is_all_day" value={event.is_all_day ? "on" : ""}/>
            <button disabled={deleting} className="rounded-[7px] px-2 py-1.5 text-[11px] text-[var(--danger)] transition-colors ui-transition hover:bg-[rgba(215,0,21,.06)] disabled:opacity-50">{deleting ? "正在删除…" : "删除"}</button>
          </form>
        </div>
        {deleteState.status === "error" ? <p role="status" className="text-[11px] text-[var(--danger)]">{deleteState.message}</p> : null}
      </div>
    );
  }

  return (
    <form action={action} onSubmit={(submitEvent) => {
      const form = submitEvent.currentTarget;
      const start = form.elements.namedItem("starts_at");
      const end = form.elements.namedItem("ends_at");
      if (!(start instanceof HTMLInputElement) || !(end instanceof HTMLInputElement) || !startRef.current?.value || !endRef.current?.value) return;
      start.value = wallTimeToIso(allDay ? `${startRef.current.value}T00:00` : startRef.current.value, timezone);
      end.value = wallTimeToIso(allDay ? `${endRef.current.value}T00:00` : endRef.current.value, timezone);
    }} className="grid gap-0">
      <input type="hidden" name="provider_event_id" value={event.provider_event_id}/><input type="hidden" name="original_subject" value={event.subject}/><input type="hidden" name="original_starts_at" value={event.starts_at}/><input type="hidden" name="original_ends_at" value={event.ends_at}/><input type="hidden" name="starts_at"/><input type="hidden" name="ends_at"/><input type="hidden" name="preserve_categories" value={categoriesEnabled ? "false" : "true"}/><input type="hidden" name="is_all_day_present" value="true"/>

      <section className="border-b border-[var(--border-subtle)] pb-4">
        <input ref={subjectInputRef} name="subject" required maxLength={500} defaultValue={event.subject} className="w-full border-0 bg-transparent px-0 text-[19px] font-semibold tracking-[-0.025em] text-[var(--text-primary)] outline-none" />
        <input name="location_name" maxLength={500} defaultValue={event.location_name ?? ""} placeholder="添加地点" className="mt-2 w-full border-0 bg-transparent px-0 text-[12px] text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-tertiary)]" />
      </section>

      <section className="border-b border-[var(--border-subtle)] py-4">
        <label className="flex items-center justify-between gap-4 text-sm text-[var(--text-primary)]"><span>全天</span><input type="checkbox" name="is_all_day" checked={allDay} onChange={(input) => setAllDay(input.target.checked)} className="size-4 accent-[var(--accent)]" /></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">{allDay ? "开始日期" : "开始"}<input key={`start-${allDay}`} ref={startRef} type={allDay ? "date" : "datetime-local"} required onChange={keepEndAfterStart} defaultValue={allDay ? startDate : dateTimeInputValue(event.starts_at, timezone)} className={control}/></label>
          <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">{allDay ? "结束日期（不含）" : "结束"}<input key={`end-${allDay}`} ref={endRef} type={allDay ? "date" : "datetime-local"} required defaultValue={allDay ? allDayEndDate : dateTimeInputValue(event.ends_at, timezone)} className={control}/></label>
        </div>
      </section>

      <section className="border-b border-[var(--border-subtle)] py-4">
        <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">说明<MentionTextarea value={description} onChange={setDescription} name="description" maxLength={10000} rows={4} placeholder="输入 @ 引用笔记/任务/日程/文件" className="min-h-24 rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-3 py-2.5 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]"/></label>
      </section>

      <section className="border-b border-[var(--border-subtle)] py-4"><CalendarCategoryPicker defaultCategories={event.categories} enabled={categoriesEnabled} /></section>

      <details className="border-b border-[var(--border-subtle)] py-4">
        <summary className="cursor-pointer list-none text-[12px] font-medium text-[var(--text-secondary)]">更多选项</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">显示为<select name="show_as" defaultValue={event.show_as === "unknown" ? "busy" : event.show_as} className={control}><option value="busy">忙碌</option><option value="free">空闲</option><option value="tentative">暂定</option><option value="workingElsewhere">在其他地点工作</option><option value="oof">外出</option></select></label>
          <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">重要性<select name="importance" defaultValue={event.importance} className={control}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label>
        </div>
      </details>

      <div className="flex items-center justify-end gap-2 pt-4">
        <button type="button" onClick={() => setEditing(false)} className="rounded-[8px] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors ui-transition hover:bg-[var(--surface-hover)]">取消</button>
        <button disabled={pending} className="rounded-[8px] bg-[var(--accent)] px-3.5 py-2 text-[12px] font-medium text-white transition-opacity ui-transition hover:opacity-90 disabled:opacity-60">{pending ? "正在保存…" : "保存"}</button>
      </div>
      {state.status === "error" ? <p role="status" className="mt-2 text-[11px] text-[var(--danger)]">{state.message}</p> : null}
    </form>
  );
}
