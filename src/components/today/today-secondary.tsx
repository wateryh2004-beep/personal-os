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
  if (kind === "event") return <CalendarDays className="size-3.5" aria-hidden="true" />;
  if (kind === "task") return <CheckCircle2 className="size-3.5" aria-hidden="true" />;
  return <Milestone className="size-3.5" aria-hidden="true" />;
}

export function TodaySecondary({ workspace }: { workspace: NowWorkspace }) {
  const contextItems = workspace.todayBrief.filter((item) =>
    item.sourceRefs.every((source) => source.domain !== "tasks" && source.domain !== "calendar"),
  );
  const hasContext = contextItems.length > 0 || workspace.briefing.entries.length > 0;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1.22fr)_minmax(300px,.78fr)] lg:gap-16">
      <section aria-labelledby="today-context-heading">
        <TodaySectionHeader href="/briefing" label="Briefing">
          <span id="today-context-heading">背景与简报</span>
        </TodaySectionHeader>
        <div className="mt-3 border-t border-[var(--separator)] pt-3">
          <TodayBrief items={contextItems} />

          {workspace.briefing.entries.length ? (
            <div className={contextItems.length ? "mt-4 border-t border-[var(--separator)] pt-3" : ""}>
              {workspace.briefing.date ? (
                <p className="mb-1.5 text-[10px] font-medium text-[var(--text-tertiary)]">
                  {workspace.briefing.date.slice(5).replace("-", " 月 ")} 日 Briefing
                </p>
              ) : null}
              <ul className="divide-y divide-[var(--separator)]">
                {workspace.briefing.entries.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={entry.url || "/briefing"}
                      target={entry.url ? "_blank" : undefined}
                      rel={entry.url ? "noreferrer" : undefined}
                      className="group block py-2.5"
                    >
                      <span className="block text-[12px] font-medium leading-5 text-[var(--text-primary)] transition-colors ui-transition group-hover:text-[var(--accent)]">
                        {entry.title}
                      </span>
                      {entry.reason ? (
                        <span className="mt-0.5 line-clamp-1 block text-[11px] leading-5 text-[var(--text-secondary)]">
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
            <p className="py-4 text-[12px] text-[var(--text-secondary)]">Briefing 暂不可用。</p>
          ) : !hasContext ? (
            <p className="py-4 text-[12px] leading-5 text-[var(--text-secondary)]">
              暂无额外背景。首屏已经包含今天需要的信息。
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="today-future-heading">
        <TodaySectionHeader>
          <span id="today-future-heading">未来 7 天</span>
        </TodaySectionHeader>
        <div className="mt-3 border-t border-[var(--separator)] pt-1">
          {workspace.upcoming.length ? (
            <ul className="divide-y divide-[var(--separator)]">
              {workspace.upcoming.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="group grid grid-cols-[68px_minmax(0,1fr)] gap-3 py-2.5">
                    <span className="pt-0.5 text-[10px] tabular-nums text-[var(--text-tertiary)]">
                      {formatDate(item.at, workspace.timezone)}
                    </span>
                    <span className="flex min-w-0 gap-2 text-[var(--text-tertiary)]">
                      <UpcomingIcon kind={item.kind} />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium text-[var(--text-primary)] transition-colors ui-transition group-hover:text-[var(--accent)]">
                          {item.title}
                        </span>
                        {item.detail ? (
                          <span className="mt-0.5 block truncate text-[10px] leading-5 text-[var(--text-secondary)]">
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
            <p className="py-4 text-[12px] text-[var(--text-secondary)]">未来一周暂无已安排事项。</p>
          )}
        </div>
      </section>
    </div>
  );
}
