import React from "react";
export default function Link({ href, children, ...props }) { return <a href={href} {...props}>{children}</a>; }
export const saveDeepSeekKey = async () => {};
export const removeDeepSeekKey = async () => {};
export const resetAiPromptOverride = async () => {};
export const saveAiPromptOverride = async () => {};
export const saveAiGovernance = async () => {};
export const getAiSettings = async () => ({ settings: { model: "deepseek-v4-flash", default_event_duration_minutes: 30, updated_at: "2026-10-01" } });
export const getNoteAiPromptSettings = async () => ({ available: true, prompts: [{ key: "notes.system", label: "笔记助手", description: "隔离测试提示词", content: "合成内容，仅用于界面验证。", customized: false }] });
export const getAiGovernanceSettings = async () => ({ semanticRetrievalOptIn: false, longTermMemoryOptIn: false, maxContextCharsPerRequest: 12000, maxOutputTokensPerRequest: 2000, dailyCallLimit: 50, monthlyCallLimit: 1000, dailyCostLimitUsd: 2, monthlyCostLimitUsd: 10, estimatedInputCostPerMillionUsd: 1, estimatedOutputCostPerMillionUsd: 2 });
export const getSystemHealth = async () => ({
  rows: ["tasks", "calendar", "notes", "files", "briefing", "ai"].map((domain, i) => ({ domain, state: i < 2 ? "stale" : "fresh", authoritySource: "服务记录", replicaRole: "缓存", syncDirection: "服务 → 本地", lastSuccessAt: "2026-09-30T01:00:00Z", lastAttemptAt: null, retryAfter: null, retryAttempt: 0, errorCode: null, errorSummary: null, conflictSummary: null, nextStep: i < 2 ? "请检查同步记录。" : "按需更新。" })),
  controlPlane: { deployment: { environment: "development", commit: "ui-fixture", deploymentId: null, appUrl: null }, telemetry: { available: true, detail: "合成测试数据" }, scheduler: { lastRunAt: null, lastRunFailed: false, nextScheduledAt: null, hourlyDeltaState: "unavailable", hourlyDeltaLastRunAt: null, detail: "每日后台同步尚未验证；等待首次成功运行。" }, webhook: { lastReceivedAt: null, subscriptionExpiresAt: null, state: "unavailable", detail: "Webhook 为可选增强；每日同步不依赖它。" } },
});
