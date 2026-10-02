"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
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

export type CreateKind = "task" | "calendar" | "note" | "inbox" | "shopping" | "travel" | "project";
export type CreateRequest = { kind?: CreateKind; title?: string };
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
export function GlobalCreateLayer({ initialRequest, contentOnly = false, onClose }: { initialRequest?: CreateRequest; contentOnly?: boolean; onClose?: () => void }) {
  const formId = useId();
  const submissionInFlight = useRef(false);
  const [listAttempt, setListAttempt] = useState(0);
  const [open, setOpen] = useState(Boolean(initialRequest));
  const [kind, setKind] = useState<CreateKind | null>(initialRequest?.kind ?? null);
  const [prefill, setPrefill] = useState(initialRequest?.title ?? "");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [lists, setLists] = useState<Array<{ id: string; displayName: string; isDefault: boolean }>>([]);
  useEffect(() => {
    if (!initialRequest) return;
    perfMark("quick-create-open", { kind: initialRequest.kind ?? "chooser" });
  }, [initialRequest]);
  useEffect(() => {
    const show = (event: Event) => { const request = (event as CustomEvent<CreateRequest>).detail; const requested = request?.kind; setKind(requested ?? null); setPrefill(request?.title ?? ""); setMessage(""); setOpen(true); perfMark("quick-create-open", { kind: requested ?? "chooser" }); };
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
  }, [kind, listAttempt, open]);
  const close = () => { setOpen(false); setKind(null); setPrefill(""); onClose?.(); };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlight.current) return;
    const form = new FormData(event.currentTarget);
    submissionInFlight.current = true;
    setMessage("");
    perfMark("quick-create-submit", { kind });
    start(async () => {
      try {
        if (kind === "note") await createNote();
        else if (kind === "task") {
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
        unstable_rethrow(error);
        setMessage(error instanceof Error && error.message ? error.message : "保存失败，当前输入仍保留。请检查网络后重试。");
      } finally {
        submissionInFlight.current = false;
      }
    });
  };
  const selected = options.find((option) => option.kind === kind);
  const field = (label: string, control: React.ReactNode, optional = false) => (
    <label className="grid gap-1.5 text-[13px] leading-5 text-[var(--text-secondary)]">
      <span>{label}{optional ? <span className="ml-1 text-[12px] text-[var(--text-tertiary)]">（可选）</span> : null}</span>
      {control}
    </label>
  );
  const content = <DialogContent className="sm:max-w-lg">
    {!kind ? <>
      <DialogHeader><DialogTitle>快速新建</DialogTitle><DialogDescription>先记下来，细节稍后补充。</DialogDescription></DialogHeader>
      <div className="grid gap-1">
        {options.map((option) => {
          const Icon = option.icon;
          return <button key={option.kind} type="button" onClick={() => { setMessage(""); setKind(option.kind); }} className="group flex min-h-15 items-center gap-3 rounded-[var(--radius-lg)] px-3.5 text-left transition-colors ui-transition hover:bg-[var(--surface-hover)] active:bg-[var(--surface-selected)]">
            <span className="flex size-8 shrink-0 items-center justify-center text-[var(--accent)]"><Icon className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0"><span className="block text-sm font-medium text-[var(--text-primary)]">{option.label}</span><span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{option.description}</span></span>
          </button>;
        })}
      </div>
    </> : <form onSubmit={submit} aria-busy={pending} aria-describedby={message ? `${formId}-error` : undefined} className="grid gap-4">
      <DialogHeader><DialogTitle>{selected?.label}</DialogTitle><DialogDescription>{selected?.description}</DialogDescription></DialogHeader>
      <fieldset disabled={pending} className="grid min-w-0 gap-4 disabled:opacity-70">
        <legend className="sr-only">{selected?.label}内容</legend>
        {kind === "task" ? <>
          {field("任务内容", <Input key={`task-${prefill}`} autoFocus name="title" required maxLength={500} defaultValue={prefill} placeholder="写下要做的事" />)}
          {field("清单", <select key={lists.length ? "loaded" : "loading"} name="todo_list_id" required defaultValue={lists.find((list) => list.isDefault)?.id ?? lists[0]?.id ?? ""} className="h-9 rounded-[var(--radius-md)] border bg-[var(--surface-control)] px-3 text-sm"><option value="" disabled>{lists.length ? "选择清单" : message ? "清单暂未读取" : "正在读取清单…"}</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.displayName}</option>)}</select>)}
          {!lists.length && message ? <button type="button" className="min-h-11 justify-self-start text-[13px] text-[var(--accent)]" onClick={() => { setMessage(""); setListAttempt((value) => value + 1); }}>重新读取清单</button> : null}
          {field("截止时间", <Input name="due_at" type="datetime-local" />, true)}
          <input type="hidden" name="body_text" value="" /><input type="hidden" name="importance" value="normal" />
        </> : null}
        {kind === "calendar" ? <>
          {field("日程标题", <Input key={`calendar-${prefill}`} autoFocus name="subject" required maxLength={500} defaultValue={prefill} placeholder="日程名称" />)}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("开始时间", <Input name="starts_at" type="datetime-local" defaultValue={localDateTime()} required />)}
            {field("结束时间", <Input name="ends_at" type="datetime-local" defaultValue={localDateTime(60)} required />)}
          </div>
          <input type="hidden" name="is_all_day" value="false" /><input type="hidden" name="description" value="" />
        </> : null}
        {kind === "note" ? <p className="text-[13px] leading-6 text-[var(--text-secondary)]">创建空白笔记，直接开始编辑。</p> : null}
        {kind === "inbox" ? field("记录内容", <Textarea key={`inbox-${prefill}`} autoFocus name="content" required maxLength={10000} defaultValue={prefill} placeholder="记下这件事，稍后再决定去向" />) : null}
        {kind === "shopping" ? <>
          {field("物品名称", <Input autoFocus name="title" required placeholder="想买什么？" />)}
          {field("价格（元）", <Input name="priceCny" type="number" min="0" step="0.01" inputMode="decimal" />, true)}
          <input type="hidden" name="necessity" value="unknown" />
        </> : null}
        {kind === "travel" ? <>
          {field("目的地或旅行主题", <Input autoFocus name="title" required />)}
          {field("旅行想法", <Textarea name="description" />, true)}
        </> : null}
        {kind === "project" ? <>
          {field("项目名称", <Input autoFocus name="name" required maxLength={180} />)}
          {field("项目说明", <Textarea name="description" />, true)}
          {field("目标日期", <Input name="due_date" type="date" />, true)}
        </> : null}
      </fieldset>
      <div className="min-h-5">
        {message ? <p id={`${formId}-error`} role="alert" className="text-[13px] leading-5 text-[var(--danger)]">{message}</p> : <p role="status" className="text-[12px] text-[var(--text-tertiary)]">{pending ? "正在保存，请稍候…" : ""}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>取消</Button>
        <Button disabled={pending || (kind === "task" && !lists.length)}>{pending ? "正在保存…" : kind === "inbox" ? "记录" : "创建"}</Button>
      </div>
    </form>}
  </DialogContent>;
  return contentOnly ? content : <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>{content}</Dialog>;
}
