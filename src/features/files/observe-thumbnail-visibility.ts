export function observeThumbnailVisibility(element: HTMLElement, change: (visible: boolean) => void) {
  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.target === element) change(entry.isIntersecting);
    }, { rootMargin: "0px", threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }
  // Older browsers and non-layout test environments still use bounded eager
  // admission. Native lazy images must not occupy a slot while remaining idle.
  let frame: number | undefined;
  const check = () => {
    frame = undefined;
    const box = element.getBoundingClientRect();
    change(box.bottom >= 0 && box.right >= 0 && box.top <= window.innerHeight && box.left <= window.innerWidth);
  };
  const schedule = () => { if (frame === undefined) frame = window.requestAnimationFrame(check); };
  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  check();
  return () => {
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
  };
}
