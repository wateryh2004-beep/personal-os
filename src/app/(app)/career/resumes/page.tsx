import { CareerForm } from "@/components/career/career-form";
import { submitCareerForm } from "@/features/career/form-actions";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { Suspense } from "react";
import { ResumeWorkspace } from "@/components/career/resume-workspace";
import { Field, PrimaryButton, TextField } from "@/components/career/form-controls";

import { getResumeVersions } from "@/features/career/queries";

const selectClass =
  "min-h-11 w-full rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-base text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]";

export default async function ResumesPage() {
  const data = await getResumeVersions();

  return (
    <>
      <PageHeader title="简历版本" description="管理不同岗位使用的简历版本，并保留每次投递实际使用的版本。" />
      <CareerNav current="/career/resumes" />

      <Suspense fallback={<p role="status">正在打开版本列表…</p>}><ResumeWorkspace data={data} createForm={
        <CareerForm action={submitCareerForm.bind(null, "createResumeVersion")} resetOnSuccess successMessage="简历草稿已创建，可从版本列表打开。" className="mt-3.5 grid gap-3.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4.5 shadow-[var(--shadow-hairline)] md:grid-cols-3">
          <Field name="title" label="名称 *" required />
          <Field name="version_label" label="版本标签" />
          <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
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
      } /></Suspense>
    </>
  );
}
