"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { captureWorkspaceScope, clearWorkspaceResources, registerWorkspaceScopeCleanup, WorkspaceAuthenticationError } from "@/lib/workspace-resource-cache";
import { decideContextGate } from "./kernel/context-gate";
import { chatIdentityKey, type ChatIdentity } from "./client-chat-contracts";
import { publishAiContinuity, removeAiContinuity } from "./ai-continuity";
import { startBackgroundOperation, type BackgroundOperationStatus } from "@/features/workflow-continuity/background-operations";
import type { AssistantUIMessage } from "./stream-metadata";
import type { AgentAction } from "./types";
import type { GraphEntityRef } from "@/features/graph/types";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";

export type FrozenChatSubmit = { text: string; model?: DeepSeekModelId; currentPath: string; currentEntity?: GraphEntityRef | null; surfaceContext?: { type: string; title?: string | null; content?: string | null } };
export type ChatRunView = { run?: { id?: string; surface?: string; current_entity_type?: string | null; current_entity_id?: string | null; status?: string; error_code?: string | null; generation_expires_at?: string | null }; messages: UIMessage[]; steps: Array<{ id: string; step_type: string; title: string; summary: string; status: string }>; actions: AgentAction[] };
export type ChatRuntimeSnapshot = { pending: boolean; restoring: boolean; runId: string | null; run: ChatRunView | null; outcome: BackgroundOperationStatus | null; notice: string | null; lastFailedText: string | null; updatedAt: number; generation: number };
export type AssistantChatLease = { readonly key: string; chat: Chat<AssistantUIMessage>; readonly identity: ChatIdentity; current: () => boolean; available: boolean; view: ChatRuntimeSnapshot; listeners: Set<() => void>; runEntity: GraphEntityRef | null; serial: number; stopped: boolean; flags: { isError: boolean; isAbort: boolean; isDisconnect: boolean }; controller?: AbortController; stopRequest?: () => void; restoreSerial: number; };
const chats = new Map<string, AssistantChatLease>();
const labels = { global: "全局 AI 回答", "notes-library": "笔记库 AI 回答", tasks: "任务 AI 回答", calendar: "日历 AI 回答", career: "职业 AI 分析" };
const ttl = 15 * 60_000;
const emptyView = (): ChatRuntimeSnapshot => ({ pending: false, restoring: false, runId: null, run: null, outcome: null, notice: null, lastFailedText: null, updatedAt: Date.now(), generation: 0 });
function change(entry: AssistantChatLease, next: Partial<ChatRuntimeSnapshot>) {
  if (!entry.current()) return;
  entry.view = { ...entry.view, ...next, updatedAt: Date.now() };
  for (const listener of entry.listeners) listener();
}
function entryHref(identity: ChatIdentity) { return identity.surface === "career" ? `/career/experiences/${identity.experienceId}` : identity.surface === "global" ? "/today" : identity.surface === "notes-library" ? "/notes/ask" : `/${identity.surface}`; }
function createEntry(identity: ChatIdentity, available: boolean): AssistantChatLease {
  const scope = captureWorkspaceScope();
  const key = chatIdentityKey(identity);
  const generation = Symbol(key);
  const token = { generation };
  const entry = { key, identity, available, view: emptyView(), listeners: new Set<() => void>(), runEntity: null, serial: 0, stopped: false, flags: { isError: false, isAbort: false, isDisconnect: false }, restoreSerial: 0 } as AssistantChatLease;
  entry.current = () => scope() && (typeof window === "undefined" || chats.get(key) === entry) && token.generation === generation;
  // Version-matched SDK: external Chat owns callbacks; useChat only subscribes.
  // node_modules/@ai-sdk/react/src/use-chat.ts and ai/src/ui/chat.ts.
  entry.chat = new Chat<AssistantUIMessage>({
    id: crypto.randomUUID(), transport: new DefaultChatTransport({ api: "/api/assistant" }),
    sendAutomaticallyWhen: identity.surface === "tasks" || identity.surface === "calendar" ? lastAssistantMessageIsCompleteWithApprovalResponses : undefined,
    onError: () => { if (entry.current()) entry.flags.isError = true; },
    onFinish: ({ isError, isAbort, isDisconnect }) => {
      if (!entry.current()) return;
      entry.flags.isError ||= isError; entry.flags.isAbort ||= isAbort; entry.flags.isDisconnect ||= isDisconnect;
    },
  });
  if (!available) entry.view.notice = "本标签页的 AI 会话已满，请结束或清理一份会话后继续；当前输入保留。";
  return entry;
}
export function acquireAssistantChat(identity: ChatIdentity): AssistantChatLease {
  if (typeof window === "undefined") return createEntry(identity, false);
  const key = chatIdentityKey(identity);
  const existing = chats.get(key);
  if (existing?.current()) return existing;
  for (const [id, entry] of chats) if (!entry.current() || (!entry.view.pending && !entry.view.restoring && entry.view.updatedAt + ttl <= Date.now())) { removeAiContinuity(`chat:${id}`, entry.current); chats.delete(id); }
  const footprint = () => [...chats.values()].reduce((sum, entry) => sum + JSON.stringify(entry.chat.messages).length, 0);
  // Reclaim only detached, resolved engines. Unknown writes retain their run gate.
  for (const candidate of [...chats.values()].sort((left, right) => left.view.updatedAt - right.view.updatedAt)) {
    if (chats.size < 8 && footprint() < 2_097_152) break;
    const resolved = candidate.view.outcome === null || candidate.view.outcome === "succeeded" || (!candidate.view.runId && !candidate.view.pending);
    if (candidate.listeners.size || candidate.view.pending || candidate.view.restoring || !resolved) continue;
    removeAiContinuity(`chat:${candidate.key}`, candidate.current); candidate.serial += 1; candidate.restoreSerial += 1; chats.delete(candidate.key);
  }
  const total = footprint();
  const entry = createEntry(identity, chats.size < 8 && total < 2_097_152);
  // Unavailable entries still bind their UI safely; submission remains blocked.
  if (entry.available) chats.set(key, entry);
  else entry.current = captureWorkspaceScope();
  return entry;
}
export function subscribeAssistantChat(entry: AssistantChatLease, listener: () => void) { entry.listeners.add(listener); return () => { entry.listeners.delete(listener); }; }
export const getAssistantChatSnapshot = (entry: AssistantChatLease) => entry.view;
function assertHttp(response: Response, current: () => boolean) {
  if (response.status === 401 || response.status === 403) {
    if (current()) { clearWorkspaceResources(); window.dispatchEvent(new Event("personal-os:workspace-auth-failed")); }
    throw new WorkspaceAuthenticationError("需要重新登录。");
  }
  if (!response.ok) throw new Error("会话暂时无法读取，当前输入保留。");
}
function sameEntity(a: GraphEntityRef | null, b: GraphEntityRef | null) { return a?.type === b?.type && a?.id === b?.id; }
async function ensureRun(entry: AssistantChatLease, frozen: FrozenChatSubmit, signal: AbortSignal) {
  const entity = frozen.currentEntity ?? null;
  const gate = decideContextGate({ message: frozen.text, surface: entry.identity.surface, currentPath: frozen.currentPath, hasCurrentSurface: Boolean(entity || frozen.surfaceContext?.content) });
  const needed = entry.identity.surface !== "global" || gate.mode === "action" || Boolean(entry.view.runId);
  if (!needed) return null;
  if (entry.view.runId && sameEntity(entry.runEntity, entity)) return entry.view.runId;
  const response = await fetch("/api/assistant/runs", { method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ surface: entry.identity.surface, currentPath: frozen.currentPath, currentEntity: entity }) });
  assertHttp(response, entry.current);
  const data = await response.json() as { runId?: string };
  if (!entry.current() || signal.aborted) throw new Error("assistant_scope_changed");
  if (!data.runId || !/^[0-9a-f-]{36}$/i.test(data.runId)) throw new Error("assistant_run_unavailable");
  entry.runEntity = entity;
  change(entry, { runId: data.runId, run: null });
  return data.runId;
}
export async function refreshAssistantChatRun(entry: AssistantChatLease, explicitRunId?: string) {
  const id = explicitRunId ?? entry.view.runId;
  if (!id || !entry.current()) return;
  const serial = ++entry.restoreSerial;
  const context = entry.runEntity;
  const params = new URLSearchParams({ surface: entry.identity.surface });
  if (entry.identity.surface === "career") { params.set("entityType", "experience"); params.set("entityId", entry.identity.experienceId); }
  else if (context && (!explicitRunId || explicitRunId === entry.view.runId)) { params.set("entityType", context.type); params.set("entityId", context.id); }
  change(entry, { restoring: true });
  try {
    const response = await fetch(`/api/assistant/runs/${id}?${params}`, { cache: "no-store" });
    assertHttp(response, () => entry.current() && entry.restoreSerial === serial);
    const payload = await response.json() as ChatRunView;
    if (!entry.current() || entry.restoreSerial !== serial || entry.view.pending) return;
    if (payload.run?.surface !== entry.identity.surface) throw new Error("assistant_run_identity_conflict");
    const entity = payload.run?.current_entity_id && payload.run.current_entity_type ? { type: payload.run.current_entity_type, id: payload.run.current_entity_id } : null;
    if (entry.identity.surface === "career" && (entity?.type !== "experience" || entity.id !== entry.identity.experienceId)) throw new Error("assistant_run_identity_conflict");
    entry.runEntity = entity as GraphEntityRef | null;
    if (explicitRunId && explicitRunId !== entry.view.runId) entry.chat.messages = (payload.messages ?? []) as AssistantUIMessage[];
    else if (payload.messages?.length && (!entry.chat.messages.length || payload.messages.length > entry.chat.messages.length)) entry.chat.messages = payload.messages as AssistantUIMessage[];
    change(entry, { runId: id, run: payload });
  } catch {
    if (entry.current() && entry.restoreSerial === serial) change(entry, { notice: "会话状态尚未核对，现有回答与输入仍保留。" });
  } finally { if (entry.current() && entry.restoreSerial === serial) change(entry, { restoring: false }); }
}
async function readRetryState(entry: AssistantChatLease, signal?: AbortSignal) {
  const id = entry.view.runId;
  if (!id) return null;
  const params = new URLSearchParams({ surface: entry.identity.surface });
  if (entry.runEntity) { params.set("entityType", entry.runEntity.type); params.set("entityId", entry.runEntity.id); }
  const response = await fetch(`/api/assistant/runs/${id}?${params}`, { cache: "no-store", signal });
  assertHttp(response, entry.current);
  const payload = await response.json() as ChatRunView;
  if (!entry.current() || payload.run?.surface !== entry.identity.surface) throw new Error("assistant_run_identity_conflict");
  change(entry, { run: payload });
  return payload;
}
function runStillActive(payload: ChatRunView) {
  return payload.run?.status === "pending" || (payload.run?.status === "running" && (!payload.run.generation_expires_at || Date.parse(payload.run.generation_expires_at) > Date.now()));
}
export async function submitAssistantChat(entry: AssistantChatLease, input: FrozenChatSubmit) {
  // Clone before ensureRun or any other await; followups use this exact body.
  const frozen = structuredClone(input);
  if (!entry.available || !entry.current() || entry.view.pending || !frozen.text.trim()) return false;
  const total = [...chats.values()].reduce((sum, value) => sum + JSON.stringify(value.chat.messages).length, 0);
  if (JSON.stringify(entry.chat.messages).length + frozen.text.length > 400_000 || total + frozen.text.length > 2_097_152) { change(entry, { notice: "会话恢复容量已满，当前输入保留。可新建会话后继续。" }); return false; }
  const previousOutcome = entry.view.outcome;
  const previousText = entry.view.lastFailedText;
  const serial = ++entry.serial;
  entry.restoreSerial += 1; entry.stopped = false; entry.flags = { isError: false, isAbort: false, isDisconnect: false }; entry.chat.clearError();
  change(entry, { pending: true, restoring: false, outcome: "running", notice: null, lastFailedText: null });
  const current = () => entry.current() && entry.serial === serial;
  const target = { kind: "chat" as const, identity: entry.identity };
  const metadata = (status: BackgroundOperationStatus, phase: string, backgroundOperationId?: string) => publishAiContinuity({ id: `chat:${entry.key}`, backgroundOperationId, target: { ...target, ...(entry.view.runId ? { runId: entry.view.runId } : {}) }, label: labels[entry.identity.surface], href: entryHref(entry.identity), status, phase, updatedAt: Date.now(), expiresAt: Date.now() + ttl }, current);
  let operationId: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = startBackgroundOperation({ kind: "assistant", label: labels[entry.identity.surface], href: entryHref(entry.identity), run: async ({ signal, report }) => {
      const controller = new AbortController(); entry.controller = controller;
      const stop = () => { controller.abort(); void entry.chat.stop(); };
      entry.stopRequest = stop; signal.addEventListener("abort", stop, { once: true });
      if (entry.identity.surface === "tasks" || entry.identity.surface === "calendar") timer = setTimeout(() => { if (current()) { entry.stopped = true; stop(); change(entry, { notice: "回答超时，已停止；已生成内容保留。" }); } }, 18_500);
      report({ phase: "正在生成，可切换页面继续工作" });
      try {
        if (entry.view.runId && ["failed", "interrupted", "needs-check"].includes(previousOutcome ?? "")) {
          const original = await readRetryState(entry, controller.signal);
          if (!current()) return { status: "needs-check" };
          if (!original || runStillActive(original)) {
            change(entry, { outcome: "needs-check", notice: "上次请求仍可能完成，请先核对原会话；当前输入保留，不会重复发送。", lastFailedText: frozen.text });
            metadata("needs-check", "上次请求尚未结束，返回核对原结果", operationId);
            return { status: "needs-check", phase: "上次请求仍待核对，未重复发送" };
          }
          const actionable = original.actions?.some(action => ["proposed", "approved", "executing"].includes(action.status));
          const requestGate = decideContextGate({ message: frozen.text, surface: entry.identity.surface, currentPath: frozen.currentPath, hasCurrentSurface: Boolean(frozen.currentEntity || frozen.surfaceContext?.content) });
          if (actionable && requestGate.mode === "action") {
            if (original.messages?.length) entry.chat.messages = original.messages as AssistantUIMessage[];
            change(entry, { outcome: "needs-check", lastFailedText: frozen.text, notice: "已有待确认操作，请先核对原提案；这次输入保留，没有重复生成。" });
            metadata("needs-check", "先核对原提案，本次输入保留", operationId);
            return { status: "needs-check", phase: "已有待确认操作，本次没有重复发送" };
          }
          if (previousText === frozen.text && ["completed", "awaiting_approval"].includes(original.run?.status ?? "")) {
            if (original.messages?.length) entry.chat.messages = original.messages as AssistantUIMessage[];
            change(entry, { outcome: "succeeded", notice: "已读到上次的权威结果，请查看原回答与提案；没有重复生成。" });
            metadata("succeeded", "已恢复原回答与提案，没有重复生成", operationId);
            return { status: "succeeded", phase: "已读取原结果，没有重复生成" };
          }
        }
        const runId = await ensureRun(entry, frozen, controller.signal);
        if (!current() || controller.signal.aborted) return { status: "interrupted", phase: "已停止生成，结果待核对" };
        await entry.chat.sendMessage({ text: frozen.text }, { body: { surface: entry.identity.surface, runId, model: frozen.model, currentPath: frozen.currentPath, currentEntity: frozen.currentEntity ?? null, surfaceContext: frozen.surfaceContext } });
        if (!current()) return { status: "interrupted" };
        if (entry.flags.isError || entry.flags.isDisconnect || entry.chat.status === "error") {
          change(entry, { outcome: "failed", notice: "生成未完成，输入与已生成内容保留。操作提案请先返回核对。", lastFailedText: frozen.text });
          metadata("failed", "生成未完成，返回核对原会话", operationId);
          throw new Error("assistant_stream_failed");
        }
        const interrupted = entry.flags.isAbort || controller.signal.aborted || entry.stopped;
        const status = interrupted ? "interrupted" : "succeeded";
        const phase = interrupted ? "已停止生成，已生成内容保留" : "回答已生成，操作仍需逐项确认";
        change(entry, { outcome: status, notice: interrupted ? phase : null }); metadata(status, phase, operationId);
        return { status, phase };
      } finally { signal.removeEventListener("abort", stop); if (timer) clearTimeout(timer); }
    } });
    operationId = operation.id; metadata("running", "正在生成，可切换页面继续工作", operationId);
    await operation.completion;
  } catch {
    if (current()) { change(entry, { outcome: "failed", lastFailedText: frozen.text, notice: "请求尚未完成，输入与原会话保留。" }); metadata("failed", "请求未完成，返回查看", operationId); }
  } finally {
    if (timer) clearTimeout(timer);
    if (current()) {
      if (entry.view.outcome === "running") { change(entry, { outcome: "needs-check", lastFailedText: frozen.text, notice: "请求结果待核对，原输入保留。" }); metadata("needs-check", "请求结果待核对", operationId); }
      change(entry, { pending: false }); entry.controller = undefined; entry.stopRequest = undefined;
      if (entry.view.runId) void refreshAssistantChatRun(entry);
    }
  }
  return entry.view.outcome === "succeeded";
}
export function stopAssistantChat(entry: AssistantChatLease) { if (!entry.current()) return; entry.stopped = true; entry.stopRequest?.(); void entry.chat.stop(); }
export async function resetAssistantChat(entry: AssistantChatLease) {
  if (!entry.current()) return false;
  if (entry.view.pending) { stopAssistantChat(entry); change(entry, { notice: "已请求停止。请先核对原结果，再新建会话。" }); return false; }
  if (entry.view.runId && ["failed", "interrupted", "needs-check"].includes(entry.view.outcome ?? "")) {
    try { const original = await readRetryState(entry); if (!original || runStillActive(original)) { change(entry, { notice: "原会话仍待核对，暂不新建会话；现有输入与结果保留。" }); return false; } }
    catch { change(entry, { notice: "原会话状态未读到，暂不新建会话。" }); return false; }
  }
  if (!entry.current()) return false;
  stopAssistantChat(entry); entry.serial += 1; entry.restoreSerial += 1; entry.runEntity = null;
  entry.chat.messages = []; entry.chat.clearError(); change(entry, { ...emptyView(), generation: entry.view.generation + 1 }); removeAiContinuity(`chat:${entry.key}`, entry.current);
  return true;
}

registerWorkspaceScopeCleanup(() => { for (const entry of chats.values()) { entry.serial += 1; entry.restoreSerial += 1; entry.controller?.abort(); void entry.chat.stop(); entry.chat.messages = []; entry.listeners.clear(); } chats.clear(); });

export function restoreAssistantChatDiscussion(entry: AssistantChatLease, recovery: { messages: UIMessage[]; expiresAt: number }) {
  if (!entry.current() || entry.chat.messages.length || !recovery.messages.length || recovery.expiresAt <= Date.now()) return;
  entry.chat.messages = recovery.messages as AssistantUIMessage[];
  change(entry, { notice: "旧会话已恢复为讨论记录；实际操作以已保存提案为准。" });
  entry.view = { ...entry.view, updatedAt: recovery.expiresAt - ttl };
}
