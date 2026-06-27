import { describe, expect, it } from "vitest";
import {
  PrismaAuditLogRepository,
  PrismaCatalogRepository,
  PrismaCustomerRepository,
  PrismaDeliveryStrategyRuleRepository,
  PrismaDeliveryTaskRepository,
  PrismaDocumentRepository,
  PrismaInventoryRepository,
  PrismaOrderRepository
} from "./prisma-domain-repositories.js";
import { InventoryInsufficientError } from "../../application/errors.js";

const decimal = (value: string) => ({ toString: () => value });

describe("PrismaCustomerRepository", () => {
  it("creates and lists customers through the application repository shape", async () => {
    const createdData: unknown[] = [];
    const repository = new PrismaCustomerRepository({
      customer: {
        create: async ({ data }) => {
          createdData.push(data);
          return {
            id: 3,
            name: "������ѧ������",
            unitName: "������ѧ",
            researchGroup: "��������",
            geoArea: "����",
            settlementType: "monthly",
            creditDays: 30,
            defaultDelivery: "����",
            defaultInvoiceType: "special",
            notes: "�ص�ͻ�",
            isActive: true
          };
        },
        findUnique: async () => null,
        update: async () => ({}),
        count: async () => 1,
        findMany: async () => [
          {
            id: 3,
            name: "������ѧ������",
            unitName: "������ѧ",
            researchGroup: "��������",
            geoArea: "����",
            settlementType: "monthly",
            creditDays: 30,
            defaultDelivery: "����",
            defaultInvoiceType: "special",
            notes: "�ص�ͻ�",
            isActive: true
          }
        ]
      },
      customerAddress: {
        findUnique: async () => null,
        update: async () => ({})
      }
    });

    await expect(
      repository.create({
        name: "������ѧ������",
        unitName: "������ѧ",
        researchGroup: "��������",
        geoArea: "����",
        settlementType: "monthly",
        creditDays: 30,
        defaultDeliveryMethod: "����",
        defaultInvoiceType: "special",
        notes: "�ص�ͻ�"
      })
    ).resolves.toMatchObject({ id: "3", defaultDeliveryMethod: "����" });

    await expect(repository.list({ q: "����", geoArea: "����", page: 1, limit: 20 })).resolves.toEqual({
      data: [
        {
          id: "3",
          name: "������ѧ������",
          unitName: "������ѧ",
          researchGroup: "��������",
          geoArea: "����",
          settlementType: "monthly",
          creditDays: 30,
          defaultDeliveryMethod: "����",
          defaultInvoiceType: "special",
          notes: "�ص�ͻ�",
          isActive: true
        }
      ],
      meta: { total: 1, page: 1, limit: 20 }
    });
    expect(createdData).toHaveLength(1);
  });
});

describe("PrismaCatalogRepository", () => {
  it("returns the latest effective price and maps species and strains", async () => {
    const repository = new PrismaCatalogRepository({
      priceListEntry: {
        findFirst: async () => ({ id: 9, unitPrice: decimal("28.00"), effectiveFrom: new Date("2026-06-01T00:00:00.000Z") }),
        create: async () => ({ id: 10 })
      },
      strain: {
        create: async ({ data }) => ({ id: 2, speciesId: data.speciesId, name: data.name }),
        findMany: async () => [{ id: 2, speciesId: 1, name: "C57BL/6", isActive: true }],
        update: async ({ where, data }) => ({ id: where.id, isActive: data.isActive })
      },
      species: {
        findMany: async () => [{ id: 1, name: "С��", grade: "SPF" }]
      }
    });

    await expect(repository.getCurrentPriceDetails("2", 4)).resolves.toEqual({ unitPrice: "28.00", effectiveFrom: "2026-06-01" });
    await expect(repository.listSpecies()).resolves.toEqual([{ id: "1", name: "С��", grade: "SPF" }]);
    await expect(repository.listStrains({ speciesId: "1", isActive: true })).resolves.toEqual([
      { id: "2", speciesId: "1", name: "C57BL/6", isActive: true }
    ]);
    await expect(repository.updateStrain("2", { isActive: false })).resolves.toEqual({ id: "2", isActive: false });
  });
});

describe("PrismaOrderRepository", () => {
  it("creates an order with items and maps decimal totals back to strings", async () => {
    let createdOrderNumber = "";
    const repository = new PrismaOrderRepository({
      order: {
        create: async ({ data }) => {
          createdOrderNumber = data.orderNumber as string;
          return {
          id: 11,
          orderNumber: createdOrderNumber,
          customerId: 5,
          status: "pending",
          requiresInvoice: true,
          totalAmount: decimal("56.00"),
          items: [
            { id: 21, strainId: 2, ageWeeks: 4, gender: "M", quantity: 2 }
          ]
        };
        },
        findUnique: async () => null,
        update: async () => ({}),
        count: async () => 0,
        findMany: async () => []
      },
      orderItem: { update: async () => ({}) }
    });

    await expect(
      repository.create({
        customerId: "5",
        salesRepId: "7",
        invoiceRequired: true,
      items: [{ strainId: "2", ageWeeks: 4, gender: "M", quantity: 2, actualPrice: "28.00" }]
      })
    ).resolves.toMatchObject({
      id: "11",
      customerId: "5",
      status: "pending",
      invoiceRequired: true,
      totalAmount: "56.00",
      items: [{ id: "21", strainId: "2", quantity: 2 }]
    });
    expect(createdOrderNumber).toMatch(/^XS\d{8}[a-f0-9]{8}$/);
  });

  it("retries order number generation on order_number unique constraint collisions", async () => {
    const createArgs: unknown[] = [];
    const repository = new PrismaOrderRepository({
      order: {
        create: async (args) => {
          createArgs.push(args);
          if (createArgs.length < 2) {
            throw { code: "P2002", meta: { target: ["order_number"] } };
          }
          return {
            id: 11,
            orderNumber: (args.data.orderNumber as string),
            customerId: 5,
            status: "pending",
            requiresInvoice: true,
            totalAmount: decimal("56.00"),
            items: [{ id: 21, strainId: 2, ageWeeks: 4, gender: "M", quantity: 2 }]
          };
        },
        findUnique: async () => null,
        update: async () => ({}),
        count: async () => 0,
        findMany: async () => []
      },
      orderItem: { update: async () => ({}) }
    });

    await expect(
      repository.create({
        customerId: "5",
        salesRepId: "7",
        invoiceRequired: true,
        items: [{ strainId: "2", ageWeeks: 4, gender: "M", quantity: 2, actualPrice: "28.00" }]
      })
    ).resolves.toMatchObject({ id: "11" });
    expect(createArgs).toHaveLength(2);
  });
});



  it("lists orders with filters, pagination, and DTO decimal mapping", async () => {
    const findManyArgs: unknown[] = [];
    const countArgs: unknown[] = [];
    const repository = new PrismaOrderRepository({
      order: {
        create: async () => ({
          id: 0,
          orderNumber: "unused",
          customerId: 0,
          status: "pending",
          requiresInvoice: false,
          totalAmount: decimal("0.00"),
          items: []
        }),
        findUnique: async () => null,
        update: async () => ({}),
        count: async (args) => {
          countArgs.push(args);
          return 2;
        },
        findMany: async (args) => {
          findManyArgs.push(args);
          return [
            {
              id: 12,
              orderNumber: "XS12",
              customerId: 5,
              status: "delivered",
              requiresInvoice: true,
              totalAmount: decimal("56.00"),
              items: [{ id: 22, strainId: 2, ageWeeks: 4, gender: "M", quantity: 2 }]
            }
          ];
        }
      },
      orderItem: { update: async () => ({}) }
    });

    await expect(repository.list({ customerId: "5", status: "delivered", page: 2, limit: 10 })).resolves.toEqual({
      data: [
        {
          id: "12",
          customerId: "5",
          orderNumber: "XS12",
          status: "delivered",
          invoiceRequired: true,
          totalAmount: "56.00",
          items: [{ id: "22", strainId: "2", ageWeeks: 4, gender: "M", quantity: 2 }]
        }
      ],
      meta: { total: 2, page: 2, limit: 10 }
    });
    expect(countArgs[0]).toEqual({ where: { customerId: 5, status: "delivered" } });
    expect(findManyArgs[0]).toMatchObject({
      where: { customerId: 5, status: "delivered" },
      include: { items: true },
      skip: 10,
      take: 10,
      orderBy: { id: "desc" }
    });
  });
describe("PrismaDeliveryStrategyRuleRepository", () => {
  it("lists active delivery strategy rules through the application repository shape", async () => {
    const repository = new PrismaDeliveryStrategyRuleRepository({
      deliveryStrategyRule: {
        findMany: async () => [
          {
            id: 1,
            name: "纸箱运费免收提示",
            geoArea: "海淀",
            amountThreshold: decimal("500.00"),
            quantityThreshold: null,
            suggestionText: "再增加 {remaining_amount} 元可满足免纸箱运费提示条件",
            isActive: true
          }
        ],
        create: async () => ({ id: 2 }),
        update: async () => ({ id: 2 })
      }
    });

    await expect(repository.listActive()).resolves.toEqual([
      {
        id: "1",
        name: "纸箱运费免收提示",
        geoArea: "海淀",
        amountThreshold: "500.00",
        quantityThreshold: undefined,
        suggestionText: "再增加 {remaining_amount} 元可满足免纸箱运费提示条件",
        isActive: true
      }
    ]);
  });
});
  it("creates and updates delivery strategy rules through the repository shape", async () => {
    const createData: unknown[] = [];
    const updateArgs: unknown[] = [];
    const repository = new PrismaDeliveryStrategyRuleRepository({
      deliveryStrategyRule: {
        findMany: async () => [],
        create: async ({ data }) => {
          createData.push(data);
          return { id: 2 };
        },
        update: async (args) => {
          updateArgs.push(args);
          return { id: 2 };
        }
      }
    });

    await expect(repository.create?.({
      name: "carton hint",
      geoArea: "Haidian",
      amountThreshold: "500.00",
      suggestionText: "Add {remaining_amount}",
      isActive: true
    })).resolves.toEqual({ id: "2" });
    await expect(repository.update?.("2", { amountThreshold: "600.00", isActive: false })).resolves.toEqual({ id: "2" });

    expect(createData[0]).toEqual({
      name: "carton hint",
      geoArea: "Haidian",
      amountThreshold: "500.00",
      quantityThreshold: undefined,
      suggestionText: "Add {remaining_amount}",
      isActive: true
    });
    expect(updateArgs[0]).toEqual({ where: { id: 2 }, data: { amountThreshold: "600.00", isActive: false } });
  });
describe("PrismaDeliveryTaskRepository", () => {
  it("persists scheduling details when marking a task scheduled", async () => {
    let updateData: Record<string, unknown> | undefined;
    const repository = new PrismaDeliveryTaskRepository({
      deliveryTask: {
        findUnique: async () => null,
        create: async () => ({ id: 4, orderId: 11, status: "pending_schedule", salesActionRequired: false, salesActionNote: null }),
        update: async ({ data }) => {
          updateData = data;
          return {};
        },
        count: async () => 0,
        findMany: async () => []
      }
    });

    await repository.markScheduled("4", {
      plannedDeliveryDate: "2026-06-30",
      vehicle: "��A12345",
      driver: "����",
      deliveryBatch: "BATCH-1",
      routeNotes: "���ͺ���"
    });

    expect(updateData).toEqual({
      status: "scheduled",
      plannedDeliveryDate: new Date("2026-06-30T00:00:00.000Z"),
      vehicle: "��A12345",
      driver: "����",
      deliveryBatch: "BATCH-1",
      routeNotes: "���ͺ���"
    });
  });

  it("filters delivery task lists by planned date and customer geo area", async () => {
    const countArgs: unknown[] = [];
    const findManyArgs: unknown[] = [];
    const repository = new PrismaDeliveryTaskRepository({
      deliveryTask: {
        findUnique: async () => null,
        create: async () => ({ id: 4, orderId: 11, status: "pending_schedule", salesActionRequired: false, salesActionNote: null }),
        update: async () => ({}),
        count: async (args) => {
          countArgs.push(args);
          return 0;
        },
        findMany: async (args) => {
          findManyArgs.push(args);
          return [];
        }
      }
    });

    await repository.list({ plannedDeliveryDate: "2026-06-30", geoArea: "海淀", page: 1, limit: 20 });

    const expectedWhere = {
      plannedDeliveryDate: new Date("2026-06-30T00:00:00.000Z"),
      order: { customer: { geoArea: "海淀" } }
    };
    expect(countArgs[0]).toEqual({ where: expectedWhere });
    expect(findManyArgs[0]).toMatchObject({ where: expectedWhere, skip: 0, take: 20 });
  });
});

describe("PrismaInventoryRepository", () => {
  it("computes availability from initial quantity minus reserved and stock deductions", async () => {
    const repository = new PrismaInventoryRepository({
      inventoryBatch: {
        findUnique: async () => ({ id: 8, initialQty: 20, reservedQty: 3, birthDate: new Date("2026-05-01T00:00:00.000Z") }),
        update: async () => ({}),
        create: async () => ({ id: 9 }),
        count: async () => 1,
        findMany: async () => [
          { id: 8, initialQty: 20, reservedQty: 3, birthDate: new Date("2026-05-01T00:00:00.000Z") }
        ],
        aggregate: async () => ({ _sum: { initialQty: 20, reservedQty: 3 } })
      },
      stockDeduction: {
        aggregate: async () => ({ _sum: { quantity: 5 } }),
        groupBy: async () => [{ inventoryBatchId: 8, _sum: { quantity: 5 } }],
        create: async () => ({})
      },
      reservationAllocation: {
        create: async () => ({}),
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 })
      }
    });

    await expect(repository.getAvailableQty("2", 4, "M")).resolves.toBe(12);
    await expect(repository.getAvailabilitySummary({ strainId: "2", ageWeeks: 4, gender: "M" })).resolves.toEqual({
      availableQty: 12,
      reservedQty: 3,
      agingQty: 0
    });
    await expect(repository.getBatch("8")).resolves.toMatchObject({
      id: "8",
      birthDate: "2026-05-01",
      initialQty: 20,
      reservedQty: 3,
      availableQty: 12
    });
    await expect(repository.listBatchesForItem("2", 4, "M")).resolves.toEqual([
      { id: "8", birthDate: "2026-05-01", availableQty: 12 }
    ]);
  });

  it("reserves FIFO batches and records reservation allocations by order item", async () => {
    const updates: unknown[] = [];
    const allocations: unknown[] = [];
    const repository = new PrismaInventoryRepository({
      inventoryBatch: {
        findUnique: async () => null,
        update: async (args) => {
          updates.push(args);
          return {};
        },
        create: async () => ({ id: 9 }),
        count: async () => 1,
        findMany: async () => [
          { id: 8, initialQty: 10, reservedQty: 3, birthDate: new Date("2026-05-01T00:00:00.000Z") },
          { id: 9, initialQty: 10, reservedQty: 0, birthDate: new Date("2026-05-08T00:00:00.000Z") }
        ],
        aggregate: async () => ({ _sum: { initialQty: 20, reservedQty: 3 } })
      },
      stockDeduction: {
        aggregate: async () => ({ _sum: { quantity: 0 } }),
        groupBy: async () => [],
        create: async () => ({})
      },
      reservationAllocation: {
        create: async ({ data }) => {
          allocations.push(data);
          return {};
        },
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 })
      }
    });

    await repository.reserve({ orderItemId: "21", strainId: "2", ageWeeks: 4, gender: "M", quantity: 9 });

    expect(updates).toEqual([
      { where: { id: 8 }, data: { reservedQty: { increment: 7 } } },
      { where: { id: 9 }, data: { reservedQty: { increment: 2 } } }
    ]);
    expect(allocations).toEqual([
      { orderItemId: 21, inventoryBatchId: 8, quantity: 7 },
      { orderItemId: 21, inventoryBatchId: 9, quantity: 2 }
    ]);
  });

  it("throws when FIFO batches cannot cover a reservation", async () => {
    const repository = new PrismaInventoryRepository({
      inventoryBatch: {
        findUnique: async () => null,
        update: async () => ({}),
        create: async () => ({ id: 9 }),
        count: async () => 1,
        findMany: async () => [{ id: 8, initialQty: 5, reservedQty: 0, birthDate: new Date("2026-05-01T00:00:00.000Z") }],
        aggregate: async () => ({ _sum: { initialQty: 5, reservedQty: 0 } })
      },
      stockDeduction: {
        aggregate: async () => ({ _sum: { quantity: 0 } }),
        groupBy: async () => [],
        create: async () => ({})
      },
      reservationAllocation: {
        create: async () => ({}),
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 })
      }
    });

    await expect(repository.reserve({ orderItemId: "21", strainId: "2", ageWeeks: 4, gender: "M", quantity: 6 })).rejects.toThrow(
      InventoryInsufficientError
    );
  });

  it("releases and finalizes reservation allocations by order item", async () => {
    const updates: unknown[] = [];
    const deletes: unknown[] = [];
    const repository = new PrismaInventoryRepository({
      inventoryBatch: {
        findUnique: async () => null,
        update: async (args) => {
          updates.push(args);
          return {};
        },
        create: async () => ({ id: 9 }),
        count: async () => 1,
        findMany: async () => [],
        aggregate: async () => ({ _sum: { initialQty: 0, reservedQty: 0 } })
      },
      stockDeduction: {
        aggregate: async () => ({ _sum: { quantity: 0 } }),
        groupBy: async () => [],
        create: async () => ({})
      },
      reservationAllocation: {
        create: async () => ({}),
        findMany: async () => [
          { orderItemId: 21, inventoryBatchId: 8, quantity: 7 },
          { orderItemId: 21, inventoryBatchId: 9, quantity: 2 }
        ],
        deleteMany: async (args) => {
          deletes.push(args);
          return { count: 2 };
        }
      }
    });

    await repository.releaseAllocations("21");
    await repository.finalizeAllocations("21");

    expect(updates).toEqual([
      { where: { id: 8 }, data: { reservedQty: { decrement: 7 } } },
      { where: { id: 9 }, data: { reservedQty: { decrement: 2 } } },
      { where: { id: 8 }, data: { reservedQty: { decrement: 7 } } },
      { where: { id: 9 }, data: { reservedQty: { decrement: 2 } } }
    ]);
    expect(deletes).toEqual([{ where: { orderItemId: 21 } }, { where: { orderItemId: 21 } }]);
  });
  it("lists audit logs through the application repository shape", async () => {
    const findManyArgs: unknown[] = [];
    const auditLogs = new PrismaAuditLogRepository({
      auditLog: {
        create: async () => ({}),
        count: async () => 1,
        findMany: async (args) => {
          findManyArgs.push(args);
          return [
            {
              id: BigInt(1),
              userId: 7,
              action: "change_prices",
              entityType: "order",
              entityId: 11,
              oldValue: '{"actual_price":"28.00"}',
              newValue: '{"actual_price":"25.00"}',
              reason: "客户长期合作协议价",
              createdAt: new Date("2026-06-25T11:00:00.000Z"),
              user: { displayName: "张三" }
            }
          ];
        }
      }
    });

    await expect(auditLogs.list({ entityType: "order", entityId: "11", page: 1, limit: 20 })).resolves.toEqual({
      data: [
        {
          id: "1",
          actorId: "7",
          actorName: "张三",
          action: "change_prices",
          entityType: "order",
          entityId: "11",
          oldValue: '{"actual_price":"28.00"}',
          newValue: '{"actual_price":"25.00"}',
          reason: "客户长期合作协议价",
          createdAt: "2026-06-25T11:00:00.000Z"
        }
      ],
      meta: { total: 1, page: 1, limit: 20 }
    });
    expect(findManyArgs[0]).toMatchObject({ where: { entityType: "order", entityId: 11 }, skip: 0, take: 20 });
  });
});

describe("PrismaDocumentRepository and PrismaAuditLogRepository", () => {
  it("records document metadata and lightweight audit entries", async () => {
    const certificateData: unknown[] = [];
    const invoiceData: unknown[] = [];
    const auditData: unknown[] = [];
    const documents = new PrismaDocumentRepository({
      certificate: { create: async ({ data }) => { certificateData.push(data); return { id: 1 }; } },
      document: { create: async ({ data }) => { invoiceData.push(data); return { id: 2 }; } },
      documentReleaseReason: { create: async () => ({}) }
    });
    const auditLogs = new PrismaAuditLogRepository({
      auditLog: { create: async ({ data }) => { auditData.push(data); return {}; }, count: async () => 0, findMany: async () => [] }
    });

    await expect(
      documents.recordCertificate({ orderId: "11", fileName: "cert.pdf", filePath: "/tmp/cert.pdf", uploadedBy: "7" })
    ).resolves.toEqual({ id: "1" });
    await expect(
      documents.recordInvoiceRegistration({ orderId: "11", invoiceType: "normal", registeredAt: "2026-06-25", registeredBy: "7" })
    ).resolves.toEqual({ id: "2" });
    await auditLogs.record({
      actorId: "7",
      action: "flag_sales_action",
      entityType: "delivery_task",
      entityId: "9",
      reason: "送货地址缺少楼号",
      newValue: { note: "送货地址缺少楼号" }
    });

    expect(certificateData).toHaveLength(1);
    expect(invoiceData).toHaveLength(1);
    expect(auditData).toEqual([
      {
        userId: 7,
        action: "flag_sales_action",
        entityType: "delivery_task",
        entityId: 9,
        reason: "送货地址缺少楼号",
        newValue: JSON.stringify({ note: "送货地址缺少楼号" })
      }
    ]);
  });
});


