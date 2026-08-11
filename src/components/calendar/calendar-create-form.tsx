"use client";

import { useActionState, useRef } from "react";
import { createCalendarEvent, type CalendarCreateState } from "@/features/calendar/actions";
import { CalendarCategoryPicker } from "@/components/calendar/calendar-category-picker";
import { dateTimeInputValue, wallTimeToIso } from "@/features/calendar/timezone";

const initialCalendarCreateState: CalendarCreateState = { status: "idle", message: "" };

export function CalendarCreateForm({ timezone, categoriesEnabled = true, initialStart, initialEnd, initialAllDay = false }: { timezone: string; categoriesEnabled?: boolean; initialStart?: string; initialEnd?: string; initialAllDay?: boolean }) {
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(createCalendarEvent, initialCalendarCreateState);
  const defaultStart = initialStart ? dateTimeInputValue(initialStart, timezone) : "";
  const defaultEnd = initialEnd ? dateTimeInputValue(initialEnd, timezone) : "";
  return <form action={formAction} onSubmit={(event) => {
    const form = event.currentTarget;
    const startsAt = form.elements.namedItem("starts_at");
    const endsAt = form.elements.namedItem("ends_at");
    if (startsAt instanceof HTMLInputElement && startInputRef.current?.value) startsAt.value = wallTimeToIso(startInputRef.current.value, timezone);
    if (endsAt instanceof HTMLInputElement && endInputRef.current?.value) endsAt.value = wallTimeToIso(endInputRef.current.value, timezone);
  }} className="grid gap-4">
    <label className="grid gap-1 text-xs text-zinc-600">标题<input name="subject" autoFocus required maxLength={500} placeholder="日程标题" className="h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]" /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-zinc-600">开始<input ref={startInputRef} type="datetime-local" required defaultValue={defaultStart} className="h-10 min-w-0 rounded-md border bg-white px-3 text-sm" /></label><label className="grid gap-1 text-xs text-zinc-600">结束<input ref={endInputRef} type="datetime-local" required defaultValue={defaultEnd} className="h-10 min-w-0 rounded-md border bg-white px-3 text-sm" /></label></div>
    <input type="hidden" name="starts_at" /><input type="hidden" name="ends_at" />
    <input name="location_name" maxLength={500} placeholder="地点（可选）" className="h-10 w-full rounded-md border bg-white px-3 text-sm" />
    <label className="grid gap-1 text-xs text-zinc-600">说明（可选）<textarea name="description" maxLength={10000} rows={3} placeholder="议程、链接或准备事项" className="w-full resize-y rounded-md border bg-white px-3 py-2 text-sm leading-5" /></label>
    <CalendarCategoryPicker enabled={categoriesEnabled} />
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-zinc-600">显示为<select name="show_as" defaultValue="busy" className="h-9 rounded-md border bg-white px-2 text-sm"><option value="busy">忙碌</option><option value="free">空闲</option><option value="tentative">暂定</option><option value="workingElsewhere">在其他地点工作</option><option value="oof">外出</option></select></label><label className="grid gap-1 text-xs text-zinc-600">重要性<select name="importance" defaultValue="normal" className="h-9 rounded-md border bg-white px-2 text-sm"><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label></div>
    <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" name="is_all_day" defaultChecked={initialAllDay} /> 全天</label>
    <p className="text-xs text-zinc-500">时间按 {timezone} 保存；确认创建后同步至 Outlook。</p>
    <div><button disabled={pending} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-60">{pending ? "正在创建…" : "创建日程"}</button>{state.status !== "idle" ? <p role="status" className={`mt-2 text-xs ${state.status === "success" ? "text-[var(--accent)]" : "text-red-700"}`}>{state.message}</p> : null}</div>
  </form>;
}
