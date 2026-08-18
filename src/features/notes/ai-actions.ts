"use server";

import { z } from "zod";
import type { UIMessage } from "ai";
import { deepSeekModelIds } from "@/lib/ai/deepseek";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  isNoteAiPromptKey,
  isDiscussionOperation,
  isRewriteOperation,
  markdownStructureProtectionRule,
  noteAiCitationOperations,
  noteAiCitationRule,
  noteAiConversationHistory,
  noteAiInstruction,
  noteAiOperations,
  noteAiSelectionContext,
  noteAiSystemPrompt,
  noteAiUserMessage,
  type NoteAiPromptKey,
} from "./ai-prompts";
import { protectNoteStructures } from "./ai-protect";
import { evaluateRewriteGuardrail } from "./ai-guardrails";
import {
  assertOwnedRun,
  createAgentRun,
  persistAgentMessage,
  updateAgentRun,
} from "@/features/assistant/persistence";
import { runAssistant } from "@/features/assistant/runtime";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const requestSchema = z.object({
  noteId: z.string().uuid(),
  title: z.string().trim().max(240),
  content: z.string().trim().min(1).max(800_000),
  operation: z.enum(noteAiOperations),
  instruction: z.string().trim().max(2_000).optional(),
  model: z.enum(deepSeekModelIds).optional(),
  scope: z.enum(["note", "selection"]),
  usePersonalContext: z.boolean().optional(),
  contextBefore: z.string().max(4_000).optional(),
  contextAfter: z.string().max(4_000).optional(),
  runId: z.string().uuid().nullable().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(384_000),
      }),
    )
    .max(16)
    .optional(),
  continuationAfter: z.string().max(32_000).optional(),
});
export type NoteAiState = {
  status: "idle" | "success" | "error";
  message: string;
  suggestion: string;
  operation?: string;
  scope?: "note" | "selection";
  warning?: string;
  truncated?: boolean;
  contextSources?: Array<{
    id: string;
    title: string;
    domain: string;
    entityType?: string | null;
    href?: string | null;
    reasons: string[];
  }>;
  runId?: string;
};

/** history 由前端序列化后经 FormData 传入，JSON 解析失败时静默丢弃。 */
function parseHistory(
  value: FormDataEntryValue | null,
): Array<{ role: "user" | "assistant"; content: string }> | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return JSON.parse(value) as Array<{
      role: "user" | "assistant";
      content: string;
    }>;
  } catch {
    return undefined;
  }
}

export async function generateNoteAiSuggestion(
  formData: FormData,
): Promise<NoteAiState> {
  let runId: string | null = null;
  let supabase: Supabase | null = null;
  let userId = "";
  try {
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
      runId: formData.get("run_id") || null,
      history: parseHistory(formData.get("history")),
      continuationAfter: formData.get("continuation_after") || undefined,
    });
    if (!parsed.success)
      return { status: "error", message: "AI 请求内容无效。", suggestion: "" };
    const owner = await requireOwner();
    supabase = owner.supabase;
    userId = owner.userId;
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
    // 会话持久化：同一条 run 累积这篇笔记的多轮 AI 对话。无 runId 时新建一个
    // surface=notes 的 run（每轮记录都会存进 agent_messages，形成跨刷新、跨设备
    // 可回看的"文档讨论历史"）；有 runId 时续跑同一 run。
    const userMessage = noteAiUserMessage(
      parsed.data.operation,
      parsed.data.instruction,
      parsed.data.scope,
    );
    if (parsed.data.runId) {
      await assertOwnedRun(owner.supabase, owner.userId, parsed.data.runId);
      runId = parsed.data.runId;
    } else {
      runId = await createAgentRun({
        supabase: owner.supabase,
        userId: owner.userId,
        surface: "notes",
        userRequest: userMessage,
        currentPath: `/notes/${parsed.data.noteId}`,
        currentEntity: { type: "note", id: parsed.data.noteId },
      });
    }
    await persistAgentMessage({
      supabase: owner.supabase,
      userId: owner.userId,
      runId,
      message: {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: userMessage }],
      } as unknown as UIMessage,
    });
    // 多轮讨论：把前几轮对话嵌入 prompt，让模型延续上下文而非当成全新任务。
    const historyBlock = noteAiConversationHistory(parsed.data.history ?? []);
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
    const discussion = isDiscussionOperation(parsed.data.operation);
    const selectionNote =
      parsed.data.scope === "selection"
        ? discussion
          ? `\n\n上下文：这是用户从笔记中选中的一段文字。围绕它讨论即可，绝不把回答伪装成待替换的正文。${noteAiSelectionContext({ before: parsed.data.contextBefore, after: parsed.data.contextAfter })}`
          : `\n\n上下文：这是用户从笔记中选中的一段文字，可能位于文章中间；只处理这段文字，保留其原有的内部链接、双链、图片与代码块。${noteAiSelectionContext({ before: parsed.data.contextBefore, after: parsed.data.contextAfter })}`
        : "";
    const continuationNote = parsed.data.continuationAfter
      ? `\n\n上一轮回答已在长度上限处中断。下面是末尾片段：\n${parsed.data.continuationAfter}\n\n从中断处自然继续；不要重复前文、不要重新开始任务。`
      : "";
    // 「懂」类操作（问答/思考/解释）要求附原文依据，防止脑补或混淆 Personal Context。
    const citationRule = noteAiCitationOperations.includes(parsed.data.operation)
      ? `\n\n${noteAiCitationRule}`
      : "";
    const result = await runAssistant({
      surface: "notes",
      mode: discussion ? "chat" : "transform",
      // 生成标题对质量敏感，固定用 Pro（只输出几个字，成本可忽略），
      // 其他操作跟随用户面板选择。
      model:
        parsed.data.operation === "generateTitle"
          ? "deepseek-v4-pro"
          : parsed.data.model,
      operation: parsed.data.operation,
      // 个人上下文检索用用户真实问题/笔记标题做 query，而不是整段 system prompt。
      contextQuery: parsed.data.instruction?.trim() || parsed.data.title,
      usePersonalContext:
        parsed.data.scope === "note" && parsed.data.usePersonalContext === true,
      instruction: `${noteAiSystemPrompt(promptOverrides)}\n\n笔记标题：${parsed.data.title || "无标题笔记"}\n\n任务：${noteAiInstruction(parsed.data.operation, parsed.data.instruction, promptOverrides)}${historyBlock}${structureRule}${selectionNote}${citationRule}${continuationNote}`,
      currentEntity: { type: "note", id: parsed.data.noteId },
      currentSurface: {
        type: "note_draft",
        title: parsed.data.title,
        content: protectedContent,
      },
      requiresCurrentSurface: true,
      runId,
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
      message:
        parsed.data.operation === "generateTitle"
          ? "已生成标题并替换，可在标题栏旁撤回。"
          : "预览已生成。确认操作已显示在抽屉底部。",
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
      response.truncated = true;
      response.warning =
        "AI 输出达到长度上限被截断，原文末尾可能未处理完整。建议对超长笔记改用选区分块润色。";
    } else if (warning) {
      response.warning = warning;
    }
    // 把 AI 结果作为本轮助手消息落库，与用户消息形成完整对话记录。
    await persistAgentMessage({
      supabase: owner.supabase,
      userId: owner.userId,
      runId,
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: response.suggestion }],
      } as unknown as UIMessage,
    });
    await updateAgentRun({
      supabase: owner.supabase,
      userId: owner.userId,
      runId,
      status: "completed",
      model: result.modelId,
    });
    return { ...response, runId };
  } catch {
    if (runId && supabase && userId)
      await updateAgentRun({
        supabase,
        userId,
        runId,
        status: "failed",
      }).catch(() => undefined);
    return {
      status: "error",
      message:
        "AI 暂时无法生成建议。请确认 Settings 中的 DeepSeek Key 和余额。",
      suggestion: "",
    };
  }
}
