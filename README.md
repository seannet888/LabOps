# LabOps

实验动物销售管理系统 MVP。当前仓库包含 Fastify + Prisma 后端、Vite + React 前端、Prisma migrations、mock seed 与测试/E2E 脚手架。

## 技术栈

- Backend: Fastify, TypeScript, Prisma, PostgreSQL
- Frontend: Vite, React, TypeScript, TanStack Query, React Hook Form, Zod
- Testing: Vitest, Testing Library, Playwright
- UI: LabOps Compact Console, data-dense dashboard, light-first admin UI

## 本地启动

前置要求：

- Node.js
- npm
- Docker Desktop

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1 -ResetMockData
```

Linux/macOS:

```bash
chmod +x ./start-dev.sh
./start-dev.sh --reset-mock-data
```

启动后：

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:3000/api/v1/me

## 本地开发账号

Mock seed 会创建以下本地开发账号：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | `admin` | `admin-dev-password` |
| 销售 | `sales01` | `sales-dev-password` |
| 后勤 | `log01` | `logistics-dev-password` |

这些账号只用于本地 dev DB 和 E2E，不得用于生产环境。

## 环境变量

复制 `.env.example` 为 `.env`，然后按环境修改：

```bash
cp .env.example .env
```

本地 Docker PostgreSQL 默认连接：

```env
DATABASE_URL="<your-local-database-url>"
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD="<your-local-admin-password>"
BOOTSTRAP_ADMIN_DISPLAY_NAME=系统管理员
```

`.env` 不会提交到仓库。

## 常用命令

```bash
npm install
npm run db:dev:up
npm run prisma:migrate:deploy
npm run db:seed:mock
npm run api:dev
npm run web:dev
```

验证：

```bash
npm test
npm run web:test
npm run typecheck
npm run lint
npm run prisma:validate
npm run web:build
```

E2E：

```bash
npm run e2e:web:prepare
npm run web:e2e
```

`e2e:web:prepare` 会 reset 本地 Docker dev DB，只能用于本地开发库，不要对真实或共享数据库运行。

## 数据与上传说明

仓库只提交源码、Prisma schema/migrations、文档、测试和 mock seed 脚本，不提交本地数据。

已忽略：

- `.env`
- `node_modules/`
- `dist/`
- `coverage/`
- `test-results/`
- `tmp/`
- `.workbuddy/`
- `*.db`, `*.sqlite`, `*.sqlite3`

真实数据、外部 PostgreSQL 连接串和生产管理员密码必须通过环境变量或部署平台 secret 管理。

## 项目结构

```text
src/server/          Backend domain/application/api/infrastructure
src/web/             Frontend SPA
prisma/              Prisma schema and migrations
scripts/             DB bootstrap/reset/mock seed scripts
e2e/                 Service and Playwright smoke tests
docs/                Product, architecture, ADR and review docs
.agents/             Project agent/rule instructions
```

## 重要边界

- API 使用 `/api/v1`，响应 envelope 遵守 `docs/architecture/api-contract.md`。
- 前端组件不直接散落后端 `snake_case` DTO，必须通过 feature mapper。
- 所有副作用 command 必须带 `Idempotency-Key`。
- 金额字段保持 decimal string，不用 JavaScript number 做金额计算。
- 出库事实以用户确认提交的 `stock_deductions` 为准，配送建议只做建议。
- Prisma schema/migrations 是唯一 DDL owner，禁止手工修改共享/生产库结构。
