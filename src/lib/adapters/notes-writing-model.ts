import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { getDeepSeekModel } from "@/lib/ai/deepseek";
import { type NoteWritingMode, validOpenAiModelId, writingProviderForMode } from "@/features/assistant/writing-modes";

/** Explicit provider routing; no silent model/provider substitution. */
export async function getNotesWritingModel(userId: string, mode: NoteWritingMode) {
  if (writingProviderForMode(mode) === "deepseek") {
    const selected = await getDeepSeekModel(userId, "deepseek-v4-flash");
    return { model: selected.model, modelId: selected.modelId, provider: "deepseek" as const };
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("openai_key_not_configured");
  const modelId = (mode === "quality" ? process.env.OPENAI_WRITING_MODEL : process.env.OPENAI_REASONING_MODEL)?.trim();
  if (!validOpenAiModelId(modelId)) throw new Error("openai_model_not_configured");
  const provider = createOpenAI({ apiKey });
  return { model: provider.responses(modelId), modelId, provider: "openai" as const };
}
