"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveTripStop } from "@/features/travel/actions";

type Result = { name: string; address?: string; lat: number; lng: number; provider: string };

export function StopGeocode({ tripId, stopId, placeName }: { tripId: string; stopId: string; placeName: string }) {
  const router = useRouter(); const [query, setQuery] = useState(placeName); const [results, setResults] = useState<Result[]>([]); const [error, setError] = useState(""); const [pending, start] = useTransition();
  const search = async () => { setError(""); if (query.trim().length < 3) { setError("请输入至少 3 个字符。"); return; } try { const response = await fetch(`/api/travel/geocode?q=${encodeURIComponent(query.trim())}`); const body = await response.json() as { results?: Result[]; message?: string }; if (!response.ok) throw new Error(body.message || "地点搜索失败"); setResults(body.results ?? []); } catch (cause) { setError(cause instanceof Error ? cause.message : "地点搜索失败"); } };
  const choose = (item: Result) => start(async () => { await resolveTripStop(tripId, stopId, item); router.refresh(); });
  return <div className="mt-2 rounded border bg-[var(--surface-hover)] p-2"><div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded border bg-white px-2 py-1 text-xs" aria-label={`搜索 ${placeName} 的地点`} /><button type="button" onClick={search} className="rounded border bg-white px-2 text-xs">搜索</button></div>{error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}{results.length ? <div className="mt-2 space-y-1">{results.map((item) => <button type="button" key={`${item.lat}:${item.lng}:${item.address ?? item.name}`} onClick={() => choose(item)} disabled={pending} className="block w-full rounded bg-white px-2 py-1 text-left text-xs hover:bg-zinc-100">{item.address ?? item.name}</button>)}</div> : null}</div>;
}
