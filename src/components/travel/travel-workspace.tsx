"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { announceNavigationIntent, beginNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { createTrip } from "@/features/travel/actions";

type Trip = { id: string; title: string; status: string; destination_label: string | null; description: string | null };
const travelStatus: Record<string,string> = { dream:"灵感", shortlist:"备选", planning:"规划中", booked:"已预订", completed:"已完成", cancelled:"已取消" };

export function TravelWorkspace({ trips, initialCreateOpen }: { trips: Trip[]; initialCreateOpen: boolean }) {
  const router = useRouter();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [open, setOpen] = useState(initialCreateOpen);
  const [pending, start] = useTransition();
  const creating = useRef(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const openCreate = () => { if (creating.current) return; setSavedId(null); setError(""); setOpen(true); };
  const closeCreate = () => { announceNavigationIntent(); setOpen(false); };
  const create = (form: FormData) => {
    if (creating.current || savedId) return;
    creating.current = true;
    const navigationIsCurrent = beginNavigationIntent();
    const scopeIsCurrent = captureWorkspaceScope();
    setError("");
    start(async () => {
      try {
        const id = await createTrip(form);
        if (!scopeIsCurrent() || !mounted.current) return;
        setSavedId(id);
        if (navigationIsCurrent()) router.push(`/travel/${id}`);
      } catch {
        if (scopeIsCurrent() && mounted.current) setError("保存结果尚未确认，输入已保留。请先核对旅行列表。");
      } finally { creating.current = false; }
    });
  };

  return <section className="space-y-6">
    <PageHeader title="旅行" description="记录以后想去的地方，即使现在还没有计划。" action={<Button disabled={pending} onClick={openCreate}>添加旅行灵感</Button>} />
    {trips.length ? <div className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">{trips.map((trip) => <WorkbenchRecord key={trip.id} entity={{kind:"trip",id:trip.id}} title={trip.title} group="travel:created-desc" draggable={false}><Link href={`/travel/${trip.id}`} className="pressable block px-2 py-3.5 hover:bg-[var(--surface-hover)]"><p className="text-[13.5px] font-medium text-[var(--text-primary)]">{trip.title}</p><p className="mt-0.5 text-[12px] font-medium text-[var(--accent)]">{travelStatus[trip.status] ?? trip.status}</p>{trip.description ? <p className="mt-1.5 line-clamp-2 max-w-2xl text-[12px] leading-5 text-[var(--text-secondary)]">{trip.description}</p> : null}</Link></WorkbenchRecord>)}</div> : <div className="border-y border-[var(--separator)] py-10 text-center"><p className="text-[13.5px] font-medium text-[var(--text-primary)]">还没有旅行灵感</p><p className="mt-1 text-[12px] text-[var(--text-secondary)]">从一个以后想去的地方开始记录。</p><Button disabled={pending} size="sm" className="mt-3.5" onClick={openCreate}>添加旅行灵感</Button></div>}
    <Dialog open={open} onOpenChange={next => { if (!next) closeCreate(); }}><DialogContent><DialogHeader><DialogTitle>添加旅行灵感</DialogTitle><DialogDescription>先记录目的地；行程和路线可以以后再规划。</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); create(new FormData(event.currentTarget)); }} className="grid gap-3"><Input name="title" required readOnly={Boolean(savedId)} placeholder="你以后想去哪里？"/><Textarea name="description" readOnly={Boolean(savedId)} placeholder="为什么想去（可选）"/>{error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}<Link href="/travel" className="ui-link ml-2">核对旅行列表</Link></p> : null}{savedId ? <p role="status" className="text-sm">旅行灵感已保存。<Link href={`/travel/${savedId}`} className="ui-link ml-2">打开旅行</Link></p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeCreate}>{savedId ? "关闭" : "取消"}</Button><Button type="submit" disabled={pending || Boolean(savedId) || Boolean(error)}>{pending ? "保存中…" : savedId ? "已保存" : "保存灵感"}</Button></div></form></DialogContent></Dialog>
  </section>;
}
