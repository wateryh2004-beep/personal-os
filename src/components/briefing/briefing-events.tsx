"use client";
import { SourceLink } from "@/components/workflow-continuity/provider";
import { useState } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  RevisionRecovery,
  useRevisionRecovery,
} from "@/components/shared/revision-recovery";
import {
  readBriefingEvent,
  saveBriefingEventSource,
} from "@/features/briefing/events";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";
type Event = Database["public"]["Tables"]["briefing_events"]["Row"];
type Source = Database["public"]["Tables"]["briefing_event_sources"]["Row"];
type Version = Database["public"]["Tables"]["feed_item_versions"]["Row"];
type Item = {
  id: string;
  title: string;
  url: string | null;
  published_at: string | null;
  fetched_at: string;
};
export function BriefingEvents({
  events,
  sources,
  items,
  versions,
  truncated,
  entries,
  judgments,
}: {
  entries: {
    id: string;
    briefing_id: string;
    representative_item_id: string;
    created_at: string;
    summary: string | null;
  }[];
  judgments: {
    entryId: string;
    id: string;
    text: string;
    occurredAt: string;
    status: string;
  }[];
  events: Event[];
  sources: Source[];
  items: Item[];
  versions: Version[];
  truncated: boolean;
}) {
  const router = useRouter();
  const [canonical, setCanonical] = useState({ rows: events, links: sources });
  const { rows, links } = canonical;
  const [propsSnapshot, setPropsSnapshot] = useState({
    events,
    sources,
    truncated,
  });
  if (
    propsSnapshot.events !== events ||
    propsSnapshot.sources !== sources ||
    propsSnapshot.truncated !== truncated
  ) {
    setPropsSnapshot({ events, sources, truncated });
    setCanonical((before) => {
      const rowMap = new Map(before.rows.map((row) => [row.id, row]));
      for (const row of events)
        if (row.revision >= (rowMap.get(row.id)?.revision ?? 0))
          rowMap.set(row.id, row);
      const authoritativeIds = new Set(
        events
          .filter(
            (row) =>
              !truncated &&
              row.revision >
                (before.rows.find((old) => old.id === row.id)?.revision ?? -1),
          )
          .map((row) => row.id),
      );
      const sourceMap = new Map(
        before.links
          .filter((source) => !authoritativeIds.has(source.event_id))
          .map((source) => [source.id, source]),
      );
      for (const source of sources) {
        const eventRevision =
            events.find((row) => row.id === source.event_id)?.revision ?? -1,
          localRevision =
            before.rows.find((row) => row.id === source.event_id)?.revision ??
            -1;
        if (
          eventRevision >= localRevision &&
          source.revision >= (sourceMap.get(source.id)?.revision ?? 0)
        )
          sourceMap.set(source.id, source);
      }
      return { rows: [...rowMap.values()], links: [...sourceMap.values()] };
    });
  }
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const schema = z.object({
    eventId: z.string(),
    newId: z.string(),
    title: z.string(),
    itemId: z.string(),
    revision: z.number().int().min(0).optional().default(0),
  });
  const { value, setValue, commit } = useWorkflowDraft({
    kind: "review",
    id: "briefing:event",
    label: "事件归组",
    resumeHref: "/briefing/events",
    initialValue: {
      eventId: "",
      newId: "",
      title: "",
      itemId: "",
      revision: 0,
    },
    parse: (input) => {
      const result = schema.safeParse(input);
      return result.success ? result.data : null;
    },
  });
  const recovery =
    useRevisionRecovery<Awaited<ReturnType<typeof readBriefingEvent>>>();
  const selected = rows.find((row) => row.id === value.eventId);
  const unresolvedCreation = Boolean(value.newId && !value.eventId);
  const installLatest = (
    latest: Awaited<ReturnType<typeof readBriefingEvent>>,
  ) => {
    if (!latest.event) return;
    const event = latest.event;
    setCanonical((before) => {
      if (
        (before.rows.find((row) => row.id === event.id)?.revision ?? 0) >
        event.revision
      )
        return before;
      const sourceMap = new Map(
        (latest.truncated
          ? before.links
          : before.links.filter((source) => source.event_id !== event.id)
        ).map((source) => [source.id, source]),
      );
      for (const source of latest.sources) sourceMap.set(source.id, source);
      return {
        rows: [event, ...before.rows.filter((row) => row.id !== event.id)],
        links: [...sourceMap.values()],
      };
    });
  };
  const installMutation = (event: Event, source: Source) =>
    setCanonical((before) => {
      if (
        (before.rows.find((row) => row.id === event.id)?.revision ?? 0) >
        event.revision
      )
        return before;
      return {
        rows: [event, ...before.rows.filter((row) => row.id !== event.id)],
        links: source.archived_at
          ? before.links.filter((row) => row.id !== source.id)
          : [source, ...before.links.filter((row) => row.id !== source.id)],
      };
    });
  async function save() {
    if (pending || recovery.reading || !value.itemId) return;
    const submitted = {
        ...value,
        newId: value.eventId ? "" : value.newId || crypto.randomUUID(),
      },
      current = captureWorkspaceScope();
    if (submitted.newId !== value.newId) setValue(submitted);
    const id = submitted.eventId || submitted.newId;
    setPending(true);
    try {
      const result = await saveBriefingEventSource({
        eventId: id,
        revision: submitted.revision,
        title: submitted.title,
        itemId: submitted.itemId,
        linked: true,
      });
      if (!current()) return;
      installMutation(result.event, result.source);
      commit(submitted, (before) => {
        // A confirmed creation ends only that logical intent. New typing while
        // it was pending remains a distinct unfinished intent with no reused ID.
        if (!submitted.eventId && before.title !== submitted.title)
          return { ...before, newId: "", eventId: "", revision: 0 };
        return {
          ...before,
          eventId: result.event.id,
          newId: "",
          revision: result.event.revision,
          title:
            before.title === submitted.title
              ? result.event.title
              : before.title,
          itemId: before.itemId === submitted.itemId ? "" : before.itemId,
        };
      });
      recovery.dismiss();
      setMessage("来源已归入事件，未改变原文或个人判断。");
    } catch (error) {
      if (current())
        setMessage(
          error instanceof Error
            ? error.message
            : "保存失败，输入保留；创建编号保持不变，请读取最新事件核对。",
        );
    } finally {
      if (current()) setPending(false);
    }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="page-title">同一件事，后来怎样了</h1>
        <p className="mt-2 text-sm leading-7">
          由你确认哪些文章属于同一事件。新增来源、同源文字更新和个人判断分别记录；文字变化不等同事实已被证实。
        </p>
      </header>
      {truncated ? (
        <p role="status" className="text-sm text-[var(--warning)]">
          当前为有界快照：最多100事件、500关联/来源、1000来源版本，较早资料可能未展示，不据此判断“没有变化”。
        </p>
      ) : null}
      <form
        className="grid gap-3 rounded-xl border border-[var(--separator)] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          事件
          <select
            className="ui-field min-h-11 w-full text-base"
            value={value.eventId}
            disabled={pending || recovery.reading || unresolvedCreation}
            onChange={(event) => {
              recovery.dismiss();
              const id = event.target.value,
                row = rows.find((row) => row.id === id);
              setValue((before) => ({
                ...before,
                eventId: id,
                newId: "",
                revision: row?.revision ?? 0,
                title: row?.title ?? "",
              }));
            }}
          >
            <option value="">新建事件</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          事件名称（保存将更新所选事件名称）
          <input
            className="ui-field min-h-11 w-full text-base"
            required
            maxLength={240}
            value={value.title}
            onChange={(event) =>
              setValue((before) => ({ ...before, title: event.target.value }))
            }
          />
        </label>
        <label>
          把哪篇已有来源加入（最近500篇）
          <select
            className="ui-field min-h-11 w-full text-base"
            required
            value={value.itemId}
            onChange={(event) =>
              setValue((before) => ({ ...before, itemId: event.target.value }))
            }
          >
            <option value="">选择来源</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={pending || recovery.reading}>
          确认是同一事件，加入变化线
        </Button>
        {message ? <p role="status">{message}</p> : null}
      </form>
      {unresolvedCreation ? (
        <p role="status" className="text-sm">
          这次创建尚未确认。保留同一编号，请先读取核对或重试；当前文字仍可编辑。
        </p>
      ) : null}
      {selected && selected.revision !== value.revision ? (
        <p role="status" className="text-sm">
          所选事件已有新版本，请读取、对比后明确选择如何继续。
        </p>
      ) : null}
      <RevisionRecovery
        label="事件"
        recovery={recovery}
        disabled={pending || (!value.eventId && !value.newId)}
        onRead={() =>
          void recovery.read(async () => {
            const latest = await readBriefingEvent({
              id: value.eventId || value.newId,
              expectedExists: Boolean(value.eventId),
            });
            return latest;
          })
        }
        current={
          <>
            <p>事件名称：{value.title || "未填写"}</p>
            <p>
              待加入来源：
              {items.find((item) => item.id === value.itemId)?.title ??
                "未选择"}
            </p>
            <p>编辑基于版本 {value.revision}</p>
          </>
        }
        renderLatest={(latest) =>
          latest.event ? (
            <>
              <p>事件名称：{latest.event.title}</p>
              <p>
                已保存版本 {latest.event.revision} · {latest.sources.length}
                {latest.truncated ? "+" : ""}篇可见来源
              </p>
              <ul>
                {latest.sources.map((source) => (
                  <li key={source.id}>
                    {items.find((item) => item.id === source.feed_item_id)
                      ?.title ?? "来源暂不在本次列表"}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              尚未读到此创建编号的记录，保留编号；未确认前不会换新编号重建。
            </p>
          )
        }
        onKeep={(latest) => {
          if (latest.event) {
            installLatest(latest);
            setValue((before) => ({
              ...before,
              eventId: latest.event!.id,
              newId: "",
              revision: latest.event!.revision,
            }));
            setMessage(
              "当前名称与待加入来源保留，基于刚读取的版本；尚未保存。",
            );
          } else setMessage("保留本次创建编号与输入，仍可用同一编号重试。");
        }}
        onAdopt={(latest) => {
          if (!latest.event) {
            setMessage(
              "尚无已保存内容可采用，已保留输入与原创建编号，请继续核对。",
            );
            return;
          }
          installLatest(latest);
          commit(value, () => ({
            eventId: latest.event!.id,
            newId: "",
            revision: latest.event!.revision,
            title: latest.event!.title,
            itemId: "",
          }));
          setMessage("已采用刚读取的事件内容，清除本次未提交的归组选择。");
        }}
      />
      {rows.map((event) => {
        const members = links.filter((link) => link.event_id === event.id);
        const timeline = versions
          .filter((version) =>
            members.some((link) => link.feed_item_id === version.feed_item_id),
          )
          .toSorted(
            (a, b) =>
              a.observed_at.localeCompare(b.observed_at) ||
              a.id.localeCompare(b.id),
          );
        return (
          <section
            key={event.id}
            className="rounded-xl border border-[var(--separator)] p-4"
          >
            <h2 className="font-[family-name:var(--font-serif)] text-xl">
              {event.title}
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              {members.length}篇来源 · 归组版本{event.revision}
            </p>
            <section className="my-4">
              <h3 className="font-medium">简报与我的判断</h3>
              <ol>
                {entries
                  .filter((entry) =>
                    members.some(
                      (member) =>
                        member.feed_item_id === entry.representative_item_id,
                    ),
                  )
                  .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((entry) => (
                    <li
                      key={entry.id}
                      className="border-l border-[var(--separator)] py-3 pl-3"
                    >
                      <p className="text-xs">{entry.created_at} · 收录到简报</p>
                      <p>{entry.summary || "未记录摘要"}</p>
                      <SourceLink
                        className="ui-link inline-flex min-h-11 items-center"
                        href={`/briefing/history/${entry.briefing_id}#entry-${entry.id}`}
                      >
                        回到这次简报与判断
                      </SourceLink>
                      {judgments
                        .filter((judgment) => judgment.entryId === entry.id)
                        .map((judgment) => (
                          <section key={judgment.id}>
                            <p className="text-xs">
                              {judgment.occurredAt} · 我的判断（
                              {judgment.status}，与来源事实分开）
                            </p>
                            <p className="whitespace-pre-wrap text-sm">
                              {judgment.text}
                            </p>
                          </section>
                        ))}
                    </li>
                  ))}
              </ol>
              <p className="text-xs text-[var(--text-secondary)]">
                这里只列出当前可见的判断与更新时间，不将旧简报摘要当成新增事实。
              </p>
            </section>
            <ol className="divide-y divide-[var(--separator)]">
              {members.map((member) => {
                const item = items.find(
                  (item) => item.id === member.feed_item_id,
                );
                return (
                  <li key={member.id} className="py-3">
                    <p>
                      新增来源 · 归入于
                      {new Date(member.created_at).toLocaleString("zh-CN")}
                    </p>
                    <p>{item?.title ?? "来源暂不在本次读取范围"}</p>
                    <p className="text-xs">
                      发表时间：{item?.published_at ?? "未知"}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={async () => {
                        const current = captureWorkspaceScope();
                        setPending(true);
                        try {
                          const result = await saveBriefingEventSource({
                            eventId: event.id,
                            revision: event.revision,
                            title: event.title,
                            itemId: member.feed_item_id,
                            linked: false,
                          });
                          const saved = result.event;
                          if (!current()) return;
                          installMutation(saved, result.source);
                        } catch {
                          if (current())
                            setMessage(
                              "移除关联未确认，请重新读取核对。原文保留。",
                            );
                        } finally {
                          if (current()) setPending(false);
                        }
                      }}
                    >
                      移出此事件，保留原文
                    </Button>
                  </li>
                );
              })}
              {timeline.map((version, index) => {
                const previous = [...timeline.slice(0, index)]
                  .reverse()
                  .find((row) => row.feed_item_id === version.feed_item_id);
                return (
                  <li key={version.id} className="py-4 text-sm">
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {version.observed_at} ·{" "}
                      {previous
                        ? "同源文字更新"
                        : version.provenance === "baseline"
                          ? "现有内容基线，历史自此次起"
                          : "首次观察到的内容"}
                    </p>
                    <p className="font-medium">{version.title}</p>
                    <p>
                      发表时间：{version.published_at ?? "未知"} ·
                      来源更新时间：{version.updated_at_source ?? "未知"}
                    </p>
                    {version.url ? (
                      <a
                        className="ui-link inline-flex min-h-11 items-center"
                        href={version.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        核对来源原文
                      </a>
                    ) : null}
                    <details>
                      <summary className="ui-link min-h-11 cursor-pointer py-2">
                        {previous
                          ? "对照上次与这次的已保存原文"
                          : "查看已保存来源快照"}
                      </summary>
                      {previous ? (
                        <section>
                          <h3>上次观察</h3>
                          <p className="whitespace-pre-wrap">
                            {previous.content_text ||
                              previous.excerpt ||
                              "未保存原文，无法比较"}
                          </p>
                        </section>
                      ) : null}
                      <section>
                        <h3>这次观察</h3>
                        <p className="whitespace-pre-wrap">
                          {version.content_text ||
                            version.excerpt ||
                            "未保存原文"}
                        </p>
                      </section>
                    </details>
                  </li>
                );
              })}
            </ol>
            {!timeline.length ? (
              <p>暂无可见的来源版本，不能推断事件没有变化。</p>
            ) : null}
            <Button
              variant="ghost"
              disabled={pending || recovery.reading}
              onClick={async () => {
                const current = captureWorkspaceScope();
                try {
                  const latest = await readBriefingEvent({
                    id: event.id,
                    expectedExists: true,
                  });
                  if (current()) {
                    installLatest(latest);
                    router.refresh();
                  }
                } catch (error) {
                  if (current())
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "事件暂时无法读取，输入保留。",
                    );
                }
              }}
            >
              读取最新变化
            </Button>
          </section>
        );
      })}
    </div>
  );
}
