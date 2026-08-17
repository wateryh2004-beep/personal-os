"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarPlus, CheckSquare2, FilePlus2, Inbox, Plane, ShoppingBag, SquareKanban } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createNote } from "@/features/notes/actions";
import { createMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";
import { createCalendarEvent } from "@/features/calendar/actions";
import { createPurchaseItem } from "@/features/shopping/actions";
import { createTrip } from "@/features/travel/actions";
import { createProject } from "@/features/projects/actions";
import { captureInboxItem } from "@/features/inbox/actions";
import { perfMark, perfMeasure } from "@/lib/perf";

type CreateKind = "task" | "calendar" | "note" | "inbox" | "shopping" | "travel" | "project";
const options: Array<{ kind: CreateKind; label: string; description: string; icon: typeof CheckSquare2 }> = [
  { kind: "task", label: "新建任务", description: "先写下来，细节稍后补充", icon: CheckSquare2 },
  { kind: "calendar", label: "新建日程", description: "标题、时间即可开始", icon: CalendarPlus },
  { kind: "note", label: "新建笔记", description: "直接进入编辑器", icon: FilePlus2 },
  { kind: "inbox", label: "记录到 Inbox", description: "稍后再决定去向", icon: Inbox },
  { kind: "shopping", label: "加入待购", description: "先捕捉想法，再做判断", icon: ShoppingBag },
  { kind: "travel", label: "添加旅行灵感", description: "记录目的地和一行想法", icon: Plane },
  { kind: "project", label: "新建项目", description: "给正在推进的事一个起点", icon: SquareKanban },
];

function localDateTime(offsetMinutes = 0) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

/** A thin, global capture surface. It deliberately keeps only primary fields. */
export function GlobalCreateLayer() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CreateKind | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [lists, setLists] = useState<Array<{ id: string; displayName: string; isDefault: boolean }>>([]);
  useEffect(() => {
    const show = (event: Event) => { const requested = (event as CustomEvent<{ kind?: CreateKind }>).detail?.kind; setKind(requested ?? null); setMessage(""); setOpen(true); perfMark("quick-create-open", { kind: requested ?? "chooser" }); };
    window.addEventListener("personal-os:create-open", show);
    return () => window.removeEventListener("personal-os:create-open", show);
  }, []);
  useEffect(() => {
    if (!open || kind !== "task") return;
    const controller = new AbortController();
    void fetch("/api/tasks/lists", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const body = await response.json() as { lists?: Array<{ id: string; displayName: string; isDefault: boolean }> };
      setLists(body.lists ?? []);
    }).catch(() => { if (!controller.signal.aborted) setMessage("无法读取任务清单，请稍后重试。"); });
    return () => controller.abort();
  }, [kind, open]);
  const close = () => { setOpen(false); setKind(null); };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (kind === "note") { start(() => createNote()); return; }
    setMessage("");
    perfMark("quick-create-submit", { kind });
    start(async () => {
      try {
        if (kind === "task") {
          const result = await createMicrosoftTodoTaskAction({ status: "idle", message: "" }, form);
          if (result.status !== "success") throw new Error(result.message);
        } else if (kind === "calendar") {
          const startsAt = String(form.get("starts_at") || "");
          const endsAt = String(form.get("ends_at") || "");
          // datetime-local intentionally has no offset; normalize it before
          // handing the server action its strict ISO-with-offset contract.
          form.set("starts_at", new Date(startsAt).toISOString());
          form.set("ends_at", new Date(endsAt).toISOString());
          const result = await createCalendarEvent({ status: "idle", message: "" }, form);
          if (result.status !== "success") throw new Error(result.message);
        } else if (kind === "inbox") {
          const result = await captureInboxItem({ status: "idle", message: "" }, form);
          if (result.status !== "success") throw new Error(result.message);
        } else if (kind === "shopping") await createPurchaseItem(form);
        else if (kind === "travel") await createTrip(form);
        else if (kind === "project") await createProject(form);
        perfMeasure("quick-create-confirmed", "quick-create-submit", { kind });
        close();
      } catch (error) {
        setMessage(error instanceof Error && error.message ? error.message : "保存失败，当前输入仍保留。请检查网络后重试。");
      }
    });
  };
  const selected = options.find((option) => option.kind === kind);
  return <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
    <DialogContent className="sm:max-w-lg">
      {!kind ? <><DialogHeader><DialogTitle>快速新建</DialogTitle><DialogDescription>先捕捉，再整理；只显示完成当前动作所需的字段。</DialogDescription></DialogHeader><div className="grid gap-1.5">{options.map((option) => { const Icon = option.icon; return <button key={option.kind} type="button" onClick={() => setKind(option.kind)} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] px-3 text-left hover:bg-[var(--surface-hover)]"><Icon className="size-4 text-[var(--accent)]" /><span><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-[var(--text-tertiary)]">{option.description}</span></span></button>; })}</div></> : <form onSubmit={submit} className="grid gap-4"><DialogHeader><DialogTitle>{selected?.label}</DialogTitle><DialogDescription>{selected?.description}</DialogDescription></DialogHeader>{kind === "task" ? <><Input autoFocus name="title" required maxLength={500} placeholder="任务内容" /><label className="grid gap-1 text-xs text-[var(--text-secondary)]">清单<select name="todo_list_id" required defaultValue={lists.find((list) => list.isDefault)?.id ?? lists[0]?.id ?? ""} className="h-9 rounded-[var(--radius-md)] border bg-transparent px-2.5 text-sm"><option value="" disabled>{lists.length ? "选择清单" : "正在读取清单…"}</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.displayName}</option>)}</select></label><Input name="due_at" type="datetime-local" aria-label="截止时间（可选）" /><input type="hidden" name="body_text" value="" /><input type="hidden" name="importance" value="normal" /></> : null}{kind === "calendar" ? <><Input autoFocus name="subject" required maxLength={500} placeholder="日程标题" /><div className="grid grid-cols-2 gap-3"><Input name="starts_at" type="datetime-local" defaultValue={localDateTime()} required /><Input name="ends_at" type="datetime-local" defaultValue={localDateTime(60)} required /></div><input type="hidden" name="is_all_day" value="false" /><input type="hidden" name="description" value="" /></> : null}{kind === "note" ? <p className="text-sm text-[var(--text-secondary)]">将创建一篇空白笔记，并直接打开编辑器。</p> : null}{kind === "inbox" ? <Textarea autoFocus name="content" required maxLength={10000} placeholder="记下这件事，稍后再决定去向…" /> : null}{kind === "shopping" ? <><Input autoFocus name="title" required placeholder="想买什么？" /><Input name="priceCny" type="number" min="0" step="0.01" placeholder="价格（元，可选）" /><input type="hidden" name="necessity" value="unknown" /></> : null}{kind === "travel" ? <><Input autoFocus name="title" required placeholder="目的地或旅行主题" /><Textarea name="description" placeholder="一行想法（可选）" /></> : null}{kind === "project" ? <><Input autoFocus name="name" required maxLength={180} placeholder="项目名称" /><Textarea name="description" placeholder="项目说明（可选）" /><Input name="due_date" type="date" /></> : null}{message ? <p role="alert" className="text-sm text-[var(--danger)]">{message}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>取消</Button><Button disabled={pending || (kind === "task" && !lists.length)}>{pending ? "正在保存…" : kind === "inbox" ? "记录" : "创建"}</Button></div></form>}
    </DialogContent>
  </Dialog>;
}
