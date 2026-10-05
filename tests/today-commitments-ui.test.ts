import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/components/today/today-commitments.tsx"), "utf8");

describe("Today commitment interaction contract", () => {
  it("keeps the surface bounded, evidence-only, and usable on narrow screens", () => {
    expect(source).toContain("const DEFAULT_VISIBLE = 5");
    expect(source).toContain("if (!commitments.length) return null");
    expect(source).toContain("line-clamp-2 text-[16px] leading-6");
    expect(source).toContain("更多操作");
  });

  it("keeps all landing actions behind existing task, calendar, or Inbox boundaries", () => {
    expect(source).toContain("deferMicrosoftTodoTaskAction");
    expect(source).toContain('openCreate("task"');
    expect(source).toContain('openCreate("calendar"');
    expect(source).toContain('openCreate("inbox"');
  });
});
