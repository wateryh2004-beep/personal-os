import { InterviewFastWorkspace } from "@/components/career/interview/interview-fast-workspace";
import { getInterviewWorkspaceData } from "@/features/interview/queries";

export default async function InterviewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string; question?: string }>;
}) {
  const params = await searchParams;
  const data = await getInterviewWorkspaceData();

  const targets = data.contexts.map((context: any) => ({
    id: context.id as string,
    title: context.title as string,
    organization: (context.organization_snapshot as string | null) ?? null,
    role: (context.role_title_snapshot as string | null) ?? null,
  }));

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
      thoughts: thoughts as string,
      answer: (answer?.body_markdown as string | undefined) ?? "",
      answerId: (answer?.id as string | undefined) ?? null,
    }];
  });

  const targetIds = new Set(targets.map((target) => target.id));
  const requestedContext = params.context && targetIds.has(params.context) ? params.context : "";
  const initialContextId = requestedContext || targets[0]?.id || "";

  const scopedItems = items.filter((item) => (
    initialContextId ? item.contextId === initialContextId : item.contextId === null
  ));
  const requestedQuestion = params.question && scopedItems.some((item) => item.questionId === params.question)
    ? params.question
    : "";
  const initialQuestionId = requestedQuestion || scopedItems[0]?.questionId || "";

  return (
    <InterviewFastWorkspace
      targets={targets}
      items={items}
      initialContextId={initialContextId}
      initialQuestionId={initialQuestionId}
    />
  );
}
