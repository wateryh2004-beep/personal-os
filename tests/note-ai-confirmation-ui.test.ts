import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assistant = readFileSync(
  new URL("../src/components/notes/note-ai-assistant.tsx", import.meta.url),
  "utf8",
);
const action = readFileSync(
  new URL("../src/features/notes/ai-actions.ts", import.meta.url),
  "utf8",
);

describe("Notes AI confirmation UI", () => {
  it("keeps generated-result confirmation in the fixed sidecar footer", () => {
    expect(assistant).toContain('footer={');
    expect(assistant).toContain('AI 结果待确认');
    expect(assistant).toContain('确认并{insertLabel}');
    expect(assistant).toContain('onClick={() => apply("replace")}');
    expect(assistant).toContain('onClick={() => apply("insert")}');
  });

  it("directs users to the visible fixed confirmation area", () => {
    expect(action).toContain("底部固定确认区");
    expect(action).not.toContain("下方的确认按钮");
  });
});
