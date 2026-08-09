"use server";

import { z } from "zod";
import { deepSeekModelIds } from "@/lib/ai/deepseek";
import { requireOwner } from "@/lib/auth/require-owner";
import { noteAiInstruction, noteAiOperations } from "./ai-prompts";
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
    const { supabase } = await requireOwner();
    const { data: note } = await supabase
      .from("notes")
      .select("id")
      .eq("id", parsed.data.noteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!note)
      return { status: "error", message: "找不到这篇笔记。", suggestion: "" };
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
      instruction: `笔记标题：${parsed.data.title || "无标题笔记"}\n\n任务：${noteAiInstruction(parsed.data.operation, parsed.data.instruction)}`,
      currentEntity: { type: "note", id: parsed.data.noteId },
      currentSurface: {
        type: "note_draft",
        title: parsed.data.title,
        content: parsed.data.content,
      },
    });
    return {
      status: "success",
      message: "预览已生成。请使用底部固定确认区决定是否写入笔记。",
      suggestion: result.text,
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
