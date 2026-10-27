"use client";
import { useContinuousAssistantChat } from "@/components/assistant/use-continuous-assistant-chat";
import { Sparkles } from "lucide-react";
export function CareerAssistant({ experienceId }: { experienceId: string }) {
  const { input, setInput, messages, error, waiting, submit, stop, runtime, recoveryUnavailable } = useContinuousAssistantChat({ surface: "career", experienceId }, "职业 AI 输入");
  return (
    <section className="border-t pt-8">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--accent)]" />
        <h2 className="font-medium">AI 分析</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        只读结合相关笔记、材料和职业状态分析这段经历。
      </p>
      <div className="mt-4 space-y-3">
        {messages
          .filter((message) => message.role === "assistant")
          .map((message) => (
            <div
              key={message.id}
              className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]"
            >
              {message.parts
                .filter((part) => part.type === "text")
                .map((part, index) => (
                  <p key={index}>{part.text}</p>
                ))}
            </div>
          ))}
      </div>
      {runtime.notice || recoveryUnavailable ? <p role="status" className="mt-3 text-xs text-[var(--text-secondary)]">{runtime.notice || "当前输入仍可使用，本标签页恢复暂不可用。"}</p> : null}
      {error ? (
        <p className="mt-3 text-sm text-red-700">
          {error.message || "AI 分析暂时不可用。"}
        </p>
      ) : null}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || waiting) return;
          void submit({ text: input, currentPath: `/career/experiences/${experienceId}`, currentEntity: { type: "experience", id: experienceId } });
        }}
      >
        <input aria-label="内容" data-assistant-input={`career:${experienceId}`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={waiting}
          maxLength={2000}
          className="min-w-0 flex-1 border bg-[var(--surface-canvas)] px-3 py-2 text-sm"
          placeholder="例如：结合相关笔记，这段经历对下一阶段求职最有价值的部分是什么？"
        />
        {waiting ? (
          <button
            type="button"
            onClick={() => void stop()}
            className="border px-3 py-2 text-sm"
          >
            停止
          </button>
        ) : (
          <button className="bg-[var(--accent)] px-3 py-2 text-sm text-white">
            分析
          </button>
        )}
      </form>
    </section>
  );
}
