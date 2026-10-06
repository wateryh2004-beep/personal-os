import { describe, expect, it, vi } from "vitest";
import { createThumbnailLoadQueue } from "@/features/files/thumbnail-load-queue";

describe("photo thumbnail admission queue", () => {
  it("admits three requests and gives released slots to waiting requests in order", () => {
    const enqueue = createThumbnailLoadQueue();
    const starts: number[] = [];
    const release = Array.from({ length: 6 }, (_, i) => enqueue(() => { starts.push(i); }));
    expect(starts).toEqual([0, 1, 2]);
    release[1]();
    expect(starts).toEqual([0, 1, 2, 3]);
    release[1]();
    expect(starts).toEqual([0, 1, 2, 3]);
    release[0]();
    expect(starts).toEqual([0, 1, 2, 3, 4]);
    release.forEach(done => done());
    expect(starts).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("drops a cancelled waiting card without releasing an active slot", () => {
    const enqueue = createThumbnailLoadQueue();
    const active = Array.from({ length: 3 }, () => enqueue(() => {}));
    const removed = vi.fn();
    const later = vi.fn();
    const cancel = enqueue(removed);
    enqueue(later);
    cancel();
    expect(removed).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
    active[0]();
    expect(later).toHaveBeenCalledOnce();
  });

  it("supports synchronous completions and does not jam if a start callback fails", () => {
    const enqueue = createThumbnailLoadQueue();
    for (let i = 0; i < 100; i++) enqueue(done => done());
    enqueue(() => { throw new Error("start failed"); });
    const start = vi.fn();
    enqueue(start);
    expect(start).toHaveBeenCalledOnce();
  });
});
