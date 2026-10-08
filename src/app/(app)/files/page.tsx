import Link from "next/link";
import { parseFileBrowserState } from "@/features/files/browser-state";
import { FilesWorkspace } from "@/components/files/files-workspace";
import { getFilesWorkspace } from "@/features/files/queries";

export const dynamic = "force-dynamic";

function FilesUnavailable({ children }: { children: React.ReactNode }) {
  return (
    <section className="max-w-xl">
      <h1 className="text-[27px] font-semibold tracking-[-0.042em] text-[var(--text-primary)]">文件</h1>
      <p className="mt-3 rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-[12px] leading-5 text-amber-900">{children}</p>
      <Link href="/files/materials" className="mt-3 inline-flex min-h-11 items-center text-sm text-[var(--accent)]">查看证明材料目录 →</Link>
    </section>
  );
}

export default async function Files({ searchParams }: { searchParams: Promise<{ upload?: string; file?: string; q?: string; folder?: string; type?: string; sort?: string; view?: string; page?: string }> }) {
  const [data, params] = await Promise.all([getFilesWorkspace(), searchParams]);
  if (!data.configured) return <FilesUnavailable>云端存储尚未配置，暂时无法上传文件。</FilesUnavailable>;
  if (data.unavailable) return <FilesUnavailable>文件数据暂时无法读取。</FilesUnavailable>;
  return <FilesWorkspace folders={data.folders} files={data.files} archivedFiles={data.archivedFiles} initialUpload={params.upload === "1"} initialFileId={params.file} initialBrowserState={parseFileBrowserState(params)} />;
}
