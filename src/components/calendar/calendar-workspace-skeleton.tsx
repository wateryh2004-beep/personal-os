export function CalendarShell() {
  return (
    <section aria-busy="true" aria-label="正在加载日历" className="flex h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] bg-[var(--surface-canvas)]">
      <div className="flex w-full flex-col">
        <div className="flex min-h-[56px] items-center justify-between border-b border-[var(--separator)] px-2 md:min-h-[50px] md:px-4">
          <div className="flex items-center gap-2">
            <div className="ui-skeleton-shimmer size-7 rounded-full" />
            <div className="ui-skeleton-shimmer h-4 w-44 rounded-full" />
          </div>
          <div className="flex gap-2">
            <div className="ui-skeleton-shimmer h-5 w-12 rounded-full" />
            <div className="ui-skeleton-shimmer h-8 w-16 rounded-[8px]" />
          </div>
        </div>
        <div className="flex h-11 items-center gap-3 border-b border-[var(--separator)] px-2 md:h-[34px] md:px-4">
          <div className="ui-skeleton-shimmer h-3 w-14 rounded-full" />
          <div className="ui-skeleton-shimmer h-3 w-16 rounded-full" />
          <div className="ui-skeleton-shimmer h-3 w-12 rounded-full" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[50px_minmax(0,1fr)] opacity-70 md:grid-cols-[50px_repeat(7,minmax(0,1fr))]">
          <div className="border-r border-[var(--separator)]" />
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className={`relative border-r border-[color-mix(in_srgb,var(--separator)_62%,transparent)] last:border-r-0 ${index ? "hidden md:block" : ""}`}>
              <div className="ui-skeleton-shimmer mx-3 mt-4.5 h-2.5 w-12 rounded-full" />
              <div className="ui-skeleton-shimmer mx-3 mt-7.5 h-10 rounded-[6px] opacity-70" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
