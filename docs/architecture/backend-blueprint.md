# 实验动物销售管理系统 — Backend Module Blueprint

> 版本: v0.1  
> 状态: MVP 后端分层草案  
> 依据: [framework.md](./framework.md)、[api-contract.md](./api-contract.md)、[ADR Index](../adr/README.md)  
> 范围: 后端模块边界、route/service/repository 深度、事务边界、错误处理、日志和幂等

---

## 1. 后端分层原则

后端采用四层边界：

```text
HTTP Route Adapter
  -> Application Service
    -> Domain Service / Policy
      -> Repository / External Gateway
```

| 层 | 职责 | 不该做 |
| --- | --- | --- |
| Route Adapter | 认证、解析请求、schema validation、调用 application service、映射响应 | 业务状态流转、事务编排、直接拼复杂查询 |
| Application Service | 编排一个用例/命令，控制事务、调用仓储和领域策略、发出审计/事件 | HTTP 细节、直接返回 Response、跨越 API contract |
| Domain Service / Policy | 纯业务规则，例如状态机、可改价判断、扣减批次建议、票证弱校验 | 数据库读写、HTTP 错误格式 |
| Repository | 封装数据库读写，提供聚合级方法 | 业务决策、状态机解释、HTTP 状态码 |

---

## 2. Route Adapter 厚度

Route 应保持薄，但不是空壳。

Route 允许做：

- 读取当前用户
- 检查 endpoint 级权限
- 校验 request body/query/path
- 调用一个 application service 方法
- 将 service result 包装为统一 envelope
- 将 domain/app error 映射为 API 错误模型

Route 禁止做：

- 直接修改多个表
- 自己判断订单状态是否可流转
- 自己计算库存扣减
- 自己创建配送任务
- 自己写审计日志细节

示例边界：

```text
POST /api/v1/orders/{id}/confirm
  route: validate { confirm_note }, require sales/manager
  service: confirmOrder(orderId, actor, command)
  repository: orders, inventory, deliveryTasks, auditLogs
```

---

## 3. Application Service 边界

一个 application service 方法对应一个 API command 或一个明确查询用例。

### 3.1 命名约定

```text
OrderApplicationService.confirmOrder
OrderApplicationService.changeOrderPrices
DeliveryApplicationService.confirmShipment
InventoryApplicationService.createBatch
CustomerApplicationService.updateDeliveryAddress
```

### 3.2 命令服务必须声明副作用

每个命令服务需在实现旁对应 `api-contract.md` 的命令 contract：

| 命令 | 必须编排 |
| --- | --- |
| `ConfirmOrder` | 校验订单、校验库存、写订单状态、写 `confirm_order` 审计、预占库存、创建配送任务 |
| `ChangeOrderPrice` | 校验状态、更新实际价、重算总额、写轻审计 |
| `CancelOrder` | 校验状态、取消订单、释放预占、取消配送任务、写轻审计 |
| `ConfirmShipment` | 校验配送任务、票证弱校验、确认实际扣减批次、写 `stock_deductions`、finalize 预占、同步订单、写轻审计 |
| `ConfirmDelivery` | 校验状态、更新配送任务、同步订单、写轻审计 |

---

## 4. Repository 边界

Repository 按聚合/业务对象分，不按表机械拆太碎。

建议仓储：

| Repository | 拥有查询/写入 |
| --- | --- |
| `CustomerRepository` | customers、customer_contacts、customer_addresses |
| `CatalogRepository` | species、strains、price_rules |
| `InventoryRepository` | inventory_batches、reservation_allocations、stock_deductions、availability queries |
| `OrderRepository` | orders、order_items、order status updates |
| `DeliveryTaskRepository` | delivery_tasks |
| `DocumentRepository` | certificates、invoice registration、document release reasons |
| `AuditLogRepository` | audit_logs |
| `IdempotencyRepository` | idempotency keys/results |

Repository 规则：

- 查询只选择需要字段，避免默认 `select *`。
- 列表查询必须有分页上限。
- 聚合读取应避免 N+1，优先 batch fetch。
- Repository 不返回 HTTP error；只返回 domain data 或抛 application/domain error。

---

## 5. 事务边界

所有跨多个写模型的命令必须在同一事务中完成。

| 命令 | 事务内写入 |
| --- | --- |
| `ConfirmOrder` | order status、audit log、reservation allocations/reserved qty、delivery task、idempotency result |
| `CancelOrder` | order status、reservation allocation release/reserved qty、delivery task cancellation、audit log |
| `ChangeOrderPrice` | order item prices、order total、audit log |
| `ConfirmShipment` | stock deductions、reservation allocation finalize/reserved qty、delivery task status、order status、document release reason、audit log |
| `ConfirmDelivery` | delivery task status、order status、audit log |

事务规则：

- 任一写入失败，整个命令回滚。
- 命令成功后返回的事件列表必须对应事务内已经完成的事实。
- 不在事务内调用慢外部服务。MVP 暂无外部物流、税务、官方合格证系统对接。

---

## 6. Domain Policy

### 6.1 订单状态机

订单状态机必须集中定义，不能散落在 routes。

允许流转：

```text
pending -> confirmed -> shipped -> delivered -> invoiced -> settled
pending|confirmed -> cancelled
```

MVP 规则：

- `shipped` 和 `delivered` 只能由配送任务同步推动。
- 已出库订单取消转人工，不走普通 `CancelOrder`。
- 已结算订单禁止改价。

### 6.2 配送任务状态机

```text
pending_schedule -> scheduled -> shipped -> delivered
pending_schedule|scheduled -> cancelled
```

MVP 规则：

- 不做后勤接单。
- `shipped` 触发库存扣减和订单 `shipped`。
- `delivered` 触发订单 `delivered`。

### 6.3 票证弱校验

`ConfirmShipment` 中调用票证 policy：

- 若合格证附件缺失，提示并要求放行原因。
- 若订单需要发票但发票登记缺失，提示并要求放行原因。
- 缺失但有原因时允许继续。
- 缺失且无原因时返回 `422 document_release_reason_required`。

### 6.4 库存扣减建议

批次建议 policy：

- 只在同品系、同周龄、同性别范围内选择。
- 优先老化，其次先进先出。
- 建议不产生扣减；后勤确认后才写入 stock deductions。

---

## 7. 错误处理

后端统一使用 application/domain error，再由 route adapter 映射到 `api-contract.md` 错误模型。

| Error 类别 | HTTP | 示例 code |
| --- | --- | --- |
| ValidationError | 422 | `validation_error` |
| AuthError | 401 | `unauthorized` |
| PermissionError | 403 | `forbidden` |
| NotFoundError | 404 | `not_found` |
| StateConflictError | 409 | `state_conflict` |
| BusinessRuleError | 422 | `inventory_insufficient` |
| UnexpectedError | 500 | `internal_error` |

规则：

- 不向客户端暴露 SQL、stack trace、内部表名。
- 每个错误响应带 `request_id`。
- 业务错误 message 可读，code 稳定。

---

## 8. 幂等与重复提交

副作用命令必须支持 `Idempotency-Key`：

- `ConfirmOrder`
- `CancelOrder`
- `ChangeOrderPrice`
- `ConfirmShipment`
- `ConfirmDelivery`
- `SettleOrder`
- `CreateInventoryBatch`

处理规则：

1. Route 读取 `Idempotency-Key`。
2. Service 在事务开始前检查同用户、同 endpoint、同 key 是否已有成功结果。
3. 若有，直接返回首次结果。
4. 若无，执行业务命令并保存结果摘要。
5. key 冲突但请求 payload 不同，返回 `409 conflict`。

---

## 9. 权限 Enforcement

权限分两层：

- Route 层做 endpoint 级角色检查。
- Service 层做业务状态和对象级检查。

示例：

| 动作 | Route 权限 | Service 检查 |
| --- | --- | --- |
| 创建订单 | sales/manager | 客户存在、品系价格可用 |
| 确认订单 | sales/manager | 状态 pending、库存足够 |
| 确认出库 | logistics/manager | 配送任务可出库、扣减批次有效、票证弱校验通过 |
| 更新客户地址 | sales/manager | 地址属于客户、原因必填 |

---

## 10. 日志与审计

### 10.1 结构化日志

每个请求记录：

- `request_id`
- `actor_id`
- `role`
- `method`
- `path`
- `status_code`
- `duration_ms`

错误日志记录稳定 error code，不记录敏感信息。

### 10.2 轻审计

轻审计由 application service 写入，不由 route 直接写。

必须审计：

- 改价
- 取消订单
- 订单关键状态变化（包括 `confirm_order`、`confirm_delivery`）
- 入库
- 出库扣减
- 人工调整出库批次
- 票证缺失放行
- 后勤标记需销售处理（`reason` 写入 audit log）
- 价格表变更
- 客户送货地址变更

---

## 11. 查询性能约束

MVP 数据量中小，但列表接口仍需基本约束：

- 所有列表必须分页。
- 默认 `per_page=20`，最大 `100`。
- 订单列表避免逐行查询客户、明细和配送任务；需要 batch join 或一次查询聚合。
- 库存可售汇总应由 repository 提供专门查询，不由 service 循环计算。
- 库存批次列表和建议查询需要批量汇总 `stock_deductions`（例如 `groupBy` + `Map`），避免每个批次单独查询扣减量。
- `q` 搜索先做简单模糊匹配，后续再考虑全文索引。

---

## 12. 后台任务边界

MVP 不引入复杂队列。

可同步处理：

- 订单确认
- 配送任务生成
- 库存预占
- 出库扣减
- Excel 导出，小数据量情况下

二期再评估异步任务：

- 大批量导入价格表
- 大量订单导出
- 本地备份
- 应收款提醒

---

## 13. Scaffold 建议目录

后端采用 Node.js/TypeScript（见 [ADR-0006](../adr/0006-use-nodejs-typescript-prisma-backend-stack.md)），建议按业务域组织：

```text
src/server/
  api/
    routes/
      orders/
      delivery-tasks/
      customers/
      inventory/
  application/
    orders/
    delivery/
    inventory/
    customers/
  domain/
    order-status.ts
    delivery-status.ts
    inventory-policy.ts
    document-policy.ts
  repositories/
    order-repository.ts
    delivery-task-repository.ts
    inventory-repository.ts
    customer-repository.ts
  infrastructure/
    db/
    auth/
    logging/
    idempotency/
  shared/
    errors.ts
    api-response.ts
    pagination.ts
```

---

## 14. Backend Review Checklist

开始脚手架前检查：

- 每个 API command 是否有唯一 application service。
- Route 是否只做解析、校验、鉴权和响应映射。
- 跨表写入是否有事务边界。
- 订单/配送/库存状态机是否集中定义。
- 出库扣减是否只能通过 `ConfirmShipment`。
- 配送策略是否仍是 suggestion-only。
- 错误响应是否符合 `api-contract.md`。
- 幂等命令是否实现 `Idempotency-Key`。
- 轻审计是否由 service 写入。
