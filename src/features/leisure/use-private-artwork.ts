"use client";

import { useEffect, useState } from "react";
import { artworkImportRegistry } from "./artwork-import-registry";

type Sources = Record<string, string>;
let current: Sources = {};
let pending: Promise<Sources> | null = null;
let checkedAt = 0;
let generation = 0;
const refreshEvent = "leisure-private-artwork-refresh";

function loadSources() {
  if (pending) return pending;
  if (Date.now() - checkedAt < 60_000) return Promise.resolve(current);
  const requestedGeneration = generation;
  const request = fetch("/api/leisure/artwork", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(4_000) })
    .then(async (response) => {
      if (!response.ok) return {};
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("sources" in result) || !result.sources || typeof result.sources !== "object") return {};
      return Object.fromEntries(artworkImportRegistry.flatMap((entry) => {
        const route = `/api/leisure/artwork/${entry.id}`;
        return (result.sources as Sources)[entry.src] === route ? [[entry.src, route]] : [];
      }));
    }).catch(() => ({})).then((sources) => {
      if (requestedGeneration === generation) { current = sources; checkedAt = Date.now(); }
      return current;
    }).finally(() => { if (pending === request) pending = null; });
  pending = request;
  return request;
}

/** Official optimized artwork remains usable while the private manifest is unavailable. */
export function usePrivateLeisureArtworkSource(original: string | undefined) {
  const [sources, setSources] = useState<Sources>(() => current);
  useEffect(() => {
    if (!original || !artworkImportRegistry.some((entry) => entry.src === original)) return;
    let active = true;
    const update = () => { void loadSources().then((value) => { if (active) setSources(value); }); };
    update();
    window.addEventListener(refreshEvent, update);
    return () => { active = false; window.removeEventListener(refreshEvent, update); };
  }, [original]);
  return original ? sources[original] ?? original : undefined;
}

export function refreshPrivateLeisureArtwork() {
  generation += 1;
  pending = null;
  checkedAt = 0;
  window.dispatchEvent(new Event(refreshEvent));
}

export function isPrivateLeisureArtworkSource(src: string) {
  return artworkImportRegistry.some((entry) => src === `/api/leisure/artwork/${entry.id}`);
}

/** A custom loader keeps private requests same-origin; never use the public optimizer. */
export function privateLeisureArtworkLoader({ src, width }: { src: string; width: number }) {
  if (!isPrivateLeisureArtworkSource(src)) throw new Error("Unknown private artwork");
  return `${src}?w=${width <= 640 ? 640 : 1280}`;
}
