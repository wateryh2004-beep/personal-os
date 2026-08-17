import { DashboardLayout } from "@/components/layout/page-layouts";

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`rounded-[var(--radius-sm)] bg-[var(--surface-hover)] ${className}`} />;
}

function SkeletonCard() {
  return (
    <section className="rounded-lg border bg-[var(--surface-canvas)]">
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <SkeletonLine className="h-4 w-24" />
        <SkeletonLine className="h-3 w-16" />
      </div>
      <div className="space-y-3 px-5 py-4">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <SkeletonLine className="h-3 w-12 shrink-0" />
            <SkeletonLine className="h-8 flex-1" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TodayLoading() {
  return (
    <DashboardLayout className="p-0" aria-busy="true" aria-label="正在加载 Today">
      <div className="mx-auto max-w-[var(--content-dashboard-width)] space-y-7 px-4 py-5 sm:px-6 sm:py-6">
        <header className="pb-6">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2.5">
              <SkeletonLine className="h-4 w-32" />
              <SkeletonLine className="h-7 w-20" />
              <SkeletonLine className="h-4 w-64 max-w-full" />
            </div>
            <SkeletonLine className="h-4 w-14" />
          </div>
          <SkeletonLine className="mt-5 h-11 w-full" />
        </header>
        <section className="rounded-lg border-l-4 border-l-[var(--border-strong)] bg-[var(--accent-soft)] px-5 py-5">
          <div className="flex items-center gap-3.5">
            <SkeletonLine className="size-10 shrink-0 rounded-full" />
            <div className="space-y-2">
              <SkeletonLine className="h-3 w-12" />
              <SkeletonLine className="h-6 w-2/5" />
              <SkeletonLine className="h-4 w-3/5" />
            </div>
          </div>
        </section>
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.38fr)_minmax(320px,1fr)]">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.72fr)]">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </DashboardLayout>
  );
}
