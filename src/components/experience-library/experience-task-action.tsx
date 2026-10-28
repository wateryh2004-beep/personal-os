"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getExperienceTaskLists, linkExperienceTask } from "@/features/experience-library/actions";
import { createMicrosoftTodoTaskAction } from "@/features/tasks/microsoft-todo";

type Target = { id: string; name: string; isDefault: boolean };
export function ExperienceTaskAction({ entryId, entryTitle, tasks, unavailable = false }: { entryId: string; entryTitle: string; tasks: { id: string; title: string; status: string }[]; unavailable?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const [lists, setLists] = useState<Target[]>([]), [connected, setConnected] = useState(false);
  const [message, setMessage] = useState(""), [createdId, setCreatedId] = useState<string | null>(null), [unknown, setUnknown] = useState(false), [linked, setLinked] = useState(false);
  async function show() {
    setOpen(true); setLoading(true);
    if (linked) { setCreatedId(null); setLinked(false); setMessage(""); }
    else if (!unknown && !createdId) setMessage("");
    try { const result = await getExperienceTaskLists(); setLists(result.lists); setConnected(result.connected); }
    catch (error) { setMessage(error instanceof Error ? error.message : "任务清单暂时无法读取。"); }
    finally { setLoading(false); }
  }
  async function attach(taskId: string) {
    try { await linkExperienceTask({ entryId, taskId }); setLinked(true); setMessage("任务已创建并关联到这篇经验。"); router.refresh(); }
    catch { setMessage("任务已创建，来源链接已写入任务；资料库中的关联尚未确认，可点击重试关联。"); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || createdId || unknown) return;
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body_text") ?? "").trim();
    const source = new URL(`/experience-library/${entryId}`, window.location.origin).href;
    form.set("body_text", `${body}${body ? "\n\n" : ""}经验来源：${entryTitle}\n${source}`);
    form.set("importance", "normal"); form.set("due_at", "");
    setPending(true); setMessage("");
    try {
      const result = await createMicrosoftTodoTaskAction({ status: "idle", message: "" }, form);
      if (result.status !== "success" || !result.taskId) {
        setUnknown(true); setMessage("创建结果尚未确认，请先到 Microsoft To Do 检查，避免重复创建。");
      } else { setCreatedId(result.taskId); setDirty(false); await attach(result.taskId); }
    } catch { setUnknown(true); setMessage("创建结果尚未确认，请先到 Microsoft To Do 检查，避免重复创建。"); }
    finally { setPending(false); }
  }
  return <section className="experience-personal-note" aria-labelledby="experience-task-title">
    <p className="experience-kicker">从资料到行动</p><h2 id="experience-task-title">关联行动</h2>
    {unavailable ? <p role="status">关联任务暂时无法读取，请稍后刷新。</p> : tasks.length ? <ul>{tasks.map((task) => <li key={task.id}><Link className="ui-link" href={`/tasks?task=${task.id}`}>{task.title}</Link> · {task.status === "completed" ? "已完成" : "未完成"}</li>)}</ul> : <p>把值得尝试的建议变成你自己的任务。</p>}
    <div><Button type="button" variant="outline" disabled={unavailable} onClick={() => void show()}>创建关联任务</Button></div>
    <Dialog open={open} onOpenChange={(next) => { if (!pending && (next || !dirty || window.confirm("行动尚未创建，关闭会丢失输入。确定关闭吗？"))) { setOpen(next); if (!next) setDirty(false); } }}><DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>创建关联任务</DialogTitle><DialogDescription>确认后写入 Microsoft To Do，任务说明会保留这篇经验的链接。</DialogDescription></DialogHeader>
      {loading ? <p role="status">正在读取任务清单…</p> : connected && lists.length ? <form onChange={() => setDirty(true)} onSubmit={(event) => void submit(event)} className="grid gap-3">
        <label className="grid gap-1">任务标题<input className="ui-field" name="title" maxLength={500} required disabled={pending || Boolean(createdId) || unknown} /></label>
        <label className="grid gap-1">我的行动说明<textarea className="ui-field" name="body_text" maxLength={9000} rows={3} disabled={pending || Boolean(createdId) || unknown} /></label>
        <label className="grid gap-1">清单<select className="ui-field" name="todo_list_id" defaultValue={lists.find((item) => item.isDefault)?.id ?? lists[0].id} disabled={pending || Boolean(createdId) || unknown}>{lists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <p>来源：{entryTitle}</p>
        {!createdId && !unknown ? <Button type="submit" disabled={pending}>{pending ? "正在创建…" : "确认创建任务"}</Button> : null}
        {unknown ? <Button type="button" variant="outline" onClick={() => { setUnknown(false); setMessage(""); }}>已检查任务列表，重新尝试</Button> : null}
        {createdId && message.includes("尚未确认") ? <Button type="button" variant="outline" disabled={pending} onClick={() => { setPending(true); void attach(createdId).finally(() => setPending(false)); }}>重试关联</Button> : null}
      </form> : !loading && !message ? <p>尚未连接 Microsoft To Do 或没有可用清单。请先到<Link href="/tasks" className="ui-link">任务</Link>页面连接并同步。</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </DialogContent></Dialog>
  </section>;
}
