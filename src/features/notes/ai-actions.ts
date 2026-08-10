"use server";

import { z } from "zod";
import { deepSeekModelIds } from "@/lib/ai/deepseek";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  isNoteAiPromptKey,
  noteAiInstruction,
  noteAiOperations,
  noteAiSystemPrompt,
  type NoteAiPromptKey,
} from "./ai-prompts";
import { runAssistant } from "@/features/assistant/runtime";

const requestSchema = z.object({
  noteId: z.string().uuid(),
  title: z.string().trim().max(240),
  content: z.string().trim().min(1).max(200_000),
  operation: z.enum(noteAiOperations),
  instruction: z.string().trim().max(2_000).optional(),
  model: z.enum(deepSeekModelIds).optional(),
  scope: z.enum(["note", "selection"]),
  usePersonalContext: z.boolean().optional(),
});
export type NoteAiState = {
  status: "idle" | "success" | "error";
  message: string;
  suggestion: string;
  operation?: string;
  scope?: "note" | "selection";
  contextSources?: Array<{
    id: string;
    title: string;
    domain: string;
    entityType?: string | null;
    href?: string | null;
    reasons: string[];
  }>;
};

export async function generateNoteAiSuggestion(
  formData: FormData,
): Promise<NoteAiState> {
  const parsed = requestSchema.safeParse({
    noteId: formData.get("note_id"),
    title: formData.get("title"),
    content: formData.get("content"),
    operation: formData.get("operation"),
    instruction: formData.get("instruction") || undefined,
    model: formData.get("model") || undefined,
    scope: formData.get("scope"),
    usePersonalContext: formData.get("use_personal_context") === "true",
  });
  if (!parsed.success)
    return { status: "error", message: "AI 请求内容无效。", suggestion: "" };
  try {
    const { supabase, userId } = await requireOwner();
    const [{ data: note }, { data: promptRows }] = await Promise.all([
      supabase
        .from("notes")
        .select("id")
        .eq("id", parsed.data.noteId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("ai_prompt_overrides")
        .select("prompt_key,content")
        .eq("user_id", userId),
    ]);
    if (!note)
      return { status: "error", message: "找不到这篇笔记。", suggestion: "" };
    const promptOverrides: Partial<Record<NoteAiPromptKey, string>> = {};
    for (const row of promptRows ?? []) {
      if (isNoteAiPromptKey(row.prompt_key)) {
        promptOverrides[row.prompt_key] = row.content;
      }
    }
    const result = await runAssistant({
      surface: "notes",
      mode:
        parsed.data.scope === "selection"
          ? "transform"
          : parsed.data.operation === "askNote"
            ? "chat"
            : "transform",
      model: parsed.data.model,
      operation: parsed.data.operation,
      usePersonalContext:
        parsed.data.scope === "note" && parsed.data.usePersonalContext === true,
      instruction: `${noteAiSystemPrompt(promptOverrides)}\n\n笔记标题：${parsed.data.title || "无标题笔记"}\n\n任务：${noteAiInstruction(parsed.data.operation, parsed.data.instruction, promptOverrides)}`,
      currentEntity: { type: "note", id: parsed.data.noteId },
      currentSurface: {
        type: "note_draft",
        title: parsed.data.title,
        content: parsed.data.content,
      },
    });
    const suggestion = result.text.trim();
    if (!suggestion) {
      return {
        status: "error",
        message: "AI 没有返回可预览的内容，请重新生成。笔记尚未发生修改。",
        suggestion: "",
      };
    }
    return {
      status: "success",
      message: "预览已生成。确认操作已显示在抽屉底部。",
      suggestion,
      operation: parsed.data.operation,
      scope: parsed.data.scope,
      contextSources: result.contextSources,
    };
  } catch {
    return {
      status: "error",
      message:
        "AI 暂时无法生成建议。请确认 Settings 中的 DeepSeek Key 和余额。",
      suggestion: "",
    };
  }
}
