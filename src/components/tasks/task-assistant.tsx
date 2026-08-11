"use client";

import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import {
  loadWorkspaceSession,
  saveWorkspaceSession,
} from "@/lib/workspace-session";
import { AgentActionCard } from "@/components/assistant/agent-action-card";
import type { AgentAction } from "@/features/assistant/types";

type AssistantModel = "deepseek-v4-flash" | "deepseek-v4-pro";
type TaskAssistantSession = {
  messages: UIMessage[];
  input: string;
  model: AssistantModel;
  stoppedMessage: string | null;
  interrupted: boolean;
};
const taskSessionKey = "tasks:assistant";

function assistantError(error: Error) {
  try {
    const value = JSON.parse(error.message) as { error?: unknown };
    if (typeof value.error === "string") return value.error;
  } catch {
    /* The route only returns safe provider errors. */
  }
  return error.message || "DeepSeek 暂时没有完成回答，请重试。";
}

export function TaskAssistant() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AssistantModel>("deepseek-v4-flash");
  const [stoppedMessage, setStoppedMessage] = useState<string | null>(null);
  const restoredRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/assistant",
        body: () => ({ surface: "tasks", model }),
      }),
    [model],
  );
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    stop,
    clearError,
  } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const waiting = status !== "ready";
  useEffect(() => {
    const snapshot = loadWorkspaceSession<TaskAssistantSession>(taskSessionKey);
    const timer = window.setTimeout(() => {
      if (snapshot) {
        setMessages(snapshot.messages);
        setInput(snapshot.input);
        setModel(
          snapshot.model === "deepseek-v4-pro"
            ? "deepseek-v4-pro"
            : "deepseek-v4-flash",
        );
        setStoppedMessage(
          snapshot.interrupted
            ? "上一次生成因切换页面而暂停。"
            : snapshot.stoppedMessage,
        );
      }
      restoredRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setMessages]);
  useEffect(() => {
    if (restoredRef.current)
      saveWorkspaceSession(taskSessionKey, {
        messages,
        input,
        model,
        stoppedMessage,
        interrupted: waiting,
      });
  }, [input, messages, model, stoppedMessage, waiting]);
  useEffect(() => {
    if (!waiting && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [waiting]);
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );
  const stopGeneration = (message: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    void stop();
    setStoppedMessage(message);
  };
  return (
    <section className="flex h-[min(66dvh,560px)] min-h-[420px] flex-col overflow-hidden border bg-white">
      <div className="flex justify-end border-b p-2">
        <div className="inline-flex border">
          <button
            type="button"
            disabled={waiting}
            onClick={() => setModel("deepseek-v4-flash")}
            className={`px-3 py-1 text-xs ${model === "deepseek-v4-flash" ? "bg-[#EDF3F6] text-[#365F78]" : "text-zinc-500"}`}
          >
            Flash
          </button>
          <button
            type="button"
            disabled={waiting}
            onClick={() => setModel("deepseek-v4-pro")}
            className={`border-l px-3 py-1 text-xs ${model === "deepseek-v4-pro" ? "bg-[#EDF3F6] text-[#365F78]" : "text-zinc-500"}`}
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
                    className="inline-block bg-[#EDF3F6] px-3 py-2 text-sm"
                  >
                    {part.text}
                  </p>
                ) : (
                  <div
                    key={index}
                    className="task-ai-markdown text-sm leading-6 text-zinc-700"
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
                if (!output.proposal || !output.actionId) return <p key={part.toolCallId} className="text-sm text-amber-800">{output.error || "无法生成任务提案。"}</p>;
                const actionType = part.type.replace("tool-proposeTodo", "tasks.").replace("Task", "create").replace("Create", "create").replace("Update", "update").replace("Delete", "delete").replace("Complete", "complete").replace("Reopen", "reopen");
                return <AgentActionCard key={part.toolCallId} action={{ id: output.actionId, runId: "", domain: "tasks", actionType, status: "proposed", preview: output.proposal, riskLevel: actionType === "tasks.delete" ? "medium" : "low" } as AgentAction} onChanged={() => router.refresh()}/>;
              }
              return null;
            })}
          </div>
        ))}
      </div>
      {stoppedMessage ? (
        <p role="status" className="px-4 pb-2 text-xs text-zinc-500">
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
          clearError();
          setStoppedMessage(null);
          sendMessage({ text: input });
          setInput("");
          timeoutRef.current = setTimeout(
            () => stopGeneration("回答超时，已停止。"),
            18_500,
          );
        }}
      >
        <label className="sr-only" htmlFor="task-ai-input">
          输入消息
        </label>
        <div className="flex gap-2">
          <input
            id="task-ai-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={waiting}
            maxLength={2_000}
            className="min-w-0 flex-1 border bg-white px-3 py-2 text-sm"
            placeholder="输入消息…"
          />
          {waiting ? (
            <button
              type="button"
              className="border px-3 py-2 text-sm"
              onClick={() => stopGeneration("已停止生成。")}
            >
              停止
            </button>
          ) : (
            <button className="bg-[#365F78] px-3 py-2 text-sm text-white">
              发送
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
