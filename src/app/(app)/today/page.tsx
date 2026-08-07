import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, FolderKanban, Inbox, ListTodo, Plus } from "lucide-react";
import { getTodayWorkspace } from "@/features/today/queries";
import { formatTodayDate } from "@/features/today/utils";

function SectionHeading({ title, href, count }: { title: string; href: string; count?: number }) {
  return <div className="flex items-center justify-between border-b border-[#e7e5e4] pb-3">
    <h2 className="text-base font-semibold tracking-tight text-zinc-900">{title}{typeof count === "number" ? <span className="ml-2 font-mono text-sm font-normal text-zinc-400">{count}</span> : null}</h2>
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-[#365f78] hover:underline">查看全部 <ArrowRight size={14} /></Link>
  </div>;
}

function EmptyState({ children, href, label }: { children: React.ReactNode; href: string; label: string }) {
  return <div className="py-7 text-sm text-zinc-500"><p>{children}</p><Link href={href} className="mt-3 inline-flex items-center gap-1 text-[#365f78] hover:underline"><Plus size={15} />{label}</Link></div>;
}

export default async function Today() {
  const workspace = await getTodayWorkspace();
  const { today, upcoming } = workspace.tasks;
  const visibleTasks = today.length ? today.slice(0, 5) : upcoming.slice(0, 5);

  return <div className="space-y-8">
    <header className="flex flex-col justify-between gap-4 border-b border-[#e7e5e4] pb-5 sm:flex-row sm:items-end">
      <div>
        <p className="text-sm font-medium text-[#365f78]">{formatTodayDate(new Date(), workspace.timezone)}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">今天</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/calendar" className="inline-flex items-center gap-2 rounded-md border border-[#d8d6d0] bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:border-[#365f78] hover:text-[#365f78]">查看日历</Link>
        <Link href="/notes" className="inline-flex items-center gap-2 rounded-md bg-[#365f78] px-3 py-2 text-sm font-medium text-white hover:bg-[#2d5065]"><Plus size={16} />新建笔记</Link>
      </div>
    </header>

    <section className="grid gap-4 sm:grid-cols-3">
      <Link href="/tasks" className="group border border-[#e7e5e4] bg-white p-4 transition-colors hover:border-[#b5c9d2]">
        <div className="flex items-center justify-between text-zinc-500"><ListTodo size={18} /><ArrowRight size={16} className="opacity-0 transition-opacity group-hover:opacity-100" /></div>
        <p className="mt-5 font-mono text-3xl font-medium text-zinc-900">{today.length}</p>
        <p className="mt-1 text-sm text-zinc-600">今天到期任务</p>
      </Link>
      <Link href="/inbox" className="group border border-[#e7e5e4] bg-white p-4 transition-colors hover:border-[#b5c9d2]">
        <div className="flex items-center justify-between text-zinc-500"><Inbox size={18} /><ArrowRight size={16} className="opacity-0 transition-opacity group-hover:opacity-100" /></div>
        <p className="mt-5 font-mono text-3xl font-medium text-zinc-900">{workspace.inboxCount}</p>
        <p className="mt-1 text-sm text-zinc-600">等待处理的 Inbox</p>
      </Link>
      <Link href="/projects" className="group border border-[#e7e5e4] bg-white p-4 transition-colors hover:border-[#b5c9d2]">
        <div className="flex items-center justify-between text-zinc-500"><FolderKanban size={18} /><ArrowRight size={16} className="opacity-0 transition-opacity group-hover:opacity-100" /></div>
        <p className="mt-5 font-mono text-3xl font-medium text-zinc-900">{workspace.projects.length}</p>
        <p className="mt-1 text-sm text-zinc-600">进行中的项目</p>
      </Link>
    </section>

    <section className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]">
      <div>
        <SectionHeading title={today.length ? "今日待办" : "接下来要做"} href="/tasks" count={today.length || undefined} />
        {visibleTasks.length ? <ul className="divide-y divide-[#eceae6]">
          {visibleTasks.map((task) => <li key={task.id}><Link href="/tasks" className="flex items-start gap-3 py-4 hover:bg-white/70">
            <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-zinc-400" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-zinc-900">{task.title || "未命名任务"}</span><span className="mt-1 block text-xs text-zinc-500">{task.due_at ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: workspace.timezone }).format(new Date(task.due_at)) : "未设置截止时间"}</span></span>
            {task.importance === "high" ? <span className="rounded bg-[#edf3f6] px-2 py-0.5 text-xs text-[#365f78]">重要</span> : null}
          </Link></li>)}
        </ul> : <EmptyState href="/tasks" label="创建任务">{workspace.todoAvailable ? "今天还没有待办安排。" : "Microsoft To Do 尚未连接或同步。"}</EmptyState>}
      </div>

      <div>
        <SectionHeading title="最近笔记" href="/notes" />
        {workspace.notes.length ? <ul className="divide-y divide-[#eceae6]">
          {workspace.notes.map((note) => <li key={note.id}><Link href={`/notes/${note.id}`} className="flex items-center gap-3 py-3 hover:bg-white/70"><FileText size={17} className="shrink-0 text-zinc-400" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{note.title || "无标题笔记"}</span><span className="shrink-0 text-xs text-zinc-400">{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: workspace.timezone }).format(new Date(note.updated_at))}</span></Link></li>)}
        </ul> : <EmptyState href="/notes" label="写下第一篇笔记">这里会显示你最近编辑的笔记。</EmptyState>}
      </div>
    </section>

    <section>
      <SectionHeading title="进行中项目" href="/projects" />
      {workspace.projects.length ? <div className="grid divide-y divide-[#eceae6] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {workspace.projects.map((project) => <Link href="/projects" key={project.id} className="py-4 sm:px-4 sm:first:pl-0"><p className="truncate text-sm font-medium text-zinc-900">{project.name}</p><p className="mt-1 text-xs text-zinc-500">{project.due_date ? `截止 ${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: workspace.timezone }).format(new Date(`${project.due_date}T00:00:00`))}` : "未设置截止日期"}</p></Link>)}
      </div> : <EmptyState href="/projects" label="创建项目">项目用于承载需要连续推进的一组任务和笔记。</EmptyState>}
    </section>
  </div>;
}
