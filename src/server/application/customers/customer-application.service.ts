import { StateConflictError } from "../errors.js";
import type { TransactionRunner } from "../shared/transaction-runner.js";
import type { AuditLogRepository, Customer, CustomerRepository, NewCustomer, Page } from "../shared/types.js";

export interface ListCustomersInput {
  q?: string;
  geoArea?: string;
  page: number;
  limit: number;
}

export interface CreateCustomerResult {
  data: Customer;
}

export interface UpdateCustomerInput extends Partial<NewCustomer> {
  customerId: string;
}

export interface UpdateCustomerResult {
  data: {
    id: string;
  };
}

export interface UpdateDeliveryAddressInput {
  addressId: string;
  actorId: string;
  detail?: string;
  isDefault?: boolean;
  changeReason: string;
}

export interface UpdateDeliveryAddressResult {
  data: {
    id: string;
  };
}

export interface CustomerApplicationTransactionContext {
  customers: CustomerRepository;
  auditLogs: AuditLogRepository;
}

export interface CustomerApplicationServiceDependencies extends CustomerApplicationTransactionContext {
  transactions?: TransactionRunner<CustomerApplicationTransactionContext>;
}

export class CustomerApplicationService {
  constructor(private readonly deps: CustomerApplicationServiceDependencies) {}

  private async inTransaction<T>(callback: (deps: CustomerApplicationTransactionContext) => Promise<T>): Promise<T> {
    return this.deps.transactions ? this.deps.transactions.run(callback) : callback(this.deps);
  }

  async createCustomer(input: NewCustomer): Promise<CreateCustomerResult> {
    const customer = await this.deps.customers.create(input);
    return { data: customer };
  }

  async updateCustomer(input: UpdateCustomerInput): Promise<UpdateCustomerResult> {
    const { customerId, ...changes } = input;
    const customer = await this.deps.customers.findById(customerId);
    if (!customer) {
      throw new StateConflictError();
    }

    await this.deps.customers.update(customerId, changes);

    return { data: { id: customerId } };
  }

  async updateDeliveryAddress(input: UpdateDeliveryAddressInput): Promise<UpdateDeliveryAddressResult> {
    return this.inTransaction(async (deps) => {
      const address = await deps.customers.findAddressById(input.addressId);
      if (!address) {
        throw new StateConflictError();
      }

      await deps.customers.updateAddress(input.addressId, { detail: input.detail, isDefault: input.isDefault });

      await deps.auditLogs.record({
        actorId: input.actorId,
        action: "update_address",
        entityType: "customer_address",
        entityId: input.addressId
      });

      return { data: { id: input.addressId } };
    });
  }

  async listCustomers(input: ListCustomersInput): Promise<Page<Customer>> {
    return this.deps.customers.list(input);
  }
}
