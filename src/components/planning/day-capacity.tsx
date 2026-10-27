"use client";
import { useEffect, useState, useTransition } from "react";
import { z } from "zod";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import {
  captureWorkspaceScope,
  readWorkspaceResponse,
  WorkspaceAuthenticationError,
  clearWorkspaceResources,
  registerWorkspaceScopeCleanup,
} from "@/lib/workspace-resource-cache";
import {
  planningDaySchema,
  type PlanningDay,
} from "@/features/planning/contracts";
import { calculateCapacity } from "@/features/planning/capacity";
import {
  readAvailability,
  readTaskPlanning,
  saveAvailability,
  saveTaskPlanning,
} from "@/features/planning/actions";
import { clearWorkspaceSessions } from "@/lib/workspace-session";
import {
  RevisionRecovery,
  useRevisionRecovery,
} from "@/components/shared/revision-recovery";
import { Button } from "@/components/ui/button";
const draftSchema = z.object({
  periods: z.array(z.object({ start: z.string(), end: z.string() })),
  revision: z.number(),
  timezone: z.string().optional(),
});
export function DayCapacity({
  date,
  taskId,
}: {
  date: string;
  taskId?: string;
}) {
  const [data, setData] = useState<PlanningDay | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const current = captureWorkspaceScope(),
      abort = new AbortController();
    const unregister = registerWorkspaceScopeCleanup(() => {
      abort.abort();
      setData(null);
    });
    void readWorkspaceResponse(
      `/api/planning/day?date=${encodeURIComponent(date)}`,
      abort.signal,
    )
      .then(planningDaySchema.parse)
      .then((value) => {
        if (current() && !abort.signal.aborted) {
          setData(value);
          setError("");
        }
      })
      .catch((failure) => {
        if (
          current() &&
          !abort.signal.aborted &&
          failure instanceof WorkspaceAuthenticationError
        ) {
          clearWorkspaceResources();
          clearWorkspaceSessions();
          window.dispatchEvent(new Event("personal-os:workspace-auth-failed"));
          return;
        }
        if (current() && !abort.signal.aborted)
          setError("计划暂时无法读取，不能据此判断空闲。");
      });
    return () => {
      unregister();
      abort.abort();
    };
  }, [date, attempt]);
  return (
    <section
      className="my-4 rounded-xl border border-[var(--separator)] bg-[var(--surface-canvas)] p-4"
      aria-label="时间容量"
    >
      <h2 className="text-base font-medium">
        {taskId ? "任务估时与安排" : "今天装得下吗？"}
      </h2>
      {error ? (
        <p role="alert">
          {error}
          <Button
            variant="ghost"
            onClick={() => setAttempt((value) => value + 1)}
          >
            重新读取
          </Button>
        </p>
      ) : null}
      {data ? (
        <CapacityEditor
          key={`${date}:${data.timezone}`}
          data={data}
          taskId={taskId}
          onSaved={() => setAttempt((value) => value + 1)}
        />
      ) : !error ? (
        <p role="status" className="text-sm">
          正在读取完整日程范围与计划…
        </p>
      ) : null}
    </section>
  );
}
function CapacityEditor({
  data,
  taskId,
  onSaved,
}: {
  data: PlanningDay;
  taskId?: string;
  onSaved: () => void;
}) {
  const [notice, setNotice] = useState(""),
    [pending, start] = useTransition();
  const {
    value: draft,
    setValue: setDraft,
    commit,
  } = useWorkflowDraft({
    kind: "task",
    id: `availability:${data.date}`,
    label: "可用时段",
    resumeHref: "/today",
    initialValue: {
      periods: data.availability?.periods ?? [],
      revision: data.availability?.revision ?? 0,
      timezone: data.availability?.timezone ?? data.timezone,
    },
    parse: (input) => {
      const result = draftSchema.safeParse(input);
      return result.success
        ? { ...result.data, timezone: result.data.timezone ?? data.timezone }
        : null;
    },
  });
  const recovery =
    useRevisionRecovery<Awaited<ReturnType<typeof readAvailability>>>();
  const plannedTasks = data.tasks.flatMap((task) => {
    const plan = data.plans.find(
      (row) => row.task_id === task.id && row.planned_on === data.date,
    );
    return plan ? [{ ...plan, title: task.title }] : [];
  });
  let capacity: ReturnType<typeof calculateCapacity> | null = null;
  try {
    capacity = calculateCapacity(
      data.date,
      data.timezone,
      data.availability?.timezone === data.timezone
        ? data.availability.periods
        : [],
      data.events,
      plannedTasks,
      data.calendarComplete &&
        !data.truncated &&
        Boolean(
          data.availability && data.availability.timezone === data.timezone,
        ),
    );
  } catch {}
  const plan = taskId ? data.plans.find((row) => row.task_id === taskId) : null;
  return (
    <div className="mt-3 space-y-3 text-sm leading-6">
      <p>
        {data.date} · {data.timezone} · 最近同步{" "}
        {data.lastSyncAt
          ? new Intl.DateTimeFormat("zh-CN", {
              timeZone: data.timezone,
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(data.lastSyncAt))
          : "未知"}
      </p>
      {taskId ? (
        <TaskEstimate
          key={taskId}
          taskId={taskId}
          plan={plan}
          onSaved={onSaved}
        />
      ) : null}
      {!data.calendarComplete || data.truncated ? (
        <p role="status" className="text-[var(--warning)]">
          日程同步范围不完整、读取达到上限或连接异常，暂不判断空档与超载。
        </p>
      ) : null}
      {data.availability?.timezone !== data.timezone && data.availability ? (
        <p role="status">
          原时段时区为{data.availability.timezone}，请按当前时区重新核对并保存。
        </p>
      ) : null}
      {!data.availability ? (
        <p role="status">尚未设置可用时段，暂不能判断今天是否装得下。</p>
      ) : null}
      {capacity ? (
        <dl className="flex flex-wrap gap-4">
          <div>
            <dt>已设可用</dt>
            <dd>
              {data.availability ? `${capacity.available} 分钟` : "尚未设置"}
            </dd>
          </div>
          <div>
            <dt>日程占用</dt>
            <dd>{capacity.busy ?? "未知"} 分钟</dd>
          </div>
          <div>
            <dt>已计划任务</dt>
            <dd>
              {capacity.estimated} 分钟
              {capacity.unknown ? ` + ${capacity.unknown} 项未估时` : ""}
            </dd>
          </div>
          <div>
            <dt>已知估时至少超出</dt>
            <dd>
              {capacity.overbooked === null
                ? "无法判断"
                : `${capacity.overbooked} 分钟`}
            </dd>
          </div>
        </dl>
      ) : null}
      <details>
        <summary className="ui-link min-h-11 cursor-pointer py-2">
          设置这天真正可用的时间
        </summary>
        <p>
          只填写你愿意安排任务的时段；按开始时间排序，时段不能重叠。未估时任务不按零需求处理。
        </p>
        <p className="text-sm">
          本次编辑与保存的时区：{draft.timezone}
          {draft.timezone !== data.timezone
            ? `（当前个人时区为${data.timezone}，不会自动换算已填时刻）`
            : ""}
        </p>
        {draft.timezone !== data.timezone ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setDraft((before) => ({ ...before, timezone: data.timezone }))
            }
          >
            明确将已填时刻按{data.timezone}编辑
          </Button>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || recovery.reading) return;
            const snapshot = draft;
            const current = captureWorkspaceScope();
            start(async () => {
              try {
                const saved = await saveAvailability({
                  date: data.date,
                  timezone: snapshot.timezone,
                  revision: snapshot.revision,
                  periods: snapshot.periods,
                });
                if (current()) {
                  commit(snapshot, (before) => ({
                    ...before,
                    revision: saved.revision,
                  }));
                  setNotice("可用时段已保存");
                  onSaved();
                }
              } catch (error) {
                if (current())
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "保存失败，输入保留",
                  );
              }
            });
          }}
        >
          <div className="space-y-2">
            {draft.periods.map((period, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <label>
                  开始
                  <input
                    aria-label={`第${index + 1}段开始`}
                    className="ui-field min-h-11 text-base"
                    type="time"
                    required
                    value={period.start}
                    onChange={(event) =>
                      setDraft((before) => ({
                        ...before,
                        periods: before.periods.map((row, i) =>
                          i === index
                            ? { ...row, start: event.target.value }
                            : row,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  结束
                  <input
                    aria-label={`第${index + 1}段结束`}
                    className="ui-field min-h-11 text-base"
                    type="time"
                    required
                    value={period.end}
                    onChange={(event) =>
                      setDraft((before) => ({
                        ...before,
                        periods: before.periods.map((row, i) =>
                          i === index
                            ? { ...row, end: event.target.value }
                            : row,
                        ),
                      }))
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setDraft((before) => ({
                      ...before,
                      periods: before.periods.filter((_, i) => i !== index),
                    }))
                  }
                >
                  移除此段
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={draft.periods.length >= 12}
              onClick={() =>
                setDraft((before) => ({
                  ...before,
                  periods: [...before.periods, { start: "", end: "" }],
                }))
              }
            >
              增加时段
            </Button>
            <Button disabled={pending || recovery.reading}>
              {pending ? "保存中…" : "保存时段"}
            </Button>
          </div>
        </form>
        <RevisionRecovery
          label="可用时段"
          recovery={recovery}
          disabled={pending}
          onRead={() =>
            void recovery.read(() => readAvailability(data.date, data.timezone))
          }
          current={
            <>
              <p>
                编辑基于版本 {draft.revision} · {draft.timezone}
              </p>
              {draft.periods.map((period, index) => (
                <p key={index}>
                  {period.start || "开始待填"} — {period.end || "结束待填"}
                </p>
              ))}
            </>
          }
          renderLatest={(latest) => (
            <>
              <p>
                已保存版本 {latest.revision} · {latest.timezone}
              </p>
              {latest.periods.length ? (
                latest.periods.map((period, index) => (
                  <p key={index}>
                    {period.start} — {period.end}
                  </p>
                ))
              ) : (
                <p>未设可用时段</p>
              )}
            </>
          )}
          onKeep={(latest) => {
            setDraft((before) => ({ ...before, revision: latest.revision }));
            setNotice(
              "保留当前时段输入，基于刚读取的版本；按当前显示时区再次保存前请核对。",
            );
          }}
          onAdopt={(latest) => {
            commit(draft, () => ({
              periods: latest.periods,
              revision: latest.revision,
              timezone: latest.timezone,
            }));
            setNotice("已采用刚读取的可用时段。");
          }}
        />
      </details>
      {plannedTasks.length ? (
        <ul>
          {plannedTasks.map((task) => (
            <li key={task.task_id}>
              {task.title} · {task.estimated_minutes ?? "未估时"}
              {task.estimated_minutes !== null ? " 分钟" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p>还没有安排到这天的任务。可在任务详情记录估时与计划日。</p>
      )}
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
function TaskEstimate({
  taskId,
  plan,
  onSaved,
}: {
  taskId: string;
  plan: PlanningDay["plans"][number] | null | undefined;
  onSaved: () => void;
}) {
  const schema = z.object({
    minutes: z.string(),
    plannedOn: z.string(),
    revision: z.number(),
  });
  const { value, setValue, commit } = useWorkflowDraft({
    kind: "task",
    id: `estimate:${taskId}`,
    label: "任务估时",
    resumeHref: `/tasks?task=${taskId}`,
    initialValue: {
      minutes: plan?.estimated_minutes?.toString() ?? "",
      plannedOn: plan?.planned_on ?? "",
      revision: plan?.revision ?? 0,
    },
    parse: (input) => {
      const result = schema.safeParse(input);
      return result.success ? result.data : null;
    },
  });
  const [pending, start] = useTransition(),
    [notice, setNotice] = useState("");
  const recovery =
    useRevisionRecovery<Awaited<ReturnType<typeof readTaskPlanning>>>();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || recovery.reading) return;
        const snapshot = value,
          current = captureWorkspaceScope();
        start(async () => {
          try {
            const saved = await saveTaskPlanning({
              taskId,
              revision: snapshot.revision,
              minutes: snapshot.minutes ? Number(snapshot.minutes) : null,
              plannedOn: snapshot.plannedOn || null,
            });
            if (current()) {
              commit(snapshot, (before) => ({
                ...before,
                revision: saved.revision,
              }));
              setNotice("已保存预计时长和计划日期，不会更改 Microsoft To Do 的完成状态。");
              onSaved();
            }
          } catch (error) {
            if (current())
              setNotice(
                error instanceof Error ? error.message : "保存失败，输入保留",
              );
          }
        });
      }}
    >
      <label className="block">
        预计需要分钟
        <input
          className="ui-field min-h-11 w-full text-base"
          type="number"
          min="1"
          max="10080"
          value={value.minutes}
          onChange={(event) =>
            setValue((before) => ({ ...before, minutes: event.target.value }))
          }
        />
      </label>
      <label className="block">
        计划在哪天做
        <input
          className="ui-field min-h-11 w-full text-base"
          type="date"
          value={value.plannedOn}
          onChange={(event) =>
            setValue((before) => ({ ...before, plannedOn: event.target.value }))
          }
        />
      </label>
      <Button disabled={pending || recovery.reading}>保存估时与计划日</Button>
      <RevisionRecovery
        label="任务计划"
        recovery={recovery}
        disabled={pending}
        onRead={() => void recovery.read(() => readTaskPlanning(taskId))}
        current={
          <>
            <p>
              估时：{value.minutes || "未记录"} 分钟 · 计划日：
              {value.plannedOn || "未记录"}
            </p>
            <p>编辑基于版本 {value.revision}</p>
          </>
        }
        renderLatest={(latest) => (
          <>
            <p>
              估时：{latest.minutes || "未记录"} 分钟 · 计划日：
              {latest.plannedOn || "未记录"}
            </p>
            <p>已保存版本 {latest.revision}</p>
          </>
        )}
        onKeep={(latest) => {
          setValue((before) => ({ ...before, revision: latest.revision }));
          setNotice("当前估时与日期保留，基于刚读取的版本；尚未保存。");
        }}
        onAdopt={(latest) => {
          commit(value, () => latest);
          setNotice("已采用刚读取的任务计划。");
        }}
      />
      {notice ? <p role="status">{notice}</p> : null}
    </form>
  );
}
