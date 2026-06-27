import { describe, expect, it } from "vitest";
import { customerFormFromModel, customerSaveSuccessMessage, defaultCustomerForm } from "./customer-form-model.js";
import type { Customer } from "./api/customers.api.js";

describe("customer form model", () => {
  it("provides create defaults and edit values from a customer model", () => {
    expect(defaultCustomerForm).toEqual({
      name: "",
      unitName: "",
      researchGroup: "",
      geoArea: "",
      settlementType: "monthly",
      creditDays: "60",
      defaultDeliveryMethod: "",
      defaultInvoiceType: "",
      notes: ""
    });

    const customer: Customer = {
      id: "cus_001",
      name: "Peking Lab",
      unitName: "Peking University",
      researchGroup: "Wang Lab",
      geoArea: "Haidian",
      settlementType: "single",
      creditDays: 30,
      defaultDeliveryMethod: "self_vehicle",
      defaultInvoiceType: "tech_service",
      notes: "VIP animal room",
      isActive: true
    };

    expect(customerFormFromModel(customer)).toEqual({
      name: "Peking Lab",
      unitName: "Peking University",
      researchGroup: "Wang Lab",
      geoArea: "Haidian",
      settlementType: "single",
      creditDays: "30",
      defaultDeliveryMethod: "self_vehicle",
      defaultInvoiceType: "tech_service",
      notes: "VIP animal room"
    });
  });

  it("centralizes customer save success messages", () => {
    expect(customerSaveSuccessMessage("create")).toBe("客户已创建");
    expect(customerSaveSuccessMessage("edit")).toBe("客户已更新");
  });
});
