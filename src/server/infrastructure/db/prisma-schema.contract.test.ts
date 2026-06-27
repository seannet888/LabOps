import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

function modelBlock(modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));
  expect(match, `model ${modelName} should exist`).not.toBeNull();
  return match?.[0] ?? "";
}

describe("Prisma schema contract", () => {
  it("models idempotency keys required by side-effect commands", () => {
    const idempotencyKey = modelBlock("IdempotencyKey");

    expect(idempotencyKey).toContain("actorId");
    expect(idempotencyKey).toContain("endpoint");
    expect(idempotencyKey).toContain("idempotencyKey");
    expect(idempotencyKey).toContain("requestHash");
    expect(idempotencyKey).toContain("responseSnapshot");
    expect(idempotencyKey).toContain("@@unique([actorId, endpoint, idempotencyKey])");
    expect(idempotencyKey).toContain("@@map(\"idempotency_keys\")");
  });

  it("keeps delivery tasks one-to-one with orders in MVP", () => {
    expect(modelBlock("DeliveryTask")).toContain("@unique @map(\"order_id\")");
  });

  it("persists order invoice requirement from the API contract", () => {
    const order = modelBlock("Order");

    expect(order).toContain("requiresInvoice");
    expect(order).toContain("@map(\"requires_invoice\")");
  });


  it("models delivery strategy rules for suggestion-only hints", () => {
    const rule = modelBlock("DeliveryStrategyRule");

    expect(rule).toContain("geoArea");
    expect(rule).toContain("amountThreshold");
    expect(rule).toContain("quantityThreshold");
    expect(rule).toContain("suggestionText");
    expect(rule).toContain("isActive");
    expect(rule).toContain("@@map(\"delivery_strategy_rules\")");
  });

  it("models reservation allocations for aggregate inventory reservations", () => {
    const allocation = modelBlock("ReservationAllocation");

    expect(allocation).toContain("orderItemId");
    expect(allocation).toContain("@map(\"order_item_id\")");
    expect(allocation).toContain("inventoryBatchId");
    expect(allocation).toContain("@map(\"inventory_batch_id\")");
    expect(allocation).toContain("quantity");
    expect(allocation).toContain("orderItem");
    expect(allocation).toContain("OrderItem");
    expect(allocation).toContain("inventoryBatch");
    expect(allocation).toContain("InventoryBatch");
    expect(allocation).toContain("@@unique([orderItemId, inventoryBatchId])");
    expect(allocation).toContain("@@map(\"reservation_allocations\")");
  });

  it("declares policy-required indexes for core queries", () => {
    expect(modelBlock("Customer")).toContain("@@index([geoArea])");
    expect(modelBlock("InventoryBatch")).toContain("@@index([strainId, gender, birthDate])");
    expect(modelBlock("Order")).toContain("@@index([customerId])");
    expect(modelBlock("Order")).toContain("@@index([status])");
    expect(modelBlock("DeliveryTask")).toContain("@@index([status])");
    expect(modelBlock("AuditLog")).toContain("@@index([entityType, entityId])");
  });
});

