import { CareerNav } from "@/components/career/career-nav";
import { Field, PrimaryButton, SelectField, TextField } from "@/components/career/form-controls";
import { PageHeader } from "@/components/shared/page-header";
import { archiveCertification, createCertification, updateCertification } from "@/features/career/actions";
import { getCertifications } from "@/features/career/queries";

const statuses = [
  { value: "planned", label: "计划中" },
  { value: "registered", label: "已报名" },
  { value: "preparing", label: "备考中" },
  { value: "passed", label: "已通过" },
  { value: "failed", label: "未通过" },
  { value: "issued", label: "已获得" },
  { value: "expired", label: "已过期" },
  { value: "abandoned", label: "已放弃" },
] as const;

const statusLabel = Object.fromEntries(statuses.map((item) => [item.value, item.label]));

export default async function CertificationsPage() {
  const { certifications, documents } = await getCertifications();
  const documentOptions = [{ value: "", label: "不关联" }, ...documents.map((item) => ({ value: item.id, label: item.original_filename || item.title }))];

  return (
    <>
      <PageHeader title="证书" description="记录真正有求职价值的考试与证书。" />
      <CareerNav current="/career/certifications" />

      <div className="mb-7 flex justify-end">
        <details>
          <summary className="pressable cursor-pointer list-none rounded-[8px] px-1.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">+ 新增证书</summary>
          <form action={createCertification} className="mt-3.5 grid gap-3.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4.5 shadow-[var(--shadow-hairline)] md:grid-cols-3">
            <Field label="名称" name="name" required />
            <Field label="发证机构" name="issuer" />
            <SelectField label="状态" name="status" values={statuses} defaultValue="planned" />
            <Field label="考试日期" name="exam_date" type="date" />
            <Field label="发证日期" name="issue_date" type="date" />
            <Field label="到期日期" name="expiry_date" type="date" />
            <Field label="分数" name="score" />
            <Field label="证书编号" name="credential_number" />
            <SelectField label="证明材料" name="document_id" values={documentOptions} defaultValue="" />
            <TextField label="说明" name="notes_markdown" />
            <div><PrimaryButton>创建</PrimaryButton></div>
          </form>
        </details>
      </div>

      <div className="space-y-px">
        {certifications.map((item) => (
          <article key={item.id} className="rounded-[10px] px-2.5 py-3.5 transition-colors ui-transition hover:bg-[var(--surface-hover)]">
            <div className="grid gap-1.5 sm:grid-cols-[1fr_auto]">
              <div>
                <h2 className="text-[13.5px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">{item.name}</h2>
                <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{item.issuer || item.notes_markdown || "—"}</p>
              </div>
              <div className="text-right text-[11px] leading-5 text-[var(--text-tertiary)]">
                <p>{statusLabel[item.status] ?? item.status}</p>
                {item.expiry_date ? <p className="mt-1">到期 {item.expiry_date}</p> : null}
              </div>
            </div>

            <details className="mt-1.5">
              <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[11px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">编辑</summary>
              <form action={updateCertification} className="mt-3.5 grid gap-3.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4.5 shadow-[var(--shadow-hairline)] md:grid-cols-3">
                <input type="hidden" name="certification_id" value={item.id} />
                <Field label="名称" name="name" defaultValue={item.name} required />
                <Field label="发证机构" name="issuer" defaultValue={item.issuer} />
                <SelectField label="状态" name="status" values={statuses} defaultValue={item.status} />
                <Field label="考试日期" name="exam_date" type="date" defaultValue={item.exam_date} />
                <Field label="发证日期" name="issue_date" type="date" defaultValue={item.issue_date} />
                <Field label="到期日期" name="expiry_date" type="date" defaultValue={item.expiry_date} />
                <Field label="分数" name="score" defaultValue={item.score} />
                <Field label="证书编号" name="credential_number" defaultValue={item.credential_number} />
                <SelectField label="证明材料" name="document_id" values={documentOptions} defaultValue={item.document_id ?? ""} />
                <TextField label="说明" name="notes_markdown" defaultValue={item.notes_markdown} />
                <div><PrimaryButton>保存</PrimaryButton></div>
              </form>
              <form action={archiveCertification} className="mt-2.5 px-1"><input type="hidden" name="certification_id" value={item.id} /><button className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--danger)]">归档</button></form>
            </details>
          </article>
        ))}
        {!certifications.length ? <p className="py-8 text-[13px] text-[var(--text-tertiary)]">还没有证书记录。</p> : null}
      </div>
    </>
  );
}
