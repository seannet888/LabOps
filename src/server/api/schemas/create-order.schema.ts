import { z } from "zod";
import { decimalStringSchema } from "./decimal-string.js";

const createOrderItemSchema = z
  .object({
    strain_id: z.string().trim().min(1),
    age_weeks: z.number().int().nonnegative(),
    gender: z.enum(["M", "F"]),
    quantity: z.number().positive(),
    actual_price: decimalStringSchema.optional()
  })
  .strict();

export const createOrderSchema = z
  .object({
    customer_id: z.string().trim().min(1),
    delivery_method: z.string().optional(),
    planned_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    requires_invoice: z.boolean().optional(),
    invoice_type: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(createOrderItemSchema).min(1)
  })
  .strict();
