import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Personal OS AI phase 2 contracts", () => {
  it("deduplicates identical read tool calls within one request", () => {
    const source = read("src/features/assistant/tools/index.ts");
    expect(source).toContain("const readMemo = new Map");
    expect(source).toContain("definition.risk !== \"read\"");
    expect(source).toContain("input.onDuplicateRead?.(name)");
  });

  it("streams sources and true first-text timing without a read-only agent run", () => {
    const route = read("src/app/api/assistant/route.ts");
    const governance = read("src/features/ai/governance.ts");
    expect(route).toContain("messageMetadata");
    expect(route).toContain('chunk.type === "text-delta"');
    expect(route).toContain("ttftMs");
    expect(route).toContain("completeAiRequestWithUsage");
    expect(governance).toContain("source_summary");
    expect(governance).toContain("telemetry");
  });

  it("connects selected Calendar and Tasks entities to the global agent", () => {
    const backlinks = read("src/components/links/entity-backlinks.tsx");
    const agent = read("src/components/assistant/global-agent.tsx");
    const runtime = read("src/features/assistant/runtime.ts");
    expect(backlinks).toContain('type !== "calendar_event" && type !== "todo_task"');
    expect(backlinks).toContain("publishAssistantContext");
    expect(agent).toContain("getAssistantContext()");
    expect(runtime).toContain('entity.type === "calendar_event"');
    expect(runtime).toContain('entity.type === "todo_task"');
  });

  it("renders read-only source metadata directly from streamed messages", () => {
    const agent = read("src/components/assistant/global-agent.tsx");
    expect(agent).toContain("useChat<AssistantUIMessage>");
    expect(agent).toContain("message.metadata?.sources");
    expect(agent).toContain("AssistantStreamSources");
  });
});
