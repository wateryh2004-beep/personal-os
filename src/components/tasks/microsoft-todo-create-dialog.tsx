"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useDialogReturnFocus } from "@/components/shared/use-dialog-return-focus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  type TodoCreateState,
} from "@/features/tasks/microsoft-todo";
import type { TodoList } from "@/features/tasks/types";
import { resolveQuickAddTarget } from "@/features/tasks/task-view";
import {useTaskCreationDraft,taskCreateFieldsFromForm,type TaskCreationTransport} from "@/features/workflow-continuity/task-create-draft";
import {useDraftResumeConsumer,focusDraftForm} from "@/features/workflow-continuity/draft-resume";
import {DraftRecoveryStatus} from "@/components/workflow-continuity/draft-recovery-status";

const initialState: TodoCreateState = { status: "idle", message: "" };

const fieldClass =
  "ui-field h-9 w-full rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]";

export function MicrosoftTodoCreateDialog({
  lists,
  selectedListId = null,
  initialOpen = false,
  onCreated,transport,
}: {
  lists: TodoList[];transport?:TaskCreationTransport;
  selectedListId?: string | null;
  initialOpen?: boolean;
  onCreated: (taskId: string) => Promise<void>;
}) {
  const { rememberTrigger, restoreFocus } = useDialogReturnFocus();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<TodoCreateState>(initialState);

  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const initialRequestHandled = useRef(false);
  const createRequested = useSearchParams().get("create") === "1";
  const defaultList = resolveQuickAddTarget(lists, selectedListId)?.id;
  const {formRef,...draft}=useTaskCreationDraft("task.create","new",{title:"",body_text:"",todo_list_id:defaultList??"",importance:"normal",due_at:""},transport);
  const pending=draft.pending;const visibleState=state.status==="idle"?draft.state:state;
  useDraftResumeConsumer({kind:"task.create",identity:{id:"new"},priority:1,ready:()=>lists.length>0,open:async(target,context)=>{setOpen(true);return focusDraftForm(target,context);}});

  useEffect(() => {
    const requested = createRequested || (initialOpen && !initialRequestHandled.current);
    initialRequestHandled.current = true;
    if (!requested) return;
    // Consume the one-shot request before Dialog pushes its mobile Back entry.
    // Preserve Next's history state, other query parameters and the hash.
    const url = new URL(window.location.href);
    if (url.searchParams.get("create") === "1") {
      url.searchParams.delete("create");
      const historyState = { ...window.history.state };
      // Next skips canonical-URL updates for writes carrying its own markers.
      // Let Next restore those internals while retaining any existing overlay.
      delete historyState.__NA;
      delete historyState._N;
      window.history.replaceState(historyState, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setOpen(true);
  }, [createRequested, initialOpen]);

  const changeOpen = (next: boolean) => {
    if (submittingRef.current) return false;
    if (!next) {
      setState(initialState);
      setCreatedTaskId(null);
    }
    if(next)draft.adoptDefaultList(defaultList??"");
    setOpen(next);
  };

  const readCreatedTask = async (taskId: string) => {
    try {
      await onCreated(taskId);
      submittingRef.current = false;
      changeOpen(false);
    } catch {
      setState({ status: "success", message: "任务已创建，但暂时无法读取详情。请重新读取，不要重复创建。", taskId });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || createdTaskId !== null) return;
    submittingRef.current=true;
    try{
      const outcome=await draft.submit(taskCreateFieldsFromForm(event.currentTarget));if(!outcome)return;
      const {result,unchanged}=outcome;setState(result);
      if(result.status==="success"){
        if(unchanged){setCreatedTaskId(result.taskId??"");if(result.taskId)await readCreatedTask(result.taskId);}
        else setState({status:"success",message:"原任务已创建，当前新输入尚未保存。"});
      }
    }finally{submittingRef.current=false;}
  };

  const retryRead = async () => {
    if (submittingRef.current || !createdTaskId) return;
    submittingRef.current = true;
    try { await readCreatedTask(createdTaskId); }
    finally { submittingRef.current = false;  }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Button type="button" size="sm" onClick={(event) => { rememberTrigger(event.currentTarget); changeOpen(true); }} aria-label="新建任务">
        <Plus aria-hidden="true" />
        <span className="hidden sm:inline">新建</span>
      </Button>

      <DialogContent onCloseAutoFocus={restoreFocus} className="sm:max-w-[460px]" showCloseButton={!pending}>
        <div className="pb-1">
          <DialogTitle className="text-[20px] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
            新建任务
          </DialogTitle>
          <DialogDescription className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
            保存后会同步到 Microsoft To Do。
          </DialogDescription>
        </div>

        {!lists.length ? (
          <p className="border-l-2 border-[var(--warning)] px-3 py-2 text-[12px] leading-5 text-[var(--text-secondary)]">
            尚未同步到 Microsoft To Do 清单。请先关闭窗口并刷新任务。
          </p>
        ) : (
          <form ref={formRef} {...draft.attributes} onSubmit={(event) => void submit(event)} className="mt-2 grid gap-4" aria-busy={pending}>
            <DraftRecoveryStatus dirty restored={draft.restored} recoveryUnavailable={draft.recoveryUnavailable}/><fieldset disabled={createdTaskId !== null} className="grid gap-4">
            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-tertiary)]">
              任务标题
              <input
                name="title" value={draft.fields.title} onChange={event=>draft.setField("title",event.target.value)}
                required
                maxLength={500}
                autoFocus
                placeholder="需要完成什么？"
                className={fieldClass}
              />
            </label>

            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-tertiary)]">
              说明
              <textarea
                name="body_text" value={draft.fields.body_text} onChange={event=>draft.setField("body_text",event.target.value)}
                rows={4}
                maxLength={10000}
                placeholder="补充背景、步骤或链接"
                className="ui-field min-h-24 w-full resize-y rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-3 py-2.5 text-[13px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-tertiary)]">
                清单
                <select name="todo_list_id" value={draft.fields.todo_list_id} onChange={event=>draft.setField("todo_list_id",event.target.value)} className={fieldClass}>
                  {!lists.some(list=>list.id===draft.fields.todo_list_id)?<option disabled value={draft.fields.todo_list_id}>原清单当前不可用，请重新选择</option>:null}{lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.displayName}
                      {list.isDefault ? "（默认）" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-tertiary)]">
                优先级
                <select name="importance" value={draft.fields.importance} onChange={event=>draft.setField("importance",event.target.value)} className={fieldClass}>
                  <option value="normal">普通</option>
                  <option value="high">高</option>
                  <option value="low">低</option>
                </select>
              </label>
            </div>

            <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-tertiary)]">
              截止时间
              <input name="due_at" value={draft.fields.due_at} onChange={event=>draft.setField("due_at",event.target.value)} type="datetime-local" className={fieldClass} />
            </label>

            </fieldset>

            {visibleState.status !== "idle" ? (
              <p
                role={visibleState.status === "error" ? "alert" : "status"}
                className={`text-[12px] ${
                  visibleState.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"
                }`}
              >
                {visibleState.message}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
              <Button disabled={pending} type="button" variant="outline" onClick={() => changeOpen(false)}>
                {createdTaskId !== null ? "关闭" : "取消"}
              </Button>
              {createdTaskId !== null ? (
                <Button disabled={pending || !createdTaskId} type="button" onClick={() => void retryRead()}>
                  {pending ? "读取中…" : "重新读取任务"}
                </Button>
              ) : (
                <Button disabled={pending} type="submit">
                  {pending ? "处理中…" : draft.uncertain?"核对原提交":"创建任务"}
                </Button>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
