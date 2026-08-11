import { describe, expect, it } from "vitest";
import { cnyToCents, decidePurchase } from "@/features/shopping/rules";
describe("purchase decision rules", () => {
  it("permits only confirmed necessities at or below ¥50", () => { expect(decidePurchase({ priceCny: 49.99, necessity:"necessary", necessityConfirmed:true }).mode).toBe("buy_now_eligible"); expect(decidePurchase({ priceCny:50, necessity:"necessary", necessityConfirmed:true }).mode).toBe("buy_now_eligible"); expect(decidePurchase({ priceCny:50.01, necessity:"necessary", necessityConfirmed:true }).mode).toBe("cooldown"); });
  it("keeps all other cases in cooling", () => { expect(decidePurchase({ priceCny:10, necessity:"unknown", necessityConfirmed:false }).cooldownDays).toBe(1); expect(decidePurchase({ priceCny:800, necessity:"nonessential", necessityConfirmed:false }).cooldownDays).toBe(7); expect(decidePurchase({ priceCny:null, necessity:"necessary", necessityConfirmed:true }).cooldownDays).toBe(2); });
  it("uses integer cents", () => { expect(cnyToCents(50)).toBe(5000); expect(cnyToCents(50.01)).toBe(5001); });
});
