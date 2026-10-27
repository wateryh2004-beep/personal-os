import { expect, it } from "vitest";
import { containedTransform, containedPaneStart } from "@/lib/motion/contained-transform";
const sizes = [[360, 600], [390, 640], [768, 600], [1440, 900]];
function edges(rest: { left: number; top: number; width: number; height: number }, transform: { x: number; y: number; scaleX: number; scaleY: number }, originY: number, amount: number) {
  const sx = 1 + (transform.scaleX - 1) * amount, sy = 1 + (transform.scaleY - 1) * amount;
  const left = rest.left + rest.width * (1 - sx) / 2 + transform.x * amount;
  const top = rest.top + rest.height * (1 - sy) * originY + transform.y * amount;
  return { left, top, right: left + rest.width * sx, bottom: top + rest.height * sy };
}
it.each(sizes)("contains every forward/reverse/interrupted frame at %ix%i with the real mobile bottom transform origin", (width, height) => {
  for (const mobile of [true, false]) for (const offset of [false, true]) for (const direction of [-1, 0, 1]) {
    const viewport = { left: offset ? 17 : 0, top: offset ? 73 : 0, width: width - (offset ? 50 : 0), height: height - (offset ? 160 : 0) };
    const rest = { left: viewport.left + (mobile ? 0 : 16), top: viewport.top + (mobile ? 24 : 16), width: viewport.width - (mobile ? 0 : 32), height: viewport.height - (mobile ? 24 : 32) };
    const originY = mobile ? 1 : .5;
    const transform = containedTransform(rest, viewport, { x: direction * width * 4, y: direction * height * 3, scaleX: .96, scaleY: mobile ? .96 : .12, originY });
    expect(transform).not.toBeNull(); if (!transform) throw Error("finite geometry rejected");
    for (const amount of [...Array.from({ length: 101 }, (_, index) => index / 100), .72, .31, .57, .02]) {
      const rect = edges(rest, transform, originY, amount);
      expect(rect.left).toBeGreaterThanOrEqual(viewport.left - 1e-9); expect(rect.top).toBeGreaterThanOrEqual(viewport.top - 1e-9);
      expect(rect.right).toBeLessThanOrEqual(viewport.left + viewport.width + 1e-9); expect(rect.bottom).toBeLessThanOrEqual(viewport.top + viewport.height + 1e-9);
    }
  }
});
it("rejects invalid geometry and constrains the actual f200 short-sheet +24px counterexample", () => {
  const rest = { left: 0, top: 24, width: 360, height: 576 }, viewport = { left: 0, top: 0, width: 360, height: 600 };
  const result = containedTransform(rest, viewport, { x: 0, y: 24, scaleX: .96, scaleY: .96, originY: 1 });
  expect(result?.y).toBe(0); expect(edges(rest, result!, 1, 1).bottom).toBe(600);
  expect(containedTransform({ ...rest, width: 0 }, viewport, { x: 0, y: 0, scaleX: 1, scaleY: 1 })).toBeNull();
  expect(containedTransform(rest, viewport, { x: Infinity, y: 0, scaleX: 1, scaleY: 1 })).toBeNull();
  expect(containedTransform(rest, viewport, { x: 0, y: 0, scaleX: -1, scaleY: 1 })).toBeNull();
  expect(containedTransform({ ...rest, left: -10 }, viewport, { x: 0, y: 0, scaleX: 1, scaleY: 1 })).toBeNull();
});
it.each(sizes)("clamps a stale pre-resize Workbench FLIP footprint inside the current content bounds at %ix%i", (width, height) => {
  const left = width >= 768 ? 215 : 0, container = { left, top: 110, width: width - left, height };
  const target = { ...container, width: container.width * .58, left: left + container.width * .42 };
  for (const from of [{ ...container, left: -300, width: 1600 }, { ...container, left: 1800, width: 200 }, { ...container, left: 0 }]) {
    const start = containedPaneStart(from, target, container)!;
    expect(start).not.toBeNull();
    for (let index = 0; index <= 100; index++) {
      const t = index / 100, x = start.x * t, scale = 1 + (start.scaleX - 1) * t;
      expect(target.left + x).toBeGreaterThanOrEqual(container.left - 1e-9);
      expect(target.left + x + target.width * scale).toBeLessThanOrEqual(container.left + container.width + 1e-9);
    }
  }
});
it("keeps the CSS-only first frame contained before any ref/layout-effect origin update", async () => {
  const { readFile } = await import("node:fs/promises"); const css = await readFile("src/app/editorial-notes-files.css", "utf8");
  const normal = /\[data-slot="dialog-content"\]\.file-preview-surface \{([^}]+)\}/.exec(css)![1];
  const mobile = /@media\(max-width:639px\)\s*\{\s*\[data-slot="dialog-content"\]\.file-preview-surface \{([^}]+)\}/.exec(css)![1];
  expect(normal).toContain("--file-origin-y:0px"); expect(normal).toContain("--file-origin-scale-y:.96"); expect(mobile).toContain("transform-origin:50% 100%");
  const rect = edges({ left: 0, top: 24, width: 360, height: 576 }, { x: 0, y: 0, scaleX: .96, scaleY: .96 }, 1, 1);
  expect(rect.bottom).toBe(600); expect(rect.top).toBeGreaterThanOrEqual(0);
});
