import { CareerNav } from "@/components/career/career-nav";
import { Field, PrimaryButton, SelectField, TextField } from "@/components/career/form-controls";
import { PageHeader } from "@/components/shared/page-header";
import { archiveDirection, createDirection, updateDirection } from "@/features/career/actions";
import { getDirections } from "@/features/career/queries";

const statuses = [
  { value: "exploring", label: "探索中" },
  { value: "active", label: "主攻" },
  { value: "paused", label: "暂停" },
  { value: "deprioritized", label: "降级" },
  { value: "rejected", label: "放弃" },
  { value: "archived", label: "已归档" },
] as const;

const statusLabel = Object.fromEntries(statuses.map((item) => [item.value, item.label]));

export default async function DirectionsPage() {
  const directions = await getDirections();

  return (
    <>
      <PageHeader title="职业方向" description="保留你正在验证的方向和当前判断。" />
      <CareerNav current="/career/directions" />

      <div className="mb-7 flex justify-end">
        <details>
          <summary className="pressable cursor-pointer list-none rounded-[8px] px-1.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">+ 新增方向</summary>
          <form action={createDirection} className="mt-3.5 grid gap-3.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4.5 shadow-[var(--shadow-hairline)] backdrop-blur-xl md:grid-cols-3">
            <Field label="方向名称" name="name" required />
            <SelectField label="状态" name="status" values={statuses} defaultValue="exploring" />
            <Field label="优先级" name="priority" type="number" defaultValue="0" />
            <Field label="下次复核" name="review_date" type="date" />
            <TextField label="方向假设" name="hypothesis_markdown" />
            <TextField label="当前结论" name="current_decision" />
            <TextField label="支持证据" name="supporting_evidence_markdown" />
            <TextField label="反对证据" name="opposing_evidence_markdown" />
            <input type="hidden" name="description" value="" />
            <div><PrimaryButton>创建</PrimaryButton></div>
          </form>
        </details>
      </div>

      <div className="space-y-px">
        {directions.map((item) => (
          <article key={item.id} className="rounded-[10px] px-2.5 py-3.5 transition-colors ui-transition hover:bg-[var(--surface-hover)]">
            <div className="grid gap-1.5 sm:grid-cols-[1fr_auto]">
              <div>
                <h2 className="text-[13.5px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">{item.name}</h2>
                <p className="mt-1 line-clamp-2 text-[12.5px] leading-5.5 text-[var(--text-secondary)]">{item.current_decision || item.hypothesis_markdown || "还没有形成判断。"}</p>
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)]">{statusLabel[item.status] ?? item.status}{item.review_date ? " · " + item.review_date : ""}</p>
            </div>

            <details className="mt-1.5">
              <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[11px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">展开与编辑</summary>
              <div className="mt-3.5 grid gap-4.5 sm:grid-cols-2">
                <Read label="方向假设" value={item.hypothesis_markdown} />
                <Read label="当前结论" value={item.current_decision} />
                <Read label="支持证据" value={item.supporting_evidence_markdown} />
                <Read label="反对证据" value={item.opposing_evidence_markdown} />
              </div>
              <form action={updateDirection} className="mt-6 grid gap-4 rounded-2xl bg-white/70 p-5 md:grid-cols-3">
                <input type="hidden" name="direction_id" value={item.id} />
                <Field label="方向名称" name="name" defaultValue={item.name} required />
                <SelectField label="状态" name="status" values={statuses} defaultValue={item.status} />
                <Field label="优先级" name="priority" type="number" defaultValue={String(item.priority)} />
                <Field label="下次复核" name="review_date" type="date" defaultValue={item.review_date} />
                <TextField label="方向假设" name="hypothesis_markdown" defaultValue={item.hypothesis_markdown} />
                <TextField label="当前结论" name="current_decision" defaultValue={item.current_decision} />
                <TextField label="支持证据" name="supporting_evidence_markdown" defaultValue={item.supporting_evidence_markdown} />
                <TextField label="反对证据" name="opposing_evidence_markdown" defaultValue={item.opposing_evidence_markdown} />
                <input type="hidden" name="description" value={item.description ?? ""} />
                <div><PrimaryButton>保存</PrimaryButton></div>
              </form>
              <form action={archiveDirection} className="mt-2.5 px-1"><input type="hidden" name="direction_id" value={item.id} /><button className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--danger)]">归档</button></form>
            </details>
          </article>
        ))}
        {!directions.length ? <p className="py-8 text-[13px] text-[var(--text-tertiary)]">还没有职业方向。</p> : null}
      </div>
    </>
  );
}

function Read({ label, value }: { label: string; value?: string | null }) {
  return <div><p className="text-xs text-zinc-400">{label}</p><p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5.5 text-[var(--text-secondary)]">{value || "—"}</p></div>;
}
