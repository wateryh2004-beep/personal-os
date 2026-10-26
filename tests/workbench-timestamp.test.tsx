// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WorkbenchTimestamp } from "@/components/workbench/workbench-timestamp";
import { formatDateTime } from "@/lib/format";
function render(value: string, timeZone = "Asia/Shanghai") {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<WorkbenchTimestamp value={value} timeZone={timeZone} />);
  return host;
}
it("shows an actual instant as Chinese local date/time and retains its original machine value", () => {
  const value = "2026-10-24T02:30:00Z";
  const host = render(value);
  expect(host.textContent).toBe(formatDateTime(value, "Asia/Shanghai"));
  expect(host.textContent).toContain("10:30");
  expect(host.textContent).not.toContain("T02:30");
  expect(host.querySelector('time')?.getAttribute('datetime')).toBe(value);
  expect(host.querySelector('time')?.getAttribute('aria-label')).toContain("本地时间，Asia/Shanghai");
  expect(render(value, "America/Los_Angeles").textContent).toBe(formatDateTime(value, "America/Los_Angeles"));
});
it("preserves a date-only ledger day across zones without inventing an instant", () => {
  for (const timezone of ["Asia/Shanghai", "America/Los_Angeles"]) {
    const host = render("2026-10-24", timezone);
    expect(host.textContent).toBe("2026年10月24日");
    expect(host.querySelector('time')?.getAttribute('datetime')).toBe("2026-10-24");
    expect(host.querySelector('time')?.hasAttribute('title')).toBe(false);
  }
});
it("leaves invalid or unknown metadata unchanged instead of guessing a date", () => {
  for (const value of ["待核对", "2026-02-30", "2026-10-24T02:30:00", "12345"]) {
    const host = render(value);
    expect(host.textContent).toBe(value);
    expect(host.querySelector('time')).toBeNull();
  }
});
