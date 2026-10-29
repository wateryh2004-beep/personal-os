"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { recordExperienceActionOutcome } from "@/features/experience-library/actions";

type Review = { taskId: string; verdict: "effective" | "partly" | "not_effective" | "not_tried"; note: string; createdAt: string };
const labels = { effective: "有帮助", partly: "部分有用", not_effective: "不适用", not_tried: "尚未尝试" } as const;
export function ExperienceTaskOutcome({ entryId, taskId, reviews }: { entryId: string; taskId: string; reviews: Review[] }) {
  const router = useRouter(); const requestId = useRef<string | null>(null);
  const [verdict, setVerdict] = useState<Review["verdict"]>("not_tried"), [note, setNote] = useState(""), [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const history = reviews.filter((item) => item.taskId === taskId);
  return <details className="experience-task-outcome"><summary>{history.length ? `结果：${labels[history[0].verdict]} · 记录 ${history.length} 次` : "记录实际结果"}</summary>
    <p>记录你的尝试和判断，原经验与 Microsoft To Do 状态不会被改写。</p>
    <label>结果 <select value={verdict} disabled={pending} onChange={(event) => setVerdict(event.target.value as Review["verdict"])}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>过程或结果 <Textarea value={note} maxLength={5000} rows={3} disabled={pending} onChange={(event) => setNote(event.target.value)} placeholder="实际做了什么？结果如何？" /></label>
    <Button type="button" size="sm" disabled={pending} onClick={() => { requestId.current ??= crypto.randomUUID(); setMessage(""); startTransition(async () => { try { await recordExperienceActionOutcome({ entryId, taskId, requestId: requestId.current!, verdict, note }); requestId.current = null; setNote(""); setMessage("结果已记录。"); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "保存未完成，请重试。"); } }); }}>{pending ? "正在保存…" : "保存结果"}</Button>
    {message ? <p role="status">{message}</p> : null}
    {history.length ? <div className="experience-task-history">{history.map((item, index) => <p key={`${item.createdAt}-${index}`}>{new Date(item.createdAt).toLocaleDateString("zh-CN")} · {labels[item.verdict]}{item.note ? ` · ${item.note}` : ""}</p>)}</div> : null}
  </details>;
}
