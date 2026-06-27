# 交付前增量审查报告 — 后端 Hardening Batch

> 审查日期: 2026-06-26
> 审查范围: 今天后端增量改动（Zod schema 边界化、发票登记幂等、Document service 事务、Prisma 依赖组合、route 层薄度、E2E 稳定性）
> 审查方式: 全量文件阅读 + api-contract.md 对照
> 不修改代码，仅输出审查意见

---

## 总体评价

**结论: 可以交付。未发现 HIGH/CRITICAL 级别问题。**

今天这批 hardening 改动质量很好，方向正确：

- Route 层 Zod 化覆盖全面，`.strict()` 在 body schema 上一致使用，query 参数用 `z.coerce` 处理类型转换
- 发票登记幂等实现路径完整：`idempotencyRequestHash` → `findResult` → `saveResult`，同 key 同 payload 复用、同 key 不同 payload 抛 `ConflictError`
- `DocumentApplicationService` 事务边界设计合理，独立 `documentTransactions` runner 只包含 `documents` + `idempotency` 两个 repo
- Route 层保持薄适配器角色，无业务逻辑下沉
- E2E 测试覆盖核心销售到配送全流程，角色可见性和错误契约测试到位
- 后端测试从 317 增到 325，新增覆盖了 Zod 边界拒绝和幂等行为

以下按优先级列出发现项。所有 🟡 为建议修复，💭 为改进建议，均不阻塞交付。

---

## 审查发现

### 🟡 S1: `createOrderSchema` 缺少 `customer_id` / `strain_id` 最小长度校验

**文件**: `src/server/api/schemas/create-order.schema.ts` 第 6, 16 行

**现状**:
```ts
customer_id: z.string(),          // 无 .min(1)
strain_id: z.string(),            // 无 .min(1)
```

**问题**: 空字符串 `""` 能通过 schema 校验并到达 application service。对比 `createBatchSchema` 的 `strain_id: z.string().min(1)` 和 `createStrainSchema` 的 `species_id: z.string().trim().min(1)`，这里明显遗漏。

**影响**: 低风险——空 ID 会在 repository 层查不到记录而失败，但会在 application 层产生不明确的 not_found 错误而非 422 validation_error。

**建议**: 统一加 `.min(1)` 或 `.trim().min(1)`。

---

### 🟡 S2: `invoiceRegistrationSchema.registered_at` 未校验日期格式

**文件**: `src/server/api/routes/orders.routes.ts` 第 35 行

**现状**:
```ts
registered_at: z.string().trim().min(1),
```

**问题**: api-contract.md §1.4 规定日期格式为 `YYYY-MM-DD`，但这里接受任意非空字符串。对比 `scheduleDeliveryTaskSchema` 的 `planned_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`，不一致。

**影响**: 低风险——下游 service 可能直接存入 DB，产生脏数据。

**建议**: 加 `.regex(/^\d{4}-\d{2}-\d{2}$/)`。

---

### 🟡 S3: `settleOrderSchema.settled_at` 未校验日期格式

**文件**: `src/server/api/routes/orders.routes.ts` 第 23 行

**现状**:
```ts
settled_at: z.string().optional(),
```

**问题**: 同 S2，api-contract.md §10.6 示例为 `"settled_at": "2026-07-25"`，应为 date-only 格式。

**建议**: `.regex(/^\d{4}-\d{2}-\d{2}$/).optional()`。

---

### 🟡 S4: `exportOrdersQuerySchema` 的 `created_at[gte]` / `created_at[lte]` 未校验日期格式

**文件**: `src/server/api/routes/exports.routes.ts` 第 10-11 行

**现状**:
```ts
"created_at[gte]": z.string().optional(),
"created_at[lte]": z.string().optional(),
```

**问题**: api-contract.md §4.4 示例为 `created_at[gte]=2026-06-01`，但这里接受任意字符串。如果传入 `"abc"`，会透传到 repository 层导致 Prisma 查询错误或空结果。

**建议**: 加 `.regex(/^\d{4}-\d{2}-\d{2}$/)` 或至少 `.datetime()` 视业务需要。

---

### 🟡 S5: 发票登记幂等缺少「同 key 不同 payload → 409」测试

**文件**: `src/server/application/documents/document-application.service.test.ts`

**现状**: 测试覆盖了:
1. 正常发票登记 ✓
2. 同 key 同 payload 返回原结果 ✓

**缺失**: 没有测试同 key 不同 payload 抛 `ConflictError`。

**对比**: `app.test.ts` 第 156-179 行为 `createOrder` 覆盖了这个场景（`idem-create-conflict`），但 `registerInvoice` 没有对应的 route 级或 service 级测试。

**影响**: `PrismaIdempotencyRepository.findResult` 第 60-61 行的 `requestHash` 比对逻辑未被测试覆盖。如果 `idempotencyRequestHash` 的 `sortForHash` 排序逻辑有 bug，不会被现有测试发现。

**建议**: 在 `document-application.service.test.ts` 加一个测试：
```ts
it("throws ConflictError when the same key is reused with a different payload", async () => {
  const service = new DocumentApplicationService({ documents, idempotency: new InMemoryIdempotencyRepository() });
  await service.registerInvoice({ orderId: "ord_001", invoiceType: "tech_service", registeredAt: "2026-06-25", actorId: "user_sales", idempotencyKey: "idem_1" });
  await expect(service.registerInvoice({ orderId: "ord_002", invoiceType: "vat_special", registeredAt: "2026-06-26", actorId: "user_sales", idempotencyKey: "idem_1" }))
    .rejects.toThrow(ConflictError);
});
```

---

### 🟡 S6: `uploadCertificate` 未包裹在事务中

**文件**: `src/server/application/documents/document-application.service.ts` 第 55-65 行

**现状**:
```ts
async uploadCertificate(input: UploadCertificateInput): Promise<UploadCertificateResult> {
  const certificate = await this.deps.documents.recordCertificate({...});
  return { data: { id: certificate.id } };
}
```

**问题**: `registerInvoice` 使用 `inTransaction(async (deps) => {...})`，但 `uploadCertificate` 直接调用 `this.deps.documents` 而非事务上下文。如果将来证书上传需要同时写审计日志或更新订单状态，会出现部分写入风险。

**影响**: 当前低风险——单次写入操作，无需事务。但与 `registerInvoice` 的模式不一致。

**建议**: 统一用 `inTransaction` 包裹，即使当前只有一次写入，也为将来扩展留好 seam。

---

### 🟡 S7: `roles.spec.ts` 依赖 seed 数据中的 order id `1`

**文件**: `e2e/web/roles.spec.ts` 第 15-20 行

**现状**:
```ts
await page.request.post("/api/v1/orders/1/confirm", {
  headers: { Authorization: `Bearer ${salesToken}`, "Idempotency-Key": `e2e-role-confirm-${Date.now()}` },
  data: {}
});
```

**问题**: 直接用 `/api/v1/orders/1/confirm`，假设 seed 数据中 id=1 的订单存在且处于 pending 状态。如果 seed 数据变化，测试可能静默失败（confirm 一个不存在的订单返回 404，但测试只检查 logistics 角色看不到确认按钮，不检查 confirm 是否成功）。

**对比**: `core-flow.spec.ts` 正确地先创建订单再操作。

**影响**: 测试稳定性风险，但不掩盖真实问题。

**建议**: 先通过 API 创建一个订单，再 confirm，或者至少 assert confirm 成功。

---

### 🟡 S8: `core-flow.spec.ts` 硬编码 API 地址和 localStorage key

**文件**: `e2e/web/core-flow.spec.ts` 第 89-97 行

**现状**:
```ts
const token = await page.evaluate(() => localStorage.getItem("labops_access_token"));
const archiveResponse = await page.request.post(`http://127.0.0.1:3000/api/v1/orders/${orderId}/archive-documents`, {...});
```

**问题**:
1. `localStorage.getItem("labops_access_token")` 耦合了前端的 token 存储 key。如果 key 名称改变，测试会拿到 `null` 然后 API 调用 401。
2. `http://127.0.0.1:3000` 硬编码，如果 dev server 端口变化则失败。

**影响**: E2E 脆弱性，但不掩盖真实问题。

**建议**: 用 `helpers.ts` 中的 `apiLogin(page, "sales")` 获取 token，用 `page.request.post` (不指定 baseURL) 发送请求。

---

### 💭 N1: `inventory.routes.ts` 重复 import

**文件**: `src/server/api/routes/inventory.routes.ts` 第 9-10 行

```ts
import { validateQuery } from "../validate.js";
import { validateBody } from "../validate.js";
```

**建议**: 合并为 `import { validateBody, validateQuery } from "../validate.js";`

---

### 💭 N2: `orders.routes.ts` 中 `request.user!.role as "sales" | "manager"` 类型断言

**文件**: `src/server/api/routes/orders.routes.ts` 第 111, 133, 150, 167, 184 行

**现状**: 多处使用 `request.user!.role as "sales" | "manager"`。

**问题**: `as` 断言绕过了类型安全。虽然 `requireRole("sales", "manager")` 作为 preHandler 已经保证了角色，但如果有人误删 preHandler，TypeScript 不会报错。

**建议**: 可以考虑在 `requireRole` 的返回类型中通过条件类型 narrowing `request.user.role`，但当前写法安全且可读，低优先级。

---

### 💭 N3: `PrismaIdempotencyRepository` 使用 `as never` 绕过类型检查

**文件**: `src/server/infrastructure/db/prisma-app-dependencies.ts` 第 42, 53, 74 行

**现状**: `new PrismaIdempotencyRepository(prisma as never)` 和 `new PrismaIdempotencyRepository(client as never)`

**问题**: `as never` 完全跳过类型检查。`PrismaIdempotencyClient` 接口已定义了 `idempotencyKey.findUnique` 和 `idempotencyKey.create` 的签名，用 `as unknown as PrismaIdempotencyClient` 会更安全（与 `PrismaOrderRepository` 等一致）。

**影响**: 如果 Prisma client 的 API 发生 breaking change（如方法签名变化），TypeScript 不会在编译期发现。

**建议**: 统一为 `as unknown as PrismaIdempotencyClient` 模式（`PrismaUserRepository` 和 `PrismaSessionRepository` 也有同样问题，但那些是历史遗留，不在本次增量范围内）。

---

## 已验证的正确实现

以下实现经审查确认正确，值得肯定：

✅ **Zod `.strict()` 一致使用** — 所有 body schema 都加了 `.strict()`，未知字段返回 422，符合 api-contract.md §16.4 的「拒绝未知请求字段」要求。

✅ **`decimalStringSchema`** — 正则 `/^\d+(\.\d{1,2})?$/` 正确限制为最多两位小数，用于 `actual_price`、`unit_price`、`amount_threshold`。

✅ **`createBatchSchema` 跨字段校验** — `.refine((value) => value.entry_date >= value.birth_date)` 正确实现了 api-contract.md §9.2 的 `entry_date >= birth_date` 约束。

✅ **`confirmShipmentSchema` 条件校验** — `.superRefine()` 正确实现了「票证缺失时 reason 必填」的业务规则。

✅ **幂等 hash 实现** — `sortForHash` 递归排序对象 key 和数组元素，过滤 `idempotencyKey` 字段，确保同 payload 不同字段顺序产生相同 hash。

✅ **`PrismaIdempotencyRepository.saveResult` P2002 处理** — 捕获 unique constraint violation 后 fallback 到 `findResult`，正确处理并发场景下的竞态条件。

✅ **Document service 独立事务 runner** — `documentTransactions` 只包含 `documents` + `idempotency`，不引入不必要的 repo，事务范围最小化。

✅ **`routes-contract.test.ts` 边界覆盖** — 每个测试都验证了「校验在 service 调用之前发生」（通过 `called` flag），确保 route 层是第一道防线。

✅ **E2E `error-contract.spec.ts`** — 用 `page.route` mock 后端 422 响应，验证前端正确展示 error code + request_id，是前后端契约对齐的好实践。

✅ **E2E `core-flow.spec.ts` 核心流程** — 覆盖客户创建 → 入库 → 建单 → 确认 → 安排 → 出库 → 送达 → 归档 → 结算 → 审计全链路，是交付信心的核心保障。

---

## 后续建议项（不要求本轮修复）

| 优先级 | 项目 | 说明 |
|--------|------|------|
| LOW | 补齐其他 command 的幂等复用测试 | cancel/settle/archive/confirm-delivery 目前只有 happy path 测试，缺少同 key 同 payload 复用验证 |
| LOW | `cancelOrderSchema` / `flagSalesActionRequiredSchema` 的 reason 加 max length | 防止超长字符串入库 |
| LOW | `auditLogListQuerySchema` 的 entity_type / entity_id 加 max length | 当前接受任意长度字符串 |
| LOW | `PrismaUserRepository` / `PrismaSessionRepository` 的 `as never` 统一 | 历史遗留，可批量清理 |
| LOW | `uploadCertificate` 加 idempotency | 当前无 route 注册，待 multipart 上线时一并处理 |

---

## 审查文件清单

| 文件 | 审查内容 |
|------|----------|
| `src/server/api/routes/customers.routes.ts` | Zod schema, 角色控制, DTO 映射 |
| `src/server/api/routes/orders.routes.ts` | Zod schema, 幂等 key 提取, 角色控制 |
| `src/server/api/routes/delivery-tasks.routes.ts` | Zod schema, 角色控制, DTO 映射 |
| `src/server/api/routes/catalog.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/routes/inventory.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/routes/audit-logs.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/routes/exports.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/routes/delivery-strategy-rules.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/schemas/create-order.schema.ts` | 字段约束, strict |
| `src/server/api/schemas/create-batch.schema.ts` | 跨字段校验 |
| `src/server/api/schemas/change-order-prices.schema.ts` | decimal string 校验 |
| `src/server/api/schemas/confirm-shipment.schema.ts` | 条件校验 |
| `src/server/api/schemas/schedule-delivery-task.schema.ts` | 日期格式校验 |
| `src/server/api/schemas/decimal-string.ts` | 正则 |
| `src/server/api/schemas/query-params.schema.ts` | 分页, 枚举 |
| `src/server/api/schemas/update-customer-address.schema.ts` | change_reason 必填 |
| `src/server/api/schemas/create-price-rule.schema.ts` | 日期格式, decimal |
| `src/server/api/validate.ts` | ValidationError 映射 |
| `src/server/api/idempotency-key.ts` | header 提取 + 校验 |
| `src/server/api/error-handler.ts` | ApplicationError → HTTP 映射 |
| `src/server/api/plugins/auth.ts` | requireAuth, requireRole |
| `src/server/api/app.ts` | 路由注册 |
| `src/server/application/documents/document-application.service.ts` | 幂等实现, 事务边界 |
| `src/server/application/documents/document-application.service.test.ts` | 幂等测试覆盖 |
| `src/server/application/shared/idempotency.ts` | request hash |
| `src/server/application/shared/types.ts` | 接口定义 |
| `src/server/application/shared/test-fixtures.ts` | InMemoryIdempotencyRepository |
| `src/server/application/errors.ts` | 错误码映射 |
| `src/server/infrastructure/db/prisma-app-dependencies.ts` | 依赖组合, 事务 runner |
| `src/server/infrastructure/db/prisma-idempotency-repository.ts` | Prisma 幂等实现, P2002 处理 |
| `src/server/api/routes-smoke.test.ts` | Smoke 覆盖 |
| `src/server/api/routes-contract.test.ts` | 边界覆盖 |
| `src/server/api/app.test.ts` | 幂等复用测试 |
| `src/server/api/dev-server.ts` | 启动配置 |
| `e2e/web/core-flow.spec.ts` | 核心流程 E2E |
| `e2e/web/error-contract.spec.ts` | 错误契约 E2E |
| `e2e/web/roles.spec.ts` | 角色可见性 E2E |
| `e2e/web/helpers.ts` | 测试辅助函数 |
| `e2e/web/auth.spec.ts` | 认证 E2E |
| `e2e/sales-to-delivery.spec.ts` | 应用层集成测试 |
| `docs/architecture/api-contract.md` | 契约对照 |
