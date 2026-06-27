import { describe, expect, it } from "vitest";
import { InMemoryAuditLogRepository, InMemoryCatalogRepository } from "../shared/test-fixtures.js";
import { CatalogApplicationService } from "./catalog-application.service.js";

describe("CatalogApplicationService.createStrain", () => {
  it("creates a strain under a species", async () => {
    const service = new CatalogApplicationService({
      catalog: new InMemoryCatalogRepository(),
      auditLogs: new InMemoryAuditLogRepository()
    });

    const result = await service.createStrain({ speciesId: "spc_mouse", name: "C57BL/6" });

    expect(result.data.name).toBe("C57BL/6");
    expect(result.data.id).toBeTruthy();
  });
});

describe("CatalogApplicationService.deactivateStrain", () => {
  it("marks a strain inactive without deleting historical references", async () => {
    const catalog = new InMemoryCatalogRepository(new Map(), [], [{ id: "str_001", speciesId: "spc_mouse", name: "C57BL/6", isActive: true }]);
    const service = new CatalogApplicationService({
      catalog,
      auditLogs: new InMemoryAuditLogRepository()
    });

    const result = await service.deactivateStrain({ strainId: "str_001" });

    expect(result.data).toEqual({ id: "str_001", isActive: false });
    await expect(catalog.listStrains({ isActive: true })).resolves.toEqual([]);
  });
});

describe("CatalogApplicationService.updateStrainStatus", () => {
  it("reactivates an inactive strain so it can be selected again", async () => {
    const catalog = new InMemoryCatalogRepository(new Map(), [], [{ id: "str_001", speciesId: "spc_mouse", name: "C57BL/6", isActive: true }]);
    const service = new CatalogApplicationService({
      catalog,
      auditLogs: new InMemoryAuditLogRepository()
    });

    await service.deactivateStrain({ strainId: "str_001" });
    const result = await service.updateStrainStatus({ strainId: "str_001", isActive: true });

    expect(result.data).toEqual({ id: "str_001", isActive: true });
    await expect(catalog.listStrains({ isActive: true })).resolves.toEqual([
      { id: "str_001", speciesId: "spc_mouse", name: "C57BL/6", isActive: true }
    ]);
  });
});

describe("CatalogApplicationService.createPriceRule", () => {
  it("creates a price rule and writes a light-audit entry", async () => {
    const auditLogs = new InMemoryAuditLogRepository();
    const service = new CatalogApplicationService({ catalog: new InMemoryCatalogRepository(), auditLogs });

    const result = await service.createPriceRule({
      actorId: "user_manager",
      strainId: "str_001",
      ageWeeks: 4,
      unitPrice: "28.00",
      effectiveFrom: "2026-06-01",
      changeReason: "新价格表导入"
    });

    expect(result.data.id).toBeTruthy();
    expect(auditLogs.entries).toEqual([
      { actorId: "user_manager", action: "create_price_rule", entityType: "price_rule", entityId: result.data.id }
    ]);
  });
  it("runs price rule creation through the transaction runner", async () => {
    let transactionCalls = 0;
    const service = new CatalogApplicationService({
      catalog: new InMemoryCatalogRepository(),
      auditLogs: new InMemoryAuditLogRepository(),
      transactions: {
        run: async (callback) => {
          transactionCalls += 1;
          return callback({ catalog: new InMemoryCatalogRepository(), auditLogs: new InMemoryAuditLogRepository() });
        }
      }
    });

    await service.createPriceRule({
      actorId: "user_manager",
      strainId: "str_001",
      ageWeeks: 4,
      unitPrice: "28.00",
      effectiveFrom: "2026-06-01",
      changeReason: "新价格表导入"
    });

    expect(transactionCalls).toBe(1);
  });
});

