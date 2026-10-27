"use client";
import { ExperienceFormDialog } from "@/components/career/experience-form-dialog";
import { CareerForm } from "@/components/career/career-form";
import { Field, SelectField, TextField } from "@/components/career/form-controls";
import { careerOptions } from "@/features/career/labels";
import { experienceTypes } from "@/features/career/schemas";
import { fixtureCareerAction } from "@/features/testing/continuous-domain-transports";
/** Real common form and real dismiss-safe dialog, with only the external action replaced. */
export function ContinuousCareerWorkspace({ path }: { path: string }) {
  if (path === "/career/skills") return <section className="p-5"><h1>技能</h1><CareerForm action={form => fixtureCareerAction("createSkill", form)} draft={{ operation: "career.skill-create", id: "new", href: "/career/skills", label: "新增技能" }}><Field label="技能名称" name="name" required maxLength={120} /><input type="hidden" name="category" value="technical" /><input type="hidden" name="proficiency" value="working" /><TextField label="证据" name="evidence_markdown" maxLength={12000} /><input type="hidden" name="last_used_at" value="" /><button type="submit" className="min-h-11 px-4">保存技能</button></CareerForm></section>;
  return <section className="p-5"><h1>经历素材</h1><ExperienceFormDialog actionTransport={fixtureCareerAction} draft={{ operation: "career.experience-create", id: "new", href: "/career/experiences", label: "新增经历" }} operation="createExperience" title="新增经历" description="先记录真实发生的经历，再补充事实、成果与表达。进行中的经历请留空结束日期。" submitLabel="创建并继续补充" primary>
    <Field label="组织、学校或项目" name="organization" required maxLength={200} /><Field label="角色" name="role" maxLength={200} /><SelectField label="类别" name="experience_type" values={careerOptions(experienceTypes)} defaultValue="internship" /><Field label="地点" name="location" maxLength={200} /><Field label="开始日期" name="start_date" type="date" /><Field label="结束日期" name="end_date" type="date" /><label className="flex min-h-11 items-center gap-3"><input name="is_current" type="checkbox" />当前仍在进行</label><TextField label="背景（可选）" name="background_markdown" maxLength={12000} /><input type="hidden" name="department" value="" /><input type="hidden" name="raw_description_markdown" value="" /><input type="hidden" name="confidentiality_level" value="private" /><input type="hidden" name="status" value="draft" />
  </ExperienceFormDialog></section>;
}
