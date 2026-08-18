export const noteContentOrigins = ["human", "ai_generated"] as const;
export type NoteContentOrigin = (typeof noteContentOrigins)[number];

export function isAiGeneratedNote(origin: string | null | undefined) {
  return origin === "ai_generated";
}

export function noteContentOriginLabel(origin: string | null | undefined) {
  return isAiGeneratedNote(origin) ? "AI 生成" : "人工内容";
}
