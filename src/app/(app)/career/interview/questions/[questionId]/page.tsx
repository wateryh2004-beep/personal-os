import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import {
  addInterviewNote,
  archiveInterviewAnswerVersion,
  archiveInterviewNote,
  archiveInterviewQuestion,
  createInterviewAnswerVersion,
  createInterviewQuestion,
  ensureInterviewPreparation,
  linkInterviewEvidence,
  promoteInterviewAnswerVersion,
  unlinkInterviewEvidence,
  updateInterviewPreparation,
  updateInterviewQuestion,
} from "@/features/interview/actions";
import { getInterviewQuestionDetail } from "@/features/interview/queries";
import {
  answerModeLabels,
  categoryLabels,
  competencyLabels,
  evidenceRelationshipLabels,
  evidenceRelationships,
  evidenceTypeLabels,
  followUpKindLabels,
  importanceLabels,
  interviewAnswerModes,
  interviewCategories,
  interviewFollowUpKinds,
  interviewImportance,
  interviewLanguages,
  interviewNoteTypes,
  interviewSourceTypes,
  interviewStatuses,
  issueLabels,
  joinTagInput,
  languageLabels,
  noteTypeLabels,
  sourceTypeLabels,
  statusLabels,
} from "@/features/interview/constants";
import { formatDateTime } from "@/features/interview/utils";

export default async function InterviewQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ questionId: string }>;
  searchParams: Promise<{ context?: string }>;
}) {
  const { questionId } = await params;
  const { context } = await searchParams;
  const data = await getInterviewQuestionDetail(questionId, context ?? null);
  if (!data) notFound();

  const { question, selectedPreparation: prep } = data;
  const selectedContext = prep?.context_id ? data.contexts.find((item: any) => item.id === prep.context_id) : null;

  return (
    <>
      <PageHeader
        title={question.short_title || "面试题"}
        description={question.canonical_prompt}
        eyebrow={<Link href="/career/interview/questions" className="hover:text-zinc-700">面试准备 / 题库</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current={`/career/interview/questions/${questionId}`} />

      <div className="mb-7 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-[#365F78]/10 px-2.5 py-1 font-medium text-[#365F78]">{categoryLabels[question.category] ?? question.category}</span>
        <span className="text-zinc-500">难度 {question.difficulty}</span>
        {(question.competency_tags ?? []).map((tag: string) => (
          <span key={tag} className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600">{competencyLabels[tag] ?? tag}</span>
        ))}
        {question.source_name ? <span className="text-zinc-400">来源：{question.source_name}</span> : null}
      </div>

      <section className="mb-8 rounded-2xl bg-zinc-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/career/interview/questions/${questionId}`} className={`rounded-lg px-3 py-1.5 text-sm ${!prep?.context_id ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:bg-white"}`}>通用</Link>
          {data.contexts.map((item: any) => {
            const active = prep?.context_id === item.id;
            return (
              <Link
                key={item.id}
                href={`/career/interview/questions/${questionId}?context=${item.id}`}
                className={`rounded-lg px-3 py-1.5 text-sm ${active ? "bg-white font-medium text-zinc-900 shadow-sm" : "text-zinc-500 hover:bg-white"}`}
              >
                {item.title}
              </Link>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-xs text-zinc-400">同一道题在不同目标岗位下保留独立的回答和练习记录。</p>
      </section>

      {!prep ? (
        <section className="rounded-2xl bg-amber-50 p-6">
          <h2 className="font-medium">这个目标下还没有准备内容</h2>
          <p className="mt-2 text-sm leading-6 text-amber-800">加入后会创建这个岗位独立的回答逻辑、答案、经历关联和练习记录。</p>
          <form action={ensureInterviewPreparation} className="mt-4">
            <input type="hidden" name="question_id" value={questionId} />
            <input type="hidden" name="context_id" value={context ?? ""} />
            <button className="rounded-lg bg-[#365F78] px-4 py-2 text-sm font-medium text-white">开始准备这道题</button>
          </form>
        </section>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <main className="space-y-12">
            <section>
              <SectionTitle title="理解问题" description="面试官为什么问，以及这道题最容易掉进什么坑。" />
              <div className="mt-4 space-y-4 text-sm leading-6">
                {prep.prompt_override ? <ReadBlock label="这个岗位下的真实问法" value={prep.prompt_override} /> : null}
                <ReadBlock label="面试官在看什么" value={prep.interviewer_intent_markdown} empty="还没有记录面试官意图。" />
                <ReadBlock label="容易掉的坑" value={prep.risk_markdown} empty="还没有记录风险点。" />
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[#365F78]">编辑问题理解</summary>
                <form action={updateInterviewPreparation} className="mt-4 grid gap-4 rounded-2xl bg-zinc-50 p-5">
                  <PreparationStateFields prep={prep} questionId={questionId} />
                  <TextArea name="prompt_override" label="这个岗位下的真实问法" defaultValue={prep.prompt_override} />
                  <TextArea name="interviewer_intent_markdown" label="面试官意图" defaultValue={prep.interviewer_intent_markdown} />
                  <TextArea name="risk_markdown" label="容易掉的坑" defaultValue={prep.risk_markdown} />
                  <PrimaryButton>保存</PrimaryButton>
                </form>
              </details>
            </section>

            <section>
              <SectionTitle title="我的思考" description="保留当前判断，也保留思考如何演化。" />
              <div className="mt-4">
                <ReadBlock value={prep.working_thoughts_markdown} empty="还没有形成当前思考。" />
              </div>
              <div className="mt-5 space-y-4">
                {data.notes.map((note: any) => (
                  <article key={note.id} className="rounded-xl bg-zinc-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-zinc-500">{noteTypeLabels[note.note_type] ?? note.note_type} · {formatDateTime(note.occurred_at)}</p>
                      <form action={archiveInterviewNote}>
                        <input type="hidden" name="note_id" value={note.id}/>
                        <input type="hidden" name="preparation_id" value={prep.id}/>
                        <button className="text-xs text-zinc-400 hover:text-zinc-700">归档</button>
                      </form>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{note.body_markdown}</p>
                  </article>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-4">
                <details>
                  <summary className="cursor-pointer text-sm text-[#365F78]">编辑当前思考</summary>
                  <form action={updateInterviewPreparation} className="mt-4 grid gap-4 rounded-2xl bg-zinc-50 p-5">
                    <PreparationStateFields prep={prep} questionId={questionId} />
                    <TextArea name="working_thoughts_markdown" label="当前思考" defaultValue={prep.working_thoughts_markdown} rows={7} />
                    <PrimaryButton>保存</PrimaryButton>
                  </form>
                </details>
                <details>
                  <summary className="cursor-pointer text-sm text-[#365F78]">+ 新增思考记录</summary>
                  <form action={addInterviewNote} className="mt-4 grid gap-4 rounded-2xl bg-zinc-50 p-5">
                    <input type="hidden" name="preparation_id" value={prep.id} />
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-zinc-600">记录类型</span>
                      <select name="note_type" defaultValue="thinking" className={controlClass}>
                        {interviewNoteTypes.map((type) => <option key={type} value={type}>{noteTypeLabels[type]}</option>)}
                      </select>
                    </label>
                    <TextArea name="body_markdown" label="内容" required rows={4} />
                    <PrimaryButton>加入记录</PrimaryButton>
                  </form>
                </details>
              </div>
            </section>

            <section>
              <SectionTitle title="回答逻辑" description="真正可迁移的是逻辑，而不是背某一段话。" />
              <div className="mt-4 rounded-2xl bg-zinc-50 p-5">
                <p className="text-xs font-medium text-zinc-400">核心信息</p>
                <p className="mt-2 text-base font-medium leading-7">{prep.key_message || "还没有提炼一句话结论。"}</p>
                <p className="mt-5 text-xs font-medium text-zinc-400">回答结构</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{prep.answer_logic_markdown || "还没有整理回答结构。"}</p>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[#365F78]">编辑回答逻辑</summary>
                <form action={updateInterviewPreparation} className="mt-4 grid gap-4 rounded-2xl bg-zinc-50 p-5">
                  <PreparationStateFields prep={prep} questionId={questionId} />
                  <TextArea name="key_message" label="核心信息（一句话结论）" defaultValue={prep.key_message} rows={2} />
                  <TextArea name="answer_logic_markdown" label="回答结构" defaultValue={prep.answer_logic_markdown} rows={6} />
                  <PrimaryButton>保存</PrimaryButton>
                </form>
              </details>
            </section>

            <section>
              <SectionTitle title="可用经历" description="只关联职业档案中的真实经历和证据，不在这里重复维护。" />
              <div className="mt-4 space-y-2">
                {data.evidenceLinks.map((link: any) => (
                  <div key={link.id} className="flex items-start justify-between gap-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{link.evidence.label}</p>
                      <p className="mt-1 text-xs text-zinc-500">{evidenceTypeLabels[link.target_type as keyof typeof evidenceTypeLabels] ?? link.target_type} · {evidenceRelationshipLabels[link.relationship_type] ?? link.relationship_type}</p>
                    </div>
                    <form action={unlinkInterviewEvidence}>
                      <input type="hidden" name="link_id" value={link.id}/>
                      <input type="hidden" name="preparation_id" value={prep.id}/>
                      <button className="text-xs text-zinc-400 hover:text-zinc-800">移除</button>
                    </form>
                  </div>
                ))}
                {!data.evidenceLinks.length ? <p className="text-sm text-zinc-500">尚未关联经历素材。行为面、简历面和压力面建议至少关联一项真实证据。</p> : null}
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[#365F78]">+ 关联经历素材</summary>
                <form action={linkInterviewEvidence} className="mt-4 grid gap-3 rounded-2xl bg-zinc-50 p-5 sm:grid-cols-[1fr_180px_auto]">
                  <input type="hidden" name="preparation_id" value={prep.id} />
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-zinc-600">经历素材</span>
                    <select name="target_ref" className={controlClass}>
                      {Object.entries(evidenceTypeLabels).map(([type,label]) => {
                        const items = data.evidenceCatalog.filter((item: any) => item.type === type);
                        return items.length ? <optgroup key={type} label={label}>{items.map((item: any) => <option key={`${type}:${item.id}`} value={`${type}:${item.id}`}>{item.label}</option>)}</optgroup> : null;
                      })}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-zinc-600">作用</span>
                    <select name="relationship_type" defaultValue="supporting_evidence" className={controlClass}>
                      {evidenceRelationships.map((value) => <option key={value} value={value}>{evidenceRelationshipLabels[value]}</option>)}
                    </select>
                  </label>
                  <button disabled={!data.evidenceCatalog.length} className="self-end rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-inset ring-zinc-200 disabled:opacity-40">关联</button>
                </form>
              </details>
            </section>

            <section>
              <SectionTitle title="我的回答" description="保留不同模式、时长和语言版本；只把一个版本作为当前主答案。" />
              <div className="mt-4 space-y-3">
                {data.answers.map((answer: any) => (
                  <article key={answer.id} className={`rounded-2xl p-5 ${answer.status === "current" ? "bg-[#365F78]/8" : "bg-zinc-50"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-medium">{answerModeLabels[answer.answer_mode] ?? answer.answer_mode}{answer.target_seconds ? ` · ${answer.target_seconds}s` : ""} · {languageLabels[answer.language] ?? answer.language}</span>
                        <span className="ml-2 text-xs text-zinc-400">V{answer.version_number} · {answerStatusLabel(answer.status)}</span>
                      </div>
                      <div className="flex gap-3">
                        {answer.status !== "current" ? (
                          <form action={promoteInterviewAnswerVersion}>
                            <input type="hidden" name="answer_id" value={answer.id}/>
                            <button className="text-xs text-[#365F78]">设为当前</button>
                          </form>
                        ) : null}
                        <form action={archiveInterviewAnswerVersion}>
                          <input type="hidden" name="answer_id" value={answer.id}/>
                          <input type="hidden" name="preparation_id" value={prep.id}/>
                          <button className="text-xs text-zinc-400">归档</button>
                        </form>
                      </div>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{answer.body_markdown}</p>
                    {answer.change_note ? <p className="mt-3 text-xs text-zinc-400">{answer.change_note}</p> : null}
                  </article>
                ))}
                {!data.answers.length ? <p className="text-sm text-zinc-500">还没有答案版本。可以先写一个提纲或第一版口语答案。</p> : null}
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[#365F78]">+ 新建答案版本</summary>
                <form action={createInterviewAnswerVersion} className="mt-4 grid gap-4 rounded-2xl bg-zinc-50 p-5 sm:grid-cols-4">
                  <input type="hidden" name="preparation_id" value={prep.id} />
                  <SelectField name="answer_mode" label="模式" defaultValue="spoken" options={interviewAnswerModes.map((mode) => [mode, answerModeLabels[mode]] as [string,string])} />
                  <Field name="target_seconds" label="目标秒数" type="number" defaultValue={60} />
                  <SelectField name="language" label="语言" defaultValue={prep.target_language} options={interviewLanguages.map((lang) => [lang, languageLabels[lang]] as [string,string])} />
                  <Field name="change_note" label="版本说明" />
                  <label className="grid gap-1.5 text-sm sm:col-span-4">
                    <span className="text-zinc-600">答案内容</span>
                    <textarea required name="body_markdown" className={`min-h-40 ${controlClass}`} />
                  </label>
                  <PrimaryButton>保存新版本</PrimaryButton>
                </form>
              </details>
            </section>

            <section>
              <SectionTitle title="压力追问" description="把真实追问保留为结构关系，而不是散落成重复题。" />
              <div className="mt-4 space-y-2">
                {data.childQuestions.map((child: any) => (
                  <Link key={child.id} href={`/career/interview/questions/${child.id}`} className="block rounded-xl px-3 py-3 hover:bg-zinc-50">
                    <span className="text-xs text-zinc-400">{followUpKindLabels[child.follow_up_kind] ?? child.follow_up_kind} · 难度 {child.difficulty}</span>
                    <p className="mt-1 text-sm font-medium">{child.short_title || child.canonical_prompt}</p>
                  </Link>
                ))}
                {!data.childQuestions.length ? <p className="text-sm text-zinc-500">暂无结构化追问。</p> : null}
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[#365F78]">+ 新建追问</summary>
                <form action={createInterviewQuestion} className="mt-4 grid gap-4 rounded-2xl bg-zinc-50 p-5 sm:grid-cols-2">
                  <input type="hidden" name="parent_question_id" value={question.id}/>
                  <input type="hidden" name="source_type" value="preparation"/>
                  <input type="hidden" name="source_name" value="Personal OS"/>
                  <input type="hidden" name="source_url" value=""/>
                  <input type="hidden" name="source_observed_at" value=""/>
                  <input type="hidden" name="source_detail" value="面试准备追问"/>
                  <input type="hidden" name="competency_tags" value={joinTagInput(question.competency_tags)}/>
                  <input type="hidden" name="prompt_variants" value=""/>
                  <input type="hidden" name="subcategory" value={question.subcategory ?? ""}/>
                  <label className="grid gap-1.5 text-sm sm:col-span-2">
                    <span className="text-zinc-600">追问</span>
                    <textarea required name="canonical_prompt" className={`min-h-20 ${controlClass}`} />
                  </label>
                  <Field name="short_title" label="短标题"/>
                  <SelectField name="follow_up_kind" label="追问类型" defaultValue="deep_dive" options={interviewFollowUpKinds.map((value) => [value, followUpKindLabels[value] ?? value] as [string,string])} />
                  <SelectField name="category" label="题型" defaultValue={question.category} options={interviewCategories.map((value) => [value, categoryLabels[value]] as [string,string])} />
                  <SelectField name="difficulty" label="难度" defaultValue={String(Math.min(5, Number(question.difficulty) + 1))} options={[1,2,3,4,5].map((value) => [String(value), String(value)] as [string,string])} />
                  <PrimaryButton>创建追问</PrimaryButton>
                </form>
              </details>
            </section>

            <section>
              <SectionTitle title="练习记录" description="每次真实回答都保留，不覆盖历史。" />
              <div className="mt-4 space-y-3">
                {data.attempts.map((attempt: any, index: number) => (
                  <article key={attempt.id} className="rounded-xl bg-zinc-50 px-4 py-3">
                    <div className="flex justify-between gap-3">
                      <p className="text-sm font-medium">练习 #{data.attempts.length - index}</p>
                      <time className="text-xs text-zinc-400">{formatDateTime(attempt.practiced_at)}{attempt.duration_seconds ? ` · ${attempt.duration_seconds}s` : ""}</time>
                    </div>
                    {attempt.response_transcript_markdown ? <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{attempt.response_transcript_markdown}</p> : null}
                    {attempt.self_review_markdown ? <p className="mt-2 text-xs text-zinc-500">自评：{attempt.self_review_markdown}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(attempt.issue_tags ?? []).map((tag: string) => <span key={tag} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{issueLabels[tag] ?? tag}</span>)}
                    </div>
                  </article>
                ))}
                {!data.attempts.length ? <p className="text-sm text-zinc-500">还没练过。可以从右侧直接开始练习。</p> : null}
              </div>
            </section>

            <details className="pt-2">
              <summary className="cursor-pointer text-sm text-zinc-400">高级设置与归档</summary>
              <div className="mt-4 rounded-2xl bg-zinc-50 p-5">
                <form action={updateInterviewQuestion} className="grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="question_id" value={question.id}/>
                  <TextArea name="canonical_prompt" label="标准问法" defaultValue={question.canonical_prompt} required rows={4}/>
                  <Field name="short_title" label="短标题" defaultValue={question.short_title}/>
                  <SelectField name="category" label="题型" defaultValue={question.category} options={interviewCategories.map((value) => [value, categoryLabels[value]] as [string,string])} />
                  <Field name="subcategory" label="二级分类" defaultValue={question.subcategory}/>
                  <Field name="competency_tags" label="能力标签" defaultValue={joinTagInput(question.competency_tags)}/>
                  <Field name="prompt_variants" label="变体问法" defaultValue={joinTagInput(question.prompt_variants)}/>
                  <SelectField name="source_type" label="来源" defaultValue={question.source_type} options={interviewSourceTypes.map((value) => [value, sourceTypeLabels[value] ?? value] as [string,string])} />
                  <Field name="source_name" label="来源名称" defaultValue={question.source_name}/>
                  <Field name="source_url" label="来源链接" defaultValue={question.source_url}/>
                  <Field name="source_observed_at" label="来源日期" type="date" defaultValue={question.source_observed_at}/>
                  <Field name="source_detail" label="来源说明" defaultValue={question.source_detail}/>
                  <SelectField name="difficulty" label="难度" defaultValue={String(question.difficulty)} options={[1,2,3,4,5].map((value) => [String(value), String(value)] as [string,string])} />
                  <input type="hidden" name="parent_question_id" value={question.parent_question_id ?? ""}/>
                  <input type="hidden" name="follow_up_kind" value={question.follow_up_kind ?? ""}/>
                  <PrimaryButton>保存题目信息</PrimaryButton>
                </form>
                <form action={archiveInterviewQuestion} className="mt-5">
                  <input type="hidden" name="question_id" value={question.id}/>
                  <button className="text-sm text-red-600">归档此问题</button>
                </form>
              </div>
            </details>
          </main>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-2xl bg-zinc-50 p-5">
              <p className="text-xs font-medium text-zinc-400">当前准备</p>
              <h2 className="mt-2 font-medium">{selectedContext?.title || "通用"}</h2>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-zinc-500">状态</span>
                <span className="font-medium">{statusLabels[prep.status] ?? prep.status}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-500">重要性</span>
                <span>{importanceLabels[prep.importance] ?? prep.importance}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-500">目标语言</span>
                <span>{languageLabels[prep.target_language] ?? prep.target_language}</span>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[#365F78]">调整准备设置</summary>
                <form action={updateInterviewPreparation} className="mt-4 grid gap-3">
                  <PreparationStateFields prep={prep} questionId={questionId} />
                  <SelectField name="status" label="状态" defaultValue={prep.status} options={interviewStatuses.map((value) => [value, statusLabels[value]] as [string,string])} disabledValues={!data.readiness.readyEligible ? ["ready"] : []} />
                  <SelectField name="importance" label="重要性" defaultValue={prep.importance} options={interviewImportance.map((value) => [value, importanceLabels[value] ?? value] as [string,string])} />
                  <SelectField name="target_language" label="目标语言" defaultValue={prep.target_language} options={interviewLanguages.map((value) => [value, languageLabels[value]] as [string,string])} />
                  <SelectField name="confidence" label="信心" defaultValue={prep.confidence ? String(prep.confidence) : ""} options={[["","—"],...[1,2,3,4,5].map((value) => [String(value), String(value)] as [string,string])]} />
                  <Field name="next_practice_at" label="下次练习" type="datetime-local" defaultValue={toDatetimeLocal(prep.next_practice_at)}/>
                  <Field name="next_focus" label="下次重点" defaultValue={prep.next_focus}/>
                  <button className="rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-inset ring-zinc-200">保存设置</button>
                </form>
              </details>
            </section>

            <section className="rounded-2xl bg-zinc-50 p-5">
              <p className="text-sm font-medium">准备完成条件</p>
              <Checklist ok={data.readiness.required.keyMessage} label="核心信息"/>
              <Checklist ok={data.readiness.required.answerLogic} label="回答结构"/>
              <Checklist ok={data.readiness.required.currentAnswer} label="当前回答"/>
              <Checklist ok={data.readiness.required.practiced} label="至少练习 1 次"/>
              <Checklist ok={data.readiness.evidence} label="关联真实经历" optional/>
            </section>

            <section className="rounded-2xl bg-zinc-50 p-5 text-sm">
              <p className="font-medium">下次重点</p>
              <p className="mt-2 whitespace-pre-wrap leading-6 text-zinc-600">{prep.next_focus || "尚未设置。每次练习最好只指定一个改进目标。"}</p>
              <dl className="mt-4 space-y-2 text-xs text-zinc-500">
                <div className="flex justify-between"><dt>上次练习</dt><dd>{formatDateTime(prep.last_practiced_at)}</dd></div>
                <div className="flex justify-between"><dt>下次练习</dt><dd>{formatDateTime(prep.next_practice_at)}</dd></div>
                <div className="flex justify-between"><dt>当前答案</dt><dd>{data.currentAnswers?.length ?? 0}</dd></div>
                <div className="flex justify-between"><dt>练习次数</dt><dd>{data.attempts.length}</dd></div>
              </dl>
            </section>

            {selectedContext ? (
              <Link href={`/career/interview/targets/${selectedContext.id}`} className="block text-center text-sm text-[#365F78]">返回目标岗位 →</Link>
            ) : null}
            <Link href={`/career/interview/practice/${prep.id}`} className="block rounded-xl bg-[#365F78] px-4 py-3 text-center text-sm font-medium text-white">开始练习 →</Link>
          </aside>
        </div>
      )}
    </>
  );
}

const controlClass = "rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200 outline-none focus:ring-[#365F78]";

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-lg font-medium">{title}</h2><p className="mt-1 text-sm leading-6 text-zinc-500">{description}</p></div>;
}

function ReadBlock({ label, value, empty }: { label?: string; value?: string | null; empty?: string }) {
  return (
    <div>
      {label ? <p className="text-xs font-medium text-zinc-400">{label}</p> : null}
      <p className={`${label ? "mt-1" : ""} whitespace-pre-wrap text-sm leading-6 ${value ? "text-zinc-700" : "text-zinc-400"}`}>{value || empty || "—"}</p>
    </div>
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
      <input type="hidden" name="working_thoughts_markdown" value={prep.working_thoughts_markdown ?? ""}/>
      <input type="hidden" name="answer_logic_markdown" value={prep.answer_logic_markdown ?? ""}/>
      <input type="hidden" name="key_message" value={prep.key_message ?? ""}/>
      <input type="hidden" name="next_focus" value={prep.next_focus ?? ""}/>
      <input type="hidden" name="confidence" value={prep.confidence ?? ""}/>
      <input type="hidden" name="next_practice_at" value={prep.next_practice_at ?? ""}/>
    </>
  );
}

function TextArea({ name, label, defaultValue, rows = 4, required = false }: { name: string; label: string; defaultValue?: string | null; rows?: number; required?: boolean }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-zinc-600">{label}</span>
      <textarea name={name} defaultValue={defaultValue ?? ""} rows={rows} required={required} className={controlClass}/>
    </label>
  );
}

function Field({ name, label, type = "text", defaultValue, required = false }: { name: string; label: string; type?: string; defaultValue?: string | number | null; required?: boolean }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-zinc-600">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} className={controlClass}/>
    </label>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
  disabledValues = [],
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: [string, string][];
  disabledValues?: string[];
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-zinc-600">{label}</span>
      <select name={name} defaultValue={defaultValue} className={controlClass}>
        {options.map(([value, text]) => <option key={value || "none"} value={value} disabled={disabledValues.includes(value)}>{text}</option>)}
      </select>
    </label>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return <button className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">{children}</button>;
}

function Checklist({ ok, label, optional = false }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <div className="mt-2 flex items-center justify-between text-sm">
      <span className={ok ? "text-zinc-900" : "text-zinc-500"}>{label}{optional ? " · 可选" : ""}</span>
      <span className={ok ? "text-[#365F78]" : "text-zinc-300"}>{ok ? "✓" : "—"}</span>
    </div>
  );
}

function answerStatusLabel(status: string) {
  if (status === "current") return "当前";
  if (status === "draft") return "草稿";
  if (status === "superseded") return "历史";
  return status;
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0,16);
}
