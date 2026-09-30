import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resetAiPromptOverride,
  saveAiPromptOverride,
} from "@/features/ai/actions";
import type { NoteAiPromptKey } from "@/features/notes/ai-prompts";

export type AiPromptSetting = {
  key: NoteAiPromptKey;
  label: string;
  description: string;
  content: string;
  customized: boolean;
};

export function AiPromptSettings({
  prompts,
  available,
}: {
  prompts: AiPromptSetting[];
  available: boolean;
}) {
  return (
    <section className="border-t border-[var(--separator)] pt-4">
      <div className="max-w-3xl">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">AI 提示词</h2>
        <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">
          在这里审查和调整 笔记 AI 的全部提示词。系统默认值随代码版本管理；只有你主动修改的内容会作为个人覆盖保存。
        </p>
        {!available ? (
          <p role="status" className="mt-2 rounded-[9px] bg-amber-50 px-3 py-2 text-[10.5px] leading-5 text-amber-800">
            提示词设置尚未完成升级，目前继续使用系统默认值。
          </p>
        ) : null}
      </div>
      <div className="mt-3 max-w-3xl divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
        {prompts.map((prompt, index) => (
          <details key={prompt.key} open={index === 0} className="group px-1 py-2.5">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3.5 marker:hidden">
              <span>
                <span className="block text-[12.5px] font-medium text-[var(--text-primary)]">{prompt.label}</span>
                <span className="mt-0.5 block text-[10.5px] leading-5 text-[var(--text-secondary)]">{prompt.description}</span>
              </span>
              <span className={`mt-0.5 shrink-0 text-[9.5px] ${prompt.customized ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}>
                {prompt.customized ? "个人覆盖" : "系统默认"}
              </span>
            </summary>
            <form action={saveAiPromptOverride} className="mt-2 grid gap-2">
              <input type="hidden" name="prompt_key" value={prompt.key} />
              <label className="grid gap-1.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
                Prompt
                <textarea
                  name="content"
                  required
                  minLength={1}
                  maxLength={12_000}
                  defaultValue={prompt.content}
                  disabled={!available}
                  rows={prompt.key === "notes.system" ? 14 : 6}
                  className="min-h-32 resize-y rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 py-2.5 font-mono text-[11px] font-normal leading-5 text-[var(--text-primary)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)] disabled:opacity-60"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={!available}>保存提示词</Button>
              </div>
            </form>
            {prompt.customized ? (
              <form action={resetAiPromptOverride} className="mt-1.5">
                <input type="hidden" name="prompt_key" value={prompt.key} />
                <Button type="submit" variant="ghost" size="sm" disabled={!available}>
                  <RotateCcw aria-hidden="true" />恢复系统默认
                </Button>
              </form>
            ) : null}
          </details>
        ))}
      </div>
    </section>
  );
}
