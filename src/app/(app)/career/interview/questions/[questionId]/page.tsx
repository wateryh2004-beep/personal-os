import { InterviewPrompt } from "@/components/career/interview/interview-prompt";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveInterviewAnswerVersion,
  archiveInterviewQuestion,
  createInterviewAnswerVersion,
  createInterviewQuestion,
  ensureInterviewPreparation,
  linkInterviewEvidence,
  linkStoryToArchetype,
  promoteInterviewAnswerVersion,
  unlinkInterviewEvidence,
  unlinkStoryFromArchetype,
  updateInterviewPreparation,
  updateInterviewQuestion,
} from "@/features/interview/actions";
import { getInterviewQuestionDetail } from "@/features/interview/queries";
import {
  evidenceRelationshipLabels,
  evidenceRelationships,
  evidenceTypeLabels,
  interviewCategories,
  interviewSourceTypes,
  joinTagInput,
  languageLabels,
  sourceTypeLabels,
  storyEvidenceRoleLabels,
  storyStatusLabels,
  variantKindLabels,
} from "@/features/interview/constants";
import { formatDateTime } from "@/features/interview/utils";
import { selectWorkspaceAnswer } from "@/features/interview/workspace-answers";

export default async function InterviewQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ questionId: string }>;
  searchParams: Promise<{ context?: string; answer?: string }>;
}) {
  const { questionId } = await params;
  const { context, answer: requestedAnswerId } = await searchParams;
  const data = await getInterviewQuestionDetail(questionId, context ?? null);
  if (!data) notFound();

  const { question, selectedPreparation: prep } = data;
  const questionTypeRelation = Array.isArray(question.interview_question_types)
    ? question.interview_question_types[0]
    : question.interview_question_types;
  const normalizedCompetencies = data.normalizedCompetencies ?? [];
  const pinnedAnswer = requestedAnswerId
    ? selectWorkspaceAnswer((data.answers ?? []).filter((answer) => answer.id === requestedAnswerId && answer.preparation_id === prep?.id), prep?.target_language ?? "zh")
    : null;
  const primaryAnswer = pinnedAnswer ?? selectWorkspaceAnswer(data.answers ?? [], prep?.target_language ?? "zh");
  const thoughtValue = prep
    ? prep.working_thoughts_markdown || [prep.key_message, prep.answer_logic_markdown].filter(Boolean).join("\n\n")
    : "";

  return (
    <>
      <header className="mb-2">
        <Link href="/career/interview/questions" className="text-xs text-zinc-400 hover:text-zinc-700">← 题目</Link>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span>{questionTypeRelation?.label ?? "面试题"}</span>
          {data.archetype?.title ? <span>· 母题：{data.archetype.title}</span> : null}
          {question.variant_kind && question.variant_kind !== "canonical" ? <span>· {variantKindLabels[question.variant_kind] ?? question.variant_kind}</span> : null}
          {question.question_style === "stress" ? <span>· 压力风格</span> : null}
          {normalizedCompetencies.slice(0, 3).map((item: any) => <span key={item.competency_id}>· {item.competency.label}</span>)}
        </div>
        <div className="mt-3 max-w-3xl"><InterviewPrompt prompt={prep?.prompt_override || question.canonical_prompt} shortTitle={question.short_title} /></div>
      </header>


      <form className="mb-10 flex items-center gap-2">
        <select name="context" defaultValue={context ?? ""} className="max-w-sm px-3 py-2 text-sm text-zinc-600">
          <option value="">通用</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="text-xs text-zinc-400 hover:text-zinc-700">切换</button>
      </form>

      {!prep ? (
        <form action={ensureInterviewPreparation} className="py-6">
          <input type="hidden" name="question_id" value={questionId} />
          <input type="hidden" name="context_id" value={context ?? ""} />
          <button className="text-sm font-medium text-[#365F78]">开始写 →</button>
        </form>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="text-[15px] font-medium text-zinc-950">思路</h2>
            <form action={updateInterviewPreparation} className="mt-3">
              <PreparationStateFields prep={prep} questionId={questionId} />
              <textarea
                name="working_thoughts_markdown"
                defaultValue={thoughtValue}
                rows={8}
                placeholder="先把你真实的想法写下来。"
                className="w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-7 text-zinc-800 outline-none placeholder:text-zinc-300"
              />
              <button className="mt-2 text-xs text-zinc-400 hover:text-zinc-700">保存思路</button>
            </form>
          </section>

          <section className="mb-12">
            <h2 className="text-[15px] font-medium text-zinc-950">{primaryAnswer?.status === "draft" ? "参考答案 · 待确认" : "答案"}</h2>
            {primaryAnswer?.status === "draft" ? <p className="mt-2 text-xs leading-5 text-zinc-500">可直接阅读。请核对答案依据与适用条件；保存并确认后才会成为当前答案。</p> : null}
            <form action={createInterviewAnswerVersion} className="mt-3">
              <input type="hidden" name="preparation_id" value={prep.id} />
              <input type="hidden" name="answer_mode" value="spoken" />
              <input type="hidden" name="target_seconds" value={primaryAnswer?.target_seconds ?? ""} />
              <input type="hidden" name="language" value={primaryAnswer?.language ?? prep.target_language} />
              <input type="hidden" name="based_on_answer_id" value={primaryAnswer?.id ?? ""} />
              <input type="hidden" name="return_to_question" value="1" />
              <input type="hidden" name="change_note" value="" />
              <input type="hidden" name="make_current" value="1" />
              <textarea
                required
                name="body_markdown"
                defaultValue={primaryAnswer?.body_markdown ?? ""}
                rows={10}
                placeholder="写出你真正会在面试里说的答案。"
                className="w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-7 text-zinc-900 outline-none placeholder:text-zinc-300"
              />
              <div className="mt-2 flex items-center gap-4">
                <button className="text-xs text-zinc-400 hover:text-zinc-700">保存并确认为当前答案</button>
                <Link href={`/career/interview/practice/${prep.id}`} className="text-xs font-medium text-[#365F78]">练习这道题 →</Link>
              </div>
            </form>
          </section>

          <details id="answer-versions" className="mb-10 scroll-mt-6" open={primaryAnswer?.status === "draft"}>
            <summary className="cursor-pointer text-sm text-zinc-500">全部答案版本（{data.answers.length}）</summary>
            <div className="mt-4 space-y-4">
              {data.answers.map((answer: any) => (
                <details key={answer.id} open={answer.id === primaryAnswer?.id} className="rounded-lg border border-zinc-200 p-3">
                  <summary className="cursor-pointer text-xs leading-6 text-zinc-600">
                    V{answer.version_number} · {languageLabels[answer.language] ?? answer.language} · {answer.status === "current" ? "当前答案" : answer.status === "draft" ? "参考答案 · 待确认" : "历史答案"}
                    {answer.source === "ai_draft" || answer.source === "ai_edited" ? " · AI 起草" : ""}
                  </summary>
                  <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-800">{answer.body_markdown}</div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs">
                    {answer.status !== "current" ? <form action={promoteInterviewAnswerVersion}><input type="hidden" name="answer_id" value={answer.id}/><button className="min-h-11 text-[#365F78]">确认并设为当前答案</button></form> : null}
                    <form action={archiveInterviewAnswerVersion}><input type="hidden" name="answer_id" value={answer.id}/><input type="hidden" name="preparation_id" value={prep.id}/><button className="min-h-11 text-zinc-500">归档</button></form>
                  </div>
                </details>
              ))}
            </div>
          </details>

          <details className="mb-10">
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">更多</summary>
            <div className="mt-5 space-y-10">
              {data.attempts.length ? (
                <section>
                  <h3 className="text-sm font-medium text-zinc-800">最近练习</h3>
                  <div className="mt-3 space-y-3">
                    {data.attempts.slice(0, 4).map((attempt: any) => (
                      <div key={attempt.id}>
                        <p className="text-xs text-zinc-400">{formatDateTime(attempt.practiced_at)}</p>
                        {attempt.self_review_markdown ? <p className="mt-1 text-sm leading-6 text-zinc-600">{attempt.self_review_markdown}</p> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium text-zinc-800">可用故事</h3>
                  <Link href="/career/interview/stories" className="text-xs text-zinc-400 hover:text-zinc-700">故事库 →</Link>
                </div>
                <div className="mt-3 space-y-2">
                  {data.archetypeStories.map((item: any) => (
                    <div key={item.story_id} className="flex items-start justify-between gap-4 rounded-lg py-1 text-sm">
                      <Link href={`/career/interview/stories/${item.story.id}`} className="min-w-0">
                        <p className="truncate text-zinc-700">{item.story.title}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {storyEvidenceRoleLabels[item.evidence_role] ?? item.evidence_role}
                          {" · "}
                          {storyStatusLabels[item.story.status] ?? item.story.status}
                          {item.fit_note ? ` · ${item.fit_note}` : ""}
                        </p>
                      </Link>
                      <form action={unlinkStoryFromArchetype}>
                        <input type="hidden" name="archetype_id" value={data.archetype?.id ?? ""} />
                        <input type="hidden" name="story_id" value={item.story_id} />
                        <button className="text-xs text-zinc-400 hover:text-zinc-700">移除</button>
                      </form>
                    </div>
                  ))}
                  {!data.archetypeStories.length ? <p className="text-xs text-zinc-400">这个母题还没有可调用的故事。</p> : null}
                </div>
                {data.archetype ? (
                  <form action={linkStoryToArchetype} className="mt-4 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="archetype_id" value={data.archetype.id} />
                    <select name="story_id" className="min-w-64 px-3 py-2 text-sm">
                      {data.storyCatalog
                        .filter((story: any) => !data.archetypeStories.some((item: any) => item.story_id === story.id))
                        .map((story: any) => <option key={story.id} value={story.id}>{story.title}</option>)}
                    </select>
                    <select name="evidence_role" defaultValue="supporting" className="px-3 py-2 text-sm">
                      {Object.entries(storyEvidenceRoleLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input type="hidden" name="fit_note" value="" />
                    <button className="text-xs text-[#365F78]">关联故事</button>
                  </form>
                ) : null}
              </section>

              <section>
                <h3 className="text-sm font-medium text-zinc-800">同一母题的其他问法</h3>
                <div className="mt-3 space-y-2">
                  {data.variants.map((variant: any) => (
                    <Link
                      key={variant.id}
                      href={prep.context_id ? `/career/interview/questions/${variant.id}?context=${prep.context_id}` : `/career/interview/questions/${variant.id}`}
                      className="block rounded-lg py-1 text-sm leading-6 text-zinc-700 hover:text-zinc-950"
                    >
                      <span>{variant.canonical_prompt}</span>
                      <span className="ml-2 text-xs text-zinc-400">{variantKindLabels[variant.variant_kind] ?? variant.variant_kind}</span>
                    </Link>
                  ))}
                  {!data.variants.length ? <p className="text-xs text-zinc-400">目前只有这一种问法。</p> : null}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-zinc-800">经历</h3>
                <div className="mt-3 space-y-2">
                  {data.evidenceLinks.map((link: any) => (
                    <div key={link.id} className="flex items-start justify-between gap-4 text-sm">
                      <div>
                        <p className="text-zinc-700">{link.evidence.label}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">{evidenceRelationshipLabels[link.relationship_type] ?? link.relationship_type}</p>
                      </div>
                      <form action={unlinkInterviewEvidence}>
                        <input type="hidden" name="link_id" value={link.id}/>
                        <input type="hidden" name="preparation_id" value={prep.id}/>
                        <button className="text-xs text-zinc-400">移除</button>
                      </form>
                    </div>
                  ))}
                </div>
                <form action={linkInterviewEvidence} className="mt-4 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="preparation_id" value={prep.id} />
                  <select name="target_ref" className="min-w-64 px-3 py-2 text-sm">
                    {Object.entries(evidenceTypeLabels).map(([type,label]) => {
                      const items = data.evidenceCatalog.filter((item: any) => item.type === type);
                      return items.length ? <optgroup key={type} label={label}>{items.map((item: any) => <option key={`${type}:${item.id}`} value={`${type}:${item.id}`}>{item.label}</option>)}</optgroup> : null;
                    })}
                  </select>
                  <select name="relationship_type" defaultValue="supporting_evidence" className="px-3 py-2 text-sm">
                    {evidenceRelationships.map((value) => <option key={value} value={value}>{evidenceRelationshipLabels[value]}</option>)}
                  </select>
                  <button className="text-xs text-[#365F78]">关联</button>
                </form>
              </section>

              <section>
                <h3 className="text-sm font-medium text-zinc-800">追问</h3>
                <div className="mt-3 space-y-2">
                  {data.childQuestions.map((child: any) => (
                    <Link key={child.id} href={prep.context_id ? `/career/interview/questions/${child.id}?context=${prep.context_id}` : `/career/interview/questions/${child.id}`} className="block text-sm leading-6 text-zinc-700 hover:text-zinc-950">
                      {child.canonical_prompt}
                    </Link>
                  ))}
                </div>
                <form action={createInterviewQuestion} className="mt-4">
                  <textarea required name="canonical_prompt" rows={2} placeholder="新增追问" className="w-full max-w-xl px-3 py-2 text-sm" />
                  <input type="hidden" name="context_id" value={prep.context_id ?? ""} />
                  <input type="hidden" name="short_title" value="" />
                  <input type="hidden" name="category" value={question.category} />
                  <input type="hidden" name="question_type_key" value={questionTypeRelation?.key ?? "behavioral"} />
                  <input type="hidden" name="question_style" value={question.question_style ?? "standard"} />
                  <input type="hidden" name="subcategory" value="" />
                  <input type="hidden" name="competency_tags" value={joinTagInput(question.competency_tags)} />
                  <input type="hidden" name="prompt_variants" value="" />
                  <input type="hidden" name="source_type" value="preparation" />
                  <input type="hidden" name="source_name" value="Personal OS" />
                  <input type="hidden" name="source_url" value="" />
                  <input type="hidden" name="source_observed_at" value="" />
                  <input type="hidden" name="source_detail" value="" />
                  <input type="hidden" name="parent_question_id" value={question.id} />
                  <input type="hidden" name="follow_up_kind" value="deep_dive" />
                  <input type="hidden" name="difficulty" value={Math.min(5, Number(question.difficulty) + 1)} />
                  <button className="mt-2 text-xs text-[#365F78]">添加</button>
                </form>
              </section>


              <details>
                <summary className="cursor-pointer text-xs text-zinc-400">题目设置</summary>
                <form action={updateInterviewQuestion} className="mt-4 grid gap-3">
                  <input type="hidden" name="question_id" value={question.id}/>
                  <textarea name="canonical_prompt" defaultValue={question.canonical_prompt} rows={3} required className="w-full px-3 py-2 text-sm" />
                  <input type="hidden" name="short_title" value={question.short_title ?? ""}/>
                  <input type="hidden" name="category" value={question.category}/>
                  <input type="hidden" name="question_type_key" value={questionTypeRelation?.key ?? "behavioral"}/>
                  <input type="hidden" name="question_style" value={question.question_style ?? "standard"}/>
                  <input type="hidden" name="subcategory" value={question.subcategory ?? ""}/>
                  <input type="hidden" name="competency_tags" value={joinTagInput(question.competency_tags)}/>
                  <input type="hidden" name="prompt_variants" value={joinTagInput(question.prompt_variants)}/>
                  <input type="hidden" name="source_type" value={question.source_type}/>
                  <input type="hidden" name="source_name" value={question.source_name ?? ""}/>
                  <input type="hidden" name="source_url" value={question.source_url ?? ""}/>
                  <input type="hidden" name="source_observed_at" value={question.source_observed_at ?? ""}/>
                  <input type="hidden" name="source_detail" value={question.source_detail ?? ""}/>
                  <input type="hidden" name="difficulty" value={question.difficulty}/>
                  <input type="hidden" name="parent_question_id" value={question.parent_question_id ?? ""}/>
                  <input type="hidden" name="follow_up_kind" value={question.follow_up_kind ?? ""}/>
                  <button className="w-fit text-xs text-[#365F78]">保存题目</button>
                </form>
                <form action={archiveInterviewQuestion} className="mt-3"><input type="hidden" name="question_id" value={question.id}/><button className="text-xs text-red-600">归档题目</button></form>
              </details>
            </div>
          </details>
        </>
      )}
    </>
  );
}

function PreparationStateFields({ prep, questionId }: { prep: any; questionId: string }) {
  return (
    <>
      <input type="hidden" name="preparation_id" value={prep.id}/>
      <input type="hidden" name="question_id" value={questionId}/>
      <input type="hidden" name="prompt_override" value={prep.prompt_override ?? ""}/>
      <input type="hidden" name="status" value={prep.status}/>
      <input type="hidden" name="importance" value={prep.importance}/>
      <input type="hidden" name="target_language" value={prep.target_language}/>
      <input type="hidden" name="interviewer_intent_markdown" value={prep.interviewer_intent_markdown ?? ""}/>
      <input type="hidden" name="risk_markdown" value={prep.risk_markdown ?? ""}/>
      <input type="hidden" name="answer_logic_markdown" value={prep.answer_logic_markdown ?? ""}/>
      <input type="hidden" name="key_message" value={prep.key_message ?? ""}/>
      <input type="hidden" name="next_focus" value={prep.next_focus ?? ""}/>
      <input type="hidden" name="confidence" value={prep.confidence ?? ""}/>
      <input type="hidden" name="next_practice_at" value={prep.next_practice_at ?? ""}/>
    </>
  );
}
