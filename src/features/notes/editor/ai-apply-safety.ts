/** Pure client preflight; saved revisions are still enforced by server CAS. */
export type AiApplicationInput = {
  expectedRevision: number;
  expectedTitle: string;
  expectedBody: string;
  operation: string;
  mode: "replace" | "insert";
  scope: "note" | "selection";
  runId?: string | null;
};

export type AiApplyCurrent = {
  currentRevision: number;
  knownRemoteRevision: number;
  currentTitle: string;
  currentBody: string;
  isDirty: boolean;
  isSaving: boolean;
  saveState: "已保存" | "有未保存修改" | "正在保存" | "保存失败" | "版本冲突";
};

export function noteAiApplyBlocker(input: AiApplicationInput & AiApplyCurrent): string | null {
  if (input.isDirty || input.isSaving || input.saveState !== "已保存")
    return "当前笔记还有未保存修改或保存异常。请先完成保存，再重新生成 AI 建议。";
  if (input.currentRevision !== input.expectedRevision ||
      input.knownRemoteRevision !== input.expectedRevision ||
      input.currentTitle !== input.expectedTitle ||
      input.currentBody !== input.expectedBody)
    return "AI 生成期间笔记已经变化。为了保护新内容，已阻止应用旧结果，请重新生成。";
  return null;
}
