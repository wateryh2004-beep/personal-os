import { requireOwner } from "@/lib/auth/require-owner";
import { evidenceTypeLabels, type EvidenceType } from "./constants";
import { buildMonthlyIssueTrend, countTags, rankSmartPracticeQueue, readinessChecklist } from "./utils";
import type { WorkspaceAnswer } from "./workspace-answers";

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


async function getWorkspaceAnswers(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"]) {
  const answers: WorkspaceAnswer[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase.from("interview_answer_versions")
      .select("id,preparation_id,answer_mode,target_seconds,language,body_markdown,version_number,status,source,confirmed_at,updated_at")
      .in("status", ["current", "draft"])
      .eq("answer_mode", "spoken")
      .is("archived_at", null)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    answers.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < pageSize) return { data: answers, error: null };
  }
}

// Page relations as well as answers: Supabase's default row cap must not silently
// truncate a growing bank before client-side search and filtering.
async function getWorkspacePreparations(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"]) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from("interview_question_preparations")
      .select("id,question_id,context_id,prompt_override,working_thoughts_markdown,key_message,answer_logic_markdown,risk_markdown,next_focus,target_language,position,updated_at,interview_questions!inner(id,canonical_prompt,short_title,question_type_id,question_style,subcategory,parent_question_id,follow_up_kind,archived_at)")
      .is("archived_at", null).is("interview_questions.archived_at", null)
      .order("position").order("updated_at", { ascending: false }).order("id")
      .range(offset, offset + 499);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return { data: rows, error: null };
  }
}

async function getWorkspaceCompetencyLinks(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"]) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from("interview_question_competencies")
      .select("question_id,competency_id,relevance,is_primary")
      .order("question_id").order("competency_id").range(offset, offset + 499);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return { data: rows, error: null };
  }
}

export async function getInterviewWorkspaceData() {
  const { supabase } = await requireOwner();

  const [contextsResult, preparationsResult, answersResult, typesResult, competencyLinksResult, competenciesResult] = await Promise.all([
    supabase
      .from("interview_contexts")
      .select("id,title,organization_snapshot,role_title_snapshot,status,priority")
      .eq("status", "active")
      .neq("context_type", "general")
      .is("archived_at", null)
      .order("priority", { ascending: false })
      .order("title"),
    getWorkspacePreparations(supabase),
    getWorkspaceAnswers(supabase),
    supabase
      .from("interview_question_types")
      .select("id,key,label,position")
      .is("archived_at", null)
      .order("position"),
    getWorkspaceCompetencyLinks(supabase),
    supabase
      .from("interview_competencies")
      .select("id,key,label,position")
      .is("archived_at", null)
      .order("position"),
  ]);

  return {
    contexts: contextsResult.data ?? [],
    preparations: preparationsResult.data ?? [],
    answers: answersResult.data ?? [],
    questionTypes: typesResult.data ?? [],
    competencyLinks: competencyLinksResult.data ?? [],
    competencies: competenciesResult.data ?? [],
    unavailable: Boolean(
      contextsResult.error
      || preparationsResult.error
      || answersResult.error
      || typesResult.error
      || competencyLinksResult.error
      || competenciesResult.error
    ),
  };
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
  const { data: question } = await supabase.from("interview_questions")
    .select("*,interview_question_types(id,key,label)")
    .eq("id", questionId)
    .is("archived_at", null)
    .maybeSingle();
  if (!question) return null;

  const [contextsResult, preparationsResult, childrenResult, archetypeResult, variantsResult, archetypeStoryLinksResult, storiesResult] = await Promise.all([
    supabase.from("interview_contexts").select("*").is("archived_at", null).order("priority", { ascending: false }).order("title"),
    supabase.from("interview_question_preparations").select("*").eq("question_id", questionId).is("archived_at", null).order("created_at"),
    supabase.from("interview_questions").select("id,canonical_prompt,short_title,follow_up_kind,difficulty,question_style,variant_kind").eq("parent_question_id", questionId).is("archived_at", null).order("created_at"),
    supabase.from("interview_question_archetypes").select("*").eq("id", (question as any).archetype_id).is("archived_at", null).maybeSingle(),
    supabase.from("interview_questions")
      .select("id,canonical_prompt,short_title,question_style,variant_kind,parent_question_id,follow_up_kind,difficulty")
      .eq("archetype_id", (question as any).archetype_id)
      .is("archived_at", null)
      .order("created_at"),
    supabase.from("interview_archetype_stories")
      .select("story_id,evidence_role,fit_note")
      .eq("archetype_id", (question as any).archetype_id)
      .is("archived_at", null),
    supabase.from("interview_stories")
      .select("id,title,one_line,status,experience_id")
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
  ]);

  const contexts = contextsResult.data ?? [];
  const preparations = preparationsResult.data ?? [];
  const selectedPreparation = contextId
    ? preparations.find((prep: any) => prep.context_id === contextId) ?? null
    : preparations.find((prep: any) => prep.context_id === null) ?? preparations[0] ?? null;

  const storyById = new Map((storiesResult.data ?? []).map((story: any) => [story.id, story]));
  const archetypeStories = (archetypeStoryLinksResult.data ?? [])
    .map((link: any) => ({ ...link, story: storyById.get(link.story_id) }))
    .filter((item: any) => item.story)
    .sort((a: any, b: any) => {
      const roleRank: Record<string, number> = { primary: 0, supporting: 1, counter: 2 };
      return (roleRank[a.evidence_role] ?? 9) - (roleRank[b.evidence_role] ?? 9);
    });
  const variants = (variantsResult.data ?? []).filter((item: any) => item.id !== questionId);

  if (!selectedPreparation) {
    return {
      question,
      archetype: archetypeResult.data ?? null,
      variants,
      archetypeStories,
      storyCatalog: storiesResult.data ?? [],
      contexts,
      preparations,
      selectedPreparation: null,
      notes: [],
      answers: [],
      currentAnswers: [],
      attempts: [],
      childQuestions: childrenResult.data ?? [],
      evidenceLinks: [],
      evidenceCatalog: [],
      normalizedCompetencies: [],
      readiness: readinessChecklist({ currentAnswerCount: 0, attemptCount: 0, evidenceCount: 0 }),
    };
  }

  const [notesResult, answersResult, attemptsResult, linksResult, evidenceSemanticsResult, questionCompetenciesResult, competenciesResult, evidenceCatalog] = await Promise.all([
    supabase.from("interview_question_notes").select("*").eq("preparation_id", selectedPreparation.id).is("archived_at", null).order("pinned", { ascending: false }).order("occurred_at", { ascending: false }),
    supabase.from("interview_answer_versions").select("*").eq("preparation_id", selectedPreparation.id).is("archived_at", null).order("answer_mode").order("language").order("target_seconds", { ascending: true, nullsFirst: true }).order("version_number", { ascending: false }),
    supabase.from("interview_practice_attempts").select("*").eq("preparation_id", selectedPreparation.id).is("archived_at", null).order("practiced_at", { ascending: false }).limit(30),
    supabase.from("entity_links").select("*").eq("source_type", "interview_preparation").eq("source_id", selectedPreparation.id).is("archived_at", null).order("created_at"),
    supabase.from("interview_evidence_links").select("entity_link_id,evidence_role,note").eq("preparation_id", selectedPreparation.id).is("archived_at", null),
    supabase.from("interview_question_competencies").select("competency_id,relevance,is_primary").eq("question_id", questionId),
    supabase.from("interview_competencies").select("id,key,label,position").is("archived_at", null),
    getEvidenceCatalog(supabase),
  ]);

  const evidenceByKey = new Map(evidenceCatalog.map((item) => [`${item.type}:${item.id}`, item]));
  const evidenceSemantics = new Map((evidenceSemanticsResult.data ?? []).map((item: any) => [item.entity_link_id, item]));
  const evidenceLinks = (linksResult.data ?? []).map((link: any) => ({
    ...link,
    evidenceRole: (evidenceSemantics.get(link.id) as any)?.evidence_role ?? null,
    evidenceNote: (evidenceSemantics.get(link.id) as any)?.note ?? "",
    evidence: evidenceByKey.get(`${link.target_type}:${link.target_id}`) ?? {
      type: link.target_type,
      id: link.target_id,
      label: `${evidenceTypeLabels[link.target_type as EvidenceType] ?? link.target_type} · 已归档/不可见`,
    },
  }));
  const competencyById = new Map((competenciesResult.data ?? []).map((item: any) => [item.id, item]));
  const normalizedCompetencies = (questionCompetenciesResult.data ?? [])
    .map((link: any) => ({ ...link, competency: competencyById.get(link.competency_id) }))
    .filter((item: any) => item.competency)
    .sort((a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || b.relevance - a.relevance || a.competency.position - b.competency.position);
  const answers = answersResult.data ?? [];
  const attempts = attemptsResult.data ?? [];
  const currentAnswers = answers.filter((answer: any) => answer.status === "current");
  const readiness = readinessChecklist({
    keyMessage: selectedPreparation.key_message,
    answerLogic: selectedPreparation.answer_logic_markdown,
    currentAnswerCount: currentAnswers.length,
    attemptCount: attempts.length,
    evidenceCount: evidenceLinks.length + archetypeStories.length,
  });

  return {
    question,
    archetype: archetypeResult.data ?? null,
    variants,
    archetypeStories,
    storyCatalog: storiesResult.data ?? [],
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
    normalizedCompetencies,
    readiness,
  };
}

export async function getInterviewStories() {
  const { supabase } = await requireOwner();
  const [storiesResult, experiencesResult, competencyLinksResult, competenciesResult, archetypeLinksResult] = await Promise.all([
    supabase.from("interview_stories").select("*").is("archived_at", null).order("status").order("updated_at", { ascending: false }),
    supabase.from("experiences").select("id,organization,role").is("archived_at", null),
    supabase.from("interview_story_competencies").select("story_id,competency_id,relevance,is_primary"),
    supabase.from("interview_competencies").select("id,key,label").is("archived_at", null),
    supabase.from("interview_archetype_stories").select("story_id,archetype_id,evidence_role").is("archived_at", null),
  ]);
  const experienceById = new Map((experiencesResult.data ?? []).map((item: any) => [item.id, item]));
  const competencyById = new Map((competenciesResult.data ?? []).map((item: any) => [item.id, item]));
  const competenciesByStory = new Map<string, any[]>();
  for (const link of competencyLinksResult.data ?? []) {
    const row = link as any;
    const competency = competencyById.get(row.competency_id);
    if (!competency) continue;
    const list = competenciesByStory.get(row.story_id) ?? [];
    list.push({ ...competency, relevance: row.relevance, isPrimary: row.is_primary });
    competenciesByStory.set(row.story_id, list);
  }
  const archetypeCountByStory = new Map<string, number>();
  for (const link of archetypeLinksResult.data ?? []) {
    const row = link as any;
    archetypeCountByStory.set(row.story_id, (archetypeCountByStory.get(row.story_id) ?? 0) + 1);
  }
  const stories = (storiesResult.data ?? []).map((story: any) => ({
    ...story,
    experience: experienceById.get(story.experience_id) ?? null,
    competencies: (competenciesByStory.get(story.id) ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.relevance - a.relevance),
    archetypeCount: archetypeCountByStory.get(story.id) ?? 0,
  }));
  return {
    stories,
    experiences: experiencesResult.data ?? [],
    unavailable: Boolean(storiesResult.error || experiencesResult.error || competencyLinksResult.error || competenciesResult.error || archetypeLinksResult.error),
  };
}

export async function getInterviewStoryDetail(storyId: string) {
  const { supabase } = await requireOwner();
  const { data: story } = await supabase.from("interview_stories").select("*").eq("id", storyId).is("archived_at", null).maybeSingle();
  if (!story) return null;
  const [experiencesResult, competencyLinksResult, competenciesResult, archetypeLinksResult, archetypesResult] = await Promise.all([
    supabase.from("experiences").select("id,organization,role").is("archived_at", null).order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("interview_story_competencies").select("competency_id,relevance,is_primary").eq("story_id", storyId),
    supabase.from("interview_competencies").select("id,key,label").is("archived_at", null),
    supabase.from("interview_archetype_stories").select("archetype_id,evidence_role,fit_note").eq("story_id", storyId).is("archived_at", null),
    supabase.from("interview_question_archetypes").select("id,title,status").is("archived_at", null),
  ]);
  const competencyById = new Map((competenciesResult.data ?? []).map((item: any) => [item.id, item]));
  const archetypeById = new Map((archetypesResult.data ?? []).map((item: any) => [item.id, item]));
  return {
    story,
    experiences: experiencesResult.data ?? [],
    competencies: (competencyLinksResult.data ?? []).map((link: any) => ({ ...link, competency: competencyById.get(link.competency_id) })).filter((item: any) => item.competency),
    archetypes: (archetypeLinksResult.data ?? []).map((link: any) => ({ ...link, archetype: archetypeById.get(link.archetype_id) })).filter((item: any) => item.archetype),
  };
}

export async function getPracticeQueue(contextId?: string | null) {
  const { supabase } = await requireOwner();
  let prepQuery = supabase.from("interview_question_preparations")
    .select("*,interview_questions!inner(id,canonical_prompt,short_title,archetype_id,variant_kind,question_style,difficulty),interview_contexts(id,title,organization_snapshot,role_title_snapshot,priority,next_interview_at)")
    .is("archived_at", null)
    .is("interview_questions.archived_at", null)
    .neq("status", "paused");
  if (contextId === "general") prepQuery = prepQuery.is("context_id", null);
  else if (contextId) prepQuery = prepQuery.eq("context_id", contextId);

  const [prepsResult, contextsResult, attemptsResult, archetypeStoriesResult, storiesResult, questionCompetenciesResult, storyCompetenciesResult] = await Promise.all([
    prepQuery,
    supabase.from("interview_contexts").select("id,title,status,organization_snapshot,role_title_snapshot,priority,next_interview_at").is("archived_at", null).order("priority", { ascending: false }).order("title"),
    supabase.from("interview_practice_attempts").select("id,preparation_id,practiced_at").is("archived_at", null).not("preparation_id", "is", null),
    supabase.from("interview_archetype_stories").select("archetype_id,story_id,evidence_role").is("archived_at", null),
    supabase.from("interview_stories").select("id,status").is("archived_at", null),
    supabase.from("interview_question_competencies").select("question_id,competency_id"),
    supabase.from("interview_story_competencies").select("story_id,competency_id"),
  ]);

  const preparations = (prepsResult.data ?? []) as any[];
  const attemptsByPrep = new Map<string, any[]>();
  for (const attempt of attemptsResult.data ?? []) {
    const row = attempt as any;
    if (!row.preparation_id) continue;
    const list = attemptsByPrep.get(row.preparation_id) ?? [];
    list.push(row);
    attemptsByPrep.set(row.preparation_id, list);
  }

  const storyById = new Map((storiesResult.data ?? []).map((story: any) => [story.id, story]));
  const storyIdsByArchetype = new Map<string, string[]>();
  for (const link of archetypeStoriesResult.data ?? []) {
    const row = link as any;
    const list = storyIdsByArchetype.get(row.archetype_id) ?? [];
    list.push(row.story_id);
    storyIdsByArchetype.set(row.archetype_id, list);
  }

  const competencyIdsByQuestion = new Map<string, Set<string>>();
  for (const link of questionCompetenciesResult.data ?? []) {
    const row = link as any;
    const set = competencyIdsByQuestion.get(row.question_id) ?? new Set<string>();
    set.add(row.competency_id);
    competencyIdsByQuestion.set(row.question_id, set);
  }

  const competencyIdsByStory = new Map<string, Set<string>>();
  for (const link of storyCompetenciesResult.data ?? []) {
    const row = link as any;
    const set = competencyIdsByStory.get(row.story_id) ?? new Set<string>();
    set.add(row.competency_id);
    competencyIdsByStory.set(row.story_id, set);
  }

  const variantRank: Record<string, number> = {
    canonical: 0,
    company_specific: 1,
    observed: 2,
    alternate: 3,
    follow_up: 4,
    pressure: 5,
  };
  const representativeByKey = new Map<string, any>();
  for (const prep of preparations) {
    const question = Array.isArray(prep.interview_questions) ? prep.interview_questions[0] : prep.interview_questions;
    if (!question) continue;
    const key = `${prep.context_id ?? "general"}:${question.archetype_id}`;
    const current = representativeByKey.get(key);
    const currentQuestion = current ? (Array.isArray(current.interview_questions) ? current.interview_questions[0] : current.interview_questions) : null;
    if (!current || (variantRank[question.variant_kind] ?? 99) < (variantRank[currentQuestion?.variant_kind] ?? 99)) {
      representativeByKey.set(key, prep);
    }
  }

  const enriched = [...representativeByKey.values()].map((prep: any) => {
    const question = Array.isArray(prep.interview_questions) ? prep.interview_questions[0] : prep.interview_questions;
    const context = Array.isArray(prep.interview_contexts) ? prep.interview_contexts[0] : prep.interview_contexts;
    const storyIds = storyIdsByArchetype.get(question.archetype_id) ?? [];
    const usableStoryIds = storyIds.filter((id) => {
      const status = (storyById.get(id) as any)?.status;
      return status === "usable" || status === "strong";
    });
    const questionCompetencies = competencyIdsByQuestion.get(question.id) ?? new Set<string>();
    const covered = new Set<string>();
    for (const storyId of usableStoryIds) {
      for (const competencyId of competencyIdsByStory.get(storyId) ?? []) {
        if (questionCompetencies.has(competencyId)) covered.add(competencyId);
      }
    }
    const attempts = attemptsByPrep.get(prep.id) ?? [];
    return {
      ...prep,
      variant_kind: question.variant_kind,
      story_count: storyIds.length,
      usable_story_count: usableStoryIds.length,
      competency_count: questionCompetencies.size,
      covered_competency_count: covered.size,
      attempt_count: attempts.length,
      context_priority: context?.priority ?? 0,
      next_interview_at: context?.next_interview_at ?? null,
    };
  });

  return {
    queue: rankSmartPracticeQueue(enriched),
    contexts: contextsResult.data ?? [],
    unavailable: Boolean(
      prepsResult.error
      || contextsResult.error
      || attemptsResult.error
      || archetypeStoriesResult.error
      || storiesResult.error
      || questionCompetenciesResult.error
      || storyCompetenciesResult.error
    ),
  };
}

export async function getPracticeDetail(preparationId: string) {
  const { supabase } = await requireOwner();
  const { data: preparation } = await supabase.from("interview_question_preparations")
    .select("*,interview_questions(*),interview_contexts(id,title,organization_snapshot,role_title_snapshot)")
    .eq("id", preparationId).is("archived_at", null).maybeSingle();
  if (!preparation) return null;
  const question = Array.isArray((preparation as any).interview_questions)
    ? (preparation as any).interview_questions[0]
    : (preparation as any).interview_questions;

  const [answers, attempts, links, archetypeLinks, stories] = await Promise.all([
    supabase.from("interview_answer_versions").select("*").eq("preparation_id", preparationId).in("status", ["current", "draft"]).is("archived_at", null).order("answer_mode").order("target_seconds", { ascending: true, nullsFirst: true }),
    supabase.from("interview_practice_attempts").select("*").eq("preparation_id", preparationId).is("archived_at", null).order("practiced_at", { ascending: false }).limit(8),
    supabase.from("entity_links").select("id").eq("source_type", "interview_preparation").eq("source_id", preparationId).is("archived_at", null),
    supabase.from("interview_archetype_stories").select("story_id,evidence_role,fit_note").eq("archetype_id", question.archetype_id).is("archived_at", null),
    supabase.from("interview_stories").select("id,title,one_line,status,experience_id").is("archived_at", null),
  ]);

  const storyById = new Map((stories.data ?? []).map((story: any) => [story.id, story]));
  const linkedStories = (archetypeLinks.data ?? [])
    .map((link: any) => ({ ...link, story: storyById.get(link.story_id) }))
    .filter((item: any) => item.story)
    .sort((a: any, b: any) => {
      const roleRank: Record<string, number> = { primary: 0, supporting: 1, counter: 2 };
      const statusRank: Record<string, number> = { strong: 0, usable: 1, needs_review: 2, draft: 3 };
      return (roleRank[a.evidence_role] ?? 9) - (roleRank[b.evidence_role] ?? 9)
        || (statusRank[a.story.status] ?? 9) - (statusRank[b.story.status] ?? 9);
    });

  return {
    preparation,
    answers: answers.data ?? [],
    attempts: attempts.data ?? [],
    evidenceCount: (links.data ?? []).length,
    linkedStories,
  };
}

export async function getInterviewSessions() {
  const { supabase } = await requireOwner();
  const [sessions, contexts, attempts, formats] = await Promise.all([
    supabase.from("interview_sessions").select("*,interview_contexts(id,title,organization_snapshot,role_title_snapshot)").is("archived_at", null).order("scheduled_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    supabase.from("interview_contexts").select("id,title,organization_snapshot,role_title_snapshot,status").is("archived_at", null).order("priority", { ascending: false }).order("title"),
    supabase.from("interview_practice_attempts").select("id,session_id").not("session_id", "is", null).is("archived_at", null),
    supabase.from("interview_formats").select("id,key,label,participant_mode,position").is("archived_at", null).order("position"),
  ]);
  const counts = (attempts.data ?? []).reduce<Record<string, number>>((acc, row: any) => {
    if (row.session_id) acc[row.session_id] = (acc[row.session_id] ?? 0) + 1;
    return acc;
  }, {});
  return { sessions: sessions.data ?? [], contexts: contexts.data ?? [], formats: formats.data ?? [], counts, unavailable: Boolean(sessions.error || contexts.error || formats.error) };
}

export async function getInterviewSessionDetail(sessionId: string) {
  const { supabase } = await requireOwner();
  const { data: session } = await supabase.from("interview_sessions").select("*,interview_contexts(id,title,organization_snapshot,role_title_snapshot)").eq("id", sessionId).is("archived_at", null).maybeSingle();
  if (!session) return null;
  const [attempts, preparations] = await Promise.all([
    supabase.from("interview_practice_attempts").select("*").eq("session_id", sessionId).is("archived_at", null).order("sequence_no"),
    supabase.from("interview_question_preparations")
      .select("id,status,importance,target_language,prompt_override,context_id,interview_questions(id,canonical_prompt,short_title,category),interview_contexts(id,title)")
      .is("archived_at", null)
      .or(session.context_id ? `context_id.eq.${session.context_id},context_id.is.null` : "context_id.is.null")
      .order("position"),
  ]);
  return { session, attempts: attempts.data ?? [], preparations: preparations.data ?? [] };
}

export async function getInterviewInsights(contextId?: string | null) {
  const { supabase } = await requireOwner();
  let prepQuery = supabase.from("interview_question_preparations")
    .select("id,question_id,context_id,status,importance,last_practiced_at")
    .is("archived_at", null);
  if (contextId === "general") prepQuery = prepQuery.is("context_id", null);
  else if (contextId) prepQuery = prepQuery.eq("context_id", contextId);

  const [prepsResult, questionsResult, competencyLinksResult, competenciesResult, attemptsResult, contextsResult, archetypeStoriesResult, storiesResult, storyCompetenciesResult] = await Promise.all([
    prepQuery,
    supabase.from("interview_questions").select("id,archetype_id,question_type_id,question_style").is("archived_at", null),
    supabase.from("interview_question_competencies").select("question_id,competency_id,relevance,is_primary"),
    supabase.from("interview_competencies").select("id,key,label").is("archived_at", null),
    supabase.from("interview_practice_attempts").select("id,preparation_id,story_id,issue_tags,strength_tags,practiced_at,duration_seconds").is("archived_at", null).order("practiced_at"),
    supabase.from("interview_contexts").select("id,title,status").is("archived_at", null).order("priority", { ascending: false }),
    supabase.from("interview_archetype_stories").select("archetype_id,story_id,evidence_role").is("archived_at", null),
    supabase.from("interview_stories").select("id,title,status,experience_id").is("archived_at", null),
    supabase.from("interview_story_competencies").select("story_id,competency_id,relevance,is_primary"),
  ]);

  const preparations = prepsResult.data ?? [];
  const prepIds = new Set(preparations.map((prep: any) => prep.id));
  const attempts = (attemptsResult.data ?? []).filter((attempt: any) => !attempt.preparation_id || prepIds.has(attempt.preparation_id));
  const questionById = new Map((questionsResult.data ?? []).map((question: any) => [question.id, question]));
  const competencyById = new Map((competenciesResult.data ?? []).map((item: any) => [item.id, item]));
  const storyById = new Map((storiesResult.data ?? []).map((story: any) => [story.id, story]));

  const competencyIdsByQuestion = new Map<string, Set<string>>();
  for (const link of competencyLinksResult.data ?? []) {
    const row = link as any;
    const set = competencyIdsByQuestion.get(row.question_id) ?? new Set<string>();
    set.add(row.competency_id);
    competencyIdsByQuestion.set(row.question_id, set);
  }

  const relevantArchetypes = new Set<string>();
  for (const prep of preparations as any[]) {
    const question = questionById.get(prep.question_id) as any;
    if (question?.archetype_id) relevantArchetypes.add(question.archetype_id);
  }

  const relevantStoryIds = new Set<string>();
  const plannedStoryUsage = new Map<string, number>();
  for (const link of archetypeStoriesResult.data ?? []) {
    const row = link as any;
    if (!relevantArchetypes.has(row.archetype_id)) continue;
    relevantStoryIds.add(row.story_id);
    plannedStoryUsage.set(row.story_id, (plannedStoryUsage.get(row.story_id) ?? 0) + 1);
  }

  const competencyStoryIds = new Map<string, Set<string>>();
  const strongCompetencyStoryIds = new Map<string, Set<string>>();
  for (const link of storyCompetenciesResult.data ?? []) {
    const row = link as any;
    if (!relevantStoryIds.has(row.story_id)) continue;
    const story = storyById.get(row.story_id) as any;
    if (!story) continue;
    const all = competencyStoryIds.get(row.competency_id) ?? new Set<string>();
    all.add(row.story_id);
    competencyStoryIds.set(row.competency_id, all);
    if (story.status === "strong" || story.status === "usable") {
      const strong = strongCompetencyStoryIds.get(row.competency_id) ?? new Set<string>();
      strong.add(row.story_id);
      strongCompetencyStoryIds.set(row.competency_id, strong);
    }
  }

  const practiceCountByCompetency = new Map<string, number>();
  const lastPracticeByCompetency = new Map<string, string>();
  for (const attempt of attempts as any[]) {
    if (!attempt.preparation_id) continue;
    const prep = preparations.find((item: any) => item.id === attempt.preparation_id) as any;
    if (!prep) continue;
    for (const competencyId of competencyIdsByQuestion.get(prep.question_id) ?? []) {
      practiceCountByCompetency.set(competencyId, (practiceCountByCompetency.get(competencyId) ?? 0) + 1);
      const previous = lastPracticeByCompetency.get(competencyId);
      if (!previous || Date.parse(attempt.practiced_at) > Date.parse(previous)) lastPracticeByCompetency.set(competencyId, attempt.practiced_at);
    }
  }

  const competency = new Map<string, {
    tag: string;
    label: string;
    total: number;
    ready: number;
    storyCount: number;
    strongStoryCount: number;
    practiceCount: number;
    lastPracticedAt: string | null;
  }>();
  for (const prep of preparations as any[]) {
    for (const competencyId of competencyIdsByQuestion.get(prep.question_id) ?? []) {
      const item = competencyById.get(competencyId) as any;
      if (!item) continue;
      const current = competency.get(competencyId) ?? {
        tag: item.key,
        label: item.label,
        total: 0,
        ready: 0,
        storyCount: competencyStoryIds.get(competencyId)?.size ?? 0,
        strongStoryCount: strongCompetencyStoryIds.get(competencyId)?.size ?? 0,
        practiceCount: practiceCountByCompetency.get(competencyId) ?? 0,
        lastPracticedAt: lastPracticeByCompetency.get(competencyId) ?? null,
      };
      current.total += 1;
      if (prep.status === "ready") current.ready += 1;
      competency.set(competencyId, current);
    }
  }

  const competencyCoverage = [...competency.values()]
    .map((item) => ({
      ...item,
      diagnosis: item.strongStoryCount === 0
        ? "缺少可用故事"
        : item.ready < item.total
          ? "题目准备不足"
          : item.practiceCount === 0
            ? "尚未练习"
            : null,
    }))
    .sort((a, b) =>
      Number(a.strongStoryCount > 0) - Number(b.strongStoryCount > 0)
      || a.practiceCount - b.practiceCount
      || (a.ready / Math.max(a.total, 1)) - (b.ready / Math.max(b.total, 1))
      || b.total - a.total
    );

  const actualStoryUsage = new Map<string, number>();
  for (const attempt of attempts as any[]) {
    if (attempt.story_id) actualStoryUsage.set(attempt.story_id, (actualStoryUsage.get(attempt.story_id) ?? 0) + 1);
  }
  const storyUsageSource = actualStoryUsage.size ? actualStoryUsage : plannedStoryUsage;
  const totalStoryUsage = [...storyUsageSource.values()].reduce((sum, value) => sum + value, 0);
  const storyUsage = [...storyUsageSource.entries()]
    .map(([id, count]) => ({
      id,
      count,
      share: totalStoryUsage ? count / totalStoryUsage : 0,
      story: storyById.get(id) ?? null,
      source: actualStoryUsage.size ? "practice" : "plan",
    }))
    .sort((a, b) => b.count - a.count);

  return {
    contexts: contextsResult.data ?? [],
    attempts,
    preparations,
    stories: storiesResult.data ?? [],
    issueCounts: countTags(attempts),
    monthlyTrend: buildMonthlyIssueTrend(attempts as any[]),
    competencyCoverage,
    priorityGaps: competencyCoverage.filter((item) => item.diagnosis).slice(0, 6),
    storyUsage,
    unavailable: Boolean(
      prepsResult.error
      || questionsResult.error
      || competencyLinksResult.error
      || competenciesResult.error
      || attemptsResult.error
      || contextsResult.error
      || archetypeStoriesResult.error
      || storiesResult.error
      || storyCompetenciesResult.error
    ),
  };
}
