import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { redactCertificationForExport } from "@/features/career/schemas";

export async function GET() {
  try {
    const { supabase, userId } = await requireOwner();
    const [profile, directions, experiences, facts, factVersions, outputs, bullets, bulletFactLinks, skills, experienceSkills, certifications, documents] = await Promise.all([
      supabase.from("career_profiles").select("*").eq("user_id", userId), supabase.from("career_directions").select("*").eq("user_id", userId), supabase.from("experiences").select("*").eq("user_id", userId), supabase.from("experience_facts").select("*").eq("user_id", userId), supabase.from("experience_fact_versions").select("*").eq("user_id", userId), supabase.from("experience_outputs").select("*").eq("user_id", userId), supabase.from("experience_bullets").select("*").eq("user_id", userId), supabase.from("bullet_fact_links").select("*").eq("user_id", userId), supabase.from("skills").select("*").eq("user_id", userId), supabase.from("experience_skills").select("*").eq("user_id", userId), supabase.from("certifications").select("*").eq("user_id", userId), supabase.from("documents").select("id,title,document_type,original_filename,mime_type,file_size,checksum,confidentiality_level,uploaded_at,created_at,archived_at").eq("user_id", userId),
    ]);
    const errors = [profile, directions, experiences, facts, factVersions, outputs, bullets, bulletFactLinks, skills, experienceSkills, certifications, documents].find((result) => result.error)?.error;
    if (errors) throw errors;
    const body = { schema_version: "career-export/v1", exported_at: new Date().toISOString(), profile: profile.data ?? [], directions: directions.data ?? [], experiences: experiences.data ?? [], "experience-facts": facts.data ?? [], "experience-fact-versions": factVersions.data ?? [], "experience-outputs": outputs.data ?? [], "experience-bullets": bullets.data ?? [], "bullet-fact-links": bulletFactLinks.data ?? [], skills: skills.data ?? [], "experience-skills": experienceSkills.data ?? [], certifications: (certifications.data ?? []).map((row) => redactCertificationForExport(row)), "documents-manifest": documents.data ?? [] };
    await supabase.from("audit_logs").insert({ user_id: userId, action: "export", entity_type: "career_export", actor_type: "user", after_data: { schema_version: body.schema_version } });
    return new NextResponse(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=career-export.json", "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "未授权或无法生成导出。" }, { status: 401 }); }
}
