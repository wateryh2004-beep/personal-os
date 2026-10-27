"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export type SchedulingTask = {
  id: string;
  title: string;
  modified: string | null;
  estimatedMinutes: number | null;
};
export function CalendarTaskDuration({
  task,
  timezone,
  startsAt,
  onClose,
  onChoose,
}: {
  task: SchedulingTask;
  timezone: string;
  startsAt: string;
  onClose: () => void;
  onChoose: (minutes: number) => void;
}) {
  const handingOff = useRef(false);
  const choose = (value: number) => { handingOff.current = true; onChoose(value); };
  const [minutes, setMinutes] = useState("");
  const number = Number(minutes),
    valid =
      /^[1-9]\d*$/.test(minutes) &&
      Number.isSafeInteger(number) &&
      number <= 10080;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent onCloseAutoFocus={event => { if (handingOff.current) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>这次给任务留多少时间？</DialogTitle>
          <DialogDescription>
            {task.title} ·{" "}
            {new Intl.DateTimeFormat("zh-CN", {
              timeZone: timezone,
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            }).format(new Date(startsAt))}
            开始。任务尚未记录估时，先明确本次安排的时长，再打开日程预览；不会改写任务估时。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) choose(number);
          }}
          className="space-y-3"
        >
          <label className="grid gap-2 text-sm">
            本次安排分钟
            <input
              className="ui-field min-h-11 text-base"
              type="number"
              inputMode="numeric"
              min="1"
              max="10080"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!valid}>用输入的时长预览</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => choose(45)}
            >
              本次明确选择45分钟建议
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              取消安排
            </Button>
          </div>
        </form>
        <p className="text-xs text-[var(--text-secondary)]">
          此处不会写入Outlook；最终预览仍需确认，取消不创建日程。
        </p>
      </DialogContent>
    </Dialog>
  );
}
