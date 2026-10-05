"use client";

import Image from "next/image";
import { useState } from "react";
import { getLeisureArtwork } from "@/features/leisure/artwork";
import { leisureKindLabels } from "@/features/leisure/presentation";
import type { LeisureKind } from "@/features/leisure/types";
import styles from "./leisure.module.css";

/** A broken cover never becomes a broken-image icon or removes the title/link. */
export function LeisureArtwork({ item, priority = false, sizes, className = "", cinematic = false }: {
  item: { title: string; kind: LeisureKind };
  priority?: boolean;
  sizes: string;
  className?: string;
  cinematic?: boolean;
}) {
  const art = getLeisureArtwork(item);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const showImage = art && failedSrc !== art.src;
  return <div className={`${styles.artwork} ${className}`} data-kind={item.kind} data-orientation={art && art.width > art.height ? "landscape" : "portrait"} data-cinematic={cinematic} data-artwork-state={!showImage ? "fallback" : loadedSrc === art.src ? "ready" : "loading"}>
    <div className={styles.artworkFallback} aria-hidden="true"><span className={styles.orbit} /><span className={styles.fallbackKind}>{leisureKindLabels[item.kind]}</span><span className={styles.fallbackTitle}>{item.title}</span><span className={styles.fallbackFoot}>A LITTLE TIME, WELL SPENT</span></div>
    {showImage ? <Image src={art.src} alt="" fill sizes={sizes} preload={priority} loading={priority ? undefined : "lazy"} onLoad={() => setLoadedSrc(art.src)} onError={() => setFailedSrc(art.src)} style={{ objectPosition: art.position ?? "center" }} /> : null}
  </div>;
}
