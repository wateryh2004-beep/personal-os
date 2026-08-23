"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { AssistantStreamSource } from "@/features/assistant/stream-metadata";

export function AssistantStreamSources({ sources }: { sources: AssistantStreamSource[] }) {
  const unique = [
    ...new Map(
      sources
        .filter((source) => source.title.trim())
        .map((source) => [`${source.domain}:${source.href ?? ""}:${source.title}`, source]),
    ).values(),
  ].slice(0, 16);
  if (!unique.length) return null;

  return (
    <details className="mt-2 rounded-[10px] bg-[var(--surface-hover)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium">
        <span>参考来源 · {unique.length}</span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </summary>
      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--border-subtle)] pt-2">
        {unique.map((source) => (
          <span
            key={`${source.domain}:${source.href ?? ""}:${source.title}`}
            className="inline-flex max-w-full items-center rounded-[7px] bg-[var(--surface-canvas)] px-2 py-1"
          >
            {source.href ? (
              <Link href={source.href} className="max-w-[240px] truncate hover:text-[var(--accent)]">
                {source.title}
              </Link>
            ) : (
              <span className="max-w-[240px] truncate">{source.title}</span>
            )}
          </span>
        ))}
      </div>
    </details>
  );
}
