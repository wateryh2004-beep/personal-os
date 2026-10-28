import { expect, it } from "vitest";
import { matchesExperienceImageSignature } from "@/features/experience-library/image-signature";

it("checks raster bytes and rejects SVG or HTML disguised by a filename and MIME", () => {
  expect(matchesExperienceImageSignature(Uint8Array.from([137,80,78,71,13,10,26,10]), "image/png")).toBe(true);
  expect(matchesExperienceImageSignature(Uint8Array.from([255,216,255,0]), "image/jpeg")).toBe(true);
  expect(matchesExperienceImageSignature(new TextEncoder().encode("GIF89a"), "image/gif")).toBe(true);
  expect(matchesExperienceImageSignature(new TextEncoder().encode("RIFF0000WEBP"), "image/webp")).toBe(true);
  expect(matchesExperienceImageSignature(new TextEncoder().encode("0000ftypavif0000"), "image/avif")).toBe(true);
  for (const text of ["<svg onload=alert(1)>", "<!doctype html>"]) {
    expect(matchesExperienceImageSignature(new TextEncoder().encode(text), "image/png")).toBe(false);
    expect(matchesExperienceImageSignature(new TextEncoder().encode(text), "image/avif")).toBe(false);
  }
});
