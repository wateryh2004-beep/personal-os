"use client";

import { type FormEvent, type ReactNode, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { createPracticeAttempt } from "@/features/interview/actions";
import { PracticeReflectionFields } from "./practice-reflection-fields";

export function PracticeAttemptForm({ children, historyHref }: { children?: ReactNode; historyHref: string }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    // A caught form action would count as successful to React and reset native
    // inputs. Handle the submit ourselves so an uncertain save keeps the draft.
    event.preventDefault();
    if (inFlight.current) return;
    const snapshot = new FormData(event.currentTarget);
    inFlight.current = true;
    setFailed(false);
    startTransition(async () => {
      try {
        await createPracticeAttempt(snapshot);
      } catch (error) {
        // Successful actions redirect to a verified receipt. Let Next handle it.
        unstable_rethrow(error);
        setFailed(true);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <form action={createPracticeAttempt} onSubmit={submit} aria-busy={pending} className="mt-8 max-w-3xl">
      <fieldset disabled={pending} className="min-w-0">
        {children}
        <PracticeReflectionFields submitPending={pending} submitFailed={failed} />
      </fieldset>
      {failed ? (
        <div role="alert" className="mt-3 text-[13px] leading-6 text-[var(--danger)]">
          <p>未能确认保存结果，当前输入已保留。请先检查已保存的练习，确认没有新增记录后再重试，避免重复保存。</p>
          <a href={historyHref} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[var(--accent)] underline underline-offset-2">在新标签页检查练习记录</a>
        </div>
      ) : null}
    </form>
  );
}
