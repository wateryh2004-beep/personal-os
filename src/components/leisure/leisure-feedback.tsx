"use client";

import Link from "next/link";
import { z } from "zod";
import {lifeFieldInputSchema,type LifeFieldInput,type LifeFieldRow} from "@/features/life/contracts";
import {encodeLifeSubmission,parseLifeSubmission,lifeSubmissionStillCurrent} from "@/features/workflow-continuity/life-submission";
import {draftValueFingerprint} from "@/features/workflow-continuity/drafts";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { useDeclaredFormDraft,readDeclaredDraftFields } from "@/features/workflow-continuity/draft-adapters";
import { draftResumeKey,focusDraftForm,useDraftResumeConsumer } from "@/features/workflow-continuity/draft-resume";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useEffect, useId, useRef, useState } from "react";
import { readLeisureFeedback, saveLeisureFeedback } from "@/features/leisure/actions";
import type { LeisureExperience, LeisureFeedbackInput, LeisureFeedbackReadResult, LeisureFeedbackResult, LeisureReaction, LeisureStatus } from "@/features/leisure/types";
import { leisureStatusLabels } from "@/features/leisure/presentation";
import { useLifeUndo } from "@/components/life/use-life-undo";
import { LifeConfirm, type LifeChange } from "@/components/life/life-confirm";
import { Button } from "@/components/ui/button";
import fieldStyles from "@/components/life/life-field.module.css";
import styles from "./leisure.module.css";

export function LeisureFeedbackControls({ experience, onSave = saveLeisureFeedback, onRead = readLeisureFeedback }: { experience: Pick<LeisureExperience, "id" | "feedback">; onSave?: (input: LeisureFeedbackInput) => Promise<LeisureFeedbackResult>; onRead?: (id: string) => Promise<LeisureFeedbackReadResult> }) {
  const controlId=useId();const feedbackTitleId=`leisure-feedback-${controlId}`;const personalNoteId=`leisure-personal-note-${controlId}`;
  const [feedback, setFeedback] = useState(experience.feedback);
  const noteDraft=useWorkflowDraft({kind:"leisure",id:`personal-note:${experience.id}`,label:"未保存的感想",resumeHref:`/leisure/${experience.id}`,resumeTarget:{kind:"leisure.note",id:experience.id},initialValue:{note:experience.feedback?.personal_note??"",revision:experience.feedback?.revision??0},parse:input=>{const result=z.object({note:z.string().max(10000),revision:z.number().int().nonnegative()}).strict().safeParse(input);return result.success?result.data:null;}});
  const note=noteDraft.value.note,setNote=(next:string)=>noteDraft.setValue(before=>({...before,note:next}));
  const host=useRef<HTMLElement>(null);
  useDraftResumeConsumer({kind:"leisure.note",identity:{id:experience.id},ready:()=>Boolean(host.current?.isConnected&&!host.current.closest("[hidden],[inert]")),open:focusDraftForm});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [latestFeedback,setLatestFeedback]=useState<{feedback:LeisureExperience["feedback"]}|null>(null);
  const [progressDirty,setProgressDirty]=useState(false);
  const saving = useRef(false);
  const noteDirty = note !== (feedback?.personal_note ?? "");
  const [sourceFeedback, setSourceFeedback] = useState(experience.feedback);
  if (sourceFeedback !== experience.feedback) { setSourceFeedback(experience.feedback); setFeedback(experience.feedback); if (!noteDirty) setNote(experience.feedback?.personal_note ?? ""); }
  async function reconcile() {
    if (saving.current||!noteDraft.isCurrent()) return;
    saving.current = true;
    setPending(true);
    const scope=captureWorkspaceScope(),id=experience.id,current=()=>noteDraft.isCurrent()&&scope()&&host.current?.isConnected&&host.current.dataset.leisureId===id;
    try {
      const result = await onRead(experience.id);
      if(!current())return;
      if (!result.ok) { setError("暂时无法读取最新状态，请重试。"); return; }
      if(noteDirty||noteDraft.uncertain){setLatestFeedback({feedback:result.feedback});setError("最新状态已读取，请比较后明确采用版本；当前感想输入保留。");return;}
      // Rebase the confirmed revision, preserving any independently edited text.
      if (!noteDirty) setNote(result.feedback?.personal_note ?? "");
      setFeedback(result.feedback);noteDraft.setValue(before=>({...before,revision:result.feedback?.revision??0}));
      setError(null);
      setSaved(false);
    } catch { setError("暂时无法读取最新状态，请重试。"); }
    finally { saving.current = false; setPending(false); }
  }
  useLifeUndo((operation,rows)=>{if(operation!=="leisure_progress"||!rows.some(row=>row.id===experience.id))return;void reconcile();});
  useEffect(() => {
    if (!noteDirty && !pending) return;
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [noteDirty, pending]);
  async function save(patch: { status?: LeisureStatus | null; reaction?: LeisureReaction; personal_note?: string }) {
    if (!noteDraft.isCurrent() || saving.current || error||noteDraft.uncertain) return;
    saving.current = true;
    setPending(true);
    setSaved(false);
    const snapshot=noteDraft.value,scope=captureWorkspaceScope(),id=experience.id,current=()=>noteDraft.isCurrent()&&scope()&&host.current?.isConnected&&host.current.dataset.leisureId===id;
    try {
      const result = await onSave({ experience_id: experience.id, expected_revision: patch.personal_note!==undefined?snapshot.revision:feedback?.revision??0, status: feedback?.status ?? null, reaction: feedback?.reaction ?? "none", personal_note: feedback?.personal_note ?? "", linked_note_id: feedback?.linked_note_id ?? null, ...patch });
      if(!current())return;
      if (result.ok) { setFeedback(result.feedback); setSaved(true);if(patch.personal_note!==undefined)noteDraft.commit(snapshot,before=>({...before,revision:result.feedback.revision}));else if(result.feedback.personal_note===(feedback?.personal_note??""))noteDraft.setValue(before=>({...before,revision:result.feedback.revision})); }
      else {if(result.error==="unavailable")noteDraft.markUncertain();setError(result.error === "conflict" ? "内容已在别处更新。这次修改没有覆盖它。" : result.error === "note_unavailable" ? "关联笔记已不可用，这次修改没有保存。" : "暂时无法确认保存结果。");}
    } catch {if(current()){noteDraft.markUncertain();setError("连接中断，暂时无法确认保存结果。");} }
    finally { saving.current = false; setPending(false); }
  }
  return <section ref={host} data-leisure-id={experience.id} className={styles.feedback} data-leisure-navigation-block={pending ? "saving" : noteDirty||progressDirty ? "draft" : undefined} aria-labelledby={feedbackTitleId}>
    <h2 id={feedbackTitleId}>我的这一页</h2>
    <LeisureProgressForm experienceId={experience.id} feedback={feedback} onDirtyChange={setProgressDirty} onSaved={(patch) => setFeedback((before) => ({ status: before?.status ?? null, reaction: before?.reaction ?? "none", personal_note: before?.personal_note ?? "", linked_note_id: before?.linked_note_id ?? null, linked_note_title: before?.linked_note_title ?? null, linked_note_available: before?.linked_note_available ?? false, updated_at: before?.updated_at ?? new Date().toISOString(), revision: Number(patch.mutation_revision), progress_unit: patch.progress_unit as "page" | "episode" | "minute" | null, progress_value: patch.progress_value as number | null, progress_total: patch.progress_total as number | null }))} />
    <div className={styles.feedbackButtons} role="group" aria-label="体验状态">{(Object.keys(leisureStatusLabels) as LeisureStatus[]).map((status) => <button key={status} type="button" aria-pressed={feedback?.status === status} disabled={pending || Boolean(error)||noteDraft.uncertain} onClick={() => save({ status: feedback?.status === status ? null : status })}>{leisureStatusLabels[status]}</button>)}</div>
    <div className={styles.feedbackButtons} role="group" aria-label="我的感受"><button type="button" aria-pressed={feedback?.reaction === "liked"} disabled={pending || Boolean(error)||noteDraft.uncertain} onClick={() => save({ reaction: feedback?.reaction === "liked" ? "none" : "liked" })}>喜欢，留着</button><button type="button" aria-pressed={feedback?.reaction === "not_for_me"} disabled={pending || Boolean(error)||noteDraft.uncertain} onClick={() => save({ reaction: feedback?.reaction === "not_for_me" ? "none" : "not_for_me" })}>不太适合我</button></div>
    <div className={`${styles.feedbackStatus} ${error ? styles.error : ""}`} role={error ? "alert" : "status"} aria-live="polite">{pending ? "正在同步…" : error ? <>{error} <button type="button" className={styles.quietButton} onClick={() => void reconcile()}>读取最新状态</button></> : noteDirty ? saved ? "选择已保存，感想尚未保存" : "感想尚未保存" : saved ? "已保存" : ""}</div>
    <details data-workflow-draft-key={draftResumeKey({kind:"leisure.note",id:experience.id})} className={styles.reflection} open={feedback?.personal_note ? true : undefined}><summary>留一句自己的感想</summary><label htmlFor={personalNoteId}>这一刻的感受<textarea id={personalNoteId} value={note} maxLength={10000} onChange={(event) => { setNote(event.target.value); setSaved(false); }} placeholder="喜欢哪一点，或为什么不适合自己…" /></label><div className={styles.feedbackButtons}><button type="button" disabled={pending || Boolean(error)||noteDraft.uncertain || !noteDirty} onClick={() => save({ personal_note: note })}>保存感想</button></div></details>
    <DraftRecoveryStatus dirty={noteDirty} restored={noteDraft.restored} recoveryUnavailable={noteDraft.recoveryUnavailable}/>
    {noteDraft.uncertain?<p role="status">原感想保存结果待核对，输入与状态保留，不会重复保存。<button type="button" className={styles.quietButton} onClick={()=>void reconcile()}>读取原感想并比较</button></p>:null}{latestFeedback?<div aria-label="最新感想比较"><p>当前感想：{latestFeedback.feedback?.personal_note||"未填写"}</p><p>当前版本：{latestFeedback.feedback?.revision??0}</p><Button type="button" variant="outline" onClick={()=>{setFeedback(latestFeedback.feedback);noteDraft.setValue(before=>({...before,revision:latestFeedback.feedback?.revision??0}));noteDraft.resolveUncertain();setLatestFeedback(null);setError(null);setSaved(false);}}>采用比较后的当前版本，保留感想输入</Button></div>:null}
    {feedback?.linked_note_id && feedback.linked_note_available ? <Link href={`/notes/${feedback.linked_note_id}`} className={styles.link}>{feedback.linked_note_title || "打开关联笔记"}</Link> : feedback?.linked_note_id ? <p className={styles.caption}>关联笔记目前不可用，原有引用已保留。</p> : null}
  </section>;
}

export function LeisureProgressForm({ experienceId, feedback, onSaved,onDirtyChange }: { experienceId: string; feedback: LeisureExperience["feedback"]; onDirtyChange:(dirty:boolean)=>void; onSaved: (row: LifeFieldRow) => void }) {
 const [unit,setUnit]=useState(feedback?.progress_unit ?? "page"),[value,setValue]=useState(String(feedback?.progress_value ?? "")),[total,setTotal]=useState(String(feedback?.progress_total ?? ""));
 const [revision,setRevision]=useState(feedback?.revision??0),[requestId,setRequestId]=useState(()=>crypto.randomUUID()),[submittedInput,setSubmittedInput]=useState("");
 const [preview,setPreview]=useState<{change:LifeChange;input:LifeFieldInput}|null>(null),[comparison,setComparison]=useState<LifeFieldRow|null>(null),[error,setError]=useState("");
 const submitted=useRef<import("@/features/workflow-continuity/draft-contracts").DraftFields|null>(null);
 const {formRef,...recovery}=useDeclaredFormDraft({operation:"leisure.progress",id:experienceId,href:`/leisure/${experienceId}`,label:"我的进度"},fields=>{if(fields.unit==="page"||fields.unit==="episode"||fields.unit==="minute")setUnit(fields.unit);if(typeof fields.value==="string")setValue(fields.value);if(typeof fields.total==="string")setTotal(fields.total);if(typeof fields.expected_revision==="string"&&/^\d+$/.test(fields.expected_revision))setRevision(Number(fields.expected_revision));if(typeof fields.request_id==="string")setRequestId(fields.request_id);if(typeof fields.submitted_input==="string")setSubmittedInput(fields.submitted_input);});
 const dirty=value!==String(feedback?.progress_value??"")||total!==String(feedback?.progress_total??"")||value!==""&&unit!==(feedback?.progress_unit??"page");
 const [sourceProgress,setSourceProgress]=useState(feedback);
 if(sourceProgress!==feedback){const clean=value===String(sourceProgress?.progress_value??"")&&total===String(sourceProgress?.progress_total??"")&&(value===""||unit===(sourceProgress?.progress_unit??"page"));setSourceProgress(feedback);if(clean&&!submittedInput){setValue(String(feedback?.progress_value??""));setTotal(String(feedback?.progress_total??""));setUnit(feedback?.progress_unit??"page");setRevision(feedback?.revision??0);}}
 useEffect(()=>{onDirtyChange(dirty||Boolean(preview)||Boolean(submittedInput));return()=>onDirtyChange(false);},[dirty,preview,submittedInput,onDirtyChange]);
 useEffect(()=>{if(!dirty&&!submittedInput)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);},[dirty,submittedInput]);
 const labels={page:"页",episode:"集",minute:"分钟"};
 function showPreview(clear=false){if(!recovery.isCurrent())return;let input:LifeFieldInput;
  if(submittedInput){const restored=parseLifeSubmission(submittedInput,"leisure.progress","leisure_progress",[experienceId]);if(!restored){setError("原进度提交信息不完整，输入仍保留。");return;}input=restored.input;submitted.current=restored.fields;}
  else{if(!clear&&(!/^\d+$/.test(value)||Number(value)>1000000||total!==""&&(!/^\d+$/.test(total)||Number(total)<1||Number(total)>1000000||Number(value)>Number(total)))){setError("请填写有效进度，总量不能小于当前进度。");return;}const parsed=lifeFieldInputSchema.safeParse({requestId,operation:"leisure_progress",items:[{id:experienceId,expected_revision:revision,progress_unit:clear?null:unit,progress_value:clear?null:Number(value),progress_total:clear||!total?null:Number(total)}]});if(!parsed.success){setError("原版本或进度信息无效，输入仍保留。");return;}input=parsed.data;}
  if(input.operation!=="leisure_progress")return;setError("");const row=input.items[0];setPreview({input,change:{title:submittedInput?"核对原进度保存":clear?"清除进度记录":"保存我的进度",details:[{id:experienceId,title:"用户记录进度",change:row.progress_unit?`${row.progress_value}${row.progress_total?` / ${row.progress_total}`:""} ${labels[row.progress_unit]}`:"已记录进度 → 未记录"}],input:{operation:"leisure_progress",items:input.items}}});
 }
 function completed(rows:LifeFieldRow[]){if(!recovery.isCurrent())return;const snapshot=submitted.current,row=rows.find(row=>row.id===experienceId);if(!snapshot||!row||!formRef.current)return;const next=z.number().int().nonnegative().safeParse(row.mutation_revision),original=typeof snapshot.submitted_input==="string"?parseLifeSubmission(snapshot.submitted_input,"leisure.progress","leisure_progress",[experienceId]):null;if(!next.success){setError("原进度保存后版本仍不可读，输入保留。");setPreview(null);return;}if(!original||!lifeSubmissionStillCurrent(original.input,rows)){setComparison(row);setPreview(null);setError("原进度曾保存，当前记录已有后续变化。请比较后明确采用当前版本。");return;}const current={...readDeclaredDraftFields(formRef.current,"leisure.progress")},expected={...snapshot};delete current.submitted_input;delete expected.submitted_input;const unchanged=draftValueFingerprint(current)===draftValueFingerprint(expected),nextRequest=crypto.randomUUID();recovery.complete(snapshot,{savedFields:{expected_revision:String(next.data),request_id:nextRequest,submitted_input:""}});setRevision(next.data);setRequestId(nextRequest);setSubmittedInput("");if(unchanged){setValue(String(row.progress_value??""));setTotal(String(row.progress_total??""));setUnit(row.progress_unit==="episode"||row.progress_unit==="minute"?row.progress_unit:"page");}else setError("原进度已保存，当前新输入尚未保存。");setPreview(null);onSaved(row);}
 return <section aria-label="我的进度" tabIndex={-1} data-life-return-focus><p className={fieldStyles.meta}>{feedback?.progress_unit&&feedback.progress_value!=null?`已记录：${feedback.progress_value}${feedback.progress_total?` / ${feedback.progress_total}`:""} ${labels[feedback.progress_unit]}`:"尚未记录进度"}</p>
 <form noValidate={Boolean(submittedInput)} ref={formRef} {...recovery.attributes} onInputCapture={recovery.capture} onChangeCapture={recovery.capture} onSubmit={event=>{event.preventDefault();showPreview();}}><input type="hidden" name="expected_revision" value={revision}/><input type="hidden" name="request_id" value={requestId}/><input type="hidden" name="submitted_input" value={submittedInput}/><div className={fieldStyles.fields}><label className={fieldStyles.field}>单位<select name="unit" value={unit} onChange={event=>setUnit(event.target.value as typeof unit)}><option value="page">页</option><option value="episode">集</option><option value="minute">分钟</option></select></label><label className={fieldStyles.field}>当前进度<input name="value" inputMode="numeric" maxLength={100} required value={value} onChange={event=>setValue(event.target.value)}/></label><label className={fieldStyles.field}>总量（可留空）<input name="total" inputMode="numeric" maxLength={100} value={total} onChange={event=>setTotal(event.target.value)}/></label></div>
 {error?<p role="alert" className={fieldStyles.error}>{error}</p>:null}{comparison?<div><p>当前进度：{comparison.progress_value??"未记录"} / {comparison.progress_total??"未填写"} · 版本 {comparison.mutation_revision}</p><Button type="button" variant="outline" onClick={()=>{const next=z.number().int().nonnegative().safeParse(comparison.mutation_revision);if(!next.success)return;const nextRequest=crypto.randomUUID(),raw=recovery.capture();recovery.setValue({...raw,expected_revision:String(next.data),request_id:nextRequest,submitted_input:""});setRevision(next.data);setRequestId(nextRequest);setSubmittedInput("");onSaved(comparison);setComparison(null);setError("已采用比较后的当前版本，原进度输入尚未保存。");}}>采用当前版本，保留输入</Button></div>:null}<div className={fieldStyles.actions}><Button type="button" variant="outline" disabled={Boolean(submittedInput)||feedback?.progress_value==null} onClick={()=>showPreview(true)}>清除记录</Button><Button disabled={!dirty&&!submittedInput}>{submittedInput?"预览原进度核对":"预览保存进度"}</Button></div><DraftRecoveryStatus dirty={recovery.dirty} restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable}/></form>
 {preview&&recovery.isCurrent()?<LifeConfirm change={preview.change} requestId={preview.input.requestId} resumeReadOnly={Boolean(submittedInput)} onSubmitted={input=>{if(!recovery.isCurrent())return;const raw=recovery.capture(),encoded=encodeLifeSubmission(input,raw),snapshot={...raw,submitted_input:encoded};submitted.current=snapshot;setSubmittedInput(encoded);recovery.setValue(snapshot);}} onClose={()=>setPreview(null)} onSaved={completed}/>:null}</section>;
}
