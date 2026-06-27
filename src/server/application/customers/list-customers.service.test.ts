import { describe, expect, it } from "vitest";
import { InMemoryAuditLogRepository, InMemoryCustomerRepository } from "../shared/test-fixtures.js";
import { CustomerApplicationService } from "./customer-application.service.js";

describe("CustomerApplicationService.listCustomers", () => {
  it("paginates and filters customers by name", async () => {
    const customers = new InMemoryCustomerRepository();
    await customers.create({ name: "北京大学课题组", settlementType: "monthly", geoArea: "海淀" });
    await customers.create({ name: "清华大学课题组", settlementType: "single", geoArea: "海淀" });
    const service = new CustomerApplicationService({ customers, auditLogs: new InMemoryAuditLogRepository() });

    const result = await service.listCustomers({ q: "北大", page: 1, limit: 20 });

    expect(result.meta.total).toBe(0);

    const allResult = await service.listCustomers({ q: "大学", page: 1, limit: 20 });
    expect(allResult.meta.total).toBe(2);
    expect(allResult.data).toHaveLength(2);
  });
});
