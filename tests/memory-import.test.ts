import { describe, expect, it } from "vitest";
import { codexMemoryImportSchema } from "@/features/memory/schemas";

const profileItem = {
  memoryType: "profile" as const,
  memoryKey: "identity.communication",
  title: "沟通身份",
  content: "默认使用中文，英文名使用 Hang Yu。",
  aiVisibility: "normal" as const,
  confidence: 100,
};

describe("codexMemoryImportSchema", () => {
  it("接受经过确认的结构化长期记忆", () => {
    const result = codexMemoryImportSchema.parse({
      sourceLabel: "Codex context export",
      sourceExportedAt: "2026-08-08T12:00:00.000Z",
      items: [profileItem],
    });

    expect(result.items[0].memoryKey).toBe("identity.communication");
  });

  it("要求当前状态包含有效期或复核时间", () => {
    const result = codexMemoryImportSchema.safeParse({
      sourceLabel: "Codex context export",
      items: [
        {
          ...profileItem,
          memoryType: "working",
          memoryKey: "career.current",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("拒绝不可追踪的自由格式 memory key", () => {
    const result = codexMemoryImportSchema.safeParse({
      sourceLabel: "Codex context export",
      items: [{ ...profileItem, memoryKey: "包含 空格" }],
    });

    expect(result.success).toBe(false);
  });
});
