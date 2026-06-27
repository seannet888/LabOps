# 实验动物销售管理系统 — 全量代码审查报告

> 审查日期: 2026-06-26
> 审查范围: `src/server/` 全部 105 个 TypeScript 文件
> 审查依据: [code-review-standard.md](code-review-standard.md)
> 审查人: Code Reviewer (火眼眼)

---

## 0. 总体评价

### 整体印象

这是一个**架构清晰、分层严谨**的 MVP 后端项目。Domain 层纯净无副作用，Application 层通过接口隔离 Prisma，API 层薄且职责单一。状态机设计、幂等机制、事务 seam 这三个核心基础设施做得相当扎实，体现了对业务复杂度的预判。

但也存在一些**必须修复的正确性缺口**（审计日志遗漏、库存预占逻辑缺陷、订单号碰撞风险）和一批**应补齐的校验短板**（多个端点用 `as` 断言代替 Zod 校验）。

### 统计概览

| 等级 | 数量 | 合并影响 |
| --- | --- | --- |
| 🔴 Blocker | 6 | 阻塞上线，必须修复 |
| 🟡 Suggestion | 14 | 建议修复，可分批迭代 |
| 💭 Nit | 5 | 锦上添花 |
| ✅ 好的实践 | 8 | 保持 |

### 修复状态更新（2026-06-26）

本报告保留原始审查意见作为历史记录。首批上线阻断修复完成后，当前状态如下：

| 项 | 当前状态 |
| --- | --- |
| B1 `confirmDelivery` 审计 | ✅ 已修复，写入 `confirm_delivery` |
| B2 `flagSalesActionRequired` 审计 | ✅ 已修复，写入 `flag_sales_action` 和 `reason` |
| B3 库存预占/释放 | ✅ 已重构，新增 `reservation_allocations`，多批次 FIFO，精确 release/finalize |
| B4 订单号碰撞 | ✅ 已修复，`XS{YYYYMMDD}{8 hex}` + P2002 最多 3 次重试 |
| B5 500 错误日志 | ✅ 已修复，未知 500 记录 `request.log.error({ err, requestId }, "unhandled error")` |
| B6 `createBatch` 校验 | ✅ 已修复，严格 Zod schema + `entry_date >= birth_date` |
| S3 `createBatch` 幂等 | ✅ 已修复，要求 `Idempotency-Key` |
| S4 库存 N+1 | ✅ 已修复，批量 `groupBy` 汇总扣减量 |
| S2 `registerInvoice` 幂等 | ⏳ 未完成，进入后续 hardening |
| S1 全量 POST Zod 化 | ⏳ 未完成，进入后续 hardening |

验证快照：`npm test` 55 files / 274 tests passed，`typecheck`、`lint`、`prisma:validate`、`prisma:generate`、`migrate status` 均通过。

---

## 1. 🔴 Blocker（必须修复才能上线）

---

### B1: `confirmDelivery` 缺少审计日志

**文件:** `src/server/application/delivery/delivery-application.service.ts:212-246`

**原因:** `confirmDelivery` 方法完成了"送达确认"这一高风险操作（修改配送任务状态 + 修改订单状态），但没有调用 `deps.auditLogs.record()`。对照审查标准 D2，"出库扣减、票证放行"等高风险操作必须写入审计日志，送达确认同属此列。缺失审计日志意味着无法追溯谁在何时确认了送达，出问题时无法定责。

**对比:** 同文件的 `confirmShipment`（出库）在 line 195-200 正确记录了审计日志。`scheduleDeliveryTask` 也没有审计日志，但排程不属于高风险操作，列为 🟡。

**建议:**
```typescript
// 在 markDelivered 之后、return 之前添加:
await deps.auditLogs.record({
  actorId: input.actorId,
  action: "confirm_delivery",
  entityType: "delivery_task",
  entityId: input.deliveryTaskId
});
```

---

### B2: `flagSalesActionRequired` 缺少审计日志

**文件:** `src/server/application/delivery/delivery-application.service.ts:281-313`

**原因:** 后勤标记"需销售处理"是一个跨域协作信号，直接影响销售工作流。没有审计日志，销售侧无法追溯是哪个后勤人员、为何标记。该方法已接收 `actorId` 和 `reason` 参数，但只写入了 `deliveryTask` 表的 `salesActionNote` 字段，没有写入独立的审计日志表。

**建议:**
```typescript
await deps.auditLogs.record({
  actorId: input.actorId,
  action: "flag_sales_action",
  entityType: "delivery_task",
  entityId: input.deliveryTaskId
});
```

---

### B3: 库存预占/释放只操作第一条批次，可能超卖

**文件:** `src/server/infrastructure/db/prisma-domain-repositories.ts:550-564`

**原因:** `reserve` 方法使用 `take: 1` 只取最老的一条批次，然后直接 `increment: quantity`。如果该批次的可用量不足预占数量，`reservedQty` 会超过 `initialQty`，导致负库存。同理，`release` 也只操作第一条批次，可能释放了错误批次的预占量。

```typescript
// 当前实现 — 只取第一条，不检查余量
const batches = await this.prisma.inventoryBatch.findMany({
  where: { strainId: id(strainId), gender },
  orderBy: { birthDate: "asc" },
  take: 1  // ← 只取一条
});
const batch = batches[0];
if (batch) {
  await this.prisma.inventoryBatch.update({
    where: { id: batch.id },
    data: { reservedQty: { increment: quantity } }  // ← 不检查是否超量
  });
}
```

**后果:** 高并发下多个订单同时确认，可能在同一批次上累计预占超过 `initialQty`，后续出库时发现实际库存不够，导致已确认订单无法发货。

**建议:** 预占应按 FIFO 分配到多个批次，或在 increment 前校验 `initialQty - reservedQty >= quantity`。考虑到 MVP 阶段，至少应在 SQL 层加 `WHERE reservedQty + :qty <= initialQty` 条件防止超卖。

---

### B4: 订单号生成策略在并发下可能碰撞

**文件:** `src/server/infrastructure/db/prisma-domain-repositories.ts:332`

**原因:**
```typescript
orderNumber: `XS${Date.now()}${Math.floor(Math.random() * 1000)}`,
```

`Date.now()` 在同一毫秒内返回相同值，`Math.random() * 1000` 只有 1000 种可能。高并发下（如批量导入订单），同一毫秒内两个请求生成相同订单号的概率为 1/1000。虽然 `order_number` 有 `@unique` 约束会阻止插入，但会导致运行时 P2002 错误，用户体验差。

**建议:** 使用数据库序列（PostgreSQL `SEQUENCE`）或 Prisma 的 `@default(autoincrement())` + 前缀格式化。如果必须应用层生成，至少使用 `crypto.randomUUID()` 或更大的随机空间。

---

### B5: 错误处理器不记录 500 错误的原始堆栈

**文件:** `src/server/api/error-handler.ts:19-26`

**原因:**
```typescript
reply.status(500).send(
  errorResponse({
    code: "internal_error",
    message: "服务器内部错误",
    requestId: request.id
  })
);
```

对于非 `ApplicationError` 的异常（如 Prisma 连接断开、未捕获的 TypeError 等），错误处理器直接返回 500 但**不记录任何日志**。生产环境中，开发者无法从 `request_id` 追溯到具体的异常堆栈，导致线上问题难以排查。

**建议:**
```typescript
// 在 reply.status(500) 之前添加:
if (request.log) {
  request.log.error({ err: error, requestId: request.id }, "unhandled error");
}
```

同时建议将 `app.ts` 中的 `logger: false` 改为生产环境启用 pino logger（见 S10）。

---

### B6: `createBatch` 端点完全没有输入校验，可写入负数库存

**文件:** `src/server/api/routes/inventory.routes.ts:33-56`

**原因:**
```typescript
const body = request.body as {
  strain_id: string;
  birth_date: string;
  gender: "M" | "F";
  initial_qty: number;
  entry_date: string;
  notes?: string;
};
```

使用 `as` 断言绕过了所有运行时校验。客户端可以传入 `initial_qty: -100` 或 `initial_qty: 3.14`，这些值会直接写入数据库。负数库存会导致可用量计算错误（`availableQty = initialQty - reservedQty` 可能变成负数），浮点数库存会导致后续扣减逻辑混乱。

此外 `birth_date` 和 `entry_date` 没有日期格式校验，`gender` 没有枚举校验。

**建议:** 创建 `createBatchSchema` Zod schema：
```typescript
const createBatchSchema = z.object({
  strain_id: z.string().min(1),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["M", "F"]),
  initial_qty: z.number().int().positive(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional()
}).strict();
```

---

## 2. 🟡 Suggestion（建议修复）

---

### S1: 多个端点使用 `as` 断言代替 Zod 校验

**文件:** 多个路由文件

以下端点使用 `request.body as {...}` 或 `request.query as {...}` 直接断言，未通过 `validateBody` / `validateQuery` + Zod schema 校验：

| 文件 | 行号 | 端点 | 问题 |
| --- | --- | --- | --- |
| `orders.routes.ts` | 122 | `POST /orders/:id/cancel` | body 用 `as` 断言 |
| `orders.routes.ts` | 139 | `POST /orders/:id/settle` | body 用 `as` 断言 |
| `orders.routes.ts` | 158 | `POST /orders/:id/archive-documents` | body 用 `as` 断言 |
| `orders.routes.ts` | 194-199 | `POST /orders/:id/invoice-registration` | body 用 `as` 断言 |
| `delivery-tasks.routes.ts` | 84 | `POST /delivery-tasks/:id/flag-sales-action-required` | body 用 `as` 断言 |
| `customers.routes.ts` | 10 | `GET /customers` | query 用 `as` 断言 |
| `customers.routes.ts` | 41-51 | `POST /customers` | body 用 `as` 断言 |
| `customers.routes.ts` | 72-83 | `PATCH /customers/:id` | body 用 `as Record<string, unknown>` + 逐字段 `as` |
| `catalog.routes.ts` | 16 | `GET /strains` | query 用 `as` 断言 |
| `catalog.routes.ts` | 35 | `POST /strains` | body 用 `as` 断言 |
| `catalog.routes.ts` | 47 | `GET /price-rules/current` | query 用 `as` 断言 |
| `inventory.routes.ts` | 59 | `GET /inventory-availability` | query 用 `as` 断言 |
| `audit-logs.routes.ts` | 31 | `GET /audit-logs` | query 用 `as` 断言 |
| `exports.routes.ts` | 20 | `GET /exports/orders.xlsx` | query 用 `as` 断言 |

**原因:** `as` 断言在编译期生效，运行时不做任何检查。客户端传入数组、字符串、null 等非预期类型时，TypeScript 不会报错，但运行时访问属性会得到 `undefined`，行为不明确。

**建议:** 逐批补齐 Zod schema。优先处理 POST 副作用端点（cancel、settle、archive-documents、invoice-registration、flag-sales-action-required、createCustomer、createStrain），再处理 GET query 参数。

---

### S2: `registerInvoice` 端点缺少 Idempotency-Key

**文件:** `src/server/api/routes/orders.routes.ts:189-210`

**原因:** `POST /api/v1/orders/:id/invoice-registration` 是副作用命令（创建发票登记记录），但没有通过 `idempotencyKeyOf(request)` 传入幂等键。用户重复点击可能导致同一订单产生多条发票登记记录。

**建议:** 在 `registerInvoice` 调用中添加 `idempotencyKey: idempotencyKeyOf(request)`，并在 `DocumentApplicationService.registerInvoice` 中实现幂等检查。

---

### S3: `createBatch` 端点缺少 Idempotency-Key

**文件:** `src/server/api/routes/inventory.routes.ts:33-56`

**原因:** `POST /api/v1/inventory-batches` 是副作用命令，但没有幂等保护。重复提交会创建重复的库存批次记录。

**建议:** 添加 `idempotencyKeyOf(request)` 并在 `InventoryApplicationService.createBatch` 中实现幂等检查。

---

### S4: `listBatchesForItem` 和 `listBatches` 存在 N+1 查询

**文件:** `src/server/infrastructure/db/prisma-domain-repositories.ts:588-622`

**原因:** `listBatchesForItem` 对每条批次记录调用 `deductedQty(this.prisma, record.id)` 查询扣减总量，导致 N+1 查询。`listBatches` 同样如此。如果某品系有 20 个批次，一次列表查询会产生 21 次 DB 调用。

**建议:** 使用 Prisma 的 `aggregate` 或 `_count` 一次性查询所有批次的扣减总量：
```typescript
const deductions = await this.prisma.stockDeduction.groupBy({
  by: ["inventoryBatchId"],
  where: { inventoryBatchId: { in: records.map(r => r.id) } },
  _sum: { quantity: true }
});
```

---

### S5: `createStrain` 缺少审计日志

**文件:** `src/server/application/catalog/catalog-application.service.ts:48-51`

**原因:** 创建新品系是目录管理操作，但没有记录审计日志。同文件的 `createPriceRule` 有审计日志。品系变更影响后续订单和库存，应可追溯。

**建议:** 添加 `deps.auditLogs.record({ actorId, action: "create_strain", entityType: "strain", entityId: strain.id })`。注意 `createStrain` 当前不接收 `actorId`，需要在 `CreateStrainInput` 中添加。

---

### S6: `updateCustomer` 缺少审计日志

**文件:** `src/server/application/customers/customer-application.service.ts:61-71`

**原因:** 修改客户档案（名称、结算方式、信用期等）是重要业务操作，但没有审计日志。同文件的 `updateDeliveryAddress` 有审计日志。

**建议:** 在 `update` 调用后添加审计记录。注意当前 `updateCustomer` 不接收 `actorId`，需要补充。

---

### S7: `DeliveryStrategyApplicationService` 的 create/update 接收 `actorId` 但不使用

**文件:** `src/server/application/delivery-strategy/delivery-strategy-application.service.ts:29-68`

**原因:** `createDeliveryStrategyRule` 和 `updateDeliveryStrategyRule` 的 input 都包含 `actorId`，但方法体内完全没有使用它（没有审计日志，没有传给 repository）。这是一个"dead parameter"——要么是遗漏了审计日志，要么是不应该接收这个参数。

**建议:** 如果策略规则变更需要审计（推荐），添加 `auditLogs` 依赖并记录。如果不需要，移除 `actorId` 参数避免误导。

---

### S8: `getAvailableQty` 和 `getAvailabilitySummary` 忽略 `ageWeeks` 参数

**文件:** `src/server/infrastructure/db/prisma-domain-repositories.ts:542-548, 624-631`

**原因:** 两个方法的签名都接收 `ageWeeks`，但查询条件中没有用它过滤。参数名以 `_` 前缀标记为忽略（`_ageWeeks`）。这意味着查询"4周龄雄性 C57 可用量"时，返回的是该品系所有年龄段雄性的总量。

**后果:** 订单确认时的库存检查可能通过（总量够），但实际指定年龄段的库存不够，出库时才发现无货可发。

**建议:** 如果 MVP 阶段有意忽略年龄过滤（例如库存按品系+性别管理，不按年龄），应在注释中说明设计决策。如果应该过滤，需要根据 `birthDate` 计算年龄范围并加入查询条件。

---

### S9: `listDeliveryStrategyRules` 在内存中分页

**文件:** `src/server/application/delivery-strategy/delivery-strategy-application.service.ts:19-27`

**原因:**
```typescript
const rules = await this.deps.deliveryStrategyRules.listActive();
const start = (filters.page - 1) * filters.limit;
const data = rules.slice(start, start + filters.limit);
```

先从数据库拉取全部活跃规则，再在内存中 slice 分页。虽然策略规则数量通常不多，但这违反了"列表接口应在数据库层分页"的原则。如果规则数量增长，会拉取不必要的数据。

**建议:** 在 `DeliveryStrategyRuleRepository` 中添加 `listActivePaginated` 方法，在 Prisma 查询中使用 `skip` 和 `take`。

---

### S10: `app.ts` 中 logger 设为 false

**文件:** `src/server/api/app.ts:15`

**原因:** `Fastify({ logger: false })` 在生产环境中禁用了所有请求日志。结合 B5（错误处理器不记录堆栈），生产环境将完全没有可观测性。

**建议:** 改为 `Fastify({ logger: process.env.NODE_ENV !== "test" })` 或配置 pino 的日志级别。

---

### S11: `exports.routes.ts` 使用 `as never` 绕过类型检查

**文件:** `src/server/api/routes/exports.routes.ts:22`

**原因:**
```typescript
status: orderStatus(query.status) as never,
```

`as never` 使 TypeScript 完全放弃类型检查。如果 `orderStatus()` 函数返回了不合法的值，编译期不会报错。

**建议:** 使用正确的类型标注，或让 `orderStatus` 函数返回 `Order["status"] | undefined`。

---

### S12: `prisma-app-dependencies.ts` 大量使用 `as never` / `as unknown as` 类型断言

**文件:** `src/server/infrastructure/db/prisma-app-dependencies.ts:36-53`

**原因:** 多处使用 `prisma as never` 和 `prisma as unknown as PrismaXxxClient` 将 PrismaClient 强制转换为各 repository 接口。这绕过了 TypeScript 的类型安全，如果 Prisma schema 变更导致字段不匹配，编译期不会报错。

**建议:** 虽然 Prisma 的类型系统较复杂，完全避免 `as` 可能不现实，但建议至少为每个 `PrismaXxxClient` 接口添加类型测试（如 `prisma-schema.contract.test.ts`），在 CI 中捕获 schema 与接口的不匹配。

---

### S13: `createOrder` 中价格计算使用 `Number()` 转换 decimal string

**文件:** `src/server/infrastructure/db/prisma-domain-repositories.ts:329`

**原因:**
```typescript
const totalAmount = order.items.reduce((sum, item) =>
  sum + Number(item.actualPrice) * item.quantity, 0
).toFixed(2);
```

使用 `Number()` 将 decimal string 转为浮点数进行乘法和加法，可能产生浮点精度问题（如 `0.1 + 0.2 = 0.30000000000000004`）。虽然最终 `.toFixed(2)` 会修正显示，但中间计算的精度损失在极端情况下可能导致金额偏差。

**建议:** 考虑使用整数分计算（将 decimal string 转为分），或使用 `Decimal.js` 进行精确运算。

---

### S14: `customer-application.service.ts` — `createCustomer` 不在事务中

**文件:** `src/server/application/customers/customer-application.service.ts:56-59`

**原因:** `createCustomer` 直接调用 `this.deps.customers.create(input)` 而没有通过 `this.inTransaction()` 包裹。虽然当前只写入一张表，但如果未来需要同时创建客户+默认地址，不在事务中可能导致部分写入。

**建议:** 统一使用 `inTransaction` 包裹所有写操作，保持一致性。

---

## 3. 💭 Nit（锦上添花）

---

### N1: `confirmOrder` 中库存检查与预占之间存在 TOCTOU 窗口

**文件:** `src/server/application/orders/order-application.service.ts:176-185`

先检查 `getAvailableQty` 再 `reserve`，两步之间有时间差。虽然已在事务中，但 PostgreSQL 默认隔离级别（Read Committed）下，其他事务可以在检查后、预占前修改库存。考虑使用 `SELECT ... FOR UPDATE` 或乐观锁。

---

### N2: `exports.routes.ts` 中 `ORDER_STATUSES` 硬编码重复

**文件:** `src/server/api/routes/exports.routes.ts:6`

`ORDER_STATUSES` 集合与 `query-params.schema.ts` 中的 `orderStatusSchema` 重复定义。应复用 schema 中的枚举。

---

### N3: `delivery-application.service.ts` — `scheduleDeliveryTask` 缺少审计日志

排程不是高风险操作，但记录审计日志有助于追踪配送安排变更。

---

### N4: `orders.routes.ts:83` — `request.params as { id: string }` 可用 Zod 校验

路径参数目前全部用 `as` 断言。虽然 Fastify 会将 params 解析为 string，但用 Zod 校验可以统一错误处理并防止注入。

---

### N5: `idempotency.ts` — `JSON.stringify` 对含 `undefined` 字段的对象会丢弃键

`idempotencyRequestHash` 使用 `JSON.stringify` 序列化。如果 input 对象中有 `undefined` 值的键，`JSON.stringify` 会直接丢弃该键。如果两次请求仅在某可选字段 `undefined` vs 未传之间有差异，hash 可能相同，导致幂等误判。当前业务中风险较低，但值得注意。

---

## 4. ✅ 好的实践（保持）

---

### G1: 状态机集中管理，转换规则显式可查

**文件:** `src/server/domain/order-status.ts`, `src/server/domain/delivery-status.ts`

使用 `ReadonlySet` + 函数封装，所有合法转换集中定义。`canTransitionOrderStatus` 按 actor 类型区分（sales/manager/delivery_sync），权限矩阵在域层即被强制。非法转换在域层被拒绝，不会到达数据库。这是很干净的域模型设计。

---

### G2: 幂等机制完整且一致

**文件:** `src/server/application/shared/idempotency.ts`, `src/server/infrastructure/db/prisma-idempotency-repository.ts`

幂等实现包含请求哈希校验（同 key 不同 payload → 409 conflict）、24h TTL、唯一约束兜底。所有 order/delivery command 端点统一使用 `idempotencyKeyOf(request)` + `idempotencyRequestHash(input)`，模式一致。`saveResult` 中的 `isUniqueConstraintError` 处理了并发写入的边界情况。

---

### G3: 分层架构严格，依赖方向正确

- Domain 层（`src/server/domain/`）不 import HTTP、Prisma、文件系统
- Application 层（`src/server/application/`）通过接口定义 repository 依赖，不 import `@prisma/client`
- API 层（`src/server/api/`）只做认证、权限、校验、调用 service、响应映射
- Infrastructure 层实现 application 接口，Prisma entity 通过 `toXxx()` 映射函数转换为 domain model，不外泄

---

### G4: 事务 seam 设计灵活

**文件:** `src/server/application/shared/transaction-runner.ts`

`TransactionRunner<TContext>` 接口允许测试用 `InMemoryTransactionRunner`（无事务），生产用 `PrismaTransactionRunner`（真实 `$transaction`）。每个 application service 通过 `inTransaction()` 方法优雅地包裹回调，transactions 可选注入。

---

### G5: 权限矩阵在路由层正确执行

- 销售操作（创建订单、确认、改价、取消、结算、归档）: `requireRole("sales", "manager")`
- 后勤操作（排程、出库、送达、标记需销售处理）: `requireRole("logistics", "manager")`
- 管理操作（创建品系、价格规则、策略规则）: `requireRole("manager")`
- 审计日志查询: `requireRole("manager")`

`routes-contract.test.ts` 中有测试验证 logistics 用户不能改价、sales 用户不能确认出库。

---

### G6: Zod schema 使用 `.strict()` 拒绝未知字段

**文件:** `src/server/api/schemas/create-order.schema.ts`, `change-order-prices.schema.ts`, `confirm-shipment.schema.ts`, `delivery-strategy-rules.routes.ts`

所有已实现的 Zod schema 都使用 `.strict()`，客户端传入多余字段会返回 422 错误。这防止了字段名拼写错误导致的静默忽略。

---

### G7: DTO 映射显式，不返回 ORM entity

所有路由的响应都通过 `.map()` 显式映射 DTO，将内部 `camelCase` 转为 API 的 `snake_case`。没有直接返回 Prisma entity 的情况。

---

### G8: 错误处理体系统一

`ApplicationError` 基类 + 各子类（`ValidationError`, `ForbiddenError`, `StateConflictError` 等）+ `ERROR_CODE_HTTP_STATUS` 映射表 + 统一的 `handleError` 处理器。所有可预期失败都通过 `ApplicationError` 子类抛出，错误响应格式统一为 `{ error: { code, message, details?, request_id } }`。

---

## 5. 修复优先级建议

### 第一批（上线前必须完成 — 🔴 Blocker）

| # | 问题 | 预估工作量 |
| --- | --- | --- |
| B1 | `confirmDelivery` 添加审计日志 | 5 行代码 |
| B2 | `flagSalesActionRequired` 添加审计日志 | 5 行代码 |
| B3 | 库存预占增加余量校验 | 需重构 reserve/release 逻辑 |
| B4 | 订单号生成改用序列或 UUID | 1 行代码 + migration |
| B5 | 错误处理器添加日志记录 | 3 行代码 |
| B6 | `createBatch` 添加 Zod schema | 新建 schema 文件 |

### 第二批（上线后第一个迭代 — 🟡 Suggestion 高优先级）

| # | 问题 | 预估工作量 |
| --- | --- | --- |
| S1 | 补齐 POST 端点 Zod 校验 | 7 个 schema 文件 |
| S2-S3 | registerInvoice / createBatch 添加幂等 | 修改 service + route |
| S4 | 修复 N+1 查询 | 重构 listBatches 方法 |
| S10 | 启用生产日志 | 配置 pino |

### 第三批（后续迭代 — 🟡 Suggestion 低优先级 + 💭 Nit）

S5-S9, S11-S14, N1-N5 可在后续迭代中逐步处理。

---

## 6. 架构合规性检查

| 检查项 | 状态 | 说明 |
| --- | --- | --- |
| Domain 层不依赖 HTTP/Prisma/FS | ✅ 通过 | 所有 domain 文件纯函数，无外部 import |
| Application 层不 import @prisma/client | ✅ 通过 | 通过接口隔离，repository 实现在 infrastructure |
| API 层只做认证/权限/校验/映射 | ✅ 通过 | 无业务逻辑泄漏到路由层 |
| 所有路由有 requireAuth | ✅ 通过 | 除 `POST /auth/login` 外全部有 |
| 权限矩阵正确 | ✅ 通过 | 销售不能出库，后勤不能改价 |
| 副作用命令有 Idempotency-Key | ⚠️ 部分通过 | order/delivery command 与 inventory batch create 已有；invoice registration 等剩余项进后续 hardening |
| 响应使用 { data } envelope | ✅ 通过 | 所有成功响应统一 |
| 错误使用 { error: {...} } 格式 | ✅ 通过 | 统一通过 errorResponse |
| JSON 字段 snake_case | ✅ 通过 | 路由层显式映射 |
| 金额用 decimal string | ✅ 通过 | decimalStringSchema 校验，DTO 输出 string |
| 路由前缀 /api/v1 | ✅ 通过 | 全部符合 |
| Prisma entity 不泄漏到响应 | ✅ 通过 | 所有响应经 toXxx() 映射 |
| 状态转换走域策略函数 | ✅ 通过 | canTransitionOrderStatus / canTransitionDeliveryTaskStatus |
| 跨表多写用 TransactionRunner | ✅ 通过 | confirmOrder, cancelOrder, confirmShipment 等 |
| 高风险操作写审计日志 | ✅ 首批缺口已修复 | confirmOrder、confirmDelivery、flagSalesAction 已补；createStrain/updateCustomer 等 suggestion 后续处理 |
| Prisma schema 是唯一 DDL owner | ✅ 通过 | 无手工 SQL DDL |
| Zod schema 覆盖请求体 | ⚠️ 部分通过 | createBatch 已补严格 schema；剩余 POST 端点进入后续 hardening |

---

## 7. 结语

这个项目的架构骨架是健康的——分层清晰、状态机严谨、幂等机制完整、权限矩阵正确。大部分 🔴 Blocker 都是**遗漏型问题**（忘记加审计日志、忘记加校验），而非**设计型错误**，修复成本低。

建议按优先级分三批修复，第一批 6 个 Blocker 可以在 1-2 个工作日内完成。修复后，这个代码库的 quality gate 可以达到上线标准。

> 有任何疑问或需要针对某个问题深入讨论，随时提出。审查的目的是让代码更好，不是让作者难堪。🔥
