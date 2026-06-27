import { describe, expect, it } from "vitest";
import { evaluateDeliveryStrategySuggestions } from "./delivery-strategy-policy.js";

describe("evaluateDeliveryStrategySuggestions", () => {
  it("suggests the remaining amount for an active matching amount-threshold rule", () => {
    const suggestions = evaluateDeliveryStrategySuggestions({
      geoArea: "海淀",
      totalAmount: "360.00",
      totalQuantity: 20,
      rules: [
        {
          id: "dsr_001",
          name: "纸箱运费免收提示",
          geoArea: "海淀",
          amountThreshold: "500.00",
          suggestionText: "再增加 {remaining_amount} 元可满足免纸箱运费提示条件",
          isActive: true
        }
      ]
    });

    expect(suggestions).toEqual([
      {
        code: "near_carton_fee_free",
        message: "再增加 140.00 元可满足免纸箱运费提示条件",
        ruleId: "dsr_001",
        impact: "suggestion_only"
      }
    ]);
  });
});
