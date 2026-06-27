import { describe, expect, it } from "vitest";
import { canChangeOrderPrice, canTransitionOrderStatus } from "./order-status.js";

describe("canTransitionOrderStatus", () => {
  it("allows pending to confirmed by sales", () => {
    expect(canTransitionOrderStatus("pending", "confirmed", "sales")).toBe(true);
  });

  it("does not allow sales to push confirmed to shipped directly", () => {
    expect(canTransitionOrderStatus("confirmed", "shipped", "sales")).toBe(false);
  });

  it("allows delivery_sync to push confirmed to shipped", () => {
    expect(canTransitionOrderStatus("confirmed", "shipped", "delivery_sync")).toBe(true);
  });

  it("allows delivery_sync to push shipped to delivered", () => {
    expect(canTransitionOrderStatus("shipped", "delivered", "delivery_sync")).toBe(true);
  });

  it("does not allow sales to push shipped to delivered", () => {
    expect(canTransitionOrderStatus("shipped", "delivered", "sales")).toBe(false);
  });

  it("does not allow normal cancellation once shipped", () => {
    expect(canTransitionOrderStatus("shipped", "cancelled", "sales")).toBe(false);
  });

  it("allows cancellation from pending", () => {
    expect(canTransitionOrderStatus("pending", "cancelled", "sales")).toBe(true);
  });

  it("allows delivered to invoiced by sales", () => {
    expect(canTransitionOrderStatus("delivered", "invoiced", "sales")).toBe(true);
  });

  it("allows invoiced to settled by sales", () => {
    expect(canTransitionOrderStatus("invoiced", "settled", "sales")).toBe(true);
  });

  it("does not allow transitions out of terminal states", () => {
    expect(canTransitionOrderStatus("settled", "cancelled", "manager")).toBe(false);
    expect(canTransitionOrderStatus("cancelled", "pending", "manager")).toBe(false);
  });
});

describe("canChangeOrderPrice", () => {
  it("forbids price changes once settled", () => {
    expect(canChangeOrderPrice("settled")).toBe(false);
  });

  it("forbids price changes once shipped", () => {
    expect(canChangeOrderPrice("shipped")).toBe(false);
  });

  it("allows price changes on a confirmed order", () => {
    expect(canChangeOrderPrice("confirmed")).toBe(true);
  });
});
