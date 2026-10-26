"use client";

import { useState, useTransition } from "react";
import { resolveTripStop } from "@/features/travel/actions";

type Result = { name: string; address?: string; lat: number; lng: number; provider: string };
export function StopGeocode({ tripId, stopId, placeName, onResolved }: { tripId: string; stopId: string; placeName: string; onResolved?: (item: Result) => void | Promise<void> }) {
  const [query, setQuery] = useState(placeName); const [results, setResults] = useState<Result[]>([]); const [error, setError] = useState(""); const [pending, start] = useTransition();
  const search = async () => { setError(""); if (query.trim().length < 3) { setError("请输入至少 3 个字符。"); return; } try { const response = await fetch(`/api/travel/geocode?q=${encodeURIComponent(query.trim())}`); const body = await response.json() as { results?: Result[]; message?: string }; if (!response.ok) throw new Error(body.message || "地点搜索失败"); setResults(body.results ?? []); } catch (cause) { setError(cause instanceof Error ? cause.message : "地点搜索失败"); } };
  const choose = (item: Result) => { setError(""); start(async () => { let committed=false;try { await resolveTripStop(tripId, stopId, item);committed=true;await onResolved?.(item); setResults([]); } catch { setError(committed?"地点已保存，暂时无法核对最新行程。请先重新读取。":"暂时无法确认地点保存结果，请先核对最新行程。"); } }); };
  return <div className="mt-2 rounded border bg-[var(--surface-hover)] p-2"><div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded border bg-[var(--surface-canvas)] px-2 py-1 text-xs" aria-label={`搜索 ${placeName} 的地点`} /><button type="button" onClick={search} className="rounded border bg-[var(--surface-canvas)] px-2 text-xs">搜索</button></div>{error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}{results.length ? <div className="mt-2 space-y-1">{results.map((item) => <button type="button" key={`${item.lat}:${item.lng}:${item.address ?? item.name}`} onClick={() => choose(item)} disabled={pending} className="block w-full rounded bg-[var(--surface-canvas)] px-2 py-1 text-left text-xs hover:bg-[var(--surface-control)]">{item.address ?? item.name}</button>)}</div> : null}</div>;
}
