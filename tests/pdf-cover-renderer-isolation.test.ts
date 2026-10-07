import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ children: [] as ChildProcess[], failSpawn: false }));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return { ...actual, spawn: (...args: Parameters<typeof actual.spawn>) => {
    if (state.failSpawn) {
      const missing = new EventEmitter() as ChildProcess;
      missing.kill = vi.fn(() => false);
      missing.send = vi.fn(() => true) as ChildProcess["send"];
      queueMicrotask(() => missing.emit("error", new Error("synthetic spawn failure")));
      return missing;
    }
    const child = actual.spawn(process.execPath, [path.join(process.cwd(), "tests/fixtures/pdf-covers/blocked-worker.mjs")], args[2]);
    state.children.push(child);
    return child;
  } };
});
vi.mock("@/features/files/pdf-cover-policy", async (original) => ({
  ...await original<object>(), PDF_COVER_RENDER_TIMEOUT_MS: 300,
}));

import { renderPdfCover } from "@/lib/adapters/pdf-cover-renderer";

afterEach(() => {
  state.children.splice(0).forEach((child) => { if (child.exitCode === null) child.kill("SIGKILL"); });
  state.failSpawn = false;
});

describe("PDF renderer process lifecycle", () => {
  const input = Buffer.from("%PDF-1.7\nsynthetic process-control fixture");

  it("hard-kills non-cooperative CPU work before rejecting its deadline", async () => {
    await expect(renderPdfCover(input)).rejects.toThrow("pdf_cover_timeout");
    const child = state.children[0];
    expect(child.signalCode).toBe("SIGKILL");
    expect(() => process.kill(child.pid!, 0)).toThrow();
  });

  it("limits local concurrency and releases its slot only after abort closes the process", async () => {
    const controller = new AbortController();
    const running = renderPdfCover(input, controller.signal);
    const rejection = expect(running).rejects.toThrow("pdf_cover_aborted");
    await expect(renderPdfCover(input)).rejects.toThrow("pdf_cover_renderer_busy");
    controller.abort();
    await rejection;
    expect(state.children[0].signalCode).toBe("SIGKILL");
    expect(() => process.kill(state.children[0].pid!, 0)).toThrow();
    await expect(renderPdfCover(input)).rejects.toThrow("pdf_cover_timeout");
  });

  it("settles a failed spawn even without a close event", async () => {
    state.failSpawn = true;
    await expect(renderPdfCover(input)).rejects.toThrow("pdf_cover_unavailable");
    // Slot is available again and there are no timer/listener leaks.
    await expect(renderPdfCover(input)).rejects.toThrow("pdf_cover_unavailable");
  });
});
