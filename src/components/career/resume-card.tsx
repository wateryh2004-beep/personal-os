"use client";
import { CareerForm } from "@/components/career/career-form";
import { submitCareerForm } from "@/features/career/form-actions";


import { useState } from "react";
import Link from "next/link";
import { MentionTextarea } from "@/components/links/entity-mention-textarea";
import { EntityMarkdown } from "@/components/links/entity-markdown";


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
    <article id={`resume-${resume.id}`} className="scroll-mt-24 border-t border-[var(--separator)] pt-4.5">
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <h2 className="text-[13.5px] font-medium tracking-[-0.006em] text-[var(--text-primary)]">{resume.title}</h2>
          <p className="mt-0.5 text-[11px] leading-5 text-[var(--text-tertiary)]">{resume.version_label || "未命名版本"} · 更新于 {new Date(resume.updated_at).toLocaleString("zh-CN")} · {usage} 次申请引用</p>
        </div>
        <span className="rounded-full bg-[var(--surface-control)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">{isDraft ? "草稿" : "已定稿"}</span>
      </div>

      {linkedDocument ? (
        <p className="mt-2.5 text-[11px] text-[var(--text-secondary)]">关联文件：<Link href={`/files?file=${linkedDocument.id}`} className="font-medium text-[var(--accent)] hover:underline">{linkedDocument.original_filename || linkedDocument.title}</Link></p>
      ) : null}

      {resume.content_markdown ? (
        <div className="mt-3.5 max-h-64 overflow-y-auto rounded-[10px] border border-[var(--separator)] bg-[color-mix(in_srgb,var(--surface-control)_42%,transparent)] p-3.5">
          <EntityMarkdown body={resume.content_markdown} />
        </div>
      ) : null}

      {isDraft ? (
        <details className="mt-4.5">
          <summary className="pressable inline-flex cursor-pointer list-none rounded-[8px] px-1 py-0.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">编辑简历 · 正文支持 @ 引用</summary>
          <CareerForm action={submitCareerForm.bind(null, "updateResumeVersion")} className="mt-3.5 grid gap-3.5 rounded-[14px] border border-[var(--separator)] bg-[var(--material-regular)] p-4 md:grid-cols-2">
            <input type="hidden" name="resume_id" value={resume.id} />
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]"><span>名称 *</span><input name="title" required value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" /></label>
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]"><span>版本标签</span><input name="version_label" value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} className="h-9 rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" /></label>
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]"><span>目标方向</span><select name="target_direction_id" value={targetDirectionId} onChange={(event) => setTargetDirectionId(event.target.value)} className="h-9 rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"><option value="">通用</option>{directions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]"><span>关联文件（正式 PDF 等）</span><select name="document_id" value={documentId} onChange={(event) => setDocumentId(event.target.value)} className="h-9 rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[13px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]"><option value="">不关联</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.original_filename || item.title}</option>)}</select></label>
            <label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)] md:col-span-2"><span>正文（Markdown，输入 @ 引用笔记 / 文件 / 任务 / 日程）</span><MentionTextarea name="content_markdown" value={content} onChange={setContent} rows={10} className="min-h-40 rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 py-2.5 text-[13px] leading-5 text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]" placeholder="用 @ 插入可点击引用，例如 @华夏REITs 行动手册" /></label>
            <button className="pressable h-9 w-fit rounded-[10px] bg-[var(--accent)] px-3.5 text-[13px] font-medium text-white hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]">保存修改</button>
          </CareerForm>
        </details>
      ) : null}

      <details className="mt-5">
        <summary className="pressable inline-flex cursor-pointer list-none rounded-[8px] px-1 py-0.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">编排已批准表达 · {selectedBulletIds.size}</summary>
        <CareerForm action={submitCareerForm.bind(null, "setResumeVersionBullets")} className="mt-3.5 space-y-2.5">
          <input type="hidden" name="resume_id" value={resume.id} />
          {bullets.map((bullet) => {
            const experience = Array.isArray(bullet.experiences) ? bullet.experiences[0] : bullet.experiences;
            return (
              <label key={bullet.id} className="flex items-start gap-2.5 text-[12.5px] leading-5.5 text-[var(--text-primary)]">
                <input type="checkbox" name="bullet_id" value={bullet.id} defaultChecked={selectedBulletIds.has(bullet.id)} className="mt-[3px]" />
                <span><span className="text-[10.5px] text-[var(--text-tertiary)]">{experience?.organization || "经历"} · </span>{bullet.content}</span>
              </label>
            );
          })}
          {!bullets.length ? <p className="text-[12.5px] leading-5.5 text-[var(--text-secondary)]">没有已批准表达。先从经历事实中创建并批准表达，AI 草稿不能直接进入最终简历。</p> : <button disabled={!isDraft} className="pressable h-9 rounded-[9px] bg-[var(--surface-control)] px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-control-hover)] disabled:opacity-40">保存编排</button>}
        </CareerForm>
      </details>

      {isDraft ? (
        <div className="mt-4.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--separator)] pt-3.5">
          <CareerForm action={submitCareerForm.bind(null, "finalizeResumeVersion")}><input type="hidden" name="resume_id" value={resume.id} /><button className="pressable rounded-[8px] px-1 py-0.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">定稿此版本</button></CareerForm>
          <p className="text-[10.5px] text-[var(--text-tertiary)]">定稿后请新建版本继续修改，保证历史投递可追溯。</p>
        </div>
      ) : null}

      {isDraft ? (
        <CareerForm action={submitCareerForm.bind(null, "archiveResumeVersion")} className="mt-3.5">
          <input type="hidden" name="resume_id" value={resume.id} />
          <button className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--danger)]">归档此草稿</button>
        </CareerForm>
      ) : null}
    </article>
  );
}
