# 实验动物销售管理系统 — Hardening Backlog

> 生成日期: 2026-06-26
> 审查报告: [code-review-report-2026-06-26.md](code-review-report-2026-06-26.md)
> 审查标准: [code-review-standard.md](code-review-standard.md)
> Triage 决策人: 项目负责人

---

## 0. 关于这份 Backlog

这份 Backlog 由负责人对审查报告进行 triage 后生成。采纳报告全部 6 个 Blocker，调整了部分 Suggestion 优先级，并确定了分 8 批的修复顺序。

**核心原则（来自负责人决策）：**
- 不一口气全修，尤其库存模块需要严格 TDD 红绿灯和边界设计
- 前 3 批作为第一批快速修复切片进入编码
- 库存正确性单独开专项，用 TDD 覆盖多批次、年龄过滤、并发/事务一致性

### 0.1 修复状态更新（2026-06-26）

第一批上线阻断修复已完成并验证：

- TASK-001 完成：`createBatchSchema` 已覆盖严格 schema、`entry_date >= birth_date`、未知字段拒绝。
- TASK-002/TASK-003 完成：`confirm_delivery` 与 `flag_sales_action` 审计已写入，`flag_sales_action` 包含 `reason`。
- TASK-004 评估完成：`scheduleDeliveryTask` 暂不作为 MVP 高风险审计动作，保持后续观察。
- TASK-005/TASK-006 完成：未知 500 已记录 `request.log.error({ err, requestId }, "unhandled error")`，非测试环境 Fastify logger 已启用。
- TASK-007 完成：订单号改为 `XS{YYYYMMDD}{8 hex}`，唯一冲突服务端最多重试 3 次。
- TASK-008 完成：新增 `reservation_allocations`；`reserve`/`releaseAllocations`/`finalizeAllocations` 已拆分；可售量统一扣除 `stock_deductions`；周龄过滤生效。
- TASK-009 完成：库存入库已要求 `Idempotency-Key`，同 key 同 payload 复用结果，同 key 不同 payload 返回 409。
- TASK-010 完成：发票登记已要求 `Idempotency-Key`，并在 `DocumentApplicationService` 内通过幂等仓库复用同 payload 结果、拒绝同 key 不同 payload。
- TASK-011 完成：高风险 POST/command route 以及相关 GET query 已补 Zod `validateBody` / `validateQuery`；路由目录已无 `request.body/query as` 或 `as never` 命中。
- TASK-012 完成：`listBatchesForItem` 和 `listBatches` 使用 `stockDeduction.groupBy` + `Map` 汇总扣减量，避免 N+1。
- TASK-013 完成：`exports.routes.ts` 已移除 `as never`，导出状态查询复用 `orderStatusSchema`。
- 统一交付前审查 HIGH 修复完成：配送任务列表支持 `planned_delivery_date`/`geo_area` 过滤；确认订单读取 `confirm_note` 并写入 audit `newValue`；确认送达读取 `delivered_at`/`note`，送达日期写入现有 `delivery_tasks.delivered_at`，备注写入 audit `newValue`。
- 客户备注回读完成：`GET /api/v1/customers` 返回 `notes`，前端 DTO mapper 和编辑表单回填已同步。
- 防复发测试完成：新增 route validation guard，所有 POST/PATCH route 必须使用 `validateBody` 或显式标注 body-less。
- 顺手完成：create order ID/date schema 收紧、settle/invoice/export date schema 收紧、发票登记幂等冲突测试、stock deduction suggestions 使用 `dataResponse()`、`uploadCertificate` 接入 document transaction runner。
- 顺带完成：`confirm_order` 审计日志已补齐。

验证快照：

- `npm test`: 73 files, 338 tests passed.
- `npm run test:coverage`: statements 89.45%, lines 90.23%.
- `npm run web:test`: 24 files, 78 tests passed.
- `npm run web:build`: passed.
- `npm run e2e:web:prepare`: passed against local dev DB.
- `npm run web:e2e`: 8 Chromium tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run prisma:validate`: passed.
- `npm audit --audit-level=moderate`: still reports only known `exceljs -> uuid` moderate vulnerabilities; no HIGH/CRITICAL.

仍未完成/后续处理：

- TASK-014/TASK-015/TASK-016：中低优先级金额精度、审计和死参数清理。
- Prisma 生产组合层仍有部分类型逃逸，进入后续架构清理，不阻塞当前 MVP smoke。

---

## 1. 批次 1：数据入口快速止血（预计 0.5 天）

### TASK-001: `createBatch` 端点添加 Zod schema 校验

**来源:** B6（Blocker）
**优先级:** 🔴 Blocker
**估计工时:** 1-2h

**问题描述:**
`POST /api/v1/inventory-batches` 使用 `as` 断言，可写入负数库存、非法性别、非法日期。

**修改文件:**
- 新建 `src/server/api/schemas/create-batch.schema.ts`
- 修改 `src/server/api/routes/inventory.routes.ts:33-56`

**验收标准:**
- `initial_qty` 必须为正整数，`birth_date` 和 `entry_date` 必须匹配 `YYYY-MM-DD`
- `gender` 只能为 `"M"` 或 `"F"`
- 使用 `.strict()` 拒绝未知字段

---

## 2. 批次 2：补全关键审计日志（预计 0.5 天）

### TASK-002: `confirmDelivery` 添加审计日志

**来源:** B1（Blocker）
**优先级:** 🔴 Blocker
**估计工时:** 0.5h

**问题描述:**
送达确认修改两个表状态，但没有审计留痕，无法追溯责任和恢复操作。

**修改文件:**
- `src/server/application/delivery/delivery-application.service.ts:212-246`

**验收标准:**
- `confirmDelivery` 在 `markDelivered` 之后、`return` 之前调用 `deps.auditLogs.record()`
- `action` 值为 `"confirm_delivery"`，`entityType` 为 `"delivery_task"`

### TASK-003: `flagSalesActionRequired` 添加审计日志

**来源:** B2（Blocker）
**优先级:** 🔴 Blocker
**估计工时:** 0.5h

**问题描述:**
后勤标记"需销售处理"无审计日志，销售侧无法追溯标记原因和操作人。

**修改文件:**
- `src/server/application/delivery/delivery-application.service.ts:281-313`

**验收标准:**
- 在写入 `salesActionNote` 之后调用 `deps.auditLogs.record()`
- `action` 值为 `"flag_sales_action"`

### TASK-004: 评估 `scheduleDeliveryTask` 是否需要审计日志

**来源:** N3（Nit，负责人要求顺带评估）
**优先级:** 💭 Nit
**估计工时:** 0.5h（评估 + 如决定加则顺带实现）

**决策点:** 排程是否属于"高风险操作"？目前判断为"否"，但留痕有助于追踪配送安排变更。

---

## 3. 批次 3：生产可观测性（预计 0.5 天）

### TASK-005: 错误处理器记录 500 错误的原始堆栈

**来源:** B5（Blocker）
**优先级:** 🔴 Blocker
**估计工时:** 1h

**问题描述:**
非 `ApplicationError` 的未捕获异常直接返回 500，不记录任何日志，生产环境不可观测。

**修改文件:**
- `src/server/api/error-handler.ts:19-26`

**验收标准:**
- 错误处理器对非 `ApplicationError` 异常调用 `request.log.error()` 记录堆栈
- `requestId` 一并写入日志，便于关联

### TASK-006: 启用生产环境 Fastify logger

**来源:** S10（Suggestion，与 B5 配套）
**优先级:** 🟡 Suggestion（高优先级）
**估计工时:** 0.5h

**修改文件:**
- `src/server/api/app.ts:15`

**验收标准:**
- `Fastify({ logger: process.env.NODE_ENV !== "test" })` 或按环境配置 pino 日志级别
- 测试环境不输出请求日志

---

## 4. 批次 4：订单号生成策略（预计 1 天，含测试）

### TASK-007: 修复订单号生成策略

**来源:** B4（Blocker）
**优先级:** 🔴 Blocker
**估计工时:** 1d（含冲突处理测试）

**问题描述:**
`Date.now() + Math.random()*1000` 在同一毫秒内碰撞概率 1/1000。

**Schema 约束分析:**
当前 `orderNumber String @unique @db.VarChar(20)`，`VarChar(20)` 约束限制了方案选择。

**最终采用方案（MVP 快速修复）— 消除碰撞，保持可读:**
```typescript
import { randomBytes } from "node:crypto";
const yyyymmdd = formatBusinessDate(new Date());
orderNumber: `XS${yyyymmdd}${randomBytes(4).toString("hex")}`;
```
- 碰撞概率: 1/2^32，且服务端捕获 `order_number` 唯一约束冲突后最多重试 3 次。
- 优势: 纯应用层，不需要新增序列表 migration，仍保留业务日期可读性。

**延后方案（仅在业务强要求严格流水号时再做）— 可读序列号 + 数据库唯一约束:**
```prisma
// 新建 model
model OrderSequence {
  id        Int    @id @default(autoincrement())
  date      String @unique @db.VarChar(8)  // YYYYMMDD
  lastValue Int    @default(0)
  @@map("order_sequences")
}
```
生成格式: `XS2026062600001`，每天从 1 开始计数，在事务中原子递增。

**验收标准（已完成）:**
- 使用 `crypto.randomBytes` 代替 `Math.random()`
- 添加 P2002 重试逻辑（捕获唯一约束冲突，重新生成）

---

## 5. 批次 5：库存正确性专项（预计 3-5 天，严格 TDD）

> ⚠️ **负责人特别指示**: 这是最重要的专项之一。不能简单补一行，要用 TDD 覆盖多批次、年龄过滤、并发/事务一致性。

### TASK-008: 修复库存预占/释放逻辑（多批次 FIFO）

**来源:** B3（Blocker）+ S8（年龄过滤，提升优先级）
**优先级:** 🔴 Blocker
**估计工时:** 3-5d（TDD 红绿灯）

**问题描述:**
1. `reserve()` 只取第一条批次，不检查余量，可能超卖
2. `release()` 只操作第一条批次，可能释放错误批次
3. `getAvailableQty()` 和 `getAvailabilitySummary()` 忽略 `ageWeeks` 参数

**业务影响:**
- 预占超量 → 出库时无货可发
- 年龄过滤缺失 → 系统确认实际上不可履约的订单（合同按品系+周龄+性别匹配）

**修改文件:**
- `src/server/infrastructure/db/prisma-domain-repositories.ts`
  - `reserve()` 方法（约 550-564 行）
  - `release()` 方法（同区域）
  - `getAvailableQty()` 方法（约 542-548 行）
  - `getAvailabilitySummary()` 方法（约 624-631 行）

**最终采用方案:**
- 新增 `reservation_allocations` 记录内部预占分配。
- `reserve(orderItemId, strainId, ageWeeks, gender, quantity)` 按 FIFO 多批次预占，递增 `reserved_qty` 并写 allocation。
- `releaseAllocations(orderItemId)` 用于取消订单，按 allocation 递减 `reserved_qty` 并删除 allocation。
- `finalizeAllocations(orderItemId)` 用于确认出库成功后清理预占，按 allocation 递减 `reserved_qty` 并删除 allocation。
- `stock_deductions` 是真实出库事实；`initial_qty` 保持入库原始数量，不在出库时递减。
- 可售量统一为 `initial_qty - reserved_qty - stock_deduction_sum`。

**TDD 规划（红绿灯）:**

```
RED:
  - 测试 reserve 在多批次场景下按 FIFO 分配
  - 测试 reserve 在余量不足时抛异常（不超卖）
  - 测试 release 释放正确的批次（与 reserve 对称）
  - 测试 getAvailableQty 正确过滤 ageWeeks
  - 测试并发 reserve 不超卖（事务 + SELECT FOR UPDATE 或乐观锁）

GREEN:
  - 重构 reserve: 遍历批次，按 birthDate ASC 分配，直到 quantity 耗尽
  - 在 SQL 层加 WHERE 条件防止超卖
  - 重构 release: 记录预占时分配的批次，释放时对应扣减
  - 在 getAvailableQty 中加入年龄过滤

REFACTOR:
  - 抽取 FIFO 分配逻辑为独立函数
  - 确保 Prisma query 有合适索引（已有 @@index([strainId, gender, birthDate])）
```

**验收标准:**
- 多批次 FIFO 预占测试通过（至少 3 个批次场景）
- 余量不足时抛出 `InsufficientInventoryError`
- 年龄过滤在 `getAvailableQty` 和 `getAvailabilitySummary` 中生效
- 并发测试通过（可以用 `vitest` + 模拟并发或事务隔离级别测试）

---

## 6. 批次 6：补齐幂等保护（预计 1-2 天）

### TASK-009: `createBatch` 添加 Idempotency-Key 支持

**来源:** S3（Suggestion，负责人提升优先级）
**优先级:** 🟡 Suggestion（高优先级，与 B6 配套）
**估计工时:** 2h

**问题描述:**
库存入库重复提交会造成库存膨胀，数据完整性风险。

**修改文件:**
- `src/server/api/routes/inventory.routes.ts:33-56`
- `src/server/application/inventory/inventory-application.service.ts`

**验收标准:**
- `POST /api/v1/inventory-batches` 要求 `Idempotency-Key` header
- 同 key 同 payload 返回已保存结果；同 key 不同 payload 返回 409

### TASK-010: `registerInvoice` 添加 Idempotency-Key 支持

**来源:** S2（Suggestion，负责人认定为高优先级）
**优先级:** 🟡 Suggestion（高优先级）
**估计工时:** 2h

**修改文件:**
- `src/server/api/routes/orders.routes.ts:189-210`
- `src/server/application/documents/document-application.service.ts`

**验收标准:** 同上

---

## 7. 批次 7：系统性补齐 Zod 校验（预计 2-3 天）

### TASK-011: 补齐所有 POST 端点的 Zod schema 校验

**来源:** S1（Suggestion，高优先级部分）
**优先级:** 🟡 Suggestion
**估计工时:** 2-3d

**问题描述:**
以下端点使用 `as` 断言代替 Zod 校验，运行时无保护：

| 文件 | 行号 | 端点 |
| --- | --- | --- |
| `orders.routes.ts` | 122 | `POST /orders/:id/cancel` |
| `orders.routes.ts` | 139 | `POST /orders/:id/settle` |
| `orders.routes.ts` | 158 | `POST /orders/:id/archive-documents` |
| `orders.routes.ts` | 194-199 | `POST /orders/:id/invoice-registration` |
| `delivery-tasks.routes.ts` | 84 | `POST /delivery-tasks/:id/flag-sales-action-required` |
| `customers.routes.ts` | 41-51 | `POST /customers` |
| `catalog.routes.ts` | 35 | `POST /strains` |

**策略:** 优先处理副作用端点（POST），再处理 GET query 参数。

**验收标准:**
- 每个端点有对应的 `*.schema.ts` 文件
- 使用 `validateBody(request, schema)` 或 `validateQuery(request, schema)`
- Schema 使用 `.strict()` 拒绝未知字段

---

## 8. 批次 8：中低优先级问题（预计 2-3 天，可穿插进行）

### TASK-012: 修复 N+1 查询

**来源:** S4（Suggestion）
**估计工时:** 2h
**修改文件:** `prisma-domain-repositories.ts:588-622`
**验收标准:** `listBatchesForItem` 和 `listBatches` 使用 `aggregate` 或 `groupBy` 一次性查询扣减总量。

### TASK-013: 修复 `exports.routes.ts` 的 `as never` 类型逃逸

**来源:** S11（Suggestion）
**估计工时:** 0.5h
**修改文件:** `src/server/api/routes/exports.routes.ts:22`
**验收标准:** 移除 `as never`，使用正确类型标注。

### TASK-014: `createOrder` 价格计算使用整数分或 Decimal.js

**来源:** S13（Suggestion）
**估计工时:** 1h（评估 + 修改）
**修改文件:** `prisma-domain-repositories.ts:329-351`
**验收标准:** 移除 `Number()` 转换，使用 `Decimal.js` 或整数分计算。

### TASK-015: `createStrain` / `updateCustomer` 补审计日志

**来源:** S5, S6（Suggestion）
**估计工时:** 1h
**修改文件:**
- `catalog-application.service.ts:48-51`
- `customer-application.service.ts:61-71`
**验收标准:** 品系创建/客户修改写入审计日志（需先补充 `actorId` 参数传递）。

### TASK-016: `DeliveryStrategyApplicationService` 处理 `actorId` 死参数

**来源:** S7（Suggestion）
**估计工时:** 0.5h
**修改文件:** `delivery-strategy-application.service.ts:29-68`
**验收标准:** 要么补审计日志，要么移除未使用的 `actorId` 参数。

---

## 9. 进度追踪

| 批次 | 任务数 | 状态 | 预计完成时间 |
| --- | --- | --- | --- |
| 批次 1: 数据入口止血 | 1 | ✅ 已完成 | 2026-06-26 |
| 批次 2: 审计日志 | 3 | ✅ 已完成 | 2026-06-26 |
| 批次 3: 可观测性 | 2 | ✅ 已完成 | 2026-06-26 |
| 批次 4: 订单号 | 1 | ✅ 已完成 | 2026-06-26 |
| 批次 5: 库存专项 | 1 | ✅ 已完成 | 2026-06-26 |
| 批次 6: 幂等补齐 | 2 | ✅ 已完成 | TASK-009/TASK-010 已完成 |
| 批次 7: Zod 校验 | 1 | ✅ 已完成 | 高风险 route 输入边界已收紧 |
| 批次 8: 中低优先级 | 5 | 🟡 部分完成 | TASK-012/TASK-013 已完成；其余待做 |

---

## 10. 决策待定点

1. **订单号方案**: 已决策并实现 `XS{YYYYMMDD}{8 hex}` + P2002 最多 3 次服务端重试；严格每日流水号延后。
2. **`scheduleDeliveryTask` 审计**: 已评估，MVP 暂不加入轻审计；若后续要求配送安排变更追溯，再单独补。
3. **`createCustomer` 事务化**: 当前单表写，暂不升 Blocker；未来加默认地址时再处理。

---

> 此 Backlog 由 code-reviewer 根据负责人 triage 决策生成。
> 每个任务进入编码前，必须先读 `docs/architecture/tdd-scaffold-plan.md` 和 `.agents/rules/tdd-red-green-refactor.md`，严格遵守红绿灯节奏。
