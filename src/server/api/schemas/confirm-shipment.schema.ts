import { z } from "zod";

const stockDeductionSchema = z
  .object({
    order_item_id: z.string(),
    inventory_batch_id: z.string(),
    quantity: z.number().positive()
  })
  .strict();

const documentReleaseSchema = z
  .object({
    missing_certificate: z.boolean(),
    missing_invoice: z.boolean(),
    reason: z.string().min(1).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.missing_certificate || value.missing_invoice) && !value.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "票证缺失但未填写放行原因"
      });
    }
  });

export const confirmShipmentSchema = z
  .object({
    stock_deductions: z.array(stockDeductionSchema).min(1),
    document_release: documentReleaseSchema.optional()
  })
  .strict();
