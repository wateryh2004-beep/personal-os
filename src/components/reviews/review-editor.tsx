"use client";

import { Textarea } from "@/components/ui/textarea";
import type { ReviewStructuredData } from "@/features/reviews/types";

type ListKey = Exclude<keyof ReviewStructuredData, "freeReflection">;

const DAILY_FIELDS: Array<[ListKey, string, string]> = [
  ["wins", "进展与收获", "今天推进了什么？每行一项"],
  ["friction", "阻力与摩擦", "哪里不顺，什么在消耗注意力？"],
  ["openLoops", "仍未解决", "哪些事情还没有收束？"],
  ["lessons", "经验与认识", "今天形成了什么认识？"],
];

const WEEKLY_FIELDS: Array<[ListKey, string, string]> = [
  ["wins", "本周进展", "这周真正推进了什么？"],
  ["changes", "发生的变化", "事实、判断或环境发生了什么变化？"],
  ["friction", "反复阻力", "哪些阻力反复出现？"],
  ["openLoops", "仍未解决", "哪些事情仍未收束？"],
  ["nextFocus", "下周重点", "下周最重要的几个焦点是什么？"],
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
    <div className="space-y-5">
      {fields.map(([key, label, placeholder]) => (
        <label key={key} className="block">
          <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{label}</span>
          <Textarea
            value={value[key].join("\n")}
            onChange={(event) => updateList(key, event.target.value)}
            placeholder={placeholder}
            className="mt-1.5 min-h-20 resize-y leading-5.5 shadow-none"
          />
        </label>
      ))}
      <label className="block">
        <span className="text-sm font-semibold text-zinc-800">自由复盘</span>
        <span className="ml-2 text-[10.5px] font-normal text-[var(--text-tertiary)]">自由写作，可留空</span>
        <Textarea
          value={value.freeReflection}
          onChange={(event) => onChange({ ...value, freeReflection: event.target.value })}
          placeholder="用自己的话写下这一周期真正重要的事……"
          className="mt-1.5 min-h-40 resize-y leading-6 shadow-none"
        />
      </label>
    </div>
  );
}
