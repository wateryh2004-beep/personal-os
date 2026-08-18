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
const persistence = readFileSync(
  new URL("../src/features/assistant/persistence.ts", import.meta.url),
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
    expect(action).toContain("确认操作已显示在抽屉底部");
    expect(action).not.toContain("下方的确认按钮");
  });

  it("never reports an empty model response as a generated preview", () => {
    expect(action).toContain("const suggestion = result.text.trim()");
    expect(action).toContain("AI 没有返回可预览的内容");
    expect(action).toContain("suggestion,");
  });

  it("restores the document discussion from the database and keeps discussion separate from writing", () => {
    expect(assistant).toContain("/api/assistant/runs?noteId=");
    expect(assistant).not.toContain("personal-os:note-ai:run:");
    expect(assistant).toContain('"discussSelection", "讨论"');
    expect(assistant).toContain("!discussion");
    expect(persistence).toContain("getLatestNoteAgentRun");
    expect(persistence).toContain("persistedMessageMaxChars = 384_000");
  });

  it("uses a long-document budget and provides a continuation after a length stop", () => {
    expect(action).toContain("max(800_000)");
    expect(action).toContain("continuationAfter");
    expect(action).toContain("response.truncated = true");
    expect(assistant).toContain("从截断处继续");
  });
});
