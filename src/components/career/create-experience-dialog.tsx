import { ExperienceFormDialog } from "./experience-form-dialog";
import { Field, SelectField, TextField } from "./form-controls";
import { careerOptions } from "@/features/career/labels";
import { experienceTypes } from "@/features/career/schemas";

export function CreateExperienceDialog({ initialOpen = false }: { initialOpen?: boolean }) {
  return <ExperienceFormDialog draft={{operation:"career.experience-create",id:"new",href:"/career/experiences",label:"新增经历"}} operation="createExperience" title="新增经历" description="先记录真实发生的经历，再补充事实、成果与表达。进行中的经历请留空结束日期。" submitLabel="创建并继续补充" initialOpen={initialOpen} primary>
    <Field label="组织、学校或项目" name="organization" required maxLength={200} />
    <Field label="角色" name="role" maxLength={200} />
    <SelectField label="类别" name="experience_type" values={careerOptions(experienceTypes)} defaultValue="internship" />
    <Field label="地点" name="location" maxLength={200} />
    <Field label="开始日期" name="start_date" type="date" /><Field label="结束日期" name="end_date" type="date" />
    <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2"><input name="is_current" type="checkbox" className="size-5" />当前仍在进行</label>
    <div className="sm:col-span-2"><TextField label="背景（可选）" name="background_markdown" maxLength={12000} /></div>
    <input type="hidden" name="department" value="" /><input type="hidden" name="raw_description_markdown" value="" /><input type="hidden" name="confidentiality_level" value="private" /><input type="hidden" name="status" value="draft" />
  </ExperienceFormDialog>;
}
