import { z } from "zod";
import { genderSchema } from "./query-params.schema.js";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createBatchSchema = z
  .object({
    strain_id: z.string().min(1),
    birth_date: dateOnlySchema,
    gender: genderSchema,
    initial_qty: z.number().int().positive(),
    entry_date: dateOnlySchema,
    notes: z.string().optional()
  })
  .strict()
  .refine((value) => value.entry_date >= value.birth_date, {
    path: ["entry_date"],
    message: "entry_date must not be before birth_date"
  });
