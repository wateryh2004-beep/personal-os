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

      <div className="mb-8 flex justify-end">
        <details>
          <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-900">+ 新增证书</summary>
          <form action={createCertification} className="mt-4 grid gap-4 rounded-2xl bg-white/70 p-5 md:grid-cols-3">
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

      <div className="space-y-1">
        {certifications.map((item) => (
          <article key={item.id} className="rounded-lg px-2 py-4 hover:bg-white/70">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <h2 className="text-sm font-medium text-zinc-900">{item.name}</h2>
                <p className="mt-1 text-sm text-zinc-500">{item.issuer || item.notes_markdown || "—"}</p>
              </div>
              <div className="text-right text-xs text-zinc-400">
                <p>{statusLabel[item.status] ?? item.status}</p>
                {item.expiry_date ? <p className="mt-1">到期 {item.expiry_date}</p> : null}
              </div>
            </div>

            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-700">编辑</summary>
              <form action={updateCertification} className="mt-4 grid gap-4 rounded-2xl bg-white/70 p-5 md:grid-cols-3">
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
              <form action={archiveCertification} className="mt-3 px-1"><input type="hidden" name="certification_id" value={item.id} /><button className="text-xs text-zinc-400 hover:text-red-600">归档</button></form>
            </details>
          </article>
        ))}
        {!certifications.length ? <p className="py-6 text-sm text-zinc-400">还没有证书记录。</p> : null}
      </div>
    </>
  );
}
