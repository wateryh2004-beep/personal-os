export function TasksShell() {
  return (
    <section
      aria-busy="true"
      aria-label="正在加载任务"
      className="h-[calc(var(--app-viewport-height)-var(--toolbar-height)-var(--tab-bar-height))] overflow-hidden bg-[var(--surface-canvas)] px-4 pt-[14px] md:px-7 md:pt-[18px] lg:px-10"
    >
      <div className="mx-auto max-w-[980px]">
        <div className="ui-skeleton-shimmer h-7 w-20 rounded-[7px]" />
        <div className="mt-2.5 flex gap-4.5">
          <div className="ui-skeleton-shimmer h-3 w-8 rounded-full" />
          <div className="ui-skeleton-shimmer h-3 w-16 rounded-full" />
          <div className="ui-skeleton-shimmer h-3 w-8 rounded-full" />
        </div>
      </div>
      <div className="mx-auto mt-7 max-w-[748px]">
        <div className="ui-skeleton-shimmer h-3 w-24 rounded-full" />
        <div className="mt-3.5 border-t border-[var(--separator)]">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex h-[60px] items-center gap-3 border-b border-[var(--separator)]">
              <div className="ui-skeleton-shimmer size-[18px] rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="ui-skeleton-shimmer h-3.5 w-[min(320px,72%)] rounded-full" />
                <div className="ui-skeleton-shimmer mt-2 h-2.5 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
