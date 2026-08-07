import { describe, expect, it } from "vitest";
import { WORKSPACE_SESSION_TTL_MS, createWorkspaceSnapshot, parseWorkspaceSnapshot } from "@/lib/workspace-session";

describe("workspace session snapshots", () => {
  it("keeps a snapshot for the configured short recovery window", () => {
    const snapshot = createWorkspaceSnapshot({ text: "未发送内容" }, 100);
    expect(snapshot.expiresAt).toBe(100 + WORKSPACE_SESSION_TTL_MS);
    expect(parseWorkspaceSnapshot(JSON.stringify(snapshot), 101)).toEqual({ text: "未发送内容" });
  });

  it("rejects expired and malformed snapshots", () => {
    expect(parseWorkspaceSnapshot(JSON.stringify({ value: { text: "x" }, expiresAt: 100 }), 100)).toBeNull();
    expect(parseWorkspaceSnapshot("not-json")).toBeNull();
  });
});
