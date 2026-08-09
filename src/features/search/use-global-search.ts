"use client";

import { useEffect, useState } from "react";
import type { GlobalSearchResult, SearchDomain } from "./types";

type SearchStatus = "idle" | "loading" | "success" | "error";

type SearchSnapshot = {
  query: string;
  results: GlobalSearchResult[];
  status: SearchStatus;
  error: string | null;
};

const initialSnapshot: SearchSnapshot = {
  query: "",
  results: [],
  status: "idle",
  error: null,
};

export function useGlobalSearch({
  query,
  domains,
  limit = 30,
  debounceMs = 180,
  enabled = true,
}: {
  query: string;
  domains?: readonly SearchDomain[];
  limit?: number;
  debounceMs?: number;
  enabled?: boolean;
}) {
  const normalizedQuery = query.trim();
  const domainKey = domains?.join(",") ?? "";
  const [snapshot, setSnapshot] = useState<SearchSnapshot>(initialSnapshot);

  useEffect(() => {
    if (!enabled || !normalizedQuery) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSnapshot({
        query: normalizedQuery,
        results: [],
        status: "loading",
        error: null,
      });
      try {
        const params = new URLSearchParams({
          q: normalizedQuery,
          limit: String(limit),
        });
        if (domainKey) params.set("domains", domainKey);
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          results?: GlobalSearchResult[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "搜索暂时不可用。");
        if (controller.signal.aborted) return;
        setSnapshot({
          query: normalizedQuery,
          results: body.results ?? [],
          status: "success",
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setSnapshot({
          query: normalizedQuery,
          results: [],
          status: "error",
          error: error instanceof Error ? error.message : "搜索暂时不可用。",
        });
      }
    }, debounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [debounceMs, domainKey, enabled, limit, normalizedQuery]);

  if (!enabled || !normalizedQuery) return initialSnapshot;
  if (snapshot.query !== normalizedQuery) {
    return { ...initialSnapshot, query: normalizedQuery, status: "loading" as const };
  }
  return snapshot;
}
