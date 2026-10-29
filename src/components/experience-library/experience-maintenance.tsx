"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { findExperienceMergeCandidates, markExperienceReviewed, mergeExperienceEntries, undoExperienceMerge } from "@/features/experience-library/actions";
import { experienceReviewDue } from "@/features/experience-library/review-due";

type Source = { id: string; title: string; sourceUrl: string | null; personalNote: string; aiSummary: string | null };
type Candidate = { id: string; title: string; sourceUrl: string | null; createdAt: string; excerpt: string };
export function ExperienceMaintenance({ entryId, title, createdAt, reviewedAt, mergedIntoId, sources }: { entryId: string; title: string; createdAt: string; reviewedAt?: string | null; mergedIntoId?: string | null; sources: Source[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [candidates, setCandidates] = useState<Candidate[]>([]), [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false), [loadFailed, setLoadFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const due = experienceReviewDue(createdAt, reviewedAt);
  function run(action: () => Promise<void>, success: string) {
    setMessage(""); startTransition(async () => { try { await action(); setMessage(success); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "操作未完成，请重试。"); } });
  }
  async function showCandidates() {
    setOpen(true); setMessage(""); setCandidates([]); setLoading(true); setLoadFailed(false);
    try { setCandidates(await findExperienceMergeCandidates(entryId)); }
    catch (error) { setLoadFailed(true); setMessage(error instanceof Error ? error.message : "暂时无法读取候选资料。"); }
    finally { setLoading(false); }
  }
  return <section className="experience-maintenance" aria-label="资料维护">
    {mergedIntoId ? <p>这篇资料已合并展示到<Link className="ui-link" href={`/experience-library/${mergedIntoId}`}>主记录</Link>。原文仍独立保留。</p> : <>
      <div className="experience-maintenance-row"><span>{due ? "这篇经验已超过 90 天未复核，日期和招聘流程建议重新确认。" : reviewedAt ? "已记录最近一次人工复核。" : "保留收录时间，方便以后判断时效。"}</span><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => markExperienceReviewed(entryId), "已记录本次复核；内容没有自动改写。")}>已核对内容</Button></div>
      <div className="experience-maintenance-row"><span>整理可能重复的经验；合并可以撤销，原文和图片会保留。</span><Button type="button" size="sm" variant="outline" onClick={() => void showCandidates()}>检查重复资料</Button></div>
      {sources.length ? <details><summary>已归入本篇的 {sources.length} 篇原记录</summary><ul>{sources.map((source) => <li key={source.id}><Link className="ui-link" href={`/experience-library/${source.id}`}>{source.title}</Link>{source.personalNote ? <p>原备注：{source.personalNote}</p> : null}{source.aiSummary ? <p>原摘要：{source.aiSummary}</p> : null}<Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => undoExperienceMerge({ sourceId: source.id, targetId: entryId }), "已拆分；两篇原记录均保留。")}>撤销合并</Button></li>)}</ul></details> : null}
    </>}
    {message ? <p role="status">{message}</p> : null}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>合并重复经验</DialogTitle><DialogDescription>当前主记录《{title}》。确认后只归组展示，原文、图片和备注仍保留，可随时拆分。</DialogDescription></DialogHeader>
      {loading ? <p role="status">正在读取候选资料…</p> : candidates.length ? <div className="experience-merge-candidates">{candidates.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{item.excerpt}</p><p>收录于 {new Date(item.createdAt).toLocaleDateString("zh-CN")}</p><div className="experience-maintenance-row"><Link className="ui-link" href={`/experience-library/${item.id}`} target="_blank">先查看原记录</Link><Button type="button" size="sm" disabled={pending} onClick={() => { if (window.confirm(`将《${item.title}》归入《${title}》？原记录可恢复。`)) run(async () => { await mergeExperienceEntries({ sourceId: item.id, targetId: entryId }); setOpen(false); }, "已归入主记录。"); }}>归入本篇</Button></div></article>)}</div> : !loadFailed ? <p>未发现来源链接或标题相同的资料。</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </DialogContent></Dialog>
  </section>;
}
