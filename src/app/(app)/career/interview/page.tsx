import { InterviewFastWorkspace } from "@/components/career/interview/interview-fast-workspace";
import { getInterviewWorkspaceData } from "@/features/interview/queries";

export default async function InterviewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string; question?: string; category?: string }>;
}) {
  const params = await searchParams;
  const data = await getInterviewWorkspaceData();

  const targets = data.contexts.map((context: any) => ({
    id: context.id as string,
    title: context.title as string,
    organization: (context.organization_snapshot as string | null) ?? null,
    role: (context.role_title_snapshot as string | null) ?? null,
  }));

  const typeById = new Map((data.questionTypes as any[]).map((item: any) => [item.id as string, item]));
  const competencyById = new Map((data.competencies as any[]).map((item: any) => [item.id as string, item]));
  const competenciesByQuestion = new Map<string, any[]>();
  for (const link of data.competencyLinks as any[]) {
    const competency = competencyById.get(link.competency_id);
    if (!competency) continue;
    const list = competenciesByQuestion.get(link.question_id) ?? [];
    list.push({ ...competency, relevance: link.relevance, isPrimary: link.is_primary });
    competenciesByQuestion.set(link.question_id, list);
  }
  for (const list of competenciesByQuestion.values()) {
    list.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.relevance - a.relevance || a.position - b.position);
  }

  const answersByPreparation = new Map<string, any[]>();
  for (const answer of data.answers as any[]) {
    const list = answersByPreparation.get(answer.preparation_id) ?? [];
    list.push(answer);
    answersByPreparation.set(answer.preparation_id, list);
  }

  const items = (data.preparations as any[]).flatMap((prep: any) => {
    const relation = Array.isArray(prep.interview_questions) ? prep.interview_questions[0] : prep.interview_questions;
    if (!relation) return [];
    const answerList = answersByPreparation.get(prep.id) ?? [];
    const answer = answerList.find((candidate: any) => candidate.language === prep.target_language) ?? answerList[0];
    const thoughts = prep.working_thoughts_markdown
      || [prep.key_message, prep.answer_logic_markdown].filter(Boolean).join("\n\n");

    return [{
      preparationId: prep.id as string,
      questionId: prep.question_id as string,
      contextId: (prep.context_id as string | null) ?? null,
      prompt: (prep.prompt_override || relation.canonical_prompt) as string,
      category: (typeById.get(relation.question_type_id)?.key as string | undefined) ?? "behavioral",
      categoryLabel: (typeById.get(relation.question_type_id)?.label as string | undefined) ?? "行为",
      style: (relation.question_style as string | null) ?? "standard",
      subcategory: (relation.subcategory as string | null) ?? null,
      competencies: (competenciesByQuestion.get(prep.question_id) ?? []).map((item: any) => ({
        key: item.key as string,
        label: item.label as string,
      })),
      thoughts: thoughts as string,
      answer: (answer?.body_markdown as string | undefined) ?? "",
      answerId: (answer?.id as string | undefined) ?? null,
    }];
  });

  const targetIds = new Set(targets.map((target) => target.id));
  const requestedContext = params.context && targetIds.has(params.context) ? params.context : "";
  const initialContextId = requestedContext;

  const scopedItems = items.filter((item) => (
    initialContextId ? item.contextId === initialContextId : item.contextId === null
  ));
  const requestedQuestion = params.question && scopedItems.some((item) => item.questionId === params.question)
    ? params.question
    : "";
  const initialQuestionId = requestedQuestion;

  return (
    <InterviewFastWorkspace
      targets={targets}
      items={items}
      initialContextId={initialContextId}
      initialQuestionId={initialQuestionId}
      initialCategory={params.category ?? "all"}
    />
  );
}
