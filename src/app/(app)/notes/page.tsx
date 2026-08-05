import Link from "next/link";
import { createFolder, createNote } from "@/features/notes/actions";
import { getNotesWorkspace } from "@/features/notes/queries";
import { PageHeader } from "@/components/shared/page-header";

export default async function Notes() {
  const { notes, folders, state } = await getNotesWorkspace();
  return <>
    <PageHeader title="Notes" description="原始 Markdown 是正文的唯一权威格式。" action={<form action={createNote}><button className="bg-[#365F78] px-3 py-2 text-sm text-white">新建笔记</button></form>} />
    <p className="mb-6 border-l-2 border-[#365F78] pl-3 text-sm leading-6 text-zinc-500">笔记保存在你自己的 Supabase PostgreSQL 数据库（`notes.body_markdown`）中，不会生成或写入 Mac 本地文件。需要普通 `.md` 文件时，可在笔记内下载 Markdown。</p>
    {state === "base" ? <p role="status" className="mb-6 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-800">笔记基础功能正在使用兼容模式：新建、编辑和下载均可用；文件夹、回收站和链接需要应用 Notes Workspace migration 后启用。</p> : null}
    {state === "unavailable" ? <p role="alert" className="mb-6 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">暂时无法读取笔记库。请检查 Supabase 环境变量、登录状态和数据库连接；系统不会把它误显示成空笔记库。</p> : null}
    <div className="grid gap-7 lg:grid-cols-[270px_1fr]">
      <aside className="border-r pr-5">
        {state === "ready" ? <form action={createFolder} className="flex gap-2"><input name="name" required placeholder="新建文件夹" className="min-w-0 border p-2 text-sm" /><input type="hidden" name="parent_id" value="" /><button className="border px-2 text-sm">添加</button></form> : null}
        <h2 className="mt-6 text-xs text-zinc-500">文件夹</h2>
        <div className="mt-2 space-y-1 text-sm">{folders.map((folder) => <p key={folder.id}>{folder.name}</p>)}{!folders.length ? <p className="text-zinc-500">{state === "ready" ? "尚无文件夹" : "数据库升级后可用"}</p> : null}</div>
        <h2 className="mt-6 text-xs text-zinc-500">笔记 · {notes.length}</h2>
        <div className="mt-2 divide-y">{notes.map((note) => <Link className="block py-3 text-sm hover:text-[#365F78]" href={`/notes/${note.id}`} key={note.id}>{note.title || "无标题笔记"}<span className="mt-1 block font-mono text-xs text-zinc-400">{new Date(note.updated_at).toLocaleDateString("zh-CN")}</span></Link>)}</div>
      </aside>
      <section className="grid place-items-center border bg-white p-8 text-center"><div><h2 className="text-lg font-medium">{notes.length ? "选择一篇笔记继续编辑" : state === "unavailable" ? "笔记库暂不可用" : "还没有笔记。"}</h2><p className="mt-2 text-sm text-zinc-500">{notes.length ? "左侧列表显示的就是已保存到数据库的笔记。" : "创建第一篇笔记，开始建立你的个人知识库。"}</p></div></section>
    </div>
  </>;
}
