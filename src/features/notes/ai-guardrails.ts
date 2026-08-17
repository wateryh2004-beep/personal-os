/**
 * Notes AI 改写护栏：改写/润色类操作应当保留原文事实与大致篇幅。当输出远短于
 * 原文时，大概率是模型把"润色"做成了"删减/摘要"，丢掉了内容。这里只做软提醒
 * （warning），不阻断用户确认。
 */
export const REWRITE_SHRINK_RATIO = 0.35;

export function evaluateRewriteGuardrail(
  inputLength: number,
  outputLength: number,
): string | null {
  const ratio = outputLength / Math.max(1, inputLength);
  if (ratio >= REWRITE_SHRINK_RATIO) return null;
  return `结果明显短于原文（原文 ${inputLength} 字 → 结果 ${outputLength} 字），可能丢失了内容。建议核对后再写入。`;
}
