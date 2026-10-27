"use client";

import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import type { AiActionFixtureTransport } from "./ai-action-fixtures";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { dismissBackgroundOperation, reconcileBackgroundOperation, startBackgroundOperation, type BackgroundOperationStatus } from "@/features/workflow-continuity/background-operations";
import { generateNoteAiSuggestion, type NoteAiState } from "@/features/notes/ai-actions";
import type { NoteAiOperation } from "@/features/notes/ai-prompts";
import { generateReviewDraft, generateReviewProposals, readReviewProposalGeneration } from "@/features/reviews/actions";
import { reclassifyInboxItem, readInboxClassificationState } from "@/features/inbox/actions";
import { generateBriefingAction, ensureTodayBriefingAction, readBriefingGenerationAction } from "@/features/briefing/actions";
import { initialBriefingGenerationState } from "@/features/briefing/feedback";
import type { BriefingGenerationState } from "@/features/briefing/types";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";
import type { ReviewStructuredData } from "@/features/reviews/types";
import type { AiResumeTarget } from "./client-chat-contracts";
import { publishAiContinuity, removeAiContinuity } from "./ai-continuity";

export type NoteAiBaseline = { scopeToken: string; noteId: string; revision: number; title: string; sourceMarkdown: string; role: "main" | "reference"; selection: { from: number; to: number; text: string } | null };
export type NoteAiOperationInput = { kind: "note-suggestion"; id: string; baseline: NoteAiBaseline; operation: NoteAiOperation; scope: "note" | "selection"; content: string; model: DeepSeekModelId; instruction?: string; contextBefore?: string; contextAfter?: string; usePersonalContext: boolean; runId: string | null; history: Array<{ role: "user" | "assistant"; content: string }>; continuationAfter?: string };
export type ReviewDraftOperationInput = { kind: "review-draft"; id: string; reviewType: "daily" | "weekly"; periodStart: string; periodEnd: string; timezone: string; baseline: ReviewStructuredData };
export type AiActionInput = NoteAiOperationInput | ReviewDraftOperationInput |
  { kind: "review-proposals"; id: string; reviewId: string } |
  { kind: "inbox-classification"; id: string; inboxId: string } |
  { kind: "today-summary"; id: string; localDate: string; sourceFingerprint: string } |
  { kind: "briefing-generation"; id: string; localDate: string; mode: "manual" | "ensure" };
type ResultMap = {
  "note-suggestion": NoteAiState;
  "review-draft": Awaited<ReturnType<typeof generateReviewDraft>>;
  "review-proposals": Awaited<ReturnType<typeof generateReviewProposals>>;
  "inbox-classification": Awaited<ReturnType<typeof reclassifyInboxItem>>;
  "today-summary": { summary: string; localDate: string; sourceFingerprint: string };
  "briefing-generation": BriefingGenerationState | { started: boolean; reason?: "date-changed" };
};
export type AiActionResult = ResultMap[AiActionInput["kind"]];
export type AiActionKind = AiActionInput["kind"];
export type AiActionRecord<K extends AiActionKind = AiActionKind> = { id: string; backgroundOperationId?: string; kind: K; input: Extract<AiActionInput, { kind: K }>; result: ResultMap[K] | null; status: BackgroundOperationStatus; error: string | null; updatedAt: number; selectedHunks: number[]; consumed: boolean; current: () => boolean; completion: Promise<void> };
const records = new Map<string, AiActionRecord>();
const fixtureTransports = new Map<string, AiActionFixtureTransport>();
const listeners = new Set<() => void>();
const empty: readonly AiActionRecord[] = [];
let snapshots = empty;
function emit() { snapshots = [...records.values()]; for (const listener of listeners) listener(); }
export const subscribeAiActionRecords = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getAiActionRecords = () => snapshots;
export const getAiActionServerRecords = () => empty;

function targetFor(input: AiActionInput): AiResumeTarget {
  switch (input.kind) {
    case "note-suggestion": return { kind: input.kind, noteId: input.baseline.noteId, proposalId: input.id };
    case "review-draft": return { kind: input.kind, reviewType: input.reviewType, periodStart: input.periodStart, proposalId: input.id };
    case "review-proposals": return { kind: input.kind, reviewId: input.reviewId };
    case "inbox-classification": return { kind: input.kind, inboxId: input.inboxId };
    case "today-summary": return { kind: input.kind, localDate: input.localDate, sourceFingerprint: input.sourceFingerprint };
    case "briefing-generation": return { kind: input.kind, localDate: input.localDate };
  }
}
function operationHref(input: AiActionInput) { switch (input.kind) { case "note-suggestion": return `/notes/${input.baseline.noteId}`; case "review-draft": return `/reviews/${input.reviewType}`; case "review-proposals": return `/reviews/${input.reviewId}`; case "inbox-classification": return "/inbox"; case "today-summary": return "/today"; case "briefing-generation": return "/briefing"; } }
const labels: Record<AiActionKind, string> = { "note-suggestion": "笔记 AI 建议", "review-draft": "复盘 AI 草稿", "review-proposals": "复盘长期信息候选", "inbox-classification": "Inbox 重新识别", "today-summary": "今日 AI 总结", "briefing-generation": "今日简报生成" };
async function execute(input: AiActionInput): Promise<ResultMap[AiActionKind]> {
  switch (input.kind) {
    case "note-suggestion": {
      const data = new FormData();
      for (const [key, value] of Object.entries({ note_id: input.baseline.noteId, title: input.baseline.title, content: input.content, operation: input.operation, scope: input.scope, model: input.model, use_personal_context: String(input.usePersonalContext), run_id: input.runId, history: JSON.stringify(input.history), instruction: input.instruction, context_before: input.contextBefore, context_after: input.contextAfter, continuation_after: input.continuationAfter })) if (value != null) data.set(key, value);
      return generateNoteAiSuggestion(data);
    }
    case "review-draft": return generateReviewDraft({ type: input.reviewType, periodStart: input.periodStart, periodEnd: input.periodEnd, timezone: input.timezone });
    case "review-proposals": return generateReviewProposals(input.reviewId);
    case "inbox-classification": { const data = new FormData(); data.set("inbox_id", input.inboxId); return reclassifyInboxItem({ status: "idle", message: "" }, data); }
    case "today-summary": {
      const response = await fetch("/api/today/brief-synthesis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ localDate: input.localDate, sourceFingerprint: input.sourceFingerprint }) });
      const value = await response.json() as { summary?: string; localDate?: string; sourceFingerprint?: string };
      if (!response.ok || !value.summary || value.localDate !== input.localDate || value.sourceFingerprint !== input.sourceFingerprint) throw new Error("today_summary_not_matched");
      return { summary: value.summary, localDate: value.localDate, sourceFingerprint: value.sourceFingerprint };
    }
    case "briefing-generation": return input.mode === "ensure" ? ensureTodayBriefingAction(input.localDate) : generateBriefingAction(initialBriefingGenerationState, input.localDate);
  }
}
function resultFailed(result: ResultMap[AiActionKind]) { return ("status" in result && result.status === "error") || ("ok" in result && result.ok === false); }
function domainKey(input: AiActionInput) {
  switch (input.kind) {
    case "note-suggestion": return `note:${input.baseline.noteId}:${input.baseline.role}`;
    case "review-draft": return `review:${input.reviewType}:${input.periodStart}:${input.timezone}`;
    case "review-proposals": return `proposals:${input.reviewId}`;
    case "inbox-classification": return `classify:${input.inboxId}`;
    case "today-summary": return `today:${input.localDate}:${input.sourceFingerprint}`;
    case "briefing-generation": return `briefing:${input.localDate}`;
  }
}
export function startAiAction(input: AiActionInput, fixtureTransport?: AiActionFixtureTransport): AiActionRecord {
  assertContinuousFixtureTransport(fixtureTransport);
  const frozen = structuredClone(input);

  const existing = records.get(input.id);
  if (existing?.current()) return existing;
  const prior = [...records.values()].find(record => record.current() && domainKey(record.input) === domainKey(frozen) && record.status === "running");
  if (prior) return prior;
  if (["review-proposals", "briefing-generation", "inbox-classification"].includes(input.kind) && [...records.values()].some(record => record.current() && domainKey(record.input) === domainKey(frozen) && record.status === "needs-check")) throw new Error("上次请求结果待核对，请先查看或核对原结果，不会重复生成。");
  const current = captureWorkspaceScope();
  for (const [id, record] of records) if (!record.current() || record.consumed || (record.status !== "running" && record.updatedAt + (record.kind === "note-suggestion" ? 86_400_000 : 900_000) <= Date.now())) { removeAiContinuity(`action:${id}`, current); records.delete(id); fixtureTransports.delete(id); }
  const encoded = JSON.stringify(frozen).length;
  const reservation = (kind: AiActionKind) => kind === "note-suggestion" ? 800_000 : 400_000;
  const used = [...records.values()].reduce((total, record) => total + JSON.stringify(record.input).length + (record.status === "running" ? reservation(record.kind) : JSON.stringify(record.result).length), 0);
  if (records.size >= 40 || encoded + reservation(input.kind) + used > 2_097_152) throw new Error("本标签页的建议恢复容量已满，请先处理一份已有建议；当前输入保留。");
  const record: AiActionRecord = { id: input.id, kind: input.kind, input: frozen, result: null, status: "running", error: null, updatedAt: Date.now(), selectedHunks: [], consumed: false, current, completion: Promise.resolve() };
  if (fixtureTransport) fixtureTransports.set(input.id, fixtureTransport);
  records.set(record.id, record); emit();
  const update = (change: Partial<AiActionRecord>, backgroundOperationId?: string) => {
    if (!current() || records.get(record.id)?.current !== current) return;
    const value = { ...records.get(record.id)!, ...change, ...(backgroundOperationId ? { backgroundOperationId } : {}), updatedAt: Date.now() };
    records.set(record.id, value); emit();
    publishAiContinuity({ id: `action:${record.id}`, backgroundOperationId, target: targetFor(frozen), href: operationHref(frozen), label: labels[frozen.kind], status: value.status, phase: value.error ?? (value.status === "running" ? "正在生成，可切换页面" : value.status === "succeeded" ? value.result && "started" in value.result && !value.result.started ? "当前设置或日期未启动生成" : "结果可查看，尚未写入正文或执行提案" : "结果待核对，原输入保留"), updatedAt: value.updatedAt, expiresAt: value.updatedAt + (input.kind === "note-suggestion" ? 86_400_000 : 900_000) }, current);
  };
  let operationId: string | undefined;
  try {
    const operation = startBackgroundOperation({ kind: "assistant", label: labels[frozen.kind], href: operationHref(frozen), cancellable: false, run: async () => {
      try {
        const result = fixtureTransport ? await fixtureTransport.execute(frozen) : await execute(frozen);
        if (!current()) return { status: "needs-check" };
        if ("needsCheck" in result && result.needsCheck) { update({ result, status: "needs-check", error: result.message }, operationId); return { status: "needs-check", phase: "生成结果待核对，不会重复发送" }; }
        if (resultFailed(result)) { update({ result, status: "failed", error: "本次生成未完成，原输入和已有内容保留。" }, operationId); throw new Error("ai_action_failed"); }
        update({ result, status: "succeeded" }, operationId);
        return { status: "succeeded", phase: "started" in result && !result.started ? "当前设置未启动自动生成" : "结果可返回查看，仍需手动采纳或确认" };
      } catch {
        if (records.get(record.id)?.status === "failed") throw new Error("ai_action_failed");
        if (current() && records.get(record.id)?.status === "running") update({ status: "needs-check", error: "请求结果尚未核对，返回原页面查看；不会自动重发。" }, operationId);
        return { status: "needs-check", phase: "请求结果待核对" };
      }
    } });
    operationId = operation.id; update({}, operationId);
    record.completion = operation.completion;
    const currentRecord = records.get(record.id); if (currentRecord) records.set(record.id, { ...currentRecord, completion: operation.completion });
    return records.get(record.id)!;
  } catch (error) { records.delete(record.id); emit(); throw error; }
}
export function updateNoteAiAction(id: string, change: { selectedHunks: number[] }) {
  const record = records.get(id);
  if (!record?.current() || record.kind !== "note-suggestion") return;
  records.set(id, { ...record, selectedHunks: [...new Set(change.selectedHunks.filter(value => Number.isSafeInteger(value) && value >= 0))].slice(0, 1000), updatedAt: Date.now() }); emit();
}
export function toggleNoteAiHunk(id: string, hunk: number, checked: boolean) {
  const record = records.get(id); if (!record?.current() || record.kind !== "note-suggestion") return;
  updateNoteAiAction(id, { selectedHunks: checked ? [...record.selectedHunks, hunk] : record.selectedHunks.filter(value => value !== hunk) });
}
/** Explicitly consumed/dismissed suggestions release text, not business history. */
export function consumeAiAction(id: string) {
  const record = records.get(id);
  if (!record?.current() || record.status === "running") return;
  let input = record.input;
  if (input.kind === "note-suggestion") input = { ...input, baseline: { ...input.baseline, title: "", sourceMarkdown: "", selection: null }, content: "", instruction: undefined, history: [], contextBefore: undefined, contextAfter: undefined, continuationAfter: undefined };
  else if (input.kind === "review-draft") input = { ...input, baseline: { wins: [], friction: [], openLoops: [], changes: [], lessons: [], nextFocus: [], freeReflection: "" } };
  records.set(id, { ...record, input, result: null, consumed: true, selectedHunks: [], updatedAt: Date.now() });
  if (record.backgroundOperationId) dismissBackgroundOperation(record.backgroundOperationId);
  fixtureTransports.delete(id);
  removeAiContinuity(`action:${id}`, record.current); emit();
}
export function discardAiAction(id: string) { const record = records.get(id); if (record?.current() && record.status !== "running") { records.delete(id); removeAiContinuity(`action:${id}`, record.current); emit(); } }
export async function reconcileAiAction(id: string): Promise<boolean> {
  const record = records.get(id);
  if (!record?.current() || record.status === "running") return false;
  const input = record.input;
  let result: ResultMap[AiActionKind] | null = null;
  if (input.kind === "briefing-generation") {
    const value = await (fixtureTransports.get(id)?.readBriefing ?? readBriefingGenerationAction)(input.localDate);
    if (value?.status === "completed") result = { status: value.ranking_method === "ai_hybrid" ? "success" : "warning", message: value.ranking_method === "ai_hybrid" ? "已核对本日简报，采用 AI 辅助筛选。" : "已核对本日简报，采用规则筛选。", selected: value.selected_count, candidateCount: value.candidate_count, feedsRefreshed: null, feedsFailed: null };
  } else if (input.kind === "review-proposals") {
    const value = await (fixtureTransports.get(id)?.readReviewProposals ?? readReviewProposalGeneration)(input.reviewId);
    if (value.pendingIds.length) result = { alreadyPending: true, created: 0 };
  } else if (input.kind === "inbox-classification") {
    const value = await (fixtureTransports.get(id)?.readInboxClassification ?? readInboxClassificationState)(input.inboxId);
    if (value.status !== "needs-check") result = { status: "success", message: value.processed ? "该记录已处理，旧识别不会重新应用。" : value.status === "ready" ? "当前去向已读取，请在原记录确认。" : "记录已保存，识别未完成，可手动选择去向。" };
  }
  if (!result || !record.current() || records.get(id)?.current !== record.current) return false;
  const next = { ...records.get(id)!, result, status: "succeeded" as const, error: null, updatedAt: Date.now() };
  records.set(id, next); emit();
  if (record.backgroundOperationId) reconcileBackgroundOperation(record.backgroundOperationId, "succeeded", "已读取权威结果，请返回原记录核对");
  publishAiContinuity({ id: `action:${id}`, target: targetFor(input), label: labels[input.kind], href: operationHref(input), status: "succeeded", phase: "已读取权威结果，返回原记录核对", updatedAt: next.updatedAt, expiresAt: next.updatedAt + 900_000 }, record.current);
  return true;
}
export async function reconcileReviewProposalAction(reviewId: string, fixtureTransport?: AiActionFixtureTransport) { assertContinuousFixtureTransport(fixtureTransport); return (fixtureTransport?.readReviewProposals ?? readReviewProposalGeneration)(reviewId); }
registerWorkspaceScopeCleanup(() => { records.clear(); fixtureTransports.clear(); emit(); });
