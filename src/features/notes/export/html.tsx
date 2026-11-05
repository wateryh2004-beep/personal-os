import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

/** Standalone, printable, selectable text; never execute user Markdown as HTML. */
export function renderNoteHtml({ title, markdown, printable = false }: {
  title: string; markdown: string; printable?: boolean;
}): string {
  const name = title.trim() || "无标题笔记";
  const escape = (value: string) => value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const body = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
      {markdown}
    </ReactMarkdown>,
  );
  const style = `
:root{color-scheme:light}*{box-sizing:border-box}html{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#242b27;background:#fff}
body{max-width:820px;margin:32px auto;padding:0 24px;font-size:16px;line-height:1.8}
h1,h2,h3,h4,h5,h6{line-height:1.4;break-after:avoid}h1{font-size:30px}h2{font-size:24px;border-bottom:1px solid #dedfd9;padding-bottom:8px}h3{font-size:20px}
p,li,blockquote{overflow-wrap:anywhere}a{color:#37594b;text-decoration:underline}blockquote{border-left:3px solid #37594b;margin-left:0;padding-left:15px;color:#57645b}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f1;padding:12px;border-radius:8px}code{font-size:.9em}
img{max-width:100%;height:auto}table{border-collapse:collapse;display:block;max-width:100%;overflow-x:auto;margin:16px 0}
th,td{border:1px solid #cfd5ce;padding:7px 10px;min-width:70px;text-align:left}th{background:#f3f5f1}
hr{border:0;border-top:1px solid #d4d8d2}input[type="checkbox"]{accent-color:#37594b}
.note-print-help{background:#f3f5f1;border-radius:10px;padding:12px 16px;color:#536258;font-size:13px}
@page{size:A4;margin:16mm} @media print{
  body{margin:0 auto;padding:0;max-width:none;color:#000;font-size:11pt}
  .note-print-help{display:none}a{color:inherit}pre,blockquote,table,img{break-inside:avoid}
}
`;
  const hint = printable
    ? '<p class="note-print-help">使用浏览器的打印功能（Ctrl/⌘ + P），选择“保存为 PDF”，可得到支持选取、复制和搜索文字的 PDF。图片或附件若需要登录，需在导出后单独保存。</p>'
    : "";
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escape(name) + '</title><style>' + style + '</style></head><body><main><h1>' +
    escape(name) + '</h1>' + hint + body + '</main></body></html>';
}
