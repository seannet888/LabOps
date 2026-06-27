import { describe, expect, it } from "vitest";
import { orderStatusTone, parseOrderStatus } from "./order-presenters.js";

describe("order presenters", () => {
  it("parses only supported order statuses", () => {
    expect(parseOrderStatus("confirmed")).toBe("confirmed");
    expect(parseOrderStatus("unknown")).toBeUndefined();
    expect(parseOrderStatus(null)).toBeUndefined();
  });

  it("maps order statuses to non-color-only badge tones", () => {
    expect(orderStatusTone("pending")).toBe("warning");
    expect(orderStatusTone("delivered")).toBe("success");
    expect(orderStatusTone("settled")).toBe("success");
    expect(orderStatusTone("cancelled")).toBe("danger");
    expect(orderStatusTone("confirmed")).toBe("neutral");
  });
});
