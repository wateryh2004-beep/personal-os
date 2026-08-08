import { requireOwner } from "@/lib/auth/require-owner";

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
  const { supabase } = await requireOwner();
  const [tracks, milestones, directions] = await Promise.all([
    supabase.from("career_tracks").select("id,name,description,status,color,start_date,end_date,position").is("archived_at", null).order("position").order("created_at"),
    supabase.from("career_milestones").select("id,track_id,career_direction_id,title,description,starts_on,target_date,status,importance").is("archived_at", null).order("target_date"),
    supabase.from("career_directions").select("id,name").is("archived_at", null).order("priority", { ascending: false }),
  ]);
  return { tracks: tracks.data ?? [], milestones: milestones.data ?? [], directions: directions.data ?? [], unavailable: Boolean(tracks.error || milestones.error) };
}
export async function getExperiences() { const { supabase } = await requireOwner(); const { data } = await supabase.from("experiences").select("*").is("archived_at", null).order("is_current", { ascending: false }).order("start_date", { ascending: false, nullsFirst: false }); return data ?? []; }
export async function getSkills() { const { supabase } = await requireOwner(); const { data } = await supabase.from("skills").select("*").is("archived_at", null).order("name"); return data ?? []; }
export async function getCertifications() { const { supabase } = await requireOwner(); const { data } = await supabase.from("certifications").select("id,name,issuer,exam_date,issue_date,expiry_date,status,score,document_id,created_at").is("archived_at", null).order("created_at", { ascending: false }); return data ?? []; }
export async function getExperience(id: string) {
  const { supabase } = await requireOwner();
  const { data: experience } = await supabase.from("experiences").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (!experience) return null;
  const [facts, outputs, bullets, links, audit, directions] = await Promise.all([
    supabase.from("experience_facts").select("*").eq("experience_id", id).is("archived_at", null).order("position"),
    supabase.from("experience_outputs").select("*").eq("experience_id", id).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("experience_bullets").select("*").eq("experience_id", id).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("entity_links").select("*").or(`and(source_type.eq.experience,source_id.eq.${id}),and(target_type.eq.experience,target_id.eq.${id})`).is("archived_at", null),
    supabase.from("audit_logs").select("*").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("career_directions").select("id,name").is("archived_at", null).order("priority", { ascending: false }),
  ]);
  const factIds = (facts.data ?? []).map((fact) => fact.id); const documentIds = (links.data ?? []).filter((link) => link.target_type === "document").map((link) => link.target_id);
  const [versions, documents] = await Promise.all([factIds.length ? supabase.from("experience_fact_versions").select("*").in("fact_id", factIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }), documentIds.length ? supabase.from("documents").select("*").in("id", documentIds).is("archived_at", null).order("uploaded_at", { ascending: false }) : Promise.resolve({ data: [] })]);
  return { experience, facts: facts.data ?? [], versions: versions.data ?? [], outputs: outputs.data ?? [], bullets: bullets.data ?? [], documents: documents.data ?? [], links: links.data ?? [], audit: audit.data ?? [], directions: directions.data ?? [] };
}
