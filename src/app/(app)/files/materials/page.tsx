import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { requireOwner } from "@/lib/auth/require-owner";
import { readAllFilePages } from "@/features/files/read-all-pages";

type LegacyMaterial = { id: string; title: string; document_type: string; uploaded_at: string; confidentiality_level: string };

// Legacy evidence was uploaded to private Supabase Storage, not Files' R2 bucket.
// Preserve its existing metadata view without inventing an unsupported download URL.
export default async function LegacyMaterialsPage() {
  const { supabase } = await requireOwner();
  let documents: LegacyMaterial[] = [];
  let unavailable = false;
  try {
    documents = await readAllFilePages<LegacyMaterial>((after, limit) => {
      let query = supabase.from("documents").select("id,title,document_type,uploaded_at,confidentiality_level")
        .neq("storage_provider", "cloudflare_r2").is("archived_at", null).order("id").limit(limit);
      if (after) query = query.gt("id", after);
      return query;
    });
    documents.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  } catch { unavailable = true; }
  return <>
    <Link href="/files" className="mb-3 inline-flex min-h-11 items-center text-sm text-[var(--text-secondary)]">← 返回文件</Link>
    <PageHeader title="证明材料目录" description="查看经历上传使用的私有存储材料目录。云端文件请在文件工作区查看；这里不会迁移或删除原件。" />
    <Link href="/career/experiences" className="my-3 inline-flex min-h-11 items-center text-sm text-[var(--accent)]">查看关联经历与证据 →</Link>
    {unavailable ? <p role="alert" className="py-5 text-sm text-[var(--danger)]">证明材料暂时无法读取，请稍后重试。</p> : <section className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">{documents.length ? documents.map(document => <article key={document.id} className="flex min-h-11 flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><h2 className="break-words text-sm font-medium">{document.title}</h2><p className="mt-1 text-xs text-[var(--text-tertiary)]">{document.document_type} · {document.confidentiality_level}</p></div><time className="text-xs text-[var(--text-tertiary)]">{document.uploaded_at.slice(0, 10)}</time></article>) : <p className="py-8 text-sm text-[var(--text-secondary)]">没有这类私有存储中的证明材料。请返回文件查看云端文件。</p>}</section>}
  </>;
}
