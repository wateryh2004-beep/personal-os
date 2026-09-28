"use client";

import { useActionState } from "react";
import {
  updatePasswordAction,
  type UpdatePasswordState,
} from "@/features/auth/actions";

const initial: UpdatePasswordState = {};

export function UpdatePasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(updatePasswordAction, initial);

  return (
    <form action={action} className="w-full max-w-sm space-y-5 border bg-white p-7">
      <h1 className="text-xl font-semibold">设置新密码</h1>
      <p className="text-sm text-zinc-500">{email}</p>

      <label className="block text-sm">
        新密码
        <input required name="password" type="password" minLength={10} autoComplete="new-password" className="mt-1 w-full border p-2" />
      </label>

      <label className="block text-sm">
        再输入一次
        <input required name="confirmPassword" type="password" minLength={10} autoComplete="new-password" className="mt-1 w-full border p-2" />
      </label>

      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}

      <button disabled={pending} className="w-full bg-[#365F78] p-2 text-white">
        {pending ? "正在更新…" : "更新密码"}
      </button>
    </form>
  );
}
