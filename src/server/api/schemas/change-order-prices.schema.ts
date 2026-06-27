import { z } from "zod";
import { decimalStringSchema } from "./decimal-string.js";

const changeOrderPriceItemSchema = z
  .object({
    order_item_id: z.string(),
    actual_price: decimalStringSchema
  })
  .strict();

export const changeOrderPricesSchema = z
  .object({
    reason: z.string().min(1),
    items: z.array(changeOrderPriceItemSchema).min(1)
  })
  .strict();
