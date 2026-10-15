"use client";

import { Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/** These states describe server results; animation never grants access. */
export function AuthSuccess({ title, message, href, action, autoEnter = false }: {
  title: string; message?: string; href: string; action: string; autoEnter?: boolean;
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const entered = useRef(false);
  const enter = useCallback(() => {
    if (entered.current) return;
    entered.current = true;
    router.replace(href, { transitionTypes: ["auth-entry"] });
  }, [href, router]);
  useEffect(() => {
    heading.current?.focus();
    if (!autoEnter) return;
    // The server has confirmed login and set session cookies. Fetch the private
    // destination alongside confirmation motion, rather than after its delay.
    router.prefetch(href);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Independent of animationend: disabled animations/background tabs cannot trap login.
    const timer = window.setTimeout(enter, reduced.matches ? 0 : 320);
    const skip = () => { if (reduced.matches) { window.clearTimeout(timer); enter(); } };
    reduced.addEventListener("change", skip);
    return () => { window.clearTimeout(timer); reduced.removeEventListener("change", skip); };
  }, [autoEnter, enter, href, router]);

  return (
    <section className={`auth-card auth-success${autoEnter ? " auth-entering" : ""}`}>
      <div className="auth-success-art" aria-hidden="true">
        <span className="auth-success-ring" /><span className="auth-success-ring auth-success-ring-outer" />
        <div className="auth-success-core"><svg viewBox="0 0 40 40" fill="none"><path d="m11 20 6 6 13-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
      </div>

      <h1 ref={heading} tabIndex={-1} className="auth-title">{title}</h1>
      {message ? <p role="status" className="auth-description">{message}</p> : null}
      {/* Native link remains usable without JS, and lets users skip the transition. */}
      <a href={href} onClick={event => { if (autoEnter && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); enter(); } }} className="auth-primary">{action}<span aria-hidden="true">↗</span></a>
    </section>
  );
}

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="auth-heading"><h1 className="auth-title">{title}</h1>{children ? <p className="auth-description">{children}</p> : null}</div>;
}

export function AuthFeedback({ state }: { state: { error?: string; message?: string } }) {
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!state.error || !alert.current) return;
    alert.current.focus();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const animation = alert.current.animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 260 });
      return () => animation?.cancel();
    }
  }, [state]);
  return <>{state.error ? <p ref={alert} tabIndex={-1} role="alert" className="auth-feedback auth-error">{state.error}</p> : null}{state.message ? <p role="status" className="auth-feedback auth-message">{state.message}</p> : null}</>;
}

export function AuthSubmit({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return <button type="submit" disabled={pending} className="auth-primary"><span>{pending ? pendingLabel : label}</span>{pending ? <span className="auth-spinner" aria-hidden="true" /> : <span className="auth-button-arrow" aria-hidden="true">↗</span>}</button>;
}

export function AuthPassword({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="auth-field"><label htmlFor={id}>{label}</label><div className="auth-password"><input {...props} id={id} type={visible ? "text" : "password"} className="auth-input" /><button type="button" className="auth-reveal" aria-label={`${visible ? "隐藏" : "显示"}${label}`} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div></div>;
}
