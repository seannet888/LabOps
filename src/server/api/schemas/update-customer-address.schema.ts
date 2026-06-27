import { z } from "zod";

export const updateCustomerAddressSchema = z
  .object({
    detail: z.string().min(1).optional(),
    is_default: z.boolean().optional(),
    change_reason: z.string().min(1)
  })
  .strict();
