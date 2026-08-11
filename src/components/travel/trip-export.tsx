"use client";

type Stop = { place_name: string; day_number: number | null; latitude: number | null; longitude: number | null; planned_time: string | null; notes: string | null };
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function routeSvg(stops: Stop[]) {
  const located = stops.filter((stop): stop is Stop & { latitude: number; longitude: number } => stop.latitude !== null && stop.longitude !== null);
  if (!located.length) return null;
  const longitudes = located.map((stop) => stop.longitude); const latitudes = located.map((stop) => stop.latitude);
  const minLng = Math.min(...longitudes); const maxLng = Math.max(...longitudes); const minLat = Math.min(...latitudes); const maxLat = Math.max(...latitudes);
  const x = (value: number) => 60 + (maxLng === minLng ? 340 : (value - minLng) / (maxLng - minLng) * 680);
  const y = (value: number) => 440 - (maxLat === minLat ? 190 : (value - minLat) / (maxLat - minLat) * 380);
  const points = located.map((stop) => `${x(stop.longitude)},${y(stop.latitude)}`).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#f8fafc"/><text x="40" y="38" fill="#111827" font-family="system-ui" font-size="20">Travel route</text><polyline points="${points}" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${located.map((stop,index)=>`<circle cx="${x(stop.longitude)}" cy="${y(stop.latitude)}" r="8" fill="#2563eb"/><text x="${x(stop.longitude)+12}" y="${y(stop.latitude)+5}" fill="#111827" font-family="system-ui" font-size="14">${index+1}. ${stop.place_name.replace(/[<&>]/g,"")}</text>`).join("")}</svg>`;
}

export function TripExport({ title, stops }: { title: string; stops: Stop[] }) {
  const downloadRoute = () => { const svg = routeSvg(stops); if (!svg) return; const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); const link = document.createElement("a"); link.href = url; link.download = `${title.replace(/[^\w\u4e00-\u9fff-]+/g, "-") || "trip"}-route.svg`; link.click(); URL.revokeObjectURL(url); };
  const printItinerary = () => { const rows = stops.map((stop, index) => `<li><strong>${index + 1}. ${escapeHtml(stop.place_name)}</strong>${stop.day_number ? ` · 第 ${stop.day_number} 天` : ""}${stop.planned_time ? ` · ${stop.planned_time.slice(0,5)}` : ""}${stop.notes ? `<br/>${escapeHtml(stop.notes)}` : ""}</li>`).join(""); const safeTitle = escapeHtml(title); const tab = window.open("", "_blank", "noopener,noreferrer"); if (!tab) return; tab.document.write(`<!doctype html><html><head><title>${safeTitle}</title><style>body{font:16px system-ui;margin:48px;line-height:1.65}li{margin:12px 0}</style></head><body><h1>${safeTitle}</h1><h2>行程</h2><ol>${rows}</ol><script>window.onload=()=>window.print()</script></body></html>`); tab.document.close(); };
  return <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={downloadRoute} disabled={!stops.some((stop) => stop.latitude !== null && stop.longitude !== null)} className="rounded border px-2 py-1 text-xs disabled:opacity-40">导出路线图片</button><button type="button" onClick={printItinerary} className="rounded border px-2 py-1 text-xs">导出行程 PDF</button></div>;
}
