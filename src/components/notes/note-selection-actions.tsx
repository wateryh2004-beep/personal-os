"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import {useWorkflowDraft} from "@/features/workflow-continuity/drafts";
import {draftResumeKey,focusDraftForm,useDraftResumeConsumer} from "@/features/workflow-continuity/draft-resume";
import {DraftRecoveryStatus} from "@/components/workflow-continuity/draft-recovery-status";
import {parseSourceLocator} from "@/features/links/source-locator";
import { z } from "zod";
import type { NoteSelection } from "./note-ai-assistant";
import { insertIntoAdjacentNote } from "@/features/workflow-continuity/note-insertion";
import { noteSelectionContent, taskSelectionContent } from "@/features/notes/selection-content";
import { createMicrosoftTodoTaskAction,readMicrosoftTodoCreationAction } from "@/features/tasks/microsoft-todo";
import type {TaskCreationTransport} from "@/features/workflow-continuity/task-create-draft";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";

const listSchema = z.object({ lists: z.array(z.object({ id: z.uuid(), displayName: z.string() })).max(100), unavailable: z.boolean() });
type RetainedSource = { href: string; text: string; current: () => boolean };
type BudgetFailure = RetainedSource & { destination: "task" | "note"; actual: number; limit: number };
type TaskPreview = RetainedSource & { body: string; referenceOnly: boolean; requestId: string; lists: Array<{ id: string; displayName: string }> };

export function NoteSelectionActions({ selection, noteId, capture,actionTransport }: { actionTransport?:TaskCreationTransport;selection: NoteSelection|null; noteId: string; capture: () => Promise<string | null> }) {
  assertContinuousFixtureTransport(actionTransport);
  const payloadSchema=z.object({requestId:z.uuid(),title:z.string().max(500),listId:z.string().max(36),body:z.string().max(10000),href:z.string().max(1500),referenceOnly:z.boolean()}).strict().refine(value=>{const locator=parseSourceLocator(value.href);return locator?.kind==="note"&&locator.noteId===noteId;});
  const schema=z.object({preview:payloadSchema.nullable(),intent:payloadSchema.nullable(),rejected:z.boolean().optional()}).strict();
  type Payload=z.infer<typeof payloadSchema>;
  const target={kind:"note.selection-task" as const,id:noteId,parentId:noteId};
  const recovery=useWorkflowDraft({kind:"task",id:`note-selection:${noteId}`,label:"选文转为任务",resumeHref:`/notes/${noteId}`,resumeTarget:target,initialValue:{preview:null,intent:null} as {preview:Payload|null;intent:Payload|null;rejected?:boolean},parse:input=>{const result=schema.safeParse(input);return result.success?result.data:null;}});
  const originCurrent=recovery.isCurrent;
  const live=useRef(recovery.value);useLayoutEffect(()=>{live.current=recovery.value;},[recovery.value]);
  const [dismissed,setDismissed]=useState(false);
  const taskForm=useRef<HTMLFormElement>(null),submitBusy=useRef(false);
  useDraftResumeConsumer({kind:target.kind,identity:{id:noteId,parentId:noteId},priority:1,ready:()=>Boolean(recovery.value.preview),open:async(value,context)=>{setDismissed(false);return focusDraftForm(value,context);}});
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [task, setTask] = useState<TaskPreview | null>(null);
  const [budgetFailure, setBudgetFailure] = useState<BudgetFailure | null>(null);
  const restoredPreviewId=recovery.restored?recovery.value.preview?.requestId:null;
  useEffect(()=>{
    const restoredPreview=live.current.preview;
    if(!restoredPreviewId||!restoredPreview)return;
    const scope=captureWorkspaceScope();let active=true;
    void fetch("/api/tasks/workspace",{cache:"no-store"}).then(async response=>{const parsed=listSchema.safeParse(await response.json());if(!active||!scope()||!mounted.current)return;if(!response.ok||!parsed.success||parsed.data.unavailable){setMessage("任务清单暂不可用，原输入仍保留。");return;}setTask({href:restoredPreview.href,text:restoredPreview.title,body:restoredPreview.body,referenceOnly:restoredPreview.referenceOnly,requestId:restoredPreview.requestId,lists:parsed.data.lists,current:()=>originCurrent()&&scope()&&mounted.current});}).catch(()=>{if(active&&scope())setMessage("任务清单暂不可用，原输入仍保留。");});
    return()=>{active=false;};
  },[restoredPreviewId,originCurrent]);
  const run = (mode: "quote" | "link" | "task" | "task-reference", retained?: RetainedSource) => start(async () => {
    const scope = captureWorkspaceScope();
    const current = () => recovery.isCurrent() && scope() && mounted.current && (!retained || retained.current());
    if (!current()) return;
    if(!retained&&!selection)return;
    const text = retained?.text ?? selection!.text;
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
        setDismissed(false);recovery.setValue({preview:{href,body:content.content,referenceOnly:content.referenceOnly,requestId:crypto.randomUUID(),title:text.replace(/\s+/g," ").slice(0,150),listId:payload.data.lists[0].id},intent:null});
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
  if(!selection&&!task&&!budgetFailure&&!message)return null;
  return <div className="shrink-0 border-b border-[var(--separator)] bg-[var(--surface-control)] px-3 py-2 text-xs" aria-label="选文操作">
    {selection?<div className="flex flex-wrap gap-2">{([ ["task", "转为任务"], ["quote", "引用到旁边笔记"], ["link", "关联到旁边笔记"] ] as const).map(([mode, label]) => <button key={mode} type="button" disabled={pending} onMouseDown={(event) => event.preventDefault()} onClick={() => run(mode)} className="pressable min-h-11 rounded-md border px-3 disabled:opacity-40">{label}</button>)}</div>:null}
    {budgetFailure ? <div role="status" className="space-y-1 py-2">
      <p>{budgetFailure.destination === "task" ? "选文与来源链接合计" : "引用格式与来源链接合计"} {budgetFailure.actual.toLocaleString("en-US")} 个字符，超过{budgetFailure.destination === "task" ? "任务正文" : "单次笔记插入"}的 {budgetFailure.limit.toLocaleString("en-US")} 字符上限。原选文和来源已保留，请缩小选区，或仅关联来源。</p>
      <button type="button" disabled={pending} onMouseDown={event => event.preventDefault()} onClick={() => run(budgetFailure.destination === "task" ? "task-reference" : "link", budgetFailure)} className="min-h-11 rounded-md border px-3 disabled:opacity-40">{budgetFailure.destination === "task" ? "仅用来源创建任务" : "仅关联来源到旁边笔记"}</button>
    </div> : null}
    {message ? <p role="status" className="py-1">{message}</p> : null}
    {task&&recovery.value.preview&&!dismissed ? <form ref={taskForm} data-workflow-draft-key={draftResumeKey(target)} className="mt-2 grid gap-2" onSubmit={event=>{event.preventDefault();if(submitBusy.current||!task.current()||!recovery.isCurrent())return;const preview=recovery.value.preview;if(!preview)return;const submitted=recovery.value.intent??(recovery.value.rejected?{...preview,requestId:crypto.randomUUID()}:preview);const expected={preview:submitted,intent:submitted,rejected:false};recovery.setValue(value=>({...value,preview:recovery.value.intent?value.preview:submitted,intent:submitted,rejected:false}));submitBusy.current=true;start(async()=>{const form=new FormData();form.set("request_id",submitted.requestId);form.set("body_text",submitted.body);form.set("title",submitted.title);form.set("todo_list_id",submitted.listId);try{const result=recovery.value.intent?await (actionTransport?.read??readMicrosoftTodoCreationAction)(form):await (actionTransport?.create??createMicrosoftTodoTaskAction)({status:"idle",message:""},form);if(!task.current())return;setMessage(result.message);if(result.status!=="success"&&result.writeOutcome==="not_written")recovery.setValue(value=>({...value,intent:null,rejected:true}));if(result.status==="success"){const unchanged=JSON.stringify(live.current.preview)===JSON.stringify(submitted);recovery.commit(expected,value=>({preview:JSON.stringify(value.preview)===JSON.stringify(submitted)?null:value.preview?{...value.preview,requestId:crypto.randomUUID()}:null,intent:null}));if(unchanged)setTask(null);}}catch{if(task.current())setMessage("提交结果尚未确认，原输入已保留。请核对原提交。");}finally{submitBusy.current=false;}});}}>
      <p>任务正文{task.referenceOnly ? "仅包含保留的来源链接，选文不会带入" : "包含选文与来源链接"} · {task.body.length.toLocaleString("en-US")} / 10,000 字符</p>
      <label>任务标题<input name="title" required maxLength={500} value={recovery.value.preview.title} onChange={event=>recovery.setValue(value=>({...value,preview:value.preview?{...value.preview,title:event.target.value}:null}))} className="ui-field mt-1 w-full" /></label>
      <label>Microsoft To Do 清单<select name="todo_list_id" value={recovery.value.preview.listId} onChange={event=>recovery.setValue(value=>({...value,preview:value.preview?{...value.preview,listId:event.target.value}:null}))} className="ui-field mt-1 w-full">{!task.lists.some(row=>row.id===recovery.value.preview?.listId)?<option disabled value={recovery.value.preview.listId}>原清单当前不可用，请重新选择</option>:null}{task.lists.map((list) => <option key={list.id} value={list.id}>{list.displayName}</option>)}</select></label>
      <DraftRecoveryStatus dirty restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable}/>
      <div className="flex gap-2"><button disabled={pending||!task.lists.some(row=>row.id===recovery.value.preview?.listId)} className="min-h-11 rounded-md bg-[var(--accent)] px-3 text-white">{recovery.value.intent?"核对原提交":"确认创建任务"}</button><button type="button" disabled={pending} onClick={()=>setDismissed(true)} className="min-h-11 px-3">稍后继续</button></div>
    </form> : null}
  </div>;
}
