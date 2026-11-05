import { parseMarkdownTables } from "./markdown-table";

export type MarkdownCompatibilityNotice = { id: string; level: "info" | "attention"; text: string };

/** Informational only: never rewrite source while analyzing. */
export function analyzeMarkdownCompatibility(source: string): MarkdownCompatibilityNotice[] {
  if (!source.trim()) return [];
  const warnings: MarkdownCompatibilityNotice[] = [];
  const lines = source.split("\n");
  if (lines.length > 1500 || source.length > 80_000) warnings.push({
    id: "large", level: "info", text: "长文档可切换至源码模式；复杂表格保持原文，不强制重排。",
  });
  if (/(?:^|\n) {0,3}\\x60{3,}(?:mermaid|plantuml|graphviz)\\b/i.test(source)) warnings.push({
    id: "diagram", level: "info", text: "图表代码块会保留 Markdown 源码；阅读模式目前不生成交互图形。",
  });
  if (/(?:^|\n)\s*\$\$[\s\S]*?\$\$/m.test(source)) warnings.push({
    id: "math", level: "info", text: "LaTeX 块保留原始内容，当前阅读器不保证数学公式排版。",
  });
  if (/(?:^|\n) {0,3}<\/?(?:table|div|iframe|script|style)\b/i.test(source)) warnings.push({
    id: "html", level: "attention", text: "含原始 HTML 标签。为安全起见，阅读及 HTML 导出会过滤不受信任的标签。",
  });
  if (parseMarkdownTables(source).some(table => !table.canonical)) warnings.push({
    id: "tolerant-table", level: "info", text: "发现非标准表格，编辑器容错显示；仅在主动编辑时规范化表格。",
  });
  if (lines.some(line => (line.match(/\|/g)?.length ?? 0) > 21)) warnings.push({
    id: "wide-table", level: "info", text: "部分表格超过 20 列可视化限制，将保留可编辑的 Markdown 源码。",
  });
  return warnings;
}
