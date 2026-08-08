"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { GlobalSearchResult } from "@/features/search/types";
export function GlobalCommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [q, setQ] = useState(""); const [results, setResults] = useState<GlobalSearchResult[]>([]); const [loading, setLoading] = useState(false);
  useEffect(() => { if (Array.from(q.trim()).length < 2) return; const controller = new AbortController(); const timer = setTimeout(async () => { setLoading(true); try { const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal }); const body = await response.json(); setResults(body.results ?? []); } catch { if (!controller.signal.aborted) setResults([]); } finally { if (!controller.signal.aborted) setLoading(false); } }, 200); return () => { controller.abort(); clearTimeout(timer); }; }, [q]);
  const enough = Array.from(q.trim()).length >= 2;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[80dvh] overflow-y-auto bg-white p-4 sm:max-w-2xl"><label className="flex items-center gap-2 border-b pb-3"><Search size={17}/><input autoFocus value={q} onChange={event => setQ(event.target.value)} placeholder="搜索整个 Personal OS…" className="w-full bg-transparent text-sm outline-none"/></label>{!q ? <p className="py-8 text-sm text-zinc-500">搜索笔记、复盘、职业、文件、任务和日程</p> : !enough ? <p className="py-8 text-sm text-zinc-500">请输入至少两个字符。</p> : loading ? <p className="py-4 text-xs text-zinc-500">正在搜索…</p> : results.length ? <ul className="divide-y">{results.map(result => <li key={result.id}><Link href={result.href} onClick={() => onOpenChange(false)} className="block py-3 hover:bg-[#f7fafb]"><p className="text-xs text-[#365f78]">{result.domain}</p><p className="mt-1 text-sm font-medium">{result.title}</p>{result.subtitle ? <p className="mt-1 text-xs text-zinc-500">{result.subtitle}</p> : null}{result.snippet ? <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{result.snippet}</p> : null}</Link></li>)}</ul> : <p className="py-8 text-sm text-zinc-500">没有找到相关内容。尝试更短或不同的关键词。</p>}</DialogContent></Dialog>;
}
