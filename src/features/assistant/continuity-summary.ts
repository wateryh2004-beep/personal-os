import "server-only";

import { z } from "zod";
import type { requireOwnerApi } from "@/lib/auth/require-owner";
import { continuitySummaryDomains, type ContinuitySummary, type ContinuitySummaryDomain, type ContinuitySummaryEntry } from "./continuity-summary-contracts";
import type { AiResumeTarget } from "./client-chat-contracts";

type Owner = Awaited<ReturnType<typeof requireOwnerApi>>;
type Row = Record<string, unknown>;
type Read = { rows: Row[]; error: boolean; truncated: boolean };
const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
function iso(row: Row, key = "updated_at") { const value = instant.safeParse(row[key]); return value.success ? value.data : null; }
async function read(query: PromiseLike<{ data: unknown; error: unknown }>, limit = 20): Promise<Read> {
  try {
    const value = await query;
    if (value.error || !Array.isArray(value.data)) return { rows: [], error: true, truncated: false };
    const valid = value.data.every(row => row && typeof row === "object" && !Array.isArray(row));
    return valid ? { rows: value.data.slice(0, limit) as Row[], error: false, truncated: value.data.length > limit } : { rows: [], error: true, truncated: false };
  } catch { return { rows: [], error: true, truncated: false }; }
}
/** Read-only status directory. Never loads content, provider handles or invokes a reconciler. */
export async function readContinuitySummary(owner: Owner, now = new Date()): Promise<ContinuitySummary> {
  const { supabase: db, userId } = owner;
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const results = new Map<ContinuitySummaryDomain, Read>();
  const reads = await Promise.allSettled([
    read(db.from("agent_runs").select("id,surface,status,current_entity_type,current_entity_id,updated_at,completed_at").eq("user_id", userId).gte("updated_at", since).order("updated_at", { ascending: false }).order("id").limit(21)),
    read(db.from("document_ocr_jobs").select("document_id,status,pages_completed,page_count,updated_at").eq("user_id", userId).gte("updated_at", since).order("updated_at", { ascending: false }).order("document_id").limit(21)),
    read(db.from("file_upload_sessions").select("id,document_id,status,updated_at").eq("user_id", userId).gte("updated_at", since).order("updated_at", { ascending: false }).order("id").limit(21)),
    read(db.from("documents").select("id,storage_state,updated_at").eq("user_id", userId).eq("upload_mode", "single").eq("storage_state", "pending").is("vault_group_id", null).is("archived_at", null).gte("updated_at", since).order("updated_at", { ascending: false }).order("id").limit(21)),
    read(db.from("briefings").select("id,briefing_date,status,updated_at,generated_at,ranking_method").eq("user_id", userId).gte("updated_at", since).order("updated_at", { ascending: false }).order("id").limit(21)),
    read(db.from("inbox_items").select("id,ai_status,ai_updated_at,ai_classification_started_at,updated_at").eq("user_id", userId).is("archived_at", null).is("processed_at", null).gte("updated_at", since).order("updated_at", { ascending: false }).order("id").limit(21)),
    read(db.from("review_proposals").select("id,review_id,status,created_at,resolved_at").eq("user_id", userId).eq("status", "pending").gte("created_at", since).order("created_at", { ascending: false }).order("id").limit(21)),
  ]);
  const kinds = ["agent-runs", "ocr", "uploads", "single-uploads", "briefing", "inbox", "review-proposals"] as const;
  reads.forEach((result, index) => results.set(kinds[index], result.status === "fulfilled" ? result.value : { rows: [], error: true, truncated: false }));
  const runs = results.get("agent-runs")!;
  const runIds = runs.rows.map(row => row.id).filter((id): id is string => uuid.safeParse(id).success);
  // Actions are dependent on precisely the visible run set, not a separate all-actions read.
  results.set("agent-actions", runs.error ? { rows: [], error: true, truncated: false } : runIds.length ? await read(db.from("agent_actions").select("id,run_id,status,expires_at,updated_at").eq("user_id", userId).in("run_id", runIds).in("status", ["proposed", "approved", "executing", "failed", "conflict"]).order("updated_at", { ascending: false }).order("id").limit(21)) : { rows: [], error: false, truncated: false });
  const documentIds = [...new Set([...(results.get("ocr")?.rows ?? []), ...(results.get("uploads")?.rows ?? [])].map(row => row.document_id).filter((id): id is string => uuid.safeParse(id).success))];
  const documents = documentIds.length ? await read(db.from("documents").select("id,storage_state").eq("user_id", userId).in("id", documentIds).is("vault_group_id", null).is("archived_at", null).limit(41), 40) : { rows: [], error: false, truncated: false };
  // Parent reads have a separate maximum 40, rather than the per-domain 20 output cap.
  const visibleDocuments = new Set(documents.rows.map(row => row.id));
  const entries: ContinuitySummaryEntry[] = [];
  const targets = new Map<string, AiResumeTarget>();
  let skipped = false;
  const append = (kind: ContinuitySummaryDomain, sourceId: unknown, target: AiResumeTarget | null, label: string, href: string, status: ContinuitySummaryEntry["status"], phase: string, updatedAt: string | null) => {
    if (!uuid.safeParse(sourceId).success || !updatedAt) { skipped = true; return; }
    entries.push({ id: `${kind}:${sourceId}`, sourceId: sourceId as string, kind, target, label, href, status, phase, updatedAt });
  };
  for (const row of runs.rows) {
    let target: AiResumeTarget | null = null, href = "/today", label = "AI 会话";
    if (row.surface === "career" && row.current_entity_type === "experience" && uuid.safeParse(row.current_entity_id).success) { target = { kind: "chat", identity: { surface: "career", experienceId: row.current_entity_id as string }, runId: row.id as string }; href = `/career/experiences/${row.current_entity_id}`; label = "职业 AI 分析"; }
    else if (["global", "notes-library", "tasks", "calendar"].includes(String(row.surface))) {
      const surface = row.surface as "global" | "notes-library" | "tasks" | "calendar";
      target = { kind: "chat", identity: { surface }, runId: row.id as string }; href = surface === "global" ? "/today" : surface === "notes-library" ? "/notes/ask" : `/${surface}`;
      label = surface === "notes-library" ? "笔记库 AI 会话" : surface === "tasks" ? "任务 AI 会话" : surface === "calendar" ? "日历 AI 会话" : "全局 AI 会话";
    } else if (row.surface === "notes" && row.current_entity_type === "note" && uuid.safeParse(row.current_entity_id).success) { target = { kind: "note-history", noteId: row.current_entity_id as string, runId: row.id as string }; href = `/notes/${row.current_entity_id}`; label = "笔记 AI 讨论历史"; }
    if (!target) { skipped = true; continue; }
    targets.set(String(row.id), target);
    append("agent-runs", row.id, target, label, href, row.status === "completed" || row.status === "awaiting_approval" ? "succeeded" : row.status === "failed" ? "failed" : row.status === "cancelled" ? "interrupted" : "needs-check", row.status === "completed" || row.status === "awaiting_approval" ? "历史结果可查看，提案仍需逐项确认" : "上次生成状态待核对；没有证明仍在运行", iso(row));
  }
  for (const row of results.get("agent-actions")!.rows) {
    const target = targets.get(String(row.run_id)); if (!target) continue;
    const run = entries.find(entry => entry.kind === "agent-runs" && entry.sourceId === row.run_id); if (!run) continue;
    append("agent-actions", row.id, target, "AI 操作提案", run.href, row.status === "failed" || row.status === "conflict" ? "failed" : "needs-check", row.status === "proposed" && typeof row.expires_at === "string" && Date.parse(row.expires_at) <= now.getTime() ? "提案已过期，返回原会话核对" : row.status === "proposed" ? "待逐项确认，尚未执行" : "操作结果待核对，不会自动重发", iso(row));
  }
  for (const kind of ["ocr", "uploads"] as const) {
    const result = results.get(kind)!;
    if (documents.error) { results.set(kind, { ...result, rows: [], error: true }); continue; }
    for (const row of result.rows) {
      if (!visibleDocuments.has(row.document_id)) continue;
      const done = kind === "ocr" ? row.status === "completed" : row.status === "uploaded" && documents.rows.some(document => document.id === row.document_id && document.storage_state === "available");
      append(kind, kind === "ocr" ? row.document_id : row.id, null, kind === "ocr" ? "文件文字识别" : "文件上传", "/files", done ? "succeeded" : row.status === "failed" ? "failed" : "needs-check", done ? "已有完成记录，可返回文件查看" : "上次状态待核对；浏览器关闭后需重新选择原件或继续识别", iso(row));
    }
  }
  for (const row of results.get("single-uploads")!.rows) append("single-uploads", row.id, null, "文件上传", "/files", "needs-check", "原件尚未确认可用，返回文件核对并重新选择原件", iso(row));
  for (const row of results.get("briefing")!.rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.briefing_date))) { skipped = true; continue; }
    append("briefing", row.id, { kind: "briefing-generation", localDate: row.briefing_date as string }, "简报生成", "/briefing", row.status === "completed" ? "succeeded" : row.status === "failed" ? "failed" : "needs-check", row.status === "completed" ? row.ranking_method === "ai_hybrid" ? "简报可查看，采用 AI 辅助筛选" : "简报可查看，采用规则筛选" : "服务器记录待核对，不自动重新生成", iso(row));
  }
  for (const row of results.get("inbox")!.rows) {
    if (!row.ai_status && !row.ai_classification_started_at) continue;
    append("inbox", row.id, { kind: "inbox-classification", inboxId: row.id as string }, "Inbox 识别", "/inbox", row.ai_classification_started_at ? "needs-check" : row.ai_status === "ready" ? "succeeded" : row.ai_status === "failed" ? "failed" : "needs-check", row.ai_classification_started_at ? "本次识别结果尚未核对，旧建议仍需查看" : row.ai_status === "ready" ? "去向建议可查看，原记录尚待处理" : "记录仍保留，识别结果可返回核对", iso(row));
  }
  for (const row of results.get("review-proposals")!.rows) {
    if (!uuid.safeParse(row.review_id).success) { skipped = true; continue; }
    append("review-proposals", row.id, { kind: "review-proposals", reviewId: row.review_id as string }, "复盘长期信息候选", `/reviews/${row.review_id}`, "needs-check", "待逐项审核，尚未写入记忆或决定", iso(row, "created_at"));
  }
  entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  const coverage = continuitySummaryDomains.map(kind => {
    const value = results.get(kind)!;
    return { kind, checked: !value.error, count: value.rows.length, truncated: value.truncated, error: value.error ? kind === "agent-actions" && runs.error ? "dependency-unavailable" as const : "unavailable" as const : null };
  });
  return { entries: entries.slice(0, 40), coverage, checkedAt: now.toISOString(), partial: skipped || coverage.some(item => !item.checked), truncated: entries.length > 40 || coverage.some(item => item.truncated) };
}
