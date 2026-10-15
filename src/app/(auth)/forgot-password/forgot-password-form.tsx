"use client";

import { useActionState, useState } from "react";
import { requestPasswordResetAction, type PasswordRecoveryState } from "@/features/auth/actions";
import { AuthFeedback, AuthHeading, AuthSubmit, AuthSuccess } from "@/components/auth/auth-interaction";

const initial: PasswordRecoveryState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  const [email, setEmail] = useState("");
  if (state.message) return <AuthSuccess title="请查看你的邮箱" message={state.message} href="/login" action="返回登录" />;
  return (
    <form action={action} className="auth-card auth-form" aria-busy={pending}>
      <AuthHeading title="通过邮箱找回">输入所有者邮箱，获取密码重置链接。</AuthHeading>
      <fieldset disabled={pending} className="auth-fields"><label className="auth-field">邮箱<input required name="email" type="email" autoComplete="email" placeholder="你的邮箱" value={email} onChange={event => setEmail(event.target.value)} className="auth-input" /></label></fieldset>
      <AuthFeedback state={state} />
      <AuthSubmit pending={pending} label="发送重置邮件" pendingLabel="正在发送…" />
    </form>
  );
}
