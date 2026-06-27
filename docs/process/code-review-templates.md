# 实验动物销售管理系统 — 代码审查模板与检查清单

> 版本: v1.0
> 状态: 正式执行
> 依据: [code-review-standard.md](./code-review-standard.md)、[code-review-process.md](./code-review-process.md)

本文提供可直接复用的模板和检查清单。复制到 PR 描述、审查评论或团队 Wiki 中使用。

---

## 1. PR 描述模板

提交 PR 时，作者复制以下模板填入 PR 描述：

```markdown
## 变更说明
<!-- 简述做了什么、为什么做。1-3 句话。 -->

## 变更类型
- [ ] 新功能 (feature)
- [ ] Bug 修复 (bugfix)
- [ ] 重构 (refactor)
- [ ] 安全修复 (security)
- [ ] 数据库变更 (migration)
- [ ] 文档 (docs)

## 影响范围
<!-- 涉及哪些模块/端点？是否有破坏性变更？ -->

## 测试说明
<!-- 新增/修改了哪些测试？覆盖了什么场景？ -->

## 自查结果
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm test` 通过
- [ ] 已对照 [审查标准自查矩阵](./docs/process/code-review-standard.md#9-快速自查矩阵) 检查

## 关联
<!-- 关联的 issue / 需求 / ADR -->
```

---

## 2. 提交前自查清单

作者提交 PR 前逐项打勾：

### 2.1 通用项

```
□ typecheck 通过
□ lint 通过
□ test 通过
□ 无 console.log / debug 残留
□ 无硬编码密码 / token / 连接串
□ 无 .env 文件被提交
```

### 2.2 API 路由变更

```
□ 路由以 /api/v1 开头
□ 有 requireAuth preHandler
□ 写操作有 requireRole 限制
□ 副作用命令端点传了 Idempotency-Key
□ 请求体/query 用 Zod schema 校验
□ 响应用了 { data } / { data, meta, links } envelope
□ JSON 字段是 snake_case
□ 金额用 decimal string
□ 路由层映射了 DTO，没直接返回 ORM entity
□ 路由层不含业务逻辑（只做认证/权限/校验/调用/映射）
```

### 2.3 Application Service 变更

```
□ 没有 import @prisma/client
□ 没有 import fastify 或 HTTP 相关
□ 可预期失败抛出 ApplicationError
□ 跨表多写用了 TransactionRunner
□ 副作用操作写了审计日志（如适用）
```

### 2.4 Domain Policy 变更

```
□ 没有 import HTTP / Prisma / 文件系统 / 时间副作用
□ 纯函数，输入 → 输出确定
□ 状态转换通过集中管理的策略函数
□ 新状态/转换有对应测试
```

### 2.5 Prisma / Migration 变更

```
□ schema.prisma 变更生成了 migration
□ npm run prisma:validate 通过
□ npm run prisma:generate 通过
□ 已部署 migration 未被修改（只新增）
□ data backfill 与 schema migration 分开
□ 无手工 ALTER TABLE（dev 环境除外，需注明）
```

### 2.6 测试变更

```
□ 新行为有对应测试
□ 测试通过 public interface 测行为，不测私有实现
□ 覆盖了正常路径和异常路径
□ 覆盖了边界条件（空值/零值/超长/并发）
□ 测试命名描述了被测行为
□ npm run test:coverage 未降低整体覆盖率
```

---

## 3. 审查者检查清单

审查者按以下清单逐项检查，发现问题用 [审查标准 §2.1](./code-review-standard.md) 的格式提交评论。

### 3.1 🔴 Blocker 专项

```
安全:
□ S1 所有非 login 路由有 requireAuth
□ S2 写操作有 requireRole
□ S3 权限矩阵正确（销售≠出库确认，后勤≠改价）
□ S4 无用户输入拼接到 raw SQL
□ S5 错误响应不泄漏堆栈/SQL/路径/密码
□ S6 副作用命令要求 Idempotency-Key

正确性:
□ C1 状态转换通过域策略函数
□ C2 跨表多写用 TransactionRunner
□ C3 库存预占/释放/扣减在同一事务
□ C4 可预期失败抛 ApplicationError
□ C5 非空断言 (!) 前确认了 preHandler 保证

契约:
□ A1 响应用 { data } envelope
□ A2 错误用 { error: { code, message, ... } }
□ A3 JSON 字段 snake_case
□ A4 金额 decimal string
□ A5 HTTP 状态码符合规范
□ A6 路由 /api/v1 前缀

数据:
□ D1 无物理删除业务数据
□ D2 高风险操作写审计日志
□ D3 migration forward-only
□ D4 Application/Domain 不 import @prisma/client
```

### 3.2 🟡 Suggestion 专项

```
校验:
□ V1 请求体用 Zod 校验（非 as 断言）
□ V2 分页 per_page ≤ 100
□ V3 枚举字段用 Zod enum
□ V4 排序字段在白名单内

测试:
□ T1 通过 public interface 测行为
□ T2 遵循 Red-Green-Refactor
□ T3 边界用例覆盖
□ T4 状态机正/反路径覆盖
□ T5 覆盖率 ≥ 80%

性能:
□ P1 无 N+1 查询
□ P2 无不必要大对象拷贝
□ P3 Prisma 查询用 select 限定字段
□ P4 新 filter 字段有索引

可维护性:
□ M1 命名表意清晰
□ M2 函数 < 50 行
□ M3 重复逻辑已抽取
□ M4 DTO 显式映射
□ M5 无滥用 any
```

### 3.3 💭 Nit 专项

```
□ N1 风格问题交给 ESLint，不在审查中提
□ N2 复杂逻辑有注释
□ N3 API 变更已同步 api-contract.md
□ N4 备选方案最多提 1-2 条
```

---

## 4. 审查评论模板

### 4.1 🔴 Blocker 模板

```
🔴 **[类别]: 简述问题**
`文件路径:行号`

**原因:** [为什么这是问题，会导致什么后果]

**建议:** [具体修改方案]
```

### 4.2 🟡 Suggestion 模板

```
🟡 **[类别]: 简述建议**
`文件路径:行号`

**原因:** [当前写法的不足或风险]

**建议:** [改进方案，可附代码示例]
```

### 4.3 💭 Nit 模板

```
💭 **Nit: 简述**
`文件路径:行号`

[简短建议，1-2 句话即可]
```

### 4.4 正面反馈模板

```
✅ **好的实践: 简述**
`文件路径:行号`

[为什么这个写法好，值得保持]
```

### 4.5 提问模板

```
❓ **疑问: 简述**
`文件路径:行号`

[我不确定这里的意图是什么，是因为 X 吗？]
```

---

## 5. 审查总结模板

审查者在完成审查后，给出总结评论：

### 5.1 Approve 总结

```markdown
## 审查总结: ✅ Approve

**整体评价:** [1-2 句话评价代码质量]

**亮点:**
- [值得肯定的设计或实现]

**非阻塞建议（可选后续处理）:**
- 💭 [可以在后续 PR 中处理的建议]

**结论:** 代码质量达标，可以合并。
```

### 5.2 Request Changes 总结

```markdown
## 审查总结: 🔄 Request Changes

**整体评价:** [1-2 句话评价]

**必须修复 (🔴 Blocker):**
1. [文件:行号] — [问题简述]
2. [文件:行号] — [问题简述]

**建议修复 (🟡 Suggestion):**
1. [文件:行号] — [建议简述]

**结论:** 修复 🔴 Blocker 后重新请求审查。🟡 建议可酌情处理。
```

### 5.3 Comment 总结

```markdown
## 审查总结: 💬 Comment

**整体评价:** [1-2 句话评价]

**无阻塞性问题。** 以下建议供参考：
- 🟡 [建议简述]
- 💭 [建议简述]

**结论:** 无需重新审查，建议后续迭代时参考。
```

---

## 6. 模块审查速查卡

针对不同模块的审查重点速查。审查时快速定位该模块的关键检查项。

### 6.1 API Routes (`src/server/api/routes/`)

```
重点:
□ requireAuth + requireRole 配置正确
□ Idempotency-Key 传递
□ Zod 校验（非 as 断言）
□ DTO 映射（非直接返回 ORM entity）
□ { data } envelope
□ snake_case 字段
□ 路由层无业务逻辑
```

### 6.2 API Schemas (`src/server/api/schemas/`)

```
重点:
□ Zod schema 覆盖所有必填字段
□ 枚举值与 api-contract.md 一致
□ 金额用 string + regex 校验
□ 分页参数有边界限制
□ 可选字段用 .optional()
□ 未知字段策略明确（默认拒绝）
```

### 6.3 Application Services (`src/server/application/`)

```
重点:
□ 无 @prisma/client import
□ 无 HTTP import
□ ApplicationError 用于可预期失败
□ TransactionRunner 包裹跨表多写
□ 审计日志写入（高风险操作）
□ 幂等仓库正确使用
□ 接口定义清晰（AppDependencies）
```

### 6.4 Domain Policies (`src/server/domain/`)

```
重点:
□ 纯函数，无副作用
□ 无 HTTP/Prisma/FS/time import
□ 状态转换集中管理
□ 类型完整，无 any
□ 策略函数有完整测试
□ 不可变数据结构 (ReadonlySet 等)
```

### 6.5 Infrastructure / Prisma (`src/server/infrastructure/`)

```
重点:
□ Repository 实现 application 接口
□ Prisma entity 不外泄（映射为 domain type）
□ 查询用 select/include 限定字段
□ 无 N+1 查询
□ 事务正确使用
□ migration forward-only
□ 无手工 ALTER TABLE（生产）
```

### 6.6 Tests (`*.test.ts`)

```
重点:
□ 测试行为而非实现细节
□ 命名描述被测行为（"should ... when ..."）
□ 正常路径 + 异常路径 + 边界
□ 无测试间依赖（可独立运行）
□ mock/stub 最小化，测真实行为
□ 覆盖率不降低
```

---

## 7. 常见反模式速查

审查中遇到以下模式时应标记：

| 反模式 | 等级 | 说明 |
| --- | --- | --- |
| `request.body as {...}` 无 Zod | 🟡 | 直接断言不校验，运行时行为不明确 |
| `request.user!.id` 无 preHandler 保证 | 🔴 | 非空断言前未确认认证已执行 |
| Application 层 `import { PrismaClient }` | 🔴 | 分层依赖违反 |
| Domain 层 `import { FastifyRequest }` | 🔴 | 分层依赖违反 |
| 路由直接返回 `prisma.order.findMany()` 结果 | 🔴 | ORM entity 泄漏到 API |
| 金额用 `number` 类型 | 🔴 | 浮点精度问题 |
| `prisma.$queryRaw(\`SELECT ... ${input}\`)` | 🔴 | SQL 注入风险 |
| 副作用命令无 `Idempotency-Key` | 🔴 | 重复提交导致数据损坏 |
| 状态直接赋值 `order.status = "shipped"` | 🔴 | 绕过域策略状态机 |
| `try { ... } catch (e) { /* 忽略 */ }` | 🟡 | 静默吞错误 |
| 测试中 `expect(result).toBeTruthy()` | 🟡 | 断言过弱，不验证具体值 |
| 函数 > 100 行 | 🟡 | 圈复杂度过高 |
| `any` 类型无注释 | 🟡 | 类型安全缺失 |
| 变量名 `data`, `tmp`, `obj`, `x` | 💭 | 命名不表意 |
