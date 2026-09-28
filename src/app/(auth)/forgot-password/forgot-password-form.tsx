"use client";

import { useActionState } from "react";
import {
  requestPasswordResetAction,
  type PasswordRecoveryState,
} from "@/features/auth/actions";

const initial: PasswordRecoveryState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);

  return (
    <form action={action} className="space-y-5 border bg-white p-7">
      <h1 className="text-xl font-semibold">找回 Personal OS</h1>
      <p className="text-sm text-zinc-500">
        输入系统所有者邮箱。若匹配，将发送密码重置邮件。
      </p>

      <label className="block text-sm">
        邮箱
        <input required name="email" type="email" autoComplete="email" className="mt-1 w-full border p-2" />
      </label>

      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}

      <button disabled={pending} className="w-full bg-[#365F78] p-2 text-white">
        {pending ? "正在发送…" : "发送重置邮件"}
      </button>
    </form>
  );
}
