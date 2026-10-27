import { SourceLink as Link } from "@/components/workflow-continuity/provider";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/require-owner";
import { CareerMaterialChecklist } from "@/components/career/material-checklist";
export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params,
    { supabase, userId } = await requireOwner();
  const [opportunity, checks, documents, resumes, requirements, preparations] =
    await Promise.all([
      supabase
        .from("career_opportunities")
        .select(
          "id,organization,role_title,recruitment_cycle,jd_markdown,source_url,captured_at",
        )
        .eq("id", opportunityId)
        .eq("user_id", userId)
        .is("archived_at", null)
        .maybeSingle(),
      supabase
        .from("career_material_checks")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("created_at")
        .limit(201),
      supabase
        .from("documents")
        .select("id,title,mutation_revision,storage_state")
        .eq("user_id", userId)
        .is("vault_group_id", null)
        .is("archived_at", null)
        .eq("storage_state", "available")
        .order("uploaded_at", { ascending: false })
        .limit(200),
      supabase
        .from("resume_versions")
        .select("id,title,status,updated_at")
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("opportunity_requirements")
        .select("id,requirement_text")
        .eq("opportunity_id", opportunityId)
        .eq("user_id", userId)
        .is("archived_at", null)
        .limit(100),
      supabase
        .from("interview_contexts")
        .select("id,title,status")
        .eq("opportunity_id", opportunityId)
        .eq("user_id", userId)
        .is("archived_at", null)
        .limit(20),
    ]);
  if (
    [opportunity, checks, documents, resumes, requirements, preparations].some(
      (result) => result.error,
    )
  )
    return <p role="alert">准备清单暂时无法完整读取，请稍后重试。</p>;
  if (!opportunity.data) notFound();
  const o = opportunity.data;
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        className="ui-link inline-flex min-h-11 items-center"
        href={`/career/opportunities#opportunity-${o.id}`}
      >
        返回招聘机会
      </Link>
      <h1 className="page-title">{o.organization} · 材料准备</h1>
      <p>
        {o.role_title} · {o.recruitment_cycle ?? "届次未记录"}
      </p>
      <section className="mt-5 space-y-2">
        <h2 className="font-medium">可追溯的准备依据</h2>
        <p>
          JD：{o.jd_markdown.trim() ? "已记录" : "缺失"} · 来源记录于{" "}
          {o.captured_at.slice(0, 10)}（不等同最新招聘状态）
        </p>
        {o.source_url ? (
          <a
            className="ui-link"
            href={o.source_url}
            target="_blank"
            rel="noreferrer"
          >
            核对岗位来源
          </a>
        ) : null}
        <details>
          <summary className="ui-link min-h-11 cursor-pointer py-2">
            查看原始JD与要求（{requirements.data?.length ?? 0}条，最多100）
          </summary>
          <p className="whitespace-pre-wrap text-sm leading-7">
            {o.jd_markdown || "未记录"}
          </p>
          <ul>
            {requirements.data?.map((item) => (
              <li key={item.id}>{item.requirement_text}</li>
            ))}
          </ul>
        </details>
        <p>
          面试准备情境：{preparations.data?.length ?? 0}
          个（最多20，记录存在不代表已准备）
        </p>
        {preparations.data?.map((item) => (
          <Link
            className="ui-link mr-3 inline-flex min-h-11 items-center"
            key={item.id}
            href={`/career/interview?context=${item.id}`}
          >
            {item.title}
          </Link>
        ))}
      </section>
      <CareerMaterialChecklist
        opportunityId={o.id}
        checks={checks.data?.slice(0, 200) ?? []}
        documents={documents.data ?? []}
        resumes={resumes.data ?? []}
      />
      {(checks.data?.length ?? 0) > 200 ? <p>仅显示前200项核对记录。</p> : null}
    </div>
  );
}
