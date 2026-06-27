# 实验动物销售管理系统 — 代码审查流程

> 版本: v1.0
> 状态: 正式执行
> 依据: [code-review-standard.md](./code-review-standard.md)、[AGENTS.md](../../AGENTS.md)
> 范围: PR 生命周期、审查角色、流转规则、SLA、冲突处理、度量

---

## 1. 流程总览

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
 │ 开发完成 │───→│ 自查+提交 │───→│ 审查分配  │───→│ 审查反馈  │───→│ 合并/拒绝 │
 │ 本地通过  │    │ PR       │    │          │    │          │    │          │
 └─────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                     │               │
                                     │               ▼
                                     │          ┌──────────┐
                                     │          │ 修改+重提 │
                                     │          └─────┬────┘
                                     │                │
                                     └────────────────┘
                                        (循环直到通过)
```

---

## 2. 角色定义

| 角色 | 职责 | 谁来担任 |
| --- | --- | --- |
| **作者 (Author)** | 编写代码、自查、提交 PR、响应反馈、推动合并 | 任何提交代码的开发者 |
| **审查者 (Reviewer)** | 按 [审查标准](./code-review-standard.md) 检查代码，给出分级反馈 | 指定的审查者 |
| **模块负责人 (Module Owner)** | 对特定模块的架构一致性负责，有最终裁决权 | 见 §3 模块负责人表 |
| **仲裁者 (Arbiter)** | 审查分歧无法达成共识时做最终决策 | 技术负责人 |

### 2.1 模块负责人表

| 模块 | 目录 | 负责人 | 参考 Agent 文件 |
| --- | --- | --- | --- |
| Domain policy | `src/server/domain/` | 待指定 | `.agents/agents/domain-policy-agent.md` |
| API routes | `src/server/api/routes/` | 待指定 | `.agents/agents/api-route-agent.md` |
| API schemas | `src/server/api/schemas/` | 待指定 | `.agents/agents/schema-validation-agent.md` |
| Auth/session | `src/server/application/auth/` | 待指定 | `.agents/agents/auth-agent.md` |
| Orders | `src/server/application/orders/` | 待指定 | `.agents/agents/orders-agent.md` |
| Delivery | `src/server/application/delivery/` | 待指定 | `.agents/agents/delivery-agent.md` |
| Inventory | `src/server/application/inventory/` | 待指定 | `.agents/agents/inventory-agent.md` |
| Customers | `src/server/application/customers/` | 待指定 | `.agents/agents/customers-agent.md` |
| Catalog/pricing | `src/server/application/catalog/` | 待指定 | `.agents/agents/catalog-agent.md` |
| Documents | `src/server/application/documents/` | 待指定 | `.agents/agents/documents-agent.md` |
| Prisma/infrastructure | `src/server/infrastructure/` | 待指定 | `.agents/agents/prisma-infrastructure-agent.md` |

> 模块负责人待团队确认后填入。PR 涉及某模块时，该模块负责人为默认审查者之一。

---

## 3. PR 提交前：作者自查

### 3.1 本地验证（必须全部通过）

```bash
npm run typecheck   # TypeScript 编译无错
npm run lint        # ESLint 无错
npm test            # 全部测试通过
```

> 如果 Prisma schema 有变更，还需：`npm run prisma:validate && npm run prisma:generate`

### 3.2 自查清单

作者提交 PR 前必须对照 [审查标准 §9 快速自查矩阵](./code-review-standard.md) 逐项检查。PR 描述中应包含自查结果。

### 3.3 PR 描述规范

PR 描述必须包含以下内容：

```markdown
## 变更说明
<!-- 简述做了什么、为什么做 -->

## 变更类型
<!-- 勾选适用项 -->
- [ ] 新功能 (feature)
- [ ] Bug 修复 (bugfix)
- [ ] 重构 (refactor)
- [ ] 安全修复 (security)
- [ ] 数据库变更 (migration)
- [ ] 文档 (docs)

## 影响范围
<!-- 涉及哪些模块/端点，是否有破坏性变更 -->

## 测试
<!-- 新增/修改了哪些测试，覆盖了什么场景 -->

## 自查结果
- [ ] typecheck 通过
- [ ] lint 通过
- [ ] test 通过
- [ ] 已对照审查标准自查

## 关联
<!-- 关联的 issue/需求/ADR -->
```

---

## 4. PR 提交后：审查分配

### 4.1 分配规则

| PR 规模 | 审查者数量 | 分配方式 |
| --- | --- | --- |
| 小型（< 100 行变更，单模块） | 1 人 | 涉及模块的负责人 |
| 中型（100-500 行，跨 1-2 模块） | 2 人 | 涉及模块的负责人 + 1 人随机 |
| 大型（> 500 行，跨 3+ 模块） | 2-3 人 | 涉及模块的负责人 + 技术负责人 |
| 安全/迁移相关 | 2 人 | 必须包含技术负责人 |

### 4.2 回避规则

- 作者不能审查自己的 PR。
- 如果 PR 修改了审查标准本身，需技术负责人参与审查。

### 4.3 分配时效

| 动作 | SLA |
| --- | --- |
| 审查者认领/开始审查 | PR 提交后 **4 小时内**（工作时间内） |
| 首轮审查反馈完成 | 认领后 **1 个工作日内** |
| 作者响应审查意见 | 收到反馈后 **1 个工作日内** |

> 超过 SLA 未响应时，可在团队群内 @提醒。超过 2 个工作日未审查的 PR 可申请升级到技术负责人重新分配。

---

## 5. 审查执行

### 5.1 审查顺序

建议按以下顺序审查，从高优先级到低优先级：

1. **🔴 Blocker** — 先扫安全、正确性、契约、数据完整性
2. **🟡 Suggestion** — 再看输入校验、测试、性能、可维护性
3. **💭 Nit** — 最后看风格、命名、文档

### 5.2 审查步骤

```
1. 读 PR 描述，理解意图和影响范围
2. 检查 CI 是否通过（typecheck / lint / test）
3. 按 module 边界读 diff，先看 domain → application → api → infrastructure
4. 对照审查标准逐项检查
5. 确认测试覆盖了关键行为路径
6. 检查是否有文档需要同步
7. 提交审查意见，标注严重等级
8. 给出 Approve / Request Changes / Comment 结论
```

### 5.3 审查结论

| 结论 | 含义 | 后续动作 |
| --- | --- | --- |
| ✅ Approve | 代码质量达标，可以合并 | 作者可合并 |
| 🔄 Request Changes | 有 🔴 Blocker 或重要 🟡 需修复 | 作者修改后重新请求审查 |
| 💬 Comment | 无阻塞性问题，有建议或疑问 | 作者酌情处理，无需重新审查 |

### 5.4 批量审查原则

- **一次审查，完整反馈** — 不要分多轮逐条提意见，一轮把所有问题说清楚。
- **按文件逐个完成** — 审完一个文件再下一个，避免遗漏。
- **先理解再评判** — 不确定意图时先问，不要假设是错的。

---

## 6. 修改与重审循环

### 6.1 流程

```
审查者 Request Changes
        │
        ▼
作者修改代码 → 推送新 commit → 重新请求审查
        │
        ▼
审查者检查修改 → Approve / 继续 Request Changes
```

### 6.2 循环控制

| 规则 | 说明 |
| --- | --- |
| 最大循环次数 | 同一 PR 不超过 **3 轮** Request Changes |
| 超过 3 轮 | 升级到技术负责人介入，评估是否需要面对面讨论 |
| 已解决的意见 | 审查者应标记 "resolved" 或作者回复后审查者确认 |

### 6.3 Commit 规范

- 修复审查意见的 commit 应清晰描述修复了什么。
- 不要 force push 覆盖审查者已看过的 commit（除非 squash 合并时）。
- 大型修改建议分 commit 提交，方便审查者跟踪变更。

---

## 7. 合并规则

### 7.1 合并条件

```
□ 至少获得规定数量的 Approve（见 §4.1）
□ 无未解决的 🔴 Blocker
□ CI 全部通过（typecheck / lint / test）
□ Prisma migration 已验证（如涉及）
□ PR 描述完整，自查清单已勾选
```

### 7.2 合并方式

| 方式 | 适用场景 | 说明 |
| --- | --- | --- |
| Squash Merge | 默认方式 | 将多个 commit 压缩为一个，保持 main 历史干净 |
| Rebase Merge | 需保留细粒度 commit 历史时 | 保持每个 commit 独立但线性历史 |
| Merge Commit | 大型特性分支合并时 | 保留分支拓扑结构 |

> 默认使用 Squash Merge。合并后删除特性分支。

### 7.3 紧急修复 (Hotfix) 快速通道

生产紧急 bug 修复可走快速通道：

1. 作者提交 PR 并标注 `hotfix`。
2. 技术负责人优先审查（SLA: 1 小时内）。
3. 合并后立即在同一 PR 或 follow-up PR 中补测试。
4. 补测试的 PR 不得关闭，直到覆盖了 hotfix 修复的行为。

---

## 8. 冲突处理

### 8.1 常见冲突类型

| 类型 | 示例 | 处理方式 |
| --- | --- | --- |
| 技术分歧 | 审查者要求用方案 A，作者坚持方案 B | 见 §8.2 |
| 严重等级争议 | 审查者标 🔴，作者认为应为 🟡 | 见 §8.3 |
| 范围争议 | 审查者要求顺便重构相邻代码，作者认为超出 PR 范围 | 见 §8.4 |

### 8.2 技术分歧处理

```
1. 双方在 PR 评论中各自说明理由和权衡
2. 如果涉及模块架构，@模块负责人裁决
3. 模块负责人 1 个工作日内给出结论
4. 如果模块负责人也无法定夺，升级到技术负责人（仲裁者）
5. 仲裁者决策为最终决策，双方执行
```

### 8.3 严重等级争议

- 如果作者认为 🔴 应降级为 🟡，需在评论中说明**为什么这不是 Blocker**（不会导致安全/数据/契约问题）。
- 审查者有权坚持 🔴，但需给出具体的风险场景。
- 如果无法达成一致，由技术负责人裁定。

### 8.4 范围争议

- 审查者可以提出"顺便修复"的建议，但应标为 💭 Nit 或另开 issue。
- 作者有权拒绝超出当前 PR 范围的修改要求。
- 如果审查者发现相邻代码有 🔴 Blocker 级别的问题，应要求作者在本 PR 或新 PR 中修复，不得视而不见。

---

## 9. 度量与改进

### 9.1 健康指标

| 指标 | 目标 | 说明 |
| --- | --- | --- |
| PR 首轮审查 SLA 达成率 | ≥ 90% | 提交后 1 个工作日内完成首轮 |
| PR 平均合并周期 | ≤ 2 个工作日 | 从提交到合并 |
| 审查循环次数 | 平均 ≤ 1.5 轮 | 超过说明自查不够或审查标准不清晰 |
| 🔴 Blocker 合并率 | 0% | 不允许任何 Blocker 进入 main |
| 测试覆盖率 | ≥ 80% | 全局覆盖率不下降 |

### 9.2 定期回顾

| 频率 | 内容 |
| --- | --- |
| 每两周 | 回顾近期 PR 的审查质量，讨论是否有标准需要调整 |
| 每月 | 统计度量指标，识别瓶颈（如某模块审查延迟严重） |
| 每季度 | 评估审查标准是否与项目演进同步，更新文档 |

### 9.3 知识沉淀

- 典型 🔴 Blocker 案例应沉淀到 [issue-cause-memory.md](../../.agents/rules/issue-cause-memory.md) 的 Prevention 部分。
- 反复出现的 🟡 Suggestion 如果具有普遍性，应考虑加入 lint 规则或 CI 检查，从审查中自动化掉。
- 审查中发现的标准模糊地带，应更新本流程文档和审查标准文档。

---

## 10. 新人引导

新加入团队的开发者在首次提交 PR 前：

1. **阅读** [AGENTS.md](../../AGENTS.md) 和 [审查标准](./code-review-standard.md)。
2. **配对审查** — 首次 PR 与模块负责人或技术负责人进行面对面/屏幕共享的实时审查，边审边讲解项目约定。
3. **观察期** — 前 3 个 PR 由指定导师作为审查者，重点引导而非拦截。
4. **成为审查者** — 完成 3 个被审查的 PR 且无 🔴 Blocker 后，可开始审查他人代码。

---

## 11. 流程检查清单

团队落地本流程时，确认以下事项：

```
□ 模块负责人已指定并填入 §2.1
□ 技术负责人（仲裁者）已确认
□ PR 模板已配置（见 code-review-templates.md）
□ CI pipeline 包含 typecheck / lint / test
□ 团队已通读审查标准和本流程文档
□ 首次试运行已完成（选 1-2 个已有 PR 按新标准走一遍）
□ 度量指标基线已记录
```
