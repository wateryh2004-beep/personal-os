import { requireOwner } from "@/lib/auth/require-owner";
import { domainContracts, stateForSnapshot, systemDomains, type SystemDomain, type SystemState } from "./contracts";
import { getSystemControlPlane, type SystemControlPlane } from "./control-plane";

export type SystemHealthRow = { domain: SystemDomain; state: SystemState; authoritySource: string; replicaRole: string; syncDirection: string; lastSuccessAt: string | null; lastAttemptAt: string | null; retryAfter: string | null; retryAttempt: number; errorCode: string | null; errorSummary: string | null; conflictSummary: string | null; nextStep: string | null };

export async function getSystemHealth(): Promise<{ rows: SystemHealthRow[]; controlPlane: SystemControlPlane }> {
  const { supabase, userId } = await requireOwner();
  const [statusResult, notesResult, filesResult, briefingResult, aiResult, connectionResult, todoResult] = await Promise.all([
    supabase.from("system_domain_statuses").select("domain,state,authority_source,replica_role,sync_direction,refresh_interval_seconds,last_success_at,last_attempt_at,retry_after,retry_attempt,error_code,error_summary,conflict_summary,next_step").eq("user_id", userId).is("archived_at", null),
    supabase.from("notes").select("updated_at").eq("user_id", userId).is("archived_at", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("documents").select("uploaded_at,storage_state").eq("user_id", userId).eq("storage_provider", "cloudflare_r2").is("archived_at", null).order("uploaded_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("briefings").select("status,updated_at,ai_failure_code").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_provider_settings").select("updated_at").eq("user_id", userId).is("archived_at", null).maybeSingle(),
    supabase.from("calendar_connections").select("status,last_sync_at,last_seen_at,last_error_code").eq("user_id", userId).is("archived_at", null).maybeSingle(),
    supabase.from("microsoft_todo_tasks").select("last_synced_at").eq("user_id", userId).is("archived_at", null).order("last_synced_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const statusRows = new Map((statusResult.data ?? []).map((row) => [row.domain as SystemDomain, row]));
  const now = new Date();
  const rows = systemDomains.map((domain) => {
    const row = statusRows.get(domain);
    const fallback = domainContracts[domain];
    const legacy = legacySnapshot(domain, { notes: notesResult.data, notesError: notesResult.error, files: filesResult.data, filesError: filesResult.error, briefing: briefingResult.data, briefingError: briefingResult.error, ai: aiResult.data, aiError: aiResult.error, connection: connectionResult.data, connectionError: connectionResult.error, todo: todoResult.data, todoError: todoResult.error });
    return {
      domain,
      state: row?.state as SystemState ?? legacy.state ?? stateForSnapshot({ now, refreshIntervalSeconds: fallback.refreshIntervalSeconds }),
      authoritySource: row?.authority_source ?? fallback.authoritySource,
      replicaRole: row?.replica_role ?? fallback.replicaRole,
      syncDirection: row?.sync_direction ?? fallback.syncDirection,
      lastSuccessAt: row?.last_success_at ?? legacy.lastSuccessAt ?? null,
      lastAttemptAt: row?.last_attempt_at ?? null,
      retryAfter: row?.retry_after ?? null,
      retryAttempt: row?.retry_attempt ?? 0,
      errorCode: row?.error_code ?? legacy.errorCode ?? null,
      errorSummary: row?.error_summary ?? legacy.errorSummary ?? null,
      conflictSummary: row?.conflict_summary ?? null,
      nextStep: row?.next_step ?? legacy.nextStep ?? null,
    };
  });
  return { rows, controlPlane: await getSystemControlPlane(userId) };
}

function legacySnapshot(domain: SystemDomain, input: { notes: { updated_at: string } | null; notesError: unknown; files: { uploaded_at: string; storage_state: string } | null; filesError: unknown; briefing: { status: string; updated_at: string; ai_failure_code?: string | null } | null; briefingError: unknown; ai: { updated_at: string } | null; aiError: unknown; connection: { status: string; last_sync_at: string | null; last_seen_at: string | null; last_error_code: string | null } | null; connectionError: unknown; todo: { last_synced_at: string } | null; todoError: unknown }) {
  if (domain === "calendar") {
    if (input.connectionError) return { state: "unavailable" as const, errorSummary: "Calendar 连接状态暂时无法读取。", nextStep: "刷新页面后重试。" };
    if (!input.connection || input.connection.status !== "enabled") return { state: "unavailable" as const, nextStep: "连接 Outlook 后即可同步 Calendar。" };
    if (input.connection.last_error_code) return { state: "failed" as const, lastSuccessAt: input.connection.last_sync_at, errorCode: input.connection.last_error_code, errorSummary: "最近一次 Outlook 同步失败。", nextStep: "在 Calendar 页面手动同步或重新连接。" };
    return { state: stateForSnapshot({ now: new Date(), lastSuccessAt: input.connection.last_sync_at ?? input.connection.last_seen_at, refreshIntervalSeconds: 900 }), lastSuccessAt: input.connection.last_sync_at ?? input.connection.last_seen_at, nextStep: "Calendar 缓存可在 Calendar 页面手动刷新。" };
  }
  if (domain === "tasks") {
    if (input.connectionError || input.todoError) return { state: "unavailable" as const, errorSummary: "Tasks 状态暂时无法读取。", nextStep: "刷新页面后重试。" };
    if (!input.connection || input.connection.status !== "enabled") return { state: "unavailable" as const, nextStep: "连接 Microsoft To Do 后即可同步 Tasks。" };
    if (input.connection.last_error_code) return { state: "failed" as const, lastSuccessAt: input.todo?.last_synced_at ?? null, errorCode: input.connection.last_error_code, errorSummary: "最近一次 Microsoft 同步失败。", nextStep: "在 Tasks 页面手动同步或重新连接。" };
    return { state: stateForSnapshot({ now: new Date(), lastSuccessAt: input.todo?.last_synced_at ?? input.connection.last_seen_at, refreshIntervalSeconds: 900 }), lastSuccessAt: input.todo?.last_synced_at ?? input.connection.last_seen_at, nextStep: "Tasks 缓存可在 Tasks 页面手动刷新。" };
  }
  if (domain === "notes") return input.notesError ? { state: "unavailable" as const, errorSummary: "Notes 状态暂时无法读取。", nextStep: "刷新页面后重试。" } : { state: "fresh" as const, lastSuccessAt: input.notes?.updated_at ?? null, nextStep: "Notes 以 Supabase 为权威，无外部同步。" };
  if (domain === "files") return input.filesError ? { state: "unavailable" as const, errorSummary: "Files 状态暂时无法读取。", nextStep: "检查 R2 配置和网络后重试。" } : input.files?.storage_state === "available" ? { state: "fresh" as const, lastSuccessAt: input.files.uploaded_at, nextStep: "文件对象以 R2 为权威，元数据保存在 Supabase。" } : { state: "stale" as const, nextStep: "上传或重新验证文件对象。" };
  if (domain === "briefing") return input.briefingError ? { state: "unavailable" as const, errorSummary: "Briefing 状态暂时无法读取。", nextStep: "刷新后重试。" } : input.briefing?.status === "failed" ? { state: "failed" as const, lastSuccessAt: null, errorCode: input.briefing.ai_failure_code ?? "briefing_failed", errorSummary: "最近一次 Briefing 未完成。", nextStep: "在 Briefing 页面重新生成。" } : { state: "fresh" as const, lastSuccessAt: input.briefing?.updated_at ?? null, nextStep: "RSS 内容会在生成 Briefing 时刷新。" };
  if (domain === "ai") return input.aiError ? { state: "unavailable" as const, errorSummary: "AI 设置暂时无法读取。", nextStep: "刷新后重试。" } : input.ai ? { state: "fresh" as const, lastSuccessAt: input.ai.updated_at, nextStep: "模型调用按请求执行，失败不会写入未确认内容。" } : { state: "unavailable" as const, nextStep: "在 Settings 配置 DeepSeek 后启用 AI。" };
  return {};
}
