"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Feedback = { id: number; message: string; tone: "success" | "error"; undo?: () => void };
type ActionFeedbackContextValue = { show: (feedback: Omit<Feedback, "id">) => void };
const ActionFeedbackContext = createContext<ActionFeedbackContextValue | null>(null);

/** Sparse feedback for user-initiated outcomes; autosave deliberately does not use it. */
export function ActionFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const show = useCallback((next: Omit<Feedback, "id">) => setFeedback({ ...next, id: Date.now() }), []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), feedback.undo ? 6000 : 4200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ActionFeedbackContext.Provider value={value}>
      {children}
      {feedback ? (
        <div
          className="fixed bottom-[calc(var(--tab-bar-height)+1rem)] left-1/2 z-[70] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-[10px] border border-[var(--separator)] bg-[color-mix(in_srgb,var(--surface-elevated)_97%,transparent)] px-3 py-2 text-[13px] leading-5 shadow-[var(--shadow-popover)] backdrop-blur-xl"
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          <span className={`size-1.5 shrink-0 rounded-full ${feedback.tone === "error" ? "bg-[var(--danger)]" : "bg-[var(--success)]"}`} aria-hidden="true" />
          <span className="min-w-0 text-[var(--text-primary)]">{feedback.message}</span>
          {feedback.undo ? (
            <Button
              size="sm"
              variant="ghost"
              className="-my-1 ml-1"
              onClick={() => {
                const undo = feedback.undo;
                if (!undo) return;
                setFeedback(null);
                undo();
              }}
            >
              撤回
            </Button>
          ) : null}
        </div>
      ) : null}
    </ActionFeedbackContext.Provider>
  );
}

export function useActionFeedback() {
  const context = useContext(ActionFeedbackContext);
  if (!context) throw new Error("useActionFeedback must be used inside ActionFeedbackProvider");
  return context;
}
