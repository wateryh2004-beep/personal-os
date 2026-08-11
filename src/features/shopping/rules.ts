export const PURCHASE_RULES = {
  directBuyThresholdCents: 5_000,
  tiers: [
    { maxCents: 5_000, cooldownDays: 1 },
    { maxCents: 30_000, cooldownDays: 2 },
    { maxCents: 100_000, cooldownDays: 7 },
    { maxCents: Number.POSITIVE_INFINITY, cooldownDays: 14 },
  ],
  unknownPriceCooldownDays: 2,
} as const;

export type PurchaseDecisionInput = { priceCny: number | null; necessity: "unknown" | "necessary" | "nonessential"; necessityConfirmed: boolean };
export type PurchaseDecision = { mode: "buy_now_eligible"; cooldownDays: 0; reason: string } | { mode: "cooldown"; cooldownDays: number; reason: string };

export function cnyToCents(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("shopping_price_invalid");
  return Math.round(value * 100);
}

export function decidePurchase(input: PurchaseDecisionInput): PurchaseDecision {
  const cents = input.priceCny === null ? null : cnyToCents(input.priceCny);
  if (input.necessity === "necessary" && input.necessityConfirmed && cents !== null && cents <= PURCHASE_RULES.directBuyThresholdCents)
    return { mode: "buy_now_eligible", cooldownDays: 0, reason: "已确认必要品且价格不超过 ¥50。" };
  const cooldownDays = cents === null ? PURCHASE_RULES.unknownPriceCooldownDays : PURCHASE_RULES.tiers.find((tier) => cents <= tier.maxCents)!.cooldownDays;
  return { mode: "cooldown", cooldownDays, reason: `默认冷静期 ${cooldownDays} 天。` };
}
