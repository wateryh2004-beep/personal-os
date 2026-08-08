"use client";
import { useEffect, useState } from "react";
export function NowClock({ timezone }: { timezone: string }) { const [now, setNow] = useState(() => new Date()); useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []); return <time dateTime={now.toISOString()} className="font-mono text-sm text-zinc-500">{new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(now)}</time>; }
