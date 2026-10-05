"use client";

import Link from "next/link";
import { memo, useMemo, useRef, useState } from "react";
import { EntityMarkdown } from "@/components/links/entity-markdown";
import { prepareInterviewAnswer, prepareStudyContent } from "@/features/interview/study-content";
import type { WorkspaceItem } from "@/features/interview/workspace-library";

export const InterviewStudyView = memo(function InterviewStudyView({ thoughts, answer, isDraft, learning, related = [], onSelect, answerMeta, versionHref, showRecall = true }: {
  thoughts: string;
  answer: string;
  isDraft: boolean;
  learning?: WorkspaceItem["learning"];
  related?: WorkspaceItem[];
  onSelect?: (questionId: string) => void;
  showRecall?: boolean;
  answerMeta?: WorkspaceItem["answerMeta"];
  versionHref?: string;
}) {
  const thinking = useMemo(() => prepareStudyContent(thoughts), [thoughts]);
  const expression = useMemo(() => prepareInterviewAnswer(answer), [answer]);
  const explanationRef = useRef<HTMLDetailsElement>(null);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);
  const thinkingBody = [expression.explanation, thinking.reading, learning?.keyMessage, learning?.logic, learning?.pitfalls].filter((body): body is string => Boolean(body?.trim())).join("\n\n");
  const hasThinking = Boolean(thinkingBody.trim());
  const openExplanation = () => {
    if (explanationRef.current) explanationRef.current.open = true;
    setExplanationOpen(true);
    explanationRef.current?.scrollIntoView({ block: "start" });
  };
  const structuredOriginal = thinking.format === "structured-original" || expression.format === "structured-original";

  return (
    <article data-testid="interview-study-view" className="mt-5 min-w-0 max-w-3xl">
      <nav aria-label="题目学习章节" className="mb-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-[var(--separator)] pb-3 text-[12px] text-[var(--accent)]">
        <button type="button" onClick={() => document.getElementById("study-answer")?.scrollIntoView({ block: "start" })} className="inline-flex min-h-8 items-center">标准答案</button>
        {hasThinking ? <button type="button" onClick={openExplanation} aria-controls="study-thinking" aria-expanded={explanationOpen} className="inline-flex min-h-8 items-center">思路拆解讲解</button> : null}
        {showRecall ? <button type="button" onClick={() => document.getElementById("study-recall")?.scrollIntoView({ block: "start" })} className="inline-flex min-h-8 items-center">自测与追问</button> : null}
      </nav>
      <section id="study-answer" className="scroll-mt-[calc(var(--toolbar-height)+1rem)]">
        <h2 className="mb-4 text-[14px] font-semibold leading-6 text-[var(--text-primary)]">标准答案{isDraft ? <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">待核对</span> : null}</h2>
        {expression.answer.trim() ? <StudyMarkdown body={expression.answer} /> : <p className="text-sm leading-6 text-[var(--text-tertiary)]">{expression.format === "structured-original" ? "这份答案是结构化原文，可在下方展开查看。" : expression.separation === "needs-answer" ? "这份旧内容还未整理出完整的标准答案，可先展开下方讲解查看。" : "还没有标准答案。"}{expression.separation === "needs-answer" ? <button type="button" onClick={openExplanation} aria-controls="study-thinking" aria-expanded={explanationOpen} className="mt-2 block min-h-11 text-[var(--accent)]">阅读现有讲解 →</button> : null}</p>}
      </section>
      {hasThinking ? <details ref={explanationRef} onToggle={(event) => setExplanationOpen(event.currentTarget.open)} id="study-thinking" className="mt-8 scroll-mt-[calc(var(--toolbar-height)+1rem)] border-t border-[var(--separator)] pt-6">
        <summary className="min-h-11 cursor-pointer text-[14px] font-semibold leading-6 text-[var(--text-primary)]">思路拆解讲解</summary>
        {explanationOpen ? <div className="space-y-5 pt-3">
        {expression.explanation.trim() ? <StudyMarkdown body={expression.explanation} /> : null}
        {thinking.reading.trim() ? <StudyMarkdown body={thinking.reading} /> : null}
        {learning?.keyMessage ? <div className="mt-5"><h3 className="mb-2 text-[13px] font-semibold">核心判断</h3><StudyMarkdown body={learning.keyMessage} /></div> : null}
        {learning?.logic ? <div className="mt-5"><h3 className="mb-2 text-[13px] font-semibold">推导路径</h3><StudyMarkdown body={learning.logic} /></div> : null}
        {learning?.pitfalls ? <div className="mt-5 border-l-2 border-[var(--separator)] pl-4"><h3 className="mb-2 text-[13px] font-semibold">易错点与边界</h3><StudyMarkdown body={learning.pitfalls} /></div> : null}
        </div> : null}
      </details> : null}
      {showRecall ? <section id="study-recall" className="mt-8 scroll-mt-[calc(var(--toolbar-height)+1rem)] border-t border-[var(--separator)] pt-6">
        <h2 className="text-[14px] font-semibold leading-6 text-[var(--text-primary)]">自测与追问</h2>
        {learning?.nextFocus ? <div className="mt-3"><StudyMarkdown body={learning.nextFocus} /></div> : <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">合上标准答案，试着用自己的话讲清结论、依据，以及条件变化后的判断。</p>}
        {related.length ? <div className="mt-3 space-y-1">{related.map((item) => <button type="button" key={item.preparationId} onClick={() => onSelect?.(item.questionId)} className="block min-h-11 w-full rounded-[8px] px-2 py-2 text-left text-[13px] leading-6 text-[var(--accent)] hover:bg-[var(--surface-hover)]">{item.shortTitle || item.prompt} →</button>)}</div> : null}
        <p className="mt-3 text-[12px] leading-5 text-[var(--text-tertiary)]">阅读不会标记掌握。练习记录以实际表现为准。</p>
      </section> : null}
      <footer className="mt-8 border-t border-[var(--separator)] text-[12px] leading-6 text-[var(--text-tertiary)]">
        <details onToggle={(event) => setSourcesOpen(event.currentTarget.open)}>
          <summary className="min-h-11 cursor-pointer py-3 font-medium">来源、使用边界与版本</summary>
          {sourcesOpen ? <div data-testid="study-provenance" className="pb-4">
            <p className="mb-3">来源标签用于追溯，不代表内容或个人经历已经核实。标准答案仍需核对依据，并结合实际情况使用。</p>
            {answerMeta ? <p className="mb-3">{answerMeta.status === "current" ? "当前选用版本" : "参考草稿"} · V{answerMeta.version_number} · {answerMeta.source === "ai_draft" ? "AI 起草" : answerMeta.source === "ai_edited" ? "AI 起草后编辑" : answerMeta.source === "imported" ? "导入" : "人工编辑"}</p> : null}
            {expression.references ? <StudyMarkdown body={expression.references} /> : null}
            {thinking.references ? <StudyMarkdown body={thinking.references} /> : null}
            {versionHref ? <Link href={versionHref} prefetch={false} className="inline-flex min-h-11 items-center text-[var(--accent)]">查看答案版本 →</Link> : null}
          </div> : null}
        </details>
        <details onToggle={(event) => setOriginalOpen(event.currentTarget.open)} className="border-t border-[var(--separator)]">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">{structuredOriginal ? "查看原始内容 · 结构化格式暂未识别" : "查看原始内容"}</summary>
          {originalOpen ? <div className="space-y-4 pb-4">
            <OriginalText title="答案原文" body={answer} />
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
