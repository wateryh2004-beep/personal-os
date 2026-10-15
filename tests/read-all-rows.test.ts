import { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { readAllRows } from "@/lib/supabase/read-all-rows";

describe("complete internal collections", () => {
  it("reads beyond the provider row cap and stops after an empty final page", async () => {
    const data = Array.from({ length: 1500 }, (_, id) => ({ id }));
    const range = vi.fn(async (from: number, to: number) => ({ data: data.slice(from, to + 1), error: null }));
    expect((await readAllRows({ range })).data).toEqual(data);
    expect(range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499], [1500, 1999]]);
  });
  it("does not turn a failed later page into an apparently complete list", async () => {
    const failure = new PostgrestError({ code: "offline", message: "synthetic", details: "", hint: "" });
    const range = vi.fn(async (from: number) => from ? { data: null, error: failure } : { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null });
    expect(await readAllRows({ range })).toEqual({ data: null, error: failure });
  });
});
