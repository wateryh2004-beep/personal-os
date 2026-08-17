import { FilesWorkspace } from "@/components/files/files-workspace";
import { getFilesWorkspace } from "@/features/files/queries";

export const dynamic = "force-dynamic";

export default async function Files({ searchParams }: { searchParams: Promise<{ upload?: string; file?: string }> }) {
  const [data, params] = await Promise.all([getFilesWorkspace(), searchParams]);
  if (!data.configured) return <section className="max-w-xl"><h1 className="text-2xl font-semibold">Files</h1><p className="mt-4 border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">Files 云端存储尚未配置。请检查 Vercel 的 R2_ENDPOINT、AccessKeyID 与 SecretAccessKey；保存后重新部署。</p></section>;
  if (data.unavailable) return <section className="max-w-xl"><h1 className="text-2xl font-semibold">Files</h1><p className="mt-4 border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">Files 数据库尚未升级。请执行本次 Files migration 后刷新页面。</p></section>;
  return <FilesWorkspace folders={data.folders} files={data.files} archivedFiles={data.archivedFiles} initialUpload={params.upload === "1"} initialFileId={params.file} />;
}
