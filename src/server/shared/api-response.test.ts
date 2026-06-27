import { describe, expect, it } from "vitest";
import { dataResponse, listResponse } from "./api-response.js";

describe("dataResponse", () => {
  it("wraps a single resource in a data envelope", () => {
    expect(dataResponse({ id: "order_1" })).toEqual({ data: { id: "order_1" } });
  });

  it("attaches command meta such as events when provided", () => {
    const result = dataResponse(
      { id: "ord_001", status: "confirmed" },
      { meta: { events: ["order_confirmed", "inventory_reserved", "delivery_task_created"] } }
    );

    expect(result).toEqual({
      data: { id: "ord_001", status: "confirmed" },
      meta: { events: ["order_confirmed", "inventory_reserved", "delivery_task_created"] }
    });
  });
});

describe("listResponse", () => {
  it("wraps a list in data/meta/links envelope", () => {
    const result = listResponse([{ id: "1" }, { id: "2" }], { total: 2, page: 1, limit: 20 }, { next: null, prev: null });

    expect(result).toEqual({
      data: [{ id: "1" }, { id: "2" }],
      meta: { total: 2, page: 1, limit: 20 },
      links: { next: null, prev: null }
    });
  });
});
