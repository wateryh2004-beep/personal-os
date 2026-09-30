export default function AppLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto w-full max-w-[var(--content-dashboard-width)] space-y-6 px-4 py-7 sm:px-6 lg:px-8"
    >
      <span className="sr-only">正在加载页面</span>
      <div className="space-y-3">
        <div className="h-7 w-28 rounded-[var(--radius-sm)] ui-skeleton-shimmer" />
        <div className="h-3 w-52 max-w-full rounded-[var(--radius-sm)] bg-[var(--surface-hover)] motion-safe:animate-pulse" />
      </div>
      <div className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
        {[0, 1, 2, 3, 4].map((row) => <div key={row} className="flex h-[52px] items-center gap-3.5"><div className="size-6 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] motion-safe:animate-pulse" /><div className="h-4 flex-1 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] motion-safe:animate-pulse" /><div className="h-3 w-16 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] motion-safe:animate-pulse" /></div>)}
      </div>
    </div>
  );
}
