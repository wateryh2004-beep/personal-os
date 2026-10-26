/** FullCalendar v6 public sizing API: https://legacy.fullcalendar.io/v6/updateSize
 * FullCalendar's public updateSize must follow a real pane or glyph-size
 * change. Its own window-resize listener cannot see text-only enlargement or a
 * workbench divider. Observe measured geometry, coalesce into one frame, and
 * skip unchanged measurements so updateSize cannot form a feedback loop. */
export function observeCalendarGeometry(root: HTMLElement, updateSize: () => void) {
  if (typeof ResizeObserver === "undefined") return () => {};
  let frame: number | undefined;
  let label: HTMLElement | null = null;
  let previous = "";
  let force = false;
  let disposed = false;
  const schedule = () => {
    if (disposed || frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (disposed) return;
      if (!root.isConnected || !root.clientWidth || !root.clientHeight) { previous = ""; return; }
      const currentLabel = root.querySelector<HTMLElement>(".fc-timegrid-slot-label-cushion") ?? root.querySelector<HTMLElement>(".fc-col-header-cell-cushion");
      if (label !== currentLabel) {
        if (label) observer.unobserve(label);
        label = currentLabel;
        if (label) observer.observe(label);
      }
      const measured = [root.clientWidth, root.clientHeight, label?.offsetWidth ?? 0, label?.offsetHeight ?? 0].join(":");
      if (!force && measured === previous) return;
      previous = measured;
      force = false;
      updateSize();
    });
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(root);
  const fontsChanged = () => { force = true; schedule(); };
  document.fonts?.addEventListener("loadingdone", fontsChanged);
  schedule();
  return () => {
    disposed = true;
    observer.disconnect();
    document.fonts?.removeEventListener("loadingdone", fontsChanged);
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}
