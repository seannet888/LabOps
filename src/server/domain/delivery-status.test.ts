import { describe, expect, it } from "vitest";
import { canFlagSalesActionRequired, canTransitionDeliveryTaskStatus } from "./delivery-status.js";

describe("canTransitionDeliveryTaskStatus", () => {
  it("allows pending_schedule to scheduled", () => {
    expect(canTransitionDeliveryTaskStatus("pending_schedule", "scheduled")).toBe(true);
  });

  it("allows scheduled to shipped", () => {
    expect(canTransitionDeliveryTaskStatus("scheduled", "shipped")).toBe(true);
  });

  it("allows shipped to delivered", () => {
    expect(canTransitionDeliveryTaskStatus("shipped", "delivered")).toBe(true);
  });

  it("does not allow delivered before shipped", () => {
    expect(canTransitionDeliveryTaskStatus("scheduled", "delivered")).toBe(false);
    expect(canTransitionDeliveryTaskStatus("pending_schedule", "delivered")).toBe(false);
  });

  it("does not allow skipping scheduling", () => {
    expect(canTransitionDeliveryTaskStatus("pending_schedule", "shipped")).toBe(false);
  });

  it("does not allow transitions out of terminal states", () => {
    expect(canTransitionDeliveryTaskStatus("delivered", "shipped")).toBe(false);
    expect(canTransitionDeliveryTaskStatus("cancelled", "scheduled")).toBe(false);
  });
});

describe("canFlagSalesActionRequired", () => {
  it("allows flagging before shipment", () => {
    expect(canFlagSalesActionRequired("pending_schedule")).toBe(true);
    expect(canFlagSalesActionRequired("scheduled")).toBe(true);
  });

  it("forbids flagging once shipped or delivered", () => {
    expect(canFlagSalesActionRequired("shipped")).toBe(false);
    expect(canFlagSalesActionRequired("delivered")).toBe(false);
  });
});
