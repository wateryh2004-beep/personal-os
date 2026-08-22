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

  it("lets the RSC route own speculative prefetch without a duplicate API read", async () => {
    const fetcher = vi.fn().mockResolvedValue({ version: 2 });
    const resource = createWorkspaceResource(
      "test:route-owned",
      fetcher,
      60_000,
      { prefetchStrategy: "route-owned" },
    );

    await expect(resource.prefetch()).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();

    resource.set({ version: 1 });
    await expect(resource.prefetch()).resolves.toEqual({ version: 1 });
    expect(fetcher).not.toHaveBeenCalled();

    resource.invalidate();
    await expect(resource.revalidate()).resolves.toEqual({ version: 2 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
