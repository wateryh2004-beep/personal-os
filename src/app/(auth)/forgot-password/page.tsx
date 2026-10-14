import Link from "next/link";
import { isQuestionRecoveryConfigured } from "@/lib/adapters/question-password-recovery";
import { ForgotPasswordForm } from "./forgot-password-form";
import { QuestionRecoveryForm } from "./question-recovery-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm space-y-4">
        {isQuestionRecoveryConfigured() ? (
          <>
            <QuestionRecoveryForm />
            <details className="border bg-white p-4">
              <summary className="cursor-pointer text-sm text-[#365F78]">改用邮箱找回</summary>
              <div className="mt-4"><ForgotPasswordForm /></div>
            </details>
          </>
        ) : <ForgotPasswordForm />}
        <p className="text-center text-sm text-zinc-500">
          <Link href="/login" className="underline underline-offset-4">返回登录</Link>
        </p>
      </div>
    </main>
  );
}
