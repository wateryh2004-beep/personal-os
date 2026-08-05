"use client";

import { useRef } from "react";
import { requestCalendarEvent } from "@/features/calendar/actions";

export function CalendarCreateForm() {
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  return <form action={requestCalendarEvent} onSubmit={() => {
    const form = startInputRef.current?.form;
    if (!form || !startInputRef.current?.value || !endInputRef.current?.value) return;
    const data = new FormData(form);
    data.set("starts_at", new Date(startInputRef.current.value).toISOString());
    data.set("ends_at", new Date(endInputRef.current.value).toISOString());
    const startHidden = form.elements.namedItem("starts_at");
    const endHidden = form.elements.namedItem("ends_at");
    if (startHidden instanceof HTMLInputElement) startHidden.value = String(data.get("starts_at"));
    if (endHidden instanceof HTMLInputElement) endHidden.value = String(data.get("ends_at"));
  }} className="grid gap-3 sm:grid-cols-2">
    <input name="subject" required maxLength={500} placeholder="日程标题" className="border bg-white px-3 py-2 text-sm sm:col-span-2" aria-label="日程标题" />
    <label className="grid gap-1 text-xs text-zinc-600">开始时间<input ref={startInputRef} type="datetime-local" required className="border bg-white px-3 py-2 text-sm text-zinc-900" /></label>
    <label className="grid gap-1 text-xs text-zinc-600">结束时间<input ref={endInputRef} type="datetime-local" required className="border bg-white px-3 py-2 text-sm text-zinc-900" /></label>
    <input type="hidden" name="starts_at" />
    <input type="hidden" name="ends_at" />
    <input name="location_name" maxLength={500} placeholder="地点（可选）" className="border bg-white px-3 py-2 text-sm" />
    <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" name="is_all_day" /> 全天</label>
    <div className="sm:col-span-2"><button className="bg-[#365F78] px-3 py-2 text-sm text-white">创建待确认日程</button></div>
  </form>;
}
