"use client";

import { useState, useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CareerTarget } from "@/features/career/next-actions";

const eventName = "career-focus-change";
const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(eventName, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(eventName, notify); };
};
const serverSnapshot = () => null;

export function parseCareerFocus(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string"))].slice(0, 3) : [];
  } catch { return []; }
}

export function useCareerFocus(ownerId: string) {
  const key = `personal-os:career-focus:v1:${ownerId}`;
  const raw = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(key); } catch { return null; } }, serverSnapshot);
  const [temporary, setTemporary] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");
  return {
    ids: temporary ?? parseCareerFocus(raw), message,
    save(ids: string[]) {
      try { localStorage.setItem(key, JSON.stringify(ids)); setTemporary(null); setMessage(""); window.dispatchEvent(new Event(eventName)); }
      catch { setTemporary(ids); setMessage("浏览器无法保存关注选择，本次页面内仍可使用。"); }
    },
  };
}

export function CareerFocusPicker({ targets, focus }: { targets: CareerTarget[]; focus: ReturnType<typeof useCareerFocus> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const validIds = new Set(targets.map(target => target.id));
  const selected = draft.filter(id => validIds.has(id));
  const options = targets.filter(target => [target.title, target.organization_snapshot, target.role_title_snapshot].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  return <div>
    <Dialog open={open} onOpenChange={next => { if (next) { setDraft(focus.ids.filter(id => validIds.has(id))); setQuery(""); } setOpen(next); }}>
      <DialogTrigger asChild><Button variant="outline" size="sm" disabled={!targets.length}>选择关注岗位</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>近期关注岗位</DialogTitle><DialogDescription>最多选择 3 个，仅保存在此浏览器；不更改岗位、申请或准备状态。</DialogDescription></DialogHeader>
        <label className="grid gap-2 text-sm">搜索岗位<input className="ui-field min-h-11 rounded-lg px-3 text-base" value={query} onChange={event => setQuery(event.target.value)} type="search" /></label>
        <div className="max-h-[40dvh] space-y-1 overflow-y-auto overscroll-contain">
          {options.map(target => <label key={target.id} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg p-3 hover:bg-[var(--surface-hover)]"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--accent)]" checked={selected.includes(target.id)} disabled={!selected.includes(target.id) && selected.length >= 3} onChange={event => setDraft(event.target.checked ? [...selected, target.id] : selected.filter(id => id !== target.id))} /><span className="min-w-0 break-words text-sm"><span className="block text-xs text-[var(--text-secondary)]">{target.organization_snapshot}</span>{target.role_title_snapshot || target.title}</span></label>)}
          {!options.length ? <p className="py-4 text-sm text-[var(--text-secondary)]">没有匹配的岗位。</p> : null}
        </div>
        <div className="flex items-center justify-between gap-3"><span className="text-sm tabular-nums">已选 {selected.length}/3</span><div className="flex gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => { focus.save(selected); setOpen(false); }}>保存关注</Button></div></div>
      </DialogContent>
    </Dialog>
    {focus.message ? <p role="status" className="mt-2 max-w-xs text-xs leading-5 text-[var(--text-secondary)]">{focus.message}</p> : null}
  </div>;
}
