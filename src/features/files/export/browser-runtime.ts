"use client";

import { z } from "zod";
import type { ExportPlan } from "./contract";
import { captureWorkspaceScope, clearWorkspaceResources, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { getBackgroundOperations, reconcileBackgroundOperation, startBackgroundOperation } from "@/features/workflow-continuity/background-operations";

type State = { plan: ExportPlan | null; pending: boolean; error: string; message: string; started: number[] };
const initial: State = { plan: null, pending: false, error: "", message: "", started: [] };
let state = initial;
const listeners = new Set<() => void>();
const frames = new Set<HTMLIFrameElement>();
export const getFileExportState = () => state;
export const getFileExportServerSnapshot = () => initial;
export const subscribeFileExport = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const update = (change: Partial<State>) => { state = { ...state, ...change }; listeners.forEach(listener => listener()); };
registerWorkspaceScopeCleanup(() => { frames.forEach(frame => frame.remove()); frames.clear(); state = initial; listeners.forEach(listener => listener()); });
function validPlan(value: unknown): value is ExportPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<ExportPlan>;
  return plan.format === "personal-os-files-plan/v1" && z.string().regex(/^[a-f0-9]{64}$/).safeParse(plan.planId).success && Array.isArray(plan.parts) && plan.parts.length <= 256 && Boolean(plan.counts && plan.storage) &&
    [plan.counts?.documents, plan.counts?.objectBytes, plan.counts?.pending, plan.storage?.availableBytes, plan.storage?.archivedBytes, plan.storage?.possibleDuplicateBytes].every(number => typeof number === "number" && Number.isFinite(number) && number >= 0) &&
    plan.parts.every(part => Number.isInteger(part.partIndex) && part.partIndex >= 1 && Number.isInteger(part.documentCount) && part.documentCount >= 0 && Number.isFinite(part.estimatedBytes) && part.estimatedBytes >= 0);
}
export function prepareFileExport() {
  if (state.pending) return;
  update({ pending: true, error: "", message: "" });
  const execute = async ({ signal, current, report }: Parameters<Parameters<typeof startBackgroundOperation>[0]["run"]>[0]) => {
    if (current()) update({ pending: true, error: "" });
    report({ phase: "正在准备文件导出清单" });
    try {
      const response = await fetch("/api/files/export/plan", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.any([signal, AbortSignal.timeout(240_000)]), cache: "no-store" });
      if (!current()) return { status: "interrupted" as const };
      if (response.status === 401 || response.status === 403) { clearWorkspaceResources(); window.dispatchEvent(new Event("personal-os:workspace-auth-failed")); return { status: "interrupted" as const }; }
      const value: unknown = await response.json();
      if (!response.ok) throw new Error("file_export_plan_failed");
      if (!validPlan(value)) throw new Error("file_export_invalid_response");
      if (!current()) return { status: "interrupted" as const };
      update({ plan: value, started: [], message: "计划已准备。下载各分包后，请一起校验，才算完整副本。" });
      return { status: "succeeded" as const, phase: "导出计划已准备，可返回选择分包" };
    } catch (error) {
      if (current()) update({ error: signal.aborted ? "准备已取消。" : error instanceof Error && error.message === "file_export_invalid_response" ? "导出计划响应无效，请重试。" : "暂时无法准备导出，请重试。" });
      throw error;
    } finally { if (current()) update({ pending: false }); }
  };
  try { startBackgroundOperation({ kind: "export", label: "文件导出计划", href: "/files", run: execute, retry: execute }); }
  catch { update({ pending: false, error: "后台任务已满，请先处理任务托盘中的记录。" }); }
}

/** Native POST attachment streaming stays outside route-owned DOM. No Blob buffering. */
export function startFileExportDownload(partIndex?: number) {
  if (typeof window === "undefined" || state.pending) return;
  if (frames.size >= 8) { update({ error: "已有多个下载响应窗口。请先完成并核对下载，再重新打开本标签页继续。" }); return; }
  const plan = state.plan;
  if (partIndex !== undefined && (!plan || !plan.parts.some(part => part.partIndex === partIndex))) { update({ error: "请重新准备有效的分包计划。" }); return; }
  const current = captureWorkspaceScope();
  let operationId: string | null = null;
  const frame = document.createElement("iframe");
  frame.hidden = true; frame.title = "文件下载响应"; frame.name = `file-export-${crypto.randomUUID()}`;
  frame.addEventListener("load", () => {
    if (!current()) return;
    try {
      const text = frame.contentDocument?.body?.textContent?.trim();
      if (!text) return;
      const value: unknown = JSON.parse(text);
      const result = z.object({ error: z.string().max(300), code: z.string().optional() }).safeParse(value);
      if (!result.success) return;
      if (operationId) reconcileBackgroundOperation(operationId, "failed", "下载返回错误，请返回核对导出计划后重试");
      update({ error: result.data.code === "files_export_plan_changed" ? "清单已变化，请重新生成导出计划。" : "下载未完成，请返回核对导出计划后重试。", message: "", ...(result.data.code === "files_export_plan_changed" ? { plan: null, started: [] } : {}) });
      frame.remove(); frames.delete(frame);
    } catch { /* Attachment responses are owned by the browser download manager. */ }
  });
  document.body.append(frame); frames.add(frame);
  const form = document.createElement("form"); form.method = "post"; form.action = partIndex === undefined ? "/api/files/export" : "/api/files/export/part"; form.target = frame.name; form.hidden = true;
  if (partIndex !== undefined && plan) for (const [name, value] of [["planId", plan.planId], ["partIndex", String(partIndex)]]) { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.append(input); }
  document.body.append(form);
  try {
    const operation = startBackgroundOperation({ kind: "export", label: partIndex === undefined ? "文件单包下载" : `文件导出 · 第 ${partIndex} 包`, href: "/files", cancellable: false, run: async () => {
      HTMLFormElement.prototype.submit.call(form);
      return { status: "needs-check", phase: "下载已发起，完成情况请核对浏览器下载和离线校验" };
    } });
    operationId = operation.id;
    update({ error: "", message: "下载已发起，尚未验证完成。请保留下载的文件，并运行离线校验。", started: partIndex === undefined ? state.started : [...new Set([...state.started, partIndex])] });
  } catch {
    frame.remove(); frames.delete(frame); update({ error: "后台任务已满，下载尚未发起。" });
  } finally { form.remove(); }
}

export function fileExportIsPreparing() { return state.pending && getBackgroundOperations().some(operation => operation.kind === "export" && operation.status === "running"); }
