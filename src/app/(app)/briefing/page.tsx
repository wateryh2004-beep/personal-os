import { ExternalLink, Rss } from "lucide-react";
import { GenerateBriefingControl } from "@/components/briefing/generate-briefing-control";
import { JudgmentForm } from "@/components/briefing/judgment-form";
import type { BriefingJudgment } from "@/features/briefing/judgments";
import { getBriefingItemHref } from "@/features/briefing/orchestrator";
import { getBriefingWorkspace } from "@/features/briefing/queries";

const aiFallbackLabel: Record<string, string> = { ai_disabled: "规则模式 · AI 已关闭", ai_budget_exhausted: "规则模式 · AI 今日预算已用完", briefing_settings_unavailable: "规则模式 · AI 设置暂不可读", ai_server_configuration_missing: "规则模式 · AI 服务配置缺失", deepseek_not_configured: "规则模式 · DeepSeek 尚未配置", deepseek_credential_unreadable: "规则模式 · DeepSeek 凭据不可用", ai_provider_request_failed: "规则模式 · AI 请求失败" };
const topicLabels: Record<string, string> = { ai_tech: "AI / TECH", business_startup: "BUSINESS", finance_investing: "INVESTING", economy_society: "ECONOMY", wildcard: "EXPLORE" };
function relation<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined; }
function formatTime(value: string | null | undefined, timezone: string) { return value ? new Intl.DateTimeFormat("zh-CN", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit", hour12:false, timeZone:timezone }).format(new Date(value)) : null; }
function rankingAi(entry: Record<string, unknown>): Record<string, unknown> | null {
  const metadata = entry.ranking_metadata as Record<string, unknown> | null | undefined;
  const ai = metadata?.ai;
  return ai && typeof ai === "object" ? (ai as Record<string, unknown>) : null;
}
function str(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function num(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

type DisplayEntry = Record<string, unknown> & { id: string; judgment: BriefingJudgment | null };

export default async function BriefingPage() {
  const data = await getBriefingWorkspace();
  const entries = data.entries as unknown as DisplayEntry[];
  const isPrevious = Boolean(data.briefing && data.briefing.briefing_date !== data.date);
  const method = data.briefing?.ranking_method === "ai_hybrid" ? "AI 辅助筛选" : data.briefing?.ranking_method === "deterministic_fallback" ? aiFallbackLabel[data.briefing.ai_failure_code ?? ""] ?? "规则模式 · AI 暂不可用" : "规则模式";
  const runUsage = data.briefing?.ai_call_count ? `${data.briefing.ai_call_count} 次调用 · ${data.briefing.input_tokens} input · ${data.briefing.output_tokens} output tokens` : null;
  return (
    <main className="min-w-0">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-medium">{isPrevious ? "上次 Briefing" : "今日 Briefing"}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {data.briefing
              ? `${data.briefing.briefing_date} · ${data.briefing.candidate_count} 条候选 · ${data.briefing.selected_count} 条入选${data.briefing.generated_at ? ` · ${formatTime(data.briefing.generated_at, data.timezone)}` : ""}`
              : `${data.date} · 尚未生成`}
          </p>
          {data.briefing ? <p className="mt-1 text-xs text-[var(--text-tertiary)]">{method}{isPrevious ? " · 今天尚未生成" : ""}</p> : null}
          {runUsage ? <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)] opacity-70">{runUsage}</p> : null}
          {data.todayGenerating ? <p className="mt-1 text-xs text-[var(--accent)]">正在生成今日 Briefing…{isPrevious ? " 当前继续展示上一版。" : ""}</p> : null}
        </div>
        <GenerateBriefingControl hasBriefing={Boolean(data.briefing)} />
      </header>
      {data.unavailable ? <p className="mt-5 text-sm text-amber-700">Briefing 数据暂时无法读取。</p> : null}
      <div id="briefing-results">
        {entries.length ? (
          <div className="mt-4 divide-y divide-[var(--border-subtle)]">
            {entries.map((entry) => {
              const item = relation(entry.feed_items as { id?: string; title?: string; url?: string | null; canonical_url?: string | null; published_at?: string | null; feeds?: { title?: string; category?: string | null } | Array<{ title?: string; category?: string | null }> } | undefined);
              const feed = relation(item?.feeds);
              const href = item ? getBriefingItemHref(item) : undefined;
              const ai = rankingAi(entry);
              const topicLabel = ai ? topicLabels[String(ai.topic_bucket)] : undefined;
              const whatHappened = str(entry.summary);
              const whyItMatters = str(ai?.why_it_matters);
              const keyQuestion = str(ai?.key_question);
              const whyWorthReading = str(ai?.why_worth_reading);
              const readingValue = (num(ai?.learning_value) ?? 0) + (num(ai?.decision_value) ?? 0);
              const worthDeepRead = readingValue >= 140;
              return (
                <article key={entry.id} className="py-5">
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {feed?.title ?? "未知来源"}{feed?.category ? ` · ${feed.category}` : ""}{topicLabel ? ` · ${topicLabel}` : ""}{item?.published_at ? ` · ${formatTime(item.published_at, data.timezone)}` : ""}
                  </p>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-start gap-1 font-medium leading-6 text-[var(--text-primary)] hover:text-[var(--accent)]">
                      {item?.title ?? "未命名资讯"}<ExternalLink className="mt-1 size-3.5 shrink-0" />
                    </a>
                  ) : (
                    <p className="mt-1.5 font-medium leading-6">{item?.title ?? "未命名资讯"}</p>
                  )}
                  {whatHappened ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{whatHappened}</p> : null}
                  {whyWorthReading ? <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[var(--text-tertiary)]">为什么值得读 · {whyWorthReading}</p> : null}
                  {whyItMatters ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]"><span className="font-medium text-[var(--text-primary)]">Why it matters · </span>{whyItMatters}</p> : null}
                  {keyQuestion ? <p className="mt-3 max-w-2xl rounded-[var(--radius-md)] bg-[var(--surface-hover)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)]">「{keyQuestion}」</p> : null}
                  <div className="mt-3 flex items-center gap-4">
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className={`inline-flex h-7 items-center rounded-[var(--radius-sm)] px-2 text-xs ${worthDeepRead ? "font-medium text-[var(--accent)] underline underline-offset-2" : "text-[var(--text-secondary)] underline"}`}>
                        {worthDeepRead ? "值得细读原文" : "阅读原文"}
                      </a>
                    ) : null}
                    <JudgmentForm entryId={entry.id} existing={entry.judgment} />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center">
            <Rss className="mx-auto size-5 text-[var(--accent)]" />
            <p className="mt-3 font-medium">{data.briefing?.status === "completed" ? "本次筛选没有可展示条目" : "还没有可展示的 Briefing"}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">前往“信源”添加并审核 RSS / Atom 订阅后生成今日简报。</p>
          </div>
        )}
      </div>
    </main>
  );
}
