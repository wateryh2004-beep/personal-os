export default function CareerLoading() {
  return (
    <div aria-label="Career 加载中" className="animate-pulse py-2">
      <div className="h-7 w-28 rounded bg-black/[0.06]" />
      <div className="mt-3 h-3 w-64 max-w-[70vw] rounded bg-black/[0.04]" />
      <div className="mt-10 flex gap-6">
        <div className="h-3 w-10 rounded bg-black/[0.05]" />
        <div className="h-3 w-10 rounded bg-black/[0.05]" />
        <div className="h-3 w-10 rounded bg-black/[0.05]" />
        <div className="h-3 w-10 rounded bg-black/[0.05]" />
      </div>
      <div className="mt-12 space-y-4">
        <div className="h-4 w-24 rounded bg-black/[0.05]" />
        <div className="h-12 rounded-xl bg-black/[0.025]" />
        <div className="h-12 rounded-xl bg-black/[0.025]" />
        <div className="h-12 rounded-xl bg-black/[0.025]" />
      </div>
    </div>
  );
}
