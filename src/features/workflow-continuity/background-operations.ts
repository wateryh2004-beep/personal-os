"use client";

import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";

export type BackgroundOperationKind = "upload" | "ocr" | "export" | "assistant";
export type BackgroundOperationStatus = "running" | "succeeded" | "failed" | "cancelled" | "interrupted" | "needs-check";
export type BackgroundOperationProgress = { phase: string; completed?: number; total?: number; unit?: "bytes" | "pages" | "items" };
export type BackgroundOperationSnapshot = BackgroundOperationProgress & {
  id: string; kind: BackgroundOperationKind; label: string; href: string;
  status: BackgroundOperationStatus; startedAt: number; updatedAt: number;
  canCancel: boolean; canRetry: boolean;
};
export type BackgroundOperationContext = { signal: AbortSignal; current: () => boolean; report: (progress: BackgroundOperationProgress) => void };
export type BackgroundOperationResult = void | { status: "succeeded" | "needs-check" | "interrupted"; phase?: string };
export type BackgroundOperationRunner = (context: BackgroundOperationContext) => Promise<BackgroundOperationResult>;
export type BackgroundOperationOptions = {
  kind: BackgroundOperationKind; label: string; href: string; run: BackgroundOperationRunner;
  /** Supply only when the domain reconciles uncertain remote writes before retrying. */
  retry?: BackgroundOperationRunner; cancellable?: boolean;
};
type Runtime = { token: symbol; controller: AbortController; current: () => boolean; retry?: BackgroundOperationRunner };
const records = new Map<string, BackgroundOperationSnapshot>();
const runtimes = new Map<string, Runtime>();
const listeners = new Set<() => void>();
const empty: BackgroundOperationSnapshot[] = [];
let snapshot = empty;
const publish = () => { snapshot = [...records.values()].sort((a, b) => b.startedAt - a.startedAt); listeners.forEach(listener => listener()); };
export const subscribeBackgroundOperations = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getBackgroundOperations = () => snapshot;
export const getBackgroundOperationsServerSnapshot = () => empty;
function boundedProgress(progress: BackgroundOperationProgress): BackgroundOperationProgress {
  const phase = progress.phase.slice(0, 160);
  const completed = progress.completed;
  const total = progress.total;
  if (typeof completed !== "number" || !Number.isFinite(completed) || completed < 0 || typeof total !== "number" || !Number.isFinite(total) || total <= 0 || completed > total) return { phase, completed: undefined, total: undefined, unit: undefined };
  return { phase, completed, total, unit: progress.unit };
}
async function execute(id: string, runner: BackgroundOperationRunner, retry?: BackgroundOperationRunner) {
  const controller = new AbortController();
  const token = Symbol(id);
  const currentScope = captureWorkspaceScope();
  const current = () => currentScope() && runtimes.get(id)?.token === token;
  runtimes.set(id, { token, controller, current, retry });
  const update = (change: Partial<BackgroundOperationSnapshot>) => {
    const previous = records.get(id);
    if (!current() || !previous) return;
    records.set(id, { ...previous, ...change, updatedAt: Date.now() }); publish();
  };
  update({ status: "running", canRetry: false });
  try {
    const result = await runner({ signal: controller.signal, current, report: progress => update(boundedProgress(progress)) });
    // A domain's authoritative result wins a late cancellation signal: the
    // remote commit may already exist. An unconfirmed abort needs reconciliation.
    update({ status: result?.status ?? (controller.signal.aborted ? "needs-check" : "succeeded"), phase: result?.phase ?? (controller.signal.aborted ? "已请求停止，结果待核对" : "已完成"), canCancel: false, canRetry: false });
  } catch {
    update({ status: controller.signal.aborted ? "needs-check" : "failed", phase: controller.signal.aborted ? "已请求停止，结果待核对" : "未完成，可返回查看原因", canCancel: false, canRetry: !controller.signal.aborted && Boolean(retry) });
  } finally {
    if (current()) {
      const record = records.get(id);
      // Only failed, explicitly retryable domain operations retain their runner.
      if (!record?.canRetry) runtimes.delete(id);
    }
  }
}
export function startBackgroundOperation(options: BackgroundOperationOptions) {
  if (typeof window === "undefined") throw new Error("background_operation_requires_browser");
  if (!options.href.startsWith("/") || options.href.startsWith("//") || /[\r\n]/.test(options.href)) throw new Error("background_operation_invalid_href");
  for (const [id, record] of records) {
    if (records.size < 40) break;
    if (record.status !== "running") { records.delete(id); runtimes.delete(id); }
  }
  if (records.size >= 40) throw new Error("background_operation_capacity");
  const id = crypto.randomUUID();
  records.set(id, { id, kind: options.kind, label: options.label.slice(0, 100), href: options.href, status: "running", phase: "正在准备", startedAt: Date.now(), updatedAt: Date.now(), canCancel: options.cancellable !== false, canRetry: false });
  publish();
  const completion = execute(id, options.run, options.retry);
  return { id, completion, cancel: () => cancelBackgroundOperation(id) };
}
export function cancelBackgroundOperation(id: string) {
  const record = records.get(id); const runtime = runtimes.get(id);
  if (!record?.canCancel || !runtime?.current()) return false;
  runtime.controller.abort(); return true;
}
export function retryBackgroundOperation(id: string) {
  const record = records.get(id); const runtime = runtimes.get(id);
  if (!record?.canRetry || record.status !== "failed" || !runtime?.current() || !runtime.retry) return false;
  void execute(id, runtime.retry, runtime.retry); return true;
}
export function dismissBackgroundOperation(id: string) {
  if (records.get(id)?.status === "running") return;
  records.delete(id); runtimes.delete(id); publish();
}
/** Only a domain reconciler with the current scope may refine a terminal observation. */
export function reconcileBackgroundOperation(id: string, status: "failed" | "needs-check" | "succeeded", phase: string) {
  const record = records.get(id);
  if (!record || record.status === "running") return false;
  records.set(id, { ...record, status, phase: phase.slice(0, 160), updatedAt: Date.now() }); publish(); return true;
}
registerWorkspaceScopeCleanup(() => {
  runtimes.forEach(runtime => runtime.controller.abort());
  runtimes.clear(); records.clear(); publish();
});
