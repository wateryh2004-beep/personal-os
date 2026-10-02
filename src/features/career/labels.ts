export const careerLabels: Record<string, string> = {
  education: "教育", internship: "实习", employment: "工作", project: "项目", campus: "校园", research: "研究", volunteer: "志愿", other: "其他",
  responsibility: "职责", action: "行动", tool: "工具", scale: "规模", metric: "量化指标", collaboration: "协作", process: "流程", result: "结果", context: "背景",
  unverified: "待核实", self_confirmed: "本人确认", document_verified: "材料验证", externally_verified: "外部验证",
  report: "报告", presentation: "演示文稿", product: "产品", code: "代码", analysis: "分析", document: "文档", event: "活动", publication: "发表成果", dataset: "数据集",
  private: "仅自己可见", sensitive: "敏感资料", public_safe: "可公开使用", draft: "草稿", confirmed: "已确认", approved: "已批准", rejected: "未采用", archived: "已归档",
  human: "人工编写", ai_draft: "AI 草稿", ai_edited: "AI 草稿经编辑",
  certificate: "证书", transcript: "成绩单", internship_proof: "实习证明", project_evidence: "项目证明", screenshot: "截图", resume_pdf: "简历 PDF",
};
export function careerLabel(value: string) { return careerLabels[value] ?? value; }
export function careerOptions(values: readonly string[]) { return values.map((value) => ({ value, label: careerLabel(value) })); }
