"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { beginNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { useDeclaredFormDraft, readDeclaredDraftFields } from "@/features/workflow-continuity/draft-adapters";
import { useDraftResumeOpeners } from "@/features/workflow-continuity/draft-resume";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";
import {OrdinaryOutcomeRecovery} from "@/components/workflow-continuity/ordinary-outcome-recovery";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createInterviewStoryWithReceipt, updateInterviewStory } from "@/features/interview/actions";
import { storyStatusLabels } from "@/features/interview/constants";
import { storySections, type EditableStory, type StoryExperience } from "@/features/interview/story-library";

const fieldClass = "ui-field min-h-11 w-full min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-control)] px-3 py-2 text-base leading-7 text-[var(--text-primary)]";

export function StoryFormDialog({ story, experiences }: { story?: EditableStory; experiences: StoryExperience[] }) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const router=useRouter();
  const {formRef,...recovery}=useDeclaredFormDraft({operation:story?"career.story-edit":"career.story-create",id:story?.id??"new",href:"/career/interview/stories",label:story?"编辑故事":"新建故事"});
  useDraftResumeOpeners([recovery.target],()=>{setDiscarding(false);setOpen(true);});
  const discardRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const editing = Boolean(story);
  const action = editing ? updateInterviewStory : createInterviewStoryWithReceipt;
  const label = editing ? "编辑故事" : "新建故事";

  useEffect(() => {
    if (!open || (!dirty && !pending)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty, pending]);
  useEffect(() => { if (discarding) discardRef.current?.focus(); }, [discarding]);
  useEffect(() => { if (failed) errorRef.current?.focus(); }, [failed]);

  function resume() {
    setDiscarding(false);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[name="title"]')?.focus());
  }
  function changeOpen(next: boolean) {
    if (inFlight.current || pending) return false;
    if (!next && discarding) { resume(); return false; }
    if (!next && dirty) { setDiscarding(true); return false; }
    setOpen(next);
    if (next) { setFailed(false); setSaved(false); setDirty(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recovery.isCurrent()||inFlight.current||recovery.uncertain) return;
    const snapshot = new FormData(event.currentTarget);
    const submitted=recovery.capture(event),current=recovery.captureGuard(),navigationCurrent=beginNavigationIntent();
    inFlight.current = true;
    setFailed(false);
    startTransition(async () => {
      try {
        const receipt=await action(snapshot);
        if(!current())return;
        const unchanged=JSON.stringify(readDeclaredDraftFields(formRef.current!,editing?"career.story-edit":"career.story-create"))===JSON.stringify(submitted);
        recovery.complete(submitted);
        setDirty(!unchanged);setSaved(unchanged);
        if(unchanged){setOpen(false);if(receipt&&navigationCurrent())router.push(receipt.href);}
      } catch (error) {
        unstable_rethrow(error);
        if(current()){recovery.markUncertain();setFailed(true);}
      } finally { inFlight.current = false; }
    });
  }
  const missingExperience = story?.experience_id && !experiences.some(item => item.id === story.experience_id);

  return <div>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button variant={editing ? "outline" : "default"}>{label}</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" showCloseButton={!pending}>
        <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{editing ? "修改故事原文与使用状态，保存后更新阅读内容。" : "先记录标题和概括，创建后继续补充具体过程。"}</DialogDescription></DialogHeader>
        {discarding ? <div ref={discardRef} tabIndex={-1} role="alert" className="space-y-4 outline-none">
          <p className="text-base font-medium">放弃尚未保存的修改？</p>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">继续编辑会保留当前输入；放弃后不会保存这些修改。</p>
          <div className="flex flex-wrap gap-3"><Button onClick={resume}>继续编辑</Button><Button variant="outline" onClick={() => { recovery.clear(); setDirty(false); setDiscarding(false); setOpen(false); }}>放弃修改</Button></div>
        </div> : null}
        <div hidden={discarding}>
          <form ref={formRef} {...recovery.attributes} onInputCapture={recovery.capture} onChangeCapture={recovery.capture} onSubmit={submit} onChange={() => setDirty(true)} aria-busy={pending}>
            <fieldset className="min-w-0 space-y-5">
              {story ? <input type="hidden" name="story_id" value={story.id} /> : null}
              <div className={editing ? "grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]" : "grid min-w-0 gap-4"}>
                <label className="grid min-w-0 gap-2 text-sm font-medium">故事标题<input name="title" required maxLength={180} defaultValue={story?.title ?? ""} className={fieldClass} /></label>
                {editing ? <label className="grid min-w-0 gap-2 text-sm font-medium">使用状态<select aria-label="使用状态" name="status" defaultValue={story?.status} className={fieldClass}>
                  {story && !storyStatusLabels[story.status] ? <option value={story.status}>当前状态：{story.status}</option> : null}
                  {Object.entries(storyStatusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                </select></label> : <input type="hidden" name="status" value="draft" />}
              </div>
              <label className="grid min-w-0 gap-2 text-sm font-medium">关联经历<select aria-label="关联经历" name="experience_id" defaultValue={story?.experience_id ?? ""} className={fieldClass}>
                <option value="">不绑定经历</option>
                {missingExperience ? <option value={story.experience_id ?? ""}>原关联经历（已归档或不可用）</option> : null}
                {experiences.map(item => <option key={item.id} value={item.id}>{item.organization}{item.role ? ` · ${item.role}` : ""}</option>)}
              </select></label>
              <label className="grid gap-2 text-sm font-medium">一句话概括<textarea name="one_line" maxLength={800} defaultValue={story?.one_line ?? ""} rows={2} className={fieldClass} placeholder="这段具体经历说明了什么？" /></label>
              {storySections.map(section => editing ? <label key={section.name} className="grid gap-2 text-sm font-medium">{section.label}<textarea name={section.name} maxLength={section.max} defaultValue={story?.[section.name] ?? ""} rows={section.rows} className={fieldClass} placeholder={section.hint} /></label> : <input key={section.name} type="hidden" name={section.name} value="" />)}
              <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "保存中…" : editing ? "保存故事" : "创建并补充故事"}</Button><Button type="button" disabled={pending} variant="outline" onClick={() => changeOpen(false)}>取消</Button></div>
            </fieldset>
            <DraftRecoveryStatus dirty={recovery.dirty} restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable}/>
            {recovery.uncertain?<OrdinaryOutcomeRecovery key={recovery.key} uncertain target={recovery.target} href="/career/interview/stories" captureGuard={recovery.captureGuard} onCompared={recovery.adoptComparedBaseline}/>:null}
            {failed ? <div ref={errorRef} role="alert" tabIndex={-1} className="mt-4 text-sm leading-6 text-[var(--danger)] outline-none">
              <p>未能确认保存结果，输入已保留。请先核对故事记录，再重试，避免重复创建或覆盖。</p>
              <a href={story ? `/career/interview/stories/${story.id}` : "/career/interview/stories"} target="_blank" rel="noopener noreferrer" className="ui-link inline-flex min-h-11 items-center">在新标签页核对记录</a>
            </div> : null}
          </form>
        </div>
      </DialogContent>
    </Dialog>
    {saved ? <p role="status" className="mt-2 text-sm text-[var(--text-secondary)]">故事已保存</p> : null}
  </div>;
}
