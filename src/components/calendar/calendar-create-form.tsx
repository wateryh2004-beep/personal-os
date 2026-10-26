"use client";

import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createCalendarEvent, type CalendarCreateState } from "@/features/calendar/actions";
import { readCalendarScheduleConflicts } from "@/features/workbench/operation-read-resource";
import { CalendarCategoryPicker } from "@/components/calendar/calendar-category-picker";
import { dateTimeInputValue, instantToDate, shiftCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";
import { classifyCalendarEvent } from "@/features/calendar/classification/classifier";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { getManagedCalendarCategory } from "@/features/calendar/classification/taxonomy";

const initialCalendarCreateState: CalendarCreateState = { status: "idle", message: "" };
const control = "ui-field h-9 min-w-0 rounded-[9px] border-0 bg-[var(--surface-control)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";

export function CalendarCreateForm({ timezone, categoriesEnabled = true, initialStart, initialEnd, initialAllDay = false, initialSubject = "", initialDescription = "", sourceTask, onCreated, onDirty, onPending }: { timezone: string; categoriesEnabled?: boolean; initialStart?: string; initialEnd?: string; initialAllDay?: boolean; initialSubject?:string; initialDescription?:string; sourceTask?:{id:string;modified:string|null}; onCreated?: () => Promise<void> | void; onDirty?: () => void; onPending?: (pending: boolean) => void }) {
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const createdHandledRef = useRef(false);
  const inFlightRef=useRef(false);
  const [allDay, setAllDay] = useState(initialAllDay);
  const [timeError,setTimeError]=useState("");
  const [bounds,setBounds]=useState({startsAt:initialStart??"",endsAt:initialEnd??""});
  const [conflicts,setConflicts]=useState<{state:"loading"|"ready"|"error";count:number;titles:string[]}>({state:"loading",count:0,titles:[]});
  useEffect(()=>{if(!bounds.startsAt||!bounds.endsAt)return;let active=true;const controller=new AbortController();const current=captureWorkspaceScope();const timer=window.setTimeout(()=>{void readCalendarScheduleConflicts(bounds,controller.signal).then(value=>{if(active&&current())setConflicts({state:"ready",count:value.events.length,titles:value.events.map(event=>event.subject)});}).catch(()=>{if(active&&current())setConflicts({state:"error",count:0,titles:[]});});},200);return()=>{active=false;controller.abort();window.clearTimeout(timer);};},[bounds]);
  const updateConflictBounds=()=>{if(!startInputRef.current?.value||!endInputRef.current?.value)return;try{setConflicts({state:"loading",count:0,titles:[]});setTimeError("");setBounds({startsAt:wallTimeToIso(allDay?`${startInputRef.current.value}T00:00`:startInputRef.current.value,timezone),endsAt:wallTimeToIso(allDay?`${endInputRef.current.value}T00:00`:endInputRef.current.value,timezone)});}catch{setConflicts({state:"error",count:0,titles:[]});}};

  const [subject, setSubject] = useState(initialSubject);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState(initialDescription);
  const request=useRef<{hash:string;id:string}|null>(null);
  const requestInput=useRef<HTMLInputElement>(null);
  const [categoryMode, setCategoryMode] = useState("__auto");
  const [state, formAction, pending] = useActionState(createCalendarEvent, initialCalendarCreateState);
  useEffect(()=>{inFlightRef.current=pending;onPending?.(pending);},[pending,onPending]);
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
    <form action={formAction} onChangeCapture={onDirty} onSubmit={(event) => {
      if(inFlightRef.current){event.preventDefault();return;}
      const form = event.currentTarget;
      const startsAt = form.elements.namedItem("starts_at");
      const endsAt = form.elements.namedItem("ends_at");
      if (!(startsAt instanceof HTMLInputElement) || !(endsAt instanceof HTMLInputElement) || !startInputRef.current?.value || !endInputRef.current?.value) return;
      try{startsAt.value = wallTimeToIso(allDay ? `${startInputRef.current.value}T00:00` : startInputRef.current.value, timezone);
      endsAt.value = wallTimeToIso(allDay ? `${endInputRef.current.value}T00:00` : endInputRef.current.value, timezone);
      }catch{event.preventDefault();setTimeError("该时间存在时区歧义或不可用，请调整后重试。");return;}
      const hash=JSON.stringify([...new FormData(form).entries()].filter(([key])=>key!=="request_id"));
      if(request.current?.hash!==hash)request.current={hash,id:crypto.randomUUID()};
      if(requestInput.current)requestInput.current.value=request.current.id;
      inFlightRef.current=true;onPending?.(true);

    }} className="calendar-event-form grid gap-0">
      <input type="hidden" name="request_id" ref={requestInput} />
      {timeError?<p role="alert">{timeError}</p>:null}
      {sourceTask?<><input type="hidden" name="source_task_id" value={sourceTask.id}/><input type="hidden" name="source_task_modified" value={sourceTask.modified??""}/><p className="mb-2 text-sm">待安排任务 · {timezone} · 确认后写入Outlook</p></>:null}
      <div className="border-b border-[var(--separator)] pb-3.5">
        <input aria-label="日程标题" ref={subjectInputRef} name="subject" required maxLength={500} placeholder="日程标题" value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full border-0 bg-transparent px-0 text-[18px] font-semibold tracking-[-0.03em] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]" />
        <input aria-label="地点" name="location_name" maxLength={500} placeholder="添加地点" value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1.5 w-full border-0 bg-transparent px-0 text-[12px] text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-tertiary)]" />
      </div>

      <section className="border-b border-[var(--separator)] py-3.5">
        <label className="flex items-center justify-between gap-4 text-[13px] text-[var(--text-primary)]"><span>全天</span><input type="checkbox" name="is_all_day" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} className="size-4 accent-[var(--accent)]" /></label>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-tertiary)]">{allDay ? "开始日期" : "开始"}<input key={`start-${allDay}`} ref={startInputRef} type={allDay ? "date" : "datetime-local"} required onChange={()=>{keepEndAfterStart();updateConflictBounds();}} defaultValue={allDay ? defaultStartDate : defaultStart} className={control} /></label>
          <label className="grid gap-1.5 text-[12px] text-[var(--text-tertiary)]">{allDay ? "结束日期（不含）" : "结束"}<input key={`end-${allDay}`} ref={endInputRef} type={allDay ? "date" : "datetime-local"} required onChange={updateConflictBounds} defaultValue={allDay ? allDayEndDate : defaultEnd} className={control} /></label>
        </div>
        <input type="hidden" name="starts_at" /><input type="hidden" name="ends_at" />
      </section>

      <section className="border-b border-[var(--separator)] py-3.5">
        <CalendarCategoryPicker enabled={categoriesEnabled} onModeChange={setCategoryMode} />
        {autoClassification ? (() => {
          const primary = getManagedCalendarCategory(autoClassification.primaryCategoryKey);
          const contexts = autoClassification.contextCategoryKeys.map((key) => getManagedCalendarCategory(key)?.shortName).filter(Boolean) as string[];
          if (!autoClassification.needsConfirmation) {
            const parts = [primary?.shortName, ...contexts].filter(Boolean) as string[];
            return <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)]"><span className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />自动判断：{parts.join(" · ") || "其他"} · {Math.round(autoClassification.confidence * 100)}%</p>;
          }
          return <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)]"><span className="size-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />低置信度，暂不自动归类</p>;
        })() : null}
      </section>

      <p role="status" className="py-2 text-sm text-[var(--text-secondary)]">{timezone} · {conflicts.state==="loading"?"正在核对时间…":conflicts.state==="error"?"重叠安排暂不可确认，请核对后再创建。":conflicts.count?`最近同步的日历有${conflicts.count}项重叠：${conflicts.titles.join("、")}`:"最近同步的日历未发现重叠。"}</p>
      <details className="border-b border-[var(--separator)] py-3.5">
        <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--text-secondary)]">更多选项</summary>
        <div className="mt-2.5 grid gap-2.5">
          <label className="grid gap-1.5 text-[12px] text-[var(--text-tertiary)]">说明<MentionTextarea value={description} onChange={setDescription} name="description" maxLength={10000} rows={4} placeholder="议程、链接或准备事项；输入 @ 引用笔记/任务/日程/文件" className="min-h-24 w-full resize-y rounded-[9px] border-0 bg-[var(--surface-control)] px-3 py-2.5 text-[12.5px] leading-5.5 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[12px] text-[var(--text-tertiary)]">显示为<select name="show_as" defaultValue="busy" className={control}><option value="busy">忙碌</option><option value="free">空闲</option><option value="tentative">暂定</option><option value="workingElsewhere">在其他地点工作</option><option value="oof">外出</option></select></label>
            <label className="grid gap-1.5 text-[12px] text-[var(--text-tertiary)]">重要性<select name="importance" defaultValue="normal" className={control}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label>
          </div>
        </div>
      </details>

      <div className="pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[9.5px] text-[var(--text-tertiary)]">按 {timezone} 保存并同步至 Outlook</p>
          <button disabled={pending} className="pressable h-9 rounded-[9px] bg-[var(--accent)] px-3.5 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-60">{pending ? "正在创建…" : "创建日程"}</button>
        </div>
        {state.status !== "idle" ? <p role="status" className={`mt-1.5 text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{state.message}</p> : null}
      </div>
    </form>
  );
}
