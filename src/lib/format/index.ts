const locale = "zh-CN";

function date(value: Date | string | number) {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: Date | string | number, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone }).format(date(value));
}

export function formatDateTime(value: Date | string | number, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date(value));
}

export function formatTime(value: Date | string | number, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(date(value));
}

export function formatCny(value: number) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "CNY", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
}

export function formatCount(value: number) {
  return new Intl.NumberFormat(locale).format(value);
}
