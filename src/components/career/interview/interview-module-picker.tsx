"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type InterviewModule = { name: string; count: number };

/** Counts are supplied by the current, authorized scope; opening never changes filters. */
export function InterviewModulePicker({ modules, value, onSelect }: {
  modules: InterviewModule[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => modules.filter(module => module.name.normalize("NFKC").toLocaleLowerCase().includes(query.normalize("NFKC").trim().toLocaleLowerCase())), [modules, query]);
  const choose = (name: string) => { onSelect(name); setOpen(false); };
  return <Dialog open={open} onOpenChange={next => { setOpen(next); if (next) setQuery(""); }}>
    <DialogTrigger asChild><Button variant="outline" size="sm">浏览模块</Button></DialogTrigger>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader><DialogTitle>按模块浏览</DialogTitle><DialogDescription>数量按当前搜索、题型和风格计算；选择模块后保留其他筛选。</DialogDescription></DialogHeader>
      <label className="grid gap-2 text-sm">查找模块<input type="search" value={query} onChange={event => setQuery(event.target.value)} className="ui-field min-h-11 rounded-lg px-3" placeholder="输入模块名称" /></label>
      <button type="button" aria-pressed={value === "all"} onClick={() => choose("all")} className="ui-selectable-row flex min-h-11 items-center justify-between rounded-lg px-3 text-left text-sm" data-selected={value === "all"}>全部模块<span>{modules.reduce((total, module) => total + module.count, 0)} 道</span></button>
      <div className="grid max-h-[45dvh] min-h-20 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2" aria-label="模块目录">
        {visible.map(module => <button key={module.name} type="button" aria-pressed={value === module.name} data-selected={value === module.name} onClick={() => choose(module.name)} className="ui-selectable-row flex min-h-14 items-center justify-between gap-3 rounded-lg border border-[var(--separator)] px-3 py-2 text-left text-sm"><span className="min-w-0 break-words">{module.name}</span><span className="shrink-0 text-xs text-[var(--text-secondary)]">{module.count} 道</span></button>)}
        {!visible.length ? <p className="py-4 text-sm text-[var(--text-secondary)]">没有匹配的模块，试试其他名称。</p> : null}
      </div>
    </DialogContent>
  </Dialog>;
}
