import { CareerForm } from "@/components/career/career-form";
import { submitCareerForm } from "@/features/career/form-actions";
import { CareerNav } from "@/components/career/career-nav";
import { Field, PrimaryButton, SelectField, TextField } from "@/components/career/form-controls";
import { PageHeader } from "@/components/shared/page-header";

import { getSkills } from "@/features/career/queries";

const categories = [
  { value: "technical", label: "技术" },
  { value: "analytical", label: "分析" },
  { value: "business", label: "商业" },
  { value: "communication", label: "沟通" },
  { value: "language", label: "语言" },
  { value: "domain", label: "领域" },
  { value: "tool", label: "工具" },
  { value: "other", label: "其他" },
] as const;

const proficiencies = [
  { value: "learning", label: "学习中" },
  { value: "basic", label: "基础" },
  { value: "working", label: "可工作使用" },
  { value: "proficient", label: "熟练" },
  { value: "advanced", label: "高级" },
] as const;

const categoryLabel = Object.fromEntries(categories.map((item) => [item.value, item.label]));
const proficiencyLabel = Object.fromEntries(proficiencies.map((item) => [item.value, item.label]));

export default async function SkillsPage() {
  const skills = await getSkills();

  return (
    <>
      <PageHeader title="技能" description="只记录真正需要建设、并且能被经历证明的能力。" />
      <CareerNav current="/career/skills" />

      <div className="mb-7 flex justify-end">
        <details>
          <summary className="pressable cursor-pointer list-none rounded-[8px] px-1.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">+ 新增能力</summary>
          <CareerForm action={submitCareerForm.bind(null, "createSkill")} resetOnSuccess className="mt-3.5 grid gap-3.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4.5 shadow-[var(--shadow-hairline)] md:grid-cols-3">
            <Field label="能力名称" name="name" required />
            <SelectField label="类别" name="category" values={categories} defaultValue="other" />
            <SelectField label="熟练度" name="proficiency" values={proficiencies} defaultValue="learning" />
            <Field label="最近使用" name="last_used_at" type="date" />
            <TextField label="证据说明" name="evidence_markdown" />
            <div><PrimaryButton>创建</PrimaryButton></div>
          </CareerForm>
        </details>
      </div>

      <div className="space-y-px">
        {skills.map((skill) => (
          <article key={skill.id} className="rounded-[10px] px-2.5 py-3.5 transition-colors ui-transition hover:bg-[var(--surface-hover)]">
            <div className="grid gap-1.5 sm:grid-cols-[1fr_auto] sm:items-start">
              <div>
                <p className="text-[13.5px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">{skill.name}</p>
                {skill.evidence_markdown ? <p className="mt-1 line-clamp-2 text-[12.5px] leading-5.5 text-[var(--text-secondary)]">{skill.evidence_markdown}</p> : null}
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)]">{categoryLabel[skill.category] ?? skill.category} · {proficiencyLabel[skill.proficiency] ?? skill.proficiency}</p>
            </div>

            <details className="mt-1.5">
              <summary className="pressable inline-flex cursor-pointer list-none rounded-[7px] px-1 py-0.5 text-[11px] text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">编辑</summary>
              <CareerForm action={submitCareerForm.bind(null, "updateSkill")} className="mt-3.5 grid gap-3.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4.5 shadow-[var(--shadow-hairline)] md:grid-cols-3">
                <input type="hidden" name="skill_id" value={skill.id} />
                <Field label="能力名称" name="name" defaultValue={skill.name} required />
                <SelectField label="类别" name="category" values={categories} defaultValue={skill.category} />
                <SelectField label="熟练度" name="proficiency" values={proficiencies} defaultValue={skill.proficiency} />
                <Field label="最近使用" name="last_used_at" type="date" defaultValue={skill.last_used_at} />
                <TextField label="证据说明" name="evidence_markdown" defaultValue={skill.evidence_markdown} />
                <div><PrimaryButton>保存</PrimaryButton></div>
              </CareerForm>
              <CareerForm action={submitCareerForm.bind(null, "archiveSkill")} successMessage="已归档。" className="mt-2.5 px-1"><input type="hidden" name="skill_id" value={skill.id} /><button className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--danger)]">归档</button></CareerForm>
            </details>
          </article>
        ))}
        {!skills.length ? <p className="py-8 text-[13px] text-[var(--text-tertiary)]">还没有能力记录。</p> : null}
      </div>
    </>
  );
}
