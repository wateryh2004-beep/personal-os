import { CareerForm } from "@/components/career/career-form";
import { submitCareerForm } from "@/features/career/form-actions";
import { CareerNav } from "@/components/career/career-nav";
import { Field, PrimaryButton, TextField } from "@/components/career/form-controls";
import { PageHeader } from "@/components/shared/page-header";

import { getCareerProfile } from "@/features/career/queries";
export default async function CareerProfilePage() { const p = await getCareerProfile(); return <><PageHeader title="职业档案" description="职业阶段与边界是对事实的解释，不取代事实本身。" /><CareerNav current="/career/profile" /><section aria-label="职业档案摘要" className="grid max-w-4xl gap-5 md:grid-cols-2">{[
  ["职业标题", p?.professional_headline], ["当前职业阶段", p?.current_stage],
  ["目标毕业日期", p?.target_graduation_date], ["目标招聘周期", p?.target_recruitment_cycle],
  ["职业摘要", p?.career_summary], ["工作地点", p?.preferred_locations?.join(" · ")],
  ["工作偏好", p?.preferred_work_types?.join(" · ")], ["风险偏好", p?.risk_preferences],
  ["约束", p?.constraints_markdown], ["长期目标", p?.goals_markdown],
].map(([label, value]) => <div key={label}><h2 className="text-xs text-[var(--text-tertiary)]">{label}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{value || "尚未记录"}</p></div>)}</section><details className="mt-8 border-t border-[var(--separator)] pt-3"><summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-[var(--text-secondary)]">更正资料</summary><CareerForm action={submitCareerForm.bind(null, "saveCareerProfile")} className="grid max-w-4xl gap-x-5 gap-y-4.5 md:grid-cols-2"><Field label="职业标题" name="professional_headline" defaultValue={p?.professional_headline} placeholder="例如：研究生 · 产品与数据探索" /><Field label="当前职业阶段" name="current_stage" defaultValue={p?.current_stage} /><Field label="目标毕业日期" name="target_graduation_date" type="date" defaultValue={p?.target_graduation_date} /><Field label="目标招聘周期" name="target_recruitment_cycle" defaultValue={p?.target_recruitment_cycle} /><TextField label="职业摘要" name="career_summary" defaultValue={p?.career_summary} /><TextField label="工作地点（每行一个）" name="preferred_locations" defaultValue={p?.preferred_locations?.join("\n")} /><TextField label="工作偏好（每行一个）" name="preferred_work_types" defaultValue={p?.preferred_work_types?.join("\n")} /><TextField label="风险偏好" name="risk_preferences" defaultValue={p?.risk_preferences} /><TextField label="约束（Markdown）" name="constraints_markdown" defaultValue={p?.constraints_markdown} /><TextField label="长期目标（Markdown）" name="goals_markdown" defaultValue={p?.goals_markdown} /><div className="md:col-span-2"><PrimaryButton>保存职业档案</PrimaryButton></div></CareerForm></details></>; }
