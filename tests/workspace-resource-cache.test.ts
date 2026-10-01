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

it("detaches pre-mutation reads so a late stale response cannot replace saved data", async () => {
  let oldRead!: (value: { version: number }) => void;
  let freshRead!: (value: { version: number }) => void;
  const fetcher = vi.fn()
    .mockImplementationOnce(() => new Promise((resolve) => { oldRead = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { freshRead = resolve; }));
  const resource = createWorkspaceResource<{ version: number }>("test:mutation-race", fetcher, 0);
  resource.set({ version: 1 });
  const beforeMutation = resource.revalidate();
  resource.mutate(() => ({ version: 2 }));
  resource.invalidate();
  const afterMutation = resource.revalidate({ force: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  oldRead({ version: 1 });
  await beforeMutation;
  expect(resource.get().data).toEqual({ version: 2 });
  freshRead({ version: 3 });
  await afterMutation;
  expect(resource.get().data).toEqual({ version: 3 });
});
