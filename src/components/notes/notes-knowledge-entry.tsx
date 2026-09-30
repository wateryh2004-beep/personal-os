"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useState } from "react";

const shortcuts = [
  "最近我在思考什么？",
  "找出互相矛盾的观点",
  "整理最近 30 天的重要决定",
] as const;

function openAgent(query: string) {
  window.dispatchEvent(new CustomEvent("personal-os:agent-open"));
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("personal-os:agent-submit", { detail: { query } }),
    );
  }, 0);
}

export function NotesKnowledgeEntry({ folderName }: { folderName?: string | null }) {
  const [query, setQuery] = useState("");
  const scope = folderName ? `当前文件夹“${folderName}”` : "全部笔记";
  const scopedPrompt = (value: string) =>
    `${value}\n\n知识范围：${scope}。请优先检索 Notes，并为结论附上可打开的来源；证据不足时明确说明。`;

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    openAgent(scopedPrompt(trimmed));
    setQuery("");
  };

  return (
    <section className="mt-4 max-w-3xl border-b border-[var(--separator)] pb-3.5" aria-labelledby="ask-notes-heading">
      <div className="flex items-center gap-2 text-[11.5px] text-[var(--text-secondary)]">
        <Sparkles className="size-3.5 text-[var(--accent)]" aria-hidden="true" />
        <h3 id="ask-notes-heading" className="font-medium text-[var(--text-primary)]">
          询问笔记
        </h3>
        <span aria-label={`知识范围：${scope}`} className="rounded-full bg-[var(--surface-control)] px-2 py-0.5 text-[10.5px]">
          {scope}
        </span>
      </div>
      <form
        className="mt-2.5 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={2_000}
          placeholder="询问你的知识库…"
          aria-label="询问你的笔记"
          className="h-9 min-w-0 flex-1 rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="pressable flex size-9 shrink-0 items-center justify-center rounded-[9px] text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-35"
          aria-label="在 Personal OS 中询问"
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
        {shortcuts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => submit(prompt)}
            className="text-left text-[10.5px] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}
