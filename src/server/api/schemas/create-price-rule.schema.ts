import { z } from "zod";
import { decimalStringSchema } from "./decimal-string.js";

export const createPriceRuleSchema = z
  .object({
    strain_id: z.string(),
    age_weeks: z.number().int().nonnegative(),
    unit_price: decimalStringSchema,
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
    change_reason: z.string().min(1)
  })
  .strict();
