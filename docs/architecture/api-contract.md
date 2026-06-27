# 实验动物销售管理系统 — API Contract 与模块接口规范

> 版本: v0.1  
> 状态: MVP 接口边界草案  
> 依据: [framework.md](./framework.md)、[data-model.md](./data-model.md)、[CONTEXT.md](../domain/CONTEXT.md)、[ADR Index](../adr/README.md)、[backend-blueprint.md](./backend-blueprint.md)、[persistence-migration-policy.md](./persistence-migration-policy.md)、[tdd-scaffold-plan.md](./tdd-scaffold-plan.md)  
> 范围: Module Interface、HTTP/API shape、错误模型、输入输出 contract、版本兼容、边界责任

---

## 1. API 设计原则

### 1.1 API 分层

系统接口分为两类：

- **资源接口**: 用 REST CRUD 表达基础资料和查询，例如客户、联系人、库存批次、价格表。
- **命令接口**: 用 `POST /:resource/:id/:action` 表达核心业务动作，例如确认订单、改价、确认出库。

资源接口返回当前状态；命令接口表达一次业务意图，并在成功后产生确定的业务事实。

### 1.2 URL 规范

- 统一前缀: `/api/v1`
- 资源名: 复数、小写、kebab-case
- ID 放路径中，筛选放 query string
- 动作 endpoint 只用于不能自然表达为 CRUD 的业务命令

示例：

```text
GET  /api/v1/customers
POST /api/v1/orders/{order_id}/confirm
POST /api/v1/delivery-tasks/{task_id}/confirm-shipment
```

### 1.3 字段命名

HTTP JSON 使用 `snake_case`。

示例：

```json
{
  "order_number": "XS20260626a3f8b2c1",
  "actual_price": "28.00",
  "created_at": "2026-06-25T10:30:00+08:00"
}
```

### 1.4 时间与金额

- 时间: ISO 8601 字符串，包含时区；默认使用服务器业务时区 `Asia/Shanghai`。
- 日期: `YYYY-MM-DD`。
- 金额: JSON 中用字符串表示十进制金额，避免浮点误差，例如 `"1280.00"`。
- 数量: 整数。

---

## 2. 统一响应模型

### 2.1 单资源成功响应

```json
{
  "data": {
    "id": "ord_001",
    "status": "confirmed"
  }
}
```

### 2.2 集合响应

MVP 使用 offset pagination，适合后台列表和中小规模数据。

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 86,
    "total_pages": 5
  },
  "links": {
    "self": "/api/v1/orders?page=1&per_page=20",
    "next": "/api/v1/orders?page=2&per_page=20"
  }
}
```

### 2.3 命令成功响应

命令接口返回命令执行后的主资源状态，并可附带业务事件。

```json
{
  "data": {
    "id": "ord_001",
    "status": "confirmed"
  },
  "meta": {
    "events": ["order_confirmed", "inventory_reserved", "delivery_task_created"]
  }
}
```

### 2.4 空响应

删除、停用、无返回体操作可使用 `204 No Content`。MVP 中优先使用软删除/停用，不物理删除业务历史。

---

## 3. 错误模型

### 3.1 标准错误响应

```json
{
  "error": {
    "code": "validation_error",
    "message": "请求参数校验失败",
    "details": [
      {
        "field": "items.0.quantity",
        "message": "数量必须大于 0",
        "code": "greater_than"
      }
    ],
    "request_id": "req_20260625_000001"
  }
}
```

### 3.2 HTTP 状态码

| 状态码 | 使用场景 |
| --- | --- |
| `200 OK` | 查询、更新、命令执行成功并返回资源 |
| `201 Created` | 创建资源成功，返回 `Location` header |
| `204 No Content` | 停用、删除或无返回体成功 |
| `400 Bad Request` | JSON 结构错误、query 参数格式错误 |
| `401 Unauthorized` | 未登录或 token 无效 |
| `403 Forbidden` | 角色无权执行动作 |
| `404 Not Found` | 资源不存在或不可访问 |
| `409 Conflict` | 状态冲突、重复提交、唯一约束冲突 |
| `422 Unprocessable Entity` | 业务语义校验失败，例如库存不足、票证原因缺失 |
| `429 Too Many Requests` | 请求过于频繁 |
| `500 Internal Server Error` | 未预期错误，不暴露内部细节 |

### 3.3 错误码清单

| code | HTTP | 含义 |
| --- | --- | --- |
| `invalid_json` | 400 | 请求体不是合法 JSON |
| `validation_error` | 422 | 字段校验失败 |
| `unauthorized` | 401 | 未登录或登录失效 |
| `forbidden` | 403 | 当前角色无权操作 |
| `not_found` | 404 | 资源不存在 |
| `conflict` | 409 | 数据冲突或重复提交 |
| `state_conflict` | 409 | 当前状态不允许该动作 |
| `inventory_insufficient` | 422 | 可售库存不足 |
| `price_missing` | 422 | 缺少当前有效价格 |
| `document_release_reason_required` | 422 | 票证缺失但未填写放行原因 |
| `shipment_batch_required` | 422 | 出库扣减批次未确认 |
| `duplicate_order_number` | 409 | 订单编号冲突 |
| `rate_limit_exceeded` | 429 | 请求频率超限 |
| `internal_error` | 500 | 服务器内部错误 |

---

## 4. 通用查询协议

### 4.1 分页

```text
?page=1&per_page=20
```

规则：

- `page` 默认 `1`。
- `per_page` 默认 `20`，最大 `100`。
- 列表响应必须返回 `meta.total` 和 `meta.total_pages`。

### 4.2 排序

```text
?sort=-created_at
?sort=status,-created_at
```

规则：

- `-` 前缀表示倒序。
- 不允许任意字段排序，只允许白名单字段。

### 4.3 搜索

```text
?q=北大
```

规则：

- `q` 用于名称类模糊搜索。
- MVP 不做复杂全文搜索。

### 4.4 常用过滤

```text
?status=confirmed
?customer_id=cus_001
?created_at[gte]=2026-06-01&created_at[lte]=2026-06-30
```

---

## 5. 模块接口总览

| 模块 | 对外资源/命令 | 拥有写入 | 禁止跨界 |
| --- | --- | --- | --- |
| 身份权限 | `/auth/*`, `/me` | session/token、当前用户上下文 | 不解释业务状态 |
| 客户档案 | `/customers`, `/customer-contacts`, `/customer-addresses` | 客户、联系人、地址、地理区域 | 不处理订单价格、配送安排 |
| 商品价格 | `/species`, `/strains`, `/price-rules` | 品类、品系、价格表 | 不写订单实际成交价 |
| 库存 | `/inventory-batches`, `/inventory-availability`, stock deduction internal API | 批次、预占、扣减 | 不决定订单状态，除事件同步外 |
| 销售订单 | `/orders`, order command endpoints | 订单、订单明细、订单状态 | 不写车辆、司机、路线备注 |
| 配送履约 | `/delivery-tasks`, delivery command endpoints | 配送任务、配送状态、出库确认 | 不改订单价格、明细、客户档案 |
| 票证归档 | `/certificates`, `/invoices`, document release | 合格证附件、发票登记、票证放行原因 | 不生成官方合格证或税务发票 |
| 配送策略提示 | `/delivery-strategy-rules`, `/delivery-suggestions` | 提示规则、提示结果 | 不改订单总价 |
| 审计导出 | `/audit-logs`, `/exports/*` | 轻审计记录、导出任务 | 不参与业务判定 |

---

## 6. Auth 与权限接口

### 6.1 登录

```http
POST /api/v1/auth/login
```

Request:

```json
{
  "username": "sales01",
  "password": "******"
}
```

Response `200`:

```json
{
  "data": {
    "access_token": "jwt_or_session_token",
    "token_type": "Bearer",
    "expires_in": 7200,
    "user": {
      "id": "usr_001",
      "display_name": "张三",
      "role": "sales"
    }
  }
}
```

### 6.2 当前用户

```http
GET /api/v1/me
Authorization: Bearer <token>
```

Response:

```json
{
  "data": {
    "id": "usr_001",
    "display_name": "张三",
    "role": "sales",
    "permissions": ["orders:create", "orders:confirm", "customers:update"]
  }
}
```

### 6.3 角色

| role | 含义 |
| --- | --- |
| `sales` | 销售 |
| `logistics` | 后勤 |
| `manager` | 管理员 |

---

## 7. 客户档案 API

### 7.1 客户列表

```http
GET /api/v1/customers?q=北大&geo_area=海淀&page=1&per_page=20
```

Response item:

```json
{
  "id": "cus_001",
  "name": "北京大学-生命科学学院-王老师课题组",
  "unit_name": "北京大学",
  "research_group": "王老师课题组",
  "geo_area": "海淀",
  "settlement_type": "monthly",
  "credit_days": 60,
  "default_delivery_method": "self_vehicle",
  "default_invoice_type": "tech_service",
  "is_active": true
}
```

### 7.2 创建客户

```http
POST /api/v1/customers
```

Request:

```json
{
  "name": "北京大学-生命科学学院-王老师课题组",
  "unit_name": "北京大学",
  "research_group": "王老师课题组",
  "geo_area": "海淀",
  "settlement_type": "monthly",
  "credit_days": 60,
  "default_delivery_method": "self_vehicle",
  "default_invoice_type": "tech_service",
  "notes": "常规月结客户"
}
```

Rules:

- 销售和管理员可创建。
- 后勤只读客户档案。
- 客户档案不按销售隔离。

### 7.3 更新送货地址

```http
PATCH /api/v1/customer-addresses/{address_id}
```

Request:

```json
{
  "detail": "北京市海淀区xxx楼xxx室",
  "is_default": true,
  "change_reason": "客户实验室搬迁"
}
```

Rules:

- 送货地址变更进入轻审计，`change_reason` 必填。

---

## 8. 商品与价格 API

### 8.1 品类与品系

```http
GET /api/v1/species
GET /api/v1/strains?species_id=spc_mouse&is_active=true
POST /api/v1/strains
PATCH /api/v1/strains/{strain_id}
```

### 8.2 当前有效价格查询

```http
GET /api/v1/price-rules/current?strain_id=str_001&age_weeks=4
```

Response:

```json
{
  "data": {
    "strain_id": "str_001",
    "age_weeks": 4,
    "unit_price": "28.00",
    "effective_from": "2026-06-01"
  }
}
```

### 8.3 创建价格规则

```http
POST /api/v1/price-rules
```

Request:

```json
{
  "strain_id": "str_001",
  "age_weeks": 4,
  "unit_price": "28.00",
  "effective_from": "2026-06-01",
  "change_reason": "新价格表导入"
}
```

Rules:

- 管理员可写。
- 价格表变更进入轻审计。
- 历史订单实际成交价不随价格表变更。

---

## 9. 库存 API

### 9.1 库存批次列表

```http
GET /api/v1/inventory-batches?strain_id=str_001&gender=M&age_weeks[gte]=3&age_weeks[lte]=8&page=1&per_page=20
```

Response item:

```json
{
  "id": "inv_001",
  "strain_id": "str_001",
  "strain_name": "C57BL/6",
  "species_name": "小鼠",
  "birth_date": "2026-05-21",
  "age_weeks": 5,
  "gender": "M",
  "initial_qty": 100,
  "reserved_qty": 20,
  "available_qty": 75,
  "is_aging": false,
  "entry_date": "2026-05-22"
}
```

### 9.2 创建库存批次

```http
POST /api/v1/inventory-batches
Idempotency-Key: 2d3c2f7c-75e9-4a5e-9df9-0a8b8db8c001
```

Request:

```json
{
  "strain_id": "str_001",
  "birth_date": "2026-05-21",
  "gender": "M",
  "initial_qty": 100,
  "entry_date": "2026-05-22",
  "notes": "A架"
}
```

Rules:

- 销售和管理员可入库。
- 入库进入轻审计。
- 必须提供 `Idempotency-Key`；同 key 同 payload 返回首次结果，同 key 不同 payload 返回 `409 conflict`。
- 请求体必须通过严格 schema 校验，未知字段返回 `422 validation_error`。
- `initial_qty` 必须为正整数，`gender` 只能为 `M`/`F`。
- `birth_date` 和 `entry_date` 必须是 `YYYY-MM-DD`，且 `entry_date >= birth_date`。
- 响应中的 `available_qty` 按 `initial_qty - reserved_qty - stock_deduction_sum` 计算。

### 9.3 可售汇总查询

```http
GET /api/v1/inventory-availability?strain_id=str_001&age_weeks=5&gender=M
```

Response:

```json
{
  "data": {
    "strain_id": "str_001",
    "age_weeks": 5,
    "gender": "M",
    "available_qty": 75,
    "reserved_qty": 20,
    "aging_qty": 0
  }
}
```

### 9.4 出库批次建议

```http
GET /api/v1/delivery-tasks/{task_id}/stock-deduction-suggestions
```

Response:

```json
{
  "data": [
    {
      "order_item_id": "itm_001",
      "required_qty": 20,
      "suggested_batches": [
        {
          "inventory_batch_id": "inv_001",
          "quantity": 20,
          "reason": "优先老化/先进先出"
        }
      ]
    }
  ]
}
```

Rules:

- 该接口只给后勤确认出库前使用。
- 建议不等于扣减，只有 `ConfirmShipment` 成功后才扣库存。
- 建议查询和库存批次列表都必须扣除已记录的 `stock_deductions`，避免已出库库存再次被推荐。

---

## 10. 销售订单 API

### 10.1 订单列表

```http
GET /api/v1/orders?status=confirmed&customer_id=cus_001&page=1&per_page=20
```

Response item:

```json
{
  "id": "ord_001",
  "order_number": "XS20260626a3f8b2c1",
  "customer_id": "cus_001",
  "customer_name": "北京大学-生命科学学院-王老师课题组",
  "sales_rep_id": "usr_001",
  "status": "confirmed",
  "total_amount": "560.00",
  "requires_invoice": true,
  "invoice_type": "tech_service",
  "created_at": "2026-06-25T10:30:00+08:00"
}
```

### 10.2 创建订单

```http
POST /api/v1/orders
```

Request:

```json
{
  "customer_id": "cus_001",
  "delivery_method": "self_vehicle",
  "planned_delivery_date": "2026-06-27",
  "requires_invoice": true,
  "invoice_type": "tech_service",
  "notes": "客户要求上午送达",
  "items": [
    {
      "strain_id": "str_001",
      "age_weeks": 5,
      "gender": "M",
      "quantity": 20,
      "actual_price": "28.00"
    }
  ]
}
```

Response `201`:

```json
{
  "data": {
    "id": "ord_001",
    "order_number": "XS20260625001",
    "status": "pending",
    "total_amount": "560.00",
    "strategy_suggestions": [
      {
        "code": "near_carton_fee_free",
        "message": "再增加 140.00 元可满足免纸箱运费提示条件"
      }
    ]
  }
}
```

Rules:

- 创建订单不预占库存。
- `actual_price` 可由销售录入；若不传，系统使用当前有效价格。
- 若当前有效价格缺失，返回 `422 price_missing`。

### 10.3 确认订单

```http
POST /api/v1/orders/{order_id}/confirm
```

Request:

```json
{
  "confirm_note": "客户微信确认"
}
```

Response:

```json
{
  "data": {
    "id": "ord_001",
    "status": "confirmed",
    "delivery_task_id": "dt_001"
  },
  "meta": {
    "events": ["order_confirmed", "inventory_reserved", "delivery_task_created"]
  }
}
```

Rules:

- 校验可售库存。
- 成功后汇总预占库存。
- 成功后自动生成配送任务，状态为 `pending_schedule`。

### 10.4 改价

```http
POST /api/v1/orders/{order_id}/change-prices
```

Request:

```json
{
  "reason": "客户长期合作协议价",
  "items": [
    {
      "order_item_id": "itm_001",
      "actual_price": "25.00"
    }
  ]
}
```

Rules:

- 销售和管理员可操作。
- 已出库、已结算订单禁止改价。
- `reason` 必填。
- 进入轻审计。

### 10.5 取消订单

```http
POST /api/v1/orders/{order_id}/cancel
```

Request:

```json
{
  "reason": "客户取消实验计划"
}
```

Rules:

- 未出库订单可取消。
- 已确认订单取消时释放库存预占。
- 若配送任务未出库，同步取消配送任务。

### 10.6 标记结算

```http
POST /api/v1/orders/{order_id}/settle
```

Request:

```json
{
  "settled_at": "2026-07-25",
  "payment_method": "bank_transfer",
  "note": "客户已转账"
}
```

Rules:

- 销售和管理员可操作。
- 未送达或已取消订单不能结算。

---

## 11. 配送履约 API

### 11.1 配送任务列表

```http
GET /api/v1/delivery-tasks?status=pending_schedule&planned_delivery_date=2026-06-27&geo_area=海淀&page=1&per_page=20
```

Response item:

```json
{
  "id": "dt_001",
  "order_id": "ord_001",
  "order_number": "XS20260625001",
  "status": "pending_schedule",
  "customer_name": "北京大学-生命科学学院-王老师课题组",
  "geo_area": "海淀",
  "delivery_address": "北京市海淀区xxx楼xxx室",
  "contact_name": "李同学",
  "contact_phone": "13800000000",
  "planned_delivery_date": "2026-06-27",
  "sales_action_required": false,
  "document_readiness": {
    "certificate_uploaded": false,
    "invoice_registered": false,
    "requires_invoice": true
  }
}
```

### 11.2 安排配送

```http
POST /api/v1/delivery-tasks/{task_id}/schedule
```

Request:

```json
{
  "planned_delivery_date": "2026-06-27",
  "vehicle": "京A12345",
  "driver": "王师傅",
  "delivery_batch": "2026-06-27-AM",
  "route_notes": "海淀线，先送北大"
}
```

Rules:

- 后勤和管理员可操作。
- 不进入轻审计。
- 不改变订单状态。

### 11.3 标记需销售处理

```http
POST /api/v1/delivery-tasks/{task_id}/flag-sales-action-required
```

Request:

```json
{
  "reason": "送货地址缺少楼号，请销售确认"
}
```

Rules:

- 后勤和管理员可操作。
- 后勤不能直接修改客户档案或订单明细。
- 成功后写入轻审计，`reason` 记录需销售处理原因。

### 11.4 确认出库

```http
POST /api/v1/delivery-tasks/{task_id}/confirm-shipment
```

Request:

```json
{
  "stock_deductions": [
    {
      "order_item_id": "itm_001",
      "inventory_batch_id": "inv_001",
      "quantity": 20
    }
  ],
  "document_release": {
    "missing_certificate": true,
    "missing_invoice": false,
    "reason": "合格证已随货纸质交付，扫描件下午补传"
  }
}
```

Response:

```json
{
  "data": {
    "id": "dt_001",
    "status": "shipped",
    "order_id": "ord_001",
    "order_status": "shipped"
  },
  "meta": {
    "events": ["shipment_confirmed", "inventory_deducted", "order_shipped"]
  }
}
```

Rules:

- 后勤和管理员可操作。
- 必须确认扣减批次。
- 若票证缺失，`document_release.reason` 必填。
- 成功后写入 `stock_deductions` 作为真实扣减事实，finalize 对应订单明细的预占分配，配送任务变为 `shipped`，订单同步为 `shipped`。
- 出库实际扣减批次由后勤确认；它可以不同于订单确认时的内部预占 allocation。
- 进入轻审计。

### 11.5 确认送达

```http
POST /api/v1/delivery-tasks/{task_id}/confirm-delivery
```

Request:

```json
{
  "delivered_at": "2026-06-27",
  "note": "客户已签收"
}
```

Rules:

- 未出库任务不能直接送达。
- `delivered_at` 是实际送达日期，格式为 `YYYY-MM-DD`；未传时由后端使用当前时间。
- 成功后配送任务变为 `delivered`，订单同步为 `delivered`，送达备注进入审计 payload。

---

## 12. 票证归档 API

### 12.1 上传合格证附件

```http
POST /api/v1/orders/{order_id}/certificates
Content-Type: multipart/form-data
```

Fields:

```text
file: binary
batch_desc: C57BL/6 5周雄性 20只
```

Response:

```json
{
  "data": {
    "id": "cert_001",
    "order_id": "ord_001",
    "file_name": "certificate.pdf",
    "batch_desc": "C57BL/6 5周雄性 20只",
    "uploaded_at": "2026-06-25T15:30:00+08:00"
  }
}
```

### 12.2 登记发票信息

```http
POST /api/v1/orders/{order_id}/invoice-registration
```

Request:

```json
{
  "invoice_type": "tech_service",
  "invoice_number": "optional-in-mvp",
  "registered_at": "2026-06-25",
  "note": "纸质发票随货"
}
```

Rules:

- 销售和管理员可操作。
- 本系统只登记发票信息，不对接税务系统。

### 12.3 票证归档完成

```http
POST /api/v1/orders/{order_id}/archive-documents
```

Request:

```json
{
  "note": "合格证扫描件和发票信息已归档"
}
```

Rules:

- 成功后订单进入 `invoiced`。
- 若发票非必需，只要求合格证附件或放行记录可追溯。

---

## 13. 配送策略提示 API

### 13.1 策略规则管理

```http
GET  /api/v1/delivery-strategy-rules
POST /api/v1/delivery-strategy-rules
PATCH /api/v1/delivery-strategy-rules/{rule_id}
```

Create request:

```json
{
  "name": "满额免纸箱运费提示",
  "geo_area": "海淀",
  "amount_threshold": "1000.00",
  "quantity_threshold": null,
  "suggestion_text": "再增加 {remaining_amount} 元可满足免纸箱运费提示条件",
  "is_active": true
}
```

### 13.2 获取订单提示

```http
GET /api/v1/orders/{order_id}/delivery-suggestions
```

Response:

```json
{
  "data": [
    {
      "code": "near_carton_fee_free",
      "message": "再增加 140.00 元可满足免纸箱运费提示条件",
      "rule_id": "dsr_001",
      "impact": "suggestion_only"
    }
  ]
}
```

Rules:

- `impact` 固定为 `suggestion_only`。
- 不自动修改订单总价。
- 不参与发票和对账金额计算。

---

## 14. 审计与导出 API

### 14.1 审计日志查询

```http
GET /api/v1/audit-logs?entity_type=order&entity_id=ord_001&page=1&per_page=20
```

Response item:

```json
{
  "id": "aud_001",
  "actor_id": "usr_001",
  "actor_name": "张三",
  "action": "order_price_changed",
  "entity_type": "order",
  "entity_id": "ord_001",
  "old_value": { "actual_price": "28.00" },
  "new_value": { "actual_price": "25.00" },
  "reason": "客户长期合作协议价",
  "created_at": "2026-06-25T11:00:00+08:00"
}
```

### 14.2 订单导出

```http
GET /api/v1/exports/orders.xlsx?status=delivered&created_at[gte]=2026-06-01&created_at[lte]=2026-06-30
```

Rules:

- MVP 可同步下载。
- 导出不是核心审计，但可记录普通操作日志，二期再定。

---

## 15. 输入输出 Contract 摘要

### 15.1 Order

```json
{
  "id": "ord_001",
  "order_number": "XS20260625001",
  "customer_id": "cus_001",
  "sales_rep_id": "usr_001",
  "status": "pending|confirmed|shipped|delivered|invoiced|settled|cancelled",
  "total_amount": "560.00",
  "requires_invoice": true,
  "invoice_type": "tech_service|consumable",
  "planned_delivery_date": "2026-06-27",
  "created_at": "2026-06-25T10:30:00+08:00",
  "items": []
}
```

### 15.2 OrderItem

```json
{
  "id": "itm_001",
  "strain_id": "str_001",
  "strain_name": "C57BL/6",
  "age_weeks": 5,
  "gender": "M|F",
  "quantity": 20,
  "unit_price": "28.00",
  "actual_price": "28.00",
  "line_total": "560.00"
}
```

### 15.3 DeliveryTask

```json
{
  "id": "dt_001",
  "order_id": "ord_001",
  "status": "pending_schedule|scheduled|shipped|delivered|cancelled",
  "planned_delivery_date": "2026-06-27",
  "vehicle": "京A12345",
  "driver": "王师傅",
  "delivery_batch": "2026-06-27-AM",
  "route_notes": "海淀线",
  "sales_action_required": false,
  "sales_action_note": null,
  "shipped_at": null,
  "delivered_at": null
}
```

### 15.4 InventoryBatch

```json
{
  "id": "inv_001",
  "strain_id": "str_001",
  "birth_date": "2026-05-21",
  "age_weeks": 5,
  "gender": "M|F",
  "initial_qty": 100,
  "reserved_qty": 20,
  "available_qty": 80,
  "is_aging": false
}
```

---

## 16. 版本兼容策略

### 16.1 API 版本

MVP 使用 URL 版本：

```text
/api/v1
```

### 16.2 非破坏性变更

以下变更不需要升级到 `/api/v2`：

- 响应中新增字段
- 新增可选请求字段
- 新增 query filter
- 新增 endpoint
- 新增 error code，但 HTTP 语义不变

### 16.3 破坏性变更

以下变更需要新版本：

- 删除或重命名响应字段
- 改变字段类型，例如金额从字符串改为数字
- 修改状态枚举含义
- 修改 URL 结构
- 修改认证方式
- 修改命令副作用，例如配送策略提示从“不计价”改为“自动计价”

### 16.4 兼容约束

- 客户端必须忽略未知响应字段。
- 服务端必须对未知请求字段做明确策略：MVP 建议拒绝并返回 `422 validation_error`。
- 状态枚举新增值时，前端必须有兜底展示。
- 命令 endpoint 必须具备幂等防护，避免重复点击导致重复扣库存。

### 16.5 幂等策略

对会产生副作用的命令支持 `Idempotency-Key` header。

```http
POST /api/v1/delivery-tasks/dt_001/confirm-shipment
Idempotency-Key: 2d3c2f7c-75e9-4a5e-9df9-0a8b8db8c001
```

规则：

- 同一用户、同一 endpoint、同一 key 重复提交，应返回第一次执行结果。
- 适用命令：确认订单、取消订单、改价、确认出库、确认送达、标记结算、库存入库。

---

## 17. 边界责任清单

### 17.1 销售订单域不得越界

- 不写车辆、司机、路线备注。
- 不直接扣减具体库存批次。
- 不生成官方合格证或税务发票。

### 17.2 配送履约域不得越界

- 不修改客户档案。
- 不修改订单明细。
- 不修改订单价格。
- 不修改结算方式和发票类型。
- 发现问题只标记“需销售处理”。

### 17.3 库存域不得越界

- 不决定客户能否购买，订单域决定是否确认。
- 不决定配送状态。
- 只根据订单/配送命令执行预占和扣减。

### 17.4 配送策略提示域不得越界

- 不改变订单金额。
- 不生成优惠。
- 不参与发票和对账金额。
- 只返回提示。

### 17.5 票证归档域不得越界

- 不生成官方合格证。
- 不对接税务发票系统。
- 只归档附件、登记信息、提供票证准备状态和放行记录。

---

## 18. MVP API 清单

| Method | Path | 用途 | 角色 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | 登录 | 公共 |
| GET | `/api/v1/me` | 当前用户 | 已登录 |
| GET | `/api/v1/customers` | 客户列表 | 销售/后勤/管理员 |
| POST | `/api/v1/customers` | 创建客户 | 销售/管理员 |
| PATCH | `/api/v1/customers/{id}` | 更新客户 | 销售/管理员 |
| PATCH | `/api/v1/customer-addresses/{id}` | 更新地址 | 销售/管理员 |
| GET | `/api/v1/species` | 品类列表 | 销售/管理员 |
| GET | `/api/v1/strains` | 品系列表 | 销售/管理员 |
| POST | `/api/v1/strains` | 创建品系 | 管理员 |
| GET | `/api/v1/price-rules/current` | 当前价格 | 销售/管理员 |
| POST | `/api/v1/price-rules` | 创建价格规则 | 管理员 |
| GET | `/api/v1/inventory-batches` | 库存批次列表 | 销售/后勤/管理员 |
| POST | `/api/v1/inventory-batches` | 入库 | 销售/管理员 |
| GET | `/api/v1/inventory-availability` | 可售汇总 | 销售/后勤/管理员 |
| GET | `/api/v1/orders` | 订单列表 | 销售/后勤只读/管理员 |
| POST | `/api/v1/orders` | 创建订单 | 销售/管理员 |
| POST | `/api/v1/orders/{id}/confirm` | 确认订单 | 销售/管理员 |
| POST | `/api/v1/orders/{id}/change-prices` | 改价 | 销售/管理员 |
| POST | `/api/v1/orders/{id}/cancel` | 取消订单 | 销售/管理员 |
| POST | `/api/v1/orders/{id}/settle` | 标记结算 | 销售/管理员 |
| GET | `/api/v1/delivery-tasks` | 配送任务列表 | 销售/后勤/管理员 |
| POST | `/api/v1/delivery-tasks/{id}/schedule` | 安排配送 | 后勤/管理员 |
| POST | `/api/v1/delivery-tasks/{id}/flag-sales-action-required` | 需销售处理 | 后勤/管理员 |
| GET | `/api/v1/delivery-tasks/{id}/stock-deduction-suggestions` | 出库批次建议 | 后勤/管理员 |
| POST | `/api/v1/delivery-tasks/{id}/confirm-shipment` | 确认出库 | 后勤/管理员 |
| POST | `/api/v1/delivery-tasks/{id}/confirm-delivery` | 确认送达 | 后勤/管理员 |
| POST | `/api/v1/orders/{id}/certificates` | 上传合格证 | 销售/管理员 |
| POST | `/api/v1/orders/{id}/invoice-registration` | 登记发票 | 销售/管理员 |
| POST | `/api/v1/orders/{id}/archive-documents` | 票证归档完成 | 销售/管理员 |
| GET | `/api/v1/orders/{id}/delivery-suggestions` | 配送策略提示 | 销售/管理员 |
| GET | `/api/v1/audit-logs` | 审计日志 | 管理员 |
| GET | `/api/v1/exports/orders.xlsx` | 订单导出 | 销售/管理员 |

---

## 19. 后续落地建议

- 以本文为 OpenAPI/Swagger 的人工源文档。
- 开发前将第 18 节转换为 OpenAPI YAML。
- 命令 endpoint 先写状态机测试，再写实现。
- 任何跨域写入都必须能在本文中找到对应命令；找不到就先补 contract，再开发。
## Implementation status - 2026-06-26

Implemented MVP endpoints include auth/current user, customers, species/strains, price rules, inventory batches/availability, orders and order commands, delivery task commands, stock deduction suggestions, invoice registration, archive documents, order delivery suggestions, audit logs, order XLSX export, and delivery strategy rule management.

Recent hardening updates:
- List query validation now rejects invalid pagination/status/gender before application services are called.
- Side-effect command endpoints require `Idempotency-Key`; missing keys return `422 validation_error`.
- Route-level idempotency is covered for duplicate order confirmation, duplicate shipment confirmation, and same-key/different-payload conflict.
- `POST /api/v1/inventory-batches` now uses strict Zod validation and requires `Idempotency-Key`.
- `POST /api/v1/orders/{id}/invoice-registration` now uses strict route validation, requires `Idempotency-Key`, and stores/replays idempotent results in the document application service.
- Customer, order command, delivery flag, catalog, inventory availability, audit log, and export route inputs now use Zod `validateBody` / `validateQuery` instead of route-local type assertions.
- The pre-delivery review HIGH contract gaps are fixed: delivery task list accepts `planned_delivery_date`/`geo_area`, confirm order consumes `confirm_note`, and confirm delivery consumes `delivered_at`/`note`.
- Customer list responses include `notes` so edit forms can round-trip existing notes.
- Audit log writes support `new_value` payloads for command details.
- Order numbers now use `XS{YYYYMMDD}{8 hex}` and retry unique collisions server-side.
- Inventory availability now consistently uses `initial_qty - reserved_qty - stock_deduction_sum`.
- `ConfirmShipment` records actual `stock_deductions` and finalizes reservation allocations instead of mutating `initial_qty`.
- Delivery strategy rule management is available at:
  - `GET /api/v1/delivery-strategy-rules` for sales and manager.
  - `POST /api/v1/delivery-strategy-rules` for manager.
  - `PATCH /api/v1/delivery-strategy-rules/{rule_id}` for manager.

Known follow-up:
- Remaining hardening items are medium/low priority cleanup such as audit coverage additions, money precision evaluation, and Prisma composition-layer type cleanup; see `docs/process/hardening-backlog-2026-06-26.md`.
