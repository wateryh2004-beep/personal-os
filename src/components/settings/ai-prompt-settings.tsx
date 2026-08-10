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
    <section className="border-t pt-5">
      <div className="max-w-3xl">
        <h2 className="font-medium">AI 提示词</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
          在这里审查和调整 Notes AI 的全部提示词。系统默认值随代码版本管理；只有你主动修改的内容会作为个人覆盖保存。
        </p>
        {!available ? (
          <p role="status" className="mt-3 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            提示词设置 migration 尚未应用，目前继续安全使用代码默认值。
          </p>
        ) : null}
      </div>
      <div className="mt-4 max-w-3xl divide-y rounded-[var(--radius-md)] border bg-white">
        {prompts.map((prompt, index) => (
          <details key={prompt.key} open={index === 0} className="group px-4 py-3">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 marker:hidden">
              <span>
                <span className="block text-sm font-medium text-[var(--text-primary)]">{prompt.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{prompt.description}</span>
              </span>
              <span className={`mt-0.5 shrink-0 text-[10px] ${prompt.customized ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}>
                {prompt.customized ? "个人覆盖" : "系统默认"}
              </span>
            </summary>
            <form action={saveAiPromptOverride} className="mt-3 grid gap-3">
              <input type="hidden" name="prompt_key" value={prompt.key} />
              <label className="grid gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                Prompt
                <textarea
                  name="content"
                  required
                  minLength={1}
                  maxLength={12_000}
                  defaultValue={prompt.content}
                  disabled={!available}
                  rows={prompt.key === "notes.system" ? 14 : 6}
                  className="min-h-32 resize-y rounded-[var(--radius-md)] border bg-[var(--surface-app)] px-3 py-2 font-mono text-xs font-normal leading-5 text-[var(--text-primary)] focus:bg-white disabled:opacity-60"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={!available}>保存提示词</Button>
              </div>
            </form>
            {prompt.customized ? (
              <form action={resetAiPromptOverride} className="mt-2">
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
