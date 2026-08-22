import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type SystemControlPlane = {
  deployment: {
    environment: "production" | "preview" | "development";
    commit: string | null;
    deploymentId: string | null;
    appUrl: string | null;
  };
  telemetry: { available: boolean; detail: string };
  scheduler: {
    lastRunAt: string | null;
    lastRunFailed: boolean;
    nextScheduledAt: string | null;
    hourlyDeltaState: "fresh" | "stale" | "unavailable";
    hourlyDeltaLastRunAt: string | null;
    detail: string;
  };
  webhook: {
    lastReceivedAt: string | null;
    subscriptionExpiresAt: string | null;
    state: "fresh" | "stale" | "unavailable";
    detail: string;
  };
};

function runtimeEnvironment(): SystemControlPlane["deployment"]["environment"] {
  const value = process.env.VERCEL_ENV;
  if (value === "production" || value === "preview") return value;
  return "development";
}

function olderThan(value: string | null, milliseconds: number) {
  return !value || Date.parse(value) + milliseconds < Date.now();
}

/**
 * Server-only operational evidence. It exposes no secrets, event payloads,
 * refresh tokens, or provider URLs to the Settings page.
 */
export async function getSystemControlPlane(userId: string): Promise<SystemControlPlane> {
  const deployment = {
    environment: runtimeEnvironment(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    appUrl: env.appUrl ?? null,
  };
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    return {
      deployment,
      telemetry: { available: false, detail: "服务器缺少 Supabase 管理凭据，无法核验后台任务。" },
      scheduler: { lastRunAt: null, lastRunFailed: false, nextScheduledAt: null, hourlyDeltaState: "unavailable", hourlyDeltaLastRunAt: null, detail: "无法读取日历调度记录。" },
      webhook: { lastReceivedAt: null, subscriptionExpiresAt: null, state: "unavailable", detail: "无法读取 Outlook Webhook 状态。" },
    };
  }

  try {
    const admin = createAdminClient();
    const [latestRun, latestHourlyRun, connection] = await Promise.all([
      admin.from("calendar_sync_cron_runs").select("started_at,completed_at,failed_count,error_code,next_scheduled_at").is("archived_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("calendar_sync_cron_runs").select("started_at,completed_at,failed_count,error_code").eq("trigger_source", "external_scheduler").is("archived_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      admin
        .from("calendar_connections")
        .select("calendar_webhook_last_received_at,calendar_subscription_expires_at,status")
        .eq("user_id", userId)
        .eq("status", "enabled")
        .is("archived_at", null)
        .maybeSingle(),
    ]);
    const latest = latestRun.data;
    const hourly = latestHourlyRun.data;
    const hourlyState = !hourly?.completed_at
      ? "unavailable"
      : olderThan(hourly.completed_at, 2 * 3_600_000) || Boolean(hourly.error_code) || (hourly.failed_count ?? 0) > 0
        ? "stale"
        : "fresh";
    const subscriptionExpiresAt = connection.data?.calendar_subscription_expires_at ?? null;
    const webhookLastReceivedAt = connection.data?.calendar_webhook_last_received_at ?? null;
    const webhookState = !connection.data
      ? "unavailable"
      : !subscriptionExpiresAt || Date.parse(subscriptionExpiresAt) < Date.now() || olderThan(webhookLastReceivedAt, 8 * 86_400_000)
        ? "stale"
        : "fresh";
    return {
      deployment,
      telemetry: { available: true, detail: "Supabase 运行记录可读取。" },
      scheduler: {
        lastRunAt: latest?.completed_at ?? latest?.started_at ?? null,
        lastRunFailed: Boolean(latest?.error_code) || (latest?.failed_count ?? 0) > 0,
        nextScheduledAt: latest?.next_scheduled_at ?? null,
        hourlyDeltaState: hourlyState,
        hourlyDeltaLastRunAt: hourly?.completed_at ?? hourly?.started_at ?? null,
        detail: hourlyState === "fresh" ? "最近两小时内已观察到小时 delta 同步。" : "尚未观察到最近两小时内成功的外部小时 delta 同步。",
      },
      webhook: {
        lastReceivedAt: webhookLastReceivedAt,
        subscriptionExpiresAt,
        state: webhookState,
        detail: webhookState === "fresh" ? "Outlook Webhook 订阅有效，且近期收到通知。" : "Webhook 尚未验证；低频全量对账仍是兜底。",
      },
    };
  } catch {
    return {
      deployment,
      telemetry: { available: false, detail: "运行遥测表暂时无法读取。" },
      scheduler: { lastRunAt: null, lastRunFailed: false, nextScheduledAt: null, hourlyDeltaState: "unavailable", hourlyDeltaLastRunAt: null, detail: "无法读取日历调度记录。" },
      webhook: { lastReceivedAt: null, subscriptionExpiresAt: null, state: "unavailable", detail: "无法读取 Outlook Webhook 状态。" },
    };
  }
}
