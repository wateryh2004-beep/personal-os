import type { Tables } from "@/types/database";
import { instantToWallTime } from "@/features/calendar/timezone";
import { CareerTaskDialog } from "./experience-form-dialog";
import { Field, TextField, SelectField } from "./form-controls";
export function TargetForm({ target, timezone }: { target?: Tables<"interview_contexts">; timezone: string }) {
  return <CareerTaskDialog draft={{operation:target?"career.target-edit":"career.target-create",id:target?.id??"new",href:target?`/career/interview/targets/${target.id}`:"/career/interview/targets",label:"面试情境"}} operation={target ? "updateTargetContext" : "createTargetContext"} title={target ? "编辑面试情境" : "新建面试情境"} description={`这里保存题库与练习范围，不创建招聘机会或投递记录。时间按 ${timezone} 填写；关联真实招聘请从招聘机会页进入。`} submitLabel={target ? "保存情境" : "创建情境"} primary={!target} recoveryHref={target ? `/career/interview/targets/${target.id}` : "/career/interview/targets"}>
    {target ? <input type="hidden" name="context_id" value={target.id}/> : null}
    <input type="hidden" name="context_type" value={target?.context_type ?? "target"}/>
    <input type="hidden" name="career_direction_id" value={target?.career_direction_id ?? ""}/><input type="hidden" name="opportunity_id" value={target?.opportunity_id ?? ""}/><input type="hidden" name="application_id" value={target?.application_id ?? ""}/>
    <Field name="title" label="显示名称" required={Boolean(target)} maxLength={240} defaultValue={target?.title}/>
    <Field name="organization_snapshot" label="组织或公司" required={!target || target.context_type === "target"} maxLength={240} defaultValue={target?.organization_snapshot}/>
    <Field name="role_title_snapshot" label="训练主题／岗位参考名称" required={!target || target.context_type === "target"} maxLength={240} defaultValue={target?.role_title_snapshot}/>
    <SelectField name="default_language" label="准备语言" defaultValue={target?.default_language ?? "bilingual"} values={[{value:"zh",label:"中文"},{value:"en",label:"英文"},{value:"bilingual",label:"双语"}]}/>
    <SelectField name="priority" label="优先级" defaultValue={String(target?.priority ?? 4)} values={[1,2,3,4,5].map(value=>({value:String(value),label:`${value}${value===5 ? "（最高）" : value===1 ? "（最低）" : ""}`}))}/>
    <SelectField name="status" label="准备状态" defaultValue={target?.status ?? "active"} values={[{value:"active",label:"进行中"},{value:"paused",label:"已暂停"},{value:"closed",label:"已结束"}]}/>
    <input type="hidden" name="next_interview_at" value={target?.next_interview_at ?? ""}/>
    <Field name="interview_wall_time" label={`面试时间（${timezone}）`} type="datetime-local" defaultValue={target?.next_interview_at ? instantToWallTime(target.next_interview_at,timezone) : ""}/>
    <div className="sm:col-span-2"><TextField name="notes_markdown" label="准备说明与资料" maxLength={100000} defaultValue={target?.notes_markdown}/></div>
  </CareerTaskDialog>;
}
