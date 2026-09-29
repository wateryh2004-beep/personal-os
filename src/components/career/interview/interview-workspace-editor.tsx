"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveInterviewWorkspace } from "@/features/interview/actions";

export function InterviewWorkspaceEditor({
  preparationId,
  questionId,
  question,
  initialThoughts,
  initialAnswer,
  practiceHref,
}: {
  preparationId: string;
  questionId: string;
  question: string;
  initialThoughts: string;
  initialAnswer: string;
  practiceHref: string;
}) {
  const [thoughts, setThoughts] = useState(initialThoughts);
  const [answer, setAnswer] = useState(initialAnswer);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    setThoughts(initialThoughts);
    setAnswer(initialAnswer);
    setSavedAt(null);
    firstRun.current = true;
  }, [questionId, initialThoughts, initialAnswer]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const formData = new FormData();
      formData.set("preparation_id", preparationId);
      formData.set("question_id", questionId);
      formData.set("thoughts", thoughts);
      formData.set("answer", answer);
      startTransition(async () => {
        await saveInterviewWorkspace(formData);
        setSavedAt(Date.now());
      });
    }, 900);

    return () => window.clearTimeout(timer);
  }, [answer, preparationId, questionId, thoughts]);

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-6">
        <h1 className="max-w-3xl text-[24px] font-semibold leading-9 tracking-[-0.025em] text-zinc-950">{question}</h1>
        <Link href={practiceHref} className="mt-1 shrink-0 text-xs text-zinc-400 hover:text-zinc-700">练习 →</Link>
      </div>

      <section className="mt-10">
        <h2 className="text-xs font-medium text-zinc-400">思路</h2>
        <textarea
          value={thoughts}
          onChange={(event) => setThoughts(event.target.value)}
          rows={10}
          placeholder="把你的思路写下来。"
          className="mt-2 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-7 text-zinc-800 outline-none placeholder:text-zinc-300"
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-medium text-zinc-400">答案</h2>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          rows={13}
          placeholder="写出你真正会说的答案。"
          className="mt-2 w-full resize-y bg-transparent px-0 py-2 text-[15px] leading-7 text-zinc-900 outline-none placeholder:text-zinc-300"
        />
      </section>

      <div className="mt-3 h-5 text-right text-[11px] text-zinc-300">
        {isPending ? "保存中…" : savedAt ? "已保存" : ""}
      </div>
    </div>
  );
}
