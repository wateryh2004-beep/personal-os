"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { keepExperienceReadingDocument } from "@/features/experience-library/actions";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { ExperienceReadingDocument } from "@/features/experience-library/types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ExperienceSourceLink({ href, children, className = "ui-link" }: { href: string; children: ReactNode; className?: string }) {
  return <a className={className} href={href} onClick={() => {
    const details = document.getElementById("experience-originals");
    if (details instanceof HTMLDetailsElement) details.open = true;
    requestAnimationFrame(() => document.getElementById(href.slice(1))?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  }}>{children}</a>;
}
export function ExperienceReadingDocuments({ documents, captureCount, unavailable = false }: { documents: ExperienceReadingDocument[]; captureCount: number; unavailable?: boolean }) {
  const router = useRouter();
  const [changing, setChanging] = useState<string | null>(null), [message, setMessage] = useState("");
  if (unavailable) return <section className="experience-reading-documents"><h2>阅读版</h2><p role="status">阅读版暂时无法读取，原文和图片仍可展开查看。</p></section>;
  if (!documents.length) return <section className="experience-reading-documents"><h2>阅读版</h2><p>这篇经验还没有整理好的阅读版。下方可以查看原文与图片。</p></section>;
  const kept = documents.filter((item) => item.qualityStatus === "keep");
  const pending = documents.filter((item) => item.qualityStatus === "pending_delete");
  function article(item: ExperienceReadingDocument) {
    return <article key={item.captureId} className="experience-reading-article" data-quality={item.qualityStatus}>
      <h3>{item.title}</h3>
      {item.qualityStatus === "pending_delete" ? <div className="experience-reading-quality"><span>待删除 · {item.qualityReason}</span><Button type="button" size="sm" variant="outline" disabled={changing === item.captureId} onClick={() => { setChanging(item.captureId); setMessage(""); void keepExperienceReadingDocument(item.captureId, item.revision).then(() => { setMessage("已恢复保留，并记录新版本。"); router.refresh(); }).catch((error) => setMessage(error instanceof Error ? error.message : "状态未能保存。" )).finally(() => setChanging(null)); }}>保留这篇</Button></div> : null}
      {item.coverageStatus === "partial" ? <p className="experience-reading-coverage">部分图片尚未识别，或识别结果需要核对；阅读版只依据可读取的文字。</p> : null}
      <div className="experience-reading-body"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} skipHtml components={{ img: () => null, a: ({ href, children }) => href?.startsWith("#") ? <ExperienceSourceLink href={href}>{children}</ExperienceSourceLink> : <span>{children}</span> }}>{item.bodyMarkdown}</ReactMarkdown></div>
      <div className="experience-reading-sources"><span>核对来源</span>{item.sourceRefs.flatMap((ref, index) => {
        if (!uuid.test(ref.id) || typeof ref.quote !== "string" || !["capture", "image"].includes(ref.type)) return [];
        if (ref.valid === false) return [<span key={`${ref.id}-${index}`}>来源已变化，请查看原文</span>];
        const href = ref.type === "image" ? `#experience-media-${ref.id}` : `#experience-capture-${ref.id}`;
        return [<ExperienceSourceLink key={`${ref.id}-${index}`} href={href}>{ref.type === "image" ? "图片" : "原文"} {index + 1}：{ref.quote.slice(0, 36)}</ExperienceSourceLink>];
      })}</div>
    </article>;
  }
  return <section className="experience-reading-documents" aria-labelledby="experience-reading-title">
    <div className="experience-reading-heading"><h2 id="experience-reading-title">经验阅读版</h2><span>{kept.length} 篇值得保留{pending.length ? ` · ${pending.length} 篇待删除` : ""}</span></div>
    {kept.map(article)}
    {message ? <p role="status">{message}</p> : null}
    {pending.length ? <details className="experience-pending-delete"><summary>待删除的 {pending.length} 篇 · 查看理由</summary>{pending.map(article)}</details> : null}
    {documents.length < captureCount ? <p className="experience-reading-coverage">还有 {captureCount - documents.length} 次原文未整理，请在下方查看原文。</p> : null}
  </section>;
}
