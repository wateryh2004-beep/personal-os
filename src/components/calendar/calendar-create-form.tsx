"use client";

import { useDeclaredFormDraft, readDeclaredDraftFields } from "@/features/workflow-continuity/draft-adapters";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useEffect, useMemo, useRef, useState } from "react";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import {makeCalendarSubmission,parseCalendarSubmission,calendarSubmissionForm,type CalendarSubmission} from "@/features/calendar/submission-draft";
import { createCalendarEvent,readCalendarCreationIntent, type CalendarCreateState } from "@/features/calendar/actions";
import { readCalendarScheduleConflicts } from "@/features/workbench/operation-read-resource";
import { CalendarCategoryPicker } from "@/components/calendar/calendar-category-picker";
import { dateTimeInputValue, instantToDate, shiftCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";
import { classifyCalendarEvent } from "@/features/calendar/classification/classifier";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { getManagedCalendarCategory } from "@/features/calendar/classification/taxonomy";

const initialCalendarCreateState: CalendarCreateState = { status: "idle", message: "" };
const control = "ui-field h-9 min-w-0 rounded-[9px] border-0 bg-[var(--surface-control)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";

export type CalendarCreateTransport={submit:typeof createCalendarEvent;read:typeof readCalendarCreationIntent};
export function CalendarCreateForm({ actionTransport,timezone: currentTimezone, categoriesEnabled = true, initialStart, initialEnd, initialAllDay = false, initialSubject = "", initialDescription = "", sourceTask: initialSourceTask, onCreated, onDirty, onPending }: { actionTransport?:CalendarCreateTransport;timezone: string; categoriesEnabled?: boolean; initialStart?: string; initialEnd?: string; initialAllDay?: boolean; initialSubject?:string; initialDescription?:string; sourceTask?:{id:string;modified:string|null}; onCreated?: () => Promise<void> | void; onDirty?: () => void; onPending?: (pending: boolean) => void }) {
  assertContinuousFixtureTransport(actionTransport);
  const [submittedInput,setSubmittedInput]=useState("");
  const [sourceTask,setSourceTask]=useState(initialSourceTask);
  const [timezone,setTimezone]=useState(currentTimezone);
  const [restoredWalls,setRestoredWalls]=useState<{start:string;end:string}|null>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

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
  const [state,setState]=useState(initialCalendarCreateState),[pending,setPending]=useState(false);
  const createdHandledRef=useRef(false);
  const [created,setCreated]=useState(false);
  const {formRef:draftFormRef,...recovery}=useDeclaredFormDraft({operation:"calendar.create",id:"new",href:"/calendar",label:"新建日程"},fields=>{if(typeof fields.submitted_input==="string")setSubmittedInput(fields.submitted_input);if(typeof fields.subject==="string")setSubject(fields.subject);if(typeof fields.location_name==="string")setLocation(fields.location_name);if(typeof fields.description==="string")setDescription(fields.description);if(typeof fields.is_all_day==="boolean")setAllDay(fields.is_all_day);if(typeof fields.category_choice==="string")setCategoryMode(fields.category_choice);if(typeof fields.timezone==="string")setTimezone(fields.timezone);if(typeof fields.startWall==="string"&&typeof fields.endWall==="string")setRestoredWalls({start:fields.startWall,end:fields.endWall});if(typeof fields.source_task_id==="string"&&fields.source_task_id)setSourceTask({id:fields.source_task_id,modified:typeof fields.source_task_modified==="string"?fields.source_task_modified||null:null});if(typeof fields.request_id==="string"&&typeof fields.request_fingerprint==="string")request.current={id:fields.request_id,hash:fields.request_fingerprint};});
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

  const perform=(frozen:CalendarSubmission,encoded:string,readOnly:boolean)=>{
   const form=draftFormRef.current;if(!form||!recovery.isCurrent())return;const current=recovery.captureGuard(),submitted={...frozen.fields,submitted_input:encoded};inFlightRef.current=true;setPending(true);onPending?.(true);setState(initialCalendarCreateState);
   const resultPromise=readOnly?(actionTransport?.read??readCalendarCreationIntent)(calendarSubmissionForm(frozen)):(actionTransport?.submit??createCalendarEvent)(initialCalendarCreateState,calendarSubmissionForm(frozen));
   void resultPromise.then(async result=>{if(!current())return;setState(result);if(result.status!=="success"){if(result.writeOutcome==="not_written"){recovery.setValue(before=>({...before,submitted_input:"",request_id:"",request_fingerprint:""}));setSubmittedInput("");request.current=null;}return;}const currentFields=readDeclaredDraftFields(form,"calendar.create");delete currentFields.submitted_input;const unchanged=JSON.stringify(currentFields)===JSON.stringify(frozen.fields);recovery.complete(submitted,{savedFields:{submitted_input:"",request_id:"",request_fingerprint:""}});setSubmittedInput("");request.current=null;if(unchanged){createdHandledRef.current=true;setCreated(true);await onCreated?.();}}).catch(()=>{if(current())setState({status:"error",message:"创建结果尚未确认，原请求与输入已保留。请先核对日历，不要重复创建。"});}).finally(()=>{if(current()){inFlightRef.current=false;setPending(false);onPending?.(false);}});
  };

  return (
    <form noValidate={Boolean(submittedInput)} ref={draftFormRef} {...recovery.attributes} onInputCapture={recovery.capture} onChangeCapture={event=>{recovery.capture(event);onDirty?.();}} onSubmit={(event) => {
      event.preventDefault();
      if(inFlightRef.current||createdHandledRef.current)return;
      const form = event.currentTarget;
      if(submittedInput){const original=parseCalendarSubmission(submittedInput,"calendar.create");if(!original){setState({status:"error",message:"原提交信息不完整，输入仍保留，未重复创建。"});return;}perform(original,submittedInput,true);return;}
      const startsAt = form.elements.namedItem("starts_at");
      const endsAt = form.elements.namedItem("ends_at");
      if (!(startsAt instanceof HTMLInputElement) || !(endsAt instanceof HTMLInputElement) || !startInputRef.current?.value || !endInputRef.current?.value) return;
      try{startsAt.value = wallTimeToIso(allDay ? `${startInputRef.current.value}T00:00` : startInputRef.current.value, timezone);
      endsAt.value = wallTimeToIso(allDay ? `${endInputRef.current.value}T00:00` : endInputRef.current.value, timezone);
      }catch{event.preventDefault();setTimeError("该时间存在时区歧义或不可用，请调整后重试。");return;}
      const hash=JSON.stringify([...new FormData(form).entries()].filter(([key])=>key!=="request_id"&&key!=="request_fingerprint"&&key!=="submitted_input"));
      if(request.current?.hash!==hash)request.current={hash,id:crypto.randomUUID()};
      if(requestInput.current)requestInput.current.value=request.current.id;
      const fingerprint=form.elements.namedItem("request_fingerprint");if(fingerprint instanceof HTMLInputElement)fingerprint.value=request.current.hash;
      const raw=recovery.capture(event),frozen=makeCalendarSubmission(form,"calendar.create",raw),encoded=JSON.stringify(frozen);setSubmittedInput(encoded);recovery.setValue({...raw,submitted_input:encoded});perform(frozen,encoded,false);

    }} className="calendar-event-form grid gap-0">
      <input type="hidden" name="submitted_input" value={submittedInput}/><input type="hidden" name="request_id" ref={requestInput} /><input type="hidden" name="request_fingerprint"/><input type="hidden" name="timezone" value={timezone}/>
      {timeError?<p role="alert">{timeError}</p>:null}
      {sourceTask?<><input type="hidden" name="source_task_id" value={sourceTask.id}/><input type="hidden" name="source_task_modified" value={sourceTask.modified??""}/><p className="mb-2 text-sm">待安排任务 · {timezone} · 确认后写入Outlook</p></>:null}
      <div className="border-b border-[var(--separator)] pb-3.5">
        <input aria-label="日程标题" ref={subjectInputRef} name="subject" required maxLength={500} placeholder="日程标题" value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full border-0 bg-transparent px-0 text-[18px] font-semibold tracking-[-0.03em] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]" />
        <input aria-label="地点" name="location_name" maxLength={500} placeholder="添加地点" value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1.5 w-full border-0 bg-transparent px-0 text-[12px] text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-tertiary)]" />
      </div>

      <section className="border-b border-[var(--separator)] py-3.5">
        <label className="flex items-center justify-between gap-4 text-[13px] text-[var(--text-primary)]"><span>全天</span><input type="checkbox" name="is_all_day" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} className="size-4 accent-[var(--accent)]" /></label>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-tertiary)]">{allDay ? "开始日期" : "开始"}<input key={`start-${allDay}`} ref={startInputRef} name="startWall" type={allDay ? "date" : "datetime-local"} required onChange={()=>{keepEndAfterStart();updateConflictBounds();}} defaultValue={restoredWalls?.start??(allDay ? defaultStartDate : defaultStart)} className={control} /></label>
          <label className="grid gap-1.5 text-[12px] text-[var(--text-tertiary)]">{allDay ? "结束日期（不含）" : "结束"}<input key={`end-${allDay}`} ref={endInputRef} name="endWall" type={allDay ? "date" : "datetime-local"} required onChange={updateConflictBounds} defaultValue={restoredWalls?.end??(allDay ? allDayEndDate : defaultEnd)} className={control} /></label>
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

      {timezone!==currentTimezone?<p role="status" className="text-sm">恢复的日程仍按 {timezone} 编辑，请核对时区后确认。</p>:null}
      <DraftRecoveryStatus dirty={recovery.dirty} restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable}/>
      <div className="pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[9.5px] text-[var(--text-tertiary)]">按 {timezone} 保存并同步至 Outlook</p>
          <button disabled={pending||created} className="pressable h-9 max-md:min-h-11 rounded-[9px] bg-[var(--accent)] px-3.5 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-60">{pending ? "正在处理…" : submittedInput?"核对原创建":"创建日程"}</button>
        </div>
        {state.status !== "idle" ? <p role="status" className={`mt-1.5 text-[12px] ${state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{state.message}</p> : null}
      </div>
    </form>
  );
}
