import { afterEach, expect, it, vi } from "vitest";
import { experienceChunkSize } from "@/features/experience-library/chunks";
import { uploadExperienceChunks } from "@/features/experience-library/chunks-client";
afterEach(() => vi.unstubAllGlobals());
it("uploads two bounded chunks at once and reports completed chunks", async () => {
  const releases: Record<number, () => void> = {};
  let active = 0, peak = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const index = Number((init.headers as Record<string, string>)["X-Experience-Chunk-Index"]);
    active += 1; peak = Math.max(peak, active);
    await new Promise<void>((resolve) => { releases[index] = resolve; });
    active -= 1; return Response.json({ ok: true });
  }));
  const file = { size: experienceChunkSize * 3, slice: () => new Blob(["chunk"]) } as File;
  const progress: number[] = [];
  const task = uploadExperienceChunks(file, "doc", new AbortController().signal, (done) => progress.push(done));
  expect(Object.keys(releases)).toHaveLength(2);
  releases[1](); await vi.waitFor(() => expect(Object.keys(releases)).toHaveLength(3));
  releases[0](); releases[2](); await task;
  expect(peak).toBe(2); expect(progress).toEqual([1, 2, 3]);
});
it("aborts peer chunks and never reports a complete upload after one fails", async () => {
  const calls: number[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const index = Number((init.headers as Record<string, string>)["X-Experience-Chunk-Index"]); calls.push(index);
    if (index === 0) return Response.json({ error: "分片失败" }, { status: 503 });
    return await new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  }));
  const file = { size: experienceChunkSize * 3, slice: () => new Blob(["chunk"]) } as File;
  const progress = vi.fn();
  await expect(uploadExperienceChunks(file, "doc", new AbortController().signal, progress)).rejects.toThrow("分片失败");
  expect(calls).toEqual([0, 1]); expect(progress).not.toHaveBeenCalled();
});
