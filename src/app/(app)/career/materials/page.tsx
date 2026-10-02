import { CareerNav } from "@/components/career/career-nav";
import { PageHeader } from "@/components/shared/page-header";
import { requireOwner } from "@/lib/auth/require-owner";

export default async function CareerMaterialsPage() {
  const { supabase } = await requireOwner();
  const { data: documents } = await supabase.from("documents").select("id,title,document_type,uploaded_at,confidentiality_level").is("archived_at", null).order("uploaded_at", { ascending: false });

  return <><PageHeader title="证明材料" description="集中查看与职业经历关联的证明材料。" /><CareerNav current="/career/materials" /><section className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">{documents?.length ? documents.map((document) => <article className="flex min-h-11 items-center justify-between gap-4 px-2 py-2.5" key={document.id}><div><h2 className="text-[13.5px] font-medium text-[var(--text-primary)]">{document.title}</h2><p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{document.document_type} · {document.confidentiality_level}</p></div><time className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">{new Date(document.uploaded_at).toLocaleDateString("zh-CN")}</time></article>) : <p className="py-10 text-[12.5px] leading-5.5 text-[var(--text-secondary)]">还没有职业材料。可在经历详情上传证明材料；简历与岗位材料将在后续工作区统一展示。</p>}</section></>;
}
