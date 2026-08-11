"use client";

import { useActionState, useEffect, useRef } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureTodayBriefingAction, generateBriefingAction } from "@/features/briefing/actions";
import { initialBriefingGenerationState } from "@/features/briefing/feedback";

export function GenerateBriefingControl({ hasBriefing }: { hasBriefing: boolean }) {
  const ensured = useRef(false);
  const [state, action, pending] = useActionState(
    generateBriefingAction,
    initialBriefingGenerationState,
  );

  useEffect(() => {
    if (state.status !== "success" || !state.selected) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("briefing-results")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.selected, state.status]);

  useEffect(() => {
    if (hasBriefing || ensured.current) return;
    ensured.current = true;
    void ensureTodayBriefingAction();
  }, [hasBriefing]);

  const tone =
    state.status === "error"
      ? "text-[var(--danger)]"
      : state.status === "warning"
        ? "text-amber-700"
        : "text-[var(--success)]";

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <form action={action}>
        <Button className="w-full sm:w-auto" disabled={pending} type="submit">
          {pending ? (
            <RefreshCw aria-hidden="true" className="animate-spin" />
          ) : (
            <Sparkles aria-hidden="true" />
          )}
          {pending ? "正在抓取并生成…" : hasBriefing ? "重新生成" : "生成今日简报"}
        </Button>
      </form>
      {state.status !== "idle" ? (
        <p
          aria-live="polite"
          className={`max-w-md text-xs leading-5 sm:text-right ${tone}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
