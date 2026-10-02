export type CareerFormResult = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
};

export const initialCareerFormResult: CareerFormResult = { status: "idle", message: "" };

export class CareerInputError extends Error {
  constructor(public fieldErrors: Record<string, string>, message = "请检查标记的字段，输入已保留。") {
    super(message);
    this.name = "CareerInputError";
  }
}

export const careerFieldLabels: Record<string, string> = {
  professional_headline: "职业标题", current_stage: "当前阶段", target_graduation_date: "目标毕业日期", target_recruitment_cycle: "目标招聘周期",
  career_summary: "职业摘要", preferred_locations: "工作地点", preferred_work_types: "工作偏好", risk_preferences: "风险偏好", constraints_markdown: "约束", goals_markdown: "长期目标",
  start_date: "开始日期", end_date: "结束日期", category: "类别", proficiency: "熟练度", last_used_at: "最近使用日期", priority: "优先级", review_date: "回顾日期",
  exam_date: "考试日期", issue_date: "发证日期", expiry_date: "到期日期", issuer: "发证机构", score: "成绩", credential_number: "证书编号",
  organization: "组织", role_title: "岗位", title: "名称", name: "名称", content: "内容",
  experience_id: "经历", opportunity_id: "机会", resume_version_id: "简历版本", career_direction_id: "职业方向",
  target_direction_id: "目标方向", fact_type: "事实类型", verification_status: "验证状态", metric_value: "量化数值",
  metric_unit: "单位", occurred_at: "发生日期", source_document_id: "来源文件", public_url: "公开链接",
  source_url: "来源链接", deadline_at: "截止时间", applied_at: "投递时间", language: "语言", source: "来源",
  requirement_text: "岗位要求", requirement_type: "要求类型", status: "状态", notes_markdown: "备注",
  content_markdown: "正文", document_id: "关联文件", file: "文件", description_markdown: "描述",
  result_markdown: "结果", output_type: "成果类型", confidentiality_level: "保密级别", version_label: "版本标签",
};

type ValidationIssue = { path: PropertyKey[]; code: string; message: string; minimum?: number | bigint; maximum?: number | bigint };

export function careerValidationErrors(issues: readonly ValidationIssue[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const name = String(issue.path[0] ?? "");
    if (errors[name]) continue;
    errors[name] = issue.code === "custom" ? issue.message
      : issue.code === "too_small" ? "请填写完整内容。"
      : issue.code === "too_big" ? `内容超出允许长度${issue.maximum ? `（最多 ${issue.maximum}）` : ""}。`
      : "请检查格式或重新选择。";
  }
  return errors;
}
