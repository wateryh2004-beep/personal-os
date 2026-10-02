function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`ui-skeleton-shimmer rounded-[8px] ${className}`} />;
}

export default function TodayLoading() {
  return (
    <div aria-busy="true" aria-label="正在加载今天">
      <div className="now-workspace mx-auto w-full max-w-[1080px] px-4 py-[30px] sm:px-6 sm:py-[38px] lg:px-8 lg:py-[46px]">
        <header>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-[7px] h-8 w-24" />
          <Skeleton className="mt-2.5 h-3 w-64 max-w-full" />
          <Skeleton className="mt-6 h-10 w-full max-w-[680px] rounded-[11px]" />
        </header>

        <section className="mt-9 sm:mt-11">
          <div className="flex min-h-6 items-center justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-2.5 w-12" />
          </div>
          <div className="mt-3 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
            {[0,1,2].map((row) => <div key={row} className="flex h-12 items-center gap-3"><Skeleton className="h-3 w-14" /><Skeleton className="h-3 flex-1" /></div>)}
          </div>
        </section>

        <div className="mt-11 grid gap-11 lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,.82fr)] lg:gap-[60px]">
          {[0,1].map((block) => (
            <section key={block}>
              <Skeleton className="h-3.5 w-20" />
              <div className="mt-2.5 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
                {[0,1,2,3].map((row) => <div key={row} className="flex h-[46px] items-center gap-3"><Skeleton className="h-2.5 w-12" /><Skeleton className="h-3 flex-1" /></div>)}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-[60px] grid gap-11 border-t border-[var(--separator)] pt-11 lg:grid-cols-[minmax(0,1.22fr)_minmax(300px,.78fr)] lg:gap-[60px]">
          {[0,1].map((block) => <section key={block}><Skeleton className="h-3.5 w-20" /><Skeleton className="mt-3 h-24 w-full" /></section>)}
        </div>
      </div>
    </div>
  );
}
