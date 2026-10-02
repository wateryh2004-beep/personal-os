import { CareerForm } from "@/components/career/career-form";
import { submitCareerForm } from "@/features/career/form-actions";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { ResumeCard } from "@/components/career/resume-card";
import { Field, PrimaryButton, TextField } from "@/components/career/form-controls";

import { getResumeVersions } from "@/features/career/queries";

const selectClass =
  "h-9 w-full rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]";

export default async function ResumesPage() {
  const data = await getResumeVersions();
  const documentById = new Map(data.documents.map((document) => [document.id, document]));

  return (
    <>
      <PageHeader title="简历" description="管理不同岗位使用的简历版本，并保留每次投递实际使用的版本。" />
      <CareerNav current="/career/resumes" />

      {data.unavailable ? (
        <p className="mb-6 rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-[12px] leading-5 text-amber-800">
          简历版本数据库尚未完成升级。
        </p>
      ) : null}

      <details className="mb-8">
        <summary className="pressable inline-flex cursor-pointer list-none rounded-[8px] px-1.5 py-1 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">
          + 新建简历版本
        </summary>
        <CareerForm action={submitCareerForm.bind(null, "createResumeVersion")} resetOnSuccess className="mt-3.5 grid gap-3.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4.5 shadow-[var(--shadow-hairline)] md:grid-cols-3">
          <Field name="title" label="名称 *" required />
          <Field name="version_label" label="版本标签" />
          <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
            <span>目标方向</span>
            <select name="target_direction_id" className={selectClass}>
              <option value="">通用</option>
              {data.directions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <div className="md:col-span-3">
            <TextField name="content_markdown" label="固定内容（Markdown，可选）" />
          </div>
          <div className="md:col-span-3">
            <PrimaryButton>创建草稿</PrimaryButton>
          </div>
        </CareerForm>
      </details>

      <div className="space-y-7">
        {data.resumes.map((resume) => {
          const selected = new Set(data.links.filter((link) => link.resume_version_id === resume.id).map((link) => link.bullet_id));
          const usage = data.applications.filter((item) => item.resume_version_id === resume.id).length;
          return (
            <ResumeCard
              key={resume.id}
              resume={resume}
              directions={data.directions}
              documents={data.documents}
              linkedDocument={resume.document_id ? documentById.get(resume.document_id) : undefined}
              bullets={data.bullets}
              selectedBulletIds={selected}
              usage={usage}
            />
          );
        })}
      </div>

      {!data.resumes.length ? (
        <div className="py-16 text-center">
          <p className="text-[13.5px] font-medium text-[var(--text-primary)]">还没有简历版本</p>
          <p className="mt-1.5 text-[12px] text-[var(--text-secondary)]">创建草稿，选择已由你批准且有事实依据的表达。</p>
        </div>
      ) : null}
    </>
  );
}
