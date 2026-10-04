"use client";

import Link from "next/link";
import { memo, useMemo, useState } from "react";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { prepareStudyContent } from "@/features/interview/study-content";
import type { WorkspaceItem } from "@/features/interview/workspace-library";

export const InterviewStudyView = memo(function InterviewStudyView({ thoughts, answer, isDraft, learning, related, onSelect, answerMeta, versionHref }: {
  thoughts: string;
  answer: string;
  isDraft: boolean;
  learning?: WorkspaceItem["learning"];
  related: WorkspaceItem[];
  onSelect: (questionId: string) => void;
  answerMeta?: WorkspaceItem["answerMeta"];
  versionHref?: string;
}) {
  const thinking = useMemo(() => prepareStudyContent(thoughts), [thoughts]);
  const expression = useMemo(() => prepareStudyContent(answer), [answer]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);
  const thinkingBody = [thinking.reading, learning?.keyMessage, learning?.logic, learning?.pitfalls].filter((body): body is string => Boolean(body?.trim())).join("\n\n");
  const hasThinking = Boolean(thinkingBody.trim());
  const structuredOriginal = thinking.format === "structured-original" || expression.format === "structured-original";

  return (
    <article data-testid="interview-study-view" className="mt-5 min-w-0 max-w-3xl">
      <nav aria-label="题目学习章节" className="mb-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-[var(--separator)] pb-3 text-[12px] text-[var(--accent)]">
        <button type="button" onClick={() => document.getElementById("study-answer")?.scrollIntoView({ block: "start" })} className="inline-flex min-h-8 items-center">参考表达</button>
        {hasThinking ? <button type="button" onClick={() => document.getElementById("study-thinking")?.scrollIntoView({ block: "start" })} className="inline-flex min-h-8 items-center">思路与知识</button> : null}
        <button type="button" onClick={() => document.getElementById("study-recall")?.scrollIntoView({ block: "start" })} className="inline-flex min-h-8 items-center">自测与追问</button>
      </nav>
      <section id="study-answer" className="scroll-mt-6">
        <h2 className="mb-4 text-[14px] font-semibold leading-6 text-[var(--text-primary)]">{isDraft ? "参考答案 · 待确认" : "参考表达"}</h2>
        {expression.reading.trim() ? <StudyMarkdown body={expression.reading} /> : <p className="text-sm leading-6 text-[var(--text-tertiary)]">{expression.format === "structured-original" ? "这份答案是结构化原文，可在下方展开查看。" : "还没有参考表达，可以先阅读思路与知识。"}</p>}
      </section>
      {hasThinking ? <section id="study-thinking" className="mt-8 scroll-mt-6 border-t border-[var(--separator)] pt-6">
        <h2 className="mb-4 text-[14px] font-semibold leading-6 text-[var(--text-primary)]">思路与知识</h2>
        <StudyMarkdown body={thinkingBody} />
      </section> : null}
      <section id="study-recall" className="mt-8 scroll-mt-6 border-t border-[var(--separator)] pt-6">
        <h2 className="text-[14px] font-semibold leading-6 text-[var(--text-primary)]">自测与追问</h2>
        {learning?.nextFocus ? <div className="mt-3"><StudyMarkdown body={learning.nextFocus} /></div> : <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">合上参考表达，试着用自己的话讲清结论、依据，以及条件变化后的判断。</p>}
        {related.length ? <div className="mt-3 space-y-1">{related.map((item) => <button type="button" key={item.preparationId} onClick={() => onSelect(item.questionId)} className="block min-h-11 w-full rounded-[8px] px-2 py-2 text-left text-[13px] leading-6 text-[var(--accent)] hover:bg-[var(--surface-hover)]">{item.shortTitle || item.prompt} →</button>)}</div> : null}
        <p className="mt-3 text-[12px] leading-5 text-[var(--text-tertiary)]">阅读不会标记掌握。练习记录以实际表现为准。</p>
      </section>
      <footer className="mt-8 border-t border-[var(--separator)] text-[12px] leading-6 text-[var(--text-tertiary)]">
        <details onToggle={(event) => setSourcesOpen(event.currentTarget.open)}>
          <summary className="min-h-11 cursor-pointer py-3 font-medium">来源、使用边界与版本</summary>
          {sourcesOpen ? <div data-testid="study-provenance" className="pb-4">
            <p className="mb-3">来源标签用于追溯，不代表内容或个人经历已经核实。参考表达需结合实际情况使用。</p>
            {answerMeta ? <p className="mb-3">{answerMeta.status === "current" ? "当前选用版本" : "参考草稿"} · V{answerMeta.version_number} · {answerMeta.source === "ai_draft" ? "AI 起草" : answerMeta.source === "ai_edited" ? "AI 起草后编辑" : answerMeta.source === "imported" ? "导入" : "人工编辑"}</p> : null}
            {expression.references ? <StudyMarkdown body={expression.references} /> : null}
            {thinking.references ? <StudyMarkdown body={thinking.references} /> : null}
            {versionHref ? <Link href={versionHref} prefetch={false} className="inline-flex min-h-11 items-center text-[var(--accent)]">查看答案版本 →</Link> : null}
          </div> : null}
        </details>
        <details onToggle={(event) => setOriginalOpen(event.currentTarget.open)} className="border-t border-[var(--separator)]">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">{structuredOriginal ? "查看原始内容 · 结构化格式暂未识别" : "查看原始内容"}</summary>
          {originalOpen ? <div className="space-y-4 pb-4">
            <OriginalText title="参考表达原文" body={answer} />
            <OriginalText title="思路原文" body={thoughts} />
          </div> : null}
        </details>
      </footer>
    </article>
  );
});

function OriginalText({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return <div><h3 className="mb-2 font-medium">{title}</h3><pre className="whitespace-pre-wrap break-words rounded-[8px] bg-[var(--surface-control)] p-3 text-[12px] leading-6 [overflow-wrap:anywhere]">{body}</pre></div>;
}

const StudyMarkdown = memo(function StudyMarkdown({ body }: { body: string }) {
  return <EntityMarkdown body={body} className="min-w-0 text-[15px] leading-7 [overflow-wrap:anywhere] [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_p]:leading-7 [&_li]:leading-7 [&_img]:max-w-full" />;
});
