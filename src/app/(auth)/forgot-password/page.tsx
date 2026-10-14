import Link from "next/link";
import { isQuestionRecoveryConfigured } from "@/lib/adapters/question-password-recovery";
import { ForgotPasswordForm } from "./forgot-password-form";
import { QuestionRecoveryForm } from "./question-recovery-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="auth-recovery">
        {isQuestionRecoveryConfigured() ? (
          <>
            <QuestionRecoveryForm />
            <details className="auth-alternative">
              <summary className="auth-link">改用邮箱找回</summary>
              <div className="mt-4"><ForgotPasswordForm /></div>
            </details>
          </>
        ) : <ForgotPasswordForm />}
        <p className="auth-return">
          <Link href="/login" className="auth-link">返回登录</Link>
        </p>
    </div>
  );
}
