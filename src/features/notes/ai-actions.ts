"use server";

import { z } from "zod";
import { deepSeekModelIds } from "@/lib/ai/deepseek";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  isNoteAiPromptKey,
  isRewriteOperation,
  markdownStructureProtectionRule,
  noteAiCitationOperations,
  noteAiCitationRule,
  noteAiInstruction,
  noteAiOperations,
  noteAiSelectionContext,
  noteAiSystemPrompt,
  type NoteAiPromptKey,
} from "./ai-prompts";
import { protectNoteStructures } from "./ai-protect";
import { evaluateRewriteGuardrail } from "./ai-guardrails";
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
  contextBefore: z.string().max(4_000).optional(),
  contextAfter: z.string().max(4_000).optional(),
});
export type NoteAiState = {
  status: "idle" | "success" | "error";
  message: string;
  suggestion: string;
  operation?: string;
  scope?: "note" | "selection";
  warning?: string;
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
    contextBefore: formData.get("context_before") || undefined,
    contextAfter: formData.get("context_after") || undefined,
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
    // 结构保护：rewrite 类操作的输出会写回笔记，先把内部链接/双链/图片/代码块
    // 换成占位符再发给模型，返回后还原，避免润色时被当成乱码删掉。辅助类操作
    // （askNote/summarize/explain 等）不保护，模型需要看到真实链接才能回答。
    const shouldProtect = isRewriteOperation(parsed.data.operation);
    const { protected: protectedContent, restore } = shouldProtect
      ? protectNoteStructures(parsed.data.content)
      : { protected: parsed.data.content, restore: (text: string) => text };
    const structureRule = shouldProtect
      ? `\n\n${markdownStructureProtectionRule}`
      : "";
    const selectionNote =
      parsed.data.scope === "selection"
        ? `\n\n上下文：这是用户从笔记中选中的一段文字，可能位于文章中间；只处理这段文字，保留其原有的内部链接、双链、图片与代码块。${noteAiSelectionContext({ before: parsed.data.contextBefore, after: parsed.data.contextAfter })}`
        : "";
    // 「懂」类操作（问答/思考/解释）要求附原文依据，防止脑补或混淆 Personal Context。
    const citationRule = noteAiCitationOperations.includes(parsed.data.operation)
      ? `\n\n${noteAiCitationRule}`
      : "";
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
      // 个人上下文检索用用户真实问题/笔记标题做 query，而不是整段 system prompt。
      contextQuery: parsed.data.instruction?.trim() || parsed.data.title,
      usePersonalContext:
        parsed.data.scope === "note" && parsed.data.usePersonalContext === true,
      instruction: `${noteAiSystemPrompt(promptOverrides)}\n\n笔记标题：${parsed.data.title || "无标题笔记"}\n\n任务：${noteAiInstruction(parsed.data.operation, parsed.data.instruction, promptOverrides)}${structureRule}${selectionNote}${citationRule}`,
      currentEntity: { type: "note", id: parsed.data.noteId },
      currentSurface: {
        type: "note_draft",
        title: parsed.data.title,
        content: protectedContent,
      },
      requiresCurrentSurface: true,
    });
    const suggestion = result.text.trim();
    if (!suggestion) {
      return {
        status: "error",
        message: "AI 没有返回可预览的内容，请重新生成。笔记尚未发生修改。",
        suggestion: "",
      };
    }
    const response: NoteAiState = {
      status: "success",
      message: "预览已生成。确认操作已显示在抽屉底部。",
      suggestion,
      operation: parsed.data.operation,
      scope: parsed.data.scope,
      contextSources: result.contextSources,
    };
    // 结构保护还原：模型输出里可能残留占位符，映射回真实的链接/双链/图片/代码块。
    if (shouldProtect) response.suggestion = restore(response.suggestion).trim();
    // 改写护栏：改写类输出远短于原文时提示可能丢失内容（软提醒，不阻断确认）。
    const warning = shouldProtect
      ? evaluateRewriteGuardrail(parsed.data.content.length, response.suggestion.length)
      : null;
    // 截断护栏：finishReason="length" 表示输出撞到 token 上限被硬截断，
    // 比"远短于原文"更直接地说明末尾内容可能没处理完。优先展示截断提示。
    if (result.finishReason === "length") {
      response.warning =
        "AI 输出达到长度上限被截断，原文末尾可能未处理完整。建议对超长笔记改用选区分块润色。";
    } else if (warning) {
      response.warning = warning;
    }
    return response;
  } catch {
    return {
      status: "error",
      message:
        "AI 暂时无法生成建议。请确认 Settings 中的 DeepSeek Key 和余额。",
      suggestion: "",
    };
  }
}
