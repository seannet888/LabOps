# 数据模型设计 v0.1

> 基于已确认决策和待确认问题清单回答。MVP一期范围。

---

## 设计决策

| # | 决策 | 影响 |
|---|------|------|
| D1 | 库存以**出生日期**计算周龄，不每周批量更新 | 消除定时任务依赖，查询时动态计算 |
| D2 | 等级**不单独建表**，挂在 species 上自动决定 | 品类即等级，减少用户选择 |
| D3 | 客户"跟着人走"，课题组用**标签字段**而非独立实体 | 灵活，一个字段解决归属和分组 |
| D4 | 订单明细不绑定具体库存批次，只指定品系+周龄+性别 | 出库时再分配批次，降低耦合 |
| D5 | 价格带生效日期，查最新有效价 | 支持历史调价，不改动历史订单 |
| D6 | 出库时扣减库存，确认时预占 | 订单确认→锁定库存(reserved)；出库→真正扣减；取消→释放预占 |
| D7 | 价格跟着合同走 | 有合同的客户按合同价（销售员录入actual_price），无合同的按创建订单时的当前有效价 |

---

## 实体关系概览

```
species ──< strains ──< inventory_batches ──< stock_deductions
                                   └──< reservation_allocations
                │
                ├──< price_list
                │
users ──< customers ──< customer_contacts
    │           │
    │           ├──< customer_addresses
    │           │
    │           └──< orders ──< order_items
    │                   │
    │                   ├──< order_status_log
    │                   │
    │                   ├──< reservation_allocations
    │                   │
    │                   └──< delivery_tasks ──< stock_deductions
    │                                     │
    │                                     └──< document_release_reasons
    │
    ├──< sessions
    │
    └──< audit_log

documents (独立)
certificates (独立, 关联order)
transfer_records (二期)
settlements (二期)
```

---

## 表定义

### 1. users — 系统用户

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 登录账号 |
| password_hash | VARCHAR(255) | NOT NULL | |
| display_name | VARCHAR(50) | NOT NULL | 显示名称 |
| role | VARCHAR(20) | NOT NULL | `sales` / `logistics` / `manager` |
| wechat_id | VARCHAR(100) | | 微信通知用 |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 1a. sessions — 登录会话

不存 JWT，存哈希后的不透明 token，见 [ADR-0007](../adr/0007-use-opaque-session-token-over-jwt.md)。

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| user_id | INT | FK → users, NOT NULL | |
| token_hash | VARCHAR(255) | UNIQUE, NOT NULL | token 的哈希值，不存原文 |
| expires_at | TIMESTAMP | NOT NULL | 登录时设置为 created_at + 2小时 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 2. species — 动物品类

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| name | VARCHAR(50) | UNIQUE, NOT NULL | 小鼠/大鼠/豚鼠/兔子 |
| grade | VARCHAR(20) | NOT NULL | SPF级/普通级，品类自动决定 |
| sort_order | INT | DEFAULT 0 | 显示排序 |

预置数据：
```
小鼠 → SPF级
大鼠 → SPF级
豚鼠 → 普通级
兔子 → 普通级
```

### 3. strains — 品系

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| species_id | INT | FK → species, NOT NULL | 所属品类 |
| name | VARCHAR(100) | NOT NULL | 如 C57BL/6、BALB/c、ICR |
| is_active | BOOLEAN | DEFAULT true | 软删除 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

UNIQUE(species_id, name)

### 4. price_list — 价格表

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| strain_id | INT | FK → strains, NOT NULL | |
| age_weeks | INT | NOT NULL | 周龄 |
| unit_price | DECIMAL(10,2) | NOT NULL | 单价 |
| effective_from | DATE | NOT NULL | 生效日期 |
| created_by | INT | FK → users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

UNIQUE(strain_id, age_weeks, effective_from)

查询当前有效价格：
```sql
SELECT DISTINCT ON (strain_id, age_weeks)
  unit_price
FROM price_list
WHERE effective_from <= CURRENT_DATE
ORDER BY strain_id, age_weeks, effective_from DESC
```

### 5. inventory_batches — 库存批次

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| strain_id | INT | FK → strains, NOT NULL | |
| birth_date | DATE | NOT NULL | 出生日期，据此计算周龄 |
| gender | CHAR(1) | NOT NULL | M=雄 F=雌 |
| initial_qty | INT | NOT NULL | 入库原始总数；出库后不递减 |
| reserved_qty | INT | DEFAULT 0 | 已预占数量（订单已确认未出库） |
| entry_date | DATE | NOT NULL | 入库日期 |
| entry_by | INT | FK → users | 录入人 |
| notes | TEXT | | 备注（笼位号等） |
| created_at | TIMESTAMP | DEFAULT NOW() | |

周龄计算（查询时）：
```sql
FLOOR(EXTRACT(DAY FROM (CURRENT_DATE - birth_date)) / 7) AS age_weeks
```

可售数量：
```
available = initial_qty - reserved_qty - stock_deduction_sum
```

库存扣减规则：
- 订单确认（`ConfirmOrder`） → 按品系、周龄、性别 FIFO 预占，写入 `reservation_allocations`，并递增对应批次 `reserved_qty`。
- 配送任务确认出库（`ConfirmShipment`，后勤操作） → 后勤确认实际扣减批次，写入 `stock_deductions`；随后 finalize 对应订单明细的 `reservation_allocations`，递减预占批次 `reserved_qty` 并删除 allocation。
- 已确认订单取消 → release 对应订单明细的 `reservation_allocations`，递减预占批次 `reserved_qty` 并删除 allocation。
- `reservation_allocations` 是预占分配台账，不代表实际出库批次；实际出库批次只以 `stock_deductions` 为准。

老化提醒（查询时）：
```sql
FLOOR(EXTRACT(DAY FROM (CURRENT_DATE - birth_date)) / 7) > 8
```

### 6. customers — 客户

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| primary_sales_rep_id | INT | FK → users | 主要跟进销售，可为空或变更；不用于客户可见性隔离 |
| geo_area | VARCHAR(100) | | 地理区域，供后勤调度参考，非自动路线规则 |
| name | VARCHAR(200) | NOT NULL | 客户名称（个人或单位+课题组简称） |
| unit_name | VARCHAR(200) | | 单位全称 |
| research_group | VARCHAR(200) | | 课题组标签 |
| settlement_type | VARCHAR(20) | DEFAULT 'single' | `single`=单次结算, `monthly`=月结 |
| credit_days | INT | DEFAULT 60 | 月结账期（天），默认60 |
| default_delivery | VARCHAR(20) | DEFAULT '135' | `135`=一三五, `24`=二四, `express`=闪送, `pickup`=自提 |
| default_invoice_type | VARCHAR(20) | | `tech_service`=技术服务费, `consumable`=耗材 |
| notes | TEXT | | 备注 |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

客户档案不做销售隔离：sales、logistics、manager 均可查看；sales、manager 可编辑，logistics 只读。送货地址变更需轻审计（见 [ADR-0003](../adr/0003-use-shared-customer-records-without-sales-isolation.md)）。

### 7. customer_contacts — 客户联系人

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| customer_id | INT | FK → customers, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | |
| role | VARCHAR(50) | | PI/学生/采购员 |
| phone | VARCHAR(30) | | |
| wechat | VARCHAR(100) | | |
| email | VARCHAR(200) | | |
| is_primary | BOOLEAN | DEFAULT false | 是否首要联系人 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 8. customer_addresses — 客户地址

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| customer_id | INT | FK → customers, NOT NULL | |
| address_type | VARCHAR(20) | NOT NULL | `delivery`=送货地址, `invoice`=开票地址 |
| detail | TEXT | NOT NULL | 详细地址 |
| is_default | BOOLEAN | DEFAULT false | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 9. orders — 订单

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| order_number | VARCHAR(20) | UNIQUE, NOT NULL | XS+年月日+8位随机hex，如 XS20260626a3f8b2c1 |
| customer_id | INT | FK → customers, NOT NULL | |
| sales_rep_id | INT | FK → users, NOT NULL | |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | 见状态流转 |
| delivery_method | VARCHAR(20) | | 覆盖客户默认值 |
| delivery_date | DATE | | 预计送货日期 |
| invoice_type | VARCHAR(20) | | 覆盖客户默认值 |
| notes | TEXT | | 备注 |
| total_amount | DECIMAL(12,2) | DEFAULT 0 | 订单总金额（冗余，方便查询） |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

状态流转：`pending`(待确认) → `confirmed`(已确认) → `shipped`(已出库) → `delivered`(已送达) → `invoiced`(已开票) → `settled`(已结算)，任意节点可 → `cancelled`(已取消)。

`pending`→`confirmed` 由销售操作（`ConfirmOrder`）。`confirmed`→`shipped`、`shipped`→`delivered` 不由销售直接修改，而是由对应 `delivery_tasks.status` 变为 `shipped`/`delivered` 时同步推动（见 9.3 节、[ADR-0002](../adr/0002-separate-sales-orders-from-delivery-tasks.md)）。`invoiced`、`settled`、`cancelled` 由销售操作。

订单号生成：`XS` + `YYYYMMDD` + `crypto.randomBytes(4).toString("hex")`。若遇到 `order_number` 唯一约束冲突，服务端最多重试 3 次；连续冲突视为内部错误。严格每日递增流水号延后到有明确业务需求时再引入序列表。

### 10. order_items — 订单明细

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| order_id | INT | FK → orders, NOT NULL | |
| strain_id | INT | FK → strains, NOT NULL | |
| age_weeks | INT | NOT NULL | 下单时要求的周龄 |
| gender | CHAR(1) | NOT NULL | |
| quantity | INT | NOT NULL | |
| unit_price | DECIMAL(10,2) | NOT NULL | 系统带出的标准单价 |
| actual_price | DECIMAL(10,2) | NOT NULL | 实际单价（销售员可修改） |
| line_total | DECIMAL(12,2) | GENERATED | actual_price * quantity |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 11. order_status_log — 状态变更日志

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| order_id | INT | FK → orders, NOT NULL | |
| from_status | VARCHAR(20) | | NULL 表示新建 |
| to_status | VARCHAR(20) | NOT NULL | |
| changed_by | INT | FK → users | |
| reason | TEXT | | 变更原因 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 12. delivery_tasks — 配送任务

订单确认后自动派生，后勤在此域内操作出库/送达，详见 [framework.md §9.3](./framework.md#93-delivery_tasks) 与 [ADR-0002](../adr/0002-separate-sales-orders-from-delivery-tasks.md)。

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| order_id | INT | FK → orders, NOT NULL | 来源订单 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending_schedule' | `pending_schedule`/`scheduled`/`shipped`/`delivered`/`cancelled` |
| planned_delivery_date | DATE | | 计划配送日期 |
| vehicle | VARCHAR(100) | | 车辆信息 |
| driver | VARCHAR(100) | | 司机信息 |
| delivery_batch | VARCHAR(50) | | 配送批次 |
| route_notes | TEXT | | 路线备注 |
| sales_action_required | BOOLEAN | DEFAULT false | 是否需销售处理 |
| sales_action_note | TEXT | | 问题说明 |
| shipped_at | TIMESTAMP | | 出库时间 |
| delivered_at | TIMESTAMP | | 送达时间 |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

权限：仅 logistics、manager 可创建/修改；sales、manager 只读（见 [framework.md §8 权限矩阵](./framework.md#8-权限矩阵)）。

### 13. stock_deductions — 出库批次扣减记录

记录 `ConfirmShipment` 时实际扣减的库存批次，见 [ADR-0004](../adr/0004-use-aggregate-inventory-reservation-and-confirmed-batch-deduction.md)。

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| delivery_task_id | INT | FK → delivery_tasks, NOT NULL | |
| order_item_id | INT | FK → order_items, NOT NULL | |
| inventory_batch_id | INT | FK → inventory_batches, NOT NULL | 实际扣减库存批次 |
| quantity | INT | NOT NULL | 扣减数量 |
| confirmed_by | INT | FK → users, NOT NULL | 后勤确认人 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 13a. reservation_allocations — 库存预占分配记录

记录订单确认时预占分配到哪些库存批次，用于取消订单时精确释放预占，以及确认出库成功后精确清理预占。它不是实际出库事实，实际扣减仍以 `stock_deductions` 为准。

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| order_item_id | INT | FK → order_items, NOT NULL | 被预占的订单明细 |
| inventory_batch_id | INT | FK → inventory_batches, NOT NULL | 预占对应的库存批次 |
| quantity | INT | NOT NULL | 预占数量 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

约束与索引：

- UNIQUE(order_item_id, inventory_batch_id)
- INDEX(inventory_batch_id)

### 14. document_release_reasons — 票证缺失放行原因

票证弱校验：缺失合格证/发票仍允许出库时记录原因，见 AGENTS.md §5 票证规则。

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| delivery_task_id | INT | FK → delivery_tasks, NOT NULL | |
| order_id | INT | FK → orders, NOT NULL | |
| missing_certificate | BOOLEAN | DEFAULT false | 是否缺合格证附件 |
| missing_invoice | BOOLEAN | DEFAULT false | 是否缺发票登记 |
| reason | TEXT | NOT NULL | 放行原因 |
| released_by | INT | FK → users, NOT NULL | 放行人 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 15. certificates — 合格证附件

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| order_id | INT | FK → orders | 关联订单（可空，按批次上传） |
| batch_desc | VARCHAR(200) | | 批次描述 |
| file_path | VARCHAR(500) | NOT NULL | 文件存储路径 |
| file_name | VARCHAR(200) | | 原始文件名 |
| uploaded_by | INT | FK → users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 16. documents — 常用资料

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| doc_type | VARCHAR(30) | NOT NULL | `business_license`=营业执照, `test_report`=检测报告, `other`=其他 |
| file_path | VARCHAR(500) | NOT NULL | |
| file_name | VARCHAR(200) | | |
| description | VARCHAR(300) | | |
| uploaded_by | INT | FK → users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

### 17. audit_log — 审计日志

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | BIGSERIAL | PK | |
| user_id | INT | FK → users | 操作人 |
| action | VARCHAR(30) | NOT NULL | create/update/delete |
| entity_type | VARCHAR(30) | NOT NULL | order/customer/price/inventory |
| entity_id | INT | | |
| field_name | VARCHAR(50) | | 变更字段 |
| old_value | TEXT | | |
| new_value | TEXT | | |
| reason | TEXT | | 变更原因 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

按年归档：每年创建 `audit_log_YYYY` 分区表或定期清理旧数据。


### 17a. delivery_strategy_rules — 配送策略提示规则

MVP 仅作为销售提示规则，不参与自动计价、发票或对账金额，见 [ADR-0005](../adr/0005-keep-delivery-strategy-suggestion-only.md)。

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| name | VARCHAR(100) | NOT NULL | 策略名称 |
| geo_area | VARCHAR(100) | | 适用地理区域，可为空表示全区域 |
| amount_threshold | DECIMAL(10,2) | | 满额提示阈值 |
| quantity_threshold | INT | | 满量提示阈值，MVP 预留 |
| suggestion_text | TEXT | NOT NULL | 提示文案，支持 `{remaining_amount}` 占位 |
| is_active | BOOLEAN | DEFAULT true | 是否启用 |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |
### 18. transfer_records — 复杂业务转接（二期）

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | SERIAL | PK | |
| customer_name | VARCHAR(200) | NOT NULL | 客户名称 |
| request_type | VARCHAR(50) | NOT NULL | 动物建模/饲养/代养/繁育/实验 |
| transfer_to | VARCHAR(100) | NOT NULL | 转接给谁（姓名/微信） |
| status | VARCHAR(20) | DEFAULT 'pending' | pending/contacted/done |
| notes | TEXT | | |
| created_by | INT | FK → users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

## 一期 MVP 建表清单

| # | 表 | 优先级 |
|---|-----|--------|
| 1 | users | 一期 |
| 1a | sessions | 一期 |
| 2 | species | 一期 |
| 3 | strains | 一期 |
| 4 | price_list | 一期 |
| 5 | inventory_batches | 一期 |
| 6 | customers | 一期 |
| 7 | customer_contacts | 一期 |
| 8 | customer_addresses | 一期 |
| 9 | orders | 一期 |
| 10 | order_items | 一期 |
| 11 | order_status_log | 一期 |
| 12 | delivery_tasks | 一期 |
| 13 | stock_deductions | 一期 |
| 13a | reservation_allocations | 一期 |
| 14 | document_release_reasons | 一期 |
| 15 | certificates | 一期 |
| 16 | documents | 一期 |
| 17 | audit_log | 一期（核心字段，二期完善归档） |
| 17a | delivery_strategy_rules | 一期（销售提示，不计价） |
| 18 | transfer_records | 二期 |
| 19 | settlements | 二期（待月结需求细化后设计） |

---

## 待讨论

1. ~~库存扣减时机~~ → ✅ **出库时扣减**（确认时预占，出库时真正扣减）
2. ~~客户模型~~ → ✅ **暂定当前三层结构**（customers + contacts + addresses），后续有调整再说
3. ~~价格变更窗口~~ → ✅ **跟着合同走**：有合同/协议的按合同价录入，无合同的按创建订单时的当前有效价


