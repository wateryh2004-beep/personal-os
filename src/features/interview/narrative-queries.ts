import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwner } from "@/lib/auth/require-owner";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import {
  evaluateNarrativeConsistency,
  type NarrativeAnswer,
  type NarrativeBaseline,
  type NarrativeFact,
  type NarrativeFactLink,
  type NarrativeFactVersion,
  type NarrativeLink,
  type NarrativePreparation,
} from "./narrative-consistency";

/** This feature is additive to the generated schema. Regenerate DB types after migration. */
export async function getNarrativeConsistencyData() {
  const { supabase, userId } = await requireOwner();
  const db = supabase as unknown as SupabaseClient;

  const [narrativeResult, questionResult] = await Promise.all([
    readAllRows(db.from("interview_narratives")
      .select("id,title,master_preparation_id,selected_version_id,review_status")
      .eq("user_id", userId).is("archived_at", null).order("id")),
    readAllRows(db.from("interview_questions")
      .select("id,short_title")
      .eq("user_id", userId).eq("short_title", "自我介绍")
      .is("archived_at", null).order("id")),
  ]);
  if (narrativeResult.error || questionResult.error) {
    throw new Error("一致性审计不可用：需要完成数据结构迁移，或检查读取权限。");
  }

  const questions = (questionResult.data ?? []) as { id: string; short_title: string }[];
  const questionIds = questions.map((question) => question.id);
  const narratives = (narrativeResult.data ?? []) as NarrativeBaseline[];
  if (!questionIds.length) {
    return { narratives, versionsByNarrative: {}, rows: [], summary: {
      total: 0, stale: 0, needsLink: 0, needsReview: 0, linked: 0, noFactReferences: 0,
    } };
  }

  const prepResult = await readAllRows(db.from("interview_question_preparations")
    .select("id,question_id,context_id,target_language")
    .eq("user_id", userId).in("question_id", questionIds)
    .is("archived_at", null).order("id"));
  if (prepResult.error) throw new Error("面试准备资料读取失败，审计没有计算不完整的计数。");
  const preps = (prepResult.data ?? []) as Array<{
    id: string; question_id: string; context_id: string | null; target_language: string;
  }>;
  const prepIds = preps.map((p) => p.id);
  if (!prepIds.length) {
    return { narratives, versionsByNarrative: {}, rows: [], summary: {
      total: 0, stale: 0, needsLink: 0, needsReview: 0, linked: 0, noFactReferences: 0,
    } };
  }

  const contextIds = [...new Set(preps.flatMap((p) => p.context_id ? [p.context_id] : []))];
  const [answersResult, contextResult, linksResult] = await Promise.all([
    readAllRows(db.from("interview_answer_versions")
      .select("id,preparation_id,language,answer_mode,target_seconds,status,source,version_number,created_at,updated_at")
      .eq("user_id", userId).in("preparation_id", prepIds)
      .is("archived_at", null).order("id")),
    contextIds.length ? readAllRows(db.from("interview_contexts")
      .select("id,title").eq("user_id", userId).in("id", contextIds)
      .is("archived_at", null).order("id")) : Promise.resolve({ data: [], error: null }),
    readAllRows(db.from("interview_answer_narrative_links")
      .select("id,narrative_id,answer_version_id,based_on_version_id,review_state")
      .eq("user_id", userId).is("archived_at", null).order("id")),
  ]);
  if (answersResult.error || contextResult.error || linksResult.error) {
    throw new Error("答案、岗位或母版引用读取不完整，审计没有将缺失结果算作零。");
  }
  const answers = (answersResult.data ?? []) as NarrativeAnswer[];
  const contexts = (contextResult.data ?? []) as { id: string; title: string }[];
  const contextById = new Map(contexts.map((c) => [c.id, c.title]));
  const preparations: NarrativePreparation[] = preps.map((p) => ({
    ...p, target_title: p.context_id
      ? (contextById.get(p.context_id) ?? "原准备情境不可用")
      : "通用自我介绍",
  }));
  const narrativeLinks = (linksResult.data ?? []) as NarrativeLink[];

  // Read only links belonging to the answer versions in this audit scope.
  const answerIds = answers.map((v) => v.id);
  const factLinkResult = answerIds.length
    ? await readAllRows(db.from("interview_answer_fact_links")
      .select("answer_version_id,fact_id,fact_version_id,review_state")
      .eq("user_id", userId).in("answer_version_id", answerIds)
      .is("archived_at", null).order("id"))
    : { data: [], error: null };
  if (factLinkResult.error) throw new Error("事实引用读取不完整，无法完成审计。");
  const factLinks = (factLinkResult.data ?? []) as NarrativeFactLink[];
  const factIds = [...new Set(factLinks.map((f) => f.fact_id))];
  const [factsResult, versionsResult] = await Promise.all([
    factIds.length ? readAllRows(db.from("experience_facts")
      .select("id,verification_status").eq("user_id", userId)
      .in("id", factIds).order("id")) : Promise.resolve({ data: [], error: null }),
    factIds.length ? readAllRows(db.from("experience_fact_versions")
      .select("id,fact_id,version_number").eq("user_id", userId)
      .in("fact_id", factIds).order("fact_id")) : Promise.resolve({ data: [], error: null }),
  ]);
  if (factsResult.error || versionsResult.error) {
    throw new Error("事实版本读取不完整，无法判断是否需要复核。");
  }
  const result = evaluateNarrativeConsistency({
    narratives,
    preparations,
    answers,
    narrativeLinks,
    factLinks,
    facts: (factsResult.data ?? []) as NarrativeFact[],
    factVersions: (versionsResult.data ?? []) as NarrativeFactVersion[],
  });
  const versionsByNarrative: Record<string, NarrativeAnswer[]> = {};
  for (const narrative of narratives) {
    versionsByNarrative[narrative.id] = answers
      .filter((answer) => answer.preparation_id === narrative.master_preparation_id
        && answer.answer_mode === "spoken"
        && (answer.status === "draft" || answer.status === "current"))
      .sort((a, b) => b.version_number - a.version_number || b.updated_at.localeCompare(a.updated_at));
  }
  return { ...result, narratives, versionsByNarrative };
}
