import { describe, expect, it, vi } from "vitest";
import { createReadingProgressQueue, readingProgressSchema, type ReadingSaveResult } from "@/features/files/reading-progress";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const progress = (page: number, revision: number) => ({ page, totalPages: 9, revision, updatedAt: "now" });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const options = () => ({ documentId: id, sourceVersion: id, totalPages: 9, revision: 1, report: vi.fn() });
describe("reading position ordered writes", () => {
  it("bounds page numbers and rejects caller-supplied identity", () => {
    const input = { documentId: id, sourceVersion: id, page: 9, totalPages: 9, expectedRevision: 0, mutationId: id };
    expect(readingProgressSchema.safeParse(input).success).toBe(true);
    for (const invalid of [{ ...input, page: 10 }, { ...input, totalPages: 501 }, { ...input, page: 1.2 }, { ...input, userId: id }])
      expect(readingProgressSchema.safeParse(invalid).success).toBe(false);
  });
  it("serializes rapid navigation and persists intentional backwards reading", async () => {
    let resolve!: (value: ReadingSaveResult) => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<ReadingSaveResult>(yes => { resolve = yes; }))
      .mockResolvedValue({ status: "saved", progress: progress(1, 3) });
    const queue = createReadingProgressQueue({ ...options(), save });
    queue.record(2); queue.record(3); queue.record(1);
    expect(save).toHaveBeenCalledTimes(1);
    resolve({ status: "saved", progress: progress(2, 2) }); await tick();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({ page: 1, expectedRevision: 2 });
    queue.record(1); await tick(); expect(save).toHaveBeenCalledTimes(2);
  });
  it("retries the exact mutation once after lost reply", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("lost")).mockResolvedValue({ status: "saved", progress: progress(2, 2) });
    createReadingProgressQueue({ ...options(), save }).record(2); await tick();
    expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]);
  });
  it("never auto-rebases a conflict or silently overwrites newer device state", async () => {
    const save = vi.fn().mockResolvedValue({ status: "conflict", progress: progress(5, 5) });
    const queue = createReadingProgressQueue({ ...options(), save });
    queue.record(2); await tick(); queue.record(3); await tick(); expect(save).toHaveBeenCalledTimes(1);
    queue.resolve(5); queue.record(3); await tick(); expect(save.mock.calls[1][0]).toMatchObject({ page: 3, expectedRevision: 5 });
  });
});
