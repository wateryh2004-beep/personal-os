import { DisclosureSummary } from "@/components/ui/disclosure";
import { presentInterviewPrompt } from "@/features/interview/prompt-presentation";

/** Shared by the library, practice and question detail. Never writes to storage. */
export function InterviewPrompt({ prompt, shortTitle }: { prompt: string; shortTitle?: string | null }) {
  const content = presentInterviewPrompt(prompt, shortTitle);
  return <div className="min-w-0" data-testid="interview-prompt">
    <h1 className="text-[20px] font-semibold leading-[1.5] tracking-[-0.015em] text-[var(--text-primary)]">{content.title}</h1>
    <p data-testid="interview-prompt-text" className="mt-3 whitespace-pre-wrap text-[15px] font-normal leading-7 text-[var(--text-primary)] [overflow-wrap:anywhere]">{content.question}</p>
    {content.conditions.length ? <section aria-label="题设条件与口径" className="mt-4 border-l-2 border-[var(--separator)] pl-4">
      <h2 className="mb-1 text-[12px] font-medium text-[var(--text-secondary)]">条件与口径</h2>
      {content.conditions.map((body, index) => <p key={index} className="whitespace-pre-wrap text-[14px] leading-7 text-[var(--text-secondary)]">{body}</p>)}
    </section> : null}
    <details className="mt-2 text-[12px] leading-6 text-[var(--text-tertiary)]" data-testid="interview-prompt-notes">
      <DisclosureSummary className="inline-flex min-h-11 cursor-pointer items-center">{content.notes.length ? "补充说明与原始题干" : "查看原始题干"}</DisclosureSummary>
      <div className="space-y-3 border-t border-[var(--separator)] py-3">
        {content.notes.map((note, index) => <div key={index}><p className="font-medium">{note.label}</p><p className="whitespace-pre-wrap">{note.text}</p></div>)}
        <details><DisclosureSummary className="min-h-11 cursor-pointer py-2">原始题干 · 完整保留</DisclosureSummary><pre data-testid="interview-prompt-original" className="whitespace-pre-wrap font-sans text-[12px] leading-6 [overflow-wrap:anywhere]">{content.original}</pre></details>
      </div>
    </details>
  </div>;
}
