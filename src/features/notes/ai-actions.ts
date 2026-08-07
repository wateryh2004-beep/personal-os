"use server";

import { generateText } from "ai";
import { z } from "zod";
import { deepSeekModelIds, getDeepSeekModel } from "@/lib/ai/deepseek";
import { requireOwner } from "@/lib/auth/require-owner";
import { noteAiInstruction, noteAiOperations, personalKnowledgeSystemPrompt } from "./ai-prompts";

const requestSchema = z.object({
  noteId: z.string().uuid(), title: z.string().trim().max(240), content: z.string().trim().min(1).max(200_000),
  operation: z.enum(noteAiOperations), instruction: z.string().trim().max(2_000).optional(), model: z.enum(deepSeekModelIds).optional(), scope: z.enum(["note", "selection"]),
});

export type NoteAiState = { status: "idle" | "success" | "error"; message: string; suggestion: string; operation?: string; scope?: "note" | "selection" };

export async function generateNoteAiSuggestion(formData: FormData): Promise<NoteAiState> {
  const parsed = requestSchema.safeParse({ noteId: formData.get("note_id"), title: formData.get("title"), content: formData.get("content"), operation: formData.get("operation"), instruction: formData.get("instruction") || undefined, model: formData.get("model") || undefined, scope: formData.get("scope") });
  if (!parsed.success) return { status: "error", message: "AI 请求内容无效。", suggestion: "" };
  try {
    const { supabase, userId } = await requireOwner();
    const { data: note } = await supabase.from("notes").select("id").eq("id", parsed.data.noteId).is("deleted_at", null).maybeSingle();
    if (!note) return { status: "error", message: "找不到这篇笔记。", suggestion: "" };
    const { model, modelId } = await getDeepSeekModel(userId, parsed.data.model);
    const { text } = await generateText({ model, maxOutputTokens: 1_200, providerOptions: { deepseek: { thinking: { type: "disabled" } } }, system: personalKnowledgeSystemPrompt, prompt: `笔记标题：${parsed.data.title || "无标题笔记"}\n\n任务：${noteAiInstruction(parsed.data.operation, parsed.data.instruction)}\n\n${parsed.data.scope === "selection" ? "所选文字" : "当前笔记正文"}：\n---\n${parsed.data.content}\n---` });
    await supabase.from("audit_logs").insert({ user_id: userId, action: "assist", entity_type: "note", entity_id: parsed.data.noteId, actor_type: "user", after_data: { provider: "deepseek", model: modelId, operation: parsed.data.operation, scope: parsed.data.scope, content_length: parsed.data.content.length } });
    return { status: "success", message: "AI 结果已生成，确认后才会写入笔记。", suggestion: text.trim(), operation: parsed.data.operation, scope: parsed.data.scope };
  } catch {
    return { status: "error", message: "AI 暂时无法生成建议。请确认 Settings 中的 DeepSeek Key 和余额。", suggestion: "" };
  }
}
