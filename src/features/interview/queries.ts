import { requireOwner } from "@/lib/auth/require-owner";
import { evidenceTypeLabels, type EvidenceType } from "./constants";
import { buildMonthlyIssueTrend, countTags, readinessChecklist, sortPracticeQueue } from "./utils";

export type InterviewQuestionFilters = {
  q?: string;
  category?: string;
  status?: string;
  context?: string;
  needsPractice?: string;
};

function labelEvidence(type: EvidenceType, row: any) {
  switch (type) {
    case "experience":
      return [row.organization, row.role].filter(Boolean).join(" · ") || "未命名经历";
    case "experience_fact":
      return row.content || "未命名事实";
    case "experience_output":
      return row.name || "未命名成果";
    case "experience_bullet":
      return row.content || "未命名表达";
    case "skill":
      return row.name || "未命名技能";
    case "certification":
      return [row.name, row.issuer].filter(Boolean).join(" · ") || "未命名证书";
    case "document":
      return row.title || row.original_filename || "未命名文件";
    case "resume_version":
      return [row.title, row.version_label].filter(Boolean).join(" · ") || "未命名简历";
  }
}

async function getEvidenceCatalog(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"]) {
  const [experiences, facts, outputs, bullets, skills, certifications, documents, resumes] = await Promise.all([
    supabase.from("experiences").select("id,organization,role").is("archived_at", null).order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("experience_facts").select("id,content,experience_id").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("experience_outputs").select("id,name,experience_id,output_type").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("experience_bullets").select("id,content,experience_id,status").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("skills").select("id,name,category,proficiency").is("archived_at", null).order("name"),
    supabase.from("certifications").select("id,name,issuer,status").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("documents").select("id,title,original_filename,document_type").is("archived_at", null).order("uploaded_at", { ascending: false }).limit(200),
    supabase.from("resume_versions").select("id,title,version_label,status").is("archived_at", null).order("updated_at", { ascending: false }),
  ]);
  const raw: Record<EvidenceType, any[]> = {
    experience: experiences.data ?? [],
    experience_fact: facts.data ?? [],
    experience_output: outputs.data ?? [],
    experience_bullet: bullets.data ?? [],
    skill: skills.data ?? [],
    certification: certifications.data ?? [],
    document: documents.data ?? [],
    resume_version: resumes.data ?? [],
  };
  return Object.entries(raw).flatMap(([type, rows]) =>
    rows.map((row) => ({ type: type as EvidenceType, id: row.id as string, label: labelEvidence(type as EvidenceType, row), meta: row })),
  );
}

export async function getInterviewQuestions(filters: InterviewQuestionFilters = {}) {
  const { supabase } = await requireOwner();
  const [questionsResult, preparationsResult, contextsResult] = await Promise.all([
    supabase.from("interview_questions").select("*").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("interview_question_preparations").select("*").is("archived_at", null).order("position"),
    supabase.from("interview_contexts").select("*").is("archived_at", null).order("priority", { ascending: false }).order("next_interview_at", { ascending: true, nullsFirst: false }),
  ]);
  const questions = questionsResult.data ?? [];
  const preparations = preparationsResult.data ?? [];
  const contexts = contextsResult.data ?? [];
  const q = (filters.q ?? "").trim().toLocaleLowerCase();
  const now = Date.now();

  const rows = questions.flatMap((question: any) => {
    const questionPreparations = preparations.filter((prep: any) => prep.question_id === question.id);
    const selected = filters.context
      ? questionPreparations.find((prep: any) => prep.context_id === filters.context)
      : questionPreparations.find((prep: any) => prep.context_id === null) ?? questionPreparations[0];
    if (filters.context && !selected) return [];
    if (filters.category && question.category !== filters.category) return [];
    if (filters.status && selected?.status !== filters.status) return [];
    if (q) {
      const haystack = [question.canonical_prompt, question.short_title, question.subcategory, ...(question.competency_tags ?? [])].filter(Boolean).join(" ").toLocaleLowerCase();
      if (!haystack.includes(q)) return [];
    }
    const needsPractice = selected && (!selected.next_practice_at || Date.parse(selected.next_practice_at) <= now);
    if (filters.needsPractice === "1" && !needsPractice) return [];
    return [{ question, preparation: selected ?? null, preparationCount: questionPreparations.length, needsPractice }];
  });

  const statusCounts = preparations.reduce<Record<string, number>>((acc, prep: any) => {
    acc[prep.status] = (acc[prep.status] ?? 0) + 1;
    return acc;
  }, {});

  return { rows, questions, preparations, contexts, statusCounts, unavailable: Boolean(questionsResult.error || preparationsResult.error || contextsResult.error) };
}

export async function getInterviewQuestionDetail(questionId: string, contextId?: string | null) {
  const { supabase } = await requireOwner();
  const { data: question } = await supabase.from("interview_questions").select("*").eq("id", questionId).is("archived_at", null).maybeSingle();
  if (!question) return null;

  const [contextsResult, preparationsResult, childrenResult] = await Promise.all([
    supabase.from("interview_contexts").select("*").is("archived_at", null).order("priority", { ascending: false }).order("title"),
    supabase.from("interview_question_preparations").select("*").eq("question_id", questionId).is("archived_at", null).order("created_at"),
    supabase.from("interview_questions").select("id,canonical_prompt,short_title,follow_up_kind,difficulty").eq("parent_question_id", questionId).is("archived_at", null).order("created_at"),
  ]);
  const contexts = contextsResult.data ?? [];
  const preparations = preparationsResult.data ?? [];
  const selectedPreparation = contextId
    ? preparations.find((prep: any) => prep.context_id === contextId) ?? null
    : preparations.find((prep: any) => prep.context_id === null) ?? preparations[0] ?? null;

  if (!selectedPreparation) {
    return { question, contexts, preparations, selectedPreparation: null, notes: [], answers: [], attempts: [], childQuestions: childrenResult.data ?? [], evidenceLinks: [], evidenceCatalog: [], readiness: readinessChecklist({ currentAnswerCount: 0, attemptCount: 0, evidenceCount: 0 }) };
  }

  const [notesResult, answersResult, attemptsResult, linksResult, evidenceCatalog] = await Promise.all([
    supabase.from("interview_question_notes").select("*").eq("preparation_id", selectedPreparation.id).is("archived_at", null).order("pinned", { ascending: false }).order("occurred_at", { ascending: false }),
    supabase.from("interview_answer_versions").select("*").eq("preparation_id", selectedPreparation.id).is("archived_at", null).order("answer_mode").order("language").order("target_seconds", { ascending: true, nullsFirst: true }).order("version_number", { ascending: false }),
    supabase.from("interview_practice_attempts").select("*").eq("preparation_id", selectedPreparation.id).is("archived_at", null).order("practiced_at", { ascending: false }).limit(30),
    supabase.from("entity_links").select("*").eq("source_type", "interview_preparation").eq("source_id", selectedPreparation.id).is("archived_at", null).order("created_at"),
    getEvidenceCatalog(supabase),
  ]);

  const evidenceByKey = new Map(evidenceCatalog.map((item) => [`${item.type}:${item.id}`, item]));
  const evidenceLinks = (linksResult.data ?? []).map((link: any) => ({
    ...link,
    evidence: evidenceByKey.get(`${link.target_type}:${link.target_id}`) ?? { type: link.target_type, id: link.target_id, label: `${evidenceTypeLabels[link.target_type as EvidenceType] ?? link.target_type} · 已归档/不可见` },
  }));
  const answers = answersResult.data ?? [];
  const attempts = attemptsResult.data ?? [];
  const currentAnswers = answers.filter((answer: any) => answer.status === "current");
  const readiness = readinessChecklist({
    keyMessage: selectedPreparation.key_message,
    answerLogic: selectedPreparation.answer_logic_markdown,
    currentAnswerCount: currentAnswers.length,
    attemptCount: attempts.length,
    evidenceCount: evidenceLinks.length,
  });

  return {
    question,
    contexts,
    preparations,
    selectedPreparation,
    notes: notesResult.data ?? [],
    answers,
    currentAnswers,
    attempts,
    childQuestions: childrenResult.data ?? [],
    evidenceLinks,
    evidenceCatalog,
    readiness,
  };
}

export async function getPracticeQueue(contextId?: string | null) {
  const { supabase } = await requireOwner();
  let query = supabase.from("interview_question_preparations")
    .select("*,interview_questions(id,canonical_prompt,short_title,category,competency_tags,difficulty),interview_contexts(id,title,organization_snapshot,role_title_snapshot)")
    .is("archived_at", null)
    .neq("status", "paused");
  if (contextId) query = query.eq("context_id", contextId);
  const [prepsResult, contextsResult] = await Promise.all([
    query,
    supabase.from("interview_contexts").select("id,title,status,organization_snapshot,role_title_snapshot").is("archived_at", null).order("priority", { ascending: false }).order("title"),
  ]);
  return {
    queue: sortPracticeQueue((prepsResult.data ?? []) as any[]),
    contexts: contextsResult.data ?? [],
    unavailable: Boolean(prepsResult.error || contextsResult.error),
  };
}

export async function getPracticeDetail(preparationId: string) {
  const { supabase } = await requireOwner();
  const { data: preparation } = await supabase.from("interview_question_preparations")
    .select("*,interview_questions(*),interview_contexts(id,title,organization_snapshot,role_title_snapshot)")
    .eq("id", preparationId).is("archived_at", null).maybeSingle();
  if (!preparation) return null;
  const [answers, attempts, links] = await Promise.all([
    supabase.from("interview_answer_versions").select("*").eq("preparation_id", preparationId).eq("status", "current").is("archived_at", null).order("answer_mode").order("target_seconds", { ascending: true, nullsFirst: true }),
    supabase.from("interview_practice_attempts").select("*").eq("preparation_id", preparationId).is("archived_at", null).order("practiced_at", { ascending: false }).limit(8),
    supabase.from("entity_links").select("id").eq("source_type", "interview_preparation").eq("source_id", preparationId).is("archived_at", null),
  ]);
  return { preparation, answers: answers.data ?? [], attempts: attempts.data ?? [], evidenceCount: (links.data ?? []).length };
}

export async function getInterviewSessions() {
  const { supabase } = await requireOwner();
  const [sessions, contexts, attempts] = await Promise.all([
    supabase.from("interview_sessions").select("*,interview_contexts(id,title,organization_snapshot,role_title_snapshot)").is("archived_at", null).order("scheduled_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    supabase.from("interview_contexts").select("id,title,organization_snapshot,role_title_snapshot,status").is("archived_at", null).order("priority", { ascending: false }).order("title"),
    supabase.from("interview_practice_attempts").select("id,session_id").not("session_id", "is", null).is("archived_at", null),
  ]);
  const counts = (attempts.data ?? []).reduce<Record<string, number>>((acc, row: any) => {
    if (row.session_id) acc[row.session_id] = (acc[row.session_id] ?? 0) + 1;
    return acc;
  }, {});
  return { sessions: sessions.data ?? [], contexts: contexts.data ?? [], counts, unavailable: Boolean(sessions.error || contexts.error) };
}

export async function getInterviewSessionDetail(sessionId: string) {
  const { supabase } = await requireOwner();
  const { data: session } = await supabase.from("interview_sessions").select("*,interview_contexts(id,title,organization_snapshot,role_title_snapshot)").eq("id", sessionId).is("archived_at", null).maybeSingle();
  if (!session) return null;
  const [attempts, preparations] = await Promise.all([
    supabase.from("interview_practice_attempts").select("*").eq("session_id", sessionId).is("archived_at", null).order("sequence_no"),
    supabase.from("interview_question_preparations")
      .select("id,status,importance,target_language,prompt_override,interview_questions(id,canonical_prompt,short_title,category),interview_contexts(id,title)")
      .is("archived_at", null)
      .order("position"),
  ]);
  return { session, attempts: attempts.data ?? [], preparations: preparations.data ?? [] };
}

export async function getInterviewInsights(contextId?: string | null) {
  const { supabase } = await requireOwner();
  let prepQuery = supabase.from("interview_question_preparations").select("id,question_id,context_id,status,importance,last_practiced_at").is("archived_at", null);
  if (contextId) prepQuery = prepQuery.eq("context_id", contextId);
  const [prepsResult, questionsResult, attemptsResult, linksResult, experiencesResult, contextsResult] = await Promise.all([
    prepQuery,
    supabase.from("interview_questions").select("id,category,competency_tags").is("archived_at", null),
    supabase.from("interview_practice_attempts").select("id,preparation_id,issue_tags,strength_tags,practiced_at,duration_seconds").is("archived_at", null).order("practiced_at"),
    supabase.from("entity_links").select("source_id,target_type,target_id,relationship_type").eq("source_type", "interview_preparation").is("archived_at", null),
    supabase.from("experiences").select("id,organization,role").is("archived_at", null),
    supabase.from("interview_contexts").select("id,title,status").is("archived_at", null).order("priority", { ascending: false }),
  ]);
  const preparations = prepsResult.data ?? [];
  const prepIds = new Set(preparations.map((prep: any) => prep.id));
  const attempts = (attemptsResult.data ?? []).filter((attempt: any) => !attempt.preparation_id || prepIds.has(attempt.preparation_id));
  const questionById = new Map((questionsResult.data ?? []).map((question: any) => [question.id, question]));
  const prepById = new Map(preparations.map((prep: any) => [prep.id, prep]));
  const experienceById = new Map((experiencesResult.data ?? []).map((experience: any) => [experience.id, experience]));

  const competency = new Map<string, { total: number; ready: number; evidence: number }>();
  for (const prep of preparations as any[]) {
    const question = questionById.get(prep.question_id) as any;
    for (const tag of question?.competency_tags ?? []) {
      const row = competency.get(tag) ?? { total: 0, ready: 0, evidence: 0 };
      row.total += 1;
      if (prep.status === "ready") row.ready += 1;
      competency.set(tag, row);
    }
  }
  for (const link of linksResult.data ?? []) {
    if (!prepIds.has((link as any).source_id)) continue;
    const prep = prepById.get((link as any).source_id) as any;
    const question = questionById.get(prep?.question_id) as any;
    if (!question) continue;
    for (const tag of question.competency_tags ?? []) {
      const row = competency.get(tag) ?? { total: 0, ready: 0, evidence: 0 };
      row.evidence += 1;
      competency.set(tag, row);
    }
  }

  const storyUsage = new Map<string, number>();
  for (const link of linksResult.data ?? []) {
    if (!prepIds.has((link as any).source_id) || (link as any).target_type !== "experience") continue;
    storyUsage.set((link as any).target_id, (storyUsage.get((link as any).target_id) ?? 0) + 1);
  }

  return {
    contexts: contextsResult.data ?? [],
    attempts,
    preparations,
    issueCounts: countTags(attempts),
    monthlyTrend: buildMonthlyIssueTrend(attempts as any[]),
    competencyCoverage: [...competency.entries()].map(([tag, value]) => ({ tag, ...value })).sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag)),
    storyUsage: [...storyUsage.entries()]
      .map(([id, count]) => ({ id, count, experience: experienceById.get(id) }))
      .sort((a, b) => b.count - a.count),
    unavailable: Boolean(prepsResult.error || questionsResult.error || attemptsResult.error || linksResult.error),
  };
}
