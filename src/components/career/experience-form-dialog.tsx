"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { submitCareerForm } from "@/features/career/form-actions";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import { CareerForm } from "./career-form";
import {readDeclaredDraftFields,declaredDraftFieldsFromData} from "@/features/workflow-continuity/draft-adapters";
import type { DeclaredDraftConfig } from "@/features/workflow-continuity/draft-contracts";
import { focusDraftForm, useDraftResumeConsumer } from "@/features/workflow-continuity/draft-resume";

type Operation = Parameters<typeof submitCareerForm>[0];
export const experienceFormClass = "grid min-w-0 gap-5 sm:grid-cols-2 [&_input]:min-w-0 [&_input]:text-base [&_select]:min-w-0 [&_select]:text-base [&_textarea]:text-base [&_textarea]:leading-7";

/** Keeps CareerForm validation and original actions inside a dismiss-safe task. */
export function ExperienceFormDialog({ operation, title, description, submitLabel, children, initialOpen = false, primary = false, successTargetId, recoveryHref = "/career/experiences", draft, actionTransport }: {
  operation: Operation; title: string; description: string; submitLabel: string; children?: ReactNode;
  initialOpen?: boolean; primary?: boolean; successTargetId?: string; recoveryHref?: string;
  draft?: DeclaredDraftConfig; actionTransport?:typeof submitCareerForm;
}) {
  assertContinuousFixtureTransport(actionTransport);
  const [open, setOpen] = useState(initialOpen);
  const [dirty, setDirty] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const discardDraftRef = useRef<(() => void) | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const archive = operation === "archiveExperience";
  useDraftResumeConsumer({ kind: draft?.operation ?? "career.experience-create", identity: { id: draft?.id ?? "new", parentId: draft?.parentId }, ready: () => Boolean(draft && !busy.current), open: async (target, context) => { setDiscarding(false); setOpen(true); return focusDraftForm(target, context); } });

  useEffect(() => {
    if (!open || (!dirty && !pending)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty, pending]);
  useEffect(() => { if (discarding) discardRef.current?.focus(); }, [discarding]);
  function resume() {
    setDiscarding(false);
    requestAnimationFrame(() => contentRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]),textarea,select')?.focus());
  }
  function changeOpen(next: boolean) {
    if (busy.current) return false;
    if (!next && discarding) { resume(); return false; }
    if (!next && dirty) { setDiscarding(true); return false; }
    setOpen(next);
    if (next) { setDirty(false); setFailed(false); setSaved(false); }
  }
  return <div>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild><Button variant={primary ? "default" : "outline"}>{title}</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" showCloseButton={!pending}>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {discarding ? <div ref={discardRef} tabIndex={-1} role="alert" className="space-y-4 outline-none"><p className="font-medium">放弃尚未保存的修改？</p><p className="text-sm leading-6 text-[var(--text-secondary)]">继续编辑会保留当前输入；放弃后不会保存。</p><div className="flex flex-wrap gap-3"><Button onClick={resume}>继续编辑</Button><Button variant="outline" onClick={() => { discardDraftRef.current?.(); setDirty(false); setDiscarding(false); setOpen(false); }}>放弃修改</Button></div></div> : null}
        <div ref={contentRef} hidden={discarding} onChangeCapture={() => setDirty(true)}>
          <CareerForm draft={draft} discardDraftRef={discardDraftRef} className={experienceFormClass} successTargetId={successTargetId} action={async formData => {
            busy.current = true; setPending(true); setFailed(false);
            try {
              const result = await (actionTransport??submitCareerForm)(operation, formData);
              setFailed(result.status === "error");
              return result;
            } catch (error) {
              unstable_rethrow(error);
              setFailed(true);
              return { status: "error",needsCheck:true, message: "未能确认操作结果，输入已保留。请先核对原记录。" };
            } finally { busy.current = false; setPending(false); }
          }} onSuccess={submitted => {const node=contentRef.current?.querySelector("form");const unchanged=!draft||!node||JSON.stringify(readDeclaredDraftFields(node,draft.operation))===JSON.stringify(declaredDraftFieldsFromData(submitted,draft.operation));setDirty(!unchanged);if(unchanged)setOpen(false);setSaved(unchanged);}}>
            {children}
            <div className="flex flex-wrap gap-3 sm:col-span-2"><Button type="submit" disabled={pending} variant={archive ? "destructive" : "default"} aria-busy={pending}>{pending ? "处理中…" : submitLabel}</Button><Button type="button" disabled={pending} variant="outline" onClick={() => changeOpen(false)}>取消</Button></div>
          </CareerForm>
          {failed ? <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">如未能确认操作结果，请先<a className="ui-link" href={recoveryHref} target="_blank" rel="noopener noreferrer">在新标签页核对记录</a>，避免重复创建或覆盖。</p> : null}
        </div>
      </DialogContent>
    </Dialog>
    {saved ? <p role="status" className="mt-2 text-sm text-[var(--text-secondary)]">已保存</p> : null}
  </div>;
}

// Shared task shell; the original export remains compatible with experience forms.
export const CareerTaskDialog = ExperienceFormDialog;
