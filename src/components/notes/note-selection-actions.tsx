"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { z } from "zod";
import type { NoteSelection } from "./note-ai-assistant";
import { insertIntoAdjacentNote } from "@/features/workflow-continuity/note-insertion";
import { noteSelectionContent, taskSelectionContent } from "@/features/notes/selection-content";
import { createMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";

const listSchema = z.object({ lists: z.array(z.object({ id: z.uuid(), displayName: z.string() })).max(100), unavailable: z.boolean() });
type RetainedSource = { href: string; text: string; current: () => boolean };
type BudgetFailure = RetainedSource & { destination: "task" | "note"; actual: number; limit: number };
type TaskPreview = RetainedSource & { body: string; referenceOnly: boolean; requestId: string; lists: Array<{ id: string; displayName: string }> };

export function NoteSelectionActions({ selection, noteId, capture }: { selection: NoteSelection; noteId: string; capture: () => Promise<string | null> }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [task, setTask] = useState<TaskPreview | null>(null);
  const [budgetFailure, setBudgetFailure] = useState<BudgetFailure | null>(null);
  const run = (mode: "quote" | "link" | "task" | "task-reference", retained?: RetainedSource) => start(async () => {
    const scope = captureWorkspaceScope();
    const current = () => scope() && mounted.current && (!retained || retained.current());
    if (!current()) return;
    const text = retained?.text ?? selection.text;
    setMessage(""); setTask(null); if (!retained) setBudgetFailure(null);
    try {
      const href = retained?.href ?? await capture();
      if (!current()) return;
      if (!href) { setMessage("原文未能确认保存，请重新选择后重试。"); return; }
      const source = { kind: "note" as const, href };
      const creatingTask = mode === "task" || mode === "task-reference";
      const content = creatingTask ? taskSelectionContent(text, source, mode === "task-reference") : noteSelectionContent(text, source, mode === "link");
      if (content.status === "over-budget") {
        setBudgetFailure({ href, text, current, destination: creatingTask ? "task" : "note", actual: content.actual, limit: content.limit });
        return;
      }
      if (creatingTask) {
        // Budget is proven before showing a confirmation form or reading its lists.
        const response = await fetch("/api/tasks/workspace", { cache: "no-store" });
        const payload = listSchema.safeParse(await response.json());
        if (!current()) return;
        if (!response.ok || !payload.success || payload.data.unavailable || !payload.data.lists.length) { setMessage("任务清单暂不可用，请先恢复 Microsoft 连接。选文与来源仍保留。"); return; }
        setBudgetFailure(null);
        setTask({ href, text, body: content.content, referenceOnly: content.referenceOnly, current, requestId: crypto.randomUUID(), lists: payload.data.lists });
        return;
      }
      if (!current()) return;
      const result = await insertIntoAdjacentNote({ sourceNoteId: noteId, markdown: content.content });
      if (!current()) return;
      if (result.status === "too-large") {
        setBudgetFailure({ href, text, current, destination: "note", actual: result.actual, limit: result.limit });
        return;
      }
      if (result.status === "applied") setBudgetFailure(null);
      setMessage(result.status === "applied" ? "已插入旁边笔记，等待自动保存。"
        : result.status === "inactive" ? "请在参照区打开一篇可编辑笔记，再插入。"
        : result.status === "conflict" ? "目标笔记内容或可插入空间已变化。请缩小选区或换一篇目标笔记后重试。"
        : "本次来源或目标状态已变化，请重新选择后重试。");
    } catch { if (current()) setMessage("操作暂未完成，选文仍保留。"); }
  });
  return <div className="shrink-0 border-b border-[var(--separator)] bg-[var(--surface-control)] px-3 py-2 text-xs" aria-label="选文操作">
    <div className="flex flex-wrap gap-2">{([ ["task", "转为任务"], ["quote", "引用到旁边笔记"], ["link", "关联到旁边笔记"] ] as const).map(([mode, label]) => <button key={mode} type="button" disabled={pending} onMouseDown={(event) => event.preventDefault()} onClick={() => run(mode)} className="pressable min-h-11 rounded-md border px-3 disabled:opacity-40">{label}</button>)}</div>
    {budgetFailure ? <div role="status" className="space-y-1 py-2">
      <p>{budgetFailure.destination === "task" ? "选文与来源链接合计" : "引用格式与来源链接合计"} {budgetFailure.actual.toLocaleString("en-US")} 个字符，超过{budgetFailure.destination === "task" ? "任务正文" : "单次笔记插入"}的 {budgetFailure.limit.toLocaleString("en-US")} 字符上限。原选文和来源已保留，请缩小选区，或仅关联来源。</p>
      <button type="button" disabled={pending} onMouseDown={event => event.preventDefault()} onClick={() => run(budgetFailure.destination === "task" ? "task-reference" : "link", budgetFailure)} className="min-h-11 rounded-md border px-3 disabled:opacity-40">{budgetFailure.destination === "task" ? "仅用来源创建任务" : "仅关联来源到旁边笔记"}</button>
    </div> : null}
    {message ? <p role="status" className="py-1">{message}</p> : null}
    {task ? <form className="mt-2 grid gap-2" action={(form) => start(async () => {
      if (!task.current()) return;
      form.set("request_id", task.requestId); form.set("body_text", task.body);
      const result = await createMicrosoftTodoTaskAction({ status: "idle", message: "" }, form);
      if (!task.current()) return;
      setMessage(result.message); if (result.status === "success") setTask(null);
    })}>
      <p>任务正文{task.referenceOnly ? "仅包含保留的来源链接，选文不会带入" : "包含选文与来源链接"} · {task.body.length.toLocaleString("en-US")} / 10,000 字符</p>
      <label>任务标题<input name="title" required maxLength={500} defaultValue={task.text.replace(/\s+/g, " ").slice(0, 150)} className="ui-field mt-1 w-full" /></label>
      <label>Microsoft To Do 清单<select name="todo_list_id" className="ui-field mt-1 w-full">{task.lists.map((list) => <option key={list.id} value={list.id}>{list.displayName}</option>)}</select></label>
      <div className="flex gap-2"><button disabled={pending} className="min-h-11 rounded-md bg-[var(--accent)] px-3 text-white">确认创建任务</button><button type="button" onClick={() => setTask(null)} className="min-h-11 px-3">取消</button></div>
    </form> : null}
  </div>;
}
