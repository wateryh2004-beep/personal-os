"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { archiveInterviewStory } from "@/features/interview/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function StoryArchiveDialog({ storyId, title }: { storyId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const snapshot = new FormData(event.currentTarget);
    inFlight.current = true;
    setFailed(false);
    startTransition(async () => {
      try { await archiveInterviewStory(snapshot); }
      catch (error) { unstable_rethrow(error); setFailed(true); }
      finally { inFlight.current = false; }
    });
  }
  return <Dialog open={open} onOpenChange={next => { if (inFlight.current || pending) return false; setOpen(next); if (next) setFailed(false); }}>
    <DialogTrigger asChild><Button variant="outline">归档故事</Button></DialogTrigger>
    <DialogContent showCloseButton={!pending}>
      <DialogHeader><DialogTitle>归档这段故事？</DialogTitle><DialogDescription>故事会从故事库隐藏，与母题的关联也会一并归档。原故事内容保留。</DialogDescription></DialogHeader>
      <p className="break-words text-base font-medium">{title}</p>
      <form action={archiveInterviewStory} onSubmit={submit} aria-busy={pending}>
        <input type="hidden" name="story_id" value={storyId} />
        <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending} variant="destructive">{pending ? "归档中…" : "确认归档"}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消</Button></div>
      </form>
      {failed ? <p role="alert" className="text-sm leading-6 text-[var(--danger)]">未能确认归档结果。请先返回故事库核对记录，确认状态后再重试。</p> : null}
    </DialogContent>
  </Dialog>;
}
