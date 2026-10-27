"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Draggable } from "@fullcalendar/interaction";
import { GripVertical } from "lucide-react";
import { readPendingCalendarTasks } from "@/features/workbench/operation-read-resource";
import { Button } from "@/components/ui/button";
import styles from "./calendar-native.module.css";
export type PendingCalendarTask = Awaited<
  ReturnType<typeof readPendingCalendarTasks>
>["tasks"][number];
export function CalendarPendingTasks({
  onSchedule,
}: {
  onSchedule: (task: PendingCalendarTask) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<PendingCalendarTask[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const hintId = useId();
  useEffect(() => {
    let current = true;
    void readPendingCalendarTasks({ force: attempt > 0 })
      .then((value) => {
        if (current) {
          setTasks(value.tasks);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (current) setStatus("error");
      });
    return () => {
      current = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!root.current) return;
    const draggable = new Draggable(root.current, {
      itemSelector: "[data-calendar-task-id][data-calendar-task-minutes]",
      longPressDelay: 450,
      minDistance: 8,
      eventData: (element) => ({
        title: element.dataset.calendarTaskTitle,
        duration: {
          minutes: Number(element.dataset.calendarTaskMinutes),
        },
        create: false,
      }),
    });
    return () => draggable.destroy();
  }, []);
  return (
    <div
      ref={root}
      className={styles.pendingTasks}
      aria-label="待安排任务"
      aria-busy={status === "loading"}
    >
      <div className={styles.pendingIntro}>
        <p>待安排</p>
        <p id={hintId} className={styles.pendingHint}>
          已估时任务可拖到时间格，按记录的时长预览；未估时请点击安排并明确选择本次时长。
        </p>
      </div>
      {tasks.map((task) => (
        <div key={task.id} className={styles.pendingChip}>
          <span
            data-calendar-task-id={task.id}
            data-calendar-task-title={task.title}
            data-calendar-task-modified={task.provider_last_modified_at ?? ""}
            data-calendar-task-minutes={task.estimated_minutes ?? undefined}
            aria-describedby={hintId}
          >
            {task.estimated_minutes != null ? (
              <GripVertical size={14} aria-hidden="true" />
            ) : null}
            <span>
              {task.title} ·{" "}
              {task.estimated_minutes == null
                ? "未估时，先选择本次时长"
                : `${task.estimated_minutes}分钟`}
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => onSchedule(task)}>
            安排
          </Button>
        </div>
      ))}
      {status === "loading" ? (
        <p role="status" className="text-sm text-[var(--text-tertiary)]">
          正在读取待安排任务…
        </p>
      ) : status === "error" ? (
        <p role="status">
          待安排任务暂时无法读取。
          <button
            type="button"
            className="ml-2 min-h-11 underline"
            onClick={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          >
            重试
          </button>
        </p>
      ) : !tasks.length ? (
        <p role="status" className="text-sm text-[var(--text-tertiary)]">
          没有未完成任务
        </p>
      ) : null}
    </div>
  );
}
