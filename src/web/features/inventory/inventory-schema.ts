import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须是 YYYY-MM-DD");

export const createInventoryBatchSchema = z
  .object({
    strainId: z.string().min(1, "品系必填"),
    speciesName: z.string().min(1, "物种必填"),
    birthDate: dateOnlySchema,
    gender: z.enum(["M", "F"], { message: "性别必须是 M 或 F" }),
    initialQty: z.coerce.number().int("入库数量必须是整数").positive("入库数量必须大于 0"),
    entryDate: dateOnlySchema,
    notes: z.string().optional()
  })
  .refine((value) => value.entryDate >= value.birthDate, {
    path: ["entryDate"],
    message: "入库日期不能早于出生日期"
  });

export type CreateInventoryBatchFormValues = z.input<typeof createInventoryBatchSchema>;

export const createStrainSchema = z.object({
  speciesId: z.string().min(1, "品类必填"),
  name: z.string().trim().min(1, "品系名称必填")
});

export type CreateStrainFormValues = z.input<typeof createStrainSchema>;
