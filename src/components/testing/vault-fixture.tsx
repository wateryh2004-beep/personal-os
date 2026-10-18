"use client";
import { VaultProvider, VaultHideButton } from "@/components/vault/vault-provider";
import { AppShell } from "@/components/layout/app-shell";

/** Synthetic browser fixture only; API responses are intercepted by the test. */
export function VaultFixture() {
  return <VaultProvider><AppShell presentationPathname="/notes"><main className="p-6"><h1 className="page-title mb-6">笔记 · Synthetic fixture</h1><p className="mb-4">普通学习笔记</p><VaultHideButton kind="note" id="20000000-0000-4000-8000-000000000002" /><p className="mt-4 text-sm text-[var(--text-secondary)]">此页面只包含虚构测试内容。</p></main></AppShell></VaultProvider>;
}
