"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAssistant } from "@/features/assistant/runtime";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  countReviewEvidence,
  getReviewEvidence,
  reviewEvidenceSources,
  serializeReviewEvidence,
} from "./evidence";
import {
  humanizeReviewDraftSources,
  parseJsonObject,
  reviewStructuredDataToMarkdown,
} from "./formatting";
import { getReviewPeriod } from "./periods";
import {
  completeReviewSchema,
  reviewProposalEnvelopeSchema,
  reviewStructuredDataSchema,
} from "./schemas";

const legacyCreateSchema = z.object({
  type: z.enum(["daily", "weekly"]),
  content: z.string().trim().min(1).max(10000),
});
const reviewTypeSchema = z.enum(["daily", "weekly"]);
const reviewIdSchema = z.string().uuid();
const decisionReviewSchema = z
  .object({
    decisionId: z.string().uuid(),
    content: z.string().trim().min(1).max(10000),
    outcome: z.enum(["keep", "reverse"]),
    newTitle: z.string().trim().max(200).optional(),
    newDecisionText: z.string().trim().max(5000).optional(),
    rationale: z.string().max(20000).optional(),
  })
  .superRefine((value, context) => {
    if (value.outcome === "reverse" && (!value.newTitle || !value.newDecisionText)) {
      context.addIssue({
        code: "custom",
        message: "反转决定时必须记录新的决定。",
      });
    }
  });

async function ownerTimezone() {
  const owner = await requireOwner();
  const { data: profile } = await owner.supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", owner.userId)
    .maybeSingle();
  return { ...owner, timezone: profile?.timezone || "Asia/Shanghai" };
}

function reviewTitle(type: "daily" | "weekly", startDate: string, endDate: string) {
  return type === "daily"
    ? `每日复盘 · ${startDate}`
    : `每周复盘 · ${startDate} — ${endDate}`;
}

async function saveCompletedReview(input: z.infer<typeof completeReviewSchema>) {
  const { supabase, userId, timezone } = await ownerTimezone();
  const now = new Date();
  const period = getReviewPeriod(input.type, now, timezone);
  const evidence = await getReviewEvidence({ type: input.type, now });
  const sources = reviewEvidenceSources(evidence);
  const content = reviewStructuredDataToMarkdown(input.structuredData);
  if (!content) throw new Error("请至少写下一项复盘内容。 ");

  const { data, error } = await supabase.rpc("complete_review_with_sources", {
    p_review_type: input.type,
    p_review_key: period.key,
    p_title: reviewTitle(input.type, period.startDate, period.endDate),
    p_period_start: period.startDate,
    p_period_end: period.endDate,
    p_content_markdown: content,
    p_structured_data: input.structuredData,
    p_generated_with_ai: input.generatedWithAi,
    p_sources: sources,
  });
  const result = (data ?? {}) as Record<string, unknown>;
  const reviewId = typeof result.review_id === "string" ? result.review_id : null;
  const sourceCount = Number(result.source_count ?? 0);
  const versionNumber = Number(result.version_number ?? 0);
  if (error || !reviewId || !versionNumber) {
    throw new Error("无法原子保存复盘、来源与版本快照，请稍后再试。");
  }

  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: versionNumber > 1 ? "review_amend" : "review_complete",
    entity_type: "review",
    entity_id: reviewId,
    actor_type: "user",
    after_data: {
      review_type: input.type,
      period: period.key,
      source_count: sourceCount,
      generated_with_ai: input.generatedWithAi,
    },
  });
  revalidatePath("/reviews");
  revalidatePath(`/reviews/${input.type}`);
  revalidatePath(`/reviews/${reviewId}`);
  return { reviewId, sourceCount, versionNumber };
}

export async function completeReview(input: unknown) {
  return saveCompletedReview(completeReviewSchema.parse(input));
}

export async function createReview(input: unknown) {
  const value = legacyCreateSchema.parse(input);
  return saveCompletedReview({
    type: value.type,
    structuredData: {
      wins: [],
      friction: [],
      openLoops: [],
      changes: [],
      lessons: [],
      nextFocus: [],
      freeReflection: value.content,
    },
    generatedWithAi: false,
  });
}

export async function generateReviewDraft(typeInput: unknown) {
  const type = reviewTypeSchema.parse(typeInput);
  const evidence = await getReviewEvidence({ type });
  const coverage = countReviewEvidence(evidence);
  if (!coverage) {
    return {
      ok: false as const,
      error: "本周期没有可验证记录。你仍可以直接写下自己的 Reflection。",
      coverage,
    };
  }
  try {
    const result = await runAssistant({
      surface: "reviews",
      mode: "transform",
      operation: "draftReview",
      usePersonalContext: false,
      instruction: `基于 Review Evidence 生成${type === "daily" ? "每日" : "每周"}复盘草稿。只输出 JSON，不要 Markdown 代码块。JSON 必须包含 wins、friction、openLoops、changes、lessons、nextFocus 六个字符串数组，以及 freeReflection 字符串。只写证据能支持的内容，不把推论写成事实；不确定处用“需要判断”表述。最多每组 5 项。如需标注来源，只能使用 Evidence 中的人类可读“来源标题”，格式为“（来源：标题）”；禁止输出 UUID、source id、note:、todo_task: 等内部标识，也不要给每句话机械添加来源。Evidence count=${coverage}，如果少于 3 条，在 freeReflection 明确说明记录覆盖较低。`,
      currentSurface: {
        type: "review_evidence",
        title: reviewTitle(type, evidence.periodStart, evidence.periodEnd),
        content: serializeReviewEvidence(evidence),
      },
    });
    const parsedDraft = reviewStructuredDataSchema.parse(parseJsonObject(result.text));
    const draft = humanizeReviewDraftSources(parsedDraft, evidence);
    return { ok: true as const, draft, coverage };
  } catch {
    return {
      ok: false as const,
      error: "AI 草稿暂时无法生成。Evidence 已保留，你可以继续手动复盘。",
      coverage,
    };
  }
}

export async function generateReviewProposals(reviewIdInput: unknown) {
  const reviewId = reviewIdSchema.parse(reviewIdInput);
  const { supabase, userId } = await requireOwner();
  const [{ data: review }, { data: sources }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("reviews")
      .select("id,title,review_type,content_markdown,structured_data,status")
      .eq("id", reviewId)
      .eq("status", "completed")
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("review_sources")
      .select("source_type,source_id,source_role")
      .eq("review_id", reviewId),
    supabase
      .from("review_proposals")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId)
      .eq("status", "pending"),
  ]);
  if (!review) throw new Error("找不到已完成复盘或无权访问。");
  if (pendingCount) return { created: 0, alreadyPending: true };
  const sourceIds = new Set((sources ?? []).map((source) => source.source_id));
  if (!sourceIds.size) {
    return { created: 0, alreadyPending: false };
  }

  const sourceIndex = (sources ?? [])
    .map((source) => `${source.source_type}:${source.source_id}:${source.source_role}`)
    .join("\n");
  const result = await runAssistant({
    surface: "reviews",
    mode: "transform",
    operation: "extractReviewProposals",
    usePersonalContext: false,
    instruction: `从已完成复盘中提炼少量、真正值得长期保留的候选。只输出 {"proposals": [...]} JSON，不要代码块。允许 type：profile_memory、working_memory、decision_keep、decision_supersede、decision_reverse。每项字段：type、title、content、rationale、evidenceSourceIds；Decision 类型还必须有 decisionId，且它必须来自 decision source；working_memory 还必须有未来 14—30 天的 ISO reviewAt。不要创建新 Decision；不要把一次性细节变成 profile memory；证据不足时返回空数组。最多 5 项。`,
    currentSurface: {
      type: "review_evidence",
      title: review.title,
      content: `${review.content_markdown}\n\nSOURCE INDEX\n${sourceIndex}`,
    },
  });
  const envelope = reviewProposalEnvelopeSchema.parse(parseJsonObject(result.text));
  const proposals = envelope.proposals
    .map((proposal) => ({
      ...proposal,
      evidenceSourceIds: proposal.evidenceSourceIds.filter((id) => sourceIds.has(id)),
    }))
    .filter((proposal) => proposal.evidenceSourceIds.length > 0);
  if (!proposals.length) return { created: 0, alreadyPending: false };

  const { error } = await supabase.from("review_proposals").insert(
    proposals.map((proposal) => ({
      user_id: userId,
      review_id: reviewId,
      proposal_type: proposal.type,
      payload: {
        title: proposal.title,
        content: proposal.content,
        rationale: proposal.rationale,
        evidenceSourceIds: proposal.evidenceSourceIds,
        decisionId: proposal.decisionId ?? null,
        reviewAt: proposal.reviewAt ?? null,
      },
    })),
  );
  if (error) throw new Error("长期信息候选未能保存；Memory 与 Decision 均未改变。");
  revalidatePath(`/reviews/${reviewId}`);
  return { created: proposals.length, alreadyPending: false };
}

export async function acceptReviewProposal(proposalIdInput: unknown) {
  const proposalId = reviewIdSchema.parse(proposalIdInput);
  const { supabase } = await requireOwner();
  const { error } = await supabase.rpc("accept_review_proposal", {
    p_proposal_id: proposalId,
  });
  if (error) {
    throw new Error("候选已被处理、引用已变化，或无法安全写入长期信息。");
  }
  revalidatePath("/reviews");
  revalidatePath("/memory");
}

export async function dismissReviewProposal(proposalIdInput: unknown) {
  const proposalId = reviewIdSchema.parse(proposalIdInput);
  const { supabase } = await requireOwner();
  const { error } = await supabase.rpc("dismiss_review_proposal", {
    p_proposal_id: proposalId,
  });
  if (error) throw new Error("候选已被处理或无权访问。");
  revalidatePath("/reviews");
}

export async function completeDecisionReview(input: unknown) {
  const value = decisionReviewSchema.parse(input);
  const { supabase, userId, timezone } = await ownerTimezone();
  const { data: decision } = await supabase
    .from("decisions")
    .select("id,title")
    .eq("id", value.decisionId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (!decision) throw new Error("找不到待复核决定或无权访问。");
  const period = getReviewPeriod("daily", new Date(), timezone);
  const key = `decision:${decision.id}:${period.startDate}`;
  const { data: reviewId, error } = await supabase.rpc("complete_decision_review", {
    p_decision_id: decision.id,
    p_review_key: key,
    p_title: `决定复核 · ${decision.title}`,
    p_review_date: period.startDate,
    p_content: value.content,
    p_outcome: value.outcome,
    p_new_title: value.newTitle || null,
    p_new_decision_text: value.newDecisionText || null,
    p_rationale: value.rationale || "",
  });
  if (error || !reviewId) {
    throw new Error("决定复核未能原子保存，决定仍保持原状。");
  }
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "decision_review_complete",
    entity_type: "review",
    entity_id: reviewId,
    actor_type: "user",
    after_data: { decision_id: decision.id, outcome: value.outcome },
  });
  revalidatePath("/reviews");
  revalidatePath("/memory");
}
