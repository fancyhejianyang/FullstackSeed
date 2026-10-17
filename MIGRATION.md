# MIGRATION.md — 后端标准模块迁移文档

> 本文档罗列 FullstackSeed 后端的**标准基础设施模块**，用于将本种子复刻到新项目时，明确哪些必须迁移、哪些可选、迁移步骤与依赖清单。
> 配套规则见 `AGENTS.md`。前端迁移见文末「前端对应」。

## 一、模块分层与迁移优先级

### 必迁模块（基础设施，新项目直接复制）

> 这些是骨架级公共能力，任何新项目都应原样迁移。

| 模块/路径 | 作用 | 说明 |
| --- | --- | --- |
| `src/main.ts` | 应用入口 | helmet/CORS、全局前缀 `api`、ValidationPipe、全局拦截器/过滤器、Swagger |
| `src/app.module.ts` | 根模块 | ConfigModule + Joi 校验、TypeORM 自动建库 + 按 `NODE_ENV` 甄别 `synchronize`、全局 JwtAuthGuard + PermissionsGuard |
| `src/common/entities/base.entity.ts` | 实体基类 | id + 创建/更新/软删除时间戳 |
| `src/common/decorators/public.decorator.ts` | `@Public()` | 标记免鉴权接口 |
| `src/common/decorators/require-permissions.decorator.ts` | `@RequirePermissions()` | 标记接口所需权限码 |
| `src/common/decorators/current-user.decorator.ts` | `@CurrentUser()` + `AuthUser` | 注入当前登录用户（含 `isAdmin`/roles/permissions） |
| `src/common/guards/jwt-auth.guard.ts` | 登录守卫 | 全局，`@Public()` 放行 |
| `src/common/guards/permissions.guard.ts` | 权限守卫 | 全局，`isAdmin` 放行一切，否则校验权限码 |
| `src/common/interceptors/transform.interceptor.ts` | 成功响应封装 | `{ statusCode, data, success, message, timestamp }` |
| `src/common/filters/http-exception.filter.ts` | 错误响应封装 | `{ ..., success:false }` |
| `src/auth/**` | 鉴权模块 | login/profile、JwtStrategy、JwtModule、LoginDto |
| `src/users/**` | 用户/账号模块 | User 实体（含 `isAdmin`）、CRUD、**启动 seed：建权限点 + admin 角色 + 默认超管 `root`** |
| `src/roles/**` | 角色模块 | RBAC 角色 CRUD |
| `src/permissions/**` | 权限模块 | RBAC 权限点 CRUD |

### 可选模块（业务示例，按需保留/删除）

| 模块/路径 | 作用 | 说明 |
| --- | --- | --- |
| `src/articles/**` | 示例 CRUD demo | 仅作 CRUD 范例，新项目可删除或替换为真实业务模块 |
| `src/app.controller.ts` / `src/app.service.ts` | 根路由 demo | `GET /api` 健康检查，可保留 |

### 新业务模块（在新项目里按规范新增）

参照 `articles/` 分层：`entities/*.entity.ts` → `dto/*.dto.ts` → `*.service.ts` → `*.controller.ts` → `*.module.ts`，并：
1. 在 controller 用 `@RequirePermissions('Module.action')`（权限码格式见下）
2. 在 `users.service.ts` 的 `SEED_PERMISSIONS` 补该模块权限点
3. 在 `app.module.ts` imports 挂载模块

## 二、核心约定（迁移时必须保持一致）

- **统一响应结构**：`{ statusCode, data, success, message, timestamp }`（前端 Axios 按此拆包）
- **权限码格式**：`Module.action`，模块名首字母大写 + 点号，如 `Role.read`、`User.create`、`Article.view`
- **鉴权链路**：`JwtAuthGuard`（是否登录）→ `PermissionsGuard`（是否有权限）；`isAdmin===true` 放行一切
- **默认超级管理员**：用户名 `root` / 密码 `root123`，`isAdmin=true`，用户表为空时启动自动创建
- **自动建库 + synchronize**：首启自动 `CREATE DATABASE IF NOT EXISTS`；`synchronize` 仅非生产开启（生产用 migration）

## 三、迁移步骤

1. 复制 `server/` 工程配置：`package.json` / `tsconfig*.json` / `nest-cli.json` / `eslint.config.mjs` / `.prettierrc` / `.gitignore`
2. 复制「必迁模块」全部源码（见上表）
3. 复制 `.env.example` → 新建 `.env`，按新项目改 `DB_*` / `JWT_SECRET` / `DB_NAME`
4. 删除/替换「可选模块」（如 `articles/`）为真实业务
5. `npm install` 安装依赖
6. `npm run start:dev` 启动（首启自动建库 + seed `root` 超管）
7. 访问 `/docs` 核对接口；用 `root/root123` 登录联调

## 四、依赖清单（package.json）

### 运行依赖
```
@nestjs/common @nestjs/core @nestjs/platform-express
@nestjs/config @nestjs/jwt @nestjs/passport @nestjs/swagger @nestjs/typeorm
typeorm mysql2 bcrypt passport passport-jwt
class-transformer class-validator joi helmet
reflect-metadata rxjs swagger-ui-express
```

### 开发依赖（鉴权相关类型）
```
@types/bcrypt @types/passport-jwt @types/express @types/node
@nestjs/cli @nestjs/schematics @nestjs/testing
eslint prettier 等工具链
```

## 五、环境变量（.env）

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `PORT` | 服务端口 | `3000` |
| `NODE_ENV` | 运行环境（控制 synchronize） | `development` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` | MySQL 连接 | — |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | JWT 密钥与有效期 | `7d` |
| `BCRYPT_SALT_ROUNDS` | bcrypt 加密强度 | `10` |

> ⚠️ `.env` 含敏感信息，禁止提交；仅维护 `.env.example`。

## 六、前端对应（web/）

新项目若同时迁前端，配套迁移：
- 基建：`utils/request.ts`（Axios 封装，响应拆包 + token 注入）、`stores/user.ts`（登录态 + `hasPermission`/`isAdmin`）、`router/`（守卫）、`layouts/MainLayout.vue`、`styles/`（SCSS token/工具类）
- 通用组件：`components/`（`Table` / `Form` / `Dialog` / `PageContainer`）
- 业务页面规范：`views/<module>/` 下 `Index.vue` + `Edit.vue`（详情 `View.vue`），列表用 Table 传 `perm-module`
- 默认登录：`root / root123`

## 七、应用并发、排队与人工客服（2026-10-09）

本次为增量接待能力：保留原知识库、SKU 查询、工作流与 AI 问答记录，新增 `customer-service/` 调度模块及工作台。客服 H5 已纳入主仓库，正式入口和配置见 [`customer-service-h5/RECEPTION.md`](customer-service-h5/RECEPTION.md)。

### 部署顺序与兼容性

1. 备份数据库。生产环境先在 `server/` 执行 `npm run migration:run`，本次迁移为 `1788911200000-AddCustomerServiceReception.ts`；已有历史迁移应已正常纳入迁移记录。
2. 构建并重启后端，然后同步发布后台 Web 和 H5。开发环境通过重启后的 TypeORM synchronize 添加字段和表；本次编码验证不自动重启既有业务服务。
3. 在“聊天应用”填写“AI 最大并发会话数”（1～1000）；留空为不限额。人工接待与排队不占名额，同一会话只允许一轮 AI 问答处于排队/执行/取消中。
4. 为客服角色分配 `CustomerService.read`（查看）、`CustomerService.update`（接手/结束）、`CustomerService.create`（发送），重新登录刷新权限。工作台是独立根菜单 `/customer-service`，不是超管专属“聊天管理”的子菜单。首版获授权客服可查看本企业所有应用的会话，不是多租户分应用授权系统。
5. 配置 H5 的 API 地址、appid 和 HTTPS；代理须允许 `appid`、`x-session-token` 请求头及会话 SSE，关闭 SSE 缓冲并确保空闲超时大于 15 秒心跳间隔。

旧 `POST /knowledge-ai-chat/sessions/init` 和 `POST /knowledge-ai-chat/ask/stream` URL 保留，但统一经过新调度器。初始化会额外返回 `sessionToken`，后续读写必须在 `x-session-token` 中携带；旧流式客户端还必须提交 `clientMessageId`。旧客户端需要同步升级，不能通过旧 URL 绕过并发与会话归属校验。新 H5 使用 `/customer-service/sessions/*`，按标签页恢复接待，显式“新聊天”创建新会话。旧的无凭证历史只能本地只读，不能凭数字 ID 认领；旧后台 AI 测试记录仍可查看。

### 接待规则与运行边界

- 每个应用按 FIFO 调度；名额覆盖整轮提词、检索、生成和最终保存，结束后释放。人工接手会原子撤销排队并中止执行中的 AI；取消中的任务等实际执行结束才释放名额。调低限额不会强制中断现有回答。
- 访客转人工进入 `waiting_human`，客服领取后进入 `human`。等待人工可自行返回 AI，但不重放已取消的问题；人工接待结束后为 `closed`，继续咨询须新建会话。
- 服务端保护值：每应用最多 200 条待执行任务、最长排队 15 分钟、整轮 AI 执行上限 180 秒；它们不是应用每分钟限流，也不限制人工坐席数量。
- 首版只支持同一数据库一个服务进程，以专用 MySQL 连接持有命名锁；第二实例启动会明确失败。失去锁时停止接收新任务并取消执行，需要排查连接后重启。不要以 PM2 cluster 或多副本方式部署；未来多实例需要共享取消与事件通道，不只是共享计数。
- 排队、消息落库；服务重启恢复排队，已中断的执行不自动重跑模型。短暂收尾写入失败保留占位并重试落库，防止重复调用模型。SSE 断开只取消订阅，不取消任务；客户端重连从数据库快照补消息。
- 访客会话使用独立随机凭证，数据库仅存摘要，凭证不放入 URL。共享浏览器本地历史仍可能共享访问能力，不等同于登录用户隔离。人工消息和系统通知不伪装成带 Token 消耗的 AI 问答记录。
- 删除客服会话需先结束接待、等待 AI 任务释放，再从问答记录删除；新旧消息和任务一并软删除。回滚本次数据库迁移会移除新增的接待/排队消息，必须先导出备份，不会自动执行回滚。

### 验证命令

后端 `npm test -- --runInBand`、`npm run build`；Web `npm run type-check -- -p tsconfig.app.json`、`npm run build`。Windows 使用 `npm.cmd`。

真实 MySQL 隔离验证：在 `server/` 运行 `node -r ts-node/register/transpile-only scripts/verify-customer-service.cjs`。脚本需测试账号具有临时建库权限，只创建并删除带随机后缀的 `customer_service_verify_*` 测试库，不修改业务库，也不调用真实模型。
