import { MotionBoundary } from "@/components/shared/motion-boundary";
import Link from "next/link";
import type { ReactNode } from "react";
import "./auth.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <MotionBoundary exit="auth-retreat"><div className="auth-scene">
      <div className="auth-atmosphere" aria-hidden="true"><span /><span /></div>
      <header className="auth-masthead">
        <Link href="/login" aria-label="Personal OS 登录" className="auth-wordmark"><span className="auth-mark" aria-hidden="true" />Personal OS</Link>
      </header>
      <main className="auth-stage"><MotionBoundary name="auth-flow" share="auth-flow" update="auth-flow">{children}</MotionBoundary></main>

    </div></MotionBoundary>
  );
}
