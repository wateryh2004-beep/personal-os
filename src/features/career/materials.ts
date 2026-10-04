import { requireOwner } from "@/lib/auth/require-owner";

export type CareerMaterialAssociation = { documentId: string; label: string; href: string };
type Fact = { id: string; experience_id: string; source_document_id: string | null };
type Certification = { id: string; name: string; document_id: string | null };
export type CareerMaterialResume = { id: string; title: string; version_label: string | null; status: string; content_markdown: string; document_id: string | null; updated_at: string };
type EntityLink = { source_type: string; source_id: string; target_type: string; target_id: string };
export type CareerMaterialDocument = {
  id: string; title: string; original_filename: string; document_type: string; uploaded_at: string;
  confidentiality_level: string; ai_visibility: string; storage_provider: string; storage_state: string;
};

// These names match the entity_links constraints and existing business tables.
const careerEntities: Record<string, { table: string; label: string; href: string }> = {
  career_direction: { table: "career_directions", label: "职业方向", href: "/career/directions" },
  career_track: { table: "career_tracks", label: "路线图", href: "/career/roadmap" },
  career_milestone: { table: "career_milestones", label: "路线事项", href: "/career/roadmap" },
  experience: { table: "experiences", label: "经历", href: "/career/experiences" },
  experience_fact: { table: "experience_facts", label: "经历事实", href: "/career/experiences" },
  experience_output: { table: "experience_outputs", label: "经历成果", href: "/career/experiences" },
  experience_bullet: { table: "experience_bullets", label: "履历表达", href: "/career/experiences" },
  career_opportunity: { table: "career_opportunities", label: "岗位机会", href: "/career/opportunities" },
  career_application: { table: "career_applications", label: "申请记录", href: "/career/applications" },
  resume_version: { table: "resume_versions", label: "简历", href: "/career/resumes" },
  skill: { table: "skills", label: "技能", href: "/career/skills" },
  certification: { table: "certifications", label: "证书", href: "/career/certifications" },
  interview_question: { table: "interview_questions", label: "面试题", href: "/career/interview" },
  interview_context: { table: "interview_contexts", label: "目标岗位", href: "/career/interview" },
  interview_preparation: { table: "interview_question_preparations", label: "面试准备", href: "/career/interview" },
  interview_session: { table: "interview_sessions", label: "面试记录", href: "/career/interview/sessions" },
  interview_attempt: { table: "interview_practice_attempts", label: "练习记录", href: "/career/interview/practice" },
  interview_answer_version: { table: "interview_answer_versions", label: "参考答案", href: "/career/interview" },
  interview_archetype: { table: "interview_question_archetypes", label: "面试母题", href: "/career/interview" },
  interview_story: { table: "interview_stories", label: "面试故事", href: "/career/interview/stories" },
};

export function careerDocumentEndpoint(link: EntityLink) {
  if (link.source_type === "document" && Object.hasOwn(careerEntities, link.target_type)) {
    return { documentId: link.source_id, type: link.target_type, id: link.target_id };
  }
  if (link.target_type === "document" && Object.hasOwn(careerEntities, link.source_type)) {
    return { documentId: link.target_id, type: link.source_type, id: link.source_id };
  }
  return null;
}

/** Only authenticated, live Career records may establish an association. */
export function collectCareerMaterialAssociations(input: {
  facts: Fact[]; certifications: Certification[]; resumes: CareerMaterialResume[];
  links: EntityLink[]; liveEntities: ReadonlySet<string>;
}): CareerMaterialAssociation[] {
  const associations: CareerMaterialAssociation[] = [];
  for (const fact of input.facts) {
    if (fact.source_document_id && input.liveEntities.has(`experience:${fact.experience_id}`)) {
      associations.push({ documentId: fact.source_document_id, label: "经历事实的来源", href: `/career/experiences/${fact.experience_id}` });
    }
  }
  for (const certification of input.certifications) {
    if (certification.document_id) associations.push({ documentId: certification.document_id, label: certification.name, href: "/career/certifications" });
  }
  for (const resume of input.resumes) {
    if (resume.document_id) associations.push({ documentId: resume.document_id, label: resume.title, href: `#resume-${resume.id}` });
  }
  for (const link of input.links) {
    const endpoint = careerDocumentEndpoint(link);
    if (!endpoint || !input.liveEntities.has(`${endpoint.type}:${endpoint.id}`)) continue;
    const entity = careerEntities[endpoint.type];
    const href = endpoint.type === "experience" ? `${entity.href}/${endpoint.id}`
      : endpoint.type === "interview_context" ? `${entity.href}?context=${endpoint.id}`
      : entity.href;
    associations.push({ documentId: endpoint.documentId, label: entity.label, href });
  }
  return associations.filter((item, index) => associations.findIndex((candidate) => candidate.documentId === item.documentId && candidate.href === item.href && candidate.label === item.label) === index);
}

export { careerMaterialReadHref } from "./material-links";

type DatabaseClient = Awaited<ReturnType<typeof requireOwner>>["supabase"];
async function loadOwnedRows<T>(supabase: DatabaseClient, userId: string, table: string, columns: string, ids?: string[], documentLinks = false): Promise<{ rows: T[]; unavailable: boolean }> {
  if (ids && !ids.length) return { rows: [] as T[], unavailable: false };
  if (ids && ids.length > 100) {
    const chunks = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      chunks.push(await loadOwnedRows<T>(supabase, userId, table, columns, ids.slice(offset, offset + 100), documentLinks));
    }
    return { rows: chunks.flatMap((chunk) => chunk.rows), unavailable: chunks.some((chunk) => chunk.unavailable) };
  }
  const rows: T[] = [];
  // Paginate explicitly: the API's default row cap must not silently drop evidence.
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(table).select(columns).eq("user_id", userId).is("archived_at", null).order("id").range(offset, offset + 499);
    if (ids) query = query.in("id", ids);
    if (documentLinks) query = query.or("source_type.eq.document,target_type.eq.document");
    const result = await query;
    if (result.error) return { rows: [] as T[], unavailable: true };
    const page = (result.data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < 500) return { rows, unavailable: false };
  }
}

export async function getCareerMaterials() {
  const { supabase, userId } = await requireOwner();
  const [facts, certifications, resumes, links] = await Promise.all([
    loadOwnedRows<Fact>(supabase, userId, "experience_facts", "id,experience_id,source_document_id"),
    loadOwnedRows<Certification>(supabase, userId, "certifications", "id,name,document_id"),
    loadOwnedRows<CareerMaterialResume>(supabase, userId, "resume_versions", "id,title,version_label,status,content_markdown,document_id,updated_at"),
    loadOwnedRows<EntityLink>(supabase, userId, "entity_links", "id,source_type,source_id,target_type,target_id", undefined, true),
  ]);
  const entityIds = new Map<string, Set<string>>();
  const remember = (type: string, id: string) => { const ids = entityIds.get(type) ?? new Set<string>(); ids.add(id); entityIds.set(type, ids); };
  facts.rows.forEach((fact) => { if (fact.source_document_id) remember("experience", fact.experience_id); });
  links.rows.forEach((link) => { const endpoint = careerDocumentEndpoint(link); if (endpoint) remember(endpoint.type, endpoint.id); });
  const verified = await Promise.all([...entityIds].map(async ([type, ids]) => ({
    type, ...await loadOwnedRows<{ id: string }>(supabase, userId, careerEntities[type].table, "id", [...ids]),
  })));
  const liveEntities = new Set(verified.flatMap(({ type, rows }) => rows.map((row) => `${type}:${row.id}`)));
  const associations = collectCareerMaterialAssociations({ facts: facts.rows, certifications: certifications.rows, resumes: resumes.rows, links: links.rows, liveEntities });
  const documentIds = [...new Set(associations.map((item) => item.documentId))];
  // No broad private-document query: only IDs established by actual Career associations.
  const documents = await loadOwnedRows<CareerMaterialDocument>(supabase, userId, "documents", "id,title,original_filename,document_type,uploaded_at,confidentiality_level,ai_visibility,storage_provider,storage_state", documentIds);
  return {
    resumes: resumes.rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    documents: documents.rows.filter((document) => document.storage_state === "available").sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    associations,
    unavailable: [facts, certifications, resumes, links, documents, ...verified].some((result) => result.unavailable),
  };
}
