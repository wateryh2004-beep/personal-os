import { describe, expect, it } from "vitest";
import { runUploadBatch } from "@/features/files/upload-batch";

describe("Bounded file uploads", () => {
  it("runs at most three uploads together and retains successful files after a failure", async () => {
    let active = 0, maximum = 0;
    const completed: number[] = [];
    const result = await runUploadBatch([0, 1, 2, 3, 4, 5], async (item) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      if (item === 2) throw new Error("网络中断");
      completed.push(item);
    });
    expect(maximum).toBe(3);
    expect(completed.sort()).toEqual([0, 1, 3, 4, 5]);
    expect(result).toEqual({ uploaded: 5, errors: [{ index: 2, message: "网络中断" }] });
  });

  it("handles empty selections and a single file", async () => {
    expect(await runUploadBatch([], async () => { throw new Error("must not run"); })).toEqual({ uploaded: 0, errors: [] });
    expect(await runUploadBatch(["file"], async () => {})).toEqual({ uploaded: 1, errors: [] });
  });
});
