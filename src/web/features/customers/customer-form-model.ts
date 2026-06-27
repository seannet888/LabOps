import type { Customer } from "./api/customers.api.js";
import type { CustomerFormValues } from "./customer-schema.js";

export type CustomerDialogMode = "create" | "edit";

export const defaultCustomerForm: CustomerFormValues = {
  name: "",
  unitName: "",
  researchGroup: "",
  geoArea: "",
  settlementType: "monthly",
  creditDays: "60",
  defaultDeliveryMethod: "",
  defaultInvoiceType: "",
  notes: ""
};

export function customerFormFromModel(customer: Customer): CustomerFormValues {
  return {
    name: customer.name,
    unitName: customer.unitName ?? "",
    researchGroup: customer.researchGroup ?? "",
    geoArea: customer.geoArea ?? "",
    settlementType: customer.settlementType,
    creditDays: String(customer.creditDays),
    defaultDeliveryMethod: customer.defaultDeliveryMethod ?? "",
    defaultInvoiceType: customer.defaultInvoiceType ?? "",
    notes: customer.notes ?? ""
  };
}

export function customerSaveSuccessMessage(mode: CustomerDialogMode): string {
  return mode === "edit" ? "客户已更新" : "客户已创建";
}
