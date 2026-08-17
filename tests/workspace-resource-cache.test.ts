import { describe, expect, it, vi } from "vitest";
import { createWorkspaceResource } from "@/lib/workspace-resource-cache";

describe("workspace resource cache", () => {
  it("deduplicates a prefetch and a workspace consumer", async () => {
    let resolve!: (value: { version: number }) => void;
    const fetcher = vi.fn(() => new Promise<{ version: number }>((done) => { resolve = done; }));
    const resource = createWorkspaceResource("test:dedup", fetcher, 60_000);

    const prefetch = resource.prefetch();
    const consumer = resource.revalidate();
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolve({ version: 1 });
    await expect(prefetch).resolves.toEqual({ version: 1 });
    await expect(consumer).resolves.toEqual({ version: 1 });
    expect(resource.get().data).toEqual({ version: 1 });
  });

  it("keeps a stale snapshot while background reconciliation is pending", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ version: 1 })
      .mockResolvedValueOnce({ version: 2 });
    const resource = createWorkspaceResource("test:stale", fetcher, 0);

    await resource.prefetch();
    const reconciliation = resource.revalidate();
    expect(resource.get().data).toEqual({ version: 1 });
    await expect(reconciliation).resolves.toEqual({ version: 2 });
    expect(resource.get().data).toEqual({ version: 2 });
  });
});
