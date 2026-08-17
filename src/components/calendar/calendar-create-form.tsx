"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCalendarEvent, type CalendarCreateState } from "@/features/calendar/actions";
import { CalendarCategoryPicker } from "@/components/calendar/calendar-category-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dateTimeInputValue, instantToDate, shiftCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";

const initialCalendarCreateState: CalendarCreateState = { status: "idle", message: "" };

export function CalendarCreateForm({ timezone, categoriesEnabled = true, initialStart, initialEnd, initialAllDay = false, onCreated }: { timezone: string; categoriesEnabled?: boolean; initialStart?: string; initialEnd?: string; initialAllDay?: boolean; onCreated?: () => Promise<void> | void }) {
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const createdHandledRef = useRef(false);
  const [allDay, setAllDay] = useState(initialAllDay);
  const [state, formAction, pending] = useActionState(createCalendarEvent, initialCalendarCreateState);
  useEffect(() => {
    if (state.status !== "success" || createdHandledRef.current) return;
    createdHandledRef.current = true;
    void onCreated?.();
  }, [onCreated, state.status]);
  const defaultStart = initialStart ? dateTimeInputValue(initialStart, timezone) : "";
  const defaultEnd = initialEnd ? dateTimeInputValue(initialEnd, timezone) : "";
  const defaultStartDate = initialStart ? instantToDate(initialStart, timezone) : "";
  const defaultEndDate = initialEnd ? instantToDate(initialEnd, timezone) : defaultStartDate ? shiftCalendarDate(defaultStartDate, 1) : "";
  const allDayEndDate = initialAllDay ? defaultEndDate : defaultStartDate ? shiftCalendarDate(defaultStartDate, 1) : "";
  const keepEndAfterStart = () => {
    const start = startInputRef.current?.value;
    const endInput = endInputRef.current;
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
  return <form action={formAction} onSubmit={(event) => {
    const form = event.currentTarget;
    const startsAt = form.elements.namedItem("starts_at");
    const endsAt = form.elements.namedItem("ends_at");
    if (!(startsAt instanceof HTMLInputElement) || !(endsAt instanceof HTMLInputElement) || !startInputRef.current?.value || !endInputRef.current?.value) return;
    startsAt.value = wallTimeToIso(allDay ? `${startInputRef.current.value}T00:00` : startInputRef.current.value, timezone);
    endsAt.value = wallTimeToIso(allDay ? `${endInputRef.current.value}T00:00` : endInputRef.current.value, timezone);
  }} className="grid gap-4">
    <label className="grid gap-1 text-xs text-[var(--text-secondary)]">标题<Input name="subject" autoFocus required maxLength={500} placeholder="日程标题" /></label>
    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" name="is_all_day" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /> 全天</label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-[var(--text-secondary)]">{allDay ? "开始日期" : "开始"}<Input key={`start-${allDay}`} ref={startInputRef} type={allDay ? "date" : "datetime-local"} required onChange={keepEndAfterStart} defaultValue={allDay ? defaultStartDate : defaultStart} /></label><label className="grid gap-1 text-xs text-[var(--text-secondary)]">{allDay ? "结束日期（不含）" : "结束"}<Input key={`end-${allDay}`} ref={endInputRef} type={allDay ? "date" : "datetime-local"} required defaultValue={allDay ? allDayEndDate : defaultEnd} /></label></div>
    <input type="hidden" name="starts_at" /><input type="hidden" name="ends_at" />
    <div className="grid gap-3 sm:grid-cols-2"><Input name="location_name" maxLength={500} placeholder="地点（可选）" /><CalendarCategoryPicker enabled={categoriesEnabled} /></div>
    <details className="rounded-[var(--radius-md)] border p-3"><summary className="cursor-pointer text-sm text-[var(--text-secondary)]">更多选项</summary><div className="mt-3 grid gap-3"><label className="grid gap-1 text-xs text-[var(--text-secondary)]">说明（可选）<Textarea name="description" maxLength={10000} rows={3} placeholder="议程、链接或准备事项" className="resize-y" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-[var(--text-secondary)]">显示为<select name="show_as" defaultValue="busy" className="h-8 rounded-[var(--radius-md)] border border-input bg-transparent px-2.5 text-sm"><option value="busy">忙碌</option><option value="free">空闲</option><option value="tentative">暂定</option><option value="workingElsewhere">在其他地点工作</option><option value="oof">外出</option></select></label><label className="grid gap-1 text-xs text-[var(--text-secondary)]">重要性<select name="importance" defaultValue="normal" className="h-8 rounded-[var(--radius-md)] border border-input bg-transparent px-2.5 text-sm"><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label></div></div></details>
    <p className="text-xs text-[var(--text-tertiary)]">时间按 {timezone} 保存；确认创建后同步至 Outlook。</p>
    <div><Button disabled={pending}>{pending ? "正在创建…" : "创建日程"}</Button>{state.status !== "idle" ? <p role="status" className={`mt-2 text-xs ${state.status === "success" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>{state.message}</p> : null}</div>
  </form>;
}
