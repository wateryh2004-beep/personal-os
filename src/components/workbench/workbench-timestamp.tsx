import { z } from "zod";
import { formatDateTime } from "@/lib/format";

const instant = z.iso.datetime({ offset: true });

/** Only for known timestamp metadata. Date-only ledger values stay calendar dates. */
export function WorkbenchTimestamp({ value, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone }: { value: string; timeZone?: string }) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return <time dateTime={value}>{day[1]}年{Number(day[2])}月{Number(day[3])}日</time>;
  }
  if (!instant.safeParse(value).success) return <>{value}</>;
  const label = formatDateTime(value, timeZone);
  return <time dateTime={value} title={`本地时间（${timeZone}）`} aria-label={`${label}（本地时间，${timeZone}）`}>{label}</time>;
}
