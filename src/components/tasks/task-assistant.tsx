"use client";

import type { AgentActionFixtureTransport } from "@/features/assistant/action-fixtures";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";

import { useContinuousAssistantChat } from "@/components/assistant/use-continuous-assistant-chat";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { AgentActionCard } from "@/components/assistant/agent-action-card";
import type { AgentAction } from "@/features/assistant/types";

function assistantError(error: Error) {
  try {
    const value = JSON.parse(error.message) as { error?: unknown };
    if (typeof value.error === "string") return value.error;
  } catch {
    /* The route only returns safe provider errors. */
  }
  return error.message || "DeepSeek 暂时没有完成回答，请重试。";
}

export function TaskAssistant({ actionTransport }: { actionTransport?: AgentActionFixtureTransport } = {}) {
  assertContinuousFixtureTransport(actionTransport);
  const { input, setInput, model, setModel, messages, error, waiting, submit, stop, runtime, refreshRun, recoveryUnavailable } = useContinuousAssistantChat({ surface: "tasks" }, "任务 AI 输入");
  const stoppedMessage = runtime.notice;
  const stopGeneration = () => stop();
  return (
    <section className="flex h-[min(66dvh,560px)] min-h-[420px] flex-col overflow-hidden border bg-[var(--surface-canvas)]">
      <div className="flex justify-end border-b p-2">
        <div className="inline-flex border">
          <button
            type="button"
            disabled={waiting}
            onClick={() => setModel("deepseek-v4-flash")}
            className={`px-3 py-1 text-xs ${model === "deepseek-v4-flash" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}
          >
            Flash
          </button>
          <button
            type="button"
            disabled={waiting}
            onClick={() => setModel("deepseek-v4-pro")}
            className={`border-l px-3 py-1 text-xs ${model === "deepseek-v4-pro" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}
          >
            Pro
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "ml-8 text-right" : "mr-8"}
          >
            {message.parts.map((part, index) => {
              if (part.type === "text")
                return message.role === "user" ? (
                  <p
                    key={index}
                    className="inline-block bg-[var(--accent-soft)] px-3 py-2 text-sm"
                  >
                    {part.text}
                  </p>
                ) : (
                  <div
                    key={index}
                    className="task-ai-markdown text-sm leading-6 text-[var(--text-secondary)]"
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {part.text}
                    </ReactMarkdown>
                  </div>
                );
              const proposalTools = ["tool-proposeTodoCreate", "tool-proposeTodoTask", "tool-proposeTodoUpdate", "tool-proposeTodoDelete", "tool-proposeTodoComplete", "tool-proposeTodoReopen"];
              if (proposalTools.includes(part.type) && "output" in part && part.state === "output-available") {
                const output = part.output as { proposal?: Record<string, unknown> | null; actionId?: string | null; error?: string };
                if (output.actionId && runtime.run?.actions.some(action => action.id === output.actionId)) return null;
                if (!output.proposal || !output.actionId) return <p key={part.toolCallId} className="text-sm text-amber-800">{output.error || "无法生成任务提案。"}</p>;
                const actionType = part.type.replace("tool-proposeTodo", "tasks.").replace("Task", "create").replace("Create", "create").replace("Update", "update").replace("Delete", "delete").replace("Complete", "complete").replace("Reopen", "reopen");
                return <AgentActionCard verificationTransport={actionTransport} key={part.toolCallId} action={{ id: output.actionId, runId: "", domain: "tasks", actionType, status: "proposed", preview: output.proposal, riskLevel: actionType === "tasks.delete" ? "medium" : "low" } as AgentAction} onChanged={(result) => {
                  if (result.status === "success") window.dispatchEvent(new CustomEvent("personal-os:tasks-mutated", { detail: { actionType, proposal: output.proposal } }));
                }}/>;
              }
              return null;
            })}
          </div>
        ))}
      </div>
      {runtime.run?.actions.length ? <div className="space-y-2 px-4 pb-3">{runtime.run.actions.map(action => <AgentActionCard verificationTransport={actionTransport} key={action.id} action={action} onChanged={() => void refreshRun()} />)}</div> : null}
      {recoveryUnavailable ? <p role="status" className="px-4 text-xs text-[var(--danger)]">当前输入仍可使用，本标签页恢复暂不可用。</p> : null}
      {stoppedMessage ? (
        <p role="status" className="px-4 pb-2 text-xs text-[var(--text-secondary)]">
          {stoppedMessage}
        </p>
      ) : null}
      {error && !stoppedMessage ? (
        <p role="status" className="px-4 pb-2 text-xs text-red-700">
          {assistantError(error)}
        </p>
      ) : null}
      <form
        className="border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || waiting) return;
          void submit({ text: input, model, currentPath: "/tasks", currentEntity: null });
        }}
      >
        <label className="sr-only" htmlFor="task-ai-input">
          输入消息
        </label>
        <div className="flex gap-2">
          <input
            id="task-ai-input"
            data-assistant-input="tasks"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={waiting}
            maxLength={2_000}
            className="min-w-0 flex-1 border bg-[var(--surface-canvas)] px-3 py-2 text-sm"
            placeholder="输入消息…"
          />
          {waiting ? (
            <button
              type="button"
              className="border px-3 py-2 text-sm"
              onClick={() => stopGeneration()}
            >
              停止
            </button>
          ) : (
            <button className="bg-[var(--accent)] px-3 py-2 text-sm text-white">
              发送
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
