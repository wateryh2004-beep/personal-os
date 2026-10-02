"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { careerFieldLabels, initialCareerFormResult, type CareerFormResult } from "@/features/career/form-state";
import { cn } from "@/lib/utils";

type CareerFormProps = {
  action: (formData: FormData) => Promise<CareerFormResult>;
  children?: React.ReactNode;
  className?: string;
  successMessage?: string;
  successTargetId?: string;
  resetOnSuccess?: boolean;
};

/** Explicit submission avoids React resetting uncontrolled inputs after a validation error. */
export function CareerForm({ action, children, className, successMessage = "已保存。", successTargetId, resetOnSuccess = false }: CareerFormProps) {
  const [state, setState] = useState(initialCareerFormResult);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const feedbackId = useId();

  useEffect(() => {
    const controls = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[name],select[name],textarea[name]");
    controls?.forEach((control) => {
      if (state.fieldErrors?.[control.name]) {
        control.setAttribute("aria-invalid", "true");
        control.setAttribute("aria-describedby", feedbackId);
      } else if (control.getAttribute("aria-describedby") === feedbackId) {
        control.removeAttribute("aria-invalid");
        control.removeAttribute("aria-describedby");
      }
    });
    if (state.status === "error") feedbackRef.current?.focus();
  }, [state, feedbackId]);

  return <form ref={formRef} method="post" aria-busy={pending || undefined} onSubmit={(event) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await action(formData);
        setState(result);
        if (result.status === "success") {
          // Only creation forms opt in; updates retain their current controlled/uncontrolled values.
          if (resetOnSuccess) formRef.current?.reset();
          if (successTargetId) requestAnimationFrame(() => document.getElementById(successTargetId)?.scrollIntoView({ block: "nearest", behavior: "instant" }));
        }
      } catch (error) {
        unstable_rethrow(error);
        setState({ status: "error", message: "未能确认保存结果，输入已保留。请检查连接后重试。" });
      } finally { submitting.current = false; }
    });
  }}>
    <fieldset disabled={pending} className={cn("min-w-0 border-0 p-0 disabled:opacity-70", className)}>{children}</fieldset>
    <div ref={feedbackRef} id={feedbackId} tabIndex={-1} role={state.status === "error" ? "alert" : "status"} aria-live="polite" className={cn("min-h-6 pt-1 text-[12px] leading-5 outline-none", state.status === "error" ? "text-[var(--danger)]" : "text-[var(--text-secondary)]")}>
      {pending ? "正在保存…" : state.status === "success" ? successMessage : state.message}
      {state.status === "error" && state.fieldErrors ? <ul className="mt-1 space-y-1">{Object.entries(state.fieldErrors).map(([name, error]) => <li key={name}><button type="button" className="text-left underline underline-offset-2" onClick={() => {
        const control = formRef.current?.elements.namedItem(name);
        if (control instanceof HTMLElement) control.focus();
      }}>{careerFieldLabels[name] ?? "字段"}：{error}</button></li>)}</ul> : null}
    </div>
  </form>;
}
