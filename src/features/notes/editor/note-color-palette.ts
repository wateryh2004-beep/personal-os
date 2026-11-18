/**
 * Notes 3.0 P1.1: semantic color choices shared by document callouts, ink and
 * highlighting. Values are stable identifiers; color values live exclusively
 * in src/app/notes-colors.css and inherit the current Notes theme.
 *
 * These are UI semantics, not arbitrary HTML style permissions or a new
 * Markdown persistence format. P1.2 must validate an explicit canonical
 * syntax before binding user content to any tone.
 */
export const noteColorTones = [
  { id: "info", label: "信息", usage: "资料、参考、背景说明" },
  { id: "warning", label: "提醒", usage: "待办、注意事项、风险提示" },
  { id: "important", label: "重点", usage: "核心结论、需要强调的内容" },
  { id: "idea", label: "思考", usage: "观察、观点、灵感和延伸问题" },
  { id: "quote", label: "引用", usage: "引用、补充说明、中性材料" },
] as const;

export type NoteColorTone = (typeof noteColorTones)[number]["id"];
export type NoteColorRole = "callout" | "text" | "highlight";

const allowedTones: ReadonlySet<string> = new Set(noteColorTones.map(({ id }) => id));

/** Reject unsupported values instead of silently altering imported semantics. */
export function parseNoteColorTone(value: unknown): NoteColorTone | null {
  return typeof value === "string" && allowedTones.has(value)
    ? value as NoteColorTone
    : null;
}

export function noteColorClassName(role: NoteColorRole) {
  return role === "callout" ? "note-color-callout"
    : role === "text" ? "note-color-text"
      : "note-color-highlight";
}
