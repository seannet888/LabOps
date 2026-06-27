import { describe, expect, it } from "vitest";
import { canAccess, canPerform, navItems } from "./permissions.js";

describe("frontend permissions", () => {
  it("centralizes inventory create permissions", () => {
    expect(canPerform("sales", "inventory_batches:create")).toBe(true);
    expect(canPerform("manager", "inventory_batches:create")).toBe(true);
    expect(canPerform("logistics", "inventory_batches:create")).toBe(false);
    expect(canPerform("manager", "strains:create")).toBe(true);
    expect(canPerform("sales", "strains:create")).toBe(false);
    expect(canPerform("logistics", "strains:create")).toBe(false);
  });

  it("keeps audit navigation manager-only", () => {
    const auditNav = navItems.find((item) => item.path === "/audit-logs");
    expect(auditNav).toBeDefined();
    expect(canAccess("manager", auditNav!)).toBe(true);
    expect(canAccess("sales", auditNav!)).toBe(false);
  });

  it("allows sales and managers to run order commands while logistics stays read-only", () => {
    expect(canPerform("sales", "orders:create")).toBe(true);
    expect(canPerform("manager", "orders:confirm")).toBe(true);
    expect(canPerform("sales", "orders:change_prices")).toBe(true);
    expect(canPerform("manager", "orders:settle")).toBe(true);
    expect(canPerform("logistics", "orders:read")).toBe(true);
    expect(canPerform("logistics", "orders:create")).toBe(false);
    expect(canPerform("logistics", "orders:cancel")).toBe(false);
  });

  it("keeps customers writable for sales and managers while logistics stays read-only", () => {
    expect(canPerform("sales", "customers:read")).toBe(true);
    expect(canPerform("logistics", "customers:read")).toBe(true);
    expect(canPerform("manager", "customers:read")).toBe(true);
    expect(canPerform("sales", "customers:create")).toBe(true);
    expect(canPerform("manager", "customers:update")).toBe(true);
    expect(canPerform("logistics", "customers:create")).toBe(false);
    expect(canPerform("logistics", "customers:update_delivery_address")).toBe(false);
  });

  it("allows logistics and managers to run delivery commands while sales stays shipment read-only", () => {
    expect(canPerform("sales", "delivery_tasks:read")).toBe(true);
    expect(canPerform("logistics", "delivery_tasks:read")).toBe(true);
    expect(canPerform("logistics", "delivery_tasks:schedule")).toBe(true);
    expect(canPerform("manager", "delivery_tasks:confirm_shipment")).toBe(true);
    expect(canPerform("logistics", "delivery_tasks:confirm_delivery")).toBe(true);
    expect(canPerform("manager", "delivery_tasks:flag_sales_action")).toBe(true);
    expect(canPerform("sales", "delivery_tasks:confirm_shipment")).toBe(false);
    expect(canPerform("sales", "delivery_tasks:confirm_delivery")).toBe(false);
  });
});
