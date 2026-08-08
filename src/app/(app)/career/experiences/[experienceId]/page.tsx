import { notFound } from "next/navigation";
import {
  archiveExperience,
  approveBullet,
  createBullet,
  createFact,
  createOutput,
  linkFactToBullet,
  uploadEvidence,
} from "@/features/career/actions";
import { getExperience } from "@/features/career/queries";
import {
  Field,
  PrimaryButton,
  SelectField,
  TextField,
} from "@/components/career/form-controls";
import { CareerNav } from "@/components/career/career-nav";
import { RelatedPanel } from "@/components/career/related-panel";
import { CareerAssistant } from "@/components/career/career-assistant";
import { getExperienceGraph } from "@/features/graph/queries";
export default async function ExperiencePage({
  params,
}: {
  params: Promise<{ experienceId: string }>;
}) {
  const { experienceId } = await params;
  const data = await getExperience(experienceId);
  if (!data) notFound();
  const e = data.experience;
  const graph = await getExperienceGraph(
    e.id,
    [e.organization, e.role].filter(Boolean).join(" "),
  );
  return (
    <>
      <CareerNav current="/career/experiences" />
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <p className="text-sm text-zinc-500">
            {e.experience_type} · {e.status} · {e.confidentiality_level}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {e.organization}
            {e.role ? ` · ${e.role}` : ""}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {e.start_date || "未填写"} —{" "}
            {e.end_date || (e.is_current ? "至今" : "未填写")}{" "}
            {e.location ? `· ${e.location}` : ""}
          </p>
        </div>
        <form action={archiveExperience}>
          <input type="hidden" name="experience_id" value={e.id} />
          <button className="border px-3 py-2 text-sm">归档经历</button>
        </form>
      </header>
      <div className="space-y-10">
        <section>
          <h2 className="font-medium">Overview</h2>
          <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <p className="text-zinc-500">背景</p>
              <p className="mt-1 whitespace-pre-wrap">
                {e.background_markdown || "—"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">原始描述</p>
              <p className="mt-1 whitespace-pre-wrap">
                {e.raw_description_markdown || "—"}
              </p>
            </div>
          </div>
        </section>
        <RelatedPanel
          experienceId={e.id}
          related={graph.related}
          suggestions={graph.suggestions}
        />
        <CareerAssistant experienceId={e.id} />
        <section className="border-t pt-8">
          <h2 className="font-medium">Facts</h2>
          <p className="mt-1 text-sm text-zinc-500">
            这是事实底稿。修改会保留历史版本。
          </p>
          <form action={createFact} className="mt-4 grid gap-3 md:grid-cols-3">
            <input type="hidden" name="experience_id" value={e.id} />
            <TextField label="事实" name="content" />
            <SelectField
              label="类型"
              name="fact_type"
              values={[
                "responsibility",
                "action",
                "tool",
                "scale",
                "metric",
                "collaboration",
                "process",
                "result",
                "context",
                "other",
              ]}
              defaultValue="responsibility"
            />
            <SelectField
              label="验证"
              name="verification_status"
              values={[
                "unverified",
                "self_confirmed",
                "document_verified",
                "externally_verified",
              ]}
              defaultValue="unverified"
            />
            <Field label="量化数值" name="metric_value" type="number" />
            <Field label="单位" name="metric_unit" />
            <Field label="发生日期" name="occurred_at" type="date" />
            <TextField label="补充说明（Markdown）" name="notes_markdown" />
            <input type="hidden" name="source_document_id" value="" />
            <div>
              <PrimaryButton>添加事实</PrimaryButton>
            </div>
          </form>
          <div className="mt-5 divide-y border-y">
            {data.facts.map((fact) => (
              <article className="py-3" key={fact.id}>
                <p>{fact.content}</p>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  {fact.fact_type}
                  {fact.metric_value !== null
                    ? ` · ${fact.metric_value} ${fact.metric_unit || ""}`
                    : ""}{" "}
                  · {fact.verification_status}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="border-t pt-8">
          <h2 className="font-medium">Outputs</h2>
          <form
            action={createOutput}
            className="mt-4 grid gap-3 md:grid-cols-3"
          >
            <input type="hidden" name="experience_id" value={e.id} />
            <Field label="成果名称" name="name" required />
            <SelectField
              label="类型"
              name="output_type"
              values={[
                "report",
                "presentation",
                "product",
                "code",
                "analysis",
                "document",
                "event",
                "process",
                "publication",
                "dataset",
                "other",
              ]}
              defaultValue="other"
            />
            <Field label="发生日期" name="occurred_at" type="date" />
            <Field label="公开链接" name="public_url" type="url" />
            <SelectField
              label="保密级别"
              name="confidentiality_level"
              values={["private", "sensitive", "public_safe"]}
              defaultValue="private"
            />
            <TextField label="成果描述" name="description_markdown" />
            <TextField label="结果" name="result_markdown" />
            <div>
              <PrimaryButton>添加成果</PrimaryButton>
            </div>
          </form>
          <div className="mt-5 divide-y border-y">
            {data.outputs.map((output) => (
              <article className="py-3" key={output.id}>
                <p>{output.name}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {output.output_type} ·{" "}
                  {output.result_markdown || "尚未填写结果"}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="border-t pt-8">
          <h2 className="font-medium">Expressions</h2>
          <p className="mt-1 text-sm text-zinc-500">
            面向方向的表达版本；不会反向覆盖 Facts。
          </p>
          <form
            action={createBullet}
            className="mt-4 grid gap-3 md:grid-cols-3"
          >
            <input type="hidden" name="experience_id" value={e.id} />
            <TextField label="表达内容" name="content" />
            <SelectField
              label="职业方向"
              name="career_direction_id"
              values={["", ...data.directions.map((d) => d.id)]}
            />
            <Field label="语言" name="language" defaultValue="zh-CN" />
            <SelectField
              label="来源"
              name="source"
              values={["human", "ai_draft", "ai_edited"]}
              defaultValue="human"
            />
            <div>
              <PrimaryButton>创建表达</PrimaryButton>
            </div>
          </form>
          <div className="mt-5 divide-y border-y">
            {data.bullets.map((bullet) => (
              <article className="py-3" key={bullet.id}>
                <p>{bullet.content}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="font-mono text-zinc-500">
                    {bullet.status} · {bullet.source}
                  </span>
                  {data.facts.length ? (
                    <form action={linkFactToBullet}>
                      <input type="hidden" name="bullet_id" value={bullet.id} />
                      <select name="fact_id" className="border p-1">
                        {data.facts.map((fact) => (
                          <option key={fact.id} value={fact.id}>
                            {fact.content.slice(0, 24)}
                          </option>
                        ))}
                      </select>
                      <button className="ml-1 border px-2 py-1">
                        关联事实
                      </button>
                    </form>
                  ) : null}
                  {bullet.status !== "approved" ? (
                    <form action={approveBullet}>
                      <input type="hidden" name="bullet_id" value={bullet.id} />
                      <button className="border px-2 py-1">批准</button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="border-t pt-8">
          <h2 className="font-medium">Evidence</h2>
          <form
            action={uploadEvidence}
            className="mt-4 grid gap-3 md:grid-cols-3"
          >
            <input type="hidden" name="experience_id" value={e.id} />
            <Field label="文件标题" name="title" />
            <SelectField
              label="文件类型"
              name="document_type"
              values={[
                "certificate",
                "transcript",
                "internship_proof",
                "project_evidence",
                "screenshot",
                "report",
                "presentation",
                "resume_pdf",
                "other",
              ]}
              defaultValue="project_evidence"
            />
            <SelectField
              label="保密级别"
              name="confidentiality_level"
              values={["private", "sensitive", "public_safe"]}
              defaultValue="private"
            />
            <label className="grid gap-1 text-sm">
              <span>文件（≤20MB）</span>
              <input
                name="file"
                type="file"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
              />
            </label>
            <div>
              <PrimaryButton>上传私有证明材料</PrimaryButton>
            </div>
          </form>
          <div className="mt-5 divide-y border-y">
            {data.documents.map((document) => (
              <p key={document.id} className="py-3 text-sm">
                {document.original_filename} · {document.document_type} ·{" "}
                {document.file_size} bytes · {document.confidentiality_level}
              </p>
            ))}
          </div>
        </section>
        <section className="border-t pt-8">
          <h2 className="font-medium">Links & History</h2>
          <p className="mt-2 text-sm text-zinc-500">
            关联记录 {data.links.length} 条；此经历的审计事件{" "}
            {data.audit.length} 条。Fact 历史由不可变版本表保留（共{" "}
            {data.versions.length} 条）。
          </p>
        </section>
      </div>
    </>
  );
}
