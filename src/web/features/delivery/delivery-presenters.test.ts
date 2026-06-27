import { describe, expect, it } from "vitest";
import { DELIVERY_STATUSES, deliveryStatusTone, formatShipmentSuggestion, parseDeliveryStatus } from "./delivery-presenters.js";

describe("delivery presenters", () => {
  it("centralizes delivery status parsing, tones, and suggestion copy", () => {
    expect(DELIVERY_STATUSES).toEqual(["pending_schedule", "scheduled", "shipped", "delivered", "cancelled"]);
    expect(parseDeliveryStatus("scheduled")).toBe("scheduled");
    expect(parseDeliveryStatus("unknown")).toBeUndefined();
    expect(deliveryStatusTone("pending_schedule")).toBe("warning");
    expect(deliveryStatusTone("delivered")).toBe("success");
    expect(deliveryStatusTone("cancelled")).toBe("danger");
    expect(formatShipmentSuggestion({
      orderItemId: "item_1",
      requiredQty: 10,
      suggestedBatches: [{ inventoryBatchId: "batch_1", quantity: 10, reason: "优先老化/先进先出" }]
    })).toEqual(["建议批次 batch_1，建议数量 10，原因：优先老化/先进先出"]);
  });
});
