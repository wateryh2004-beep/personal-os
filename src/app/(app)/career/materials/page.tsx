import { CareerNav } from "@/components/career/career-nav";
import { PageHeader } from "@/components/shared/page-header";
import { requireOwner } from "@/lib/auth/require-owner";

export default async function CareerMaterialsPage() {
  const { supabase } = await requireOwner();
  const { data: documents } = await supabase.from("documents").select("id,title,document_type,uploaded_at,confidentiality_level").is("archived_at", null).order("uploaded_at", { ascending: false });

  return <><PageHeader title="材料与知识" description="这里聚合职业材料；实际文件继续由全局 Documents 与私有 Storage 保存。" /><CareerNav current="/career/materials" /><section className="divide-y border-y">{documents?.length ? documents.map((document) => <article className="flex items-center justify-between gap-4 py-3" key={document.id}><div><h2 className="text-sm font-medium">{document.title}</h2><p className="mt-1 text-xs text-zinc-500">{document.document_type} · {document.confidentiality_level}</p></div><time className="font-mono text-xs text-zinc-500">{new Date(document.uploaded_at).toLocaleDateString("zh-CN")}</time></article>) : <p className="py-8 text-sm text-zinc-500">还没有职业材料。可在经历详情上传证明材料；简历与岗位材料将在后续工作区统一展示。</p>}</section></>;
}
