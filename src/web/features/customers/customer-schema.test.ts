import { describe, expect, it } from "vitest";
import { customerFormSchema } from "./customer-schema.js";

const validForm = {
  name: "Peking Lab",
  unitName: "Peking University",
  researchGroup: "Wang Lab",
  geoArea: "Haidian",
  settlementType: "monthly",
  creditDays: "60",
  defaultDeliveryMethod: "self_vehicle",
  defaultInvoiceType: "tech_service",
  notes: "Monthly customer"
};

describe("customerFormSchema", () => {
  it("accepts a valid customer form and converts credit days to a number", () => {
    expect(customerFormSchema.parse(validForm)).toMatchObject({
      name: "Peking Lab",
      settlementType: "monthly",
      creditDays: 60
    });
  });

  it("rejects blank names, invalid settlement type, invalid credit days, and unknown fields", () => {
    expect(customerFormSchema.safeParse({ ...validForm, name: " " }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...validForm, settlementType: "yearly" }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...validForm, creditDays: "1.5" }).success).toBe(false);
    expect(customerFormSchema.safeParse({ ...validForm, unexpected: true }).success).toBe(false);
  });
});
