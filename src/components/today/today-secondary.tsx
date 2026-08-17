import Link from "next/link";
import { CalendarDays, CheckCircle2, Milestone } from "lucide-react";
import type { NowUpcomingItem, NowWorkspace } from "@/features/today/types";
import { TodayBrief } from "./today-brief";
import { TodaySectionHeader } from "./section-header";

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function UpcomingIcon({ kind }: { kind: NowUpcomingItem["kind"] }) {
  if (kind === "event") return <CalendarDays className="size-4" aria-hidden="true" />;
  if (kind === "task") return <CheckCircle2 className="size-4" aria-hidden="true" />;
  return <Milestone className="size-4" aria-hidden="true" />;
}

export function TodaySecondary({ workspace }: { workspace: NowWorkspace }) {
  const contextItems = workspace.todayBrief.filter((item) =>
    item.sourceRefs.every(
      (source) => source.domain !== "tasks" && source.domain !== "calendar",
    ),
  );
  const hasContext = contextItems.length > 0 || workspace.briefing.entries.length > 0;

  return (
    <div className="grid gap-7 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.72fr)]">
      <section
        aria-labelledby="today-context-heading"
        className="rounded-lg border bg-[var(--surface-canvas)]"
      >
        <div className="border-b px-5 py-3.5">
          <TodaySectionHeader href="/briefing" label="打开 Briefing">
            <span id="today-context-heading">背景与简报</span>
          </TodaySectionHeader>
        </div>
        <div className="px-5 py-4">
          <TodayBrief items={contextItems} />
          {workspace.briefing.entries.length ? (
            <div className={contextItems.length ? "border-t" : ""}>
              {workspace.briefing.date ? (
                <p className="pt-3 text-xs text-[var(--text-tertiary)]">
                  {workspace.briefing.date.slice(5).replace("-", " 月 ")} 日 Briefing
                </p>
              ) : null}
              <ul>
              {workspace.briefing.entries.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={entry.url || "/briefing"}
                    target={entry.url ? "_blank" : undefined}
                    rel={entry.url ? "noreferrer" : undefined}
                    className="block rounded-[var(--radius-sm)] py-2.5 hover:bg-[var(--surface-hover)]"
                  >
                    <span className="block text-sm font-medium">{entry.title}</span>
                    {entry.reason ? (
                      <span className="mt-0.5 line-clamp-1 block text-xs text-[var(--text-secondary)]">
                        {entry.reason}
                      </span>
                    ) : null}
                  </a>
                </li>
              ))}
              </ul>
            </div>
          ) : null}
          {workspace.availability.briefing === "unavailable" ? (
            <p className="py-4 text-sm text-[var(--text-secondary)]">Briefing 暂不可用。</p>
          ) : !hasContext ? (
            <p className="py-4 text-sm text-[var(--text-secondary)]">
              暂无额外背景。首屏已包含今天需要的信息。
            </p>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="today-future-heading"
        className="rounded-lg border bg-[var(--surface-canvas)]"
      >
        <div className="border-b px-5 py-3.5">
          <TodaySectionHeader>
            <span id="today-future-heading">未来 7 天</span>
          </TodaySectionHeader>
        </div>
        <div className="px-5 py-4">
          {workspace.upcoming.length ? (
            <ul className="divide-y">
              {workspace.upcoming.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 rounded-[var(--radius-sm)] py-2.5 hover:bg-[var(--surface-hover)]"
                  >
                    <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {formatDate(item.at, workspace.timezone)}
                    </span>
                    <span className="flex min-w-0 gap-2 text-[var(--text-tertiary)]">
                      <UpcomingIcon kind={item.kind} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                          {item.title}
                        </span>
                        {item.detail ? (
                          <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">
                            {item.detail}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-[var(--text-secondary)]">
              未来一周暂无已安排事项。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
