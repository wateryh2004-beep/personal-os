"use client";

import { useActionState } from "react";
import { updatePasswordAction, type UpdatePasswordState } from "@/features/auth/actions";
import { AuthFeedback, AuthHeading, AuthPassword, AuthSubmit } from "@/components/auth/auth-interaction";

const initial: UpdatePasswordState = {};

export function UpdatePasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(updatePasswordAction, initial);
  return (
    <form action={action} className="auth-card auth-form" aria-busy={pending}>
      <AuthHeading eyebrow="A FRESH START" title="设置新密码">{email}</AuthHeading>
      <fieldset disabled={pending} className="auth-fields">
        <AuthPassword label="新密码" required name="password" minLength={10} autoComplete="new-password" placeholder="至少 10 个字符" />
        <AuthPassword label="确认新密码" required name="confirmPassword" minLength={10} autoComplete="new-password" placeholder="再输入一次新密码" />
      </fieldset>
      <AuthFeedback state={state} />
      <AuthSubmit pending={pending} label="更新密码" pendingLabel="正在更新…" />
    </form>
  );
}
