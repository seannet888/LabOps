import { describe, expect, it } from "vitest";
import { customerStatusTone, settlementTypeLabel } from "./customer-presenters.js";

describe("customer presenters", () => {
  it("formats settlement type and status tone", () => {
    expect(settlementTypeLabel("monthly")).toBe("月结");
    expect(settlementTypeLabel("single")).toBe("单结");
    expect(customerStatusTone(true)).toBe("success");
    expect(customerStatusTone(false)).toBe("neutral");
  });
});
