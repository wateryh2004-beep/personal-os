"use client";

import { useEffect,useLayoutEffect, useRef, useState, useTransition } from "react";
import { z } from "zod";
import type {CaptureFixtureTransport} from "@/features/assistant/capture-fixtures";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import { submitCapture, reconcileCapture, type CaptureOutcome, type CaptureIntent } from "@/features/assistant/ai-capture";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useWorkflowDraft } from "./drafts";
import { draftResumeKey, focusDraftForm, useDraftResumeConsumer } from "./draft-resume";
const schema = z.object({ content: z.string().max(10000), intent: z.object({ intentId: z.string().uuid(), content: z.string().max(10000) }).strict().nullable() }).strict();
type State = z.infer<typeof schema>;
/** One form input, one immutable capture intent; late classification never submits twice. */
export function useCaptureDraft(surface: "today" | "inbox" | "global",transport?:CaptureFixtureTransport) {
  assertContinuousFixtureTransport(transport);
  const target = surface === "today" ? { kind: "capture.today" as const, id: "owner" } : surface === "inbox" ? { kind: "capture.inbox" as const, id: "owner" } : { kind: "global.inbox" as const, id: "new" };
  const recovery = useWorkflowDraft<State>({ kind: "capture", id: surface === "today" ? "today" : surface === "inbox" ? "inbox-capture" : "global-inbox-intent", label: surface === "today" ? "快速记录" : "未完成的收集箱记录", resumeHref: surface === "inbox" ? "/inbox" : "/today", resumeTarget: target, initialValue: { content: "", intent: null }, parse: input => { const value = schema.safeParse(input); return value.success ? value.data : null; } });
  const live = useRef(recovery.value);useLayoutEffect(()=>{live.current=recovery.value;},[recovery.value]);
  const [outcome, setOutcome] = useState<CaptureOutcome | null>(null), [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null), mounted = useRef(true), busy = useRef<symbol | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useDraftResumeConsumer({ kind: target.kind, identity: { id: target.id }, priority: 2, ready: () => Boolean(formRef.current?.isConnected), open: (value, context) => focusDraftForm(value, context) });
  const install = (result: CaptureOutcome, intent: CaptureIntent, current: () => boolean) => {
    if (!current() || live.current.intent?.intentId !== intent.intentId) return;
    setOutcome(result);
    if (result.status === "saved") recovery.commit({ content: intent.content, intent }, value => ({ content: value.content === intent.content ? "" : value.content, intent: null }));
    else if (result.status === "rejected" && result.code !== "conflict") recovery.setValue(value => ({ ...value, intent: null }));
  };
  const perform = (intent: CaptureIntent, readOnly: boolean): Promise<CaptureOutcome> => {
    const scope = captureWorkspaceScope(), current = () => recovery.isCurrent() && scope() && mounted.current;
    const token = Symbol(intent.intentId); busy.current = token;
    return new Promise(resolve => start(async () => {
      const result = readOnly ? await reconcileCapture(intent,transport) : await submitCapture(intent,transport);
      if (busy.current === token) busy.current = null;
      install(result, intent, current); resolve(result);
    }));
  };
  const checked = useRef<string | null>(null);
  useEffect(() => {
    const intent = live.current.intent;
    if (!intent || checked.current === intent.intentId) return;
    checked.current = intent.intentId;
    // Returning to an uncertain form only reads the original intent, never captures again.
    if (recovery.restored&&recovery.isCurrent()) void perform(intent, true);
  });
  return { value: recovery.value.content, setValue: (content: string) => recovery.setValue(value => ({ ...value, content })), pending, restored: recovery.restored, recoveryUnavailable: recovery.recoveryUnavailable, formRef, attributes: { "data-workflow-draft-key": draftResumeKey(target) }, outcome,
    state: { status: !outcome ? "idle" as const : outcome.status === "saved" ? "success" as const : "error" as const, message: !outcome ? "" : outcome.status === "saved" ? outcome.classification === "failed" ? "已加入收集箱，识别暂未完成。" : "已加入收集箱。" : outcome.message },
    uncertain: Boolean(recovery.value.intent),
    submit: async (content = live.current.content) => {
      if (busy.current||!recovery.isCurrent()) return null;
      if (live.current.intent) return perform(live.current.intent, true);
      const intent = { intentId: crypto.randomUUID(), content };
      checked.current = intent.intentId;
      recovery.setValue(value => ({ ...value, content, intent }));
      // The draft hook synchronizes its own live lease immediately; keep this read-only ref aligned.
      live.current = { ...live.current, content, intent };
      return perform(intent, false);
    },
  };
}
