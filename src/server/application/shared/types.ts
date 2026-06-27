import type { DeliveryTaskStatus } from "../../domain/delivery-status.js";
import type { InventoryBatchCandidate } from "../../domain/inventory-policy.js";
import type { OrderStatus } from "../../domain/order-status.js";

export interface OrderItem {
  id: string;
  strainId: string;
  ageWeeks: number;
  gender: "M" | "F";
  quantity: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  invoiceRequired: boolean;
  items: OrderItem[];
  customerId?: string;
  customerName?: string;
  orderNumber?: string;
  totalAmount?: string;
  invoiceType?: string;
  createdAt?: string;
}

export interface NewOrderItem {
  strainId: string;
  ageWeeks: number;
  gender: "M" | "F";
  quantity: number;
  actualPrice: string;
}

export interface NewOrder {
  customerId: string;
  salesRepId?: string;
  deliveryMethod?: string;
  plannedDeliveryDate?: string;
  invoiceRequired: boolean;
  invoiceType?: string;
  notes?: string;
  items: NewOrderItem[];
}

export interface DeliveryTask {
  id: string;
  orderId: string;
  orderNumber?: string;
  status: DeliveryTaskStatus;
  customerName?: string;
  geoArea?: string;
  deliveryAddress?: string;
  contactName?: string;
  contactPhone?: string;
  plannedDeliveryDate?: string;
  vehicle?: string;
  driver?: string;
  deliveryBatch?: string;
  routeNotes?: string;
  deliveredAt?: string;
  salesActionRequired?: boolean;
  salesActionNote?: string;
  documentReadiness?: {
    certificateUploaded: boolean;
    invoiceRegistered: boolean;
    requiresInvoice: boolean;
  };
}

export interface InventoryBatch {
  id: string;
  strainId: string;
  strainName: string;
  speciesName: string;
  birthDate: string;
  ageWeeks: number;
  gender: "M" | "F";
  initialQty: number;
  reservedQty: number;
  availableQty: number;
  isAging: boolean;
  entryDate: string;
}

export interface NewInventoryBatch {
  strainId: string;
  birthDate: string;
  gender: "M" | "F";
  initialQty: number;
  entryDate: string;
  notes?: string;
}

export interface StockDeductionEntry {
  deliveryTaskId: string;
  orderItemId: string;
  inventoryBatchId: string;
  quantity: number;
  confirmedBy: string;
}

export interface ReserveInventoryInput {
  orderItemId: string;
  strainId: string;
  ageWeeks: number;
  gender: "M" | "F";
  quantity: number;
}

export interface DocumentReleaseReasonEntry {
  deliveryTaskId: string;
  orderId: string;
  missingCertificate: boolean;
  missingInvoice: boolean;
  reason: string;
  releasedBy: string;
}

export interface AuditLogEntry {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  newValue?: unknown;
}

export interface AuditLog {
  id: string;
  actorId?: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  createdAt: string;
}

export interface AuditLogListFilters {
  entityType?: string;
  entityId?: string;
  page: number;
  limit: number;
}

export interface Customer {
  id: string;
  name: string;
  unitName?: string;
  researchGroup?: string;
  geoArea?: string;
  settlementType: "single" | "monthly";
  creditDays: number;
  defaultDeliveryMethod?: string;
  defaultInvoiceType?: string;
  notes?: string;
  isActive: boolean;
}

export interface NewCustomer {
  name: string;
  unitName?: string;
  researchGroup?: string;
  geoArea?: string;
  settlementType: "single" | "monthly";
  creditDays?: number;
  defaultDeliveryMethod?: string;
  defaultInvoiceType?: string;
  notes?: string;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  addressType: "delivery" | "invoice";
  detail: string;
  isDefault: boolean;
}

export interface CustomerRepository {
  create(customer: NewCustomer): Promise<Customer>;
  findById(customerId: string): Promise<Customer | null>;
  update(customerId: string, changes: Partial<NewCustomer>): Promise<void>;
  findAddressById(addressId: string): Promise<CustomerAddress | null>;
  updateAddress(addressId: string, changes: { detail?: string; isDefault?: boolean }): Promise<void>;
  list(filters: { q?: string; geoArea?: string; page: number; limit: number }): Promise<Page<Customer>>;
}

export type UserRole = "sales" | "logistics" | "manager";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface OrderRepository {
  create(order: NewOrder): Promise<Order>;
  findById(orderId: string): Promise<Order | null>;
  markConfirmed(orderId: string): Promise<void>;
  markShipped(orderId: string): Promise<void>;
  markDelivered(orderId: string): Promise<void>;
  markInvoiced(orderId: string): Promise<void>;
  markSettled(orderId: string): Promise<void>;
  markCancelled(orderId: string): Promise<void>;
  updateItemPrices(orderId: string, items: { orderItemId: string; actualPrice: string }[]): Promise<void>;
  list(filters: { customerId?: string; status?: OrderStatus; page: number; limit: number }): Promise<Page<Order>>;
}

export interface Page<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

export interface Species {
  id: string;
  name: string;
  grade: string;
}

export interface Strain {
  id: string;
  speciesId: string;
  name: string;
  isActive: boolean;
}

export interface CatalogRepository {
  getCurrentPrice(strainId: string, ageWeeks: number): Promise<string | null>;
  getCurrentPriceDetails(strainId: string, ageWeeks: number): Promise<{ unitPrice: string; effectiveFrom: string } | null>;
  createStrain(strain: { speciesId: string; name: string }): Promise<{ id: string; speciesId: string; name: string }>;
  updateStrain(strainId: string, changes: { isActive: boolean }): Promise<{ id: string; isActive: boolean }>;
  createPriceRule(rule: {
    strainId: string;
    ageWeeks: number;
    unitPrice: string;
    effectiveFrom: string;
  }): Promise<{ id: string }>;
  listSpecies(): Promise<Species[]>;
  listStrains(filters: { speciesId?: string; isActive?: boolean }): Promise<Strain[]>;
}

export interface InventoryRepository {
  getAvailableQty(strainId: string, ageWeeks: number, gender: "M" | "F"): Promise<number>;
  reserve(input: ReserveInventoryInput): Promise<void>;
  releaseAllocations(orderItemId: string): Promise<void>;
  finalizeAllocations(orderItemId: string): Promise<void>;
  getBatch(batchId: string): Promise<InventoryBatch | null>;
  recordStockDeduction(entry: StockDeductionEntry): Promise<void>;
  listBatchesForItem(strainId: string, ageWeeks: number, gender: "M" | "F"): Promise<InventoryBatchCandidate[]>;
  createBatch(batch: NewInventoryBatch): Promise<{ id: string }>;
  listBatches(filters: {
    strainId?: string;
    gender?: "M" | "F";
    page: number;
    limit: number;
  }): Promise<Page<InventoryBatch>>;
  getAvailabilitySummary(filters: {
    strainId: string;
    ageWeeks: number;
    gender: "M" | "F";
  }): Promise<{ availableQty: number; reservedQty: number; agingQty: number }>;
}


export interface NewDeliveryStrategyRule {
  name: string;
  geoArea?: string;
  amountThreshold?: string;
  quantityThreshold?: number;
  suggestionText: string;
  isActive?: boolean;
}

export interface DeliveryStrategyRuleChanges {
  name?: string;
  geoArea?: string;
  amountThreshold?: string;
  quantityThreshold?: number;
  suggestionText?: string;
  isActive?: boolean;
}

export interface DeliveryStrategyRule {
  id: string;
  name: string;
  geoArea?: string;
  amountThreshold?: string;
  quantityThreshold?: number;
  suggestionText: string;
  isActive: boolean;
}

export interface DeliveryStrategyRuleRepository {
  listActive(): Promise<DeliveryStrategyRule[]>;
  create(rule: NewDeliveryStrategyRule): Promise<{ id: string }>;
  update(ruleId: string, changes: DeliveryStrategyRuleChanges): Promise<{ id: string }>;
}
export interface DeliveryTaskRepository {
  findById(taskId: string): Promise<DeliveryTask | null>;
  findByOrderId(orderId: string): Promise<DeliveryTask | null>;
  createForOrder(orderId: string): Promise<DeliveryTask>;
  markScheduled(
    taskId: string,
    details?: { plannedDeliveryDate?: string; vehicle?: string; driver?: string; deliveryBatch?: string; routeNotes?: string }
  ): Promise<void>;
  markShipped(taskId: string): Promise<void>;
  markDelivered(taskId: string, deliveredAt?: string): Promise<void>;
  markCancelled(taskId: string): Promise<void>;
  flagSalesActionRequired(taskId: string, note: string): Promise<void>;
  list(filters: { status?: DeliveryTaskStatus; plannedDeliveryDate?: string; geoArea?: string; page: number; limit: number }): Promise<Page<DeliveryTask>>;
}

export interface CertificateEntry {
  orderId: string;
  fileName: string;
  filePath: string;
  batchDesc?: string;
  uploadedBy: string;
}

export interface InvoiceRegistrationEntry {
  orderId: string;
  invoiceType: string;
  invoiceNumber?: string;
  registeredAt: string;
  note?: string;
  registeredBy: string;
}

export interface DocumentRepository {
  recordReleaseReason(entry: DocumentReleaseReasonEntry): Promise<void>;
  recordCertificate(entry: CertificateEntry): Promise<{ id: string }>;
  recordInvoiceRegistration(entry: InvoiceRegistrationEntry): Promise<{ id: string }>;
}

export interface AuditLogRepository {
  record(entry: AuditLogEntry): Promise<void>;
  list(filters: AuditLogListFilters): Promise<Page<AuditLog>>;
}

export interface IdempotencyRepository {
  findResult<T>(actorId: string, endpoint: string, idempotencyKey: string, requestHash?: string): Promise<T | null>;
  saveResult<T>(actorId: string, endpoint: string, idempotencyKey: string, result: T, requestHash?: string): Promise<void>;
}

export interface UserRepository {
  findByUsername(username: string): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
}

export interface SessionRepository {
  create(session: { userId: string; tokenHash: string; expiresAt: Date }): Promise<Session>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
}


