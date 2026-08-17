import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { getDeepSeekModel } from "@/lib/ai/deepseek";
import { instantToWallTime } from "@/features/calendar/timezone";
import type { InboxProposal } from "./schemas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const isoDateTime = z.string().datetime({ offset: true });

/**
 * 无对话式识别结果。target 为 none 时表示无法识别，进入收集盒；
 * 其余 target 与 inboxProposalSchema 字段一致，可直接转换为 InboxProposal。
 */
export const inboxClassifySchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("none"),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(200),
  }),
  z.object({
    target: z.literal("task"),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(200).nullable().optional(),
    todoListName: z.string().max(100).nullable().optional(),
    title: z.string().trim().min(1).max(500),
    bodyText: z.string().trim().max(10_000).nullable().optional(),
    importance: z.enum(["low", "normal", "high"]).default("normal"),
    dueAt: isoDateTime.nullable().optional(),
  }),
  z
    .object({
      target: z.literal("calendar"),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(200).nullable().optional(),
      subject: z.string().trim().min(1).max(500),
      description: z.string().trim().max(10_000).nullable().optional(),
      startsAt: isoDateTime,
      endsAt: isoDateTime,
      locationName: z.string().trim().max(500).nullable().optional(),
      isAllDay: z.boolean().default(false),
    })
    .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
      message: "结束时间必须晚于开始时间",
    }),
  z.object({
    target: z.literal("note"),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(200).nullable().optional(),
    title: z.string().trim().min(1).max(240),
    bodyMarkdown: z.string().max(10_000),
  }),
  z.object({
    target: z.literal("daily"),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(200).nullable().optional(),
  }),
]);

export type InboxClassification = z.infer<typeof inboxClassifySchema>;

function timezoneOffsetLabel(timezone: string, date: Date): string {
  const wall = instantToWallTime(date.toISOString(), timezone); // "YYYY-MM-DDTHH:MM"
  const wallEpoch = Date.UTC(
    Number(wall.slice(0, 4)),
    Number(wall.slice(5, 7)) - 1,
    Number(wall.slice(8, 10)),
    Number(wall.slice(11, 13)),
    Number(wall.slice(14, 16)),
  );
  const minutes = Math.round((wallEpoch - date.getTime()) / 60_000);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function buildInboxClassifyPrompt(input: {
  content: string;
  timezone: string;
  now?: Date;
  todoListNames: string[];
}) {
  const now = input.now ?? new Date();
  const wall = instantToWallTime(now.toISOString(), input.timezone);
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone: input.timezone,
    weekday: "long",
  }).format(now);
  const offset = timezoneOffsetLabel(input.timezone, now);
  const lists = input.todoListNames.length
    ? input.todoListNames.join("、")
    : "（无，将使用默认清单）";
  const system =
    `你是 Personal OS 的 Inbox 整理器。你只负责把一条记录分类成最适合的去向，绝不创建或修改任何数据。\n` +
    `\n` +
    `可选去向：\n` +
    `- task    明确需要自己执行、有行动指向的承诺 / 待办 / 提醒\n` +
    `- calendar 带具体日期或时间的安排、活动、会议、约见\n` +
    `- note    适合长期复用、不以当天经历为主的成块知识 / 草稿 / 想法整理\n` +
    `- daily   今天发生的事、当下感受、个人反思、经验教训、生活记录\n` +
    `- none    内容含糊、没有明确去向、信息不足，或以上都不匹配。拿不准就选 none，不要硬塞。\n` +
    `\n` +
    `今天的日期：${wall.slice(0, 10)} ${weekday}（用户时区 ${input.timezone}，UTC${offset}）。\n` +
    `记录里的相对时间（今天 / 明天 / 后天 / 本周 / 下周 / 周X / X点）一律按这个日期换算成具体日期时间，输出为带用户时区偏移的 ISO 8601 字符串，例如 2026-08-17T14:30:00${offset}；绝不能把本地钟点写成 Z，也不能编造记录里没有的日期与细节；不确定的时间置为 null 或选择 none。\n` +
    `\n` +
    `可用的 Microsoft To Do 清单：${lists}。task 的 todoListName 只能从中选择，或留空交给默认清单。\n` +
    `\n` +
    `只输出一个合法的 JSON 对象（target 取值 task / calendar / note / daily / none 之一，并附带对应字段），除此之外不要输出任何文字。`;
  return { system, prompt: `需要整理的 Inbox 记录：\n${input.content}` };
}

export type InboxClassifyResult =
  | { status: "ready"; proposal: InboxProposal }
  | { status: "failed"; error: string | null };

/** 识别一条 Inbox：把去向提案落库，供前端直接渲染确认卡。 */
export async function classifyInboxItem(input: {
  supabase: Supabase;
  userId: string;
  inboxId: string;
  now?: Date;
}): Promise<InboxClassifyResult> {
  const { data: item } = await input.supabase
    .from("inbox_items")
    .select("id,content_markdown")
    .eq("id", input.inboxId)
    .eq("user_id", input.userId)
    .is("archived_at", null)
    .maybeSingle();
  if (!item) return { status: "failed", error: "inbox_not_found" };

  const { data: profile } = await input.supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", input.userId)
    .maybeSingle();
  const timezone = profile?.timezone || "Asia/Shanghai";

  const { data: lists } = await input.supabase
    .from("microsoft_todo_lists")
    .select("id,display_name,is_default")
    .is("archived_at", null)
    .order("display_name");
  const todoLists = lists ?? [];

  let classification: InboxClassification;
  try {
    const configured = await getDeepSeekModel(input.userId, "deepseek-v4-flash");
    const { system, prompt } = buildInboxClassifyPrompt({
      content: item.content_markdown.slice(0, 6000),
      timezone,
      now: input.now,
      todoListNames: todoLists.map((list) => list.display_name),
    });
    const result = await generateObject({
      model: configured.model,
      schema: inboxClassifySchema,
      system,
      prompt,
    });
    classification = result.object;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await markFailed(input.supabase, input.userId, input.inboxId, `AI 识别失败：${message}`);
    return { status: "failed", error: message };
  }

  if (classification.target === "none") {
    await markFailed(
      input.supabase,
      input.userId,
      input.inboxId,
      classification.reason || "无法判断去向",
    );
    return { status: "failed", error: classification.reason || null };
  }

  // task 需要解析为真实的 To Do 清单 id
  let todoListId: string | null = null;
  if (classification.target === "task") {
    const name = classification.todoListName?.trim();
    const exact = name ? todoLists.find((list) => list.display_name === name) : undefined;
    const fuzzy =
      name && !exact
        ? todoLists.find(
            (list) => list.display_name.includes(name) || name.includes(list.display_name),
          )
        : undefined;
    const fallback = todoLists.find((list) => list.is_default) ?? todoLists[0];
    const resolved = exact ?? fuzzy ?? fallback;
    if (!resolved) {
      await markFailed(input.supabase, input.userId, input.inboxId, "没有可用的 To Do 清单");
      return { status: "failed", error: "no_todo_list" };
    }
    todoListId = resolved.id;
  }

  const proposal = toProposal(classification, todoListId);
  if (!proposal) {
    await markFailed(input.supabase, input.userId, input.inboxId, "无法转换为去向提案");
    return { status: "failed", error: "proposal_conversion_failed" };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await input.supabase
    .from("inbox_items")
    .update({
      ai_proposal: proposal,
      ai_status: "ready",
      ai_updated_at: now,
      ai_error: null,
    })
    .eq("id", input.inboxId)
    .eq("user_id", input.userId);
  if (updateError) return { status: "failed", error: updateError.message };
  return { status: "ready", proposal };
}

function toProposal(
  classification: Extract<InboxClassification, { target: "task" | "calendar" | "note" | "daily" }>,
  todoListId: string | null,
): InboxProposal | null {
  switch (classification.target) {
    case "task":
      return todoListId
        ? {
            target: "task",
            todoListId,
            title: classification.title,
            bodyText: classification.bodyText ?? null,
            importance: classification.importance,
            dueAt: classification.dueAt ?? null,
          }
        : null;
    case "calendar":
      return {
        target: "calendar",
        subject: classification.subject,
        description: classification.description ?? null,
        startsAt: classification.startsAt,
        endsAt: classification.endsAt,
        locationName: classification.locationName ?? null,
        isAllDay: classification.isAllDay,
      };
    case "note":
      return {
        target: "note",
        title: classification.title,
        bodyMarkdown: classification.bodyMarkdown,
      };
    case "daily":
      return { target: "daily" };
  }
}

async function markFailed(
  supabase: Supabase,
  userId: string,
  inboxId: string,
  error: string,
) {
  await supabase
    .from("inbox_items")
    .update({
      ai_proposal: null,
      ai_status: "failed",
      ai_updated_at: new Date().toISOString(),
      ai_error: error,
    })
    .eq("id", inboxId)
    .eq("user_id", userId);
}
