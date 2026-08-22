import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("global overlay bundle boundaries", () => {
  it("keeps the command palette entrypoint lightweight", () => {
    const entry = source("src/components/search/global-command-palette.tsx");
    expect(entry).toContain("next/dynamic");
    expect(entry).toContain("global-command-palette-impl");
    expect(entry).not.toContain("useGlobalSearch");
    expect(entry).not.toContain("@/components/ui/command");
  });

  it("keeps cross-domain create actions out of the persistent shell", () => {
    const entry = source("src/components/shared/global-create-layer.tsx");
    expect(entry).toContain("next/dynamic");
    expect(entry).toContain("global-create-layer-impl");
    expect(entry).not.toContain("createMicrosoftTodoTaskAction");
    expect(entry).not.toContain("createCalendarEvent");
    expect(entry).not.toContain("createPurchaseItem");
    expect(entry).not.toContain("captureInboxItem");
  });
});
