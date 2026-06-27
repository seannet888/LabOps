import { describe, expect, it } from "vitest";
import { StateConflictError } from "../errors.js";
import { InMemoryAuditLogRepository, InMemoryCustomerRepository } from "../shared/test-fixtures.js";
import { CustomerApplicationService } from "./customer-application.service.js";

describe("CustomerApplicationService.createCustomer", () => {
  it("creates a customer with defaults applied", async () => {
    const service = new CustomerApplicationService({
      customers: new InMemoryCustomerRepository(),
      auditLogs: new InMemoryAuditLogRepository()
    });

    const result = await service.createCustomer({
      name: "北京大学-生命科学学院-王老师课题组",
      unitName: "北京大学",
      researchGroup: "王老师课题组",
      geoArea: "海淀",
      settlementType: "monthly",
      creditDays: 60
    });

    expect(result.data.name).toBe("北京大学-生命科学学院-王老师课题组");
    expect(result.data.id).toBeTruthy();
  });
});

describe("CustomerApplicationService.updateCustomer", () => {
  it("updates an existing customer's fields", async () => {
    const customers = new InMemoryCustomerRepository();
    const created = await customers.create({ name: "旧名称", settlementType: "single" });
    const service = new CustomerApplicationService({ customers, auditLogs: new InMemoryAuditLogRepository() });

    const result = await service.updateCustomer({ customerId: created.id, name: "新名称" });

    expect(result.data.id).toBe(created.id);
    expect((await customers.findById(created.id))?.name).toBe("新名称");
  });

  it("throws StateConflictError when the customer does not exist", async () => {
    const service = new CustomerApplicationService({
      customers: new InMemoryCustomerRepository(),
      auditLogs: new InMemoryAuditLogRepository()
    });

    await expect(service.updateCustomer({ customerId: "cus_missing", name: "新名称" })).rejects.toThrow(
      StateConflictError
    );
  });
});

describe("CustomerApplicationService.updateDeliveryAddress", () => {
  it("updates the address and writes a light-audit entry", async () => {
    const customers = new InMemoryCustomerRepository();
    customers.setAddress({ id: "addr_001", customerId: "cus_001", addressType: "delivery", detail: "旧地址", isDefault: true });
    const auditLogs = new InMemoryAuditLogRepository();
    const service = new CustomerApplicationService({ customers, auditLogs });

    const result = await service.updateDeliveryAddress({
      addressId: "addr_001",
      actorId: "user_sales",
      detail: "北京市海淀区xxx楼xxx室",
      changeReason: "客户实验室搬迁"
    });

    expect(result.data.id).toBe("addr_001");
    expect((await customers.findAddressById("addr_001"))?.detail).toBe("北京市海淀区xxx楼xxx室");
    expect(auditLogs.entries).toEqual([
      { actorId: "user_sales", action: "update_address", entityType: "customer_address", entityId: "addr_001" }
    ]);
  });

  it("throws StateConflictError when the address does not exist", async () => {
    const service = new CustomerApplicationService({
      customers: new InMemoryCustomerRepository(),
      auditLogs: new InMemoryAuditLogRepository()
    });

    await expect(
      service.updateDeliveryAddress({
        addressId: "addr_missing",
        actorId: "user_sales",
        detail: "新地址",
        changeReason: "客户实验室搬迁"
      })
    ).rejects.toThrow(StateConflictError);
  });
  it("runs address updates through the transaction runner", async () => {
    let transactionCalls = 0;
    const customers = new InMemoryCustomerRepository();
    customers.setAddress({ id: "addr_001", customerId: "cus_001", addressType: "delivery", detail: "旧地址", isDefault: true });
    const service = new CustomerApplicationService({
      customers,
      auditLogs: new InMemoryAuditLogRepository(),
      transactions: {
        run: async (callback) => {
          transactionCalls += 1;
          return callback({ customers, auditLogs: new InMemoryAuditLogRepository() });
        }
      }
    });

    await service.updateDeliveryAddress({
      addressId: "addr_001",
      actorId: "user_sales",
      detail: "北京市海淀区xxx楼xxx室",
      changeReason: "客户实验室搬迁"
    });

    expect(transactionCalls).toBe(1);
  });
});

