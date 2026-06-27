import { describe, expect, it } from "vitest";
import { scheduleDeliveryTaskSchema } from "./schedule-delivery-task.schema.js";

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    planned_delivery_date: "2026-06-27",
    vehicle: "京A12345",
    driver: "王师傅",
    delivery_batch: "2026-06-27-AM",
    route_notes: "海淀线，先送北大",
    ...overrides
  };
}

describe("scheduleDeliveryTaskSchema", () => {
  it("accepts a valid request", () => {
    expect(scheduleDeliveryTaskSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("accepts a request with only the planned delivery date", () => {
    expect(scheduleDeliveryTaskSchema.safeParse({ planned_delivery_date: "2026-06-27" }).success).toBe(true);
  });

  it("rejects an invalid planned_delivery_date format", () => {
    expect(scheduleDeliveryTaskSchema.safeParse(validRequest({ planned_delivery_date: "27/06/2026" })).success).toBe(
      false
    );
  });

  it("rejects unknown top-level fields", () => {
    expect(scheduleDeliveryTaskSchema.safeParse(validRequest({ unexpected_field: true })).success).toBe(false);
  });
});
