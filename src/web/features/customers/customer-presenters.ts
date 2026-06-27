import type { SettlementType } from "./api/customers.api.js";

export function settlementTypeLabel(value: SettlementType): string {
  return value === "monthly" ? "月结" : "单结";
}

export function customerStatusTone(isActive: boolean): "success" | "neutral" {
  return isActive ? "success" : "neutral";
}
