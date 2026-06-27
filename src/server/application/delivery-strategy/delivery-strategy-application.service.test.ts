import { describe, expect, it } from "vitest";
import { buildOrder, InMemoryCustomerRepository, InMemoryOrderRepository } from "../shared/test-fixtures.js";
import { DeliveryStrategyApplicationService } from "./delivery-strategy-application.service.js";

describe("DeliveryStrategyApplicationService.getOrderDeliverySuggestions", () => {
  it("returns suggestion-only delivery strategy hints for an order", async () => {
    const customers = new InMemoryCustomerRepository();
    const customer = await customers.create({ name: "Peking Lab", geoArea: "Haidian", settlementType: "monthly" });
    const orders = new InMemoryOrderRepository(
      new Map([["ord_001", buildOrder({ customerId: customer.id, totalAmount: "360.00" })]])
    );
    const deliveryStrategyRules = {
      listActive: async () => [
        {
          id: "dsr_001",
          name: "carton hint",
          geoArea: "Haidian",
          amountThreshold: "500.00",
          suggestionText: "Add {remaining_amount} to meet the carton fee hint threshold",
          isActive: true
        }
      ],
      create: async () => ({ id: "dsr_created" }),
      update: async (ruleId: string) => ({ id: ruleId })
    };
    const service = new DeliveryStrategyApplicationService({ orders, customers, deliveryStrategyRules });

    await expect(service.getOrderDeliverySuggestions("ord_001")).resolves.toEqual({
      data: [
        {
          code: "near_carton_fee_free",
          message: "Add 140.00 to meet the carton fee hint threshold",
          ruleId: "dsr_001",
          impact: "suggestion_only"
        }
      ]
    });
  });
});