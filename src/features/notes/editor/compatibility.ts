import { parseMarkdownTables } from "./markdown-table";

export type MarkdownCompatibilityNotice = {
  id: "large" | "diagram" | "math" | "html" | "tolerant-table" | "wide-table";
  level: "info" | "attention";
  text: string;
};

/**
 * Read-only diagnostics; never rewrite original Markdown. This is a
 * conservative hint system, not an alternative Markdown parser.
 */
export function analyzeMarkdownCompatibility(source: string): MarkdownCompatibilityNotice[] {
  if (!source.trim()) return [];
  const notices: MarkdownCompatibilityNotice[] = [];
  if (source.length > 80_000 || source.split("\n").length > 1500) notices.push({
    id: "large", level: "info",
    text: "长文档可切换至源码模式；历史对比过大时仅提供全文对照，以避免界面卡顿。",
  });
  if (/(?:^|\n) {0,3}\x60{3,}(?:mermaid|plantuml|graphviz)\b/i.test(source)) notices.push({
    id: "diagram", level: "info",
    text: "图表代码块保留原始 Markdown；阅读和 HTML 导出暂不保证图形渲染。",
  });
  if (/(?:^|\n)\s*\$\$[\s\S]*?\$\$/m.test(source)) notices.push({
    id: "math", level: "info",
    text: "LaTeX 数学公式保留源码，阅读及导出暂不保证公式排版。",
  });
  if (/(?:^|\n) {0,3}<\/?(?:table|div|iframe|script|style)\b/i.test(source)) notices.push({
    id: "html", level: "attention",
    text: "检测到原始 HTML。为防止执行不可信代码，阅读与 HTML 导出将过滤不安全内容。",
  });
  if (parseMarkdownTables(source).some(table => !table.canonical)) notices.push({
    id: "tolerant-table", level: "info",
    text: "发现非标准表格：编辑器可容错显示，仅在主动编辑单元格时规范化表格。",
  });
  if (source.split("\n").some(line => (line.match(/(?<!\\)\|/g)?.length ?? 0) > 21)) notices.push({
    id: "wide-table", level: "info",
    text: "表格超过 20 列的可视化限制时，将保留可编辑的 Markdown 源码。",
  });
  return notices;
}
