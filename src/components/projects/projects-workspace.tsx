"use client";

import { useState } from "react";
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
  const [open, setOpen] = useState(initialCreateOpen);
  return (
    <div>
      <PageHeader title="项目" description="聚合真正需要持续推进的长期工作。" action={<Button onClick={() => setOpen(true)}><Plus aria-hidden="true" />新建项目</Button>} />

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
          <Button size="sm" className="mt-3.5" onClick={() => setOpen(true)}>新建项目</Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>新建项目</DialogTitle><DialogDescription>建立项目容器；具体行动继续进入任务。</DialogDescription></DialogHeader>
          <form action={createProject} className="grid gap-3">
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">项目名称<Input name="name" required maxLength={180} autoComplete="off" placeholder="例如：Personal OS 2.0" /></label>
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">说明（可选）<Textarea name="description" maxLength={8000} rows={4} autoComplete="off" placeholder="目标、边界和完成标准…" /></label>
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">截止日期（可选）<Input name="due_date" type="date" /></label>
            <div className="flex justify-end"><Button>创建项目</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
