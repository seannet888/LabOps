# 统一交付前审查报告 — 后端增量 + 前端全量

> 审查日期: 2026-06-26
> 审查范围:
> - **后端增量**: Zod schema 边界化、发票登记幂等、Document service 事务、Prisma 依赖组合、route 层薄度、E2E 稳定性
> - **前端全量**: 全部 `src/web/` 源码 — api-client、auth、permissions、AppShell、render-app、各 feature API 层与页面、schema、presenters、components、测试
> 审查方式: 全量文件阅读 + api-contract.md 对照 + 前后端 DTO 字段逐一比对
> 不修改代码，仅输出审查意见

## 修复状态更新（2026-06-26）

本报告提出的 3 个 HIGH contract 问题已完成修复并通过验证：

- F-H1：`GET /api/v1/delivery-tasks` 已支持 `planned_delivery_date` 和 `geo_area`，并下传到 Prisma repository 过滤。
- F-H2：`POST /api/v1/delivery-tasks/{id}/confirm-delivery` 已读取 `delivered_at` / `note`；`delivered_at` 写入现有 `delivery_tasks.delivered_at`，`note` 写入 `confirm_delivery` audit `newValue`。
- F-H3：`POST /api/v1/orders/{id}/confirm` 已读取 `confirm_note`，并写入 `confirm_order` audit `newValue`。

同批完成的 MEDIUM/NIT 收口：

- F-M3：客户列表响应已返回 `notes`，前端 mapper 和编辑表单已回填备注。
- F-M4 / B-S1~B-S4：订单创建、结算、发票登记、导出日期和 ID schema 已收紧。
- B-S5：发票登记同 key 不同 payload 的 `409 ConflictError` 测试已补。
- B-S6：`uploadCertificate` 已包裹 document transaction runner。
- F-M5：stock deduction suggestions route 已改用 `dataResponse()`。
- B-N1：inventory route import 已合并。
- 新增 route validation guard：所有 POST/PATCH route 必须使用 `validateBody` 或显式标注 body-less。

最新验证：

- `npm test`: 73 files, 338 tests passed.
- `npm run test:coverage`: statements 89.45%, lines 90.23%.
- `npm run web:test`: 24 files, 78 tests passed.
- `npm run web:build`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run prisma:validate`: passed.
- `npm run e2e:web:prepare` + `npm run web:e2e`: 8 Chromium tests passed.
- `npm audit --audit-level=moderate`: only known `exceljs -> uuid` moderate vulnerabilities; no HIGH/CRITICAL.

---

## 总体评价

**结论: 可以交付。未发现 CRITICAL 级别问题。发现 3 个 HIGH 级别问题（均为前后端 contract 不对齐导致的功能缺失，非安全风险）。**

后端 hardening 批次质量很好 — Zod 全面落地、幂等路径完整、事务边界合理、route 层保持薄适配器。前端架构清晰 — snake_case/camelCase mapper 模式一致、permission matrix 覆盖全面、Zod 表单校验与后端形成双重防线、TanStack Query 使用规范。

3 个 HIGH 问题都是「前端发送了字段但后端没有读取」导致的静默功能缺失 — 用户在 UI 上输入的数据被后端丢弃。这些不影响安全性（后端权限控制仍然生效），但影响用户体验和数据完整性。

---

## Part A: 后端增量审查

### 已验证的正确实现

- Zod `.strict()` 在所有 body schema 上一致使用，未知字段返回 422
- `decimalStringSchema` 正则 `/^\d+(\.\d{1,2})?$/` 正确限制为最多两位小数
- `createBatchSchema` 跨字段校验 `entry_date >= birth_date` 正确
- `confirmShipmentSchema` `.superRefine()` 正确实现「票证缺失时 reason 必填」
- 幂等 hash 实现 `sortForHash` 递归排序，过滤 `idempotencyKey` 字段
- `PrismaIdempotencyRepository.saveResult` P2002 处理 — 捕获 unique constraint 后 fallback 到 `findResult`
- Document service 独立事务 runner `documentTransactions` 只包含 `documents` + `idempotency`
- `routes-contract.test.ts` 每个测试验证「校验在 service 调用之前发生」
- E2E `error-contract.spec.ts` 用 `page.route` mock 后端 422 验证前端展示
- E2E `core-flow.spec.ts` 覆盖客户创建到结算审计全链路

### 后端发现

#### B-S1: `createOrderSchema` 缺少 `customer_id` / `strain_id` 最小长度校验

**文件**: `src/server/api/schemas/create-order.schema.ts` 第 6, 16 行

**现状**: `customer_id: z.string()` 和 `strain_id: z.string()` 无 `.min(1)`

**影响**: 空字符串 `""` 能通过 schema 校验，在 application 层产生不明确的 not_found 错误而非 422。

**建议**: 统一加 `.min(1)` 或 `.trim().min(1)`。

#### B-S2: `invoiceRegistrationSchema.registered_at` 未校验日期格式

**文件**: `src/server/api/routes/orders.routes.ts` 第 35 行

**现状**: `registered_at: z.string().trim().min(1)` — 接受任意非空字符串。

**建议**: 加 `.regex(/^\d{4}-\d{2}-\d{2}$/)`。

#### B-S3: `settleOrderSchema.settled_at` 未校验日期格式

**文件**: `src/server/api/routes/orders.routes.ts` 第 23 行

**现状**: `settled_at: z.string().optional()` — 接受任意字符串。

**建议**: `.regex(/^\d{4}-\d{2}-\d{2}$/).optional()`。

#### B-S4: `exportOrdersQuerySchema` 日期参数未校验格式

**文件**: `src/server/api/routes/exports.routes.ts` 第 10-11 行

**现状**: `created_at[gte]` 和 `created_at[lte]` 为 `z.string().optional()`。

**建议**: 加 `.regex(/^\d{4}-\d{2}-\d{2}$/)`。

#### B-S5: 发票登记幂等缺少「同 key 不同 payload -> 409」测试

**文件**: `src/server/application/documents/document-application.service.test.ts`

**现状**: 只测了正常登记和同 key 同 payload 复用，缺少同 key 不同 payload 冲突场景。

**建议**: 加一个 `ConflictError` 测试 case。

#### B-S6: `uploadCertificate` 未包裹在事务中

**文件**: `src/server/application/documents/document-application.service.ts` 第 55-65 行

**现状**: `registerInvoice` 用 `inTransaction`，但 `uploadCertificate` 直接调用 `this.deps.documents`。

**建议**: 统一用 `inTransaction` 包裹，为将来扩展留 seam。

#### B-S7: `roles.spec.ts` 依赖 seed 数据中的 order id `1`

**文件**: `e2e/web/roles.spec.ts` 第 15-20 行

**现状**: 硬编码 `/api/v1/orders/1/confirm`，假设 seed 数据中 id=1 存在且 pending。

**建议**: 先通过 API 创建订单再 confirm。

#### B-S8: `core-flow.spec.ts` 硬编码 API 地址和 localStorage key

**文件**: `e2e/web/core-flow.spec.ts` 第 89-97 行

**现状**: `http://127.0.0.1:3000` 硬编码，`localStorage.getItem("labops_access_token")` 耦合 storage key。

**建议**: 用 `helpers.ts` 的 `apiLogin` 和 `page.request.post`。

#### B-N1: `inventory.routes.ts` 重复 import

**文件**: `src/server/api/routes/inventory.routes.ts` 第 9-10 行

```ts
import { validateQuery } from "../validate.js";
import { validateBody } from "../validate.js";
```

**建议**: 合并为 `import { validateBody, validateQuery } from "../validate.js";`

#### B-N2: `orders.routes.ts` 中 `request.user!.role as "sales" | "manager"` 类型断言

**文件**: `src/server/api/routes/orders.routes.ts` 第 111, 133, 150, 167, 184 行

**建议**: 可在 `requireRole` 返回类型中 narrowing，但当前写法安全且可读。

#### B-N3: `PrismaIdempotencyRepository` 使用 `as never` 绕过类型检查

**文件**: `src/server/infrastructure/db/prisma-app-dependencies.ts` 第 42, 53, 74 行

**建议**: 统一为 `as unknown as PrismaIdempotencyClient` 模式。

---

## Part B: 前端全量审查

### 架构与模块边界

前端架构分层清晰，遵循一致的 `api/ -> schema -> presenters -> Page` 模式：

```
src/web/
  lib/api-client.ts        — fetch 封装、envelope 解包、错误处理
  lib/form-errors.ts       — Zod issue -> field error 映射、API error 友好化
  app/auth.tsx             — AuthProvider + useAuth
  app/permissions.ts       — 静态权限矩阵
  app/AppShell.tsx         — 侧边栏 + 顶栏布局
  app/render-app.tsx       — Router + QueryClient + 路由表
  app/LoginPage.tsx        — 登录页
  app/pages.tsx            — 占位页
  features/<domain>/
    api/<domain>.api.ts    — DTO 类型 + mapper + request 函数
    <domain>-schema.ts     — Zod 表单校验
    <domain>-presenters.ts — 状态标签、格式化
    <Domain>Page.tsx       — 页面组件
  components/              — 通用 UI 组件
```

**值得肯定**:
- 每个 feature 的 API 层都严格分离 DTO (snake_case) 和 Domain type (camelCase)，mapper 函数命名一致 (`mapXxxDto` / `toXxxDto`)
- `commandRequest` 自动注入 `Idempotency-Key` header，开发者不需要手动管理
- `formatApiError` 对 403/409/422/5xx 提供了用户友好的中文消息
- Zod schema 使用 `.strict()` 和 `.refine()` 实现了跨字段校验
- `canPerform` 权限检查在按钮渲染层面一致使用

### 前端发现

#### F-H1: 配送任务筛选条件后端不支持 — 日期和区域筛选静默失效

**文件**: `src/web/features/delivery/api/delivery.api.ts` 第 155-161 行 vs `src/server/api/routes/delivery-tasks.routes.ts` 第 12-15 行

**现状**:

前端发送：
```ts
buildQueryString({
  page: filters.page,
  per_page: filters.perPage,
  status: filters.status,
  planned_delivery_date: filters.plannedDeliveryDate,  // 后端不接收
  geo_area: filters.geoArea                              // 后端不接收
})
```

后端 schema：
```ts
const deliveryTaskListQuerySchema = z.object({
  status: deliveryTaskStatusSchema.optional(),
  ...paginationQueryFields
  // 没有 planned_delivery_date 和 geo_area
});
```

**影响**: 用户在 UI 上输入日期和区域筛选条件，但后端完全忽略这些参数，返回未筛选的数据。用户会以为筛选生效了，实际看到的是全部数据。这是功能缺陷，不是安全风险。

**建议**: 后端 `deliveryTaskListQuerySchema` 加上 `planned_delivery_date` 和 `geo_area` 字段，并在 `listDeliveryTasks` service 中传递给 repository 层。或者如果后端暂不支持，前端先移除这两个筛选项，避免误导用户。

---

#### F-H2: `confirm-delivery` 请求体被后端完全忽略 — 用户输入的送达时间和备注丢失

**文件**: `src/web/features/delivery/api/delivery.api.ts` 第 187-196 行 vs `src/server/api/routes/delivery-tasks.routes.ts` 第 150-168 行

**现状**:

前端发送：
```ts
body: {
  ...(input.deliveredAt ? { delivered_at: input.deliveredAt } : {}),
  ...(input.note ? { note: input.note } : {})
}
```

后端路由：
```ts
// 没有 validateBody，没有读取 request.body
const result = await deps.delivery.confirmDelivery({
  deliveryTaskId: id,
  actorId: request.user!.id,
  idempotencyKey: idempotencyKeyOf(request)
  // 没有传递 deliveredAt 和 note
});
```

**影响**: 用户在「确认送达」对话框中输入的送达时间和备注被后端完全丢弃。用户以为数据已保存，实际没有。如果业务需要记录实际送达时间和备注（如对账或审计），这会导致数据缺失。

**建议**: 后端 `confirm-delivery` 路由加 body schema 校验，读取 `delivered_at` 和 `note`，传递给 `confirmDelivery` service。

---

#### F-H3: `confirm-order` 请求体被后端忽略 — 用户输入的确认备注丢失

**文件**: `src/web/features/orders/api/orders.api.ts` 第 132-138 行 vs `src/server/api/routes/orders.routes.ts` 第 104-122 行

**现状**:

前端发送：
```ts
body: input.confirmNote ? { confirm_note: input.confirmNote } : {}
```

后端路由：
```ts
// 没有 validateBody，没有读取 request.body
const result = await deps.orders.confirmOrder({
  orderId: id,
  actor: request.user!.role as "sales" | "manager",
  actorId: request.user!.id,
  idempotencyKey: idempotencyKeyOf(request)
  // 没有传递 confirmNote
});
```

**影响**: 用户在「确认订单」对话框中输入的确认备注被后端丢弃。如果业务需要记录确认备注（如审计追溯），这会导致数据缺失。

**建议**: 后端 `confirm-order` 路由加 body schema 校验，读取 `confirm_note`，传递给 `confirmOrder` service。

---

#### F-M1: Token 存储在 localStorage — XSS 风险

**文件**: `src/web/app/auth.tsx` 第 4, 55, 102 行

**现状**: `TOKEN_KEY = "labops_access_token"`，token 直接存入 `localStorage`。

**影响**: 如果应用存在任何 XSS 漏洞（如未来引入第三方库或用户输入未转义），攻击者可以通过 `localStorage.getItem("labops_access_token")` 窃取 session token。

**评估**: 对于 MVP 内部系统，这个风险是可接受的。后端使用不透明 session token 而非 JWT，token 可以随时通过服务端失效。但如果面向外部用户，应改用 httpOnly cookie 或考虑短期 token + refresh token 机制。

**建议**: 记为后续安全改进项，不阻塞当前交付。

---

#### F-M2: 无 401 全局拦截 — Token 过期后用户看到错误而非跳转登录

**文件**: `src/web/lib/api-client.ts` 第 89-106 行, `src/web/app/auth.tsx` 第 79-81 行

**现状**: `AuthProvider` 的 `restoreSession` 只在应用初始化时处理 401（清除 token 并跳转登录）。但在活跃使用中，如果 token 过期，query/mutation 收到 401 后只是显示错误消息，不会触发 logout 或跳转。

**影响**: 用户在操作过程中 token 过期后，所有页面都显示错误，但不会自动跳转到登录页。用户需要手动退出再登录。

**建议**: 在 `api-client.ts` 的 `request` 函数中，当收到 401 时 dispatch 一个全局事件（如 `window.dispatchEvent(new CustomEvent("auth:unauthorized"))`），`AuthProvider` 监听该事件并执行 `logout`。

---

#### F-M3: 客户 `notes` 字段只写不读 — 编辑时看不到已有备注

**文件**: `src/web/features/customers/customer-form-model.ts` 第 28 行 vs `src/server/api/routes/customers.routes.ts` 第 44-55 行

**现状**:

后端 list 响应不包含 `notes` 字段：
```ts
// 后端返回: id, name, unit_name, research_group, geo_area,
//           settlement_type, credit_days, default_delivery_method,
//           default_invoice_type, is_active — 没有 notes
```

前端编辑时：
```ts
export function customerFormFromModel(customer: Customer): CustomerFormValues {
  return {
    ...
    notes: ""  // 永远为空
  };
}
```

**影响**: 用户创建客户时输入了备注，但编辑该客户时备注字段是空的。如果用户直接保存，备注不会被覆盖（因为 `toCustomerCommandDto` 在 notes 为空时不发送），但用户无法看到或修改已有备注。

**建议**: 后端 list 响应加上 `notes` 字段，前端 `CustomerDto` 和 `mapCustomerDto` 加上 `notes` 映射，`customerFormFromModel` 使用 `customer.notes ?? ""`。

---

#### F-M4: `createOrderFormSchema.plannedDeliveryDate` 缺少日期格式校验

**文件**: `src/web/features/orders/order-schema.ts` 第 9 行

**现状**: `plannedDeliveryDate: z.string().optional()` — 接受任意字符串。

**对比**:
- `delivery-schema.ts` 的 `scheduleDeliveryFormSchema`: `dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
- `inventory-schema.ts` 的 `createInventoryBatchSchema`: `dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
- 后端 `createOrderSchema`: `planned_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`

**影响**: 用户手动输入无效日期格式（如 "abc"）能通过前端校验，但会被后端 422 拒绝。虽然后端有防线，但前端应该一致校验以提供即时反馈。

**建议**: 改为 `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` 或使用 `optionalDateSchema`（已在同文件定义）。

---

#### F-M5: `stock-deduction-suggestions` 响应格式非标准

**文件**: `src/server/api/routes/delivery-tasks.routes.ts` 第 63-74 行

**现状**: 后端返回 `reply.send({ data: result.data.map(...) })` — 直接构造 `{ data: [...] }`，没有使用 `dataResponse()` 或 `listResponse()`。

**影响**: 前端 `listShipmentSuggestions` 调用 `request<ShipmentSuggestionDto[]>`，`request` 函数的 `isResourceEnvelope` 检查会匹配 `{ data: [...] }` 并解包为数组。功能上能工作，但依赖 duck typing，如果后端 envelope 结构变化，前端会静默失败。

**建议**: 后端统一使用 `dataResponse(result.data.map(...))` 返回。

---

#### F-M6: 无 React Error Boundary — 渲染异常导致白屏

**文件**: `src/web/app/render-app.tsx`

**现状**: 没有 `ErrorBoundary` 组件包裹路由。

**影响**: 任何组件在 render 阶段抛出未捕获异常（如 API 返回意外数据结构导致 mapper 报错），整个应用白屏，用户只能刷新页面。

**建议**: 在 `ProtectedShell` 外层包裹一个 `ErrorBoundary` 组件，展示友好的错误页面并提供「返回首页」按钮。

---

#### F-M7: `confirmShipment` 表单只支持单条扣减

**文件**: `src/web/features/delivery/DeliveryTasksPage.tsx` 第 122-131 行

**现状**: `shipmentMutation` 构建的 `stockDeductions` 数组只有一条记录：
```ts
stockDeductions: [{
  orderItemId: deductionOrderItemId,
  inventoryBatchId: deductionBatchId,
  quantity: Number(deductionQty)
}]
```

**影响**: 如果订单有多个 item，用户只能逐条提交出库。但第一次 `confirmShipment` 可能将订单状态从 `confirmed` 转为 `shipped`，导致后续 item 无法再出库（状态不匹配）。

**评估**: 这是产品层面的限制。当前 UI 已有 `listShipmentSuggestions` 展示所有建议，但表单只接受单条。如果业务上单订单通常只有一个 item，这个限制可以接受。

**建议**: 记为后续产品改进项 — 表单应支持根据 suggestions 自动填充多条扣减记录。

---

#### F-N1: `DeliveryTasksPage` 日期筛选使用 `Input` 而非 `DateField`

**文件**: `src/web/features/delivery/DeliveryTasksPage.tsx` 第 227 行

**现状**: `<Input ... placeholder="YYYY-MM-DD" value={plannedDateFilter} />`

**对比**: `OrderCreatePage` 和 `InventoryBatchesPage` 的日期字段使用 `<DateField>` 组件。

**建议**: 统一使用 `DateField` 组件提供原生日期选择器。

---

#### F-N2: `DeliveryTasksPage` 筛选 aria-label 依赖无关状态

**文件**: `src/web/features/delivery/DeliveryTasksPage.tsx` 第 227 行

**现状**: `aria-label={scheduleTarget ? "计划配送日期筛选" : "计划配送日期"}` — aria-label 根据 `scheduleTarget`（安排对话框是否打开）变化，但这个状态与筛选输入框无关。

**建议**: 固定为 `aria-label="计划配送日期筛选"`。

---

#### F-N3: 登录流程发两次串行请求

**文件**: `src/web/app/auth.tsx` 第 97-106 行

**现状**: `login` 先 POST `/auth/login`，再 GET `/me`。`/auth/login` 响应已包含 `user: { id, username, display_name, role }`，但没有 `permissions`。

**影响**: 额外一次网络请求，登录延迟增加。`permissions` 在当前前端未被使用（权限检查基于 `role`），所以这个 `/me` 调用的价值有限。

**建议**: 如果 `permissions` 暂未使用，可以直接用 `/auth/login` 响应构造 `CurrentUser`，省去 `/me` 调用。或者让 `/auth/login` 响应包含 `permissions`。

---

#### F-N4: `crypto.randomUUID()` 需要 secure context

**文件**: `src/web/lib/api-client.ts` 第 129 行

**现状**: `export function createIdempotencyKey(): string { return crypto.randomUUID(); }`

**影响**: `crypto.randomUUID()` 只在 secure context（HTTPS 或 localhost）可用。如果通过 HTTP 部署到非 localhost 环境，会抛 `TypeError`。

**评估**: 生产环境通常在 HTTPS 后端，开发环境是 localhost，所以当前可用。但如果有人在内网 HTTP 环境测试，会遇到问题。

**建议**: 加 fallback：`return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);`

---

#### F-N5: TanStack Query 未配置 `staleTime`

**文件**: `src/web/app/render-app.tsx` 第 22-29 行

**现状**: `QueryClient` 只配置了 `retry: false`，没有设置 `staleTime`。默认 `staleTime: 0` 意味着每次组件 mount 都会触发 refetch。

**影响**: 用户在列表页和详情页之间切换时，每次都会重新请求列表数据。对于 MVP 内部系统，这是可接受的（确保数据新鲜），但增加了不必要的网络请求。

**建议**: 可配置 `staleTime: 30_000`（30 秒）减少重复请求。

---

## Part C: 前后端 Contract 对齐验证矩阵

| Endpoint | 前端 DTO 字段 | 后端响应字段 | 状态 |
|----------|-------------|-------------|------|
| `GET /orders` | `id, order_number, customer_id, customer_name, status, total_amount, requires_invoice, invoice_type, created_at` | 完全一致 | OK |
| `POST /orders` | 发送 `customer_id, items[]` snake_case | 读取 `body.customer_id, body.items[]` | OK |
| `POST /orders/:id/confirm` | 发送 `{ confirm_note }` | **不读取 body** | **F-H3** |
| `POST /orders/:id/change-prices` | 发送 `{ reason, items[{order_item_id, actual_price}] }` | 读取 `body.reason, body.items[]` | OK |
| `POST /orders/:id/cancel` | 发送 `{ reason }` | 读取 `body.reason` | OK |
| `POST /orders/:id/settle` | 发送 `{ settled_at, payment_method, note }` | 读取 `body.settled_at, body.payment_method, body.note` | OK |
| `GET /delivery-tasks` | 发送 `status, planned_delivery_date, geo_area` | **只接收 `status`** | **F-H1** |
| `POST /delivery-tasks/:id/schedule` | 发送 `{ planned_delivery_date, vehicle, driver, delivery_batch, route_notes }` | 读取全部字段 | OK |
| `POST /delivery-tasks/:id/confirm-shipment` | 发送 `{ stock_deductions[], document_release? }` | 读取全部字段 | OK |
| `POST /delivery-tasks/:id/confirm-delivery` | 发送 `{ delivered_at?, note? }` | **不读取 body** | **F-H2** |
| `POST /delivery-tasks/:id/flag-sales-action-required` | 发送 `{ reason }` | 读取 `body.reason` | OK |
| `GET /delivery-tasks/:id/stock-deduction-suggestions` | 期望 `ShipmentSuggestionDto[]` | 返回 `{ data: [...] }` 非标准 envelope | **F-M5** |
| `GET /customers` | `id, name, unit_name, research_group, geo_area, settlement_type, credit_days, default_delivery_method, default_invoice_type, is_active` | 完全一致 | OK |
| `POST /customers` | 发送含 `notes` | 读取 `body.notes` | OK |
| `PATCH /customers/:id` | 发送含 `notes` | 读取 `body.notes` | OK |
| `GET /customers` (notes 回读) | **期望 `notes`** | **不返回 `notes`** | **F-M3** |
| `GET /inventory-batches` | `id, strain_id, strain_name, species_name, birth_date, age_weeks, gender, initial_qty, reserved_qty, available_qty, is_aging, entry_date` | 完全一致 | OK |
| `POST /inventory-batches` | 发送 `strain_id, birth_date, gender, initial_qty, entry_date, notes` | 读取全部字段 | OK |
| `GET /inventory-availability` | `strain_id, age_weeks, gender, available_qty, reserved_qty, aging_qty` | 完全一致 | OK |
| `GET /audit-logs` | `id, actor_id, actor_name, action, entity_type, entity_id, old_value, new_value, reason, created_at` | 完全一致 | OK |

### 权限矩阵对齐验证

| Action | 前端 `actionRoles` | 后端 `requireRole` | 状态 |
|--------|-------------------|-------------------|------|
| `customers:create` | sales, manager | sales, manager | OK |
| `customers:update` | sales, manager | sales, manager | OK |
| `orders:create` | sales, manager | sales, manager | OK |
| `orders:confirm` | sales, manager | sales, manager | OK |
| `orders:change_prices` | sales, manager | sales, manager | OK |
| `orders:cancel` | sales, manager | sales, manager | OK |
| `orders:settle` | sales, manager | sales, manager | OK |
| `inventory_batches:create` | sales, manager | sales, manager | OK |
| `delivery_tasks:schedule` | logistics, manager | logistics, manager | OK |
| `delivery_tasks:confirm_shipment` | logistics, manager | logistics, manager | OK |
| `delivery_tasks:confirm_delivery` | logistics, manager | logistics, manager | OK |
| `delivery_tasks:flag_sales_action` | logistics, manager | logistics, manager | OK |
| `audit_logs:read` | manager | manager | OK |
| `orders:export` | sales, manager | sales, manager | OK |

---

## Part D: 统一发现汇总

### 按优先级分级

| 级别 | 编号 | 发现 | 归属 | 修复成本 |
|------|------|------|------|----------|
| HIGH | F-H1 | 配送任务日期/区域筛选后端不支持 | 前后端 | 低 — 后端加字段或前端移除 |
| HIGH | F-H2 | `confirm-delivery` body 被后端忽略 | 后端 | 低 — 加 body schema + 传递 |
| HIGH | F-H3 | `confirm-order` body 被后端忽略 | 后端 | 低 — 加 body schema + 传递 |
| MEDIUM | F-M1 | Token 存 localStorage (XSS) | 前端 | 高 — 需 httpOnly cookie |
| MEDIUM | F-M2 | 无 401 全局拦截 | 前端 | 中 — 加事件监听 |
| MEDIUM | F-M3 | 客户 notes 只写不读 | 后端 | 低 — list 响应加字段 |
| MEDIUM | F-M4 | 创建订单日期格式前端未校验 | 前端 | 极低 — 加 regex |
| MEDIUM | F-M5 | suggestions 响应非标准 envelope | 后端 | 极低 — 用 dataResponse |
| MEDIUM | F-M6 | 无 Error Boundary | 前端 | 低 — 加组件 |
| MEDIUM | F-M7 | 出库表单只支持单条扣减 | 前端 | 中 — 重构表单 |
| MEDIUM | B-S1 | `createOrderSchema` 缺 `.min(1)` | 后端 | 极低 |
| MEDIUM | B-S2 | `registered_at` 未校验日期格式 | 后端 | 极低 |
| MEDIUM | B-S3 | `settled_at` 未校验日期格式 | 后端 | 极低 |
| MEDIUM | B-S4 | export 日期参数未校验格式 | 后端 | 极低 |
| MEDIUM | B-S5 | 幂等冲突测试缺失 | 后端 | 低 |
| MEDIUM | B-S6 | `uploadCertificate` 无事务 | 后端 | 低 |
| MEDIUM | B-S7 | E2E 依赖 seed order id=1 | E2E | 中 |
| MEDIUM | B-S8 | E2E 硬编码地址和 key | E2E | 中 |
| NIT | F-N1 | 日期筛选用 Input 而非 DateField | 前端 | 极低 |
| NIT | F-N2 | aria-label 依赖无关状态 | 前端 | 极低 |
| NIT | F-N3 | 登录发两次串行请求 | 前端 | 低 |
| NIT | F-N4 | `crypto.randomUUID` 无 fallback | 前端 | 极低 |
| NIT | F-N5 | Query 未配 staleTime | 前端 | 极低 |
| NIT | B-N1 | inventory.routes 重复 import | 后端 | 极低 |
| NIT | B-N2 | `as` 类型断言 | 后端 | 低 |
| NIT | B-N3 | `as never` 类型绕过 | 后端 | 低 |

### 后续建议项（不要求本轮修复）

| 优先级 | 项目 | 说明 |
|--------|------|------|
| LOW | 补齐其他 command 的幂等复用测试 | cancel/settle/archive/confirm-delivery 缺少同 key 同 payload 复用验证 |
| LOW | `cancelOrderSchema` / `flagSalesActionRequiredSchema` reason 加 max length | 防止超长字符串入库 |
| LOW | `auditLogListQuerySchema` entity_type / entity_id 加 max length | 当前接受任意长度 |
| LOW | `PrismaUserRepository` / `PrismaSessionRepository` 的 `as never` 统一 | 历史遗留 |
| LOW | `uploadCertificate` 加 idempotency | 待 multipart 上线时处理 |
| LOW | 前端 permissions 字段未实际使用 | `CurrentUser.permissions` 来自 `/me` 但权限检查基于 `role`，可移除或启用 |

---

## 审查文件清单

### 后端文件（增量审查）

| 文件 | 审查内容 |
|------|----------|
| `src/server/api/routes/customers.routes.ts` | Zod schema, 角色控制, DTO 映射 |
| `src/server/api/routes/orders.routes.ts` | Zod schema, 幂等 key, 角色控制 |
| `src/server/api/routes/delivery-tasks.routes.ts` | Zod schema, 角色控制, body 读取 |
| `src/server/api/routes/catalog.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/routes/inventory.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/routes/audit-logs.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/routes/exports.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/routes/delivery-strategy-rules.routes.ts` | Zod schema, 角色控制 |
| `src/server/api/schemas/*.ts` | 全部 schema 文件 |
| `src/server/api/validate.ts` | ValidationError 映射 |
| `src/server/api/idempotency-key.ts` | header 提取 + 校验 |
| `src/server/api/error-handler.ts` | ApplicationError -> HTTP 映射 |
| `src/server/api/plugins/auth.ts` | requireAuth, requireRole |
| `src/server/api/app.ts` | 路由注册 |
| `src/server/application/documents/document-application.service.ts` | 幂等, 事务边界 |
| `src/server/application/documents/document-application.service.test.ts` | 幂等测试 |
| `src/server/application/shared/idempotency.ts` | request hash |
| `src/server/application/shared/types.ts` | 接口定义 |
| `src/server/application/shared/test-fixtures.ts` | InMemoryIdempotencyRepository |
| `src/server/application/errors.ts` | 错误码映射 |
| `src/server/infrastructure/db/prisma-app-dependencies.ts` | 依赖组合, 事务 runner |
| `src/server/infrastructure/db/prisma-idempotency-repository.ts` | Prisma 幂等实现 |
| `src/server/api/routes-smoke.test.ts` | Smoke 覆盖 |
| `src/server/api/routes-contract.test.ts` | 边界覆盖 |
| `src/server/api/app.test.ts` | 幂等复用测试 |
| `docs/architecture/api-contract.md` | 契约对照 |

### 前端文件（全量审查）

| 文件 | 审查内容 |
|------|----------|
| `src/web/lib/api-client.ts` | fetch 封装, envelope 解包, 错误处理, idempotency |
| `src/web/lib/form-errors.ts` | Zod issue 映射, API error 友好化 |
| `src/web/app/auth.tsx` | AuthProvider, token 存储, session 恢复, login/logout |
| `src/web/app/permissions.ts` | 权限矩阵, canPerform, canAccess |
| `src/web/app/AppShell.tsx` | 侧边栏, 角色过滤, 顶栏 |
| `src/web/app/render-app.tsx` | Router, QueryClient, 路由表, ProtectedShell |
| `src/web/app/LoginPage.tsx` | 登录表单, 错误处理 |
| `src/web/app/pages.tsx` | 占位页 |
| `src/web/features/orders/api/orders.api.ts` | DTO, mapper, command wrappers |
| `src/web/features/orders/order-schema.ts` | Zod 表单校验 |
| `src/web/features/orders/order-presenters.ts` | 状态枚举, tone |
| `src/web/features/orders/OrdersListPage.tsx` | 列表, 筛选, mutations, dialogs |
| `src/web/features/orders/OrderCreatePage.tsx` | 创建表单, Zod 校验 |
| `src/web/features/orders/OrderDetailPage.tsx` | 占位详情 |
| `src/web/features/delivery/api/delivery.api.ts` | DTO, mapper, command wrappers |
| `src/web/features/delivery/delivery-schema.ts` | Zod 表单校验, 条件校验 |
| `src/web/features/delivery/delivery-presenters.ts` | 状态枚举, suggestion 格式化 |
| `src/web/features/delivery/DeliveryTasksPage.tsx` | 列表, 筛选, 4 个 mutation dialogs |
| `src/web/features/delivery/DeliveryTaskDetailPage.tsx` | 占位详情 |
| `src/web/features/inventory/api/inventory.api.ts` | DTO, mapper, availability query |
| `src/web/features/inventory/inventory-schema.ts` | Zod 校验, 跨字段 refine |
| `src/web/features/inventory/InventoryBatchesPage.tsx` | 列表, 筛选, 创建 dialog |
| `src/web/features/inventory/InventoryAvailabilityPage.tsx` | 可售查询 |
| `src/web/features/customers/api/customers.api.ts` | DTO, mapper, create/update |
| `src/web/features/customers/customer-schema.ts` | Zod 校验, transform |
| `src/web/features/customers/customer-presenters.ts` | 状态标签 |
| `src/web/features/customers/customer-form-model.ts` | 表单默认值, 编辑回填 |
| `src/web/features/customers/CustomersPage.tsx` | 列表, 筛选, create/edit dialog |
| `src/web/features/audit/api/audit.api.ts` | DTO, mapper |
| `src/web/features/audit/audit-presenters.ts` | action 标签, value 格式化 |
| `src/web/features/audit/audit-filters.ts` | URL search params 解析 |
| `src/web/features/audit/AuditLogsPage.tsx` | 列表, 筛选 |
| `src/web/components/DataTable.tsx` | 泛型表格, 分页, loading/empty |
| `src/web/components/Dialog.tsx` | 模态对话框 |
| `src/web/components/ui-components.test.tsx` | 组件测试 |
| `src/web/components/*.tsx` | 全部 16 个通用组件 |
| `src/web/**/*.test.{ts,tsx}` | 全部 24 个前端测试文件 |
| `e2e/web/*.spec.ts` | 全部 5 个 E2E 测试文件 |
| `e2e/web/helpers.ts` | E2E 辅助函数 |
| `e2e/sales-to-delivery.spec.ts` | 应用层集成测试 |
