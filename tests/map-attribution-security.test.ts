// @vitest-environment jsdom
import { AttributionControl, type Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

describe("shipped MapLibre attribution sanitizer", () => {
  it.each([
    '<details open onload="void 0" ontoggle="window.__unsafeAttribution = true">Synthetic source</details>',
    '<a onmouseover="void 0" onclick="window.__unsafeAttribution = true" href="javascript:void(0)">Synthetic source</a>',
  ])("strips adjacent dangerous attributes from third-party source attribution", (attribution) => {
    // Exercise the installed distribution's actual attribution control. The
    // minimal map double supplies metadata only; Chromium coverage uses a map.
    const map = {
      style: { tileManagers: { fixture: { used: true, getSource: () => ({ attribution }) } } },
      _getUIString: () => "Synthetic attribution",
      getCanvasContainer: () => document.body,
      on: vi.fn(), off: vi.fn(),
    } as unknown as MapLibreMap;
    const control = new AttributionControl({ compact: false,
      customAttribution: '<a href="https://example.test/credit">Synthetic credit</a>' });
    const element = control.onAdd(map);
    try {
      expect(element.textContent).toContain("Synthetic source");
      expect(element.querySelector('a[href="https://example.test/credit"]')).not.toBeNull();
      expect(element.querySelector("[onload], [ontoggle], [onmouseover], [onclick]")).toBeNull();
      expect(element.querySelector('a[href^="javascript:"]')).toBeNull();
    } finally { control.onRemove(); }
  });
});
