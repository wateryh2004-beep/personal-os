"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/features/auth/actions";

const initial: LoginState = {};

export function LoginForm({
  initialError,
  initialMessage,
  next = "/today",
}: {
  initialError?: string;
  initialMessage?: string;
  next?: string;
}) {
  const [state, action, pending] = useActionState(
    loginAction,
    initialError || initialMessage
      ? { error: initialError, message: initialMessage }
      : initial,
  );

  return (
    <form action={action} className="w-full max-w-sm space-y-5 border bg-white p-7">
      <input type="hidden" name="next" value={next} />
      <h1 className="text-xl font-semibold">Personal OS</h1>
      <p className="text-sm text-zinc-500">私人空间，仅限所有者登录。</p>

      <label className="block text-sm">
        邮箱
        <input required name="email" type="email" autoComplete="email" className="mt-1 w-full border p-2" />
      </label>
      <label className="block text-sm">
        密码
        <input required name="password" type="password" minLength={6} autoComplete="current-password" className="mt-1 w-full border p-2" />
      </label>

      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-emerald-700">{state.message}</p>}

      <button disabled={pending} className="w-full bg-[#365F78] p-2 text-white">
        {pending ? "正在登录…" : "登录"}
      </button>

      <div className="text-center">
        <Link href="/forgot-password" className="text-sm text-[#365F78] underline underline-offset-4">
          忘记账号或密码？
        </Link>
      </div>
    </form>
  );
}
