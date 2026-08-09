import { ExternalLink, Rss } from "lucide-react";
import { GenerateBriefingControl } from "@/components/briefing/generate-briefing-control";
import { PageHeader } from "@/components/shared/page-header";
import {
  createBriefingInterestAction,
  createFeedAction,
  refreshFeedAction,
  setFeedStatusAction,
} from "@/features/briefing/actions";
import { getBriefingWorkspace } from "@/features/briefing/queries";

const sections = [
  ["must_know", "必须知道"],
  ["worth_reading", "值得阅读"],
  ["optional", "有空再看"],
] as const;

type RelatedFeed = { title?: string | null };
type BriefingItem = {
  title?: string | null;
  url?: string | null;
  canonical_url?: string | null;
  author?: string | null;
  published_at?: string | null;
  excerpt?: string | null;
  feeds?: RelatedFeed | RelatedFeed[] | null;
};
type BriefingEntry = {
  id: string;
  section: string;
  summary?: string | null;
  relevance_reason?: string | null;
  feed_items?: BriefingItem | BriefingItem[] | null;
  feed_item_clusters?: { source_count?: number | null } | Array<{ source_count?: number | null }> | null;
};

function relation<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function formatTime(value: string | null | undefined, timezone: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(value));
}

export default async function BriefingPage() {
  const data = await getBriefingWorkspace();
  const entries = data.entries as BriefingEntry[];
  const completedEmpty = data.briefing?.status === "completed" && entries.length === 0;
  const generatedAt = formatTime(data.briefing?.generated_at, data.timezone);

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-8">
      <PageHeader
        title="Briefing"
        description="从订阅源中筛出少量真正值得关注的内容。"
      />

      {data.unavailable ? (
        <p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          Briefing 数据暂时无法读取。请确认远程 migration 已应用后重试。
        </p>
      ) : null}

      <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0">
          <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-medium text-[var(--text-primary)]">今日简报</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                {data.date} · 最多 8 条
                {data.briefing
                  ? ` · ${data.briefing.candidate_count} 条候选 · ${data.briefing.selected_count} 条入选`
                  : ""}
              </p>
              {generatedAt ? (
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  最近生成于 {generatedAt}
                </p>
              ) : null}
            </div>
            <GenerateBriefingControl hasBriefing={Boolean(data.briefing)} />
          </header>

          <div id="briefing-results" className="scroll-mt-6">
            {sections.map(([key, label]) => {
              const group = entries.filter((entry) => entry.section === key);
              if (!group.length) return null;
              return (
                <section className="mt-8" key={key}>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                    {label} · {group.length}
                  </h3>
                  <div className="mt-3 divide-y border-y">
                    {group.map((entry) => {
                      const item = relation(entry.feed_items);
                      const cluster = relation(entry.feed_item_clusters);
                      const feed = relation(item?.feeds);
                      const href = item?.canonical_url || undefined;
                      const publishedAt = formatTime(item?.published_at, data.timezone);
                      return (
                        <article className="py-5" key={entry.id}>
                          <div className="flex min-w-0 items-start justify-between gap-4">
                            <div className="min-w-0">
                              {href ? (
                                <a
                                  className="group inline-flex max-w-full items-start gap-1.5 font-medium leading-6 hover:text-[var(--accent)]"
                                  href={href}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <span>{item?.title || "未命名资讯"}</span>
                                  <ExternalLink
                                    aria-hidden="true"
                                    className="mt-1 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                  />
                                </a>
                              ) : (
                                <p className="font-medium leading-6">{item?.title || "未命名资讯"}</p>
                              )}
                              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                                {feed?.title || "未知来源"}
                                {publishedAt ? ` · ${publishedAt}` : ""}
                                {Number(cluster?.source_count || 1) > 1
                                  ? ` · ${cluster?.source_count} 个来源`
                                  : ""}
                              </p>
                            </div>
                          </div>
                          {entry.summary ? (
                            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                              {entry.summary}
                            </p>
                          ) : null}
                          {entry.relevance_reason ? (
                            <p className="mt-2 text-xs text-[var(--accent)]">
                              {entry.relevance_reason}
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {!entries.length ? (
              <div className="py-16 text-center sm:py-20">
                <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Rss aria-hidden="true" className="size-4" />
                </span>
                <p className="mt-4 font-medium">
                  {completedEmpty ? "本次筛选没有可展示条目" : "今天还没有简报"}
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                  {!data.feeds.length
                    ? "先添加 RSS / Atom 订阅源。生成时会自动抓取，不需要逐个点击。"
                    : completedEmpty && data.briefing?.candidate_count
                      ? `系统检查了 ${data.briefing.candidate_count} 条候选资讯，但没有条目通过当前筛选。可以调整关注主题后重新生成。`
                      : completedEmpty
                        ? "系统已检查订阅源，但近 96 小时没有可用资讯。"
                        : "点击“生成今日简报”，系统会先抓取可用订阅源，再生成结果。"}
                </p>
              </div>
            ) : null}
          </div>
        </main>

        <aside className="min-w-0 space-y-8 border-t pt-7 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <details open={!data.feeds.length}>
            <summary className="cursor-pointer font-medium">订阅源 · {data.feeds.length}</summary>
            <form action={createFeedAction} className="mt-4 grid gap-3">
              <Input label="名称 *" name="title" />
              <Input label="RSS / Atom URL *" name="feed_url" type="url" />
              <Input label="分类" name="category" />
              <label className="grid gap-1 text-sm">
                <span>优先级 0–100</span>
                <input
                  className="rounded-[var(--radius-sm)] border bg-white px-3 py-2"
                  defaultValue="50"
                  max="100"
                  min="0"
                  name="priority"
                  type="number"
                />
              </label>
              <button className="w-fit rounded-[var(--radius-sm)] border px-3 py-2 text-sm hover:bg-[var(--surface-hover)]">
                添加订阅
              </button>
            </form>
            <div className="mt-5 divide-y border-y">
              {data.feeds.map((feed) => (
                <div className="py-3" key={feed.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{feed.title}</p>
                      <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">
                        {feed.status}
                        {feed.consecutive_error_count
                          ? ` · 连续失败 ${feed.consecutive_error_count} 次`
                          : feed.last_successful_fetch_at
                            ? ` · ${formatTime(feed.last_successful_fetch_at, data.timezone)}`
                            : " · 尚未抓取"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <form action={refreshFeedAction}>
                        <input name="feed_id" type="hidden" value={feed.id} />
                        <button
                          className="text-xs text-[var(--accent)] disabled:text-[var(--text-tertiary)]"
                          disabled={feed.status === "paused"}
                        >
                          抓取
                        </button>
                      </form>
                      <form action={setFeedStatusAction}>
                        <input name="feed_id" type="hidden" value={feed.id} />
                        <input
                          name="status"
                          type="hidden"
                          value={feed.status === "paused" ? "active" : "paused"}
                        />
                        <button className="text-xs text-[var(--text-secondary)]">
                          {feed.status === "paused" ? "恢复" : "暂停"}
                        </button>
                      </form>
                      <form action={setFeedStatusAction}>
                        <input name="feed_id" type="hidden" value={feed.id} />
                        <input name="status" type="hidden" value="archived" />
                        <button className="text-xs text-[var(--danger)]">归档</button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>

          <details open={!data.interests.length}>
            <summary className="cursor-pointer font-medium">
              关注主题 · {data.interests.length}
            </summary>
            <form action={createBriefingInterestAction} className="mt-4 grid gap-3">
              <Input label="主题名称 *" name="name" />
              <label className="grid gap-1 text-sm">
                <span>关键词（逗号或换行）</span>
                <textarea
                  className="min-h-20 rounded-[var(--radius-sm)] border bg-white px-3 py-2"
                  name="keywords"
                  required
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>排除关键词</span>
                <textarea
                  className="min-h-16 rounded-[var(--radius-sm)] border bg-white px-3 py-2"
                  name="excluded_keywords"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>权重 0–100</span>
                <input
                  className="rounded-[var(--radius-sm)] border bg-white px-3 py-2"
                  defaultValue="50"
                  max="100"
                  min="0"
                  name="weight"
                  type="number"
                />
              </label>
              <button className="w-fit rounded-[var(--radius-sm)] border px-3 py-2 text-sm hover:bg-[var(--surface-hover)]">
                添加主题
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.interests.map((interest) => (
                <span
                  className="rounded-full bg-[var(--surface-hover)] px-2.5 py-1 text-xs"
                  key={interest.id}
                >
                  {interest.name} · {interest.weight}
                </span>
              ))}
            </div>
          </details>

          <p className="text-xs leading-5 text-[var(--text-tertiary)]">
            抓取仅读取 RSS / Atom，不抓文章网页，也不携带 Cookie 或 Authorization。
          </p>
        </aside>
      </div>
    </div>
  );
}

function Input({ name, label, type = "text" }: { name: string; label: string; type?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <input
        className="rounded-[var(--radius-sm)] border bg-white px-3 py-2"
        name={name}
        required={label.includes("*")}
        type={type}
      />
    </label>
  );
}
