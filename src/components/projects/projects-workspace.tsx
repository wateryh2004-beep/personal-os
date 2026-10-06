"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { unstable_rethrow, useSearchParams } from "next/navigation";
import { Plus, SquareKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { createProject } from "@/features/projects/actions";

type Project = { id: string; name: string; description: string | null; status: string; due_date: string | null; updated_at: string };
const statusLabel: Record<string,string> = { active:"进行中", completed:"已完成", paused:"已暂停" };

export function ProjectsWorkspace({ projects, initialCreateOpen = false }: { projects: Project[]; initialCreateOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();
  const submissionInFlight = useRef(false);
  const initialCreateIntent = useRef(initialCreateOpen);
  const searchParams = useSearchParams();
  const errorId = useId();

  useEffect(() => {
    const initialIntent = initialCreateIntent.current;
    initialCreateIntent.current = false;
    const url = new URL(window.location.href);
    if (url.searchParams.get("create") !== "1" && !initialIntent) return;
    // Consume the intent before Dialog installs its mobile Back entry. Keep
    // unrelated filters and the current anchor intact. Next preserves its own
    // history internals; passing __NA here would skip its URL subscription.
    if (url.searchParams.get("create") === "1") {
      url.searchParams.delete("create");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setError("");
    setSuccess("");
    setOpen(true);
  }, [searchParams]);

  const changeOpen = (nextOpen: boolean) => {
    if (submissionInFlight.current) return false;
    setError("");
    if (nextOpen) setSuccess("");
    setOpen(nextOpen);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    submissionInFlight.current = true;
    setError("");
    startTransition(async () => {
      try {
        await createProject(data);
        form.reset();
        setOpen(false);
        setSuccess("项目已创建");
      } catch (error) {
        unstable_rethrow(error);
        setError(error instanceof Error && error.message ? error.message : "项目暂时无法创建，当前输入已保留，请重试。");
      } finally {
        submissionInFlight.current = false;
      }
    });
  };
  return (
    <div>
      <PageHeader title="项目" description="聚合真正需要持续推进的长期工作。" action={<Button onClick={() => changeOpen(true)}><Plus aria-hidden="true" />新建项目</Button>} />

      {success ? <p role="status" className="mt-3 text-[12px] text-[var(--success)]">{success}</p> : null}

      {projects.length ? (
        <div className="mt-6 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
          {projects.map((project) => (
            <article key={project.id} className="group grid gap-1.5 px-2 py-3.5 transition-colors ui-transition hover:bg-[var(--surface-hover)] sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-[13.5px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">{project.name}</h2>
                  <span className="shrink-0 rounded-full bg-[var(--surface-control)] px-2 py-0.5 text-[10.5px] text-[var(--text-secondary)]">{statusLabel[project.status] ?? project.status}</span>
                </div>
                <p className={`mt-1 line-clamp-2 text-[12px] leading-5 ${project.description ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}`}>{project.description || "尚未补充项目说明"}</p>
              </div>
              <div className="text-right text-[10.5px] leading-5 text-[var(--text-tertiary)]">
                <p>{project.due_date ? `截止 ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(project.due_date))}` : "持续推进"}</p>
                <p>更新于 {new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(project.updated_at))}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <SquareKanban className="size-6 text-[var(--text-tertiary)]" aria-hidden="true" />
          <h2 className="mt-3 text-[13.5px] font-medium text-[var(--text-primary)]">还没有进行中的项目</h2>
          <p className="mt-1 text-[11.5px] text-[var(--text-secondary)]">只在确实需要持续推进与聚合时创建项目。</p>
          <Button size="sm" className="mt-3.5" onClick={() => changeOpen(true)}>新建项目</Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>新建项目</DialogTitle><DialogDescription>建立项目容器；具体行动继续进入任务。</DialogDescription></DialogHeader>
          <form onSubmit={submit} aria-busy={pending} aria-describedby={error ? errorId : undefined} className="grid gap-3">
            <fieldset disabled={pending} className="grid min-w-0 gap-3 disabled:opacity-70">
              <legend className="sr-only">新建项目内容</legend>
              <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">项目名称<Input name="name" required maxLength={180} autoComplete="off" placeholder="例如：Personal OS 2.0" /></label>
              <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">说明（可选）<Textarea name="description" maxLength={8000} rows={4} autoComplete="off" placeholder="目标、边界和完成标准…" /></label>
              <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">截止日期（可选）<Input name="due_date" type="date" /></label>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => changeOpen(false)}>取消</Button><Button type="submit">{pending ? "正在创建…" : "创建项目"}</Button></div>
            </fieldset>
            {error ? <p id={errorId} role="alert" className="text-[12px] text-[var(--danger)]">{error}</p> : null}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
