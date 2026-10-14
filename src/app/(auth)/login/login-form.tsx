"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "@/features/auth/actions";
import { AuthFeedback, AuthHeading, AuthPassword, AuthSubmit, AuthSuccess } from "@/components/auth/auth-interaction";

const initial: LoginState = {};

export function LoginForm({ initialError, initialMessage }: { initialError?: string; initialMessage?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialError || initialMessage ? { error: initialError, message: initialMessage } : initial);
  const [email, setEmail] = useState("");

  if (state.authenticated) return <AuthSuccess title="欢迎回来" message="让重要的事，回到眼前。" href="/today" action="进入我的空间" autoEnter />;

  return (
    <form action={action} className="auth-card auth-form" aria-busy={pending}>
      <AuthHeading eyebrow="A LITTLE SPACE FOR YOU" title="欢迎回来">从这里，回到自己的节奏。</AuthHeading>
      <fieldset disabled={pending} className="auth-fields">
        <label className="auth-field">邮箱<input required name="email" type="email" autoComplete="email" placeholder="你的邮箱" value={email} onChange={event => setEmail(event.target.value)} className="auth-input" /></label>
        <AuthPassword label="密码" required name="password" minLength={6} autoComplete="current-password" placeholder="输入密码" />
      </fieldset>
      {state.message ? <div className="auth-reset-symbol" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="m11 20 6 6 13-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div> : null}
      <AuthFeedback state={state} />
      <AuthSubmit pending={pending} label="进入我的空间" pendingLabel="正在验证身份…" />
      <div className="auth-form-footer"><span>仅限所有者登录</span><Link href="/forgot-password" className="auth-link">找回密码<span aria-hidden="true"> →</span></Link></div>
    </form>
  );
}
