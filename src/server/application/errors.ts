export interface ApplicationErrorDetail {
  field: string;
  message: string;
  code: string;
}

export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: ApplicationErrorDetail[]
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends ApplicationError {
  constructor(details: ApplicationErrorDetail[], message = "请求参数校验失败") {
    super("validation_error", message, details);
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message = "当前角色无权操作") {
    super("forbidden", message);
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = "资源不存在") {
    super("not_found", message);
  }
}

export const ERROR_CODE_HTTP_STATUS: Record<string, number> = {
  invalid_json: 400,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  state_conflict: 409,
  inventory_insufficient: 422,
  price_missing: 422,
  document_release_reason_required: 422,
  shipment_batch_required: 422,
  duplicate_order_number: 409,
  rate_limit_exceeded: 429,
  internal_error: 500
};

export class ConflictError extends ApplicationError {
  constructor(message = "重复提交的幂等键与原请求不一致") {
    super("conflict", message);
  }
}

export class StateConflictError extends ApplicationError {
  constructor(message = "当前状态不允许该动作") {
    super("state_conflict", message);
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message = "未登录或登录失效") {
    super("unauthorized", message);
  }
}

export class PriceMissingError extends ApplicationError {
  constructor(message = "缺少当前有效价格") {
    super("price_missing", message);
  }
}

export class InventoryInsufficientError extends ApplicationError {
  constructor(message = "可售库存不足") {
    super("inventory_insufficient", message);
  }
}

export class ShipmentBatchRequiredError extends ApplicationError {
  constructor(message = "出库扣减批次未确认") {
    super("shipment_batch_required", message);
  }
}

export class DocumentReleaseReasonRequiredError extends ApplicationError {
  constructor(message = "票证缺失但未填写放行原因") {
    super("document_release_reason_required", message);
  }
}
