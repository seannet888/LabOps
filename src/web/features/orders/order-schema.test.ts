import { describe, expect, it } from "vitest";
import { cancelOrderFormSchema, changeOrderPricesFormSchema, createOrderFormSchema, settleOrderFormSchema } from "./order-schema.js";

describe("order frontend schemas", () => {
  it("requires a reason and decimal string for price changes", () => {
    expect(changeOrderPricesFormSchema.safeParse({
      reason: "",
      orderItemId: "item_1",
      actualPrice: "25.00"
    }).success).toBe(false);

    expect(changeOrderPricesFormSchema.safeParse({
      reason: "协议价",
      orderItemId: "item_1",
      actualPrice: "25.001"
    }).success).toBe(false);
  });

  it("requires a cancellation reason", () => {
    expect(cancelOrderFormSchema.safeParse({ reason: "" }).success).toBe(false);
  });

  it("validates optional settlement date format", () => {
    expect(settleOrderFormSchema.safeParse({ settledAt: "2026/07/25", paymentMethod: "", note: "" }).success).toBe(false);
    expect(settleOrderFormSchema.safeParse({ settledAt: "2026-07-25", paymentMethod: "", note: "" }).success).toBe(true);
  });

  it("validates optional planned delivery date format while creating orders", () => {
    expect(createOrderFormSchema.safeParse({
      customerId: "1",
      deliveryMethod: "",
      plannedDeliveryDate: "2026/07/25",
      requiresInvoice: false,
      invoiceType: "",
      notes: "",
      strainId: "1",
      ageWeeks: "4",
      gender: "M",
      quantity: "1",
      actualPrice: "28.00"
    }).success).toBe(false);
  });
});
