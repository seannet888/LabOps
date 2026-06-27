import { describe, expect, it } from "vitest";
import { InMemoryAuditLogRepository, InMemoryCatalogRepository } from "../shared/test-fixtures.js";
import { CatalogApplicationService } from "./catalog-application.service.js";

describe("CatalogApplicationService.listSpecies", () => {
  it("returns the configured species list", async () => {
    const catalog = new InMemoryCatalogRepository(
      new Map(),
      [{ id: "spc_mouse", name: "小鼠", grade: "SPF级" }],
      []
    );
    const service = new CatalogApplicationService({ catalog, auditLogs: new InMemoryAuditLogRepository() });

    const result = await service.listSpecies();

    expect(result.data).toEqual([{ id: "spc_mouse", name: "小鼠", grade: "SPF级" }]);
  });
});

describe("CatalogApplicationService.listStrains", () => {
  it("filters strains by species and active status", async () => {
    const catalog = new InMemoryCatalogRepository(new Map(), [], [
      { id: "str_001", speciesId: "spc_mouse", name: "C57BL/6", isActive: true },
      { id: "str_002", speciesId: "spc_rat", name: "SD", isActive: true }
    ]);
    const service = new CatalogApplicationService({ catalog, auditLogs: new InMemoryAuditLogRepository() });

    const result = await service.listStrains({ speciesId: "spc_mouse" });

    expect(result.data).toEqual([{ id: "str_001", speciesId: "spc_mouse", name: "C57BL/6", isActive: true }]);
  });
});
