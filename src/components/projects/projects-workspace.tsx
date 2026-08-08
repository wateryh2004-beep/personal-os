"use client";

import { useState } from "react";
import { Plus, SquareKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { createProject } from "@/features/projects/actions";

type Project = { id: string; name: string; description: string | null; status: string; due_date: string | null; updated_at: string };

export function ProjectsWorkspace({ projects, initialCreateOpen = false }: { projects: Project[]; initialCreateOpen?: boolean }) {
  const [open, setOpen] = useState(initialCreateOpen);
  return <div><PageHeader title="Projects" description="聚合正在推进的长期工作；任务执行仍以 Microsoft To Do 为准。" action={<Button onClick={() => setOpen(true)}><Plus aria-hidden="true" />新建项目</Button>} />
    {projects.length ? <div className="mt-7 divide-y border-y">{projects.map((project) => <article key={project.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><h2 className="truncate text-sm font-medium">{project.name}</h2>{project.description ? <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{project.description}</p> : null}</div><div className="text-xs text-[var(--text-tertiary)]">{project.due_date ? `截止 ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(project.due_date))}` : "持续推进"}</div></article>)}</div> : <div className="flex min-h-72 flex-col items-center justify-center text-center"><SquareKanban className="size-7 text-[var(--accent)]" aria-hidden="true" /><h2 className="mt-3 text-sm font-medium">还没有进行中的项目</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">只在确实需要持续推进与聚合时创建项目。</p><Button className="mt-4" onClick={() => setOpen(true)}>新建项目</Button></div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>新建项目</DialogTitle><DialogDescription>创建真实项目容器；具体行动继续进入 Tasks。</DialogDescription></DialogHeader><form action={createProject} className="grid gap-4"><label className="grid gap-1.5 text-sm">项目名称<input name="name" required maxLength={180} autoComplete="off" placeholder="例如：Personal OS 2.0…" className="h-9 rounded-[var(--radius-md)] border bg-white px-3" /></label><label className="grid gap-1.5 text-sm">说明（可选）<textarea name="description" maxLength={8000} rows={4} autoComplete="off" placeholder="目标、边界和完成标准…" className="rounded-[var(--radius-md)] border bg-white px-3 py-2" /></label><label className="grid gap-1.5 text-sm">截止日期（可选）<input name="due_date" type="date" className="h-9 rounded-[var(--radius-md)] border bg-white px-3" /></label><div className="flex justify-end"><Button>创建项目</Button></div></form></DialogContent></Dialog>
  </div>;
}
