import { describe, expect, it } from "vitest";
import { auditFiltersFromSearchParams, auditSearchParamsFromFilters } from "./audit-filters.js";

describe("audit filters", () => {
  it("normalizes URL search params into audit filters", () => {
    const filters = auditFiltersFromSearchParams(new URLSearchParams("page=0&per_page=bad&entity_type=order&entity_id=ord_001"));

    expect(filters).toEqual({
      page: 1,
      perPage: 20,
      entityType: "order",
      entityId: "ord_001"
    });
  });

  it("serializes form filters back to URL search params", () => {
    const params = auditSearchParamsFromFilters({ perPage: 50, entityType: "order", entityId: "" });

    expect(params.toString()).toBe("page=1&per_page=50&entity_type=order");
  });
});
