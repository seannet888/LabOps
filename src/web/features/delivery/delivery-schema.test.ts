import { describe, expect, it } from "vitest";
import { confirmShipmentFormSchema, flagSalesActionFormSchema, scheduleDeliveryFormSchema } from "./delivery-schema.js";

describe("delivery frontend schemas", () => {
  it("validates delivery command forms before API submission", () => {
    expect(scheduleDeliveryFormSchema.safeParse({ plannedDeliveryDate: "", vehicle: "", driver: "", deliveryBatch: "", routeNotes: "" }).success).toBe(false);
    expect(scheduleDeliveryFormSchema.safeParse({ plannedDeliveryDate: "2026/06/27", vehicle: "", driver: "", deliveryBatch: "", routeNotes: "" }).success).toBe(false);
    expect(scheduleDeliveryFormSchema.safeParse({ plannedDeliveryDate: "2026-06-27", vehicle: "", driver: "", deliveryBatch: "", routeNotes: "" }).success).toBe(true);

    expect(confirmShipmentFormSchema.safeParse({
      orderItemId: "item_1",
      inventoryBatchId: "batch_1",
      quantity: "0",
      missingCertificate: false,
      missingInvoice: false,
      releaseReason: ""
    }).success).toBe(false);

    expect(confirmShipmentFormSchema.safeParse({
      orderItemId: "item_1",
      inventoryBatchId: "batch_1",
      quantity: "8",
      missingCertificate: true,
      missingInvoice: false,
      releaseReason: ""
    }).success).toBe(false);

    expect(flagSalesActionFormSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});
