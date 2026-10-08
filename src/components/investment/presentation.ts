import type { InvestmentMode, InvestmentTab } from "@/features/investment/types";
export type { InvestmentMode, InvestmentTab } from "@/features/investment/types";

export function parseInvestmentView(params: { tab?: string | string[]; mode?: string | string[] }) {
  return {
    tab: params.tab === "strategies" || params.tab === "research" ? params.tab : "holdings",
    mode: params.mode === "paper" ? "paper" : "real",
  } as { tab: InvestmentTab; mode: InvestmentMode };
}

export function investmentHref(tab: InvestmentTab, mode: InvestmentMode) {
  return `/investments?tab=${tab}&mode=${mode}`;
}

/** Keep ledger decimal precision; formatting must never round a small holding to zero. */
export function formatInvestmentDecimal(value: string) {
  const [integer, fraction] = value.split(".");
  const significantFraction = fraction?.replace(/0+$/, "");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${significantFraction ? `.${significantFraction}` : ""}`;
}

export function safeResearchUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function parseInvestmentItem(item: string | string[] | undefined) {
  return typeof item === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item) ? item.toLowerCase() : undefined;
}
