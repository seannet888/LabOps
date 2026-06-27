import { evaluateDeliveryStrategySuggestions } from "../../domain/delivery-strategy-policy.js";
import { StateConflictError } from "../errors.js";
import type {
  CustomerRepository,
  DeliveryStrategyRuleRepository,
  OrderRepository
} from "../shared/types.js";

export class DeliveryStrategyApplicationService {
  constructor(
    private readonly deps: {
      orders: OrderRepository;
      customers: CustomerRepository;
      deliveryStrategyRules: DeliveryStrategyRuleRepository;
    }
  ) {}


  async listDeliveryStrategyRules(filters: { page: number; limit: number }): Promise<{
    data: Awaited<ReturnType<DeliveryStrategyRuleRepository["listActive"]>>;
    meta: { total: number; page: number; limit: number };
  }> {
    const rules = await this.deps.deliveryStrategyRules.listActive();
    const start = (filters.page - 1) * filters.limit;
    const data = rules.slice(start, start + filters.limit);
    return { data, meta: { total: rules.length, page: filters.page, limit: filters.limit } };
  }

  async createDeliveryStrategyRule(input: {
    actorId: string;
    name: string;
    geoArea?: string;
    amountThreshold?: string;
    quantityThreshold?: number;
    suggestionText: string;
    isActive?: boolean;
  }): Promise<{ data: { id: string } }> {
    const created = await this.deps.deliveryStrategyRules.create({
      name: input.name,
      geoArea: input.geoArea,
      amountThreshold: input.amountThreshold,
      quantityThreshold: input.quantityThreshold,
      suggestionText: input.suggestionText,
      isActive: input.isActive
    });
    return { data: created };
  }

  async updateDeliveryStrategyRule(input: {
    actorId: string;
    ruleId: string;
    name?: string;
    geoArea?: string;
    amountThreshold?: string;
    quantityThreshold?: number;
    suggestionText?: string;
    isActive?: boolean;
  }): Promise<{ data: { id: string } }> {
    const updated = await this.deps.deliveryStrategyRules.update(input.ruleId, {
      name: input.name,
      geoArea: input.geoArea,
      amountThreshold: input.amountThreshold,
      quantityThreshold: input.quantityThreshold,
      suggestionText: input.suggestionText,
      isActive: input.isActive
    });
    return { data: updated };
  }
  async getOrderDeliverySuggestions(orderId: string): Promise<{
    data: ReturnType<typeof evaluateDeliveryStrategySuggestions>;
  }> {
    const order = await this.deps.orders.findById(orderId);
    if (!order || !order.customerId) {
      throw new StateConflictError();
    }

    const customer = await this.deps.customers.findById(order.customerId);
    if (!customer) {
      throw new StateConflictError();
    }

    const rules = await this.deps.deliveryStrategyRules.listActive();
    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      data: evaluateDeliveryStrategySuggestions({
        geoArea: customer.geoArea,
        totalAmount: order.totalAmount ?? "0.00",
        totalQuantity,
        rules
      })
    };
  }
}
