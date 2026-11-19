/** Three user-facing intents, independent of specific provider model names. */
export const noteWritingModes = ["fast", "quality", "deep"] as const;
export type NoteWritingMode = (typeof noteWritingModes)[number];
export const noteWritingModeLabels: Record<NoteWritingMode, string> = {
  fast: "快速处理", quality: "高质量写作", deep: "深度思考",
};
export type WritingProvider = "deepseek" | "openai";
export const writingProviderForMode = (mode: NoteWritingMode): WritingProvider =>
  mode === "fast" ? "deepseek" : "openai";
export function validOpenAiModelId(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value));
}
