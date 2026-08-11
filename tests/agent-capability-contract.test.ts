import { describe, expect, it } from "vitest";
import { capabilityManifest, assistantToolRegistry, definitionsForNames } from "@/features/assistant/tools/registry";
import { formatOsManifestForModel } from "@/features/assistant/kernel/os-manifest";

describe("Agent capability contract", () => {
  it("derives the manifest only from registered executable tools", () => {
    const names = new Set(assistantToolRegistry.map((tool) => tool.name));
    for (const capabilityModule of capabilityManifest()) for (const tool of capabilityModule.tools) expect(names.has(tool.name)).toBe(true);
    const manifest = formatOsManifestForModel();
    expect(manifest).toContain("读取:listShopping");
    expect(manifest).toContain("读取:listTrips");
  });

  it("fails closed for an unregistered pseudo tool", () => {
    expect(definitionsForNames(["search_shopping"])).toEqual([]);
  });
});
