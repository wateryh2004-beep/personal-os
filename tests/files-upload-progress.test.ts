import { describe, expect, it } from "vitest";
import { createUploadProgress } from "@/features/files/upload-progress";

describe("byte-weighted batch progress", () => {
  it("tracks unequal files across interleaved progress events without moving backwards", () => {
    const progress = createUploadProgress([100, 300]);
    expect(progress(0, 100)).toBe(25);
    expect(progress(1, 50)).toBe(63);
    expect(progress(1, 20)).toBe(63);
    expect(progress(1, 100)).toBe(100);
    expect(progress(0, 100)).toBe(100);
  });
  it("clamps invalid events and handles empty batches", () => {
    const progress = createUploadProgress([100]);
    expect(progress(0, -20)).toBe(0);
    expect(progress(0, 30)).toBe(30);
    for (const [index, value] of [[0, NaN], [-1, 100], [1, 100], [0.5, 100]]) expect(progress(index, value)).toBe(30);
    expect(progress(0, 200)).toBe(100);
    expect(createUploadProgress([])(0, 100)).toBe(0);
    expect(createUploadProgress([0])(0, 100)).toBe(0);
  });
});
