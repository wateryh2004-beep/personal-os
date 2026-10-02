"use client";

export function WorkspaceReadError({ resource }: { resource: { revalidate: (options: { force: boolean }) => Promise<unknown> } }) {
  return <section role="alert" className="mx-auto max-w-[760px] px-5 py-8 text-[13px] text-[var(--text-secondary)]">
    <p>工作区暂时无法读取，请检查网络后重试。</p>
    <button type="button" className="mt-3 min-h-11 text-[var(--accent)]" onClick={() => { void resource.revalidate({ force: true }).catch(() => {}); }}>重新读取</button>
  </section>;
}
