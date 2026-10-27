"use client";
import { useDeclaredFormDraft,readDeclaredDraftFields } from "@/features/workflow-continuity/draft-adapters";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";
import { publishOperationReceipt } from "@/features/workbench/operation-contracts";

import { useActionState, useEffect, useRef, useState } from "react";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import {makeCalendarSubmission,parseCalendarSubmission,calendarSubmissionForm,type CalendarSubmission} from "@/features/calendar/submission-draft";
import { deleteCalendarEvent, updateCalendarEvent,readCalendarUpdateIntent, type CalendarCreateState } from "@/features/calendar/actions";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { CalendarCategoryPicker } from "@/components/calendar/calendar-category-picker";
import { dateTimeInputValue, instantToDate, shiftCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";
import type { CalendarCategory } from "@/features/calendar/categories/types";
import { resolveCalendarEventVisual } from "@/features/calendar/categories/visual";

type EditableEvent = { provider_event_id: string; subject: string; body_text: string | null; starts_at: string; ends_at: string; is_all_day: boolean; location_name: string | null; categories: string[]; importance: "low" | "normal" | "high"; show_as: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown"; last_synced_at: string };
const initial: CalendarCreateState = { status: "idle", message: "" };
const control = "ui-field h-9 min-w-0 rounded-[9px] border-0 bg-[var(--surface-control)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";

export type CalendarEditTransport={submit:typeof updateCalendarEvent;read:typeof readCalendarUpdateIntent};
type CalendarEventEditProps = { actionTransport?:CalendarEditTransport;event: EditableEvent; timezone: string; calendarCategories: CalendarCategory[]; categoriesEnabled?: boolean; resumeRequestId?: string; onReconcile?: (kind: "update" | "delete") => Promise<void> | void };

export function CalendarEventEditForm(props: CalendarEventEditProps) {
  const [session, setSession] = useState({ revision: 0, editing: false, eventId: props.event.provider_event_id });
  const resumed = useRef("");
  useEffect(() => { if (!props.resumeRequestId) return; const key = `${props.event.provider_event_id}:${props.resumeRequestId}`; if (resumed.current === key) return; resumed.current = key; setSession(current => ({ revision: current.revision + 1, editing: true, eventId: props.event.provider_event_id })); }, [props.resumeRequestId, props.event.provider_event_id]);
  return <CalendarEventEditSession
    key={`${props.event.provider_event_id}:${session.revision}`}
    {...props}
    editing={session.eventId === props.event.provider_event_id && session.editing}
    onEditingChange={(editing) => setSession((current) => ({ revision: current.revision + 1, editing, eventId: props.event.provider_event_id }))}
  />;
}

// Each Edit/Cancel boundary starts a fresh draft from the latest event. Remount
// both the controlled fields and action receipts, while preserving parent-owned
// reconciliation (a successful save still closes the workspace inspector).
function CalendarEventEditSession({ actionTransport,event, timezone:currentTimezone, calendarCategories, categoriesEnabled = true, onReconcile, editing, onEditingChange }: CalendarEventEditProps & { editing: boolean; onEditingChange: (editing: boolean) => void }) {
  assertContinuousFixtureTransport(actionTransport);
  const [submittedInput,setSubmittedInput]=useState("");
  const [timezone,setTimezone]=useState(currentTimezone);
  const [restoredWalls,setRestoredWalls]=useState<{start:string;end:string}|null>(null);
  const [baseline,setBaseline]=useState({subject:event.subject,starts:event.starts_at,ends:event.ends_at});
  const busy=useRef(false);
  const [allDay, setAllDay] = useState(event.is_all_day);
  const [timeError,setTimeError]=useState("");
  const [description, setDescription] = useState(event.body_text ?? "");
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const mutationRequest=useRef<{hash:string;id:string}|null>(null);
  const mutationRequestInput=useRef<HTMLInputElement>(null);
  const deleteHandledRef = useRef(false);
  const [state,setState]=useState(initial),[pending,setPending]=useState(false);
  const {formRef:draftFormRef,...recovery}=useDeclaredFormDraft({operation:"calendar.edit",id:event.provider_event_id,href:"/calendar",label:"编辑日程"},fields=>{if(typeof fields.submitted_input==="string")setSubmittedInput(fields.submitted_input);if(typeof fields.is_all_day==="boolean")setAllDay(fields.is_all_day);if(typeof fields.description==="string")setDescription(fields.description);if(typeof fields.timezone==="string")setTimezone(fields.timezone);if(typeof fields.startWall==="string"&&typeof fields.endWall==="string")setRestoredWalls({start:fields.startWall,end:fields.endWall});if(typeof fields.original_subject==="string"&&typeof fields.original_starts_at==="string"&&typeof fields.original_ends_at==="string")setBaseline({subject:fields.original_subject,starts:fields.original_starts_at,ends:fields.original_ends_at});if(typeof fields.request_id==="string"&&typeof fields.request_fingerprint==="string")mutationRequest.current={id:fields.request_id,hash:fields.request_fingerprint};});
  const [deleteState, deleteAction, deleting] = useActionState(deleteCalendarEvent, initial);
  const visual = resolveCalendarEventVisual(event.categories, calendarCategories);

  useEffect(() => {
    if (!editing || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    subjectInputRef.current?.focus({ preventScroll: true });
  }, [editing]);

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

  const perform=(frozen:CalendarSubmission,encoded:string,readOnly:boolean)=>{
    const form=draftFormRef.current;if(!form||!recovery.isCurrent())return;const current=recovery.captureGuard(),submitted={...frozen.fields,submitted_input:encoded};busy.current=true;setPending(true);setState(initial);
    const payload=calendarSubmissionForm(frozen),resultPromise=readOnly?(actionTransport?.read??readCalendarUpdateIntent)(payload):(actionTransport?.submit??updateCalendarEvent)(initial,payload);
    void resultPromise.then(async result=>{if(!current())return;if(result.status!=="success"){setState(result);return;}const currentFields=readDeclaredDraftFields(form,"calendar.edit");delete currentFields.submitted_input;const unchanged=JSON.stringify(currentFields)===JSON.stringify(frozen.fields);const accepted={subject:String(payload.get("subject")??"").trim(),starts:String(payload.get("starts_at")??""),ends:String(payload.get("ends_at")??"")};setBaseline(accepted);setSubmittedInput("");mutationRequest.current=null;recovery.complete(submitted,{savedFields:{submitted_input:"",request_id:"",request_fingerprint:"",original_subject:accepted.subject,original_starts_at:accepted.starts,original_ends_at:accepted.ends}});if(result.receiptId)publishOperationReceipt({receiptId:result.receiptId,message:result.message});setState(unchanged?result:{status:"idle",message:"原修改已保存，当前新输入尚未保存。"});if(unchanged)await onReconcile?.("update");}).catch(()=>{if(current())setState({status:"error",message:"保存结果尚未确认，输入和原请求已保留。请先核对日历。"});}).finally(()=>{if(current()){busy.current=false;setPending(false);}});
  };

  if (!editing || state.status === "success") {
    const dateLabel = event.is_all_day
      ? `${startDate}${startDate === inclusiveEndDate ? "" : ` – ${inclusiveEndDate}`}`
      : `${dateTimeInputValue(event.starts_at, timezone).replace("T", " ")} – ${dateTimeInputValue(event.ends_at, timezone).slice(11)}`;
    return (
      <div className="grid gap-0">
        <section className="border-b border-[var(--separator)] pb-3.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-2 size-2 shrink-0 rounded-full" style={{ background: visual.dot }} />
            <div className="min-w-0">
              <h3 className="text-[18px] font-semibold leading-6 tracking-[-0.03em] text-[var(--text-primary)]">{event.subject || "未命名日程"}</h3>
              <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{dateLabel}</p>
              {event.location_name ? <p className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">{event.location_name}</p> : null}
            </div>
          </div>
        </section>

        {event.body_text ? <section className="border-b border-[var(--separator)] py-3.5"><p className="mb-1.5 text-[9.5px] font-semibold tracking-[0.08em] text-[var(--text-tertiary)]">说明</p><EntityMarkdown body={event.body_text} className="text-[12.5px] leading-5.5 text-[var(--text-secondary)]" /></section> : null}

        <section className="border-b border-[var(--separator)] py-3.5 text-[12px]">
          <div className="flex items-center justify-between gap-3"><span className="text-[var(--text-tertiary)]">分类</span><span className="font-medium text-[var(--text-primary)]">{visual.primaryCategory?.display_name ?? "未分类"}</span></div>
          <div className="mt-2.5 flex items-center justify-between gap-3"><span className="text-[var(--text-tertiary)]">Outlook</span><span className="text-right text-[var(--text-secondary)]">{new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.last_synced_at))} 同步</span></div>
        </section>

        <div className="flex items-center justify-between py-3.5">
          {state.status === "success" ? <p role="status" className="text-[12px] text-[var(--success)]">{state.message}</p> : <button disabled={deleting} onClick={() => onEditingChange(true)} className="pressable rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-[var(--accent)] transition-colors ui-transition hover:bg-[var(--accent-soft)]">编辑日程</button>}
          <form action={deleteAction} onSubmit={(submitEvent) => { if (!window.confirm("确认从 Outlook 删除这条日程？")) submitEvent.preventDefault(); }}>
            <input type="hidden" name="provider_event_id" value={event.provider_event_id}/><input type="hidden" name="subject" value={event.subject}/><input type="hidden" name="starts_at" value={event.starts_at}/><input type="hidden" name="ends_at" value={event.ends_at}/><input type="hidden" name="is_all_day" value={event.is_all_day ? "on" : ""}/>
            <button disabled={deleting} className="pressable rounded-[8px] px-2 py-1.5 text-[12px] text-[var(--danger)] transition-colors ui-transition hover:bg-[rgba(215,0,21,.06)] disabled:opacity-50">{deleting ? "正在删除…" : "删除"}</button>
          </form>
        </div>
        {deleteState.status === "error" ? <p role="status" className="text-[12px] text-[var(--danger)]">{deleteState.message}</p> : null}
      </div>
    );
  }

  return (
    <form noValidate={Boolean(submittedInput)} ref={draftFormRef} {...recovery.attributes} onInputCapture={recovery.capture} onChangeCapture={recovery.capture} onSubmit={(submitEvent) => {
      submitEvent.preventDefault();if(busy.current)return;
      const form = submitEvent.currentTarget;
      if(submittedInput){const original=parseCalendarSubmission(submittedInput,"calendar.edit");if(!original){setState({status:"error",message:"原修改信息不完整，输入仍保留，未重复发送。"});return;}perform(original,submittedInput,true);return;}
      const start = form.elements.namedItem("starts_at");
      const end = form.elements.namedItem("ends_at");
      if (!(start instanceof HTMLInputElement) || !(end instanceof HTMLInputElement) || !startRef.current?.value || !endRef.current?.value) return;
      try{start.value = wallTimeToIso(allDay ? `${startRef.current.value}T00:00` : startRef.current.value, timezone);
      end.value = wallTimeToIso(allDay ? `${endRef.current.value}T00:00` : endRef.current.value, timezone);
      }catch{submitEvent.preventDefault();setTimeError("该时间存在时区歧义或不可用，请调整后重试。");return;}
      const hash=JSON.stringify([...new FormData(form).entries()].filter(([key])=>key!=="request_id"&&key!=="request_fingerprint"&&key!=="submitted_input"));if(mutationRequest.current?.hash!==hash)mutationRequest.current={hash,id:crypto.randomUUID()};if(mutationRequestInput.current)mutationRequestInput.current.value=mutationRequest.current.id;
      const fingerprint=form.elements.namedItem("request_fingerprint");if(fingerprint instanceof HTMLInputElement)fingerprint.value=mutationRequest.current.hash;
      const raw=recovery.capture(submitEvent),frozen=makeCalendarSubmission(form,"calendar.edit",raw),encoded=JSON.stringify(frozen);setSubmittedInput(encoded);recovery.setValue({...raw,submitted_input:encoded});perform(frozen,encoded,false);
    }} className="grid gap-0">
      {timeError?<p role="alert">{timeError}</p>:null}<input type="hidden" name="submitted_input" value={submittedInput}/><input type="hidden" name="request_id" ref={mutationRequestInput}/><input type="hidden" name="request_fingerprint"/><input type="hidden" name="timezone" value={timezone}/><input type="hidden" name="provider_event_id" value={event.provider_event_id}/><input type="hidden" name="original_subject" value={baseline.subject}/><input type="hidden" name="original_starts_at" value={baseline.starts}/><input type="hidden" name="original_ends_at" value={baseline.ends}/><input type="hidden" name="starts_at"/><input type="hidden" name="ends_at"/><input type="hidden" name="preserve_categories" value={categoriesEnabled ? "false" : "true"}/><input type="hidden" name="is_all_day_present" value="true"/>

      <section className="border-b border-[var(--separator)] pb-4">
        <input aria-label="日程标题" ref={subjectInputRef} name="subject" required maxLength={500} defaultValue={event.subject} className="w-full border-0 bg-transparent px-0 text-[18px] font-semibold tracking-[-0.03em] text-[var(--text-primary)] outline-none" />
        <input aria-label="地点" name="location_name" maxLength={500} defaultValue={event.location_name ?? ""} placeholder="添加地点" className="mt-1.5 w-full border-0 bg-transparent px-0 text-[12px] text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-tertiary)]" />
      </section>

      <section className="border-b border-[var(--separator)] py-4">
        <label className="flex items-center justify-between gap-4 text-[13px] text-[var(--text-primary)]"><span>全天</span><input type="checkbox" name="is_all_day" checked={allDay} onChange={(input) => setAllDay(input.target.checked)} className="size-4 accent-[var(--accent)]" /></label>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-tertiary)]">{allDay ? "开始日期" : "开始"}<input key={`start-${allDay}`} ref={startRef} name="startWall" type={allDay ? "date" : "datetime-local"} required onChange={keepEndAfterStart} defaultValue={restoredWalls?.start??(allDay ? startDate : dateTimeInputValue(event.starts_at, timezone))} className={control}/></label>
          <label className="grid gap-1.5 text-[12px] text-[var(--text-tertiary)]">{allDay ? "结束日期（不含）" : "结束"}<input key={`end-${allDay}`} ref={endRef} name="endWall" type={allDay ? "date" : "datetime-local"} required defaultValue={restoredWalls?.end??(allDay ? allDayEndDate : dateTimeInputValue(event.ends_at, timezone))} className={control}/></label>
        </div>
      </section>

      <section className="border-b border-[var(--separator)] py-4">
        <label className="grid gap-1.5 text-[12px] text-[var(--text-tertiary)]">说明<MentionTextarea value={description} onChange={setDescription} name="description" maxLength={10000} rows={4} placeholder="输入 @ 引用笔记/任务/日程/文件" className="min-h-24 rounded-[9px] border-0 bg-[var(--surface-control)] px-3 py-2.5 text-[12.5px] leading-5.5 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]"/></label>
      </section>

      <section className="border-b border-[var(--separator)] py-4"><CalendarCategoryPicker defaultCategories={event.categories} enabled={categoriesEnabled} /></section>

      <details className="border-b border-[var(--separator)] py-4">
        <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[12px] font-medium text-[var(--text-secondary)]">更多选项</summary>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[12px] text-[var(--text-tertiary)]">显示为<select name="show_as" defaultValue={event.show_as === "unknown" ? "busy" : event.show_as} className={control}><option value="busy">忙碌</option><option value="free">空闲</option><option value="tentative">暂定</option><option value="workingElsewhere">在其他地点工作</option><option value="oof">外出</option></select></label>
          <label className="grid gap-1.5 text-[12px] text-[var(--text-tertiary)]">重要性<select name="importance" defaultValue={event.importance} className={control}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label>
        </div>
      </details>

      <div className="flex items-center justify-end gap-2 pt-3.5">
        <button type="button" disabled={pending} onClick={() => onEditingChange(false)} className="pressable h-9 max-md:min-h-11 rounded-[8px] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors ui-transition hover:bg-[var(--surface-hover)]">取消</button>
        <button type="button" disabled={pending} onClick={()=>{recovery.clear();onEditingChange(false);}} className="ui-link min-h-11 px-2 text-xs">放弃修改</button>
        <button disabled={pending} className="pressable h-9 max-md:min-h-11 rounded-[9px] bg-[var(--accent)] px-3.5 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)] disabled:opacity-60">{pending ? "正在保存…" : "保存"}</button>
      </div>
      <DraftRecoveryStatus dirty={recovery.dirty} restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable}/>
      {state.status === "error" || state.message ? <p role="status" className="mt-1.5 text-[12px] text-[var(--danger)]">{state.message}</p> : null}
    </form>
  );
}
