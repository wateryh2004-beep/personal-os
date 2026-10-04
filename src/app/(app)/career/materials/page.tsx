import Link from "next/link";
import { CareerNav } from "@/components/career/career-nav";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { PageHeader } from "@/components/shared/page-header";
import { careerLabel } from "@/features/career/labels";
import { careerMaterialReadHref, getCareerMaterials } from "@/features/career/materials";

export default async function CareerMaterialsPage() {
  const data = await getCareerMaterials();
  return <>
    <PageHeader title="我的材料" description="阅读简历、经历证明和面试引用的文件。只显示已关联职业资料的内容。" />
    <CareerNav current="/career/materials" />
    {data.unavailable ? <p role="status" className="mb-8 rounded-[var(--radius-lg)] bg-amber-50 px-4 py-3 text-sm text-amber-800">部分材料暂时无法读取，以下内容可能不完整。请稍后重试。</p> : null}

    <section aria-labelledby="career-resumes-heading" className="mb-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="career-resumes-heading" className="text-[16px] font-medium text-[var(--text-primary)]">简历</h2>
        <Link href="/career/resumes" className="inline-flex min-h-11 items-center text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">查看版本记录 →</Link>
      </div>
      <div className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
        {data.resumes.map((resume, index) => <details key={resume.id} id={`resume-${resume.id}`} open={index === 0} className="group scroll-mt-8 py-1">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3">
            <span className="min-w-0"><span className="block break-words text-[15px] font-medium text-[var(--text-primary)]">{resume.title}</span><span className="mt-1 block text-[12px] text-[var(--text-tertiary)]">{resume.version_label || "未命名版本"} · {resume.status === "draft" ? "草稿" : "已定稿"} · {new Date(resume.updated_at).toLocaleDateString("zh-CN", { timeZone: "UTC" })}</span></span>
            <span aria-hidden="true" className="text-[var(--text-tertiary)] group-open:rotate-180">⌄</span>
          </summary>
          <div className="max-w-3xl pb-6 pt-2">
            {resume.content_markdown.trim() ? <EntityMarkdown body={resume.content_markdown} className="text-[15px] leading-7" /> : <p className="text-sm leading-6 text-[var(--text-secondary)]">这个版本尚无正文。若有已关联的正式文件，可在下方打开。</p>}
            {data.documents.filter((document) => document.id === resume.document_id).map((document) => {
              const href = careerMaterialReadHref(document);
              return href ? <a key={document.id} href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)] hover:underline">打开关联文件：{document.title} ↗</a> : null;
            })}
          </div>
        </details>)}
        {!data.resumes.length ? <p className="py-6 text-sm leading-6 text-[var(--text-secondary)]">{data.unavailable ? "暂时没有可显示的简历。" : "还没有简历版本。由 Codex / Claude 整理并写入后，可以在这里阅读。"}</p> : null}
      </div>
    </section>

    <section aria-labelledby="career-documents-heading">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="career-documents-heading" className="text-[16px] font-medium text-[var(--text-primary)]">关联文件</h2>
        <span className="text-[12px] text-[var(--text-tertiary)]">{data.documents.length} 份</span>
      </div>
      <div className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
        {data.documents.map((document) => {
          const href = careerMaterialReadHref(document);
          const associations = data.associations.filter((item) => item.documentId === document.id);
          return <article key={document.id} className="py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="break-words text-[15px] font-medium text-[var(--text-primary)]">{href ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-[var(--accent)] hover:underline">{document.title} <span aria-hidden="true">↗</span></a> : document.title}</h3>
                <p className="mt-1 break-words text-[12px] leading-5 text-[var(--text-tertiary)]">{document.original_filename} · {careerLabel(document.document_type)} · {careerLabel(document.confidentiality_level)}{document.ai_visibility === "never" ? " · 不供 AI 使用" : document.ai_visibility === "sensitive" ? " · AI 敏感资料" : ""}</p>
              </div>
              <time dateTime={document.uploaded_at} className="shrink-0 pt-0.5 text-[12px] tabular-nums text-[var(--text-tertiary)]">{new Date(document.uploaded_at).toLocaleDateString("zh-CN", { timeZone: "UTC" })}</time>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--text-secondary)]">
              {associations.map((association) => <Link key={`${association.href}:${association.label}`} href={association.href} className="inline-flex min-h-9 items-center hover:text-[var(--accent)]">{association.label} →</Link>)}
            </div>
            {!href ? <p className="mt-1 text-[12px] leading-5 text-[var(--text-tertiary)]">旧版存储附件，当前暂不支持直接预览。来源记录仍保留。</p> : null}
          </article>;
        })}
        {!data.documents.length ? <p className="py-6 text-sm leading-6 text-[var(--text-secondary)]">{data.unavailable ? "暂时没有可显示的关联文件。" : "还没有关联文件。文件关联到经历事实、证书、简历或其他职业记录后，会出现在这里。"}</p> : null}
      </div>
    </section>
    <p className="mt-8 text-[12px] leading-6 text-[var(--text-tertiary)]">需要补充或调整内容时，可交给 Codex / Claude 维护；既有录入入口保留在「资料管理」。</p>
  </>;
}
