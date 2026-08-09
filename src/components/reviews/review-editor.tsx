"use client";

import { Textarea } from "@/components/ui/textarea";
import type { ReviewStructuredData } from "@/features/reviews/types";

type ListKey = Exclude<keyof ReviewStructuredData, "freeReflection">;

const DAILY_FIELDS: Array<[ListKey, string, string]> = [
  ["wins", "Wins", "今天推进了什么？每行一项"],
  ["friction", "Friction", "哪里不顺，什么在消耗注意力？"],
  ["openLoops", "Open Loops", "哪些事情还没有收束？"],
  ["lessons", "Lessons", "今天形成了什么认识？"],
];

const WEEKLY_FIELDS: Array<[ListKey, string, string]> = [
  ["wins", "Progress", "这周真正推进了什么？"],
  ["changes", "What changed", "事实、判断或环境发生了什么变化？"],
  ["friction", "Recurring friction", "哪些阻力反复出现？"],
  ["openLoops", "Open loops", "哪些事情仍未收束？"],
  ["nextFocus", "Next week focus", "下周最重要的几个焦点是什么？"],
];

export function ReviewEditor({
  type,
  value,
  onChange,
}: {
  type: "daily" | "weekly";
  value: ReviewStructuredData;
  onChange: (next: ReviewStructuredData) => void;
}) {
  const fields = type === "daily" ? DAILY_FIELDS : WEEKLY_FIELDS;
  const updateList = (key: ListKey, raw: string) => {
    onChange({
      ...value,
      [key]: raw
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    });
  };
  return (
    <div className="space-y-6">
      {fields.map(([key, label, placeholder]) => (
        <label key={key} className="block">
          <span className="text-sm font-semibold text-zinc-800">{label}</span>
          <Textarea
            value={value[key].join("\n")}
            onChange={(event) => updateList(key, event.target.value)}
            placeholder={placeholder}
            className="mt-2 min-h-20 resize-y border-zinc-200 bg-white leading-6 shadow-none"
          />
        </label>
      ))}
      <label className="block">
        <span className="text-sm font-semibold text-zinc-800">Reflection</span>
        <span className="ml-2 text-xs font-normal text-zinc-400">自由写作，可留空</span>
        <Textarea
          value={value.freeReflection}
          onChange={(event) => onChange({ ...value, freeReflection: event.target.value })}
          placeholder="用自己的话写下这一周期真正重要的事……"
          className="mt-2 min-h-44 resize-y border-zinc-200 bg-white leading-7 shadow-none"
        />
      </label>
    </div>
  );
}
