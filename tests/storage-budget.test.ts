import { describe, expect, it } from "vitest";
import { storageBudget } from "@/features/files/storage-inspection/presentation";
describe("user-defined capacity planning", () => {
  it("never invents a default capacity or uses partial totals", () => {
    for (const budget of ["", " ", "0", "-1", "not a number", "Infinity", "1e100"]) expect(storageBudget(100, budget, true)).toBeNull();
    expect(storageBudget(100, "10", false)).toBeNull();
    expect(storageBudget(null, "10", true)).toBeNull();
  });
  it("calculates remaining bytes in GiB only for a complete snapshot", () => {
    expect(storageBudget(1024 ** 3, "2", true)).toEqual({ total: 2 * 1024 ** 3, remaining: 1024 ** 3, excess: 0, percent: 50 });
    expect(storageBudget(0, "2", true)?.percent).toBe(0);
  });
  it("labels excess rather than a negative remaining value", () => {
    expect(storageBudget(3 * 1024 ** 3, "2", true)).toEqual({ total: 2 * 1024 ** 3, remaining: 0, excess: 1024 ** 3, percent: 100 });
  });
});
