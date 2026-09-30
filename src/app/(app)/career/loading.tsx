export default function CareerLoading() {
  return (
    <div aria-label="Career 加载中" className="py-1">
      <div className="ui-skeleton-shimmer h-7 w-24 rounded-[8px]" />
      <div className="ui-skeleton-shimmer mt-2.5 h-3 w-56 max-w-[68vw] rounded-[6px]" />
      <div className="mt-8.5 flex gap-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="ui-skeleton-shimmer h-3 w-9 rounded-[6px]" />
        ))}
      </div>
      <div className="mt-10 space-y-2">
        <div className="ui-skeleton-shimmer h-3.5 w-20 rounded-[6px]" />
        <div className="ui-skeleton-shimmer h-11 rounded-[10px]" />
        <div className="ui-skeleton-shimmer h-11 rounded-[10px]" />
        <div className="ui-skeleton-shimmer h-11 rounded-[10px]" />
      </div>
    </div>
  );
}
