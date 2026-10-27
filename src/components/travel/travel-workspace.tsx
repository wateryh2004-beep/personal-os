"use client";

import { useRef,useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { announceNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import {IntentDraftForm} from "@/components/workflow-continuity/intent-draft-form";
import {submitTravelCreationIntent,readTravelCreationIntent} from "@/features/travel/create-intents";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import {useDraftResumeOpeners} from "@/features/workflow-continuity/draft-resume";

type Trip = { id: string; title: string; status: string; destination_label: string | null; description: string | null };
const travelStatus: Record<string,string> = { dream:"灵感", shortlist:"备选", planning:"规划中", booked:"已预订", completed:"已完成", cancelled:"已取消" };

export type TravelCreationTransport={submit:typeof submitTravelCreationIntent;read:typeof readTravelCreationIntent};
export function TravelWorkspace({ trips, initialCreateOpen,creationTransport }: {creationTransport?:TravelCreationTransport; trips: Trip[]; initialCreateOpen: boolean }) {
  assertContinuousFixtureTransport(creationTransport);
  const router = useRouter();
  const [open,setOpen]=useState(initialCreateOpen),[pending,setPending]=useState(false),[confirmed,setConfirmed]=useState(false),[notice,setNotice]=useState("");const busy=useRef(false);
  const openCreate=()=>{if(busy.current)return;setConfirmed(false);setNotice("");setOpen(true);},closeCreate=()=>{if(busy.current)return false;announceNavigationIntent();setOpen(false);};
  useDraftResumeOpeners([{kind:"travel.create",id:"new"}],()=>setOpen(true));

  return <section className="space-y-6">
    <PageHeader title="旅行" description="记录以后想去的地方，即使现在还没有计划。" action={<Button onClick={openCreate}>添加旅行灵感</Button>} />
    {trips.length ? <div className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">{trips.map((trip) => <WorkbenchRecord key={trip.id} entity={{kind:"trip",id:trip.id}} title={trip.title} group="travel:created-desc" draggable={false}><Link href={`/travel/${trip.id}`} className="pressable block px-2 py-3.5 hover:bg-[var(--surface-hover)]"><p className="text-[13.5px] font-medium text-[var(--text-primary)]">{trip.title}</p><p className="mt-0.5 text-[12px] font-medium text-[var(--accent)]">{travelStatus[trip.status] ?? trip.status}</p>{trip.description ? <p className="mt-1.5 line-clamp-2 max-w-2xl text-[12px] leading-5 text-[var(--text-secondary)]">{trip.description}</p> : null}</Link></WorkbenchRecord>)}</div> : <div className="border-y border-[var(--separator)] py-10 text-center"><p className="text-[13.5px] font-medium text-[var(--text-primary)]">还没有旅行灵感</p><p className="mt-1 text-[12px] text-[var(--text-secondary)]">从一个以后想去的地方开始记录。</p><Button size="sm" className="mt-3.5" onClick={openCreate}>添加旅行灵感</Button></div>}
    <Dialog open={open} onOpenChange={next => { if (!next) closeCreate(); }}><DialogContent><DialogHeader><DialogTitle>添加旅行灵感</DialogTitle><DialogDescription>先记录目的地；行程和路线可以以后再规划。</DialogDescription></DialogHeader><IntentDraftForm resetOnSaved={false} onFieldsChange={()=>{setConfirmed(false);setNotice("");}} onPendingChange={value=>{busy.current=value;setPending(value);}} draft={{operation:"travel.create",id:"new",href:"/travel",label:"旅行灵感"}} submit={(intentId,fields)=> (creationTransport?.submit??submitTravelCreationIntent)({kind:"trip",intentId,title:String(fields.title??""),description:String(fields.description??"")})} read={(intentId,fields)=> (creationTransport?.read??readTravelCreationIntent)({kind:"trip",intentId,title:String(fields.title??""),description:String(fields.description??"")})} onSaved={(id,unchanged,current)=>{setConfirmed(unchanged);setNotice(unchanged?"旅行灵感已保存":"原旅行灵感已保存，当前新输入尚未保存。");if(unchanged&&current)router.push(`/travel/${id}`);}} className="grid gap-3"><Input name="title" required maxLength={500} placeholder="你以后想去哪里？"/><Textarea name="description" maxLength={20000} placeholder="为什么想去（可选）"/><div className="flex justify-end gap-2"><Button disabled={pending} type="button" variant="outline" onClick={closeCreate}>稍后继续</Button><Button disabled={pending||confirmed} type="submit">保存或核对</Button></div></IntentDraftForm>{notice?<p role="status">{notice}</p>:null}</DialogContent></Dialog>
  </section>;
}
