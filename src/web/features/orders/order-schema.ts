import { z } from "zod";

const decimalStringSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, "金额必须是 decimal string");
const optionalDateSchema = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须是 YYYY-MM-DD"), z.literal("")]).optional();

export const createOrderFormSchema = z.object({
  customerId: z.string().min(1, "客户 ID 必填"),
  deliveryMethod: z.string().optional(),
  plannedDeliveryDate: optionalDateSchema,
  requiresInvoice: z.boolean(),
  invoiceType: z.string().optional(),
  notes: z.string().optional(),
  strainId: z.string().min(1, "品系 ID 必填"),
  ageWeeks: z.string().regex(/^\d+$/, "周龄必须是非负整数"),
  gender: z.enum(["M", "F"]),
  quantity: z.string().regex(/^[1-9]\d*$/, "数量必须是正整数"),
  actualPrice: z.union([decimalStringSchema, z.literal("")]).optional()
}).strict();

export const changeOrderPricesFormSchema = z.object({
  reason: z.string().min(1, "改价原因必填"),
  orderItemId: z.string().min(1, "订单项 ID 必填"),
  actualPrice: decimalStringSchema
}).strict();

export const cancelOrderFormSchema = z.object({
  reason: z.string().min(1, "取消原因必填")
}).strict();

export const settleOrderFormSchema = z.object({
  settledAt: optionalDateSchema,
  paymentMethod: z.string().optional(),
  note: z.string().optional()
}).strict();
