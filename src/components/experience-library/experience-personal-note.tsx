"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveExperiencePersonalNote } from "@/features/experience-library/actions";
import type { ExperienceReviewStatus } from "@/features/experience-library/types";

export function ExperiencePersonalNote({ entryId, initialNote, initialStatus }: { entryId: string; initialNote: string; initialStatus: ExperienceReviewStatus }) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState({ note: initialNote, status: initialStatus });
  useEffect(() => {
    if (note === saved.note && status === saved.status) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [note, status, saved]);
  return <section className="experience-personal-note" aria-labelledby="experience-note-title">
    <p className="experience-kicker">个人判断 · 不改变原文</p>
    <h2 id="experience-note-title">我的备注和标记</h2>
    <label htmlFor="experience-review-status">标记</label>
    <select id="experience-review-status" disabled={pending} value={status} onChange={(event) => setStatus(event.target.value as ExperienceReviewStatus)}>
      <option value="unmarked">未标记</option><option value="to_read">待看</option><option value="useful">值得参考</option><option value="outdated">已过时</option>
    </select>
    <label htmlFor="experience-personal-note">我的备注</label>
    <Textarea id="experience-personal-note" disabled={pending} value={note} maxLength={10000} onChange={(event) => setNote(event.target.value)} placeholder="记录你的判断、疑问或之后需要核实的内容" rows={4} />
    <div className="experience-note-actions"><Button type="button" disabled={pending} onClick={() => { setMessage(""); startTransition(async () => { try { await saveExperiencePersonalNote({ entryId, note, status }); setSaved({ note, status }); setMessage("已保存"); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "保存未完成，请重试。"); } }); }}>{pending ? "正在保存…" : "保存备注和标记"}</Button><span role="status">{message}</span></div>
  </section>;
}
