import { z } from "zod";

const optionalText = z.string().transform((value) => value.trim()).pipe(z.string()).transform((value) => value || undefined);

const creditDaysSchema = z
  .string()
  .regex(/^\d+$/, "账期天数必须是正整数")
  .transform((value) => Number(value))
  .refine((value) => value > 0, "账期天数必须是正整数")
  .optional();

export const customerFormSchema = z
  .object({
    name: z.string().trim().min(1, "客户名称必填"),
    unitName: optionalText.optional(),
    researchGroup: optionalText.optional(),
    geoArea: optionalText.optional(),
    settlementType: z.enum(["single", "monthly"], { message: "结算方式不合法" }),
    creditDays: creditDaysSchema,
    defaultDeliveryMethod: optionalText.optional(),
    defaultInvoiceType: optionalText.optional(),
    notes: optionalText.optional()
  })
  .strict();

export type CustomerFormValues = z.input<typeof customerFormSchema>;
export type ParsedCustomerForm = z.output<typeof customerFormSchema>;
