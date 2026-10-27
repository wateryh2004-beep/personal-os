"use client";
import {captureWorkspaceScope} from "@/lib/workspace-resource-cache";
import { useDeclaredFormDraft,readDeclaredDraftFields } from "@/features/workflow-continuity/draft-adapters";
import type { DeclaredDraftConfig } from "@/features/workflow-continuity/draft-contracts";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";
import {OrdinaryOutcomeRecovery} from "@/components/workflow-continuity/ordinary-outcome-recovery";


import { Children,cloneElement,isValidElement,useRef, useState, type FormEvent, type ReactNode } from "react";
import { publishOperationReceipt } from "@/features/workbench/operation-contracts";
import { unstable_rethrow } from "next/navigation";

/** Catch action failures locally and retain the user's input for another attempt. */
export function FileMutationForm({ action, draft,onDraftRestore,receiptMessage="文件变更已保存",onPendingChange, children, className, onSuccess }: {
  draft?:DeclaredDraftConfig;onDraftRestore?:(fields:import("@/features/workflow-continuity/draft-contracts").DraftFields)=>void;receiptMessage?:string;onPendingChange?:(pending:boolean)=>void; action: (data: FormData) => Promise<void | { saved: true; warning?: string; receiptId?: string; savedRevision?:number }>; children?: ReactNode; className?: string; onSuccess?: () => void;
}) {
  const request=useRef<{key:string;id:string}|null>(null);
  const [restoredRevision,setRestoredRevision]=useState<string|null>(null),[restoredParent,setRestoredParent]=useState<string|null>(null);
  const {formRef,...recovery}=useDeclaredFormDraft(draft,fields=>{onDraftRestore?.(fields);if(typeof fields.parent_id==="string")setRestoredParent(fields.parent_id);if(typeof fields.expected_revision==="string")setRestoredRevision(fields.expected_revision);if(typeof fields.request_id==="string"&&typeof fields.request_fingerprint==="string")request.current={id:fields.request_id,key:fields.request_fingerprint};});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [savedWithWarning, setSavedWithWarning] = useState(false);
  const inFlight = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();if(!recovery.isCurrent())return;
    const scopeCurrent=recovery.captureGuard(),scopeActive=captureWorkspaceScope();
    if (inFlight.current || savedWithWarning||draft&&recovery.uncertain) return;
    const form = event.currentTarget;
    recovery.capture(event); // Restore the original CAS baseline before freezing the request.
    const data = new FormData(form);
    const key=JSON.stringify([...data.entries()].filter(([name])=>name!=="request_id"&&name!=="request_fingerprint")); if(request.current?.key!==key) request.current={key,id:crypto.randomUUID()}; data.set("request_id",request.current.id);
    const requestControl=form.elements.namedItem("request_id"),fingerprint=form.elements.namedItem("request_fingerprint");if(requestControl instanceof HTMLInputElement)requestControl.value=request.current.id;if(fingerprint instanceof HTMLInputElement)fingerprint.value=key;
    const snapshot=recovery.capture(event);
    inFlight.current = true;
    setPending(true);onPendingChange?.(true); setError("");
    try {
      const result = await action(data);
      if(!scopeCurrent())return;
      const unchanged=!draft||JSON.stringify(readDeclaredDraftFields(form,draft.operation))===JSON.stringify(snapshot);
      const savedRevision=result?.savedRevision;
      if(typeof savedRevision==="number"&&Number.isSafeInteger(savedRevision)&&savedRevision>=0){recovery.complete(snapshot,{savedFields:{expected_revision:String(savedRevision)}});setRestoredRevision(String(savedRevision));}
      else recovery.complete(snapshot);
      if(result?.receiptId) publishOperationReceipt({receiptId:result.receiptId,message:receiptMessage});
      if (result?.warning) { setError(result.warning); setSavedWithWarning(true); }
      else if(unchanged)onSuccess?.();else setError("原修改已保存，当前新输入尚未保存。");
    } catch (reason) {
      unstable_rethrow(reason);
      if(!scopeCurrent())return;
      if(draft)recovery.markUncertain();
      setError(reason instanceof Error ? reason.message : "未能保存，请检查网络后重试。");
    } finally { inFlight.current = false; if(scopeActive()){setPending(false);onPendingChange?.(false);} }
  };
  const revisionBound=Children.map(children,child=>isValidElement<{name?:string;type?:string;value?:string|number}>(child)&&child.type==="input"&&child.props.type==="hidden"&&child.props.name==="expected_revision"&&restoredRevision!==null?cloneElement(child,{value:restoredRevision}):child);
  const bound=Children.map(revisionBound,child=>isValidElement<{name?:string;type?:string;value?:string|number}>(child)&&child.type==="input"&&child.props.type==="hidden"&&child.props.name==="parent_id"&&restoredParent!==null?cloneElement(child,{value:restoredParent}):child);
  return <form ref={formRef} {...recovery.attributes} onInputCapture={recovery.capture} onChangeCapture={recovery.capture} onSubmit={(event) => { void submit(event); }} className={className} aria-busy={pending}>
    <fieldset disabled={savedWithWarning||pending&&!draft} className="contents">{bound}</fieldset><input type="hidden" name="request_id"/><input type="hidden" name="request_fingerprint"/>
    {draft?<DraftRecoveryStatus dirty={recovery.dirty} restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable}/>:null}
    {draft&&recovery.uncertain?<OrdinaryOutcomeRecovery key={recovery.key} uncertain target={recovery.target} href={draft.href} captureGuard={recovery.captureGuard} onCompared={recovery.adoptComparedBaseline}/>:null}
    {pending ? <p role="status" className="text-[12px] text-[var(--text-secondary)]">正在保存…</p> : null}
    {error ? <p role="alert" className="w-full break-words text-[12px] text-[var(--danger)]">{error}</p> : null}
  </form>;
}
