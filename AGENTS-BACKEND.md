# AGENTS-BACKEND.md

> 后端（`server/`）专属规则与约定。**核心原则：新模块以 `server/src/demo/` 为 demo 复制生成，本文档只写"生成规则"和"必改点"**；跨端契约见 `AGENTS.md`。

## 参考 Demo：`server/src/demo/`

**新增后端模块 = 复制 `server/src/demo/` 的目录结构 → 按业务字段/权限码替换**。

demo 覆盖的能力：

| 文件 | 承担的功能 |
| --- | --- |
| `demo/entities/demo.entity.ts` | 实体（继承 `BaseEntity`，含 id/createdAt/updatedAt/deletedAt） |
| `demo/dto/demo.dto.ts` | Create/Update/Query DTO + class-validator 校验 |
| `demo/demo.service.ts` | 分页 `findAndCount + Like` / 创建 / 更新 / 软删除 / 批量删除 |
| `demo/demo.controller.ts` | RESTful 路由 + `@RequirePermissions('Demo.*')` + `@ApiOperation` |
| `demo/demo.module.ts` | `TypeOrmModule.forFeature([Demo])` + 挂载 controller/service |

**页面/接口不用重复实现**：全局响应包装（`TransformInterceptor`）、异常包装（`HttpExceptionFilter`）、鉴权 `JwtAuthGuard`、权限校验 `PermissionsGuard`、字段校验 `ValidationPipe` —— 这些在 `common/` + `main.ts` 全局生效。

## 目录导航

- `src/main.ts` — 应用入口（helmet/CORS/全局前缀 `api`/ValidationPipe/拦截器/过滤器/Swagger）
- `src/app.module.ts` — 根模块（ConfigModule + Joi/TypeORM 自动建库/挂载全部模块）
- `src/common/` — 公共件（`BaseEntity` / `@Public()` / `@RequirePermissions()` / `@CurrentUser()` / 全局守卫/拦截器/过滤器）
- `src/auth/` — 登录鉴权（JWT strategy + login/profile）
- `src/users/` — 用户模块（`isAdmin` 超管、`SEED_PERMISSIONS`、`SEED_MENUS`归属逻辑、启动创建默认 root）
- `src/roles/` / `src/permissions/` — RBAC 三件套
- `src/menus/` — 菜单模块（`/menus/mine` 按权限返回菜单树 + `SEED_MENUS`）
- `src/demo/` — **CRUD demo**（新模块参考它）
- `src/<module>/` — 业务模块（约定：`*.module.ts` / `*.controller.ts` / `*.service.ts` / `dto/` / `entities/`）
- `.env` / `.env.example` — 环境变量

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | NestJS 11 |
| 语言 | TypeScript（严格模式） |
| ORM | TypeORM（`synchronize` 按 `NODE_ENV` 甄别） |
| 数据库 | MySQL（mysql2） |
| 配置 | @nestjs/config + Joi 校验 |
| 鉴权 | JWT（`JWT_SECRET` / `JWT_EXPIRES_IN`） |
| 加密 | bcrypt（`BCRYPT_SALT_ROUNDS`） |
| 文档 | @nestjs/swagger（`/docs`） |
| 安全 | helmet + CORS |
| 全局 | ValidationPipe / 全局前缀 `api` |

## 开发与构建命令

- 安装：`npm install`
- 开发：`npm run start:dev`（watch）
- 构建：`npm run build`
- 生产：`npm run start:prod`
- Lint：`npm run lint`
- 测试：`npm run test`
- 生成迁移：`npm run migration:generate -- src/migrations/<Name>`
- 执行迁移：`npm run migration:run`
- 回滚迁移：`npm run migration:revert`
- Swagger：`/docs`

## 编码/改动后检查项

- **JWT `signOptions.expiresIn` 类型**：`configService.get<string>(...)` 会触发 `TS2322`；须 `as JwtModuleOptions['signOptions']`。
- **PowerShell 执行策略**：`npm`/`nest` 直调报 `UnauthorizedAccess`；用 `npm.cmd`。

## 黑名单目录（禁止改动）

- `node_modules/` / `dist/` / `coverage/`
- `.env` — 敏感信息不入库（仅维护 `.env.example`）
- `*.tsbuildinfo` / `*.log`

## 白名单目录（AI 可读写）

- `src/**` — 全部源码
- `src/<module>/` — 新模块位置
- `.env.example` — 新增变量时同步
- 工程配置：`package.json` / `tsconfig*.json` / `nest-cli.json` / `eslint.config.mjs` / `.prettierrc`

## 新增业务模块（后端 6 步）

> 目标：新增模块 `Foo`（路由 `/foos`，权限码前缀 `Foo`）。**动作命名严格 `read/create/update/delete/batchDelete`**，模块名首字母大写。

1. **复制 demo**：把 `server/src/demo/` 整个目录复制为 `server/src/foos/`，文件重命名为 `foo.*`；类名 `Demo`→`Foo`、`DemoService`→`FoosService` 等。
2. **改字段**：`foos/entities/foo.entity.ts` 与 `foos/dto/foo.dto.ts` 按业务改列/属性；实体名 `@Entity('foos')`。
3. **改权限码**：`foos/foos.controller.ts` 中 `@RequirePermissions('Demo.*')` → `@RequirePermissions('Foo.*')`。
4. **挂载根模块**：`server/src/app.module.ts` imports 加 `FoosModule`。
5. **SEED 权限点**：`server/src/users/users.service.ts` `SEED_PERMISSIONS` 补 `Foo.read/create/update/delete/batchDelete` 5 条。
6. **SEED 菜单**：`server/src/menus/menus.service.ts` `SEED_MENUS` 补 `{ name:'Foo 管理', path:'/foos', icon, sort, permissionCode:'Foo.read' }`。

> **不用重复处理**：全局响应/异常包装、鉴权/权限校验、字段校验、软删除 timestamps、Swagger 装饰器（已被 `@ApiTags`/`@ApiBearerAuth` 覆盖）。

## 模块规格清单（用于向 AI 描述新模块的最小规格）

新模块只需描述以下几点，其余按 `demo/` demo 复用：

- **模块信息**：模块名 `Foo`（帕斯卡）、表名 `foos`、路由 `/foos`、权限码前缀 `Foo`
- **实体字段列表**：字段名 + 类型 + 是否必填 + 是否唯一 + 默认值
- **查询规格**：搜索 keyword 匹配哪些字段 / 是否需要按其他字段筛选（`isActive`/时间范围等）
- **业务规则例外**：如唯一性检查、软删除策略、批量删除限制条件等，如无则默认走 demo
- **权限例外**：默认 5 个权限码；如某接口需要公开（`@Public()`）或额外权限，另说

只要给出上述规格，AI 就能对照 `demo/` demo 生成整套模块。

## 后端 CRUD 通用约定

- **RESTful**：`@Controller('xxx')` + 全局前缀 `api`（如 `POST /api/foos`）
- **分层**：controller 仅路由与入参，业务在 service，数据在 entity
- **入参校验**：DTO + class-validator，全局 `ValidationPipe({ whitelist:true })`
- **响应结构**：`TransformInterceptor` 包 `{ statusCode, data, success, message, timestamp }`；`HttpExceptionFilter` 包错误
- **鉴权**：默认全局 `JwtAuthGuard`；公开加 `@Public()`；权限用 `@RequirePermissions('Module.action')`
- **权限码**：`Module.action` 首字母大写点号，动作统一 `read/create/update/delete/batchDelete`
- **默认超管**：开发默认 `root/root123`，生产环境必须通过 `ADMIN_PASSWORD` 显式配置；用户表空时启动 seed 自动创建；`isAdmin` 放行一切
- **SEED_PERMISSIONS 兜底**：至少覆盖 RBAC 基建 + 各业务模块 5 个动作；启动会**清理不合规旧权限**
- **账号模块**：`users` + `roles` + `permissions` 为必迁基建，详见 `MIGRATION.md`

## 后端易踩坑

- **seed 幂等只补不更新**：已有权限/菜单记录不会被 seed 覆盖；如需修正字段，改 DB 或走管理页
- **synchronize**：开发期自动 `ALTER TABLE`；改实体列后**必须重启**
- **权限动作命名**：严禁用 `view/edit`（旧值），一律 `read/update`
- **菜单权限归属**：业务菜单 seed 必须显式配置 `permissionCode:'Module.read'`，避免权限点与菜单归属不清晰
- **不要在 controller 里写业务**：所有查询组装/事务/领域校验放到 service
- **软删除**：走 `softDelete`（`BaseEntity` 已提供 `deletedAt`），不要 `remove` 硬删
