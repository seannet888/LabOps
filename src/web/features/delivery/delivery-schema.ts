import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须是 YYYY-MM-DD");
const optionalDateTimeSchema = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "时间必须是 ISO 日期或日期时间"), z.literal("")]).optional();

export const scheduleDeliveryFormSchema = z.object({
  plannedDeliveryDate: dateSchema,
  vehicle: z.string().optional(),
  driver: z.string().optional(),
  deliveryBatch: z.string().optional(),
  routeNotes: z.string().optional()
}).strict();

export const confirmShipmentFormSchema = z.object({
  orderItemId: z.string().min(1, "订单项 ID 必填"),
  inventoryBatchId: z.string().min(1, "库存批次 ID 必填"),
  quantity: z.string().regex(/^[1-9]\d*$/, "扣减数量必须是正整数"),
  missingCertificate: z.boolean(),
  missingInvoice: z.boolean(),
  releaseReason: z.string().optional()
}).strict().refine(
  (value) => !(value.missingCertificate || value.missingInvoice) || Boolean(value.releaseReason?.trim()),
  { path: ["releaseReason"], message: "票证缺失时放行原因必填" }
);

export const confirmDeliveryFormSchema = z.object({
  deliveredAt: optionalDateTimeSchema,
  note: z.string().optional()
}).strict();

export const flagSalesActionFormSchema = z.object({
  reason: z.string().min(1, "问题原因必填")
}).strict();
