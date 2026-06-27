# 实验动物销售管理系统 — TDD Scaffold Plan

> 版本: v0.1  
> 状态: 脚手架前测试策略  
> 依据: [api-contract.md](./api-contract.md)、[backend-blueprint.md](./backend-blueprint.md)、[persistence-migration-policy.md](./persistence-migration-policy.md)  
> 目标: 在写脚手架实现前，先定义 RED tests，覆盖 contract parity、route adapter、schema validation、状态机和关键流程

---

## 1. TDD 原则

- 先写测试，再写实现。
- 生产代码变更前必须看到目标测试 RED。
- GREEN 后才允许重构。
- MVP 后端目标覆盖率不低于 80%。
- 不允许跳过失败测试来推进脚手架。

---

## 2. 测试分层

| 层级 | 目的 | 示例 |
| --- | --- | --- |
| Contract tests | API contract 与实现一致 | endpoint、状态码、响应 envelope、错误码 |
| Route adapter tests | route 是否只做 validation/auth/response mapping | 请求校验、权限拒绝、调用 service |
| Application service tests | 命令副作用和事务编排 | ConfirmOrder、ConfirmShipment |
| Domain policy tests | 纯业务规则 | 状态机、票证弱校验、库存批次建议 |
| Repository tests | 查询和事务行为 | 可售汇总、幂等记录、轻审计写入 |
| E2E smoke | 关键用户路径 | 销售下单确认、后勤出库送达 |

---

## 3. 第一批 RED Tests

### 3.1 Contract Parity

目标：实现必须遵守 `api-contract.md`。

测试清单：

- `GET /api/v1/me` 返回 `{ data }` envelope。
- 列表接口返回 `{ data, meta, links }`。
- validation error 返回 `422` 和标准 `error.details`。
- 未登录返回 `401 unauthorized`。
- 无权限返回 `403 forbidden`。
- 命令成功返回 `meta.events`。
- 金额字段以 string 输出。

RED 标准：

- endpoint 尚不存在或响应格式不匹配。
- 失败原因必须指向缺少实现或 contract 不一致，而不是测试环境坏掉。

---

### 3.2 Route Adapter Tests

目标：route 薄且职责正确。

首批 route tests：

| Endpoint | 测试 |
| --- | --- |
| `POST /orders` | 校验 body，调用 `OrderApplicationService.createOrder` |
| `POST /orders/{id}/confirm` | 需要 sales/manager，传递 `Idempotency-Key` |
| `POST /delivery-tasks/{id}/confirm-shipment` | 需要 logistics/manager，缺扣减批次返回 422 |
| `PATCH /customer-addresses/{id}` | 缺 change_reason 返回 422 |
| `POST /price-rules` | 非 manager 返回 403 |

Route adapter 不测数据库细节，只 mock application service。

---

### 3.3 Schema Validation Tests

目标：输入输出 contract 稳定。

请求 schema 必测：

- `CreateOrderRequest`
- `ChangeOrderPricesRequest`
- `ConfirmShipmentRequest`
- `ScheduleDeliveryTaskRequest`
- `CreatePriceRuleRequest`
- `UpdateCustomerAddressRequest`

边界值：

- 数量必须大于 0。
- 金额必须是合法 decimal string。
- `gender` 只能是 `M` 或 `F`。
- `age_weeks` 必须是非负整数。
- 缺失票证时 `document_release.reason` 必填。
- unknown fields 在 MVP 返回 `422 validation_error`。

---

### 3.4 Domain Policy Tests

目标：业务规则不散落在 route。

#### Order status policy

- `pending -> confirmed` 允许。
- `confirmed -> shipped` 不允许由销售订单 service 直接推动。
- `shipped -> cancelled` 普通取消不允许。
- `settled` 禁止改价。

#### Delivery task policy

- `pending_schedule -> scheduled` 允许。
- `scheduled -> shipped` 允许。
- 未 `shipped` 不能 `delivered`。
- `shipped` 后不能新增需销售处理标记。

#### Document policy

- 合格证缺失 + 无原因 => 阻止出库。
- 发票必需但未登记 + 无原因 => 阻止出库。
- 缺失 + 有原因 => 允许出库，并要求写审计。

#### Inventory policy

- 确认订单只汇总预占，不绑定批次。
- 出库建议优先老化/先进先出。
- 出库扣减数量不能超过可用批次数量。

---

### 3.5 Application Service Tests

#### ConfirmOrder

Arrange:

- pending order
- sufficient availability
- no existing delivery task

Assert:

- order status becomes `confirmed`
- inventory reserved_qty increases
- delivery task created with `pending_schedule`
- audit log written
- events include `order_confirmed`, `inventory_reserved`, `delivery_task_created`

Error tests:

- insufficient inventory => `inventory_insufficient`
- already confirmed => `state_conflict`
- duplicate idempotency key => returns original result

#### ConfirmShipment

Assert:

- delivery task becomes `shipped`
- order becomes `shipped`
- inventory batch decremented
- stock deduction record created
- document release reason recorded when needed
- audit log written

Error tests:

- missing stock deductions => `shipment_batch_required`
- missing documents without reason => `document_release_reason_required`
- invalid delivery task state => `state_conflict`

---

### 3.6 Repository Tests

Repository tests may use test database or isolated transaction rollback.

Required repository behavior:

- `InventoryRepository.getAvailability` returns aggregate available/reserved quantities.
- `OrderRepository.findList` avoids N+1 customer lookup.
- `DeliveryTaskRepository.createForOrder` enforces MVP one order -> one task.
- `IdempotencyRepository` enforces unique `(actor_id, endpoint, key)`.
- `AuditLogRepository` writes immutable audit entries.

---

### 3.7 E2E Smoke Tests

Critical user flows:

1. Sales creates order and confirms it.
2. Logistics sees generated delivery task.
3. Logistics schedules task.
4. Logistics confirms shipment with stock deduction and document release reason.
5. Logistics confirms delivery.
6. Sales archives documents and settles order.

Assertions:

- Statuses update correctly.
- Role boundaries hold: logistics cannot edit order price; sales cannot confirm shipment.
- UI/API displays standard errors for forbidden actions.

---

## 4. Suggested Test File Layout

```text
src/server/
  api/
    routes/
      orders/
        create-order.route.test.ts
        confirm-order.route.test.ts
      delivery-tasks/
        confirm-shipment.route.test.ts
  application/
    orders/
      confirm-order.service.test.ts
      change-order-prices.service.test.ts
    delivery/
      confirm-shipment.service.test.ts
  domain/
    order-status.test.ts
    delivery-status.test.ts
    document-policy.test.ts
    inventory-policy.test.ts
  repositories/
    inventory-repository.test.ts
    idempotency-repository.test.ts
  contracts/
    api-envelope.contract.test.ts
    error-model.contract.test.ts
    openapi-parity.contract.test.ts

e2e/
  sales-to-delivery.spec.ts
```

---

## 5. RED / GREEN Gate

### RED Gate

Before implementation:

- Add the target tests.
- Run the exact target command.
- Confirm the failure is caused by missing implementation or intended contract mismatch.
- Do not count syntax errors, missing test dependencies, or unrelated failures as RED.

### GREEN Gate

After implementation:

- Rerun the same target tests.
- Confirm the previous RED tests pass.
- Run related contract tests.
- Only then refactor.

---

## 6. Scaffold Order

Recommended implementation sequence:

1. Shared test harness and API error/envelope contract tests.
2. Auth/current user route adapter tests.
3. Domain status policy tests.
4. Order creation and confirmation service tests.
5. Delivery task generation tests.
6. Confirm shipment tests, including inventory and document weak validation.
7. Customer/address and price rule validation tests.
8. E2E smoke for sales-to-delivery flow.

---

## 7. Coverage Expectations

Minimum coverage before MVP handoff:

| Area | Target |
| --- | --- |
| Domain policies | 90%+ |
| Application services | 85%+ |
| Route adapters | 80%+ |
| Repositories | 70%+ initially, higher as DB stabilizes |
| E2E critical path | At least 1 happy path + 2 permission failures |

Global minimum: 80%.

---

## 8. Test Data Principles

- Each test creates its own customer/order/inventory data.
- Do not rely on test execution order.
- Use factories for customer, strain, inventory batch, order, delivery task.
- Use stable dates for age-week calculations.
- Avoid real file uploads in unit tests; mock file storage.
- E2E can use small fixture files for certificate upload.

---

## 9. Done Criteria Before Scaffold Continues

A scaffold phase is done only when:

- Target tests were RED for the intended reason.
- Minimal implementation made them GREEN.
- No skipped tests.
- Error responses match `api-contract.md`.
- State transitions match `framework.md`.
- Persistence behavior respects `persistence-migration-policy.md`.
## 10. 当前实现进度（2026-06-25）

- ✅ 多写 command 已接入 `TransactionRunner`：订单、配送、客户地址、价格规则、库存入库写路径均有 focused tests。
- ✅ `GET /api/v1/audit-logs` 已完成 application service、route、Prisma adapter 和权限测试。
- ✅ `GET /api/v1/orders/{order_id}/delivery-suggestions` 已完成 domain policy、application service、route、Prisma model/migration 和 adapter tests。
- ✅ `GET /api/v1/exports/orders.xlsx` 已使用 `exceljs` 完成同步下载 service/route tests；技术选择见 ADR-0008。
- ✅ Prisma local dev smoke 已覆盖登录、创建订单、配送提示、确认订单、安排配送、确认出库、确认送达、票证归档、结算、审计查询、XLSX 导出。
## Hardening progress - 2026-06-25

Status: MVP scaffold closed; hardening slices are in progress/completed.

Completed in this pass:
- P0/P1 route contract hardening: shared query validation for orders, delivery tasks, inventory batches; command endpoints now reject missing `Idempotency-Key` with `422 validation_error`.
- P2 permission parity: `/api/v1/me` now includes `orders:export` for roles that can export orders.
- P3 route-level idempotency: duplicate order confirmation, duplicate shipment confirmation, and same-key/different-payload conflict are covered.
- P4 Prisma query quality: `PrismaOrderRepository.list` has pagination/filter/DTO mapping contract coverage.
- P5 delivery strategy rules management: GET/POST/PATCH routes, validation, manager-only writes, and Prisma create/update adapter coverage are implemented.
- P6 dependency safety: `npm audit --audit-level=moderate` reports only `exceljs -> uuid` moderate issues; no HIGH/CRITICAL. Risk is recorded in ADR-0008.
- P7 local environment verification: Prisma validate/generate/migrate status and local dev DB smoke pass against `127.0.0.1:55432/lab_mouse_sales_dev`.
- P8 docs cleanup: `AGENTS.md` was rewritten as UTF-8 and stale scaffold status was removed.

Current verification snapshot:
- `npm test`: 53 files, 261 tests passed.
- `npm run typecheck`: passed after P5 type fixes.
- `npm run lint`: passed.
- `npm run prisma:validate`: passed.
- `npm run prisma:generate`: passed.
- `npx prisma migrate status`: local dev DB schema up to date.

Known follow-up:
- True external/production PostgreSQL verification remains environment-dependent and must not be faked.
- `exceljs -> uuid` moderate audit warning remains monitored; do not force breaking downgrade unless risk level changes or replacement is chosen.

## Hardening progress - 2026-06-26

Status: 上线前 hardening 第一批已完成，库存最终模型已锁定。

Completed in this pass:
- 审计日志补齐：`confirm_order`、`confirm_delivery`、`flag_sales_action`（含 `reason`）均在 application service 事务内写入。
- 库存入库入口硬化：`createBatchSchema` 使用严格 Zod 校验，覆盖负数、浮点、非法日期、非法 gender、未知字段和 `entry_date < birth_date`；`POST /api/v1/inventory-batches` 要求 `Idempotency-Key`。
- 错误可观测性：测试环境关闭 Fastify logger，非测试环境启用 `{ level: "info" }`；未知 500 通过 `request.log.error({ err, requestId }, "unhandled error")` 记录。
- 订单号生成：改为 `XS{YYYYMMDD}{8 hex}`，捕获 `order_number` 唯一约束冲突后服务端最多重试 3 次。
- 库存模型修正：新增 `reservation_allocations`，`initial_qty` 不再表达出库扣减；可售量统一为 `initial_qty - reserved_qty - stock_deduction_sum`。
- 库存查询质量：`getAvailableQty`、`getAvailabilitySummary`、`getBatch`、`listBatchesForItem`、`listBatches` 均扣除 `stock_deductions`；批次列表/建议查询使用 `stockDeduction.groupBy` + `Map` 避免 N+1。
- 出库语义：`confirmShipment` 先写 `stock_deductions`，再 `finalizeAllocations(orderItemId)`，最后同步配送/订单状态和审计。
- Route 输入边界收紧：客户、订单 command、配送标记、目录、库存可售、审计日志和导出查询均通过 Zod `validateBody` / `validateQuery`。
- 发票登记幂等：`POST /api/v1/orders/{id}/invoice-registration` 已要求 `Idempotency-Key`，并通过 `DocumentApplicationService` 保存/复用幂等结果。
- 导出类型清理：`exports.routes.ts` 已移除 `as never`，状态查询复用 `orderStatusSchema`。
- 统一交付前审查 HIGH 修复：配送任务日期/区域筛选、确认送达 `delivered_at/note`、确认订单 `confirm_note` 均已前后端 contract 对齐。
- 客户备注回读已修复，route validation guard 已加入防止 POST/PATCH 缺少 `validateBody` 复发。

Verification snapshot:
- `npm test`: 73 files, 338 tests passed.
- `npm run test:coverage`: statements 89.45%, lines 90.23%.
- `npm run web:test`: 24 files, 78 tests passed.
- `npm run web:build`: passed.
- `npm run e2e:web:prepare`: passed against local dev DB.
- `npm run web:e2e`: 8 Chromium tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run prisma:validate`: passed.
- `npm audit --audit-level=moderate`: only known `exceljs -> uuid` moderate vulnerabilities; no HIGH/CRITICAL.
- Prisma smoke: passed after mock seed.

DB note:
- 本地 dev migration 初次生成时间戳早于已有 migration；已将新增 migration 调整为 `20260626005600_add_reservation_allocations`，并对本地 dev DB 执行 reset + mock seed 重新验证。该处理只影响可丢弃本地开发库。

Known follow-up:
- 真实外部 PostgreSQL 尚未提供，不能伪造 production-like migration/smoke 结果。
- 少量中低优先级审计、金额精度评估和类型逃逸清理继续跟踪在 `docs/process/hardening-backlog-2026-06-26.md`。
