"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition, type RefObject } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { beginNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { careerFieldLabels, initialCareerFormResult, type CareerFormResult } from "@/features/career/form-state";
import { cn } from "@/lib/utils";
import { useDeclaredFormDraft, readDeclaredDraftFields } from "@/features/workflow-continuity/draft-adapters";
import type { DeclaredDraftConfig, DraftFields } from "@/features/workflow-continuity/draft-contracts";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";
import {OrdinaryOutcomeRecovery} from "@/components/workflow-continuity/ordinary-outcome-recovery";

type CareerFormProps = {
  action: (formData: FormData) => Promise<CareerFormResult>;
  children?: React.ReactNode;
  className?: string;
  successMessage?: string;
  successTargetId?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (submitted: FormData) => void;
  draft?: DeclaredDraftConfig;
  onDraftRestore?: (fields: DraftFields) => void;
  discardDraftRef?: RefObject<(() => void) | null>;
};
function CareerSavedNavigation({ href,current }: { href: string;current:()=>boolean }) { const router = useRouter(),navigated=useRef(false); useEffect(() => {if(!navigated.current&&current()){navigated.current=true;router.push(href);}}, [href, router,current]); return null; }

/** Explicit submission avoids React resetting uncontrolled inputs after a validation error. */
export function CareerForm({ action, children, className, successMessage = "已保存。", successTargetId, resetOnSuccess = false, onSuccess, draft, onDraftRestore, discardDraftRef }: CareerFormProps) {
  const [state, setState] = useState(initialCareerFormResult);
  const [pending, startTransition] = useTransition();
  const {formRef,...recovery} = useDeclaredFormDraft(draft, onDraftRestore);
  const submitting = useRef<symbol | null>(null);
  const [navigation,setNavigation]=useState<{href:string;current:()=>boolean}|null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const feedbackId = useId();
  useLayoutEffect(() => { if (!discardDraftRef) return; const clear = () => recovery.clear(); discardDraftRef.current = clear; return () => { if (discardDraftRef.current === clear) discardDraftRef.current = null; }; }, [discardDraftRef, recovery]);

  useEffect(() => {
    const controls = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[name],select[name],textarea[name]");
    controls?.forEach((control) => {
      if (state.fieldErrors?.[control.name]) {
        control.setAttribute("aria-invalid", "true");
        control.setAttribute("aria-describedby", feedbackId);
      } else if (control.getAttribute("aria-describedby") === feedbackId) {
        control.removeAttribute("aria-invalid");
        control.removeAttribute("aria-describedby");
      }
    });
    if (state.status === "error") feedbackRef.current?.focus();
  }, [state, feedbackId,formRef]);

  return <form ref={formRef} {...recovery.attributes} onInputCapture={draft ? recovery.capture : undefined} onChangeCapture={draft ? recovery.capture : undefined} method="post" aria-busy={pending || undefined} onSubmit={(event) => {
    event.preventDefault();if(!recovery.isCurrent())return;
    if (submitting.current||draft&&recovery.uncertain) return;
    const submissionToken = Symbol(recovery.key);
    submitting.current = submissionToken;
    const submittedDraft = recovery.capture(event);
    const formData = new FormData(event.currentTarget);
    const current = recovery.captureGuard();
    const navigationCurrent = beginNavigationIntent();
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (!current()) return;
        const unchanged=!draft||!formRef.current||JSON.stringify(readDeclaredDraftFields(formRef.current,draft.operation))===JSON.stringify(submittedDraft);
        const resolved=result.redirectTo&&(!navigationCurrent()||!unchanged)?{...result,redirectTo:undefined}:result;
        setNavigation(resolved.redirectTo?{href:resolved.redirectTo,current:()=>current()&&navigationCurrent()}:null);setState(result.status==="success"&&!unchanged?{...resolved,status:"idle",message:"原输入已保存，当前新输入尚未保存。"}:resolved);
        if(result.needsCheck&&draft)recovery.markUncertain();
        if (result.status === "success") {
          recovery.complete(submittedDraft, { reset: resetOnSuccess,savedFields:result.savedUpdatedAt&&draft?.operation==="interview.preparation"?{expected_updated_at:result.savedUpdatedAt}:draft?.operation==="interview.narrative-baseline"&&typeof submittedDraft.selected_version_id==="string"?{baseline_selected_version_id:submittedDraft.selected_version_id}:undefined });
          if (!resolved.redirectTo) onSuccess?.(formData);
          // Only creation forms opt in; updates retain their current controlled/uncontrolled values.
          if (resetOnSuccess && (!draft || JSON.stringify(readDeclaredDraftFields(formRef.current!, draft.operation)) === JSON.stringify(submittedDraft))) formRef.current?.reset();
          if (successTargetId) requestAnimationFrame(() => document.getElementById(successTargetId)?.scrollIntoView({ block: "nearest", behavior: "instant" }));
        }
      } catch (error) {
        unstable_rethrow(error);
        if (!current()) return;
        if(draft)recovery.markUncertain();setState({ status: "error",needsCheck:true, message: "未能确认保存结果，输入已保留。请先核对原记录。" });
      } finally { if (submitting.current === submissionToken) submitting.current = null; }
    });
  }}>
    <fieldset disabled={pending && !draft} className={cn("min-w-0 border-0 p-0 disabled:opacity-70", className)}>{children}</fieldset>
    {draft ? <DraftRecoveryStatus dirty={recovery.dirty} restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable} /> : null}
    {draft&&recovery.uncertain?<OrdinaryOutcomeRecovery key={recovery.key} uncertain target={recovery.target} href={draft.href} captureGuard={recovery.captureGuard} onCompared={recovery.adoptComparedBaseline}/>:null}
    {state.status === "success" && navigation?.href.startsWith("/career/") ? <CareerSavedNavigation href={navigation.href} current={navigation.current} /> : null}
    <div ref={feedbackRef} id={feedbackId} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} aria-live="polite" className={cn("min-h-6 pt-1 text-[12px] leading-5 outline-none", state.status === "error" ? "text-[var(--danger)]" : "text-[var(--text-secondary)]")}>
      {pending ? "正在保存…" : state.status === "success" ? successMessage : state.message}
      {state.status === "error" && state.fieldErrors ? <ul className="mt-1 space-y-1">{Object.entries(state.fieldErrors).map(([name, error]) => <li key={name}><button type="button" className="text-left underline underline-offset-2" onClick={() => {
        const control = formRef.current?.elements.namedItem(name);
        if (control instanceof HTMLElement) control.focus();
      }}>{careerFieldLabels[name] ?? "字段"}：{error}</button></li>)}</ul> : null}
    </div>
  </form>;
}
