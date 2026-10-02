// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { clearWorkspaceResources, createWorkspaceResource, useWorkspaceResource, useWorkspaceResourceLease } from "@/lib/workspace-resource-cache";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); clearWorkspaceResources(); sessionStorage.clear(); });

it("refreshes a mounted workspace after server revision without losing draft or remounting", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce("version-1").mockResolvedValueOnce("version-2");
  const resource = createWorkspaceResource<string>("boundary-revision", fetcher, 60_000);
  let mounts = 0;
  function Child() {
    const { data } = useWorkspaceResource(resource, "test");
    useEffect(() => { mounts += 1; }, []);
    return createElement("section", null, createElement("input", { defaultValue: "" }), createElement("output", null, data));
  }
  const render = async (revision: string) => { await act(async () => root.render(createElement(WorkspaceIdentityBoundary, { ownerId: "owner-revision", revision }, createElement(Child)))); };
  await render("a");
  const input = container.querySelector("input")!;
  input.value = "unfinished draft";
  await render("b");
  expect(container.querySelector("output")?.textContent).toBe("version-2");
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("unfinished draft");
  expect(mounts).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("never renders old-owner data for a new owner and rejects old asynchronous writes", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce("a-private").mockResolvedValueOnce("b-private");
  const resource = createWorkspaceResource<string>("boundary-owner", fetcher, 60_000);
  const renders: string[] = [];
  let publish!: () => void;
  function Child({ owner }: { owner: string }) {
    const { data } = useWorkspaceResource(resource, "test");
    const lease = useWorkspaceResourceLease(resource);
    publish = () => lease.mutate(() => "a-late-callback");
    renders.push(`${owner}:${data ?? "empty"}`);
    return createElement("output", null, data);
  }
  const render = async (owner: string) => { await act(async () => root.render(createElement(WorkspaceIdentityBoundary, { ownerId: owner, revision: "same" }, createElement(Child, { owner })))); };
  await render("a");
  const oldPublish = publish;
  await render("b");
  await act(async () => oldPublish());
  expect(renders).not.toContain("b:a-private");
  expect(resource.get().data).toBe("b-private");
  expect(container.textContent).toBe("b-private");
});
