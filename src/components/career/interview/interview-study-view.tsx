"use client";

import { EntityMarkdown } from "@/components/links/entity-markdown";
import type { WorkspaceItem } from "@/features/interview/workspace-library";

export function InterviewStudyView({ thoughts, answer, isDraft, learning, related, onSelect }: {
  thoughts: string;
  answer: string;
  isDraft: boolean;
  learning?: WorkspaceItem["learning"];
  related: WorkspaceItem[];
  onSelect: (questionId: string) => void;
}) {
  return (
    <div data-testid="interview-study-view" className="mt-6 min-w-0">
      <nav aria-label="题目学习章节" className="mb-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-[var(--separator)] pb-3 text-[12px] text-[var(--accent)]">
        <button type="button" onClick={() => document.getElementById("study-thinking")?.scrollIntoView({ block: "start" })} className="inline-flex min-h-8 items-center">思路与知识</button>
        <button type="button" onClick={() => document.getElementById("study-answer")?.scrollIntoView({ block: "start" })} className="inline-flex min-h-8 items-center">参考表达</button>
        <button type="button" onClick={() => document.getElementById("study-recall")?.scrollIntoView({ block: "start" })} className="inline-flex min-h-8 items-center">自测与追问</button>
      </nav>
      <section id="study-thinking" className="scroll-mt-6">
        <h2 className="mb-4 text-[13px] font-semibold text-[var(--text-primary)]">思路与知识</h2>
        {thoughts.trim() ? <StudyMarkdown body={thoughts} /> : <p className="text-sm leading-6 text-[var(--text-tertiary)]">还没有学习笔记。进入编辑，记录这道题考什么、如何推导，以及适用边界。</p>}
        {learning?.keyMessage ? <div className="mt-5"><h3 className="mb-2 text-[12px] font-semibold">核心判断</h3><StudyMarkdown body={learning.keyMessage} /></div> : null}
        {learning?.logic ? <div className="mt-5"><h3 className="mb-2 text-[12px] font-semibold">推导路径</h3><StudyMarkdown body={learning.logic} /></div> : null}
        {learning?.pitfalls ? <div className="mt-5 rounded-[10px] bg-[var(--surface-control)] p-4"><h3 className="mb-2 text-[12px] font-semibold">易错点与边界</h3><StudyMarkdown body={learning.pitfalls} /></div> : null}
      </section>
      <section id="study-answer" className="mt-8 scroll-mt-6 border-t border-[var(--separator)] pt-6">
        <h2 className="mb-4 text-[13px] font-semibold text-[var(--text-primary)]">{isDraft ? "参考答案 · 待确认" : "答案与表达"}</h2>
        {answer.trim() ? <StudyMarkdown body={answer} /> : <p className="text-sm leading-6 text-[var(--text-tertiary)]">还没有参考答案。先写出判断和依据，再组织成自己的表达。</p>}
      </section>
      <section id="study-recall" className="mt-8 scroll-mt-6 border-t border-[var(--separator)] pt-6">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">自测与追问</h2>
        <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">离开参考答案，试着用自己的话回答：核心概念是什么？结论如何推导？条件变化后，答案还成立吗？</p>
        {learning?.nextFocus ? <div className="mt-3"><StudyMarkdown body={learning.nextFocus} /></div> : null}
        {related.length ? <div className="mt-3 space-y-1">{related.map((item) => <button type="button" key={item.preparationId} onClick={() => onSelect(item.questionId)} className="block min-h-11 w-full rounded-[8px] px-2 py-2 text-left text-[13px] leading-6 text-[var(--accent)] hover:bg-[var(--surface-hover)]">{item.shortTitle || item.prompt} →</button>)}</div> : null}
        <p className="mt-3 text-[11px] leading-5 text-[var(--text-tertiary)]">阅读不会标记掌握。进入练习，记录真实表现与下一步改进。</p>
      </section>
    </div>
  );
}

function StudyMarkdown({ body }: { body: string }) {
  return <EntityMarkdown body={body} className="min-w-0 text-[14px] leading-7 [overflow-wrap:anywhere] [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_p]:leading-7 [&_li]:leading-7 [&_img]:max-w-full" />;
}
