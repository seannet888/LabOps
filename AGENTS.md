# AGENTS.md - 实验动物销售管理系统

本项目是实验动物销售管理系统的 MVP 工作区。后续 agent 进入本项目时，必须先阅读本文件，再阅读相关项目文档。

## 1. 当前项目状态

当前阶段：MVP 后端脚手架已闭环，前端 `src/web/` 第一批脚手架、库存、订单、Delivery、Customer、Audit 纵向切片与相关前端收紧已完成。

已完成：
- Fastify + TypeScript + Prisma 后端骨架。
- Auth/session，不透明 session token，`Authorization: Bearer <token>`。
- Domain policies、application services、HTTP routes、Prisma schema/migrations、Prisma repositories。
- `TransactionRunner` 事务 seam，核心多写 command 已接入事务。
- Audit logs 查询、delivery suggestions、orders XLSX export。
- `delivery_strategy_rules` Prisma model/migration 与规则管理 endpoints：
  - `GET /api/v1/delivery-strategy-rules`
  - `POST /api/v1/delivery-strategy-rules`
  - `PATCH /api/v1/delivery-strategy-rules/{rule_id}`
- 上线前 hardening 第一批：
  - `POST /api/v1/inventory-batches` 已接入严格 Zod 校验、`entry_date >= birth_date` 交叉校验和 `Idempotency-Key`。
  - 剩余高风险 route 输入边界已收紧：客户、订单 command、配送标记、目录、库存可售、审计日志和导出查询均通过 Zod `validateBody` / `validateQuery`。
  - 统一交付前审查发现的 3 个 HIGH contract 缺口已修复：配送任务按日期/区域筛选、确认送达读取 `delivered_at/note`、确认订单读取 `confirm_note`。
  - 客户列表已回读 `notes`，客户编辑不再显示空备注。
  - AuditLog 写入接口已支持 `newValue`，确认订单/确认送达附加信息会进入审计 payload。
  - `POST /api/v1/orders/{id}/invoice-registration` 已要求 `Idempotency-Key`，并在 `DocumentApplicationService` 内通过幂等仓库复用同 payload 结果、拒绝同 key 不同 payload。
  - 关键审计已补齐：`confirm_order`、`confirm_delivery`、`flag_sales_action`（含 `reason`）。
  - 非测试环境启用 Fastify logger，非 `ApplicationError` 的 500 会记录 `request.log.error({ err, requestId }, "unhandled error")`。
  - 订单号使用 `XS${YYYYMMDD}${8位hex}`，唯一约束冲突服务端最多重试 3 次。
  - 库存预占引入 `reservation_allocations`，可售量统一为 `initial_qty - reserved_qty - stock_deduction_sum`。
- 本地 dev PostgreSQL smoke 已覆盖登录、建单、配送提示、确认订单、安排配送、出库、送达、归档、结算、审计查询、XLSX 导出。
- 前端第一批脚手架：
  - Vite + React + TypeScript SPA 位于 `src/web/`。
  - 已接入 React Router、TanStack Query、Testing Library/Vitest、Playwright 配置、Lucide React。
  - 已实现统一 API client、`commandRequest` 幂等 helper、AuthProvider、登录页、`/me` session restore、受保护 route、LabOps Compact Console AppShell。
  - 已实现核心组件基线：Button、IconButton、Input、Select、Textarea、DateField、FormField、DataTable、Dialog、Drawer、StatusBadge、MoneyText、QuantityText、ErrorState、EmptyState、Toast。
  - 已预留路由入口：客户、库存、订单、配送、审计、策略、导出。
- 前端库存纵向切片与共享边界收紧：
  - `/inventory/batches` 已实现库存批次列表、筛选、分页、入库 dialog、角色可见性、标准错误展示和成功 toast。
  - `/inventory/availability` 已实现可售查询，并只展示后端返回的库存事实。
  - `src/web/lib/api-client.ts` 统一处理 resource/list envelope、分页 meta、query string 和 command idempotency key。
  - `src/web/app/permissions.ts` 已提供 `canPerform()` action permission map。
  - `src/web/lib/form-errors.ts` 已提供 `formatApiError()` 和 `zodIssuesToFieldErrors()`。
- 前端订单纵向切片与收紧：
  - `/orders` 已实现订单列表、筛选、分页、状态标签、金额展示和行操作。
  - `/orders/new` 已实现创建订单表单，并通过 mapper 输出 `snake_case` command DTO。
  - `/orders/:orderId` 已实现轻量详情入口，避免误导为完整明细页。
  - 订单确认、改价、取消、结算 dialog 已接入 `commandRequest()`、标准错误展示、成功 toast 和精准 query invalidation。
  - `order-schema.ts` 与 `order-presenters.ts` 已沉淀订单表单校验和展示逻辑，组件不直接处理后端 DTO。
- 前端 Delivery 纵向切片与收紧：
  - `/delivery-tasks` 已实现配送任务列表、筛选、分页、状态标签、行操作和角色可见性。
  - `/delivery-tasks/:taskId` 已实现轻量详情入口，避免误导为完整配送明细页。
  - 安排配送、确认出库、确认送达、标记需销售处理 dialog 已接入 `commandRequest()`、标准错误展示、成功 toast 和精准 query invalidation。
  - 批次建议仅作为可编辑建议展示；确认出库提交的是用户确认的 `stock_deductions`。
  - `delivery-schema.ts` 与 `delivery-presenters.ts` 已沉淀配送表单校验和展示逻辑，组件不直接处理后端 DTO。
- 前端 Customer 纵向切片与收紧：
  - `/customers` 已实现客户列表、筛选、分页、状态标签、销售/管理员创建与编辑、后勤只读。
  - 客户创建/编辑已接入 `commandRequest()`、标准错误展示、成功 toast 和精准 query invalidation。
  - `customers.api.ts` 集中处理客户 DTO mapper、query 序列化和 command DTO。
  - `customer-schema.ts` 与 `customer-presenters.ts` 已沉淀客户表单校验和展示逻辑，组件不直接处理后端 DTO。
  - `customer-form-model.ts` 已集中处理 create/edit form 默认值、编辑回填和保存成功文案，页面不再内联表单模型转换。
- 前端 Audit 纵向切片与收紧：
  - `/audit-logs` 已实现管理员只读审计列表、筛选、分页和标准错误展示。
  - 销售/后勤不显示审计导航；直接访问时仍展示后端 `403` 标准错误。
  - `audit.api.ts` 集中处理审计 DTO mapper 和 query 序列化。
  - `audit-filters.ts` 已集中处理 URL query 到审计筛选模型的解析与序列化。
  - `audit-presenters.ts` 已沉淀审计动作文案和 JSON 值摘要展示，长 JSON 摘要会截断，避免撑开表格。
- 前端 E2E 与收口：
  - `api:dev` 已提供本地 Fastify + Prisma dev server，`web:e2e` 使用 Playwright 启动 API 与 Vite。
  - `e2e:web:prepare` 会启动本地 Docker PostgreSQL、部署 migration、reset 本地 dev DB 并 mock seed；禁止用于真实/共享数据库。
  - `e2e/web` 已覆盖 auth、role visibility、标准错误展示、客户/入库/订单/配送/结算/审计核心 smoke。
  - 弹窗和 drawer 已加 `max-height` 与内部滚动，避免表单按钮在默认视口外不可操作。

当前重点：
- 前端下一步按产品优先级进入策略、导出等 deferred surfaces，或补齐订单票证归档 UI、订单创建客户选择器。
- 前端编码前必须先读 `frontend-blueprint.md`、`frontend-api-integration.md`、`frontend-tdd-plan.md` 与 `.agents/agents/frontend-agent.md`。
- 后端继续 harden 剩余 route-level validation、permission matrix、幂等覆盖和 Prisma query quality。
- 本轮已知剩余编码债务包括：少量中低优先级审计、金额精度评估和 Prisma 组合层类型逃逸清理。
- 真实外部 PostgreSQL 尚未提供时，不伪造真实环境验证；本地 dev DB 可使用 mock/seed 数据。
- `npm audit` 当前只有 `exceljs -> uuid` moderate 风险，无 HIGH/CRITICAL；见 ADR-0008。

## 2. 必读顺序

开始任何架构、接口、数据模型或脚手架工作前，按顺序阅读：

1. `docs/domain/CONTEXT.md`
2. `docs/product/prd.md`
3. `docs/architecture/framework.md`
4. `docs/architecture/api-contract.md`
5. `docs/adr/README.md` 及相关 ADR
6. 需要后端实现时读 `docs/architecture/backend-blueprint.md`
7. 需要 schema/migration 时读 `docs/architecture/persistence-migration-policy.md`
8. 准备写代码前读 `docs/architecture/tdd-scaffold-plan.md`
9. 准备写前端前读 `docs/architecture/frontend-blueprint.md`
10. 准备接 API 前读 `docs/architecture/frontend-api-integration.md`
11. 准备写前端测试前读 `docs/architecture/frontend-tdd-plan.md`

## 3. 模块边界

- `src/server/domain/`：纯业务规则，不依赖 HTTP、Prisma、文件系统或时间副作用。
- `src/server/application/`：编排用例、事务、领域策略、审计、幂等；不 import `@prisma/client`。
- `src/server/api/`：Fastify route adapter，只做认证、权限、输入校验、调用 application service、响应映射。
- `src/server/infrastructure/db/`：Prisma adapter 与生产依赖组合；Prisma entity 不泄漏到 application/domain/API。
- `src/web/`：前端 SPA 工作区；React components 不直接调用 `fetch`，不直接散落后端 `snake_case` DTO。
- `docs/`：正式项目文档。
- `tmp/inputs/`：原始材料和临时输入，不作为最终规范。

## 4. API 规则

遵守 `docs/architecture/api-contract.md`：

- 所有接口使用 `/api/v1`。
- JSON 字段使用 `snake_case`。
- 成功响应使用 `{ data }` envelope。
- 列表响应使用 `{ data, meta, links }`。
- 错误响应使用 `{ error: { code, message, details?, request_id } }`。
- 副作用 command 必须要求 `Idempotency-Key`；缺失返回 `422 validation_error`。
- 同 key 同 payload 返回已保存结果；同 key 不同 payload 返回 `409 conflict`。
- 金额字段用 decimal string。
- 不返回原始 ORM entity，必须映射 DTO。

前端额外规则：

- API client 统一处理 `{ data }`、`{ data, meta, links }`、`{ error }` envelope。
- 列表分页 meta 在 `api-client` 内统一映射为 `{ page, perPage, total, totalPages }`。
- URL query string 统一使用 `buildQueryString()`，跳过 `undefined` 和空字符串，保留后端要求的 `snake_case` key。
- API 字段是 `snake_case`；前端内部可用 `camelCase`，但必须通过集中 mapper 转换。
- 所有副作用 command 必须通过 `commandRequest()` 生成并发送 `Idempotency-Key`；需要重试同 payload 时允许传入固定 `idempotencyKey` 复用。
- decimal string 不转 JS number 做金额计算。
- 标准错误统一通过 `formatApiError()` 展示 message、code/status 和 `request_id`。
- 表单 Zod issue 统一通过 `zodIssuesToFieldErrors()` 转换为字段错误。
- action 可见性统一通过 `canPerform()`，不要在页面中散落 `role === ...` 判断。
- 权限隐藏只是 UX，后端 `403` 仍必须正确展示。
- 出库 `stock_deductions` 是用户确认的真实批次，不得把建议自动当成扣减事实。

## 5. 业务边界规则

销售与后勤分离：
- 销售负责客户档案、订单、改价、票证归档、结算标记。
- 后勤负责配送任务、车辆司机、配送批次、出库、送达、需销售处理标记。
- 后勤不能修改客户档案、订单价格、订单明细、结算方式、发票类型。
- 销售不能确认出库或送达。

库存：
- `initial_qty` 是入库原始数量，出库后不递减。
- `reserved_qty` 是当前预占数量，订单确认时递增，取消订单或确认出库成功后递减。
- `stock_deductions` 是真实出库扣减事实。
- 可售量统一计算为 `initial_qty - reserved_qty - stock_deduction_sum`。
- `reservation_allocations` 只用于精确释放/清理预占，不代表实际出库批次；真实出库批次只看 `stock_deductions`。

配送策略提示：
- 只做 `suggestion_only` 销售提示。
- 不改变订单总价，不生成优惠，不参与发票或对账金额。

前端 UI：
- 风格为 **LabOps Compact Console**：Data-Dense Dashboard + Swiss Modernism 2.0。
- 左侧导航：客户、库存、订单、配送、审计、策略、导出。
- 顶部：当前用户、角色、退出。
- 主区：列表 + 筛选条 + 操作按钮，详情优先用右侧 drawer，命令操作优先用 modal/dialog。
- 表格优先支持筛选、分页、状态标签、行操作。
- 不做营销风 hero，不堆装饰卡片，不使用 emoji 作为结构性图标。

## 6. Prisma 与 Migration 规则

遵守 `docs/architecture/persistence-migration-policy.md`：

- Prisma schema 是唯一 DDL owner。
- 所有 schema 变化必须进入 Prisma migration。
- 生产/共享环境禁止 `migrate dev`，使用 `migrate deploy`。
- 已部署 migration 不可编辑，修复必须新增 forward migration。
- schema migration 与 data backfill 分开。
- 禁止手工生产库 `ALTER TABLE`。

## 7. TDD 规则

必须使用红绿灯节奏：

1. RED：先写一个行为测试，确认因目标缺口失败。
2. GREEN：写最小实现让目标测试通过。
3. REFACTOR：在全绿后整理重复和边界。

要求：
- 不批量写一堆 RED。
- 优先通过 public interface 测行为。
- 每个编码切片记录目标、RED 失败原因、GREEN 修复、验证命令。
- 每次测试、类型、lint、Prisma、DB、工具问题后，记录原因、修复方式、如何避免复发。
- 全局覆盖率目标 80%+。

## 8. 本地验证命令

常用命令：

```bash
npm test
npm run test:coverage
npm run typecheck
npm run lint
npm run prisma:validate
npm run prisma:generate
npx prisma migrate status
```

前端脚手架建立后应补充并使用：

```bash
npm run web:test
npm run web:build
npm run web:e2e
```

本地 dev DB 可使用 mock data。真实 PostgreSQL 未提供时，只标记环境阻塞，不伪造结果。

最新验证快照（2026-06-26）：

- `npm test`: 73 files, 338 tests passed。
- `npm run test:coverage`: passed；statements 89.45%，lines 90.23%。
- `npm run web:test`: 24 files, 78 tests passed。
- `npm run e2e:web:prepare`: passed against local dev DB; resets mock data。
- `npm run web:e2e`: 8 tests passed on Chromium。
- `npm run web:build`: passed。
- `npm run typecheck`: passed。
- `npm run lint`: passed。
- `npm run prisma:validate`: passed。
- `npm run prisma:migrate:deploy`: no pending migrations in local dev DB。
- `npm run db:seed:mock`: passed。
- `npm audit --audit-level=moderate`: only known `exceljs -> uuid` moderate vulnerabilities; no HIGH/CRITICAL。
- Prisma smoke: Docker dev PostgreSQL + mock seed 后通过。

## 9. 模块 Agent 规则

正式编码前，主 agent 必须读取：

1. `.agents/rules/main-agent-operating-rule.md`
2. `.agents/rules/tdd-red-green-refactor.md`
3. `.agents/rules/issue-cause-memory.md`

按变更模块读取对应分 agent：

- Domain policy: `.agents/agents/domain-policy-agent.md`
- API routes: `.agents/agents/api-route-agent.md`
- API schemas: `.agents/agents/schema-validation-agent.md`
- Auth/session: `.agents/agents/auth-agent.md`
- Orders: `.agents/agents/orders-agent.md`
- Delivery: `.agents/agents/delivery-agent.md`
- Inventory: `.agents/agents/inventory-agent.md`
- Customers: `.agents/agents/customers-agent.md`
- Catalog/pricing: `.agents/agents/catalog-agent.md`
- Documents: `.agents/agents/documents-agent.md`
- Prisma/infrastructure: `.agents/agents/prisma-infrastructure-agent.md`
- Shared testing/interfaces: `.agents/agents/shared-testing-agent.md`
- Docs/architecture: `.agents/agents/docs-architecture-agent.md`
- Frontend SPA/UI: `.agents/agents/frontend-agent.md`

## 10. 当前不做

除非用户明确要求，否则不要做：

- 改变 LabOps Compact Console 的 UI 方向。
- 引入重型 admin framework、Next.js 或批量生成 shadcn/ui。
- 在组件中直接散落后端 `snake_case` DTO 或直接调用 `fetch`。
- 将配送建议自动当成出库事实提交。
- 删除 `tmp/inputs/` 中的原始材料。
- 修改 `.git`、`.claude`、`.agents` 配置。
- 手工修改生产/共享数据库结构。
- 为 moderate audit 告警强行执行 breaking downgrade。
