import { z } from "zod";
/** GiB is a personal planning value, unrelated to GB-month provider billing. */
export const storageBudgetInput = z.string().trim().max(20).refine((value) => value === "" || (/^\d+(\.\d{1,6})?$/.test(value) && Number(value) >= 0.001 && Number(value) <= 1000000), "请输入 0.001 到 1,000,000 GiB，或留空清除预算。");
