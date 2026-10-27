"use client";
import { SourceLink as Link } from "@/components/workflow-continuity/provider";
import { useRef, useState } from "react";
import { useDomainViewAdapter, waitForViewLayout } from "@/features/workbench/domain-adapters/use-domain-view-adapter";
import type { ViewStateOf } from "@/features/workbench/view-state-contracts";
import type {
  ReviewEvidence,
  ReviewEvidenceItem,
} from "@/features/reviews/evidence";
import { Button } from "@/components/ui/button";
const labels = {
  calendar: "日程发生",
  tasksCompleted: "任务完成",
  tasksOpen: "任务到期 / 更新",
  notes: "笔记更新",
  inbox: "收集 / 处理",
  career: "职业资料更新",
  projects: "项目更新",
  decisions: "决定更新",
} as const;
export function ReviewEvidencePanel({
  evidence,
  onInsert,
}: {
  evidence: ReviewEvidence;
  onInsert?: (items: ReviewEvidenceItem[]) => void;
}) {
  const [filter, setFilter] = useState<ViewStateOf<"reviews">["filter"]>("all"),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const pane = useRef<HTMLElement>(null);
  const entries = (Object.keys(labels) as (keyof typeof labels)[])
    .flatMap((group) => evidence[group].map((item) => ({ item, group })))
    .sort(
      (a, b) =>
        a.item.occurredAt.localeCompare(b.item.occurredAt) ||
        a.item.id.localeCompare(b.item.id) ||
        a.group.localeCompare(b.group),
    );
  const selectionKey = (group: string, item: ReviewEvidenceItem) =>
    `${group}:${item.type}:${item.id}`;
  const visible = entries.filter(
    (entry) => filter === "all" || entry.group === filter,
  );
  const pathname = typeof window !== "undefined" && /^\/reviews\/(?:daily|weekly|[0-9a-f-]{36})$/i.test(window.location.pathname) ? window.location.pathname : `/reviews/${evidence.reviewType}`;
  const periodKey = `${evidence.reviewType}:${evidence.periodStart}:${evidence.periodEnd}:${evidence.timezone ?? "Asia/Shanghai"}`;
  useDomainViewAdapter({
    kind: "reviews", pathname, ready: Boolean(evidence.generatedAt),
    capture: () => ({ kind: "reviews", pathname, periodKey, filter, selectedRefs: entries.filter(entry => selected.has(selectionKey(entry.group, entry.item))).slice(0, 100).map(({ group, item }) => ({ group, type: item.type, id: item.id })), evidenceScrollTop: pane.current?.scrollTop ?? 0 }),
    restore: async (state, context) => {
      if (!context.current() || state.periodKey !== periodKey) return { status: "cancelled" };
      const fresh = new Set(entries.map(entry => selectionKey(entry.group, entry.item)));
      const refs = state.selectedRefs.map(ref => `${ref.group}:${ref.type}:${ref.id}`);
      setFilter(state.filter); setSelected(new Set(refs.filter(key => fresh.has(key))));
      if (!await waitForViewLayout(context) || !context.current()) return { status: "cancelled" };
      if (pane.current) pane.current.scrollTop = state.evidenceScrollTop;
      return refs.every(key => fresh.has(key)) ? { status: "applied" } : { status: "partial", reason: "missing-record" };
    },
  });
  return (
    <aside
      ref={pane}
      aria-label="证据时间线"
      className="min-w-0 lg:max-h-[75dvh] lg:overflow-y-auto lg:border-l lg:border-[var(--separator)] lg:pl-5"
    >
      <h2 className="font-medium">证据时间线</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
        {evidence.timezone ?? "Asia/Shanghai"} ·
        每类有读取上限；不是完整生活记录。选择后插入复盘，原文字保留。
      </p>
      <label className="mt-3 block text-sm">
        记录类型
        <select
          className="ui-field min-h-11 w-full text-base"
          value={filter}
          onChange={(event) => { const value = event.target.value; if (value === "all" || value in labels) setFilter(value as ViewStateOf<"reviews">["filter"]); }}
        >
          <option value="all">全部 · {entries.length}</option>
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {evidence.coverage
        ?.filter((item) => item.unavailable || item.truncated)
        .map((item, index) => (
          <p
            key={`${item.group}:${index}`}
            role="status"
            className="my-2 text-xs text-[var(--warning)]"
          >
            {labels[item.group as keyof typeof labels] ?? item.group}：
            {item.unavailable
              ? "读取失败，当前记录不完整"
              : `仅显示前 ${item.limit} 条`}
          </p>
        ))}
      {onInsert ? (
        <Button
          className="my-3"
          disabled={!selected.size}
          onClick={() => {
            onInsert(
              entries
                .filter((entry) =>
                  selected.has(selectionKey(entry.group, entry.item)),
                )
                .map((entry) => entry.item),
            );
            setSelected(new Set());
          }}
        >
          插入所选 {selected.size} 条证据
        </Button>
      ) : null}
      <ol className="divide-y divide-[var(--separator)]">
        {visible.map(({ item, group }) => (
          <li
            key={selectionKey(group, item)}
            className="py-3 text-sm leading-6"
          >
            <div className="flex gap-2">
              {onInsert ? (
                <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={`选择证据 ${item.title}`}
                    checked={selected.has(selectionKey(group, item))}
                    onChange={() =>
                      setSelected((before) => {
                        const next = new Set(before),
                          key = selectionKey(group, item);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  />
                </label>
              ) : null}
              <div className="min-w-0">
                <time
                  className="text-xs text-[var(--text-tertiary)]"
                  dateTime={item.occurredAt}
                >
                  {new Intl.DateTimeFormat("zh-CN", {
                    timeZone: evidence.timezone ?? "Asia/Shanghai",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                  }).format(new Date(item.occurredAt))}{" "}
                  · {labels[group]}
                </time>
                <p>
                  <Link className="ui-link" href={item.href}>
                    {item.title}
                  </Link>
                </p>
                {item.summary ? (
                  <p className="break-words text-xs text-[var(--text-secondary)]">
                    {item.summary}
                  </p>
                ) : null}
                {item.state ? <p className="text-xs">{item.state}</p> : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {!visible.length ? (
        <p className="py-4 text-sm">当前筛选没有记录。</p>
      ) : null}
    </aside>
  );
}
