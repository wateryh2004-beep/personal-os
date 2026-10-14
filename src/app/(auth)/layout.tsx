import Link from "next/link";
import type { ReactNode } from "react";
import "./auth.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-scene">
      <div className="auth-atmosphere" aria-hidden="true"><span /><span /></div>
      <header className="auth-masthead">
        <Link href="/login" aria-label="Personal OS 登录" className="auth-wordmark"><span className="auth-mark" aria-hidden="true" />Personal OS<span className="auth-private">PRIVATE SPACE</span></Link>
      </header>
      <main className="auth-stage">{children}</main>
      <footer className="auth-footer">留一点空间，给真正重要的事。</footer>
    </div>
  );
}
