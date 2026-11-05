import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
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

type HtmlTree = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HtmlTree[] };
const tags = new Set(["a", "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del", "code", "pre", "blockquote", "ol", "ul", "li", "table", "thead", "tbody", "tr", "th", "td", "img", "input"]);
const attrs = new Set(["href", "src", "alt", "title", "className", "start", "align", "type", "checked", "disabled", "colSpan", "rowSpan"]);
const voidElements = new Set(["br", "hr", "img", "input"]);
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeSanitize);

function safeUrl(value: string) {
  return /^(https?:\/\/|mailto:|#)/i.test(value) ||
    (value.startsWith("/") && !value.startsWith("//")) ? value : "";
}
function serializeNode(node: HtmlTree): string {
  if (node.type === "text") return escapeHtml(node.value ?? "");
  if (node.type === "root") return (node.children ?? []).map(serializeNode).join("");
  if (node.type !== "element" || !node.tagName || !tags.has(node.tagName)) return "";
  const props = Object.entries(node.properties ?? {}).flatMap(([name, raw]) => {
    if (!attrs.has(name) || raw === undefined || raw === null || raw === false) return [];
    const key = name === "className" ? "class" : name === "colSpan" ? "colspan" : name === "rowSpan" ? "rowspan" : name;
    if (name === "checked" || name === "disabled") return [key];
    const value = Array.isArray(raw) ? raw.join(" ") : String(raw);
    const secure = (name === "href" || name === "src") ? safeUrl(value) : value;
    if (!secure) return [];
    return [key + '="' + escapeHtml(secure) + '"'];
  });
  const open = "<" + node.tagName + (props.length ? " " + props.join(" ") : "") + ">";
  return voidElements.has(node.tagName) ? open : open + (node.children ?? []).map(serializeNode).join("") + "</" + node.tagName + ">";
}

/** Standard GFM parsing + AST sanitization, then a narrow HTML serializer.
 * No server-side React renderer (unsupported by Next.js 16 route modules). */
export function renderPortableNoteHtml(title: string, markdown: string, preview = false): string {
  const safeTitle = escapeHtml(title.trim() || "无标题笔记");
  const mdast = processor.parse(markdown);
  const hast = processor.runSync(mdast);
  const body = serializeNode(hast as unknown as HtmlTree);
  const help = preview ? '<aside class="print-help">可使用浏览器“打印 / 保存为 PDF”，得到可选择文字的 PDF。请检查长表格和分页。</aside>' : "";
  return "<!doctype html>\n<html lang=\"zh-CN\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>" + safeTitle + "</title><style>" + noteCss + "</style></head><body>" +
    help + "<article><h1>" + safeTitle + "</h1>" + body + "</article></body></html>";
}
