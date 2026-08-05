"use client";

import { useCallback, useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { saveNote } from "@/features/notes/actions";

type Note = { id: string; title: string; body_markdown: string; revision: number; last_saved_at: string | null };

export function NoteEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_markdown);
  const [revision, setRevision] = useState(note.revision);
  const [state, setState] = useState<"已保存" | "有未保存修改" | "正在保存" | "保存失败" | "版本冲突">("已保存");
  const [mode, setMode] = useState<"edit" | "preview" | "split">("edit");
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
  const dirty = () => setState("有未保存修改");
  return <section className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><input aria-label="笔记标题" value={title} onChange={(event) => { setTitle(event.target.value); dirty(); }} className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none" placeholder="无标题笔记" /><div className="flex items-center gap-2 text-xs text-zinc-500"><span aria-live="polite">{state}</span><button className="border px-2 py-1" onClick={() => void save()}>保存</button><button className="border px-2 py-1" onClick={() => setMode("edit")}>编辑</button><button className="border px-2 py-1" onClick={() => setMode("preview")}>预览</button><button className="border px-2 py-1" onClick={() => setMode("split")}>分栏</button></div></div><div className={mode === "split" ? "grid gap-6 pt-5 lg:grid-cols-2" : "pt-5"}>{mode !== "preview" ? <CodeMirror value={body} height="calc(100vh - 180px)" extensions={[markdown()]} onChange={(value) => { setBody(value); dirty(); }} className="text-[15px]" /> : null}{mode !== "edit" ? <article className="max-w-none text-[15px]"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{body}</ReactMarkdown></article> : null}</div></section>;
}
