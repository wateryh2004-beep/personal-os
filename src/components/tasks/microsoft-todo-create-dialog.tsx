"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createMicrosoftTodoTaskAction, type TodoCreateState } from "@/features/tasks/microsoft-todo";

type TodoList = { id: string; display_name: string; is_default: boolean };
const initialState: TodoCreateState = { status: "idle", message: "" };

export function MicrosoftTodoCreateDialog({ lists }: { lists: TodoList[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createMicrosoftTodoTaskAction, initialState);
  const defaultList = lists.find((list) => list.is_default)?.id || lists[0]?.id;
  return <Dialog open={open} onOpenChange={setOpen}>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-[#365F78] px-3 py-2 text-sm text-white"><Plus size={16} />新建任务</button>
    <DialogContent className="sm:max-w-lg">
      <div className="border-b pb-4"><h2 className="text-lg font-semibold tracking-tight">新建 Microsoft To Do 任务</h2><p className="mt-1 text-sm text-zinc-500">保存后会直接写入 Microsoft To Do。</p></div>
      <form action={action} className="grid gap-4">
        <label className="grid gap-1.5 text-sm text-zinc-700">任务标题<input name="title" required maxLength={500} autoFocus placeholder="例如：完成项目说明" className="border bg-white px-3 py-2 text-sm text-zinc-900" /></label>
        <label className="grid gap-1.5 text-sm text-zinc-700">说明（可选）<textarea name="body_text" rows={4} maxLength={10000} placeholder="补充背景、步骤或链接" className="resize-y border bg-white px-3 py-2 text-sm leading-5 text-zinc-900" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm text-zinc-700">清单<select name="todo_list_id" defaultValue={defaultList} className="border bg-white px-3 py-2 text-sm text-zinc-900">{lists.map((list) => <option key={list.id} value={list.id}>{list.display_name}{list.is_default ? "（默认）" : ""}</option>)}</select></label><label className="grid gap-1.5 text-sm text-zinc-700">优先级<select name="importance" defaultValue="normal" className="border bg-white px-3 py-2 text-sm text-zinc-900"><option value="normal">普通</option><option value="high">高</option><option value="low">低</option></select></label></div>
        <label className="grid gap-1.5 text-sm text-zinc-700">截止时间（可选）<input name="due_at" type="datetime-local" className="border bg-white px-3 py-2 text-sm text-zinc-900" /></label>
        {state.status !== "idle" ? <p role="status" className={`text-sm ${state.status === "success" ? "text-[#365F78]" : "text-red-700"}`}>{state.message}</p> : null}
        <div className="flex justify-end border-t pt-4"><button disabled={pending} className="bg-[#365F78] px-3 py-2 text-sm text-white disabled:opacity-60">{pending ? "正在创建…" : "创建任务"}</button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
