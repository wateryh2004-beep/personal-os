import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { domainContracts, retryAfter, safeErrorSummary, type SystemDomain, type SystemEventType, type SystemState } from "./contracts";

type StatusInput = {
  state: SystemState;
  lastSuccessAt?: string | null;
  lastAttemptAt?: string | null;
  retryAfter?: string | null;
  retryAttempt?: number;
  errorCode?: string | null;
  errorSummary?: string | null;
  conflictSummary?: string | null;
  nextStep?: string | null;
};

/**
 * Operational telemetry is best-effort: a status write must never turn a
 * successful Calendar/To Do/Files operation into a user-visible failure.
 */
export async function recordDomainStatus(userId: string, domain: SystemDomain, input: StatusInput) {
  const contract = domainContracts[domain];
  const admin = createAdminClient();
  await admin.from("system_domain_statuses").upsert({
    user_id: userId,
    domain,
    state: input.state,
    authority_source: contract.authoritySource,
    replica_role: contract.replicaRole,
    sync_direction: contract.syncDirection,
    refresh_interval_seconds: contract.refreshIntervalSeconds,
    last_success_at: input.lastSuccessAt ?? null,
    last_attempt_at: input.lastAttemptAt ?? null,
    retry_after: input.retryAfter ?? null,
    retry_attempt: input.retryAttempt ?? 0,
    error_code: input.errorCode ?? null,
    error_summary: input.errorSummary ? safeErrorSummary(input.errorSummary) : null,
    conflict_summary: input.conflictSummary ? safeErrorSummary(input.conflictSummary) : null,
    next_step: input.nextStep ? safeErrorSummary(input.nextStep) : null,
  }, { onConflict: "user_id,domain" });
}

export async function recordStatusEvent(userId: string, domain: SystemDomain, eventType: SystemEventType, input: { operationKey?: string; errorCode?: string; errorSummary?: unknown; retryAfter?: string | null } = {}) {
  const admin = createAdminClient();
  const { error } = await admin.from("system_status_events").insert({
    user_id: userId,
    domain,
    event_type: eventType,
    operation_key: input.operationKey ?? null,
    error_code: input.errorCode ?? null,
    error_summary: input.errorSummary ? safeErrorSummary(input.errorSummary) : null,
    retry_after: input.retryAfter ?? null,
  });
  // The idempotency guard is a partial unique index (only keyed operations
  // participate), which PostgREST cannot safely target with an upsert clause.
  // Insert lets PostgreSQL enforce it; a duplicate means the same operation
  // was already recorded and is therefore a successful no-op.
  if (error && error.code !== "23505") throw error;
}

export async function recordStatusSafely(userId: string, domain: SystemDomain, state: StatusInput, event?: Parameters<typeof recordStatusEvent>[3] & { type: SystemEventType }) {
  try {
    let normalizedState = state;
    let normalizedEvent = event;
    if (event?.type === "retry_scheduled") {
      const admin = createAdminClient();
      const { data } = await admin.from("system_domain_statuses").select("retry_attempt").eq("user_id", userId).eq("domain", domain).is("archived_at", null).maybeSingle();
      const attempt = Math.min(30, Number(data?.retry_attempt ?? 0) + 1);
      const nextRetry = retryAfter(attempt);
      normalizedState = { ...state, retryAttempt: attempt, retryAfter: nextRetry };
      normalizedEvent = { ...event, retryAfter: nextRetry };
    }
    await recordDomainStatus(userId, domain, normalizedState);
    if (normalizedEvent) await recordStatusEvent(userId, domain, normalizedEvent.type, normalizedEvent);
  } catch (error) {
    console.error(JSON.stringify({ level: "warn", action: "record_system_status", domain, code: safeErrorSummary(error) }));
  }
}
