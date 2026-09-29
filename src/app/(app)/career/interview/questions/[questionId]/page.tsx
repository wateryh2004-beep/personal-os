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
  const currentAnswers = data.currentAnswers ?? [];
  const recentAttempts = data.attempts.slice(0, 3);

  return (
    <>
      <PageHeader
        title={question.short_title || "面试题"}
        description={question.canonical_prompt}
        eyebrow={<Link href="/career/interview/questions" className="hover:text-zinc-700">面试 / 题库</Link>}
        action={prep ? <Link href={`/career/interview/practice/${prep.id}`} className="text-sm font-medium text-[#365F78]">开始练习 →</Link> : null}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current={`/career/interview/questions/${questionId}`} />

      <div className="mb-8 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span>{categoryLabels[question.category] ?? question.category}</span>
        <span>·</span>
        <span>难度 {question.difficulty}</span>
        {(question.competency_tags ?? []).slice(0, 3).map((tag: string) => <span key={tag}>· {competencyLabels[tag] ?? tag}</span>)}
      </div>

      <form className="mb-12 flex items-center gap-2">
        <select name="context" defaultValue={context ?? ""} className="max-w-sm rounded-lg bg-white px-3 py-2 text-sm text-zinc-600 ring-1 ring-inset ring-zinc-200">
          <option value="">通用准备</option>
          {data.contexts.map((item: any) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button className="text-xs text-zinc-400 hover:text-zinc-700">切换</button>
      </form>

      {!prep ? (
        <section className="py-8">
          <p className="text-sm text-zinc-500">这个目标下还没有准备这道题。</p>
          <form action={ensureInterviewPreparation} className="mt-4">
            <input type="hidden" name="question_id" value={questionId} />
            <input type="hidden" name="context_id" value={context ?? ""} />
            <button className="text-sm font-medium text-[#365F78]">开始准备 →</button>
          </form>
        </section>
      ) : (
        <>
          <section className="mb-14">
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <span>{statusLabels[prep.status] ?? prep.status}</span>
              <span>{importanceLabels[prep.importance] ?? prep.importance}</span>
              <span>{languageLabels[prep.target_language] ?? prep.target_language}</span>
              {selectedContext ? <span>{selectedContext.title}</span> : null}
            </div>

            <p className="mt-5 text-xs font-medium text-zinc-400">核心信息</p>
            <p className="mt-2 text-lg font-medium leading-8 text-zinc-950">{prep.key_message || "还没有提炼一句话结论。"}</p>

            <p className="mt-6 text-xs font-medium text-zinc-400">回答结构</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-600">{prep.answer_logic_markdown || "还没有整理回答结构。"}</p>

            <div className="mt-7 space-y-5">
              {currentAnswers.map((answer: any) => (
                <article key={answer.id}>
                  <p className="text-xs text-zinc-400">
                    当前回答 · {answerModeLabels[answer.answer_mode] ?? answer.answer_mode}{answer.target_seconds ? ` · ${answer.target_seconds}s` : ""} · {languageLabels[answer.language] ?? answer.language}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-800">{answer.body_markdown}</p>
                </article>
              ))}
              {!currentAnswers.length ? <p className="text-sm text-zinc-400">还没有当前回答。</p> : null}
            </div>
          </section>

          <section className="mb-14">
            <h2 className="text-[15px] font-medium text-zinc-950">理解</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <ReadBlock label="面试官在看什么" value={prep.interviewer_intent_markdown} />
              <ReadBlock label="容易掉的坑" value={prep.risk_markdown} />
            </div>
          </section>

          <section className="mb-14">
            <h2 className="text-[15px] font-medium text-zinc-950">可用经历</h2>
            <div className="mt-4 space-y-2">
              {data.evidenceLinks.map((link: any) => (
                <div key={link.id} className="text-sm">
                  <p className="text-zinc-800">{link.evidence.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{evidenceRelationshipLabels[link.relationship_type] ?? link.relationship_type}</p>
                </div>
              ))}
              {!data.evidenceLinks.length ? <p className="text-sm text-zinc-400">还没有关联经历。</p> : null}
            </div>
          </section>

          {data.childQuestions.length ? (
            <section className="mb-14">
              <h2 className="text-[15px] font-medium text-zinc-950">追问</h2>
              <div className="mt-3 space-y-1">
                {data.childQuestions.slice(0, 6).map((child: any) => (
                  <Link key={child.id} href={`/career/interview/questions/${child.id}`} className="block rounded-lg px-2 py-3 hover:bg-white/70">
                    <p className="text-sm text-zinc-800">{child.short_title || child.canonical_prompt}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">{followUpKindLabels[child.follow_up_kind] ?? child.follow_up_kind}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mb-14">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-medium text-zinc-950">最近练习</h2>
              <span className="text-xs text-zinc-400">{data.attempts.length} 次</span>
            </div>
            <div className="mt-3 space-y-4">
              {recentAttempts.map((attempt: any) => (
                <article key={attempt.id}>
                  <div className="flex justify-between gap-3 text-xs text-zinc-400">
                    <span>{formatDateTime(attempt.practiced_at)}</span>
                    {attempt.duration_seconds ? <span>{attempt.duration_seconds}s</span> : null}
                  </div>
                  {attempt.self_review_markdown ? <p className="mt-1 text-sm leading-6 text-zinc-600">{attempt.self_review_markdown}</p> : null}
                  {(attempt.issue_tags ?? []).length ? <p className="mt-1 text-xs text-amber-700">{(attempt.issue_tags ?? []).map((tag: string) => issueLabels[tag] ?? tag).join(" · ")}</p> : null}
                </article>
              ))}
              {!recentAttempts.length ? <p className="text-sm text-zinc-400">还没有练习记录。</p> : null}
            </div>
          </section>

          <details className="mb-8">
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">思考笔记 · {data.notes.length}</summary>
            <div className="mt-4 space-y-3">
              {data.notes.map((note: any) => (
                <article key={note.id} className="rounded-xl bg-white/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-zinc-400">{noteTypeLabels[note.note_type] ?? note.note_type} · {formatDateTime(note.occurred_at)}</p>
                    <form action={archiveInterviewNote}><input type="hidden" name="note_id" value={note.id}/><input type="hidden" name="preparation_id" value={prep.id}/><button className="text-xs text-zinc-400">归档</button></form>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{note.body_markdown}</p>
                </article>
              ))}
            </div>
          </details>

          <details>
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-700">编辑与更多</summary>
            <div className="mt-5 space-y-8 rounded-2xl bg-white/60 p-5">
              <EditorSection title="核心回答">
                <form action={updateInterviewPreparation} className="grid gap-4">
                  <PreparationStateFields prep={prep} questionId={questionId} />
                  <TextArea name="key_message" label="核心信息" defaultValue={prep.key_message} rows={2} />
                  <TextArea name="answer_logic_markdown" label="回答结构" defaultValue={prep.answer_logic_markdown} rows={5} />
                  <PrimaryButton>保存</PrimaryButton>
                </form>
              </EditorSection>

              <EditorSection title="问题理解">
                <form action={updateInterviewPreparation} className="grid gap-4">
                  <PreparationStateFields prep={prep} questionId={questionId} />
                  <TextArea name="prompt_override" label="岗位下的真实问法" defaultValue={prep.prompt_override} />
                  <TextArea name="interviewer_intent_markdown" label="面试官意图" defaultValue={prep.interviewer_intent_markdown} />
                  <TextArea name="risk_markdown" label="风险点" defaultValue={prep.risk_markdown} />
                  <PrimaryButton>保存</PrimaryButton>
                </form>
              </EditorSection>

              <EditorSection title="思考">
                <form action={updateInterviewPreparation} className="grid gap-4">
                  <PreparationStateFields prep={prep} questionId={questionId} />
                  <TextArea name="working_thoughts_markdown" label="当前思考" defaultValue={prep.working_thoughts_markdown} rows={5} />
                  <PrimaryButton>保存</PrimaryButton>
                </form>
                <form action={addInterviewNote} className="mt-4 grid gap-4">
                  <input type="hidden" name="preparation_id" value={prep.id} />
                  <SelectField name="note_type" label="记录类型" defaultValue="thinking" options={interviewNoteTypes.map((value) => [value, noteTypeLabels[value]] as [string,string])} />
                  <TextArea name="body_markdown" label="新增记录" rows={3} required />
                  <PrimaryButton>新增记录</PrimaryButton>
                </form>
              </EditorSection>

              <EditorSection title="经历">
                <form action={linkInterviewEvidence} className="grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="preparation_id" value={prep.id} />
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-zinc-500">经历素材</span>
                    <select name="target_ref" className={controlClass}>
                      {Object.entries(evidenceTypeLabels).map(([type,label]) => {
                        const items = data.evidenceCatalog.filter((item: any) => item.type === type);
                        return items.length ? <optgroup key={type} label={label}>{items.map((item: any) => <option key={`${type}:${item.id}`} value={`${type}:${item.id}`}>{item.label}</option>)}</optgroup> : null;
                      })}
                    </select>
                  </label>
                  <SelectField name="relationship_type" label="作用" defaultValue="supporting_evidence" options={evidenceRelationships.map((value) => [value, evidenceRelationshipLabels[value]] as [string,string])} />
                  <PrimaryButton>关联</PrimaryButton>
                </form>
                {data.evidenceLinks.length ? <div className="mt-3 space-y-2">{data.evidenceLinks.map((link: any) => <form key={link.id} action={unlinkInterviewEvidence} className="flex items-center justify-between text-xs text-zinc-500"><span>{link.evidence.label}</span><input type="hidden" name="link_id" value={link.id}/><input type="hidden" name="preparation_id" value={prep.id}/><button>移除</button></form>)}</div> : null}
              </EditorSection>

              <EditorSection title="答案版本">
                <form action={createInterviewAnswerVersion} className="grid gap-4 sm:grid-cols-3">
                  <input type="hidden" name="preparation_id" value={prep.id} />
                  <SelectField name="answer_mode" label="模式" defaultValue="spoken" options={interviewAnswerModes.map((value) => [value, answerModeLabels[value]] as [string,string])} />
                  <Field name="target_seconds" label="目标秒数" type="number" defaultValue={60} />
                  <SelectField name="language" label="语言" defaultValue={prep.target_language} options={interviewLanguages.map((value) => [value, languageLabels[value]] as [string,string])} />
                  <label className="grid gap-1.5 text-sm sm:col-span-3"><span className="text-zinc-500">答案内容</span><textarea required name="body_markdown" rows={7} className={controlClass}/></label>
                  <Field name="change_note" label="版本说明" />
                  <PrimaryButton>保存新版本</PrimaryButton>
                </form>
                {data.answers.length ? <div className="mt-4 space-y-2">{data.answers.map((answer: any) => <div key={answer.id} className="flex items-center justify-between gap-4 text-xs text-zinc-500"><span>V{answer.version_number} · {answerModeLabels[answer.answer_mode] ?? answer.answer_mode} · {answer.status}</span><div className="flex gap-3">{answer.status !== "current" ? <form action={promoteInterviewAnswerVersion}><input type="hidden" name="answer_id" value={answer.id}/><button className="text-[#365F78]">设为当前</button></form> : null}<form action={archiveInterviewAnswerVersion}><input type="hidden" name="answer_id" value={answer.id}/><input type="hidden" name="preparation_id" value={prep.id}/><button>归档</button></form></div></div>)}</div> : null}
              </EditorSection>

              <EditorSection title="追问">
                <form action={createInterviewQuestion} className="grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="parent_question_id" value={question.id}/>
                  <input type="hidden" name="source_type" value="preparation"/>
                  <input type="hidden" name="source_name" value="Personal OS"/>
                  <input type="hidden" name="source_url" value=""/>
                  <input type="hidden" name="source_observed_at" value=""/>
                  <input type="hidden" name="source_detail" value="面试准备追问"/>
                  <input type="hidden" name="competency_tags" value={joinTagInput(question.competency_tags)}/>
                  <input type="hidden" name="prompt_variants" value=""/>
                  <input type="hidden" name="subcategory" value={question.subcategory ?? ""}/>
                  <label className="grid gap-1.5 text-sm sm:col-span-2"><span className="text-zinc-500">追问</span><textarea required name="canonical_prompt" rows={3} className={controlClass}/></label>
                  <Field name="short_title" label="短标题"/>
                  <SelectField name="follow_up_kind" label="类型" defaultValue="deep_dive" options={interviewFollowUpKinds.map((value) => [value, followUpKindLabels[value] ?? value] as [string,string])} />
                  <SelectField name="category" label="题型" defaultValue={question.category} options={interviewCategories.map((value) => [value, categoryLabels[value]] as [string,string])} />
                  <SelectField name="difficulty" label="难度" defaultValue={String(Math.min(5, Number(question.difficulty) + 1))} options={[1,2,3,4,5].map((value) => [String(value), String(value)] as [string,string])} />
                  <PrimaryButton>创建追问</PrimaryButton>
                </form>
              </EditorSection>

              <EditorSection title="准备设置">
                <form action={updateInterviewPreparation} className="grid gap-4 sm:grid-cols-2">
                  <PreparationStateFields prep={prep} questionId={questionId} />
                  <SelectField name="status" label="状态" defaultValue={prep.status} options={interviewStatuses.map((value) => [value, statusLabels[value]] as [string,string])} disabledValues={!data.readiness.readyEligible ? ["ready"] : []} />
                  <SelectField name="importance" label="重要性" defaultValue={prep.importance} options={interviewImportance.map((value) => [value, importanceLabels[value] ?? value] as [string,string])} />
                  <SelectField name="target_language" label="语言" defaultValue={prep.target_language} options={interviewLanguages.map((value) => [value, languageLabels[value]] as [string,string])} />
                  <SelectField name="confidence" label="信心" defaultValue={prep.confidence ? String(prep.confidence) : ""} options={[["","—"],...[1,2,3,4,5].map((value) => [String(value), String(value)] as [string,string])]} />
                  <Field name="next_practice_at" label="下次练习" type="datetime-local" defaultValue={toDatetimeLocal(prep.next_practice_at)}/>
                  <Field name="next_focus" label="下次重点" defaultValue={prep.next_focus}/>
                  <PrimaryButton>保存设置</PrimaryButton>
                </form>
              </EditorSection>

              <details>
                <summary className="cursor-pointer text-xs text-zinc-400">高级题目信息</summary>
                <form action={updateInterviewQuestion} className="mt-4 grid gap-4 sm:grid-cols-2">
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
                  <PrimaryButton>保存题目</PrimaryButton>
                </form>
                <form action={archiveInterviewQuestion} className="mt-4"><input type="hidden" name="question_id" value={question.id}/><button className="text-xs text-red-600">归档此问题</button></form>
              </details>
            </div>
          </details>
        </>
      )}
    </>
  );
}

const controlClass = "rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-zinc-200 outline-none focus:ring-zinc-400";

function ReadBlock({ label, value }: { label: string; value?: string | null }) {
  return <div><p className="text-xs text-zinc-400">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-zinc-600">{value || "—"}</p></div>;
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-4 text-sm font-medium text-zinc-800">{title}</h3>{children}</section>;
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
  return <label className="grid gap-1.5 text-sm"><span className="text-zinc-500">{label}</span><textarea name={name} defaultValue={defaultValue ?? ""} rows={rows} required={required} className={controlClass}/></label>;
}

function Field({ name, label, type = "text", defaultValue, required = false }: { name: string; label: string; type?: string; defaultValue?: string | number | null; required?: boolean }) {
  return <label className="grid gap-1.5 text-sm"><span className="text-zinc-500">{label}</span><input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} className={controlClass}/></label>;
}

function SelectField({ name, label, defaultValue, options, disabledValues = [] }: { name: string; label: string; defaultValue: string; options: [string,string][]; disabledValues?: string[] }) {
  return <label className="grid gap-1.5 text-sm"><span className="text-zinc-500">{label}</span><select name={name} defaultValue={defaultValue} className={controlClass}>{options.map(([value,text]) => <option key={value || "none"} value={value} disabled={disabledValues.includes(value)}>{text}</option>)}</select></label>;
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return <button className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">{children}</button>;
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0,16);
}
