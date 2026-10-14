"use client";

import Link from "next/link";
import { useActionState } from "react";
import { questionPasswordResetAction, type QuestionRecoveryState } from "@/features/auth/question-recovery-action";

const initial: QuestionRecoveryState = {};

export function QuestionRecoveryForm() {
  const [state, action, pending] = useActionState(questionPasswordResetAction, initial);
  if (state.updated) return (
    <div className="space-y-5 border bg-white p-7">
      <p role="status" className="text-sm text-emerald-700">{state.message}</p>
      <Link href="/login" className="block bg-[#365F78] p-2 text-center text-white">返回登录</Link>
    </div>
  );

  return (
    <form action={action} className="space-y-5 border bg-white p-7">
      <h1 className="text-xl font-semibold">找回密码</h1>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">你认为余航人生中最重要的事情是什么？</legend>
        <p className="text-xs text-zinc-500">填写两个英语单词，大小写不限。</p>
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-sm">
            第一个单词
            <input required name="firstWord" type="password" maxLength={64} pattern="[a-zA-Z]+" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="xxxx" className="mt-1 w-full border p-2" />
          </label>
          <span className="pb-2 text-sm">和</span>
          <label className="min-w-0 flex-1 text-sm">
            第二个单词
            <input required name="secondWord" type="password" maxLength={64} pattern="[a-zA-Z]+" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="xxxx" className="mt-1 w-full border p-2" />
          </label>
        </div>
      </fieldset>
      <label className="block text-sm">
        新密码
        <input required name="password" type="password" minLength={10} maxLength={128} autoComplete="new-password" className="mt-1 w-full border p-2" />
      </label>
      <label className="block text-sm">
        确认新密码
        <input required name="confirmPassword" type="password" minLength={10} maxLength={128} autoComplete="new-password" className="mt-1 w-full border p-2" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="w-full bg-[#365F78] p-2 text-white">{pending ? "正在验证并重置…" : "验证答案并重置密码"}</button>
    </form>
  );
}
