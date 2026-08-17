import { PageHeader } from "@/components/shared/page-header";
import { CareerNav } from "@/components/career/career-nav";
import { ResumeCard } from "@/components/career/resume-card";
import { createResumeVersion } from "@/features/career/actions";
import { getResumeVersions } from "@/features/career/queries";

export default async function ResumesPage() {
  const data = await getResumeVersions();
  const documentById = new Map(data.documents.map((document) => [document.id, document]));
  return <><PageHeader title="Resume Center" description="简历是职业事实的版本化投影；每一版可编辑、可 @ 引用、可关联 Files 文档，投递记录永远保留当时使用的版本。" /><CareerNav current="/career/resumes" />
    {data.unavailable ? <p className="mb-6 border-l-2 border-amber-600 bg-amber-50 px-3 py-3 text-sm text-amber-800">Resume Version migration 尚未应用。</p> : null}
    <details className="mb-8 border-b pb-6"><summary className="cursor-pointer text-sm font-medium text-[#365F78]">+ 新建简历版本</summary><form action={createResumeVersion} className="mt-5 grid gap-4 md:grid-cols-3"><Field name="title" label="名称 *" required/><Field name="version_label" label="版本标签"/><label className="grid gap-1 text-sm"><span>目标方向</span><select name="target_direction_id" className="border bg-white px-3 py-2"><option value="">通用</option>{data.directions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-sm md:col-span-3"><span>固定内容（Markdown，可选）</span><textarea name="content_markdown" className="min-h-32 border bg-white px-3 py-2"/></label><button className="w-fit bg-[#365F78] px-3 py-2 text-sm text-white">创建草稿</button></form></details>
    <div className="space-y-8">{data.resumes.map((resume) => { const selected = new Set(data.links.filter((link) => link.resume_version_id === resume.id).map((link) => link.bullet_id)); const usage = data.applications.filter((item) => item.resume_version_id === resume.id).length; return <ResumeCard key={resume.id} resume={resume} directions={data.directions} documents={data.documents} linkedDocument={resume.document_id ? documentById.get(resume.document_id) : undefined} bullets={data.bullets} selectedBulletIds={selected} usage={usage} />; })}</div>{!data.resumes.length ? <div className="py-20 text-center"><p className="font-medium">还没有简历版本</p><p className="mt-2 text-sm text-zinc-500">创建草稿，选择已由你批准且有事实依据的表达。</p></div> : null}</>;
}
function Field({ name, label, required = false }: { name: string; label: string; required?: boolean }) { return <label className="grid gap-1 text-sm"><span>{label}</span><input name={name} required={required} className="border bg-white px-3 py-2"/></label>; }
