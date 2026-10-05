"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { saveLeisureFeedback } from "@/features/leisure/actions";
import type { LeisureExperience, LeisureFeedbackInput, LeisureFeedbackResult, LeisureReaction, LeisureStatus } from "@/features/leisure/types";
import { leisureStatusLabels } from "@/features/leisure/presentation";
import styles from "./leisure.module.css";

export function LeisureFeedbackControls({ experience, onSave = saveLeisureFeedback }: { experience: LeisureExperience; onSave?: (input: LeisureFeedbackInput) => Promise<LeisureFeedbackResult> }) {
  const [feedback, setFeedback] = useState(experience.feedback);
  const [note, setNote] = useState(experience.feedback?.personal_note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  const noteDirty = note !== (feedback?.personal_note ?? "");
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
  return <section className={styles.feedback} data-leisure-navigation-block={pending ? "saving" : noteDirty ? "draft" : undefined} aria-labelledby="leisure-feedback-title">
    <h2 id="leisure-feedback-title">我的这一页</h2><p className={styles.caption}>自己的选择和感受，独立于作品资料保存。</p>
    <div className={styles.feedbackButtons} role="group" aria-label="体验状态">{(Object.keys(leisureStatusLabels) as LeisureStatus[]).map((status) => <button key={status} type="button" aria-pressed={feedback?.status === status} disabled={pending || Boolean(error)} onClick={() => save({ status: feedback?.status === status ? null : status })}>{leisureStatusLabels[status]}</button>)}</div>
    <div className={styles.feedbackButtons} role="group" aria-label="我的感受"><button type="button" aria-pressed={feedback?.reaction === "liked"} disabled={pending || Boolean(error)} onClick={() => save({ reaction: feedback?.reaction === "liked" ? "none" : "liked" })}>喜欢，留着</button><button type="button" aria-pressed={feedback?.reaction === "not_for_me"} disabled={pending || Boolean(error)} onClick={() => save({ reaction: feedback?.reaction === "not_for_me" ? "none" : "not_for_me" })}>不太适合我</button></div>
    <div className={`${styles.feedbackStatus} ${error ? styles.error : ""}`} role={error ? "alert" : "status"} aria-live="polite">{pending ? "正在保存…" : error ? <>{error} 如有未保存的感想，请先复制留存，再<button type="button" className={styles.quietButton} onClick={() => window.location.reload()}>重新打开</button>以读取最新状态。</> : noteDirty ? saved ? "选择已保存，感想尚未保存" : "感想尚未保存" : saved ? "已保存" : "点一次记下，再点一次取消"}</div>
    <details className={styles.reflection} open={feedback?.personal_note ? true : undefined}><summary>留一句自己的感想</summary><label htmlFor="leisure-personal-note">这一刻的感受<textarea id="leisure-personal-note" value={note} maxLength={10000} disabled={pending} onChange={(event) => { setNote(event.target.value); setSaved(false); }} placeholder="喜欢哪一点，或为什么不适合自己…" /></label><div className={styles.feedbackButtons}><button type="button" disabled={pending || Boolean(error) || !noteDirty} onClick={() => save({ personal_note: note })}>保存感想</button></div></details>
    {feedback?.linked_note_id && feedback.linked_note_available ? <Link href={`/notes/${feedback.linked_note_id}`} className={styles.link}>{feedback.linked_note_title || "打开关联笔记"}</Link> : feedback?.linked_note_id ? <p className={styles.caption}>关联笔记目前不可用，原有引用已保留。</p> : null}
  </section>;
}
