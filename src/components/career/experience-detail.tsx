import Link from "next/link";
import type { ReactNode } from "react";
import type { Tables } from "@/types/database";
import type { getExperience } from "@/features/career/queries";
import type { getExperienceGraph } from "@/features/graph/queries";
import { careerLabel, careerOptions } from "@/features/career/labels";
import { factTypes } from "@/features/career/schemas";
import { experienceDates, experienceHistoryDate, safeOutputHref } from "@/features/career/experience-library";
import { Field, SelectField, TextField } from "./form-controls";
import { CareerNav } from "./career-nav";
import { ExperienceFormDialog } from "./experience-form-dialog";
import { ExperienceReadNotice } from "./experience-read-notice";
import { ExperienceTools } from "./experience-tools";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { PageHeader } from "@/components/shared/page-header";

const verificationOptions = careerOptions(["unverified", "self_confirmed", "document_verified", "externally_verified"]);
const privacyOptions = careerOptions(["private", "sensitive", "public_safe"]);
const proseClass = "min-w-0 text-base leading-7 [overflow-wrap:anywhere] [&_p]:leading-7 [&_li]:leading-7 [&_pre]:max-w-full [&_pre]:bg-[var(--surface-control)] [&_pre]:text-[var(--text-primary)]";

function Reading({ body }: { body: string | null }) { return body?.trim() ? <EntityMarkdown body={body} headingOffset={2} className={proseClass} /> : null; }
function Section({ id, title, count, unavailable, description, action, children }: { id: string; title: string; count: number; unavailable: boolean; description: string; action: ReactNode; children: ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-heading`} className="min-w-0 scroll-mt-24 border-t border-[var(--separator)] pt-7"><div className="flex flex-wrap items-center justify-between gap-4"><h2 id={`${id}-heading`} className="text-lg font-semibold">{title}<span className="ml-3 text-sm font-normal text-[var(--text-secondary)]">{unavailable ? "已读取 " : ""}{count}</span></h2>{action}</div><p className="mb-5 mt-3 text-sm leading-7 text-[var(--text-secondary)]">{description}</p>{children}</section>;
}
function Empty({ unavailable, children }: { unavailable: boolean; children: ReactNode }) { return <p className="py-5 text-sm leading-7 text-[var(--text-secondary)]">{unavailable ? "暂未读取到内容，请重新读取后核对。" : children}</p>; }
function FactFields({ experienceId, fact }: { experienceId: string; fact?: Tables<"experience_facts"> }) {
  return <>
    <input type="hidden" name="experience_id" value={experienceId} /><input type="hidden" name="source_document_id" value={fact?.source_document_id || ""} />{fact ? <input type="hidden" name="fact_id" value={fact.id} /> : null}
    <div className="sm:col-span-2"><TextField label="事实内容" name="content" defaultValue={fact?.content} maxLength={10000} /></div>
    <SelectField label="类型" name="fact_type" values={careerOptions(factTypes)} defaultValue={fact?.fact_type ?? "responsibility"} /><SelectField label="验证状态" name="verification_status" values={verificationOptions} defaultValue={fact?.verification_status ?? "unverified"} />
    <Field label="量化数值" name="metric_value" type="number" step="any" defaultValue={fact?.metric_value == null ? "" : String(fact.metric_value)} /><Field label="单位" name="metric_unit" defaultValue={fact?.metric_unit} maxLength={80} />
    <Field label="发生日期" name="occurred_at" type="date" defaultValue={fact?.occurred_at} /><div className="sm:col-span-2"><TextField label="补充说明" name="notes_markdown" defaultValue={fact?.notes_markdown} maxLength={12000} /></div>
  </>;
}
function FactMeta({ fact }: { fact: Pick<Tables<"experience_facts">, "fact_type" | "verification_status" | "metric_value" | "metric_unit" | "occurred_at" | "source_document_id"> }) {
  return <><p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{careerLabel(fact.fact_type)} · {careerLabel(fact.verification_status)}{fact.metric_value !== null ? ` · ${fact.metric_value} ${fact.metric_unit || ""}` : ""}{fact.occurred_at ? ` · ${fact.occurred_at}` : ""}</p>{fact.source_document_id ? <Link href={`/files?file=${fact.source_document_id}`} className="ui-link inline-flex min-h-11 items-center text-sm">查看来源文件</Link> : null}</>;
}

export function ExperienceDetail({ data, graph, returnHref }: { data: NonNullable<Awaited<ReturnType<typeof getExperience>>>; graph: Awaited<ReturnType<typeof getExperienceGraph>>; returnHref: string }) {
  const e = data.experience;
  const unavailable = data.unavailable;
  const versionsByFact = new Map<string, typeof data.versions>();
  for (const version of data.versions) { const group = versionsByFact.get(version.fact_id) ?? []; group.push(version); versionsByFact.set(version.fact_id, group); }
  return <>
    <Link href={returnHref} className="ui-link mb-4 inline-flex min-h-11 items-center text-sm">返回经历素材</Link>
    <PageHeader title={[e.organization, e.role].filter(Boolean).join(" · ")} description={`${careerLabel(e.experience_type)} · ${experienceDates(e)}${e.location ? ` · ${e.location}` : ""}`} />
    <CareerNav current={`/career/experiences/${e.id}`} />
    <ExperienceReadNotice unavailable={unavailable} />
    <p className="mb-6 text-sm leading-7 text-[var(--text-secondary)]">{careerLabel(e.status)} · {careerLabel(e.confidentiality_level)}{e.is_current ? " · 进行中" : ""}{e.department ? ` · ${e.department}` : ""}</p>
    <section aria-label="经历概况" className="mb-7 min-w-0 max-w-[820px] rounded-[var(--radius-xl)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-5 sm:p-7"><h2 className="mb-4 text-lg font-semibold">经历概况</h2><Reading body={e.background_markdown || e.raw_description_markdown} />{!e.background_markdown?.trim() && !e.raw_description_markdown?.trim() ? <p className="text-sm leading-7 text-[var(--text-secondary)]">尚未填写经历概况。</p> : null}{e.background_markdown && e.raw_description_markdown ? <details className="mt-5"><DisclosureSummary>原始记录</DisclosureSummary><div className="mt-4"><Reading body={e.raw_description_markdown} /></div></details> : null}</section>
    <nav aria-label="经历内容" className="mb-8 flex flex-wrap gap-2">{[["facts", "事实", data.facts.length], ["outputs", "成果", data.outputs.length], ["expressions", "表达", data.bullets.length], ["evidence", "证据", data.documents.length]].map(([id, title, count]) => <a key={id} href={`#${id}`} className="ui-action-secondary inline-flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-4 text-sm">{title}<span className="tabular-nums">{unavailable ? "已读取 " : ""}{count}</span></a>)}</nav>
    <div className="min-w-0 max-w-[820px] space-y-9">
      <Section id="facts" title="事实" count={data.facts.length} unavailable={unavailable} description="记录真实发生的事，修改保留历史；求职表达不会覆盖事实。" action={<ExperienceFormDialog draft={{operation:"career.fact-create",id:"new",parentId:e.id,href:`/career/experiences/${e.id}`,label:"经历未保存内容"}} operation="createFact" title="添加事实" description="记录一件具体做过的事，验证状态由你明确选择。" submitLabel="添加事实" successTargetId="facts"><FactFields experienceId={e.id} /></ExperienceFormDialog>}>
        <div className="divide-y divide-[var(--separator)]">{data.facts.map(fact => {
          const versions = versionsByFact.get(fact.id) ?? [];
          return <article key={fact.id} id={`fact-${fact.id}`} aria-label="事实记录" className="min-w-0 scroll-mt-24 py-5">
            <p className="whitespace-pre-wrap break-words text-base leading-7 [overflow-wrap:anywhere]">{fact.content}</p><FactMeta fact={fact} />
            {fact.notes_markdown ? <div className="mt-3"><h3 className="mb-2 text-sm font-medium">补充说明</h3><Reading body={fact.notes_markdown} /></div> : null}
            <div className="mt-4"><ExperienceFormDialog draft={{operation:"career.fact-edit",id:fact.id,parentId:e.id,href:`/career/experiences/${e.id}`,label:"经历未保存内容"}} operation="updateFact" title="编辑事实" description="保存后追加事实历史，不改写求职表达或已冻结简历。" submitLabel="保存事实" successTargetId={`fact-${fact.id}`}><FactFields experienceId={e.id} fact={fact} /></ExperienceFormDialog></div>
            <details className="mt-3"><DisclosureSummary>事实历史（{versions.length} 个已读取版本）</DisclosureSummary><ol className="mt-3 divide-y divide-[var(--separator)]">{versions.map(version => <li key={version.id} className="py-4"><h3 className="text-sm font-medium">版本 {version.version_number} · <time dateTime={version.created_at} title={data.timezone}>{experienceHistoryDate(version.created_at, data.timezone || "Asia/Shanghai")}</time></h3><p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 [overflow-wrap:anywhere]">{version.content}</p><FactMeta fact={version} /><Reading body={version.notes_markdown} /></li>)}</ol>{!versions.length ? <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">暂未读取到历史版本。</p> : null}</details>
          </article>;
        })}</div>
        {!data.facts.length ? <Empty unavailable={unavailable}>还没有事实，从一件具体做过的事开始。</Empty> : null}
      </Section>
      <Section id="outputs" title="成果" count={data.outputs.length} unavailable={unavailable} description="完整记录产出描述和实际结果。" action={<ExperienceFormDialog draft={{operation:"career.output",id:"new",parentId:e.id,href:`/career/experiences/${e.id}`,label:"经历未保存内容"}} operation="createOutput" title="添加成果" description="记录已有的报告、产品、分析或其他产出。" submitLabel="添加成果" successTargetId="outputs">
        <input type="hidden" name="experience_id" value={e.id} /><Field label="成果名称" name="name" required maxLength={240} /><SelectField label="类型" name="output_type" values={careerOptions(["report", "presentation", "product", "code", "analysis", "document", "event", "process", "publication", "dataset", "other"])} defaultValue="other" /><Field label="发生日期" name="occurred_at" type="date" /><Field label="公开链接" name="public_url" type="url" /><SelectField label="保密级别" name="confidentiality_level" values={privacyOptions} defaultValue="private" /><div className="sm:col-span-2"><TextField label="成果描述" name="description_markdown" maxLength={12000} /></div><div className="sm:col-span-2"><TextField label="结果" name="result_markdown" maxLength={12000} /></div>
      </ExperienceFormDialog>}>
        <div className="divide-y divide-[var(--separator)]">{data.outputs.map(output => {
          const href = safeOutputHref(output.public_url);
          return <article key={output.id} className="min-w-0 py-5"><h3 className="break-words text-base font-semibold">{output.name}</h3><p className="my-3 text-sm leading-7 text-[var(--text-secondary)]">{careerLabel(output.output_type)} · {careerLabel(output.confidentiality_level)}{output.occurred_at ? ` · ${output.occurred_at}` : ""}</p><div className="space-y-4"><div><h4 className="mb-2 text-sm font-medium">成果描述</h4>{output.description_markdown ? <Reading body={output.description_markdown} /> : <p className="text-sm leading-7 text-[var(--text-secondary)]">尚未填写成果描述。</p>}</div><div><h4 className="mb-2 text-sm font-medium">结果</h4>{output.result_markdown ? <Reading body={output.result_markdown} /> : <p className="text-sm leading-7 text-[var(--text-secondary)]">尚未填写结果。</p>}</div></div>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="ui-link mt-3 inline-flex min-h-11 items-center text-sm">打开成果链接</a> : output.public_url ? <p className="mt-3 break-all text-sm leading-7 text-[var(--text-secondary)]">成果链接暂不可打开：{output.public_url}</p> : null}</article>;
        })}</div>
        {!data.outputs.length ? <Empty unavailable={unavailable}>还没有成果，可先记录一份具体产出。</Empty> : null}
      </Section>
      <Section id="expressions" title="表达" count={data.bullets.length} unavailable={unavailable} description="表达是求职版本，关联事实并人工核对后再批准。" action={<ExperienceFormDialog draft={{operation:"career.bullet",id:"new",parentId:e.id,href:`/career/experiences/${e.id}`,label:"经历未保存内容"}} operation="createBullet" title="创建表达" description="创建表达草稿，不改写事实。" submitLabel="创建表达草稿" successTargetId="expressions">
        <input type="hidden" name="experience_id" value={e.id} /><div className="sm:col-span-2"><TextField label="表达内容" name="content" maxLength={5000} /></div><SelectField label="职业方向" name="career_direction_id" values={[{ value: "", label: "通用" }, ...data.directions.map(direction => ({ value: direction.id, label: direction.name }))]} /><SelectField label="语言" name="language" values={[{ value: "zh-CN", label: "中文" }, { value: "en", label: "英文" }]} defaultValue="zh-CN" /><SelectField label="来源" name="source" values={careerOptions(["human", "ai_draft", "ai_edited"])} defaultValue="human" />
      </ExperienceFormDialog>}>
        <div className="divide-y divide-[var(--separator)]">{data.bullets.map(bullet => <article key={bullet.id} className="py-5"><p className="whitespace-pre-wrap break-words text-base leading-7 [overflow-wrap:anywhere]">{bullet.content}</p><p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{careerLabel(bullet.status)} · {careerLabel(bullet.source)} · {bullet.language === "zh-CN" ? "中文" : bullet.language === "en" ? "英文" : bullet.language}{bullet.career_direction_id ? ` · ${data.directions.find(direction => direction.id === bullet.career_direction_id)?.name || "原职业方向暂不可用"}` : " · 通用"}</p><details className="mt-3"><DisclosureSummary>关联事实与批准</DisclosureSummary><div className="mt-4 flex flex-wrap gap-3">{data.facts.length ? <ExperienceFormDialog draft={{operation:"career.bullet-fact",id:bullet.id,parentId:e.id,href:`/career/experiences/${e.id}`,label:"经历未保存内容"}} operation="linkFactToBullet" title="关联事实" description="选择能支持这条表达的真实事实。" submitLabel="关联事实"><input type="hidden" name="bullet_id" value={bullet.id} /><div className="sm:col-span-2"><SelectField label="支持这条表达的事实" name="fact_id" values={data.facts.map(fact => ({ value: fact.id, label: fact.content }))} /></div></ExperienceFormDialog> : <p className="text-sm leading-7 text-[var(--text-secondary)]">先添加事实，再建立关联。</p>}{bullet.status !== "approved" ? <ExperienceFormDialog operation="approveBullet" title="核对后批准" description="请先关联支持事实并核对表达。批准不会修改事实原文。" submitLabel="核对后批准"><input type="hidden" name="bullet_id" value={bullet.id} /><p className="whitespace-pre-wrap break-words text-base leading-7 sm:col-span-2">{bullet.content}</p></ExperienceFormDialog> : null}</div></details></article>)}</div>
        {!data.bullets.length ? <Empty unavailable={unavailable}>还没有表达，可以从已有事实整理一条求职表述。</Empty> : null}
      </Section>
      <Section id="evidence" title="证据" count={data.documents.length} unavailable={unavailable} description="保留支持这段经历的材料，沿用现有私有存储和访问权限。" action={<ExperienceFormDialog draft={{operation:"career.evidence",id:"new",parentId:e.id,href:`/career/experiences/${e.id}`,label:"经历未保存内容"}} operation="uploadEvidence" title="上传证明材料" description="支持PDF、PNG、JPEG、WEBP或DOCX，单个文件不超过20MB。" submitLabel="上传材料" successTargetId="evidence"><input type="hidden" name="experience_id" value={e.id} /><Field label="文件标题" name="title" /><SelectField label="文件类型" name="document_type" values={careerOptions(["certificate", "transcript", "internship_proof", "project_evidence", "screenshot", "report", "presentation", "resume_pdf", "other"])} defaultValue="project_evidence" /><SelectField label="保密级别" name="confidentiality_level" values={privacyOptions} defaultValue="private" /><label className="grid min-w-0 gap-2 text-sm sm:col-span-2">文件（≤20MB）<input name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" className="ui-field min-h-11 w-full min-w-0 rounded-[var(--radius-md)] p-3 text-base" /></label></ExperienceFormDialog>}>
        <ul className="divide-y divide-[var(--separator)]">{data.documents.map(document => <li key={document.id} className="py-5"><p className="break-words text-base leading-7 [overflow-wrap:anywhere]">{document.original_filename || document.title}</p>{document.original_filename && document.title && document.title !== document.original_filename ? <p className="mt-1 break-words text-sm leading-7">{document.title}</p> : null}<p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{careerLabel(document.document_type)} · {Math.ceil(document.file_size / 1024)} KB · {careerLabel(document.confidentiality_level)}</p></li>)}</ul>
        {!data.documents.length ? <Empty unavailable={unavailable}>还没有证明材料。</Empty> : null}
      </Section>
      <ExperienceTools experienceId={e.id} graph={graph} />
      <details className="border-t border-[var(--separator)] pt-5"><DisclosureSummary>历史与管理</DisclosureSummary><p className="my-4 text-sm leading-7 text-[var(--text-secondary)]">已读取关联 {data.links.length} 条；最近审计事件 {data.audit.length} 条（最多20条）；事实历史版本 {data.versions.length} 条。</p><ExperienceFormDialog operation="archiveExperience" title="归档经历" description="经历将从经历库隐藏。原有事实、成果、表达和已冻结的简历快照保留。" submitLabel="确认归档"><input type="hidden" name="experience_id" value={e.id} /><p className="break-words text-base leading-7 sm:col-span-2">{e.organization}{e.role ? ` · ${e.role}` : ""}</p></ExperienceFormDialog></details>
    </div>
  </>;
}
