import { z } from "zod";

export const scheduleDeliveryTaskSchema = z
  .object({
    planned_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD"),
    vehicle: z.string().optional(),
    driver: z.string().optional(),
    delivery_batch: z.string().optional(),
    route_notes: z.string().optional()
  })
  .strict();
