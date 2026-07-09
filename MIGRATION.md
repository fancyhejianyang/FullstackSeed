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
| `src/articles/**` | 文章 CRUD demo | 仅作 CRUD 范例，新项目可删除或替换为真实业务模块 |
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
- 通用组件：`components/`（`ProTable` / `ProForm` / `ProDialog` / `PageContainer`）
- 业务页面规范：`views/<module>/` 下 `Index.vue` + `Edit.vue`（详情 `View.vue`），列表用 ProTable 传 `perm-module`
- 默认登录：`root / root123`
