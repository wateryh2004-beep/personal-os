import Link from "next/link";
import { notFound } from "next/navigation";
import { getExperience } from "@/features/career/queries";
import { careerLabel, careerOptions } from "@/features/career/labels";
import { factTypes } from "@/features/career/schemas";
import { submitCareerForm } from "@/features/career/form-actions";
import { Field, PrimaryButton, SelectField, TextField } from "@/components/career/form-controls";
import { CareerForm } from "@/components/career/career-form";
import { CareerNav } from "@/components/career/career-nav";
import { RelatedPanel } from "@/components/career/related-panel";
import { CareerAssistant } from "@/components/career/career-assistant";
import { PageHeader } from "@/components/shared/page-header";
import { getExperienceGraph } from "@/features/graph/queries";

const formClass = "mt-4 grid gap-4 rounded-[var(--radius-lg)] bg-[var(--surface-hover)] p-4 sm:grid-cols-2";
const summaryClass = "inline-flex min-h-11 cursor-pointer list-none items-center text-[13px] font-medium text-[var(--accent)]";
const verificationOptions = careerOptions(["unverified", "self_confirmed", "document_verified", "externally_verified"]);
const privacyOptions = careerOptions(["private", "sensitive", "public_safe"]);

function Section({ id, title, count, description, children }: { id: string; title: string; count: number; description: string; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-24 border-t border-[var(--separator)] pt-6"><div className="flex items-baseline gap-2"><h2 className="text-[16px] font-semibold text-[var(--text-primary)]">{title}</h2><span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">{count}</span></div><p className="mb-4 mt-1 text-[13px] leading-6 text-[var(--text-secondary)]">{description}</p>{children}</section>;
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="py-3 text-[14px] leading-6 text-[var(--text-secondary)]">{children}</p>; }

export default async function ExperiencePage({ params }: { params: Promise<{ experienceId: string }> }) {
  const { experienceId } = await params;
  const data = await getExperience(experienceId);
  if (!data) notFound();
  const e = data.experience;
  const graph = await getExperienceGraph(e.id, [e.organization, e.role].filter(Boolean).join(" "));

  return <>
    <PageHeader title={[e.organization, e.role].filter(Boolean).join(" · ")} description={`${careerLabel(e.experience_type)} · ${e.start_date || "未填写开始日期"} — ${e.end_date || (e.is_current ? "至今" : "未填写结束日期")}${e.location ? ` · ${e.location}` : ""}`} />
    <CareerNav current="/career/experiences" />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-[13px]"><Link href="/career/experiences" className="inline-flex min-h-11 items-center text-[var(--accent)]">← 全部履历素材</Link><span className="text-[var(--text-secondary)]">{careerLabel(e.status)} · {careerLabel(e.confidentiality_level)}</span></div>
    {(e.background_markdown || e.raw_description_markdown) ? <section className="mb-8 max-w-3xl text-[14px] leading-7 text-[var(--text-secondary)]"><h2 className="mb-2 font-medium text-[var(--text-primary)]">经历概况</h2><p className="whitespace-pre-wrap">{e.background_markdown || e.raw_description_markdown}</p>{e.background_markdown && e.raw_description_markdown ? <details className="mt-2"><summary className={summaryClass}>原始记录</summary><p className="whitespace-pre-wrap">{e.raw_description_markdown}</p></details> : null}</section> : null}
    <nav aria-label="经历内容" className="mb-8 flex flex-wrap gap-2">{[["facts", "事实", data.facts.length], ["outputs", "成果", data.outputs.length], ["expressions", "表达", data.bullets.length], ["evidence", "证据", data.documents.length]].map(([id, title, count]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">{title}<span className="text-[12px] tabular-nums text-[var(--text-tertiary)]">{count}</span></a>)}</nav>

    <div className="space-y-8">
      <Section id="facts" title="事实" count={data.facts.length} description="记录真实发生的事。每次修改保留历史，求职表达不会覆盖事实。">
        <div className="divide-y divide-[var(--separator)]">{data.facts.map((fact) => {
          const versions = data.versions.filter((version) => version.fact_id === fact.id);
          return <article key={fact.id} id={`fact-${fact.id}`} className="py-4"><p className="whitespace-pre-wrap text-[14px] leading-7">{fact.content}</p><p className="mt-1 text-[12px] leading-6 text-[var(--text-secondary)]">{careerLabel(fact.fact_type)} · {careerLabel(fact.verification_status)}{fact.metric_value !== null ? ` · ${fact.metric_value} ${fact.metric_unit || ""}` : ""}</p>
            {fact.source_document_id ? <Link href={`/files?file=${fact.source_document_id}`} className="inline-flex min-h-11 items-center text-[13px] text-[var(--accent)]">查看来源文件 →</Link> : null}
            <details><summary className={summaryClass}>编辑事实{versions.length ? ` · ${versions.length} 个历史版本` : ""}</summary><CareerForm action={submitCareerForm.bind(null, "updateFact")} className={formClass} successTargetId={`fact-${fact.id}`}><input type="hidden" name="experience_id" value={e.id}/><input type="hidden" name="fact_id" value={fact.id}/><input type="hidden" name="source_document_id" value={fact.source_document_id || ""}/><div className="sm:col-span-2"><TextField label="事实内容" name="content" defaultValue={fact.content}/></div><SelectField label="类型" name="fact_type" values={careerOptions(factTypes)} defaultValue={fact.fact_type}/><SelectField label="验证状态" name="verification_status" values={verificationOptions} defaultValue={fact.verification_status}/><Field label="量化数值" name="metric_value" type="number" defaultValue={fact.metric_value === null ? "" : String(fact.metric_value)}/><Field label="单位" name="metric_unit" defaultValue={fact.metric_unit}/><Field label="发生日期" name="occurred_at" type="date" defaultValue={fact.occurred_at}/><TextField label="补充说明" name="notes_markdown" defaultValue={fact.notes_markdown}/><PrimaryButton>保存事实</PrimaryButton></CareerForm>
              {versions.length ? <details className="mt-3"><summary className={summaryClass}>查看历史版本</summary><ol className="divide-y divide-[var(--separator)]">{versions.map((version) => <li key={version.id} className="py-3"><p className="text-[12px] text-[var(--text-secondary)]">版本 {version.version_number} · {new Date(version.created_at).toLocaleString("zh-CN")}</p><p className="mt-1 whitespace-pre-wrap text-[13px] leading-6">{version.content}</p></li>)}</ol></details> : null}
            </details>
          </article>;
        })}</div>
        {!data.facts.length ? <Empty>还没有事实。从一件具体做过的事开始。</Empty> : null}
        <details><summary className={summaryClass}>＋ 添加事实</summary><CareerForm action={submitCareerForm.bind(null, "createFact")} resetOnSuccess className={formClass} successTargetId="facts" successMessage="事实已添加，可在上方查看。"><input type="hidden" name="experience_id" value={e.id}/><div className="sm:col-span-2"><TextField label="事实内容" name="content"/></div><SelectField label="类型" name="fact_type" values={careerOptions(factTypes)} defaultValue="responsibility"/><SelectField label="验证状态" name="verification_status" values={verificationOptions} defaultValue="unverified"/><Field label="量化数值" name="metric_value" type="number"/><Field label="单位" name="metric_unit"/><Field label="发生日期" name="occurred_at" type="date"/><TextField label="补充说明" name="notes_markdown"/><input type="hidden" name="source_document_id" value=""/><PrimaryButton>添加事实</PrimaryButton></CareerForm></details>
      </Section>

      <Section id="outputs" title="成果" count={data.outputs.length} description="把报告、产品、分析或其他产出，与发生的结果一起保留。">
        <div className="divide-y divide-[var(--separator)]">{data.outputs.map((output) => <article key={output.id} className="py-4"><h3 className="text-[14px] font-medium">{output.name}</h3><p className="mt-1 whitespace-pre-wrap text-[14px] leading-7 text-[var(--text-secondary)]">{output.result_markdown || output.description_markdown || "尚未填写结果"}</p><p className="mt-1 text-[12px] text-[var(--text-tertiary)]">{careerLabel(output.output_type)} · {careerLabel(output.confidentiality_level)}</p></article>)}</div>
        {!data.outputs.length ? <Empty>还没有成果，可从这段经历中完成的一份产出开始。</Empty> : null}
        <details><summary className={summaryClass}>＋ 添加成果</summary><CareerForm action={submitCareerForm.bind(null, "createOutput")} resetOnSuccess className={formClass} successTargetId="outputs"><input type="hidden" name="experience_id" value={e.id}/><Field label="成果名称" name="name" required/><SelectField label="类型" name="output_type" values={careerOptions(["report", "presentation", "product", "code", "analysis", "document", "event", "process", "publication", "dataset", "other"])} defaultValue="other"/><Field label="发生日期" name="occurred_at" type="date"/><Field label="公开链接" name="public_url" type="url"/><SelectField label="保密级别" name="confidentiality_level" values={privacyOptions} defaultValue="private"/><TextField label="成果描述" name="description_markdown"/><TextField label="结果" name="result_markdown"/><PrimaryButton>添加成果</PrimaryButton></CareerForm></details>
      </Section>

      <Section id="expressions" title="表达" count={data.bullets.length} description="为求职整理表达；先关联事实、人工核对，再批准用于简历。">
        <div className="divide-y divide-[var(--separator)]">{data.bullets.map((bullet) => <article key={bullet.id} className="py-4"><p className="whitespace-pre-wrap text-[14px] leading-7">{bullet.content}</p><p className="mt-1 text-[12px] text-[var(--text-secondary)]">{careerLabel(bullet.status)} · {careerLabel(bullet.source)}{bullet.career_direction_id ? ` · ${data.directions.find((direction) => direction.id === bullet.career_direction_id)?.name || "职业方向"}` : ""}</p><details><summary className={summaryClass}>关联事实与批准</summary><div className="mt-2 space-y-3">{data.facts.length ? <CareerForm action={submitCareerForm.bind(null, "linkFactToBullet")} className="flex flex-wrap items-end gap-3"><input type="hidden" name="bullet_id" value={bullet.id}/><SelectField label="支持这条表达的事实" name="fact_id" values={data.facts.map((fact) => ({ value: fact.id, label: fact.content.slice(0, 80) }))}/><PrimaryButton>关联事实</PrimaryButton></CareerForm> : <p className="text-[13px] text-[var(--text-secondary)]">先在上方添加事实。</p>}{bullet.status !== "approved" ? <CareerForm action={submitCareerForm.bind(null, "approveBullet")}><input type="hidden" name="bullet_id" value={bullet.id}/><PrimaryButton>核对后批准</PrimaryButton></CareerForm> : null}</div></details></article>)}</div>
        {!data.bullets.length ? <Empty>还没有表达。已有事实可以整理成面向具体方向的表述。</Empty> : null}
        <details><summary className={summaryClass}>＋ 创建表达</summary><CareerForm action={submitCareerForm.bind(null, "createBullet")} resetOnSuccess className={formClass} successTargetId="expressions"><input type="hidden" name="experience_id" value={e.id}/><div className="sm:col-span-2"><TextField label="表达内容" name="content"/></div><SelectField label="职业方向" name="career_direction_id" values={[{ value: "", label: "通用" }, ...data.directions.map((direction) => ({ value: direction.id, label: direction.name }))]}/><SelectField label="语言" name="language" values={[{ value: "zh-CN", label: "中文" }, { value: "en", label: "英文" }]} defaultValue="zh-CN"/><SelectField label="来源" name="source" values={careerOptions(["human", "ai_draft", "ai_edited"])} defaultValue="human"/><PrimaryButton>创建表达草稿</PrimaryButton></CareerForm></details>
      </Section>

      <Section id="evidence" title="证据" count={data.documents.length} description="保留支持这段经历的材料，并延续原有私有存储与访问权限。">
        <div className="divide-y divide-[var(--separator)]">{data.documents.map((document) => <article key={document.id} className="py-3"><p className="text-[14px]">{document.original_filename || document.title}</p><p className="mt-1 text-[12px] text-[var(--text-secondary)]">{careerLabel(document.document_type)} · {Math.ceil(document.file_size / 1024)} KB · {careerLabel(document.confidentiality_level)}</p></article>)}</div>
        {!data.documents.length ? <Empty>还没有证明材料。</Empty> : null}
        <details><summary className={summaryClass}>＋ 上传证明材料</summary><CareerForm action={submitCareerForm.bind(null, "uploadEvidence")} resetOnSuccess className={formClass} successTargetId="evidence"><input type="hidden" name="experience_id" value={e.id}/><Field label="文件标题" name="title"/><SelectField label="文件类型" name="document_type" values={careerOptions(["certificate", "transcript", "internship_proof", "project_evidence", "screenshot", "report", "presentation", "resume_pdf", "other"])} defaultValue="project_evidence"/><SelectField label="保密级别" name="confidentiality_level" values={privacyOptions} defaultValue="private"/><label className="grid gap-1.5 text-[13px] text-[var(--text-secondary)]"><span>文件（≤20MB）</span><input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" className="w-full min-w-0 text-[13px]"/></label><PrimaryButton>上传材料</PrimaryButton></CareerForm></details>
      </Section>
      <details className="border-t border-[var(--separator)] pt-4"><summary className={summaryClass}>关联内容与辅助整理</summary><RelatedPanel experienceId={e.id} related={graph.related} suggestions={graph.suggestions}/><CareerAssistant experienceId={e.id}/></details>
      <details className="border-t border-[var(--separator)] pt-4"><summary className={summaryClass}>历史与管理</summary><p className="mb-4 text-[13px] leading-6 text-[var(--text-secondary)]">关联记录 {data.links.length} 条；审计事件 {data.audit.length} 条；事实历史版本 {data.versions.length} 条。</p><CareerForm action={submitCareerForm.bind(null, "archiveExperience")}><input type="hidden" name="experience_id" value={e.id}/><button className="min-h-11 text-[13px] text-[var(--text-secondary)] hover:text-[var(--danger)]">归档经历</button></CareerForm></details>
    </div>
  </>;
}
