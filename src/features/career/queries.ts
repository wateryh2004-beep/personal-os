import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireOwner } from "@/lib/auth/require-owner";
import { getDateKeyInTimeZone } from "@/lib/date-keys";
import { readAllRows } from "@/lib/supabase/read-all-rows";

export async function getCareerOverview() {
  const { supabase, userId } = await requireOwner();
  const [profile, directions, experiences, facts, bullets, certifications, activity, tasks] = await Promise.all([
    supabase.from("career_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("career_directions").select("*").is("archived_at", null).order("priority", { ascending: false }).limit(4),
    supabase.from("experiences").select("*").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("experience_facts").select("id, experience_id, source_document_id").is("archived_at", null),
    supabase.from("experience_bullets").select("id, experience_id, status").is("archived_at", null),
    supabase.from("certifications").select("id, document_id").is("archived_at", null),
    supabase.from("audit_logs").select("id, action, entity_type, entity_id, created_at, after_data").in("entity_type", ["experience", "experience_fact", "experience_output", "experience_bullet", "document", "certification"]).order("created_at", { ascending: false }).limit(8),
    supabase.from("tasks").select("id,title,due_at,status").neq("status", "completed").is("archived_at", null).order("due_at", { ascending: true }).limit(6),
  ]);
  const incomplete = {
    withoutFacts: (experiences.data ?? []).filter((experience) => !(facts.data ?? []).some((fact) => fact.experience_id === experience.id)).length,
    withoutApprovedBullets: (experiences.data ?? []).filter((experience) => !(bullets.data ?? []).some((bullet) => bullet.experience_id === experience.id && bullet.status === "approved")).length,
    factsWithoutEvidence: (facts.data ?? []).filter((fact) => !fact.source_document_id).length,
    certificationsWithoutEvidence: (certifications.data ?? []).filter((item) => !item.document_id).length,
  };
  return { profile: profile.data, directions: directions.data ?? [], experiences: experiences.data ?? [], activity: activity.data ?? [], tasks: tasks.data ?? [], incomplete };
}

export async function getCareerProfile() { const { supabase, userId } = await requireOwner(); const { data } = await supabase.from("career_profiles").select("*").eq("user_id", userId).maybeSingle(); return data; }
export async function getDirections() { const { supabase } = await requireOwner(); const { data } = await supabase.from("career_directions").select("*").is("archived_at", null).order("status").order("priority", { ascending: false }).order("review_date", { ascending: true, nullsFirst: false }); return data ?? []; }
export async function getCareerRoadmap() {
  const { supabase, userId } = await requireOwner();
  const [tracks, milestones, directions, profile] = await Promise.all([
    supabase.from("career_tracks").select("id,name,description,status,color,start_date,end_date,position").is("archived_at", null).order("position").order("created_at"),
    supabase.from("career_milestones").select("id,track_id,career_direction_id,title,description,starts_on,target_date,status,importance").is("archived_at", null).order("target_date"),
    supabase.from("career_directions").select("id,name").is("archived_at", null).order("priority", { ascending: false }),
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);
  return { tracks: tracks.data ?? [], milestones: milestones.data ?? [], directions: directions.data ?? [], timezone: profile.data?.timezone || "Asia/Shanghai", unavailable: Boolean(tracks.error || milestones.error) };
}
export async function getExperiences() {
  const { supabase } = await requireOwner();
  const result = await readAllRows(supabase.from("experiences")
    .select("id,organization,department,role,location,experience_type,is_current,start_date,end_date,status,confidentiality_level")
    .is("archived_at", null).order("is_current", { ascending: false }).order("start_date", { ascending: false, nullsFirst: false }).order("id"));
  return { experiences: result.data ?? [], unavailable: Boolean(result.error) };
}
export async function getSkills() { const { supabase } = await requireOwner(); const { data } = await supabase.from("skills").select("*").is("archived_at", null).order("name"); return data ?? []; }
export async function getCertifications() {
  const { supabase } = await requireOwner();
  const [certifications, documents] = await Promise.all([
    supabase.from("certifications").select("*").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("documents").select("id,title,original_filename").eq("storage_provider", "cloudflare_r2").is("archived_at", null).order("uploaded_at", { ascending: false }).limit(200),
  ]);
  return { certifications: certifications.data ?? [], documents: documents.data ?? [] };
}
export async function getExperience(id: string) {
  const { supabase, userId } = await requireOwner();
  const { data: experience, error } = await supabase.from("experiences").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (error) throw new Error("暂时无法读取经历，请重试。");
  if (!experience) return null;
  const [facts, outputs, bullets, links, audit, directions, profile] = await Promise.all([
    readAllRows(supabase.from("experience_facts").select("*").eq("experience_id", id).is("archived_at", null).order("position").order("id")),
    readAllRows(supabase.from("experience_outputs").select("*").eq("experience_id", id).is("archived_at", null).order("created_at", { ascending: false }).order("id")),
    readAllRows(supabase.from("experience_bullets").select("*").eq("experience_id", id).is("archived_at", null).order("created_at", { ascending: false }).order("id")),
    readAllRows(supabase.from("entity_links").select("*").or(`and(source_type.eq.experience,source_id.eq.${id}),and(target_type.eq.experience,target_id.eq.${id})`).is("archived_at", null).order("id")),
    supabase.from("audit_logs").select("*").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
    readAllRows(supabase.from("career_directions").select("id,name").is("archived_at", null).order("priority", { ascending: false }).order("id")),
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);
  const factIds = (facts.data ?? []).map((fact) => fact.id);
  const documentIds = [...new Set((links.data ?? []).flatMap(link => link.target_type === "document" ? [link.target_id] : link.source_type === "document" ? [link.source_id] : []))];
  const [versions, documents] = await Promise.all([factIds.length ? readAllRows(supabase.from("experience_fact_versions").select("*").in("fact_id", factIds).order("created_at", { ascending: false }).order("id")) : Promise.resolve({ data: [], error: null }), documentIds.length ? readAllRows(supabase.from("documents").select("*").in("id", documentIds).is("archived_at", null).order("uploaded_at", { ascending: false }).order("id")) : Promise.resolve({ data: [], error: null })]);
  return { experience, facts: facts.data ?? [], versions: versions.data ?? [], outputs: outputs.data ?? [], bullets: bullets.data ?? [], documents: documents.data ?? [], links: links.data ?? [], audit: audit.data ?? [], directions: directions.data ?? [], timezone: profile.data?.timezone || "Asia/Shanghai", unavailable: Boolean(facts.error || outputs.error || bullets.error || links.error || audit.error || directions.error || versions.error || documents.error || profile.error) };
}


export async function getCareerHome() {
  const { supabase, userId } = await requireOwner();
  const now = Date.now();
  // Career home intentionally reads decisions, opportunities and applications only.
  // Legacy target snapshots remain in Interview Lab; they are not job openings.
  const roadmapPromise = (async () => {
    const profile = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const timezone = profile.data?.timezone || "Asia/Shanghai";
    const today = getDateKeyInTimeZone(new Date(now), timezone)!;
    const [milestones, pastMilestones] = await Promise.all([
      supabase.from("career_milestones").select("id,title,target_date,status").eq("user_id", userId)
        .is("archived_at", null).in("status", ["planned", "in_progress"])
        .gte("target_date", today).order("target_date").limit(5),
      supabase.from("career_milestones").select("id", { count: "exact", head: true })
        .eq("user_id", userId).is("archived_at", null)
        .in("status", ["planned", "in_progress"]).lt("target_date", today),
    ]);
    return { timezone, milestones, pastMilestones, unavailable: Boolean(profile.error || milestones.error || pastMilestones.error) };
  })();
  const [profile, directions, experiencesCount, skillsCount, resumesCount, opportunities, applications, roadmap] = await Promise.all([
    supabase.from("career_profiles").select("professional_headline,current_stage").eq("user_id", userId).maybeSingle(),
    supabase.from("career_directions").select("id,name,status,current_decision")
      .in("status", ["active", "exploring"]).is("archived_at", null)
      .order("priority", { ascending: false }).limit(3),
    supabase.from("experiences").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("skills").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("resume_versions").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("career_opportunities")
      .select("id,organization,role_title,source_url,recruitment_cycle,status,deadline_at")
      .is("archived_at", null).neq("status", "archived").neq("status", "closed")
      // Apply freshness before limiting; old expired postings cannot hide new deadlines.
      .or(`deadline_at.is.null,deadline_at.gte.${new Date(now).toISOString()}`)
      .order("deadline_at", { ascending: true, nullsFirst: false }).limit(8),
    supabase.from("career_applications").select("id,status,applied_at,opportunity_id")
      .is("archived_at", null).order("updated_at", { ascending: false }),
    roadmapPromise,
  ]);
  return {
    ownerId: userId,
    now,
    timezone: roadmap.timezone,
    profile: profile.data,
    directions: directions.data ?? [],
    experienceCount: experiencesCount.count ?? 0,
    skillCount: skillsCount.count ?? 0,
    resumeCount: resumesCount.count ?? 0,
    opportunities: opportunities.data ?? [],
    applications: applications.data ?? [],
    milestones: roadmap.milestones.data ?? [],
    pastMilestoneCount: roadmap.pastMilestones.count ?? 0,
    unavailable: Boolean(profile.error || directions.error || experiencesCount.error || skillsCount.error
      || resumesCount.error || opportunities.error || applications.error || roadmap.unavailable),
  };
}

/** Interview-only scope: old target snapshots are practice contexts, not recruitment listings. */
export async function getInterviewTargetIndex() {
  const { supabase, userId } = await requireOwner();
  const [contexts, preparations, profile] = await Promise.all([
    readAllRows(supabase.from("interview_contexts")
      .select("id,title,organization_snapshot,role_title_snapshot,status,priority,context_type,next_interview_at")
      .neq("context_type", "general").is("archived_at", null)
      .order("priority", { ascending: false }).order("title").order("id")),
    readAllRows(supabase.from("interview_question_preparations")
      .select("id,context_id,status,next_practice_at").not("context_id", "is", null)
      .is("archived_at", null).order("id")),
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    ownerId: userId,
    targets: contexts.data ?? [],
    preparations: preparations.data ?? [],
    timezone: profile.data?.timezone || "Asia/Shanghai",
    now: Date.now(),
    unavailable: Boolean(contexts.error || preparations.error || profile.error),
  };
}

export async function getCareerPortfolio() {
  const base = await getCareerOverview(); const { supabase } = await requireOwner();
  const [skills, facts, outputs, approvedBullets, opportunities, applications, resumes, decisions, certifications, milestones, interviewTargets, interviewPreparations] = await Promise.all([
    supabase.from("skills").select("id,name,category,proficiency,evidence_markdown").is("archived_at", null).order("category").order("name"),
    supabase.from("experience_facts").select("id,experience_id,verification_status,source_document_id").is("archived_at", null),
    supabase.from("experience_outputs").select("id,experience_id,name,output_type,public_url").is("archived_at", null),
    supabase.from("experience_bullets").select("id,experience_id,status").eq("status", "approved").is("archived_at", null),
    supabase.from("career_opportunities").select("id,organization,role_title,status,deadline_at").is("archived_at", null).neq("status", "archived").order("deadline_at", { ascending: true, nullsFirst: false }),
    supabase.from("career_applications").select("id,status,opportunity_id,updated_at").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("resume_versions").select("id,title,status,updated_at").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("decisions").select("id,title,status,decided_at").eq("status", "active").order("decided_at", { ascending: false }).limit(3),
    supabase.from("certifications").select("id,name,issuer,status,expiry_date").is("archived_at", null).order("created_at", { ascending: false }).limit(6),
    supabase.from("career_milestones").select("id,title,target_date,status,importance").is("archived_at", null).order("target_date").limit(5),
    supabase.from("interview_contexts").select("id,title,context_type,organization_snapshot,role_title_snapshot,status,priority,next_interview_at").is("archived_at", null).neq("context_type", "general").order("priority", { ascending: false }).order("next_interview_at", { ascending: true, nullsFirst: false }),
    supabase.from("interview_question_preparations").select("id,context_id,status,next_practice_at").is("archived_at", null).not("context_id", "is", null),
  ]);
  return { ...base, skills: skills.data ?? [], facts: facts.data ?? [], outputs: outputs.data ?? [], approvedBullets: approvedBullets.data ?? [], opportunities: opportunities.data ?? [], applications: applications.data ?? [], resumes: resumes.data ?? [], decisions: decisions.data ?? [], certifications: certifications.data ?? [], milestones: milestones.data ?? [], interviewTargets: interviewTargets.data ?? [], interviewPreparations: interviewPreparations.data ?? [], career2Unavailable: Boolean(opportunities.error || applications.error || resumes.error) };
}

export async function getCareerCapital() {
  const { supabase } = await requireOwner();
  const [experiences, facts, outputs, bullets, skills, certifications, gaps] = await Promise.all([
    supabase.from("experiences").select("id,organization,role,status,is_current").is("archived_at", null),
    supabase.from("experience_facts").select("id,experience_id,content,verification_status,source_document_id").is("archived_at", null),
    supabase.from("experience_outputs").select("id,experience_id,name,output_type,public_url").is("archived_at", null),
    supabase.from("experience_bullets").select("id,experience_id,content,status").is("archived_at", null),
    supabase.from("skills").select("id,name,category,proficiency,evidence_markdown").is("archived_at", null).order("category").order("name"),
    supabase.from("certifications").select("id,name,issuer,status,document_id").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("gap_analysis_runs").select("id,summary,analysis_type,created_at,career_opportunities(organization,role_title)").is("archived_at", null).order("created_at", { ascending: false }).limit(5),
  ]);
  return { experiences: experiences.data ?? [], facts: facts.data ?? [], outputs: outputs.data ?? [], bullets: bullets.data ?? [], skills: skills.data ?? [], certifications: certifications.data ?? [], gaps: gaps.data ?? [], unavailable: Boolean(gaps.error) };
}

export async function getOpportunities() {
  const { supabase } = await requireOwner(); const now = new Date().toISOString();
  const [opportunities, directions, requirements, gaps, gapItems, resumes] = await Promise.all([
    supabase.from("career_opportunities").select("*").is("archived_at", null).neq("status", "archived").order("deadline_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
    supabase.from("career_directions").select("id,name").is("archived_at", null).order("priority", { ascending: false }),
    supabase.from("opportunity_requirements").select("*").is("archived_at", null).order("importance").order("position"),
    supabase.from("gap_analysis_runs").select("*").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("gap_analysis_items").select("*,opportunity_requirements(requirement_text,requirement_type)").order("created_at"),
    supabase.from("resume_versions").select("id,title,version_label,status").is("archived_at", null).order("updated_at", { ascending: false }),
  ]);
  return { now, opportunities: opportunities.data ?? [], directions: directions.data ?? [], requirements: requirements.data ?? [], gaps: gaps.data ?? [], gapItems: gapItems.data ?? [], resumes: resumes.data ?? [], unavailable: Boolean(opportunities.error || requirements.error || gaps.error || gapItems.error) };
}

export async function getApplications() {
  const { supabase } = await requireOwner();
  const [applications, opportunities, resumes, events] = await Promise.all([
    supabase.from("career_applications").select("*,career_opportunities(organization,role_title,deadline_at),resume_versions(title,version_label,status)").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("career_opportunities").select("id,organization,role_title,status").is("archived_at", null).neq("status", "archived").order("organization"),
    supabase.from("resume_versions").select("id,title,version_label,status").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("application_stage_events").select("*").order("occurred_at", { ascending: false }),
  ]);
  return { applications: applications.data ?? [], opportunities: opportunities.data ?? [], resumes: resumes.data ?? [], events: events.data ?? [], unavailable: Boolean(applications.error || events.error) };
}

export async function getResumeVersions() {
  const { supabase } = await requireOwner();
  const [resumes, directions, bullets, links, applications, documents, materials] = await Promise.all([
    supabase.from("resume_versions").select("*").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("career_directions").select("id,name").is("archived_at", null).order("priority", { ascending: false }),
    supabase.from("experience_bullets").select("id,content,experience_id,status,experiences(organization,role)").eq("status", "approved").is("archived_at", null).order("approved_at", { ascending: false }),
    supabase.from("resume_version_bullets").select("resume_version_id,bullet_id,position").order("position"),
    supabase.from("career_applications").select("id,resume_version_id,status").is("archived_at", null),
    supabase.from("documents").select("id,title,original_filename").eq("storage_provider", "cloudflare_r2").is("archived_at", null).order("uploaded_at", { ascending: false }).limit(200),
    supabase.from("career_material_checks").select("opportunity_id,resume_version_id").is("archived_at",null).not("resume_version_id","is",null).limit(501),
  ]);
  return { materialChecks:materials.data?.slice(0,500)??[],materialsUnavailable:Boolean(materials.error),materialsTruncated:(materials.data?.length??0)>500,resumes: resumes.data ?? [], directions: directions.data ?? [], bullets: bullets.data ?? [], links: links.data ?? [], applications: applications.data ?? [], documents: documents.data ?? [], unavailable: Boolean(resumes.error || directions.error || bullets.error || links.error || applications.error || documents.error) };
}

/** Target reader: only this target's preparations, no answers or whole-bank private notes. */
export async function getCareerTarget(contextId: string) {
  const { supabase: client, userId } = await requireOwner();
  const supabase = client as SupabaseClient<Database>;
  const primary = await supabase.from("interview_contexts").select("*").eq("id", contextId).is("archived_at", null).maybeSingle();
  if (primary.error) throw new Error("暂时无法读取岗位，请重试。");
  if (!primary.data) return null;
  const [preparations, questions, profile] = await Promise.all([
    readAllRows(supabase.from("interview_question_preparations").select("id,question_id,context_id,status,next_practice_at,prompt_override").eq("context_id",contextId).is("archived_at",null).order("position").order("id")),
    readAllRows(supabase.from("interview_questions").select("id,canonical_prompt,parent_question_id").is("archived_at",null).order("updated_at",{ascending:false}).order("id")),
    supabase.from("profiles").select("timezone").eq("user_id",userId).maybeSingle(),
  ]);
  return { target: primary.data, preparations: preparations.data ?? [], questions: questions.data ?? [], timezone: profile.data?.timezone || "Asia/Shanghai", now: Date.now(), unavailable: Boolean(preparations.error || questions.error || profile.error) };
}
