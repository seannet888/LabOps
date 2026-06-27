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
  DeliveryTask,
  DeliveryTaskRepository,
  DocumentReleaseReasonEntry,
  DocumentRepository,
  InvoiceRegistrationEntry,
  IdempotencyRepository,
  InventoryBatch,
  InventoryRepository,
  NewCustomer,
  NewOrder,
  Order,
  OrderRepository,
  Page,
  Session,
  Species,
  Strain,
  SessionRepository,
  StockDeductionEntry,
  ReserveInventoryInput,
  User,
  UserRepository
} from "./types.js";
import type { InventoryBatchCandidate } from "../../domain/inventory-policy.js";
import { ConflictError } from "../errors.js";

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "usr_001",
    username: "sales01",
    passwordHash: "salt:key",
    displayName: "张三",
    role: "sales",
    isActive: true,
    ...overrides
  };
}

export function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord_001",
    status: "pending",
    invoiceRequired: false,
    items: [{ id: "item_1", strainId: "strain_c57", ageWeeks: 4, gender: "M", quantity: 10 }],
    ...overrides
  };
}

export function buildDeliveryTask(overrides: Partial<DeliveryTask> = {}): DeliveryTask {
  return { id: "dt_001", orderId: "ord_001", status: "pending_schedule", ...overrides };
}

export function buildInventoryBatch(overrides: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    id: "batch_001",
    strainId: "str_001",
    strainName: "C57BL/6",
    speciesName: "Mouse",
    birthDate: "2026-05-21",
    ageWeeks: 5,
    gender: "M",
    initialQty: 100,
    reservedQty: 20,
    availableQty: 10,
    isAging: false,
    entryDate: "2026-05-22",
    ...overrides
  };
}

export class InMemoryOrderRepository implements OrderRepository {
  private nextId = 1;
  public readonly priceUpdates: { orderId: string; items: { orderItemId: string; actualPrice: string }[] }[] = [];

  constructor(private readonly orders: Map<string, Order>) {}

  async create(newOrder: NewOrder): Promise<Order> {
    const id = `ord_${this.nextId++}`;
    const totalAmount = newOrder.items
      .reduce((sum, item) => sum + Number(item.actualPrice) * item.quantity, 0)
      .toFixed(2);
    const order: Order = {
      id,
      status: "pending",
      invoiceRequired: newOrder.invoiceRequired,
      customerId: newOrder.customerId,
      orderNumber: `XS${id}`,
      totalAmount,
      invoiceType: newOrder.invoiceType,
      createdAt: new Date().toISOString(),
      items: newOrder.items.map((item, index) => ({
        id: `item_${index + 1}`,
        strainId: item.strainId,
        ageWeeks: item.ageWeeks,
        gender: item.gender,
        quantity: item.quantity
      }))
    };
    this.orders.set(id, order);
    return order;
  }

  async findById(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) ?? null;
  }

  private setStatus(orderId: string, status: Order["status"]): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = status;
    }
  }

  async markConfirmed(orderId: string): Promise<void> {
    this.setStatus(orderId, "confirmed");
  }

  async markShipped(orderId: string): Promise<void> {
    this.setStatus(orderId, "shipped");
  }

  async markDelivered(orderId: string): Promise<void> {
    this.setStatus(orderId, "delivered");
  }

  async markInvoiced(orderId: string): Promise<void> {
    this.setStatus(orderId, "invoiced");
  }

  async markSettled(orderId: string): Promise<void> {
    this.setStatus(orderId, "settled");
  }

  async markCancelled(orderId: string): Promise<void> {
    this.setStatus(orderId, "cancelled");
  }

  async updateItemPrices(orderId: string, items: { orderItemId: string; actualPrice: string }[]): Promise<void> {
    this.priceUpdates.push({ orderId, items });
  }

  async list(filters: {
    customerId?: string;
    status?: Order["status"];
    page: number;
    limit: number;
  }): Promise<Page<Order>> {
    const all = [...this.orders.values()].filter((order) => {
      const matchesCustomer = !filters.customerId || order.customerId === filters.customerId;
      const matchesStatus = !filters.status || order.status === filters.status;
      return matchesCustomer && matchesStatus;
    });
    const start = (filters.page - 1) * filters.limit;
    return {
      data: all.slice(start, start + filters.limit),
      meta: { total: all.length, page: filters.page, limit: filters.limit }
    };
  }
}

export class InMemoryCatalogRepository implements CatalogRepository {
  constructor(
    private readonly prices: Map<string, string> = new Map(),
    private readonly species: Species[] = [],
    private strains: Strain[] = []
  ) {}

  async getCurrentPrice(strainId: string, ageWeeks: number): Promise<string | null> {
    return this.prices.get(`${strainId}:${ageWeeks}`) ?? null;
  }

  async getCurrentPriceDetails(
    strainId: string,
    ageWeeks: number
  ): Promise<{ unitPrice: string; effectiveFrom: string } | null> {
    const unitPrice = this.prices.get(`${strainId}:${ageWeeks}`);
    return unitPrice ? { unitPrice, effectiveFrom: "2026-06-01" } : null;
  }

  async createStrain(strain: { speciesId: string; name: string }): Promise<{ id: string; speciesId: string; name: string }> {
    return { id: "str_new", speciesId: strain.speciesId, name: strain.name };
  }

  async updateStrain(strainId: string, changes: { isActive: boolean }): Promise<{ id: string; isActive: boolean }> {
    this.strains = this.strains.map((strain) => (strain.id === strainId ? { ...strain, isActive: changes.isActive } : strain));
    return { id: strainId, isActive: changes.isActive };
  }

  async createPriceRule(): Promise<{ id: string }> {
    return { id: "price_new" };
  }

  async listSpecies(): Promise<Species[]> {
    return this.species;
  }

  async listStrains(filters: { speciesId?: string; isActive?: boolean }): Promise<Strain[]> {
    return this.strains.filter((strain) => {
      const matchesSpecies = !filters.speciesId || strain.speciesId === filters.speciesId;
      const matchesActive = filters.isActive === undefined || strain.isActive === filters.isActive;
      return matchesSpecies && matchesActive;
    });
  }
}

export class InMemoryDeliveryTaskRepository implements DeliveryTaskRepository {
  constructor(private readonly tasks: Map<string, DeliveryTask>) {}

  async findById(taskId: string): Promise<DeliveryTask | null> {
    return this.tasks.get(taskId) ?? null;
  }

  async findByOrderId(orderId: string): Promise<DeliveryTask | null> {
    return [...this.tasks.values()].find((task) => task.orderId === orderId) ?? null;
  }

  async createForOrder(orderId: string): Promise<DeliveryTask> {
    const task: DeliveryTask = { id: `dt_${this.tasks.size + 1}`, orderId, status: "pending_schedule" };
    this.tasks.set(task.id, task);
    return task;
  }

  private setStatus(taskId: string, status: DeliveryTask["status"]): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
    }
  }

  async markScheduled(taskId: string): Promise<void> {
    this.setStatus(taskId, "scheduled");
  }

  async markShipped(taskId: string): Promise<void> {
    this.setStatus(taskId, "shipped");
  }

  async markDelivered(taskId: string, deliveredAt?: string): Promise<void> {
    this.setStatus(taskId, "delivered");
    const task = this.tasks.get(taskId);
    if (task) {
      task.deliveredAt = deliveredAt;
    }
  }

  async markCancelled(taskId: string): Promise<void> {
    this.setStatus(taskId, "cancelled");
  }

  async flagSalesActionRequired(taskId: string, note: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.salesActionRequired = true;
      task.salesActionNote = note;
    }
  }

  async list(filters: {
    status?: DeliveryTask["status"];
    plannedDeliveryDate?: string;
    geoArea?: string;
    page: number;
    limit: number;
  }): Promise<Page<DeliveryTask>> {
    const all = [...this.tasks.values()].filter((task) =>
      (!filters.status || task.status === filters.status) &&
      (!filters.plannedDeliveryDate || task.plannedDeliveryDate === filters.plannedDeliveryDate) &&
      (!filters.geoArea || task.geoArea === filters.geoArea)
    );
    const start = (filters.page - 1) * filters.limit;
    return {
      data: all.slice(start, start + filters.limit),
      meta: { total: all.length, page: filters.page, limit: filters.limit }
    };
  }
}

export class InMemoryInventoryRepository implements InventoryRepository {
  public readonly deductions: StockDeductionEntry[] = [];
  public readonly releasedAllocations: string[] = [];
  public readonly finalizedAllocations: string[] = [];

  constructor(
    private readonly availability: Map<string, number> = new Map(),
    private readonly batches: Map<string, InventoryBatch> = new Map(),
    private readonly batchCandidates: Map<string, InventoryBatchCandidate[]> = new Map()
  ) {}

  private key(strainId: string, ageWeeks: number, gender: "M" | "F"): string {
    return `${strainId}:${ageWeeks}:${gender}`;
  }

  async getAvailableQty(strainId: string, ageWeeks: number, gender: "M" | "F"): Promise<number> {
    return this.availability.get(this.key(strainId, ageWeeks, gender)) ?? 0;
  }

  async reserve(input: ReserveInventoryInput): Promise<void> {
    const key = this.key(input.strainId, input.ageWeeks, input.gender);
    this.availability.set(key, (this.availability.get(key) ?? 0) - input.quantity);
  }

  async releaseAllocations(orderItemId: string): Promise<void> {
    this.releasedAllocations.push(orderItemId);
  }

  async finalizeAllocations(orderItemId: string): Promise<void> {
    this.finalizedAllocations.push(orderItemId);
  }

  async getBatch(batchId: string): Promise<InventoryBatch | null> {
    return this.batches.get(batchId) ?? null;
  }

  async recordStockDeduction(entry: StockDeductionEntry): Promise<void> {
    this.deductions.push(entry);
  }

  async listBatchesForItem(strainId: string, ageWeeks: number, gender: "M" | "F"): Promise<InventoryBatchCandidate[]> {
    return this.batchCandidates.get(this.key(strainId, ageWeeks, gender)) ?? [];
  }

  async createBatch(): Promise<{ id: string }> {
    return { id: "inv_new" };
  }

  async listBatches(filters: {
    strainId?: string;
    gender?: "M" | "F";
    page: number;
    limit: number;
  }): Promise<Page<InventoryBatch>> {
    const all = [...this.batches.values()];
    const start = (filters.page - 1) * filters.limit;
    return {
      data: all.slice(start, start + filters.limit),
      meta: { total: all.length, page: filters.page, limit: filters.limit }
    };
  }

  async getAvailabilitySummary(filters: {
    strainId: string;
    ageWeeks: number;
    gender: "M" | "F";
  }): Promise<{ availableQty: number; reservedQty: number; agingQty: number }> {
    const available = await this.getAvailableQty(filters.strainId, filters.ageWeeks, filters.gender);
    return { availableQty: available, reservedQty: 0, agingQty: 0 };
  }
}

export class InMemoryDocumentRepository implements DocumentRepository {
  public readonly releaseReasons: DocumentReleaseReasonEntry[] = [];
  public readonly certificates: CertificateEntry[] = [];
  public readonly invoiceRegistrations: InvoiceRegistrationEntry[] = [];
  private nextId = 1;

  async recordReleaseReason(entry: DocumentReleaseReasonEntry): Promise<void> {
    this.releaseReasons.push(entry);
  }

  async recordCertificate(entry: CertificateEntry): Promise<{ id: string }> {
    this.certificates.push(entry);
    return { id: `cert_${this.nextId++}` };
  }

  async recordInvoiceRegistration(entry: InvoiceRegistrationEntry): Promise<{ id: string }> {
    this.invoiceRegistrations.push(entry);
    return { id: `inv_reg_${this.nextId++}` };
  }
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  public readonly entries: AuditLogEntry[] = [];

  async record(entry: AuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async list(filters: AuditLogListFilters): Promise<Page<AuditLog>> {
    const all = this.entries
      .map((entry, index) => ({
        id: `aud_${index + 1}`,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        newValue: entry.newValue,
        reason: entry.reason,
        createdAt: "2026-06-25T11:00:00.000Z"
      }))
      .filter((entry) => {
        const matchesEntityType = !filters.entityType || entry.entityType === filters.entityType;
        const matchesEntityId = !filters.entityId || entry.entityId === filters.entityId;
        return matchesEntityType && matchesEntityId;
      });
    const start = (filters.page - 1) * filters.limit;
    return { data: all.slice(start, start + filters.limit), meta: { total: all.length, page: filters.page, limit: filters.limit } };
  }
}

export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  private readonly results = new Map<string, { requestHash?: string; result: unknown }>();

  private key(actorId: string, endpoint: string, idempotencyKey: string): string {
    return `${actorId}:${endpoint}:${idempotencyKey}`;
  }

  async findResult<T>(actorId: string, endpoint: string, idempotencyKey: string, requestHash?: string): Promise<T | null> {
    const entry = this.results.get(this.key(actorId, endpoint, idempotencyKey));
    if (!entry) {
      return null;
    }
    if (entry.requestHash && requestHash && entry.requestHash !== requestHash) {
      throw new ConflictError();
    }
    return entry.result as T;
  }

  async saveResult<T>(
    actorId: string,
    endpoint: string,
    idempotencyKey: string,
    result: T,
    requestHash?: string
  ): Promise<void> {
    this.results.set(this.key(actorId, endpoint, idempotencyKey), { requestHash, result });
  }
}

export class InMemoryUserRepository implements UserRepository {
  constructor(private readonly users: Map<string, User>) {}

  async findByUsername(username: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.username === username) ?? null;
  }

  async findById(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null;
  }
}

export class InMemoryCustomerRepository implements CustomerRepository {
  private nextId = 1;
  private readonly addresses = new Map<string, CustomerAddress>();

  constructor(private readonly customers: Map<string, Customer> = new Map()) {}

  async create(customer: NewCustomer): Promise<Customer> {
    const id = `cus_${this.nextId++}`;
    const record: Customer = {
      id,
      name: customer.name,
      unitName: customer.unitName,
      researchGroup: customer.researchGroup,
      geoArea: customer.geoArea,
      settlementType: customer.settlementType,
      creditDays: customer.creditDays ?? 60,
      defaultDeliveryMethod: customer.defaultDeliveryMethod,
      defaultInvoiceType: customer.defaultInvoiceType,
      notes: customer.notes,
      isActive: true
    };
    this.customers.set(id, record);
    return record;
  }

  async findById(customerId: string): Promise<Customer | null> {
    return this.customers.get(customerId) ?? null;
  }

  async update(customerId: string, changes: Partial<NewCustomer>): Promise<void> {
    const customer = this.customers.get(customerId);
    if (customer) {
      Object.assign(customer, changes);
    }
  }

  setAddress(address: CustomerAddress): void {
    this.addresses.set(address.id, address);
  }

  async findAddressById(addressId: string): Promise<CustomerAddress | null> {
    return this.addresses.get(addressId) ?? null;
  }

  async updateAddress(addressId: string, changes: { detail?: string; isDefault?: boolean }): Promise<void> {
    const address = this.addresses.get(addressId);
    if (address) {
      Object.assign(address, changes);
    }
  }

  async list(filters: { q?: string; geoArea?: string; page: number; limit: number }): Promise<Page<Customer>> {
    const all = [...this.customers.values()].filter((customer) => {
      const matchesQuery = !filters.q || customer.name.includes(filters.q);
      const matchesArea = !filters.geoArea || customer.geoArea === filters.geoArea;
      return matchesQuery && matchesArea;
    });
    const start = (filters.page - 1) * filters.limit;
    return {
      data: all.slice(start, start + filters.limit),
      meta: { total: all.length, page: filters.page, limit: filters.limit }
    };
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();
  private nextId = 1;

  async create(session: { userId: string; tokenHash: string; expiresAt: Date }): Promise<Session> {
    const record: Session = { id: `ses_${this.nextId++}`, ...session };
    this.sessions.set(record.tokenHash, record);
    return record;
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.sessions.get(tokenHash) ?? null;
  }
}

