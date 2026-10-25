"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { NoteAiAssistant } from "./note-ai-assistant";
import { readWorkspaceResponse } from "@/lib/workspace-resource-cache";
import type { DeepSeekModelId } from "@/lib/ai/deepseek";

export function NoteAssistantLoader({ loadPreferences, ...props }: ComponentProps<typeof NoteAiAssistant> & { loadPreferences: boolean }) {
  const [model, setModel] = useState(loadPreferences ? null : props.defaultModel);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!loadPreferences) return;
    const controller = new AbortController();
    readWorkspaceResponse<{ model: DeepSeekModelId }>("/api/ai/preferences", controller.signal).then((value) => { if (!controller.signal.aborted) setModel(value.model); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [loadPreferences, attempt]);
  if (model) return <NoteAiAssistant {...props} defaultModel={model} />;
  return props.open ? <div role="status" className="fixed bottom-4 right-4 z-50 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-secondary)]">{failed ? <>AI 设置暂时无法读取。<button className="pressable min-h-11 px-2 text-[var(--accent)]" onClick={() => { setFailed(false); setAttempt((v) => v + 1); }}>重试</button></> : "正在打开笔记 AI…"}<button className="pressable ml-2 min-h-11 px-2" onClick={props.onClose}>关闭</button></div> : null;
}
