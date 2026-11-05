import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const noteCss = [
  "@page{size:A4;margin:18mm 16mm}",
  "body{background:#fff;color:#1f2937;font:16px/1.7 system-ui,-apple-system,sans-serif;margin:0}",
  "article{max-width:800px;margin:36px auto;padding:0 24px;overflow-wrap:anywhere}",
  "h1,h2,h3,h4{line-height:1.35;break-after:avoid;color:#182d26}",
  "h1{font-size:28px}h2{font-size:23px;border-bottom:1px solid #d4ddd7}",
  "h3{font-size:19px}a{color:#37594b;overflow-wrap:anywhere}",
  "pre{white-space:pre-wrap;overflow-wrap:anywhere;break-inside:avoid;background:#f4f5f3;padding:12px;border-radius:7px}",
  "code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}",
  "blockquote{margin-left:0;padding-left:14px;border-left:3px solid #9bb5a4}",
  "table{border-collapse:collapse;width:100%;table-layout:auto;display:block;overflow-x:auto}",
  "th,td{border:1px solid #d7dfd9;padding:7px 9px;text-align:left;vertical-align:top}",
  "thead{background:#f3f6f4}tr{break-inside:avoid}img{max-width:100%;height:auto}",
  "figure,pre,blockquote{break-inside:avoid}hr{border:0;border-top:1px solid #d7dfd9}",
  ".print-help{margin:0;padding:12px 20px;background:#eaf2ed;color:#294737;font-size:13px}",
  "@media print{body{font-size:11pt;color:#000}.print-help{display:none}article{max-width:none;margin:0;padding:0}",
  "a{color:inherit;text-decoration:underline}table{display:table;overflow:visible;width:100%}",
  "tr,pre,blockquote,img{break-inside:avoid}h1,h2,h3{break-after:avoid}}",
].join("\n");

/** Portable, sanitized GFM HTML. No scripts, no embedded secrets or privileged
 * image URLs; private images remain authenticated links in the original note. */
export function renderPortableNoteHtml(title: string, markdown: string, preview = false): string {
  const safeTitle = escapeHtml(title.trim() || "无标题笔记");
  const body = renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSanitize], children: markdown,
  }));
  const help = preview ? '<aside class="print-help">可使用浏览器“打印 / 保存为 PDF”，得到可选择文字的 PDF。请检查长表格和分页。</aside>' : "";
  return "<!doctype html>\n<html lang=\"zh-CN\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>" + safeTitle + "</title><style>" + noteCss + "</style></head><body>" +
    help + "<article><h1>" + safeTitle + "</h1>" + body + "</article></body></html>";
}
