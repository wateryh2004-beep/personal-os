"use client";

import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import type { CaptureFixtureTransport } from "./capture-fixtures";
import { captureInboxIntent, reconcileInboxCaptureIntent } from "@/features/inbox/actions";
import { captureIntentSchema, type CaptureIntent, type CaptureOutcome } from "@/features/inbox/capture-intents";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { reconcileBackgroundOperation, startBackgroundOperation } from "@/features/workflow-continuity/background-operations";
import { publishAiContinuity } from "./ai-continuity";
export type { CaptureIntent, CaptureOutcome } from "@/features/inbox/capture-intents";

const running = new Map<string, { content: string; current: () => boolean; promise: Promise<CaptureOutcome>; backgroundOperationId?: string; pending: boolean; updatedAt: number }>();
registerWorkspaceScopeCleanup(() => running.clear());
/** The only capture dispatch; form owners must never classify or insert a second time. */
export function submitCapture(input: CaptureIntent, fixtureTransport?: CaptureFixtureTransport): Promise<CaptureOutcome> {
  assertContinuousFixtureTransport(fixtureTransport);
  const parsed = captureIntentSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve({ status: "rejected", intentId: input.intentId, code: "invalid", message: "保存内容或提交标识无效。" });
  const frozen = structuredClone(parsed.data);
  const existing = running.get(frozen.intentId);
  if (existing?.current()) return existing.content === frozen.content ? existing.promise : Promise.resolve({ status: "rejected", intentId: frozen.intentId, code: "conflict", message: "这次提交仍在核对，请保留原输入。" });
  for (const [id, entry] of running) if (!entry.current() || (!entry.pending && entry.updatedAt + 900_000 <= Date.now())) running.delete(id);
  if (running.size >= 40) return Promise.resolve({ status: "rejected", intentId: frozen.intentId, code: "unavailable", message: "本标签页待核对提交已满，当前输入保留。" });
  const current = captureWorkspaceScope();
  let settle!: (result: CaptureOutcome) => void;
  const promise = new Promise<CaptureOutcome>(resolve => { settle = resolve; });
  running.set(frozen.intentId, { content: frozen.content, current, promise, pending: true, updatedAt: Date.now() });
  let outcome: CaptureOutcome = { status: "needs-check", intentId: frozen.intentId, message: "保存结果待核对，原输入和提交标识保留。" };
  const target = { kind: "inbox-capture" as const, intentId: frozen.intentId };
  const metadata = (status: "running" | "succeeded" | "needs-check" | "failed", phase: string, backgroundOperationId?: string) => publishAiContinuity({ id: `capture:${frozen.intentId}`, target, label: "Inbox 捕捉与识别", href: "/inbox", status, phase, backgroundOperationId, updatedAt: Date.now(), expiresAt: Date.now() + 900_000 }, current);
  let id: string | undefined;
  try {
    const operation = startBackgroundOperation({ kind: "assistant", label: "Inbox 捕捉与识别", href: "/inbox", cancellable: false, run: async () => {
      try { outcome = await (fixtureTransport?.submit ?? captureInboxIntent)(frozen); }
      catch { try { outcome = await (fixtureTransport?.reconcile ?? reconcileInboxCaptureIntent)(frozen); } catch { /* Preserve the exact unknown intent, never resend. */ } }
      const status = outcome.status === "saved" ? "succeeded" : outcome.status === "needs-check" ? "needs-check" : "failed";
      metadata(status, outcome.status === "saved" ? "已保存至 Inbox，分类状态可返回查看" : outcome.message, id);
      if (outcome.status === "rejected") throw new Error("capture_rejected");
      return { status: outcome.status === "saved" ? "succeeded" : "needs-check", phase: outcome.status === "saved" ? "已保存至 Inbox" : outcome.message };
    } });
    id = operation.id;
    const entry = running.get(frozen.intentId); if (entry?.promise === promise) running.set(frozen.intentId, { ...entry, backgroundOperationId: id });
    metadata("running", "正在保存并识别，可切换页面", id);
    void operation.completion.finally(() => { if (running.get(frozen.intentId)?.promise === promise) { if (outcome.status === "needs-check") running.set(frozen.intentId, { ...running.get(frozen.intentId)!, content: frozen.content, current, promise, pending: false, updatedAt: Date.now() }); else running.delete(frozen.intentId); } settle(outcome); });
  } catch { running.delete(frozen.intentId); settle({ status: "rejected", intentId: frozen.intentId, code: "unavailable", message: "尚未发出保存请求，输入保留，请稍后重试。" }); }
  return promise;
}
/** Read-only, same UUID and same submitted content. */
export async function reconcileCapture(input: CaptureIntent, fixtureTransport?: CaptureFixtureTransport): Promise<CaptureOutcome> {
  assertContinuousFixtureTransport(fixtureTransport);
  const frozen = structuredClone(input);
  const current = captureWorkspaceScope();
  try {
    const result = await (fixtureTransport?.reconcile ?? reconcileInboxCaptureIntent)(frozen);
    const entry = running.get(frozen.intentId);
    if (current() && (!entry || (entry.current() && entry.content === frozen.content)) && result.status !== "needs-check") {
      const status = result.status === "saved" ? "succeeded" : "failed";
      const phase = result.status === "saved" ? "已核对 Inbox 原记录与分类状态" : result.message;
      if (entry?.backgroundOperationId) reconcileBackgroundOperation(entry.backgroundOperationId, status, phase);
      publishAiContinuity({ id: `capture:${frozen.intentId}`, target: { kind: "inbox-capture", intentId: frozen.intentId }, label: "Inbox 捕捉与识别", href: "/inbox", status, phase, backgroundOperationId: entry?.backgroundOperationId, updatedAt: Date.now(), expiresAt: Date.now() + 900_000 }, current);
      running.delete(frozen.intentId);
    }
    return result;
  }
  catch { return { status: "needs-check", intentId: frozen.intentId, message: "保存结果尚未核对，请保留原提交标识与输入。" }; }
}
/** Domain UI only. The tray/metadata reader must never import submitted text. */
export function getCaptureRecovery(intentId: string): { intent: CaptureIntent; pending: boolean } | null {
  const entry = running.get(intentId);
  if (!entry?.current() || (!entry.pending && entry.updatedAt + 900_000 <= Date.now())) return null;
  return { intent: { intentId, content: entry.content }, pending: entry.pending };
}
