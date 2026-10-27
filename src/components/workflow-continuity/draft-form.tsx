"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { useDeclaredFormDraft, readDeclaredDraftFields } from "@/features/workflow-continuity/draft-adapters";
import type { DeclaredDraftConfig, DraftFields } from "@/features/workflow-continuity/draft-contracts";
import { DraftRecoveryStatus } from "./draft-recovery-status";
import {OrdinaryOutcomeRecovery} from "./ordinary-outcome-recovery";

/** Only direct actions which throw on failure use this form; no guessed action identity. */
export type DraftSaveResult = { status: "saved" } | { status: "needs-check" | "rejected"; message: string };
export function DraftForm({ action, draft, children, className, onSaved, onDraftRestore }: { action: (data: FormData) => Promise<DraftSaveResult>; draft: DeclaredDraftConfig; children: ReactNode; className?: string; onSaved?: (data: FormData) => void; onDraftRestore?: (fields: DraftFields) => void }) {
  const {formRef,...recovery} = useDeclaredFormDraft(draft, onDraftRestore);
  const [error, setError] = useState(""), [saved, setSaved] = useState(false), [pending, start] = useTransition();
  const busy = useRef<symbol|null>(null);
  return <form ref={formRef} {...recovery.attributes} className={className} aria-busy={pending} onInputCapture={event => { recovery.capture(event); setSaved(false); }} onChangeCapture={event => { recovery.capture(event); setSaved(false); }} onSubmit={event => {
    event.preventDefault();if(!recovery.isCurrent())return; if (busy.current||recovery.uncertain) return;
    const snapshot = recovery.capture(event),data = new FormData(event.currentTarget), current = recovery.captureGuard();
    const token=Symbol(recovery.key);busy.current = token; setError(""); setSaved(false);
    start(async () => {
      try { const result = await action(data); if (!current()) return; if (result.status !== "saved") {if(result.status==="needs-check")recovery.markUncertain(); setError(result.message); return; } const unchanged=JSON.stringify(readDeclaredDraftFields(formRef.current!,draft.operation))===JSON.stringify(snapshot); recovery.complete(snapshot); setSaved(unchanged); if(unchanged)onSaved?.(data); else setError("原输入已保存，当前新输入尚未保存。"); }
      catch (reason) { unstable_rethrow(reason); if (current()){recovery.markUncertain();setError("未能确认保存结果，输入已保留。请先核对原记录，避免重复保存。");} }
      finally { if(busy.current===token)busy.current = null; }
    });
  }}>
    {children}
    <DraftRecoveryStatus dirty={recovery.dirty} restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable} />
    {recovery.uncertain?<OrdinaryOutcomeRecovery key={recovery.key} uncertain target={recovery.target} href={draft.href} captureGuard={recovery.captureGuard} onCompared={recovery.adoptComparedBaseline}/>:null}
    {pending ? <p role="status" className="text-xs leading-5 text-[var(--text-secondary)]">正在保存…</p> : error ? <p role="alert" className="text-xs leading-5 text-[var(--danger)]">{error}</p> : saved ? <p role="status" className="text-xs leading-5 text-[var(--text-secondary)]">已保存。</p> : null}
  </form>;
}
