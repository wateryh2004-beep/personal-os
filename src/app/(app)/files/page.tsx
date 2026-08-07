import { FilesWorkspace } from "@/components/files/files-workspace";
import { getFilesWorkspace } from "@/features/files/queries";

export const dynamic = "force-dynamic";

export default async function Files() {
  const data = await getFilesWorkspace();
  if (!data.configured) return <section className="max-w-xl"><h1 className="text-2xl font-semibold">Files</h1><p className="mt-4 border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">Files 云端存储尚未配置。请在 Vercel 设置 R2_ENDPOINT、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY 和 R2_BUCKET_NAME 后重新部署。</p></section>;
  if (data.unavailable) return <section className="max-w-xl"><h1 className="text-2xl font-semibold">Files</h1><p className="mt-4 border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">Files 数据库尚未升级。请执行本次 Files migration 后刷新页面。</p></section>;
  return <FilesWorkspace folders={data.folders} files={data.files} />;
}
