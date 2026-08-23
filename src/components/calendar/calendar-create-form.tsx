"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createCalendarEvent, type CalendarCreateState } from "@/features/calendar/actions";
import { CalendarCategoryPicker } from "@/components/calendar/calendar-category-picker";
import { dateTimeInputValue, instantToDate, shiftCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";
import { classifyCalendarEvent } from "@/features/calendar/classification/classifier";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { getManagedCalendarCategory } from "@/features/calendar/classification/taxonomy";

const initialCalendarCreateState: CalendarCreateState = { status: "idle", message: "" };
const control = "h-9 min-w-0 rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]";

export function CalendarCreateForm({ timezone, categoriesEnabled = true, initialStart, initialEnd, initialAllDay = false, onCreated }: { timezone: string; categoriesEnabled?: boolean; initialStart?: string; initialEnd?: string; initialAllDay?: boolean; onCreated?: () => Promise<void> | void }) {
  const subjectInputRef = useRef<HTMLInputElement>(null);
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
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      subjectInputRef.current?.focus({ preventScroll: true });
    }
  }, []);

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

  return (
    <form action={formAction} onSubmit={(event) => {
      const form = event.currentTarget;
      const startsAt = form.elements.namedItem("starts_at");
      const endsAt = form.elements.namedItem("ends_at");
      if (!(startsAt instanceof HTMLInputElement) || !(endsAt instanceof HTMLInputElement) || !startInputRef.current?.value || !endInputRef.current?.value) return;
      startsAt.value = wallTimeToIso(allDay ? `${startInputRef.current.value}T00:00` : startInputRef.current.value, timezone);
      endsAt.value = wallTimeToIso(allDay ? `${endInputRef.current.value}T00:00` : endInputRef.current.value, timezone);
    }} className="calendar-event-form grid gap-0">
      <div className="border-b border-[var(--border-subtle)] pb-4">
        <input ref={subjectInputRef} name="subject" required maxLength={500} placeholder="日程标题" value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full border-0 bg-transparent px-0 text-[19px] font-semibold tracking-[-0.025em] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]" />
        <input name="location_name" maxLength={500} placeholder="添加地点" value={location} onChange={(event) => setLocation(event.target.value)} className="mt-2 w-full border-0 bg-transparent px-0 text-[12px] text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-tertiary)]" />
      </div>

      <section className="border-b border-[var(--border-subtle)] py-4">
        <label className="flex items-center justify-between gap-4 text-sm text-[var(--text-primary)]"><span>全天</span><input type="checkbox" name="is_all_day" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} className="size-4 accent-[var(--accent)]" /></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">{allDay ? "开始日期" : "开始"}<input key={`start-${allDay}`} ref={startInputRef} type={allDay ? "date" : "datetime-local"} required onChange={keepEndAfterStart} defaultValue={allDay ? defaultStartDate : defaultStart} className={control} /></label>
          <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">{allDay ? "结束日期（不含）" : "结束"}<input key={`end-${allDay}`} ref={endInputRef} type={allDay ? "date" : "datetime-local"} required defaultValue={allDay ? allDayEndDate : defaultEnd} className={control} /></label>
        </div>
        <input type="hidden" name="starts_at" /><input type="hidden" name="ends_at" />
      </section>

      <section className="border-b border-[var(--border-subtle)] py-4">
        <CalendarCategoryPicker enabled={categoriesEnabled} onModeChange={setCategoryMode} />
        {autoClassification ? (() => {
          const primary = getManagedCalendarCategory(autoClassification.primaryCategoryKey);
          const contexts = autoClassification.contextCategoryKeys.map((key) => getManagedCalendarCategory(key)?.shortName).filter(Boolean) as string[];
          if (!autoClassification.needsConfirmation) {
            const parts = [primary?.shortName, ...contexts].filter(Boolean) as string[];
            return <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-[var(--text-tertiary)]"><span className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />自动判断：{parts.join(" · ") || "其他"} · {Math.round(autoClassification.confidence * 100)}%</p>;
          }
          return <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-[var(--text-tertiary)]"><span className="size-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />低置信度，暂不自动归类</p>;
        })() : null}
      </section>

      <details className="border-b border-[var(--border-subtle)] py-4">
        <summary className="cursor-pointer list-none text-[12px] font-medium text-[var(--text-secondary)]">更多选项</summary>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">说明<MentionTextarea value={description} onChange={setDescription} name="description" maxLength={10000} rows={4} placeholder="议程、链接或准备事项；输入 @ 引用笔记/任务/日程/文件" className="min-h-24 w-full resize-y rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-3 py-2.5 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">显示为<select name="show_as" defaultValue="busy" className={control}><option value="busy">忙碌</option><option value="free">空闲</option><option value="tentative">暂定</option><option value="workingElsewhere">在其他地点工作</option><option value="oof">外出</option></select></label>
            <label className="grid gap-1.5 text-[11px] text-[var(--text-tertiary)]">重要性<select name="importance" defaultValue="normal" className={control}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label>
          </div>
        </div>
      </details>

      <div className="pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-[var(--text-tertiary)]">按 {timezone} 保存并同步至 Outlook</p>
          <button disabled={pending} className="rounded-[8px] bg-[var(--accent)] px-3.5 py-2 text-[12px] font-medium text-white transition-opacity ui-transition hover:opacity-90 disabled:opacity-60">{pending ? "正在创建…" : "创建日程"}</button>
        </div>
        {state.status !== "idle" ? <p role="status" className={`mt-2 text-[11px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{state.message}</p> : null}
      </div>
    </form>
  );
}
