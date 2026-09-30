"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { createTrip } from "@/features/travel/actions";

type Trip = { id: string; title: string; status: string; destination_label: string | null; description: string | null };
const travelStatus: Record<string,string> = { idea:"灵感", planning:"规划中", booked:"已预订", completed:"已完成", cancelled:"已取消" };

export function TravelWorkspace({ trips, initialCreateOpen }: { trips: Trip[]; initialCreateOpen: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(initialCreateOpen);
  const [pending, start] = useTransition();
  const create = (form: FormData) => start(async () => {
    const id = await createTrip(form);
    router.push(`/travel/${id}`);
  });

  return <section className="space-y-5.5">
    <PageHeader title="旅行" description="记录以后想去的地方，即使现在还没有计划。" action={<Button onClick={() => setOpen(true)}>添加旅行灵感</Button>} />
    {trips.length ? <div className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">{trips.map((trip) => <Link key={trip.id} href={`/travel/${trip.id}`} className="pressable block px-2 py-3 hover:bg-[var(--surface-hover)]"><p className="text-[13.25px] font-medium text-[var(--text-primary)]">{trip.title}</p><p className="mt-[2px] text-[10px] font-medium text-[var(--accent)]">{travelStatus[trip.status] ?? trip.status}</p>{trip.description ? <p className="mt-1 line-clamp-2 max-w-2xl text-[12px] leading-5 text-[var(--text-secondary)]">{trip.description}</p> : null}</Link>)}</div> : <div className="border-y border-[var(--separator)] py-9 text-center"><p className="text-[13.5px] font-medium text-[var(--text-primary)]">还没有旅行灵感</p><p className="mt-1 text-[11.5px] text-[var(--text-secondary)]">从一个以后想去的地方开始记录。</p><Button size="sm" className="mt-3" onClick={() => setOpen(true)}>添加旅行灵感</Button></div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>添加旅行灵感</DialogTitle><DialogDescription>先记录目的地；行程和路线可以以后再规划。</DialogDescription></DialogHeader><form action={create} className="grid gap-3"><Input name="title" required placeholder="你以后想去哪里？"/><Textarea name="description" placeholder="为什么想去（可选）"/><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button disabled={pending}>{pending ? "保存中…" : "保存灵感"}</Button></div></form></DialogContent></Dialog>
  </section>;
}
