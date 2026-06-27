# 实验动物销售管理系统 — Persistence 与 Migration Policy

> 版本: v0.1  
> 状态: MVP 持久化边界草案  
> 依据: [data-model.md](./data-model.md)、[backend-blueprint.md](./backend-blueprint.md)、[api-contract.md](./api-contract.md)  
> 范围: Prisma schema ownership、migration workflow、DDL owner、索引与事务边界

---

## 1. 核心决策

Prisma schema 是 MVP 的唯一 DDL owner。

含义：

- 所有业务表、索引、枚举、关系都从 Prisma schema 和 Prisma migration 演进。
- 不允许 API route、service、pipeline、脚本在运行时创建或修改业务表结构。
- 手写 SQL 只允许作为 Prisma migration 文件的一部分存在。
- 任何 schema 变化必须进入 migration，不做手工生产库改表。

---

## 2. 迁移工作流

### 2.1 本地开发

```text
1. 修改 prisma/schema.prisma
2. npx prisma migrate dev --name <change-name>
3. npx prisma generate
4. 运行 schema validation / contract tests
```

限制：

- `migrate dev` 仅限本地个人开发库。
- 若提示 reset，必须先确认数据库是否可丢弃。

### 2.2 CI / staging / production

```text
npx prisma migrate deploy
npx prisma generate
```

限制：

- 共享环境和生产环境禁止 `migrate dev`。
- 已部署 migration 文件不可编辑。
- 修复已部署 migration 必须创建新的 forward migration。

---

## 3. DDL Owner 边界

| 组件 | 能否改 schema | 说明 |
| --- | --- | --- |
| Prisma schema | 是 | 唯一 DDL 源头 |
| Prisma migration | 是 | 唯一 schema 变更执行载体 |
| Application service | 否 | 只能读写已有表 |
| Repository | 否 | 只能封装查询和写入 |
| API route | 否 | 不接触 DDL |
| Pipeline / import script | 否 | 只能通过既有 API/service 或受控 seed/import 写数据 |
| Manual SQL console | 否 | 生产禁止手改；本地实验不作为正式状态 |

---

## 4. Schema 设计规则

### 4.1 ID 策略

MVP 推荐：

- 业务公开 ID 使用 string ID，例如 `cuid()`。
- 审计日志、内部流水可用自增或 bigint。
- 不在 URL 中暴露自增序列作为业务唯一标识，除非确认无信息泄露风险。

### 4.2 时间字段

每张业务表建议包含：

```text
created_at
updated_at
```

Prisma 注意：

- `@updatedAt` 不会在 `updateMany` 自动更新。
- 若使用 bulk update，必须手动写 `updated_at = now()`。

### 4.3 软删除/停用

基础资料优先使用停用字段：

```text
is_active
```

原因：

- 品系、客户、价格规则可能被历史订单引用。
- 不应物理删除历史业务依赖。

### 4.4 DTO 映射

禁止直接把 Prisma entity 原样返回 API。

必须映射为 response DTO：

- 避免泄露 `password_hash`、内部备注、删除字段。
- 保持 API contract 稳定。
- 支持后续 schema 调整而不破坏前端。

---

## 5. 推荐模型补充

`data-model.md` 已有基础模型，需按框架补充：

- `users.role` 增加 `logistics`
- `customers.geo_area`
- `customers.primary_sales_rep_id`，仅责任记录，不做可见性隔离
- `delivery_tasks`
- `reservation_allocations`
- `stock_deductions`
- `delivery_strategy_rules`
- `document_release_reasons`
- `idempotency_keys`

### 5.1 idempotency_keys

用于副作用命令防重复提交。

建议字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 主键 |
| `actor_id` | 操作人 |
| `endpoint` | endpoint path 或 command name |
| `idempotency_key` | header key |
| `request_hash` | 请求体 hash |
| `response_snapshot` | 首次成功响应摘要 |
| `created_at` | 创建时间 |
| `expires_at` | 过期时间 |

唯一约束：

```text
(actor_id, endpoint, idempotency_key)
```

---

## 6. 索引策略

### 6.1 必备索引

| 表 | 索引 |
| --- | --- |
| `customers` | `geo_area`, `name`, `is_active` |
| `customer_addresses` | `customer_id`, `address_type` |
| `strains` | `species_id`, `(species_id, name)` unique |
| `price_rules` | `(strain_id, age_weeks, effective_from)` |
| `inventory_batches` | `(strain_id, gender, birth_date)`, `is_active` if present |
| `reservation_allocations` | `(order_item_id, inventory_batch_id)` unique, `inventory_batch_id` |
| `orders` | `order_number` unique, `customer_id`, `status`, `created_at`, `sales_rep_id` |
| `order_items` | `order_id`, `(strain_id, age_weeks, gender)` |
| `delivery_tasks` | `order_id` unique in MVP, `status`, `planned_delivery_date`, `delivery_batch` |
| `stock_deductions` | `delivery_task_id`, `order_item_id`, `inventory_batch_id` |
| `audit_logs` | `(entity_type, entity_id)`, `created_at`, `actor_id` |
| `idempotency_keys` | `(actor_id, endpoint, idempotency_key)` unique |

### 6.2 索引变更规则

- 新建表时可 inline 创建索引。
- 已有大表新增索引需评估 concurrent index。
- Prisma 无法表达的 concurrent index，可创建 empty migration 并手写 SQL。

---

## 7. Migration Safety

### 7.1 禁止事项

- 禁止生产手工 ALTER TABLE。
- 禁止编辑已经部署过的 migration。
- 禁止 schema 和大规模 data backfill 混在同一个 migration。
- 禁止直接 rename/drop 生产字段，除非确认没有旧代码引用。
- 禁止给已有大表直接添加无 default 的 NOT NULL 字段。

### 7.2 expand-contract

破坏性变更使用 expand-contract：

```text
EXPAND: 新增字段/表，保持旧字段可用
MIGRATE: 应用双写或 backfill
CONTRACT: 停用旧字段引用后再 drop
```

---

## 8. 事务与 Prisma

### 8.1 事务形式

| 情况 | 推荐 |
| --- | --- |
| 独立写入，无依赖 | array `$transaction` |
| 后续写入依赖前一步结果 | interactive `$transaction` |
| 涉及外部 HTTP/文件/邮件 | 外部调用不放事务内 |

### 8.2 必须使用事务的命令

- `ConfirmOrder`
- `CancelOrder`
- `ChangeOrderPrice`
- `ConfirmShipment`
- `ConfirmDelivery`
- `SettleOrder`

### 8.3 interactive transaction 注意事项

- transaction 内只使用 `tx` client，不使用外层 prisma client。
- 不在 transaction 内调用外部服务。
- 控制事务耗时，避免默认超时。

---

## 9. Prisma Anti-Traps

实现时必须避开：

- `updateMany` / `deleteMany` 只返回 count，不返回记录。
- `@updatedAt` 不会在 `updateMany` 自动更新。
- `findUniqueOrThrow` 会返回软删除记录，若需要过滤 active/deleted 状态，使用 `findFirstOrThrow` 或复合唯一约束。
- `deleteMany` 必须带 `where`。
- PrismaClient 必须单例，避免连接池爆炸。
- 服务端返回 DTO，不返回原始 Prisma entity。

---

## 10. Pipeline / Import 边界

本项目后续可能有价格表导入、客户资料导入、Excel 导出或本地备份脚本。

规则：

- 导入脚本只能写数据，不能改 schema。
- 导入脚本必须调用 application service 或受控 repository，不绕过业务校验写关键表。
- 价格表导入必须产生 price rule 记录，并进入轻审计或导入记录。
- 任何 pipeline 需要新表时，先改 Prisma schema，再走 migration。

---

## 11. Database Review Checklist

脚手架触碰 schema 前必须检查：

- Prisma 是否仍是唯一 DDL owner。
- 所有新表是否有主键、时间字段和必要索引。
- 所有 FK 查询字段是否有索引。
- 命令幂等是否有 `idempotency_keys` 支撑。
- 预占释放/出库 finalize 是否有 `reservation_allocations` 支撑，且与 `reserved_qty` 在同一事务内维护。
- 出库扣减是否有 `stock_deductions` 记录。
- 配送任务是否与订单保持 MVP 一对一约束。
- migration 是否可 forward-only 部署。
- 是否存在生产环境 `migrate dev` 风险。
