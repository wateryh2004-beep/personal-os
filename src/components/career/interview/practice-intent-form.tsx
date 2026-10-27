"use client";

import { Children, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import { savePracticeIntent, reconcilePracticeIntent } from "@/features/interview/actions";
import type { PracticeIntentOutcome, PracticeMode } from "@/features/interview/practice-intents";
import { readDeclaredDraftFields, applyDeclaredDraftFields } from "@/features/workflow-continuity/draft-adapters";
import { parseDraftFields, type DraftFields } from "@/features/workflow-continuity/draft-contracts";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { draftResumeKey, focusDraftForm, useDraftResumeConsumer } from "@/features/workflow-continuity/draft-resume";
import { beginNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { DraftRecoveryStatus } from "@/components/workflow-continuity/draft-recovery-status";

type PracticeDraft = { attemptId: string; fields: DraftFields; submitted: DraftFields | null; phase: "editing" | "needs-check" | "retry" };
export type PracticeIntentTransport={save:typeof savePracticeIntent;reconcile:typeof reconcilePracticeIntent};
export function PracticeIntentForm({ transport, blocked, mode, preparationId, sessionId, parentAttemptId, children, historyHref, className }: { blocked?:string; mode: PracticeMode; preparationId?: string; sessionId?: string; parentAttemptId?: string; transport?:PracticeIntentTransport; children: ReactNode; historyHref: string; className?: string }) {
  assertContinuousFixtureTransport(transport);
  const transportSave=transport?.save??savePracticeIntent,transportRead=transport?.reconcile??reconcilePracticeIntent;
  const router = useRouter();
  const operation = mode === "solo" ? "practice.solo" : "practice.session-attempt";
  const binding = mode === "solo" ? preparationId! : sessionId!;
  const target = mode === "solo" ? { kind: "practice.solo" as const, id: parentAttemptId ?? "new", parentId: binding } : { kind: "practice.session-attempt" as const, id: parentAttemptId ?? "new", parentId: binding };
  const key = `${operation}:${binding}:${parentAttemptId ?? "root"}`;
  const [initial] = useState<PracticeDraft>(() => ({ attemptId: crypto.randomUUID(), fields: {}, submitted: null, phase: "editing" }));
  const recovery = useWorkflowDraft<PracticeDraft>({ kind: "career", id: key, label: mode === "solo" ? "未保存的练习" : "未保存的场内回答", resumeHref: mode === "solo" ? `/career/interview/practice/${binding}${parentAttemptId ? `?parent=${parentAttemptId}` : ""}` : `/career/interview/sessions/${binding}`, resumeTarget: target, initialValue: initial, parse: input => {
    const result = z.object({ attemptId: z.string().uuid(), fields: z.unknown(), submitted: z.unknown(), phase: z.enum(["editing", "needs-check", "retry"]) }).strict().safeParse(input);
    if (!result.success) return null;
    const fields = parseDraftFields(operation, result.data.fields), submitted = result.data.submitted === null ? null : parseDraftFields(operation, result.data.submitted);
    return fields && (result.data.submitted === null || submitted) ? { ...result.data, fields, submitted } : null;
  } });
  const form = useRef<HTMLFormElement>(null), initialized = useRef<string | null>(null), mounted = useRef(true), lease = useRef({ key });
  useLayoutEffect(()=>{lease.current={key};},[key]);
  const live = useRef(recovery.value);useLayoutEffect(()=>{live.current=recovery.value;},[recovery.value]);
  const [pending, start] = useTransition(), [message, setMessage] = useState("");
  const busy = useRef<symbol | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => {
    if (!form.current || initialized.current === key) return;
    initialized.current = key;
    if (recovery.restored) applyDeclaredDraftFields(form.current, operation, recovery.value.fields);
    else { const fields = readDeclaredDraftFields(form.current, operation); recovery.commit(recovery.value, value => ({ ...value, fields })); }
  }, [key, operation, recovery]);
  useDraftResumeConsumer({ kind: operation, identity: { id: target.id, parentId: target.parentId }, ready: () => Boolean(form.current?.isConnected&&!form.current.closest("[hidden],[inert]")), priority: 2, open: (value, context) => focusDraftForm(value, context) });
  const toForm = (fields: DraftFields) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) { if (Array.isArray(value)) value.forEach(item => data.append(name, item)); else if (typeof value === "string") data.set(name, value); else if (value) data.set(name, "on"); }
    if (mode === "solo") data.set("preparation_id", preparationId!); else data.set("session_id", sessionId!);
    return data;
  };
  const capture = () => { if (form.current) { const fields = readDeclaredDraftFields(form.current, operation); recovery.setValue(value => ({ ...value, fields })); } };
  const frozenHiddenNames = new Set(["prompt_snapshot", "input_mode", "language", "answer_version_id", "parent_attempt_id", "story_id", "strength_tags", "confidence_before", "confidence_after"]);
  const boundChildren = Children.map(children, child => {
    if (!isValidElement<{ name?: string; type?: string; value?: string }>(child) || child.type !== "input" || child.props.type !== "hidden" || !child.props.name || !frozenHiddenNames.has(child.props.name)) return child;
    const value = recovery.value.fields[child.props.name];
    return typeof value === "string" ? cloneElement(child, { value }) : child;
  });
  function execute(kind: "save" | "reconcile" | "retry") {
    if (busy.current || !form.current || blocked || !recovery.isCurrent()) return;
    const scope = captureWorkspaceScope(), instance = lease.current, submissionToken = Symbol(key);
    const current = () => recovery.isCurrent() && scope() && mounted.current && instance === lease.current;
    const fields = kind === "save" ? readDeclaredDraftFields(form.current, operation) : live.current.submitted;
    if (!fields) return;
    if (kind === "save" && live.current.phase !== "editing") return;
    const frozen = structuredClone(fields), attemptId = live.current.attemptId;
    const navigationCurrent = kind === "save" ? beginNavigationIntent() : null;
    recovery.setValue(value => ({ ...value, submitted: frozen }));
    busy.current = submissionToken; setMessage("");
    start(async () => {
      let result: PracticeIntentOutcome;
      try { result = kind === "reconcile" ? await transportRead(mode, attemptId, toForm(frozen)) : await transportSave(mode, attemptId, toForm(frozen)); }
      catch (error) { unstable_rethrow(error); result = { status: "needs-check", message: "未收到保存回执，输入与本次保存意图已保留。" }; }
      finally { if (busy.current === submissionToken) busy.current = null; }
      if (!current() || live.current.attemptId !== attemptId) return;
      if (result.status === "saved") {
        const hasNewInput = JSON.stringify(live.current.fields) !== JSON.stringify(frozen);
        const expected = { ...live.current, fields: frozen };
        recovery.commit(expected, value => ({ ...value, attemptId: crypto.randomUUID(), submitted: null, phase: "editing" }));
        setMessage(result.warning ?? (result.receipt.archived ? "这次练习曾已保存，当前已归档；未重新创建。" : hasNewInput ? "上一份回答已保存，当前修改尚未保存。" : "这次练习已保存。"));
        if (mode === "solo" && !hasNewInput && !result.receipt.archived && navigationCurrent?.() && current()) router.push(`/career/interview/practice/${binding}?saved=${result.receipt.attempt_id}`);
      } else if (result.status === "missing") {
        recovery.setValue(value => ({ ...value, phase: "retry" })); setMessage("目前未找到原保存记录，可用同一意图重试；当前修改仍保留。");
      } else if (result.status === "rejected") {
        recovery.setValue(value => ({ ...value, phase: "editing", submitted: null })); setMessage(result.message);
      } else { recovery.setValue(value => ({ ...value, phase: "needs-check", submitted: frozen })); setMessage(result.message); }
    });
  }
  return <form ref={form} data-workflow-draft-key={draftResumeKey(target)} className={className} aria-busy={pending} onInputCapture={capture} onChangeCapture={capture} onSubmit={event => { event.preventDefault(); execute("save"); }}>
    {blocked?<p role="alert" className="mb-3 text-sm text-[var(--danger)]">{blocked}</p>:null}<fieldset disabled={Boolean(blocked)} className="min-w-0">{boundChildren}</fieldset>
    {pending ? <p role="status" className="mt-3 text-xs text-[var(--text-secondary)]">正在保存或核对…</p> : null}
    <DraftRecoveryStatus restored={recovery.restored} recoveryUnavailable={recovery.recoveryUnavailable} dirty={Boolean(Object.keys(recovery.value.fields).length)} />
    {message ? <p role={recovery.value.phase === "editing" ? "status" : "alert"} className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{message}</p> : null}
    {recovery.value.submitted ? <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={pending} onClick={() => execute("reconcile")} className="ui-action-secondary min-h-11 px-3">核对原保存</button>{recovery.value.phase === "retry" ? <button type="button" disabled={pending} onClick={() => execute("retry")} className="ui-action-secondary min-h-11 px-3">重试同一次保存</button> : null}<a href={historyHref} className="ui-link min-h-11 py-3">查看练习记录</a></div> : null}
  </form>;
}
