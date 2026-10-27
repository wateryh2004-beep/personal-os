"use client";
import { SourceLink as Link } from "@/components/workflow-continuity/provider";
import { instantToWallTime, wallTimeToIso } from "@/features/calendar/timezone";
import { useEffect, useRef, useState } from "react";
import { handoffMobileBackLayer } from "@/lib/mobile/use-mobile-back-layer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { readPendingCalendarTasks } from "@/features/workbench/operation-read-resource";
import type { PendingCalendarTask } from "./calendar-pending-tasks";
export function CalendarRangeTasks({
  range,
  timezone,
  onClose,
  onNew,
  onTask,
}: {
  range: { startsAt: string; endsAt: string };
  timezone: string;
  onClose: () => void;
  onNew: (range: { startsAt: string; endsAt: string }) => void;
  onTask: (
    task: PendingCalendarTask,
    range: { startsAt: string; endsAt: string },
  ) => void;
}) {
  const handingOff = useRef(false);
  const handoff = () => {
    handingOff.current = true;
    handoffMobileBackLayer("dialog", "side-panel:inspector");
  };
  const [tasks, setTasks] = useState<PendingCalendarTask[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [showAll, setShowAll] = useState(false),
    [truncated, setTruncated] = useState(false);
  const [startInput, setStartInput] = useState<string>(
    instantToWallTime(range.startsAt, timezone),
  );
  const [endInput, setEndInput] = useState<string>(
    instantToWallTime(range.endsAt, timezone),
  );
  let selection: { startsAt: string; endsAt: string } | null = null;
  try {
    const startsAt = wallTimeToIso(startInput, timezone),
      endsAt = wallTimeToIso(endInput, timezone);
    if (
      Date.parse(endsAt) > Date.parse(startsAt) &&
      Date.parse(endsAt) - Date.parse(startsAt) <= 7 * 86400000
    )
      selection = { startsAt, endsAt };
  } catch {}
  const minutes = selection
    ? (Date.parse(selection.endsAt) - Date.parse(selection.startsAt)) / 60000
    : 0;
  useEffect(() => {
    let active = true;
    void readPendingCalendarTasks({ force: true })
      .then((value) => {
        if (active) {
          setTasks(value.tasks);
          setTruncated(value.truncated);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("待办暂时无法读取，请稍后重新选择时间格。");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const fits = (task: PendingCalendarTask) =>
    task.estimated_minutes !== null && task.estimated_minutes <= minutes;
  const visible = tasks
    .filter((task) => showAll || fits(task))
    .toSorted((a, b) => Number(fits(b)) - Number(fits(a)));
  const time = (value: string) =>
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto" onCloseAutoFocus={event => { if (handingOff.current) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>把这段时间留给什么？</DialogTitle>
          <DialogDescription>
            {selection
              ? `${time(selection.startsAt)} — ${time(selection.endsAt)}`
              : "请核对开始与结束"}{" "}
            · {minutes} 分钟 · {timezone}。选择仅打开预览，确认后才写入
            Outlook。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            开始
            <input
              className="ui-field min-h-11 w-full text-base"
              type="datetime-local"
              value={startInput}
              onChange={(event) => setStartInput(event.target.value)}
            />
          </label>
          <label>
            结束
            <input
              className="ui-field min-h-11 w-full text-base"
              type="datetime-local"
              value={endInput}
              onChange={(event) => setEndInput(event.target.value)}
            />
          </label>
        </div>
        {!selection ? (
          <p role="alert">
            时间无效、存在时区歧义或超出7天，请调整；尚未写入任何日程。
          </p>
        ) : null}
        <Button
          variant="outline"
          disabled={!selection}
          onClick={() => {
            if (selection) { handoff(); onNew(selection); }
          }}
        >
          新建日程
        </Button>
        <h3 className="font-medium">安排适合的待办</h3>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
          />
          也看未估时和超出时长的任务
        </label>
        {loading ? (
          <p role="status">正在读取…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <ul className="divide-y divide-[var(--separator)]">
            {visible.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="break-words">{task.title}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {task.estimated_minutes === null
                      ? "未估时，请先记录需要多少分钟"
                      : `${task.estimated_minutes} 分钟${fits(task) ? " · 放得下" : " · 超出选区"}`}
                  </p>
                </div>
                {fits(task) ? (
                  <Button
                    disabled={!selection}
                    onClick={() => {
                      if (selection) { handoff(); onTask(task, selection); }
                    }}
                  >
                    预览安排
                  </Button>
                ) : (
                  <Link
                    className="ui-link inline-flex min-h-11 items-center"
                    href={`/tasks?task=${task.id}`}
                  >
                    调整估时
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        {!loading && !error && !visible.length ? (
          <p role="status">
            没有已知时长适合的任务。可查看全部任务并补充估时。
          </p>
        ) : null}
        {truncated ? (
          <p role="status" className="text-sm">
            仅显示最近100项未完成任务；更多任务可从任务模块打开。
          </p>
        ) : null}
        <Button variant="ghost" onClick={onClose}>
          取消，保留日历位置
        </Button>
      </DialogContent>
    </Dialog>
  );
}
