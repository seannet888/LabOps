# 实验动物销售管理系统 — 代码审查标准

> 版本: v1.0
> 状态: 正式执行
> 依据: [AGENTS.md](../../AGENTS.md)、[framework.md](../architecture/framework.md)、[api-contract.md](../architecture/api-contract.md)、[backend-blueprint.md](../architecture/backend-blueprint.md)、[persistence-migration-policy.md](../architecture/persistence-migration-policy.md)
> 范围: 审查优先级定义、项目专属检查项、分层审查规则、严重等级判定

---

## 1. 审查目标

代码审查不是找茬，而是团队质量的集体免疫系统。本标准服务于三个目标：

1. **守住红线** — 安全漏洞、数据损坏、API 契约破裂必须合并前拦截。
2. **对齐约定** — 架构分层、模块边界、命名规范保持一致，降低理解成本。
3. **促进成长** — 每条审查意见都应解释 "为什么"，让提交者学到东西。

---

## 2. 严重等级定义

所有审查意见必须标注严重等级。等级决定是否阻塞合并。

| 等级 | 标记 | 含义 | 合并影响 |
| --- | --- | --- | --- |
| 🔴 Blocker | 必须修复 | 安全漏洞、数据损坏风险、API 契约破裂、竞态条件、关键路径缺错误处理 | 阻塞合并，必须修复 |
| 🟡 Suggestion | 建议修复 | 输入校验缺失、命名不清、重要路径缺测试、N+1 查询、重复代码应抽取 | 建议修复，可与作者协商降级 |
| 💭 Nit | 锦上添花 | 风格微调、命名小改、文档补充、备选方案探讨 | 不阻塞，作者自行决定 |

### 2.1 标注格式

```
🔴 **[类别]: 简述问题**
行号 / 文件: 具体位置

**原因:** 为什么这是一个问题，会导致什么后果。

**建议:** 具体的修改方案或代码示例。
```

### 2.2 类别标签

| 类别 | 适用场景 |
| --- | --- |
| `Security` | 认证绕过、注入、越权、敏感信息泄漏 |
| `Correctness` | 逻辑错误、状态机违反、边界条件遗漏 |
| `Contract` | API 响应格式、错误码、字段命名违反 api-contract.md |
| `Architecture` | 分层越界、模块职责混淆、依赖方向错误 |
| `Performance` | N+1 查询、不必要的大对象拷贝、循环内重复 IO |
| `Test` | 缺少行为测试、测试耦合实现细节、覆盖盲区 |
| `Maintainability` | 命名不清、重复代码、复杂度过高、缺少注释 |
| `Migration` | Prisma schema 变更不符合迁移策略 |

---

## 3. 🔴 Blocker 检查清单（必须修复才能合并）

### 3.1 安全

| # | 检查项 | 说明 |
| --- | --- | --- |
| S1 | 认证检查 | 所有非 `POST /auth/login` 的路由必须有 `requireAuth` preHandler |
| S2 | 角色授权 | 写操作必须有 `requireRole` 限制，不能依赖前端隐藏按钮 |
| S3 | 权限矩阵 | 销售不能确认出库/送达；后勤不能改价/改订单明细。对照 [framework.md §8](../architecture/framework.md) 权限矩阵 |
| S4 | 注入防护 | 不得拼接用户输入到 Prisma raw query 或 SQL 字符串中 |
| S5 | 敏感信息 | 错误响应不得泄漏堆栈、SQL、内部路径；密码不得出现在日志或响应中 |
| S6 | 幂等键 | 所有副作用命令端点必须要求 `Idempotency-Key`，缺失返回 `422 validation_error` |

### 3.2 正确性

| # | 检查项 | 说明 |
| --- | --- | --- |
| C1 | 状态机 | 订单/配送任务状态转换必须通过 `canTransitionOrderStatus` 等域策略函数，不能直接赋值 |
| C2 | 事务边界 | 跨表多写操作必须通过 `TransactionRunner` 包裹，不能分步独立提交 |
| C3 | 库存一致性 | 预占、释放、出库 finalize 必须通过 `reservation_allocations` 与 `reserved_qty` 在同一事务中维护；出库扣减必须确认实际批次并写入 `stock_deductions` |
| C4 | 错误处理 | Application service 的可预期失败必须抛出 `ApplicationError`，不能静默吞掉 |
| C5 | 空值安全 | 使用 `request.user!.id` 等非空断言前，必须确认 preHandler 已保证非空 |

### 3.3 API 契约

| # | 检查项 | 说明 |
| --- | --- | --- |
| A1 | 响应格式 | 成功必须用 `{ data }` 或 `{ data, meta, links }` envelope |
| A2 | 错误格式 | 错误必须用 `{ error: { code, message, details?, request_id } }` 格式 |
| A3 | 字段命名 | JSON 字段必须 `snake_case`，TypeScript 内部用 `camelCase`，路由层做映射 |
| A4 | 金额格式 | 金额字段必须用 decimal string（如 `"28.00"`），不能用 number |
| A5 | HTTP 状态码 | 对照 [api-contract.md §3.2](../architecture/api-contract.md) 状态码表，不得自创 |
| A6 | 路由前缀 | 所有路由必须以 `/api/v1` 开头 |

### 3.4 数据完整性

| # | 检查项 | 说明 |
| --- | --- | --- |
| D1 | 软删除 | 业务历史数据不得物理删除，使用软删除或停用标记 |
| D2 | 审计字段 | 改价、取消、出库扣减、票证放行等高风险操作必须写入审计日志 |
| D3 | 迁移安全 | 已部署 migration 不可编辑；schema 变更必须新增 forward migration |
| D4 | Prisma 隔离 | Application/Domain 层不得 import `@prisma/client`；Prisma entity 不得泄漏到 API 响应 |

---

## 4. 🟡 Suggestion 检查清单（建议修复）

### 4.1 输入校验

| # | 检查项 | 说明 |
| --- | --- | --- |
| V1 | Zod schema | 请求体和 query 参数必须用 Zod schema 校验，不能直接 `as` 断言 |
| V2 | 分页边界 | `per_page` 不超过 100，`page` 不小于 1 |
| V3 | 枚举校验 | status、gender 等枚举字段必须用 Zod enum 限制 |
| V4 | 排序白名单 | sort 参数只允许白名单字段，不能接受任意字段排序 |

> **注意:** 当前代码中 `cancel`、`settle`、`archive-documents` 等端点使用 `request.body as {...}` 直接断言而非 Zod 校验。这属于 🟡 建议项，应逐步补齐 Zod schema。

### 4.2 测试

| # | 检查项 | 说明 |
| --- | --- | --- |
| T1 | 行为测试 | 优先通过 public interface 测行为，不测私有实现细节 |
| T2 | TDD 节奏 | 每个行为变更应遵循 Red-Green-Refactor，不批量写 RED |
| T3 | 边界用例 | 空数组、零值、null、超长字符串、并发重复提交需覆盖 |
| T4 | 状态机覆盖 | 订单/配送任务状态转换的正向路径和非法路径都需测试 |
| T5 | 覆盖率 | 全局覆盖率目标 80%+，新增代码不得降低整体覆盖率 |

### 4.3 性能

| # | 检查项 | 说明 |
| --- | --- | --- |
| P1 | N+1 查询 | 列表接口不得在循环内逐条查关联数据，应使用 `include` 或批量查询 |
| P2 | 大对象拷贝 | 避免在热路径中对大数组做不必要的 `.map().filter().map()` 链 |
| P3 | 查询字段 | Prisma 查询应使用 `select` 限定字段，避免 `SELECT *` 拉全表 |
| P4 | 索引感知 | 新增 query filter 时确认对应字段有数据库索引 |

### 4.4 可维护性

| # | 检查项 | 说明 |
| --- | --- | --- |
| M1 | 命名表意 | 变量/函数名应表达意图，`data`、`tmp`、`handle` 等模糊命名需改进 |
| M2 | 函数长度 | 单函数超过 50 行需考虑拆分；圈复杂度过高需重构 |
| M3 | 重复代码 | 3 处以上相同逻辑应抽取为共享函数 |
| M4 | DTO 映射 | 路由层必须显式映射 DTO，不能直接返回 ORM entity |
| M5 | 类型完整 | 避免滥用 `any`；必须用时加注释说明原因 |

---

## 5. 💭 Nit 检查清单（锦上添花）

| # | 检查项 | 说明 |
| --- | --- | --- |
| N1 | 风格一致 | 缩进、引号、分号等由 ESLint 管控，审查中不重复提 |
| N2 | 注释时机 | 复杂业务规则加注释；显而易见的代码不加冗余注释 |
| N3 | 文档同步 | 新增/修改 API 时提醒更新 api-contract.md |
| N4 | 备选方案 | 可提出更优实现思路，但标注为探讨而非要求 |

---

## 6. 项目专属审查规则

### 6.1 分层依赖方向

依赖只能向下流动，不得反向引用：

```
api  ──→  application  ──→  domain
 │           │
 └───────────┴──→  shared
                                    ←──  infrastructure (实现 application 接口)
```

| 规则 | 检查 |
| --- | --- |
| Domain 层纯净 | `src/server/domain/` 不得 import HTTP、Prisma、文件系统或时间副作用 |
| Application 层不碰 Prisma | `src/server/application/` 不得 import `@prisma/client` |
| API 层薄 | `src/server/api/` 只做认证、权限、输入校验、调用 service、响应映射，不含业务逻辑 |
| Infrastructure 适配 | `src/server/infrastructure/db/` 实现 application 定义的接口，Prisma entity 不外泄 |

### 6.2 模块边界

| 规则 | 检查 |
| --- | --- |
| 销售域不越界 | 订单代码不得写车辆、司机、路线备注；不得直接扣减具体库存批次 |
| 配送域不越界 | 配送代码不得修改客户档案、订单价格、订单明细、结算方式、发票类型 |
| 库存域不越界 | 库存代码不决定订单状态，只根据命令执行预占、释放、finalize 和实际扣减记录 |
| 策略提示域不越界 | 配送策略提示不改订单总价、不生成优惠、不参与发票对账 |
| 跨域写入 | 任何跨域写入必须能在 api-contract.md 中找到对应命令 |

### 6.3 Prisma 与迁移

| 规则 | 检查 |
| --- | --- |
| Schema 是唯一 DDL owner | 所有表结构变更必须通过 Prisma migration |
| 禁止 migrate dev 上生产 | 生产/共享环境只用 `migrate deploy` |
| Forward-only | 已部署 migration 不可编辑，修复必须新增 forward migration |
| Schema 与 data 分离 | 结构 migration 和 data backfill 分开提交 |
| 禁止手工 ALTER | 不得手工执行生产库 `ALTER TABLE` |

### 6.4 金额处理

| 规则 | 检查 |
| --- | --- |
| Decimal string | JSON 中金额必须是字符串，如 `"28.00"` |
| 不用浮点 | TypeScript 中金额计算不得用 `number`，应使用字符串或 Decimal 库 |
| 精度一致 | 价格、总额保留两位小数 |

---

## 7. 审查评论示例

### 示例 1: 🔴 Blocker — 权限矩阵违反

```
🔴 **[Architecture]: 后勤越权改价**
src/server/api/routes/orders.routes.ts:101

**原因:** change-prices 端点的 requireRole 包含了 "logistics"，
但 framework.md §8 权限矩阵明确规定后勤不能修改订单价格。
这会导致后勤角色可以绕过业务边界修改成交价。

**建议:** 移除 "logistics"，只保留 requireRole("sales", "manager")。
```

### 示例 2: 🔴 Blocker — 幂等键缺失

```
🔴 **[Contract]: 副作用命令缺少 Idempotency-Key 校验**
src/server/api/routes/orders.routes.ts:117 (cancel 端点)

**原因:** cancelOrder 是副作用命令，但未通过 idempotencyKeyOf(request)
传入幂等键。api-contract.md §16.5 要求确认/取消/改价/出库/送达/结算
都必须支持幂等。缺失会导致用户重复点击造成多次取消或状态混乱。

**建议:** 在 cancelOrder 调用中加入 idempotencyKey: idempotencyKeyOf(request)，
并确保 application 层的幂等仓库正确存储和校验。
```

### 示例 3: 🟡 Suggestion — 输入未校验

```
🟡 **[Correctness]: 请求体未用 Zod 校验**
src/server/api/routes/orders.routes.ts:122

**原因:** cancel 端点使用 request.body as { reason?: string } 直接断言，
未通过 validateBody + Zod schema 校验。如果客户端传入非对象（如数组或字符串），
as 断言不会报错但运行时访问 .reason 会得到 undefined，行为不明确。

**建议:** 创建 cancelOrderSchema，使用 validateBody(cancelOrderSchema, request.body)。
至少校验 reason 是 string 且 max length 限制。
```

### 示例 4: 🟡 Suggestion — N+1 查询

```
🟡 **[Performance]: 列表接口存在 N+1 查询**
src/server/application/orders/order-application.service.ts:45

**原因:** listOrders 先查订单列表，再在 map 中逐条查客户名称，
导致 20 条订单产生 21 次 DB 查询。数据量增大时性能线性下降。

**建议:** 在 Prisma 查询中使用 include: { customer: { select: { name: true } } }
一次性带出客户名称，或在查完订单后批量查 customerId IN (...) 再组装。
```

### 示例 5: 💭 Nit — 命名建议

```
💭 **[Maintainability]: 变量名过于模糊**
src/server/application/orders/order-application.service.ts:78

**原因:** 变量名 `d` 无法表达其含义，6个月后维护者需要回溯上下文才能理解。

**建议:** 改为 `deliveryTask` 或 `pendingTask`，让意图自解释。
```

### 示例 6: 正面反馈

```
✅ **好的实践: 状态机集中管理**
src/server/domain/order-status.ts

这里的订单状态转换用 ReadonlySet + 函数封装，所有合法转换集中可查，
非法转换在域层即被拒绝。这是很干净的域模型设计，保持这个模式。
```

---

## 8. 审查禁忌

审查者**不应**做以下事情：

| 禁忌 | 说明 |
| --- | --- |
| 🚫 只批评不解释 | "这样不对" 不如 "这样会导致 X，因为 Y" |
| 🚫 争论风格 | 缩进、引号、分号由 ESLint 管控，不要在审查中争论 |
| 🚫 拖延反馈 | 审查意见应在 SLA 内给出，不要让 PR 挂着没人看 |
| 🚫 钻牛角尖 | 💭 Nit 最多提 2-3 条，不要淹没重点 |
| 🚫 无视正面 | 看到好的设计要明确表扬，审查不是只找问题的 |
| 🚫 改写代码 | 审查者提出建议，不要直接替作者重写整段代码 |
| 🚫 情绪化 | 对事不对人，聚焦代码质量和业务影响 |

---

## 9. 快速自查矩阵

提交 PR 前，作者应先用以下矩阵自查，减少审查往返：

```
□ 所有新路由都有 requireAuth + requireRole？
□ 副作用命令端点都传了 Idempotency-Key？
□ JSON 响应用了 { data } envelope，字段是 snake_case？
□ 金额用了 decimal string？
□ Application 层没有 import @prisma/client？
□ Domain 层没有 import HTTP / Prisma / 文件系统？
□ 路由层映射了 DTO，没直接返回 ORM entity？
□ 新增/修改的状态转换走了域策略函数？
□ 跨表多写用了 TransactionRunner？
□ Zod schema 覆盖了请求体和 query 参数？
□ 新行为有对应的测试？测试跑过了？
□ npm run typecheck && npm run lint 通过了？
□ Prisma schema 变更生成了 migration？
□ 高风险操作（改价/取消/出库）写了审计日志？
```

---

## 10. 与现有文档的关系

| 本标准章节 | 关联文档 |
| --- | --- |
| §3 安全 | [framework.md §2 角色边界](../architecture/framework.md)、[api-contract.md §6 Auth](../architecture/api-contract.md) |
| §3 API 契约 | [api-contract.md](../architecture/api-contract.md) 全文 |
| §6.1 分层依赖 | [AGENTS.md §3 模块边界](../../AGENTS.md)、[backend-blueprint.md](../architecture/backend-blueprint.md) |
| §6.2 模块边界 | [AGENTS.md §5 业务边界规则](../../AGENTS.md)、[api-contract.md §17](../architecture/api-contract.md) |
| §6.3 Prisma | [persistence-migration-policy.md](../architecture/persistence-migration-policy.md) |
| §4.2 测试 | [tdd-scaffold-plan.md](../architecture/tdd-scaffold-plan.md)、[.agents/rules/tdd-red-green-refactor.md](../../.agents/rules/tdd-red-green-refactor.md) |
