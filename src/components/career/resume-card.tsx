"use client";

import { useState } from "react";
import Link from "next/link";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { archiveResumeVersion, finalizeResumeVersion, setResumeVersionBullets, updateResumeVersion } from "@/features/career/actions";

type Direction = { id: string; name: string };
type DocumentOption = { id: string; title: string; original_filename: string | null };
type Bullet = { id: string; content: string; experiences: { organization: string; role: string } | { organization: string; role: string }[] | null };

type ResumeCardProps = {
  resume: {
    id: string;
    title: string;
    version_label: string | null;
    content_markdown: string;
    status: string;
    document_id: string | null;
    target_direction_id: string | null;
    updated_at: string;
  };
  directions: Direction[];
  documents: DocumentOption[];
  linkedDocument?: DocumentOption;
  bullets: Bullet[];
  selectedBulletIds: Set<string>;
  usage: number;
};

export function ResumeCard({ resume, directions, documents, linkedDocument, bullets, selectedBulletIds, usage }: ResumeCardProps) {
  const [title, setTitle] = useState(resume.title);
  const [versionLabel, setVersionLabel] = useState(resume.version_label ?? "");
  const [content, setContent] = useState(resume.content_markdown);
  const [targetDirectionId, setTargetDirectionId] = useState(resume.target_direction_id ?? "");
  const [documentId, setDocumentId] = useState(resume.document_id ?? "");
  const isDraft = resume.status === "draft";

  return (
    <article className="border-t pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">{resume.title}</h2>
          <p className="mt-1 text-xs text-zinc-500">{resume.version_label || "未命名版本"} · 更新于 {new Date(resume.updated_at).toLocaleString("zh-CN")} · {usage} 次申请引用</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs">{isDraft ? "草稿" : "已定稿"}</span>
      </div>

      {linkedDocument ? (
        <p className="mt-3 text-xs text-zinc-500">关联文件：<Link href={`/files?file=${linkedDocument.id}`} className="text-[#365F78] hover:underline">{linkedDocument.original_filename || linkedDocument.title}</Link></p>
      ) : null}

      {resume.content_markdown ? (
        <div className="mt-4 max-h-64 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50/60 p-4">
          <EntityMarkdown body={resume.content_markdown} />
        </div>
      ) : null}

      {isDraft ? (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-[#365F78]">编辑简历 · 正文支持 @ 引用</summary>
          <form action={updateResumeVersion} className="mt-4 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="resume_id" value={resume.id} />
            <label className="grid gap-1 text-sm"><span>名称 *</span><input name="title" required value={title} onChange={(event) => setTitle(event.target.value)} className="border bg-white px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>版本标签</span><input name="version_label" value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} className="border bg-white px-3 py-2" /></label>
            <label className="grid gap-1 text-sm"><span>目标方向</span><select name="target_direction_id" value={targetDirectionId} onChange={(event) => setTargetDirectionId(event.target.value)} className="border bg-white px-3 py-2"><option value="">通用</option>{directions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm"><span>关联 Files 文档（正式 PDF 等）</span><select name="document_id" value={documentId} onChange={(event) => setDocumentId(event.target.value)} className="border bg-white px-3 py-2"><option value="">不关联</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.original_filename || item.title}</option>)}</select></label>
            <label className="grid gap-1 text-sm md:col-span-2"><span>正文（Markdown，输入 @ 引用笔记 / 文件 / 任务 / 日程）</span><MentionTextarea name="content_markdown" value={content} onChange={setContent} rows={10} className="min-h-40 border bg-white px-3 py-2" placeholder="用 @ 插入可点击引用，例如 @华夏REITs 行动手册" /></label>
            <button className="w-fit bg-[#365F78] px-3 py-2 text-sm text-white">保存修改</button>
          </form>
        </details>
      ) : null}

      <details className="mt-5">
        <summary className="cursor-pointer text-sm text-[#365F78]">编排已批准表达 · {selectedBulletIds.size}</summary>
        <form action={setResumeVersionBullets} className="mt-4 space-y-3">
          <input type="hidden" name="resume_id" value={resume.id} />
          {bullets.map((bullet) => {
            const experience = Array.isArray(bullet.experiences) ? bullet.experiences[0] : bullet.experiences;
            return (
              <label key={bullet.id} className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="bullet_id" value={bullet.id} defaultChecked={selectedBulletIds.has(bullet.id)} className="mt-1" />
                <span><span className="text-xs text-zinc-400">{experience?.organization || "经历"} · </span>{bullet.content}</span>
              </label>
            );
          })}
          {!bullets.length ? <p className="text-sm text-zinc-500">没有已批准表达。先从经历事实中创建并批准表达，AI 草稿不能直接进入最终简历。</p> : <button disabled={!isDraft} className="border px-3 py-2 text-sm disabled:opacity-40">保存编排</button>}
        </form>
      </details>

      {isDraft ? (
        <div className="mt-5 flex items-center gap-5 border-t pt-4">
          <form action={finalizeResumeVersion}><input type="hidden" name="resume_id" value={resume.id} /><button className="text-sm font-medium text-[#365F78]">定稿此版本</button></form>
          <p className="text-xs text-zinc-400">定稿后请新建版本继续修改，保证历史投递可追溯。</p>
        </div>
      ) : null}

      {isDraft ? (
        <form action={archiveResumeVersion} className="mt-4">
          <input type="hidden" name="resume_id" value={resume.id} />
          <button className="text-sm text-zinc-500 hover:text-zinc-900">归档此草稿</button>
        </form>
      ) : null}
    </article>
  );
}
