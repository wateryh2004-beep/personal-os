"use client";

import {useDraftResumeOpeners} from "@/features/workflow-continuity/draft-resume";
import Link from "next/link";
import { useMemo,useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InterviewModulePicker } from "./interview-module-picker";
import { catalogFilters, catalogUrl, filterQuestionCatalog, type QuestionCatalogRow } from "@/features/interview/question-catalog";
import { emptyLibraryFilters, workspaceDomain, type LibraryFilters } from "@/features/interview/workspace-library";
import { interviewQuestionTypeKeys, questionTypeLabels } from "@/features/interview/constants";
import { presentInterviewPrompt } from "@/features/interview/prompt-presentation";

export function QuestionCatalog({ rows, unavailable, createForm }: { rows: QuestionCatalogRow[]; unavailable: boolean; createForm: ReactNode }) {
  const [createOpen,setCreateOpen]=useState(false);
  useDraftResumeOpeners([{kind:"interview.question-create",id:"new"}],()=>setCreateOpen(true));
  const params = useSearchParams();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const rawParams = params.toString();
  const filters = useMemo(() => catalogFilters(new URLSearchParams(rawParams)), [rawParams]);
  const visible = useMemo(() => filterQuestionCatalog(rows, filters), [rows, filters]);
  const modules = useMemo(() => {
    const counts = new Map<string, number>(rows.map(row => [workspaceDomain(row), 0]));
    for (const row of filterQuestionCatalog(rows, { ...filters, domain: "all" })) counts.set(workspaceDomain(row), (counts.get(workspaceDomain(row)) ?? 0) + 1);
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [rows, filters]);
  // Passing Next internal markers back would skip its useSearchParams update.
  const change = (patch: Partial<LibraryFilters>) => window.history.replaceState(null, "", catalogUrl({ ...filters, ...patch }));
  const filtered = filters.q.trim() || filters.category !== "all" || filters.domain !== "all" || filters.style !== "all";
  return <>
    {unavailable ? <div role="alert" className="mb-5 rounded-lg bg-[var(--surface-control)] p-4 text-sm">部分题目数据加载失败，结果可能不完整。<button type="button" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())} className="ui-link ml-3 min-h-11">{refreshing ? "重新加载中…" : "重新加载"}</button></div> : null}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--text-secondary)]">{rows.length} 道题目<span className="ml-3">阅读与自测请进入<Link href="/career/interview" className="ui-link">学习库</Link></span></p>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogTrigger asChild><Button>新建题目</Button></DialogTrigger><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>新建题目</DialogTitle><DialogDescription>保存后进入题目详情，继续设置分类和准备内容。</DialogDescription></DialogHeader>{createForm}</DialogContent></Dialog>
    </div>
    <section aria-label="题库浏览" className="min-w-0">
      <div className="rounded-[var(--radius-lg)] border border-[var(--separator)] bg-[var(--surface-canvas)] p-4 sm:p-5">
        <label className="grid gap-2 text-sm">搜索题目<input type="search" value={filters.q} onChange={event => change({ q: event.target.value })} placeholder="题目、模块或题型" className="ui-field min-h-11 w-full rounded-lg px-3" /></label>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="col-span-2 grid gap-2 text-sm sm:col-span-1">学习模块<select aria-label="学习模块" value={filters.domain} onChange={event => change({ domain: event.target.value })} className="ui-field min-h-11 w-full min-w-0 rounded-lg px-3"><option value="all">全部模块</option>{filters.domain !== "all" && !modules.some(module => module.name === filters.domain) ? <option value={filters.domain}>{filters.domain}</option> : null}{modules.map(module => <option key={module.name} value={module.name}>{module.name}</option>)}</select></label>
          <label className="grid gap-2 text-sm">问题类型<select value={filters.category} onChange={event => change({ category: event.target.value })} className="ui-field min-h-11 rounded-lg px-3"><option value="all">全部题型</option>{interviewQuestionTypeKeys.map(key => <option key={key} value={key}>{questionTypeLabels[key]}</option>)}</select></label>
          <label className="grid gap-2 text-sm">提问风格<select value={filters.style} onChange={event => change({ style: event.target.value })} className="ui-field min-h-11 rounded-lg px-3"><option value="all">全部风格</option><option value="standard">标准提问</option><option value="stress">压力追问</option></select></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><InterviewModulePicker modules={modules} value={filters.domain} onSelect={domain => change({ domain })} />{filtered ? <button type="button" onClick={() => change(emptyLibraryFilters)} className="ui-link min-h-11 text-sm">清除搜索与筛选</button> : null}</div>
      </div>
      <p role="status" className="py-5 text-sm text-[var(--text-secondary)]">{visible.length} 道结果{filtered ? " · 已筛选" : ""}</p>
      <div className="divide-y divide-[var(--separator)]">
        {visible.map(row => {
          const prompt = presentInterviewPrompt(row.prompt, row.shortTitle);
          return <Link key={row.id} href={`/career/interview/questions/${row.id}`} prefetch={false} className="ui-record-link block min-w-0 rounded-lg px-3 py-4">
            <div className="flex items-start justify-between gap-4"><h2 className="min-w-0 text-base font-medium leading-7 [overflow-wrap:anywhere]">{prompt.title === "面试题" ? prompt.question : prompt.title}</h2></div>
            {prompt.title !== "面试题" && prompt.title !== prompt.question ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{prompt.question}</p> : null}
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]"><span>{workspaceDomain(row)}</span><span>{questionTypeLabels[row.category as keyof typeof questionTypeLabels] ?? row.category}</span>{row.style === "stress" ? <span>压力追问</span> : null}<span>{row.preparationCount ? `${row.preparationCount} 份准备` : "尚无准备内容"}</span></p>
          </Link>;
        })}
      </div>
      {!visible.length ? <div className="py-12 text-sm text-[var(--text-secondary)]"><p>{rows.length ? "没有匹配的题目，可调整关键词或清除筛选。" : unavailable ? "暂时无法读取题目，请重新加载。" : "题库还没有题目，可先新建一道题。"}</p></div> : null}
    </section>
  </>;
}
