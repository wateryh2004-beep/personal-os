import { expect, it } from "vitest";
import { experienceDuplicateKey } from "@/features/experience-library/duplicates";
it("recognizes the same Xiaohongshu post through different share tokens without conflating other posts", () => {
  const a = "https://www.xiaohongshu.com/discovery/item/6ac61169000000001403bf86?xsec_token=first";
  const b = "https://www.xiaohongshu.com/explore/6ac61169000000001403bf86?xsec_token=second";
  const other = "https://www.xiaohongshu.com/discovery/item/6ac61169000000001403bf87";
  expect(experienceDuplicateKey(a)).toBe(experienceDuplicateKey(b));
  expect(experienceDuplicateKey(a)).not.toBe(experienceDuplicateKey(other));
});
