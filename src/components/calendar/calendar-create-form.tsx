"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createCalendarEvent, type CalendarCreateState } from "@/features/calendar/actions";
import { CalendarCategoryPicker } from "@/components/calendar/calendar-category-picker";
import { dateTimeInputValue, instantToDate, shiftCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";
import { classifyCalendarEvent } from "@/features/calendar/classification/classifier";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { getManagedCalendarCategory } from "@/features/calendar/classification/taxonomy";

const initialCalendarCreateState: CalendarCreateState = { status: "idle", message: "" };

export function CalendarCreateForm({ timezone, categoriesEnabled = true, initialStart, initialEnd, initialAllDay = false, onCreated }: { timezone: string; categoriesEnabled?: boolean; initialStart?: string; initialEnd?: string; initialAllDay?: boolean; onCreated?: () => Promise<void> | void }) {
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const createdHandledRef = useRef(false);
  const [allDay, setAllDay] = useState(initialAllDay);
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [categoryMode, setCategoryMode] = useState("__auto");
  const [state, formAction, pending] = useActionState(createCalendarEvent, initialCalendarCreateState);
  const autoClassification = useMemo(() => {
    if (!categoriesEnabled || categoryMode !== "__auto" || !subject.trim()) return null;
    return classifyCalendarEvent({ subject, locationName: location });
  }, [categoriesEnabled, categoryMode, subject, location]);
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
    <label className="grid gap-1 text-xs text-zinc-600">标题<input name="subject" autoFocus required maxLength={500} placeholder="日程标题" value={subject} onChange={(event) => setSubject(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]" /></label>
    <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" name="is_all_day" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /> 全天</label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-zinc-600">{allDay ? "开始日期" : "开始"}<input key={`start-${allDay}`} ref={startInputRef} type={allDay ? "date" : "datetime-local"} required onChange={keepEndAfterStart} defaultValue={allDay ? defaultStartDate : defaultStart} className="h-10 min-w-0 rounded-md border bg-white px-3 text-sm" /></label><label className="grid gap-1 text-xs text-zinc-600">{allDay ? "结束日期（不含）" : "结束"}<input key={`end-${allDay}`} ref={endInputRef} type={allDay ? "date" : "datetime-local"} required defaultValue={allDay ? allDayEndDate : defaultEnd} className="h-10 min-w-0 rounded-md border bg-white px-3 text-sm" /></label></div>
    <input type="hidden" name="starts_at" /><input type="hidden" name="ends_at" />
    <div className="grid gap-3 sm:grid-cols-2"><input name="location_name" maxLength={500} placeholder="地点（可选）" value={location} onChange={(event) => setLocation(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm" /><CalendarCategoryPicker enabled={categoriesEnabled} onModeChange={setCategoryMode} /></div>
    {autoClassification ? (() => {
      const primary = getManagedCalendarCategory(autoClassification.primaryCategoryKey);
      const contexts = autoClassification.contextCategoryKeys.map((key) => getManagedCalendarCategory(key)?.shortName).filter(Boolean) as string[];
      if (!autoClassification.needsConfirmation) {
        const parts = [primary?.shortName, ...contexts].filter(Boolean) as string[];
        return <p className="-mt-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><span className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />自动判断：{parts.join(" · ") || "其他"}（置信度 {Math.round(autoClassification.confidence * 100)}%）</p>;
      }
      return <p className="-mt-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><span className="size-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />自动判断：暂不归类（低置信度，创建后可到分类设置整理）</p>;
    })() : null}
    <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm text-zinc-600">更多选项</summary><div className="mt-3 grid gap-3"><label className="grid gap-1 text-xs text-zinc-600">说明（可选）<MentionTextarea value={description} onChange={setDescription} name="description" maxLength={10000} rows={3} placeholder="议程、链接或准备事项；输入 @ 引用笔记/任务/日程/文件" className="w-full resize-y rounded-md border bg-white px-3 py-2 text-sm leading-5" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-zinc-600">显示为<select name="show_as" defaultValue="busy" className="h-9 rounded-md border bg-white px-2 text-sm"><option value="busy">忙碌</option><option value="free">空闲</option><option value="tentative">暂定</option><option value="workingElsewhere">在其他地点工作</option><option value="oof">外出</option></select></label><label className="grid gap-1 text-xs text-zinc-600">重要性<select name="importance" defaultValue="normal" className="h-9 rounded-md border bg-white px-2 text-sm"><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label></div></div></details>
    <p className="text-xs text-zinc-500">时间按 {timezone} 保存；确认创建后同步至 Outlook。</p>
    <div><button disabled={pending} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-60">{pending ? "正在创建…" : "创建日程"}</button>{state.status !== "idle" ? <p role="status" className={`mt-2 text-xs ${state.status === "success" ? "text-[var(--accent)]" : "text-red-700"}`}>{state.message}</p> : null}</div>
  </form>;
}
