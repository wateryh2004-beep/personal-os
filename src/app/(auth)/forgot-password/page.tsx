import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <ForgotPasswordForm />
        <p className="text-center text-sm text-zinc-500">
          <Link href="/login" className="underline underline-offset-4">返回登录</Link>
        </p>
      </div>
    </main>
  );
}
