export interface DeliveryStrategyRuleCandidate {
  id: string;
  name: string;
  geoArea?: string;
  amountThreshold?: string;
  quantityThreshold?: number;
  suggestionText: string;
  isActive: boolean;
}

export interface DeliveryStrategySuggestion {
  code: "near_carton_fee_free";
  message: string;
  ruleId: string;
  impact: "suggestion_only";
}

export interface EvaluateDeliveryStrategySuggestionsInput {
  geoArea?: string;
  totalAmount: string;
  totalQuantity: number;
  rules: DeliveryStrategyRuleCandidate[];
}

function money(value: number): string {
  return value.toFixed(2);
}

export function evaluateDeliveryStrategySuggestions(
  input: EvaluateDeliveryStrategySuggestionsInput
): DeliveryStrategySuggestion[] {
  const totalAmount = Number(input.totalAmount);

  return input.rules.flatMap((rule) => {
    if (!rule.isActive || (rule.geoArea && rule.geoArea !== input.geoArea)) {
      return [];
    }

    if (rule.amountThreshold) {
      const remainingAmount = Number(rule.amountThreshold) - totalAmount;
      if (remainingAmount > 0) {
        return [
          {
            code: "near_carton_fee_free",
            message: rule.suggestionText.replace("{remaining_amount}", money(remainingAmount)),
            ruleId: rule.id,
            impact: "suggestion_only"
          }
        ];
      }
    }

    return [];
  });
}
