export default function AppLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="space-y-8 motion-safe:animate-pulse"
    >
      <span className="sr-only">正在加载页面</span>
      <div className="space-y-3">
        <div className="h-7 w-32 rounded-sm bg-zinc-200" />
        <div className="h-4 w-56 rounded-sm bg-zinc-100" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-32 border bg-white" />
        <div className="h-32 border bg-white" />
        <div className="h-24 border bg-white" />
        <div className="h-24 border bg-white" />
      </div>
    </div>
  );
}
