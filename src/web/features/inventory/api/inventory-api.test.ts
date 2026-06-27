import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStrain,
  createInventoryBatch,
  deactivateStrain,
  updateStrainStatus,
  listStrains,
  listInventoryBatches,
  mapInventoryBatchDto,
  toCreateInventoryBatchDto
} from "./inventory.api.js";

describe("inventory frontend API boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps inventory batch DTOs to camelCase models", () => {
    expect(mapInventoryBatchDto({
      id: "inv_001",
      strain_id: "str_001",
      strain_name: "C57BL/6",
      species_name: "小鼠",
      birth_date: "2026-05-21",
      age_weeks: 5,
      gender: "M",
      initial_qty: 100,
      reserved_qty: 20,
      available_qty: 75,
      is_aging: false,
      entry_date: "2026-05-22"
    })).toEqual({
      id: "inv_001",
      strainId: "str_001",
      strainName: "C57BL/6",
      speciesName: "小鼠",
      birthDate: "2026-05-21",
      ageWeeks: 5,
      gender: "M",
      initialQty: 100,
      reservedQty: 20,
      availableQty: 75,
      isAging: false,
      entryDate: "2026-05-22"
    });
  });

  it("serializes list filters and command payloads through explicit mappers", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      data: [],
      meta: { page: 2, per_page: 20, total: 0, total_pages: 0 },
      links: { self: "/api/v1/inventory-batches?page=2" }
    }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await listInventoryBatches({ page: 2, perPage: 20, strainId: "str_001", gender: "M" }, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/inventory-batches?page=2&per_page=20&strain_id=str_001&gender=M");
    expect(toCreateInventoryBatchDto({
      strainId: "str_001",
      birthDate: "2026-05-21",
      gender: "M",
      initialQty: 100,
      entryDate: "2026-05-22",
      notes: "A架"
    })).toEqual({
      strain_id: "str_001",
      birth_date: "2026-05-21",
      gender: "M",
      initial_qty: 100,
      entry_date: "2026-05-22",
      notes: "A架"
    });
  });

  it("keeps active-only strain queries separate from all-strain management queries", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await listStrains("token_123");
    await listStrains("token_123", {});

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/strains?is_active=true");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/strains");
  });

  it("creates inventory batches through commandRequest with an Idempotency-Key", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: { id: "inv_new" } }), {
      status: 201
    })));
    vi.stubGlobal("fetch", fetchMock);

    await createInventoryBatch({
      strainId: "str_001",
      birthDate: "2026-05-21",
      gender: "M",
      initialQty: 100,
      entryDate: "2026-05-22"
    }, "token_123");

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer token_123",
      "idempotency-key": expect.any(String)
    });
  });

  it("creates strains through the inventory API boundary", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      data: { id: "str_new", species_id: "spc_mouse", name: "NOD", is_active: true }
    }), {
      status: 201
    })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createStrain({ speciesId: "spc_mouse", name: "NOD" }, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/strains");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer token_123",
      "idempotency-key": expect.any(String)
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      species_id: "spc_mouse",
      name: "NOD"
    });
    expect(result).toEqual({
      id: "str_new",
      speciesId: "spc_mouse",
      name: "NOD",
      isActive: true
    });
  });

  it("deactivates strains through a soft-delete command", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      data: { id: "str_001", is_active: false }
    }), {
      status: 200
    })));
    vi.stubGlobal("fetch", fetchMock);

    await deactivateStrain("str_001", "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/strains/str_001");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer token_123",
      "idempotency-key": expect.any(String)
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ is_active: false });
  });

  it("reactivates strains through the same status command", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      data: { id: "str_001", is_active: true }
    }), {
      status: 200
    })));
    vi.stubGlobal("fetch", fetchMock);

    await updateStrainStatus("str_001", true, "token_123");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/strains/str_001");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ is_active: true });
  });
});
