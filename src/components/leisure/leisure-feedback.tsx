"use client";

import Link from "next/link";
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
  const [note, setNote] = useState(experience.feedback?.personal_note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [progressDirty,setProgressDirty]=useState(false);
  const saving = useRef(false);
  useLifeUndo((operation,rows)=>{if(operation!=="leisure_progress"||!rows.some(row=>row.id===experience.id))return;void reconcile();});
  const noteDirty = note !== (feedback?.personal_note ?? "");
  const [sourceFeedback, setSourceFeedback] = useState(experience.feedback);
  if (sourceFeedback !== experience.feedback) { setSourceFeedback(experience.feedback); setFeedback(experience.feedback); if (!noteDirty) setNote(experience.feedback?.personal_note ?? ""); }
  async function reconcile() {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    try {
      const result = await onRead(experience.id);
      if (!result.ok) { setError("暂时无法读取最新状态，请重试。"); return; }
      // Rebase the confirmed revision, preserving any independently edited text.
      if (!noteDirty) setNote(result.feedback?.personal_note ?? "");
      setFeedback(result.feedback);
      setError(null);
      setSaved(false);
    } catch { setError("暂时无法读取最新状态，请重试。"); }
    finally { saving.current = false; setPending(false); }
  }
  useEffect(() => {
    if (!noteDirty && !pending) return;
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [noteDirty, pending]);
  async function save(patch: { status?: LeisureStatus | null; reaction?: LeisureReaction; personal_note?: string }) {
    if (saving.current || error) return;
    saving.current = true;
    setPending(true);
    setSaved(false);
    try {
      const result = await onSave({ experience_id: experience.id, expected_revision: feedback?.revision ?? 0, status: feedback?.status ?? null, reaction: feedback?.reaction ?? "none", personal_note: feedback?.personal_note ?? "", linked_note_id: feedback?.linked_note_id ?? null, ...patch });
      if (result.ok) { setFeedback(result.feedback); setSaved(true); }
      else setError(result.error === "conflict" ? "内容已在别处更新。这次修改没有覆盖它。" : result.error === "note_unavailable" ? "关联笔记已不可用，这次修改没有保存。" : "暂时无法确认保存结果。");
    } catch { setError("连接中断，暂时无法确认保存结果。"); }
    finally { saving.current = false; setPending(false); }
  }
  return <section className={styles.feedback} data-leisure-navigation-block={pending ? "saving" : noteDirty||progressDirty ? "draft" : undefined} aria-labelledby={feedbackTitleId}>
    <h2 id={feedbackTitleId}>我的这一页</h2>
    <LeisureProgressForm experienceId={experience.id} feedback={feedback} onDirtyChange={setProgressDirty} onSaved={(patch) => setFeedback((before) => ({ status: before?.status ?? null, reaction: before?.reaction ?? "none", personal_note: before?.personal_note ?? "", linked_note_id: before?.linked_note_id ?? null, linked_note_title: before?.linked_note_title ?? null, linked_note_available: before?.linked_note_available ?? false, updated_at: before?.updated_at ?? new Date().toISOString(), revision: Number(patch.mutation_revision), progress_unit: patch.progress_unit as "page" | "episode" | "minute" | null, progress_value: patch.progress_value as number | null, progress_total: patch.progress_total as number | null }))} />
    <div className={styles.feedbackButtons} role="group" aria-label="体验状态">{(Object.keys(leisureStatusLabels) as LeisureStatus[]).map((status) => <button key={status} type="button" aria-pressed={feedback?.status === status} disabled={pending || Boolean(error)} onClick={() => save({ status: feedback?.status === status ? null : status })}>{leisureStatusLabels[status]}</button>)}</div>
    <div className={styles.feedbackButtons} role="group" aria-label="我的感受"><button type="button" aria-pressed={feedback?.reaction === "liked"} disabled={pending || Boolean(error)} onClick={() => save({ reaction: feedback?.reaction === "liked" ? "none" : "liked" })}>喜欢，留着</button><button type="button" aria-pressed={feedback?.reaction === "not_for_me"} disabled={pending || Boolean(error)} onClick={() => save({ reaction: feedback?.reaction === "not_for_me" ? "none" : "not_for_me" })}>不太适合我</button></div>
    <div className={`${styles.feedbackStatus} ${error ? styles.error : ""}`} role={error ? "alert" : "status"} aria-live="polite">{pending ? "正在同步…" : error ? <>{error} <button type="button" className={styles.quietButton} onClick={() => void reconcile()}>读取最新状态</button></> : noteDirty ? saved ? "选择已保存，感想尚未保存" : "感想尚未保存" : saved ? "已保存" : ""}</div>
    <details className={styles.reflection} open={feedback?.personal_note ? true : undefined}><summary>留一句自己的感想</summary><label htmlFor={personalNoteId}>这一刻的感受<textarea id={personalNoteId} value={note} maxLength={10000} disabled={pending} onChange={(event) => { setNote(event.target.value); setSaved(false); }} placeholder="喜欢哪一点，或为什么不适合自己…" /></label><div className={styles.feedbackButtons}><button type="button" disabled={pending || Boolean(error) || !noteDirty} onClick={() => save({ personal_note: note })}>保存感想</button></div></details>
    {feedback?.linked_note_id && feedback.linked_note_available ? <Link href={`/notes/${feedback.linked_note_id}`} className={styles.link}>{feedback.linked_note_title || "打开关联笔记"}</Link> : feedback?.linked_note_id ? <p className={styles.caption}>关联笔记目前不可用，原有引用已保留。</p> : null}
  </section>;
}

function LeisureProgressForm({ experienceId, feedback, onSaved,onDirtyChange }: { experienceId: string; feedback: LeisureExperience["feedback"]; onDirtyChange:(dirty:boolean)=>void; onSaved: (row: import("@/features/life/contracts").LifeFieldRow) => void }) {
 const [unit,setUnit]=useState(feedback?.progress_unit ?? "page");
 const [value,setValue]=useState(String(feedback?.progress_value ?? ""));
 const [total,setTotal]=useState(String(feedback?.progress_total ?? ""));
 const [change,setChange]=useState<LifeChange|null>(null);
 const [error,setError]=useState("");
 const [sourceProgress,setSourceProgress]=useState(feedback);
 if(sourceProgress!==feedback){const cleanBefore=value===String(sourceProgress?.progress_value??"")&&total===String(sourceProgress?.progress_total??"")&&(value===""||unit===(sourceProgress?.progress_unit??"page"));setSourceProgress(feedback);if(cleanBefore){setValue(String(feedback?.progress_value??""));setTotal(String(feedback?.progress_total??""));setUnit(feedback?.progress_unit??"page");}}
 const dirty=value!==String(feedback?.progress_value??"") || total!==String(feedback?.progress_total??"") || value!=="" && unit!==(feedback?.progress_unit??"page");
 useEffect(()=>{onDirtyChange(dirty||Boolean(change));return()=>onDirtyChange(false);},[dirty,change,onDirtyChange]);
 useEffect(()=>{if(!dirty)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);},[dirty]);
 const labels={page:"页",episode:"集",minute:"分钟"};
 return <section aria-label="我的进度" tabIndex={-1} data-life-return-focus><p className={fieldStyles.meta}>{feedback?.progress_unit && feedback.progress_value!==null && feedback.progress_value!==undefined ? `已记录：${feedback.progress_value}${feedback.progress_total ? ` / ${feedback.progress_total}` : ""} ${labels[feedback.progress_unit]}` : "尚未记录进度"}</p>
 <form onSubmit={event=>{event.preventDefault();setError("");if(!/^\d+$/.test(value)||Number(value)>1000000||total!==""&&(!/^\d+$/.test(total)||Number(total)<1||Number(total)>1000000||Number(value)>Number(total))){setError("请填写有效进度，总量不能小于当前进度。");return;}setChange({title:"保存我的进度",details:[{id:experienceId,title:"用户记录进度",change:`${value}${total ? ` / ${total}` : ""} ${labels[unit]}`}],input:{operation:"leisure_progress",items:[{id:experienceId,expected_revision:feedback?.revision??0,progress_unit:unit,progress_value:Number(value),progress_total:total?Number(total):null}]}});}}>
 <div className={fieldStyles.fields}><label className={fieldStyles.field}>单位<select value={unit} onChange={event=>setUnit(event.target.value as typeof unit)}><option value="page">页</option><option value="episode">集</option><option value="minute">分钟</option></select></label><label className={fieldStyles.field}>当前进度<input type="number" min="0" max="1000000" required value={value} onChange={event=>setValue(event.target.value)}/></label><label className={fieldStyles.field}>总量（可留空）<input type="number" min="1" max="1000000" value={total} onChange={event=>setTotal(event.target.value)}/></label></div>
 {error?<p role="alert" className={fieldStyles.error}>{error}</p>:null}<div className={fieldStyles.actions}><Button type="button" variant="outline" disabled={feedback?.progress_value==null} onClick={()=>setChange({title:"清除进度记录",details:[{id:experienceId,title:"我的进度",change:"已记录进度 → 未记录"}],input:{operation:"leisure_progress",items:[{id:experienceId,expected_revision:feedback?.revision??0,progress_unit:null,progress_value:null,progress_total:null}]}})}>清除记录</Button><Button disabled={!dirty}>预览保存进度</Button></div></form>
 {change?<LifeConfirm change={change} onClose={()=>setChange(null)} onSaved={rows=>{const row=rows[0];onSaved(row);setValue(String(row.progress_value??""));setTotal(String(row.progress_total??""));setUnit(row.progress_unit as typeof unit??"page");setChange(null);}}/>:null}</section>;
}
