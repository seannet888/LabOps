import { z } from "zod";

export const paginationQueryFields = {
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20)
};

export const orderStatusSchema = z.enum(["pending", "confirmed", "shipped", "delivered", "invoiced", "settled", "cancelled"]);

export const deliveryTaskStatusSchema = z.enum(["pending_schedule", "scheduled", "shipped", "delivered", "cancelled"]);

export const genderSchema = z.enum(["M", "F"]);
