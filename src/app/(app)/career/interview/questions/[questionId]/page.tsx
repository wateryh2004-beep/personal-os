import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { InterviewNav } from "@/components/career/interview/interview-nav";
import {
  addInterviewNote,
  archiveInterviewAnswerVersion,
  createInterviewQuestion,
  archiveInterviewNote,
  archiveInterviewQuestion,
  createInterviewAnswerVersion,
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
  interviewAnswerModes,
  interviewCategories,
  interviewFollowUpKinds,
  interviewImportance,
  interviewLanguages,
  interviewNoteTypes,
  interviewSourceTypes,
  interviewStatuses,
  importanceLabels,
  issueLabels,
  followUpKindLabels,
  sourceTypeLabels,
  joinTagInput,
  languageLabels,
  noteTypeLabels,
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
        eyebrow={<Link href="/career/interview" className="hover:text-zinc-700">面试准备 / 题库</Link>}
      />
      <CareerNav current="/career/interview" />
      <InterviewNav current={`/career/interview/questions/${questionId}`} />

      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-[#365F78]/10 px-2 py-1 font-medium text-[#365F78]">{categoryLabels[question.category] ?? question.category}</span>
        <span className="text-zinc-500">难度 {question.difficulty}</span>
        {(question.competency_tags ?? []).map((tag: string) => <span key={tag} className="rounded bg-zinc-100 px-2 py-1 text-zinc-600">{competencyLabels[tag] ?? tag}</span>)}
        {question.source_name ? <span className="text-zinc-400">来源：{question.source_name}</span> : null}
      </div>

      <section className="mb-8 rounded-2xl bg-zinc-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/career/interview/questions/${questionId}`} className={`rounded px-3 py-1.5 text-sm ${!prep?.context_id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"}`}>通用</Link>
          {data.contexts.map((item: any) => {
            const active = prep?.context_id === item.id;
            return <Link key={item.id} href={`/career/interview/questions/${questionId}?context=${item.id}`} className={`rounded px-3 py-1.5 text-sm ${active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"}`}>{item.title}</Link>;
          })}
        </div>
        <p className="mt-2 text-xs text-zinc-500">同一道题可以针对不同公司或岗位保留独立准备，不复制题目本体。</p>
      </section>

      {!prep ? (
        <section className="border-l-2 border-amber-500 bg-amber-50 p-5">
          <h2 className="font-medium">这个目标下还没有准备内容</h2>
          <p className="mt-2 text-sm text-amber-800">创建后即可记录面试官意图、思考、回答逻辑、答案、经历素材和练习记录。</p>
          <form action={ensureInterviewPreparation} className="mt-4">
            <input type="hidden" name="question_id" value={questionId} />
            <input type="hidden" name="context_id" value={context ?? ""} />
            <button className="bg-[#365F78] px-3 py-2 text-sm text-white">开始准备这道题</button>
          </form>
        </section>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <main className="space-y-10">
            <section>
              <SectionTitle title="理解问题" description="先回答：面试官为什么问、这题最容易掉进什么坑。" />
              <form action={updateInterviewPreparation} className="mt-4 grid gap-4">
                <input type="hidden" name="preparation_id" value={prep.id} />
                <input type="hidden" name="question_id" value={questionId} />
                <input type="hidden" name="status" value={prep.status} />
                <input type="hidden" name="importance" value={prep.importance} />
                <input type="hidden" name="target_language" value={prep.target_language} />
                <input type="hidden" name="working_thoughts_markdown" value={prep.working_thoughts_markdown} />
                <input type="hidden" name="answer_logic_markdown" value={prep.answer_logic_markdown} />
                <input type="hidden" name="key_message" value={prep.key_message} />
                <input type="hidden" name="next_focus" value={prep.next_focus} />
                <input type="hidden" name="confidence" value={prep.confidence ?? ""} />
                <input type="hidden" name="next_practice_at" value={prep.next_practice_at ?? ""} />
                <TextArea name="prompt_override" label="这个场景下的真实问法" defaultValue={prep.prompt_override} />
                <TextArea name="interviewer_intent_markdown" label="面试官意图" defaultValue={prep.interviewer_intent_markdown} />
                <TextArea name="risk_markdown" label="容易掉的坑" defaultValue={prep.risk_markdown} />
                <button className="w-fit border px-3 py-2 text-sm">保存问题理解</button>
              </form>
            </section>

            <section>
              <SectionTitle title="我的思考" description="保留当前判断，也保留思考如何演化。" />
              <form action={updateInterviewPreparation} className="mt-4 grid gap-4">
                <input type="hidden" name="preparation_id" value={prep.id} />
                <input type="hidden" name="question_id" value={questionId} />
                <input type="hidden" name="prompt_override" value={prep.prompt_override ?? ""} />
                <input type="hidden" name="status" value={prep.status} />
                <input type="hidden" name="importance" value={prep.importance} />
                <input type="hidden" name="target_language" value={prep.target_language} />
                <input type="hidden" name="interviewer_intent_markdown" value={prep.interviewer_intent_markdown} />
                <input type="hidden" name="risk_markdown" value={prep.risk_markdown} />
                <input type="hidden" name="answer_logic_markdown" value={prep.answer_logic_markdown} />
                <input type="hidden" name="key_message" value={prep.key_message} />
                <input type="hidden" name="next_focus" value={prep.next_focus} />
                <input type="hidden" name="confidence" value={prep.confidence ?? ""} />
                <input type="hidden" name="next_practice_at" value={prep.next_practice_at ?? ""} />
                <TextArea name="working_thoughts_markdown" label="当前思考" defaultValue={prep.working_thoughts_markdown} rows={7} />
                <button className="w-fit border px-3 py-2 text-sm">保存当前思考</button>
              </form>
              <form action={addInterviewNote} className="mt-5 grid gap-3 border-t pt-4">
                <input type="hidden" name="preparation_id" value={prep.id} />
                <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                  <label className="grid gap-1 text-sm"><span>记录类型</span><select name="note_type" defaultValue="thinking" className="rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-zinc-200">{interviewNoteTypes.map((type) => <option key={type} value={type}>{noteTypeLabels[type]}</option>)}</select></label>
                  <TextArea name="body_markdown" label="新增一条思考 / 洞察 / 复盘" required rows={3} />
                </div>
                <button className="w-fit bg-zinc-900 px-3 py-2 text-sm text-white">加入时间线</button>
              </form>
              <div className="mt-5 space-y-3">
                {data.notes.map((note: any) => <article key={note.id} className="border-l-2 border-zinc-200 pl-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-zinc-500">{noteTypeLabels[note.note_type] ?? note.note_type} · {formatDateTime(note.occurred_at)}</p><form action={archiveInterviewNote}><input type="hidden" name="note_id" value={note.id}/><input type="hidden" name="preparation_id" value={prep.id}/><button className="text-xs text-zinc-400 hover:text-zinc-700">归档</button></form></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{note.body_markdown}</p></article>)}
                {!data.notes.length ? <p className="text-sm text-zinc-500">还没有思考历史。</p> : null}
              </div>
            </section>

            <section>
              <SectionTitle title="回答逻辑" description="真正可迁移的是回答逻辑，而不是背某一段话。" />
              <form action={updateInterviewPreparation} className="mt-4 grid gap-4">
                <input type="hidden" name="preparation_id" value={prep.id} /><input type="hidden" name="question_id" value={questionId} />
                <input type="hidden" name="prompt_override" value={prep.prompt_override ?? ""} /><input type="hidden" name="status" value={prep.status} /><input type="hidden" name="importance" value={prep.importance} /><input type="hidden" name="target_language" value={prep.target_language} /><input type="hidden" name="interviewer_intent_markdown" value={prep.interviewer_intent_markdown} /><input type="hidden" name="risk_markdown" value={prep.risk_markdown} /><input type="hidden" name="working_thoughts_markdown" value={prep.working_thoughts_markdown} /><input type="hidden" name="next_focus" value={prep.next_focus} /><input type="hidden" name="confidence" value={prep.confidence ?? ""} /><input type="hidden" name="next_practice_at" value={prep.next_practice_at ?? ""} />
                <TextArea name="key_message" label="核心信息（一句话结论）" defaultValue={prep.key_message} rows={2} />
                <TextArea name="answer_logic_markdown" label="回答结构" defaultValue={prep.answer_logic_markdown} rows={6} />
                <button className="w-fit border px-3 py-2 text-sm">保存回答逻辑</button>
              </form>
            </section>

            <section>
              <SectionTitle title="可用经历" description="只关联职业档案中的真实经历和证据，不在这里重复维护。" />
              <form action={linkInterviewEvidence} className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
                <input type="hidden" name="preparation_id" value={prep.id} />
                <label className="grid gap-1 text-sm"><span>经历素材</span><select name="target_ref" className="min-w-0 border bg-white px-3 py-2">
                  {Object.entries(evidenceTypeLabels).map(([type,label]) => {
                    const items = data.evidenceCatalog.filter((item: any) => item.type === type);
                    return items.length ? <optgroup key={type} label={label}>{items.map((item: any) => <option key={`${type}:${item.id}`} value={`${type}:${item.id}`}>{item.label}</option>)}</optgroup> : null;
                  })}
                </select></label>
                <label className="grid gap-1 text-sm"><span>角色</span><select name="relationship_type" defaultValue="supporting_evidence" className="border bg-white px-3 py-2">{evidenceRelationships.map((value) => <option key={value} value={value}>{evidenceRelationshipLabels[value]}</option>)}</select></label>
                <button disabled={!data.evidenceCatalog.length} className="self-end border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">Link</button>
              </form>
              <p className="mt-2 text-xs text-zinc-400">{data.evidenceCatalog.length ? "这里只保存关联关系，事实内容仍以经历档案为准。" : "经历档案里还没有可关联的经历、事实、成果、技能或材料。"}</p>
              <div className="mt-4 space-y-2">
                {data.evidenceLinks.map((link: any) => <div key={link.id} className="flex items-start justify-between gap-3 border-l-2 border-zinc-200 pl-3 text-sm"><div><p className="font-medium">{link.evidence.label}</p><p className="mt-1 text-xs text-zinc-500">{evidenceTypeLabels[link.target_type as keyof typeof evidenceTypeLabels] ?? link.target_type} · {evidenceRelationshipLabels[link.relationship_type] ?? link.relationship_type}</p></div><form action={unlinkInterviewEvidence}><input type="hidden" name="link_id" value={link.id}/><input type="hidden" name="preparation_id" value={prep.id}/><button className="text-xs text-zinc-400 hover:text-zinc-800">移除</button></form></div>)}
                {!data.evidenceLinks.length ? <p className="text-sm text-zinc-500">尚未关联经历素材。行为面、简历面和压力面建议至少关联一项真实证据。</p> : null}
              </div>
            </section>

            <section>
              <SectionTitle title="我的回答" description="可以保留不同模式、时长和语言版本，并指定一个当前版本。" />
              <form action={createInterviewAnswerVersion} className="mt-4 grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="preparation_id" value={prep.id} />
                <label className="grid gap-1 text-sm"><span>模式</span><select name="answer_mode" defaultValue="spoken" className="border bg-white px-3 py-2">{interviewAnswerModes.map((mode) => <option key={mode} value={mode}>{answerModeLabels[mode]}</option>)}</select></label>
                <label className="grid gap-1 text-sm"><span>目标秒数</span><input type="number" min={10} max={1800} name="target_seconds" defaultValue={60} className="border bg-white px-3 py-2"/></label>
                <label className="grid gap-1 text-sm"><span>语言</span><select name="language" defaultValue={prep.target_language} className="border bg-white px-3 py-2">{interviewLanguages.map((lang) => <option key={lang} value={lang}>{languageLabels[lang]}</option>)}</select></label>
                <label className="grid gap-1 text-sm"><span>版本说明</span><input name="change_note" className="border bg-white px-3 py-2"/></label>
                <label className="grid gap-1 text-sm sm:col-span-4"><span>答案内容 *</span><textarea required name="body_markdown" className="min-h-40 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-zinc-200"/></label>
                <button className="w-fit bg-[#365F78] px-3 py-2 text-sm text-white sm:col-span-4">保存新版本</button>
              </form>
              <div className="mt-6 space-y-3">
                {data.answers.map((answer: any) => <article key={answer.id} className={`rounded-2xl p-4 ${answer.status === "current" ? "bg-[#365F78]/8" : "bg-zinc-50"}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-xs font-medium">{answerModeLabels[answer.answer_mode] ?? answer.answer_mode}{answer.target_seconds ? ` · ${answer.target_seconds}s` : ""} · {languageLabels[answer.language] ?? answer.language}</span><span className="ml-2 text-xs text-zinc-400">V{answer.version_number} · {answer.status}</span></div><div className="flex gap-2">{answer.status !== "current" ? <form action={promoteInterviewAnswerVersion}><input type="hidden" name="answer_id" value={answer.id}/><button className="text-xs text-[#365F78]">设为当前</button></form> : null}<form action={archiveInterviewAnswerVersion}><input type="hidden" name="answer_id" value={answer.id}/><input type="hidden" name="preparation_id" value={prep.id}/><button className="text-xs text-zinc-400">归档</button></form></div></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{answer.body_markdown}</p>{answer.change_note ? <p className="mt-2 text-xs text-zinc-400">{answer.change_note}</p> : null}</article>)}
                {!data.answers.length ? <p className="text-sm text-zinc-500">还没有答案版本。先写提纲或第一版口语答案。</p> : null}
              </div>
            </section>

            <section>
              <SectionTitle title="压力追问" description="把真实追问保留为结构关系，而不是散落成重复题。" />
              <div className="mt-4 space-y-2">
                {data.childQuestions.map((child: any) => <Link key={child.id} href={`/career/interview/questions/${child.id}`} className="block border-l-2 border-zinc-200 pl-3 py-1 text-sm hover:border-[#365F78]"><span className="text-xs text-zinc-400">{followUpKindLabels[child.follow_up_kind] ?? child.follow_up_kind} · 难度 {child.difficulty}</span><p>{child.short_title || child.canonical_prompt}</p></Link>)}
                {!data.childQuestions.length ? <p className="text-sm text-zinc-500">暂无结构化追问。</p> : null}
              </div>
              <details className="mt-5 pt-2">
                <summary className="cursor-pointer text-sm text-[#365F78]">+ 新建追问</summary>
                <form action={createInterviewQuestion} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="parent_question_id" value={question.id}/>
                  <input type="hidden" name="source_type" value="preparation"/>
                  <input type="hidden" name="source_name" value="Personal OS"/>
                  <input type="hidden" name="source_url" value=""/>
                  <input type="hidden" name="source_observed_at" value=""/>
                  <input type="hidden" name="source_detail" value="Interview Lab follow-up"/>
                  <input type="hidden" name="competency_tags" value={joinTagInput(question.competency_tags)}/>
                  <input type="hidden" name="prompt_variants" value=""/>
                  <input type="hidden" name="subcategory" value={question.subcategory ?? ""}/>
                  <label className="grid gap-1 text-sm sm:col-span-2"><span>追问 *</span><textarea required name="canonical_prompt" className="min-h-20 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-zinc-200"/></label>
                  <Field name="short_title" label="短标题"/>
                  <label className="grid gap-1 text-sm"><span>追问类型</span><select name="follow_up_kind" defaultValue="deep_dive" className="border bg-white px-3 py-2">{interviewFollowUpKinds.map((value) => <option key={value} value={value}>{followUpKindLabels[value] ?? value}</option>)}</select></label>
                  <label className="grid gap-1 text-sm"><span>题型</span><select name="category" defaultValue={question.category} className="border bg-white px-3 py-2">{interviewCategories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
                  <label className="grid gap-1 text-sm"><span>难度</span><select name="difficulty" defaultValue={Math.min(5, Number(question.difficulty) + 1)} className="border bg-white px-3 py-2">{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <button className="w-fit border px-3 py-2 text-sm sm:col-span-2">创建追问</button>
                </form>
              </details>
            </section>

            <section>
              <SectionTitle title="练习记录" description="每次真实回答都保留，不覆盖历史。" />
              <div className="mt-4 space-y-3">
                {data.attempts.map((attempt: any, index: number) => <article key={attempt.id} className="border-t pt-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium">练习 #{data.attempts.length - index}</p><time className="text-xs text-zinc-400">{formatDateTime(attempt.practiced_at)}{attempt.duration_seconds ? ` · ${attempt.duration_seconds}s` : ""}</time></div>{attempt.response_transcript_markdown ? <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-zinc-600">{attempt.response_transcript_markdown}</p> : null}{attempt.self_review_markdown ? <p className="mt-2 text-xs text-zinc-500">自评： {attempt.self_review_markdown}</p> : null}<div className="mt-2 flex flex-wrap gap-1">{(attempt.issue_tags ?? []).map((tag: string) => <span key={tag} className="rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{issueLabels[tag] ?? tag}</span>)}</div></article>)}
                {!data.attempts.length ? <p className="text-sm text-zinc-500">还没练过。右侧可以直接开始练习。</p> : null}
              </div>
            </section>

            <details className="pt-4">
              <summary className="cursor-pointer text-sm text-zinc-500">编辑题目信息 / 归档</summary>
              <form action={updateInterviewQuestion} className="mt-5 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="question_id" value={question.id}/>
                <TextArea name="canonical_prompt" label="标准问法" defaultValue={question.canonical_prompt} required rows={4}/>
                <Field name="short_title" label="短标题" defaultValue={question.short_title}/>
                <label className="grid gap-1 text-sm"><span>题型</span><select name="category" defaultValue={question.category} className="border bg-white px-3 py-2">{interviewCategories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
                <Field name="subcategory" label="二级分类" defaultValue={question.subcategory}/>
                <Field name="competency_tags" label="能力标签" defaultValue={joinTagInput(question.competency_tags)}/>
                <Field name="prompt_variants" label="变体问法" defaultValue={joinTagInput(question.prompt_variants)}/>
                <label className="grid gap-1 text-sm"><span>来源</span><select name="source_type" defaultValue={question.source_type} className="border bg-white px-3 py-2">{interviewSourceTypes.map((value) => <option key={value} value={value}>{sourceTypeLabels[value] ?? value}</option>)}</select></label>
                <Field name="source_name" label="来源名称" defaultValue={question.source_name}/>
                <Field name="source_url" label="来源链接" defaultValue={question.source_url}/>
                <Field name="source_observed_at" label="来源日期" type="date" defaultValue={question.source_observed_at}/>
                <Field name="source_detail" label="来源说明" defaultValue={question.source_detail}/>
                <label className="grid gap-1 text-sm"><span>难度</span><select name="difficulty" defaultValue={question.difficulty} className="border bg-white px-3 py-2">{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <input type="hidden" name="parent_question_id" value={question.parent_question_id ?? ""}/>
                <input type="hidden" name="follow_up_kind" value={question.follow_up_kind ?? ""}/>
                {question.parent_question_id ? <p className="text-sm text-zinc-500 sm:col-span-2">这是一个结构化追问；父子关系在这里保持不变。</p> : null}
                <button className="w-fit border px-3 py-2 text-sm">保存题目</button>
              </form>
              <form action={archiveInterviewQuestion} className="mt-5 border-t pt-4"><input type="hidden" name="question_id" value={question.id}/><button className="text-sm text-red-600">归档此问题</button></form>
            </details>
          </main>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">当前准备</p>
              <h2 className="mt-2 font-medium">{selectedContext?.title || "通用"}</h2>
              <form action={updateInterviewPreparation} className="mt-4 grid gap-3">
                <input type="hidden" name="preparation_id" value={prep.id}/><input type="hidden" name="question_id" value={questionId}/>
                <input type="hidden" name="prompt_override" value={prep.prompt_override ?? ""}/><input type="hidden" name="interviewer_intent_markdown" value={prep.interviewer_intent_markdown}/><input type="hidden" name="risk_markdown" value={prep.risk_markdown}/><input type="hidden" name="working_thoughts_markdown" value={prep.working_thoughts_markdown}/><input type="hidden" name="answer_logic_markdown" value={prep.answer_logic_markdown}/><input type="hidden" name="key_message" value={prep.key_message}/><input type="hidden" name="next_focus" value={prep.next_focus}/>
                <label className="grid gap-1 text-sm"><span>状态</span><select name="status" defaultValue={prep.status} className="border bg-white px-3 py-2">{interviewStatuses.map((value) => <option key={value} value={value} disabled={value === "ready" && !data.readiness.readyEligible}>{statusLabels[value]}</option>)}</select></label>
                <label className="grid gap-1 text-sm"><span>重要性</span><select name="importance" defaultValue={prep.importance} className="border bg-white px-3 py-2">{interviewImportance.map((value) => <option key={value} value={value}>{importanceLabels[value] ?? value}</option>)}</select></label>
                <label className="grid gap-1 text-sm"><span>目标语言</span><select name="target_language" defaultValue={prep.target_language} className="border bg-white px-3 py-2">{interviewLanguages.map((value) => <option key={value} value={value}>{languageLabels[value]}</option>)}</select></label>
                <label className="grid gap-1 text-sm"><span>信心</span><select name="confidence" defaultValue={prep.confidence ?? ""} className="border bg-white px-3 py-2"><option value="">—</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <Field name="next_practice_at" label="下次练习" type="datetime-local" defaultValue={toDatetimeLocal(prep.next_practice_at)}/>
                <button className="border px-3 py-2 text-sm">更新状态</button>
              </form>
            </section>

            <section className="rounded-2xl bg-zinc-50 p-4">
              <p className="text-sm font-medium">准备完成条件</p>
              <Checklist ok={data.readiness.required.keyMessage} label="核心信息"/>
              <Checklist ok={data.readiness.required.answerLogic} label="回答结构"/>
              <Checklist ok={data.readiness.required.currentAnswer} label="当前回答"/>
              <Checklist ok={data.readiness.required.practiced} label="至少练习 1 次"/>
              <Checklist ok={data.readiness.evidence} label="关联真实经历（建议）" optional/>
            </section>

            <section className="rounded-2xl bg-zinc-50 p-4 text-sm">
              <p className="font-medium">下次重点</p>
              <p className="mt-2 whitespace-pre-wrap text-zinc-600">{prep.next_focus || "尚未设置。每次练习最好只指定一个改进目标。"}</p>
              <dl className="mt-4 space-y-2 text-xs text-zinc-500"><div className="flex justify-between"><dt>上次练习</dt><dd>{formatDateTime(prep.last_practiced_at)}</dd></div><div className="flex justify-between"><dt>下次练习</dt><dd>{formatDateTime(prep.next_practice_at)}</dd></div><div className="flex justify-between"><dt>当前答案</dt><dd>{data.currentAnswers?.length ?? 0}</dd></div><div className="flex justify-between"><dt>练习次数</dt><dd>{data.attempts.length}</dd></div></dl>
            </section>

            <Link href={`/career/interview/practice/${prep.id}`} className="block bg-[#365F78] px-4 py-3 text-center text-sm font-medium text-white">开始练习 →</Link>
          </aside>
        </div>
      )}
    </>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-lg font-medium">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></div>;
}

function TextArea({ name, label, defaultValue, rows = 4, required = false }: { name: string; label: string; defaultValue?: string | null; rows?: number; required?: boolean }) {
  return <label className="grid gap-1 text-sm"><span>{label}</span><textarea name={name} defaultValue={defaultValue ?? ""} rows={rows} required={required} className="border bg-white px-3 py-2"/></label>;
}

function Field({ name, label, type = "text", defaultValue, required = false }: { name: string; label: string; type?: string; defaultValue?: string | number | null; required?: boolean }) {
  return <label className="grid gap-1 text-sm"><span>{label}</span><input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} className="border bg-white px-3 py-2"/></label>;
}

function Checklist({ ok, label, optional = false }: { ok: boolean; label: string; optional?: boolean }) {
  return <div className="mt-2 flex items-center justify-between text-sm"><span className={ok ? "text-zinc-900" : "text-zinc-500"}>{label}{optional ? " · optional" : ""}</span><span>{ok ? "✓" : "—"}</span></div>;
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0,16);
}

