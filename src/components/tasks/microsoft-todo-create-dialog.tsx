"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  createMicrosoftTodoTaskAction,
  type TodoCreateState,
} from "@/features/tasks/microsoft-todo";
import type { TodoList } from "@/features/tasks/types";

const initialState: TodoCreateState = { status: "idle", message: "" };

const fieldClass =
  "h-9 w-full rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]";

export function MicrosoftTodoCreateDialog({
  lists,
  initialOpen = false,
}: {
  lists: TodoList[];
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [state, action, pending] = useActionState(createMicrosoftTodoTaskAction, initialState);
  const defaultList = lists.find((list) => list.isDefault)?.id || lists[0]?.id;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        <span className="hidden sm:inline">新建</span>
      </Button>

      <DialogContent className="sm:max-w-[460px]">
        <div className="pb-1">
          <h2 className="text-[20px] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
            新建任务
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
            保存后会同步到 Microsoft To Do。
          </p>
        </div>

        {!lists.length ? (
          <p className="border-l-2 border-[var(--warning)] px-3 py-2 text-[12px] leading-5 text-[var(--text-secondary)]">
            尚未同步到 Microsoft To Do 清单。请先关闭窗口并刷新任务。
          </p>
        ) : (
          <form action={action} className="mt-2 grid gap-4">
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">
              任务标题
              <input
                name="title"
                required
                maxLength={500}
                autoFocus
                placeholder="需要完成什么？"
                className={fieldClass}
              />
            </label>

            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">
              说明
              <textarea
                name="body_text"
                rows={4}
                maxLength={10000}
                placeholder="补充背景、步骤或链接"
                className="min-h-24 w-full resize-y rounded-[var(--radius-md)] border-0 bg-[var(--surface-control)] px-3 py-2.5 text-[13px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">
                清单
                <select name="todo_list_id" defaultValue={defaultList} className={fieldClass}>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.displayName}
                      {list.isDefault ? "（默认）" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">
                优先级
                <select name="importance" defaultValue="normal" className={fieldClass}>
                  <option value="normal">普通</option>
                  <option value="high">高</option>
                  <option value="low">低</option>
                </select>
              </label>
            </div>

            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-tertiary)]">
              截止时间
              <input name="due_at" type="datetime-local" className={fieldClass} />
            </label>

            {state.status !== "idle" ? (
              <p
                role="status"
                className={`text-[12px] ${
                  state.status === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"
                }`}
              >
                {state.message}
              </p>
            ) : null}

            <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
              <Button disabled={pending} type="submit">
                {pending ? "正在创建…" : "创建任务"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
