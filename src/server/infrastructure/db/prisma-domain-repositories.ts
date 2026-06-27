import type {
  AuditLog,
  AuditLogEntry,
  AuditLogListFilters,
  AuditLogRepository,
  CatalogRepository,
  CertificateEntry,
  Customer,
  CustomerAddress,
  CustomerRepository,
  DeliveryStrategyRule,
  DeliveryStrategyRuleChanges,
  DeliveryStrategyRuleRepository,
  DeliveryTask,
  DeliveryTaskRepository,
  DocumentReleaseReasonEntry,
  DocumentRepository,
  InventoryBatch,
  InventoryRepository,
  InvoiceRegistrationEntry,
  NewCustomer,
  NewDeliveryStrategyRule,
  NewInventoryBatch,
  NewOrder,
  Order,
  OrderRepository,
  Page,
  Species,
  StockDeductionEntry,
  Strain
} from "../../application/shared/types.js";
import { randomBytes } from "node:crypto";
import type { InventoryBatchCandidate } from "../../domain/inventory-policy.js";
import { InventoryInsufficientError } from "../../application/errors.js";

type Gender = "M" | "F";
type OrderStatus = Order["status"];
type DeliveryStatus = DeliveryTask["status"];
type DecimalLike = { toString(): string };

type CustomerRecord = {
  id: number;
  name: string;
  unitName?: string | null;
  researchGroup?: string | null;
  geoArea?: string | null;
  settlementType: "single" | "monthly";
  creditDays: number;
  defaultDelivery?: string | null;
  defaultInvoiceType?: string | null;
  notes?: string | null;
  isActive: boolean;
};

type CustomerAddressRecord = {
  id: number;
  customerId: number;
  addressType: "delivery" | "invoice";
  detail: string;
  isDefault: boolean;
};

type OrderItemRecord = { id: number; strainId: number; ageWeeks: number; gender: Gender; quantity: number };
type OrderRecord = {
  id: number;
  orderNumber: string;
  customerId: number;
  customer?: { name: string } | null;
  status: OrderStatus;
  requiresInvoice: boolean;
  invoiceType?: string | null;
  totalAmount: DecimalLike;
  createdAt?: Date;
  items: OrderItemRecord[];
};

type DeliveryTaskRecord = {
  id: number;
  orderId: number;
  order?: {
    orderNumber: string;
    requiresInvoice: boolean;
    customer?: {
      name: string;
      geoArea?: string | null;
      contacts?: { name: string; phone?: string | null }[];
      addresses?: { detail: string }[];
    } | null;
  } | null;
  status: DeliveryStatus;
  plannedDeliveryDate?: Date | null;
  vehicle?: string | null;
  driver?: string | null;
  deliveryBatch?: string | null;
  routeNotes?: string | null;
  deliveredAt?: Date | null;
  salesActionRequired: boolean;
  salesActionNote?: string | null;
};

type InventoryBatchRecord = {
  id: number;
  strainId?: number;
  birthDate?: Date | null;
  gender?: Gender;
  initialQty: number;
  reservedQty: number;
  entryDate?: Date | null;
  strain?: { name: string; species?: { name: string } | null } | null;
};
type ReservationAllocationRecord = { orderItemId: number; inventoryBatchId: number; quantity: number };

type AggregateQuantity = { _sum: { quantity?: number | null; initialQty?: number | null; reservedQty?: number | null } };

function id(value: string): number {
  return Number(value);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function optionalDate(value?: string): Date | undefined {
  return value ? toDate(value) : undefined;
}

function todayOrderDate(): string {
  return new Date().toISOString().slice(0, 10).replaceAll("-", "");
}

function generateOrderNumber(): string {
  return `XS${todayOrderDate()}${randomBytes(4).toString("hex")}`;
}

function isOrderNumberUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") {
    return false;
  }
  const target =
    "meta" in error && typeof error.meta === "object" && error.meta !== null && "target" in error.meta
      ? error.meta.target
      : undefined;
  return Array.isArray(target) ? target.includes("order_number") : target === "order_number";
}

function clean<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function toCustomer(record: CustomerRecord): Customer {
  return {
    id: String(record.id),
    name: record.name,
    unitName: record.unitName ?? undefined,
    researchGroup: record.researchGroup ?? undefined,
    geoArea: record.geoArea ?? undefined,
    settlementType: record.settlementType,
    creditDays: record.creditDays,
    defaultDeliveryMethod: record.defaultDelivery ?? undefined,
    defaultInvoiceType: record.defaultInvoiceType ?? undefined,
    notes: record.notes ?? undefined,
    isActive: record.isActive
  };
}

function toAddress(record: CustomerAddressRecord): CustomerAddress {
  return {
    id: String(record.id),
    customerId: String(record.customerId),
    addressType: record.addressType,
    detail: record.detail,
    isDefault: record.isDefault
  };
}

function toOrder(record: OrderRecord): Order {
  return {
    id: String(record.id),
    status: record.status,
    invoiceRequired: record.requiresInvoice,
    customerId: String(record.customerId),
    customerName: record.customer?.name,
    orderNumber: record.orderNumber,
    totalAmount: record.totalAmount.toString(),
    invoiceType: record.invoiceType ?? undefined,
    createdAt: record.createdAt?.toISOString(),
    items: record.items.map((item) => ({
      id: String(item.id),
      strainId: String(item.strainId),
      ageWeeks: item.ageWeeks,
      gender: item.gender,
      quantity: item.quantity
    }))
  };
}

function toDeliveryTask(record: DeliveryTaskRecord): DeliveryTask {
  return {
    id: String(record.id),
    orderId: String(record.orderId),
    orderNumber: record.order?.orderNumber,
    status: record.status,
    customerName: record.order?.customer?.name,
    geoArea: record.order?.customer?.geoArea ?? undefined,
    deliveryAddress: record.order?.customer?.addresses?.[0]?.detail,
    contactName: record.order?.customer?.contacts?.[0]?.name,
    contactPhone: record.order?.customer?.contacts?.[0]?.phone ?? undefined,
    plannedDeliveryDate: record.plannedDeliveryDate ? dateOnly(record.plannedDeliveryDate) : undefined,
    vehicle: record.vehicle ?? undefined,
    driver: record.driver ?? undefined,
    deliveryBatch: record.deliveryBatch ?? undefined,
    routeNotes: record.routeNotes ?? undefined,
    deliveredAt: record.deliveredAt ? dateOnly(record.deliveredAt) : undefined,
    salesActionRequired: record.salesActionRequired,
    salesActionNote: record.salesActionNote ?? undefined,
    documentReadiness: record.order
      ? { certificateUploaded: false, invoiceRegistered: false, requiresInvoice: record.order.requiresInvoice }
      : undefined
  };
}

function ageWeeksOf(birthDate?: Date | null): number {
  if (!birthDate) {
    return 0;
  }
  const elapsedMs = Date.now() - birthDate.getTime();
  return Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24 * 7)));
}

function toBatch(record: InventoryBatchRecord, deductedQty: number): InventoryBatch {
  return {
    id: String(record.id),
    strainId: record.strainId === undefined ? "" : String(record.strainId),
    strainName: record.strain?.name ?? "",
    speciesName: record.strain?.species?.name ?? "",
    birthDate: record.birthDate ? dateOnly(record.birthDate) : "",
    ageWeeks: ageWeeksOf(record.birthDate),
    gender: record.gender ?? "M",
    initialQty: record.initialQty,
    reservedQty: record.reservedQty,
    availableQty: record.initialQty - record.reservedQty - deductedQty,
    isAging: false,
    entryDate: record.entryDate ? dateOnly(record.entryDate) : ""
  };
}

function birthDateWhereForAgeWeeks(ageWeeks: number): { gt: Date; lte: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - ageWeeks * 7);
  const start = new Date(now);
  start.setDate(start.getDate() - (ageWeeks + 1) * 7);
  return { gt: start, lte: end };
}

function inventoryBatchWhere(strainId: string, ageWeeks: number, gender: Gender): Record<string, unknown> {
  return { strainId: id(strainId), gender, birthDate: birthDateWhereForAgeWeeks(ageWeeks) };
}

async function deductedQty(client: PrismaInventoryClient, batchId: number): Promise<number> {
  const result = await client.stockDeduction.aggregate({
    where: { inventoryBatchId: batchId },
    _sum: { quantity: true }
  });
  return result._sum.quantity ?? 0;
}

async function deductedQtyByBatchId(client: PrismaInventoryClient, batchIds: number[]): Promise<Map<number, number>> {
  if (batchIds.length === 0) {
    return new Map();
  }
  const deductions = await client.stockDeduction.groupBy({
    by: ["inventoryBatchId"],
    where: { inventoryBatchId: { in: batchIds } },
    _sum: { quantity: true }
  });
  return new Map(deductions.map((entry) => [entry.inventoryBatchId, entry._sum.quantity ?? 0]));
}

export interface PrismaCustomerClient {
  customer: {
    create(args: { data: Record<string, unknown> }): Promise<CustomerRecord>;
    findUnique(args: { where: { id: number } }): Promise<CustomerRecord | null>;
    update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: Record<string, unknown>): Promise<CustomerRecord[]>;
  };
  customerAddress: {
    findUnique(args: { where: { id: number } }): Promise<CustomerAddressRecord | null>;
    update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaCustomerClient) {}

  async create(customer: NewCustomer): Promise<Customer> {
    const record = await this.prisma.customer.create({
      data: clean({
        name: customer.name,
        unitName: customer.unitName,
        researchGroup: customer.researchGroup,
        geoArea: customer.geoArea,
        settlementType: customer.settlementType,
        creditDays: customer.creditDays ?? 60,
        defaultDelivery: customer.defaultDeliveryMethod,
        defaultInvoiceType: customer.defaultInvoiceType,
        notes: customer.notes
      })
    });
    return toCustomer(record);
  }

  async findById(customerId: string): Promise<Customer | null> {
    const record = await this.prisma.customer.findUnique({ where: { id: id(customerId) } });
    return record ? toCustomer(record) : null;
  }

  async update(customerId: string, changes: Partial<NewCustomer>): Promise<void> {
    await this.prisma.customer.update({
      where: { id: id(customerId) },
      data: clean({
        name: changes.name,
        unitName: changes.unitName,
        researchGroup: changes.researchGroup,
        geoArea: changes.geoArea,
        settlementType: changes.settlementType,
        creditDays: changes.creditDays,
        defaultDelivery: changes.defaultDeliveryMethod,
        defaultInvoiceType: changes.defaultInvoiceType,
        notes: changes.notes
      })
    });
  }

  async findAddressById(addressId: string): Promise<CustomerAddress | null> {
    const record = await this.prisma.customerAddress.findUnique({ where: { id: id(addressId) } });
    return record ? toAddress(record) : null;
  }

  async updateAddress(addressId: string, changes: { detail?: string; isDefault?: boolean }): Promise<void> {
    await this.prisma.customerAddress.update({ where: { id: id(addressId) }, data: clean(changes) });
  }

  async list(filters: { q?: string; geoArea?: string; page: number; limit: number }): Promise<Page<Customer>> {
    const where = clean({
      name: filters.q ? { contains: filters.q } : undefined,
      geoArea: filters.geoArea
    });
    const [total, data] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({ where, skip: (filters.page - 1) * filters.limit, take: filters.limit, orderBy: { id: "asc" } })
    ]);
    return { data: data.map(toCustomer), meta: { total, page: filters.page, limit: filters.limit } };
  }
}

export interface PrismaCatalogClient {
  priceListEntry: {
    findFirst(args: Record<string, unknown>): Promise<{ id: number; unitPrice: DecimalLike; effectiveFrom: Date } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: number }>;
  };
  strain: {
    create(args: { data: { speciesId: number; name: string } }): Promise<{ id: number; speciesId: number; name: string }>;
    findMany(args: Record<string, unknown>): Promise<{ id: number; speciesId: number; name: string; isActive: boolean }[]>;
    update(args: { where: { id: number }; data: { isActive: boolean } }): Promise<{ id: number; isActive: boolean }>;
  };
  species: {
    findMany(args?: Record<string, unknown>): Promise<{ id: number; name: string; grade: string }[]>;
  };
}

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaCatalogClient) {}

  async getCurrentPrice(strainId: string, ageWeeks: number): Promise<string | null> {
    const details = await this.getCurrentPriceDetails(strainId, ageWeeks);
    return details?.unitPrice ?? null;
  }

  async getCurrentPriceDetails(strainId: string, ageWeeks: number): Promise<{ unitPrice: string; effectiveFrom: string } | null> {
    const record = await this.prisma.priceListEntry.findFirst({
      where: { strainId: id(strainId), ageWeeks, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" }
    });
    return record ? { unitPrice: record.unitPrice.toString(), effectiveFrom: dateOnly(record.effectiveFrom) } : null;
  }

  async createStrain(strain: { speciesId: string; name: string }): Promise<{ id: string; speciesId: string; name: string }> {
    const record = await this.prisma.strain.create({ data: { speciesId: id(strain.speciesId), name: strain.name } });
    return { id: String(record.id), speciesId: String(record.speciesId), name: record.name };
  }

  async updateStrain(strainId: string, changes: { isActive: boolean }): Promise<{ id: string; isActive: boolean }> {
    const record = await this.prisma.strain.update({
      where: { id: id(strainId) },
      data: { isActive: changes.isActive }
    });
    return { id: String(record.id), isActive: record.isActive };
  }

  async createPriceRule(rule: { strainId: string; ageWeeks: number; unitPrice: string; effectiveFrom: string }): Promise<{ id: string }> {
    const record = await this.prisma.priceListEntry.create({
      data: { strainId: id(rule.strainId), ageWeeks: rule.ageWeeks, unitPrice: rule.unitPrice, effectiveFrom: toDate(rule.effectiveFrom) }
    });
    return { id: String(record.id) };
  }

  async listSpecies(): Promise<Species[]> {
    const records = await this.prisma.species.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    return records.map((record) => ({ id: String(record.id), name: record.name, grade: record.grade }));
  }

  async listStrains(filters: { speciesId?: string; isActive?: boolean }): Promise<Strain[]> {
    const records = await this.prisma.strain.findMany({
      where: clean({ speciesId: filters.speciesId ? id(filters.speciesId) : undefined, isActive: filters.isActive }),
      orderBy: { id: "asc" }
    });
    return records.map((record) => ({ id: String(record.id), speciesId: String(record.speciesId), name: record.name, isActive: record.isActive }));
  }
}

export interface PrismaOrderClient {
  order: {
    create(args: { data: Record<string, unknown>; include: Record<string, unknown> }): Promise<OrderRecord>;
    findUnique(args: { where: { id: number }; include: Record<string, unknown> }): Promise<OrderRecord | null>;
    update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: Record<string, unknown>): Promise<OrderRecord[]>;
  };
  orderItem: { update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown> };
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaOrderClient) {}

  async create(order: NewOrder): Promise<Order> {
    const totalAmount = order.items.reduce((sum, item) => sum + Number(item.actualPrice) * item.quantity, 0).toFixed(2);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const record = await this.prisma.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            customerId: id(order.customerId),
            salesRepId: id(order.salesRepId ?? "0"),
            deliveryMethod: order.deliveryMethod,
            deliveryDate: optionalDate(order.plannedDeliveryDate),
            requiresInvoice: order.invoiceRequired,
            invoiceType: order.invoiceType,
            notes: order.notes,
            totalAmount,
            items: {
              create: order.items.map((item) => ({
                strainId: id(item.strainId),
                ageWeeks: item.ageWeeks,
                gender: item.gender,
                quantity: item.quantity,
                unitPrice: item.actualPrice,
                actualPrice: item.actualPrice
              }))
            }
          },
          include: { items: true }
        });
        return toOrder(record);
      } catch (error) {
        if (!isOrderNumberUniqueConstraintError(error) || attempt === 2) {
          throw error;
        }
      }
    }
    throw new Error("failed to generate unique order number");
  }

  async findById(orderId: string): Promise<Order | null> {
    const record = await this.prisma.order.findUnique({ where: { id: id(orderId) }, include: { items: true, customer: true } });
    return record ? toOrder(record) : null;
  }

  async markConfirmed(orderId: string): Promise<void> { await this.setStatus(orderId, "confirmed"); }
  async markShipped(orderId: string): Promise<void> { await this.setStatus(orderId, "shipped"); }
  async markDelivered(orderId: string): Promise<void> { await this.setStatus(orderId, "delivered"); }
  async markInvoiced(orderId: string): Promise<void> { await this.setStatus(orderId, "invoiced"); }
  async markSettled(orderId: string): Promise<void> { await this.setStatus(orderId, "settled"); }
  async markCancelled(orderId: string): Promise<void> { await this.setStatus(orderId, "cancelled"); }

  async updateItemPrices(_orderId: string, items: { orderItemId: string; actualPrice: string }[]): Promise<void> {
    await Promise.all(items.map((item) => this.prisma.orderItem.update({ where: { id: id(item.orderItemId) }, data: { actualPrice: item.actualPrice } })));
  }

  async list(filters: { customerId?: string; status?: OrderStatus; page: number; limit: number }): Promise<Page<Order>> {
    const where = clean({ customerId: filters.customerId ? id(filters.customerId) : undefined, status: filters.status });
    const [total, data] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({ where, include: { items: true, customer: true }, skip: (filters.page - 1) * filters.limit, take: filters.limit, orderBy: { id: "desc" } })
    ]);
    return { data: data.map(toOrder), meta: { total, page: filters.page, limit: filters.limit } };
  }

  private async setStatus(orderId: string, status: OrderStatus): Promise<void> {
    await this.prisma.order.update({ where: { id: id(orderId) }, data: { status } });
  }
}


type DeliveryStrategyRuleWriteData = {
  name?: string;
  geoArea?: string;
  amountThreshold?: string;
  quantityThreshold?: number;
  suggestionText?: string;
  isActive?: boolean;
};

type DeliveryStrategyRuleRecord = {
  id: number;
  name: string;
  geoArea?: string | null;
  amountThreshold?: DecimalLike | null;
  quantityThreshold?: number | null;
  suggestionText: string;
  isActive: boolean;
};

export interface PrismaDeliveryStrategyRuleClient {
  deliveryStrategyRule: {
    findMany(args: Record<string, unknown>): Promise<DeliveryStrategyRuleRecord[]>;
    create(args: { data: DeliveryStrategyRuleWriteData }): Promise<{ id: number }>;
    update(args: { where: { id: number }; data: DeliveryStrategyRuleWriteData }): Promise<{ id: number }>;
  };
}

export class PrismaDeliveryStrategyRuleRepository implements DeliveryStrategyRuleRepository {
  constructor(private readonly prisma: PrismaDeliveryStrategyRuleClient) {}

  async listActive(): Promise<DeliveryStrategyRule[]> {
    const records = await this.prisma.deliveryStrategyRule.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
    return records.map((record) => ({
      id: String(record.id),
      name: record.name,
      geoArea: record.geoArea ?? undefined,
      amountThreshold: record.amountThreshold?.toString(),
      quantityThreshold: record.quantityThreshold ?? undefined,
      suggestionText: record.suggestionText,
      isActive: record.isActive
    }));
  }

  async create(rule: NewDeliveryStrategyRule): Promise<{ id: string }> {
    const record = await this.prisma.deliveryStrategyRule.create({
      data: {
        name: rule.name,
        geoArea: rule.geoArea,
        amountThreshold: rule.amountThreshold,
        quantityThreshold: rule.quantityThreshold,
        suggestionText: rule.suggestionText,
        isActive: rule.isActive ?? true
      }
    });
    return { id: String(record.id) };
  }

  async update(ruleId: string, changes: DeliveryStrategyRuleChanges): Promise<{ id: string }> {
    const record = await this.prisma.deliveryStrategyRule.update({
      where: { id: id(ruleId) },
      data: clean({
        name: changes.name,
        geoArea: changes.geoArea,
        amountThreshold: changes.amountThreshold,
        quantityThreshold: changes.quantityThreshold,
        suggestionText: changes.suggestionText,
        isActive: changes.isActive
      })
    });
    return { id: String(record.id) };
  }
}
export interface PrismaDeliveryTaskClient {
  deliveryTask: {
    findUnique(args: Record<string, unknown>): Promise<DeliveryTaskRecord | null>;
    create(args: { data: Record<string, unknown> }): Promise<DeliveryTaskRecord>;
    update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: Record<string, unknown>): Promise<DeliveryTaskRecord[]>;
  };
}

export class PrismaDeliveryTaskRepository implements DeliveryTaskRepository {
  constructor(private readonly prisma: PrismaDeliveryTaskClient) {}

  async findById(taskId: string): Promise<DeliveryTask | null> {
    const record = await this.prisma.deliveryTask.findUnique({
      where: { id: id(taskId) },
      include: {
        order: {
          select: {
            orderNumber: true,
            requiresInvoice: true,
            customer: {
              select: {
                name: true,
                geoArea: true,
                contacts: { where: { isPrimary: true }, take: 1, select: { name: true, phone: true } },
                addresses: { where: { addressType: "delivery", isDefault: true }, take: 1, select: { detail: true } }
              }
            }
          }
        }
      }
    });
    return record ? toDeliveryTask(record) : null;
  }

  async findByOrderId(orderId: string): Promise<DeliveryTask | null> {
    const record = await this.prisma.deliveryTask.findUnique({ where: { orderId: id(orderId) } });
    return record ? toDeliveryTask(record) : null;
  }

  async createForOrder(orderId: string): Promise<DeliveryTask> {
    const record = await this.prisma.deliveryTask.create({ data: { orderId: id(orderId) } });
    return toDeliveryTask(record);
  }

  async markScheduled(taskId: string, details: { plannedDeliveryDate?: string; vehicle?: string; driver?: string; deliveryBatch?: string; routeNotes?: string } = {}): Promise<void> {
    await this.prisma.deliveryTask.update({
      where: { id: id(taskId) },
      data: clean({
        status: "scheduled",
        plannedDeliveryDate: optionalDate(details.plannedDeliveryDate),
        vehicle: details.vehicle,
        driver: details.driver,
        deliveryBatch: details.deliveryBatch,
        routeNotes: details.routeNotes
      })
    });
  }

  async markShipped(taskId: string): Promise<void> { await this.setStatus(taskId, "shipped", { shippedAt: new Date() }); }
  async markDelivered(taskId: string, deliveredAt?: string): Promise<void> {
    await this.setStatus(taskId, "delivered", { deliveredAt: optionalDate(deliveredAt) ?? new Date() });
  }
  async markCancelled(taskId: string): Promise<void> { await this.setStatus(taskId, "cancelled"); }

  async flagSalesActionRequired(taskId: string, note: string): Promise<void> {
    await this.prisma.deliveryTask.update({ where: { id: id(taskId) }, data: { salesActionRequired: true, salesActionNote: note } });
  }

  async list(filters: { status?: DeliveryStatus; plannedDeliveryDate?: string; geoArea?: string; page: number; limit: number }): Promise<Page<DeliveryTask>> {
    const where = clean({
      status: filters.status,
      plannedDeliveryDate: optionalDate(filters.plannedDeliveryDate),
      order: filters.geoArea ? { customer: { geoArea: filters.geoArea } } : undefined
    });
    const [total, data] = await Promise.all([
      this.prisma.deliveryTask.count({ where }),
      this.prisma.deliveryTask.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { id: "desc" },
        include: {
          order: {
            select: {
              orderNumber: true,
              requiresInvoice: true,
              customer: {
                select: {
                  name: true,
                  geoArea: true,
                  contacts: { where: { isPrimary: true }, take: 1, select: { name: true, phone: true } },
                  addresses: { where: { addressType: "delivery", isDefault: true }, take: 1, select: { detail: true } }
                }
              }
            }
          }
        }
      })
    ]);
    return { data: data.map(toDeliveryTask), meta: { total, page: filters.page, limit: filters.limit } };
  }

  private async setStatus(taskId: string, status: DeliveryStatus, extra: Record<string, unknown> = {}): Promise<void> {
    await this.prisma.deliveryTask.update({ where: { id: id(taskId) }, data: { status, ...extra } });
  }
}

export interface PrismaInventoryClient {
  inventoryBatch: {
    findUnique(args: { where: { id: number } }): Promise<InventoryBatchRecord | null>;
    update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: number }>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: Record<string, unknown>): Promise<InventoryBatchRecord[]>;
    aggregate(args: Record<string, unknown>): Promise<AggregateQuantity>;
  };
  stockDeduction: {
    aggregate(args: Record<string, unknown>): Promise<AggregateQuantity>;
    groupBy(args: Record<string, unknown>): Promise<{ inventoryBatchId: number; _sum: { quantity?: number | null } }[]>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  reservationAllocation: {
    create(args: { data: { orderItemId: number; inventoryBatchId: number; quantity: number } }): Promise<unknown>;
    findMany(args: { where: { orderItemId: number } }): Promise<ReservationAllocationRecord[]>;
    deleteMany(args: { where: { orderItemId: number } }): Promise<{ count: number }>;
  };
}

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaInventoryClient) {}

  async getAvailableQty(strainId: string, ageWeeks: number, gender: Gender): Promise<number> {
    const records = await this.prisma.inventoryBatch.findMany({ where: inventoryBatchWhere(strainId, ageWeeks, gender) });
    const deductions = await deductedQtyByBatchId(this.prisma, records.map((record) => record.id));
    return records.reduce(
      (sum, record) => sum + record.initialQty - record.reservedQty - (deductions.get(record.id) ?? 0),
      0
    );
  }

  async reserve(input: { orderItemId: string; strainId: string; ageWeeks: number; gender: Gender; quantity: number }): Promise<void> {
    const batches = await this.prisma.inventoryBatch.findMany({
      where: inventoryBatchWhere(input.strainId, input.ageWeeks, input.gender),
      orderBy: { birthDate: "asc" }
    });
    const deductions = await deductedQtyByBatchId(this.prisma, batches.map((batch) => batch.id));
    let remaining = input.quantity;
    const allocations: { inventoryBatchId: number; quantity: number }[] = [];

    for (const batch of batches) {
      const available = batch.initialQty - batch.reservedQty - (deductions.get(batch.id) ?? 0);
      if (available <= 0) {
        continue;
      }
      const allocationQty = Math.min(available, remaining);
      allocations.push({ inventoryBatchId: batch.id, quantity: allocationQty });
      remaining -= allocationQty;
      if (remaining === 0) {
        break;
      }
    }

    if (remaining > 0) {
      throw new InventoryInsufficientError();
    }

    for (const allocation of allocations) {
      await this.prisma.inventoryBatch.update({
        where: { id: allocation.inventoryBatchId },
        data: { reservedQty: { increment: allocation.quantity } }
      });
      await this.prisma.reservationAllocation.create({
        data: { orderItemId: id(input.orderItemId), inventoryBatchId: allocation.inventoryBatchId, quantity: allocation.quantity }
      });
    }
  }

  async releaseAllocations(orderItemId: string): Promise<void> {
    await this.decrementAndDeleteAllocations(orderItemId);
  }

  async finalizeAllocations(orderItemId: string): Promise<void> {
    await this.decrementAndDeleteAllocations(orderItemId);
  }

  async getBatch(batchId: string): Promise<InventoryBatch | null> {
    const record = await this.prisma.inventoryBatch.findUnique({ where: { id: id(batchId) } });
    if (!record) return null;
    return toBatch(record, await deductedQty(this.prisma, record.id));
  }

  async recordStockDeduction(entry: StockDeductionEntry): Promise<void> {
    await this.prisma.stockDeduction.create({
      data: {
        deliveryTaskId: id(entry.deliveryTaskId),
        orderItemId: id(entry.orderItemId),
        inventoryBatchId: id(entry.inventoryBatchId),
        quantity: entry.quantity,
        confirmedById: id(entry.confirmedBy)
      }
    });
  }

  async listBatchesForItem(strainId: string, ageWeeks: number, gender: Gender): Promise<InventoryBatchCandidate[]> {
    const records = await this.prisma.inventoryBatch.findMany({
      where: inventoryBatchWhere(strainId, ageWeeks, gender),
      orderBy: { birthDate: "asc" }
    });
    const deductions = await deductedQtyByBatchId(this.prisma, records.map((record) => record.id));
    return records.map((record) => ({
      id: String(record.id),
      birthDate: record.birthDate ? dateOnly(record.birthDate) : "",
      availableQty: record.initialQty - record.reservedQty - (deductions.get(record.id) ?? 0)
    }));
  }

  async createBatch(batch: NewInventoryBatch): Promise<{ id: string }> {
    const record = await this.prisma.inventoryBatch.create({
      data: {
        strainId: id(batch.strainId),
        birthDate: toDate(batch.birthDate),
        gender: batch.gender,
        initialQty: batch.initialQty,
        reservedQty: 0,
        entryDate: toDate(batch.entryDate),
        notes: batch.notes
      }
    });
    return { id: String(record.id) };
  }

  async listBatches(filters: { strainId?: string; gender?: Gender; page: number; limit: number }): Promise<Page<InventoryBatch>> {
    const where = clean({ strainId: filters.strainId ? id(filters.strainId) : undefined, gender: filters.gender });
    const [total, records] = await Promise.all([
      this.prisma.inventoryBatch.count({ where }),
      this.prisma.inventoryBatch.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { id: "desc" },
        include: { strain: { include: { species: true } } }
      })
    ]);
    const deductions = await deductedQtyByBatchId(this.prisma, records.map((record) => record.id));
    const data = records.map((record) => toBatch(record, deductions.get(record.id) ?? 0));
    return { data, meta: { total, page: filters.page, limit: filters.limit } };
  }

  async getAvailabilitySummary(filters: { strainId: string; ageWeeks: number; gender: Gender }): Promise<{ availableQty: number; reservedQty: number; agingQty: number }> {
    const records = await this.prisma.inventoryBatch.findMany({ where: inventoryBatchWhere(filters.strainId, filters.ageWeeks, filters.gender) });
    const deductions = await deductedQtyByBatchId(this.prisma, records.map((record) => record.id));
    const reservedQty = records.reduce((sum, record) => sum + record.reservedQty, 0);
    const availableQty = records.reduce(
      (sum, record) => sum + record.initialQty - record.reservedQty - (deductions.get(record.id) ?? 0),
      0
    );
    return { availableQty, reservedQty, agingQty: 0 };
  }

  private async decrementAndDeleteAllocations(orderItemId: string): Promise<void> {
    const allocations = await this.prisma.reservationAllocation.findMany({ where: { orderItemId: id(orderItemId) } });
    for (const allocation of allocations) {
      await this.prisma.inventoryBatch.update({
        where: { id: allocation.inventoryBatchId },
        data: { reservedQty: { decrement: allocation.quantity } }
      });
    }
    await this.prisma.reservationAllocation.deleteMany({ where: { orderItemId: id(orderItemId) } });
  }
}

export interface PrismaDocumentClient {
  certificate: { create(args: { data: Record<string, unknown> }): Promise<{ id: number }> };
  document: { create(args: { data: Record<string, unknown> }): Promise<{ id: number }> };
  documentReleaseReason: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaDocumentClient) {}

  async recordReleaseReason(entry: DocumentReleaseReasonEntry): Promise<void> {
    await this.prisma.documentReleaseReason.create({
      data: {
        deliveryTaskId: id(entry.deliveryTaskId),
        orderId: id(entry.orderId),
        missingCertificate: entry.missingCertificate,
        missingInvoice: entry.missingInvoice,
        reason: entry.reason,
        releasedById: id(entry.releasedBy)
      }
    });
  }

  async recordCertificate(entry: CertificateEntry): Promise<{ id: string }> {
    const record = await this.prisma.certificate.create({
      data: {
        orderId: id(entry.orderId),
        fileName: entry.fileName,
        filePath: entry.filePath,
        batchDesc: entry.batchDesc,
        uploadedById: id(entry.uploadedBy)
      }
    });
    return { id: String(record.id) };
  }

  async recordInvoiceRegistration(entry: InvoiceRegistrationEntry): Promise<{ id: string }> {
    const record = await this.prisma.document.create({
      data: {
        docType: "invoice_registration",
        filePath: `invoice://${entry.orderId}/${entry.invoiceNumber ?? entry.registeredAt}`,
        fileName: entry.invoiceNumber,
        description: JSON.stringify({
          orderId: entry.orderId,
          invoiceType: entry.invoiceType,
          registeredAt: entry.registeredAt,
          note: entry.note,
          registeredBy: entry.registeredBy
        }),
        uploadedById: id(entry.registeredBy)
      }
    });
    return { id: String(record.id) };
  }
}

type AuditLogRecord = {
  id: bigint;
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  createdAt: Date;
  user?: { displayName: string } | null;
};

export interface PrismaAuditLogClient {
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findMany(args: Record<string, unknown>): Promise<AuditLogRecord[]>;
  };
}

function toAuditLog(record: AuditLogRecord): AuditLog {
  return {
    id: record.id.toString(),
    actorId: record.userId === null || record.userId === undefined ? undefined : String(record.userId),
    actorName: record.user?.displayName ?? undefined,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId === null || record.entityId === undefined ? undefined : String(record.entityId),
    oldValue: record.oldValue ?? undefined,
    newValue: record.newValue ?? undefined,
    reason: record.reason ?? undefined,
    createdAt: record.createdAt.toISOString()
  };
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaAuditLogClient) {}

  async record(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: id(entry.actorId),
        action: entry.action,
        entityType: entry.entityType,
        entityId: id(entry.entityId),
        reason: entry.reason,
        newValue: entry.newValue === undefined ? undefined : JSON.stringify(entry.newValue)
      }
    });
  }

  async list(filters: AuditLogListFilters): Promise<Page<AuditLog>> {
    const where = clean({ entityType: filters.entityType, entityId: filters.entityId ? id(filters.entityId) : undefined });
    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { displayName: true } } },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: "desc" }
      })
    ]);
    return { data: data.map(toAuditLog), meta: { total, page: filters.page, limit: filters.limit } };
  }
}

