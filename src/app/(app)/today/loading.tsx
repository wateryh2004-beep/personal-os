import { DashboardLayout } from "@/components/layout/page-layouts";

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`rounded-[var(--radius-sm)] bg-[var(--surface-hover)] ${className}`} />;
}

export default function TodayLoading() {
  return (
    <DashboardLayout className="p-0" aria-busy="true" aria-label="正在加载 Today">
      <div className="mx-auto max-w-[var(--content-dashboard-width)] space-y-6 px-4 py-5 sm:px-6 sm:py-6">
        <header className="grid gap-4 border-b pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.72fr)] lg:items-end">
          <div className="space-y-2.5">
            <SkeletonLine className="h-4 w-32" />
            <SkeletonLine className="h-8 w-24" />
            <SkeletonLine className="h-4 w-64 max-w-full" />
          </div>
          <SkeletonLine className="h-11 w-full" />
        </header>
        <section className="border-l-2 border-[var(--border-strong)] bg-[var(--surface-canvas)] px-5 py-4">
          <SkeletonLine className="h-3 w-12" />
          <SkeletonLine className="mt-2 h-6 w-2/5" />
          <SkeletonLine className="mt-2 h-4 w-3/5" />
        </section>
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.38fr)_minmax(320px,1fr)]">
          {[0, 1].map((column) => (
            <section key={column}>
              <div className="border-b pb-2.5">
                <SkeletonLine className="h-4 w-24" />
              </div>
              <div className="space-y-3 py-4">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex items-center gap-3">
                    <SkeletonLine className="h-3 w-12 shrink-0" />
                    <SkeletonLine className="h-8 flex-1" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="grid gap-8 border-t pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.72fr)]">
          <SkeletonLine className="h-28 w-full" />
          <SkeletonLine className="h-28 w-full" />
        </div>
      </div>
    </DashboardLayout>
  );
}
