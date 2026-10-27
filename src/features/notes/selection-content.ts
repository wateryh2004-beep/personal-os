import { taskBodyCharacterLimit } from "@/features/tasks/limits";
import { noteInsertionCharacterLimit } from "@/features/workflow-continuity/note-insertion-limits";

export type SelectionSource = { kind: "note"; href: string } | { kind: "pdf"; href: string; page: number };
export type SelectionContent =
  | { status: "ready"; content: string; actual: number; limit: number; referenceOnly: boolean }
  | { status: "over-budget"; actual: number; limit: number };

function checked(content: string, limit: number, referenceOnly: boolean): SelectionContent {
  return content.length <= limit ? { status: "ready", content, actual: content.length, limit, referenceOnly } : { status: "over-budget", actual: content.length, limit };
}

/** Compose first, then check the unchanged downstream limit. Never trim source text. */
export function taskSelectionContent(text: string, source: SelectionSource, referenceOnly = false): SelectionContent {
  return checked(`${referenceOnly ? "" : `${text}\n\n`}原文：${source.href}`, taskBodyCharacterLimit, referenceOnly);
}

export function noteSelectionContent(text: string, source: SelectionSource, referenceOnly = false): SelectionContent {
  const label = source.kind === "pdf" ? `原文件 · 第 ${source.page} 页` : referenceOnly ? "关联原文" : "引用原文";
  const reference = `[${label}](${source.href})`;
  const quote = referenceOnly ? reference : `${text.split("\n").map(line => `> ${line}`).join("\n")}\n\n${reference}`;
  return checked(quote, noteInsertionCharacterLimit, referenceOnly);
}
