# 代码审查体系 — 总览

> 本目录定义了实验动物销售管理系统的代码审查标准与流程。

## 文档索引

| 文档 | 内容 | 读者 |
| --- | --- | --- |
| [code-review-standard.md](./code-review-standard.md) | 审查优先级定义、项目专属检查项、分层审查规则、严重等级判定 | 全体开发者 |
| [code-review-process.md](./code-review-process.md) | PR 生命周期、审查角色、SLA、冲突处理、度量指标 | 全体开发者 |
| [code-review-templates.md](./code-review-templates.md) | PR 模板、自查清单、审查评论模板、模块速查卡 | 全体开发者 |

## 快速上手

### 如果你是 PR 作者

1. 本地验证：`npm run typecheck && npm run lint && npm test`
2. 对照 [自查清单](./code-review-templates.md#2-提交前自查清单) 逐项检查
3. 用 [PR 描述模板](./code-review-templates.md#1-pr-描述模板) 提交 PR
4. 响应审查意见，修复 🔴 Blocker 后重新请求审查

### 如果你是审查者

1. 按 [审查标准](./code-review-standard.md) 检查代码
2. 意见必须标注严重等级：🔴 Blocker / 🟡 Suggestion / 💭 Nit
3. 用 [审查评论模板](./code-review-templates.md#4-审查评论模板) 提交反馈
4. 给出 Approve / Request Changes / Comment 结论

### 如果你是新人

1. 阅读 [AGENTS.md](../../AGENTS.md) 了解项目约定
2. 通读 [审查标准](./code-review-standard.md)
3. 前 3 个 PR 由导师配对审查
4. 详见 [流程 §10 新人引导](./code-review-process.md)

## 核心原则

```
1. 守住红线 — 🔴 Blocker 合并前必须拦截
2. 对齐约定 — 架构分层、模块边界、API 契约保持一致
3. 促进成长 — 每条意见解释 "为什么"
4. 一次到位 — 一轮审查给出完整反馈，不拖泥带水
5. 对事不对人 — 聚焦代码质量和业务影响
```
