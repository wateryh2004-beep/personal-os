"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Download } from "lucide-react";
import { recordNotePdfExport, saveNote } from "@/features/notes/actions";
import { markdownFilename } from "@/features/notes/utils";
import { NoteAiAssistant } from "@/components/notes/note-ai-assistant";

type Note = { id: string; title: string; body_markdown: string; revision: number; last_saved_at: string | null };
type PdfSnapshot = { title: string; body: string };

const pdfCloneStyles = `
  #note-pdf-preview, #note-pdf-preview * { color: #27272a !important; border-color: #e7e5e4 !important; }
  #note-pdf-preview { position: absolute !important; left: 0 !important; top: 0 !important; z-index: 1 !important; width: 794px !important; min-height: 1px !important; background: #ffffff !important; }
  #note-pdf-preview h1, #note-pdf-preview h2, #note-pdf-preview h3 { color: #18181b !important; }
  #note-pdf-preview pre { background: #18181b !important; color: #f4f4f5 !important; }
  #note-pdf-preview pre * { color: #f4f4f5 !important; }
  #note-pdf-preview code { background: #f4f4f5 !important; }
  #note-pdf-preview pre code { background: transparent !important; }
  #note-pdf-preview th { background: #f4f4f5 !important; }
`;

function MarkdownDocument({ body }: { body: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
    h1: ({ children }) => <h1 className="mb-5 mt-1 text-3xl font-semibold tracking-tight text-zinc-900">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-3 mt-8 border-b pb-2 text-xl font-semibold text-zinc-900">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-6 text-base font-semibold text-zinc-900">{children}</h3>,
    p: ({ children }) => <p className="mb-4 leading-7 text-zinc-700">{children}</p>,
    ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-6 text-zinc-700">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-6 text-zinc-700">{children}</ol>,
    li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
    blockquote: ({ children }) => <blockquote className="mb-4 border-l-2 border-[#365F78] pl-4 italic text-zinc-600">{children}</blockquote>,
    pre: ({ children }) => <pre className="mb-4 overflow-x-auto bg-zinc-950 p-4 text-sm leading-6 text-zinc-100">{children}</pre>,
    code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-zinc-800">{children}</code>,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#365F78] underline underline-offset-2">{children}</a>,
    table: ({ children }) => <div className="mb-4 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
    th: ({ children }) => <th className="border bg-zinc-50 px-3 py-2 font-medium">{children}</th>,
    td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
    hr: () => <hr className="my-7 border-zinc-200" />,
  }}>{body}</ReactMarkdown>;
}

export function NoteEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_markdown);
  const [revision, setRevision] = useState(note.revision);
  const [state, setState] = useState<"已保存" | "有未保存修改" | "正在保存" | "保存失败" | "版本冲突">("已保存");
  const [mode, setMode] = useState<"edit" | "preview" | "split">("split");
  const [pdfSnapshot, setPdfSnapshot] = useState<PdfSnapshot | null>(null);
  const [pdfError, setPdfError] = useState("");
  const pdfPreviewRef = useRef<HTMLElement>(null);
  const save = useCallback(async () => {
    setState("正在保存");
    try {
      const result = await saveNote({ noteId: note.id, expectedRevision: revision, title, bodyMarkdown: body });
      if (result.status === "conflict") { setState("版本冲突"); return; }
      setRevision(result.revision); setState("已保存");
    } catch { setState("保存失败"); }
  }, [body, note.id, revision, title]);

  useEffect(() => { if (state !== "有未保存修改") return; const timer = window.setTimeout(() => void save(), 1000); return () => window.clearTimeout(timer); }, [save, state]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") { event.preventDefault(); setMode((current) => current === "edit" ? "preview" : "edit"); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [save]);
  useEffect(() => {
    if (!pdfSnapshot || !pdfPreviewRef.current) return;
    let cancelled = false;
    const exportPdf = async () => {
      try {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        const element = pdfPreviewRef.current;
        if (!element || cancelled) return;
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
        const canvas = await html2canvas(element, {
          backgroundColor: "#ffffff",
          scale: 1.5,
          width: element.scrollWidth,
          height: element.scrollHeight,
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
          onclone: (document) => {
            const style = document.createElement("style");
            style.textContent = pdfCloneStyles;
            document.head.append(style);
          },
        });
        if (cancelled) return;
        if (!canvas.width || !canvas.height) throw new Error("empty_pdf_canvas");
        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        const margin = 40;
        const printableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
        const printableHeight = pdf.internal.pageSize.getHeight() - margin * 2;
        const scale = printableWidth / canvas.width;
        const sourcePageHeight = Math.floor(printableHeight / scale);
        let sourceY = 0;
        let page = 0;
        while (sourceY < canvas.height) {
          const sourceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = sourceHeight;
          const context = pageCanvas.getContext("2d");
          if (!context) throw new Error("canvas_unavailable");
          context.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
          if (page) pdf.addPage();
          pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, printableWidth, sourceHeight * scale, undefined, "FAST");
          sourceY += sourceHeight;
          page += 1;
        }
        pdf.save(markdownFilename(pdfSnapshot.title).replace(/\.md$/i, ".pdf"));
        // A successful local download must not be reported as failed only because
        // the non-essential audit write is temporarily unavailable.
        await recordNotePdfExport(note.id).catch(() => undefined);
      } catch {
        if (!cancelled) setPdfError("PDF 暂时无法生成，请刷新后重试。");
      } finally {
        if (!cancelled) setPdfSnapshot(null);
      }
    };
    void exportPdf();
    return () => { cancelled = true; };
  }, [note.id, pdfSnapshot]);

  const dirty = () => setState("有未保存修改");
  const editorHeight = "calc(100dvh - 250px)";
  const isExporting = Boolean(pdfSnapshot);
  return <section className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><input aria-label="笔记标题" value={title} onChange={(event) => { setTitle(event.target.value); dirty(); }} className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none" placeholder="无标题笔记" /><div className="flex flex-wrap items-center justify-end gap-2 text-xs text-zinc-500"><span aria-live="polite">{state}</span><button className="border px-2 py-1" onClick={() => void save()}>保存</button><button className="border px-2 py-1" onClick={() => setMode("edit")}>编辑</button><button className="border px-2 py-1" onClick={() => setMode("preview")}>预览</button><button className="border px-2 py-1" onClick={() => setMode("split")}>实时分栏</button><button className="inline-flex items-center gap-1 border px-2 py-1 text-[#365F78] disabled:opacity-60" disabled={isExporting} onClick={() => { setPdfError(""); setPdfSnapshot({ title: title || "无标题笔记", body }); }}><Download size={14} />{isExporting ? "生成 PDF…" : "导出 PDF"}</button></div></div><details className="mt-4 border-l-2 border-[#365F78] bg-[#EDF3F6] px-3 py-2"><summary className="cursor-pointer text-sm font-medium text-[#365F78]">AI 笔记助手 <span className="ml-1 text-xs font-normal text-zinc-500">总结、提炼行动、润色或自定义协助</span></summary><NoteAiAssistant noteId={note.id} title={title} bodyMarkdown={body} onInsert={(suggestion) => { setBody((current) => `${current}${current.trim() ? "\n\n" : ""}${suggestion}`); dirty(); }} /></details>{pdfError ? <p role="alert" className="mt-3 text-sm text-red-700">{pdfError}</p> : null}<div className={mode === "split" ? "grid min-h-0 gap-5 pt-5 lg:grid-cols-2" : "pt-5"}>{mode !== "preview" ? <div className="min-w-0 overflow-hidden border bg-white"><CodeMirror value={body} height={editorHeight} extensions={[markdown(), EditorView.lineWrapping]} onChange={(value) => { setBody(value); dirty(); }} className="text-[15px] leading-7" /></div> : null}{mode !== "edit" ? <div className={`${mode === "split" ? "hidden lg:block" : "block"} min-w-0 overflow-y-auto border bg-white`} style={{ height: editorHeight }}><article className="mx-auto max-w-[820px] p-6 text-[15px]"><MarkdownDocument body={body} /></article></div> : null}</div>{pdfSnapshot ? <article id="note-pdf-preview" ref={pdfPreviewRef} className="fixed -left-[10000px] top-0 w-[794px] bg-white p-12 text-[15px]"><h1 className="mb-7 text-3xl font-semibold text-zinc-900">{pdfSnapshot.title}</h1><MarkdownDocument body={pdfSnapshot.body} /></article> : null}</section>;
}
