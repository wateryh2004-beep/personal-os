"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { unstable_rethrow, useSearchParams } from "next/navigation";
import { Plus, SquareKanban } from "lucide-react";
import { useDialogReturnFocus } from "@/components/shared/use-dialog-return-focus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { OperationLinkTarget } from "@/components/workbench/operation-links";
import { createProject } from "@/features/projects/actions";
import { ProjectProgress, type ProjectPresentation } from "./project-progress";
import styles from "./projects-workspace.module.css";

type Project = ProjectPresentation;
type StatusFilter = "all" | "active" | "completed" | "paused" | "other";
const statusGroup = (status: string): Exclude<StatusFilter, "all"> => status === "active" || status === "completed" ? status : status === "paused" || status === "on_hold" ? "paused" : "other";

export function ProjectsWorkspace({ projects, initialCreateOpen = false }: { projects: Project[]; initialCreateOpen?: boolean }) {
  const { rememberTrigger, restoreFocus } = useDialogReturnFocus();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();
  const submissionInFlight = useRef(false);
  const initialCreateIntent = useRef(initialCreateOpen);
  const searchParams = useSearchParams();
  const errorId = useId();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const visibleProjects = statusFilter === "all" ? projects : projects.filter(project => statusGroup(project.status) === statusFilter);
  const counts = projects.reduce((value, project) => { value[statusGroup(project.status)] += 1; return value; }, { active: 0, completed: 0, paused: 0, other: 0 });

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
    <div className={styles.workspace}>
      <PageHeader title="项目" action={<Button onClick={(event) => { rememberTrigger(event.currentTarget); changeOpen(true); }}><Plus aria-hidden="true" />新建项目</Button>} />

      {success ? <p role="status" className="mt-3 text-[12px] text-[var(--success)]">{success}</p> : null}

      {projects.length ? (
        <>
          <div className={styles.overview}><strong>{counts.active}</strong><p>个项目正在推进{counts.completed ? `，${counts.completed} 个已完成` : ""}</p></div>
          <div className={styles.filters} role="group" aria-label="按项目状态筛选">{([
            ["all", "全部", projects.length], ["active", "进行中", counts.active], ["paused", "已暂停", counts.paused], ["completed", "已完成", counts.completed], ...(counts.other ? [["other", "其他状态", counts.other] as const] : []),
          ] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label}<span>{count}</span></button>)}</div>
          <div className={styles.grid}>{visibleProjects.map((project) => <div key={project.id}><WorkbenchRecord entity={{kind:"project",id:project.id}} title={project.name} group="projects"><OperationLinkTarget target={{type:"project",id:project.id}} title={project.name}><ProjectProgress project={project} /></OperationLinkTarget></WorkbenchRecord></div>)}</div>
          {!visibleProjects.length ? <p className={styles.emptyFilter} aria-live="polite">此状态下没有项目</p> : null}
        </>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <SquareKanban className="size-6 text-[var(--text-tertiary)]" aria-hidden="true" />
          <h2 className="mt-3 text-[13.5px] font-medium text-[var(--text-primary)]">还没有进行中的项目</h2>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">只在确实需要持续推进与聚合时创建项目。</p>
          <Button size="sm" className="mt-3.5" onClick={(event) => { rememberTrigger(event.currentTarget); changeOpen(true); }}>新建项目</Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent onCloseAutoFocus={restoreFocus} className="sm:max-w-lg">
          <DialogHeader><DialogTitle>新建项目</DialogTitle><DialogDescription>建立项目容器；具体行动继续进入任务。</DialogDescription></DialogHeader>
          <form onSubmit={submit} aria-busy={pending} aria-describedby={error ? errorId : undefined} className="grid gap-3">
            <fieldset disabled={pending} className="grid min-w-0 gap-3 disabled:opacity-70">
              <legend className="sr-only">新建项目内容</legend>
              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">项目名称<Input name="name" required maxLength={180} autoComplete="off" placeholder="例如：Personal OS 2.0" /></label>
              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">说明（可选）<Textarea name="description" maxLength={8000} rows={4} autoComplete="off" placeholder="目标、边界和完成标准…" /></label>
              <label className="grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]">截止日期（可选）<Input name="due_date" type="date" /></label>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => changeOpen(false)}>取消</Button><Button type="submit">{pending ? "正在创建…" : "创建项目"}</Button></div>
            </fieldset>
            {error ? <p id={errorId} role="alert" className="text-[12px] text-[var(--danger)]">{error}</p> : null}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
