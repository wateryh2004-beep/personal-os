import { expect, it } from "vitest";
import { leisureBackHref, leisureBrowseQuery, leisureDetailHref, leisureNeighbors, normalizeLeisureFrom, readLeisureBrowse } from "@/features/leisure/browse";
import type { LeisureSummary } from "@/features/leisure/types";
const empty = readLeisureBrowse(new URLSearchParams());
it("bounds filter input and never accepts a redirect target", () => {
  const raw = "kind=game&minutes=30&setting=home&company=together&budget=free&url=https://evil.example&from=//evil.example";
  expect(leisureBackHref(raw)).toBe("/leisure?kind=game&minutes=30&setting=home&company=together&budget=free#leisure-collection");
  expect(leisureBackHref("https://evil.example")).toBe("/leisure");
  expect(leisureBackHref("kind=unknown&minutes=-1&setting=private&budget=paid")).toBe("/leisure?budget=paid#leisure-collection");
  expect(leisureBrowseQuery(empty)).toBe("");
});
it("preserves filters across detail, next, and fixture return URLs", () => {
  const browse = readLeisureBrowse(new URLSearchParams("kind=music"));
  expect(leisureDetailHref("/leisure/", "123", browse)).toBe("/leisure/123?from=kind%3Dmusic");
  expect(leisureDetailHref("/mobile-native-e2e?scene=leisure&item=", "artwork-26", browse)).toBe("/mobile-native-e2e?scene=leisure&item=artwork-26&from=kind%3Dmusic");
  expect(leisureBackHref("kind=music", "/mobile-native-e2e?scene=leisure&mode=gallery")).toBe("/mobile-native-e2e?scene=leisure&mode=gallery&kind=music#leisure-collection");
});
it("only links real adjacent items within the current filtered collection", () => {
  const items = [{ id: "a", kind: "music", duration_minutes: 30 }, { id: "b", kind: "game", duration_minutes: 20 }, { id: "c", kind: "music", duration_minutes: 40 }, { id: "d", kind: "music", duration_minutes: null }] as LeisureSummary[];
  expect(leisureNeighbors(items, "a", readLeisureBrowse(new URLSearchParams("kind=music"))).map((x) => [x.direction, x.item.id])).toEqual([["previous", "d"], ["next", "c"]]);
  expect(leisureNeighbors(items, "a", readLeisureBrowse(new URLSearchParams("kind=music&minutes=60"))).map((x) => x.item.id)).toEqual(["c"]);
  expect(leisureNeighbors(items, "a", readLeisureBrowse(new URLSearchParams("kind=music&minutes=30")))).toEqual([]);
  expect(leisureNeighbors(items, "not-in-collection", empty)).toEqual([]);
});

it("normalizes repeated, malformed, and excessive return-context input safely", () => {
  expect(leisureBackHref(["kind=film", "kind=game"])).toBe("/leisure?kind=film#leisure-collection");
  expect(normalizeLeisureFrom([null, "kind=game"])).toBe("");
  expect(normalizeLeisureFrom({ from: "kind=game" })).toBe("");
  expect(normalizeLeisureFrom("kind=film&junk=" + "x".repeat(1024))).toBe("");
});
