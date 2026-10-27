"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { z } from "zod";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { acquireAssistantChat, restoreAssistantChatDiscussion, getAssistantChatSnapshot, refreshAssistantChatRun, resetAssistantChat, stopAssistantChat, submitAssistantChat, subscribeAssistantChat, type FrozenChatSubmit, type AssistantChatLease } from "@/features/assistant/client-chat-runtime";
import { aiResumeHref, chatIdentityKey, type ChatIdentity } from "@/features/assistant/client-chat-contracts";
import { loadLegacyAssistantRecovery, retireLegacyAssistantRecovery, remainingLegacyAssistantLifetime } from "@/features/assistant/legacy-chat-recovery";
import { captureNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { registerAiResumeConsumer } from "@/features/assistant/ai-continuity";
import { WORKSPACE_SESSION_TTL_MS } from "@/lib/workspace-session";

const inputSchema = z.object({ input: z.string().max(10_000), model: z.enum(["deepseek-v4-flash", "deepseek-v4-pro"]) }).strict();
// Only an edit marker follows the existing scoped engine, never another text copy.
const inputEditLeases = new WeakMap<AssistantChatLease, { serial: number; edited: boolean; expiresAt: number }>();
export function useContinuousAssistantChat(identity: ChatIdentity, inputLabel: string) {
  const key = chatIdentityKey(identity);
  // Identity keys create separate engines. A -> B -> A never adopts B's stream.
  const entry = acquireAssistantChat(identity);
  const legacy = useMemo(() => loadLegacyAssistantRecovery(entry.identity), [entry]);
  const migrated = useRef<string | null>(null);
  const [migrationDone, setMigrationDone] = useState<string | null>(null);
  const subscribe = useCallback((listener: () => void) => subscribeAssistantChat(entry, listener), [entry]);
  const getSnapshot = useCallback(() => getAssistantChatSnapshot(entry), [entry]);
  const runtime = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const chat = useChat({ chat: entry.chat });
  const draft = useWorkflowDraft({ kind: identity.surface === "career" ? "career" : identity.surface === "calendar" ? "calendar" : identity.surface === "tasks" ? "task" : "capture", id: `assistant:${key}`, label: inputLabel, resumeAiTarget: { kind: "chat", identity }, resumeHref: aiResumeHref({ kind: "chat", identity })!, get ttlMs() { return migrationDone !== key && legacy ? remainingLegacyAssistantLifetime(legacy.expiresAt) : undefined; }, initialValue: { input: "", model: "deepseek-v4-flash" as const }, parse: value => { const parsed = inputSchema.safeParse(value); return parsed.success ? parsed.data : null; } });
  const setDraftValue = draft.setValue;
  const draftIsCurrent = draft.isCurrent;
  const [scopeNotice, setScopeNotice] = useState<string | null>(null);
  const requireCurrent = useCallback(() => {
    if (draftIsCurrent() && entry.current()) return true;
    setScopeNotice("工作区已变化，请重新打开此 AI 入口。");
    return false;
  }, [draftIsCurrent, entry]);
  useLayoutEffect(() => {
    if (!draftIsCurrent()) return;
    if (migrated.current === key) return;
    migrated.current = key;
    if (legacy && !draft.restored && entry.current()) {
      setDraftValue({ input: legacy.input, model: legacy.model });
      restoreAssistantChatDiscussion(entry, legacy);
    }
    retireLegacyAssistantRecovery(entry.identity); setMigrationDone(key);
  }, [key, legacy, entry, draft.restored, setDraftValue, draftIsCurrent]);
  const setDraftInput: Dispatch<SetStateAction<string>> = useCallback(next => setDraftValue(value => ({ ...value, input: typeof next === "function" ? next(value.input) : next })), [setDraftValue]);
  const setInput: typeof setDraftInput = useCallback(next => {
    if (!draftIsCurrent()) return;
    if (entry.view.pending || entry.view.lastFailedText) inputEditLeases.set(entry, { serial: entry.serial, edited: true, expiresAt: inputEditLeases.get(entry)?.expiresAt ?? 0 });
    setDraftInput(next);
  }, [draftIsCurrent, entry, setDraftInput]);
  const setModel: Dispatch<SetStateAction<"deepseek-v4-flash" | "deepseek-v4-pro">> = useCallback(next => setDraftValue(value => ({ ...value, model: typeof next === "function" ? next(value.model) : next })), [setDraftValue]);
  const recoveredFailure = useRef<{ entry: typeof entry; serial: number } | null>(null);
  useLayoutEffect(() => {
    if (!draftIsCurrent() || !entry.current() || runtime.pending || !runtime.lastFailedText) return;
    if (recoveredFailure.current?.entry === entry && recoveredFailure.current.serial === entry.serial) return;
    recoveredFailure.current = { entry, serial: entry.serial };
    const edits = inputEditLeases.get(entry);
    const lease = edits?.serial === entry.serial ? edits : undefined;
    if (lease?.edited || (lease?.expiresAt ?? runtime.updatedAt + WORKSPACE_SESSION_TTL_MS) <= Date.now()) return;
    const failedText = runtime.lastFailedText;
    setDraftInput(current => current || failedText);
  }, [draftIsCurrent, entry, runtime.pending, runtime.lastFailedText, runtime.updatedAt, setDraftInput]);
  useEffect(() => registerAiResumeConsumer(target => target.kind === "chat" && chatIdentityKey(target.identity) === key, async target => {
    const navigation = captureNavigationIntent();
    if (target.kind !== "chat" || !draftIsCurrent() || !entry.current()) return false;
    if (target.runId && target.runId !== entry.view.runId) {
      if (entry.view.pending) return false;
      await refreshAssistantChatRun(entry, target.runId);
      if (entry.view.runId !== target.runId) return false;
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-assistant-input="${key}"]`);
    if (!input || !draftIsCurrent() || !entry.current() || !navigation()) return false;
    const details = input.closest("details"); if (details) details.open = true;
    input.focus(); return document.activeElement === input;
  }), [entry, key, draftIsCurrent]);
  const submit = useCallback(async (input: FrozenChatSubmit) => {
    if (!requireCurrent()) return false;
    const previous = draft.value;
    const text = input.text;
    const previousSerial = entry.serial;
    const promise = submitAssistantChat(entry, { ...input, model: input.model ?? (identity.surface === "tasks" || identity.surface === "calendar" ? previous.model : undefined) });
    const submittedSerial = entry.serial;
    if (submittedSerial !== previousSerial && entry.view.pending) {
      inputEditLeases.set(entry, { serial: entry.serial, edited: false, expiresAt: Date.now() + WORKSPACE_SESSION_TTL_MS });
      setDraftInput(current => current === text ? "" : current);
    }
    const ok = await promise;
    const edits = inputEditLeases.get(entry);
    if (!ok && submittedSerial !== previousSerial && entry.serial === submittedSerial && entry.current() && entry.view.lastFailedText === text && !(edits?.serial === submittedSerial && edits.edited)) setDraftInput(current => current || text);
    return ok;
  }, [draft.value, entry, identity.surface, setDraftInput, requireCurrent]);
  const stop = useCallback(() => stopAssistantChat(entry), [entry]);
  const reset = useCallback(async () => {
    if (!requireCurrent()) return false;
    inputEditLeases.set(entry, { serial: entry.serial, edited: true, expiresAt: inputEditLeases.get(entry)?.expiresAt ?? 0 });
    return resetAssistantChat(entry);
  }, [entry, requireCurrent]);
  const refreshRun = useCallback(async () => { if (requireCurrent()) await refreshAssistantChatRun(entry); }, [entry, requireCurrent]);
  const notice = draft.scopeRevoked ? "工作区已变化，请重新打开此 AI 入口。" : scopeNotice ?? runtime.notice;
  return { ...chat, entry, runtime: notice === runtime.notice ? runtime : { ...runtime, notice }, input: draft.value.input, setInput, model: draft.value.model, setModel, recoveryUnavailable: draft.recoveryUnavailable, restored: draft.restored, submit, stop, reset, refreshRun, waiting: runtime.pending || chat.status === "submitted" || chat.status === "streaming" };
}
