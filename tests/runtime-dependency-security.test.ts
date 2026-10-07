import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const patches = [
  ["next", "16.3.6", "MIT"],
  ["eslint-config-next", "16.3.6", "MIT"],
  ["sharp", "0.35.5", "Apache-2.0"],
  ["maplibre-gl", "6.4.1", "BSD-3-Clause"],
  ["@xmldom/xmldom", "0.8.15", "MIT"],
] as const;

describe("bounded October 2026 runtime security patches", () => {
  it.each(patches)("installs the reviewed %s patch and retains its license", (name, version, license) => {
    const installed = JSON.parse(readFileSync(path.join(process.cwd(), "node_modules", name, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8"));
    expect(installed).toMatchObject({ version, license });
    expect(lock.packages[`node_modules/${name}`]).toMatchObject({ version, license });
  });

  it("loads the patched native image dependencies, not stale prebuilt binaries", () => {
    // These are the prebuilt binaries actually loaded by Node after npm ci.
    // Changing Sharp/native packages requires reviewing these security floors.
    const atLeast = (actual: string | undefined, floor: string) => {
      expect(actual).toBeDefined();
      const a = actual!.split(".").map(Number), b = floor.split(".").map(Number);
      const firstDifference = a.findIndex((part, index) => part !== b[index]);
      return firstDifference < 0 || a[firstDifference] > b[firstDifference];
    };
    expect(sharp.versions.sharp).toBe("0.35.5");
    expect(atLeast(sharp.versions.heif, "1.23.2")).toBe(true);
    expect(atLeast(sharp.versions.rsvg, "2.63.2")).toBe(true);
  });
});
