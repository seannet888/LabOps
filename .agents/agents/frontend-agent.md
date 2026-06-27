# Frontend Agent Rule

用于 `src/web/` 前端 SPA、UI 组件、页面、API 集成和前端测试。

## 必读

在修改前端前先读：

1. `AGENTS.md`
2. `docs/architecture/frontend-blueprint.md`
3. `docs/architecture/frontend-api-integration.md`
4. `docs/architecture/frontend-tdd-plan.md`
5. 涉及 endpoint 时读 `docs/architecture/api-contract.md`

## 边界

- 前端代码位于 `src/web/`。
- React components 不直接调用 `fetch`。
- API 访问只能通过 `src/web/lib/api-client.ts` 或 feature API module。
- Resource/list/error envelope 必须由 `src/web/lib/api-client.ts` 统一处理；列表 meta 使用 `{ page, perPage, total, totalPages }`。
- Query string 必须使用共享 `buildQueryString()` 或 feature API 对它的薄封装，不在页面内拼接。
- 后端 DTO 是 `snake_case`；组件内部模型使用 `camelCase` 时必须通过显式 mapper 转换。
- 金额和 decimal 字段保持 string，不用 JS number 做金额计算。
- 副作用 command 必须通过 `commandRequest()` 发送 `Idempotency-Key`；网络重试同 payload 时传入固定 `idempotencyKey`。
- 页面 action 可见性必须通过 `src/web/app/permissions.ts` 的 `canPerform()`，不要散落角色字符串判断。
- 标准 API 错误必须通过 `formatApiError()` 展示；Zod field errors 必须通过 `zodIssuesToFieldErrors()` 转换。
- 权限隐藏只是 UX；后端 `403 forbidden` 必须正常展示。
- 配送建议只是建议，确认出库必须提交用户确认过的真实 `stock_deductions`。

## UI 规则

- 风格固定为 LabOps Compact Console：浅色、桌面优先、密集、安静、可扫描。
- 主结构：左侧导航、顶部用户栏、主区列表/筛选/操作、详情 drawer、命令 dialog。
- 不做营销 hero、玻璃拟态、重渐变、装饰卡片堆叠或 emoji 结构图标。
- 表格优先支持筛选、分页、状态标签、行操作和横向 overflow。
- Icon-only button 必须有可访问名称。
- 状态表达不能只靠颜色，必须有文本。

## TDD

每个前端切片必须：

1. RED：先写一个用户可观察行为测试。
2. GREEN：最小实现。
3. REFACTOR：全绿后整理组件、mapper、query key 和样式。

优先测试：

- API client/envelope/idempotency。
- mapper 输入输出。
- permission map。
- 表单 validation。
- 页面级角色可见性。
- 标准错误 `{ error: { code, message, details, request_id } }` 展示。
- 页面成功反馈、query invalidation、URL filter/query 序列化。

## 验证

常用命令：

```bash
npm run web:test
npm run web:build
npm run typecheck
npm run lint
```

每两个前端切片后追加：

```bash
npm test
npm run prisma:validate
```

## 问题记录

出现测试、类型、lint、构建、API contract 问题后，主 agent 工作记录必须写：

- 问题原因。
- 修复方式。
- 如何避免复发。
